/**
 * 今天页的「健康度温度计」：把蛋白质、脂肪、热量赤字（再加上补剂）合成一个状态——不健康 / 还行 / 健康 / 非常健康。
 * 只做算分，不碰界面（画法在 today.js 的 renderThermo）。
 *
 * 三项各打 0～1 分，再加权几何平均（有一项很差就拉不高，不会被别的项补回来）：
 *  · 热量（权重 .45）：吃的和「预算」（全天消耗 − 目标赤字）比。吃超 5% 以内算满分，超 30% 就是 0；
 *    吃太少（低于预算 85%）扣分，低于 50% 是 0——但一天没过完不判「吃少了」，从 15 点到 21 点逐渐判。
 *  · 蛋白质（.30）：按吃了多少饭来算份额——吃到预算的一半，就该有一半的蛋白质目标。多了不扣。
 *  · 脂肪（.25）：占热量 20%～35% 满分，往低往高都扣（低于 10% 或高于 47% 是 0）。
 *  · 补剂：吃了维生素、鱼油、钙镁锌这些，每补到一种营养素加 3 分，最多加 8 分（没吃不扣分）；
 *    某种营养素超过每天可耐受最高摄入量（见 log/helpers.js 的 NUTRIENTS），按超了几倍扣分（权重 .30 进几何平均），不加分。
 * 总分 0～100：<40 不健康，<65 还行，<85 健康，≥85 非常健康。
 */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && typeof require === 'function') require('../log/helpers.js');
  const TF = root.TF = root.TF || {};

  const LEVELS = ['不健康', '还行', '健康', '非常健康'];
  const CUTS = [40, 65, 85]; // 分档线
  const WEIGHTS = { energy: 0.45, protein: 0.30, fat: 0.25, supp: 0.30 };
  const SUPP_BONUS = 3, SUPP_BONUS_MAX = 8;
  const MIN_KCAL = 150; // 吃得太少（比如只记了一杯咖啡）没法判断

  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  /** 总分 → 温度计里水银的高度（0～1）：四档各占四分之一，档线正好在刻度上 */
  function position(score) {
    const edges = [0, ...CUTS, 100];
    let i = 0;
    while (i < 3 && score >= edges[i + 1]) i++;
    return (i + (score - edges[i]) / (edges[i + 1] - edges[i])) / 4;
  }

  /**
   * @param {{intake:number, protein:number, fat:number, budget:number, targetProteinG:number, hour?:number|null,
   *          supps?:string[], nutrients?:Object}} d  supps：今天吃的补剂名字；nutrients：补剂合计的营养素
   *   hour：现在几点（可以带小数）；看以前的日子就传 null（一天已经过完）
   */
  function evaluate(d) {
    const intake = d.intake || 0;
    const budget = d.budget || 0;
    if (!(budget > 0) || intake < MIN_KCAL) return { hasData: false, level: -1, name: '', score: 0, pos: 0, parts: null };

    // 热量：超预算按全天算；吃少了只在一天快过完时才判
    const ra = intake / budget;
    const over = ra <= 1.05 ? 1 : clamp01(1 - (ra - 1.05) / 0.25);
    const under = clamp01((ra - 0.5) / 0.35);
    const dayDone = d.hour == null ? 1 : clamp01((d.hour - 15) / 6);
    const underNow = 1 - dayDone * (1 - under);
    const energy = Math.min(over, underNow);

    // 蛋白质：吃到现在该有多少
    const expected = (d.targetProteinG || 0) * Math.min(1, ra);
    const protein = expected > 0 ? clamp01((d.protein || 0) / expected) : 1;

    // 脂肪：占热量的比例（没有脂肪数据就不算这一项）
    const hasFat = (d.fat || 0) > 0;
    const share = hasFat ? (d.fat * 9) / intake : null;
    const fat = !hasFat ? null : share < 0.2 ? clamp01((share - 0.1) / 0.1) : share <= 0.35 ? 1 : clamp01(1 - (share - 0.35) / 0.12);

    // 补剂：超过上限的营养素，按最多超了几倍扣分
    const N = TF.NUTRIENTS || {};
    const nut = d.nutrients || {};
    const overUl = Object.keys(nut).filter(k => N[k] && nut[k] > N[k].ul)
      .map(k => ({ name: k, amount: nut[k], ul: N[k].ul, unit: N[k].unit })).sort((a, b) => b.amount / b.ul - a.amount / a.ul);
    const supp = overUl.length ? clamp01(Math.max(0.2, overUl[0].ul / overUl[0].amount)) : null;
    const bonus = overUl.length ? 0 : Math.min(SUPP_BONUS_MAX, SUPP_BONUS * Object.keys(nut).filter(k => N[k]).length);

    const parts = { energy, protein, fat, supp };
    let logSum = 0, wSum = 0;
    Object.keys(WEIGHTS).forEach(k => {
      if (parts[k] == null) return;
      logSum += WEIGHTS[k] * Math.log(Math.max(0.05, parts[k]));
      wSum += WEIGHTS[k];
    });
    const score = Math.min(100, Math.round(100 * Math.exp(logSum / wSum)) + bonus);
    const level = score < CUTS[0] ? 0 : score < CUTS[1] ? 1 : score < CUTS[2] ? 2 : 3;

    return {
      hasData: true, level, name: LEVELS[level], score, pos: position(score), parts,
      detail: {
        protein: d.protein || 0, proteinExpected: expected, fatShare: share,
        supps: d.supps || [], bonus, overUl,
        // 热量哪边出的问题：吃超了还是吃少了
        energyIssue: energy >= 0.85 ? '' : over < underNow ? 'over' : 'under'
      }
    };
  }

  Object.assign(TF, { HealthGauge: { evaluate, position, LEVELS } });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
