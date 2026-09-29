// 临时：v2.4 整份估算 / 包装 / 记住的食物，用 App 同样的提示词和整理逻辑调真实接口（不打印 key）
global.window = global;
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3500);
const note = (t, m) => console.log(`::notice title=${t}::${esc(m)}`);
const err = (t, m) => console.log(`::error title=${t}::${esc(m)}`);
async function call(label, text, check, myFoods) {
  const ctx = { now: new Date('2026-09-29T12:30:00+08:00'), history: [], recent: [], dayRecords: [], lastWeight: 61, myFoods: myFoods || [] };
  const body = { model, messages: P.buildMessages(text, ctx), temperature: 0.2, stream: false, thinking: { type: 'disabled' } };
  let res, t0, tries = 0;
  for (;;) {
  t0 = Date.now();
  res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
  if (res.status === 429 && ++tries < 5) { await new Promise(r => setTimeout(r, 30000)); continue; }
  break;
  }
  const raw = await res.text();
  const ms = Date.now() - t0;
  if (!res.ok) { err(`${label} HTTP ${res.status}`, raw.slice(0, 400)); return false; }
  let r;
  try { r = P.normalize(P.extractJson(P.contentFromResponse(raw)), ctx); } catch (e) { err(label + ' 解析失败', e.message + ' ' + raw.slice(0, 600)); return false; }
  const total = r.meals.reduce((a, m) => a + m.calories, 0);
  const items = r.meals.flatMap(m => (m.items || []).map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}${i.grams ? ' ' + i.grams + 'g' : ''} ${i.calories}kcal[${i.src}${i.whole ? ',整份' : ''}]`));
  const why = check(r, total, items.join(' '));
  (why === true ? note : err)(`${label} ${why === true ? 'OK' : 'CHECK: ' + why} (${(ms / 1000).toFixed(1)}s)`,
    `说：${text}%0A合计 ${total} kcal%0A${items.join('%0A')}%0A记住：${r.remember.map(f => f.name + ' ' + f.amount + ' ' + f.calories).join('；') || '无'}%0Areply：${r.reply}`);
  return why === true;
}
const inRange = (t, a, b) => (t >= a && t <= b) || `合计 ${t} 不在 ${a}–${b}`;
(async () => {
  const rs = [];
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('糯米鸡+水煮蛋', '中午吃了一个糯米鸡，两个水煮蛋', (r, t, s) => /生|烹调油/.test(s) ? '出现了生重或烹调油' : !/糯米鸡[^\[]*\[估算,整份/.test(s) ? '糯米鸡没有整份估' : inRange(t, 380, 700)));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('便利店饭团', '早上在便利店买了一个金枪鱼饭团和一瓶豆奶', (r, t, s) => /烹调油/.test(s) ? '加了烹调油' : inRange(t, 250, 600)));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('番茄炒蛋盖饭', '中午番茄炒蛋盖饭', (r, t, s) => !/米饭/.test(s) ? '没拆出米饭' : inRange(t, 500, 950)));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('牛肉面', '晚上一碗兰州牛肉面加个卤蛋', (r, t) => inRange(t, 450, 950)));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('包装营养数', '下午吃了一包鸡胸肉，包装上写每100克110大卡，一包100克', (r, t, s) => !/包装/.test(s) ? '没按包装算' : !r.remember.length ? '没记住' : inRange(t, 100, 120)));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('只让记住', '记住，公司楼下的肉夹馍一个450大卡', (r, t) => r.meals.length ? '不该新增饮食' : !r.remember.length ? '没记住' : true));
  await new Promise(r => setTimeout(r, 15000)); rs.push(await call('用记住的', '晚上又吃了两个糯米鸡', (r, t, s) => !/我的/.test(s) ? '没用记住的数' : inRange(t, 630, 650),
    [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 320, proteinG: 10, carbsG: 44, fatG: 11 }]));
  note('通过', `${rs.filter(Boolean).length}/${rs.length}`);
  process.exit(0);
})();
