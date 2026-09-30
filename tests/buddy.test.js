// 顶栏小人：连续记录天数、配饰、表情、拼像素图
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

const { HealthGauge } = require('../web/js/app/gauge.js');
const Buddy = require('../web/js/app/buddy.js');

test('连续记录：今天记了从今天数，今天还没记从昨天数，断了就停', () => {
  const days = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-26'];
  assert.strictEqual(Buddy.streakOf(days, '2026-09-30'), 3);
  assert.strictEqual(Buddy.streakOf(days.slice(1), '2026-09-30'), 2);   // 早上还没记，不算断
  assert.strictEqual(Buddy.streakOf(['2026-09-27'], '2026-09-30'), 0);  // 前天以前的不算
  assert.strictEqual(Buddy.streakOf([], '2026-09-30'), 0);
  // 跨月
  assert.strictEqual(Buddy.streakOf(['2026-10-01', '2026-09-30', '2026-09-29'], '2026-10-01'), 3);
});

test('配饰：3 天头带，7 天加奖牌，30 天皇冠换掉头带', () => {
  assert.deepStrictEqual(Buddy.gearFor(2), []);
  assert.deepStrictEqual(Buddy.gearFor(3), ['band']);
  assert.deepStrictEqual(Buddy.gearFor(7), ['band', 'medal']);
  assert.deepStrictEqual(Buddy.gearFor(30), ['crown', 'medal']);
  assert.deepStrictEqual(Buddy.nextGear(5), { name: '奖牌', days: 2 });
  assert.strictEqual(Buddy.nextGear(30), null);
});

test('表情跟着健康度：没记发呆、夜里犯困、四档各不一样', () => {
  const g = (d) => HealthGauge.evaluate(Object.assign({ budget: 2000, targetProteinG: 144, hour: 22 }, d));
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 11, 144).mood, 'idle');
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 23, 144).mood, 'sleepy');
  assert.strictEqual(Buddy.moodOf(g({ intake: 3000, protein: 40, fat: 150 }), 22, 104).mood, 'bad');
  assert.strictEqual(Buddy.moodOf(g({ intake: 1900, protein: 140, fat: 65 }), 22, 4).mood, 'great');
});

test('健康档的话不自相矛盾；蛋白差得多就说还差几克', () => {
  const g = HealthGauge.evaluate({ budget: 2000, targetProteinG: 144, hour: 21.5, intake: 1464, protein: 91, fat: 58 });
  const m = Buddy.moodOf(g, 21.5, 53);
  assert.strictEqual(m.mood, 'good');
  assert.ok(!/太少了/.test(m.say), m.say);
  const low = HealthGauge.evaluate({ budget: 2000, targetProteinG: 144, hour: 22, intake: 1900, protein: 50, fat: 65 });
  assert.match(Buddy.moodOf(low, 22, 94).say, /蛋白质还差 94g/);
});

test('像素图：尺寸固定、描了边、换衣服换发色都能拼', () => {
  const img = Buddy.compose({ mood: 'great', gear: ['crown', 'medal'], hair: 'brown', outfit: 'jersey' });
  assert.strictEqual(img.px.length, Buddy.H);
  assert.ok(img.px.every(r => r.length === Buddy.W));
  const flat = img.px.map(r => r.join('')).join('');
  assert.ok(flat.includes('O') && flat.includes('A') && flat.includes('N'));
  assert.strictEqual(img.colors.H, Buddy.HAIR.brown.H);
  // 每个颜色代码都有颜色
  for (const c of new Set(flat.replace(/\./g, ''))) assert.ok(img.colors[c], c);
  // SVG：两帧头发 + 睁眼时的眨眼帧
  const svg = Buddy.svg({ mood: 'good', gear: [] });
  assert.ok(svg.includes('bd-fa') && svg.includes('bd-fb') && svg.includes('bd-blink'));
  assert.ok(!Buddy.svg({ mood: 'sleepy', gear: [] }).includes('bd-blink'));
});

test('设置里没选过就是默认样子，选过的保留', () => {
  assert.deepStrictEqual(Buddy.look(undefined), { show: true, hair: 'black', outfit: 'varsity' });
  assert.deepStrictEqual(Buddy.look({ hair: 'blond', show: false }), { show: false, hair: 'blond', outfit: 'varsity' });
});
