// 数据备份：读备份文件、合并进现有数据（重复的不记两遍）
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

const { parseBackup, mergeBackupData } = require('../web/js/app/backup.js');

const backupFile = JSON.stringify({
  app: '练食AI', format: 1, exportedAt: '2026-09-30T08:00:00Z',
  data: {
    fit_profile: { mode: 'fit', customized: true, weightKg: 61, heightCm: 172, targetProteinG: 122 },
    fit_diet: [
      { id: 'd1', date: '2026-09-29', mealType: '早餐', foodSummary: '鸡蛋2个', calories: 139 },
      { id: 'd2', date: '2026-09-30', mealType: '午餐', foodSummary: '黄焖鸡米饭', calories: 828 },
      { foodSummary: '没有 id 的坏数据' }
    ],
    fit_workouts: [{ id: 'w1', date: '2026-09-29', exerciseName: '杠铃卧推', weightKg: 80, sets: 4, reps: 8 }],
    fit_weights: [{ date: '2026-09-29', kg: 61.2 }, { date: '2026-09-30', kg: 61 }],
    fit_my_foods: [{ name: '甜牛奶', amount: '250毫升', calories: 173, proteinG: 7 }]
  }
});

test('读备份：不是练食AI的文件返回 null，坏数据丢掉', () => {
  assert.strictEqual(parseBackup('不是 json'), null);
  assert.strictEqual(parseBackup('{"a":1}'), null);
  const b = parseBackup(backupFile);
  assert.strictEqual(b.fit_diet.length, 2);
  assert.strictEqual(b.fit_profile.weightKg, 61);
});

test('重装后恢复：新装的 App 什么都没有，全部导进来，身体数据也恢复', () => {
  const r = mergeBackupData({ fit_profile: { mode: undefined }, fit_diet: [], fit_workouts: [], fit_weights: [], fit_my_foods: [] }, parseBackup(backupFile));
  assert.deepStrictEqual(r.added, { diet: 2, workouts: 1, weights: 2, myFoods: 1, plans: 0 });
  assert.strictEqual(r.profileRestored, true);
  assert.strictEqual(r.data.fit_profile.weightKg, 61);
  assert.deepStrictEqual(r.data.fit_diet.map(d => d.id), ['d2', 'd1']); // 新的在前
});

test('已经在用的手机上恢复：同一条不记两遍，同一天体重、同名记住的食物以现在的为准，身体数据不动', () => {
  const cur = {
    fit_profile: { mode: 'fit', customized: true, weightKg: 70 },
    fit_diet: [{ id: 'd1', date: '2026-09-29', foodSummary: '鸡蛋2个', calories: 139 }, { id: 'd9', date: '2026-10-01', foodSummary: '面', calories: 500 }],
    fit_workouts: [],
    fit_weights: [{ date: '2026-09-30', kg: 60.5 }],
    fit_my_foods: [{ name: '甜牛奶', amount: '250毫升', calories: 150 }]
  };
  const r = mergeBackupData(cur, parseBackup(backupFile));
  assert.deepStrictEqual(r.added, { diet: 1, workouts: 1, weights: 1, myFoods: 0, plans: 0 });
  assert.strictEqual(r.profileRestored, false);
  assert.strictEqual(r.data.fit_profile.weightKg, 70);
  assert.strictEqual(r.data.fit_weights.find(w => w.date === '2026-09-30').kg, 60.5);
  assert.strictEqual(r.data.fit_my_foods[0].calories, 150);
  // 同一个备份再导一次：什么都不加
  const again = mergeBackupData(r.data, parseBackup(backupFile));
  assert.deepStrictEqual(again.added, { diet: 0, workouts: 0, weights: 0, myFoods: 0, plans: 0 });
});

test('小人给的计划也跟着备份：恢复时导进来，同一条不记两遍', () => {
  const plan = { id: 'pl_1_m0', date: '2026-10-02', kind: 'meal', ts: 1, mealType: '早餐', foodSummary: '鸡蛋2个、牛奶1杯', calories: 300, proteinG: 21 };
  const bak = parseBackup(JSON.stringify({ app: '练食AI', format: 1, data: { fit_diet: [], fit_plans: [plan, { id: 'bad' }] } }));
  assert.strictEqual(bak.fit_plans.length, 1);
  const r = mergeBackupData({ fit_diet: [], fit_workouts: [], fit_weights: [], fit_my_foods: [], fit_plans: [] }, bak);
  assert.strictEqual(r.added.plans, 1);
  assert.strictEqual(r.data.fit_plans[0].foodSummary, '鸡蛋2个、牛奶1杯');
  assert.strictEqual(mergeBackupData(r.data, bak).added.plans, 0);
});
