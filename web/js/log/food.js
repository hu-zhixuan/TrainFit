/**
 * 食物营养库查找 + 按库算热量：大模型只报「吃了什么、多少克」，数值以库为准。
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

  Object.assign(TF, { FoodDB, groundItem, sumItems });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
