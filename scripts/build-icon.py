#!/usr/bin/env python3
"""
生成 App 图标：绿色底，一只白碗，碗上冒的热气画成语音波形（「说一句话，记下吃了啥」）。

  python3 scripts/build-icon.py                     # 写入 app/src/main/res/
  python3 scripts/build-icon.py --preview out.png   # 只出预览图（圆形 / 圆角方形、各种尺寸，浅色和深色底各一张）
  python3 scripts/build-icon.py --web               # 打印网页里用的标志路径（web/js/app/util.js 的 BRAND_PATHS）

输出：
  drawable/ic_launcher_foreground.xml   标志（矢量，自适应图标前景，108dp 画布，缩到 66dp 安全区里）
  drawable/ic_launcher_background.xml   绿色渐变
  drawable/ic_launcher_monochrome.xml   Android 13 主题图标用的单色版
  mipmap-*/ic_launcher(.webp|_round.webp)  Android 8 以下用的位图
只需要 Pillow。
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')

BG_TOP, BG_BOTTOM = '#2fcf98', '#06875f'
SCALE = 0.86   # 标志整体缩一点，四周留白
# 标志的形状，坐标在 108×108 画布上（缩放前）
RIM = (28, 55, 80, 59.5, 2.25)                 # 碗沿：圆角矩形 x0 y0 x1 y1 r
BOWL = (54, 57, 23)                            # 碗身：下半圆 cx cy r
FOOT = (46, 78, 62, 83, 1.5)                   # 碗底
BAR_W, BAR_BOTTOM = 5.2, 49
BARS = [(38, 12), (46, 22), (54, 15), (62, 26), (70, 11)]   # 热气 / 声波：x, 高


def f(x):
    return ('%.2f' % x).rstrip('0').rstrip('.')


def rr_path(x0, y0, x1, y1, r):
    return (f'M{f(x0 + r)},{f(y0)}H{f(x1 - r)}A{f(r)},{f(r)} 0 0 1 {f(x1)},{f(y0 + r)}V{f(y1 - r)}'
            f'A{f(r)},{f(r)} 0 0 1 {f(x1 - r)},{f(y1)}H{f(x0 + r)}A{f(r)},{f(r)} 0 0 1 {f(x0)},{f(y1 - r)}'
            f'V{f(y0 + r)}A{f(r)},{f(r)} 0 0 1 {f(x0 + r)},{f(y0)}Z')


def shapes():
    """[(种类, 参数)]，缩放前"""
    out = [('rr', RIM), ('half', BOWL), ('rr', FOOT)]
    for cx, h in BARS:
        out.append(('rr', (cx - BAR_W / 2, BAR_BOTTOM - h, cx + BAR_W / 2, BAR_BOTTOM, BAR_W / 2)))
    return out


def path_list():
    ps = []
    for kind, p in shapes():
        if kind == 'rr':
            ps.append(rr_path(*p))
        else:
            cx, cy, r = p   # 从右往左，顺时针经过下面
            ps.append(f'M{f(cx + r)},{f(cy)}A{f(r)},{f(r)} 0 0 1 {f(cx - r)},{f(cy)}Z')
    return ps


def vector(fill, comment):
    body = '\n'.join(f'        <path android:fillColor="{fill}" android:pathData="{d}" />' for d in path_list())
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            f'<!-- {comment}。由 scripts/build-icon.py 生成，不要手改 -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="108dp"\n    android:height="108dp"\n'
            '    android:viewportWidth="108"\n    android:viewportHeight="108">\n'
            f'    <group android:pivotX="54" android:pivotY="54" android:scaleX="{SCALE}" android:scaleY="{SCALE}">\n'
            f'{body}\n    </group>\n</vector>\n')


def write_vectors():
    bg = ('<?xml version="1.0" encoding="utf-8"?>\n'
          '<!-- 启动图标背景：品牌绿渐变。由 scripts/build-icon.py 生成，不要手改 -->\n'
          '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
          '    xmlns:aapt="http://schemas.android.com/aapt"\n'
          '    android:width="108dp"\n    android:height="108dp"\n'
          '    android:viewportWidth="108"\n    android:viewportHeight="108">\n'
          '    <path android:pathData="M0,0h108v108h-108z">\n'
          '        <aapt:attr name="android:fillColor">\n'
          '            <gradient android:type="linear" android:startX="0" android:startY="0" android:endX="0" android:endY="108">\n'
          f'                <item android:color="{BG_TOP.upper()}" android:offset="0.0" />\n'
          f'                <item android:color="{BG_BOTTOM.upper()}" android:offset="1.0" />\n'
          '            </gradient>\n        </aapt:attr>\n    </path>\n</vector>\n')
    d = os.path.join(RES, 'drawable')
    for name, text in (('ic_launcher_foreground.xml', vector('#FFFFFFFF', '启动图标前景：碗 + 声波热气')),
                       ('ic_launcher_background.xml', bg),
                       ('ic_launcher_monochrome.xml', vector('#FFFFFFFF', '主题图标（单色）'))):
        with open(os.path.join(d, name), 'w', encoding='utf-8') as fh:
            fh.write(text)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def render_full(size):
    """整张 108dp 画布（背景 + 标志）画成 size×size，先放大 8 倍画再缩小"""
    ss = 8
    big = size * ss
    k = big / 108
    im = Image.new('RGB', (big, big))
    dr = ImageDraw.Draw(im)
    top, bot = hex_rgb(BG_TOP), hex_rgb(BG_BOTTOM)
    for y in range(big):
        t = y / (big - 1)
        dr.line([(0, y), (big, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    tr = lambda v: (54 + (v - 54) * SCALE) * k   # 以中心缩放
    for kind, p in shapes():
        if kind == 'rr':
            x0, y0, x1, y1, r = p
            dr.rounded_rectangle([tr(x0), tr(y0), tr(x1), tr(y1)], radius=r * SCALE * k, fill='white')
        else:
            cx, cy, r = p
            dr.pieslice([tr(cx - r), tr(cy - r), tr(cx + r), tr(cy + r)], 0, 180, fill='white')
    return im.resize((size, size), Image.LANCZOS)


def legacy(size, round_mask):
    """Android 8 以下的图标：取中间 72dp（自适应图标可见的部分），裁成圆角方形或圆形"""
    full = render_full(round(size * 108 / 72))
    off = (full.width - size) // 2
    im = full.crop((off, off, off + size, off + size)).convert('RGBA')
    ss = 4
    mask = Image.new('L', (size * ss, size * ss), 0)
    md = ImageDraw.Draw(mask)
    if round_mask:
        md.ellipse([0, 0, size * ss - 1, size * ss - 1], fill=255)
    else:
        md.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=size * ss * 0.22, fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--web':
        print(',\n'.join(f"  '{d}'" for d in path_list()))
        return
    if len(sys.argv) > 2 and sys.argv[1] == '--preview':
        tiles = [legacy(s, r) for s in (192, 96, 48) for r in (False, True)]
        W = sum(t.width for t in tiles) + 20 * (len(tiles) + 1)
        for bg in ('#f3f3f1', '#0b0b0d'):
            sheet = Image.new('RGBA', (W, 212), bg)
            x = 20
            for t in tiles:
                sheet.alpha_composite(t, (x, 10))
                x += t.width + 20
            sheet.convert('RGB').save(sys.argv[2].replace('.png', '_' + bg.strip('#') + '.png'))
        return
    write_vectors()
    for dpi, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        d = os.path.join(RES, 'mipmap-' + dpi)
        legacy(size, False).save(os.path.join(d, 'ic_launcher.webp'), 'WEBP', lossless=True)
        legacy(size, True).save(os.path.join(d, 'ic_launcher_round.webp'), 'WEBP', lossless=True)
    print('图标已写入', RES)


if __name__ == '__main__':
    main()
