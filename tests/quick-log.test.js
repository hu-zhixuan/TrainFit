// 一键记录的纯逻辑：体重识别、按食物库算热量、大模型输出的校验整理、离线兜底。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

globalThis.WorkoutEngine = require('../web/js/lib/workout.js').WorkoutEngine;
globalThis.NutritionEngine = require('../web/js/lib/nutrition.js');
const TF = require('../web/js/log/parser.js');
const { quickWeight, findWeight, FoodDB, groundItem, sumItems, Parser } = TF;

test('只报体重：斤 / 公斤 / 没单位时按上次体重判断', () => {
  assert.strictEqual(quickWeight('体重62.5'), 62.5);
  assert.strictEqual(quickWeight('今天称了124斤'), 62);
  assert.strictEqual(quickWeight('早上体重是 62.3 公斤。'), 62.3);
  assert.strictEqual(quickWeight('62.3kg'), 62.3);
  assert.strictEqual(quickWeight('120', 61), 60);      // 上次 61kg → 120 是斤
  assert.strictEqual(quickWeight('61.8', 62), 61.8);
  assert.strictEqual(quickWeight('卧推80公斤'), null);  // 不是只报体重
  assert.strictEqual(quickWeight('今天吃了两个包子'), null);
});

test('一句话里夹着体重', () => {
  assert.strictEqual(findWeight('早上体重61.5，中午吃了黄焖鸡'), 61.5);
  assert.strictEqual(findWeight('称了一下 123 斤'), 61.5);
  assert.strictEqual(findWeight('卧推60公斤4组8个'), null);
});

test('食物库：名字和别名都能找到；生重条目不会被熟食名字误用', () => {
  assert.ok(FoodDB.find('米饭'));
  assert.ok(FoodDB.find('西红柿'));                   // 别名 → 番茄
  assert.ok(FoodDB.find('烹调油'));
  assert.strictEqual(FoodDB.find('不存在的菜xyz'), null);
  assert.strictEqual(FoodDB.find('糯米'), null);      // 只有「糯米(生)」，不能拿来算熟糯米
  const names = FoodDB.candidates('中午一个糯米鸡两个水煮蛋').map(e => e.name);
  assert.ok(!names.some(n => /\(生\)$/.test(n)), names.join(','));
  assert.ok(FoodDB.candidates('生重150克牛肉').some(e => /\(生\)$/.test(e.name)));
});

test('整份的东西（糯米鸡）用大模型估算，不拆原料、不拿原料去算', () => {
  const it = groundItem({ name: '糯米鸡', amount: '1个', grams: 180, whole: true, calories: 380, proteinG: 12, carbsG: 52, fatG: 13 });
  assert.strictEqual(it.src, '估算');
  assert.strictEqual(it.calories, 380);
  assert.strictEqual(it.amount, '1个');
  // 整份但库里有这道成品菜 → 按成品菜库算
  const bun = groundItem({ name: '肉包', amount: '1个', grams: 100, whole: true, calories: 230 });
  assert.strictEqual(bun.src, '菜品库');
  // 整份的东西不能拿成分表里的原料条目算
  const egg = groundItem({ name: '鸡蛋', grams: 100, whole: true, calories: 150 });
  assert.strictEqual(egg.src, '估算');
});

test('记住的食物优先，按份数或克数换算', () => {
  const mine = [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 10, carbsG: 50, fatG: 11 }];
  const two = groundItem({ name: '糯米鸡', amount: '两个', whole: true, calories: 800 }, mine);
  assert.strictEqual(two.src, '我的');
  assert.strictEqual(two.calories, 700);
  const g = groundItem({ name: '糯米鸡', amount: '1个', grams: 90, calories: 200 }, mine);
  assert.strictEqual(g.calories, 175);
  assert.strictEqual(TF.countOf('半份'), 0.5);
  assert.strictEqual(TF.countOf('3个'), 3);
});

test('包装上的营养数照用', () => {
  const it = groundItem({ name: '某品牌鸡胸肉', amount: '1包', grams: 100, source: 'label', calories: 110, proteinG: 23 });
  assert.strictEqual(it.src, '包装');
  assert.strictEqual(it.calories, 110);
});

test('按库算热量；和大模型估算差太多时保留估算', () => {
  const rice = groundItem({ name: '米饭', grams: 200, calories: 230 });
  assert.strictEqual(rice.src, '成分表');
  assert.strictEqual(rice.calories, 232);
  const oil = groundItem({ name: '烹调油', grams: 12, calories: 100 });
  assert.strictEqual(oil.src, '菜品库');
  assert.strictEqual(oil.calories, 108);
  // 成分表里的「豆腐花」是干粉（约 400 千卡/100g），和估算差太多 → 用估算
  const douhua = groundItem({ name: '豆腐花', grams: 200, calories: 100 });
  assert.strictEqual(douhua.src, '估算');
  assert.strictEqual(douhua.calories, 100);
  assert.strictEqual(groundItem({ name: '', grams: 100, calories: 100 }), null);
  const t = sumItems([rice, oil]);
  assert.strictEqual(t.calories, 340);
});

test('提示词里带上参考营养数据、最近体重和记住的食物', () => {
  const myFoods = [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 10, carbsG: 50, fatG: 11 }];
  const msgs = Parser.buildMessages('中午番茄炒蛋盖饭', { lastWeight: 61, myFoods, now: new Date('2026-09-28T12:30:00') });
  assert.match(msgs[1].content, /记住的食物[^\n]*\n糯米鸡 1个 约180g 350千卡/);
  assert.strictEqual(msgs.length, 2);
  assert.match(msgs[0].content, /bodyWeight/);
  assert.match(msgs[1].content, /参考营养数据/);
  assert.match(msgs[1].content, /烹调油/);
  assert.match(msgs[1].content, /最近体重：61kg/);
  assert.match(msgs[1].content, /用户说：中午番茄炒蛋盖饭/);
});

test('解析模型回复：去掉 <think> 和 ```json 包裹', () => {
  assert.deepStrictEqual(Parser.extractJson('<think>嗯</think>```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => Parser.extractJson('没有 JSON'), /NO_JSON/);
  const raw = JSON.stringify({ choices: [{ message: { content: '{"reply":"ok"}' } }] });
  assert.strictEqual(Parser.contentFromResponse(raw), '{"reply":"ok"}');
});

test('整理大模型输出：饮食按库重算、训练补默认值、体重单位纠正', () => {
  const r = Parser.normalize({
    reply: '记好了',
    bodyWeight: 124, // 模型把「124斤」当成公斤
    add: {
      meals: [{ mealType: '午饭', foodSummary: '米饭', items: [{ name: '米饭', grams: 200, calories: 230 }] }],
      workouts: [{ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80 }]
    }
  }, { lastWeight: 61, now: new Date('2026-09-28T12:30:00'), history: [] });
  assert.strictEqual(r.bodyWeight, 62);
  assert.strictEqual(r.meals.length, 1);
  assert.strictEqual(r.meals[0].calories, 232);
  assert.strictEqual(r.meals[0].mealType, '午餐'); // 不认识的餐次按时间判断
  assert.strictEqual(r.workouts[0].sets, 3);       // 没说组数 → 默认值并标记估计
  assert.strictEqual(r.workouts[0].estimated, true);
});

test('「记住」：整理成一份的量；不合法的丢掉', () => {
  const r = Parser.normalize({ remember: [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350 }, { name: '', calories: 100 }, { name: '水', calories: 0 }] }, {});
  assert.deepStrictEqual(r.remember, [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350, proteinG: 0, carbsG: 0, fatG: 0 }]);
  const m = Parser.normalize({ add: { meals: [{ mealType: '午餐', foodSummary: '糯米鸡2个', items: [{ name: '糯米鸡', amount: '2个', whole: true, calories: 900 }] }] } },
    { myFoods: [{ name: '糯米鸡', amount: '1个', grams: 180, calories: 350 }] });
  assert.strictEqual(m.meals[0].calories, 700);
});

test('修改 / 删除只认这天已有记录的编号', () => {
  const ctx = { dayRecords: [{ ref: 'r1', kind: 'meal', id: 'd1' }, { ref: 'r2', kind: 'workout', id: 'w1' }] };
  const r = Parser.normalize({ update: [{ ref: 'r2', set: { weightKg: 85 } }, { ref: 'r9', set: { weightKg: 1 } }], delete: ['r1', 'r7'] }, ctx);
  assert.deepStrictEqual(r.updates, [{ ref: 'r2', set: { weightKg: 85 } }]);
  assert.deepStrictEqual(r.deletes, ['r1']);
});

test('大模型连不上时的离线兜底', () => {
  const r = Parser.viaLocal('卧推80公斤4组8个，中午吃了黄焖鸡米饭，体重61.5', { lastWeight: 61, now: new Date('2026-09-28T12:30:00') });
  assert.strictEqual(r.bodyWeight, 61.5);
  assert.strictEqual(r.workouts.length, 1);
  assert.strictEqual(r.workouts[0].weightKg, 80);
  assert.strictEqual(r.meals.length, 1);
  assert.ok(r.meals[0].calories > 0);
});
