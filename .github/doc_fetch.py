# 抓千问平台文档（沙箱连不上），去掉标签打到日志里；再用假 key 敲一下接口地址看是不是 401
import re, json, urllib.request, html
PAGES = [
  'https://platform.qianwenai.com/docs/resources/free-quota',
  'https://platform.qianwenai.com/docs/api-reference/speech-recognition/fun-asr-flash/http-api',
  'https://platform.qianwenai.com/docs/developer-guides/speech/speech-to-text-models',
  'https://www.qianwenai.com/models/qwen3-asr-flash',
  'https://platform.qianwenai.com/docs/developer-guides/getting-started/first-api-call',
]
def text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    raw = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'ignore')
    raw = re.sub(r'(?s)<(script|style)[^>]*>.*?</\1>', ' ', raw)
    t = html.unescape(re.sub(r'<[^>]+>', '\n', raw))
    return re.sub(r'\n\s*\n+', '\n', t)
for u in PAGES:
    print('=' * 20, u)
    try:
        print(text(u)[:12000])
    except Exception as e:
        print('ERR', e)
for url, body in [
  ('https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation', {'model': 'qwen3-asr-flash', 'input': {'messages': []}}),
  ('https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions', {'model': 'qwen3-asr-flash', 'messages': []}),
  ('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {'model': 'qwen3-asr-flash', 'messages': []}),
]:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Authorization': 'Bearer sk-test', 'Content-Type': 'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=20); print('PROBE', url, r.status, r.read()[:300])
    except urllib.error.HTTPError as e:
        print('PROBE', url, e.code, e.read()[:300])
    except Exception as e:
        print('PROBE', url, 'ERR', e)
