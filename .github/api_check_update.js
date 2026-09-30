// 临时：回头补一句只改那一样（包装牛奶、只吃了一个、不算、只吃了一半），用 App 同样的提示词和合并逻辑调真实接口
global.window = global;
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const out = (lvl, t, m) => console.log(`::${lvl} title=${t}::${esc(t + '\n' + m)}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OLD = [
  { name: '鸡蛋', amount: '2个', grams: 100, calories: 139, proteinG: 13.1, carbsG: 2.4, fatG: 8.6, src: '成分表' },
  { name: '鲜牛奶', amount: '200毫升', grams: 200, calories: 128, proteinG: 6.4, carbsG: 9.6, fatG: 7.2, src: '菜品库' },
  { name: '乳清蛋白粉', amount: '30克', grams: 30, calories: 116, proteinG: 23.4, carbsG: 2.6, fatG: 1.2, src: '菜品库' }
];
const rec = { mealType: '早餐', foodSummary: '鸡蛋2个、牛奶200毫升、乳清蛋白粉30克', calories: 383, proteinG: 42.9, carbsG: 12.2, fatG: 17.7, items: OLD };
// 和 pipeline.buildContext 一样的写法
const text = `${rec.mealType} ${rec.foodSummary} ${rec.calories}kcal 蛋白${rec.proteinG} 碳水${rec.carbsG} 脂肪${rec.fatG}` +
  `（${rec.items.map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}${i.grams ? ' ' + i.grams + 'g' : ''} ${i.calories}kcal 蛋白${i.proteinG || 0}`).join('、')}）`;

async function call(label, said, check, myFoods) {
  const ctx = { now: new Date(2026, 8, 30, 9, 10), history: [], dayLabel: '今天 2026-09-30', lastWeight: 61,
    recent: ['杠铃卧推 80kg 4×8（09-28）', '杠铃深蹲 100kg 5×5（09-27）'],
    dayRecords: [{ ref: 'r1', kind: 'meal', id: 'd1', text }], myFoods: myFoods || [] };
  const body = { model, messages: P.buildMessages(said, ctx), temperature: 0.2, stream: false, thinking: { type: 'disabled' } };
  let res, t0, tries = 0;
  for (;;) {
    t0 = Date.now();
    res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.status === 429 && ++tries < 5) { await sleep(30000); continue; }
    break;
  }
  const raw = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) return out('error', `${label} HTTP ${res.status}`, raw.slice(0, 300)), false;
  let r, merged = OLD;
  try {
    r = P.normalize(P.extractJson(P.contentFromResponse(raw)), Object.assign({ said }, ctx));
    const u = r.updates.find(x => x.ref === 'r1');
    if (u && (u.set.items || u.set.removeItems)) merged = TF.mergeItems(OLD, u.set.items, u.set.removeItems);
  } catch (e) { return out('error', label + ' 解析失败', e.message + ' ' + raw.slice(0, 500)), false; }
  const tot = TF.sumItems(merged);
  const show = merged.map(i => `${i.name} ${i.amount || ''} ${i.calories}kcal 蛋白${i.proteinG}[${i.src}]`).join('；');
  let why;
  try { why = check(r, merged, tot); } catch (e) { why = '检查出错 ' + e.message; }
  out(why === true ? 'notice' : 'error', `${label} ${why === true ? 'OK' : 'CHECK: ' + why} (${(ms / 1000).toFixed(1)}s)`,
    `说：${said}\n新增 ${r.meals.length} 条，删除 ${r.deletes.length} 条，改：${JSON.stringify(r.updates.map(u => Object.assign({}, u.set, { items: (u.set.items || []).map(i => i.name + (i.was ? '(原' + i.was + ')' : '') + ' ' + i.calories) }))).slice(0, 600)}\n合并后：${show}\n合计 ${tot.calories}kcal 蛋白${tot.proteinG}\n记住：${JSON.stringify(r.remember)}\nreply：${r.reply}`);
  return why === true;
}
const same = (merged, name) => { const o = OLD.find(i => i.name === name); return merged.includes(o); };
const CASES = [
  ['包装牛奶补一句', '刚才那个牛奶是甜牛奶，包装上写每100毫升290千焦，蛋白质2.8克', (r, m) => {
    if (r.meals.length) return '不该新增一条';
    const milk = m.find(i => /牛奶/.test(i.name));
    if (!milk) return '牛奶没了';
    if (!(milk.calories >= 105 && milk.calories <= 185)) return `牛奶热量 ${milk.calories}`;       // 200ml→116，250ml→173 都算对
    if (!(milk.proteinG >= 5.4 && milk.proteinG <= 7.5)) return `牛奶蛋白 ${milk.proteinG}`;
    return (same(m, '鸡蛋') && same(m, '乳清蛋白粉')) || '别的东西被改了';
  }],
  ['只吃了一个鸡蛋', '鸡蛋其实只吃了一个', (r, m) => {
    const egg = m.find(i => /蛋/.test(i.name) && !/蛋白粉/.test(i.name));
    if (!egg || !(egg.calories >= 60 && egg.calories <= 80)) return '鸡蛋：' + JSON.stringify(egg);
    return (same(m, '鲜牛奶') && same(m, '乳清蛋白粉') && m.length === 3) || '别的东西被改了';
  }],
  ['蛋白粉不算', '早上那个蛋白粉不算，没喝', (r, m) => {
    if (m.some(i => /蛋白粉/.test(i.name))) return '蛋白粉还在';
    return (same(m, '鸡蛋') && same(m, '鲜牛奶')) || '别的东西被改了';
  }],
  ['只吃了一半', '早饭只吃了一半', (r, m, t) => (t.calories >= 170 && t.calories <= 215 && m.length === 3) || `合计 ${t.calories}，${m.length} 样`]
];
(async () => {
  const rs = [];
  for (let k = 0; k < 2; k++) for (const [label, said, check] of CASES) { await sleep(15000); rs.push(await call(`${label} #${k + 1}`, said, check)); }
  // 记住之后再说：用记住的甜牛奶
  await sleep(15000);
  rs.push(await call('用记住的甜牛奶', '中午又喝了一盒甜牛奶', (r) => {
    const it = r.meals.flatMap(m => m.items)[0];
    return (it && it.src === '我的' && it.calories === 173) || '结果：' + JSON.stringify(it);
  }, [{ name: '甜牛奶', amount: '250毫升', grams: 250, calories: 173, proteinG: 7, carbsG: 22, fatG: 5.5 }]));
  out('notice', '通过', `${rs.filter(Boolean).length}/${rs.length}`);
  process.exit(0);
})();
