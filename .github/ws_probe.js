// 用 App 里一模一样的 WebSocket 流程连千问实时识别（只用 qwen-audio-3.1-asr-flash-message），把服务器回的每条消息打出来
const fs = require('fs'), path = require('path');
const WebSocket = require('ws');
const KEY = (process.env.K || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const MODEL = 'qwen-audio-3.1-asr-flash-message';
const wav = fs.readFileSync(path.join(__dirname, 'asr_wavs', 's60_01_clean.wav'));
const pcm = wav.subarray(44); // 16k 16bit 单声道
const taskId = require('crypto').randomUUID().replace(/-/g, '');
const log = [];
const t0 = Date.now();
const say = (s) => { log.push(`${((Date.now() - t0) / 1000).toFixed(2)}s ${s}`); console.log(log[log.length - 1]); };
const ws = new WebSocket('wss://maas.qianwenaiapi.com/api-ws/v1/inference', { headers: { Authorization: `Bearer ${KEY}` } });
ws.on('unexpected-response', (req, res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => { say(`握手被拒 HTTP ${res.statusCode} ${b.slice(0, 300)}`); done(); }); });
ws.on('open', () => {
  say('连上了，发 run-task');
  ws.send(JSON.stringify({ header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
    payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: MODEL,
      parameters: { format: 'pcm', sample_rate: 16000, semantic_punctuation_enabled: true, heartbeat: true, keep_dialect: false, intermediate_result_enabled: true, disfluency_removal_enabled: true },
      input: {} } }));
});
ws.on('message', async (data, isBinary) => {
  const s = data.toString();
  say('收到 ' + s.slice(0, 400));
  let m; try { m = JSON.parse(s); } catch (e) { return; }
  const ev = m.header && m.header.event;
  if (ev === 'task-started') {
    // 像 App 一样 100ms 一块、按真实速度发
    for (let i = 0; i < pcm.length; i += 3200) { ws.send(pcm.subarray(i, i + 3200)); await new Promise(r => setTimeout(r, 100)); }
    say('音频发完，发 finish-task');
    ws.send(JSON.stringify({ header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' }, payload: { input: {} } }));
  }
  if (ev === 'task-finished' || ev === 'task-failed') done();
});
ws.on('error', (e) => { say('出错 ' + e.message); });
ws.on('close', (c, r) => { say(`断开 ${c} ${r}`); done(); });
let finished = false;
function done() {
  if (finished) return; finished = true;
  try { ws.close(); } catch (e) {}
  console.log('::notice title=千问实时识别（App 同款流程）::' + log.join('%0A').slice(0, 3500));
  setTimeout(() => process.exit(0), 200);
}
setTimeout(() => { say('20 秒超时'); done(); }, 20000);
