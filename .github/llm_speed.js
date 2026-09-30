// 大模型为什么慢：同一句话、同样的提示词，换几种「别先想」的参数，看耗时和 usage（有没有推理 token）
global.window = global;
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ctx = { now: new Date(2026, 9, 1, 7, 20), history: [], dayRecords: [], dayLabel: '今天 2026-10-01', lastWeight: 61, recent: ['杠铃卧推 80kg 4×8（09-28）'], myFoods: [] };
const VARIANTS = {
  'thinking disabled（现在）': { thinking: { type: 'disabled' } },
  '什么都不加': {},
  'reasoning_effort none': { reasoning_effort: 'none' },
  'reasoning_effort minimal': { reasoning_effort: 'minimal' },
  'enable_thinking false': { enable_thinking: false },
  'thinking disabled + max_tokens 600': { thinking: { type: 'disabled' }, max_tokens: 600 },
};
(async () => {
  const lines = [];
  for (const [name, extra] of Object.entries(VARIANTS)) {
    const ts = [];
    let usage = '', out = '';
    for (let k = 0; k < 3; k++) {
      await sleep(15000);
      const body = Object.assign({ model, messages: P.buildMessages('无糖奥利奥三块', ctx), temperature: 0.2, stream: false }, extra);
      const t0 = Date.now();
      const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
      const raw = await r.text();
      ts.push(((Date.now() - t0) / 1000).toFixed(1) + (r.ok ? '' : `(HTTP ${r.status})`));
      try { const j = JSON.parse(raw); usage = JSON.stringify(j.usage); out = (j.choices[0].message.content || '').length + '字' + (j.choices[0].message.reasoning_content ? ' 推理' + j.choices[0].message.reasoning_content.length + '字' : ''); } catch (e) { usage = raw.slice(0, 120); }
    }
    lines.push(`${name}: ${ts.join('s / ')}s · 输出 ${out} · usage ${usage}`);
    console.log(lines[lines.length - 1]);
  }
  console.log(`::notice title=大模型耗时::${lines.join('%0A').slice(0, 3000)}`);
  console.log(`::notice title=提示词长度::${JSON.stringify(P.buildMessages('无糖奥利奥三块', ctx)).length} 字符`);
})();
