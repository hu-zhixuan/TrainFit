// 一键记录的纯逻辑：体重识别、按食物库算热量、大模型输出的校验整理、失败重试。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

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
  // 整份的东西即使库里有同名成品菜，也用大模型结合原话的估算（库里的数只作参考）
  const bun = groundItem({ name: '麻辣烫', amount: '1份', grams: 550, whole: true, calories: 720 });
  assert.strictEqual(bun.src, '估算');
  assert.strictEqual(bun.calories, 720);
  // 单一食材按库算
  const egg = groundItem({ name: '鸡蛋', grams: 100, calories: 150 });
  assert.strictEqual(egg.src, '成分表');
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

test('一句话说了早上和晚上：提示词里提醒大模型分成两餐；只说一个时间不提醒', () => {
  assert.deepStrictEqual(TF.mealTimes('今天早上吃了一份呃荷叶鸡然后两个茶叶大晚上吃了两个香蕉').map(t => t.type), ['早餐', '晚餐']);
  assert.deepStrictEqual(TF.mealTimes('早饭包子，中午黄焖鸡，晚饭没吃，睡前一杯奶').map(t => t.type), ['早餐', '午餐', '晚餐', '加餐/补剂']);
  assert.deepStrictEqual(TF.mealTimes('昨晚火锅'), [{ word: '昨晚', type: '晚餐' }]);
  assert.deepStrictEqual(TF.mealTimes('刚吃了一份猪脚饭'), []);
  const two = Parser.buildMessages('早上两个包子晚上一碗面', { now: new Date('2026-09-29T21:22:00') });
  assert.match(two[1].content, /注意：这句话说到了不同的时间（早上→早餐、晚上→晚餐）/);
  assert.match(two[0].content, /一句话说了几个时间就拆成几条 meal/);
  const one = Parser.buildMessages('中午一碗面', { now: new Date('2026-09-29T12:30:00') });
  assert.doesNotMatch(one[1].content, /注意：这句话说到了不同的时间/);
});

test('大模型写的「早饭」「夜宵」认成标准餐次，不再按现在的钟点乱猜', () => {
  assert.strictEqual(TF.normMealType('早饭'), '早餐');
  assert.strictEqual(TF.normMealType('夜宵'), '加餐/补剂');
  assert.strictEqual(TF.normMealType('加餐'), '加餐/补剂');
  assert.strictEqual(TF.normMealType('晚餐'), '晚餐');
  assert.strictEqual(TF.normMealType('随便'), '');
  const night = new Date('2026-09-29T21:22:00'); // 这个钟点按时间猜会是「加餐」
  const r = Parser.normalize({ add: { meals: [
    { mealType: '早饭', foodSummary: '荷叶鸡', items: [{ name: '荷叶鸡', whole: true, calories: 520 }] },
    { mealType: '晚饭', foodSummary: '香蕉2根', items: [{ name: '香蕉', grams: 240, calories: 200 }] }
  ] } }, { now: night });
  assert.deepStrictEqual(r.meals.map(m => m.mealType), ['早餐', '晚餐']);
  const u = Parser.normalize({ update: [{ ref: 'r1', set: { mealType: '夜宵' } }, { ref: 'r1', set: { mealType: '不知道' } }] },
    { dayRecords: [{ ref: 'r1', kind: 'meal', id: 'd1' }] });
  assert.deepStrictEqual(u.updates, [{ ref: 'r1', set: { mealType: '加餐/补剂' } }]);
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

test('大模型失败：限流 / 超时会重试，最后还是失败就报错，不再用本地规则乱记', async () => {
  const origSend = Parser.send;
  Parser.retryWaits = [0, 0];
  try {
    // 前两次限流，第三次成功
    let n = 0;
    Parser.send = async () => {
      n += 1;
      if (n <= 2) throw new Error('HTTP 429 {"error":"Cluster RPM rate limit exceeded."}');
      return JSON.stringify({ choices: [{ message: { content: '{"reply":"ok","add":{"meals":[{"mealType":"早餐","foodSummary":"鸡蛋2个","items":[{"name":"鸡蛋","grams":100,"calories":140}]}]}}' } }] });
    };
    const r = await Parser.parse('早上两个鸡蛋', {});
    assert.strictEqual(n, 3);
    assert.strictEqual(r.meals[0].calories, 139);
    // 一直超时：重试两次后报错
    n = 0;
    Parser.send = async () => { n += 1; throw new Error('TIMEOUT'); };
    await assert.rejects(() => Parser.parse('两个水煮蛋加乳清蛋白粉700毫升', {}), /TIMEOUT/);
    assert.strictEqual(n, 3);
    assert.strictEqual(Parser.failReason(new Error('TIMEOUT')), '网络不好，AI 没连上，点「重试」');
    assert.strictEqual(Parser.failReason(new Error('HTTP 429 x')), 'AI 这会儿太忙（限流），点「重试」');
    assert.strictEqual(Parser.failReason(new Error('NO_KEY')), 'AI 接口没有配置 key');
    // 参数被拒（400）：换不带 thinking 的写法再试一次
    n = 0;
    Parser.send = async (body) => { n += 1; if (body.thinking) throw new Error('HTTP 400 bad param'); return JSON.stringify({ choices: [{ message: { content: '{"reply":"ok"}' } }] }); };
    await Parser.parse('随便', {});
    assert.strictEqual(n, 2);
  } finally {
    Parser.send = origSend;
    delete Parser.retryWaits;
  }
});
