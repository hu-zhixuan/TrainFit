// 营养数据要准（v6.2）：成品菜库「按差不多归类」的错都改成成分表 / USDA 的对应条目；整份说的单一食物也按库算
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

require('../web/js/log/food.js');
const TF = globalThis.TF;
const { FoodDB, groundItem } = TF;
const DB = require('../web/js/data/food_db.js');

test('用户截图：「230 克贝贝南瓜」被大模型标成整份、按普通南瓜写 53 千卡 → 按库算，碳水也对', () => {
  const g = groundItem({ name: '贝贝南瓜', amount: '230g', grams: 230, whole: true, calories: 53, proteinG: 1.6, carbsG: 12, fatG: 0.2 }, []);
  assert.strictEqual(g.src, '菜品库');
  assert.ok(g.calories >= 200 && g.calories <= 230, g.calories);
  assert.ok(g.carbsG >= 44 && g.carbsG <= 52, g.carbsG); // 豆包查的是 44～49g
  // 整份的苹果、香蕉也按库
  assert.strictEqual(groundItem({ name: '苹果', amount: '1个', grams: 200, whole: true, calories: 95, proteinG: 0.5 }, []).src, '成分表');
});

test('成品菜整份说、连锁店的东西：还是用大模型结合原话的估算', () => {
  assert.strictEqual(groundItem({ name: '黄焖鸡米饭', amount: '1份', grams: 600, whole: true, calories: 900, proteinG: 40 }, []).src, '估算');
  assert.strictEqual(groundItem({ name: '麻婆豆腐', amount: '1份', grams: 250, whole: true, calories: 380, proteinG: 18 }, []).src, '估算');
  assert.strictEqual(groundItem({ name: '麦当劳薯条', amount: '中份', grams: 110, calories: 330, proteinG: 4 }, []).src, '估算');
  // 不是整份、说了克数的成品菜，照旧按库
  assert.strictEqual(groundItem({ name: '麻婆豆腐', amount: '200g', grams: 200, calories: 260, proteinG: 13 }, []).src, '菜品库');
});

test('以前归错类的：三文鱼、黑咖啡、嫩豆腐、豆皮、蓝莓、金枪鱼罐头、瓦罐汤', () => {
  const f = (n) => FoodDB.find(n);
  assert.strictEqual(f('三文鱼').k, 139); // 成分表「鲑鱼［三文鱼］」，以前和巴沙鱼一起算 110
  assert.ok(f('三文鱼').f > 5);
  assert.ok(f('美式咖啡').k <= 2 && f('冰美式').k <= 2 && f('黑咖啡').k <= 2); // 以前按拿铁 48
  assert.strictEqual(f('嫩豆腐').name, '南豆腐');
  assert.strictEqual(f('老豆腐').name, '北豆腐');
  assert.ok(f('豆皮').p > 40); // 豆腐皮 51.6g 蛋白，以前按老豆腐 8.1g
  assert.ok(f('千张').k > 200);
  assert.notStrictEqual(f('蓝莓').name, '红富士苹果');
  assert.notStrictEqual(f('猕猴桃').name, '红富士苹果');
  assert.ok(f('金枪鱼罐头').p > 22);
  assert.strictEqual(f('瓦罐汤'), null); // 没有就让大模型估，别按 245 千卡的拌面算
  assert.ok(f('卤牛肉').k > 200); // 酱 / 卤牛肉 246，不是瘦牛肉 143
  assert.strictEqual(f('增肌粉'), null); // 增肌粉不是 78% 蛋白的乳清
  assert.strictEqual(f('蛋白粉').name, '乳清蛋白粉');
});

test('同名好几条的，取平常说的那条：红薯是红心的、核桃红枣是干的、花生是炒的', () => {
  assert.strictEqual(FoodDB.find('红薯').k, 61); // 成分表注明「红薯」= 甘薯（红心）
  assert.ok(FoodDB.find('核桃').k > 600);
  assert.ok(FoodDB.find('红枣').k > 250);
  assert.ok(FoodDB.find('花生').k > 550);
  assert.ok(FoodDB.find('鲜花生').k < 350);
});

test('成分表没有的常见吃的从 USDA 补：牛油果、希腊酸奶、奇亚籽、意面、米线、零度可乐', () => {
  assert.strictEqual(FoodDB.find('牛油果').src, 'cfct'); // 成分表有「鳄梨」
  for (const n of ['希腊酸奶', '奇亚籽', '意面', '米线', '零度可乐', '薯条', '吐司']) {
    const e = FoodDB.find(n);
    assert.ok(e && e.src === 'usda', n);
  }
  assert.strictEqual(FoodDB.label(FoodDB.find('希腊酸奶')), 'USDA');
  assert.ok(FoodDB.find('零度可乐').k <= 2);
  const g = groundItem({ name: '希腊酸奶', amount: '1杯', grams: 150, calories: 140, proteinG: 8 }, []);
  assert.strictEqual(g.src, 'USDA');
  assert.strictEqual(g.proteinG, 15);
});

test('自己整理和 USDA 的条目：4×蛋白 + 4×碳水 + 9×脂肪 和热量对得上（防抄错）', () => {
  DB.filter(r => r[7] !== 'cfct' && r[2] >= 40 && !/酒/.test(r[0])).forEach(r => {
    const q = (4 * r[3] + 4 * r[4] + 9 * r[5]) / r[2];
    assert.ok(q > 0.8 && q < 1.2, `${r[0]} ${r[2]} 千卡，算出来 ${Math.round(q * r[2])}`);
  });
});
