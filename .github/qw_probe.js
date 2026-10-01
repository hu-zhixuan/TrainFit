// 千问 key 现在还能用哪些模型：每个只发一次，打印状态码和错误码（不打印 key）
const fs = require('fs'), path = require('path');
const KEY = (process.env.K || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const WAV = fs.readFileSync(path.join(__dirname, 'asr_wavs', 's60_01_clean.wav')).toString('base64');
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const gen = 'https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation';
const chat = 'https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions';
const asr = (model) => ({ model, input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + WAV } }] }] }, parameters: { format: 'wav', sample_rate: '16000', language_hints: ['zh'] } });
const llm = (model) => ({ model, messages: [{ role: 'user', content: '回答一个字：好' }], max_tokens: 5, enable_thinking: false });
(async () => {
  const out = [];
  for (const [name, url, body] of [
    ['qwen-audio-3.1-asr-flash', gen, asr('qwen-audio-3.1-asr-flash')],
    ['fun-asr-flash-2026-06-15', gen, asr('fun-asr-flash-2026-06-15')],
    ['qwen3.8-flash', chat, llm('qwen3.8-flash')],
    ['qwen3.8-max', chat, llm('qwen3.8-max')],
    ['qwen-flash', chat, llm('qwen-flash')],
    ['qwen-plus', chat, llm('qwen-plus')],
  ]) {
    const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) }).catch(e => ({ status: 0, text: async () => String(e) }));
    const t = await r.text();
    let code = '';
    try { const j = JSON.parse(t); code = j.code || (j.error && (j.error.code || j.error.message)) || (j.output ? 'ok' : j.choices ? 'ok' : ''); } catch (e) { code = t.slice(0, 80); }
    out.push(`${name}: ${r.status} ${String(code).slice(0, 90)}`);
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('::notice title=千问 key 现在能用哪些::' + out.join('%0A'));
})();
