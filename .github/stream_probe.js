// Atria 支不支持流式输出（stream: true）：用 App 的提示词问一次「明天食谱」，看第一个字多久到、全部多久
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const ctx = { now: new Date(2026, 9, 1, 21, 0), dayRecords: [], recent: ['杠铃卧推 80kg 4×8（09-30）'], myFoods: [], lastWeight: 61,
  day: { goal: 'fat_loss', budget: 2031, burn: 0, intake: 1200, protein: 80, proteinTarget: 140 } };
(async () => {
  const body = { model, messages: TF.Parser.buildMessages('给我定一下明天的食谱，训练强度大，碳水多点', ctx), temperature: 0.2, stream: true, thinking: { type: 'disabled' } };
  const t0 = Date.now(); let first = 0, chunks = 0, text = '', raw = '';
  const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  const dec = new TextDecoder();
  for await (const part of r.body) {
    const s = dec.decode(part, { stream: true }); raw += s;
    for (const line of s.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) { if (!first) first = Date.now() - t0; chunks++; text += c; } } catch (e) {}
    }
  }
  const all = Date.now() - t0;
  console.log(`::notice title=Atria 流式::HTTP ${r.status} content-type ${r.headers.get('content-type')} · 第一个字 ${(first / 1000).toFixed(1)}s · 全部 ${(all / 1000).toFixed(1)}s · ${chunks} 块%0A开头：${text.slice(0, 300).replace(/\n/g, ' ')}%0A原始开头：${raw.slice(0, 300).replace(/\n/g, ' ')}`);
})();
