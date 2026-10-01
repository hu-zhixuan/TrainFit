// Atria 支不支持联网搜索：几种常见写法各发一次，看接不接受、回答里有没有来源
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const q = '汉堡王中国的吉士汉堡一个多少千卡、多少克蛋白质？请查官方营养信息，给出数字和来源链接。';
const V = {
  '不加（对照）': {},
  'tools web_search': { tools: [{ type: 'web_search' }] },
  'web_search_options': { web_search_options: {} },
  'enable_search': { enable_search: true },
  'tools web_search_preview': { tools: [{ type: 'web_search_preview' }] },
};
(async () => {
  const out = [];
  for (const [name, extra] of Object.entries(V)) {
    const body = Object.assign({ model, messages: [{ role: 'user', content: q }], stream: false, thinking: { type: 'disabled' } }, extra);
    const t0 = Date.now();
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }).catch(e => ({ status: 0, text: async () => String(e) }));
    const t = await r.text();
    let ans = t.slice(0, 200);
    try { const j = JSON.parse(t); const m = j.choices[0].message; ans = (m.content || '').replace(/\s+/g, ' ').slice(0, 260) + (m.annotations ? ` [annotations ${m.annotations.length}]` : '') + (m.tool_calls ? ` [tool_calls ${JSON.stringify(m.tool_calls).slice(0, 120)}]` : ''); } catch (e) {}
    out.push(`【${name}】${r.status} ${((Date.now() - t0) / 1000).toFixed(1)}s ${ans}`);
    await new Promise(res => setTimeout(res, 15000));
  }
  console.log('::notice title=Atria 联网搜索::' + out.join('%0A').replace(/\n/g, ' '));
})();
