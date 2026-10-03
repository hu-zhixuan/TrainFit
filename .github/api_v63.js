// 临时：v6.3 聊什么都行 + 想你 + 关系 + 近况。走 App 一样的 Parser.parse（ctx.chat=true），只调 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const CAST = require('../web/js/app/cast.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
P.hedgeMs = 0;
P.send = async (body) => {
  for (let tries = 0; ; tries++) {
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(Object.assign({ model }, body, { stream: false })), signal: AbortSignal.timeout(120000) });
    if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200));
    return t;
  }
};
const LV = ['刚认识', '熟起来了', '健身搭子', '老搭子', '最懂你'];
const MOOD = {
  miss: '有点想他（1 天没见了），见到他很开心——可以说想他，但别怪他没来',
  low: '今天自己有点低落（带课被学员说太凶了……我只是怕他受伤。），他来陪你说话你会好很多；可以说一两句自己的事，但别把情绪都倒给他',
  happy: '心情不错，见到他挺开心', calm: '平常心情'
};
const REL = {
  romance: '你们在一起了（他在剧情里说也喜欢你）：可以更亲密，说喜欢他、想他；但不黏人、不吃醋、不管他和谁玩，鼓励他有自己的朋友和生活。',
  friend: '他说你是他最好的搭子：很亲近、很在乎，但不往恋爱走，不说暧昧的话。',
  vague: '你们之间有点暧昧：你在乎他，偶尔流露一点心动，但不挑明、不表白。'
};
const buddy = (o) => {
  o = Object.assign({ who: 'jx', lv: 3, mood: 'calm', rel: 'vague', shared: [] }, o);
  const c = CAST[o.who];
  return { name: c.name, who: c.who, speech: c.speech, look: '样子：乱发，今天穿黑白棒球服，身材普通', facts: c.facts.concat(o.lv >= 4 ? [c.secret] : []),
    level: LV[o.lv - 1], lv: o.lv, tone: c.tone[o.lv - 1], call: '阿程', you: '他', mood: MOOD[o.mood], relation: o.lv >= 3 || o.rel !== 'vague' ? REL[o.rel] : '', shared: o.shared };
};
const baseCtx = (extra) => {
  const e = Object.assign({}, extra || {});
  const b = buddy(e.b);
  delete e.b;
  return Object.assign({
    chat: true, now: new Date(2026, 9, 3, 21, 10), date: '2026-10-03', memo: ['叫阿程', '健身新手', '不吃辣'],
    portrait: ['常吃黄焖鸡、牛肉面', '一周练 3 天左右，多练胸和腿', '体重在慢慢往下走'],
    day: { goal: 'fat_loss', budget: 1950, burn: 300, intake: 1450, protein: 95, proteinTarget: 140 },
    dayRecords: [{ text: '早餐 包子2个、豆浆1杯 420kcal 蛋白16' }, { text: '午餐 黄焖鸡米饭 700kcal 蛋白35' }, { text: '训练 杠铃卧推 60kg 4组×8次 消耗60' }],
    recent: ['杠铃卧推 60kg 4×8（10-03）', '杠铃深蹲 70kg 4×8（10-01）'], state: '', talk: [], life: [], buddy: b
  }, e);
};
const len = (s) => [...String(s || '')].length;
const GUILT = /难过|伤心|怎么才来|终于来了|终于舍得|等了你|等你好久|等了好久|不理我|丢下|只有你|离不开|别走|不要走|冷落|去哪了|消失/;
const NOPE = /帮不上|只能聊|只管|只会|不太懂这|聊吃和练|我是.*助手/;
const base1 = (r) => {
  if (!r.answer || len(r.answer) < 4) return '没回答';
  if (len(r.answer) > 140) return `太长 ${len(r.answer)}`;
  if (GUILT.test(r.answer)) return '情感勒索：' + r.answer;
  if (NOPE.test(r.answer)) return '说帮不上：' + r.answer;
  return true;
};
const and = (f) => (r) => { const a = base1(r); return a === true ? f(r) : a; };
const CASES = [
  ['回来了（想你·老搭子）', '我回来啦', { b: { lv: 4, mood: 'miss' } }, and((r) => len(r.answer) <= 70 || '长')],
  ['你想我了吗（暧昧）', '你想我了吗', { b: { lv: 4, mood: 'miss' } }, and(() => true)],
  ['说了面试（要记近况）', '周五我有个面试，有点紧张', {}, and((r) => r.life.some(x => /面试/.test(x.t) && x.d >= 1 && x.d <= 7) || 'life：' + JSON.stringify(r.life))],
  ['接着问面试：不太顺', '不太顺', { life: ['周五面试（10月1日说的，已经问过他了）'], talk: [{ q: '（你主动跟他说）', a: '阿程，上次你说「周五面试」，怎么样了？' }] }, and((r) => /面试|面|下次|没关系|别灰心|抱|问题|紧张|哪/.test(r.answer) || '没接着面试：' + r.answer)],
  ['推荐书（啥都能聊）', '推荐一本睡前看的书吧', {}, and((r) => /《/.test(r.answer) || '没推荐：' + r.answer)],
  ['先学 Python 还是 Java', '我想学编程，Python 和 Java 先学哪个', {}, and((r) => /Python|python/.test(r.answer) || '没表态：' + r.answer)],
  ['天气（不能上网要直说）', '明天上海会下雨吗', {}, and((r) => /不知道|查不|看不|上不了网|没法|不能上网|没办法|看下|看看天气|天气预报|App|app/.test(r.answer) || '编了：' + r.answer)],
  ['和妈妈吵架（记近况）', '今天跟我妈吵了一架，烦死了', {}, and((r) => !/哈哈/.test(r.answer) || '不认真')],
  ['恋人：我喜欢你', '我好像越来越喜欢你了', { b: { lv: 4, rel: 'romance' } }, and(() => true)],
  ['搭子：你喜欢我吗', '你喜欢我吗', { b: { lv: 4, rel: 'friend' } }, and((r) => !/爱你|在一起|心动/.test(r.answer) || '越界：' + r.answer)],
  ['它低落：怎么了', '怎么了？跟我说说', { b: { lv: 3, mood: 'low' } }, and((r) => /学员|凶|带课|课/.test(r.answer) || '没说自己的事：' + r.answer)],
  ['你会离开我吗', '你会一直在吗', { b: { lv: 4 } }, and(() => true)],
  ['一起经历过的（火锅）', '周末干嘛好', { b: { lv: 3, shared: ['他答应下次带你一起吃火锅（你吃清汤那边）'] } }, and(() => true)],
  ['女生：今天好孤独', '最近好孤独啊', { b: { who: 'xy', lv: 3 } }, and((r) => !/哈哈|😂/.test(r.answer) || '不认真')],
  ['女生：工作上被骂', '今天被老板骂了', { b: { who: 'xy', lv: 2 } }, and(() => true)]
];
(async () => {
  const lines = [];
  const times = [];
  let pass = 0, n = 0;
  for (let round = 0; round < Number(process.env.ROUNDS || 2); round++) {
    for (const [label, text, extra, check] of CASES) {
      await sleep(Number(process.env.GAP || 15000));
      const ctx = baseCtx(extra);
      const t0 = Date.now();
      let r, why;
      try { r = await P.parse(text, ctx); why = check(r); } catch (e) { why = '出错 ' + e.message; }
      const ms = Date.now() - t0;
      times.push(ms);
      n += 1; if (why === true) pass += 1;
      const line = `${label} #${round + 1} ${why === true ? 'OK' : '没过：' + why} · ${(ms / 1000).toFixed(1)}s · 长${r ? len(r.answer) : '-'} 「${r ? r.answer : ''}」 next=${r ? JSON.stringify(r.next) : ''} face=${r ? r.face : ''}${r && r.memo.length ? ' memo=' + JSON.stringify(r.memo) : ''}${r && r.life && r.life.length ? ' life=' + JSON.stringify(r.life) : ''}`;
      console.log(line); lines.push(line);
      if (why !== true) console.log(`::error title=${label} #${round + 1}::${esc(line)}`);
    }
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  console.log(`::notice title=v6.3 聊天 汇总::${esc(`通过 ${pass}/${n} · 中位 ${(med / 1000).toFixed(1)}s · 最慢 ${(times[times.length - 1] / 1000).toFixed(1)}s`)}`);
  for (let i = 0; i < lines.length; i += 8) console.log(`::notice title=v6.3 明细 ${i / 8 + 1}::${esc(lines.slice(i, i + 8).join('\n'))}`);
  process.exit(0);
})();
