/**
 * 一样食物的热量从哪来，按可信程度依次：
 *   1. 用户记住的（自己改过、或照包装念过的）→「我的」
 *   2. 用户念的包装营养数 →「包装」
 *   3. 单一食材（米饭、鸡蛋、牛奶…）按食物库重算 →「成分表」「菜品库」
 *   4. 其余（糯米鸡、饭团、一碗面这种整份的东西）用大模型按常见大小的估算 →「估算」
 */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && typeof require === 'function') {
    require('./helpers.js');
    if (!root.FOOD_DB) root.FOOD_DB = require('../data/food_db.js'); // Node 里 food_db.js 不会自己挂到全局
  }
  const TF = root.TF = root.TF || {};
  const { num, cleanText, round1 } = TF;

  // ---------------------------------------------------------------------------
  // 食物营养库（每 100 克）：中国食物成分表第6版 + 常见成品菜，见 js/data/food_db.js
  // 成分表里的「(生)」「(干)」条目是生重 / 干重，只有用户明确说时才用，免得「糯米鸡」被当成生糯米算
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
        // 生重 / 干重条目（「牛肉(生)」「粉丝(干)」）只认全名，别名「牛肉」「粉丝」留给熟食，免得按生重算
        if (!/\((生|干)\)$/.test(e.name)) e.aliases.forEach(a => put(a, e, true));
      });
    },

    find(name) {
      this.build();
      const k = this.norm(name);
      const hit = this.byKey.get(k);
      return hit ? hit.e : null;
    },

    /** 用户原话里提到的食物 → 候选条目（放进提示词，让大模型用库里的名字和数值） */
    candidates(text, limit) {
      this.build();
      const t = this.norm(text);
      const saysRaw = /生重|生的|干重|干的/.test(text || '');
      const found = new Map();
      this.entries.forEach(e => {
        if (!saysRaw && /\((生|干)\)$/.test(e.name)) return;
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

  // ---------------------------------------------------------------------------
  // 用户记住的食物：[{name, amount, grams, calories, proteinG, carbsG, fatG}]，一份的量
  // ---------------------------------------------------------------------------
  const CN_NUM = { 半: 0.5, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

  /** 「2个」「两碗」「半份」→ 数量；认不出就当 1 */
  function countOf(amount) {
    const s = String(amount || '').trim();
    const m = s.match(/^(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]) || 1;
    const c = s.match(/^([半一两二三四五六七八九十])/);
    return c ? CN_NUM[c[1]] : 1;
  }

  const MyFoods = {
    norm(s) { return FoodDB.norm(s); },

    match(list, name) {
      const k = this.norm(name);
      return (list || []).find(f => this.norm(f.name) === k) || null;
    },

    /** 这次吃的量是记住的那一份的几倍：有克数按克数，否则按「几个 / 几份」 */
    factor(grams, amount, my) {
      let f = grams > 0 && my.grams > 0 ? grams / my.grams : countOf(amount) / countOf(my.amount);
      if (!Number.isFinite(f) || f <= 0) f = 1;
      return Math.min(10, Math.max(0.1, f));
    },

    line(f) {
      return `${f.name}${f.amount ? ' ' + f.amount : ''}${f.grams ? ` 约${f.grams}g` : ''} ${Math.round(f.calories)}千卡 蛋白${round1(f.proteinG || 0)} 碳水${round1(f.carbsG || 0)} 脂肪${round1(f.fatG || 0)}`;
    },

    /** 大模型给的「记住」条目 → 干净的一份 */
    clean(r) {
      const name = cleanText(r && r.name, 20);
      const kcal = num(r && r.calories);
      if (!name || !(kcal > 0)) return null;
      const grams = num(r.grams);
      return {
        name, amount: cleanText(r.amount, 12) || '1份', grams: grams > 0 ? Math.round(grams) : null,
        calories: Math.round(kcal), proteinG: round1(Math.max(0, num(r.proteinG) || 0)),
        carbsG: round1(Math.max(0, num(r.carbsG) || 0)), fatG: round1(Math.max(0, num(r.fatG) || 0))
      };
    }
  };

  /**
   * 定下一样食物的热量（顺序见文件开头）。
   * 查库时，库里的数和大模型的估算差太多（>2.5 倍）说明大概率匹配错了（比如成分表里的「豆腐花」是干粉），保留估算。
   * @param it  大模型给的一项：{name, amount, grams, whole, source, calories, proteinG, carbsG, fatG}
   * @param myFoods 用户记住的食物
   */
  function groundItem(it, myFoods) {
    const name = cleanText(it && it.name, 20);
    const grams = num(it && it.grams);
    if (!name) return null;
    const amount = cleanText(it.amount, 12);
    const base = { name, grams: grams > 0 ? Math.round(grams) : null };
    if (amount) base.amount = amount;
    if (it.whole === true) base.whole = true;
    const ai = {
      calories: num(it.calories), proteinG: num(it.proteinG), carbsG: num(it.carbsG), fatG: num(it.fatG)
    };
    const vals = (k, p, c, f) => ({ calories: Math.round(k), proteinG: round1(p || 0), carbsG: round1(c || 0), fatG: round1(f || 0) });

    // 1. 用户记住的
    const my = MyFoods.match(Array.isArray(myFoods) ? myFoods : [], name);
    if (my) {
      const f = MyFoods.factor(grams, amount, my);
      return Object.assign(base, { src: '我的' }, vals(my.calories * f, my.proteinG * f, my.carbsG * f, my.fatG * f));
    }
    // 2. 包装上的数（大模型已经按用户念的数算好）
    if (it.source === 'label' && ai.calories > 0) {
      return Object.assign(base, { src: '包装' }, vals(ai.calories, ai.proteinG, ai.carbsG, ai.fatG));
    }
    // 3. 查库：单一食材查整个库；整份的东西只认库里的成品菜条目，不拿原料去算
    const e = grams && grams > 0 ? FoodDB.find(name) : null;
    if (e && (!base.whole || e.src !== 'cfct')) {
      const k = e.k * grams / 100;
      const ratio = ai.calories && ai.calories > 0 ? k / ai.calories : 1;
      if (ratio >= 0.4 && ratio <= 2.5) {
        return Object.assign(base, { src: e.src === 'cfct' ? '成分表' : '菜品库', dbName: e.name },
          vals(k, e.p * grams / 100, e.c * grams / 100, e.f * grams / 100));
      }
    }
    // 4. 大模型的估算
    if (!(ai.calories > 0)) return null;
    return Object.assign(base, { src: '估算' }, vals(ai.calories, ai.proteinG, ai.carbsG, ai.fatG));
  }

  function sumItems(items) {
    return items.reduce((t, x) => ({
      calories: t.calories + x.calories, proteinG: round1(t.proteinG + x.proteinG),
      carbsG: round1(t.carbsG + x.carbsG), fatG: round1(t.fatG + x.fatG)
    }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  }

  Object.assign(TF, { FoodDB, MyFoods, countOf, groundItem, sumItems });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
