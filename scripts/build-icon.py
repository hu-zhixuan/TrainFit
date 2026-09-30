#!/usr/bin/env python3
"""
生成 App 图标：顶栏那个像素小人（web/js/app/buddy.js）的上半身 + 品牌绿背景。

  python3 scripts/build-icon.py            # 写入 app/src/main/res/
  python3 scripts/build-icon.py --preview out.png   # 只出一张预览图（圆形 / 圆角方形 / 各种尺寸）

输出：
  drawable/ic_launcher_foreground.xml   小人（矢量，自适应图标前景，108dp 画布，头在 66dp 安全区里）
  drawable/ic_launcher_background.xml   绿色渐变
  drawable/ic_launcher_monochrome.xml   Android 13 主题图标用的单色版
  mipmap-*/ic_launcher(.webp|_round.webp)  Android 8 以下用的位图
需要 node（读 buddy.js 拼像素图）和 Pillow。
"""
import json, os, subprocess, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')

U = 2.9            # 一个像素在 108dp 画布上多大
ART_X = 54 - 8 * U  # 小人 16 像素宽，居中
ART_Y = 29          # 头顶的位置；身子往下一直画出画布
EXTRA_ROWS = 8      # 身子往下多画几行，铺到画布底边
BG_TOP, BG_BOTTOM = '#2fcf98', '#06875f'
OVERLAP = 0.04      # 相邻色块稍微叠一点，矢量渲染时不露缝


def compose():
    js = ("const B=require(%s);const o=B.compose({mood:'good',noFx:true,gear:[]});"
          "process.stdout.write(JSON.stringify({px:o.px.map(r=>r.join('')),colors:o.colors,m:3}))") % json.dumps(os.path.join(ROOT, 'web/js/app/buddy.js'))
    o = json.loads(subprocess.check_output(['node', '-e', js]))
    rows = o['px'] + [o['px'][-1]] * EXTRA_ROWS
    return rows, o['colors'], o['m']


def rects(rows, m):
    """每一行横着连成段：(颜色代码, x, y, 宽, 高)，坐标是 108dp 画布上的"""
    out = []
    for gy, row in enumerate(rows):
        gx = 0
        while gx < len(row):
            c = row[gx]
            n = 1
            while gx + n < len(row) and row[gx + n] == c:
                n += 1
            if c != '.':
                out.append((c, ART_X + (gx - m) * U, ART_Y + (gy - m) * U, n * U, U))
            gx += n
    return out


def f(x):
    return ('%.2f' % x).rstrip('0').rstrip('.')


def vector(paths_by_fill, comment):
    body = '\n'.join(
        '    <path android:fillColor="%s" android:pathData="%s" />' % (fill, d) for fill, d in paths_by_fill)
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<!-- %s。由 scripts/build-icon.py 生成，不要手改 -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="108dp"\n    android:height="108dp"\n'
            '    android:viewportWidth="108"\n    android:viewportHeight="108">\n%s\n</vector>\n') % (comment, body)


def path_data(rs):
    return ''.join('M%s,%sh%sv%sh-%sz' % (f(x), f(y), f(w + OVERLAP), f(h + OVERLAP), f(w + OVERLAP)) for _, x, y, w, h in rs)


def write_vectors(rows, colors, m):
    rs = [r for r in rects(rows, m) if r[2] < 108]
    by = {}
    for r in rs:
        by.setdefault(r[0], []).append(r)
    # 描边先画，别的颜色压在上面
    order = sorted(by, key=lambda c: 0 if c == 'O' else 1)
    fg = vector([(colors[c], path_data(by[c])) for c in order], '启动图标前景：像素小人')
    # 单色版：深色的（头发、描边、衣服、眼睛、嘴）实心，浅色的（皮肤、白色）半透明
    light = set('SsPWw')
    mono = vector([('#FFFFFFFF', path_data([r for r in rs if r[0] not in light])),
                   ('#66FFFFFF', path_data([r for r in rs if r[0] in light]))], '主题图标（单色）')
    bg = ('<?xml version="1.0" encoding="utf-8"?>\n'
          '<!-- 启动图标背景：品牌绿渐变。由 scripts/build-icon.py 生成，不要手改 -->\n'
          '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
          '    xmlns:aapt="http://schemas.android.com/aapt"\n'
          '    android:width="108dp"\n    android:height="108dp"\n'
          '    android:viewportWidth="108"\n    android:viewportHeight="108">\n'
          '    <path android:pathData="M0,0h108v108h-108z">\n'
          '        <aapt:attr name="android:fillColor">\n'
          '            <gradient android:type="linear" android:startX="0" android:startY="0" android:endX="0" android:endY="108">\n'
          '                <item android:color="%s" android:offset="0.0" />\n'
          '                <item android:color="%s" android:offset="1.0" />\n'
          '            </gradient>\n        </aapt:attr>\n    </path>\n</vector>\n') % (BG_TOP.upper(), BG_BOTTOM.upper())
    d = os.path.join(RES, 'drawable')
    for name, text in (('ic_launcher_foreground.xml', fg), ('ic_launcher_background.xml', bg), ('ic_launcher_monochrome.xml', mono)):
        with open(os.path.join(d, name), 'w', encoding='utf-8') as fh:
            fh.write(text)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def render_full(rows, colors, m, size):
    """整张 108dp 画布（背景 + 小人）画成 size×size 的位图，先放大 8 倍画再缩小，边缘平滑"""
    ss = 8
    big = size * ss
    k = big / 108
    im = Image.new('RGB', (big, big))
    top, bot = hex_rgb(BG_TOP), hex_rgb(BG_BOTTOM)
    dr = ImageDraw.Draw(im)
    for y in range(big):
        t = y / (big - 1)
        dr.line([(0, y), (big, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bot)))
    for c, x, y, w, h in rects(rows, m):
        dr.rectangle([round(x * k), round(y * k), round((x + w) * k) - 1, round((y + h) * k) - 1], fill=colors[c])
    return im.resize((size, size), Image.LANCZOS)


def legacy(rows, colors, m, size, round_mask):
    """Android 8 以下的图标：取中间 72dp（自适应图标可见的部分），裁成圆角方形或圆形"""
    full = render_full(rows, colors, m, round(size * 108 / 72))
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
    rows, colors, m = compose()
    if len(sys.argv) > 2 and sys.argv[1] == '--preview':
        tiles = [legacy(rows, colors, m, s, r) for s in (192, 96, 48) for r in (False, True)]
        W = sum(t.width for t in tiles) + 20 * (len(tiles) + 1)
        for bg in ('#f3f3f1', '#0b0b0d'):
            sheet = Image.new('RGBA', (W, 212), bg)
            x = 20
            for t in tiles:
                sheet.alpha_composite(t, (x, 10))
                x += t.width + 20
            sheet.convert('RGB').save(sys.argv[2].replace('.png', '_' + bg.strip('#') + '.png'))
        return
    write_vectors(rows, colors, m)
    for dpi, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        d = os.path.join(RES, 'mipmap-' + dpi)
        legacy(rows, colors, m, size, False).save(os.path.join(d, 'ic_launcher.webp'), 'WEBP', lossless=True)
        legacy(rows, colors, m, size, True).save(os.path.join(d, 'ic_launcher_round.webp'), 'WEBP', lossless=True)
    print('图标已写入', RES)


if __name__ == '__main__':
    main()
