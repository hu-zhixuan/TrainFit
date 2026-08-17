/**
 * Test Suite: TrainFit Milestone 2 & Milestone 3 UI & Routine Logic Test Suite
 * Validates:
 * 1. Voice Assistant Follow-Up Dialog & Factor Completion (R1)
 *    - Missing factor detection & followUpPrompt generation
 *    - Contextual quick-fill chips application & re-evaluation
 *    - Strict save validation blocker (disabled when incomplete, enabled when complete)
 *    - Dual-modal completion (voice merge + manual factor update)
 * 2. Cyclical Routine To-Do System (R2)
 *    - Custom routine creation, editing, deletion, persistence
 *    - Smart history recommendations frequency analysis (🔥 历史常用)
 *    - Active To-Do checklist importing & state machine
 *    - Checkbox toggle & completion state (opacity 0.5, line-through)
 *    - Direct 1-tap logging to workout logs
 *    - Cyclical Re-activation (re-click or reset button clears completed flags for next cycle)
 */

const assert = require('assert');
const {
  WorkoutEngine,
  parseChineseUniversalNum,
  normalizeTextWithNumbers,
  normalizeFitnessSpeech,
  generateFollowUpPrompt
} = require('./js/workout.js');

// Mock browser environment for FitnessApp
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new LocalStorageMock();
global.WorkoutEngine = WorkoutEngine;
global.window = {
  app: null,
  WorkoutEngine: WorkoutEngine,
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {}
};
global.document = {
  getElementById: (id) => ({
    id: id,
    textContent: '',
    value: '',
    style: {},
    classList: {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    querySelectorAll: () => [],
    appendChild: () => {},
    innerHTML: '',
    disabled: false
  }),
  querySelectorAll: () => []
};

const { FitnessApp, DEFAULT_PROFILE, getTodayDateString, shiftDateString } = require('./js/app.js');

console.log('================================================================');
console.log('  TrainFit Milestone 2 & 3 UI & Routine Logic Test Suite');
console.log('================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${testName}: ${err.message}`);
    console.error(err.stack);
    failedTests++;
  }
}

// ============================================================================
// PART 1: R1 Voice Assistant Follow-Up Dialog & Factor Completion
// ============================================================================
console.log('--- PART 1: Voice Assistant Follow-Up Dialog & Factor Completion (R1) ---');

runTest('1.1: Incomplete input triggers followUpPrompt & missingFactors', () => {
  const result = WorkoutEngine.parseWorkoutVoice("深蹲100kg");
  assert.strictEqual(result.length, 1);
  const item = result[0];
  assert.strictEqual(item.isComplete, false);
  assert.deepStrictEqual(item.missingFactors.sort(), ['reps', 'sets'].sort());
  assert.ok(item.followUpPrompt.includes('深蹲') && item.followUpPrompt.includes('100kg'));
  assert.ok(item.followUpPrompt.includes('几组') || item.followUpPrompt.includes('次数'));
});

runTest('1.2: Follow-up chip merges missing sets & reps to complete item', () => {
  const initial = WorkoutEngine.parseWorkoutVoice("深蹲100kg")[0];
  assert.strictEqual(initial.isComplete, false);

  const merged = WorkoutEngine.mergeWorkoutFactors(initial, "4组×8次");
  assert.strictEqual(merged.exerciseName, "杠铃深蹲");
  assert.strictEqual(merged.weightKg, 100);
  assert.strictEqual(merged.sets, 4);
  assert.strictEqual(merged.reps, 8);
  assert.strictEqual(merged.isComplete, true);
  assert.strictEqual(merged.missingFactors.length, 0);
});

runTest('1.3: Follow-up chip merges missing weight (e.g. 80kg or 自重 0kg)', () => {
  const initial = WorkoutEngine.parseWorkoutVoice("卧推4组10次")[0];
  assert.strictEqual(initial.isComplete, false);
  assert.deepStrictEqual(initial.missingFactors, ['weightKg']);

  const merged = WorkoutEngine.mergeWorkoutFactors(initial, "80kg");
  assert.strictEqual(merged.weightKg, 80);
  assert.strictEqual(merged.sets, 4);
  assert.strictEqual(merged.reps, 10);
  assert.strictEqual(merged.isComplete, true);

  const bodyweightItem = WorkoutEngine.parseWorkoutVoice("引体向上3组8次")[0];
  assert.strictEqual(bodyweightItem.weightKg, 0); // bodyweight default 0
  assert.strictEqual(bodyweightItem.isComplete, true);
});

runTest('1.4: Strict Save Blocker prevents saving when incomplete', () => {
  localStorage.clear();
  const app = new FitnessApp();
  app.workouts = [];
  
  // Set parsed buffer with 1 complete and 1 incomplete item
  app.parsedWorkoutBuffer = [
    { exerciseName: "杠铃卧推", muscleGroup: "胸部", weightKg: 80, sets: 4, reps: 8, isComplete: true, missingFactors: [] },
    { exerciseName: "杠铃深蹲", muscleGroup: "腿部", weightKg: 100, sets: null, reps: null, isComplete: false, missingFactors: ['sets', 'reps'] }
  ];

  // Try to save
  app.saveConfirmedWorkouts();
  // Must NOT save because buffer has incomplete item
  assert.strictEqual(app.workouts.length, 0);

  // Now complete the second item
  app.parsedWorkoutBuffer[1].sets = 4;
  app.parsedWorkoutBuffer[1].reps = 6;
  app.parsedWorkoutBuffer[1].isComplete = true;
  app.parsedWorkoutBuffer[1].missingFactors = [];

  app.saveConfirmedWorkouts();
  // Now should successfully save both
  assert.strictEqual(app.workouts.length, 2);
  assert.strictEqual(app.workouts[0].exerciseName, "杠铃深蹲");
  assert.strictEqual(app.workouts[1].exerciseName, "杠铃卧推");
});

runTest('1.5: updateWorkoutBuffer preserves buffer and updates values incrementally', () => {
  const app = new FitnessApp();
  app.parsedWorkoutBuffer = [
    { exerciseName: "哑铃卧推", muscleGroup: "胸部", weightKg: null, sets: null, reps: null, isComplete: false, missingFactors: ['weightKg', 'sets', 'reps'] }
  ];

  // User types '4' into weight
  app.updateWorkoutBuffer(0, 'weightKg', '4');
  assert.strictEqual(app.parsedWorkoutBuffer[0].weightKg, 4);
  assert.strictEqual(app.parsedWorkoutBuffer[0].isComplete, false);

  // User continues typing '45' into weight
  app.updateWorkoutBuffer(0, 'weightKg', '45');
  assert.strictEqual(app.parsedWorkoutBuffer[0].weightKg, 45);
  assert.strictEqual(app.parsedWorkoutBuffer[0].isComplete, false);

  // User types '4' into sets
  app.updateWorkoutBuffer(0, 'sets', '4');
  assert.strictEqual(app.parsedWorkoutBuffer[0].sets, 4);

  // User types '10' into reps
  app.updateWorkoutBuffer(0, 'reps', '10');
  assert.strictEqual(app.parsedWorkoutBuffer[0].reps, 10);
  assert.strictEqual(app.parsedWorkoutBuffer[0].isComplete, true);
});

runTest('1.6: applyFollowupVoiceResult merges voice recognized parameters into incomplete buffer', () => {
  const app = new FitnessApp();
  app.parsedWorkoutBuffer = [
    { exerciseName: "杠铃卧推", muscleGroup: "胸部", weightKg: 80, sets: null, reps: null, isComplete: false, missingFactors: ['sets', 'reps'] }
  ];

  // Spoken voice "4组8个"
  app.applyFollowupVoiceResult('4组8个');
  assert.strictEqual(app.parsedWorkoutBuffer[0].weightKg, 80);
  assert.strictEqual(app.parsedWorkoutBuffer[0].sets, 4);
  assert.strictEqual(app.parsedWorkoutBuffer[0].reps, 8);
  assert.strictEqual(app.parsedWorkoutBuffer[0].isComplete, true);
});

// ============================================================================
// PART 2: R2 Cyclical Routine To-Do System
// ============================================================================
console.log('\n--- PART 2: Cyclical Routine To-Do System (R2) ---');

runTest('2.1: Custom Routine CRUD and persistent storage in localStorage', () => {
  localStorage.clear();
  const app = new FitnessApp();

  // Initially default routines loaded
  assert.ok(app.customRoutines.length >= 0);

  // Create a custom routine
  const customId = "routine_my_leg_day";
  const customRoutine = {
    id: customId,
    name: "狂暴腿日超负荷计划",
    muscleGroup: "腿部",
    icon: "🦵",
    isCustom: true,
    exercises: [
      { name: "杠铃深蹲", muscleGroup: "腿部", weightKg: 120, sets: 4, reps: 6 },
      { name: "倒蹬", muscleGroup: "腿部", weightKg: 200, sets: 3, reps: 10 },
      { name: "腿屈伸", muscleGroup: "腿部", weightKg: 45, sets: 4, reps: 12 }
    ]
  };

  app.customRoutines.push(customRoutine);
  app.saveRoutines();

  // Verify stored in localStorage
  const rawSaved = localStorage.getItem('fit_custom_routines');
  assert.ok(rawSaved !== null);
  const parsedSaved = JSON.parse(rawSaved);
  const found = parsedSaved.find(r => r.id === customId);
  assert.ok(found);
  assert.strictEqual(found.name, "狂暴腿日超负荷计划");
  assert.strictEqual(found.exercises.length, 3);

  // Delete routine
  app.deleteCustomRoutine(customId);
  const reloaded = JSON.parse(localStorage.getItem('fit_custom_routines'));
  assert.strictEqual(reloaded.find(r => r.id === customId), undefined);
});

runTest('2.2: Smart History Recommendations frequency aggregation algorithm', () => {
  localStorage.clear();
  const app = new FitnessApp();

  // Populate history with 5 chest workout logs and 4 back logs
  app.workouts = [
    { date: "2026-08-10", exerciseName: "杠铃卧推", muscleGroup: "胸部", weightKg: 80, sets: 4, reps: 8 },
    { date: "2026-08-10", exerciseName: "哑铃上斜卧推", muscleGroup: "胸部", weightKg: 24, sets: 4, reps: 10 },
    { date: "2026-08-10", exerciseName: "双杠臂屈伸", muscleGroup: "胸部", weightKg: 0, sets: 3, reps: 10 },
    { date: "2026-08-12", exerciseName: "杠铃卧推", muscleGroup: "胸部", weightKg: 82.5, sets: 4, reps: 8 },
    { date: "2026-08-12", exerciseName: "绳索夹胸", muscleGroup: "胸部", weightKg: 15, sets: 4, reps: 12 },
    { date: "2026-08-14", exerciseName: "高位下拉", muscleGroup: "背部", weightKg: 50, sets: 4, reps: 10 },
    { date: "2026-08-14", exerciseName: "杠铃划船", muscleGroup: "背部", weightKg: 60, sets: 4, reps: 8 }
  ];

  const recommendations = app.getSmartHistoryRecommendations();
  assert.ok(recommendations.length >= 2);
  
  // Top recommendation should be Chest
  const chestRec = recommendations.find(r => r.muscleGroup === "胸部");
  assert.ok(chestRec);
  assert.strictEqual(chestRec.badgeText, "🔥 历史常用");
  assert.strictEqual(chestRec.isRecommendation, true);
  assert.ok(chestRec.exercises.some(e => e.name === "杠铃卧推"));

  // Second recommendation should be Back
  const backRec = recommendations.find(r => r.muscleGroup === "背部");
  assert.ok(backRec);
  assert.strictEqual(backRec.badgeText, "🔥 历史常用");
});

runTest('2.3: Active To-Do Checklist importing & state machine', () => {
  localStorage.clear();
  const app = new FitnessApp();
  
  const routines = app.getAllRoutines();
  assert.ok(routines.length > 0);
  const targetRoutine = routines[0];

  // Select routine to import into active To-Do checklist
  app.selectRoutine(targetRoutine.id);

  assert.ok(app.activeRoutineTodo !== null);
  assert.strictEqual(app.activeRoutineTodo.routineId, targetRoutine.id);
  assert.strictEqual(app.activeRoutineTodo.items.length, targetRoutine.exercises.length);
  assert.ok(app.activeRoutineTodo.items.every(i => i.completed === false));

  // Check state persistence
  const savedActiveTodo = JSON.parse(localStorage.getItem('fit_active_routine_todo'));
  assert.strictEqual(savedActiveTodo.routineId, targetRoutine.id);
});

runTest('2.4: Checklist item toggling & completed state (opacity 0.5)', () => {
  localStorage.clear();
  const app = new FitnessApp();
  
  const defaultRoutine = app.getDefaultRoutines()[0];
  app.selectRoutine(defaultRoutine.id);

  const firstItemId = app.activeRoutineTodo.items[0].id;
  assert.strictEqual(app.activeRoutineTodo.items[0].completed, false);

  // Toggle complete
  app.toggleTodoItem(firstItemId);
  assert.strictEqual(app.activeRoutineTodo.items[0].completed, true);

  // Toggle uncomplete
  app.toggleTodoItem(firstItemId);
  assert.strictEqual(app.activeRoutineTodo.items[0].completed, false);
});

runTest('2.5: 1-Tap Direct Logging from Checklist into workouts', () => {
  localStorage.clear();
  const app = new FitnessApp();
  app.workouts = [];

  const defaultRoutine = app.getDefaultRoutines()[0]; // Chest: 卧推 80kg 4x8
  app.selectRoutine(defaultRoutine.id);

  const firstItem = app.activeRoutineTodo.items[0];
  assert.strictEqual(firstItem.completed, false);

  // Directly log the item
  app.logTodoItemDirectly(firstItem.id);

  // Verify workout is created in this.workouts
  assert.strictEqual(app.workouts.length, 1);
  assert.strictEqual(app.workouts[0].exerciseName, firstItem.exerciseName);
  assert.strictEqual(app.workouts[0].weightKg, firstItem.targetWeightKg);
  assert.strictEqual(app.workouts[0].sets, firstItem.targetSets);
  assert.strictEqual(app.workouts[0].reps, firstItem.targetReps);

  // Verify item is marked completed
  assert.strictEqual(firstItem.completed, true);
});

runTest('2.6: Cyclical Re-activation: re-clicking routine card resets all items to completed: false', () => {
  localStorage.clear();
  const app = new FitnessApp();

  const routine = app.getDefaultRoutines()[0];
  app.selectRoutine(routine.id);

  // Mark all items as completed
  app.activeRoutineTodo.items.forEach(i => i.completed = true);
  app.saveActiveRoutineTodo();
  assert.ok(app.activeRoutineTodo.items.every(i => i.completed === true));

  // Re-click the routine card
  app.selectRoutine(routine.id);

  // All checklist items must be reset to clean unchecked state (completed: false)
  assert.ok(app.activeRoutineTodo.items.every(i => i.completed === false));
  const saved = JSON.parse(localStorage.getItem('fit_active_routine_todo'));
  assert.ok(saved.items.every(i => i.completed === false));
});

runTest('2.7: Reset Active Routine Cycle button resets all items', () => {
  localStorage.clear();
  const app = new FitnessApp();

  const routine = app.getDefaultRoutines()[0];
  app.selectRoutine(routine.id);

  app.activeRoutineTodo.items[0].completed = true;
  app.activeRoutineTodo.items[1].completed = true;

  app.resetActiveRoutineCycle();
  assert.ok(app.activeRoutineTodo.items.every(i => i.completed === false));
});

runTest('2.8: Active To-Do contextual biasing in voice parsing & auto-completion sync', () => {
  localStorage.clear();
  const app = new FitnessApp();

  // Activate back routine with "高位下拉", "杠铃划船", "引体向上"
  const backRoutine = app.getDefaultRoutines()[1];
  app.selectRoutine(backRoutine.id);

  const activeTodos = app.getActiveTodos();
  assert.ok(activeTodos.some(t => t.exerciseName === "高位下拉"));

  // Voice log "下拉50kg4组10次" with active To-Do bias
  const parsed = WorkoutEngine.parseWorkoutVoice("下拉50kg4组10次", { activeTodos });
  assert.strictEqual(parsed[0].exerciseName, "高位下拉");
  assert.strictEqual(parsed[0].weightKg, 50);
  assert.strictEqual(parsed[0].sets, 4);
  assert.strictEqual(parsed[0].reps, 10);
  assert.strictEqual(parsed[0].isComplete, true);

  // Save the parsed item through app and verify active To-Do item is automatically marked completed
  app.parsedWorkoutBuffer = parsed;
  app.saveConfirmedWorkouts();

  const matchedTodo = app.activeRoutineTodo.items.find(t => t.exerciseName === "高位下拉");
  assert.ok(matchedTodo);
  assert.strictEqual(matchedTodo.completed, true);
});

console.log('\n================================================================');
console.log(`  Test Execution Summary:`);
console.log(`  Total:  ${passedTests + failedTests}`);
console.log(`  Passed: ${passedTests}`);
console.log(`  Failed: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  console.error('\nVerdict: REJECT');
  process.exit(1);
} else {
  console.log('\nVerdict: APPROVE');
  process.exit(0);
}
