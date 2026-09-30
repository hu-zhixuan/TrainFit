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

test('装备：3 天头带，7 天棒球帽，30 天皇冠（只戴最好的那一样）', () => {
  assert.deepStrictEqual(Buddy.gearFor(2), []);
  assert.deepStrictEqual(Buddy.gearFor(3), ['band']);
  assert.deepStrictEqual(Buddy.gearFor(7), ['cap']);
  assert.deepStrictEqual(Buddy.gearFor(45), ['crown']);
  assert.deepStrictEqual(Buddy.nextGear(5), { name: '棒球帽', days: 2 });
  assert.strictEqual(Buddy.nextGear(30), null);
});

test('表情跟着健康度：没记发呆、夜里犯困、不健康冒汗、非常健康戴墨镜', () => {
  const g = (d) => HealthGauge.evaluate(Object.assign({ budget: 2000, targetProteinG: 144, hour: 22 }, d));
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 11, 144).mood, 'idle');
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 23, 144).mood, 'sleepy');
  assert.strictEqual(Buddy.moodOf(g({ intake: 3000, protein: 40, fat: 150 }), 22, 104).mood, 'bad');
  const great = Buddy.moodOf(g({ intake: 1900, protein: 140, fat: 65 }), 22, 4);
  assert.strictEqual(great.mood, 'great');
  assert.strictEqual(Buddy.MOODS[great.mood].eyes, 'shades');
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
  const img = Buddy.compose({ mood: 'great', gear: ['crown'], hair: 'brown', outfit: 'navy' });
  assert.strictEqual(img.px.length, Buddy.H);
  assert.ok(img.px.every(r => r.length === Buddy.W));
  const flat = img.px.map(r => r.join('')).join('');
  assert.ok(flat.includes('O') && flat.includes('A') && flat.includes('K'), '描边、皇冠、墨镜');
  assert.strictEqual(img.colors.H, Buddy.HAIR.brown.H);
  assert.strictEqual(img.colors.J, Buddy.OUTFITS.navy.J);
  // 最底下一行是胳膊（直接搭在输入栏的边上，下面不留空）
  assert.ok(img.px[Buddy.H - 1].filter(c => c === 'w').length >= 20);
  // 棒球帽把头顶翘起的头发压住
  const cap = Buddy.compose({ mood: 'ok', gear: ['cap'] }).px.map(r => r.join(''));
  assert.ok(!cap[3].includes('H'));
  // 每个颜色代码都有颜色
  for (const c of new Set(flat.replace(/\./g, ''))) assert.ok(img.colors[c], c);
  // SVG：两帧头发、两帧招手、睁眼时的眨眼和左右看、特效单独一层
  const svg = Buddy.svg({ mood: 'good', gear: [] });
  for (const k of ['bd-fa', 'bd-fb', 'bd-wa', 'bd-wb', 'bd-blink', 'bd-lookl', 'bd-lookr', 'bd-fx-note']) assert.ok(svg.includes(k), k);
  assert.ok(!Buddy.svg({ mood: 'sleepy', gear: [] }).includes('bd-blink'));
  assert.ok(!Buddy.svg({ mood: 'great', gear: [] }).includes('bd-blink'));   // 戴墨镜不眨眼
});

test('设置里没选过就是默认样子，选过的保留', () => {
  assert.deepStrictEqual(Buddy.look(undefined), { show: true, hair: 'black', outfit: 'varsity', char: 'boy' });
  assert.deepStrictEqual(Buddy.look({ hair: 'blond', show: false }), { show: false, hair: 'blond', outfit: 'varsity', char: 'boy' });
  // 以前存过、现在没有的样子回到默认
  assert.deepStrictEqual(Buddy.look({ outfit: 'jersey' }), { show: true, hair: 'black', outfit: 'varsity', char: 'boy' });
  // 没选过角色：跟着性别；选过就用选的
  assert.strictEqual(Buddy.look(undefined, 'female').char, 'girl');
  assert.strictEqual(Buddy.look({ char: 'boy' }, 'female').char, 'boy');
});

test('女生：长头发搭在胳膊上，眼角有眼线；招手的手伸出头发外面', () => {
  const g = Buddy.compose({ char: 'girl', mood: 'ok', gear: [] }).px.map(r => r.join(''));
  const W = Buddy.W;
  assert.strictEqual(g.length, Buddy.H);
  assert.ok(g.every(r => r.length === W));
  assert.ok(g[3 + 14].includes('H'), '头发搭在胳膊那一行');
  const boy = Buddy.compose({ char: 'boy', mood: 'ok', gear: [], wave: 1 }).px.map(r => r.join(''));
  assert.ok(boy[3 + 7].slice(3 + 22, 3 + 24) === 'SS', '手在头发外面');
  // 每个角色、每种心情都拼得出来
  for (const char of Object.keys(Buddy.CHARS)) for (const mood of Object.keys(Buddy.MOODS)) {
    assert.ok(Buddy.svg({ char, mood, gear: ['cap'] }).startsWith('<svg'));
  }
});
