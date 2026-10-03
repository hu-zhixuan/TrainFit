#!/usr/bin/env python3
"""
生成食物图鉴的实物照片（v6.2）：web/img/food/*.webp + web/js/data/food_img.js + web/img/food/CREDITS.md

照片都是开放授权的实拍图（CC0 / 公有领域 / CC BY / CC BY-SA，不用「非商用」「禁止改编」的），
从 Openverse（https://openverse.org，聚合 Flickr、Wikimedia Commons 等）挑的，清单在 scripts/food-img.json：
  { "图鉴里的名字": { "file": "文件名", "url": 原图, "page": 原图页面, "author": 作者, "license": "by-sa", "version": "2.0",
                     "provider": "flickr", "crop": [中心 x, 中心 y, 放大]（可选，0～1，默认居中不放大） } }
做法：下载 → 裁成正方形 → 缩到 160×160 → WebP。图鉴里显示 50～96px，手机 3 倍屏也够清楚，一张五六 KB。
CC BY / BY-SA 要署名：图鉴底部「照片来源」列出每张的作者和授权（数据在 food_img.js），完整链接在 CREDITS.md。

用法：pip install pillow && python3 scripts/build-food-img.py [只重做这几样的名字…]
"""
import io, json, os, re, sys, time, urllib.request
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'web', 'img', 'food')
SIZE = 160
UA = {'User-Agent': 'TrainFitBuild/1.0 (https://github.com/hu-zhixuan/TrainFit)'}
LICENSE_NAME = {'by': 'CC BY', 'by-sa': 'CC BY-SA', 'cc0': 'CC0', 'pdm': '公有领域'}
LICENSE_URL = {'by': 'https://creativecommons.org/licenses/by/{v}/', 'by-sa': 'https://creativecommons.org/licenses/by-sa/{v}/',
               'cc0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'pdm': 'https://creativecommons.org/publicdomain/mark/1.0/'}


def source_url(u):
    """Flickr 取 800px 的那一档、Wikimedia 取 500px 的标准缩略图就够了（原图太大，Wikimedia 也不让频繁下原图）"""
    m = re.match(r'(https://live\.staticflickr\.com/\d+/\d+_[0-9a-f]+)(_[a-z])?\.jpg$', u)
    if m:
        return m.group(1) + '_c.jpg'
    m = re.match(r'https://upload\.wikimedia\.org/wikipedia/commons/(\w/\w\w)/([^/]+)$', u)
    if m:
        name = m.group(2)
        return f'https://upload.wikimedia.org/wikipedia/commons/thumb/{m.group(1)}/{name}/500px-{name}' + ('.jpg' if re.search(r'\.tiff?$', name, re.I) else '')
    return u


def fetch(u):
    for i in range(4):
        try:
            return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60).read()
        except Exception as e:  # noqa: BLE001
            if i == 3:
                raise
            print('  重试', u, e)
            time.sleep(3 * (i + 1))


def square(im, crop):
    cx, cy, zoom = (crop + [0.5, 0.5, 1][len(crop):]) if crop else (0.5, 0.5, 1)
    w, h = im.size
    side = min(w, h) / max(1, zoom)
    left = min(max(0, cx * w - side / 2), w - side)
    top = min(max(0, cy * h - side / 2), h - side)
    return im.crop((round(left), round(top), round(left + side), round(top + side)))


def main():
    with open(os.path.join(ROOT, 'scripts', 'food-img.json'), encoding='utf-8') as f:
        manifest = json.load(f)
    only = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    for name, x in manifest.items():
        path = os.path.join(OUT, x['file'] + '.webp')
        if only and name not in only:
            continue
        if not only and os.path.exists(path):
            continue
        print(name, x['url'])
        im = Image.open(io.BytesIO(fetch(source_url(x['url'])))).convert('RGB')
        im = ImageOps.exif_transpose(im)
        im = square(im, x.get('crop')).resize((SIZE, SIZE), Image.LANCZOS)
        im.save(path, 'WEBP', quality=74, method=6)
        time.sleep(0.5)
    # 清单里没有的旧图删掉
    keep = {x['file'] + '.webp' for x in manifest.values()}
    for fn in os.listdir(OUT):
        if fn.endswith('.webp') and fn not in keep:
            os.remove(os.path.join(OUT, fn))

    lic = lambda x: (LICENSE_NAME[x['license']] + (' ' + x['version'] if x['license'] in ('by', 'by-sa') else '')).strip()
    data = {name: [x['file'], x.get('author') or '佚名', lic(x), 'Wikimedia' if x.get('provider') == 'wikimedia' else 'Flickr' if x.get('provider') == 'flickr' else x.get('provider', '')]
            for name, x in manifest.items()}
    js = ('/* 自动生成：python3 scripts/build-food-img.py —— 不要手改\n'
          ' * 食物图鉴的实物照片：名字 → [文件名(web/img/food/*.webp), 作者, 授权, 来源网站]，完整链接见 web/img/food/CREDITS.md */\n'
          '(function (root) {\n  const TF = root.TF = root.TF || {};\n  TF.FOOD_IMG = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) +
          ';\n  if (typeof module !== \'undefined\' && module.exports) module.exports = TF.FOOD_IMG;\n})(typeof window !== \'undefined\' ? window : globalThis);\n')
    with open(os.path.join(ROOT, 'web', 'js', 'data', 'food_img.js'), 'w', encoding='utf-8') as f:
        f.write(js)

    rows = ['# 食物图鉴照片来源', '',
            '图鉴里的照片都是开放授权的实拍图，经 [Openverse](https://openverse.org) 检索，裁成正方形、缩小后使用。',
            '由 `scripts/build-food-img.py` 按 `scripts/food-img.json` 生成，不要手改。', '',
            '| 食物 | 作者 | 授权 | 原图 |', '| --- | --- | --- | --- |']
    for name, x in manifest.items():
        url = LICENSE_URL[x['license']].format(v=x.get('version') or '4.0')
        author = (x.get('author') or '佚名').replace('|', '/')
        rows.append(f"| {name} | {author} | [{lic(x)}]({url}) | [{x.get('provider', '')}]({x.get('page') or x['url']}) |")
    with open(os.path.join(OUT, 'CREDITS.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(rows) + '\n')
    total = sum(os.path.getsize(os.path.join(OUT, fn)) for fn in os.listdir(OUT) if fn.endswith('.webp'))
    print(f'{len(manifest)} 张，共 {total // 1024} KB')


if __name__ == '__main__':
    main()
