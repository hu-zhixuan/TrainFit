// 临时：v5.4 新例子在带计划的长回答里 JSON 偶尔多一个括号？A = 现在的例子（add 在最后，结尾 ]}]}}），B = add 后面再跟 dayOffset（和旧提示词一样 ]}]},）。写坏了把原文打出来。只用 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const V = process.env.VARIANT || 'A';
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3900);
function variant(sys) {
  if (V === 'A') return sys;
  const a = '例 1（记吃的、练的）：{"reply":"一句短话说你做了什么，15字以内，不写热量数（下面会单独列出来）；估得比较粗的，30字以内说按什么估的","dayOffset":0,';
  const b = '"calories":260,"proteinG":11,"carbsG":10,"fatG":19}]}]}}';
  const c = '例 2（改、删已有的记录）：{"reply":"改好了","dayOffset":0,"update":[{"ref":"r2","set":{"weightKg":85}}],"delete":["r3"]}';
  if (!sys.includes(a) || !sys.includes(b) || !sys.includes(c)) throw new Error('例子对不上');
  return sys.replace(a, a.replace('"dayOffset":0,', '')).replace(b, b.slice(0, -1) + ',"dayOffset":0}')
    .replace(c, '例 2（改、删已有的记录）：{"reply":"改好了","update":[{"ref":"r2","set":{"weightKg":85}}],"delete":["r3"],"dayOffset":0}');
}
const CASES = [
  ['定明天食谱', '给我定一下明天的食谱，训练强度大，碳水多点', '21:00', {}],
  ['又记又问', '中午吃了一碗牛肉面，晚上吃点啥好', '13:00', {}],
  ['照顾小本本', '晚上吃点啥好', '18:00', { memo: ['不吃辣'] }],
  ['还差多少蛋白', '今天还差多少蛋白质', '19:00', {}],
  ['明天练什么', '明天练什么好', '21:00', {}]
];
(async () => {
  let bad = 0, n = 0;
  const lines = [];
  for (let k = 0; k < Number(process.env.ROUNDS || 3); k++) {
    for (const [label, text, hhmm, extra] of CASES) {
      await sleep(Number(process.env.GAP || 15000));
      const [h, mi] = hhmm.split(':').map(Number);
      const ctx = Object.assign({ now: new Date(2026, 9, 2, h, mi), history: [], dayRecords: [], dayLabel: '今天 2026-10-02', lastWeight: 61, ask: true, date: '2026-10-02',
        recent: ['杠铃卧推 80kg 4×8（10-01）', '杠铃深蹲 100kg 5×5（09-27）', '引体向上 自重 4×8（09-27）'],
        day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 1200, protein: 80, proteinTarget: 140 },
        portrait: ['常吃牛肉面、鸡腿饭', '一周练 3 天左右，常练胸、腿'],
        myFoods: [{ name: '乳清蛋白粉', amount: '1勺', grams: 30, calories: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }] }, extra);
      const msgs = P.buildMessages(text, ctx);
      msgs[0].content = variant(msgs[0].content);
      const body = { model, messages: msgs, temperature: 0.2, stream: false, thinking: { type: 'disabled' } };
      let res, raw = '', t0;
      for (let tries = 0; ; tries++) {
        t0 = Date.now();
        res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
        if (res.status === 429 && tries < 4) { await sleep(30000); continue; }
        break;
      }
      raw = await res.text();
      const ms = Date.now() - t0;
      n += 1;
      if (!res.ok) { lines.push(`${label} #${k + 1} HTTP ${res.status}`); continue; }
      let content = '', toks = '';
      try { const j = JSON.parse(raw); content = j.choices[0].message.content; toks = j.usage && j.usage.completion_tokens; } catch (e) {}
      try {
        const r = P.normalize(P.extractJson(content), Object.assign({ said: text }, ctx));
        lines.push(`${label} #${k + 1} OK ${(ms / 1000).toFixed(1)}s ${toks}tok plan=${r.plan ? '有' : '无'} answer=${(r.answer || '').length}字`);
      } catch (e) {
        bad += 1;
        lines.push(`${label} #${k + 1} 写坏了 ${e.message.slice(0, 80)}`);
        console.log(`::error title=[${V}] ${label} #${k + 1} 写坏了::${esc(e.message + '\n' + content)}`);
      }
    }
  }
  console.log(`::notice title=[${V}] JSON 汇总::${esc(`写坏 ${bad}/${n}\n` + lines.join('\n'))}`);
  process.exit(0);
})();
