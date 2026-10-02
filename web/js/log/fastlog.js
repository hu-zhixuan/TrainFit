/**
 * 本机秒记（v5.3）：大模型整理一句要 10～18 秒。说的要是全都是你以前吃过的东西（最近 60 天的记录、记住的食物）
 * 或者练过的动作带上重量组数（「卧推 80 公斤 4 组 8 个」），就按你以前的数直接记上，不等大模型。
 * 只认有把握的：有一样没吃过、量词对不上、说了克数、在改记录、在问问题、说到别的日子……都照常交给大模型。
 */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && typeof require === 'function') {
    require('./helpers.js');
    require('./food.js');
  }
  const TF = root.TF = root.TF || {};
  const { round1, sumItems, mealTypeByHour, mealTimes, looksLikeQuestion, FoodDB, MyFoods } = TF;

  const CN = { 零: 0, 〇: 0, 一: 1, 幺: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const NUM = '\\d+(?:\\.\\d+)?|[零〇一幺两二三四五六七八九十百点]+';
  const UNITS = '个|碗|杯|份|片|根|勺|盒|瓶|袋|颗|串|块|条|只|罐|包|盘|张|粒|支|听|笼|屉|碟';

  /** 「80」「八十」「一百二十五」「十二」「七十五点五」「两」→ 数字；认不出返回 null */
  function cnNum(s) {
    s = String(s || '');
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const [int, frac] = s.split('点');
    if (!int || s.split('点').length > 2) return null;
    let total = 0, cur = 0, any = false;
    for (const ch of int) {
      if (ch in CN) { cur = CN[ch]; any = true; } else if (ch === '十') { total += (cur || 1) * 10; cur = 0; any = true; } else if (ch === '百') { total += (cur || 1) * 100; cur = 0; any = true; } else return null;
    }
    if (!any) return null;
    total += cur;
    if (frac) {
      const ds = [...frac].map(ch => (ch in CN ? CN[ch] : null));
      if (ds.some(d => d === null)) return null;
      total += parseFloat('0.' + ds.join(''));
    }
    return total;
  }

  /** 「2个」「1碗」「半份」→ { n, unit } */
  function amountOf(a) {
    const m = String(a || '').match(new RegExp(`^(${NUM}|半)?\\s*(${UNITS})?`));
    if (!m) return { n: 1, unit: '' };
    return { n: m[1] === '半' ? 0.5 : (m[1] ? cnNum(m[1]) : 1) || 1, unit: m[2] || '' };
  }

  // 这些说法要大模型来：在问、在改、说到别的日子、说了克数 / 热量、没吃、跑步多久这类
  const NEEDS_LLM = /改|删|不对|其实|记错|挪|换成|去掉|撤|算了|不算|昨|前天|明天|后天|大前天|记住|包装|克|\dg|毫升|ml|千卡|大卡|卡路里|热量|没吃|没喝|不吃|没练|一半|分钟|小时|公里|步/i;
  const FILLER = /呃+|嗯+|啊+|哦+|那个|就是|的话|吧|呀|啦|噢/g; // 别去「哈」，哈密瓜

  /** 吃过的东西：记住的食物优先，其次是最近 60 天记录里同名的最近一次 */
  function knownFoods(myFoods, diet, today) {
    const map = new Map();
    const d0 = new Date((today || '') + 'T00:00:00');
    const since = isNaN(d0) ? '' : new Date(d0.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    (diet || []).filter(d => !since || d.date >= since).slice().sort((a, b) => (a.date === b.date ? (a.ts || 0) - (b.ts || 0) : (a.date > b.date ? 1 : -1))).forEach(d => {
      (Array.isArray(d.items) ? d.items : []).forEach(it => {
        if (!it || !it.name || !(it.calories >= 0)) return;
        map.set(FoodDB.norm(it.name), Object.assign({}, it, { _from: 'hist' }));
      });
    });
    (myFoods || []).forEach(f => { if (f && f.name) map.set(FoodDB.norm(f.name), Object.assign({}, f, { src: '我的', _from: 'mine' })); });
    return map;
  }

  /** 一段话 → 这一样吃的（按以前的数换算）；没把握返回 null */
  function foodItem(seg, known) {
    // 几种读法挨个试，名字对得上吃过的才算：「鸡蛋两个」「两个鸡蛋」「三明治」（别把「三」当成数量）
    const tries = [];
    let m = seg.match(new RegExp(`^(.+?)(${NUM}|半)(${UNITS})$`));
    if (m) tries.push([m[1], m[2], m[3]]);
    m = seg.match(new RegExp(`^(${NUM}|半)(${UNITS})?(.+)$`));
    if (m) tries.push([m[3], m[1], m[2] || '']);
    m = seg.match(new RegExp(`^(${UNITS})(.+)$`)); // 「碗牛肉面」这种少了数字的少见，当 1
    if (m) tries.push([m[2], '', m[1]]);
    tries.push([seg, '', '']);
    const hit = tries.find(x => known.has(FoodDB.norm(x[0])));
    if (!hit) return null;
    const name = hit[0], unit = hit[2];
    const n = hit[1] ? (hit[1] === '半' ? 0.5 : cnNum(hit[1])) : null;
    if (hit[1] && n === null) return null;
    const k = known.get(FoodDB.norm(name));
    const ka = amountOf(k.amount);
    // 量词对不上（以前记的是「1碗」，这次说「一杯」）：没把握
    if (unit && ka.unit && unit !== ka.unit) return null;
    if (unit && !ka.unit && unit !== '份') return null;
    const f = n === null ? 1 : n / ka.n;
    if (!(f > 0) || f > 10) return null;
    const it = { name: k.name, amount: n === null ? (k.amount || '1份') : `${n}${unit || ka.unit || '份'}`, grams: k.grams ? Math.round(k.grams * f) : null, whole: k.whole !== false,
      calories: Math.round((k.calories || 0) * f), proteinG: round1((k.proteinG || 0) * f), carbsG: round1((k.carbsG || 0) * f), fatG: round1((k.fatG || 0) * f), src: k.src || '估算' };
    if (k.kind === 'supplement' || k.supp) { it.kind = 'supplement'; it.supp = true; }
    if (k.nutrients) { it.nutrients = {}; Object.keys(k.nutrients).forEach(x => { it.nutrients[x] = round1(k.nutrients[x] * f); }); }
    return it;
  }

  /** 练过的动作：说「卧推」认到「杠铃卧推」（以「卧推」结尾的只有一个时） */
  function knownLift(name, workouts) {
    const n = FoodDB.norm(name);
    const lifts = (workouts || []).filter(w => !w.durationMin && w.exerciseName);
    const names = [...new Set(lifts.map(w => w.exerciseName))];
    let hit = names.find(x => FoodDB.norm(x) === n);
    if (!hit) {
      const ends = names.filter(x => FoodDB.norm(x).endsWith(n) && n.length >= 2);
      if (ends.length === 1) hit = ends[0];
    }
    if (!hit) return null;
    return lifts.filter(w => w.exerciseName === hit).sort((a, b) => (a.date === b.date ? (b.ts || 0) - (a.ts || 0) : (a.date > b.date ? -1 : 1)))[0];
  }

  /** 「卧推80公斤4组8个」「深蹲 一百 五组五个」「引体向上4组10个」「卧推80 4x8」→ 一组训练；没把握返回 null */
  function liftOf(seg, workouts) {
    const s = seg.replace(/每组|一共|做了|练了|打了|的/g, '');
    const m = s.match(new RegExp(`^(.+?)(?:(${NUM})(公斤|kg|斤|KG)?)?(${NUM})(?:组|[x×*乘])(${NUM})(?:个|次|下)?$`, 'i'));
    if (!m) return null;
    const last = knownLift(m[1], workouts);
    if (!last) return null;
    let kg = m[2] ? cnNum(m[2]) : null;
    const sets = cnNum(m[4]), reps = cnNum(m[5]);
    if (!(sets >= 1 && sets <= 20 && reps >= 1 && reps <= 100)) return null;
    let estimated = false;
    if (kg === null) { kg = last.weightKg || 0; estimated = kg > 0; } else if (m[3] === '斤') kg /= 2; // 没说重量：和大模型一样按上次的
    if (!(kg >= 0 && kg <= 500)) return null;
    kg = round1(kg);
    return { exerciseName: last.exerciseName, muscleGroup: last.muscleGroup, weightKg: kg, sets: Math.round(sets), reps: Math.round(reps), durationMin: null,
      burnedCalories: Math.round(sets * reps * (kg > 0 ? kg * 0.05 + 1.2 : 2.5)), estimated };
  }

  /**
   * 能本机记就返回和大模型一样格式的结果（source: 'local'），不能就返回 null。
   * data: { now, today, myFoods, diet, workouts, simple }
   */
  function fastLog(text, data) {
    const raw = String(text || '').trim();
    if (!raw || raw.length > 60 || looksLikeQuestion(raw) || NEEDS_LLM.test(raw)) return null;
    const times = mealTimes(raw);
    if (times.length > 1) return null; // 说了两个时间，要拆成几顿
    let t = raw.replace(FILLER, '').replace(/[。!！?？；;:：、，,]+/g, '，'); // 空格先留着：「卧推 80kg 5x5」
    t = t.replace(/(今天|今早|今晚|刚才|刚刚|早上|早晨|早饭|早餐|上午|中午|午饭|中饭|午餐|下午|傍晚|晚上|晚饭|晚餐|夜宵|宵夜|加餐|练完|练前|睡前)(吃了|喝了|吃的|喝的|吃|喝|练了|练的)?/g, '，')
      .replace(/我?(吃了|喝了|吃的|喝的|来了|整了|练了|练的|做了)/g, '，').replace(/(然后|还有|以及|另外|再来|再|和|跟|加上|加|外加)/g, '，');
    const segs = t.split('，').map(x => x.trim()).filter(Boolean);
    if (!segs.length || segs.length > 6) return null;
    const known = knownFoods(data.myFoods, data.diet, data.today);
    const items = [], lifts = [];
    for (const seg of segs) {
      const lf = data.simple ? null : liftOf(seg.replace(/\s+/g, ''), data.workouts);
      if (lf) { lifts.push(lf); continue; }
      // 吃的：按空格分开；整段认不出，再在「两个鸡蛋一杯牛奶」这种数字量词开头的地方切开
      for (const chunk of seg.split(/\s+/).filter(Boolean)) {
        const whole = foodItem(chunk, known);
        if (whole) { items.push(whole); continue; }
        const parts = chunk.replace(new RegExp(`(.)((?:${NUM}|半)(?:${UNITS}))`, 'g'), (all, a, b) => (/[\d零〇一幺两二三四五六七八九十百点半]/.test(a) ? all : a + '，' + b)).split('，').filter(Boolean);
        if (parts.length < 2) return null;
        for (const part of parts) {
          const it = foodItem(part, known);
          if (!it) return null; // 有一样没把握：交给大模型
          items.push(it);
        }
      }
    }
    if (items.length && lifts.length) return null;
    const supp = items.filter(i => i.supp);
    if (supp.length && supp.length !== items.length) return null; // 补剂和饭混着说：交给大模型分开
    const now = data.now || new Date();
    const meals = [];
    if (items.length) {
      const type = supp.length ? '加餐/补剂' : (times[0] && times[0].type) || mealTypeByHour(now.getHours());
      const sum = sumItems(items);
      meals.push(Object.assign({ mealType: type, foodSummary: items.map(i => i.name + (i.amount || '')).join('、').slice(0, 60), items }, sum));
    }
    return { dayOffset: 0, workouts: lifts, meals, updates: [], deletes: [], remember: [], memo: [], forget: [], bodyWeight: null,
      reply: '秒记 · 按你以前记的数', source: 'local' };
  }

  /**
   * 一句话建档（v5.3）：「男，175，70 公斤，28 岁，想减脂」「我叫阿程，一米八，140 斤，95 后，增肌」→ 填表用的几样。
   * 本机认，不调大模型；认不出的就不填，表上还能自己改。
   */
  function parseIntro(text, year) {
    let t = String(text || '').replace(/\s+/g, '，'); // 空格当分隔，别把「163 52kg」粘成一串
    const out = {};
    if (/女|姑娘|妹子/.test(t)) out.gender = 'female'; else if (/男|小伙|哥们/.test(t)) out.gender = 'male';
    // 身高：一米七五 / 1米75 / 1.75米 / 175cm / 身高175
    let m = t.match(/[一1]米([一二三四五六七八九\d])([一二三四五六七八九\d])?/);
    if (m) {
      const d = (c) => (/\d/.test(c) ? +c : CN[c]);
      out.heightCm = 100 + d(m[1]) * 10 + (m[2] ? d(m[2]) : 0);
      t = t.replace(m[0], '，');
    } else if ((m = t.match(/(1\.\d{1,2})米/))) {
      out.heightCm = Math.round(parseFloat(m[1]) * 100);
      t = t.replace(m[0], '，');
    }
    // 中文数字换成阿拉伯数字（「七十公斤」「二十八岁」「一百四十斤」）
    t = t.replace(/[零〇一两二三四五六七八九十百点]+(?=公斤|千克|斤|岁|厘米|公分|kg|cm)/gi, (x) => { const n = cnNum(x); return n === null ? x : String(n); });
    const take = (re, f) => { const x = t.match(re); if (!x) return false; f(x); t = t.replace(x[0], '，'); return true; };
    take(/(\d{2,3}(?:\.\d)?)(公斤|千克|kg)/i, (x) => { out.weightKg = parseFloat(x[1]); }) ||
      take(/(\d{2,3}(?:\.\d)?)斤/, (x) => { out.weightKg = Math.round(parseFloat(x[1]) / 2 * 10) / 10; }) ||
      take(/体重(\d{2,3}(?:\.\d)?)/, (x) => { out.weightKg = parseFloat(x[1]); });
    if (!out.heightCm) take(/(?:身高)?(1[4-9]\d|2[01]\d)(cm|厘米|公分)?(?![\d.])/i, (x) => { out.heightCm = +x[1]; });
    take(/(\d{1,2})岁/, (x) => { out.age = +x[1]; }) ||
      take(/([0-9]{2})后/, (x) => { const yy = +x[1]; out.age = (year || new Date().getFullYear()) - (yy >= 30 ? 1900 + yy : 2000 + yy) - 2; });
    // 光说数字（「175 70 28」）：剩下的两个数，大的是体重、小的是年龄
    const rest = (t.match(/\d{2,3}(?:\.\d)?/g) || []).map(Number);
    if (rest.length === 2 && !out.weightKg && !out.age) {
      const [hi, lo] = rest[0] >= rest[1] ? rest : [rest[1], rest[0]];
      if (hi >= 35 && hi <= 150 && lo >= 10 && lo <= 80) { out.weightKg = hi; out.age = lo; }
    }
    if (/减脂|减肥|瘦|掉秤|减重|刷脂/.test(t)) out.goal = 'fat_loss';
    else if (/增肌|练壮|长肌肉|增重|变壮|练大/.test(t)) out.goal = 'muscle_gain';
    else if (/维持|保持|健康就行/.test(t)) out.goal = 'maintain';
    if ((m = t.match(/(?:我叫|叫我|名字是)([^\s，,。、0-9]{1,6}?)(?=[，,。、]|$|身高|体重|\d|男|女|今年|想)/))) out.name = m[1];
    if (out.heightCm && !(out.heightCm >= 120 && out.heightCm <= 230)) delete out.heightCm;
    if (out.weightKg && !(out.weightKg >= 25 && out.weightKg <= 300)) delete out.weightKg;
    if (out.age && !(out.age >= 10 && out.age <= 100)) delete out.age;
    return out;
  }

  Object.assign(TF, { cnNum, fastLog, parseIntro });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
