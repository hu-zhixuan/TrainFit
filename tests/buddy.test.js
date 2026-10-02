// 小人：连续记录天数、配饰、表情；v6.0 的 Q 版江叙 / 夏柚（chibi.js）、两个人的台词（cast.js）
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

const { HealthGauge } = require('../web/js/app/gauge.js');
const Chibi = require('../web/js/app/chibi.js');
const Cast = require('../web/js/app/cast.js');
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

test('表情跟着健康度：没记发呆、夜里犯困、不健康冒汗、非常健康眼睛冒星星', () => {
  const g = (d) => HealthGauge.evaluate(Object.assign({ budget: 2000, targetProteinG: 144, hour: 22 }, d));
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 11, 144).mood, 'idle');
  assert.strictEqual(Buddy.moodOf(g({ intake: 0, protein: 0, fat: 0 }), 23, 144).mood, 'sleepy');
  assert.strictEqual(Buddy.moodOf(g({ intake: 3000, protein: 40, fat: 150 }), 22, 104).mood, 'bad');
  const great = Buddy.moodOf(g({ intake: 1900, protein: 140, fat: 65 }), 22, 4);
  assert.strictEqual(great.mood, 'great');
  assert.ok(Buddy.MOODS.includes(great.mood));
  // 心情对上表情：非常健康眼睛冒星星、犯困闭眼打 Z、不健康冒汗
  assert.ok(Buddy.svg({ char: 'jx', mood: 'great' }).includes('ch-fx-sparkle'));
  assert.ok(Buddy.svg({ char: 'xy', mood: 'sleepy' }).includes('ch-fx-zzz'));
  assert.ok(Buddy.svg({ char: 'xy', mood: 'bad' }).includes('#8fd0ff'));
});

test('健康档的话不自相矛盾；蛋白差得多就说还差几克', () => {
  const g = HealthGauge.evaluate({ budget: 2000, targetProteinG: 144, hour: 21.5, intake: 1464, protein: 91, fat: 58 });
  const m = Buddy.moodOf(g, 21.5, 53);
  assert.strictEqual(m.mood, 'good');
  assert.ok(!/太少了/.test(m.say), m.say);
  const low = HealthGauge.evaluate({ budget: 2000, targetProteinG: 144, hour: 22, intake: 1900, protein: 50, fat: 65 });
  assert.match(Buddy.moodOf(low, 22, 94).say, /蛋白质还差 94g/);
});

test('设置里没选过就是默认样子，选过的保留；以前的男生 / 女生换成江叙 / 夏柚', () => {
  const def = { show: true, outfit: 'varsity', build: 'auto', char: 'xy' };
  assert.deepStrictEqual(Buddy.look(undefined), def);
  assert.deepStrictEqual(Buddy.look({ outfit: 'tank', show: false }), Object.assign({}, def, { outfit: 'tank', show: false }));
  // 以前存过、现在没有的样子回到默认
  assert.deepStrictEqual(Buddy.look({ outfit: 'jersey', build: 'huge' }), def);
  assert.strictEqual(Buddy.look({ char: 'boy', style: 'messy', hair: 'black' }).char, 'jx');
  assert.strictEqual(Buddy.look({ char: 'girl' }).char, 'xy');
  // 没选过：女生默认江叙，男生默认夏柚；选过就用选的
  assert.strictEqual(Buddy.look(undefined, 'female').char, 'jx');
  assert.strictEqual(Buddy.look({ char: 'xy' }, 'female').char, 'xy');
});

test('Q 版：两个人 × 每个姿势 × 衣服 × 身材 × 表情都画得出来，部件分组好让 CSS 动', () => {
  for (const char of Object.keys(Chibi.CHARS)) for (const pose of Buddy.POSES) for (const outfit of Object.keys(Buddy.OUTFITS)) for (const build of Buddy.BUILD_ORDER) {
    const svg = Buddy.svg({ char, pose, outfit, build, mood: 'ok', gear: ['band'] });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${char} ${pose} ${outfit}`);
    assert.ok(!/NaN|undefined|null/.test(svg), `${char} ${pose} ${outfit} ${build}`);
    for (const k of ['ch-head', 'ch-eyes', 'ch-ahoge', 'pose-' + pose]) assert.ok(svg.includes(k), `${char} ${pose}: ${k}`);
    if (pose !== 'lie') for (const k of ['ch-body', 'ch-legs', 'ch-arm-l', 'ch-arm-r']) assert.ok(svg.includes(k), `${char} ${pose}: ${k}`);
  }
  for (const char of Object.keys(Chibi.CHARS)) for (const face of Object.keys(Chibi.FACES)) {
    assert.ok(!/NaN|undefined/.test(Buddy.svg({ char, face, pose: 'lie' })), char + face);
  }
  // 夏柚有马尾，江叙没有；以前存的 boy / girl 也画得出来
  assert.ok(Buddy.svg({ char: 'xy' }).includes('ch-tail'));
  assert.ok(!Buddy.svg({ char: 'jx' }).includes('ch-tail'));
  assert.ok(Buddy.svg({ char: 'girl' }).includes('ch-tail'));
  // 招手那只胳膊单独一组；站着比趴着高
  assert.ok(Buddy.svg({ char: 'jx', pose: 'wave' }).includes('ch-wave'));
  const h = (svg) => +/height="(\d+)"/.exec(svg)[1];
  assert.ok(h(Buddy.svg({ char: 'jx', pose: 'stand', w: 80 })) > h(Buddy.svg({ char: 'jx', pose: 'lie', w: 80 })));
  // 装备：皇冠
  assert.ok(Buddy.svg({ char: 'xy', gear: ['crown'] }).includes('#ffcf45'));
});

test('身材：光膀子看得出普通 < 薄肌 < 腹肌，穿棒球服看不出；秀肌肉时露着的胳膊鼓起来；腹肌男肩膀宽', () => {
  const lines = (o) => (Buddy.svg(Object.assign({ char: 'jx', pose: 'stand' }, o)).match(/stroke="#f3cdb8"/g) || []).length;
  const n = lines({ outfit: 'bare', build: 'normal' }), lean = lines({ outfit: 'bare', build: 'lean' }), rip = lines({ outfit: 'bare', build: 'ripped' });
  assert.ok(n <= lean && lean <= rip && n < rip, [n, lean, rip].join());
  assert.strictEqual(lines({ outfit: 'varsity', build: 'ripped' }), lines({ outfit: 'varsity', build: 'normal' }));
  const circles = (o) => (Buddy.svg(Object.assign({ char: 'jx', pose: 'flex' }, o)).match(/<circle/g) || []).length;
  assert.ok(circles({ outfit: 'bare', build: 'ripped' }) > circles({ outfit: 'varsity', build: 'ripped' }), '秀肌肉鼓一块');
  const shoulder = (b) => +/M(\d+(?:\.\d+)?) 137 Q/.exec(Buddy.svg({ char: 'jx', pose: 'stand', outfit: 'bare', build: b }))[1];
  assert.ok(shoulder('ripped') < shoulder('normal'));
});

test('没说重量时的几个选项：估的那个，轻一档、重一档，整 2.5 / 5 公斤', () => {
  assert.deepStrictEqual(Buddy.liftOpts(30), [20, 30, 40]);
  assert.deepStrictEqual(Buddy.liftOpts(40), [25, 40, 55]);
  assert.deepStrictEqual(Buddy.liftOpts(10), [7.5, 10, 12.5]);
  assert.deepStrictEqual(Buddy.liftOpts(2.5), [2.5, 5]);
});

test('「跟着我练」：最近 4 周练 4 天薄肌，10 天腹肌', () => {
  assert.strictEqual(Buddy.buildFor(0), 'normal');
  assert.strictEqual(Buddy.buildFor(4), 'lean');
  assert.strictEqual(Buddy.buildFor(9), 'lean');
  assert.strictEqual(Buddy.buildFor(10), 'ripped');
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
  // 每一级都有解锁的衣服（第 2～5 级），两个人每一级都有回忆和说的话
  for (let lv = 2; lv <= 5; lv++) assert.ok(Object.values(Buddy.OUTFITS).some(o => o.lv === lv), 'Lv' + lv);
  for (const k of Object.keys(Cast)) {
    const c = Cast[k];
    for (const f of ['story', 'pat', 'levelUp', 'tone']) assert.strictEqual(c[f].length, Bond.LEVELS.length, k + ' ' + f);
    assert.ok(c.story.every(x => x[0] && x[1].length > 20), k + ' 回忆');
    for (const f of ['morning', 'noon', 'afternoon', 'evening', 'night', 'cold', 'hot']) assert.ok(c.life[f] && c.life[f].length, k + ' life ' + f);
    for (const f of ['wait', 'afraid', 'secret']) assert.ok(c.whisper[f], k + ' whisper ' + f);
    assert.ok(c.rare.some(x => x.includes('{n}')));
    for (const f of ['name', 'who', 'speech', 'blurb', 'intro', 'secret', 'late', 'pick']) assert.ok(c[f], k + ' ' + f);
    // 底线：不说让人内疚的话（「你不来我会难过」）
    assert.ok(!/不来.{0,4}(难过|伤心)|想你想|等你等|你怎么不/.test(JSON.stringify(c)), k);
  }
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
  assert.ok(Buddy.svg({ char: 'jx', mood: 'ok', gear: ['party'] }).includes('#ff8fb1'), '生日派对帽');
});
