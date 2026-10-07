// 小人能动手（v6.5）：本机认得出的动手说法、大模型给的动作怎么洗、计划本跟着备份合并
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const A = require('../web/js/log/agent_intent.js');
const { mergeBackupData } = require('../web/js/app/backup.js');

const mon = new Date(2026, 9, 5, 10, 0); // 2026-10-05 周一
const names = ['计划A', '练腿日', '胸+肩'];
const m = (t) => A.matchSkill(t, names, mon);

test('说到哪一天：明天、周五、下周三、上周一（按自然周）', () => {
  assert.strictEqual(A.dayOffset('明天', mon), 1);
  assert.strictEqual(A.dayOffset('周五', mon), 4);
  assert.strictEqual(A.dayOffset('周一', mon), 0, '今天就是周一');
  assert.strictEqual(A.dayOffset('下周三', mon), 9);
  assert.strictEqual(A.dayOffset('上周一', mon), -7);
  assert.strictEqual(A.dayOffset('下个星期天', mon), 13);
  assert.strictEqual(A.dayOffset('随便', mon), null);
});

test('本机认得出的动手说法：用计划、挪、清、照搬、存；在问的、记录的不认', () => {
  assert.deepStrictEqual(m('我明天要练我之前的这个计划A，帮我把计划A放成明天的计划'), { do: 'usePlan', name: '计划A', dayOffset: 1 }, '用户原话');
  assert.deepStrictEqual(m('明天练计划a'), { do: 'usePlan', name: '计划A', dayOffset: 1 }, '大小写不管');
  assert.deepStrictEqual(m('把练腿日排到周五'), { do: 'usePlan', name: '练腿日', dayOffset: 4 });
  assert.deepStrictEqual(m('把明天的计划挪到后天'), { do: 'movePlan', from: 1, to: 2 });
  assert.deepStrictEqual(m('明天不练了'), { do: 'clearPlan', dayOffset: 1 });
  assert.deepStrictEqual(m('取消周五的计划'), { do: 'clearPlan', dayOffset: 4 });
  assert.deepStrictEqual(m('把上周一练的放到明天'), { do: 'copyDay', from: -7, to: 1, what: 'workouts' });
  assert.deepStrictEqual(m('明天照着上周一练'), { do: 'copyDay', from: -7, to: 1, what: 'workouts' });
  assert.deepStrictEqual(m('把这个计划存起来叫练背日'), { do: 'savePlan', from: 'plan', name: '练背日' });
  assert.deepStrictEqual(m('把今天练的存成计划B'), { do: 'savePlan', from: 'day', what: 'workouts', dayOffset: 0, name: '计划B' });
  for (const t of ['明天练计划A吗？', '明天吃什么', '今天中午吃了牛肉面', '卧推80公斤4组8个', '计划A怎么练'])
    assert.strictEqual(m(t), null, t);
});

test('大模型给的动作：只认那几种，数字夹在范围里，不认的丢掉', () => {
  const acts = TF.Parser.cleanActs([{ do: 'usePlan', name: '计划A', dayOffset: 99 }, { do: 'rm -rf' }, { do: 'goal', goal: 'bulk' }, { do: 'goal', goal: 'muscle_gain' },
    { do: 'protein', g: 999 }, { do: 'remind', kind: 'weigh', time: '7:00' }, { do: 'movePlan', from: 1, to: 1 }]);
  assert.deepStrictEqual(acts, [{ do: 'usePlan', name: '计划A', dayOffset: 30 }, { do: 'goal', goal: 'muscle_gain' }, { do: 'remind', kind: 'weigh', time: '7:00', on: true }]);
  const r = TF.Parser.normalize({ reply: '放好了', act: { do: 'copyDay', from: -7, to: 1 }, dayOffset: 0 }, {});
  assert.deepStrictEqual(r.acts, [{ do: 'copyDay', from: -7, to: 1, what: 'workouts' }], '只给一个对象也认');
});

test('提示词：说到计划时带上存好的计划和前后一周的日期；回答用小人的口吻', () => {
  const ctx = { date: '2026-10-05', planBook: ['「练腿日」杠铃深蹲、腿举'], voice: { name: '江叙', speech: '话少、句子短' } };
  const u = TF.Parser.buildMessages('明天照上周一练', ctx)[1].content;
  assert.ok(u.includes('存好的计划（act 用这里的名字）：「练腿日」'));
  assert.ok(u.includes('-7：9月28日 周一'), '上周一的日期要给它');
  assert.ok(u.includes('用「江叙」的口吻说：话少、句子短'));
  assert.ok(TF.Parser.buildMessages('明天照上周一练', ctx)[0].content.includes('"do":"usePlan"'), '规则 12');
  assert.ok(!TF.Parser.buildMessages('中午吃了面', { date: '2026-10-05' })[1].content.includes('日期对照'), '平常记录不带日期对照');
});

test('存好的计划跟着备份合并，同名的以这边为准', () => {
  const cur = { fit_profile: { customized: true, planBook: [{ name: '练腿日', workouts: [{ exerciseName: '深蹲' }] }] }, fit_diet: [{ id: 'a', date: '2026-10-01' }], fit_workouts: [], fit_weights: [], fit_my_foods: [] };
  const bak = { fit_profile: { planBook: [{ name: '练腿日', workouts: [{ exerciseName: '旧的' }] }, { name: '计划A', workouts: [{ exerciseName: '卧推' }] }] }, fit_diet: [], fit_workouts: [], fit_weights: [], fit_my_foods: [] };
  const book = mergeBackupData(cur, bak).data.fit_profile.planBook;
  assert.deepStrictEqual(book.map(e => e.name).sort(), ['练腿日', '计划A'].sort());
  assert.strictEqual(book.find(e => e.name === '练腿日').workouts[0].exerciseName, '深蹲');
});

// v9.2（用户：「我发一个计划，跟它说这是我的序列 A 上肢日，叫它帮我排到今天的 ToDoList，它说做不到」）
test('自己发来的计划：大模型写 addPlan / savePlan，内容带在动作里，按记录的规矩洗一遍', () => {
  const r = TF.Parser.normalize({ reply: '排进今天了', dayOffset: 0, act: [
    { do: 'addPlan', name: '序列A 上肢日', dayOffset: 0, workouts: [{ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 60, sets: 4, reps: 8 }, { exerciseName: '跳绳', durationMin: 10 }] },
    { do: 'savePlan', name: '序列B 全身复合日', workouts: [{ exerciseName: '杠铃深蹲', muscleGroup: '腿部', weightKg: 80, sets: 5, reps: 5 }] },
    { do: 'addPlan', name: '空的', workouts: [] }] }, {});
  assert.strictEqual(r.acts.length, 2, '没内容的 addPlan 不要');
  const [add, save] = r.acts;
  assert.strictEqual(add.do, 'addPlan');
  assert.strictEqual(add.name, '序列A 上肢日');
  assert.strictEqual(add.dayOffset, 0);
  assert.deepStrictEqual(add.workouts.map(w => [w.exerciseName, w.weightKg, w.sets, w.reps]).slice(0, 1), [['杠铃卧推', 60, 4, 8]], '重量组数照抄');
  assert.strictEqual(add.workouts[1].muscleGroup, '有氧', '跳绳按有氧');
  assert.strictEqual(save.from, 'inline');
  assert.strictEqual(save.workouts[0].exerciseName, '杠铃深蹲');
  assert.deepStrictEqual(r.workouts, [], '不当成已经练了');
  const sys = TF.Parser.buildMessages('这是我的序列A上肢日，排到今天的待办', { date: '2026-10-05' });
  assert.ok(sys[0].content.includes('"do":"addPlan"'), '规则 12 写着自己发来的计划怎么排');
  assert.ok(sys[1].content.includes('日期对照'), '说到待办也给日期对照');
});

test('存的是「序列A 上肢日」，说「今天练序列A」本机就认得；部位词、两份都有的编号不乱认', () => {
  const book = ['序列A 上肢日', '序列B 全身复合日', '练腿日'];
  const s = (t) => A.matchSkill(t, book, mon);
  assert.deepStrictEqual(s('今天练序列A'), { do: 'usePlan', name: '序列A 上肢日', dayOffset: 0 });
  assert.deepStrictEqual(s('明天排序列b'), { do: 'usePlan', name: '序列B 全身复合日', dayOffset: 1 });
  assert.deepStrictEqual(s('把序列A上肢日放到周三'), { do: 'usePlan', name: '序列A 上肢日', dayOffset: 2 });
  assert.strictEqual(s('今天练了上肢，卧推60公斤'), null, '部位词不单独认');
  assert.strictEqual(A.findName('今天练序列', ['序列A 上肢日', '序列B 全身']), '', '编号对不上不认');
  assert.deepStrictEqual(A.nameKeys('序列A 上肢日'), ['序列a上肢日', '序列a']);
});

test('提示条里教你怎么说：用名字里的编号那一段', () => {
  assert.strictEqual(A.shortName('序列A 上肢日'), '序列A');
  assert.strictEqual(A.shortName('练腿日'), '练腿日');
  assert.strictEqual(A.shortName('计划A'), '计划A');
});

// v9.2 第二轮（用户：「列入待办以后，明天的饮食搬到今天也要能用；每天点一下完成，消耗的卡路里就加上去；训练的识别和记录更精准、更方便」）
test('搬计划、照搬、一句话全记上：本机认得出', () => {
  const s = (t) => A.matchSkill(t, ['序列A 上肢日'], mon);
  assert.deepStrictEqual(s('把明天的饮食搬到今天'), { do: 'movePlan', from: 1, to: 0, what: 'meals' });
  assert.deepStrictEqual(s('明天的训练挪到周五'), { do: 'movePlan', from: 1, to: 4, what: 'workouts' });
  assert.deepStrictEqual(s('把明天的计划挪到后天'), { do: 'movePlan', from: 1, to: 2 });
  assert.deepStrictEqual(s('把明天的食谱复制到今天'), { do: 'copyDay', from: 1, to: 0, what: 'meals' });
  assert.deepStrictEqual(s('把昨天练的放到明天'), { do: 'copyDay', from: -1, to: 1, what: 'workouts' }, '以前的日子还是照搬记录');
  assert.deepStrictEqual(s('上肢日都练完了'), { do: 'donePlan', dayOffset: 0, what: 'workouts' });
  assert.deepStrictEqual(s('今天的计划都完成了'), { do: 'donePlan', dayOffset: 0, what: 'all' });
  for (const t of ['早饭午饭都吃完了', '我都练完了，好累', '今天吃完了吗', '今天练了卧推60公斤']) assert.strictEqual(s(t), null, t);
  const acts = TF.Parser.cleanActs([{ do: 'movePlan', from: 1, to: 0, what: 'meals' }, { do: 'donePlan', what: 'workouts' }]);
  assert.deepStrictEqual(acts, [{ do: 'movePlan', from: 1, to: 0, what: 'meals' }, { do: 'donePlan', dayOffset: 0, what: 'workouts' }]);
});

test('大模型把自己发来的计划写成了 plan、没写 answer：照样放到那天（实测 1/27）', () => {
  const r = TF.Parser.normalize({ reply: '排好了', dayOffset: 0, plan: { dayOffset: 1, workouts: [{ exerciseName: '跑步', durationMin: 30 }, { exerciseName: '卷腹', sets: 4, reps: 20 }] },
    act: [{ do: 'savePlan', name: '跑步核心日', from: 'plan' }] }, { lastWeight: 72 });
  assert.strictEqual(r.acts.length, 1);
  assert.deepStrictEqual([r.acts[0].do, r.acts[0].name, r.acts[0].dayOffset, r.acts[0].workouts.length], ['addPlan', '跑步核心日', 1, 2]);
  const q = TF.Parser.normalize({ reply: '给了你明天的计划', answer: '明天：跑步 30 分钟', dayOffset: 0, plan: { dayOffset: 1, workouts: [{ exerciseName: '跑步', durationMin: 30 }] } }, {});
  assert.deepStrictEqual(q.acts, [], '有回答的照旧是「给你看的计划」，点了才加');
});

test('真实大模型第二轮的两处毛病：拿 update 挪计划、排了明天又当成今天练了', () => {
  const now = new Date(2026, 9, 6, 19, 50);
  assert.deepStrictEqual(A.matchSkill('明天那几顿吃的，改成今天吃吧', [], now), { do: 'movePlan', from: 1, to: 0, what: 'meals' }, '这句本机就认得');
  assert.deepStrictEqual(A.matchSkill('明天的饭挪到今天', [], now), { do: 'movePlan', from: 1, to: 0, what: 'meals' });
  // 大模型写了 update，编号是它自己编的计划行（计划没有编号）→ 当成 movePlan
  const mv = TF.Parser.normalize({ reply: '改好了，都挪到今天。', update: [{ ref: 'p1m1', set: { dayOffset: 0 } }, { ref: 'p1m2', set: { dayOffset: 0 } }], dayOffset: 0 },
    { now, said: '明天那几顿吃的，改成今天吃吧', dayRecords: [], plans: [] });
  assert.deepStrictEqual(mv.acts, [{ do: 'movePlan', from: 1, to: 0, what: 'meals' }]);
  assert.strictEqual(mv.updates.length, 0);
  // 记录的编号照旧是改记录
  const rec = TF.Parser.normalize({ reply: '挪好了', update: [{ ref: 'r1', set: { dayOffset: -1 } }], dayOffset: 0 },
    { now, said: '这个挪到昨天', dayRecords: [{ ref: 'r1' }], plans: [] });
  assert.deepStrictEqual([rec.acts.length, rec.updates.length], [0, 1]);
  // 排了明天的计划，又把同样几样记成今天练了（没说练了）→ 不记
  const dup = TF.Parser.normalize({ reply: '排好了', dayOffset: 0,
    add: { workouts: [{ exerciseName: '跑步', durationMin: 30 }, { exerciseName: '卷腹', sets: 4, reps: 20 }] },
    plan: { dayOffset: 1, workouts: [{ exerciseName: '跑步', durationMin: 30 }, { exerciseName: '卷腹', sets: 4, reps: 20 }] } },
    { now, said: '明天照这个练：跑步30分钟，卷腹4组20个', lastWeight: 72 });
  assert.deepStrictEqual([dup.workouts.length, dup.acts[0].do, dup.acts[0].dayOffset], [0, 'addPlan', 1]);
  // 说了今天练了、明天照这个练：今天的照记
  const both = TF.Parser.normalize({ reply: '记上了，明天也排好了', dayOffset: 0,
    add: { workouts: [{ exerciseName: '跑步', durationMin: 30 }] },
    act: [{ do: 'addPlan', name: '', dayOffset: 1, workouts: [{ exerciseName: '跑步', durationMin: 30 }] }] },
    { now, said: '今天跑了30分钟，明天也照这个练', lastWeight: 72 });
  assert.deepStrictEqual([both.workouts.length, both.acts.length], [1, 1]);
});

test('训练消耗更准：力量按做的时间算，大模型给的离谱就不用；按时间的运动写了组数也按时间', () => {
  const w = (o) => TF.Parser.normalize({ reply: 'x', dayOffset: 0, add: { workouts: [o] } }, { lastWeight: 70 }).workouts[0];
  const bench = w({ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80, sets: 4, reps: 8 });
  assert.ok(bench.burnedCalories >= 30 && bench.burnedCalories <= 55, `卧推 80kg 4×8 约 40 千卡：${bench.burnedCalories}`);
  assert.ok(w({ exerciseName: '杠铃深蹲', muscleGroup: '腿部', weightKg: 100, sets: 5, reps: 5 }).burnedCalories > w({ exerciseName: '哑铃弯举', muscleGroup: '手臂', weightKg: 100, sets: 5, reps: 5 }).burnedCalories, '下肢大复合消耗多');
  assert.ok(w({ exerciseName: '卷腹', muscleGroup: '核心', sets: 4, reps: 20 }).burnedCalories <= 60, '卷腹 4×20 不能算 200 千卡');
  assert.strictEqual(w({ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80, sets: 4, reps: 8, burnedCalories: 300 }).burnedCalories, bench.burnedCalories, '大模型给的离谱');
  assert.strictEqual(w({ exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80, sets: 4, reps: 8, burnedCalories: 45 }).burnedCalories, 45, '差不多就用它的');
  const plank = w({ exerciseName: '平板支撑', muscleGroup: '核心', sets: 3, durationMin: 3 });
  assert.deepStrictEqual([plank.durationMin, plank.sets, plank.reps], [3, 1, 0], '平板支撑 3 组共 3 分钟，不是 3×10');
  assert.ok(TF.Parser.buildMessages('卧推', { date: '2026-10-05' })[0].content.includes('"burnedCalories":40'), '例子里的数也改了');
});

test('序列轮着练（v10.1）：「今天练什么」本机认得；按最近的训练记录看哪份最久没练，今天练过的说下次', () => {
  assert.deepStrictEqual(TF.quickIntent('今天练什么', []), { kind: 'nextPlan', day: 0 });
  assert.deepStrictEqual(TF.quickIntent('明天该练啥', []), { kind: 'nextPlan', day: 1 });
  assert.deepStrictEqual(TF.quickIntent('轮到哪个序列了', []), { kind: 'nextPlan', day: 0 });
  assert.strictEqual(TF.quickIntent('今天练什么好呢，腿还酸', []), null, '带别的意思的交给大模型');
  // 一个最小的 app：只有计划本和训练记录
  global.getTodayDateString = () => '2026-10-07';
  global.shiftDateString = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  global.FitnessApp = global.FitnessApp || class {};
  require('../web/js/app/agent.js');
  const W = (names) => names.map(n => ({ exerciseName: n, weightKg: 40, sets: 4, reps: 8 }));
  const A = { name: '序列A 上肢日', workouts: W(['杠铃卧推', '杠铃划船', '哑铃推举', '引体向上']) };
  const B = { name: '序列B 全身复合日', workouts: W(['杠铃深蹲', '硬拉', '杠铃卧推', '哑铃弓步']) };
  const app = Object.create(FitnessApp.prototype);
  app.profile = { planBook: [A, B, { name: '练腿（10月1日）', auto: true, workouts: W(['杠铃深蹲', '腿举']) }] };
  const rec = (date, names) => names.map(n => ({ date, exerciseName: n }));
  app.workouts = rec('2026-10-05', ['杠铃卧推', '杠铃划船', '哑铃推举']).concat(rec('2026-10-03', ['杠铃深蹲', '硬拉', '卧推']));
  let q = app.nextSequence();
  assert.strictEqual(q.entry, B, 'A 是 5 号练的，B 是 3 号练的：轮到 B');
  assert.strictEqual(q.last, '2026-10-03');
  assert.strictEqual(q.others[0].last, '2026-10-05');
  // 今天练了 B：下次轮到 A
  app.workouts = app.workouts.concat(rec('2026-10-07', ['杠铃深蹲', '硬拉', '哑铃弓步']));
  q = app.nextSequence();
  assert.strictEqual(q.done, B);
  assert.strictEqual(q.entry, A);
  // 从没练过的排最前；只有一份序列（auto 的不算）不轮
  app.profile.planBook = [A, B, { name: '序列C 有氧', workouts: W(['跑步', '跳绳']) }];
  assert.strictEqual(app.nextSequence().entry.name, '序列C 有氧');
  app.profile.planBook = [A];
  assert.strictEqual(app.nextSequence(), null);
});
