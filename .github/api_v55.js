// 临时：v5.5 改小人刚给的计划（「改一改」）。走 App 一样的 Parser.parse（包括没给计划时再问一次），只调 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
let calls = 0;
P.hedgeMs = 0;
P.send = async (body) => {
  calls += 1;
  for (let tries = 0; ; tries++) {
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(Object.assign({ model }, body, { stream: false })), signal: AbortSignal.timeout(120000) });
    if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200));
    return t;
  }
};
const PLAN = ['早餐 燕麦50g、鸡蛋2个、牛奶1杯 490kcal 蛋白28', '午餐 米饭1碗半、鸡胸肉200g、青菜 610kcal 蛋白59',
  '加餐/补剂 乳清蛋白1勺、香蕉1根 210kcal 蛋白25', '晚餐 米饭1碗、牛肉150g、西兰花 560kcal 蛋白40', '训练 杠铃深蹲 100kg 5组×5次'];
const lastPlan = '10月3日的：\n' + PLAN.join('\n'); // 和 App 的 planText 一样
const names = (ms) => ms.map(m => m.foodSummary + ',' + (m.items || []).map(i => i.name).join(',')).join('；');
const sum = (ms, k) => Math.round(ms.reduce((a, m) => a + (m[k] || 0), 0));
const CASES = [
  ['点改一改：不要米饭换红薯', '不要米饭，换成红薯', true, 4, (r) => {
    const ms = (r.plan && r.plan.meals) || [];
    if (ms.length < 3) return '没给新的 plan';
    if (r.plan.dayOffset !== 1) return 'dayOffset=' + r.plan.dayOffset;
    if (/米饭/.test(names(ms))) return '还有米饭：' + names(ms);
    return /红薯/.test(names(ms)) || '没有红薯：' + names(ms);
  }],
  ['点改一改：蛋白再多一点', '蛋白再多一点', true, 2, (r) => {
    const ms = (r.plan && r.plan.meals) || [];
    if (ms.length < 3) return '没给新的 plan';
    return sum(ms, 'proteinG') >= 160 || '蛋白 ' + sum(ms, 'proteinG') + '（原来 152）';
  }],
  ['点改一改：晚上少吃点', '晚上少吃点', true, 2, (r) => {
    const ms = (r.plan && r.plan.meals) || [];
    const d = ms.find(m => m.mealType === '晚餐');
    if (ms.length < 3) return '没给新的 plan';
    return (d && d.calories < 560) || '晚餐 ' + (d && d.calories);
  }],
  ['没点按钮直接说：不要米饭换红薯', '不要米饭，换成红薯', false, 2, (r) => {
    const ms = (r.plan && r.plan.meals) || [];
    if (ms.length < 3) return '没给新的 plan';
    return (!/米饭/.test(names(ms)) && /红薯/.test(names(ms))) || names(ms);
  }]
];
(async () => {
  const lines = [];
  let pass = 0, n = 0;
  for (const [label, text, editPlan, rounds, check] of CASES) {
    for (let k = 0; k < rounds; k++) {
      await sleep(Number(process.env.GAP || 15000));
      const ctx = { now: new Date(2026, 9, 2, 21, 2), history: [], dayRecords: [], dayLabel: '今天 2026-10-02', date: '2026-10-02', lastWeight: 61, ask: true, editPlan, lastPlan,
        recent: ['杠铃卧推 80kg 4×8（10-01）', '杠铃深蹲 100kg 5×5（09-29）'], day: { goal: 'muscle_gain', budget: 2600, burn: 0, intake: 1500, protein: 90, proteinTarget: 130 },
        portrait: ['常吃牛肉面、鸡腿饭', '一周练 3 天左右'], memo: ['健身新手'],
        myFoods: [{ name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
      const c0 = calls, t0 = Date.now();
      let r, why;
      try { r = await P.parse(text, ctx); why = check(r); } catch (e) { why = '出错 ' + e.message; }
      n += 1; if (why === true) pass += 1;
      const ms = (r && r.plan && r.plan.meals) || [];
      const line = `${label} #${k + 1} ${why === true ? 'OK' : '没过：' + why} · 调了 ${calls - c0} 次 · ${((Date.now() - t0) / 1000).toFixed(1)}s · reply「${r ? r.reply : ''}」 · 记录 ${r ? r.meals.length + r.workouts.length : '-'} 条 · plan ${ms.map(m => `${m.mealType} ${m.foodSummary} ${m.calories}/${m.proteinG}`).join('｜')} ${r && r.plan ? (r.plan.workouts || []).map(w => w.exerciseName).join(',') : ''}`;
      console.log(line); lines.push(line);
      if (why !== true) console.log(`::error title=${label} #${k + 1}::${esc(line + '\nanswer：' + (r ? r.answer : ''))}`);
    }
  }
  console.log(`::notice title=v5.5 改计划 汇总::${esc(`通过 ${pass}/${n}\n` + lines.join('\n'))}`);
  process.exit(0);
})();
