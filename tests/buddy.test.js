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
  // 最底下一行是胳膊（直接搭在输入栏的边上，下面不留空）：棒球服是白袖子
  assert.ok(img.px[Buddy.H - 1].filter(c => c === 'v').length >= 20);
  // 棒球帽把头顶翘起的头发压住
  const cap = Buddy.compose({ mood: 'ok', gear: ['cap'] }).px.map(r => r.join(''));
  assert.ok(!cap[3].includes('H'));
  // 每个颜色代码都有颜色
  for (const c of new Set(flat.replace(/\./g, ''))) assert.ok(img.colors[c], c);
  // SVG：两帧头发、两帧招手、睁眼时的眨眼和左右看、特效单独一层
  const svg = Buddy.svg({ mood: 'good', gear: [] });
  for (const k of ['bd-fa', 'bd-fb', 'bd-blink', 'bd-lookl', 'bd-lookr', 'bd-fx-note', 'pose-lie']) assert.ok(svg.includes(k), k);
  assert.ok(!Buddy.svg({ mood: 'sleepy', gear: [] }).includes('bd-blink'));
  assert.ok(!Buddy.svg({ mood: 'great', gear: [] }).includes('bd-blink'));   // 戴墨镜不眨眼
});

test('设置里没选过就是默认样子，选过的保留', () => {
  const def = { show: true, hair: 'black', outfit: 'varsity', skin: 'natural', build: 'auto', char: 'boy', style: 'messy' };
  assert.deepStrictEqual(Buddy.look(undefined), def);
  assert.deepStrictEqual(Buddy.look({ hair: 'blond', show: false }), Object.assign({}, def, { hair: 'blond', show: false }));
  // 以前存过、现在没有的样子回到默认
  assert.deepStrictEqual(Buddy.look({ outfit: 'jersey', skin: 'green', build: 'huge' }), def);
  // 换了角色，发型跟着换成那个角色默认的（男生的中分不给女生）
  assert.strictEqual(Buddy.look({ char: 'girl', style: 'part' }).style, 'long');
  assert.strictEqual(Buddy.look({ char: 'girl', style: 'pony' }).style, 'pony');
  // 没选过角色：跟着性别；选过就用选的
  assert.strictEqual(Buddy.look(undefined, 'female').char, 'girl');
  assert.strictEqual(Buddy.look({ char: 'boy' }, 'female').char, 'boy');
});

test('女生：长头发搭在胳膊上，眼角有眼线；站着招手时手举在外面', () => {
  const g = Buddy.compose({ char: 'girl', mood: 'ok', gear: [] }).px.map(r => r.join(''));
  const W = Buddy.W;
  assert.strictEqual(g.length, Buddy.H);
  assert.ok(g.every(r => r.length === W));
  assert.ok(g[3 + 14].includes('H'), '头发搭在胳膊那一行');
  const boy = Buddy.compose({ char: 'boy', mood: 'ok', gear: [], pose: 'wave' }).px.map(r => r.join(''));
  assert.ok(boy[3 + 13].slice(3 + 20, 3 + 22) === 'SS', '站着招手：手举在肩膀外面');
  // 每个角色、每种心情都拼得出来
  for (const char of Object.keys(Buddy.CHARS)) for (const mood of Object.keys(Buddy.MOODS)) {
    assert.ok(Buddy.svg({ char, mood, gear: ['cap'] }).startsWith('<svg'));
  }
});

test('站起来的几个姿势：高度一样、鞋在最底下一行，走路两帧腿不一样，伸懒腰手举过头', () => {
  for (const char of Object.keys(Buddy.CHARS)) {
    const stand = Buddy.compose({ char, pose: 'stand', mood: 'ok', gear: [] });
    assert.strictEqual(stand.h, Buddy.heightOf('stand'));
    assert.ok(stand.h > Buddy.heightOf('lie'));
    assert.ok(stand.px[stand.h - 1].filter(c => c === 'F').length >= 6, char + ' 鞋');
    const w0 = Buddy.compose({ char, pose: 'walk', frame: 0 }).px.map(r => r.join('')).join('\n');
    const w1 = Buddy.compose({ char, pose: 'walk', frame: 1 }).px.map(r => r.join('')).join('\n');
    assert.notStrictEqual(w0, w1, char + ' 走路两帧');
    const up = Buddy.compose({ char, pose: 'stretch' }).px.map(r => r.join(''));
    assert.ok(up[3].includes('S'), char + ' 伸懒腰：手在头顶那一行');
    // 眼睛、装备的位置和趴着一样
    assert.ok(Buddy.svg({ char, pose: 'stand', mood: 'great', gear: ['crown'] }).includes('pose-stand'));
  }
});

test('没说重量时的几个选项：估的那个，轻一档、重一档，整 2.5 / 5 公斤', () => {
  assert.deepStrictEqual(Buddy.liftOpts(30), [20, 30, 40]);
  assert.deepStrictEqual(Buddy.liftOpts(40), [25, 40, 55]);
  assert.deepStrictEqual(Buddy.liftOpts(10), [7.5, 10, 12.5]);
  assert.deepStrictEqual(Buddy.liftOpts(2.5), [2.5, 5]);
});

test('发型、衣服、身材、肤色：每种组合都拼得出来，颜色都有', () => {
  for (const style of Object.keys(Buddy.STYLES)) for (const outfit of Object.keys(Buddy.OUTFITS)) for (const build of Buddy.BUILD_ORDER) for (const pose of Buddy.POSES) {
    const char = Buddy.STYLES[style].char;
    const img = Buddy.compose({ char, style, outfit, build, pose, mood: 'ok', gear: ['band'], skin: 'tan', hair: 'silver' });
    assert.strictEqual(img.h, Buddy.heightOf(pose));
    assert.ok(img.px.every(r => r.length === Buddy.W));
    for (const c of new Set(img.px.flat().join('').replace(/\./g, ''))) assert.ok(img.colors[c], `${style} ${outfit} ${pose}: ${c}`);
  }
});

test('身材：光膀子时看得出普通 / 薄肌 / 腹肌，穿棒球服看不出；腹肌男胳膊粗一圈', () => {
  const body = (o) => Buddy.compose(Object.assign({ char: 'boy', pose: 'stand', mood: 'ok' }, o)).px.slice(17, 23).map(r => r.join('')).join('\n');
  const n = body({ outfit: 'bare', build: 'normal' }), lean = body({ outfit: 'bare', build: 'lean' }), rip = body({ outfit: 'bare', build: 'ripped' });
  const shade = (t) => (t.match(/s/g) || []).length;
  assert.ok(shade(n) < shade(lean) && shade(lean) < shade(rip), [shade(n), shade(lean), shade(rip)].join());
  assert.strictEqual(body({ outfit: 'varsity', build: 'lean' }), body({ outfit: 'varsity', build: 'normal' }));
  const wide = (o) => Math.max(...Buddy.compose(Object.assign({ char: 'boy', pose: 'stand', mood: 'ok' }, o)).px.slice(16, 20).map(r => r.join('').replace(/^\.*O|O\.*$/g, '').length));
  assert.ok(wide({ outfit: 'tank', build: 'ripped' }) > wide({ outfit: 'tank', build: 'normal' }));
  // 敞开的外套：中间露出肚子，两边还是外套
  const open = Buddy.compose({ char: 'boy', pose: 'stand', outfit: 'open', build: 'ripped' }).px[19].join('');
  assert.ok(open.includes('J') && open.includes('S'), open);
  // 女生光着肚子是运动内衣：胸口两行是衣服
  const girl = Buddy.compose({ char: 'girl', style: 'pony', pose: 'stand', outfit: 'bare', build: 'lean' }).px;
  assert.ok(girl[17].join('').includes('JJJ') && !girl[19].join('').includes('J'));
});

test('「跟着我练」：最近 4 周练 4 天薄肌，10 天腹肌', () => {
  assert.strictEqual(Buddy.buildFor(0), 'normal');
  assert.strictEqual(Buddy.buildFor(4), 'lean');
  assert.strictEqual(Buddy.buildFor(9), 'lean');
  assert.strictEqual(Buddy.buildFor(10), 'ripped');
});

test('秀肌肉：两只拳头举在脸两边', () => {
  const f = Buddy.compose({ char: 'boy', pose: 'flex', mood: 'ok' }).px.map(r => r.join(''));
  const fists = f[12].replace(/[^S]/g, '').length;
  assert.ok(fists >= 6, f[12]);
  assert.ok(Buddy.svg({ char: 'girl', pose: 'flex', mood: 'love', gear: [] }).includes('bd-fx-heart'));
});

test('亲密度：五级，离下一级还差多少，满级不再长', () => {
  const Bond = require('../web/js/app/bond.js');
  assert.deepStrictEqual([0, 59, 60, 179, 180, 450, 999, 1000, 5000].map(x => Bond.info(x).lv), [1, 1, 2, 2, 3, 4, 4, 5, 5]);
  const b = Bond.info(200);
  assert.strictEqual(b.name, '健身搭子');
  assert.deepStrictEqual(b.next, { lv: 4, name: '老搭子', need: 250 });
  assert.ok(b.pct > 0 && b.pct < 1);
  assert.strictEqual(Bond.info(1200).next, null);
  assert.strictEqual(Bond.info(1200).pct, 1);
  // 每一级都有解锁的衣服（第 2～5 级），说的话也都有
  for (let lv = 2; lv <= 5; lv++) assert.ok(Object.values(Buddy.OUTFITS).some(o => o.lv === lv), 'Lv' + lv);
  assert.strictEqual(Bond.PAT_LINES.length, Bond.LEVELS.length);
  assert.strictEqual(Bond.LEVEL_UP.length, Bond.LEVELS.length);
});

test('节日：公历每年一样，农历按年份；生日写法都认得', () => {
  const Bond = require('../web/js/app/bond.js');
  assert.strictEqual(Bond.festivalOf('2026-09-25').key, 'midautumn');
  assert.strictEqual(Bond.festivalOf('2027-02-06').key, 'spring');
  assert.strictEqual(Bond.festivalOf('2028-05-28').key, 'dragon');
  assert.strictEqual(Bond.festivalOf('2031-02-14').key, 'valentine');
  assert.ok(Bond.festivalOf('2026-12-31').text.includes('{days}'));
  assert.strictEqual(Bond.festivalOf('2026-10-02'), null);
  // 农历表里每年都有、日期格式对
  for (const k of Object.keys(Bond.LUNAR)) assert.ok(Bond.LUNAR[k].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), k);
  assert.deepStrictEqual(['3月14日', '3.14', '0314', '03-14', ' 3 月 14 ', '12/1'].map(Bond.parseBirthday), ['03-14', '03-14', '03-14', '03-14', '03-14', '12-01']);
  assert.deepStrictEqual(['13.1', '2月30日', '明天', ''].map(Bond.parseBirthday), ['', '', '', '']);
});

test('装备按拿到过的最长连续天数：断了也留着，下一个按现在连着几天算', () => {
  const days = (from, n) => Array.from({ length: n }, (_, i) => { const d = new Date(from + 'T12:00:00'); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const dates = days('2026-08-01', 9).concat(days('2026-09-28', 2));
  assert.strictEqual(Buddy.bestStreak(dates), 9);
  assert.strictEqual(Buddy.bestStreak([]), 0);
  assert.deepStrictEqual(Buddy.gearFor(Buddy.bestStreak(dates)), ['cap']);
  assert.deepStrictEqual(Buddy.nextGear(9, 2), { name: '皇冠', days: 28 });
  assert.ok(Buddy.compose({ mood: 'ok', gear: ['party'] }).px.flat().includes('I'), '生日派对帽');
});
