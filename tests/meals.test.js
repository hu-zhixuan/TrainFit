// v8.0 饮食分顿：原话说了的照原话；没说的按吃的时间、你自己的作息、这顿多大、吃的是不是零嘴
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

require('../web/js/log/helpers.js');
const Meals = require('../web/js/log/meals.js');

const D = '2026-10-05';
let n = 0;
function rec(hm, name, kcal, extra) {
  const [h, m] = hm.split(':').map(Number);
  const ts = new Date(`${D}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  n += 1;
  return Object.assign({ id: 'd' + n, ts, date: D, mealType: '加餐/补剂', foodSummary: name, calories: kcal, items: [{ name, calories: kcal }] }, extra || {});
}
const groupOf = (list, opts) => { const c = Meals.classify(list, opts); return list.map(r => Meals.groupName(Meals.groupKey(c[r.id]))); };

test('早上的咖啡算进早饭；午饭后的苹果是下午加餐；晚饭后的泡面是夜宵', () => {
  assert.deepStrictEqual(groupOf([rec('7:20', '美式咖啡', 10), rec('8:40', '肉包', 460)]), ['早餐', '早餐']);
  const a = [rec('12:30', '牛肉面', 620), rec('15:30', '苹果', 80)];
  const c = Meals.classify(a);
  assert.strictEqual(c[a[0].id].group, '午餐');
  assert.strictEqual(c[a[1].id].group, '加餐');
  assert.strictEqual(c[a[1].id].label, '下午');
  assert.deepStrictEqual(groupOf([rec('19:00', '番茄炒蛋盖饭', 650), rec('22:30', '泡面', 480)]), ['晚餐', '夜宵']);
});

test('吃得晚的正餐还是正餐：15:40 才吃的午饭、21:40 才吃的晚饭', () => {
  assert.deepStrictEqual(groupOf([rec('7:50', '豆浆油条', 420), rec('15:40', '鸡腿饭', 700)]), ['早餐', '午餐']);
  assert.deepStrictEqual(groupOf([rec('12:20', '牛肉面', 600), rec('21:40', '扬州炒饭', 650)]), ['午餐', '晚餐']);
});

test('午饭前的拿铁是上午加餐，不抢午饭；一碗沙拉的午饭也是午饭', () => {
  const a = [rec('11:00', '拿铁', 150), rec('12:40', '黄焖鸡米饭', 680)];
  const c = Meals.classify(a);
  assert.strictEqual(c[a[0].id].group, '加餐');
  assert.strictEqual(c[a[0].id].label, '上午');
  assert.strictEqual(c[a[1].id].group, '午餐');
  assert.deepStrictEqual(groupOf([rec('12:30', '鸡胸肉沙拉', 260)]), ['午餐']);
  assert.deepStrictEqual(groupOf([rec('14:30', '酸奶', 120)]), ['加餐'], '下午两点半的一杯酸奶不当午饭');
});

test('饭后马上喝的咖啡算进那顿；几分钟内记的几样是同一顿', () => {
  assert.deepStrictEqual(groupOf([rec('12:10', '牛肉面', 600), rec('12:40', '拿铁', 150)]), ['午餐', '午餐']);
  assert.deepStrictEqual(groupOf([rec('18:50', '米饭', 230), rec('19:05', '可乐', 140)]), ['晚餐', '晚餐']);
});

test('早午饭：10:30 一顿、13:00 又一顿，头一顿算早餐', () => {
  assert.deepStrictEqual(groupOf([rec('10:30', '鸡蛋三明治套餐', 560), rec('13:10', '麻辣香锅', 820)]), ['早餐', '午餐']);
  assert.deepStrictEqual(groupOf([rec('10:05', '煎饺', 520)]), ['早餐'], '起得晚，十点吃的第一顿是早饭');
  assert.deepStrictEqual(groupOf([rec('7:30', '包子', 400), rec('11:15', '牛肉面', 600)]), ['早餐', '午餐'], '吃过早饭了，十一点多那顿是午饭');
});

test('原话说了顿就照原话：晚上补记「中午吃了…」还是午餐（标成补记），下午茶是下午加餐，练完是练后', () => {
  const a = [rec('20:00', '牛肉面', 600, { mealType: '午餐', said: '中午吃了一碗牛肉面' })];
  const c = Meals.classify(a);
  assert.strictEqual(c[a[0].id].group, '午餐');
  assert.ok(c[a[0].id].late, '补记的不写成那顿的钟点');
  const b = [rec('13:00', '蛋糕', 300, { said: '下午茶吃了块蛋糕' })];
  assert.strictEqual(Meals.classify(b)[b[0].id].slot, 'pm');
  const t = [rec('16:20', '香蕉', 90, { said: '练完吃了根香蕉' })];
  assert.strictEqual(Meals.classify(t)[t[0].id].label, '练后');
});

test('只有补剂的是补剂；改过顿的照改的；补记前几天的照存的', () => {
  const s = [rec('8:00', '维生素D', 0, { items: [{ name: '维生素D', supp: true, calories: 0 }] })];
  assert.strictEqual(Meals.classify(s)[s[0].id].group, '补剂');
  const f = [rec('15:00', '牛肉面', 600, { mealType: '晚餐', mealFixed: true })];
  assert.strictEqual(Meals.classify(f)[f[0].id].group, '晚餐');
  const y = [rec('9:00', '火锅', 1200, { date: '2026-10-04', mealType: '晚餐' })]; // 今天早上补记昨晚的
  assert.strictEqual(Meals.classify(y)[y[0].id].group, '晚餐');
});

test('按你自己的作息：两点吃午饭、八点半吃晚饭的人，五点的酸奶是加餐、八点半那顿是晚饭', () => {
  const hist = [];
  for (let i = 1; i <= 6; i++) {
    const d = `2026-09-${String(28 + Math.min(i, 2)).padStart(2, '0')}`;
    const day = i <= 2 ? d : `2026-10-0${i - 2}`;
    hist.push({ id: 'h' + i + 'a', date: day, ts: new Date(`${day}T14:05:00`).getTime(), mealType: '午餐', foodSummary: '盖饭', calories: 650, items: [{ name: '盖饭' }] });
    hist.push({ id: 'h' + i + 'b', date: day, ts: new Date(`${day}T20:35:00`).getTime(), mealType: '晚餐', foodSummary: '炒面', calories: 600, items: [{ name: '炒面' }] });
  }
  const rh = Meals.rhythm(hist, D);
  assert.ok(rh.午餐 >= 840 && rh.午餐 <= 850, `午饭钟点 ${rh.午餐}`);
  assert.ok(rh.晚餐 >= 1230 && rh.晚餐 <= 1240, `晚饭钟点 ${rh.晚餐}`);
  const a = [rec('13:55', '牛肉盖饭', 650), rec('17:00', '酸奶', 140), rec('20:30', '炒河粉', 620)];
  assert.deepStrictEqual(groupOf(a, { rhythm: rh }), ['午餐', '加餐', '晚餐']);
  // 默认作息下 11 点前后吃饭的人不受影响
  assert.deepStrictEqual(Meals.rhythm([], D), Meals.DEFAULT);
});

test('分组顺序按时间：早餐、上午加餐、午餐、下午加餐、晚餐、夜宵、补剂；存的 mealType 对得上', () => {
  assert.deepStrictEqual(Meals.ORDER.map(Meals.groupName), ['早餐', '加餐', '午餐', '加餐', '晚餐', '夜宵', '补剂']);
  assert.strictEqual(Meals.storedType({ group: '加餐' }), '加餐/补剂');
  assert.strictEqual(Meals.storedType({ group: '午餐' }), '午餐');
});
