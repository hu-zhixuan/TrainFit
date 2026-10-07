#!/usr/bin/env node
/**
 * 生成 web/js/data/food_db.js：本机食物营养库（每 100 克可食部）。
 * 来源：
 *   0. scripts/dish-recipes.js（v10.1）：常见中餐按菜谱算的每 100 克（原料 × 成分表 + 真正吃进去的油 ÷ 出锅重量），
 *      和台湾卫福部食药署「食品营养成分资料库」实测的饺子、包子、小笼包、粽子这类熟食（政府资料开放授权，可商用，注明出处）
 *   1. web/js/lib/nutrition.js 里整理好的中餐成品菜 / 外卖 / 常见主食（带别名和常用份量）
 *   2. 《中国食物成分表标准版（第6版）》JSON：https://github.com/Sanotsu/china-food-composition-data
 *   3. 成分表里没有的常见吃的（牛油果之外的西式、健身常吃的：黑咖啡、希腊酸奶、奇亚籽、意面、薯条…）：
 *      美国农业部 USDA FoodData Central（SR Legacy 2018-04，公有领域），数值照抄，后面注了 fdcId 方便核对
 *      https://fdc.nal.usda.gov/download-datasets
 *   用法：node scripts/build-food-db.js <china-food-composition-data 目录>
 *
 * 来源（每行最后一列）：
 *   food —— 自己整理的单一食物（米饭、鸡蛋、贝贝南瓜、鸡胸肉…），名字对上就按库算，「整份」的也算
 *   dish —— 自己整理的成品菜（黄焖鸡米饭、麻婆豆腐…）：做法份量差别大，「整份」的交给大模型结合原话估，库里的数只给它参考
 *   cfct —— 中国食物成分表；usda —— USDA FoodData Central；tfda —— 台湾食品营养成分资料库（实测的熟食，名字对上就按库算）
 * v6.2 起修了成品菜库「按差不多归类」带来的错：三文鱼、金枪鱼罐头、龙利鱼共用 110 千卡，黑咖啡按拿铁算，
 * 瓦罐汤按拌面算，嫩豆腐、千张、腐竹按老豆腐算，蓝莓、猕猴桃按苹果算……这些都改成查成分表 / USDA 的对应条目。
 */
const fs = require('fs');
const path = require('path');

const cfctDir = process.argv[2];
if (!cfctDir) { console.error('用法: node scripts/build-food-db.js <china-food-composition-data 目录>'); process.exit(1); }

const num = (v) => { const n = parseFloat(String(v).replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0; };
const r1 = (n) => Math.round(n * 10) / 10;
const out = [];
const seen = new Set();
const add = (name, aliases, k, p, c, f, g, src) => {
  name = name.trim();
  if (!name || seen.has(name) || !(k > 0)) return;
  seen.add(name);
  aliases = [...new Set(aliases.map(a => a.trim()).filter(a => a && a !== name && a.length >= 2))];
  out.push([name, aliases.join('|'), Math.round(k), r1(p), r1(c), r1(f), Math.round(g || 0), src]);
};

// 0) 按菜谱算的中餐（dish）+ 台湾食品营养成分资料库实测的熟食（tfda）。放在最前面：同名、同别名时它们优先
const cfctAll = new Map();
{
  const sub = fs.readdirSync(cfctDir).find(n => /_fixed$/.test(n)) || '';
  fs.readdirSync(path.join(cfctDir, sub)).filter(n => /^merged_.*\.json$/.test(n))
    .forEach(fn => JSON.parse(fs.readFileSync(path.join(cfctDir, sub, fn), 'utf8')).forEach(x => cfctAll.set(String(x.foodName || '').trim(), x)));
}
const RECIPE = require('./dish-recipes.js');
const recipeNames = new Set();
RECIPE.RECIPES.forEach(([name, aliases, serve, cooked, items]) => {
  let k = 0, p = 0, c = 0, f = 0;
  items.forEach(([ing, g]) => {
    let v = RECIPE.SEASON[ing];
    if (!v) {
      const x = cfctAll.get(RECIPE.K[ing]);
      if (!x) throw new Error(`菜谱「${name}」的原料「${ing}」在成分表里找不到：${RECIPE.K[ing]}`);
      v = [num(x.energyKCal), num(x.protein), num(x.CHO), num(x.fat)];
    }
    k += v[0] * g / cooked; p += v[1] * g / cooked; c += v[2] * g / cooked; f += v[3] * g / cooked;
  });
  recipeNames.add(name);
  add(name, aliases ? aliases.split('|') : [], k, p, c, f, serve, 'dish');
});
RECIPE.TFDA.forEach(([id, name, aliases, serve, k, p, c, f]) => { recipeNames.add(name); add(name, aliases.split('|'), k, p, c, f, serve, 'tfda'); });

// 1) 成品菜库
const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'lib', 'nutrition.js'), 'utf8');
const m = src.match(/const CHINESE_FOOD_DATABASE = (\[[\s\S]*?\n\]);/);
const dishes = eval(m[1]);
// 成品菜库里有些别名其实是另一样东西（离线引擎按「差不多」归了类），按名字精确查热量时去掉，让给成分表 / USDA 的对应条目
const DROP_ALIAS = {
  '柳州螺蛳粉': ['米线', '过桥米线'],
  '皮蛋瘦肉粥': ['白粥', '小米粥', '南瓜粥', '八宝粥', '粥'],
  '玉米': ['红薯', '地瓜', '紫薯', '芋头'],
  '水煮蛋': ['荷包蛋', '煎蛋'], // 煎的有油：成分表「荷包蛋（油煎）」195
  '全麦面包': ['吐司', '面包', '切片面包', '贝果', '欧包'],
  '沙县拌面': ['蒸饺', '瓦罐汤'], // 瓦罐汤是汤，不是 245 千卡的拌面
  '汉堡': ['薯条', '炸鸡', '吮指原味鸡', '鸡块'], // 炸鸡、鸡块不是汉堡（v10.1）
  '隆江猪脚饭': ['卤肉饭'],
  '沙县拌面': ['蒸饺', '瓦罐汤', '热干面', '炸酱面', '重庆小面'], // 这几样 v10.1 按菜谱单算了
  '手抓饼': ['煎饼果子', '杂粮煎饼', '鸡蛋灌饼', '烧饼'],
  '麻辣烫': ['串串香'],
  '精瘦牛肉': ['酱牛肉', '卤牛肉', '牛腩', '潮汕牛肉丸', '牛肉丸'], // 酱牛肉 246、牛腩 332，不是瘦牛肉的 143
  '鲜虾仁': ['生蚝', '蛤蜊', '龙虾'],
  '三文鱼': ['三文鱼', '鱼肉', '金枪鱼罐头'], // 三文鱼按成分表「鲑鱼」139（脂肪 7.8），不是 110
  '乳清蛋白粉': ['增肌粉'], // 增肌粉大多是碳水，蛋白只有一两成
  '红富士苹果': ['梨', '橙子', '橘子', '猕猴桃', '火龙果', '蓝莓', '西瓜', '桃子'],
  '鲜牛奶': ['酸奶', '无糖酸奶'],
  '生椰拿铁': ['美式', '美式咖啡', '黑咖啡', '冰美式'], // 黑咖啡几乎没有热量
  '坚果': ['花生']
};
// 整条不要了，换成成分表的（豆腐分老嫩；豆浆成分表是 31 千卡、蛋白 3g）
const DISH_SKIP = new Set(['老豆腐', '豆浆']);
const REPLACED = new Set(['鲜肉包', '素菜包', '水饺', '馄饨', '水煮牛肉', '干锅花菜', '糖醋里脊', '蒜蓉西兰花', '黄焖鸡米饭', '兰州牛肉拉面', '地三鲜']);
// 改个名字：「三文鱼/巴沙鱼/鱼肉」其实是一般的白肉鱼
const DISH_RENAME = { '三文鱼': '鱼肉' };
// 成品菜（不是单一食物）：说「一份」「一碗」整份的时候按大模型的估算，库里的数只给它参考
const DISH_COMPOSITE = new Set(['鲜肉包', '素菜包', '手抓饼', '水饺', '馄饨', '皮蛋瘦肉粥', '鱼香肉丝', '宫保鸡丁', '番茄炒蛋', '青椒肉丝',
  '回锅肉', '麻婆豆腐', '红烧肉', '水煮牛肉', '地三鲜', '干锅花菜', '糖醋里脊', '蒜蓉西兰花', '黄焖鸡米饭', '麻辣香锅', '麻辣烫',
  '隆江猪脚饭', '兰州牛肉拉面', '柳州螺蛳粉', '沙县拌面', '汉堡', '珍珠奶茶', '生椰拿铁']);
dishes.forEach(d => {
  const names = String(d.name).split('/').map(s => s.trim()).filter(Boolean);
  if (DISH_SKIP.has(names[0])) return;
  // v10.1：按菜谱重新算过的（番茄炒蛋、宫保鸡丁…）和台湾成分库实测的（水饺、包子…）以新的为准；
  // 旧表里「一道菜顶好几道」的（水煮牛肉兼当酸菜鱼、糖醋里脊兼当锅包肉、干锅花菜兼当手撕包菜、蒜蓉西兰花兼当所有炒青菜）整条不要了
  if (REPLACED.has(names[0]) || recipeNames.has(names[0])) return;
  const drop = DROP_ALIAS[names[0]] || [];
  const name = DISH_RENAME[names[0]] || names[0];
  const aliases = names.slice(1).concat(d.aliases || []).filter(a => !drop.includes(a));
  add(name, aliases, d.cal100g, d.p100g, d.c100g, d.f100g, d.defaultGrams, DISH_COMPOSITE.has(names[0]) ? 'dish' : 'food');
});

// 1.5) 常见但成分表里缺失或名字对不上的（数值取成分表同类条目）
add('烹调油', ['植物油', '食用油', '炒菜油', '菜油', '油'], 899, 0, 0, 99.9, 10, 'food');
add('啤酒', ['扎啤', '生啤'], 32, 0.4, 3.0, 0, 500, 'food');
// 牛奶分全脂 / 低脂 / 脱脂（成品菜库把低脂、脱脂都归进了全脂鲜牛奶）
add('脱脂牛奶', ['脱脂奶', '脱脂纯牛奶'], 34, 3.5, 4.6, 0.3, 250, 'food');
add('低脂牛奶', ['低脂奶', '低脂纯牛奶'], 47, 3.5, 4.8, 1.5, 250, 'food');

// 1.6) USDA FoodData Central（SR Legacy）：成分表里没有的常见吃的。[名称, 别名, 千卡, 蛋白, 碳水, 脂肪, 一份克数, fdcId]
const USDA = [
  ['黑咖啡', ['美式', '美式咖啡', '冰美式', '纯咖啡', '手冲咖啡', '黑咖'], 1, 0.1, 0, 0, 350, 171890],
  ['浓缩咖啡', ['意式浓缩', '浓缩'], 9, 0.1, 1.7, 0.2, 30, 171891],
  ['零度可乐', ['无糖可乐', '健怡可乐', '零卡可乐', '可乐零度'], 2, 0.1, 0.3, 0, 330, 175099],
  ['无糖汽水', ['零卡汽水', '无糖雪碧', '无糖苏打水', '苏打水'], 0.4, 0.1, 0, 0, 330, 173207],
  ['希腊酸奶', ['无糖希腊酸奶', '希腊式酸奶'], 73, 10, 3.9, 1.9, 150, 170903],
  ['无糖酸奶', ['原味无糖酸奶', '无蔗糖酸奶'], 61, 3.5, 4.7, 3.3, 150, 171284],
  ['奇亚籽', ['奇亚子', '鼠尾草籽'], 486, 16.5, 42.1, 30.7, 15, 170554],
  ['杏仁奶', ['无糖杏仁奶', '巴旦木奶'], 15, 0.4, 1.3, 1.0, 250, 174832],
  ['椰子水', ['椰青水'], 19, 0.7, 3.7, 0.2, 300, 170174],
  ['薯条', ['炸薯条'], 312, 3.4, 41.4, 14.7, 110, 170698],
  ['白面包', ['面包', '吐司', '白吐司', '切片面包', '方包'], 266, 8.9, 49.4, 3.3, 70, 174924],
  ['贝果', ['百吉饼', '贝果面包'], 264, 10.6, 52.4, 1.3, 100, 174899],
  ['牛角包', ['可颂', '羊角包', '牛角面包'], 406, 8.2, 45.8, 21, 60, 174987],
  ['花生酱', [], 598, 22.2, 22.3, 51.4, 15, 172470],
  ['意大利面(熟)', ['意面', '意大利面', '熟意面', '意粉'], 158, 5.8, 30.9, 0.9, 200, 169737],
  ['米线(熟)', ['米线', '米粉', '河粉', '过桥米线', '熟米粉', '熟米线'], 108, 1.8, 24, 0.2, 300, 168914],
  ['蓝莓', [], 57, 0.7, 14.5, 0.3, 125, 171711],
  ['冰淇淋', ['冰激凌', '冰淇凌', '雪糕', '香草冰淇淋'], 207, 3.5, 23.6, 11, 80, 167575],
  ['牛奶巧克力', ['巧克力'], 535, 7.7, 59.4, 29.7, 30, 167587],
  ['黑巧克力', ['黑巧', '70%黑巧克力'], 598, 7.8, 45.9, 42.6, 20, 170273],
  ['薯片', ['原味薯片'], 532, 6.4, 53.8, 34, 50, 169677],
  ['红酒', ['葡萄酒', '干红', '红葡萄酒'], 85, 0.1, 2.6, 0, 150, 173190],
  ['橙汁', ['鲜榨橙汁', '纯橙汁'], 45, 0.7, 10.4, 0.2, 250, 169098],
  ['纳豆', [], 211, 19.4, 12.7, 11, 50, 172443]
];
USDA.forEach(x => add(x[0], x[1], x[2], x[3], x[4], x[5], x[6], 'usda'));

const CFCT_DROP_ALIAS = { '豆薯': ['地瓜'] }; // 多数地方「地瓜」指红薯
// 蛋白质要准：成分表里这几个名字选到的条目和平常说的不是一样东西，让给成品菜库的同名别名
//  「蛋白粉」是一款 50% 蛋白的乳铁蛋白粉，健身说的蛋白粉是乳清（78%）
//  「虾仁」选到的是「虾仁（红）」（10.4g），平常说的是鲜虾仁（18.6g）
const CFCT_SKIP = new Set(['蛋白粉', '虾仁']);
const ALIAS = {
  '番茄': ['西红柿'], '马铃薯': ['土豆', '洋芋'], '甘薯': ['红薯', '地瓜', '番薯', '山芋'], '豆浆': ['豆奶', '现磨豆浆', '纯豆浆', '无糖豆浆'],
  '鳄梨': ['牛油果'], '荷包蛋': ['煎蛋', '煎鸡蛋'], '酱牛肉': ['卤牛肉'], '豆腐皮': ['豆皮'], '西兰花': ['西蓝花'],
  '奶酪': ['芝士', '芝士片', '奶酪片'], '粳米粥': ['白粥', '大米粥', '白米粥', '稀饭'], '牡蛎': ['生蚝'], '枣': ['红枣', '大枣', '干枣'],
  '橙': ['橙子'], '橘': ['橘子'], '桃': ['桃子'], '中华猕猴桃': ['猕猴桃', '奇异果']
};
// 同一个名字成分表有好几条（鲜的 / 干的 / 炒的）：平常说的是哪条。没写的按「代表值」，没有代表值取第一条
//  核桃、红枣平常吃的是干的；花生是炒的；成分表自己注明「红薯」是红心甘薯（61 千卡），以前取到了白心的 106
const PREFER = { '核桃': '核桃（干）', '枣': '枣（干）', '花生': '花生（炒）', '甘薯': '甘薯（红心）', '豆浆': '豆浆' };
// 成分表里分得更细、平常也会单说的几条：单独列出来（[成分表全名, 名称, 别名]）
const PICK = [
  ['豆腐（北豆腐）', '北豆腐', ['老豆腐', '卤水豆腐']],
  ['豆腐（南豆腐）', '南豆腐', ['嫩豆腐', '石膏豆腐']],
  ['豆腐（内酯）', '内酯豆腐', []],
  ['金枪鱼（盐水浸）', '水浸金枪鱼', ['金枪鱼罐头', '水浸金枪鱼罐头']],
  ['金枪鱼（油浸）', '油浸金枪鱼', ['油浸金枪鱼罐头']],
  ['核桃（鲜）', '鲜核桃', []],
  ['枣（鲜）', '鲜枣', ['冬枣']],
  ['花生（鲜）', '鲜花生', ['煮花生', '水煮花生']],
  ['甘薯（白心）', '白心红薯', ['白薯', '红皮山芋']],
  ['豆浆（甜）', '甜豆浆', ['加糖豆浆']]
];

// 2) 中国食物成分表：同一基础名优先「代表值」，跳过品牌条目
const dir = fs.readdirSync(cfctDir).find(n => /_fixed$/.test(n)) || '';
const files = fs.readdirSync(path.join(cfctDir, dir)).filter(n => /^merged_.*\.json$/.test(n));
const groups = new Map();
const byFull = new Map();
files.forEach(fn => {
  JSON.parse(fs.readFileSync(path.join(cfctDir, dir, fn), 'utf8')).forEach(x => {
    const full = String(x.foodName || '').trim();
    if (!full || /牌|雀巢|伊利|蒙牛|光明|（[^）]*公司/.test(full)) return;
    const base = full.split(/[（(［\[]/)[0].trim();
    const qual = (full.match(/（([^）]*)）/) || [])[1] || '';
    const alias = ((full.match(/［([^］]*)］/) || [])[1] || '').split(/[，、,]/);
    const e = { full, base, qual, alias, k: num(x.energyKCal), p: num(x.protein), c: num(x.CHO), f: num(x.fat) };
    if (!(e.k > 0) || !base || CFCT_SKIP.has(base)) return;
    const short = full.split('［')[0].trim();
    if (!byFull.has(short)) byFull.set(short, e);
    const g = groups.get(base);
    const want = PREFER[base];
    const better = want ? short === want : /代表值/.test(qual) && !/代表值/.test(g ? g.qual : '');
    if (!g || (better && !(want && g.full.split('［')[0].trim() === want))) groups.set(base, e);
  });
});
PICK.forEach(([full, name, aliases]) => {
  const e = byFull.get(full);
  if (!e) throw new Error('成分表里没有：' + full);
  add(name, aliases.concat(e.alias), e.k, e.p, e.c, e.f, 0, 'cfct');
});
groups.forEach(e => {
  // 生熟标注：成分表里的肉、米面大多是生重，粉丝木耳这类是干重。
  // 标了「(生)」「(干)」的条目只按全名匹配（见 web/js/log/food.js），免得「一碗面条」按干面条算
  const raw = /^(稻米|大米|小米|面粉|挂面|面条|燕麦|玉米面|糯米|黑米)$/.test(e.base) || (/肉|排|腿|翅|肝|胸|里脊/.test(e.base) && !/熟|酱|卤|烤|炸|罐头|干|松|肠/.test(e.full));
  const dry = /^(米粉|粉丝|粉条|河粉|通心面|木耳|银耳|腐竹)$/.test(e.base);
  const aliases = [e.base].concat(e.alias, ALIAS[e.base] || []).filter(a => !(CFCT_DROP_ALIAS[e.base] || []).includes(a));
  add(raw ? `${e.base}(生)` : dry ? `${e.base}(干)` : e.base, aliases, e.k, e.p, e.c, e.f, 0, 'cfct');
});

const count = (s) => out.filter(x => x[7] === s).length;
const header = `/* 自动生成：node scripts/build-food-db.js —— 不要手改
 * 每行：[名称, 别名(|分隔), 千卡/100g, 蛋白g, 碳水g, 脂肪g, 常用一份克数(0=未知), 来源]
 * 来源：food=自己整理的单一食物，dish=成品菜（按菜谱算），cfct=中国食物成分表第6版，usda=USDA FoodData Central，
 *       tfda=台湾卫福部食药署食品营养成分资料库（政府资料开放授权条款第1版）
 * 共 ${out.length} 条 */\n`;
const body = `const FOOD_DB = ${JSON.stringify(out)};\nif (typeof window !== 'undefined') window.FOOD_DB = FOOD_DB;\nif (typeof module !== 'undefined' && module.exports) module.exports = FOOD_DB;\n`;
fs.writeFileSync(path.join(__dirname, '..', 'web', 'js', 'data', 'food_db.js'), header + body);
console.log('food_db.js:', out.length, 'entries,', (header + body).length, 'bytes', '| food', count('food'), '| dish', count('dish'), '| tfda', count('tfda'), '| cfct', count('cfct'), '| usda', count('usda'));
