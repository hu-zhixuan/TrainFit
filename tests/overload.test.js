// 渐进超负荷（v12.2）：下次练多少按整段历史算——习惯的次数区间、器械的档位、卡住 / 退步 / 隔久了 / 自重 / 一档跨太大
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

global.window = global;
const O = require('../web/js/log/overload.js');

let n = 0;
const R = (date, w, sets, reps, x) => Object.assign({ id: 'w' + (++n), date, weightKg: w, sets, reps, ts: n }, x || {});
const next = (name, recs, opts) => O.next(recs, name, Object.assign({ today: '2026-10-12' }, opts));

test('一天合成一次：最重的是正式组，热身和递减组不当成绩', () => {
  const ss = O.sessions([R('2026-10-10', 60, 1, 10), R('2026-10-10', 80, 2, 10), R('2026-10-10', 80, 1, 8), R('2026-10-10', 70, 2, 12), R('2026-10-08', 75, 4, 8)]);
  assert.deepStrictEqual(ss.map(s => s.date), ['2026-10-08', '2026-10-10']);
  const s = ss[1];
  assert.deepStrictEqual([s.w, s.sets, s.reps, s.backW, s.backSets], [80, 3, 8, 70, 2], '80kg 三组、最少 8 个；70kg 两组是递减组');
});

test('双重累进：没到区间顶多做一个，到顶了按估算一次最大加重量、次数往回落', () => {
  let r = next('杠铃卧推', [R('2026-10-10', 60, 4, 8)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps, r.lo, r.hi], ['reps', 60, 9, 6, 10]);
  assert.strictEqual(r.text, '下次冲 9 次');
  r = next('杠铃卧推', [R('2026-10-03', 80, 4, 8), R('2026-10-06', 80, 4, 9), R('2026-10-10', 80, 4, 10)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['weight', 82.5, 9], '80×10 → 82.5×9，不是一律少两次');
  assert.match(r.why, /4 组都做到 10 个/);
  r = next('杠铃深蹲', [R('2026-10-06', 100, 4, 7), R('2026-10-10', 100, 4, 8)]);
  assert.deepStrictEqual([r.weightKg, r.lo, r.hi], [105, 5, 8], '深蹲 5～8 个、重了一次加 5kg');
  r = next('杠铃卧推', [R('2026-10-06', 80, 4, 7), R('2026-10-10', 80, 4, 8, { rpe: 7 })]);
  assert.deepStrictEqual([r.kind, r.weightKg], ['weight', 85], '说了还能加：差两个到顶也加，多加一档');
  assert.match(r.text, /直接/);
});

test('按习惯：老是 4×8 的是固定次数（做满加重量、次数不变）；5×5；老做 12～15 个的不逼到 10 个', () => {
  let r = next('杠铃卧推', [R('2026-10-03', 75, 4, 8), R('2026-10-06', 77.5, 4, 8), R('2026-10-10', 80, 4, 8)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps, r.fixed], ['weight', 82.5, 8, true]);
  r = next('杠铃深蹲', [R('2026-10-03', 90, 5, 5), R('2026-10-06', 92.5, 5, 5), R('2026-10-10', 95, 5, 5)]);
  assert.deepStrictEqual([r.weightKg, r.reps, r.fixed], [100, 5, true]);
  r = next('杠铃卧推', [R('2026-10-01', 60, 3, 12), R('2026-10-03', 60, 3, 13), R('2026-10-06', 60, 3, 14), R('2026-10-10', 60, 3, 15)]);
  assert.deepStrictEqual([r.lo, r.hi, r.kind, r.weightKg], [10, 15, 'weight', 62.5]);
  r = next('杠铃卧推', [R('2026-10-01', 80, 4, 7), R('2026-10-03', 80, 4, 7), R('2026-10-06', 80, 4, 7)], { today: '2026-10-08' });
  assert.notStrictEqual(r.fixed, true, '老是 7 个不是目标，是没做到 8 个');
});

test('每次加多少按器械：哑铃 2kg / 2.5kg、器械片 5kg、杠铃 2.5kg；一次不超过 3.5%', () => {
  assert.strictEqual(O.incOf('db', [10, 12, 14]), 2);
  assert.strictEqual(O.incOf('db', [7.5, 10]), 2.5);
  assert.strictEqual(O.incOf('db', [12.5]), 2.5);
  assert.strictEqual(O.incOf('machine', [45, 50, 55]), 5);
  assert.strictEqual(O.incOf('machine', [32, 36, 40]), 4, '4kg 一片的器械');
  assert.strictEqual(O.incOf('bar', [60, 65, 70]), 2.5, '杠铃都有小片');
  assert.strictEqual(O.incOf('bar', [61, 62]), 1);
  let r = next('哑铃推举', [R('2026-10-03', 12, 3, 10), R('2026-10-06', 14, 3, 9), R('2026-10-10', 14, 3, 10)]);
  assert.deepStrictEqual([r.weightKg, r.reps], [16, 6], '哑铃加 2kg，次数落到区间底');
  r = next('高位下拉', [R('2026-10-03', 45, 4, 12), R('2026-10-06', 50, 4, 10), R('2026-10-10', 50, 4, 10)]);
  assert.strictEqual(r.weightKg, 55);
  r = next('杠铃卧推', [R('2026-10-06', 140, 4, 9), R('2026-10-10', 140, 4, 10)]);
  assert.strictEqual(r.weightKg, 142.5, '140kg 的卧推也是一档一档加');
});

test('卡住了：同一个重量三次没多做一个就退 10% 再冲；减脂期先保住，四次再退', () => {
  const stuck = [R('2026-10-01', 80, 4, 6), R('2026-10-03', 80, 4, 7), R('2026-10-06', 80, 4, 7), R('2026-10-10', 80, 4, 7)];
  let r = next('杠铃卧推', stuck);
  assert.deepStrictEqual([r.kind, r.weightKg, r.stuck], ['deload', 72.5, 3]);
  assert.match(r.text, /先退到 72\.5kg/);
  r = next('杠铃卧推', stuck, { cut: true });
  assert.deepStrictEqual([r.kind, r.weightKg], ['keep', 80]);
  assert.match(r.why, /减脂期/);
  r = next('杠铃卧推', stuck.concat(R('2026-10-12', 80, 4, 7)), { cut: true });
  assert.strictEqual(r.kind, 'deload', '减脂期卡四次也退');
  // 退过以后：按上次的成绩直接往回加（一次最多 8%），不用一档一档爬
  r = next('杠铃卧推', stuck.concat(R('2026-10-12', 72.5, 4, 10)), { today: '2026-10-14' });
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['weight', 77.5, 7]);
  assert.match(r.why, /之前的 80kg/);
});

test('很吃力 / 少做了：先保持；连着两次退一点', () => {
  let r = next('杠铃卧推', [R('2026-10-06', 80, 4, 7), R('2026-10-10', 80, 4, 8, { rpe: 9.5 })]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['keep', 80, 8]);
  r = next('杠铃卧推', [R('2026-10-06', 80, 4, 8), R('2026-10-10', 80, 4, 6)]);
  assert.deepStrictEqual([r.kind, r.reps], ['keep', 8]);
  assert.match(r.text, /冲回 8 次/);
  r = next('杠铃卧推', [R('2026-10-03', 80, 4, 8), R('2026-10-06', 80, 4, 7), R('2026-10-10', 80, 4, 6)]);
  assert.deepStrictEqual([r.kind, r.weightKg], ['deload', 72.5]);
});

test('隔了两周以上先轻一点：两周 10%、四周 15%', () => {
  let r = next('杠铃卧推', [R('2026-09-20', 80, 4, 8)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['back', 72.5, 8]);
  assert.match(r.why, /隔了 22 天/);
  r = next('杠铃卧推', [R('2026-09-02', 80, 4, 8)]);
  assert.strictEqual(r.weightKg, 67.5);
  assert.strictEqual(next('杠铃卧推', [R('2026-09-20', 80, 4, 8)], { today: '2026-09-25' }).kind, 'reps', '按练的那天算');
});

test('组数不够先加组；一档跨太大（6kg 侧平举）先加组，够了直接试；你自己加了重量就照新重量算（v12.3 不让你挑）', () => {
  let r = next('杠铃卧推', [R('2026-10-10', 80, 2, 10)]);
  assert.deepStrictEqual([r.kind, r.sets], ['sets', 3]);
  r = next('哑铃侧平举', [R('2026-10-06', 6, 3, 18), R('2026-10-10', 6, 3, 20)]);
  assert.deepStrictEqual([r.kind, r.sets, r.weightKg], ['sets', 4, 6]);
  r = next('哑铃侧平举', [R('2026-10-06', 6, 4, 18), R('2026-10-10', 6, 4, 20)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.sets], ['weight', 8, 4]);
  assert.strictEqual(r.text, '下次试 8kg，能做几个做几个');
  // 自己从 7.5 加到 10kg，只有第一组用了 10kg：下次四组都按 10kg 算
  const self = [R('2026-10-06', 7.5, 4, 12), R('2026-10-10', 10, 1, 8), R('2026-10-10', 7.5, 3, 12)];
  r = next('哑铃弯举', self);
  assert.deepStrictEqual([r.kind, r.weightKg, r.sets, r.reps], ['reps', 10, 4, 9]);
  assert.match(r.text, /4 组都用 10kg/);
  const st = O.status(self);
  assert.deepStrictEqual([st.now.w, st.now.sets, st.now.reps, st.up, st.best.w], [10, 4, 8, 7.5, 10], '现在 10kg 4 组，上次 7.5kg');
});

test('自重：次数到顶，引体挂负重、俯卧撑加组再换难的；助力引体越练助力越少', () => {
  let r = next('引体向上', [R('2026-10-06', 0, 4, 7), R('2026-10-10', 0, 4, 8)]);
  assert.deepStrictEqual([r.kind, r.reps], ['reps', 9]);
  r = next('引体向上', [R('2026-10-06', 0, 4, 11), R('2026-10-10', 0, 4, 12)]);
  assert.deepStrictEqual([r.kind, r.weightKg], ['load', 2.5]);
  r = next('俯卧撑', [R('2026-10-06', 0, 3, 22), R('2026-10-10', 0, 3, 25)]);
  assert.deepStrictEqual([r.kind, r.sets], ['sets', 4]);
  r = next('俯卧撑', [R('2026-10-06', 0, 4, 22), R('2026-10-10', 0, 4, 25)]);
  assert.strictEqual(r.kind, 'harder');
  assert.match(r.text, /下斜俯卧撑/);
  r = next('助力引体向上', [R('2026-10-06', 30, 3, 9), R('2026-10-10', 30, 3, 10)]);
  assert.deepStrictEqual([r.kind, r.weightKg], ['weight', 27.5]);
});

test('数字是估的那条不算成绩；排好几天的计划，前面几天当成做到了接着加', () => {
  let r = next('杠铃卧推', [R('2026-10-06', 80, 4, 8), R('2026-10-10', 60, 4, 10, { notes: '重量估计' })]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['reps', 80, 9]);
  const recs = [R('2026-10-08', 80, 4, 9)];
  const first = next('杠铃卧推', recs, { today: '2026-10-13' });
  const second = next('杠铃卧推', recs, { today: '2026-10-16', extra: [O.asSession(first, '2026-10-13')] });
  assert.deepStrictEqual([first.weightKg, first.reps], [80, 10]);
  assert.deepStrictEqual([second.kind, second.weightKg], ['weight', 82.5], '周一做到 10 个，周四加重量');
});

test('跟着它练三个月：一直在往上走，卡住了会退，不会原地打转', () => {
  // 假的「真实能力」：每次一点点变强；做不到建议的次数就做能做的
  let recs = [R('2026-01-01', 60, 4, 8)], rm = 85;
  const d = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 36; i++) {
    d.setUTCDate(d.getUTCDate() + 3);
    const date = d.toISOString().slice(0, 10);
    const nx = O.next(recs, '杠铃卧推', { today: date });
    rm *= 1.006;
    const can = Math.max(1, Math.floor(30 * (rm / nx.weightKg - 1)) - 2);
    recs = recs.concat(R(date, nx.weightKg, nx.sets, Math.min(nx.reps, can)));
  }
  const last = O.sessions(recs).slice(-1)[0];
  assert.ok(last.w >= 72.5, `三个月后应该比 60kg 重不少，现在 ${last.w}kg`);
  assert.ok(O.sessions(recs).every(s => s.sets >= 3 && s.sets <= 5), '组数不会乱跳');
});

test('排计划（calibratePlan）：好几天里同一个动作接着往上加', () => {
  global.getTodayDateString = () => '2026-10-12';
  global.shiftDateString = global.shiftDateString || ((d, k) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); });
  global.FitnessApp = global.FitnessApp || class {};
  require('../web/js/app/agent.js');
  const app = Object.create(FitnessApp.prototype);
  app.workouts = [R('2026-10-08', 80, 4, 9), R('2026-10-10', 6, 4, 18), R('2026-10-11', 6, 4, 20)].map((w, i) => Object.assign(w, { exerciseName: i ? '哑铃侧平举' : '杠铃卧推' }));
  app.exerciseProgress = function (name, opts) {
    const logs = this.workouts.filter(w => w.exerciseName === name);
    if (!logs.length) return null;
    return { last: logs[logs.length - 1], next: O.next(logs, name, { today: opts.date, extra: opts.extra }) };
  };
  const plan = app.calibratePlan({ days: [
    { dayOffset: 4, workouts: [{ exerciseName: '杠铃卧推', weightKg: 60, sets: 4, reps: 8 }] },
    { dayOffset: 1, workouts: [{ exerciseName: '杠铃卧推', weightKg: 60, sets: 4, reps: 8 }, { exerciseName: '哑铃侧平举', weightKg: 5, sets: 3, reps: 15 }] }] });
  const [later, first] = plan.days;
  assert.deepStrictEqual([first.workouts[0].weightKg, first.workouts[0].reps], [80, 10], '明天：80kg 冲 10 个');
  assert.deepStrictEqual([later.workouts[0].weightKg, later.workouts[0].reps], [82.5, 9], '后面那天按明天做到了，加重量');
  const lat = first.workouts[1];
  assert.deepStrictEqual([lat.weightKg, lat.sets], [8, 3], '侧平举 6kg 做满 4×20：明天直接排 8kg（组数照计划写的）');
});

test('你以前就这么跳过、次数没掉：照你的来，不当成跨太大', () => {
  const r = next('高位下拉', [R('2026-10-01', 45, 4, 10), R('2026-10-05', 50, 4, 10), R('2026-10-09', 55, 4, 10)]);
  assert.deepStrictEqual([r.kind, r.weightKg, r.reps], ['weight', 60, 10]);
});
