// 食物图鉴（v6.1）：每样都查得到食物库、份量算得对、小人看着这顿说的话、猜热量
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

require('../web/js/log/food.js');
const Dex = require('../web/js/app/dex.js');

test('图鉴里每一样都在食物库里查得到（营养数都从库里来）', () => {
  const items = Dex.items();
  assert.ok(items.length >= 100, items.length);
  for (const it of items) {
    const e = Dex.per100(it);
    assert.ok(e && e.k > 0, `${it.name} → ${it.db}`);
    assert.ok(it.grams > 0 && it.portion, it.name);
    assert.ok(['good', 'ok', 'treat'].includes(it.tone), it.name);
  }
  // 五栏，每栏都有几组
  assert.deepStrictEqual(Dex.TABS.map(t => t.label), ['碳水', '蛋白质', '蔬菜', '脂肪', '外卖']);
  // 生的、干的按库里的生重 / 干重条目（别让「鸡腿」按熟的算错）
  assert.strictEqual(Dex.per100(Dex.byId('protein.0.3')).k, 146);
});

test('份量：一份按克数算，半份、两份跟着变；份数说法按量词', () => {
  const egg = Dex.byId('protein.2.0');
  assert.strictEqual(egg.name, '鸡蛋');
  const one = Dex.portion(egg, 1), two = Dex.portion(egg, 2);
  assert.strictEqual(one.grams, 50);
  assert.strictEqual(two.calories, Math.round(Dex.per100(egg).k));
  assert.strictEqual(Dex.amountText(egg, 2), '2个');
  assert.strictEqual(Dex.amountText(Dex.byId('carb.1.0'), 0.5), '半碗');
  assert.strictEqual(Dex.amountText(Dex.byId('carb.1.3'), 1), '1份'); // 水饺「十来个」：一份不止一个
  const meal = Dex.toMeal([{ id: 'protein.0.0', n: 1 }, { id: 'carb.1.0', n: 1 }], '午餐');
  assert.strictEqual(meal.foodSummary, '鸡胸肉1块、米饭1碗');
  assert.strictEqual(meal.calories, meal.items[0].calories + meal.items[1].calories);
  assert.ok(meal.items.every(i => i.source && i.grams > 0));
});

test('小人看着这顿说：太多 → 少量吃的 → 蛋白不够（给一样补的）→ 没有菜 → 搭得好', () => {
  const ctx = { meal: '午餐', budget: 1800, eaten: 400, proteinTarget: 140 };
  assert.match(Dex.advice([], ctx).text, /午饭|午餐/);
  assert.match(Dex.advice([{ id: 'carb.3.0', n: 1 }], ctx).text, /奶茶/);
  const big = Dex.advice([{ id: 'out.1.2', n: 1 }, { id: 'carb.1.0', n: 2 }], ctx);
  assert.match(big.text, /有点多/);
  const low = Dex.advice([{ id: 'carb.1.0', n: 1 }, { id: 'veg.0.0', n: 1 }], ctx);
  assert.match(low.text, /蛋白才/);
  assert.ok(low.add && Dex.byId(low.add).tab === 'protein');
  const noVeg = Dex.advice([{ id: 'protein.0.0', n: 1 }, { id: 'carb.1.0', n: 1 }], ctx);
  assert.match(noVeg.text, /绿叶菜/);
  assert.strictEqual(Dex.byId(noVeg.add).tab, 'veg');
  const good = Dex.advice([{ id: 'protein.0.0', n: 1 }, { id: 'carb.1.0', n: 1 }, { id: 'veg.0.0', n: 1 }], ctx);
  assert.ok(good.good, good.text);
  // 只记吃的（不提蛋白）：蛋白少也不说
  assert.doesNotMatch(Dex.advice([{ id: 'carb.1.0', n: 1 }, { id: 'veg.0.0', n: 1 }], Object.assign({ simple: true }, ctx)).text, /蛋白/);
});

test('吃过的点亮：记录里出现过名字或者库里的别名就算', () => {
  const ids = Dex.eatenIds([{ foodSummary: '米饭1碗、番茄炒蛋', items: [{ name: '米饭' }, { name: '番茄炒蛋' }] }, { foodSummary: '两个水煮蛋' }]);
  assert.ok(ids.has('carb.1.0') && ids.has('out.0.0'));
  assert.ok(!ids.has('protein.0.0'));
});

test('猜热量：对的在选项里、位置不老是同一个，三个选项不一样', () => {
  const at = new Set();
  for (let s = 0; s < 30; s++) {
    const q = Dex.quiz(s * 7 + 3);
    assert.ok(q.opts.includes(q.right), q.name);
    assert.strictEqual(new Set(q.opts).size, q.opts.length);
    at.add(q.opts.indexOf(q.right));
  }
  assert.ok(at.size >= 2);
});

// v6.2：实物照片、搜一下、打开时按今天推荐、点亮收集
require('../web/js/data/food_img.js');
const fs = require('fs');
const path = require('path');

test('图鉴里每一样都有实拍照片，文件都在，来源和授权都写了', () => {
  for (const it of Dex.items()) {
    const src = Dex.img(it);
    assert.ok(src, `${it.name} 没有照片`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'web', src)), src);
    const c = globalThis.TF.FOOD_IMG[it.name];
    assert.ok(c[1] && /^(CC BY|CC BY-SA|CC0|公有领域)/.test(c[2]), `${it.name} ${c[2]}`);
  }
});

test('搜一下：名字、别名、说的话里带名字都能搜到；同名的只出一个', () => {
  assert.ok(Dex.search('西红柿').some(x => x.name === '番茄'));
  assert.deepStrictEqual(Dex.search('一个苹果').map(x => x.name), ['苹果']);
  assert.strictEqual(Dex.search('三文鱼').filter(x => x.name === '三文鱼').length, 1);
  assert.deepStrictEqual(Dex.search('不存在的东西'), []);
  assert.ok(Dex.search('牛油果').length); // v6.2 补进来的
});

test('打开时小人按今天推荐：蛋白差得多先推肉蛋，快吃满了推清淡的，早饭推主食 + 蛋 + 奶；吃过的优先', () => {
  const base = { today: true, budget: 1800, eaten: 600, protein: 30, proteinTarget: 120 };
  const p = Dex.opening(Object.assign({ meal: '午餐' }, base));
  assert.match(p.text, /蛋白还差 90g/);
  assert.ok(p.adds.length === 3 && p.adds.every(id => Dex.byId(id).tab === 'protein'));
  const full = Dex.opening(Object.assign({ meal: '晚餐' }, base, { eaten: 1600 }));
  assert.match(full.text, /只剩 200 千卡/);
  const bf = Dex.opening(Object.assign({ meal: '早餐' }, base));
  assert.ok(bf.adds.includes('protein.2.0'));
  const fam = Dex.opening(Object.assign({ meal: '午餐', eatenIds: new Set(['protein.1.0']) }, base));
  assert.strictEqual(fam.adds[0], 'protein.1.0');
  // 只记吃的：不提蛋白
  assert.doesNotMatch(Dex.opening(Object.assign({ meal: '午餐', simple: true }, base)).text, /蛋白/);
});

test('点亮收集：跨过 5 / 10 / 20… 样时庆祝，推荐没吃过的', () => {
  assert.strictEqual(Dex.milestone(4, 5), 5);
  assert.strictEqual(Dex.milestone(8, 23), 20);
  assert.strictEqual(Dex.milestone(5, 9), 0);
  const eaten = new Set(Dex.items().filter(x => x.tab === 'veg').map(x => x.id));
  const it = Dex.discover(eaten, 'veg', 3);
  assert.ok(it && !eaten.has(it.id) && it.tone === 'good');
  assert.strictEqual(Dex.discover(new Set(Dex.items().map(x => x.id))), null);
});
