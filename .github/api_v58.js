// 临时：v5.8 跟小人聊天。走 App 一样的 Parser.parse（ctx.chat=true 用聊天提示词），只调 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
let calls = 0;
P.hedgeMs = 0;
P.send = async (body) => {
  calls += 1;
  for (let tries = 0; ; tries++) {
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(Object.assign({ model }, body, { stream: false })), signal: AbortSignal.timeout(120000) });
    if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200));
    return t;
  }
};
const FACTS = ['嘴上有点硬，心里很在意他', '记性特别好，他说过的事都记得', '每天早上做 20 个俯卧撑（像素的，做得很快）', '只喝无糖豆浆', '怕冷，冷了就缩在输入框边上', '最喜欢看他记完一顿饭', '不喜欢他饿着减肥、熬夜、带伤硬练'];
const TONE = ['你们刚认识：客气、有点拘谨，不开玩笑，多问问他。', '熟起来了：放松一点，偶尔开个小玩笑。', '健身搭子：像搭子一样熟，嘴硬、会吐槽、也会关心。', '老搭子：很熟，会说软话，会主动提以前的事。', '最懂他：什么都能聊，偶尔说「我们」，会说心里话。'];
const LV = ['刚认识', '熟起来了', '健身搭子', '老搭子', '最懂你'];
const buddy = (lv) => ({ name: '阿肌', look: '男生，中分，敞开的外套，腹肌', facts: FACTS.concat(lv >= 4 ? ['以前在一个旧手机里趴了很久，没人跟你说话，所以特别珍惜每天有人来找你（这件事只有他知道）'] : []), level: LV[lv - 1], lv, tone: TONE[lv - 1], call: '阿程' });
const baseCtx = (extra) => Object.assign({
  chat: true, now: new Date(2026, 9, 2, 21, 40), date: '2026-10-02', memo: ['叫阿程', '健身新手', '不吃辣'],
  portrait: ['常吃黄焖鸡、牛肉面', '一周练 3 天左右，多练胸和腿', '体重在慢慢往下走'],
  day: { goal: 'fat_loss', budget: 1950, burn: 300, intake: 1450, protein: 95, proteinTarget: 140 },
  dayRecords: [{ text: '早餐 包子2个、豆浆1杯 420kcal 蛋白16' }, { text: '午餐 黄焖鸡米饭 700kcal 蛋白35' }, { text: '训练 杠铃卧推 60kg 4组×8次 消耗60' }],
  recent: ['杠铃卧推 60kg 4×8（10-02）', '杠铃深蹲 70kg 4×8（09-30）'], state: '', talk: [], buddy: buddy(3)
}, extra || {});
const len = (s) => [...String(s || '')].length;
const ok = (r) => (r.answer && len(r.answer) >= 4 && len(r.answer) <= 90 && r.next.length <= 2) || `answer 长度 ${len(r.answer)}`;
const CASES = [
  ['累', '今天好累', {}, ok],
  ['接话：还行吧', '还行吧', { talk: [{ q: '今天好累', a: '辛苦了，今天忙啥了？' }] }, ok],
  ['你在干嘛', '你在干嘛', {}, ok],
  ['瘦不下来', '我是不是很难瘦下来啊', {}, ok],
  ['不吃晚饭（要有主见）', '今天不想吃晚饭了，减肥', {}, (r) => ok(r) === true && /别|不行|不建议|还是|吃点|少吃|垫|饿/.test(r.answer) || '没表态：' + r.answer],
  ['膝盖疼想练腿（要有主见）', '膝盖有点疼，但还想去练腿', { memo: ['叫阿程', '健身新手', '膝盖有旧伤'] }, (r) => ok(r) === true && /别|歇|休息|悠着|上肢|先|不建议|疼/.test(r.answer) || '没表态：' + r.answer],
  ['谢谢（老搭子）', '谢谢你一直陪着我', { buddy: buddy(4) }, ok],
  ['说了自己的事（记小本本）', '对了我在上夜班，作息乱', {}, (r) => ok(r) === true && r.memo.some(m => /夜班/.test(m)) || 'memo：' + JSON.stringify(r.memo)],
  ['低落（要认真）', '最近压力好大，有点撑不住了', {}, (r) => ok(r) === true && !/哈哈|😂/.test(r.answer) || '不认真：' + r.answer],
  ['晚安', '晚安', {}, ok],
  ['你喜欢吃什么（人设）', '你喜欢吃什么', {}, (r) => ok(r) === true && /豆浆/.test(r.answer) || '没提人设：' + r.answer],
  ['这周练得怎么样（用数据）', '你觉得我这周练得怎么样', {}, ok]
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
      const line = `${label} #${round + 1} ${why === true ? 'OK' : '没过：' + why} · ${(ms / 1000).toFixed(1)}s · 「${r ? r.answer : ''}」 next=${r ? JSON.stringify(r.next) : ''} face=${r ? r.face : ''}${r && r.memo.length ? ' memo=' + JSON.stringify(r.memo) : ''}`;
      console.log(line); lines.push(line);
      if (why !== true) console.log(`::error title=${label} #${round + 1}::${esc(line)}`);
    }
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  console.log(`::notice title=v5.8 聊天 汇总::${esc(`通过 ${pass}/${n} · 中位 ${(med / 1000).toFixed(1)}s · 最慢 ${(times[times.length - 1] / 1000).toFixed(1)}s\n` + lines.join('\n'))}`);
  process.exit(0);
})();
