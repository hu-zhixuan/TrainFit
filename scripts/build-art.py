#!/usr/bin/env python3
"""
剧场美术（立绘 / CG / 背景）→ 压成 webp 放进 web/img/cast/，生成清单 web/img/cast/manifest.js（v7.1，v7.2 加 --fetch）。

图从两处来，都不进仓库（.gitignore 挡掉了 art/ 里的图、.art-cache/ 和整个 web/img/cast/）：
  1. art/sources.json 里写的免费素材（现在两个人的立绘都是わたおきば的）：--fetch 下载 zip 到 .art-cache/、校验 sha256、
     按 faces 取出每个表情（「+blush」加腮红）存成 art/<人>/face-<表情>.png。素材不准转发原图、仓库又是公开的，
     所以 CI 打包时现下（.github/workflows 里的「Fetch theater art」），图只进 APK。
  2. 自己放进 art/ 的图（png / jpg / webp，原图可以很大）：
       art/jx/face-calm.png         江叙的立绘，一个表情一张：calm 平静 / happy 开心 / shy 害羞 / worried 担心 / smug 得意 /
                                    surprised 惊讶 / pout 不服 / love 心动 / sleepy 困 / sparkle 闪亮 / full 撑（至少要 calm）
       art/xy/face-calm.png         夏柚，同上
       art/jx/cg/jx-pool6.png       CG，名字和 web/js/app/script_jx.js / script_xy.js 里 cgs 的键一样
       art/bg/pool.png              背景：room roomnight gym pool studio cafe street citynight rain night dusk dawn stage

立绘要透明底，所有表情同一个姿势、同一个大小、人物站的位置一样，只换脸（脚本按透明边裁掉空白，同一个人的表情裁法一样）；
CG 和背景竖屏 9:16（至少 1080×1920）。脚本：立绘缩到高 1400 以内、CG / 背景缩到 1080×1920 以内，压成 webp。
清单没生成时（没跑过这个脚本）剧场用像素小人放大、CSS 画的背景，App 照样能用。

  pip install pillow
  python3 scripts/build-art.py --fetch           # 下载 sources.json 里的素材，再全部重做（CI 用这个）
  python3 scripts/build-art.py --fetch --strict  # 下载失败就报错退出（发版用，免得悄悄发了个没有立绘的版本）
  python3 scripts/build-art.py                   # 只用 art/ 里已有的图重做
  python3 scripts/build-art.py --check           # 只检查文件名、尺寸，不写文件
"""
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art')
SOURCES = os.path.join(SRC, 'sources.json')
CACHE = os.environ.get('ART_CACHE_DIR') or os.path.join(ROOT, '.art-cache')
OUT = os.path.join(ROOT, 'web', 'img', 'cast')
MANIFEST = os.path.join(OUT, 'manifest.js')
FACES = ['calm', 'happy', 'shy', 'worried', 'smug', 'surprised', 'pout', 'love', 'sleepy', 'sparkle', 'full', 'cry', 'cryhappy']
BGS = ['room', 'roomnight', 'gym', 'pool', 'studio', 'cafe', 'street', 'citynight', 'rain', 'night', 'dusk', 'dawn', 'stage']
CHARS = ['jx', 'xy']
EXT = ('.png', '.jpg', '.jpeg', '.webp')


def cg_ids():
    """主线剧本里定义了哪些 CG（名字对不上的图不收）"""
    text = ''.join(open(os.path.join(ROOT, 'web', 'js', 'app', f), encoding='utf-8').read() for f in ('script_jx.js', 'script_xy.js'))
    return set(re.findall(r"'((?:jx|xy)-[a-z0-9]+)':\s*\{\s*title", text))


def files(d):
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f.lower().endswith(EXT))


def sources():
    if not os.path.exists(SOURCES):
        return {}
    return json.load(open(SOURCES, encoding='utf-8')).get('cast', {})


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 16), b''):
            h.update(block)
    return h.hexdigest()


def download(url, out):
    """下载到 out（先写临时文件），失败重试三次"""
    tmp = out + '.part'
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'TrainFit-build-art/1.0'})
            with urllib.request.urlopen(req, timeout=60) as r, open(tmp, 'wb') as f:
                shutil.copyfileobj(r, f)
            os.replace(tmp, out)
            return True
        except Exception as e:  # noqa: BLE001 网络错误都重试
            print(f'  下载失败（{e}），{2 ** (i + 1)} 秒后重试' if i < 3 else f'  下载失败（{e}）')
            if i < 3:
                time.sleep(2 ** (i + 1))
    return False


def blush(im, spots, strength=0.5, color=(255, 150, 160)):
    """在脸颊上加腮红：spots 是 [中心 x, 中心 y, 横半径, 竖半径]（原图坐标），只染皮肤（亮、偏暖、不透明），不染头发和眼白"""
    from PIL import Image, ImageChops, ImageDraw, ImageFilter
    r, g, b, a = im.split()

    def over(band, t):
        return band.point(lambda v: 255 if v > t else 0)

    skin = over(r, 225)
    for m in (over(g, 195), over(b, 185), over(ImageChops.subtract(r, b), 6), over(a, 240)):
        skin = ImageChops.multiply(skin, m)
    skin = skin.filter(ImageFilter.GaussianBlur(0.6))
    spot = Image.new('L', im.size, 0)
    draw = ImageDraw.Draw(spot)
    for cx, cy, rx, ry in spots:
        draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    spot = spot.filter(ImageFilter.GaussianBlur(3))
    mask = ImageChops.multiply(spot, skin).point(lambda v: int(v * strength))
    rgb = im.convert('RGB')
    tinted = ImageChops.multiply(rgb, Image.new('RGB', im.size, color))
    out = Image.composite(tinted, rgb, mask).convert('RGBA')
    out.putalpha(a)
    return out


def tears(im, spots, color=(150, 205, 255)):
    """加眼泪（条款允许「涙や頬紅などを自分で書き加える」）：spots 是 [眼角 x, 眼角 y, 往下流多长, 往外偏多少]（原图坐标）。
    画成一道半透明的泪痕 + 一颗泪珠 + 下眼睑一点水光，先放大 4 倍画再缩回去，边缘才不糙"""
    from PIL import Image, ImageDraw, ImageFilter
    k = 4
    w, h = im.size
    layer = Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for sp in spots:
        x, y, length = sp[0], sp[1], sp[2]
        drift = sp[3] if len(sp) > 3 else 0
        n = 24
        pts_l, pts_r, mid = [], [], []
        for i in range(n + 1):
            t = i / n
            cx = (x + drift * t * t) * k
            cy = (y + length * t) * k
            half = (1.45 - 0.6 * t) * k
            pts_l.append((cx - half, cy))
            pts_r.append((cx + half, cy))
            mid.append((cx - half * 0.35, cy))
        d.polygon(pts_l + pts_r[::-1], fill=color + (120,))
        d.line(mid[2:-3], fill=(255, 255, 255, 170), width=max(1, int(0.7 * k)))
        ex, ey = (x + drift) * k, (y + length) * k
        r = 2.5 * k
        d.ellipse([ex - r, ey - r * 1.1, ex + r, ey + r * 1.25], fill=color + (190,), outline=(90, 150, 210, 170), width=max(1, int(0.5 * k)))
        d.ellipse([ex - r * 0.55, ey - r * 0.7, ex - r * 0.05, ey - r * 0.15], fill=(255, 255, 255, 230))
        d.ellipse([(x - 6) * k, (y - 1.6) * k, (x + 6) * k, (y + 1.4) * k], fill=color + (95,))
    layer = layer.filter(ImageFilter.GaussianBlur(0.35 * k)).resize((w, h), Image.LANCZOS)
    out = im.copy()
    out.alpha_composite(layer)
    return out


def fetch(strict):
    """按 art/sources.json 下载素材、取表情 → art/<人>/face-*.png。返回下好的人"""
    from PIL import Image
    os.makedirs(CACHE, exist_ok=True)
    done = []
    for ch, s in sources().items():
        zpath = os.path.join(CACHE, os.path.basename(s['zip']))
        if not (os.path.exists(zpath) and sha256(zpath) == s['sha256']):
            print(f'下载 {ch}：{s["title"]}')
            if not download(s['zip'], zpath) or sha256(zpath) != s['sha256']:
                msg = f'{ch} 的素材没下好（{s["zip"]}），这个人在剧场里先用像素小人'
                if os.path.exists(zpath) and sha256(zpath) != s['sha256']:
                    msg = f'{ch} 的素材和记下的 sha256 不一样（画师可能更新了），先看一眼新图再改 art/sources.json'
                if strict:
                    sys.exit('✗ ' + msg)
                print(f'::warning title=剧场立绘::{msg}')
                continue
        os.makedirs(os.path.join(SRC, ch), exist_ok=True)
        with zipfile.ZipFile(zpath) as z:
            for face, spec in s['faces'].items():
                letter, *mods = spec.split('+')
                im = Image.open(io.BytesIO(z.read(s['pattern'] % letter))).convert('RGBA')
                if 'blush' in mods:
                    im = blush(im, s.get('blush') or [])
                if 'tears' in mods:
                    im = tears(im, (s.get('tears') or {}).get(letter) or [])
                im.save(os.path.join(SRC, ch, f'face-{face}.png'))
            # 眨眼（v8.0）：闭眼那张存成 blink.png，眼睛在哪、哪些表情本来就闭着眼写进 eyes.json
            if s.get('blink') and s.get('eyes'):
                Image.open(io.BytesIO(z.read(s['pattern'] % s['blink']))).convert('RGBA').save(os.path.join(SRC, ch, 'blink.png'))
                closed = set(s.get('closed') or [])
                # 带眼泪的也不眨（闭眼那张没有眼泪，一眨泪痕就断了）
                noblink = [f for f, spec in s['faces'].items() if spec.split('+')[0] in closed or 'tears' in spec]
                json.dump({'eyes': s['eyes'], 'noblink': noblink}, open(os.path.join(SRC, ch, 'eyes.json'), 'w'))
        done.append(ch)
        print(f'  {ch}：{len(s["faces"])} 个表情')
    return done


def main():
    check = '--check' in sys.argv
    if '--fetch' in sys.argv and not check:
        fetch('--strict' in sys.argv)
    problems = []
    plan = []  # (源文件, 输出相对路径, 种类)
    ids = cg_ids()
    for ch in CHARS:
        for f in files(os.path.join(SRC, ch)):
            if re.match(r'blink\.', f):
                plan.append((os.path.join(SRC, ch, f), f'{ch}/blink.webp', 'face'))
                continue
            m = re.match(r'face-([a-z]+)\.', f)
            if not m or m.group(1) not in FACES:
                problems.append(f'art/{ch}/{f}：立绘要叫 face-<表情>.png，表情是 {", ".join(FACES)}')
                continue
            plan.append((os.path.join(SRC, ch, f), f'{ch}/face-{m.group(1)}.webp', 'face'))
        for f in files(os.path.join(SRC, ch, 'cg')):
            name = os.path.splitext(f)[0]
            if name not in ids:
                problems.append(f'art/{ch}/cg/{f}：主线剧本里没有叫 {name} 的 CG')
                continue
            plan.append((os.path.join(SRC, ch, 'cg', f), f'{ch}/cg/{name}.webp', 'cg'))
    for f in files(os.path.join(SRC, 'bg')):
        name = os.path.splitext(f)[0]
        if name not in BGS:
            problems.append(f'art/bg/{f}：背景名要是 {", ".join(BGS)} 之一')
            continue
        plan.append((os.path.join(SRC, 'bg', f), f'bg/{name}.webp', 'bg'))
    for ch in CHARS:
        faces = [p for p in plan if p[2] == 'face' and p[1].startswith(ch + '/') and not p[1].endswith('/blink.webp')]
        if faces and not any(p[1].endswith('face-calm.webp') for p in faces):
            problems.append(f'art/{ch}/：有立绘但缺 face-calm（平静），别的表情没有时都退回它')

    try:
        from PIL import Image
    except ImportError:
        Image = None
        if plan and not check:
            sys.exit('先 pip install pillow')

    # 同一个人的立绘按所有表情透明边的并集裁（只换脸的差分裁法要一样，不然换表情时人会跳）
    sizes, boxes = {}, {}
    for src, rel, kind in plan:
        if not Image or kind != 'face':
            continue
        im = Image.open(src)
        if im.mode not in ('RGBA', 'LA') and 'transparency' not in im.info:
            problems.append(f'{os.path.relpath(src, ROOT)}：立绘要透明底')
            continue
        ch = rel.split('/')[0]
        sizes.setdefault(ch, set()).add(im.size)
        bb = im.convert('RGBA').getchannel('A').getbbox()
        if bb:
            old = boxes.get(ch)
            boxes[ch] = bb if not old else (min(old[0], bb[0]), min(old[1], bb[1]), max(old[2], bb[2]), max(old[3], bb[3]))
    for ch, s in sizes.items():
        if len(s) > 1:
            problems.append(f'art/{ch}/ 的立绘大小不一样（{sorted(s)}），换表情时人会跳')

    dims = {}
    for src, rel, kind in plan:
        if not Image:
            break
        im = Image.open(src)
        if kind != 'face' and im.size[0] / im.size[1] > 0.7:
            problems.append(f'{os.path.relpath(src, ROOT)}：CG / 背景要竖屏（9:16 左右），现在是 {im.size[0]}×{im.size[1]}')
        if check:
            continue
        im = im.convert('RGBA' if kind == 'face' else 'RGB')
        if kind == 'face':
            ch = rel.split('/')[0]
            if ch in boxes:
                im = im.crop(boxes[ch])
            limit = (1400 * im.size[0] // im.size[1], 1400)
        else:
            limit = (1080, 1920)
        im.thumbnail(limit, Image.LANCZOS)
        if kind == 'face':
            dims[rel.split('/')[0]] = list(im.size)
        out = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, 'WEBP', quality=88, method=6)

    for p in problems:
        print('⚠ ' + p)
    if check:
        print(f'检查完：{len(plan)} 张能用，{len(problems)} 个问题')
        return

    manifest = {'cast': {}, 'bg': {}, 'credits': []}
    src_info = sources()
    for src, rel, kind in plan:
        url = 'img/cast/' + rel
        if kind == 'bg':
            manifest['bg'][os.path.splitext(os.path.basename(rel))[0]] = url
        else:
            ch = rel.split('/')[0]
            box = manifest['cast'].setdefault(ch, {'face': {}, 'cg': {}})
            key = os.path.splitext(os.path.basename(rel))[0]
            if kind == 'face' and key == 'blink':
                # 眨眼：闭眼那张 + 眼睛那块在裁好的图里的位置（clip-path: inset 上 右 下 左，百分比）
                eyes_file = os.path.join(SRC, ch, 'eyes.json')
                if ch in boxes and os.path.exists(eyes_file):
                    e = json.load(open(eyes_file))
                    x0, y0, x1, y1 = boxes[ch]
                    w, h = x1 - x0, y1 - y0
                    ex0, ey0, ex1, ey1 = e['eyes']
                    pct = lambda v: f'{max(0.0, min(100.0, v * 100)):.2f}%'
                    box['blink'] = url
                    box['eyes'] = ' '.join([pct((ey0 - y0) / h), pct((x1 - ex1) / w), pct((y1 - ey1) / h), pct((ex0 - x0) / w)])
                    box['noblink'] = e.get('noblink', [])
            elif kind == 'face':
                box['face'][key.replace('face-', '')] = url
                if ch in dims:
                    box['size'] = dims[ch]
            else:
                box['cg'][key] = url
    # 署名：立绘来自 sources.json 的写上画师（条款不强制，但该写）
    for ch in CHARS:
        s = src_info.get(ch)
        if s and manifest['cast'].get(ch, {}).get('face'):
            line = {'who': ch, 'what': '立绘', 'credit': s['credit'], 'url': s['page']}
            manifest['credits'].append(line)
    os.makedirs(OUT, exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('// 美术清单：scripts/build-art.py 生成，不要手改，不进仓库。没有这个文件时剧场用像素小人和 CSS 背景。\n')
        f.write('(function (root) {\n  (root.TF = root.TF || {}).ArtManifest = ')
        f.write(json.dumps(manifest, ensure_ascii=False, indent=2).replace('\n', '\n  '))
        f.write(';\n})(typeof window !== \'undefined\' ? window : globalThis);\n')
    n = {k: sum(1 for p in plan if p[2] == k) for k in ('face', 'cg', 'bg')}
    print(f'好了：立绘 {n["face"]} 张、CG {n["cg"]} 张、背景 {n["bg"]} 张 → web/img/cast/（清单 manifest.js）')


if __name__ == '__main__':
    main()
