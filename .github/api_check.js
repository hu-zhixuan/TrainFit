// 临时：口语识别（分餐次、改口、口头禅、昨晚…），用 App 同样的提示词和整理逻辑调真实接口（不打印 key）
global.window = global;
const OLD = process.env.PARSER === 'old';
const TF = require(OLD ? './old/web/js/log/parser.js' : '../web/js/log/parser.js');
const TAG = OLD ? '旧' : '新';
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const note = (t, m) => console.log(`::notice title=${t}::${esc(t + '\n' + m)}`);
const err = (t, m) => console.log(`::error title=${t}::${esc(t + '\n' + m)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function call(label, text, hhmm, check) {
  const [h, mi] = hhmm.split(':').map(Number);
  const now = new Date(2026, 8, 29, h, mi); // 本地时间（workflow 里 TZ=Asia/Shanghai）
  // 像一个在健身的老用户：有最近成绩、记住的食物、体重（手机上的提示词比空白上下文长得多）
  const ctx = { now, history: [], dayRecords: [], dayLabel: '今天 2026-09-29', lastWeight: 61,
    recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）', '哑铃推举 22kg 3×10（09-26）', '传统硬拉 120kg 3×5（09-25）', '跑步机 30分钟（09-24）'],
    myFoods: [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 10, carbsG: 50, fatG: 11 }, { name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] };
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
    `${hhmm} 说：${text}${fallback}%0AdayOffset=${r.dayOffset}%0A${meals.concat(wos).join('%0A')}%0A记住：${JSON.stringify(r.remember)}%0Areply：${r.reply}`);
  return why === true;
}

const types = (r) => r.meals.map(m => m.mealType.replace('/补剂', '')).join(',');
const itemNames = (m) => (m.items || []).map(i => i.name).join(',') + ',' + m.foodSummary;

const CASES = [
  // ---- 包装零食（用户反馈卡在「正在整理」） ----
  ['奥利奥：无糖三块', '无糖奥利奥三块', '07:20', r => (r.meals.length === 1 && /奥利奥/.test(itemNames(r.meals[0])) && r.meals[0].calories >= 90 && r.meals[0].calories <= 260) || '结果：' + allItems(r) + ' reply=' + r.reply],
  ['奥利奥：吃了两块', '刚吃了两块奥利奥', '15:30', r => (r.meals.length === 1 && /奥利奥/.test(itemNames(r.meals[0])) && r.meals[0].calories >= 60 && r.meals[0].calories <= 200) || '结果：' + allItems(r) + ' reply=' + r.reply],

  // ---- 补剂、零热量 ----
  ['补剂：鱼油+维D', '早上吃了两粒鱼油一片维生素D', '08:30', r => {
    const sup = r.meals.flatMap(m => (m.items || []).filter(i => i.supp));
    const n = sumN(sup);
    if (sup.length < 2) return '补剂没记全：' + allItems(r);
    if (!r.meals.filter(m => m.items.some(i => i.supp)).every(m => m.mealType === '加餐/补剂')) return '补剂没放进补剂那条';
    return (n['EPA+DHA'] > 0 && n['维生素D'] > 0) || '营养素缺：' + JSON.stringify(n);
  }],
  ['补剂：锌镁钙', '吃了一片锌一片镁还有一片钙片', '21:00', r => {
    const n = sumN(r.meals.flatMap(m => m.items || []));
    return (n['锌'] > 0 && n['镁'] > 0 && n['钙'] > 0 && n['锌'] <= 50) || '营养素：' + JSON.stringify(n);
  }],
  ['饭+复合维生素', '早上两个包子，然后吃了颗复合维生素', '09:00', r => {
    const food = r.meals.find(m => /包子/.test(m.foodSummary));
    const sup = r.meals.find(m => m.items.some(i => i.supp));
    if (!food || !sup) return '结果：' + allItems(r);
    if (food.items.some(i => i.supp)) return '补剂混在早餐里';
    return Object.keys(sumN(sup.items)).length >= 3 || '复合维生素营养素太少：' + JSON.stringify(sumN(sup.items));
  }],
  ['零热量：水', '喝了一瓶矿泉水', '15:00', r => (r.meals.length === 1 && r.meals[0].calories <= 5) || '结果：' + allItems(r)],
  ['零热量：美式', '刚喝了一杯美式', '10:00', r => (r.meals.length === 1 && r.meals[0].calories <= 25) || '结果：' + allItems(r)],
  ['药', '吃了一片布洛芬', '14:00', r => (r.meals.length === 1 && r.meals[0].calories <= 5) || '结果：' + allItems(r)],
  ['记住补剂', '记住，我的鱼油一粒含EPA加DHA 700毫克', '10:00', r => {
    if (r.meals.length) return '不该新增饮食';
    const f = r.remember[0];
    return (f && f.nutrients && f.nutrients['EPA+DHA'] === 700) || '记住的：' + JSON.stringify(r.remember);
  }],
  // ---- 蛋白质 ----
  ['蛋白：鸡胸200g+米饭', '中午吃了鸡胸肉200克，一碗米饭', '12:30', r => inR('蛋白', protein(r), 48, 62)],
  ['蛋白：两勺蛋白粉', '练完喝了两勺蛋白粉', '20:00', r => inR('蛋白', protein(r), 42, 52)],
  ['蛋白：三蛋一奶', '早上三个鸡蛋一杯牛奶', '08:00', r => inR('蛋白', protein(r), 24, 32)],
  ['蛋白：虾仁炒蛋饭', '中午一份虾仁炒蛋和一碗米饭', '12:30', r => inR('蛋白', protein(r), 22, 48)],
  ['蛋白：一块煎鸡胸', '晚上吃了一块煎鸡胸肉', '19:00', r => inR('蛋白', protein(r), 28, 55)],
  ['蛋白：即食鸡胸', '下午吃了一包即食鸡胸肉', '16:00', r => inR('蛋白', protein(r), 18, 40)],
  // ---- 回归 ----
  ['原话：早上+晚上', '今天早上吃了一份呃荷叶鸡然后有一小份然后两个茶叶大晚上吃了两个香蕉两勺蛋白粉，七百毫升牛奶', '21:22', r => {
    const b = r.meals.filter(m => m.mealType === '早餐');
    const rest = r.meals.filter(m => m.mealType !== '早餐');
    if (!b.length || !rest.length) return '没分开：' + types(r);
    if (b.some(m => /香蕉|牛奶|蛋白粉/.test(itemNames(m)))) return '晚上的东西记到早餐了';
    if (!b.some(m => /茶叶蛋|鸡蛋/.test(itemNames(m)))) return '漏了茶叶蛋';
    return inR('晚上那餐蛋白', rest.reduce((a, m) => a + m.proteinG, 0), 60, 80);
  }],
  ['糯米鸡+水煮蛋', '中午吃了一个糯米鸡，两个水煮蛋', '12:30', r => inR('热量', r.meals.reduce((a, m) => a + m.calories, 0), 380, 700)],
  ['份量补充', '中午吃了一碗牛肉面嗯是小碗的', '12:40', r => {
    const items = r.meals.flatMap(m => m.items || []);
    return (items.length === 1 && /面/.test(items[0].name)) || '记成了 ' + allItems(r);
  }],
  ['吃练混说', '早上跑了五公里然后吃了两个鸡蛋一杯牛奶，晚上卧推八十公斤四组八个', '21:00', r => {
    if (types(r) !== '早餐') return '餐次是 ' + types(r);
    const bench = r.workouts.find(w => /卧推/.test(w.exerciseName));
    return (bench && bench.weightKg === 80 && bench.sets === 4 && bench.reps === 8) || '卧推不对';
  }]
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
    for (const [label, text, hhmm, check] of CASES) {
      if (only.length && !only.includes(label)) continue;
      if (skip.includes(label)) continue;
      await sleep(15000);
      rs.push(await call(rounds > 1 ? `${label} #${k + 1}` : label, text, hhmm, check));
    }
  }
  note(`[${TAG}] ${process.env.ONLY ? '分餐' : '其他'} 通过`, `${rs.filter(Boolean).length}/${rs.length}`);
  process.exit(0);
})();
