// 离线饮食引擎（大模型连不上时的兜底）：常见中餐和外卖都要能算出热量。
const test = require('node:test');
const assert = require('node:assert');
const NutritionEngine = require('../web/js/lib/nutrition.js');

const dishes = [
  '一碗鱼香肉丝盖浇饭',
  '一份大份麻辣香锅',
  '两个鲜肉包加一碗无糖豆浆',
  '一份黄焖鸡米饭微辣',
  '一碗兰州牛肉拉面加一个茶叶蛋',
  '一份隆江猪脚饭',
  '一盘回锅肉配两碗米饭',
  '一碗柳州螺蛳粉',
  '一份宫保鸡丁加一盘番茄炒蛋',
  '一杯生椰拿铁配一个全麦面包',
  '中午吃了两碗米饭配半斤酱牛肉和一盘西兰花'
];

test('常见中餐都能算出热量和三大营养素', () => {
  for (const text of dishes) {
    const r = NutritionEngine.parseDietVoice(text);
    assert.ok(r.totalCalories > 100 && r.totalCalories < 3000, `${text} → ${r.totalCalories}`);
    assert.ok(r.items.length >= 1, text);
    assert.ok(r.proteinG >= 0 && r.carbsG >= 0 && r.fatG >= 0, text);
  }
});

test('份量会影响热量：两碗米饭比一碗多', () => {
  const one = NutritionEngine.parseDietVoice('一碗米饭').totalCalories;
  const two = NutritionEngine.parseDietVoice('两碗米饭').totalCalories;
  assert.ok(two > one * 1.5, `${one} → ${two}`);
});
