// v7.0 Galgame：一开口就知道是谁（人设 + 常说的话本机接）、剧场把回忆拆成一屏一句、剧情按章
// 运行：npm test
const test = require('node:test');
const assert = require('node:assert');

require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const Talk = require('../web/js/log/talk.js');
const Cast = require('../web/js/app/cast.js');
const Theater = require('../web/js/app/theater.js');
require('../web/js/app/bond.js');
const Story = require('../web/js/app/story.js');

test('常说的话认得出：早安晚安、在吗、谢谢、想你、喜欢你、抱抱、哈哈、好累；说正事、说长了的不认', () => {
  const cases = {
    '晚安': 'night', '晚安啦～': 'night', '我睡了': 'night', '早': 'morning', '早上好！': 'morning', '我回来了': 'back',
    '在吗': 'hi', '在吗？': 'hi', '哈喽': 'hi', '谢谢你': 'thanks', '你真好': 'praise', '想你了': 'miss', '我喜欢你': 'love',
    '抱抱': 'hug', '笨蛋': 'tease', '哈哈哈哈': 'laugh', '你在干嘛': 'doing', '你吃了吗': 'ate', '你是谁': 'who',
    '你几岁': 'age', '好无聊': 'bored', '好累啊': 'tired', '累死了': 'tired'
  };
  for (const [t, k] of Object.entries(cases)) assert.strictEqual(Talk.intent(t), k, t);
  for (const t of ['早饭吃了两个鸡蛋', '晚安前吃了个苹果', '我想你帮我排个计划', '谢谢，明天练什么', '在吗，我今天吃超了怎么办', '跑了5公里好累', '']) {
    assert.strictEqual(Talk.intent(t), '', t);
  }
});

test('两个人都有自己的台词：每种常说的话都有，喜欢你 / 想你按章节；恋人线另有', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    for (const [key] of Talk.INTENTS) assert.ok(c.talk[key] && c.talk[key].length, `${k} 缺 talk.${key}`);
    assert.strictEqual(c.talk.miss.length, 5);
    assert.strictEqual(c.talk.love.length, 5);
    assert.ok(c.talk.loveRomance.length && c.talk.loveFriend.length);
    assert.ok(c.quirks && c.never && c.samples.length >= 3, `${k} 人设要有口头禅、绝不说的、示范`);
    assert.strictEqual(c.chapters.length, 5);
    assert.strictEqual(c.chapterBg.length, 5);
    // 台词里不能有很 AI 的话
    const all = JSON.stringify(c.talk);
    assert.ok(!/作为AI|我理解你的感受|希望对你有帮助|建议你/.test(all), `${k} 台词里有 AI 腔`);
  }
  // 一开口就分得出：江叙从不用感叹号、波浪号，常「……」；夏柚一大半带「！」「～」
  const lines = (k) => Object.values(Cast[k].talk).flat(2).filter(x => typeof x === 'string');
  assert.ok(lines('jx').every(x => !/[！!～~]/.test(x)), '江叙不用感叹号和波浪号');
  assert.ok(lines('jx').filter(x => x.includes('……')).length >= lines('jx').length / 3);
  assert.ok(lines('xy').filter(x => /[！～]/.test(x)).length >= lines('xy').length / 2);
});

test('挑台词：按章节挑想你、恋人说喜欢你另有、刚说过的不重复、名字替进去', () => {
  const talk = { hi: ['在。', '嗯？'], miss: [['a1'], ['a2'], ['a3'], ['a4'], ['a5']], love: [['l1'], ['l2'], ['l3'], ['l4'], ['l5']], loveRomance: ['我也是'], loveFriend: ['搭子'], back: ['{name}回来了'] };
  assert.strictEqual(Talk.line(talk, 'miss', { lv: 3 }), 'a3');
  assert.strictEqual(Talk.line(talk, 'miss', { lv: 9 }), 'a5');
  assert.strictEqual(Talk.line(talk, 'love', { lv: 2, romance: true }), '我也是');
  assert.strictEqual(Talk.line(talk, 'love', { lv: 2, romance: false }), '搭子');
  assert.strictEqual(Talk.line(talk, 'love', { lv: 2 }), 'l2');
  assert.strictEqual(Talk.line(talk, 'hi', { used: ['在。'], roll: 0 }), '嗯？');
  assert.strictEqual(Talk.line(talk, 'back', { name: '阿程' }), '阿程回来了');
  assert.strictEqual(Talk.line(talk, 'back', {}), '回来了');
  assert.strictEqual(Talk.line(talk, 'nope', {}), '');
});

test('剧场：一段回忆拆成一屏一句，短的并在一起，不丢字', () => {
  for (const k of ['jx', 'xy']) {
    Cast[k].story.forEach(([, text]) => {
      const lines = Theater.splitLines(text);
      assert.ok(lines.length >= 1 && lines.every(l => l.length <= 40), `${k}: ${lines}`);
      assert.strictEqual(lines.join(''), text.replace(/\s+/g, ''), '拆完拼回去和原文一样');
    });
  }
  assert.deepStrictEqual(Theater.splitLines('嗯。好。今天泳池没人，我一个人游了两千米。'), ['嗯。好。今天泳池没人，我一个人游了两千米。'], '太短的并进下一句');
  assert.deepStrictEqual(Theater.splitLines('高二那年肩膀受伤，没进省队，一年没下水。后来是一点点练回来的。所以见不得你饿着硬撑。'),
    ['高二那年肩膀受伤，没进省队，一年没下水。', '后来是一点点练回来的。所以见不得你饿着硬撑。']);
  // 每段小剧情都有背景、有解锁提示
  Story.EVENTS.forEach(e => {
    assert.ok(Theater.SCENE_BG[e.id] || e.id === 'secret', `${e.id} 没有背景`);
    assert.ok(Story.HINTS[e.id], `${e.id} 没有解锁提示`);
  });
});

test('聊天的提示词带上人设：口头禅、绝不说的话、几句示范，还有「你不是 AI 助手」', () => {
  const c = Cast.jx;
  const m = TF.Parser.chatMessages('今天好累', {
    now: new Date(2026, 9, 5, 21, 0), day: { goal: 'fat_loss', budget: 1955, intake: 1200, protein: 80, proteinTarget: 144 },
    buddy: { name: c.name, who: c.who, speech: c.speech, quirks: c.quirks, never: c.never, samples: c.samples, level: '健身搭子', lv: 3 }
  });
  const sys = m[0].content;
  assert.ok(sys.includes(c.quirks) && sys.includes('你从来不' + c.never), sys);
  assert.ok(sys.includes(`他「${c.samples[0][0]}」→ 你「${c.samples[0][1]}」`));
  assert.ok(sys.includes('不是 AI 助手') && sys.includes('作为AI'));
  // 没给人设的（老数据）不出空行
  const m2 = TF.Parser.chatMessages('嗯', { buddy: { name: '阿肌', lv: 1 } });
  assert.ok(!m2[0].content.includes('你的习惯：') && !m2[0].content.includes('你从来不。'));
});
