// 今天页的健康度温度计：蛋白质 + 脂肪 + 热量赤字 → 不健康 / 还行 / 健康 / 非常健康
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

const { HealthGauge } = require('../web/js/app/gauge.js');
const B = { budget: 2000, targetProteinG: 144 };
const lvl = (d) => HealthGauge.evaluate(Object.assign({}, B, d)).name;

test('四档：吃得均衡是非常健康，暴食是不健康', () => {
  assert.strictEqual(lvl({ intake: 1900, protein: 140, fat: 65, hour: 22 }), '非常健康');
  assert.strictEqual(lvl({ intake: 2300, protein: 170, fat: 75, hour: 22 }), '健康');       // 超预算 15%
  assert.strictEqual(lvl({ intake: 2500, protein: 180, fat: 80, hour: 22 }), '还行');       // 超预算 25%
  assert.strictEqual(lvl({ intake: 3000, protein: 40, fat: 150, hour: 22 }), '不健康');
});

test('蛋白质按吃了多少饭来算：早饭吃得少不算蛋白质不够', () => {
  assert.strictEqual(lvl({ intake: 500, protein: 38, fat: 18, hour: 9 }), '非常健康');
  const low = HealthGauge.evaluate(Object.assign({}, B, { intake: 500, protein: 8, fat: 20, hour: 9 }));
  assert.ok(low.parts.protein < 0.3);
  assert.ok(low.level <= 1);
});

test('吃太少：一天没过完不判，晚上才判', () => {
  assert.strictEqual(lvl({ intake: 1000, protein: 80, fat: 35, hour: 12 }), '非常健康');
  assert.strictEqual(lvl({ intake: 1000, protein: 80, fat: 35, hour: 22 }), '不健康');
  assert.strictEqual(lvl({ intake: 1000, protein: 80, fat: 35, hour: null }), '不健康');   // 以前的日子
  const g = HealthGauge.evaluate(Object.assign({}, B, { intake: 1000, protein: 80, fat: 35, hour: 22 }));
  assert.strictEqual(g.detail.energyIssue, 'under');
  const o = HealthGauge.evaluate(Object.assign({}, B, { intake: 3000, protein: 200, fat: 90, hour: 22 }));
  assert.strictEqual(o.detail.energyIssue, 'over');
});

test('脂肪占热量 20–35% 最好，太高扣分', () => {
  const ok = HealthGauge.evaluate(Object.assign({}, B, { intake: 1900, protein: 140, fat: 60, hour: 22 }));
  const high = HealthGauge.evaluate(Object.assign({}, B, { intake: 1900, protein: 140, fat: 95, hour: 22 })); // 45%
  assert.strictEqual(ok.parts.fat, 1);
  assert.ok(high.parts.fat < 0.3);
  assert.ok(high.score < ok.score);
  // 没有脂肪数据：这一项不算
  assert.strictEqual(HealthGauge.evaluate(Object.assign({}, B, { intake: 1900, protein: 140, fat: 0, hour: 22 })).parts.fat, null);
});

test('没吃东西 / 只喝了杯咖啡：不判断', () => {
  assert.strictEqual(HealthGauge.evaluate(Object.assign({}, B, { intake: 0 })).hasData, false);
  assert.strictEqual(HealthGauge.evaluate(Object.assign({}, B, { intake: 40, protein: 1, fat: 1 })).hasData, false);
});

test('水银高度：四档各占四分之一，档线正好在刻度上', () => {
  assert.strictEqual(HealthGauge.position(0), 0);
  assert.strictEqual(HealthGauge.position(40), 0.25);
  assert.strictEqual(HealthGauge.position(65), 0.5);
  assert.strictEqual(HealthGauge.position(85), 0.75);
  assert.strictEqual(HealthGauge.position(100), 1);
});

test('补剂：补到的营养素加分（最多 8 分），超过每天上限扣分', () => {
  const day = { intake: 1900, protein: 100, fat: 65, hour: 22 };
  const base = HealthGauge.evaluate(Object.assign({}, B, day)).score;
  const fish = HealthGauge.evaluate(Object.assign({}, B, day, { supps: ['鱼油'], nutrients: { 'EPA+DHA': 600 } }));
  assert.strictEqual(fish.score, base + 3);
  const many = HealthGauge.evaluate(Object.assign({}, B, day, { supps: ['复合维生素'], nutrients: { '维生素C': 100, '维生素D': 10, '钙': 200, '镁': 100, '锌': 10 } }));
  assert.strictEqual(many.detail.bonus, 8);
  const zinc = HealthGauge.evaluate(Object.assign({}, B, day, { supps: ['锌'], nutrients: { '锌': 60 } }));
  assert.ok(zinc.score < base);
  assert.strictEqual(zinc.detail.overUl[0].name, '锌');
  assert.strictEqual(zinc.detail.bonus, 0);
  const d3 = HealthGauge.evaluate(Object.assign({}, B, day, { supps: ['维生素D'], nutrients: { '维生素D': 125 } })); // 5000IU
  assert.ok(d3.score < zinc.score);
  // 没吃补剂不扣分
  assert.strictEqual(HealthGauge.evaluate(Object.assign({}, B, day, { supps: [], nutrients: {} })).score, base);
});
