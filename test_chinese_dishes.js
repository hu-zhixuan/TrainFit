const NutritionEngine = require('./js/nutrition.js');

const testCases = [
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

console.log('=== 测试中餐全系菜品与外卖精准拆解 ===\n');
testCases.forEach((text, i) => {
  const res = NutritionEngine.parseDietVoice(text);
  console.log('[' + (i + 1) + '] 输入: "' + text + '"');
  console.log('    摘要: ' + res.foodSummary);
  console.log('    总热量: ' + res.totalCalories + ' kcal | 蛋白: ' + res.proteinG + 'g | 碳水: ' + res.carbsG + 'g | 脂肪: ' + res.fatG + 'g');
  console.log('    明细:');
  res.items.forEach(item => {
    console.log('      • ' + item.name + ' (' + item.estimatedGrams + 'g) -> ' + item.calories + ' kcal [P:' + item.proteinG + 'g C:' + item.carbsG + 'g F:' + item.fatG + 'g]');
  });
  console.log('');
});
