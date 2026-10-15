// v12.9 计划能改：改数、挪顺序、打勾 / 撤回、按成绩调、轻一点、新加、去掉，都能撤销
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
const TODAY = '2026-10-15';
global.getTodayDateString = () => TODAY;
global.shiftDateString = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
global.esc = (s) => String(s);
global.fmt = (n) => String(Math.round(n || 0));
global.round1 = (n) => Math.round((n || 0) * 10) / 10;
global.recordTs = (r) => r.ts || 0;
global.MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐/补剂'];
global.GOAL_DEFICIT = { fat_loss: 450, maintain: 0, muscle_gain: -250 };
global.FitnessApp = class FitnessApp {};
Object.assign(FitnessApp.prototype, {
  saveData() {}, render() {}, showToast() {},
  latestWeight() { return { kg: 74 }; },
  getDaySummary() { return { intake: 0, protein: 0, budget: 2000 }; },
  gaugeProteinTarget() { return 140; },
  // 和 app.js 的 exerciseProgress 一样
  exerciseProgress(name, opts) {
    opts = opts || {};
    const logs = this.workouts.filter(w => w.exerciseName === name && !w.durationMin).sort((a, b) => (b.date === a.date ? b.ts - a.ts : (b.date > a.date ? 1 : -1)));
    if (!logs.length) return null;
    const next = TF.Overload.next(logs, name, { today: opts.date || TODAY, cut: true, extra: opts.extra });
    if (!next) return null;
    const ss = TF.Overload.sessions(logs);
    const s = ss[ss.length - 1];
    return { last: Object.assign({}, s.top, { sets: s.sets, reps: s.reps }), next, count: logs.length };
  }
});
require('../web/js/data/food_db.js');
require('../web/js/log/parser.js');
require('../web/js/log/overload.js');
require('../web/js/app/plans.js');
require('../web/js/app/agent.js');

function make() {
  const app = new FitnessApp();
  app.profile = { goalType: 'fat_loss' };
  app.selectedDate = TODAY;
  app.diet = [];
  app.workouts = [];
  // 卧推练过四次：55 → 57.5 → 60 → 60，都是 4×8 做满
  [['2026-10-03', 55], ['2026-10-06', 57.5], ['2026-10-09', 60], ['2026-10-12', 60]].forEach(([date, kg], i) =>
    app.workouts.push({ id: 'w' + i, ts: i + 1, date, exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: kg, sets: 4, reps: 8, rpe: 8 }));
  app.plans = [
    { id: 'm', date: TODAY, kind: 'meal', ts: 1, mealType: '午餐', foodSummary: '米饭150g、鸡胸肉150g', calories: 374, proteinG: 41 },
    { id: 'a', date: TODAY, kind: 'workout', ts: 60, exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 55, sets: 4, reps: 8, burnedCalories: 40 },
    { id: 'b', date: TODAY, kind: 'workout', ts: 61, exerciseName: '杠铃深蹲', muscleGroup: '腿部', weightKg: 80, sets: 5, reps: 5, burnedCalories: 50 },
    { id: 'c', date: TODAY, kind: 'workout', ts: 62, exerciseName: '哑铃弯举', muscleGroup: '手臂', weightKg: 12, sets: 3, reps: 12, burnedCalories: 30 }
  ];
  return app;
}
const order = (app) => app.plansFor(TODAY).filter(p => p.kind !== 'meal' && !p.done).map(p => p.id).join('');
const run = (app, act) => app.runActs([Object.assign({ do: 'editPlan' }, act)], TODAY);

test('按成绩推荐：练过的、比计划上轻的才给；以前的日子不给', () => {
  const app = make();
  const sug = app.planSuggest(TODAY);
  assert.deepStrictEqual(Object.keys(sug), ['a'], '只有卧推练过');
  assert.strictEqual(sug.a.weightKg, 62.5);
  assert.strictEqual(sug.a.up, true);
  app.plans.forEach(p => { p.date = '2026-10-14'; });
  assert.deepStrictEqual(app.planSuggest('2026-10-14'), {});
});

test('改数：重量、组数、换动作；消耗跟着算，能撤销', () => {
  const app = make();
  let r = run(app, { id: 'a', set: { weightKg: 60, sets: 5 } });
  assert.strictEqual(r.ok, 1);
  const a = app.plans.find(p => p.id === 'a');
  assert.deepStrictEqual([a.weightKg, a.sets, a.reps], [60, 5, 8]);
  assert.ok(a.burnedCalories > 40, '组数多了消耗跟着多');
  assert.match(r.lines[0], /55kg 4×8 → 60kg 5×8/);
  r.undo();
  assert.deepStrictEqual([app.plans.find(p => p.id === 'a').weightKg, app.plans.find(p => p.id === 'a').sets], [55, 4]);
  r = run(app, { id: 'c', set: { exerciseName: '杠铃卧推' } });
  const c = app.plans.find(p => p.id === 'c');
  assert.strictEqual(c.exerciseName, '杠铃卧推');
  assert.strictEqual(c.muscleGroup, '胸部');
  assert.strictEqual(c.weightKg, 62.5, '换成练过的动作：按那个动作的成绩');
  run(app, { id: 'b', set: { exerciseName: '跑步' } });
  const b = app.plans.find(p => p.id === 'b');
  assert.strictEqual(b.durationMin, 20, '换成有氧：按时间');
});

test('挪顺序：第一个、最后、前面、后面、换、拖到第几个', () => {
  const app = make();
  run(app, { id: 'c', move: 'first' }); assert.strictEqual(order(app), 'cab');
  run(app, { id: 'c', move: 'last' }); assert.strictEqual(order(app), 'abc');
  run(app, { id: 'c', move: 'before', target: 'a' }); assert.strictEqual(order(app), 'cab');
  run(app, { id: 'c', move: 'after', target: 'b' }); assert.strictEqual(order(app), 'abc');
  run(app, { id: 'a', move: 'swap', target: 'c' }); assert.strictEqual(order(app), 'cba');
  app.applyPlanEdit({ id: 'a', move: 'to', index: 0 }); assert.strictEqual(order(app), 'acb');
  const r = run(app, { id: 'a', move: 'first' });
  assert.strictEqual(r.ok, 0, '本来就在那儿');
});

test('打勾 → 变成记录；撤回 → 记录删掉、计划回来；撤销都能还原', () => {
  const app = make();
  const n = app.workouts.length;
  const r = run(app, { id: 'b', done: true });
  assert.strictEqual(app.workouts.length, n + 1);
  const p = app.plans.find(x => x.id === 'b');
  assert.ok(p.done && p.recId);
  assert.deepStrictEqual(r.made, [p.recId]);
  assert.strictEqual(order(app), 'ac');
  const u = run(app, { id: 'b', undone: true });
  assert.strictEqual(app.workouts.length, n);
  assert.ok(!p.done && !p.recId);
  assert.strictEqual(order(app), 'abc');
  u.undo(); // 撤销「撤回」：记录和打勾都回来
  assert.strictEqual(app.workouts.length, n + 1);
  assert.ok(app.plans.find(x => x.id === 'b').done);
  assert.strictEqual(run(app, { id: 'b', drop: true }).ok, 0, '打过勾的不能直接去掉');
});

test('按成绩调全部、轻一点、加一档、新加一项、去掉', () => {
  const app = make();
  let r = run(app, { all: true, overload: true, dayOffset: 0 });
  assert.strictEqual(r.ok, 1);
  assert.strictEqual(app.plans.find(p => p.id === 'a').weightKg, 62.5);
  assert.strictEqual(app.plans.find(p => p.id === 'b').weightKg, 80, '没练过的不动');
  assert.strictEqual(run(app, { all: true, overload: true, dayOffset: 0 }).ok, 0, '已经按成绩了');
  run(app, { id: 'a', overload: 'up' });
  assert.strictEqual(app.plans.find(p => p.id === 'a').weightKg, 65, '按成绩不该再加：往上加一档');
  run(app, { id: 'c', lighter: true });
  assert.strictEqual(app.plans.find(p => p.id === 'c').weightKg, 10, '哑铃 12 → 10（一档 2kg）');
  r = run(app, { all: true, lighter: true, dayOffset: 0 });
  assert.ok(r.lines.length >= 3);
  r = run(app, { workouts: [{ exerciseName: '哑铃侧平举', muscleGroup: '肩部', weightKg: 6, sets: 3, reps: 15 }] });
  assert.match(r.lines[0], /加了「哑铃侧平举」/);
  assert.strictEqual(app.plansFor(TODAY).filter(p => p.kind !== 'meal' && !p.done).length, 4);
  assert.ok(app.plans.find(p => p.exerciseName === '哑铃侧平举').burnedCalories > 0);
  run(app, { id: 'c', drop: true });
  assert.ok(!app.plans.some(p => p.id === 'c'));
  r = run(app, { id: 'm', meals: [{ mealType: '午餐', foodSummary: '红薯200g、鸡胸肉150g', calories: 380, proteinG: 39, items: [] }] });
  assert.strictEqual(app.plans.find(p => p.id === 'm').foodSummary, '红薯200g、鸡胸肉150g');
  assert.strictEqual(run(app, { id: 'zz', drop: true }).ok, 0);
});

test('v12.9.1「今天练了序列A」：没排的照计划直接记上（按成绩算好的数），排着的打勾，不往计划里加', () => {
  const app = make();
  app.profile.planBook = [{ name: '序列A 上肢日', at: '2026-10-01', workouts: [
    { exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 55, sets: 4, reps: 8 },
    { exerciseName: '哑铃弯举', muscleGroup: '手臂', weightKg: 12, sets: 3, reps: 12 }], meals: [] }];
  // 今天没排这份（换一天）：直接记上，计划一条都不多
  app.plans = [];
  const n = app.workouts.length;
  let r = app.runActs([{ do: 'usePlan', name: '序列A 上肢日', dayOffset: 0, done: true }], TODAY);
  assert.strictEqual(r.ok, 1);
  assert.strictEqual(app.plans.length, 0, '不往计划里放');
  const recs = app.workouts.filter(w => w.date === TODAY); // planToRecord 往前插
  assert.deepStrictEqual(recs.map(w => [w.exerciseName, w.weightKg]).sort(), [['哑铃弯举', 12], ['杠铃卧推', 62.5]], '卧推按成绩');
  assert.ok(recs.every(w => w.date === TODAY && w.burnedCalories > 0));
  r.undo();
  assert.strictEqual(app.workouts.length, n, '能撤销');
  // 再说一遍：已经记过的不重复记
  app.runActs([{ do: 'usePlan', name: '序列A 上肢日', dayOffset: 0, done: true }], TODAY);
  r = app.runActs([{ do: 'usePlan', name: '序列A 上肢日', dayOffset: 0, done: true }], TODAY);
  assert.strictEqual(r.ok, 0);
  // 今天排着这份：打勾那几行（用你改过的数）
  const app2 = make();
  app2.profile.planBook = app.profile.planBook;
  app2.plans.find(p => p.id === 'a').weightKg = 57.5;
  r = app2.runActs([{ do: 'usePlan', name: '序列A', dayOffset: 0, done: true }], TODAY);
  assert.strictEqual(r.ok, 1);
  assert.ok(app2.plans.find(p => p.id === 'a').done && app2.plans.find(p => p.id === 'c').done);
  assert.ok(!app2.plans.find(p => p.id === 'b').done, '深蹲不在这份计划里，不动');
  assert.strictEqual(app2.workouts.find(w => w.id === app2.plans.find(p => p.id === 'a').recId).weightKg, 57.5);
});

test('v12.9.2「加到这 3 天」：几天的计划编号不撞，× 和 ✓ 动的是这天这行；以前撞了的打开时修好', () => {
  const app = make();
  app.plans = [];
  const w = [{ exerciseName: '杠铃深蹲', weightKg: 80, sets: 5, reps: 5 }, { exerciseName: '杠铃卧推', weightKg: 60, sets: 4, reps: 8 }];
  ['2026-10-14', TODAY, '2026-10-17'].forEach(d => app.addPlans(d, { workouts: w, from: 1 }, true)); // 同一毫秒放三天
  assert.strictEqual(new Set(app.plans.map(p => p.id)).size, 6, '编号都不一样');
  const row = app.plansFor(TODAY)[0];
  app.dropPlan(row.id);
  assert.strictEqual(app.plansFor(TODAY).length, 1, '删掉的是今天这行');
  assert.strictEqual(app.plansFor('2026-10-14').length, 2, '前一天的不动');
  // 以前存下来的：三天编号一样
  const old = make();
  old.plans = ['2026-10-14', TODAY, '2026-10-17'].map(d => ({ id: 'pl_1_w0', date: d, kind: 'workout', ts: 1, exerciseName: '杠铃深蹲', weightKg: 80, sets: 5, reps: 5 }));
  assert.strictEqual(old.fixPlanIds(), true);
  assert.strictEqual(new Set(old.plans.map(p => p.id)).size, 3);
  assert.strictEqual(old.plans[0].id, 'pl_1_w0', '第一个不改');
  assert.strictEqual(old.fixPlanIds(), false, '修过一次就不再改');
});
