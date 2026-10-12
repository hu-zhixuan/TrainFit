// 热量准不准：同一批常见说法，主线路（Atria）和备用（DeepSeek）各跑几遍，看校准后记上的热量 / 蛋白在不在合理范围
// 本地：BK=备用key node api_food.js；CI：LLM_API_KEY / LLM_BACKUP_API_KEY
const path = require('path');
const R = process.env.ROOT || path.resolve(__dirname, '..') + '/';
global.window = global;
require(R + 'web/js/data/food_db.js');
const TF = require(R + 'web/js/log/parser.js');
const P = TF.Parser;
const first = (v) => String(v || '').split('\n').map(x => x.trim()).find(Boolean) || '';
const LINES = {
  main: { key: first(process.env.LLM_API_KEY), base: first(process.env.LLM_BASE_URL) || 'https://api.atria-asi.ai/v1', model: first(process.env.LLM_MODEL) || 'Atria-Dawn-Preview' },
  backup: { key: first(process.env.LLM_BACKUP_API_KEY || process.env.BK), base: 'https://discovery-api.intern-ai.org.cn/v1', model: 'deepseek-v4-flash-0731' }
};
const DATE = '2026-10-13';
const ctx = { now: new Date(DATE + 'T12:30:00'), history: [], dayRecords: [], dayLabel: '今天 ' + DATE, date: DATE, lastWeight: 74, myFoods: [], plans: [], lastPlan: '', planBook: [], past: [], memo: [], portrait: [],
  recent: ['杠铃卧推 80kg 4×7（10-09）'], day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 600, protein: 40, proteinTarget: 140 } };
// [说的话, 热量范围, 蛋白范围]（整句加起来）
const CASES = [
  ['吃了70克薄脆鸡胸肉', [220, 360], [18, 40]],
  ['一个鸭屯30克', [22, 55], [4, 8]],
  ['牛肉干50克', [190, 290], [17, 28]],
  ['一个肉松面包', [230, 420], [6, 14]],
  ['两根鸡肉肠', [100, 240], [10, 22]],
  ['一个炸鸡腿', [230, 450], [16, 32]],
  ['中午一碗兰州牛肉面加一个卤蛋', [520, 900], [22, 45]],
  ['两个茶叶蛋', [130, 180], [11, 16]],
  ['鸡胸肉150克', [160, 210], [33, 40]],
  ['一碗米饭，一份番茄炒蛋', [380, 650], [12, 24]],
  ['麦当劳巨无霸一个', [480, 600], [22, 32]],
  ['一杯星巴克中杯拿铁', [140, 240], [7, 13]],
  ['一根香蕉', [80, 130], [1, 2]],
  ['一勺乳清蛋白粉', [100, 140], [20, 27]],
  ['250毫升全脂牛奶', [140, 175], [7, 9]],
  ['一份黄焖鸡米饭', [650, 1100], [30, 60]]
];
async function call(line, msgs) {
  const L = LINES[line];
  const t0 = Date.now();
  const r = await fetch(L.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + L.key },
    body: JSON.stringify({ model: L.model, messages: msgs, temperature: 0.2, stream: false, thinking: { type: 'disabled' } }) });
  const txt = await r.text();
  if (!r.ok) return { err: 'HTTP ' + r.status + ' ' + txt.slice(0, 120), ms: Date.now() - t0 };
  try { return { out: JSON.parse(txt).choices[0].message.content, ms: Date.now() - t0 }; } catch (e) { return { err: 'parse', ms: Date.now() - t0 }; }
}
const ann = (lvl, msg) => console.log(process.env.CI ? `::${lvl}::${msg.replace(/\n/g, ' ')}` : msg);
(async () => {
  const lines = (process.env.LINES_TO_TEST || 'main,backup').split(',').filter(l => LINES[l].key);
  const rounds = +(process.env.ROUNDS || 2), gap = +(process.env.GAP || 8000);
  const score = {};
  lines.forEach(l => { score[l] = { pass: 0, n: 0, ms: [] }; });
  for (let k = 0; k < rounds; k++) for (const [text, kr, pr] of CASES) {
    const res = await Promise.all(lines.map(async l => {
      const r = await call(l, P.buildMessages(text, ctx));
      if (r.err) return { l, err: r.err, ms: r.ms };
      let n; try { n = P.normalize(P.extractJson(r.out), Object.assign({ said: text }, ctx)); } catch (e) { return { l, err: e.message, ms: r.ms }; }
      const kcal = n.meals.reduce((t, m) => t + m.calories, 0), prot = n.meals.reduce((t, m) => t + (m.proteinG || 0), 0);
      const items = [].concat(...n.meals.map(m => (m.items || []).map(i => `${i.name}${i.grams ? i.grams + 'g' : ''}=${i.calories}/${i.proteinG}[${i.src}]`))).join('、');
      return { l, kcal, prot, items, ms: r.ms, ok: kcal >= kr[0] && kcal <= kr[1] && prot >= pr[0] && prot <= pr[1] };
    }));
    res.forEach(x => {
      const s = score[x.l]; s.n++; s.ms.push(x.ms); if (x.ok) s.pass++;
      ann(x.ok ? 'notice' : 'warning', `${x.l} ${x.ok ? 'PASS' : 'FAIL'} 「${text}」→ ${x.err || `${Math.round(x.kcal)}kcal 蛋白${Math.round(x.prot)}（期望 ${kr.join('～')} / ${pr.join('～')}）${x.items}`} ${(x.ms / 1000).toFixed(1)}s`);
    });
    await new Promise(r => setTimeout(r, gap));
  }
  lines.forEach(l => { const s = score[l]; s.ms.sort((a, b) => a - b); ann('notice', `总计 ${l}（${LINES[l].model}）：${s.pass}/${s.n}，中位 ${(s.ms[Math.floor(s.ms.length / 2)] / 1000).toFixed(1)} 秒`); });
})();
