// 改记录（v12，用户：「修改的时候统计什么时候才跟着改」）：改份量、改标题里的数，热量蛋白马上跟着变；改成克数按克数算
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
global.round1 = (n) => Math.round(n * 10) / 10;
global.esc = (s) => String(s);
global.fmt = (n) => String(n);
global.FitnessApp = class FitnessApp {};
require('../web/js/data/food_db.js');
require('../web/js/log/parser.js');
const { scaleItem, summaryAmounts, gramsIn } = require('../web/js/app/editor.js');

const rice = { name: '米饭', amount: '1碗', grams: 180, calories: 209, proteinG: 4.7, carbsG: 46, fatG: 0.5 };
const bun = { name: '肉包', amount: '2个', grams: 200, calories: 460, proteinG: 16, carbsG: 60, fatG: 16 };

test('改份量：几个按个数比，改成克数按克数比（以前「1碗」→「150g」热量乘了 20 倍）', () => {
  assert.strictEqual(scaleItem(bun, '1个').calories, 230);
  assert.strictEqual(scaleItem(rice, '半碗').calories, 105);
  assert.strictEqual(scaleItem(rice, '150g').calories, 174);
  assert.strictEqual(scaleItem(rice, '150g').grams, 150);
  assert.strictEqual(scaleItem({ name: '鸡胸肉', amount: '200g', grams: 200, calories: 266, proteinG: 48 }, '1块').calories, 266, '克数换「1块」换算不了，数不动');
  assert.strictEqual(scaleItem({ name: '牛奶', amount: '250ml', grams: 250, calories: 135, proteinG: 7.5 }, '500毫升').calories, 270);
  assert.strictEqual(gramsIn('半斤'), 250);
  assert.strictEqual(gramsIn('0.2kg'), 200);
  assert.strictEqual(gramsIn('2个'), 0);
});

test('改标题里的数：每一样跟着变；只有一个数的整份一起变；换了吃的交给 AI', () => {
  const meal = { foodSummary: '肉包2个、米饭1碗', items: [bun, rice] };
  assert.deepStrictEqual(summaryAmounts(meal, '肉包3个、米饭1碗'), ['3个', '1碗']);
  assert.deepStrictEqual(summaryAmounts(meal, '肉包2个、米饭2碗'), ['2个', '2碗']);
  const set = { foodSummary: '番茄炒蛋盖饭1份', items: [{ name: '米饭', amount: '1碗', grams: 250, calories: 290 }, { name: '番茄炒蛋', amount: '1份', grams: 200, calories: 260 }] };
  assert.deepStrictEqual(summaryAmounts(set, '番茄炒蛋盖饭2份'), ['2碗', '2份']);
  assert.deepStrictEqual(summaryAmounts(set, '番茄炒蛋盖饭半份'), ['0.5碗', '0.5份']);
  assert.strictEqual(summaryAmounts(meal, '肉包2个、米饭1碗、豆浆1杯'), null, '多了一样：交给 AI 重估');
  assert.strictEqual(summaryAmounts(meal, '菜包2个、米饭1碗'), null);
  assert.strictEqual(summaryAmounts(meal, '肉包2个、米饭1碗'), null, '没改');
});

test('v12.7 明细能改：下面拼回上面；新加的一样先查记住的和食物库', () => {
  const { draftSummary, lookupLocal, cleanRow } = require('../web/js/app/editor.js');
  assert.strictEqual(draftSummary([{ name: '小鱼干', amount: '2包' }, { name: '豆浆', amount: '1杯' }, { name: '  ' }]), '小鱼干2包、豆浆1杯');
  // 库里有的：按份量算（写了克数按克数）
  const egg = lookupLocal('鸡蛋', '100g', []);
  assert.ok(egg && egg.calories > 100 && egg.calories < 170, JSON.stringify(egg));
  assert.ok(egg.proteinG > 10 && egg.proteinG < 15);
  assert.strictEqual(egg.grams, 100);
  // 你记住的优先，按个数比
  const mine = lookupLocal('小鱼干', '1包', [{ name: '小鱼干', amount: '2包', grams: 60, calories: 240, proteinG: 30, carbsG: 6, fatG: 10 }]);
  assert.strictEqual(mine.src, '我的');
  assert.strictEqual(mine.calories, 120);
  assert.strictEqual(mine.proteinG, 15);
  // 库里没有：交给 AI
  assert.strictEqual(lookupLocal('外星人能量块', '1块', []), null);
  // 存回去不带面板里的记号；改过数的标「我的」
  const r = cleanRow({ name: ' 小鱼干 ', amount: '2包', calories: 200, src: '估算', dbName: 'x', _mine: true, _base: {}, _new: true, opts: [] });
  assert.deepStrictEqual(r, { name: '小鱼干', amount: '2包', calories: 200, src: '我的' });
});
