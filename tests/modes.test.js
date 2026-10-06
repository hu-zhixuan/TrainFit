// v9.1 极简模式 / 剧情模式（用户：「能不能只用小人，不参与 galgame」）：
// 极简模式只有小人——记完回一句、打招呼、回答问题、陪你聊；剧情、亲密度升级、小纸条、小别扭、悄悄话、想你、恋爱、剧情给的样子都没有。
// 剧情模式（没存过模式的老用户也是）照旧什么都有。
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
global.FitnessApp = class FitnessApp {};
FitnessApp.prototype.saveData = function () {};
FitnessApp.prototype.isSimple = function () { return false; };
FitnessApp.prototype.userName = function () { return ''; };

require('../web/js/app/cast.js');
require('../web/js/app/script_jx.js');
require('../web/js/app/script_xy.js');
require('../web/js/app/buddy.js');
require('../web/js/app/bond.js');
require('../web/js/app/heart.js');
require('../web/js/app/story.js');
require('../web/js/app/theater.js');

/** 一个看过前四章、选了恋人、闹着小别扭、今天的小纸条还没拆的老搭子 */
function makeApp(buddy) {
  const app = Object.create(FitnessApp.prototype);
  const seen = ['jx1a', 'jx1b', 'jx1c', 'jx2a', 'jx2b', 'jx2c', 'jx3a', 'jx3b', 'jx3c', 'jx4a', 'jx4b', 'jx4c'];
  app.profile = {
    gender: 'male',
    buddy: Object.assign({ char: 'boy', show: true, picked: 6, charLocked: true, xp: 900, outfit: 'shirt',
      sulk: { kind: 'late', date: TODAY }, note: { day: '2026-10-05', n: 3 },
      story: { ver: 2, seen, picks: {}, romance: true, seenOn: {} } }, buddy)
  };
  app.diet = [];
  app.workouts = [];
  app.weights = [];
  app.needsOnboarding = false;
  return app;
}

test('没存过模式的老用户是剧情模式；存了 lite 是极简模式；不要小人两样都不开', () => {
  assert.strictEqual(makeApp({}).buddyMode(), 'story');
  assert.strictEqual(makeApp({}).storyOn(), true);
  assert.strictEqual(makeApp({ mode: 'lite' }).buddyMode(), 'lite');
  assert.strictEqual(makeApp({ mode: 'lite' }).storyOn(), false);
  assert.strictEqual(makeApp({ show: false }).storyOn(), false);
});

test('剧情模式：小纸条、小别扭、恋人、剧情里的事、剧情给的衣服和小变化都在', () => {
  const app = makeApp({ mode: 'story' });
  assert.strictEqual(app.noteReady(), true);
  assert.ok(app.sulkNow());
  assert.match(app.relationPrompt(), /在一起/);
  assert.strictEqual(app.castLine(['肩膀的事', 'jx4a']), '肩膀的事');
  assert.strictEqual(app.outfitOpen('shirt'), true);
  assert.strictEqual(app.buddyLook().outfit, 'shirt');
  assert.ok(app.buddyMarks().includes('leaf'));
  const p = app.buddyPersona();
  assert.ok(p.facts.some(f => /里的角色/.test(f)));
  assert.ok(p.facts.includes(app.cast().secret), '第四章看过了，聊天里知道肩伤');
});

test('极简模式：剧情、小纸条、小别扭、恋爱、想你、剧情给的样子都没有；存的东西不丢，切回剧情模式还在', () => {
  const app = makeApp({ mode: 'lite' });
  assert.strictEqual(app.noteReady(), false, '没有小纸条');
  assert.strictEqual(app.sulkNow(), null, '没有小别扭');
  assert.strictEqual(app.relationPrompt(), '', '不往暧昧、恋爱走');
  assert.deepStrictEqual(app.storyFacts(), []);
  assert.strictEqual(app.storyEcho(), '');
  assert.strictEqual(app.castLine(['肩膀的事', 'jx4a']), '', '剧情里的事不提');
  assert.strictEqual(app.castLine('平常的话'), '平常的话');
  assert.strictEqual(app.outfitOpen('shirt'), false);
  assert.strictEqual(app.buddyLook().outfit, TF.Buddy.CAST_LOOK.boy.outfit, '就是本来的样子');
  assert.deepStrictEqual(app.buddyMarks(), []);
  assert.strictEqual(app.lowToday(), null);
  app._lastAway = 30 * 3600 * 1000;
  assert.strictEqual(app.missLine(), '', '不说想你');
  assert.notStrictEqual(app.heartState().key, 'sulk');
  const p = app.buddyPersona();
  assert.ok(!p.facts.some(f => /里的角色/.test(f)), '「知道自己是 App 里的角色」是剧情里的设定');
  assert.ok(!p.facts.includes(app.cast().secret));
  assert.strictEqual(p.relation, '');
  assert.deepStrictEqual(p.shared, []);
  // 存的都还在：切回剧情模式，衣服、关系、小别扭照旧
  assert.strictEqual(app.profile.buddy.outfit, 'shirt');
  app.profile.buddy.mode = 'story';
  assert.strictEqual(app.buddyLook().outfit, 'shirt');
  assert.match(app.relationPrompt(), /在一起/);
});

test('极简模式不升级、不庆祝；切到剧情模式后补说一次', () => {
  const app = makeApp({ mode: 'lite', lv: 1 });
  app.checkBond();
  assert.strictEqual(app._bondUp, undefined);
  app.profile.buddy.mode = 'story';
  app.checkBond();
  assert.ok(app._bondUp, '亲密度早就够了：切过来说一次');
  clearTimeout(app._bondT); // 这里不真的弹（没有页面）
});
