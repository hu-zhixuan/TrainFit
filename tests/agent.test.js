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
