// 对比硅基流动上的几个语音转文字模型：错字率（数字另算）、耗时。结果写成 check run 的 annotation
const fs = require('fs');
const path = require('path');

const BASE = (process.env.ASR_BASE_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
const KEY = (process.env.ASR_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
// 千问 AI 平台（sk-ws- 开头的 key）：和 App 一样走 multimodal-generation，录音 base64 放进 JSON
const QW = KEY.startsWith('sk-ws-');
const QW_CONTEXT = '健身和饮食记录。常见词：卧推、深蹲、硬拉、引体向上、划船、推举、飞鸟、弯举、组、个、公斤、跑步机、椭圆机、蛋白粉、乳清蛋白、鸡胸肉、茶叶蛋、豆浆、燕麦、米饭、牛肉面、千卡、大卡、毫升、克。';
const MODELS = (process.env.MODELS || (QW ? 'qwen3-asr-flash,qwen-audio-3.1-asr-flash,qwen-audio-3.0-asr-flash,fun-asr-flash-2026-06-15' : '') || 'FunAudioLLM/SenseVoiceSmall,Qwen/Qwen3-ASR-1.7B,XingChenAGI/XingChenASR-V3.2,XingChenAGI/XingChenASR-V3.2-Ultra,TeleAI/TeleSpeechASR').split(',');
const DIR = path.join(__dirname, 'asr_wavs');
const sents = fs.readFileSync(path.join(DIR, 'sentences.txt'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.wav')).sort();

const CN = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnToNum(s) { // 一百二十 / 六十二点五 / 七百 / 两
  const [ip, fp] = s.split('点');
  let total = 0, cur = 0;
  for (const ch of ip) {
    if (ch in CN) cur = CN[ch];
    else if (ch === '十') { total += (cur || 1) * 10; cur = 0; }
    else if (ch === '百') { total += cur * 100; cur = 0; }
    else if (ch === '千') { total += cur * 1000; cur = 0; }
  }
  total += cur;
  if (fp) return parseFloat(total + '.' + [...fp].map(c => CN[c] ?? '').join(''));
  return total;
}
/** 数字统一成阿拉伯数字，再把「1个」这类和「一个」对齐 */
function numbers(s) {
  const out = [];
  s.replace(/[0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十百千]+(?:点[零一二三四五六七八九]+)?/g, (m) => { out.push(/[0-9]/.test(m) ? parseFloat(m) : cnToNum(m)); return m; });
  return out;
}
function textOnly(s) {
  return s.toLowerCase().replace(/[\s，。、？！,.?!：:；;“”"'…]/g, '').replace(/[0-9]+(?:\.[0-9]+)?|[零一二两三四五六七八九十百千]+(?:点[零一二三四五六七八九]+)?/g, '#');
}
function edit(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] !== b[j - 1] ? 1 : 0)); prev = t; }
  }
  return d[b.length];
}
function clean(t) { // Qwen3-ASR 可能带 language / <asr_text> 之类标记
  return String(t || '').replace(/^.*<asr_text>/s, '').replace(/<[^>]+>/g, '').replace(/^language\s+\S+\s*/i, '').trim();
}

async function transcribeQw(model, buf) {
  const ctx = process.env.NO_CONTEXT ? '' : QW_CONTEXT;
  const data = 'data:audio/wav;base64,' + buf.toString('base64');
  // qwen3-asr-flash：audio + asr_options；Qwen-Audio 3.x / Fun-ASR-Flash：input_audio + format / sample_rate（照 BiBi-Keyboard）
  const body = model.startsWith('qwen3-asr') ? { model, input: { messages: [
    { role: 'system', content: [{ text: ctx }] },
    { role: 'user', content: [{ audio: data }] }] },
    parameters: { asr_options: { enable_itn: true, language: 'zh' } } }
    : { model, input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }] },
      parameters: Object.assign({ format: 'wav', sample_rate: '16000', language_hints: ['zh'] },
        /3\.1/.test(model) ? { keep_dialect: false, disfluency_removal_enabled: true } : {}) };
  const t0 = Date.now();
  const r = await fetch('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation', { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'disable' }, body: JSON.stringify(body) });
  const ms = Date.now() - t0;
  const text = await r.text();
  if (!r.ok) return { ok: false, ms, err: `HTTP ${r.status} ${text.slice(0, 160)}` };
  let t = '';
  try {
    const o = JSON.parse(text).output || {};
    const c = o.choices && o.choices[0] && o.choices[0].message && o.choices[0].message.content;
    t = (Array.isArray(c) ? c.map(x => x.text || '').find(Boolean) : c) || o.text || o.sentence || o.transcription || '';
    if (!t) t = text.slice(0, 200);
  } catch (e) { t = text; }
  return { ok: true, ms, text: clean(t), raw: t };
}

async function transcribe(model, file) {
  const buf = fs.readFileSync(path.join(DIR, file));
  if (QW) return transcribeQw(model, buf);
  const fd = new FormData();
  fd.append('model', model);
  fd.append('file', new Blob([buf], { type: 'audio/wav' }), file);
  const t0 = Date.now();
  const r = await fetch(`${BASE}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  const ms = Date.now() - t0;
  const body = await r.text();
  if (!r.ok) return { ok: false, ms, err: `HTTP ${r.status} ${body.slice(0, 160)}` };
  let text = '';
  try { text = JSON.parse(body).text || ''; } catch (e) { text = body; }
  return { ok: true, ms, text: clean(text), raw: text };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  if (!KEY) { console.log('::error::没有 ASR_API_KEY'); process.exit(1); }
  for (const model of MODELS) {
    const acc = { clean: [0, 0, 0, 0], noisy: [0, 0, 0, 0] }; // 字错、字总数、数字对、数字总数
    const times = []; const bad = []; let fails = 0; let firstErr = '';
    for (const f of files) {
      const idx = parseInt(f.split('_')[1], 10);
      const kind = f.includes('noisy') ? 'noisy' : 'clean';
      let r;
      for (let tries = 0; tries < 3; tries++) {
        try { r = await transcribe(model, f); } catch (e) { r = { ok: false, err: String(e) }; }
        if (r.ok || !/429|5\d\d/.test(r.err || '')) break;
        await sleep(3000 * (tries + 1));
      }
      if (!r.ok) { fails++; firstErr = firstErr || r.err; continue; }
      times.push(r.ms);
      const ref = sents[idx];
      const a = textOnly(ref), b = textOnly(r.text);
      const e = edit(a, b);
      acc[kind][0] += e; acc[kind][1] += a.length;
      const na = numbers(ref), nb = numbers(r.text);
      acc[kind][2] += na.filter((n, i) => nb[i] === n).length; acc[kind][3] += na.length;
      if (e && bad.length < 8) bad.push(`${ref} → ${r.text}`);
      console.log(`${model} ${f} ${r.ms}ms  ${ref} → ${r.raw}`);
      await sleep(300);
    }
    times.sort((x, y) => x - y);
    const p = (k) => acc[k][1] ? (acc[k][0] / acc[k][1] * 100).toFixed(1) + '%' : '-';
    const numAcc = (acc.clean[2] + acc.noisy[2]) + '/' + (acc.clean[3] + acc.noisy[3]);
    const med = times.length ? times[Math.floor(times.length / 2)] : 0;
    console.log(`::notice title=${model}::干净 ${p('clean')} · 嘈杂 ${p('noisy')} · 数字对 ${numAcc} · 中位耗时 ${med}ms · 失败 ${fails}${firstErr ? '（' + firstErr.replace(/\n/g, ' ') + '）' : ''}`);
    if (bad.length) console.log(`::notice title=${model} 错例::${bad.join(' ｜ ').slice(0, 900)}`);
  }
})();
