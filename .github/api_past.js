// 临时：v4.7 问以前的事（带最近两周）。口语识别（分餐次、改口、口头禅、昨晚…），用 App 同样的提示词和整理逻辑调真实接口（不打印 key）
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
  if (!res.ok) { err(`${label} HTTP ${res.status}`, raw.slice(0, 400)); return false; }
  let r;
  let fallback = '';
  try {
    const parsed = P.extractJson(P.contentFromResponse(raw));
    r = P.normalize(parsed, Object.assign({ said: text }, ctx));
    const r0 = P.normalize(parsed, ctx);
    if (r0.meals.length !== r.meals.length) fallback = '（大模型没分开，兜底拆开了）';
  } catch (e) { err(label + ' 解析失败', e.message + ' ' + raw.slice(0, 600)); return false; }
  const meals = r.meals.map(m => `【${m.mealType}】${m.foodSummary} ${m.calories}kcal：` + (m.items || []).map(i => `${i.name} ${i.amount || ''} ${i.grams || ''}g ${i.calories}kcal 蛋白${i.proteinG}[${i.src}]${i.nutrients ? JSON.stringify(i.nutrients) : ''}${i.opts ? ' 选项' + JSON.stringify(i.opts.map(o => o.label + '=' + o.grams + 'g')) : ''}`).join('；'));
  const wos = r.workouts.map(w => `【训练】${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : w.weightKg + 'kg ' + w.sets + '×' + w.reps}`);
  let why;
  try { why = check(r); } catch (e) { why = '检查出错 ' + e.message; }
  (why === true ? note : err)(`[${TAG}] ${label} ${why === true ? 'OK' : 'CHECK: ' + why} (${(ms / 1000).toFixed(1)}s)`,
    `${hhmm} 说：${text}${fallback}%0AdayOffset=${r.dayOffset}%0A${meals.concat(wos).join('%0A')}%0Aanswer：${String(r.answer || '').replace(/\n/g, ' ｜ ')}%0Aupdates：${JSON.stringify(r.updates).slice(0, 400)}%0A记住：${JSON.stringify(r.remember)}%0A小本本：+${JSON.stringify(r.memo)} -${JSON.stringify(r.forget)}%0Aplan：${r.plan ? JSON.stringify({ d: r.plan.dayOffset, w: (r.plan.days || [r.plan]).map(d => d.dayOffset + ':' + d.workouts.map(w => w.exerciseName + ' ' + w.weightKg + 'kg ' + w.sets + '×' + w.reps + (w.tip ? '「' + w.tip + '」' : '')).join('，')) }) : 'null'}%0Areply：${r.reply}`);
  return why === true;
}

const types = (r) => r.meals.map(m => m.mealType.replace('/补剂', '')).join(',');
const itemNames = (m) => (m.items || []).map(i => i.name).join(',') + ',' + m.foodSummary;

// 2026-09-29（周二）往前两周：练了 5 天（上周 9/22-9/28 练了 3 天：9/22、9/24、9/27），9/26 吃得最多（2650），体重 62.4 → 61.3
const PAST = ['09-16周二 吃1900 蛋白110 练:杠铃卧推77.5kg 体重62.4', '09-18周四 吃2050 蛋白95 练:杠铃深蹲95kg', '09-20周六 吃2300 蛋白88',
  '09-22周一 吃1800 蛋白120 练:杠铃卧推80kg、哑铃推举20kg 体重62.0', '09-23周二 吃2100 蛋白100', '09-24周三 吃1950 蛋白105 练:杠铃深蹲100kg',
  '09-25周四 吃1700 蛋白90 体重61.7', '09-26周五 吃2650 蛋白80', '09-27周六 吃1900 蛋白125 练:传统硬拉120kg、引体向上', '09-28周日 吃2000 蛋白115 体重61.3'];
const ASK = { past: PAST, ask: true, date: '2026-09-29' };
const CASES = [
  ['上周练了几次', '上周练了几次？', '21:00', r => (!r.meals.length && !r.workouts.length && /3\s*(次|天)/.test(r.answer || '')) || '回答：' + r.answer, ASK],
  ['哪天吃得最多', '最近两周我哪天吃得最多？', '21:00', r => (/9月26|09-26|26日|26号|周五/.test(r.answer || '') && /2650/.test(r.answer || '')) || '回答：' + r.answer, ASK],
  ['体重变化', '这两周体重怎么样？', '21:00', r => (/62\.4/.test(r.answer || '') && /61\.3/.test(r.answer || '')) || '回答：' + r.answer, ASK],
  ['蛋白够不够（带两周）', '我最近蛋白够不够？', '21:00', r => (r.answer || '').length > 10 || '回答：' + r.answer, ASK],
  ['记录不受影响', '中午吃了一碗牛肉面', '12:40', r => (r.meals.length === 1 && !r.answer) || '结果：' + JSON.stringify(r.meals.map(m => m.foodSummary))]
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
  note(`[${TAG}] 汇总`, `通过 ${rs.filter(Boolean).length}/${rs.length} · 耗时中位 ${q(0.5)} · 九成以内 ${q(0.9)} · 最慢 ${q(0.999)}%0A没过：${FAILED.join('、') || '无'}`);
  process.exit(0);
})();
