#!/usr/bin/env node
/**
 * 生成 web/js/data/food_db.js：本机食物营养库（每 100 克可食部）。
 * 来源：
 *   1. web/js/lib/nutrition.js 里整理好的中餐成品菜 / 外卖 / 常见主食（带别名和常用份量），优先使用
 *   2. 《中国食物成分表标准版（第6版）》JSON：https://github.com/Sanotsu/china-food-composition-data
 *      用法：node scripts/build-food-db.js <china-food-composition-data 目录>
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

// 1) 成品菜库
const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'js', 'lib', 'nutrition.js'), 'utf8');
const m = src.match(/const CHINESE_FOOD_DATABASE = (\[[\s\S]*?\n\]);/);
const dishes = eval(m[1]);
// 成品菜库里有些别名其实是另一样东西（离线引擎按「差不多」归了类），按名字精确查热量时去掉
const DROP_ALIAS = { '柳州螺蛳粉': ['米线', '过桥米线'], '皮蛋瘦肉粥': ['白粥'], '玉米': ['红薯', '地瓜', '紫薯', '芋头'] };
dishes.forEach(d => {
  const names = String(d.name).split('/').map(s => s.trim()).filter(Boolean);
  const drop = DROP_ALIAS[names[0]] || [];
  const aliases = names.slice(1).concat(d.aliases || []).filter(a => !drop.includes(a));
  add(names[0], aliases, d.cal100g, d.p100g, d.c100g, d.f100g, d.defaultGrams, 'dish');
});

// 1.5) 常见但成分表里缺失或名字对不上的（数值取成分表同类条目）
add('烹调油', ['植物油', '食用油', '炒菜油', '菜油', '油'], 899, 0, 0, 99.9, 10, 'common');
add('啤酒', ['扎啤', '生啤'], 32, 0.4, 3.0, 0, 500, 'common');
add('猪肉包子', ['肉包', '肉包子', '包子'], 227, 7.6, 29.0, 8.5, 80, 'common');
add('菜包子', ['素包子', '菜包'], 175, 5.4, 30.0, 3.8, 80, 'common');
const CFCT_DROP_ALIAS = { '豆薯': ['地瓜'] }; // 多数地方「地瓜」指红薯
const ALIAS = { '番茄': ['西红柿'], '马铃薯': ['土豆', '洋芋'], '甘薯': ['红薯', '地瓜', '番薯'], '豆浆': ['豆奶'] };

// 2) 中国食物成分表：同一基础名优先「代表值」，跳过品牌条目
const dir = fs.readdirSync(cfctDir).find(n => /_fixed$/.test(n)) || '';
const files = fs.readdirSync(path.join(cfctDir, dir)).filter(n => /^merged_.*\.json$/.test(n));
const groups = new Map();
files.forEach(fn => {
  JSON.parse(fs.readFileSync(path.join(cfctDir, dir, fn), 'utf8')).forEach(x => {
    const full = String(x.foodName || '').trim();
    if (!full || /牌|雀巢|伊利|蒙牛|光明|（[^）]*公司/.test(full)) return;
    const base = full.split(/[（(［\[]/)[0].trim();
    const qual = (full.match(/（([^）]*)）/) || [])[1] || '';
    const alias = ((full.match(/［([^］]*)］/) || [])[1] || '').split(/[，、,]/);
    const e = { full, base, qual, alias, k: num(x.energyKCal), p: num(x.protein), c: num(x.CHO), f: num(x.fat) };
    if (!(e.k > 0) || !base) return;
    const g = groups.get(base);
    if (!g || (/代表值/.test(qual) && !/代表值/.test(g.qual))) groups.set(base, e);
  });
});
groups.forEach(e => {
  // 生熟标注：成分表里的肉、米面大多是生重，粉丝木耳这类是干重。
  // 标了「(生)」「(干)」的条目只按全名匹配（见 web/js/log/food.js），免得「一碗面条」按干面条算
  const raw = /^(稻米|大米|小米|面粉|挂面|面条|燕麦|玉米面|糯米|黑米)$/.test(e.base) || (/肉|排|腿|翅|肝|胸|里脊/.test(e.base) && !/熟|酱|卤|烤|炸|罐头|干|松|肠/.test(e.full));
  const dry = /^(米粉|粉丝|粉条|河粉|通心面|木耳|银耳|腐竹)$/.test(e.base);
  const aliases = [e.base].concat(e.alias, ALIAS[e.base] || []).filter(a => !(CFCT_DROP_ALIAS[e.base] || []).includes(a));
  add(raw ? `${e.base}(生)` : dry ? `${e.base}(干)` : e.base, aliases, e.k, e.p, e.c, e.f, 0, 'cfct');
});

const header = `/* 自动生成：node scripts/build-food-db.js —— 不要手改
 * 每行：[名称, 别名(|分隔), 千卡/100g, 蛋白g, 碳水g, 脂肪g, 常用一份克数(0=未知), 来源(dish=成品菜库, cfct=中国食物成分表第6版)]
 * 共 ${out.length} 条 */\n`;
const body = `const FOOD_DB = ${JSON.stringify(out)};\nif (typeof window !== 'undefined') window.FOOD_DB = FOOD_DB;\nif (typeof module !== 'undefined' && module.exports) module.exports = FOOD_DB;\n`;
fs.writeFileSync(path.join(__dirname, '..', 'web', 'js', 'data', 'food_db.js'), header + body);
console.log('food_db.js:', out.length, 'entries,', (header + body).length, 'bytes', '| dish', out.filter(x => x[7] === 'dish').length, '| cfct', out.filter(x => x[7] === 'cfct').length);
