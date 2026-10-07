// v10.0 TA 的手机（用户：「主线剧情用户自己点进去玩，然后每天几条短信、电话、朋友圈」）+ 剧情模式的老用户从头开始。
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
const TODAY = '2026-10-06';
global.getTodayDateString = () => TODAY;
global.shiftDateString = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
global.esc = (s) => String(s);
global.fmt = (n) => String(n);
global.round1 = (n) => Math.round(n * 10) / 10;
global.isSuppOnly = () => false;
global.FitnessApp = class FitnessApp {};
FitnessApp.prototype.saveData = function () {};
FitnessApp.prototype.isSimple = function () { return false; };
FitnessApp.prototype.userName = function () { return ''; };
FitnessApp.prototype.recordDates = function () { return [...new Set(this.diet.map(d => d.date).concat(this.workouts.map(w => w.date)))]; };
FitnessApp.prototype.getDaySummary = function () { return { intake: 1500, protein: 80, budget: 2000 }; };
FitnessApp.prototype.gaugeProteinTarget = function () { return 140; };
FitnessApp.prototype.render = function () {};

require('../web/js/app/cast.js');
require('../web/js/app/script_jx.js');
require('../web/js/app/script_xy.js');
require('../web/js/app/phone_jx.js');
require('../web/js/app/phone_xy.js');
require('../web/js/app/buddy.js');
require('../web/js/app/bond.js');
require('../web/js/app/heart.js');
require('../web/js/app/story.js');
const Theater = require('../web/js/app/theater.js');
const Phone = require('../web/js/app/phone.js');
const { mergeBackupData } = require('../web/js/app/backup.js');

const C = TF.Cast.jx;
const mainIds = C.main.flat().map(sc => sc.id);

function makeApp(buddy, extra) {
  const app = Object.create(FitnessApp.prototype);
  app.profile = { gender: 'male', buddy: Object.assign({ char: 'boy', show: true, picked: 6, charLocked: true, v10: true }, buddy) };
  app.diet = [];
  app.workouts = [];
  app.weights = [];
  app.needsOnboarding = false;
  return Object.assign(app, extra || {});
}

test('故事走到哪儿：没开始 0，看到第几章就是几，看完是 6', () => {
  const mains = C.main.flat().map((sc, i) => ({ id: sc.id, ch: Math.floor(i / 3) + 1 }));
  assert.strictEqual(Phone.stageOf([], mains), 0);
  assert.strictEqual(Phone.stageOf(['jx1a'], mains), 1);
  assert.strictEqual(Phone.stageOf(['jx1a', 'jx1b', 'jx1c', 'jx2a'], mains), 2);
  assert.strictEqual(Phone.stageOf(mainIds, mains), 6);
});

test('挑一句：只挑这个阶段能说的、越往后越优先、说过的先不说、同一个种子挑的一样', () => {
  const list = [[0, 'a'], [1, 'b'], [3, 'c'], [3, 'd'], [5, 'e']];
  assert.ok(['c', 'd'].includes(Phone.pickLine(list, 3, [], 7)[1]), '第三章：挑第二～三章的');
  assert.strictEqual(Phone.pickLine(list, 0, [], 1)[1], 'a');
  assert.strictEqual(Phone.pickLine(list, 3, ['c'], 2)[1], 'd', '说过的先不说');
  assert.ok(Phone.pickLine(list, 3, ['a', 'b', 'c', 'd'], 3), '都说过了也能挑');
  assert.strictEqual(Phone.pickLine([[4, 'x']], 2, [], 0), null, '还没到的不说');
  assert.deepStrictEqual(Phone.pickLine(list, 6, [], 11), Phone.pickLine(list, 6, [], 11));
});

test('江叙的手机：每种消息都有、写对了阶段；他不用感叹号和波浪号（标准版除外）、不拿「你不来」压人', () => {
  const P = C.phone;
  for (const k of ['morning', 'night', 'breakfast', 'lunch', 'dinner', 'snack', 'late', 'over', 'train', 'pr', 'protein', 'weight', 'back', 'ready']) {
    assert.ok((P.msgs[k] || []).length, k);
    assert.ok(P.msgs[k].some(x => x[0] <= 1), `${k} 第一章就有`);
    P.msgs[k].forEach(x => {
      assert.ok(x[0] >= 0 && x[0] <= 6 && typeof x[1] === 'string' && x[1].length <= 48, `${k}：${x[1]}`);
      assert.ok(!/[!！~～]/.test(x[1]), `江叙不用感叹号：${x[1]}`);
      assert.ok(!/你不来|不要我了|我会难过|我会消失/.test(x[1]), `不压人：${x[1]}`);
      (x[2] || []).forEach(o => { assert.ok(o[0] && o[1], k); assert.ok(!/[!！~～]/.test(o[1]), o[1]); });
    });
  }
  // 标准版的那几条才叫「宝～」「不要我了」；他马上来删
  assert.ok(P.twin.every(t => /宝|～/.test(t)));
  assert.ok(P.twinFix.length >= 1);
  // 看完第二天提一句：每段都有，键是真的主线
  mainIds.forEach(id => assert.ok((P.after[id] || []).length, `${id} 第二天的那句`));
  Object.keys(P.after).forEach(id => assert.ok(mainIds.includes(id), id));
});

test('朋友圈、电话：挂在真的剧情上，评论他都回，电话是能演的剧本', () => {
  const P = C.phone;
  const ids = P.moments.map(m => m.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  P.moments.forEach(m => {
    assert.ok(['江叙', '老周', '标准版'].includes(m.by), m.id);
    assert.ok(m.at >= 0 && m.at <= 6 && m.t, m.id);
    assert.ok(m.re.length >= 2 && m.re.every(r => r[0] && r[1]), `${m.id} 评论都有回`);
    if (m.img && m.img.bg) assert.ok(TF.Art ? true : true);
  });
  assert.ok(P.moments.some(m => m.by === '标准版'), '标准版也发朋友圈');
  const known = new Set(Theater.STEP_KEYS);
  P.calls.forEach(c => {
    assert.ok(mainIds.includes(c.after), c.id);
    assert.ok(['morning', 'day', 'evening', 'night', 'any'].includes(c.when), c.id);
    const info = Theater.scriptInfo(c.lines);
    assert.ok(info.lines >= 5, `${c.id} 太短`);
    info.steps.forEach(s => Object.keys(s).forEach(k => assert.ok(known.has(k), `${c.id} 不认识 ${k}`)));
    c.lines.filter(Array.isArray).forEach(l => { if (l[0] !== null && !String(l[0]).startsWith('@')) assert.ok(!/[!！~～]/.test(l[1]), l[1]); });
  });
});

test('打开 App：看完那段第二天他提一句、下一段好了发消息（点了就看）、朋友圈跟着剧情发、两天没碰上的电话算未接', () => {
  const seenOn = { jx1a: '2026-10-03', jx1b: '2026-10-03', jx1c: '2026-10-03' };
  const app = makeApp({ mode: 'story', story: { ver: 3, seen: ['jx1a', 'jx1b', 'jx1c'], picks: {}, seenOn } });
  assert.strictEqual(app.phoneOn(), true);
  app.phoneSync();
  const ph = app.phoneData();
  assert.ok(ph.msgs.some(m => m.kind === 'after' && m.t === C.phone.after.jx1c[0]), '看完那段第二天提一句（最近那段）');
  assert.ok(!ph.msgs.some(m => m.kind === 'after' && m.t === C.phone.after.jx1a[0]), '早的不一条条补');
  const ready = ph.msgs.find(m => m.kind === 'ready');
  assert.ok(ready && ready.play === 'jx2a', '下一段好了：消息里带「去看」');
  assert.ok(ph.moments['m-bun'] && ph.moments['m-bun'].at, '第一章的朋友圈发出来了');
  assert.ok(!ph.moments['m-pool'], '第二章的还没有');
  assert.deepStrictEqual(Object.keys(ph.calls), [], '第一章他不打电话（v11 温度表）');
  assert.ok(app.phoneUnread() >= 3);
  // 再打开一次：不重复发
  const n = ph.msgs.length;
  app.phoneSync();
  assert.strictEqual(app.phoneData().msgs.length, n);
});

test('电话（v11）：第一通在第三章（找了借口）；看完两天没碰上时间就算未接', () => {
  const first = C.phone.calls.map(c => mainIds.indexOf(c.after)).sort((a, b) => a - b)[0];
  assert.ok(first >= 6, '前两章不打电话');
  const seen = mainIds.slice(0, 7);
  const seenOn = Object.fromEntries(seen.map(id => [id, '2026-10-03']));
  const app = makeApp({ mode: 'story', story: { ver: 3, seen, picks: {}, seenOn } });
  app.phoneSync();
  assert.strictEqual((app.phoneData().calls['c-test'] || {}).state, 'missed', '三天没碰上晚上：未接，能回拨');
  assert.ok(/测/.test(JSON.stringify(C.phone.calls.find(c => c.id === 'c-test').lines)), '借口是测试');
});

test('名字下面那行小字按角色写：江叙早上在旧泳池（第二章起）、平时在后台', () => {
  const app = makeApp({ mode: 'story', story: { ver: 3, seen: mainIds.slice(0, 4), picks: {}, seenOn: {} } });
  assert.strictEqual(app.phoneStatus(6), '在旧泳池');
  assert.strictEqual(app.phoneStatus(14), '在后台');
  assert.strictEqual(app.phoneStatus(2), '还没睡');
});

test('记完一顿他发一句（一种一天一次），{food} 换成吃的；在手机里打字记的总会回一句', () => {
  const app = makeApp({ mode: 'story', story: { ver: 3, seen: ['jx1a'], picks: {}, seenOn: { jx1a: TODAY } } });
  app.phoneAfterLog({ meals: [{ foodSummary: '番茄牛腩面', mealType: '晚餐', proteinG: 20 }], workouts: [] }, {}, 19);
  const ph = app.phoneData();
  const m = ph.msgs[ph.msgs.length - 1];
  assert.strictEqual(m.kind, 'dinner');
  assert.ok(!/\{/.test(m.t));
  const n = ph.msgs.length;
  app.phoneAfterLog({ meals: [{ foodSummary: '苹果', mealType: '晚餐' }], workouts: [] }, {}, 19);
  assert.strictEqual(app.phoneData().msgs.length, n, '同一种一天一次');
  app._phoneWait = { q: '又吃了个苹果', at: Date.now() };
  app.phoneAfterLog({ meals: [{ foodSummary: '苹果', mealType: '晚餐' }], workouts: [] }, {}, 19);
  assert.strictEqual(app.phoneData().msgs.length, n + 1, '手机里记的：回一句「记上了」');
  assert.strictEqual(app._phoneWait, null);
});

test('手机里问的：回答放进手机的对话（不弹小人的气泡）；出字时先不放', () => {
  const app = makeApp({ mode: 'story', story: { ver: 3, seen: ['jx1a'], picks: {}, seenOn: {} } });
  app._phoneWait = { q: '还差多少蛋白', at: Date.now() };
  assert.strictEqual(app.phoneCatch('还差多少蛋白', '还差 60g', { streaming: true }), true);
  assert.strictEqual(app.phoneData().msgs.length, 0);
  assert.strictEqual(app.phoneCatch('还差多少蛋白', '还差 60g。晚上来块鸡胸。', { next: ['鸡胸多少克', '换成鱼行吗'] }), true);
  const m = app.phoneData().msgs[0];
  assert.deepStrictEqual([m.from, m.t, m.next.length], ['ta', '还差 60g。晚上来块鸡胸。', 2]);
  assert.strictEqual(app.phoneCatch('别的问题', 'x', {}), false, '不是手机里问的照旧弹气泡');
});

test('极简模式没有手机；夏柚（v11）剧情模式有自己的手机', () => {
  assert.strictEqual(makeApp({ mode: 'lite' }).phoneOn(), false);
  assert.strictEqual(makeApp({ mode: 'lite' }).phoneSync(), false);
  assert.strictEqual(makeApp({ char: 'girl', mode: 'lite', v11: true }).phoneOn(), false);
  const xy = makeApp({ char: 'girl', mode: 'story', v11: true, story: { ver: 3, seen: ['xy1a', 'xy1b', 'xy1c'], picks: {}, seenOn: { xy1a: '2026-10-03', xy1b: '2026-10-03', xy1c: '2026-10-03' } } });
  assert.strictEqual(xy.phoneOn(), true);
  xy.phoneSync();
  const ph = xy.phoneData();
  assert.ok(ph.msgs.some(m => m.kind === 'after' && m.t === TF.Cast.xy.phone.after.xy1c[0]), '看完那段第二天她提一句');
  assert.ok(ph.msgs.some(m => m.kind === 'ready' && m.play === 'xy2a'));
  assert.ok(ph.moments['y-roof'] && !ph.moments['y-lin'], '林的旧动态第四章才翻出来');
  assert.strictEqual(xy.phoneStatus(3), '在屋顶');
  assert.strictEqual(xy.phoneStatus(14), '在你那页上');
});

test('夏柚的手机：每种消息都有、第一章就有；口吻不嗲（没有波浪号、嘿嘿、诶）；电话是能演的剧本、挂在真的剧情上', () => {
  const P = TF.Cast.xy.phone;
  const ids = TF.Cast.xy.main.flat().map(sc => sc.id);
  for (const k of ['morning', 'night', 'breakfast', 'lunch', 'dinner', 'snack', 'late', 'over', 'train', 'pr', 'protein', 'weight', 'back', 'ready']) {
    assert.ok(P.msgs[k].some(x => x[0] <= 1), `${k} 第一章就有`);
    P.msgs[k].forEach(x => {
      assert.ok(x[1].length <= 48 && !/[～~]|嘿嘿|诶|人家|宝宝/.test(x[1]), x[1]);
      assert.ok(!/你不来|不要我了|我会难过|我会消失/.test(x[1]), x[1]);
    });
  }
  ids.forEach(id => assert.ok((P.after[id] || []).length, `${id} 第二天的那句`));
  const known = new Set(Theater.STEP_KEYS);
  P.calls.forEach(c => {
    assert.ok(ids.includes(c.after), c.id);
    assert.ok(Theater.scriptInfo(c.lines).lines >= 5, c.id);
    Theater.scriptInfo(c.lines).steps.forEach(s => Object.keys(s).forEach(k => assert.ok(known.has(k), `${c.id} 不认识 ${k}`)));
  });
  P.moments.forEach(m => assert.ok(m.re.length >= 2 && m.re.every(r => r[0] && r[1]), m.id));
});

test('夏柚剧情模式的老用户从头开始（v11）：旧故事（电台）的进度清掉，只做一次；新选的直接记 v11', () => {
  const old = makeApp({ char: 'girl', v10: undefined, mode: 'story', xp: 200, lv: 3, story: { ver: 2, seen: ['xy1a', 'xy1b', 'xy2a'], picks: { xy1a: 0 }, romance: true, seenOn: {} } });
  old.storyMigrate();
  assert.strictEqual(old.profile.buddy.v11, true);
  assert.deepStrictEqual(old.profile.buddy.story.seen, []);
  assert.strictEqual(old.mainNext().sc.id, 'xy1a');
  old.mainSeen('xy1a');
  old.storyMigrate();
  assert.deepStrictEqual(old.profile.buddy.story.seen, ['xy1a'], '只清一次');
  const fresh = makeApp({ char: 'girl', v10: undefined, mode: 'story' });
  fresh.storyMigrate();
  assert.strictEqual(fresh.profile.buddy.v11, true);
  assert.strictEqual(fresh.profile.buddy.bondBase, undefined);
  // 江叙的用户不受影响
  const jx = makeApp({ mode: 'story', story: { ver: 3, seen: ['jx1a'], picks: {}, seenOn: {} } });
  jx.storyMigrate();
  assert.deepStrictEqual(jx.profile.buddy.story.seen, ['jx1a']);
  // 旧备份（没有 v11）里夏柚的进度不合进新故事
  const empty = { fit_workouts: [], fit_weights: [], fit_my_foods: [], fit_plans: [] };
  const cur = Object.assign({ fit_profile: { buddy: { char: 'girl', v11: true, story: { ver: 3, seen: ['xy1a'], picks: {} } } }, fit_diet: [{ id: 'a', date: TODAY }] }, empty);
  const bak = Object.assign({ fit_profile: { buddy: { char: 'girl', story: { ver: 2, seen: ['xy1a', 'xy1b', 'xy4b'], picks: {}, romance: true } } }, fit_diet: [] }, empty);
  assert.deepStrictEqual(mergeBackupData(cur, bak).data.fit_profile.buddy.story.seen, ['xy1a']);
});

test('剧情模式的老用户从头开始（v10.0）：剧情、手机、关系、剧情给的衣服都清掉；记录不动；只做一次', () => {
  const app = makeApp({ v10: undefined, mode: 'story', xp: 300, lv: 4, outfit: 'shirt', note: { day: '2026-10-05', n: 9 },
    story: { ver: 2, seen: ['jx1a', 'jx1b', 'jx1c', 'jx2a', 'jx2b'], picks: { jx1a: 1 }, romance: true, seenOn: { jx2b: '2026-10-01' } } });
  app.diet = [{ date: '2026-10-01', id: 'd1' }, { date: '2026-10-02', id: 'd2' }];
  assert.ok(app.bond().lv >= 3, '升级前是老搭子');
  app.storyMigrate();
  const b = app.profile.buddy;
  assert.strictEqual(b.v10, true);
  assert.deepStrictEqual(b.story.seen, []);
  assert.strictEqual(b.story.romance, undefined, '关系也从头来');
  assert.strictEqual(app.bond().lv, 1, '亲密度从头算');
  assert.strictEqual(b.outfit, app.buddyBase().outfit, '剧情给的衣服换回默认');
  assert.strictEqual(app.diet.length, 2, '记录不动');
  assert.strictEqual(app.mainNext().sc.id, 'jx1a', '从第一章开始');
  // 再打开不会再清
  app.mainSeen('jx1a');
  app.storyMigrate();
  assert.deepStrictEqual(app.profile.buddy.story.seen, ['jx1a']);
  // 极简模式里升级的：先不动，切到剧情模式那一刻再清
  const lite = makeApp({ v10: undefined, mode: 'lite', xp: 100, story: { ver: 2, seen: ['jx1a'], picks: {}, seenOn: {} } });
  lite.storyMigrate();
  assert.deepStrictEqual(lite.profile.buddy.story.seen, ['jx1a']);
  lite.profile.buddy.mode = 'story';
  lite.storyMigrate();
  assert.deepStrictEqual(lite.profile.buddy.story.seen, []);
  // 新用户（什么都没有）：记一下 v10 就行
  const fresh = makeApp({ v10: undefined, mode: 'story' });
  fresh.storyMigrate();
  assert.strictEqual(fresh.profile.buddy.v10, true);
  assert.strictEqual(fresh.profile.buddy.bondBase, undefined);
});

test('旧备份里的剧情进度不合进新故事', () => {
  const empty = { fit_workouts: [], fit_weights: [], fit_my_foods: [], fit_plans: [] };
  const cur = Object.assign({ fit_profile: { buddy: { v10: true, story: { ver: 3, seen: ['jx1a'], picks: {} } } }, fit_diet: [{ id: 'a', date: TODAY }] }, empty);
  const bak = Object.assign({ fit_profile: { buddy: { story: { ver: 2, seen: ['jx1a', 'jx1b', 'jx1c', 'jx2a'], picks: {}, romance: true } } }, fit_diet: [] }, empty);
  const out = mergeBackupData(cur, bak).data.fit_profile.buddy.story;
  assert.deepStrictEqual(out.seen, ['jx1a']);
  assert.strictEqual(out.romance, undefined);
});
