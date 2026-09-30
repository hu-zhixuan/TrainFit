// 摸底：仓库里现有的两把 key 能不能白嫖云端语音识别（不打印 key）
const fs = require('fs');
const path = require('path');
const WAV = fs.readFileSync(path.join(__dirname, 'asr_wavs', 's60_01_clean.wav'));
const note = (t, m) => console.log(`::notice title=${t}::${String(m).replace(/\n/g, ' ').slice(0, 900)}`);
const host = (u) => { try { return new URL(u).host; } catch (e) { return u; } };

async function j(url, key, opt = {}) {
  try {
    const r = await fetch(url, Object.assign({ headers: Object.assign({ Authorization: `Bearer ${key}` }, opt.headers || {}) }, opt, { headers: Object.assign({ Authorization: `Bearer ${key}` }, opt.headers || {}) }));
    const t = await r.text();
    return { status: r.status, body: t };
  } catch (e) { return { status: 0, body: String(e) }; }
}
async function stt(base, key, model) {
  const fd = new FormData();
  fd.append('model', model);
  fd.append('file', new Blob([WAV], { type: 'audio/wav' }), 'a.wav');
  const t0 = Date.now();
  const r = await j(`${base}/audio/transcriptions`, key, { method: 'POST', body: fd });
  return `${model} → ${r.status} ${Date.now() - t0}ms ${r.body.slice(0, 120)}`;
}
async function chatAudio(base, key, model) {
  const body = { model, thinking: { type: 'disabled' }, max_tokens: 200, messages: [{ role: 'user', content: [
    { type: 'input_audio', input_audio: { data: WAV.toString('base64'), format: 'wav' } },
    { type: 'text', text: '把这段录音逐字转写成中文，只输出转写结果。' }] }] };
  const t0 = Date.now();
  const r = await j(`${base}/chat/completions`, key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let out = r.body.slice(0, 200);
  try { out = JSON.parse(r.body).choices[0].message.content; } catch (e) {}
  return `${model} input_audio → ${r.status} ${Date.now() - t0}ms ${out}`;
}

(async () => {
  // 1) 硅基流动的 key：余额、状态
  const sfBase = (process.env.ASR_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
  const sfKey = (process.env.ASR_API_KEY || '').trim();
  const u = { status: 0, body: '' };
  let info = u.body.slice(0, 200);
  try { const d = JSON.parse(u.body).data || {}; info = `balance=${d.balance} charge=${d.chargeBalance} total=${d.totalBalance} status=${d.status} introduction=${d.introduction ? 'y' : 'n'}`; } catch (e) {}
  // 余额接口已下线（410）
  note('硅基流动 SenseVoiceSmall', await stt(sfBase, sfKey, 'FunAudioLLM/SenseVoiceSmall'));

  // 2) 大模型那把 key：有哪些模型、能不能听录音
  const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
  const key = (process.env.LLM_API_KEY || '').trim();
  const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
  const m = await j(`${base}/models`, key);
  let ids = [];
  try { ids = (JSON.parse(m.body).data || []).map(x => x.id); } catch (e) {}
  note('大模型接口', `${host(base)} 模型 ${model}；/models ${m.status} 共 ${ids.length} 个：${ids.join(', ').slice(0, 700) || m.body.slice(0, 200)}`);
  const audioIds = ids.filter(x => /whisper|asr|audio|speech|sensevoice|paraformer|transcri|omni/i.test(x));
  const tries = [...new Set([...audioIds.slice(0, 4), 'whisper-1'])];
  const res = [];
  for (const t of tries) res.push(await stt(base, key, t));
  note('大模型接口 转写', res.join(' ｜ '));
  const ca = [await chatAudio(base, key, model)];
  for (const t of audioIds.filter(x => /omni|audio/i.test(x)).slice(0, 2)) ca.push(await chatAudio(base, key, t));
  note('大模型接口 听录音', ca.join(' ｜ '));
  note('原句', fs.readFileSync(path.join(__dirname, 'asr_wavs', 'sentences.txt'), 'utf8').split('\n')[1]);
})();
