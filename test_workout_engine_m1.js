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

console.log('====================================================');
console.log('  Milestone 1: 语音解析与要素补全引擎专项验收测试   ');
console.log('====================================================\n');

// 1. 测试同音词与口语化表达归一化
console.log('[测试 1: 健身同音词与口语短语纠偏]');
const homophoneCases = [
  { input: '卧腿80公斤做四组八哥', expectedExercise: '杠铃卧推', weight: 80, sets: 4, reps: 8 },
  { input: '划川60公斤俩组10个', expectedExercise: '杠铃划船', weight: 60, sets: 2, reps: 10 },
  { input: '硬啦100公斤做把个', expectedExercise: '传统硬拉', weight: 100, reps: 8 },
  { input: '高位下啦40公斤4组12次', expectedExercise: '高位下拉', weight: 40, sets: 4, reps: 12 },
  { input: '侧平局10公斤做4组15次', expectedExercise: '哑铃侧平举', weight: 10, sets: 4, reps: 15 },
  { input: '二头完举14公斤4组10次', expectedExercise: '二头肌弯举', weight: 14, sets: 4, reps: 10 },
  { input: '双杠臂屈身自重4组8次', expectedExercise: '双杠臂屈伸', weight: 0, sets: 4, reps: 8 }
];

homophoneCases.forEach((tc, idx) => {
  const items = WorkoutEngine.parseWorkoutVoice(tc.input);
  assert.strictEqual(items.length > 0, true, `Case ${idx + 1} should parse at least 1 item`);
  const item = items[0];
  assert.strictEqual(item.exerciseName, tc.expectedExercise, `Case ${idx + 1} exerciseName mismatch (got ${item.exerciseName}, expected ${tc.expectedExercise})`);
  if (tc.weight !== undefined) assert.strictEqual(item.weightKg, tc.weight, `Case ${idx + 1} weightKg mismatch (got ${item.weightKg}, expected ${tc.weight})`);
  if (tc.sets !== undefined) assert.strictEqual(item.sets, tc.sets, `Case ${idx + 1} sets mismatch (got ${item.sets}, expected ${tc.sets})`);
  if (tc.reps !== undefined) assert.strictEqual(item.reps, tc.reps, `Case ${idx + 1} reps mismatch (got ${item.reps}, expected ${tc.reps})`);
  console.log(`  ✓ 用例 ${idx + 1} 通过: "${tc.input}" -> ${item.exerciseName} ${item.weightKg}kg ${item.sets}组×${item.reps}次`);
});
console.log(' -> [✓ 通过] 同音词与口语表达纠偏 100% 准确！\n');

// 2. 测试活跃 To-Do 上下文偏置 (Contextual Biasing)
console.log('[测试 2: 活跃 To-Do 上下文偏置与优先级匹配]');
const activeTodos = [
  { exerciseName: '哑铃上斜卧推', muscleGroup: '胸部' },
  { exerciseName: '坐姿划船', muscleGroup: '背部' }
];

// 输入 "推胸 24公斤 4组8次"，有上下文偏置时优先匹配活跃 To-Do 中的 "哑铃上斜卧推"
const biasedItems = WorkoutEngine.parseWorkoutVoice('推胸24公斤4组8次', { activeTodos });
assert.strictEqual(biasedItems[0].exerciseName, '哑铃上斜卧推', 'Should match active todo exercise');
console.log(`  ✓ 上下文偏置测试: "推胸24公斤4组8次" -> 优先命中【${biasedItems[0].exerciseName}】`);

// 无上下文时，"推胸" 匹配默认 "杠铃卧推"
const unbiasedItems = WorkoutEngine.parseWorkoutVoice('推胸80公斤4组8次');
assert.strictEqual(unbiasedItems[0].exerciseName, '杠铃卧推', 'Should fallback to default barbell bench press');
console.log(`  ✓ 无偏置默认测试: "推胸80公斤4组8次" -> 默认命中【${unbiasedItems[0].exerciseName}】`);
console.log(' -> [✓ 通过] 上下文偏置引擎运行正常！\n');

// 3. 测试 4 要素缺失校验与追问文案生成
console.log('[测试 3: 缺失要素检测与智能追问文案生成]');
// Case 3.1: 缺失组数和次数 ("深蹲100kg")
const missingSetsReps = WorkoutEngine.parseWorkoutVoice('深蹲100公斤')[0];
assert.strictEqual(missingSetsReps.isComplete, false);
assert.deepStrictEqual(missingSetsReps.missingFactors.sort(), ['reps', 'sets']);
assert.strictEqual(missingSetsReps.followUpPrompt.includes('做了几组、每组几次'), true);
console.log(`  ✓ 缺失组次: "深蹲100公斤" -> isComplete=false, 追问: "${missingSetsReps.followUpPrompt}"`);

// Case 3.2: 缺失重量、组数、次数 ("卧推")
const missingAll = WorkoutEngine.parseWorkoutVoice('卧推')[0];
assert.strictEqual(missingAll.isComplete, false);
assert.strictEqual(missingAll.missingFactors.includes('weightKg'), true);
assert.strictEqual(missingAll.missingFactors.includes('sets'), true);
assert.strictEqual(missingAll.missingFactors.includes('reps'), true);
console.log(`  ✓ 缺失重/组/次: "卧推" -> isComplete=false, 追问: "${missingAll.followUpPrompt}"`);

// Case 3.3: 自重完整动作 ("引体向上4组8次自重")
const completeBodyweight = WorkoutEngine.parseWorkoutVoice('引体向上4组8次自重')[0];
assert.strictEqual(completeBodyweight.isComplete, true);
assert.strictEqual(completeBodyweight.weightKg, 0.0);
assert.deepStrictEqual(completeBodyweight.missingFactors, []);
console.log(`  ✓ 自重完整: "引体向上4组8次自重" -> isComplete=true, 0kg 视为有效重量`);
console.log(' -> [✓ 通过] 4 要素缺失判定与追问引导生成准确无误！\n');

// 4. 测试多轮语音增量合并 (mergeWorkoutFactors)
console.log('[测试 4: 多轮语音增量合并引擎]');
let draft = WorkoutEngine.parseWorkoutVoice('深蹲100kg')[0];
assert.strictEqual(draft.isComplete, false);

// 补充 "四组八哥" (同音词归一化为 4组8个)
const merged = WorkoutEngine.mergeWorkoutFactors(draft, '四组八哥');
assert.strictEqual(merged.isComplete, true);
assert.strictEqual(merged.sets, 4);
assert.strictEqual(merged.reps, 8);
assert.strictEqual(merged.weightKg, 100);
assert.deepStrictEqual(merged.missingFactors, []);
assert.strictEqual(merged.followUpPrompt, '');
console.log(`  ✓ 多轮合并成功: 【${merged.exerciseName}】${merged.weightKg}kg × ${merged.sets}组 × ${merged.reps}次 | 完整状态: ${merged.isComplete}`);
console.log(' -> [✓ 通过] 多轮增量合并引擎验证 100% 满分通过！\n');

// 5. 测试算法基础函数 (Levenshtein & String Similarity)
console.log('[测试 5: 基础算法模块测试]');
assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
assert.strictEqual(levenshteinDistance('', 'abc'), 3);
assert.strictEqual(levenshteinDistance('卧推', '卧推'), 0);
assert.strictEqual(calculateStringSimilarity('卧推', '卧推'), 1.0);
assert.strictEqual(calculateStringSimilarity('上斜推胸', '推胸'), 0.5);
console.log('  ✓ Levenshtein 编辑距离与相似度计算验证通过');
console.log(' -> [✓ 通过] 算法底层逻辑完全正确！\n');

console.log('====================================================');
console.log('    Milestone 1 全部测试用例 100% 满分通过！       ');
console.log('====================================================');
