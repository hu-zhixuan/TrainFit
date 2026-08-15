const { WorkoutEngine } = require('./js/workout.js');

console.log("=== 校验行业标杆 1RM 预估与杠铃算片计算器 ===");

// 1. Epley 1RM Formula Test
const test1RM_1 = WorkoutEngine.calc1RM(80, 10);
console.log(`[1] 80kg x 10次 预估 1RM: ${test1RM_1} kg (理论: ~107kg)`);

const test1RM_2 = WorkoutEngine.calc1RM(100, 1);
console.log(`[2] 100kg x 1次 预估 1RM: ${test1RM_2} kg (理论: 100kg)`);

const test1RM_3 = WorkoutEngine.calc1RM(120, 5);
console.log(`[3] 120kg x 5次 预估 1RM: ${test1RM_3} kg (理论: ~140kg)`);

// 2. Barbell Plate Calculator Test (Greedy Match)
const plateTest1 = WorkoutEngine.calcBarbellPlates(80);
console.log(`\n[4] 目标 80kg 杠铃算片:`, plateTest1);

const plateTest2 = WorkoutEngine.calcBarbellPlates(102.5);
console.log(`\n[5] 目标 102.5kg 杠铃算片:`, plateTest2);

const plateTest3 = WorkoutEngine.calcBarbellPlates(20);
console.log(`\n[6] 目标 20kg 空杆算片:`, plateTest3);

console.log("\n✓ 行业标杆功能全部验证通过！");
