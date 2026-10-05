// 小剧情（v6.3）：什么时候出哪段、恋人线的条件；两个人的台词齐全、表情都认得
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
const CAST = require('../web/js/app/cast.js');
const Story = require('../web/js/app/story.js');
require('../web/js/app/buddy.js');
const FACE_MOOD = global.TF.Buddy.FACE_MOOD;

const base = { lv: 4, hour: 20, weekend: false, days: 30, lvDays: 5, food: '', roll: 0.9, today: '2026-10-03', seen: [], romance: undefined };
const pick = (c) => (Story.pick(Object.assign({}, base, c)) || {}).id;

test('记了火锅、奶茶：马上一段；深夜打开：睡不着；记满 7 天：第七天', () => {
  assert.strictEqual(pick({ trigger: 'record', food: '火锅、肥牛' }), 'hotpot');
  assert.strictEqual(pick({ trigger: 'record', food: '珍珠奶茶1杯' }), 'sweet');
  assert.strictEqual(pick({ trigger: 'record', food: '米饭1碗' }), undefined);
  assert.strictEqual(pick({ trigger: 'night', hour: 23 }), 'night');
  assert.strictEqual(pick({ trigger: 'night', hour: 23, lv: 2 }), undefined, '刚认识的不半夜找你');
  assert.strictEqual(pick({ trigger: 'open', lv: 1, hour: 10, days: 7 }), 'firstweek');
  assert.strictEqual(pick({ trigger: 'open', lv: 1, hour: 10, days: 3 }), undefined);
});

test('「那句话」：第一次在主线第四章（v7.1）；小剧情只在选了「让我想想」七天后、晚上再问；选过了就不再问', () => {
  const seen = ['firstweek'];
  assert.strictEqual(pick({ trigger: 'open', seen }) === 'confess', false, '第一次表白在主线里，小剧情不抢');
  const later = { confessAfter: '2026-10-03' };
  assert.strictEqual(pick(Object.assign({ trigger: 'open', seen: seen.concat('confess') }, later)), 'confess');
  assert.strictEqual(pick(Object.assign({ trigger: 'open', seen, lv: 3 }, later)), 'secret', 'Lv3 还不问');
  assert.strictEqual(pick(Object.assign({ trigger: 'open', seen, hour: 10 }, later)) === 'confess', false, '白天不问');
  assert.strictEqual(pick({ trigger: 'open', seen: seen.concat('confess'), confessAfter: '2026-10-08' }) === 'confess', false, '想想：七天内不再问');
  assert.strictEqual(pick({ trigger: 'open', seen: seen.concat('confess'), confessAfter: '2026-10-03' }), 'confess', '七天到了再问');
  assert.strictEqual(pick({ trigger: 'open', seen: seen.concat('confess'), romance: false }) === 'confess', false);
  // 恋人线：周末晚上「算约会吗」；不是恋人不出
  assert.strictEqual(pick({ trigger: 'open', seen: seen.concat('confess', 'secret'), romance: true, weekend: true, hour: 19 }), 'date');
  assert.strictEqual(pick({ trigger: 'open', seen: seen.concat('confess', 'secret'), romance: false, weekend: true, hour: 19 }) === 'date', false);
});

test('每段只出一次（「那句话」没选定前除外）', () => {
  assert.strictEqual(pick({ trigger: 'record', food: '火锅', seen: ['hotpot'] }), undefined);
});

test('江叙、夏柚：每段剧情都有、三个选项、表情都认得；「那句话」三个选项是恋人 / 搭子 / 想想', () => {
  for (const id of Story.EVENTS.map(e => e.id)) {
    for (const k of ['jx', 'xy']) {
      const E = CAST[k].events[id];
      assert.ok(E && E.title && E.lines.length >= 1 && E.choices.length === 3, `${k} ${id}`);
      E.lines.forEach(([f, t]) => assert.ok(FACE_MOOD[f] && t, `${k} ${id} ${f}`));
      E.choices.forEach(c => { assert.ok(c[0] && c[1] && FACE_MOOD[c[2]], `${k} ${id} ${c[0]}`); assert.ok(c[3] || c[4] === 'later', `${k} ${id} ${c[0]} 没写记下的事`); });
    }
  }
  for (const k of ['jx', 'xy']) {
    assert.deepStrictEqual(CAST[k].events.confess.choices.map(c => c[4]), ['romance', 'friend', 'later']);
    const H = CAST[k].heart;
    assert.strictEqual(H.miss.length, 5);
    // 想你的话不让人内疚：不问去哪了、不说难过、不说只有你
    H.miss.concat(H.low.busy, H.saved).forEach(t => assert.doesNotMatch(t, /去哪|怎么不来|难过|只有你|等了你|不理我/, t));
  }
});

test('跟着记录来的剧情（v6.4）：第一次破纪录、吃超 300 以上、一周练满五天、比刚开始轻了一公斤；看过了就不再出', () => {
  const rec = (c) => pick(Object.assign({ trigger: 'record', lv: 1 }, c));
  assert.strictEqual(rec({ moment: 'pr' }), 'firstpr');
  assert.strictEqual(rec({ moment: 'over', over: 180 }), undefined, '吃超一点不演');
  assert.strictEqual(rec({ moment: 'over', over: 420 }), 'stuffed');
  assert.strictEqual(rec({ moment: 'week', week: 3 }), undefined);
  assert.strictEqual(rec({ moment: 'week', week: 5 }), 'trainweek');
  assert.strictEqual(rec({ moment: 'lighter', drop: 0.4 }), undefined);
  assert.strictEqual(rec({ moment: 'lighter', drop: 1.2 }), 'lighter');
  assert.strictEqual(rec({ moment: 'pr', seen: ['firstpr'] }), undefined, '演过的不再演，之后是卡片');
  assert.strictEqual(rec({ moment: 'over', over: 500, food: '火锅' }), 'stuffed', '吃撑的火锅先演吃撑');
  for (const k of ['jx', 'xy']) for (const id of ['firstpr', 'stuffed', 'trainweek', 'lighter']) {
    const e = CAST[k].events[id];
    assert.ok(e && e.lines.length >= 2 && e.choices.length === 3, k + ' ' + id);
    assert.ok(e.choices.every(c => FACE_MOOD[c[2]] && c[3]), k + ' ' + id + ' 表情和记住的话');
  }
  assert.ok(CAST.jx.events.trainweek.choices.some(c => c[4] === 'flex'), '「让我看看」秀一下练出来的样子');
});
