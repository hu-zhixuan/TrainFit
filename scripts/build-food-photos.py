#!/usr/bin/env python3
"""
食物图鉴的实物图标（v6.2）：从维基共享资源（Wikimedia Commons）找授权能用的真实食物照片，
裁成正方形、缩到 128×128 的 WebP，放进 web/img/food/<key>.webp；出处写进 web/js/data/food_photos.js（图鉴底下列出来）。

只收这些授权：公有领域 / CC0 / CC BY / CC BY-SA（都允许商用，要注明作者和授权）。别的网站（别家 App、图库）的图不要拿。

用法：
  python3 scripts/build-food-photos.py search        # 每样搜几张候选，下到 scratch 目录，出一页对比图（人挑）
  python3 scripts/build-food-photos.py build         # 按 scripts/food-photos.json 里挑好的文件生成图标和出处
需要能连 commons.wikimedia.org、upload.wikimedia.org；要 Pillow（pip install pillow）。
"""
import json, os, sys, io, re, html, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICKS = os.path.join(ROOT, 'scripts', 'food-photos.json')
OUT_DIR = os.path.join(ROOT, 'web', 'img', 'food')
CREDITS = os.path.join(ROOT, 'web', 'js', 'data', 'food_photos.js')
SCRATCH = os.environ.get('FOOD_PHOTO_SCRATCH', '/tmp/food-photos')
API = 'https://commons.wikimedia.org/w/api.php'
UA = 'TrainFit-food-icons/1.0 (https://github.com/hu-zhixuan/TrainFit)'
OK_LICENSE = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? [1-4]\.0|CC BY(-SA)?$)', re.I)

# 图鉴里每样（key 和 dex.js 里的 key 一样）→ 在 Commons 上搜什么
QUERIES = {
    'oatmeal': 'oatmeal bowl', 'multigrain-rice': 'multigrain rice bowl', 'corn': 'corn on the cob', 'sweet-potato': 'roasted sweet potato',
    'kabocha': 'kabocha squash', 'potato': 'potato tuber', 'yam': 'Chinese yam Dioscorea polystachya', 'wholewheat-bread': 'whole wheat bread slices',
    'soba': 'buckwheat soba noodles', 'rice': 'bowl of cooked white rice', 'mantou': 'mantou steamed bun', 'noodles': 'Chinese noodle soup bowl',
    'jiaozi': 'jiaozi dumplings', 'wonton': 'wonton soup', 'baozi': 'baozi steamed bun', 'congee': 'plain rice congee', 'shouzhuabing': 'scallion pancake',
    'apple': 'red apple fruit', 'banana': 'bananas', 'orange': 'orange fruit', 'pear': 'pear fruit', 'strawberry': 'strawberries', 'kiwi': 'kiwifruit cut',
    'watermelon': 'watermelon slice', 'grape': 'grapes bunch', 'mango': 'mango fruit', 'cherry': 'cherries', 'durian': 'durian fruit open',
    'bubble-tea': 'bubble tea', 'cola': 'cola glass', 'coconut-latte': 'iced latte', 'youtiao': 'youtiao', 'raisin': 'raisins', 'beer': 'glass of beer',
    'chicken-breast': 'grilled chicken breast', 'beef': 'beef steak', 'pork-loin': 'pork tenderloin raw', 'chicken-leg': 'chicken drumstick',
    'lamb': 'raw lamb meat', 'chicken-feet': 'chicken feet dim sum', 'shrimp': 'peeled shrimp', 'salmon': 'salmon fillet', 'cod': 'cod fillet',
    'tuna': 'canned tuna', 'squid': 'squid food', 'seabass': 'steamed fish Chinese', 'clam': 'clams food', 'egg': 'boiled egg halved',
    'egg-white': 'egg white boiled', 'milk': 'glass of milk', 'skim-milk': 'milk carton glass', 'yogurt': 'yogurt bowl', 'cheese': 'cheese slices',
    'whey': 'protein powder scoop', 'tofu': 'tofu block', 'soymilk': 'soy milk glass', 'edamame': 'edamame', 'yuba': 'dried tofu skin yuba',
    'broccoli': 'broccoli', 'spinach': 'spinach leaves', 'lettuce': 'lettuce head', 'napa': 'napa cabbage', 'youmaicai': 'Lactuca sativa leaf vegetable Chinese',
    'celery': 'celery stalks', 'cucumber': 'cucumber', 'tomato': 'tomato', 'eggplant': 'eggplant', 'zucchini': 'zucchini', 'winter-melon': 'winter melon',
    'shiitake': 'shiitake mushrooms', 'enoki': 'enoki mushrooms', 'kelp': 'kelp food', 'carrot': 'carrots', 'pumpkin': 'pumpkin slice', 'onion': 'onion',
    'bean-sprout': 'soybean sprouts', 'green-bean': 'green beans',
    'nuts': 'mixed nuts', 'almond': 'almonds', 'cashew': 'cashew nuts', 'pistachio': 'pistachios', 'pumpkin-seed': 'pumpkin seeds', 'oil': 'cooking oil bottle',
    'olive-oil': 'olive oil', 'butter': 'butter block', 'hongshaorou': 'hong shao rou', 'huiguorou': 'twice cooked pork', 'tangcu': 'sweet and sour pork',
    'fried-chicken': 'fried chicken pieces', 'burger': 'hamburger',
    'tomato-egg': 'tomato and egg stir fry', 'garlic-broccoli': 'stir fried broccoli garlic', 'mapo-tofu': 'mapo tofu', 'kungpao': 'kung pao chicken',
    'shuizhu-beef': 'Sichuan boiled beef', 'lanzhou-noodles': 'Lanzhou beef noodles', 'pidan-congee': 'century egg congee', 'malatang': 'malatang',
    'huangmenji': 'huangmenji', 'xiangguo': 'mala xiang guo', 'zhujiaofan': 'pork trotter rice', 'luosifen': 'luosifen', 'yuxiang': 'yuxiang shredded pork',
    'disanxian': 'di san xian', 'shaxian-noodles': 'Shaxian noodles'
}


def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def search(q, n=6):
    """Commons 文件搜索：带缩略图、授权、作者"""
    p = {'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6, 'gsrlimit': 20,
         'gsrsearch': f'{q} filetype:bitmap', 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': 320}
    data = json.loads(get(API + '?' + urllib.parse.urlencode(p)))
    out = []
    for page in sorted((data.get('query') or {}).get('pages', {}).values(), key=lambda x: x.get('index', 0)):
        ii = (page.get('imageinfo') or [{}])[0]
        meta = ii.get('extmetadata') or {}
        lic = (meta.get('LicenseShortName') or {}).get('value', '')
        if not OK_LICENSE.match(lic.strip()) or ii.get('width', 0) < 400:
            continue
        artist = re.sub(r'<[^>]+>', '', html.unescape((meta.get('Artist') or {}).get('value', ''))).strip()
        out.append({'file': page['title'], 'thumb': ii.get('thumburl'), 'page': ii.get('descriptionurl'), 'license': lic, 'author': artist[:80]})
        if len(out) >= n:
            break
    return out


def cmd_search(keys):
    os.makedirs(SCRATCH, exist_ok=True)
    cands = {}
    for k in keys:
        try:
            cands[k] = search(QUERIES[k])
        except Exception as e:  # noqa: BLE001
            print('搜不到', k, e)
            cands[k] = []
        for i, c in enumerate(cands[k]):
            path = os.path.join(SCRATCH, f'{k}-{i}.jpg')
            if not os.path.exists(path):
                try:
                    open(path, 'wb').write(get(c['thumb']))
                except Exception as e:  # noqa: BLE001
                    print('下不来', k, i, e)
        print(k, len(cands[k]))
    json.dump(cands, open(os.path.join(SCRATCH, 'candidates.json'), 'w'), ensure_ascii=False, indent=1)
    # 对比图：每样一行，候选按编号排，人看了在 food-photos.json 里写挑哪个
    rows = ''.join(f'<tr><th>{k}</th>' + ''.join(f'<td><img src="{k}-{i}.jpg"><br>{i} · {html.escape(c["license"])}</td>' for i, c in enumerate(v)) + '</tr>' for k, v in cands.items())
    open(os.path.join(SCRATCH, 'sheet.html'), 'w').write(f'<meta charset="utf-8"><style>img{{width:120px;height:120px;object-fit:cover;border-radius:50%}}td,th{{font:11px sans-serif;text-align:center;padding:4px}}</style><table>{rows}</table>')
    print('对比图：', os.path.join(SCRATCH, 'sheet.html'))


def square(img):
    """取中间的正方形（食物一般在中间），缩到 128"""
    from PIL import Image
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return img.convert('RGB').resize((128, 128), Image.LANCZOS)


def cmd_build():
    from PIL import Image
    picks = json.load(open(PICKS))
    os.makedirs(OUT_DIR, exist_ok=True)
    credits = {}
    for k, p in picks.items():
        out = os.path.join(OUT_DIR, f'{k}.webp')
        if not os.path.exists(out):
            img = Image.open(io.BytesIO(get(p['thumb'])))
            square(img).save(out, 'WEBP', quality=80, method=6)
        credits[k] = {'file': p['file'].replace('File:', ''), 'author': p.get('author', ''), 'license': p['license'], 'url': p['page']}
    body = ('/* 自动生成：python3 scripts/build-food-photos.py build —— 不要手改\n * 食物图鉴的实物照片出处（维基共享资源，授权见每一条）*/\n'
            f'const FOOD_PHOTOS = {json.dumps(credits, ensure_ascii=False)};\n'
            "if (typeof window !== 'undefined') window.FOOD_PHOTOS = FOOD_PHOTOS;\n"
            "if (typeof module !== 'undefined' && module.exports) module.exports = FOOD_PHOTOS;\n")
    open(CREDITS, 'w').write(body)
    print('图标', len(credits), '张 →', OUT_DIR)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'build':
        cmd_build()
    else:
        cmd_search(sys.argv[2:] or list(QUERIES))
