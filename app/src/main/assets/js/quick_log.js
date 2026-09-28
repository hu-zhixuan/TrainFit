/**
 * 练食AI · 懒人一键记录
 *
 * 一口气把今天练了什么、吃了什么说出来 → 大模型拆成训练 + 饮食 → 直接保存（可撤销）。
 *
 *  - 语音：安卓 App 里走原生 SpeechRecognizer（window.TrainFitNative），
 *          浏览器里有 Web Speech API 就用，都没有就打字（输入法自带的语音键也能用）。
 *  - 解析：OpenAI 兼容的 /chat/completions。App 里由原生层发请求（key 在编译时注入，
 *          也可以在「身体档案」页的「AI 接口」里覆盖）；接口不可用时退回本地规则引擎。
 */

(function (root) {
  'use strict';

  const OVERRIDE_KEY = 'tf_llm_override';
  const MUSCLES = ['胸部', '背部', '腿部', '肩部', '手臂', '核心', '有氧'];
  const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐/补剂'];

  // ---------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function cleanText(s, maxLen) {
    return String(s == null ? '' : s)
      .replace(/[<>"'`&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen || 40);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function mealTypeByHour(hour) {
    if (hour >= 4 && hour < 10) return '早餐';
    if (hour >= 10 && hour < 15) return '午餐';
    if (hour >= 17 && hour < 21) return '晚餐';
    return '加餐/补剂';
  }

  // ---------------------------------------------------------------------------
  // 体重：「体重62.5」「今天称了124斤」「61.8」
  // ---------------------------------------------------------------------------
  /** 没说单位时：用上次体重判断是公斤还是斤（中国人常说斤） */
  function toKg(v, unit, lastKg) {
    if (!Number.isFinite(v)) return null;
    let kg;
    if (/公斤|kg|千克/i.test(unit || '')) kg = v;
    else if (/斤/.test(unit || '')) kg = v / 2;
    else if (lastKg) kg = Math.abs(v / 2 - lastKg) < Math.abs(v - lastKg) ? v / 2 : v;
    else kg = v > 150 ? v / 2 : v;
    kg = Math.round(kg * 10) / 10;
    return kg >= 25 && kg <= 300 ? kg : null;
  }

  /** 整句话只是在报体重：不用等大模型，直接记 */
  function quickWeight(text, lastKg) {
    const s = String(text || '').trim().replace(/[，,。.!！~～]+$/, '');
    const m = s.match(/^(?:今天|今早|早上|早晨|刚才|刚刚)?\s*(?:的)?\s*(体重|称了?一?下|称了|称重|上秤)?\s*(?:是|为|有|了)?\s*(\d{2,3}(?:\.\d{1,2})?)\s*(斤|公斤|kg|KG|千克)?$/);
    if (!m) return null;
    return toKg(parseFloat(m[2]), m[3], lastKg);
  }

  /** 一句话里提到体重（离线兜底用） */
  function findWeight(text, lastKg) {
    const m = String(text || '').match(/(?:体重|称了?一?下|称了|称重|上秤)[^\d]{0,4}(\d{2,3}(?:\.\d{1,2})?)\s*(斤|公斤|kg|KG|千克)?/);
    return m ? toKg(parseFloat(m[1]), m[2], lastKg) : null;
  }

  function guessMuscle(name) {
    const n = name || '';
    if (/跑|骑|单车|椭圆|跳绳|游泳|快走|爬坡|划船机|有氧|HIIT|楼梯/i.test(n)) return '有氧';
    if (/卧推|夹胸|飞鸟|俯卧撑|胸/.test(n)) return '胸部';
    if (/引体|划船|下拉|硬拉|背/.test(n)) return '背部';
    if (/蹲|腿|臀|箭步|提踵/.test(n)) return '腿部';
    if (/推举|侧平举|肩|面拉/.test(n)) return '肩部';
    if (/弯举|二头|三头|臂屈伸|下压/.test(n)) return '手臂';
    if (/卷腹|平板|腹|核心/.test(n)) return '核心';
    return '胸部';
  }

  function readOverride() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(OVERRIDE_KEY);
      const o = raw ? JSON.parse(raw) : {};
      return {
        baseUrl: (o.baseUrl || '').trim(),
        model: (o.model || '').trim(),
        apiKey: (o.apiKey || '').trim()
      };
    } catch (e) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
  }

  const ASR_KEY = 'tf_asr_override';
  function readAsrOverride() {
    try {
      const o = JSON.parse((root.localStorage && root.localStorage.getItem(ASR_KEY)) || '{}');
      return { baseUrl: (o.baseUrl || '').trim(), model: (o.model || '').trim(), apiKey: (o.apiKey || '').trim() };
    } catch (e) { return { baseUrl: '', model: '', apiKey: '' }; }
  }
  function writeAsrOverride(o) {
    try { root.localStorage.setItem(ASR_KEY, JSON.stringify({ baseUrl: (o.baseUrl || '').trim(), model: (o.model || '').trim(), apiKey: (o.apiKey || '').trim() })); } catch (e) {}
  }

  function writeOverride(o) {
    try {
      root.localStorage.setItem(OVERRIDE_KEY, JSON.stringify({
        baseUrl: (o.baseUrl || '').trim(),
        model: (o.model || '').trim(),
        apiKey: (o.apiKey || '').trim()
      }));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 原生桥（安卓 App）
  // ---------------------------------------------------------------------------
  const Native = {
    _seq: 0,
    _pending: {},

    has() {
      return typeof root.TrainFitNative !== 'undefined' && root.TrainFitNative !== null;
    },

    speechAvailable() {
      try { return this.has() && !!root.TrainFitNative.isSpeechAvailable(); } catch (e) { return false; }
    },

    asrAvailable() {
      try { return this.has() && !!root.TrainFitNative.isAsrConfigured && !!root.TrainFitNative.isAsrConfigured(JSON.stringify(readAsrOverride())); } catch (e) { return false; }
    },

    asrInfo() {
      try { return this.has() && root.TrainFitNative.getAsrInfo ? JSON.parse(root.TrainFitNative.getAsrInfo()) : null; } catch (e) { return null; }
    },

    llmInfo() {
      try { return this.has() ? JSON.parse(root.TrainFitNative.getLlmInfo()) : null; } catch (e) { return null; }
    },

    chat(body, override, timeoutMs) {
      return new Promise((resolve, reject) => {
        const id = 'r' + (++this._seq) + '_' + Date.now();
        const timer = setTimeout(() => {
          delete this._pending[id];
          reject(new Error('TIMEOUT'));
        }, timeoutMs || 45000);
        this._pending[id] = { resolve, reject, timer };
        try {
          root.TrainFitNative.llmChat(id, JSON.stringify(body), JSON.stringify(override || {}));
        } catch (e) {
          clearTimeout(timer);
          delete this._pending[id];
          reject(e);
        }
      });
    },

    _onLlm(id, ok, payload) {
      const p = this._pending[id];
      if (!p) return;
      clearTimeout(p.timer);
      delete this._pending[id];
      if (ok) p.resolve(payload); else p.reject(new Error(payload || 'LLM_ERROR'));
    }
  };

  root.__tfLlm = function (id, ok, payload) { Native._onLlm(id, ok, payload); };

  /** 震动反馈：tick 轻 / tap 点击 / start 重击 / stop 点击 / success 双击 / error 三连 */
  const Haptics = {
    on() { try { return root.localStorage.getItem('tf_haptics') !== 'off'; } catch (e) { return true; } },
    fire(kind) {
      if (!this.on()) return;
      try {
        if (Native.has() && root.TrainFitNative.haptic) { root.TrainFitNative.haptic(kind); return; }
        if (root.navigator && root.navigator.vibrate) {
          root.navigator.vibrate({ tick: 8, tap: 15, start: 30, stop: 15, success: [20, 60, 20], error: [40, 60, 40, 60, 40] }[kind] || 15);
        }
      } catch (e) {}
    }
  };
  root.Haptics = Haptics;

  // ---------------------------------------------------------------------------
  // 食物营养库（每 100 克）：中国食物成分表第6版 + 常见成品菜，见 js/food_db.js
  // 做法：大模型只负责「吃了什么、多少克」，热量和三大营养素按库里每 100 克的数值算
  // ---------------------------------------------------------------------------
  const FoodDB = {
    _built: false,
    entries: [],
    byKey: new Map(),

    norm(s) { return String(s || '').replace(/[\s·・]/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase(); },

    build() {
      if (this._built) return;
      this._built = true;
      const rows = root.FOOD_DB || (typeof FOOD_DB !== 'undefined' ? FOOD_DB : []);
      this.entries = rows.map(r => ({ name: r[0], aliases: r[1] ? r[1].split('|') : [], k: r[2], p: r[3], c: r[4], f: r[5], g: r[6], src: r[7] }));
      // 名称优先于别名；成品菜 / 常见条目优先于成分表
      const rank = (e) => (e.src === 'cfct' ? 1 : 0);
      const put = (key, e, isAlias) => {
        const k = this.norm(key);
        if (!k) return;
        const cur = this.byKey.get(k);
        const score = (isAlias ? 2 : 0) + rank(e);
        if (!cur || score < cur.score) this.byKey.set(k, { e, score });
      };
      this.entries.forEach(e => {
        put(e.name, e, false);
        put(e.name.replace(/\(生\)$/, ''), e, true);
        e.aliases.forEach(a => put(a, e, true));
      });
    },

    find(name) {
      this.build();
      const k = this.norm(name);
      const hit = this.byKey.get(k) || this.byKey.get(k + '(生)');
      return hit ? hit.e : null;
    },

    /** 用户原话里提到的食物 → 候选条目（放进提示词，让大模型用库里的名字和数值） */
    candidates(text, limit) {
      this.build();
      const t = this.norm(text);
      const found = new Map();
      this.entries.forEach(e => {
        const keys = [e.name.replace(/\(生\)$/, '')].concat(e.aliases).map(x => this.norm(x)).filter(x => x.length >= 2);
        const best = keys.filter(k => t.includes(k)).sort((a, b) => b.length - a.length)[0];
        if (best && !found.has(e.name)) found.set(e.name, { e, len: best.length });
      });
      const list = [...found.values()]
        .sort((a, b) => b.len - a.len || (a.e.src === 'cfct') - (b.e.src === 'cfct'))
        .slice(0, limit || 18)
        .map(x => x.e);
      const oil = this.find('烹调油');
      if (oil && !list.includes(oil)) list.push(oil);
      return list;
    },

    line(e) {
      return `${e.name} ${e.k}千卡 蛋白${e.p} 碳水${e.c} 脂肪${e.f}${e.g ? ` 常见一份约${e.g}g` : ''}`;
    }
  };

  /**
   * 按库重算一样食物。库里的数和大模型自己的估算差太多（>2.5 倍）时，
   * 说明大概率匹配错了（比如成分表里的「豆腐花」是干粉），这时保留大模型的估算。
   */
  function groundItem(it) {
    const name = cleanText(it && it.name, 20);
    const grams = num(it && it.grams);
    if (!name) return null;
    const ai = {
      calories: num(it.calories), proteinG: num(it.proteinG), carbsG: num(it.carbsG), fatG: num(it.fatG)
    };
    const e = grams && grams > 0 ? FoodDB.find(name) : null;
    if (e) {
      const k = e.k * grams / 100;
      const ratio = ai.calories && ai.calories > 0 ? k / ai.calories : 1;
      if (ratio >= 0.4 && ratio <= 2.5) {
        return {
          name, grams: Math.round(grams), src: e.src === 'cfct' ? '成分表' : '菜品库', dbName: e.name,
          calories: Math.round(k), proteinG: round1(e.p * grams / 100), carbsG: round1(e.c * grams / 100), fatG: round1(e.f * grams / 100)
        };
      }
    }
    if (!(ai.calories > 0)) return null;
    return {
      name, grams: grams ? Math.round(grams) : null, src: '估算',
      calories: Math.round(ai.calories), proteinG: round1(ai.proteinG || 0), carbsG: round1(ai.carbsG || 0), fatG: round1(ai.fatG || 0)
    };
  }

  function sumItems(items) {
    return items.reduce((t, x) => ({
      calories: t.calories + x.calories, proteinG: round1(t.proteinG + x.proteinG),
      carbsG: round1(t.carbsG + x.carbsG), fatG: round1(t.fatG + x.fatG)
    }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  }

  // ---------------------------------------------------------------------------
  // 大模型解析
  // ---------------------------------------------------------------------------
  const Parser = {
    buildMessages(text, ctx) {
      ctx = ctx || {};
      const now = ctx.now || new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const day = ctx.dayLabel || '今天';
      const records = ctx.dayRecords || [];
      const recent = (ctx.recent || []).slice(0, 25);

      const system = [
        '你是「练食AI」的记录助手。用户用口语说饮食、训练或体重，文字来自语音识别，可能有同音错字（"卧腿"=卧推，"四组八哥"=4组8个，"划川"=划船）。',
        '由你决定怎么改数据：新增、修改或删除。只输出一个 JSON 对象，不要 markdown，不要解释：',
        '{"reply":"一句话告诉用户你做了什么，20字以内","dayOffset":0,"bodyWeight":null,',
        ' "add":{"workouts":[{"exerciseName":"杠铃卧推","muscleGroup":"胸部","weightKg":80,"sets":4,"reps":8,"durationMin":null,"burnedCalories":110,"estimated":false}],',
        '        "meals":[{"mealType":"午餐","foodSummary":"番茄炒蛋盖饭1份","items":[{"name":"米饭","grams":250,"calories":290,"proteinG":6.5,"carbsG":65,"fatG":0.8},{"name":"鸡蛋","grams":100,"calories":139,"proteinG":13,"carbsG":2.4,"fatG":8.6},{"name":"番茄","grams":150,"calories":30,"proteinG":1.4,"carbsG":6,"fatG":0.3},{"name":"烹调油","grams":12,"calories":108,"proteinG":0,"carbsG":0,"fatG":12}]}]},',
        ' "update":[{"ref":"r2","set":{"weightKg":85}}],',
        ' "delete":["r3"]}',
        '规则：',
        '1. muscleGroup 只能是：' + MUSCLES.join('、') + '；mealType 只能是：' + MEAL_TYPES.join('、') + '（没说就按时间和食物判断）。',
        '2. 重量换算成公斤（磅×0.45，斤×0.5），自重 weightKg=0。跑步、单车、跳绳、平板支撑等按时间算的填 durationMin（分钟），sets、reps 为 null。',
        '3. 用户没说的重量/组数/次数：优先用下面「最近成绩」里同一动作的数；没有就按常见训练估一个，并设 "estimated":true。同一动作请沿用最近成绩里的名字。',
        '4. 饮食：同一餐合并成一条 meal。foodSummary 写给用户看的菜名和份量；items 把这一餐拆成食物/食材，每项写 name、grams（实际吃下去的可食部分克数）和你估算的 calories/proteinG/carbsG/fatG。',
        '   items 的 name 尽量用下面「参考营养数据」里的名字；名字带「(生)」的是生重，grams 要换算成生重（熟米饭用「米饭」，不要用大米）。',
        '   参考数据里没有的成品菜，拆成主要食材；炒菜、外卖、盖饭要加一项「烹调油」（一份炒菜约 10–15g，油炸更多）。',
        '   按中国常见份量估克数：米饭一碗约 180g，馒头一个约 100g，鸡蛋一个约 50g，牛奶一杯约 250g，一份外卖主菜约 250–350g。burnedCalories 按常见强度估算。',
        '5. 用户说「记错了/改成/其实是/只吃了一半/删掉/不算」等，是在改已有记录：用 update（set 里只写要改的字段；饮食份量变了就在 set 里给新的 items，或同时改热量和三大营养素）或 delete，引用下面的编号，不要重复新增。',
        '6. 说「昨天」dayOffset=-1，「前天」=-2，否则 0；修改和删除只针对下面列出的这天记录。',
        '7. 用户报自己的体重（「体重62.5」「今天称了124斤」「早上61公斤」）：bodyWeight 填公斤数（斤÷2；没说单位就参考下面的最近体重判断是斤还是公斤）。没说体重就填 null。训练用的重量不是体重。',
        '8. 听不懂或和饮食、训练、体重都无关：add 为空，reply 说明原因。'
      ].join('\n');

      const lines = [];
      lines.push(`现在时间 ${hh}:${mm}，正在看的日期：${day}。`);
      lines.push(records.length ? '这天已有记录：\n' + records.map(r => `${r.ref} ${r.text}`).join('\n') : '这天还没有记录。');
      if (recent.length) lines.push('最近成绩：' + recent.join('；'));
      if (ctx.lastWeight) lines.push(`最近体重：${ctx.lastWeight}kg`);
      const cands = FoodDB.candidates(text, 18);
      if (cands.length) lines.push('参考营养数据（每100g可食部，来自中国食物成分表和常见菜品库）：\n' + cands.map(e => FoodDB.line(e)).join('\n'));
      lines.push('用户说：' + text);
      return [
        { role: 'system', content: system },
        { role: 'user', content: lines.join('\n') }
      ];
    },

    extractJson(content) {
      if (content && typeof content === 'object') return content;
      let s = String(content || '').trim();
      s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) s = fence[1].trim();
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a === -1 || b <= a) throw new Error('NO_JSON');
      return JSON.parse(s.slice(a, b + 1));
    },

    /** 从 chat/completions 的原始响应里拿出 message.content */
    contentFromResponse(raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const choice = data && data.choices && data.choices[0];
      const content = choice && (choice.message ? choice.message.content : choice.text);
      if (!content) throw new Error('EMPTY_RESPONSE');
      return content;
    },

    /**
     * 把大模型输出整理成可以直接存的记录；缺的参数用历史记录补，补不到用默认值。
     * @returns {{dayOffset:number, workouts:Array, meals:Array}}
     */
    normalize(parsed, ctx) {
      ctx = ctx || {};
      const history = ctx.history || [];
      const now = ctx.now || new Date();
      const out = { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], reply: '' };
      // 兼容两种格式：{add:{workouts,meals}} 或顶层 workouts/meals
      if (parsed && parsed.add && typeof parsed.add === 'object') {
        parsed = Object.assign({}, parsed, {
          workouts: [].concat(parsed.workouts || [], parsed.add.workouts || []),
          meals: [].concat(parsed.meals || [], parsed.add.meals || [])
        });
      }
      out.reply = cleanText(parsed && parsed.reply, 40);
      const refs = new Set((ctx.dayRecords || []).map(r => r.ref));
      (Array.isArray(parsed && parsed.update) ? parsed.update : []).forEach(u => {
        if (!u || !refs.has(u.ref) || !u.set || typeof u.set !== 'object') return;
        const set = {};
        ['exerciseName', 'foodSummary', 'mealType', 'muscleGroup'].forEach(k => { if (u.set[k] != null) set[k] = cleanText(u.set[k], k === 'foodSummary' ? 60 : 30); });
        ['weightKg', 'sets', 'reps', 'durationMin', 'burnedCalories', 'calories', 'proteinG', 'carbsG', 'fatG'].forEach(k => {
          const v = num(u.set[k]);
          if (v !== null && v >= 0) set[k] = k === 'weightKg' || /G$/.test(k) ? round1(v) : Math.round(v);
        });
        if (Array.isArray(u.set.items)) {
          const items = u.set.items.map(groundItem).filter(Boolean);
          if (items.length) Object.assign(set, sumItems(items), { items });
        }
        if (set.mealType === '加餐' || set.mealType === '补剂') set.mealType = '加餐/补剂';
        if (set.mealType && !MEAL_TYPES.includes(set.mealType)) delete set.mealType;
        if (set.muscleGroup && !MUSCLES.includes(set.muscleGroup)) delete set.muscleGroup;
        if (Object.keys(set).length) out.updates.push({ ref: u.ref, set });
      });
      (Array.isArray(parsed && parsed.delete) ? parsed.delete : []).forEach(ref => { if (refs.has(ref)) out.deletes.push(ref); });

      const bw = num(parsed && (parsed.bodyWeight != null ? parsed.bodyWeight : parsed.bodyWeightKg));
      if (bw !== null) {
        let kg = bw;
        // 模型把「124斤」当成公斤了：和上次体重比一下
        if (ctx.lastWeight && kg > ctx.lastWeight * 1.6 && Math.abs(kg / 2 - ctx.lastWeight) < ctx.lastWeight * 0.2) kg = kg / 2;
        kg = round1(kg);
        if (kg >= 25 && kg <= 300) out.bodyWeight = kg;
      }

      const off = num(parsed && parsed.dayOffset);
      if (off !== null && off <= 0 && off >= -7) out.dayOffset = Math.round(off);

      const lastOf = (name) => history.find(h => h.exerciseName === name && !h.durationMin);

      (Array.isArray(parsed && parsed.workouts) ? parsed.workouts : []).forEach(w => {
        const name = cleanText(w.exerciseName || w.name, 30);
        if (!name) return;
        let muscle = cleanText(w.muscleGroup, 6);
        if (!MUSCLES.includes(muscle)) muscle = guessMuscle(name);

        const duration = num(w.durationMin);
        let weight = num(w.weightKg);
        let sets = num(w.sets);
        let reps = num(w.reps);
        let estimated = w.estimated === true;

        if (duration && duration > 0 && !sets && !reps) {
          const burn = num(w.burnedCalories);
          out.workouts.push({
            exerciseName: name,
            muscleGroup: muscle,
            weightKg: 0,
            sets: 1,
            reps: 0,
            durationMin: Math.round(duration),
            burnedCalories: Math.round(burn && burn > 0 ? burn : duration * 8),
            estimated
          });
          return;
        }

        const last = lastOf(name);
        if (weight === null) { weight = last ? last.weightKg : 0; estimated = true; }
        if (!sets) { sets = last ? last.sets : 3; estimated = true; }
        if (!reps) { reps = last ? last.reps : 10; estimated = true; }
        weight = Math.max(0, round1(weight));
        sets = Math.max(1, Math.min(20, Math.round(sets)));
        reps = Math.max(1, Math.min(100, Math.round(reps)));

        let burn = num(w.burnedCalories);
        if (!burn || burn <= 0) {
          burn = sets * reps * (weight > 0 ? weight * 0.05 + 1.2 : 2.5);
        }
        out.workouts.push({
          exerciseName: name,
          muscleGroup: muscle,
          weightKg: weight,
          sets,
          reps,
          durationMin: null,
          burnedCalories: Math.round(burn),
          estimated
        });
      });

      (Array.isArray(parsed && parsed.meals) ? parsed.meals : []).forEach(m => {
        const items = (Array.isArray(m.items) ? m.items : []).map(groundItem).filter(Boolean);
        if (items.length) {
          const t = sumItems(items);
          m = Object.assign({}, m, t);
        }
        const summary = cleanText(m.foodSummary || m.name || items.map(i => i.name).join('、'), 60);
        const cal = num(m.calories);
        if (!summary || !cal || cal <= 0) return;
        let type = cleanText(m.mealType, 8);
        if (type === '加餐' || type === '补剂') type = '加餐/补剂';
        if (!MEAL_TYPES.includes(type)) type = mealTypeByHour(now.getHours());
        out.meals.push({
          mealType: type,
          foodSummary: summary,
          calories: Math.round(cal),
          proteinG: round1(Math.max(0, num(m.proteinG) || 0)),
          carbsG: round1(Math.max(0, num(m.carbsG) || 0)),
          fatG: round1(Math.max(0, num(m.fatG) || 0)),
          items
        });
      });

      return out;
    },

    async viaLlm(text, ctx) {
      const override = readOverride();
      const base = {
        messages: this.buildMessages(text, ctx),
        temperature: 0.2,
        stream: false
      };
      if (override.model) base.model = override.model;

      // 关掉「先推理再回答」：Atria 实测 26 秒 → 3.6 秒，结果一样。
      // 换成不认这个参数的服务商时，自动去掉再试一次。
      const attempts = [Object.assign({ thinking: { type: 'disabled' } }, base), base];
      let lastErr;
      for (let i = 0; i < attempts.length; i++) {
        try {
          const raw = await this.send(attempts[i], override);
          const parsed = this.extractJson(this.contentFromResponse(raw));
          return this.normalize(parsed, ctx);
        } catch (e) {
          lastErr = e;
          const msg = (e && e.message) || '';
          if (/^HTTP 429/.test(msg)) {                // 限流：等一下再试同一个
            await new Promise(r => setTimeout(r, 2500));
            i -= 1;
            if (this._retried429) { this._retried429 = false; break; }
            this._retried429 = true;
            continue;
          }
          if (msg === 'NO_KEY' || !/^HTTP 4\d\d/.test(msg)) break; // 只有参数被拒才换下一种
        }
      }
      this._retried429 = false;
      throw lastErr || new Error('LLM_FAILED');
    },

    async send(body, override) {
      if (Native.has()) return Native.chat(body, override);
      if (override.apiKey && override.baseUrl) {
        // 浏览器里调试：直接请求（部分服务商不允许跨域，会失败）
        const b = Object.assign({ model: 'gpt-4o-mini' }, body);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(override.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + override.apiKey },
            body: JSON.stringify(b),
            signal: ctrl.signal
          });
          const raw = await res.text();
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + raw.slice(0, 200));
          return raw;
        } finally {
          clearTimeout(t);
        }
      }
      throw new Error('NO_KEY');
    },

    /** 离线兜底：按句子切开，吃喝相关的走饮食引擎，其余走训练引擎 */
    viaLocal(text, ctx) {
      ctx = ctx || {};
      const now = ctx.now || new Date();
      const WE = root.WorkoutEngine;
      const NE = root.NutritionEngine;
      const out = { dayOffset: 0, workouts: [], meals: [] };
      if (/前天/.test(text)) out.dayOffset = -2;
      else if (/昨天|昨晚/.test(text)) out.dayOffset = -1;

      const foodCue = /吃|喝|早餐|午餐|晚餐|早饭|午饭|晚饭|夜宵|加餐|外卖|零食|饮料|奶茶|咖啡|牛奶|鸡蛋|米饭|面条|水果/;
      const w = findWeight(text, ctx.lastWeight);
      if (w) out.bodyWeight = w;
      const segs = String(text).split(/[，,。；;！!？?\n]|然后|接着|另外|还有/).map(s => s.trim())
        .filter(s => s && !/体重|称了|称一下|称重|上秤/.test(s));
      const foodSegs = [];
      const workoutSegs = [];
      segs.forEach(s => (foodCue.test(s) ? foodSegs : workoutSegs).push(s));

      if (WE && workoutSegs.length) {
        const items = WE.parseWorkoutVoice(workoutSegs.join('，')) || [];
        const pseudo = {
          workouts: items
            // 旧引擎对无关的话也会返回一个默认动作：一个数字都没有的丢掉
            .filter(i => i && i.exerciseName && (i.weightKg != null || i.sets != null || i.reps != null))
            .map(i => {
              const isCardio = /有氧|跑|骑|单车|跳绳|平板/.test((i.muscleGroup || '') + i.exerciseName);
              return {
                exerciseName: i.exerciseName,
                muscleGroup: i.muscleGroup,
                weightKg: isCardio ? null : i.weightKg,
                sets: isCardio ? null : i.sets,
                reps: isCardio ? null : i.reps,
                durationMin: isCardio ? (i.durationMin || i.weightKg || null) : null,
                burnedCalories: isCardio ? null : i.burnedCalories
              };
            })
        };
        out.workouts = this.normalize(pseudo, ctx).workouts;
      }

      if (NE && foodSegs.length) {
        const joined = foodSegs.join('，');
        const r = NE.parseDietVoice(joined);
        if (r && r.totalCalories > 0) {
          let type = null;
          if (/早餐|早饭|早上/.test(joined)) type = '早餐';
          else if (/午餐|午饭|中午/.test(joined)) type = '午餐';
          else if (/晚餐|晚饭|晚上/.test(joined)) type = '晚餐';
          else if (/加餐|夜宵|零食/.test(joined)) type = '加餐/补剂';
          out.meals.push({
            mealType: type || mealTypeByHour(now.getHours()),
            foodSummary: cleanText(r.foodSummary, 60) || '饮食记录',
            calories: Math.round(r.totalCalories),
            proteinG: round1(r.proteinG || 0),
            carbsG: round1(r.carbsG || 0),
            fatG: round1(r.fatG || 0)
          });
        }
      }
      return out;
    },

    async parse(text, ctx) {
      try {
        const r = await this.viaLlm(text, ctx);
        return Object.assign(r, { source: 'llm' });
      } catch (e) {
        console.warn('[QuickLog] 大模型解析失败，改用本地规则：', e && e.message);
        const r = this.viaLocal(text, ctx);
        return Object.assign(r, { source: 'local', error: e && e.message });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 界面
  // ---------------------------------------------------------------------------
  const QuickLog = {
    state: 'idle',          // idle | recording | transcribing
    engine: null,           // asr（自己录音 + 语音转文字）| system（手机系统识别，边说边出字）
    speechBroken: false,
    _snackTimer: null,

    init() {
      const $ = (id) => document.getElementById(id);
      this.composer = $('composer');
      this.talkBtn = $('talk-btn');
      this.talkLabel = $('talk-label');
      this.voiceRow = $('voice-row');
      this.textRow = $('text-row');
      this.textEl = $('cmp-text');
      this.sendBtn = $('cmp-send');
      this.statusEl = $('cmp-status');
      this.panel = $('rec-panel');
      this.snack = $('ql-snackbar');
      if (!this.talkBtn) return;

      this.bindTalk();
      $('cmp-kbd').addEventListener('click', () => this.setMode('text', true));
      $('cmp-voice').addEventListener('click', () => this.setMode('voice'));
      this.sendBtn.addEventListener('click', () => this.sendText());
      document.getElementById('ql-undo')?.addEventListener('click', () => this.undo());
      this.textEl.addEventListener('input', () => { this.autoGrow(); this.updateSend(); });
      this.textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.sendText(); }
      });

      const syncHeight = () => document.documentElement.style.setProperty('--cmp-h', this.composer.offsetHeight + 'px');
      if (root.ResizeObserver) new ResizeObserver(syncHeight).observe(this.composer);
      syncHeight();

      let mode = 'voice';
      try { mode = root.localStorage.getItem('tf_input_mode') || 'voice'; } catch (e) {}
      this.setMode(this.canTalk() ? mode : 'text');

      this.initSettings();
      root.__tfSpeech = (type, text) => this.onSpeech(type, text);
      root.__tfRec = (type, value) => this.onRec(type, value);
      root.__tfAsr = (id, ok, text) => this.onAsr(id, ok, text);
    },

    // ----- 能不能说话 -----
    speechSupported() {
      if (this.speechBroken) return false;
      if (Native.has()) return Native.speechAvailable();
      return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
    },
    pickEngine() {
      if (Native.asrAvailable()) return 'asr';
      if (this.speechSupported()) return 'system';
      return null;
    },
    canTalk() { return !!this.pickEngine(); },

    setMode(mode, focus) {
      this.mode = mode === 'text' ? 'text' : 'voice';
      try { root.localStorage.setItem('tf_input_mode', this.mode); } catch (e) {}
      this.voiceRow.classList.toggle('hidden', this.mode !== 'voice');
      this.textRow.classList.toggle('hidden', this.mode !== 'text');
      this.setStatus('');
      if (this.mode === 'text') {
        this.autoGrow();
        this.updateSend();
        if (focus) this.textEl.focus();
      }
    },

    autoGrow() {
      const el = this.textEl;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 132) + 'px';
    },
    updateSend() { this.sendBtn.disabled = !this.textEl.value.trim(); },

    setStatus(text, kind) {
      this.statusEl.textContent = text || '';
      this.statusEl.className = 'cmp-status' + (text ? '' : ' hidden') + (kind ? ' ' + kind : '');
    },

    sendText() {
      const text = this.textEl.value.trim();
      if (!text) { this.textEl.focus(); return; }
      this.textEl.value = '';
      this.autoGrow();
      this.updateSend();
      this.textEl.blur();
      this.submit(text);
    },

    /** 失败的记录「改字」：放回输入框 */
    openWithText(text) {
      if (root.app && root.app.view !== 'today') root.app.switchView('today');
      this.setMode('text');
      this.textEl.value = text || '';
      this.autoGrow();
      this.updateSend();
      this.setStatus('改一改，再点右边发送');
      this.textEl.focus();
    },

    // ----- 一个按钮：按住说、松手结束；或点一下开始、再点一下结束 -----
    bindTalk() {
      const btn = this.talkBtn;
      let downAt = 0, startY = 0, pressing = false, stopOnUp = false;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pressing = true;
        startY = e.clientY || 0;
        downAt = Date.now();
        if (this.state === 'recording') { stopOnUp = true; return; } // 点按模式下的第二次点击
        if (this.state !== 'idle') { pressing = false; return; }
        stopOnUp = false;
        this.startTalk();
      });
      root.addEventListener('pointermove', (e) => {
        if (!pressing || this.state !== 'recording' || this.tapMode) return;
        const cancel = startY - (e.clientY || 0) > 70;
        if (cancel !== this.panel.classList.contains('canceling')) Haptics.fire('tick');
        this.panel.classList.toggle('canceling', cancel);
        document.getElementById('rec-hint').textContent = cancel ? '松开手指，取消这次' : '松手结束 · 上滑取消';
      });
      const up = (e) => {
        if (!pressing) return;
        pressing = false;
        if (this.state !== 'recording') return;
        if (stopOnUp) { this.stopTalk(true); return; }
        if (Date.now() - downAt < 350) {
          // 很快松开：当作「点一下开始」，再点一下结束
          this.tapMode = true;
          this.talkLabel.textContent = '点一下结束';
          document.getElementById('rec-hint').textContent = '说完点一下按钮结束';
          return;
        }
        const cancel = startY - ((e && e.clientY) || 0) > 70;
        this.panel.classList.remove('canceling');
        if (cancel) this.cancelTalk('已取消'); else this.stopTalk(true);
      };
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    startTalk() {
      const engine = this.pickEngine();
      if (!engine) {
        this.setMode('text', true);
        this.setStatus('这台手机没有语音识别，打字或者用键盘上的 🎤', 'warn');
        return;
      }
      this.engine = engine;
      this.tapMode = false;
      this.state = 'recording';
      Haptics.fire('start');
      this.recStart = Date.now();
      this.liveText = '';
      this._levels = [];
      this.composer.classList.add('recording');
      this.panel.classList.remove('hidden', 'canceling');
      document.getElementById('rec-live').textContent = '';
      document.getElementById('rec-hint').textContent = '松手结束 · 上滑取消';
      this.talkLabel.textContent = '松手结束';
      this.setStatus('');
      clearInterval(this._timer);
      this._timer = setInterval(() => this.tick(), 250);
      this.tick();
      if (engine === 'asr') {
        try { root.TrainFitNative.startRecording(); } catch (e) { this.failTalk('录音启动失败'); }
      } else {
        this.startSystem();
      }
    },

    tick() {
      const s = Math.floor((Date.now() - this.recStart) / 1000);
      document.getElementById('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (this.engine === 'system') {
        // 系统识别没有音量，做个轻微的呼吸动效
        this.setLevel(0.15 + 0.25 * Math.abs(Math.sin(Date.now() / 260)));
      }
    },

    /** 滚动波形：保存最近的音量，从右往左画成竖条（参考微信语音、iOS 语音备忘录） */
    setLevel(v) {
      if (!this._levels) this._levels = [];
      this._levels.push(Math.max(0, Math.min(1, v)));
      if (this._levels.length > 120) this._levels.shift();
      this.drawWave();
    },

    drawWave() {
      const c = document.getElementById('rec-wave');
      if (!c) return;
      const dpr = root.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(c).color || '#e05a4f';
      const barW = 3, gap = 2, step = barW + gap;
      const n = Math.floor(w / step);
      const lv = this._levels || [];
      for (let i = 0; i < n; i++) {
        const v = lv[lv.length - n + i];
        const amp = v == null ? 0 : Math.pow(v, 0.7);             // 小声也看得见
        const bh = Math.max(3, amp * (h - 4));
        const x = i * step;
        ctx.globalAlpha = v == null ? 0.25 : 0.35 + 0.65 * (i / n); // 越新越亮
        ctx.fillStyle = color;
        const y = (h - bh) / 2;
        const r = Math.min(barW / 2, bh / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, r); else ctx.rect(x, y, barW, bh);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    resetTalkUi() {
      clearInterval(this._timer);
      this.composer.classList.remove('recording', 'busy');
      this.panel.classList.add('hidden');
      this.panel.classList.remove('canceling');
      this.talkLabel.textContent = '按住说话';
      this.tapMode = false;
    },

    cancelTalk(msg) {
      Haptics.fire('tick');
      if (this.engine === 'asr') { try { root.TrainFitNative.cancelRecording(); } catch (e) {} }
      else this.cancelSystem();
      this.state = 'idle';
      this.resetTalkUi();
      this.setStatus(msg || '');
    },

    failTalk(msg) {
      Haptics.fire('error');
      this.state = 'idle';
      this.resetTalkUi();
      this.setStatus(msg, 'warn');
    },

    stopTalk() {
      if (this.state !== 'recording') return;
      this.state = 'transcribing';
      Haptics.fire('stop');
      clearInterval(this._timer);
      this.panel.classList.add('hidden');
      this.composer.classList.remove('recording');
      this.composer.classList.add('busy');
      this.talkLabel.textContent = '识别中…';
      if (this.engine === 'asr') {
        this._asrId = 'a' + Date.now();
        try { root.TrainFitNative.stopRecording(this._asrId, JSON.stringify(readAsrOverride())); } catch (e) { this.onAsr(this._asrId, false, 'STOP_FAILED'); }
        clearTimeout(this._asrWatch);
        this._asrWatch = setTimeout(() => { if (this.state === 'transcribing') this.onAsr(this._asrId, false, 'TIMEOUT'); }, 35000);
      } else {
        this.stopSystem();
      }
    },

    /** 拿到最终文字：交给大模型 */
    finishTalk(text) {
      this.state = 'idle';
      this.resetTalkUi();
      text = (text || '').trim();
      if (!text) { this.setStatus('没听到内容，再按住说一次', 'warn'); return; }
      this.setStatus('');
      this.submit(text);
    },

    // ----- 自己录音 + 语音转文字 -----
    onRec(type, value) {
      if (type === 'level') { if (this.state === 'recording') this.setLevel(Number(value) || 0); return; }
      if (type === 'partial') {
        // 本机识别：边说边出字
        if (this.state === 'recording' || this.state === 'transcribing') {
          this.liveText = value || '';
          document.getElementById('rec-live').textContent = this.liveText;
        }
        return;
      }
      if (type === 'max') { if (this.state === 'recording') this.stopTalk(); return; }
      if (type === 'error') {
        if (this.state !== 'recording') return;
        if (value === 'PERMISSION_JUST_GRANTED') this.failTalk('已允许使用麦克风，再按住说一次');
        else if (value === 'PERMISSION_DENIED') this.failTalk('没有麦克风权限，去系统设置里打开，或者点左边改成打字');
        else this.failTalk('录音没启动成功，再试一次');
      }
    },

    onAsr(id, ok, text) {
      if (id !== this._asrId || this.state !== 'transcribing') return;
      clearTimeout(this._asrWatch);
      if (ok) { this.finishTalk(text); return; }
      Haptics.fire('error');
      this.state = 'idle';
      this.resetTalkUi();
      const msg = String(text || '');
      if (msg === 'TOO_SHORT' || msg === 'NO_SPEECH') this.setStatus('没听到说话，按住再说一次', 'warn');
      else if (msg === 'LOCAL_NOT_READY') this.setStatus('识别模型还在加载，稍等一两秒再说', 'warn');
      else if (msg === 'NO_KEY') this.setStatus('还没有语音识别 key，去设置里填', 'warn');
      else if (/^HTTP 401|^HTTP 403/.test(msg)) this.setStatus('语音识别 key 不对，去设置里检查', 'warn');
      else this.setStatus('识别失败（网络不好？）再说一次，或点左边改成打字', 'warn');
    },

    // ----- 手机系统识别（没有语音识别 key 时用）：一直听到你松手 -----
    startSystem() {
      this._aborted = false;
      this._gotStart = false;
      this._speechError = null;
      this.clearWatchdogs();
      this._startWatch = setTimeout(() => {
        if (this.state === 'recording' && !this._gotStart) {
          this.speechBroken = true;
          this.cancelSystem();
          this.state = 'idle';
          this.resetTalkUi();
          this.setMode('text', false);
          this.setStatus('这台手机的系统语音没反应。可以打字，或在设置里填语音识别 key', 'warn');
        }
      }, 3000);
      if (Native.has()) {
        try { root.TrainFitNative.startListening(); } catch (e) { this.onSpeech('error', 'START_FAILED'); this.onSpeech('end', ''); }
        return;
      }
      const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
      if (!SR) { this.onSpeech('error', 'NOT_AVAILABLE'); this.onSpeech('end', ''); return; }
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      let finalText = '';
      rec.onstart = () => this.onSpeech('start', '');
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
          else interim += ev.results[i][0].transcript;
        }
        this.onSpeech('partial', finalText + interim);
      };
      rec.onerror = (ev) => { if (!finalText) this.onSpeech('error', ev.error || 'ERROR'); };
      rec.onend = () => { this._webRec = null; this.onSpeech('final', finalText); this.onSpeech('end', ''); };
      this._webRec = rec;
      try { rec.start(); } catch (e) { this.onSpeech('error', 'START_FAILED'); this.onSpeech('end', ''); }
    },

    stopSystem() {
      clearTimeout(this._startWatch);
      if (Native.has()) { try { root.TrainFitNative.stopListening(); } catch (e) {} }
      else if (this._webRec) { try { this._webRec.stop(); } catch (e) {} }
      clearTimeout(this._stopWatch);
      this._stopWatch = setTimeout(() => {
        if (this.state === 'transcribing' && this.engine === 'system') { this.cancelSystem(); this.finishTalk(this.liveText); }
      }, 3000);
    },

    cancelSystem() {
      this._aborted = true;
      this.clearWatchdogs();
      if (Native.has()) { try { root.TrainFitNative.cancelListening(); } catch (e) {} }
      if (this._webRec) { try { this._webRec.abort(); } catch (e) {} this._webRec = null; }
    },

    clearWatchdogs() {
      clearTimeout(this._startWatch);
      clearTimeout(this._stopWatch);
    },

    onSpeech(type, text) {
      if (type === 'start') { this._gotStart = true; clearTimeout(this._startWatch); return; }
      if (this._aborted || this.engine !== 'system') return;
      if (this.state !== 'recording' && this.state !== 'transcribing') return;
      if (type === 'partial' || type === 'final') {
        if (type === 'partial') { this._gotStart = true; clearTimeout(this._startWatch); }
        if (text) {
          this.liveText = text.trim();
          document.getElementById('rec-live').textContent = this.liveText;
        }
      } else if (type === 'error') {
        this._speechError = text;
      } else if (type === 'end') {
        this.clearWatchdogs();
        if (this.state === 'recording' && !this.liveText) {
          const err = this._speechError;
          this.state = 'idle';
          this.resetTalkUi();
          if (err === 'PERMISSION_DENIED') this.setStatus('没有麦克风权限，去系统设置里打开', 'warn');
          else { this.speechBroken = true; this.setMode('text'); this.setStatus('系统语音用不了。可以打字，或在设置里填语音识别 key', 'warn'); }
          return;
        }
        if (this.state === 'transcribing') this.finishTalk(this.liveText);
      }
    },

    // ----- 解析 + 保存（后台进行，不用等） -----
    submit(text) {
      text = (text || '').trim();
      if (!text) return;
      const p = root.app.addPending(text);
      this.process(p);
    },

    /** 给大模型的上下文：这天的记录（带编号）+ 各动作最近一次成绩 */
    buildContext(p) {
      const app = root.app;
      const date = p.date;
      const dayRecords = [];
      app.diet.filter(d => d.date === date).forEach(d => dayRecords.push({
        kind: 'meal', id: d.id,
        text: `${(d.mealType || '').replace('/补剂', '')} ${d.foodSummary} ${d.calories}kcal 蛋白${d.proteinG || 0} 碳水${d.carbsG || 0} 脂肪${d.fatG || 0}` +
          (Array.isArray(d.items) && d.items.length ? `（${d.items.map(i => `${i.name}${i.grams ? i.grams + 'g' : ''}`).join('、')}）` : '')
      }));
      app.workouts.filter(w => w.date === date).forEach(w => dayRecords.push({
        kind: 'workout', id: w.id,
        text: w.durationMin ? `训练 ${w.exerciseName} ${w.durationMin}分钟 消耗${w.burnedCalories || 0}` :
          `训练 ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}组×${w.reps}次 消耗${w.burnedCalories || 0}`
      }));
      dayRecords.forEach((r, i) => { r.ref = 'r' + (i + 1); });

      const seen = new Set();
      const recent = [];
      app.workouts
        .filter(w => !w.durationMin)
        .sort((x, y) => (y.date === x.date ? (y.ts || 0) - (x.ts || 0) : (y.date > x.date ? 1 : -1)))
        .forEach(w => {
          if (seen.has(w.exerciseName)) return;
          seen.add(w.exerciseName);
          recent.push(`${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}（${w.date.slice(5)}）`);
        });

      const today = getTodayDateString();
      const dayLabel = date === today ? `今天 ${date}` : date;
      const lw = app.latestWeight ? app.latestWeight() : null;
      return { now: new Date(p.ts || Date.now()), history: app.workouts, dayRecords, recent, dayLabel, lastWeight: lw ? lw.kg : null };
    },

    async process(p) {
      const app = root.app;
      const ctx = this.buildContext(p);
      let result;
      try {
        // 只是报体重：不用等大模型
        const kg = quickWeight(p.text, ctx.lastWeight);
        result = kg ? { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], bodyWeight: kg, reply: '', source: 'fast' }
          : await Parser.parse(p.text, ctx);
      } catch (e) {
        app.failPending(p.id, '整理出错了');
        return;
      }
      if (!app.pending.some(x => x.id === p.id)) return; // 已被用户删掉
      const changes = result.workouts.length + result.meals.length + (result.updates || []).length + (result.deletes || []).length + (result.bodyWeight ? 1 : 0);
      if (!changes) {
        app.failPending(p.id, result.reply || (result.source === 'local' ? 'AI 没连上，也没认出内容' : '没认出吃了什么'));
        return;
      }
      app.finishPending(p.id);
      const batch = this.save(result, p.date, ctx);
      this.showSnack(batch, result);
    },

    save(result, baseDate, ctx) {
      const app = root.app;
      const base = baseDate || app.selectedDate || getTodayDateString();
      const date = result.dayOffset ? shiftDateString(base, result.dayOffset) : base;
      const stamp = Date.now();
      const batch = { workoutIds: [], dietIds: [], date, before: [], removed: [], changed: [] };
      const refMap = new Map(((ctx && ctx.dayRecords) || []).map(r => [r.ref, r]));
      const find = (r) => (r.kind === 'meal' ? app.diet : app.workouts).find(x => x.id === r.id);

      // 修改
      (result.updates || []).forEach(u => {
        const r = refMap.get(u.ref);
        const rec = r && find(r);
        if (!rec) return;
        batch.before.push({ kind: r.kind, snapshot: JSON.parse(JSON.stringify(rec)) });
        Object.keys(u.set).forEach(k => {
          if (r.kind === 'meal' && ['mealType', 'foodSummary', 'calories', 'proteinG', 'carbsG', 'fatG', 'items'].includes(k)) rec[k] = u.set[k];
          if (r.kind === 'workout' && ['exerciseName', 'muscleGroup', 'weightKg', 'sets', 'reps', 'durationMin', 'burnedCalories'].includes(k)) rec[k] = u.set[k];
        });
        batch.changed.push(r.kind === 'meal' ? `改 · ${rec.foodSummary} ${rec.calories} kcal` :
          `改 · ${rec.exerciseName} ${rec.durationMin ? rec.durationMin + ' 分钟' : (rec.weightKg > 0 ? rec.weightKg + 'kg' : '自重') + ' ' + rec.sets + '×' + rec.reps}`);
      });

      // 删除
      (result.deletes || []).forEach(ref => {
        const r = refMap.get(ref);
        if (!r) return;
        const list = r.kind === 'meal' ? app.diet : app.workouts;
        const idx = list.findIndex(x => x.id === r.id);
        if (idx === -1) return;
        const [rec] = list.splice(idx, 1);
        batch.removed.push({ kind: r.kind, rec });
        batch.changed.push(`删 · ${r.kind === 'meal' ? rec.foodSummary : rec.exerciseName}`);
      });

      // 新增
      result.workouts.forEach((w, i) => {
        const id = 'w_' + stamp + '_' + i;
        batch.workoutIds.push(id);
        app.workouts.unshift({
          id,
          ts: stamp + i,
          date,
          exerciseName: w.exerciseName,
          muscleGroup: w.muscleGroup,
          sets: w.sets,
          reps: w.reps,
          weightKg: w.weightKg,
          durationMin: w.durationMin || undefined,
          rpe: 8.0,
          burnedCalories: w.burnedCalories,
          notes: w.estimated ? '一键记录（部分参数按上次/默认值估计）' : '一键记录'
        });
      });
      result.meals.forEach((m, i) => {
        const id = 'd_' + stamp + '_' + i;
        batch.dietIds.push(id);
        app.diet.unshift({
          id,
          ts: stamp + 50 + Math.max(0, MEAL_TYPES.indexOf(m.mealType)) * 2 + i,
          date,
          mealType: m.mealType,
          foodSummary: m.foodSummary,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          items: m.items && m.items.length ? m.items : undefined
        });
      });

      // 体重
      if (result.bodyWeight && app.setWeight) {
        batch.weight = { date, prev: app.setWeight(date, result.bodyWeight) };
      }

      app.saveData();
      app.render();
      return batch;
    },

    describe(result) {
      const lines = [];
      result.workouts.forEach(w => {
        if (w.durationMin) lines.push(`有氧 · ${w.exerciseName} ${w.durationMin} 分钟`);
        else lines.push(`训练 · ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}${w.estimated ? '（估）' : ''}`);
      });
      result.meals.forEach(m => lines.push(`${m.mealType.replace('/补剂', '')} · ${m.foodSummary} ${m.calories} kcal`));
      if (result.bodyWeight) lines.push(`体重 · ${result.bodyWeight} kg`);
      return lines;
    },

    showSnack(batch, result) {
      const app = root.app;
      const n = result.workouts.length + result.meals.length + (result.bodyWeight ? 1 : 0);
      let t = result.reply ? '✓ ' + result.reply : (result.bodyWeight && n === 1 ? `✓ 记下体重 ${result.bodyWeight} kg` : (n ? `✓ 已记下 ${n} 条` : '✓ 已更新'));
      if (n && batch.date !== getTodayDateString()) t += `（${batch.date.slice(5).replace('-', '月')}日）`;
      if (result.source === 'local') t += ' · AI 没连上，用的简单规则';
      const lines = this.describe(result).concat(batch.changed || []);
      Haptics.fire('success');
      // App 在后台（比如说完就锁屏了）：发一条通知
      if (typeof document !== 'undefined' && document.hidden && Native.has() && root.TrainFitNative.showNotification) {
        try { root.TrainFitNative.showNotification(t.replace(/^✓\s*/, ''), lines.join('\n')); } catch (e) {}
      }
      this.showUndo(t, lines, () => {
        app.workouts = app.workouts.filter(w => !batch.workoutIds.includes(w.id));
        app.diet = app.diet.filter(d => !batch.dietIds.includes(d.id));
        (batch.before || []).forEach(b => {
          const list = b.kind === 'meal' ? app.diet : app.workouts;
          const rec = list.find(x => x.id === b.snapshot.id);
          if (rec) Object.keys(rec).forEach(k => delete rec[k]), Object.assign(rec, b.snapshot);
        });
        (batch.removed || []).forEach(r => (r.kind === 'meal' ? app.diet : app.workouts).unshift(r.rec));
        if (batch.weight && app.restoreWeight) app.restoreWeight(batch.weight.date, batch.weight.prev);
        app.saveData();
        app.render();
      });
    },

    /** 通用：底部提示 + 撤销 */
    showUndo(title, lines, undoFn) {
      document.getElementById('ql-snack-title').textContent = title;
      const list = document.getElementById('ql-snack-list');
      list.innerHTML = '';
      (lines || []).forEach(line => {
        const li = document.createElement('div');
        li.className = 'ql-snack-line';
        li.textContent = line;
        list.appendChild(li);
      });
      this._undoFn = undoFn;
      this.snack.classList.remove('hidden');
      clearTimeout(this._snackTimer);
      this._snackTimer = setTimeout(() => this.hideSnack(), 6000);
    },

    undo() {
      Haptics.fire('tap');
      const fn = this._undoFn;
      this._undoFn = null;
      this.hideSnack();
      if (fn) { fn(); root.app && root.app.showToast('已撤销'); }
    },

    hideSnack() {
      clearTimeout(this._snackTimer);
      this.snack.classList.add('hidden');
    },

    // ----- 设置：AI 接口 -----
    initAsrSettings() {
      const baseEl = document.getElementById('asr-cfg-base');
      if (!baseEl) return;
      const modelEl = document.getElementById('asr-cfg-model');
      const keyEl = document.getElementById('asr-cfg-key');
      const hint = document.getElementById('asr-cfg-hint');
      const o = readAsrOverride();
      baseEl.value = o.baseUrl; modelEl.value = o.model; keyEl.value = o.apiKey;
      const info = Native.asrInfo();
      baseEl.placeholder = (info && info.baseUrl) || 'https://api.siliconflow.cn/v1';
      modelEl.placeholder = (info && info.model) || 'FunAudioLLM/SenseVoiceSmall';
      keyEl.placeholder = info && info.hasKey ? '已内置，留空即可' : 'sk-…';
      const refresh = () => {
        const loc = info && info.local;
        hint.textContent = Native.has()
          ? (loc === 'failed'
              ? '这台手机用不了本机识别（可能是 32 位系统），改用下面的云端接口。'
              : '默认在手机本机识别，不用联网、边说边出字。下面的云端接口只在本机识别用不了时才用。')
          : '浏览器里用的是浏览器自带的语音识别。';
      };
      refresh();
      document.getElementById('asr-cfg-save').addEventListener('click', () => {
        writeAsrOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        refresh();
        if (this.canTalk() && this.mode === 'text') this.setMode('voice');
        root.app && root.app.showToast('✓ 语音识别设置已保存');
      });
    },

    initSettings() {
      this.initAsrSettings();
      const baseEl = document.getElementById('ql-cfg-base');
      const modelEl = document.getElementById('ql-cfg-model');
      const keyEl = document.getElementById('ql-cfg-key');
      const hint = document.getElementById('ql-cfg-hint');
      const saveBtn = document.getElementById('ql-cfg-save');
      const testBtn = document.getElementById('ql-cfg-test');
      if (!baseEl || !saveBtn) return;

      const o = readOverride();
      baseEl.value = o.baseUrl;
      modelEl.value = o.model;
      keyEl.value = o.apiKey;

      const info = Native.llmInfo();
      if (info) {
        baseEl.placeholder = info.baseUrl || 'https://…/v1';
        modelEl.placeholder = info.model || '模型名';
        keyEl.placeholder = info.hasKey ? '已内置，留空即可' : '还没有内置 key，请填写';
        hint.textContent = info.hasKey ? '安装包里已经带了接口配置，一般不用填。填了会覆盖内置的。' : '安装包里没有内置 key，填上才能用 AI 解析；不填就只能用简单规则。';
      } else {
        hint.textContent = '浏览器里调试用：填 OpenAI 兼容接口（部分服务商不允许浏览器跨域调用）。';
      }

      saveBtn.addEventListener('click', () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        root.app && root.app.showToast('✓ AI 接口设置已保存');
      });

      testBtn.addEventListener('click', async () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        testBtn.disabled = true;
        testBtn.textContent = '测试中…';
        try {
          const r = await Parser.viaLlm('卧推60公斤3组10个，中午吃了一碗牛肉面', { now: new Date(), history: [] });
          const n = r.workouts.length + r.meals.length;
          root.app && root.app.showToast(n ? `✓ 接口正常，识别出 ${n} 项` : '接口通了，但没识别出内容');
        } catch (e) {
          const msg = (e && e.message) || '';
          root.app && root.app.showToast(msg === 'NO_KEY' ? '还没有 API key' : ('✗ 连接失败：' + msg.slice(0, 60)));
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = '测试连接';
        }
      });
    }
  };

  root.QuickLog = QuickLog;
  root.QuickLogParser = Parser;

  if (typeof document !== 'undefined') {
    const boot = () => setTimeout(() => QuickLog.init(), 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QuickLogParser: Parser, Native, FoodDB, groundItem, quickWeight, findWeight };
  }
})(typeof window !== 'undefined' ? window : globalThis);
