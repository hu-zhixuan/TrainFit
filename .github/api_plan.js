// 临时：v4.1 计划（定明天食谱 → 改一改 → 照计划吃了），用 App 同样的提示词、流式调真实 Atria（不打印 key）
global.window = global;
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const note = (t, m) => console.log(`::notice title=${t}::${esc(t + '\n' + m)}`);
const err = (t, m) => console.log(`::error title=${t}::${esc(t + '\n' + m)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PLAN_TEXT = ['早餐 燕麦50g、鸡蛋2个、牛奶1杯 490kcal 蛋白28', '午餐 米饭1碗半、鸡胸肉200g、青菜 610kcal 蛋白59',
  '加餐/补剂 乳清蛋白1勺、香蕉1根 210kcal 蛋白25', '晚餐 米饭1碗、牛肉150g、西兰花 560kcal 蛋白40', '训练 杠铃深蹲 100kg 5组×5次'];
const TIMES = [], FIRST = [], FAILED = [];
async function call(label, text, hhmm, check, ctxExtra) {
  const [h, mi] = hhmm.split(':').map(Number);
  const now = new Date(2026, 8, 29, h, mi);
  const ctx = { now, history: [], dayRecords: [], dayLabel: '今天 2026-09-29', lastWeight: 61,
    recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）', '哑铃推举 22kg 3×10（09-26）', '传统硬拉 120kg 3×5（09-25）'],
    day: { goal: 'muscle_gain', budget: 2600, burn: 0, intake: 1500, protein: 90, proteinTarget: 130 },
    myFoods: [{ name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
  if (ctxExtra) Object.assign(ctx, ctxExtra);
  const body = { model, messages: P.buildMessages(text, ctx), temperature: 0.2, stream: true, thinking: { type: 'disabled' } };
  let res, t0, tries = 0;
  for (;;) {
    t0 = Date.now();
    res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.status === 429 && ++tries < 5) { await sleep(30000); continue; }
    break;
  }
  if (!res.ok) { err(`${label} HTTP ${res.status}`, (await res.text()).slice(0, 400)); return false; }
  // 和 OpenAiApi.chatStream 一样读 SSE；和 pipeline 一样用 partialAnswer 看回答第几秒开始出字
  let content = '', buf = '', first = 0, sawAnswer = '';
  const type = res.headers.get('content-type') || '';
  if (!type.includes('event-stream')) content = P.contentFromResponse(await res.text());
  else {
    const dec = new TextDecoder(); const reader = res.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try { const piece = JSON.parse(data).choices[0].delta.content; if (piece) content += piece; } catch (_) {}
        const a = TF.partialAnswer(content);
        if (a && !first) first = Date.now() - t0;
        if (a) sawAnswer = a;
      }
    }
  }
  const ms = Date.now() - t0;
  TIMES.push(ms); if (first) FIRST.push(first);
  let r;
  try { r = P.normalize(P.extractJson(content), Object.assign({ said: text }, ctx)); }
  catch (e) { err(label + ' 解析失败', e.message + ' ' + content.slice(0, 800)); return false; }
  const meals = r.meals.map(m => `【${m.mealType}】${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG}`);
  const plan = r.plan ? `plan dayOffset=${r.plan.dayOffset}\n` + r.plan.meals.map(m => `  【${m.mealType}】${m.foodSummary} ${m.calories}kcal 蛋白${m.proteinG}：` + (m.items || []).map(i => `${i.name}${i.amount || ''} ${i.calories}/${i.proteinG}[${i.src}]`).join('、')).concat(r.plan.workouts.map(w => `  【训练】${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : w.weightKg + 'kg ' + w.sets + '×' + w.reps}`)).join('\n') : 'plan null';
  let why;
  try { why = check(r); } catch (e) { why = '检查出错 ' + e.message; }
  (why === true ? note : err)(`${label} ${why === true ? 'OK' : 'CHECK: ' + why} (回答第 ${(first / 1000).toFixed(1)}s 开始出字，共 ${(ms / 1000).toFixed(1)}s)`,
    `${hhmm} 说：${text}\n记录：${meals.join('；') || '无'}\ndonePlans=${JSON.stringify(r.donePlans)}\n${plan}\nanswer：${String(r.answer || '').replace(/\n/g, ' ｜ ')}\n流式中途看到：${sawAnswer.slice(0, 60).replace(/\n/g, ' ｜ ')}\nreply：${r.reply}`);
  return why === true;
}

const kc = (ms) => ms.reduce((a, m) => a + (m.calories || 0), 0);
const pr = (ms) => ms.reduce((a, m) => a + (m.proteinG || 0), 0);
const names = (ms) => ms.map(m => m.foodSummary + ',' + (m.items || []).map(i => i.name).join(',')).join(';');
const CASES = [
  ['定明天食谱', '给我定一下明天的食谱，训练强度大，碳水多点', '21:00', r => {
    if (r.meals.length || r.workouts.length) return '不该记';
    if (!r.plan) return '没有 plan';
    if (r.plan.dayOffset !== 1) return 'dayOffset ' + r.plan.dayOffset;
    if (r.plan.meals.length < 3) return '餐太少 ' + r.plan.meals.length;
    const k = kc(r.plan.meals), p = pr(r.plan.meals);
    if (k < 1800 || k > 3600) return '热量 ' + k;
    if (p < 90) return '蛋白 ' + p;
    return (r.answer || '').split('\n').length >= 3 || '回答太短';
  }],
  ['改计划：不要米饭换红薯', '不要米饭，换成红薯', '21:02', r => {
    if (r.meals.length || r.workouts.length) return '不该记';
    if (!r.plan || r.plan.meals.length < 3) return '没给新的 plan';
    if (/米饭/.test(names(r.plan.meals))) return '还有米饭：' + names(r.plan.meals);
    return /红薯/.test(names(r.plan.meals)) || '没有红薯';
  }, { lastPlan: PLAN_TEXT.join('\n') }],
  ['照计划吃了早餐', '早餐照计划吃了', '08:30', r => {
    if (r.plan) return '不该给 plan';
    if (r.meals.length !== 1 || r.meals[0].mealType !== '早餐') return '记录：' + r.meals.map(m => m.mealType).join(',');
    if (!/燕麦/.test(names(r.meals)) || !/鸡蛋/.test(names(r.meals))) return '内容：' + names(r.meals);
    return JSON.stringify(r.donePlans) === '["p1"]' || 'donePlans ' + JSON.stringify(r.donePlans);
  }, { day: { goal: 'muscle_gain', budget: 2600, burn: 0, intake: 0, protein: 0, proteinTarget: 130 }, plans: PLAN_TEXT.map((t, i) => ({ ref: 'p' + (i + 1), text: t })) }],
  ['明天练什么', '明天练什么好', '21:00', r => {
    if (r.meals.length || r.workouts.length) return '不该记';
    if (!r.plan || r.plan.dayOffset !== 1) return 'plan ' + JSON.stringify(r.plan && r.plan.dayOffset);
    return r.plan.workouts.length >= 2 || '动作太少 ' + r.plan.workouts.length;
  }],
  ['还差多少蛋白（不给 plan）', '今天还差多少蛋白质', '19:00', r => (!r.meals.length && !r.plan && /40/.test(r.answer || '')) || 'plan=' + !!r.plan + ' answer=' + r.answer],
  ['照常记录（不给 plan）', '中午吃了一碗牛肉面', '12:40', r => (r.meals.length === 1 && !r.plan && !r.answer) || 'plan=' + !!r.plan + ' meals=' + r.meals.length]
];

(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const rounds = Number(process.env.ROUNDS || 1);
  const rs = [];
  for (let k = 0; k < rounds; k++) {
    for (const [label, text, hhmm, check, extra] of CASES) {
      if (only.length && !only.includes(label)) continue;
      await sleep(Number(process.env.GAP || 15000));
      const ok = await call(rounds > 1 ? `${label} #${k + 1}` : label, text, hhmm, check, extra);
      rs.push(ok);
      if (!ok) FAILED.push(label);
    }
  }
  const q = (arr, f) => { const t = arr.slice().sort((a, b) => a - b); return t.length ? (t[Math.min(t.length - 1, Math.floor(t.length * f))] / 1000).toFixed(1) + 's' : '-'; };
  note('汇总', `通过 ${rs.filter(Boolean).length}/${rs.length} · 回答开始出字中位 ${q(FIRST, 0.5)}、最慢 ${q(FIRST, 0.999)} · 整个中位 ${q(TIMES, 0.5)}、最慢 ${q(TIMES, 0.999)}\n没过：${FAILED.join('、') || '无'}`);
  process.exit(0);
})();
