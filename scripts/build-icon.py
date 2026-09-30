#!/usr/bin/env python3
"""
生成 App 图标：深绿色底，一片发光的叶子（健康饮食），旁边一颗小星光（AI）。

  python3 scripts/build-icon.py                     # 写入 app/src/main/res/
  python3 scripts/build-icon.py --preview out.png   # 只出预览图（圆角方形 / 圆形、各种尺寸，浅色和深色桌面各一张）

设计稿就是下面的 SVG（坐标在自适应图标的 108×108 画布上，中间 72×72 是能看到的部分，66×66 是安全区）。
叶子有模糊光晕，矢量图画不了，所以用 Chromium（Playwright）把 SVG 渲染成位图：
  mipmap-*/ic_launcher_foreground.webp、ic_launcher_background.webp   自适应图标的前景、背景（108dp）
  mipmap-*/ic_launcher.webp、ic_launcher_round.webp                    Android 8 以下的图标（48dp）
  drawable/ic_launcher_monochrome.xml                                  Android 13 主题图标（单色矢量）
网页里的同款小图标（引导页、分享图片）在 web/js/app/util.js 的 BRAND，形状和这里一致，改了要一起改。
需要 Pillow 和 Playwright（python），Chromium 路径见 CHROMIUM。
"""
import io, os, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')
CHROMIUM = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome')

LEAF = 'M36,72 C36,49 50,36 74,34 C72,58 59,72 36,72 Z'
STEM = 'M36,72 C34,74 32,75.3 29.4,75.8 C28.9,75.9 28.7,75.2 29.2,75 C31.5,74.2 33.3,72.8 34.9,71 Z'
RIB = 'M38,69.8 C47,61 56,51 68.5,40.5 C69.1,40 69.9,40.8 69.4,41.4 C58,52.5 48.5,62.5 39.6,71.4 Z'
SPARK = 'M0,-6 C0.6,-1.4 1.4,-0.6 6,0 C1.4,0.6 0.6,1.4 0,6 C-0.6,1.4 -1.4,0.6 -6,0 C-1.4,-0.6 -0.6,-1.4 0,-6 Z'
SPARK_AT = (40, 40, 0.9)   # 星光位置、大小

DEFS = '''<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16473a"/><stop offset="1" stop-color="#061510"/></linearGradient>
  <radialGradient id="glow" cx="0.28" cy="0.18" r="0.95"><stop offset="0" stop-color="#3a9a74" stop-opacity="0.45"/><stop offset="1" stop-color="#3a9a74" stop-opacity="0"/></radialGradient>
  <linearGradient id="leaf" x1="0.1" y1="0.05" x2="0.9" y2="1"><stop offset="0" stop-color="#b6f5d8"/><stop offset="0.42" stop-color="#3ddc9f"/><stop offset="1" stop-color="#079669"/></linearGradient>
  <linearGradient id="shine" x1="0.05" y1="0" x2="0.55" y2="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.6"/><stop offset="0.55" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="shade" cx="0.85" cy="0.9" r="0.6"><stop offset="0" stop-color="#034d36" stop-opacity="0.35"/><stop offset="1" stop-color="#034d36" stop-opacity="0"/></radialGradient>
  <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5"/></filter>
  <filter id="sglow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.4"/></filter>
</defs>'''


def layer_bg():
    return '<rect width="108" height="108" fill="url(#bg)"/><rect width="108" height="108" fill="url(#glow)"/>'


def layer_fg():
    sx, sy, ss = SPARK_AT
    return (f'<path d="{LEAF}" fill="#10b981" opacity="0.5" filter="url(#soft)" transform="translate(0 3.5)"/>'
            f'<path d="{STEM}" fill="#079669"/>'
            f'<path d="{LEAF}" fill="url(#leaf)"/><path d="{LEAF}" fill="url(#shade)"/><path d="{LEAF}" fill="url(#shine)"/>'
            f'<path d="{RIB}" fill="#046c4c" opacity="0.55"/>'
            f'<g transform="translate({sx} {sy}) scale({ss})"><path d="{SPARK}" fill="#eafff5" opacity="0.7" filter="url(#sglow)"/><path d="{SPARK}" fill="#fff"/></g>')


def svg(content, view='0 0 108 108'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="100%" height="100%">{DEFS}{content}</svg>'


def render(pages):
    """[(svg, 像素边长, 透明底?)] → [PIL.Image]，用 Chromium 渲染"""
    from playwright.sync_api import sync_playwright
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM)
        pg = b.new_page()
        for s, size, transparent in pages:
            pg.set_viewport_size({'width': size, 'height': size})
            pg.set_content(f'<html><body style="margin:0;background:transparent"><div style="width:{size}px;height:{size}px">{s}</div></body></html>')
            png = pg.screenshot(omit_background=transparent, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
            out.append(Image.open(io.BytesIO(png)).convert('RGBA'))
        b.close()
    return out


def mask(im, round_mask):
    size = im.width
    ss = 4
    m = Image.new('L', (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    if round_mask:
        d.ellipse([0, 0, size * ss - 1, size * ss - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=size * ss * 0.2237, fill=255)
    im = im.copy()
    im.putalpha(m.resize((size, size), Image.LANCZOS))
    return im


def monochrome_xml():
    sx, sy, ss = SPARK_AT
    return ('<?xml version="1.0" encoding="utf-8"?>\n'
            '<!-- Android 13 主题图标（单色）：叶子（叶脉挖空）+ 星光。由 scripts/build-icon.py 生成，不要手改 -->\n'
            '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
            '    android:width="108dp"\n    android:height="108dp"\n'
            '    android:viewportWidth="108"\n    android:viewportHeight="108">\n'
            f'    <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="{LEAF} {RIB}" />\n'
            f'    <path android:fillColor="#FFFFFFFF" android:pathData="{STEM}" />\n'
            f'    <group android:translateX="{sx}" android:translateY="{sy}" android:scaleX="{ss}" android:scaleY="{ss}">\n'
            f'        <path android:fillColor="#FFFFFFFF" android:pathData="{SPARK}" />\n'
            '    </group>\n</vector>\n')


ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
'''

DENSITIES = (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4))


def main():
    full = svg(layer_bg() + layer_fg(), '18 18 72 72')   # 能看到的中间 72dp
    if len(sys.argv) > 2 and sys.argv[1] == '--preview':
        big, small = render([(full, 192, False), (full, 48 * 2, False)])
        tiles = [mask(big, False), mask(big, True), mask(small, False), mask(small, True)]
        for bg in ('#f3f3f1', '#3b4655'):
            W = sum(t.width for t in tiles) + 24 * (len(tiles) + 1)
            sheet = Image.new('RGBA', (W, 216), bg)
            x = 24
            for t in tiles:
                sheet.alpha_composite(t, (x, 12))
                x += t.width + 24
            sheet.convert('RGB').save(sys.argv[2].replace('.png', '_' + bg.strip('#') + '.png'))
        return
    jobs = []
    for dpi, k in DENSITIES:
        jobs.append((svg(layer_fg()), round(108 * k), True))
        jobs.append((svg(layer_bg()), round(108 * k), False))
        jobs.append((full, round(48 * k), False))
    ims = render(jobs)
    for i, (dpi, k) in enumerate(DENSITIES):
        fg, bg, legacy = ims[i * 3: i * 3 + 3]
        d = os.path.join(RES, 'mipmap-' + dpi)
        fg.save(os.path.join(d, 'ic_launcher_foreground.webp'), 'WEBP', lossless=True)
        bg.convert('RGB').save(os.path.join(d, 'ic_launcher_background.webp'), 'WEBP', lossless=True)
        mask(legacy, False).save(os.path.join(d, 'ic_launcher.webp'), 'WEBP', lossless=True)
        mask(legacy, True).save(os.path.join(d, 'ic_launcher_round.webp'), 'WEBP', lossless=True)
    with open(os.path.join(RES, 'drawable', 'ic_launcher_monochrome.xml'), 'w', encoding='utf-8') as f:
        f.write(monochrome_xml())
    for name in ('ic_launcher.xml', 'ic_launcher_round.xml'):
        with open(os.path.join(RES, 'mipmap-anydpi-v26', name), 'w', encoding='utf-8') as f:
            f.write(ADAPTIVE)
    # 以前的矢量前景 / 背景不用了
    for old in ('ic_launcher_foreground.xml', 'ic_launcher_background.xml'):
        p = os.path.join(RES, 'drawable', old)
        if os.path.exists(p):
            os.remove(p)
    print('图标已写入', RES)


if __name__ == '__main__':
    main()
