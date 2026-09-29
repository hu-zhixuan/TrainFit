// 临时：口语识别（分餐次、改口、口头禅、昨晚…），用 App 同样的提示词和整理逻辑调真实接口（不打印 key）
global.window = global;
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const note = (t, m) => console.log(`::notice title=${t}::${esc(m)}`);
const err = (t, m) => console.log(`::error title=${t}::${esc(m)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function call(label, text, hhmm, check) {
  const [h, mi] = hhmm.split(':').map(Number);
  const now = new Date(2026, 8, 29, h, mi); // 本地时间（workflow 里 TZ=Asia/Shanghai）
  const ctx = { now, history: [], recent: [], dayRecords: [], dayLabel: '今天 2026-09-29', lastWeight: 61, myFoods: [] };
  const body = { model, messages: P.buildMessages(text, ctx), temperature: 0.2, stream: false, thinking: { type: 'disabled' } };
  let res, t0, tries = 0;
  for (;;) {
    t0 = Date.now();
    res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.status === 429 && ++tries < 5) { await sleep(30000); continue; }
    break;
  }
  const raw = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) { err(`${label} HTTP ${res.status}`, raw.slice(0, 400)); return false; }
  let r;
  try { r = P.normalize(P.extractJson(P.contentFromResponse(raw)), ctx); } catch (e) { err(label + ' 解析失败', e.message + ' ' + raw.slice(0, 600)); return false; }
  const meals = r.meals.map(m => `【${m.mealType}】${m.foodSummary} ${m.calories}kcal：` + (m.items || []).map(i => `${i.name} ${i.amount || ''} ${i.grams || ''}g ${i.calories}`).join('；'));
  const wos = r.workouts.map(w => `【训练】${w.exerciseName} ${w.durationMin ? w.durationMin + '分钟' : w.weightKg + 'kg ' + w.sets + '×' + w.reps}`);
  let why;
  try { why = check(r); } catch (e) { why = '检查出错 ' + e.message; }
  (why === true ? note : err)(`${label} ${why === true ? 'OK' : 'CHECK: ' + why} (${(ms / 1000).toFixed(1)}s)`,
    `${hhmm} 说：${text}%0AdayOffset=${r.dayOffset}%0A${meals.concat(wos).join('%0A')}%0Areply：${r.reply}`);
  return why === true;
}

const types = (r) => r.meals.map(m => m.mealType.replace('/补剂', '')).join(',');
const itemNames = (m) => (m.items || []).map(i => i.name).join(',') + ',' + m.foodSummary;

const CASES = [
  ['原话：早上+晚上', '今天早上吃了一份呃荷叶鸡然后有一小份然后两个茶叶大晚上吃了两个香蕉两勺蛋白粉，七百毫升牛奶', '21:22', r => {
    const b = r.meals.filter(m => m.mealType === '早餐');
    const rest = r.meals.filter(m => m.mealType !== '早餐');
    if (!b.length) return '没有早餐：' + types(r);
    if (!rest.length) return '没拆出晚上那一餐：' + types(r);
    if (b.some(m => /香蕉|牛奶|蛋白粉/.test(itemNames(m)))) return '晚上的东西记到早餐了';
    if (!b.some(m => /荷叶鸡/.test(itemNames(m)) && /茶叶蛋|鸡蛋/.test(itemNames(m)))) return '早餐里不是荷叶鸡+茶叶蛋';
    return true;
  }],
  ['早中晚', '早上两个包子一杯豆浆，中午黄焖鸡米饭，晚上没吃', '21:00', r => types(r) === '早餐,午餐' || '餐次是 ' + types(r)],
  ['中午和晚上都', '中午和晚上都吃的黄焖鸡米饭', '21:00', r => (r.meals.length === 2 && /午餐/.test(types(r)) && /晚餐/.test(types(r))) || '餐次是 ' + types(r)],
  ['昨晚', '昨晚吃了火锅，还喝了两瓶啤酒', '09:10', r => r.dayOffset !== -1 ? 'dayOffset=' + r.dayOffset : (r.meals.length && r.meals.every(m => m.mealType === '晚餐')) || '餐次是 ' + types(r)],
  ['改口', '中午吃了两碗米饭，不对，是一碗，还有一份红烧肉', '12:40', r => {
    const rice = r.meals.flatMap(m => m.items || []).find(i => /米饭/.test(i.name));
    if (!rice) return '没有米饭';
    return (rice.grams && rice.grams <= 260) || `米饭 ${rice.amount} ${rice.grams}g，没按改口后的一碗算`;
  }],
  ['口头禅', '呃那个中午就是吃了个嗯麻辣烫然后还有一瓶可乐', '13:00', r => (types(r) === '午餐' && /麻辣烫/.test(itemNames(r.meals[0])) && /可乐/.test(itemNames(r.meals[0]))) || '结果：' + types(r)],
  ['练完+睡前', '练完喝了一勺蛋白粉，睡前又喝了一杯牛奶', '22:30', r => (r.meals.length && r.meals.every(m => m.mealType === '加餐/补剂')) || '餐次是 ' + types(r)],
  ['吃练混说', '早上跑了五公里然后吃了两个鸡蛋一杯牛奶，晚上卧推八十公斤四组八个', '21:00', r => {
    if (types(r) !== '早餐') return '餐次是 ' + types(r);
    const bench = r.workouts.find(w => /卧推/.test(w.exerciseName));
    if (!bench || bench.weightKg !== 80 || bench.sets !== 4 || bench.reps !== 8) return '卧推不对';
    return r.workouts.some(w => /跑/.test(w.exerciseName)) || '没有跑步';
  }],
  ['刚吃', '刚吃了一份猪脚饭', '12:40', r => types(r) === '午餐' || '餐次是 ' + types(r)],
  ['下午茶', '下午喝了杯奶茶吃了块蛋糕', '17:30', r => (r.meals.length && r.meals.every(m => m.mealType === '加餐/补剂')) || '餐次是 ' + types(r)]
];

(async () => {
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  const rounds = Number(process.env.ROUNDS || 1);
  const rs = [];
  for (let k = 0; k < rounds; k++) {
    for (const [label, text, hhmm, check] of CASES) {
      if (only.length && !only.includes(label)) continue;
      await sleep(15000);
      rs.push(await call(rounds > 1 ? `${label} #${k + 1}` : label, text, hhmm, check));
    }
  }
  note(`${process.env.RUN_LABEL || ''} 通过`, `${rs.filter(Boolean).length}/${rs.length}`);
  process.exit(0);
})();
