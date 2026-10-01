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
  // 本机识别（SenseVoice）直接出数字，还会加标点
  assert.strictEqual(quickWeight('称了一下，61.8公斤。'), 61.8);
  assert.strictEqual(quickWeight('体重，62.5。'), 62.5);
  assert.strictEqual(quickWeight('早上吃了2个包子。'), null);
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

test('兜底：大模型把早上和晚上吃的记成一条时，按原话拆开', () => {
  const said = '今天早上吃了一份呃荷叶鸡然后有一小份然后两个茶叶大晚上吃了两个香蕉两勺蛋白粉，七百毫升牛奶';
  // 用户截图里的结果：全记成了早餐
  const merged = { reply: '已记早餐', add: { meals: [{ mealType: '早餐', foodSummary: '荷叶鸡1小份、茶叶蛋2个、香蕉2根、蛋白粉2勺、牛奶700ml', items: [
    { name: '荷叶鸡', amount: '1小份', grams: 350, whole: true, calories: 520, proteinG: 30, carbsG: 50, fatG: 22 },
    { name: '茶叶蛋', amount: '2个', grams: 100, whole: true, calories: 150, proteinG: 13, carbsG: 1, fatG: 10 },
    { name: '香蕉', amount: '2根', grams: 240, whole: true, calories: 206, proteinG: 3, carbsG: 50, fatG: 0.5 },
    { name: '蛋白粉', amount: '2勺', grams: 60, whole: true, calories: 240, proteinG: 48, carbsG: 6, fatG: 3 },
    { name: '牛奶', amount: '700ml', grams: 700, whole: true, calories: 448, proteinG: 21, carbsG: 34, fatG: 25 }
  ] }] } };
  const night = new Date('2026-09-29T21:22:00');
  const r = Parser.normalize(merged, { said, now: night });
  assert.deepStrictEqual(r.meals.map(m => [m.mealType, m.foodSummary, m.calories]), [
    ['早餐', '荷叶鸡1小份、茶叶蛋2个', 670],
    ['晚餐', '香蕉2根、蛋白粉2勺、牛奶700ml', 894]
  ]);
  assert.strictEqual(r.meals[1].proteinG, 72);
  assert.strictEqual(r.reply, '分开记了早餐、晚餐');
  // 大模型已经分好了：不动
  const ok = Parser.normalize({ add: { meals: [
    { mealType: '早餐', foodSummary: '荷叶鸡', items: [merged.add.meals[0].items[0]] },
    { mealType: '晚餐', foodSummary: '香蕉', items: [merged.add.meals[0].items[2]] }
  ] } }, { said, now: night });
  assert.deepStrictEqual(ok.meals.map(m => m.mealType), ['早餐', '晚餐']);
  // 有一样东西在原话里找不到（比如大模型自己加的）：不拆，免得拆错
  const extra = JSON.parse(JSON.stringify(merged));
  extra.add.meals[0].items.push({ name: '烹调油', grams: 10, calories: 90 });
  assert.strictEqual(Parser.normalize(extra, { said, now: night }).meals.length, 1);
  // 只说了一个时间：不拆
  assert.strictEqual(Parser.normalize(merged, { said: '早上荷叶鸡茶叶蛋香蕉蛋白粉牛奶', now: night }).meals.length, 1);
  // 同一样东西早上晚上都说了，分不清：不拆
  const both = Parser.normalize({ add: { meals: [{ mealType: '晚餐', foodSummary: '鸡蛋、面条', items: [
    { name: '鸡蛋', amount: '2个', whole: true, calories: 140 }, { name: '面条', amount: '1碗', whole: true, calories: 400 }
  ] }] } }, { said: '早上吃了鸡蛋晚上又吃了鸡蛋和面条', now: night });
  assert.strictEqual(both.meals.length, 1);
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
    assert.strictEqual(Parser.failReason(new Error('TIMEOUT')), 'AI 这会儿太慢，没等到结果，点「重试」');
    assert.strictEqual(Parser.failReason(new Error('UnknownHostException: x')), '网络不好，AI 没连上，点「重试」');
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

test('大模型慢：过一会儿再发一份，谁先回来用谁；第一份很快失败就不补发', async () => {
  const origSend = Parser.send;
  Parser.hedgeMs = 30;
  Parser.retryWaits = [0, 0];
  const ok = (reply) => JSON.stringify({ choices: [{ message: { content: JSON.stringify({ reply }) } }] });
  const later = (ms, v, fail) => new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));
  try {
    // 第一份卡住（很久才回来），补发的那份先回来
    let n = 0;
    Parser.send = () => { n += 1; return n === 1 ? later(400, ok('慢的')) : later(10, ok('快的')); };
    const t0 = Date.now();
    const r = await Parser.parse('随便', {});
    assert.strictEqual(r.reply, '快的');
    assert.strictEqual(n, 2);
    assert.ok(Date.now() - t0 < 300, '不用等慢的那份');
    // 第一份马上 4xx：不补发，直接按原来的规则换写法
    n = 0;
    Parser.send = (body) => { n += 1; return body.thinking ? later(1, 'HTTP 400 bad param', true) : later(1, ok('ok')); };
    await Parser.parse('随便', {});
    assert.strictEqual(n, 2);
    // 两份都失败才算失败
    n = 0;
    Parser.send = () => { n += 1; return later(n % 2 ? 60 : 5, 'TIMEOUT', true); };
    await assert.rejects(() => Parser.parse('随便', {}), /TIMEOUT/);
  } finally {
    Parser.send = origSend;
    delete Parser.hedgeMs;
    delete Parser.retryWaits;
  }
});

test('热量对得上、蛋白质对不上：是大模型写错了，用成分表的（三个鸡蛋不是 39g 蛋白）', () => {
  const egg = groundItem({ name: '鸡蛋', amount: '3个', grams: 150, calories: 209, proteinG: 39 });
  assert.strictEqual(egg.src, '成分表');
  assert.ok(egg.proteinG > 17 && egg.proteinG < 22, String(egg.proteinG));
});

test('热量和蛋白质都差一倍：是大模型算错了量，用成分表的（两个水煮蛋不是 286 千卡）', () => {
  const egg = groundItem({ name: '鸡蛋', amount: '2个', grams: 100, calories: 286, proteinG: 26 });
  assert.strictEqual(egg.src, '成分表');
  assert.ok(egg.calories < 160 && egg.proteinG < 15, `${egg.calories} ${egg.proteinG}`);
});

test('大模型回到一半就断了（JSON 不完整）：再发一次', async () => {
  const origSend = Parser.send;
  Parser.retryWaits = [0, 0];
  let n = 0;
  try {
    Parser.send = async () => {
      n += 1;
      if (n === 1) return JSON.stringify({ choices: [{ message: { content: '{"reply":"这个问题我帮你算算","answer":"今天还差60g。\\n建议：乳清蛋白粉1勺（约120千卡' } }] });
      return JSON.stringify({ choices: [{ message: { content: '{"reply":"ok","answer":"今天还差60g。"}' } }] });
    };
    const r = await Parser.parse('今天还差多少蛋白', {});
    assert.strictEqual(n, 2);
    assert.strictEqual(r.answer, '今天还差60g。');
  } finally {
    Parser.send = origSend;
    delete Parser.retryWaits;
  }
});

test('品牌的东西按大模型估的官方数，不被库里通用的「汉堡」「拿铁」改掉', () => {
  const bk = groundItem({ name: '吉士汉堡', amount: '1个', grams: 116, whole: false, calories: 300, proteinG: 15, carbsG: 30, fatG: 13 });
  assert.strictEqual(bk.src, '估算');
  assert.strictEqual(bk.calories, 300);
  assert.strictEqual(bk.whole, true);
  const latte = groundItem({ name: '瑞幸生椰拿铁', amount: '1杯', grams: 350, calories: 200, proteinG: 2 });
  assert.strictEqual(latte.src, '估算');
  // 没说牌子的照常查库
  assert.notStrictEqual(groundItem({ name: '米饭', amount: '1碗', grams: 180, calories: 200, proteinG: 4 }).src, '估算');
});

test('蛋白质：「蛋白粉」按乳清算、「虾仁」按鲜虾仁算，脱脂奶单独一条', () => {
  const whey = groundItem({ name: '蛋白粉', amount: '2勺', grams: 60, calories: 230, proteinG: 46 });
  assert.strictEqual(whey.dbName, '乳清蛋白粉');
  assert.strictEqual(whey.proteinG, 46.8);                 // 以前按成分表里 50% 的品牌蛋白粉算成 30g
  const shrimp = groundItem({ name: '虾仁', grams: 150, calories: 140, proteinG: 28 });
  assert.ok(shrimp.proteinG > 25, String(shrimp.proteinG)); // 以前按「虾仁（红）」算成 15.6g
  assert.strictEqual(FoodDB.find('脱脂牛奶').f, 0.3);
});

test('蛋白质和热量都和大模型差得多：多半是库里匹配错了，用大模型的估算', () => {
  // 假设大模型认为这 100g 有 200 千卡、25g 蛋白，而库里对上的条目只有 116 千卡、2.6g → 不像同一样东西，不用库
  const it = groundItem({ name: '米饭', grams: 100, calories: 200, proteinG: 25 });
  assert.strictEqual(it.src, '估算');
  assert.strictEqual(it.proteinG, 25);
  // 差得不多：照常用库
  assert.strictEqual(groundItem({ name: '米饭', grams: 200, calories: 230, proteinG: 5 }).src, '成分表');
});

test('吃进嘴的都能记：补剂带营养素、热量 0 的也记，补剂单独一条「加餐/补剂」', () => {
  const r = Parser.normalize({ add: { meals: [
    { mealType: '早餐', foodSummary: '包子2个、鱼油2粒、钙片1片', items: [
      { name: '包子', amount: '2个', whole: true, calories: 460, proteinG: 16, carbsG: 60, fatG: 16 },
      { name: '鱼油', amount: '2粒', kind: 'supplement', calories: 18, fatG: 2, nutrients: { 'EPA+DHA': 600 } },
      { name: '钙片', amount: '1片', kind: 'supplement', calories: 0, nutrients: { '钙': 600, '维D': 5, '肌酸': 1 } }] },
    { mealType: '午餐', foodSummary: '矿泉水1瓶', items: [{ name: '矿泉水', amount: '1瓶', calories: 0 }] }
  ] } }, { now: new Date('2026-09-29T09:00:00') });
  assert.deepStrictEqual(r.meals.map(m => [m.mealType, m.foodSummary, m.calories]), [
    ['早餐', '包子2个', 460], ['午餐', '矿泉水1瓶', 0], ['加餐/补剂', '鱼油2粒、钙片1片', 18]
  ]);
  const calcium = r.meals[2].items[1];
  assert.strictEqual(calcium.supp, true);
  assert.strictEqual(calcium.src, '补剂');
  assert.deepStrictEqual(calcium.nutrients, { '钙': 600, '维生素D': 5 }); // 认不出的营养素丢掉
  // 没说热量的还是不记
  assert.strictEqual(groundItem({ name: '不知道', grams: 100 }), null);
});

test('记住的补剂：按粒数换算营养素', () => {
  const my = [TF.MyFoods.clean({ name: '鱼油', amount: '1粒', kind: 'supplement', calories: 9, nutrients: { 'EPA+DHA': 700 } })];
  assert.strictEqual(my[0].supp, true);
  const it = groundItem({ name: '鱼油', amount: '3粒', kind: 'supplement', calories: 27 }, my);
  assert.strictEqual(it.src, '我的');
  assert.deepStrictEqual(it.nutrients, { 'EPA+DHA': 2100 });
  assert.strictEqual(TF.MyFoods.clean({ name: '锌片', calories: 0 }), null); // 0 热量又没营养素：不记
});

test('回头补一句只改那一样：其他原样保留，名字对得上就替换', () => {
  const old = [
    { name: '鸡蛋', amount: '2个', grams: 100, calories: 139, proteinG: 13.1, carbsG: 2.4, fatG: 8.6, src: '成分表' },
    { name: '鲜牛奶', amount: '200毫升', grams: 200, calories: 128, proteinG: 6.4, carbsG: 9.6, fatG: 7.2, src: '菜品库' },
    { name: '乳清蛋白粉', amount: '30克', grams: 30, calories: 116, proteinG: 23.4, carbsG: 2.6, fatG: 1.2, src: '菜品库' }
  ];
  // 「刚才那个牛奶是甜牛奶，包装上写…」：叫法变了也能对上（公共片段「牛奶」）
  const sweet = TF.mergeItems(old, [{ name: '甜牛奶', amount: '250毫升', grams: 250, calories: 173, proteinG: 7, src: '包装' }]);
  assert.deepStrictEqual(sweet.map(i => i.name), ['鸡蛋', '甜牛奶', '乳清蛋白粉']);
  assert.strictEqual(sweet[0], old[0]); // 没说到的原样保留
  // was 指明原名；去掉某一样；新加的一样
  const r = TF.mergeItems(old, [{ name: '全麦面包', amount: '1片', calories: 90, was: '乳清蛋白粉' }, { name: '香蕉', amount: '1根', calories: 90 }], ['鸡蛋']);
  assert.deepStrictEqual(r.map(i => i.name), ['鲜牛奶', '全麦面包', '香蕉']);
  assert.strictEqual(r[1].was, undefined);

  // 大模型给的 update：只带改的那一样，合计不用它给的，保存时合并后重算
  const ctx = { dayRecords: [{ ref: 'r1', kind: 'meal', id: 'd1' }] };
  const n = Parser.normalize({ update: [{ ref: 'r1', set: { calories: 999, proteinG: 1, items: [
    { name: '甜牛奶', was: '鲜牛奶', amount: '250毫升', grams: 250, source: 'label', calories: 173, proteinG: 7, carbsG: 22, fatG: 5.5 },
    { name: '鸡蛋', remove: true }] } }] }, ctx);
  const set = n.updates[0].set;
  assert.strictEqual(set.calories, undefined);
  assert.strictEqual(set.items[0].was, '鲜牛奶');
  assert.strictEqual(set.items[0].src, '包装');
  assert.deepStrictEqual(set.removeItems, ['鸡蛋']);
  const merged = TF.mergeItems(old, set.items, set.removeItems);
  assert.deepStrictEqual(merged.map(i => i.name), ['甜牛奶', '乳清蛋白粉']);
  assert.strictEqual(TF.sumItems(merged).proteinG, 30.4);
});

test('问问题：回答单独放在 answer 里（去掉 markdown，最多 8 行），提示词里带上今天的预算和蛋白质', () => {
  const r = Parser.normalize({ reply: '给了你明天的食谱', answer: '**早餐**：两个鸡蛋\n- 午餐：牛肉饭\n\n1. 晚餐：鸡胸\n## 加餐：酸奶', add: {} }, {});
  assert.strictEqual(r.answer, '早餐：两个鸡蛋\n午餐：牛肉饭\n晚餐：鸡胸\n加餐：酸奶');
  assert.strictEqual(r.meals.length, 0);
  assert.strictEqual(Parser.normalize({ answer: Array(12).fill('一行').join('\n') }, {}).answer.split('\n').length, 8);
  assert.strictEqual(Parser.normalize({ reply: 'x' }, {}).answer, '');
  assert.strictEqual(Parser.normalize({ reply: '记了早餐，晚上建议看answer', answer: 'y' }, {}).reply, '记了早餐，晚上建议看小人');
  const msg = Parser.buildMessages('明天吃啥', { day: { goal: 'muscle_gain', budget: 2600, burn: 300, intake: 1500, protein: 80, proteinTarget: 140 } })[1].content;
  assert.match(msg, /目标增肌；热量预算 2600 千卡（含训练消耗 300），已吃 1500，还能吃 1100；蛋白质目标 140g，已吃 80g/);
});

test('听着像提问就先让小人说「我想想」；记录不算', () => {
  const { looksLikeQuestion } = require('../web/js/log/helpers.js');
  for (const t of ['给我制定一下明天的食谱，我训练强度比较大，碳水可能要多一点', '今天还差多少蛋白质', '晚上能不能吃火锅', '明天练什么好', '晚上吃点啥', '这个奶茶热量高吗'])
    assert.ok(looksLikeQuestion(t), t);
  for (const t of ['中午吃了一碗牛肉面', '早上两个包子一杯豆浆', '卧推80公斤4组8个', '体重62.5', '我吃了什么', '给我记一下早餐两个鸡蛋'])
    assert.ok(!looksLikeQuestion(t), t);
});

test('边想边出字：answer 还没写完也能先拿出已经出来的字', () => {
  const { partialAnswer } = TF;
  assert.strictEqual(partialAnswer('{"reply":"给了你'), '');
  assert.strictEqual(partialAnswer('{"reply":"x","answer":"早餐：两个鸡蛋\\n午餐：米'), '早餐：两个鸡蛋\n午餐：米');
  assert.strictEqual(partialAnswer('{"reply":"x","answer":"约\\u5343卡\\"'), '约千卡"');
  assert.strictEqual(partialAnswer('{"reply":"x","answer":null,"add":{}}'), '');
  assert.strictEqual(partialAnswer('{"answer":"全部写完了","plan":null}'), '全部写完了');
});

test('计划：和记录一样整理（按库算热量），不存成记录；回答写成数组也认', () => {
  const r = Parser.normalize({ reply: '给了你明天的食谱', answer: ['早餐：鸡蛋2个＋牛奶', '午餐：米饭＋鸡胸'],
    plan: { dayOffset: 1, meals: [{ mealType: '早餐', foodSummary: '鸡蛋2个、牛奶1杯', items: [{ name: '鸡蛋', amount: '2个', grams: 100, calories: 140, proteinG: 13 }, { name: '牛奶', amount: '1杯', grams: 250, calories: 160, proteinG: 8 }] }],
      workouts: [{ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80, sets: 4, reps: 8 }] } }, {});
  assert.strictEqual(r.answer, '早餐：鸡蛋2个＋牛奶\n午餐：米饭＋鸡胸');
  assert.strictEqual(r.meals.length, 0);
  assert.strictEqual(r.workouts.length, 0);
  assert.strictEqual(r.plan.dayOffset, 1);
  assert.strictEqual(r.plan.meals[0].mealType, '早餐');
  assert.ok(r.plan.meals[0].calories > 250 && r.plan.meals[0].calories < 330);
  assert.strictEqual(r.plan.workouts[0].weightKg, 80);
  // 只是回答问题：没有 plan
  assert.strictEqual(Parser.normalize({ answer: '还差60g蛋白' }, {}).plan, undefined);
  // 「早餐照计划吃了」：只认这天真有的计划编号
  const d = Parser.normalize({ add: { meals: [] }, donePlans: ['p1', 'p9'] }, { plans: [{ ref: 'p1', text: 'x' }] });
  assert.deepStrictEqual(d.donePlans, ['p1']);
});
