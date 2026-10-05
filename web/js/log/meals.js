/**
 * 这顿算早餐、午餐、晚餐还是加餐（v8.0，用户：「把智能归类变得更智能，更精准识别出加餐、午餐、晚餐，比如可以根据时间」）。
 *
 * 以前：大模型按「现在几点 + 吃的什么」写一个 mealType，没写的按钟点硬切（10 点前早餐、15～17 点全算加餐）。
 * 毛病：11 点喝杯咖啡算成午餐、15:40 才吃的午饭算成加餐、两点吃午饭的人每天都「没吃午饭」、晚上补记「中午吃了…」挂在晚上。
 *
 * 现在按这个顺序判断，纯函数（node 能测，tests/meals.test.js）：
 *   1. 只有补剂 → 补剂；改过顿的（mealFixed：说了「这是午饭」、在修改面板里点过）→ 照改的。
 *   2. 原话（said）里说了时间（早上 / 中午 / 晚上 / 下午茶 / 夜宵 / 练完…）→ 照原话，补记的也一样（晚上说「中午吃了…」还是午餐）。
 *   3. 没说的看真正吃的时间（记录的时间；补记前几天的不算数，用存的顿）：
 *      - 几分钟内记的几样算同一顿（40 分钟内）；
 *      - 你自己的作息：最近 4 周你几点吃早 / 午 / 晚饭（中位数），没数据按 7:30 / 12:15 / 18:45；每顿的时间段是这个钟点前后两个半小时；
 *      - 这顿像不像正餐：400 千卡以上，或者有饭面粉粥饺子炒菜这种（200 千卡以上）；全是水果、酸奶、坚果、咖啡、奶茶、零食这类、又不多的算零嘴；
 *      - 每个时间段只算一顿正餐（最大的那顿）；早上那段喝的咖啡、吃的鸡蛋算进早餐（很多人早饭就这么点）；
 *        正餐前后 45 分钟内的零嘴算进那顿（饭后一杯咖啡）；
 *      - 时间段外面的：像正餐、那顿又还没吃（15:40 的午饭、22 点的晚饭）→ 算那顿；不然是加餐，
 *        按时间分上午加餐 / 下午加餐 / 夜宵（晚饭以后的）。
 * 今天页按吃的时间排：早餐 → 上午加餐 → 午餐 → 下午加餐 → 晚餐 → 夜宵 → 补剂。记的时候也用这个改 mealType（原话说了的不改）。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  const MEALS = ['早餐', '午餐', '晚餐'];
  // 没有你自己的数据时的钟点（分钟）：7:30、12:15、18:45；你自己的中位数也夹在这个范围里，别把夜宵当晚饭
  const DEFAULT = { 早餐: 450, 午餐: 735, 晚餐: 1125 };
  const RANGE = { 早餐: [300, 660], 午餐: [630, 930], 晚餐: [990, 1350] };
  const SPAN = 150; // 每顿的时间段：钟点前后两个半小时（不越过和下一顿的中点）
  const SAME = 40; // 40 分钟内记的算同一顿
  const NEAR = 45; // 正餐前后 45 分钟内的零嘴算进那顿

  // 零嘴：水果、奶、坚果、饮料、甜的、零食（鸡蛋、面包、玉米这种早饭也常吃，靠热量和「早上那段」区分）
  const SNACK_FOOD = /苹果|香蕉|橙|橘|柑|葡萄|草莓|蓝莓|樱桃|西瓜|哈密瓜|梨|桃|李|猕猴桃|芒果|火龙果|柚子|菠萝|凤梨|荔枝|龙眼|山竹|圣女果|小番茄|水果|酸奶|牛奶|奶酪|芝士|坚果|核桃|杏仁|腰果|花生|瓜子|开心果|夏威夷果|碧根果|咖啡|拿铁|美式|奶茶|果汁|可乐|雪碧|汽水|气泡水|茶|豆浆|饮料|蛋糕|饼干|巧克力|冰淇淋|冰激凌|雪糕|甜品|甜点|布丁|蛋挞|薯片|糖|果冻|面包|吐司|蛋白粉|蛋白棒|能量棒|燕麦棒|鸡蛋|茶叶蛋|卤蛋|玉米|红薯|紫薯|海苔|牛肉干|肉干|话梅|麻薯/;
  // 正餐的样子：主食、炒菜、一整份的
  const MAIN_FOOD = /饭|面|粉|粥|饺|馄饨|抄手|包子|馒头|饼|汉堡|披萨|三明治|沙拉|寿司|饭团|卷|套餐|便当|盖浇|炒|烧|炖|焖|蒸|煎|烤|火锅|麻辣烫|冒菜|串|香锅|米线|意面|拉面|牛排|鸡腿|排骨|鱼|虾|肉|菜/;
  const SNACK_WORD = { 下午茶: 'pm', 夜宵: 'night', 宵夜: 'night', 睡前: 'night', 半夜: 'night', 练完: 'train', 练后: 'train', 练前: 'train', 加餐: '', 零食: '' };

  function minuteOf(ts) {
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  }

  function dateOf(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function tsOf(r) {
    if (r.ts) return r.ts;
    const m = /_(\d{12,})/.exec(r.id || '');
    return m ? Number(m[1]) : 0;
  }

  function isSupp(r) { return Array.isArray(r && r.items) && r.items.length > 0 && r.items.every(i => i.supp || i.kind === 'supplement'); }

  function names(r) {
    const list = (r.items || []).map(i => String(i.name || ''));
    return list.length ? list : [String(r.foodSummary || '')];
  }

  /** 原话里说了哪顿：{ type: '早餐'…'加餐', slot（加餐的：pm / night / train / ''） }；没说返回 null */
  function saidMeal(r) {
    if (r.mealFixed) {
      const t = String(r.mealType || '');
      return MEALS.includes(t) ? { type: t } : { type: '加餐', slot: '' };
    }
    const said = String(r.said || '');
    if (!said) return null;
    const snack = Object.keys(SNACK_WORD).find(w => said.includes(w));
    const times = TF.mealTimes ? TF.mealTimes(said) : [];
    const meals = times.map(t => t.type).filter(t => MEALS.includes(t));
    // 一句话里说了几顿（「早上…中午…」）：记的时候已经按原话拆好、每条写了是哪顿，照它
    if (meals.length && meals.includes(r.mealType)) return { type: r.mealType };
    if (meals.length === 1 && !snack) return { type: meals[0] };
    if (snack && (!meals.length || r.mealType === '加餐/补剂')) return { type: '加餐', slot: SNACK_WORD[snack] };
    return null;
  }

  /** 这条像不像正餐 / 零嘴 */
  function shape(rs) {
    const kcal = rs.reduce((t, r) => t + (r.calories || 0), 0);
    const all = rs.flatMap(names);
    const main = all.some(n => MAIN_FOOD.test(n) && !SNACK_FOOD.test(n));
    const snacky = all.every(n => SNACK_FOOD.test(n) && !(MAIN_FOOD.test(n) && /饭|面|粉|粥|饺|包子|汉堡|套餐/.test(n)));
    const mealLike = kcal >= 400 || (main && kcal >= 200);
    return { kcal, mealLike, snacky: !mealLike && (snacky || kcal < 200) };
  }

  function median(list) {
    const s = list.slice().sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  }

  /**
   * 你自己的作息：最近 4 周你几点吃早 / 午 / 晚饭（原话说了顿的、或者像正餐的那几条，中位数，至少 3 次才算），
   * 没数据的按默认。diet：所有吃的记录；today：'YYYY-MM-DD'。返回 { 早餐: 分钟, 午餐, 晚餐 }
   */
  function rhythm(diet, today) {
    const from = shift(today, -28);
    const hits = { 早餐: [], 午餐: [], 晚餐: [] };
    (diet || []).forEach(r => {
      if (!r || r.date < from || r.date >= today || isSupp(r)) return;
      const ts = tsOf(r);
      if (!ts || dateOf(ts) !== r.date) return; // 补记的时间不算数
      const said = saidMeal(r);
      const type = said ? said.type : MEALS.includes(r.mealType) && shape([r]).mealLike ? r.mealType : '';
      if (!MEALS.includes(type)) return;
      const m = minuteOf(ts);
      if (m >= RANGE[type][0] && m <= RANGE[type][1]) hits[type].push(m);
    });
    const out = {};
    MEALS.forEach(t => {
      const m = hits[t].length >= 3 ? median(hits[t]) : null;
      out[t] = m == null ? DEFAULT[t] : Math.max(RANGE[t][0], Math.min(RANGE[t][1], m));
    });
    // 三顿之间至少隔 3 小时（数据怪的时候别挤在一起）
    if (out.午餐 - out.早餐 < 180) out.午餐 = Math.min(RANGE.午餐[1], out.早餐 + 180);
    if (out.晚餐 - out.午餐 < 180) out.晚餐 = Math.min(RANGE.晚餐[1], out.午餐 + 180);
    return out;
  }

  function shift(date, days) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return dateOf(d.getTime());
  }

  /** 每顿的时间段 [开始, 结束]（分钟） */
  function windows(rh) {
    const mid1 = (rh.早餐 + rh.午餐) / 2, mid2 = (rh.午餐 + rh.晚餐) / 2;
    return {
      早餐: [Math.max(240, rh.早餐 - 180), Math.min(rh.早餐 + SPAN, mid1)],
      午餐: [Math.max(rh.午餐 - SPAN, mid1), Math.min(rh.午餐 + SPAN, mid2)],
      晚餐: [Math.max(rh.晚餐 - SPAN, mid2), rh.晚餐 + SPAN]
    };
  }

  /**
   * 一天的吃的分顿。records：这一天的吃的记录；opts：{ rhythm }（不给按默认）。
   * 返回 { [id]: { group: '早餐' | '午餐' | '晚餐' | '加餐' | '补剂', slot: 'am' | 'pm' | 'night' | '', label, late, why } }
   *   slot：加餐在哪段（上午 / 下午 / 夜宵）；label：加餐显示的小字（上午 / 下午 / 练后），夜宵直接叫夜宵；
   *   late：这条是补记的（记的时间离那顿很远），今天页不写成那顿的钟点
   */
  function classify(records, opts) {
    opts = opts || {};
    const rh = opts.rhythm || DEFAULT;
    const win = windows(rh);
    const out = {};
    const list = (records || []).filter(Boolean).slice().sort((a, b) => tsOf(a) - tsOf(b));
    const free = [];
    list.forEach(r => {
      if (isSupp(r)) { out[r.id] = { group: '补剂', slot: '', label: '', why: 'supp' }; return; }
      const said = saidMeal(r);
      const ts = tsOf(r);
      const reliable = !!ts && (!r.date || dateOf(ts) === r.date);
      if (said) {
        const late = MEALS.includes(said.type) && reliable && Math.abs(minuteOf(ts) - rh[said.type]) > 180;
        // 补记的按那顿平时的钟点算（别让晚上 9 点补记的午饭挡住中午那段）
        const m = !reliable ? null : late ? rh[said.type] : minuteOf(ts);
        out[r.id] = { group: said.type, slot: said.slot || '', label: said.slot === 'train' ? '练后' : '', late: late || !reliable, why: 'said', m };
        return;
      }
      if (!reliable) { // 补记前几天的、时间不算数：照存的
        const t = MEALS.includes(r.mealType) ? r.mealType : '加餐';
        out[r.id] = { group: t, slot: '', label: '', late: true, why: 'stored' };
        return;
      }
      free.push(r);
    });

    // 同一顿：40 分钟内记的几样
    const occ = [];
    free.forEach(r => {
      const m = minuteOf(tsOf(r));
      const last = occ[occ.length - 1];
      if (last && m - last.end <= SAME) { last.rs.push(r); last.end = m; } else occ.push({ rs: [r], start: m, end: m });
    });
    occ.forEach(o => Object.assign(o, shape(o.rs)));

    // 已经占了的正餐（原话说了的）
    const taken = {};
    Object.values(out).forEach(x => { if (MEALS.includes(x.group) && x.m != null) (taken[x.group] = taken[x.group] || []).push(x.m); });
    const inWin = (m, t) => m >= win[t][0] && m <= win[t][1];
    const near = (m, t) => (taken[t] || []).some(x => Math.abs(x - m) <= NEAR);
    const take = (o, t, why) => { o.group = t; o.why = why; (taken[t] = taken[t] || []).push(o.start); };

    // 早午饭：早饭没吃、午饭那段有两顿正餐、头一顿在午饭钟点 45 分钟以前（10:30 吃了一顿、13 点又吃一顿）→ 头一顿算早餐
    // 早饭没吃、10 点多吃的第一顿（午饭钟点一个半小时以前）也算早餐（起得晚的早饭）
    const lunchMeals = occ.filter(o => o.mealLike && inWin(o.start, '午餐'));
    if (!taken.早餐 && lunchMeals.length && (lunchMeals[0].start < rh.午餐 - 90 || (lunchMeals.length >= 2 && lunchMeals[0].start < rh.午餐 - 45))) take(lunchMeals[0], '早餐', 'brunch');
    // 每个时间段只算一顿正餐：像正餐的里面最大的那顿（一样大取离钟点近的）
    MEALS.forEach(t => {
      if (taken[t]) return;
      const c = occ.filter(o => !o.group && o.mealLike && inWin(o.start, t))
        .sort((a, b) => b.kcal - a.kcal || Math.abs(a.start - rh[t]) - Math.abs(b.start - rh[t]))[0];
      if (c) take(c, t, 'window');
    });
    // 时间段外面、像正餐的：那顿还没吃、离那顿的钟点不到 3 个半小时（15:40 的午饭、22 点的晚饭）→ 算那顿
    // 两顿中间的（15:40）：前一顿还没吃、离它不到 4 小时、离下一顿还有一个钟头以上 → 算前一顿（午饭吃得晚，不是晚饭吃得早）
    occ.filter(o => !o.group && o.mealLike).forEach(o => {
      const early = MEALS.find((x, i) => !taken[x] && o.start > rh[x] && o.start <= rh[x] + 240 && (!MEALS[i + 1] || o.start < rh[MEALS[i + 1]] - 60));
      const t = early || MEALS.filter(x => !taken[x] && Math.abs(o.start - rh[x]) <= 210).sort((a, b) => Math.abs(o.start - rh[a]) - Math.abs(o.start - rh[b]))[0];
      if (t) take(o, t, 'late');
    });
    // 零嘴：早上那段的算早餐（咖啡、鸡蛋、一片面包就是很多人的早饭）；正餐前后 45 分钟内的算进那顿；
    // 那顿的时间段里、那顿还没吃、又不算太少（180 千卡以上）的算那顿（一碗沙拉的午饭）
    occ.filter(o => !o.group).forEach(o => {
      if (inWin(o.start, '早餐') && o.start < (taken.早餐 ? Math.max(...taken.早餐) + NEAR : Infinity)) { take(o, '早餐', 'morning'); return; }
      const t = MEALS.find(x => near(o.start, x) || near(o.end, x));
      if (t) { o.group = t; o.why = 'near'; return; }
      const w = MEALS.find(x => inWin(o.start, x) && !taken[x] && o.kcal >= 180);
      if (w) { take(o, w, 'light'); return; }
      o.group = '加餐';
      o.why = 'snack';
    });

    occ.forEach(o => o.rs.forEach(r => { out[r.id] = { group: o.group, slot: '', label: '', late: false, why: o.why, m: minuteOf(tsOf(r)) }; }));
    // 加餐在哪段：午饭前上午、晚饭前下午、晚饭后夜宵（按这天真的几点吃的饭，没吃按你的钟点）
    const at = (t) => (taken[t] && taken[t].length ? Math.min(...taken[t]) : rh[t]);
    Object.values(out).forEach(x => {
      if (x.group !== '加餐') return;
      if (x.slot === 'pm' || x.slot === 'night') return;
      const m = x.m;
      const slot = m == null ? 'pm' : m < at('午餐') ? 'am' : m < at('晚餐') ? 'pm' : 'night';
      if (x.slot !== 'train') x.label = slot === 'am' ? '上午' : slot === 'pm' ? '下午' : '';
      x.slot = slot;
    });
    Object.values(out).forEach(x => { if (x.group === '加餐' && x.slot === 'night') x.label = ''; delete x.m; });
    return out;
  }

  /** 今天页的分组：key（排序用）、名字、小字 */
  const ORDER = ['早餐', '加餐·am', '午餐', '加餐·pm', '晚餐', '加餐·night', '补剂'];
  function groupKey(c) { return c.group === '加餐' ? `加餐·${c.slot || 'pm'}` : c.group; }
  function groupName(key) { return key === '加餐·night' ? '夜宵' : key.startsWith('加餐') ? '加餐' : key; }

  /** 存进记录的 mealType（早餐 / 午餐 / 晚餐 / 加餐/补剂） */
  function storedType(c) { return MEALS.includes(c.group) ? c.group : '加餐/补剂'; }

  TF.Meals = { classify, rhythm, windows, saidMeal, shape, groupKey, groupName, storedType, ORDER, DEFAULT };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Meals;
})(typeof window !== 'undefined' ? window : globalThis);
