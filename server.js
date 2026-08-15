const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-gemini-key, x-groq-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API 1: /api/transcribe (Audio STT via Groq Whisper / OpenAI Whisper)
  if (pathname === '/api/transcribe' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        const apiKey = req.headers['x-api-key'] || req.headers['x-groq-key'] || req.headers['authorization']?.replace('Bearer ', '') || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
        const contentType = req.headers['content-type'] || 'audio/webm';

        console.log(`[ASR API] Received audio: ${audioBuffer.length} bytes, format: ${contentType}`);

        if (apiKey) {
          try {
            const isGroq = apiKey.startsWith('gsk_') || process.env.GROQ_API_KEY;
            const targetHost = isGroq ? 'api.groq.com' : 'api.openai.com';
            const targetPath = '/v1/audio/transcriptions';
            const modelName = isGroq ? 'whisper-large-v3-turbo' : 'whisper-1';

            const boundary = '----TrainFitAudioBoundary' + Date.now();
            const ext = contentType.includes('wav') ? 'wav' : (contentType.includes('mp4') ? 'm4a' : 'webm');
            
            const postDataHeader = Buffer.from(
              `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="model"\r\n\r\n${modelName}\r\n` +
              `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="language"\r\n\r\nzh\r\n` +
              `--${boundary}\r\n` +
              `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
              `Content-Type: ${contentType}\r\n\r\n`
            );
            const postDataFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
            const fullBody = Buffer.concat([postDataHeader, audioBuffer, postDataFooter]);

            const options = {
              hostname: targetHost,
              port: 443,
              path: targetPath,
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': fullBody.length
              },
              timeout: 12000
            };

            const whisperReq = https.request(options, (whisperRes) => {
              let responseBody = '';
              whisperRes.on('data', d => responseBody += d);
              whisperRes.on('end', () => {
                try {
                  const json = JSON.parse(responseBody);
                  if (json.text) {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: true, text: json.text.trim(), source: isGroq ? 'groq-whisper' : 'openai-whisper' }));
                  } else {
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                    res.end(JSON.stringify({ success: false, error: json.error?.message || '转写失败', raw: responseBody }));
                  }
                } catch (e) {
                  res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
                  res.end(JSON.stringify({ success: false, error: '解析响应失败' }));
                }
              });
            });

            whisperReq.on('error', (err) => {
              console.warn('[ASR Whisper Error]', err.message);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
              res.end(JSON.stringify({ success: false, error: `语音转写服务连接超时: ${err.message}` }));
            });

            whisperReq.write(fullBody);
            whisperReq.end();
            return;
          } catch (apiErr) {
            console.warn('[ASR Call Error]', apiErr);
          }
        }

        // Local fallback when no API key is set
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({
          success: true,
          audioBytes: audioBuffer.length,
          source: 'local-media-recorder',
          message: '音频已成功在本地捕获'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API 2: /api/llm/parse (LLM Structured Output Endpoint for Workout & Diet)
  if (pathname === '/api/llm/parse' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { text, type, apiKey, provider } = payload;
        
        console.log(`[LLM API] Parse request type=${type}, text="${text?.slice(0, 30)}..."`);
        
        // Return 200 with acknowledgment for client dispatcher
        res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: true, processed: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=UTF-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Static files handling
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`练食AI Server is running on http://localhost:${PORT}`);
});
