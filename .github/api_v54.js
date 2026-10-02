// 临时：v5.4 只写用得上的字段后，体重、按分钟的训练、没说重量的动作还对不对。口语识别（分餐次、改口、口头禅、昨晚…），用 App 同样的提示词和整理逻辑调真实接口（不打印 key）
global.window = global;
const OLD = process.env.PARSER === 'old';
const TF = require(OLD ? './old/web/js/log/parser.js' : '../web/js/log/parser.js');
const TAG = process.env.TAG || (OLD ? '旧' : '新');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const note = (t, m) => console.log(`::notice title=${t}::${esc(t + '\n' + m)}`);
const err = (t, m) => console.log(`::error title=${t}::${esc(t + '\n' + m)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const TIMES = [];
const TOKS = [];
const FAILED = [];
async function call(label, text, hhmm, check, ctxExtra) {
  const [h, mi] = hhmm.split(':').map(Number);
  const now = new Date(2026, 8, 29, h, mi); // 本地时间（workflow 里 TZ=Asia/Shanghai）
  // 像一个在健身的老用户：有最近成绩、记住的食物、体重（手机上的提示词比空白上下文长得多）
  const ctx = { now, history: [], dayRecords: [], dayLabel: '今天 2026-09-29', lastWeight: 61,
    recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）', '哑铃推举 22kg 3×10（09-26）', '传统硬拉 120kg 3×5（09-25）', '跑步机 30分钟（09-24）'],
    day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 1200, protein: 80, proteinTarget: 140 },
    myFoods: [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 10, carbsG: 50, fatG: 11 }, { name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
  if (ctxExtra) Object.assign(ctx, ctxExtra);
  const body = { model, messages: P.buildMessages(text, ctx), temperature: 0.2, stream: false, thinking: { type: 'disabled' } };
  const extra = JSON.parse(process.env.EXTRA || '{}'); // null = 去掉这个参数
  for (const k of Object.keys(extra)) { if (extra[k] === null) delete body[k]; else body[k] = extra[k]; }
  let res, t0, tries = 0;
  for (;;) {
    t0 = Date.now();
    res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.status === 429 && ++tries < 5) { await sleep(30000); continue; }
    break;
  }
  const raw = await res.text();
  const ms = Date.now() - t0;
  TIMES.push(ms);
  try { const u = JSON.parse(raw).usage; if (u && u.completion_tokens) TOKS.push(u.completion_tokens); } catch (e) {}
  if (!res.ok) { err(`${label} HTTP ${res.status}`, raw.slice(0, 400)); return false; }
  let r;
  let fallback = '';
  try {
    const parsed = P.extractJson(P.contentFromResponse(raw));
    r = P.normalize(parsed, Object.assign({ said: text }, ctx));
    const r0 = P.normalize(parsed, ctx);
    if (r0.meals.length !== r.meals.length) fallback = '（大模型没分开，兜底拆开了）';
  } catch (e) { err(label + ' 解析失败', e.message + ' ' + raw.slice(0, 600)); return false; }
  const meals = r.meals.map(m => `【${m.mealType}】${m.foodSummary} ${m.calories}kcal：` + (m.items || []).map(i => `${i.name} ${i.amount || ''} ${i.grams || ''}g ${i.calories}kcal 蛋白${i.proteinG}[${i.src}]${i.nutrients ? JSON.stringify(i.nutrients) : ''}`).join('；'));
  const wos = r.workouts.map(w => `【训练】${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : w.weightKg + 'kg ' + w.sets + '×' + w.reps}`);
  let why;
  try { why = check(r); } catch (e) { why = '检查出错 ' + e.message; }
  (why === true ? note : err)(`[${TAG}] ${label} ${why === true ? 'OK' : 'CHECK: ' + why} (${(ms / 1000).toFixed(1)}s)`,
    `${hhmm} 说：${text}${fallback}%0AdayOffset=${r.dayOffset}%0A${meals.concat(wos).join('%0A')}%0Aanswer：${String(r.answer || '').replace(/\n/g, ' ｜ ')}%0Aupdates：${JSON.stringify(r.updates).slice(0, 400)}%0A记住：${JSON.stringify(r.remember)}%0Areply：${r.reply}`);
  return why === true;
}

const types = (r) => r.meals.map(m => m.mealType.replace('/补剂', '')).join(',');
const itemNames = (m) => (m.items || []).map(i => i.name).join(',') + ',' + m.foodSummary;

const CASES = [
  ['体重+早饭', '早上称了六十一点五公斤，吃了两个鸡蛋一杯牛奶', '07:30', r => {
    if (r.bodyWeight !== 61.5) return 'bodyWeight=' + r.bodyWeight;
    return (r.meals.length === 1 && types(r) === '早餐') || '餐：' + allItems(r);
  }],
  ['斤+午饭', '今天体重124斤，中午吃了一份猪脚饭', '12:40', r => {
    if (r.bodyWeight !== 62) return 'bodyWeight=' + r.bodyWeight;
    return (r.meals.length === 1 && /猪脚/.test(itemNames(r.meals[0]))) || '餐：' + allItems(r);
  }],
  ['跑步分钟+卧推', '跑步机跑了30分钟然后卧推八十公斤四组八个', '20:00', r => {
    const run = r.workouts.find(w => w.durationMin), b = r.workouts.find(w => /卧推/.test(w.exerciseName));
    if (!run || run.durationMin !== 30) return '跑步：' + JSON.stringify(r.workouts);
    return (b && b.weightKg === 80 && b.sets === 4 && b.reps === 8 && !r.meals.length) || '卧推：' + JSON.stringify(r.workouts);
  }],
  ['只说动作（按上次）', '今天练了深蹲', '19:00', r => {
    const s = r.workouts.find(w => /深蹲/.test(w.exerciseName));
    return (s && s.weightKg === 100 && s.estimated === true) || '深蹲：' + JSON.stringify(r.workouts);
  }],
  ['平板支撑', '平板支撑做了三分钟', '21:00', r => (r.workouts.length === 1 && r.workouts[0].durationMin >= 2 && r.workouts[0].durationMin <= 5) || JSON.stringify(r.workouts)],
  ['普通一餐（看输出多长）', '中午吃了一碗牛肉面加个蛋', '12:30', r => (r.meals.length === 1 && r.meals[0].items.length === 2) || allItems(r)]
];
const sumN = (items) => { const n = {}; items.forEach(i => Object.keys(i.nutrients || {}).forEach(k => { n[k] = (n[k] || 0) + i.nutrients[k]; })); return n; };
const allItems = (r) => r.meals.map(m => `【${m.mealType}】` + m.items.map(i => i.name + (i.amount || '')).join('、')).join(' ');
const protein = (r) => Math.round(r.meals.reduce((a, m) => a + (m.proteinG || 0), 0) * 10) / 10;
const inR = (what, v, a, b) => (v >= a && v <= b) || `${what} ${v} 不在 ${a}–${b}`;


(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const skip = (process.env.SKIP || '').split(',').filter(Boolean);
  const rounds = Number(process.env.ROUNDS || 1);
  const rs = [];
  for (let k = 0; k < rounds; k++) {
    for (const [label, text, hhmm, check, extra] of CASES) {
      if (only.length && !only.includes(label)) continue;
      if (skip.includes(label)) continue;
      await sleep(Number(process.env.GAP || 15000));
      const ok = await call(rounds > 1 ? `${label} #${k + 1}` : label, text, hhmm, check, extra);
      rs.push(ok);
      if (!ok) FAILED.push(label);
    }
  }
  const t = TIMES.slice().sort((a, b) => a - b);
  const q = (f) => t.length ? (t[Math.min(t.length - 1, Math.floor(t.length * f))] / 1000).toFixed(1) + 's' : '-';
  const tk = TOKS.slice().sort((a, b) => a - b);
  const tq = (f) => tk.length ? tk[Math.min(tk.length - 1, Math.floor(tk.length * f))] : '-';
  note(`[${TAG}] 汇总`, `通过 ${rs.filter(Boolean).length}/${rs.length} · 耗时中位 ${q(0.5)} · 九成以内 ${q(0.9)} · 最慢 ${q(0.999)} · 输出 token 中位 ${tq(0.5)}（九成以内 ${tq(0.9)}，平均 ${tk.length ? Math.round(tk.reduce((a, b) => a + b, 0) / tk.length) : '-'}）%0A没过：${FAILED.join('、') || '无'}`);
  process.exit(0);
})();
