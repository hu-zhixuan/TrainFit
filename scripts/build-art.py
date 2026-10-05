#!/usr/bin/env python3
"""
剧场美术（立绘 / CG / 背景）→ 压成 webp 放进 web/img/cast/，生成清单 web/js/data/art_manifest.js（v7.1）。

原图放在仓库根目录的 art/ 里（png / jpg / webp 都行，原图可以很大，不进安装包）：
  art/jx/face-calm.png         江叙的立绘，一个表情一张：calm 平静 / happy 开心 / shy 害羞 / worried 担心 / smug 得意 /
                               surprised 惊讶 / pout 不服 / love 心动 / sleepy 困 / sparkle 闪亮 / full 撑（至少要 calm）
  art/xy/face-calm.png         夏柚，同上
  art/jx/cg/jx-pool6.png       CG，名字和 web/js/app/cast_main.js 里 cgs 的键一样
  art/bg/pool.png              背景：room roomnight gym pool studio cafe street citynight rain night dusk dawn stage

立绘要透明底（png / webp 带透明），所有表情同一个姿势、同一个大小、人物站的位置一样，只换脸；
CG 和背景竖屏 9:16（至少 1080×1920）。脚本：立绘缩到高 1400、CG / 背景缩到 1080×1920 以内，压成 webp。

  pip install pillow
  python3 scripts/build-art.py          # 全部重做
  python3 scripts/build-art.py --check  # 只检查文件名、尺寸，不写文件
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art')
OUT = os.path.join(ROOT, 'web', 'img', 'cast')
MANIFEST = os.path.join(ROOT, 'web', 'js', 'data', 'art_manifest.js')
FACES = ['calm', 'happy', 'shy', 'worried', 'smug', 'surprised', 'pout', 'love', 'sleepy', 'sparkle', 'full']
BGS = ['room', 'roomnight', 'gym', 'pool', 'studio', 'cafe', 'street', 'citynight', 'rain', 'night', 'dusk', 'dawn', 'stage']
CHARS = ['jx', 'xy']
EXT = ('.png', '.jpg', '.jpeg', '.webp')


def cg_ids():
    """cast_main.js 里定义了哪些 CG（名字对不上的图不收）"""
    text = open(os.path.join(ROOT, 'web', 'js', 'app', 'cast_main.js'), encoding='utf-8').read()
    return set(re.findall(r"'((?:jx|xy)-[a-z0-9]+)':\s*\{\s*title", text))


def files(d):
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if f.lower().endswith(EXT))


def main():
    check = '--check' in sys.argv
    problems = []
    plan = []  # (源文件, 输出相对路径, 种类)
    ids = cg_ids()
    for ch in CHARS:
        for f in files(os.path.join(SRC, ch)):
            m = re.match(r'face-([a-z]+)\.', f)
            if not m or m.group(1) not in FACES:
                problems.append(f'art/{ch}/{f}：立绘要叫 face-<表情>.png，表情是 {", ".join(FACES)}')
                continue
            plan.append((os.path.join(SRC, ch, f), f'{ch}/face-{m.group(1)}.webp', 'face'))
        for f in files(os.path.join(SRC, ch, 'cg')):
            name = os.path.splitext(f)[0]
            if name not in ids:
                problems.append(f'art/{ch}/cg/{f}：cast_main.js 里没有叫 {name} 的 CG')
                continue
            plan.append((os.path.join(SRC, ch, 'cg', f), f'{ch}/cg/{name}.webp', 'cg'))
    for f in files(os.path.join(SRC, 'bg')):
        name = os.path.splitext(f)[0]
        if name not in BGS:
            problems.append(f'art/bg/{f}：背景名要是 {", ".join(BGS)} 之一')
            continue
        plan.append((os.path.join(SRC, 'bg', f), f'bg/{name}.webp', 'bg'))
    for ch in CHARS:
        faces = [p for p in plan if p[2] == 'face' and p[1].startswith(ch + '/')]
        if faces and not any(p[1].endswith('face-calm.webp') for p in faces):
            problems.append(f'art/{ch}/：有立绘但缺 face-calm（平静），别的表情没有时都退回它')

    try:
        from PIL import Image
    except ImportError:
        Image = None
        if plan and not check:
            sys.exit('先 pip install pillow')

    sizes = {}
    for src, rel, kind in plan:
        if not Image:
            break
        im = Image.open(src)
        if kind == 'face':
            if im.mode not in ('RGBA', 'LA') and 'transparency' not in im.info:
                problems.append(f'{os.path.relpath(src, ROOT)}：立绘要透明底')
            sizes.setdefault(rel.split('/')[0], set()).add(im.size)
        elif im.size[0] / im.size[1] > 0.7:
            problems.append(f'{os.path.relpath(src, ROOT)}：CG / 背景要竖屏（9:16 左右），现在是 {im.size[0]}×{im.size[1]}')
        if check:
            continue
        im = im.convert('RGBA' if kind == 'face' else 'RGB')
        limit = (1400 * im.size[0] // im.size[1], 1400) if kind == 'face' else (1080, 1920)
        im.thumbnail(limit, Image.LANCZOS)
        out = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, 'WEBP', quality=84, method=6)
    for ch, s in sizes.items():
        if len(s) > 1:
            problems.append(f'art/{ch}/ 的立绘大小不一样（{sorted(s)}），换表情时人会跳')

    for p in problems:
        print('⚠ ' + p)
    if check:
        print(f'检查完：{len(plan)} 张能用，{len(problems)} 个问题')
        return

    manifest = {'cast': {}, 'bg': {}}
    for src, rel, kind in plan:
        url = 'img/cast/' + rel
        if kind == 'bg':
            manifest['bg'][os.path.splitext(os.path.basename(rel))[0]] = url
        else:
            ch = rel.split('/')[0]
            box = manifest['cast'].setdefault(ch, {'face': {}, 'cg': {}})
            key = os.path.splitext(os.path.basename(rel))[0]
            if kind == 'face':
                box['face'][key.replace('face-', '')] = url
            else:
                box['cg'][key] = url
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('// 美术清单：scripts/build-art.py 按 web/img/cast/ 里的图片生成，不要手改。还没有图时是空的，剧场用像素小人和 CSS 背景。\n')
        f.write('(function (root) {\n  (root.TF = root.TF || {}).ArtManifest = ')
        f.write(json.dumps(manifest, ensure_ascii=False, indent=2).replace('\n', '\n  '))
        f.write(';\n})(typeof window !== \'undefined\' ? window : globalThis);\n')
    n = {k: sum(1 for p in plan if p[2] == k) for k in ('face', 'cg', 'bg')}
    print(f'好了：立绘 {n["face"]} 张、CG {n["cg"]} 张、背景 {n["bg"]} 张 → web/img/cast/，清单写进 web/js/data/art_manifest.js')


if __name__ == '__main__':
    main()
