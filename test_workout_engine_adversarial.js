const assert = require('assert');
const {
  WorkoutEngine,
  normalizeFitnessSpeech,
  normalizeTextWithNumbers,
  parseChineseUniversalNum,
  FITNESS_HOMOPHONE_MAP,
  generateFollowUpPrompt,
  calculateStringSimilarity,
  levenshteinDistance
} = require('./js/workout.js');

console.log('================================================================');
console.log('  [CHALLENGER 1] WorkoutEngine Adversarial Empirical Stress Suite');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function runTest(category, name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] #${totalTests} [${category}] ${name}`);
    testResults.push({ id: totalTests, category, name, passed: true });
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] #${totalTests} [${category}] ${name}`);
    console.error(`         Error: ${err.message}`);
    testResults.push({ id: totalTests, category, name, passed: false, error: err.message });
  }
}

// -----------------------------------------------------------------------------
// CATEGORY 1: Colloquial Homophones and Slang (9 Cases)
// -----------------------------------------------------------------------------
console.log('--- CATEGORY 1: Colloquial Homophones and Slang ---');

runTest('Homophones', 'Homophone: "卧腿80公斤做四组八哥" -> 杠铃卧推 80kg 4组8个', () => {
  const items = WorkoutEngine.parseWorkoutVoice('卧腿80公斤做四组八哥');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 80);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "划川60kg" (missing sets/reps) -> 杠铃划船 60kg', () => {
  const items = WorkoutEngine.parseWorkoutVoice('划川60kg');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '杠铃划船');
  assert.strictEqual(items[0].weightKg, 60);
  assert.strictEqual(items[0].sets, null);
  assert.strictEqual(items[0].reps, null);
  assert.strictEqual(items[0].isComplete, false);
  assert.deepStrictEqual(items[0].missingFactors.sort(), ['reps', 'sets']);
});

runTest('Homophones', 'Homophone: "高位下啦4组10个" (missing weight) -> 高位下拉 4组10个', () => {
  const items = WorkoutEngine.parseWorkoutVoice('高位下啦4组10个');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '高位下拉');
  assert.strictEqual(items[0].weightKg, null);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 10);
  assert.strictEqual(items[0].isComplete, false);
  assert.deepStrictEqual(items[0].missingFactors, ['weightKg']);
});

runTest('Homophones', 'Homophone: "二头完举15公斤4组12次" -> 二头肌弯举 15kg 4组12次', () => {
  const items = WorkoutEngine.parseWorkoutVoice('二头完举15公斤4组12次');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '二头肌弯举');
  assert.strictEqual(items[0].weightKg, 15);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 12);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "双杠臂屈身自重俩组8次" -> 双杠臂屈伸 0kg 2组8次', () => {
  const items = WorkoutEngine.parseWorkoutVoice('双杠臂屈身自重俩组8次');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '双杠臂屈伸');
  assert.strictEqual(items[0].weightKg, 0.0);
  assert.strictEqual(items[0].sets, 2);
  assert.strictEqual(items[0].reps, 8);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "侧平局5公斤做4组把个" -> 哑铃侧平举 5kg 4组8个', () => {
  const items = WorkoutEngine.parseWorkoutVoice('侧平局5公斤做4组把个');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '哑铃侧平举');
  assert.strictEqual(items[0].weightKg, 5);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "硬啦120kg 3*5" -> 传统硬拉 120kg 3组5次', () => {
  const items = WorkoutEngine.parseWorkoutVoice('硬啦120kg 3*5');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '传统硬拉');
  assert.strictEqual(items[0].weightKg, 120);
  assert.strictEqual(items[0].sets, 3);
  assert.strictEqual(items[0].reps, 5);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "导蹬200公斤3组10次" -> 倒蹬 200kg 3组10次', () => {
  const items = WorkoutEngine.parseWorkoutVoice('导蹬200公斤3组10次');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '倒蹬');
  assert.strictEqual(items[0].weightKg, 200);
  assert.strictEqual(items[0].sets, 3);
  assert.strictEqual(items[0].reps, 10);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Homophones', 'Homophone: "面辣15kg做4组15下" -> 面拉 15kg 4组15次', () => {
  const items = WorkoutEngine.parseWorkoutVoice('面辣15kg做4组15下');
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].exerciseName, '面拉');
  assert.strictEqual(items[0].weightKg, 15);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 15);
  assert.strictEqual(items[0].isComplete, true);
});

// -----------------------------------------------------------------------------
// CATEGORY 2: Multi-turn Factor Completion Sequences (6 Cases)
// -----------------------------------------------------------------------------
console.log('\n--- CATEGORY 2: Multi-turn Factor Completion Sequences ---');

runTest('Multi-turn', 'Multi-turn: "深蹲100kg" -> follow-up "4组8个" -> Complete', () => {
  const draft = WorkoutEngine.parseWorkoutVoice('深蹲100kg')[0];
  assert.strictEqual(draft.isComplete, false);
  assert.strictEqual(draft.exerciseName, '杠铃深蹲');
  assert.strictEqual(draft.weightKg, 100);
  assert.strictEqual(draft.sets, null);
  assert.strictEqual(draft.reps, null);

  const completed = WorkoutEngine.mergeWorkoutFactors(draft, '4组8个');
  assert.strictEqual(completed.exerciseName, '杠铃深蹲');
  assert.strictEqual(completed.weightKg, 100);
  assert.strictEqual(completed.sets, 4);
  assert.strictEqual(completed.reps, 8);
  assert.strictEqual(completed.isComplete, true);
  assert.strictEqual(completed.missingFactors.length, 0);
});

runTest('Multi-turn', 'Multi-turn: Step 1 "卧推" -> Step 2 "80公斤" (only weight supplied)', () => {
  const draft1 = WorkoutEngine.parseWorkoutVoice('卧推')[0];
  assert.strictEqual(draft1.isComplete, false);
  assert.deepStrictEqual(draft1.missingFactors.sort(), ['reps', 'sets', 'weightKg']);

  const draft2 = WorkoutEngine.mergeWorkoutFactors(draft1, '80公斤');
  assert.strictEqual(draft2.weightKg, 80);
  assert.strictEqual(draft2.sets, null, 'Sets should still be null when only weight is provided');
  assert.strictEqual(draft2.reps, null, 'Reps should still be null when only weight is provided');
  assert.strictEqual(draft2.isComplete, false);
  assert.deepStrictEqual(draft2.missingFactors.sort(), ['reps', 'sets']);
});

runTest('Multi-turn', 'Multi-turn: Step 2 "80kg" -> Step 3 "4组10次" -> Complete', () => {
  const draft1 = { exerciseName: '杠铃卧推', muscleGroup: '胸部', weightKg: 80, sets: null, reps: null, isComplete: false, missingFactors: ['sets', 'reps'] };
  const draft3 = WorkoutEngine.mergeWorkoutFactors(draft1, '4组10次');
  assert.strictEqual(draft3.weightKg, 80);
  assert.strictEqual(draft3.sets, 4);
  assert.strictEqual(draft3.reps, 10);
  assert.strictEqual(draft3.isComplete, true);
  assert.strictEqual(draft3.missingFactors.length, 0);
});

runTest('Multi-turn', 'Multi-turn: Follow-up single factor "4组" (missing reps)', () => {
  const draft = { exerciseName: '杠铃深蹲', muscleGroup: '腿部', weightKg: 100, sets: null, reps: null, isComplete: false, missingFactors: ['sets', 'reps'] };
  const res = WorkoutEngine.mergeWorkoutFactors(draft, '4组');
  assert.strictEqual(res.sets, 4);
  assert.strictEqual(res.reps, null, 'Reps must remain null when only sets "4组" is provided');
  assert.strictEqual(res.isComplete, false, 'Should not be marked complete when reps are missing');
  assert.deepStrictEqual(res.missingFactors, ['reps']);
});

runTest('Multi-turn', 'Multi-turn: Bodyweight "引体向上" -> follow-up "3组8下" -> Complete', () => {
  const draft = WorkoutEngine.parseWorkoutVoice('引体向上')[0];
  assert.strictEqual(draft.exerciseName, '引体向上');
  assert.strictEqual(draft.weightKg, 0.0);
  assert.strictEqual(draft.isComplete, false);

  const completed = WorkoutEngine.mergeWorkoutFactors(draft, '3组8下');
  assert.strictEqual(completed.weightKg, 0.0);
  assert.strictEqual(completed.sets, 3);
  assert.strictEqual(completed.reps, 8);
  assert.strictEqual(completed.isComplete, true);
});

runTest('Multi-turn', 'Multi-turn: "杠铃划船60kg" -> follow-up with slang "俩组八哥" -> Complete', () => {
  const draft = WorkoutEngine.parseWorkoutVoice('杠铃划船60kg')[0];
  assert.strictEqual(draft.isComplete, false);

  const completed = WorkoutEngine.mergeWorkoutFactors(draft, '俩组八哥');
  assert.strictEqual(completed.exerciseName, '杠铃划船');
  assert.strictEqual(completed.weightKg, 60);
  assert.strictEqual(completed.sets, 2);
  assert.strictEqual(completed.reps, 8);
  assert.strictEqual(completed.isComplete, true);
});

// -----------------------------------------------------------------------------
// CATEGORY 3: Contextual Biasing (4 Cases)
// -----------------------------------------------------------------------------
console.log('\n--- CATEGORY 3: Contextual Biasing ---');

runTest('Context Biasing', '"推胸" without activeToDos -> Defaults to "杠铃卧推"', () => {
  const items = WorkoutEngine.parseWorkoutVoice('推胸80公斤4组8次');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
});

runTest('Context Biasing', '"推胸" with activeToDos containing "哑铃上斜卧推" -> Biased to "哑铃上斜卧推"', () => {
  const activeTodos = [{ exerciseName: '哑铃上斜卧推', muscleGroup: '胸部' }];
  const items = WorkoutEngine.parseWorkoutVoice('推胸24公斤4组8次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '哑铃上斜卧推');
});

runTest('Context Biasing', '"划船" with activeToDos containing "坐姿划船" -> Biased to "坐姿划船"', () => {
  const activeTodos = [{ exerciseName: '坐姿划船', muscleGroup: '背部' }];
  const items = WorkoutEngine.parseWorkoutVoice('划船50公斤4组10次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '坐姿划船');
});

runTest('Context Biasing', '"硬拉" with activeToDos containing "罗马尼亚硬拉" -> Biased to "罗马尼亚硬拉"', () => {
  const activeTodos = [{ exerciseName: '罗马尼亚硬拉', muscleGroup: '腿部' }];
  const items = WorkoutEngine.parseWorkoutVoice('硬拉80公斤4组8次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '罗马尼亚硬拉');
});

// -----------------------------------------------------------------------------
// CATEGORY 4: Incomplete and Boundary Inputs (6 Cases)
// -----------------------------------------------------------------------------
console.log('\n--- CATEGORY 4: Incomplete and Boundary Inputs ---');

runTest('Boundary', 'Bodyweight explicit: "深蹲自重4组15次" -> weightKg = 0.0, isComplete = true', () => {
  const items = WorkoutEngine.parseWorkoutVoice('深蹲自重4组15次');
  assert.strictEqual(items[0].exerciseName, '杠铃深蹲');
  assert.strictEqual(items[0].weightKg, 0.0);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 15);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Boundary', 'Empty barbell: "空杆卧推4组12次" -> weightKg = 20.0, isComplete = true', () => {
  const items = WorkoutEngine.parseWorkoutVoice('空杆卧推4组12次');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 20.0);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 12);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Boundary', 'Arabic decimal weight: "哑铃侧平举7.5公斤4组15次" -> weightKg = 7.5', () => {
  const items = WorkoutEngine.parseWorkoutVoice('哑铃侧平举7.5公斤4组15次');
  assert.strictEqual(items[0].exerciseName, '哑铃侧平举');
  assert.strictEqual(items[0].weightKg, 7.5);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 15);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Boundary', 'Chinese decimal weight: "卧推八十二点五公斤4组8次" -> weightKg = 82.5', () => {
  const items = WorkoutEngine.parseWorkoutVoice('卧推八十二点五公斤4组8次');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 82.5);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Boundary', 'Single digit sets & reps: "深蹲140公斤1组1次" -> sets = 1, reps = 1', () => {
  const items = WorkoutEngine.parseWorkoutVoice('深蹲140公斤1组1次');
  assert.strictEqual(items[0].exerciseName, '杠铃深蹲');
  assert.strictEqual(items[0].weightKg, 140);
  assert.strictEqual(items[0].sets, 1);
  assert.strictEqual(items[0].reps, 1);
  assert.strictEqual(items[0].isComplete, true);
});

runTest('Boundary', 'Multi-item utterance: "卧推80公斤4组10次，深蹲100公斤4组8次，引体向上自重3组10次"', () => {
  const text = '卧推80公斤4组10次，深蹲100公斤4组8次，引体向上自重3组10次';
  const items = WorkoutEngine.parseWorkoutVoice(text);
  assert.strictEqual(items.length, 3);
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 80);
  assert.strictEqual(items[1].exerciseName, '杠铃深蹲');
  assert.strictEqual(items[1].weightKg, 100);
  assert.strictEqual(items[2].exerciseName, '引体向上');
  assert.strictEqual(items[2].weightKg, 0.0);
  assert.strictEqual(items.every(it => it.isComplete), true);
});

// -----------------------------------------------------------------------------
// SUMMARY REPORT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  Adversarial Test Suite Execution Summary:`);
console.log(`  Total Executed: ${totalTests}`);
console.log(`  Passed:         ${passedTests}`);
console.log(`  Failed:         ${failedTests}`);
console.log('================================================================\n');

if (failedTests > 0) {
  console.error('Failed Test Breakdown:');
  testResults.filter(t => !t.passed).forEach(f => {
    console.error(`- Test #${f.id} [${f.category}] ${f.name}`);
    console.error(`  Failure Reason: ${f.error}`);
  });
  console.log('\nVerdict: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('Verdict: APPROVE');
  process.exit(0);
}
