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
console.log('  CHALLENGER 2: ADVERSARIAL STRESS TEST & FUZZY VERIFICATION   ');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    failedTests.push({ name, error: err.message, stack: err.stack });
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

// -----------------------------------------------------------------------------
// 1. COMPLEX MULTI-EXERCISE SENTENCES & WEIRD PUNCTUATION
// -----------------------------------------------------------------------------
console.log('[GROUP 1: 多动作复合长句与异形标点符号抗噪测试]');

runTest('1.1 逗号+连词切分多动作长句 ("卧推...然后深蹲...接着硬拉...最后双杠")', () => {
  const input = '卧推80公斤4组8次，然后深蹲100公斤5组5次，接着硬拉120公斤3组3次，最后双杠臂屈伸自重4组12次';
  const results = WorkoutEngine.parseWorkoutVoice(input);
  assert.strictEqual(results.length, 4, `Expected 4 items, got ${results.length}`);
  
  assert.strictEqual(results[0].exerciseName, '杠铃卧推');
  assert.strictEqual(results[0].weightKg, 80);
  assert.strictEqual(results[0].sets, 4);
  assert.strictEqual(results[0].reps, 8);
  assert.strictEqual(results[0].isComplete, true);

  assert.strictEqual(results[1].exerciseName, '杠铃深蹲');
  assert.strictEqual(results[1].weightKg, 100);
  assert.strictEqual(results[1].sets, 5);
  assert.strictEqual(results[1].reps, 5);
  assert.strictEqual(results[1].isComplete, true);

  assert.strictEqual(results[2].exerciseName, '传统硬拉');
  assert.strictEqual(results[2].weightKg, 120);
  assert.strictEqual(results[2].sets, 3);
  assert.strictEqual(results[2].reps, 3);
  assert.strictEqual(results[2].isComplete, true);

  assert.strictEqual(results[3].exerciseName, '双杠臂屈伸');
  assert.strictEqual(results[3].weightKg, 0);
  assert.strictEqual(results[3].sets, 4);
  assert.strictEqual(results[3].reps, 12);
  assert.strictEqual(results[3].isComplete, true);
});

runTest('1.2 极端标点符号 (分号/换行/感叹号/句号/多空格) 切分', () => {
  const input = '卧推 80kg 4*8；\n深蹲 120kg 5x5！！。 传统硬拉 140kg 3*3';
  const results = WorkoutEngine.parseWorkoutVoice(input);
  assert.strictEqual(results.length, 3, `Expected 3 items, got ${results.length}`);
  assert.strictEqual(results[0].exerciseName, '杠铃卧推');
  assert.strictEqual(results[0].weightKg, 80);
  assert.strictEqual(results[0].sets, 4);
  assert.strictEqual(results[0].reps, 8);

  assert.strictEqual(results[1].exerciseName, '杠铃深蹲');
  assert.strictEqual(results[1].weightKg, 120);
  assert.strictEqual(results[1].sets, 5);
  assert.strictEqual(results[1].reps, 5);

  assert.strictEqual(results[2].exerciseName, '传统硬拉');
  assert.strictEqual(results[2].weightKg, 140);
  assert.strictEqual(results[2].sets, 3);
  assert.strictEqual(results[2].reps, 3);
});

runTest('1.3 加号与全角加号连接 ("深蹲100kg 4组8次 + 引体向上自重4组10次 ＋ 杠铃划船60kg 4组8次")', () => {
  const input = '深蹲100kg 4组8次 + 引体向上自重4组10次 ＋ 杠铃划船60kg 4组8次';
  const results = WorkoutEngine.parseWorkoutVoice(input);
  assert.strictEqual(results.length, 3, `Expected 3 items, got ${results.length}`);
  assert.strictEqual(results[0].exerciseName, '杠铃深蹲');
  assert.strictEqual(results[1].exerciseName, '引体向上');
  assert.strictEqual(results[2].exerciseName, '杠铃划船');
});

runTest('1.4 口语填充词过滤 ("今天先做了...之后顺便...继续做了...")', () => {
  const input = '今天先做了杠铃卧推80公斤4组8个，之后顺便高位下拉50公斤4组10次，继续做了哑铃侧平举10公斤4组15次';
  const results = WorkoutEngine.parseWorkoutVoice(input);
  assert.strictEqual(results.length, 3, `Expected 3 items, got ${results.length}`);
  assert.strictEqual(results[0].exerciseName, '杠铃卧推');
  assert.strictEqual(results[1].exerciseName, '高位下拉');
  assert.strictEqual(results[2].exerciseName, '哑铃侧平举');
});

// -----------------------------------------------------------------------------
// 2. PHONETIC FUZZY MATCHING, HOMOPHONES & COLLOQUIAL NUMBER PHRASES
// -----------------------------------------------------------------------------
console.log('\n[GROUP 2: 健身语音同音词、口语数字与模糊音纠偏测试]');

const homophoneStressCases = [
  { input: '我推85公斤做四个八', expectedName: '杠铃卧推', weight: 85, sets: 4, reps: 8 },
  { input: '上邪推30公斤做五个五', expectedName: '哑铃上斜卧推', weight: 30, sets: 5, reps: 5 },
  { input: '大飞鸟15公斤4组12次', expectedName: '绳索夹胸', weight: 15, sets: 4, reps: 12 },
  { input: '龙门架夹胸12.5公斤4组12次', expectedName: '绳索夹胸', weight: 12.5, sets: 4, reps: 12 },
  { input: '直腿硬辣80公斤4组8次', expectedName: '罗马尼亚硬拉', weight: 80, sets: 4, reps: 8 },
  { input: '后顿100公斤4组6次', expectedName: '杠铃深蹲', weight: 100, sets: 4, reps: 6 },
  { input: '导蹬160公斤4组10次', expectedName: '倒蹬', weight: 160, sets: 4, reps: 10 },
  { input: '三头虾压25公斤4组12次', expectedName: '三头肌绳索下压', weight: 25, sets: 4, reps: 12 },
  { input: '影体向上双组八次', expectedName: '引体向上', weight: 0, sets: 2, reps: 8 },
  { input: '鸭铃侧凭局10公斤做4组15次', expectedName: '哑铃侧平举', weight: 10, sets: 4, reps: 15 },
  { input: '钢铃推巨50公斤4组8次', expectedName: '杠铃推举', weight: 50, sets: 4, reps: 8 },
  { input: '花船65公斤4组8个', expectedName: '杠铃划船', weight: 65, sets: 4, reps: 8 },
  { input: '十米思深登90公斤4组8次', expectedName: '杠铃深蹲', weight: 90, sets: 4, reps: 8 },
  { input: '硬纳110公斤做把个', expectedName: '传统硬拉', weight: 110, sets: null, reps: 8 },
  { input: '二头完举16公斤俩组10个', expectedName: '二头肌弯举', weight: 16, sets: 2, reps: 10 }
];

homophoneStressCases.forEach((tc, idx) => {
  runTest(`2.${idx + 1} 同音词纠偏: "${tc.input}" -> ${tc.expectedName}`, () => {
    const items = WorkoutEngine.parseWorkoutVoice(tc.input);
    assert.strictEqual(items.length >= 1, true, 'Should parse item');
    const item = items[0];
    assert.strictEqual(item.exerciseName, tc.expectedName, `Expected ${tc.expectedName}, got ${item.exerciseName}`);
    if (tc.weight !== undefined) assert.strictEqual(item.weightKg, tc.weight, `Expected weight ${tc.weight}, got ${item.weightKg}`);
    if (tc.sets !== undefined && tc.sets !== null) assert.strictEqual(item.sets, tc.sets, `Expected sets ${tc.sets}, got ${item.sets}`);
    if (tc.reps !== undefined && tc.reps !== null) assert.strictEqual(item.reps, tc.reps, `Expected reps ${tc.reps}, got ${item.reps}`);
  });
});

// -----------------------------------------------------------------------------
// 3. MIXED ENGLISH / CHINESE & SPECIAL NUMERIC FORMATS
// -----------------------------------------------------------------------------
console.log('\n[GROUP 3: 中英混合术语、别名与特殊数值格式解析]');

runTest('3.1 RDL 英文简称与乘号 ("RDL 80kg 4x8")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('RDL 80kg 4x8');
  assert.strictEqual(items[0].exerciseName, '罗马尼亚硬拉');
  assert.strictEqual(items[0].weightKg, 80);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
});

runTest('3.2 大写单位与英文 sets/reps ("80KG 4SETS 8REPS 卧推")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('80KG 4SETS 8REPS 卧推');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 80);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
});

runTest('3.3 磅 (lbs) 单位自动换算为公斤 ("硬拉 200磅 3组5次")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('硬拉 200磅 3组5次');
  assert.strictEqual(items[0].exerciseName, '传统硬拉');
  // 200 * 0.453 = 90.6kg
  assert.strictEqual(items[0].weightKg, 90.6);
  assert.strictEqual(items[0].sets, 3);
  assert.strictEqual(items[0].reps, 5);
});

runTest('3.4 中文大写小数与点数 ("八十二点五公斤 4组 8次 卧推")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('八十二点五公斤 4组 8次 卧推');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 82.5);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 8);
});

runTest('3.5 特殊重量: 空杆 ("卧推 空杆 4组10次")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('卧推 空杆 4组10次');
  assert.strictEqual(items[0].exerciseName, '杠铃卧推');
  assert.strictEqual(items[0].weightKg, 20);
  assert.strictEqual(items[0].sets, 4);
  assert.strictEqual(items[0].reps, 10);
});

runTest('3.6 特殊重量: 徒手/不加重量 ("深蹲 徒手 3组20次")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('深蹲 徒手 3组20次');
  assert.strictEqual(items[0].exerciseName, '杠铃深蹲');
  assert.strictEqual(items[0].weightKg, 0);
  assert.strictEqual(items[0].sets, 3);
  assert.strictEqual(items[0].reps, 20);
});

runTest('3.7 RPE 解析 ("深蹲 120kg 3组5次 RPE 8.5")', () => {
  const items = WorkoutEngine.parseWorkoutVoice('深蹲 120kg 3组5次 RPE 8.5');
  assert.strictEqual(items[0].exerciseName, '杠铃深蹲');
  assert.strictEqual(items[0].weightKg, 120);
  assert.strictEqual(items[0].sets, 3);
  assert.strictEqual(items[0].reps, 5);
  assert.strictEqual(items[0].rpe, 8.5);
});

// -----------------------------------------------------------------------------
// 4. LEVENSHTEIN DISTANCE & SIMILARITY MATHEMATICAL PROPERTIES
// -----------------------------------------------------------------------------
console.log('\n[GROUP 4: Levenshtein 与相似度算法数学性质与边界测试]');

runTest('4.1 Levenshtein 同一性 (Identity)', () => {
  assert.strictEqual(levenshteinDistance('哑铃侧平举', '哑铃侧平举'), 0);
  assert.strictEqual(levenshteinDistance('', ''), 0);
});

runTest('4.2 Levenshtein 对称性 (Symmetry)', () => {
  const d1 = levenshteinDistance('杠铃深蹲', '深蹲架');
  const d2 = levenshteinDistance('深蹲架', '杠铃深蹲');
  assert.strictEqual(d1, d2);
});

runTest('4.3 Levenshtein 三角不等式 (Triangle Inequality)', () => {
  const a = '杠铃卧推';
  const b = '哑铃卧推';
  const c = '哑铃上斜卧推';
  const dab = levenshteinDistance(a, b);
  const dbc = levenshteinDistance(b, c);
  const dac = levenshteinDistance(a, c);
  assert.strictEqual(dac <= dab + dbc, true, `Triangle inequality failed: ${dac} > ${dab} + ${dbc}`);
});

runTest('4.4 Levenshtein 空值与边界安全', () => {
  assert.strictEqual(levenshteinDistance(null, 'abc'), 3);
  assert.strictEqual(levenshteinDistance('abc', undefined), 3);
  assert.strictEqual(levenshteinDistance(null, null), 0);
});

runTest('4.5 calculateStringSimilarity 区间与包含提升', () => {
  const sExact = calculateStringSimilarity('深蹲', '深蹲');
  assert.strictEqual(sExact, 1.0);
  const sSub = calculateStringSimilarity('杠铃深蹲', '深蹲');
  assert.strictEqual(sSub, 0.5); // 2/4
  const sNull = calculateStringSimilarity(null, '深蹲');
  assert.strictEqual(sNull, 0);
});

// -----------------------------------------------------------------------------
// 5. ACTIVE TO-DO CONTEXTUAL BIASING STRESS TEST
// -----------------------------------------------------------------------------
console.log('\n[GROUP 5: 活跃 To-Do 上下文偏置与歧义消解]');

runTest('5.1 偏置优先: 活跃动作含有 "坐姿划船"，口喷 "划船60kg 4组8次"', () => {
  const activeTodos = [{ exerciseName: '坐姿划船', muscleGroup: '背部' }];
  const items = WorkoutEngine.parseWorkoutVoice('划船60kg 4组8次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '坐姿划船');
});

runTest('5.2 偏置优先: 活跃动作含有 "罗马尼亚硬拉"，口喷 "硬拉80kg 4组8次"', () => {
  const activeTodos = [{ exerciseName: '罗马尼亚硬拉', muscleGroup: '腿部' }];
  const items = WorkoutEngine.parseWorkoutVoice('硬拉80kg 4组8次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '罗马尼亚硬拉');
});

runTest('5.3 无关偏置不干扰: 活跃 "坐姿划船"，口喷 "深蹲100kg 4组8次" 应正确命中深蹲', () => {
  const activeTodos = [{ exerciseName: '坐姿划船', muscleGroup: '背部' }];
  const items = WorkoutEngine.parseWorkoutVoice('深蹲100kg 4组8次', { activeTodos });
  assert.strictEqual(items[0].exerciseName, '杠铃深蹲');
});

// -----------------------------------------------------------------------------
// 6. MULTI-TURN INCREMENTAL FACTOR MERGER CONSISTENCY
// -----------------------------------------------------------------------------
console.log('\n[GROUP 6: 多轮增量要素合并 (Multi-turn Incremental Merger) 一致性]');

runTest('6.1 三轮渐进式补全: 动作名 -> 重量 -> 组数次数', () => {
  // Round 1: 仅输入动作
  let draft = WorkoutEngine.parseWorkoutVoice('深蹲')[0];
  assert.strictEqual(draft.isComplete, false);
  assert.strictEqual(draft.exerciseName, '杠铃深蹲');
  assert.strictEqual(draft.weightKg, null);
  assert.strictEqual(draft.sets, null);
  assert.strictEqual(draft.reps, null);
  assert.deepStrictEqual(draft.missingFactors.sort(), ['reps', 'sets', 'weightKg']);

  // Round 2: 补充重量
  draft = WorkoutEngine.mergeWorkoutFactors(draft, '一百公斤');
  assert.strictEqual(draft.isComplete, false);
  assert.strictEqual(draft.exerciseName, '杠铃深蹲');
  assert.strictEqual(draft.weightKg, 100);
  assert.strictEqual(draft.sets, null);
  assert.strictEqual(draft.reps, null);
  assert.deepStrictEqual(draft.missingFactors.sort(), ['reps', 'sets']);

  // Round 3: 补充组次
  draft = WorkoutEngine.mergeWorkoutFactors(draft, '四组八个');
  assert.strictEqual(draft.isComplete, true);
  assert.strictEqual(draft.exerciseName, '杠铃深蹲');
  assert.strictEqual(draft.weightKg, 100);
  assert.strictEqual(draft.sets, 4);
  assert.strictEqual(draft.reps, 8);
  assert.deepStrictEqual(draft.missingFactors, []);
  assert.strictEqual(draft.followUpPrompt, '');
});

runTest('6.2 连乘口喷补全: "卧推80kg" -> 追问 -> "4*8"', () => {
  let draft = WorkoutEngine.parseWorkoutVoice('卧推80kg')[0];
  assert.strictEqual(draft.isComplete, false);
  draft = WorkoutEngine.mergeWorkoutFactors(draft, '4*8');
  assert.strictEqual(draft.isComplete, true);
  assert.strictEqual(draft.sets, 4);
  assert.strictEqual(draft.reps, 8);
  assert.strictEqual(draft.weightKg, 80);
});

runTest('6.3 自重动作补全: "引体向上" -> 追问 -> "自重4组10次"', () => {
  let draft = WorkoutEngine.parseWorkoutVoice('引体向上')[0];
  assert.strictEqual(draft.isComplete, false);
  draft = WorkoutEngine.mergeWorkoutFactors(draft, '自重4组10次');
  assert.strictEqual(draft.isComplete, true);
  assert.strictEqual(draft.weightKg, 0);
  assert.strictEqual(draft.sets, 4);
  assert.strictEqual(draft.reps, 10);
});

runTest('6.4 合并边界: null draft 与空追问文本', () => {
  const res1 = WorkoutEngine.mergeWorkoutFactors(null, '深蹲100kg 4组8次');
  assert.strictEqual(res1.isComplete, true);
  assert.strictEqual(res1.weightKg, 100);

  const draft = WorkoutEngine.parseWorkoutVoice('深蹲100kg')[0];
  const res2 = WorkoutEngine.mergeWorkoutFactors(draft, '');
  assert.strictEqual(res2.weightKg, 100);
  assert.strictEqual(res2.isComplete, false);
});

// -----------------------------------------------------------------------------
// 7. 1RM & BARBELL PLATE CALCULATOR REGRESSION VERIFICATION
// -----------------------------------------------------------------------------
console.log('\n[GROUP 7: 1RM 预估与杠铃算片回归验证]');

runTest('7.1 1RM Epley 公式标称与边界测试', () => {
  // 80kg x 10 = 80 * (1 + 10/30) = 80 * 1.3333 = 106.66 -> 107
  assert.strictEqual(WorkoutEngine.calc1RM(80, 10), 107);
  // 100kg x 1 = 100
  assert.strictEqual(WorkoutEngine.calc1RM(100, 1), 100);
  // 120kg x 5 = 120 * (1 + 5/30) = 120 * 1.1666 = 140
  assert.strictEqual(WorkoutEngine.calc1RM(120, 5), 140);
  // 边界: 0kg -> 0
  assert.strictEqual(WorkoutEngine.calc1RM(0, 10), 0);
  // 边界: 负数 -> 0
  assert.strictEqual(WorkoutEngine.calc1RM(-50, 10), 0);
  // 边界: NaN -> 0
  assert.strictEqual(WorkoutEngine.calc1RM('abc', 10), 0);
  // 边界: reps <= 1 -> weight
  assert.strictEqual(WorkoutEngine.calc1RM(80, 0), 80);
});

runTest('7.2 杠铃算片贪心算法与边界测试', () => {
  // 20kg 空杆
  const p20 = WorkoutEngine.calcBarbellPlates(20);
  assert.deepStrictEqual(p20.platesPerSide, []);
  assert.strictEqual(p20.remainder, 0);

  // 60kg (每边 20kg -> [20])
  const p60 = WorkoutEngine.calcBarbellPlates(60);
  assert.deepStrictEqual(p60.platesPerSide, [20]);

  // 80kg (每边 30kg -> [25, 5])
  const p80 = WorkoutEngine.calcBarbellPlates(80);
  assert.deepStrictEqual(p80.platesPerSide, [25, 5]);

  // 102.5kg (每边 41.25kg -> [25, 15, 1.25])
  const p1025 = WorkoutEngine.calcBarbellPlates(102.5);
  assert.deepStrictEqual(p1025.platesPerSide, [25, 15, 1.25]);

  // 142.5kg (每边 61.25kg -> [25, 25, 10, 1.25])
  const p1425 = WorkoutEngine.calcBarbellPlates(142.5);
  assert.deepStrictEqual(p1425.platesPerSide, [25, 25, 10, 1.25]);

  // 目标重量小于杠铃杆重量 (如 15kg < 20kg)
  const p15 = WorkoutEngine.calcBarbellPlates(15);
  assert.deepStrictEqual(p15.platesPerSide, []);
  assert.strictEqual(p15.perSideWeight, 0);
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`  测试结果: 总数 ${totalTests} | 通过 ${passedTests} | 失败 ${failedTests.length}`);
console.log('================================================================\n');

if (failedTests.length > 0) {
  console.error('存在失败用例:');
  failedTests.forEach(f => console.error(`  - ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('🎉 所有挑战者压力测试用例 100% 全部通过！');
  process.exit(0);
}
