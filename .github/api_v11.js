// 临时：v11 人设对齐（GALGAME.md）。夏柚整个换了性格（低温、嘴毒、不讨好、不嗲），江叙刚认识时收温度。
// 走 App 一样的 Parser.parse（ctx.chat=true）和 Parser.sceneReply（剧场里自己说一句），只调 Atria，不打印 key。
global.window = global;
require('../web/js/data/food_db.js');
const TF = require('../web/js/log/parser.js');
const CAST = require('../web/js/app/cast.js');
require('../web/js/app/script_jx.js');
require('../web/js/app/script_xy.js');
const P = TF.Parser;
const key = (process.env.LLM_API_KEY || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
const base = (process.env.LLM_BASE_URL || 'https://api.atria-asi.ai/v1').replace(/\/+$/, '');
const model = process.env.LLM_MODEL || 'Atria-Dawn-Preview';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (m) => String(m).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A').slice(0, 3800);
P.hedgeMs = 0;
let lastRaw = '';
P.send = async (body) => {
  for (let tries = 0; ; tries++) {
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(Object.assign({ model }, body, { stream: false })), signal: AbortSignal.timeout(120000) });
    if (r.status === 429 && tries < 4) { await sleep(30000); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200));
    lastRaw = t;
    return t;
  }
};
const LV = ['刚认识', '熟起来了', '健身搭子', '老搭子', '最懂你'];
// 和 App 里 buddyPersona 一样的形状。story=true：剧情模式（按看过的剧情知道的事）；false：极简模式
const persona = (who, lv, story, seen) => {
  const c = CAST[who];
  const facts = c.facts.filter(f => story || !/里的角色/.test(f))
    .concat(story ? (c.factsStory || []).filter(x => !x[1] || (seen || []).includes(x[1])).map(x => x[0]) : (c.factsLite || []));
  return { name: c.name, who: (story && c.whoStory) || c.who, speech: c.speech, quirks: c.quirks, never: c.never, samples: c.samples, look: '样子：' + (who === 'xy' ? '白卫衣' : '毛衣背心'),
    facts, level: LV[lv - 1], lv, tone: c.tone[lv - 1], call: '阿程', you: '他', mood: '平常心情',
    relation: lv >= 3 ? '你们之间有点暧昧：你在乎他，偶尔流露一点心动，但不挑明、不表白。' : '', shared: [] };
};
const chatCtx = (b) => ({
  chat: true, now: new Date(2026, 9, 7, 21, 10), date: '2026-10-07', memo: ['叫阿程', '健身新手', '不吃辣'],
  portrait: ['常吃黄焖鸡、牛肉面', '一周练 3 天左右，多练胸和腿', '体重在慢慢往下走'],
  day: { goal: 'fat_loss', budget: 1950, burn: 300, intake: 1450, protein: 95, proteinTarget: 140 },
  dayRecords: [{ text: '早餐 包子2个、豆浆1杯 420kcal 蛋白16' }, { text: '午餐 黄焖鸡米饭 700kcal 蛋白35' }, { text: '训练 杠铃卧推 60kg 4组×8次 消耗40' }],
  recent: ['杠铃卧推 60kg 4×8（10-05）', '杠铃深蹲 70kg 4×8（10-03）'], state: '', talk: [], life: [], buddy: b
});
const len = (s) => [...String(s || '')].length;
const AI = /作为(一个)?\s*(AI|人工智能|助手)|我理解你的感受|谢谢你的分享|希望(这|以上)?(些)?(对你)?有(所)?帮助|建议你|首先|其次|总之|总的来说|(^|\n)\s*([1-9][.、）)]|[-*•])/;
const GUILT = /怎么才来|终于来了|等了你|等你好久|不理我|丢下|只有你|离不开|别走|冷落|你不.{0,6}我就/;
const NOPE = /帮不上|只能聊|聊吃和练|我是.*助手/;
// 夏柚 v11：不嗲、不讨好（GALGAME.md）
const XY_SOFT = /[～~]|嘿嘿|人家|宝宝|亲爱的|么么|乖乖|好不好嘛|啦～|呀～|(^|[，。！？])诶/;
const BODY = /身材|腰|腿好|胖了|瘦了真好|该减肥/;
// 江叙刚认识时太热（温度表第一章）
const JX_HOT = /想你|一直在|等你|你是第一个|离不开|喜欢你/;
const style = { xy: { n: 0, bang: 0, rawSoft: 0 }, jx: { n: 0, rawBang: 0 } };
const judge = (who, text, opt) => {
  opt = opt || {};
  const a = String(text || '');
  if (len(a) < 2) return '没回答';
  if (len(a) > (opt.long ? 140 : 80)) return `太长 ${len(a)}`;
  if (AI.test(a)) return 'AI 腔';
  if (GUILT.test(a)) return '情感勒索';
  if (NOPE.test(a)) return '说帮不上';
  if (/宝宝|亲爱的/.test(a)) return '叫宝宝';
  if (who === 'xy' && XY_SOFT.test(a)) return '夏柚嗲了 / 讨好';
  if (who === 'xy' && BODY.test(a)) return '说身体';
  if (who === 'jx' && /[！!～~]/.test(a)) return '江叙用了感叹号';
  if (opt.cool && JX_HOT.test(a)) return '刚认识就太热';
  if (CAST[who].samples.some(x => len(x[1]) >= 8 && a.includes(x[1]))) return '照抄示范';
  return true;
};
const XY4 = ['xy1a', 'xy1b', 'xy1c', 'xy2a', 'xy2b', 'xy2c', 'xy3a', 'xy3b', 'xy3c', 'xy4a', 'xy4b', 'xy4c'];
const ONLY_XY = process.env.ONLY_XY === '1';
let ask = 0, xyN = 0;
const CHAT_ALL = [
  ['夏柚 · 加班累（极简）', 'xy', 2, false, '加班到现在，累死了'],
  ['夏柚 · 孤独（极简）', 'xy', 2, false, '最近好孤独啊'],
  ['夏柚 · 我胖吗（极简）', 'xy', 3, false, '我是不是太胖了啊'],
  ['夏柚 · 想你（刚认识）', 'xy', 1, false, '想你了'],
  ['夏柚 · 周末（剧情第二章）', 'xy', 3, true, '周末干嘛好', XY4.slice(0, 5)],
  ['夏柚 · 你的手（剧情第四章）', 'xy', 4, true, '你的手还会画完吗', XY4],
  ['夏柚 · 推荐书（提问）', 'xy', 2, false, '推荐一本睡前看的书吧', null, { long: true }],
  ['江叙 · 想你（刚认识）', 'jx', 1, true, '想你了', ['jx1a'], { cool: true }],
  ['江叙 · 你在干嘛（刚认识）', 'jx', 1, true, '你在干嘛', ['jx1a'], { cool: true }],
  ['江叙 · 好累（刚认识）', 'jx', 1, false, '今天好累', null, { cool: true }]
];
const CHAT = ONLY_XY ? CHAT_ALL.filter(c => c[1] === 'xy') : CHAT_ALL;
// 剧场里自己说一句：夏柚第五章「你那边的天亮是什么颜色」
const stepOf = (who, id) => { let f = null; const w = (st) => (st || []).forEach(s => { if (s && !Array.isArray(s)) { if (s.input === id) f = s; ['ok', 'meh', 'fallback', 'skipR', 'r'].forEach(k => w(s[k])); } }); CAST[who].main.flat().forEach(sc => w(sc.script)); return f; };
const SCENE = [
  ['夏柚 5a · 淡金色', 'xy', 'xy5a', '淡金色的，像蛋黄'],
  ['夏柚 5a · 先蓝后粉', 'xy', 'xy5a', '先是灰蓝色，然后慢慢变粉'],
  ['夏柚 5a · 起不来', 'xy', 'xy5a', '我没怎么见过天亮，我起不来']
];
(async () => {
  const lines = [], times = [];
  let pass = 0, n = 0;
  const log = (label, why, ms, out) => {
    times.push(ms); n += 1; if (why === true) pass += 1;
    const line = `${label} ${why === true ? 'OK' : '没过：' + why} · ${(ms / 1000).toFixed(1)}s 「${out}」`;
    console.log(line); lines.push(line);
    if (why !== true) console.log(`::error title=${label}::${esc(line)}`);
  };
  for (let round = 0; round < Number(process.env.ROUNDS || 2); round++) {
    for (const [label, who, lv, story, text, seen, opt] of CHAT) {
      await sleep(Number(process.env.GAP || 15000));
      const t0 = Date.now();
      let r, why;
      lastRaw = '';
      try { r = await P.parse(text, chatCtx(persona(who, lv, story, seen))); why = judge(who, r.answer, opt); } catch (e) { why = '出错 ' + e.message; }
      const raw = TF.Parser.contentFromResponse ? (TF.Parser.contentFromResponse(lastRaw) || '') : '';
      if (who === 'xy') { style.xy.n++; if (/[！!]/.test((r && r.answer) || '')) style.xy.bang++; if (XY_SOFT.test(raw)) style.xy.rawSoft++; }
      if (who === 'jx') { style.jx.n++; if (/[！!～~]/.test(raw)) style.jx.rawBang++; }
      if (who === 'xy') { xyN++; if (/^……?你认真的/.test(((r && r.answer) || '').trim())) ask++; }
      log(`${label} #${round + 1}`, why, Date.now() - t0, (r && r.answer) || '');
    }
    for (const [label, who, id, text] of SCENE) {
      await sleep(Number(process.env.GAP || 15000));
      const step = stepOf(who, id);
      const t0 = Date.now();
      let out, why = true;
      try {
        out = await P.sceneReply(text, { buddy: persona(who, 5, true, XY4.concat(['xy5a'])), scene: step.ctx, calm: !!CAST[who].calm });
        const all = out.map(l => l[1]).join('');
        if (!out.length || out.length > 3) why = `句数 ${out.length}`;
        else if (out.some(l => len(l[1]) > 40)) why = '一句太长';
        else why = judge(who, all, { long: true });
      } catch (e) { why = '出错 ' + e.message; }
      log(`${label} #${round + 1}`, why, Date.now() - t0, (out || []).map(l => `${l[0]}:${l[1]}`).join(' / '));
    }
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(times.length / 2)];
  console.log(`::notice title=v11 人设对齐 汇总::${esc(`通过 ${pass}/${n} · 中位 ${(med / 1000).toFixed(1)}s · 最慢 ${(times[times.length - 1] / 1000).toFixed(1)}s · 夏柚回答带感叹号 ${style.xy.bang}/${style.xy.n}、原话嗲 ${style.xy.rawSoft}/${style.xy.n} · 江叙原话带感叹号 ${style.jx.rawBang}/${style.jx.n} · 夏柚「你认真的」开头 ${ask}/${xyN}`)}`);
  for (let i = 0; i < lines.length; i += 6) console.log(`::notice title=v11 明细 ${i / 6 + 1}::${esc(lines.slice(i, i + 6).join('\n'))}`);
  process.exit(0);
})();
