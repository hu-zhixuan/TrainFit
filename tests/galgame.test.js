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

// ---------------- v7.1 主线 ----------------
require('../web/js/app/script_jx.js');
require('../web/js/app/script_xy.js');
const Buddy = require('../web/js/app/buddy.js');

// 剧本里所有台词（选项回应、互动做完以后、沉默、备用台词里的也算）
const walkLines = (steps, fn) => (steps || []).forEach(s => {
  if (Array.isArray(s)) { fn(s); return; }
  if (!s) return;
  if (s.ask) { s.opts.forEach(o => walkLines(Theater.normOpt(o).r, fn)); walkLines(s.silent, fn); }
  ['ok', 'meh', 'fallback', 'skipR', 'r'].forEach(k => { if (Array.isArray(s[k])) walkLines(s[k], fn); });
});
const allScenes = (c) => c.main.flat().concat(Object.values(c.bonus || {}));
test('主线（v9.0 重写）：两个人各五章、每章三段；每段长（50 句以上）、有好几个选项，选项都写了记下的事；有前情、有余韵的一句；小游戏少', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    assert.strictEqual(c.main.length, 5, k);
    const ids = c.main.flat().map(sc => sc.id);
    assert.strictEqual(ids.length, 15);
    assert.strictEqual(new Set(ids).size, 15);
    assert.ok(ids.every(id => id.startsWith(k)), '主线 id 带人名前缀（换人不会串）');
    c.main.forEach((ch, i) => ch.forEach((sc, j) => {
      const info = Theater.scriptInfo(sc.script);
      assert.ok(info.lines >= 50, `${sc.id} 太短（${info.lines} 句）：用户要「每一段都要长」`);
      assert.ok(info.asks.length >= 1 && info.asks.length + info.inputs.length >= 2, `${sc.id} 选项太少`);
      if (j > 0 || i > 0) assert.ok(sc.recap && [...sc.recap].length <= 48, `${sc.id} 要有一句前情（一天一段，接得上昨天）`);
      if (sc.id !== `${k}5c`) assert.ok(sc.after, `${sc.id} 演完小人接的那句`);
      assert.ok(!sc.when && !sc.invite, `${sc.id}：v9.0 不再挑时间、不再问「有空吗」`);
      info.steps.filter(s => s.ask).forEach(s => s.opts.forEach(o => {
        const n = Theater.normOpt(o);
        assert.ok(n.t && n.r.length >= 1, `${sc.id} 的选项要有回应`);
        assert.ok(n.fact, `${sc.id}「${n.t}」没写记下的事`);
      }));
    }));
    // 用户：「小游戏、花样太多」——点 / 按住 / 划 / 节拍 / 自己说 / 起名字 / 约定，一个人一共最多四处
    const all = c.main.flat().map(sc => Theater.scriptInfo(sc.script));
    const games = all.reduce((t, x) => t + x.touch + x.rhythm.length + x.inputs.length + x.names.length + x.promises.length, 0);
    assert.ok(games >= 1 && games <= 4, `${k} 互动 ${games} 处`);
    assert.ok(all.some(x => x.inputs.length), `${k} 关键时刻自己说一句`);
    // 隔了几天才来，下一段开头先闹别扭（用户：「可以怪没来，这是游戏的一种方式」）：三档，每档至少一种
    assert.strictEqual(c.absent.length, 3, `${k} 没来的三档`);
    c.absent.forEach((tier, t) => { assert.ok(tier.length >= 1, `${k} 第 ${t + 1} 档`); tier.forEach(v => assert.ok(v.length >= 2 && v.every(l => Array.isArray(l)), `${k} 没来的台词`)); });
  }
});

test('剧本格式：步骤都认得，表情、姿势画得出来，条件写对了（选项、约定、输入都存在），占位符都认识，CG 都有', () => {
  const FACES = ['开心', '害羞', '担心', '得意', '惊讶', '不服', '平静', '心动', '困', '闪亮', '撑', '哭', '泪笑'];
  const VARS = ['you', 'name', 'days', 'meals', 'trains', 'fav', 'lift', 'kg', 'cat', 'page', 'said', 'p'];
  const PROPS = ['water', 'dawnlight', 'cat', 'book', 'bokeh', 'umbrella', 'window', 'confetti', 'sunrise', 'petals', 'stars', 'mirror', 'sunset', 'spotlight', 'rain'];
  const FX = ['shake', 'flash', 'close', 'far', 'sepia', 'nosepia', 'dark', 'light', 'heart', 'glitch', 'onair', 'offair'];
  const Sound = (() => { global.window = global; require('../web/js/log/sound.js'); return global.Sound; })();
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const scenes = allScenes(c);
    const infos = scenes.map(sc => Theater.scriptInfo(sc.script));
    const asks = new Set(infos.flatMap(x => x.asks));
    const inputs = new Set(infos.flatMap(x => x.inputs));
    const rhythms = new Set(infos.flatMap(x => x.rhythm));
    const names = new Set(infos.flatMap(x => x.names));
    const condOk = (cond) => !cond || String(cond).split('&').every(p => {
      const q = p.trim().replace(/^!/, '');
      if (/^(rel:(romance|friend|none)|seen:\w+|lv>=\d|route:(near|brave|soft)|act:skip|time:(morning|day|evening|night|late))$/.test(q)) return true;
      if (/^has:(\w+)$/.test(q)) return VARS.includes(q.slice(4)) || names.has(q.slice(4));
      if (/^pick:\w+(=-?\d)?$/.test(q)) return asks.has(q.slice(5).split('=')[0]);
      if (/^said:\w+$/.test(q)) return inputs.has(q.slice(5));
      if (/^(promise|kept):\w+$/.test(q)) return !!c.promises[q.split(':')[1]];
      if (/^v:rhythm_(\w+)>=\d$/.test(q)) return rhythms.has(q.match(/^v:rhythm_(\w+)/)[1]);
      return /^v:\w+(>=-?\d+)?$/.test(q);
    });
    scenes.forEach((sc, i) => {
      infos[i].steps.forEach(s => {
        Object.keys(s).forEach(key => assert.ok(Theater.STEP_KEYS.includes(key), `${sc.id} 不认识的步骤字段 ${key}`));
        assert.ok(condOk(s.cond), `${sc.id} 条件写错：${s.cond}`);
        if (s.cg) assert.ok(c.cgs[s.cg], `${sc.id} 的 CG ${s.cg} 没定义`);
        if (s.fx) assert.ok(FX.includes(s.fx), `${sc.id} 特效 ${s.fx}`);
        if (s.sfx) assert.ok(Sound.KINDS.includes(s.sfx), `${sc.id} 音效 ${s.sfx}`);
        if (s.touch) { assert.ok(['tap', 'hold', 'swipe'].includes(s.touch) && Theater.ICONS[s.target], `${sc.id} 互动 ${s.touch} ${s.target}`); assert.ok(s.prompt && (s.ok || []).length, `${sc.id} 互动要写提示和做完的台词`); }
        if (s.doc) { assert.ok(c.doc && c.doc.lines.length >= 5, `${k} 没有人设文档`); assert.ok(s.hl == null || c.doc.lines[s.hl], `${sc.id} 高亮的那行不存在`); }
        if (s.push) { assert.match(s.push.at, /^\d{1,2}:\d{2}$/, `${sc.id} 通知时间`); assert.ok(s.push.text && [...s.push.text].length <= 40, `${sc.id} 通知太长`); if (k === 'jx') assert.ok(!/[！!～~]/.test(s.push.text), `${sc.id} 江叙的通知用了感叹号`); }
        if (s.memo) assert.ok([...s.memo].length <= 40 && !/^我/.test(s.memo), `${sc.id} 写进小本本的话要短，是关于你的事`);
        if (s.rhythm) assert.ok((s.ok || []).length && (s.meh || []).length, `${sc.id} 节拍要写拍准、没拍准两种`);
        if (s.input) { assert.ok(s.ctx && s.ctx.length > 40 && (s.fallback || []).length && (s.skipR || []).length && s.fact.includes('{said}'), `${sc.id} 关键对话要写这一幕的说明、备用台词、不说话的回应`); }
        if (s.name) assert.ok((s.opts || []).length >= 2 && (s.r || []).length, `${sc.id} 起名字要有现成的`);
        if (s.promise) assert.ok(c.promises[s.promise], `${sc.id} 约定 ${s.promise} 没定义`);
        if (s.ask) s.opts.forEach(o => { const n = Theater.normOpt(o); assert.ok(condOk(n.need), `${sc.id} 选项条件 ${n.need}`); });
      });
      walkLines(sc.script, (l) => {
        const [face, text, pose, cond] = l;
        assert.ok(face == null || face === '你' || FACES.includes(face) || /^@\S+$/.test(face), `${sc.id} 表情「${face}」画不出来`);
        assert.ok(!pose || Buddy.POSES.includes(pose) || pose === 'sys' || pose === 'own', `${sc.id} 姿势 ${pose}`);
        assert.ok(condOk(cond), `${sc.id} 条件写错：${cond}`);
        assert.ok([...String(text)].length <= 48, `${sc.id} 一句太长，手机上一屏放不下：${text}`);
        (String(text).match(/\{(\w+)\}/g) || []).forEach(v => { const n = v.slice(1, -1); assert.ok(VARS.includes(n) || names.has(n) || /^said_\w+$/.test(n), `${sc.id} 不认识的占位符 ${v}`); });
      });
    });
    Object.entries(c.cgs).forEach(([id, cg]) => {
      assert.ok(cg.title && cg.caption && cg.bg, id);
      assert.ok(!cg.face || FACES.includes(cg.face), id);
      assert.ok(!cg.pose || Buddy.POSES.includes(cg.pose), id);
      assert.ok(!cg.outfit || Buddy.OUTFITS[cg.outfit], id);
      cg.props.forEach(p => assert.ok(PROPS.includes(p), `${id} 道具 ${p} 没画`));
    });
    ['cat', 'umbrella', 'book'].forEach(p => assert.ok(/<svg[^>]*>.*<rect/.test(Theater.PROPS[p]), `像素道具 ${p}`));
  }
});

test('TA 写的那一页：五章各有一页，行里的条件都写对了；约定和加篇（v8.0）v9.0 去掉了', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    assert.deepStrictEqual(Object.keys(c.promises || {}), [], `${k} 不再有约定（用户嫌花样多）`);
    assert.strictEqual(c.diary.length, 5);
    c.diary.forEach((d, i) => { assert.ok(d.title && d.lines.length >= 4, `${k} 第 ${i + 1} 页`); assert.ok(d.lines.some(l => !l[1]), `${k} 第 ${i + 1} 页至少一行谁都看得到`); });
    assert.strictEqual(c.chapterLines.length, 5);
  }
});

test('口吻：江叙不用感叹号和波浪号；夏柚不叠字、不叫宝宝；夏柚的故事不夸瘦、不骂胖；不拿伤害自己吓人', () => {
  // v9.0 用户：「可以表白，可以怪没来，可以多写深难过」——怪你没来可以写（撒娇、闹别扭），但不写拿伤害自己、消失来吓人
  const THREAT = /去死|不活了|自杀|伤害自己|消失给你看/;
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const check = (id, face, text, pose) => {
      if (face == null || String(face)[0] === '@' || face === '你') return; // 旁白、别人说的、你说的不算
      assert.ok(!THREAT.test(text), `${id}：${text}`);
      if (pose === 'sys') return; // 写好的台词（台词表上的）是别人写的，全是感叹号
      assert.ok(!/宝宝|亲爱的/.test(text), `${id}：${text}`);
      if (k === 'jx') assert.ok(!/[！!～~]/.test(text), `江叙用了感叹号：${id}「${text}」`);
      if (k === 'xy') assert.ok(!/(吃饭饭|睡觉觉|喝水水|一下下)/.test(text), `夏柚叠字：${id}「${text}」`);
      if (k === 'xy') assert.ok(!/瘦了真好|再瘦|少吃点吧|你胖了|该减肥/.test(text), `夏柚夸瘦骂胖：${id}「${text}」`);
    };
    allScenes(c).forEach(sc => walkLines(sc.script, ([face, text, pose]) => check(sc.id, face, text, pose)));
    c.absent.flat().forEach(v => v.forEach(([face, text]) => check('absent', face, text)));
  }
});

test('结局（v9.0）：最后一段 TA 自己表白、你选接不接；按一路的选择分三条，每条都走得到，各有一张 CG、结局字幕、写进小本本的一句', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const fin = c.main[4][2];
    const ends = Object.entries(c.endings);
    assert.strictEqual(ends.length, 3, k);
    assert.deepStrictEqual(ends.map(([, e]) => e.route).sort(), ['brave', 'near', 'soft']);
    assert.strictEqual(ends.filter(([, e]) => e.dflt).length, 1, '平手时走哪条要写清楚');
    assert.ok(Theater.scriptInfo(fin.script).routes === 1, `${k} 最后一段要定路线`);
    for (const [key, e] of ends) {
      assert.ok(e.title && e.last && e.tag, `${k} ${key} 的字幕`);
      const ctx = { picks: {}, seen: [], vars: {}, route: e.route };
      const steps = fin.script.filter(s => !Array.isArray(s) && Theater.evalCond(s.cond, ctx));
      assert.deepStrictEqual(steps.filter(s => s.end).map(s => s.end), ['auto'], `${k} ${key}`);
      assert.strictEqual(steps.filter(s => s.cg).length, 1, `${k} ${key} 的 CG`);
      assert.strictEqual(steps.filter(s => s.memo && s.cond).length, 1, `${k} ${key} 写进小本本`);
      const own = fin.script.filter(s => Array.isArray(s) && s[3] === `route:${e.route}`);
      assert.ok(own.length >= 4, `${k} ${key} 太短`);
    }
    // 用户 v9.0：「可以表白」——最后一段 TA 用自己的话说，你选：喜欢（恋人线）/ 最重要的人（搭子）/ 以后再说
    const confess = fin.script.find(s => s && s.ask === 'confess');
    assert.ok(confess, `${k} 最后一段表白`);
    assert.deepStrictEqual(confess.opts.map(o => Theater.normOpt(o).sp).sort(), ['friend', 'later', 'romance']);
  }
});

test('元设定（TA 知道自己在 App 里）：第一句说错两遍、人设文档、自己手写加一行、约好的通知每章最多一次', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const first = Theater.scriptInfo(c.main[0][0].script);
    assert.ok(first.sys >= 2, `${k} 第一段：台词说错两遍`);
    const sys = c.main[0][0].script.filter(s => Array.isArray(s) && s[2] === 'sys');
    assert.strictEqual(sys[0][1], sys[1][1], '两遍一字不差');
    const infos = c.main.flat().map(sc => Theater.scriptInfo(sc.script));
    assert.ok(infos.reduce((t, x) => t + x.docs, 0) >= 2, `${k} 翻开人设文档至少两次`);
    assert.ok(c.main.flat().some(sc => sc.script.some(s => s && s.doc && s.add)), `${k} 自己在人设上加一行`);
    assert.ok(infos.some(x => x.recalls), `${k} 有撤回的消息`);
    c.main.forEach((ch, i) => assert.ok(ch.map(sc => Theater.scriptInfo(sc.script).pushes.length).reduce((a, b) => a + b, 0) <= 1, `${k} 第 ${i + 1} 章通知最多一次`));
    assert.ok(c.main.flat().filter(sc => Theater.scriptInfo(sc.script).pushes.length).length >= 2, `${k} 剧情里约好的通知`);
    // 第三、四章翻开的那行，就是虐点（江叙：经历；夏柚：表情 / 不应表现负面情绪）
    const hl = c.main.slice(2, 4).flat().flatMap(sc => sc.script.filter(s => s && s.doc && s.hl != null).map(s => c.doc.lines[s.hl]));
    assert.ok(hl.some(l => (k === 'jx' ? /经历/ : /表情|负面/).test(l)), `${k}：${hl}`);
  }
  // 夏柚有哭的那张（第五章你画的眼泪）
  const tears = Cast.xy.main[4].flatMap(sc => sc.script.filter(s => s && s.touch && s.target === 'tear'));
  assert.strictEqual(tears.length, 1);
  assert.strictEqual(tears[0].dir, 'down');
  assert.ok(JSON.stringify(Cast.xy.main[4][1].script).includes('"哭"'));
  // 江叙：第七天台词表替他说了喜欢；第十三天更新前用自己的嘴说
  assert.ok(Cast.jx.main[2][2].script.some(s => Array.isArray(s) && s[2] === 'sys' && /喜欢/.test(s[1])), '第七天');
});

test('今天页的小人就是剧情里的 TA（v8.0）：衣服跟着剧情解锁、余韵台词对得上剧情、剧情里没说过的事不先说', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const ids = new Set(c.main.flat().map(sc => sc.id).concat(Object.keys(c.bonus)));
    // 衣服：每件对应一段剧情，名字写清楚；光膀子 / 运动内衣只解锁不自己换上
    const W = c.wardrobe;
    assert.ok(Object.keys(W).length >= 3, `${k} 衣服太少`);
    Object.entries(W).forEach(([o, w]) => {
      assert.ok(Buddy.OUTFITS[o], `${k} 衣服 ${o} 画不出来`);
      assert.ok(ids.has(w.scene || w.bonus), `${k} ${o} 对应的剧情 ${w.scene || w.bonus} 不存在`);
      assert.ok(w.label && w.label.length <= 14, `${k} ${o} 要有名字`);
    });
    assert.strictEqual(W.bare.wear, false, `${k} 光膀子 / 运动内衣不自己换上`);
    // 余韵：只挂在真的剧情上，口吻对
    Object.entries(c.echo).forEach(([id, lines]) => {
      assert.ok(ids.has(id), `${k} 余韵挂在不存在的剧情 ${id}`);
      lines.forEach(t => {
        assert.ok([...t].length <= 40, `${k} 余韵太长：${t}`);
        if (k === 'jx') assert.ok(!/[！!～~]/.test(t), `江叙余韵用了感叹号：${t}`);
        assert.ok(!/只有你|别走|离不开|你不来我/.test(t), `${k} 余韵情感勒索：${t}`);
      });
    });
    assert.ok(c.main.flat().every(sc => c.echo[sc.id]), `${k} 每段主线都有余韵`);
    // 剧情里还没说过的事（肩伤、爸爸）：低落的理由写成 [话, 要先看过的剧情]
    c.heart.low.why.forEach(x => { if (Array.isArray(x)) assert.ok(ids.has(x[1]), `${k} 低落理由要先看的剧情 ${x[1]}`); });
    assert.ok(c.heart.low.why.some(x => typeof x === 'string'), `${k} 至少一条随时能说的低落理由`);
  }
  assert.ok(Cast.jx.heart.low.why.some(x => Array.isArray(x) && /肩膀/.test(x[0])), '江叙的肩伤要等老周说了以后');
  assert.ok(Cast.xy.heart.low.why.some(x => Array.isArray(x) && /我爸/.test(x[0])), '夏柚的爸爸要等剧情里出现以后');
});

test('小人的样子跟着剧情小变化（v8.1）：每处挂在真的主线上、画得出来、只改几格、余韵里 TA 自己提一句', () => {
  for (const [k, char] of [['jx', 'boy'], ['xy', 'girl']]) {
    const c = Cast[k];
    const ids = new Set(c.main.flat().map(sc => sc.id));
    const M = c.marks;
    assert.ok(Object.keys(M).length >= 2 && Object.keys(M).length <= 4, `${k} 小变化两到四处（用户：变化不要太大）`);
    Object.entries(M).forEach(([m, x]) => {
      assert.ok(Buddy.MARKS[m] && Buddy.MARKS[m].char === char, `${k} ${m} 画不出来`);
      assert.ok(ids.has(x.scene), `${k} ${m} 对应的主线 ${x.scene} 不存在`);
      assert.ok(x.label && [...x.label].length <= 14, `${k} ${m} 要有一句话说变了什么`);
      assert.ok(c.echo[x.scene].length >= 2, `${k} ${m}：${x.scene} 的余韵里要有 TA 自己提一句`);
      // 带上和不带不一样，但只差几格
      for (const pose of ['stand', 'lie']) {
        const base = Object.assign({ char, pose, mood: 'ok' }, Buddy.CAST_LOOK[char]);
        const a = Buddy.compose(base).px.flat(), b = Buddy.compose(Object.assign({}, base, { marks: [m] })).px.flat();
        const diff = a.filter((p, i) => p !== b[i]).length;
        assert.ok(diff <= 12, `${k} ${m} ${pose} 改了 ${diff} 格，太多`);
        if (pose === 'stand') assert.ok(diff > 0, `${k} ${m} 站着看不出来`);
      }
    });
  }
});

test('新条件：结局路线、按过跳过、现在几点', () => {
  assert.ok(Theater.evalCond('route:near', { route: 'near' }));
  assert.ok(!Theater.evalCond('route:near', { route: 'soft' }));
  assert.ok(Theater.evalCond('act:skip', { acts: { skip: true } }) && !Theater.evalCond('act:skip', { acts: {} }));
  assert.ok(Theater.evalCond('time:night', { hour: 23 }) && Theater.evalCond('time:late', { hour: 2 }) && !Theater.evalCond('time:late', { hour: 22 }));
  assert.ok(Theater.evalCond('time:morning', { hour: 6 }) && Theater.evalCond('time:evening', { hour: 19 }) && Theater.evalCond('time:day', { hour: 12 }));
  const info = Theater.scriptInfo([['开心', 'a', 'sys'], { doc: true, hl: 1 }, { recall: 'x' }, { push: { at: '07:00', text: 'y' } }, { memo: 'z' }, { route: true }]);
  assert.deepStrictEqual([info.sys, info.docs, info.recalls, info.pushes.length, info.memos.length, info.routes], [1, 1, 1, 1, 1, 1]);
});

test('剧本条件和占位符', () => {
  const ctx = { romance: true, picks: { jx4b: 1, xy2a: -1 }, seen: ['jx1a'], vars: { lift: '深蹲 80 公斤', fav: '' }, lv: 3,
    inputs: { jx4a: '你很勇敢' }, sv: { trust: 2, rhythm_xy2b: 7 }, promises: { jxp1: { at: '2026-10-01', due: '2026-10-03' }, jxp2: { declined: true }, jxp3: { done: '2026-10-02' } } };
  assert.ok(Theater.evalCond('rel:romance', ctx));
  assert.ok(!Theater.evalCond('rel:none', ctx));
  assert.ok(Theater.evalCond('pick:jx4b=1&has:lift', ctx));
  assert.ok(!Theater.evalCond('pick:jx4b=0', ctx));
  assert.ok(Theater.evalCond('pick:xy2a=-1', ctx), '沉默是 -1');
  assert.ok(Theater.evalCond('!pick:jx4b=0&!has:fav&seen:jx1a&lv>=3', ctx));
  assert.ok(!Theater.evalCond('lv>=4', ctx));
  assert.ok(Theater.evalCond('said:jx4a&!said:xy4a', ctx));
  assert.ok(Theater.evalCond('v:trust>=2&!v:trust>=3&v:rhythm_xy2b>=6', ctx));
  assert.ok(Theater.evalCond('promise:jxp1&!promise:jxp2&kept:jxp3&!kept:jxp1', ctx), '约过（没说下次吧）、做到了');
  assert.ok(Theater.evalCond('', ctx));
  assert.strictEqual(Theater.fill('{lift}，最重的一次。{nope}{p}', ctx.vars), '深蹲 80 公斤，最重的一次。');
  assert.deepStrictEqual(Theater.normOpt(['好', '嗯。', '记下', 'talk']), { t: '好', r: [['平静', '嗯。']], fact: '记下', sp: 'talk', v: undefined, need: undefined, tag: undefined });
  assert.deepStrictEqual(Theater.normOpt(['好', [['平静', '嗯。']], '记下', null, { v: { trust: 1 }, need: 'pick:zhou=0', tag: '老周托你的' }]).need, 'pick:zhou=0');
  // 老格式的小剧情也能演：lines + 最后三个选项
  const steps = Theater.toSteps({ lines: [['平静', 'a']], choices: [['x', 'y', '害羞', 'f', 'talk']] });
  assert.strictEqual(steps.length, 2);
  assert.deepStrictEqual(Theater.normOpt(steps[1].opts[0]).r, [['害羞', 'y']]);
  // 节拍：每拍前后容差内有一下才算，一下只算一拍
  assert.strictEqual(Theater.rhythmScore([100, 610, 1300, 1310], [100, 600, 1100, 1600], 150), 2);
  assert.strictEqual(Theater.rhythmScore([100, 105, 1550], [100, 600, 1100, 1600], 150), 2, '一下只算一拍');
  assert.strictEqual(Theater.rhythmScore([], [100], 150), 0);
});

test('关键对话的提示词：带人设和这一幕，只要 lines；回答按人设收拾（江叙去掉感叹号），最多三句', () => {
  const persona = { name: '江叙', who: '体大游泳队退役的学长', speech: '话少', quirks: '常用……', never: '用感叹号', samples: [['a', '……嗯。']], you: '他', relation: '有点暧昧' };
  const m = TF.Parser.sceneMessages('你一点都没有变差，你只是太累了', { buddy: persona, scene: '深夜电话，他刚说完旧伤', calm: true });
  assert.strictEqual(m.length, 2);
  assert.ok(/江叙/.test(m[0].content) && /深夜电话/.test(m[0].content) && /"lines"/.test(m[0].content) && /从来不用感叹号/.test(m[0].content));
  assert.ok(/不是 AI 助手/.test(m[0].content) && /只有你/.test(m[0].content));
  assert.ok(/你一点都没有变差/.test(m[1].content));
  const out = TF.Parser.normalizeScene({ lines: [{ face: '害羞', text: '……谢谢你！！' }, { face: '乱写', text: '我会去看医生～' }, { face: '平静', text: '嗯。' }, { face: '平静', text: '多的' }] }, { calm: true });
  assert.deepStrictEqual(out, [['害羞', '……谢谢你。'], ['平静', '我会去看医生'], ['平静', '嗯。']]);
  assert.deepStrictEqual(TF.Parser.normalizeScene({}, {}), []);
});

test('美术层：有立绘按表情取，没有这个表情找相近的、再退回平静；没图返回空（剧场用像素小人和 CSS 背景）', () => {
  global.TF = global.TF || {};
  const Art = require('../web/js/app/art.js');
  const keep = global.TF.ArtManifest;
  global.TF.ArtManifest = { cast: { jx: { face: { calm: 'c.webp', shy: 's.webp' }, cg: { 'jx-pool6': 'p.webp' } } }, bg: { pool: 'bg.webp' } };
  assert.strictEqual(Art.sprite('jx', '害羞'), 's.webp');
  assert.strictEqual(Art.sprite('jx', '心动'), 's.webp', '心动没有 → 害羞');
  assert.strictEqual(Art.sprite('jx', '担心'), 'c.webp', '没有的退回平静');
  assert.strictEqual(Art.sprite('xy', '开心'), '', '夏柚还没有立绘');
  assert.strictEqual(Art.cg('jx', 'jx-pool6'), 'p.webp');
  assert.strictEqual(Art.cg('jx', 'jx-relay'), '');
  assert.strictEqual(Art.bg('pool'), 'bg.webp');
  assert.strictEqual(Art.bg('gym'), '');
  // 剧本里用到的表情都有对应的文件名，背景名和剧场的一样
  Object.keys(Art.FALLBACK).forEach(f => assert.ok(Art.FACES[f]));
  for (const k of ['jx', 'xy']) Object.values(Cast[k].cgs).forEach(cg => assert.ok(Art.BGS.includes(cg.bg), cg.bg));
  global.TF.ArtManifest = keep;
});

test('立绘加载失败就不再用这张（退回相近的、再退回像素小人）；署名按人取', () => {
  const Art = require('../web/js/app/art.js');
  const keep = global.TF.ArtManifest;
  global.TF.ArtManifest = {
    cast: { jx: { face: { calm: 'jc.webp', shy: 'js.webp' }, cg: {} }, xy: { face: { calm: 'xc.webp' }, cg: {} } }, bg: {},
    credits: [{ who: 'jx', what: '立绘', credit: 'わたおきば（わたおび）', url: 'u' }, { who: 'xy', what: '立绘', credit: 'B', url: 'v' }]
  };
  assert.strictEqual(Art.sprite('jx', '害羞'), 'js.webp');
  Art.fail('js.webp');
  assert.strictEqual(Art.sprite('jx', '害羞'), 'jc.webp', '害羞那张坏了 → 平静');
  Art.fail('jc.webp');
  assert.strictEqual(Art.sprite('jx', '平静'), '', '都坏了 → 像素小人');
  assert.strictEqual(Art.sprite('xy', '平静'), 'xc.webp', '别人的不受影响');
  assert.deepStrictEqual(Art.credits('jx').map(c => c.credit), ['わたおきば（わたおび）']);
  assert.strictEqual(Art.credits().length, 2);
  global.TF.ArtManifest = keep;
});

test('立绘素材清单（art/sources.json）：两个人都有、能校验、表情名对得上、腮红有位置；图不进仓库', () => {
  const fs = require('fs');
  const path = require('path');
  const Art = require('../web/js/app/art.js');
  const root = path.join(__dirname, '..');
  const src = JSON.parse(fs.readFileSync(path.join(root, 'art/sources.json'), 'utf8')).cast;
  const names = Object.values(Art.FACES);
  for (const k of ['jx', 'xy']) {
    const s = src[k];
    assert.ok(s, k);
    assert.match(s.zip, /^https:\/\//);
    assert.match(s.sha256, /^[0-9a-f]{64}$/, '下载后校验，画师换了图不会悄悄换掉');
    assert.ok(s.pattern.includes('%s'));
    assert.ok(s.credit && s.page, '署名');
    assert.ok(s.faces.calm, '一定要有平静（别的没有时退回它）');
    for (const [face, spec] of Object.entries(s.faces)) {
      assert.ok(names.includes(face), `${k} ${face} 不是剧本里的表情`);
      assert.match(spec, /^[a-z](\+blush|\+tears)*$/, `${k} ${face}`);
      if (spec.includes('blush')) assert.ok((s.blush || []).length && s.blush.every(b => b.length === 4 && b.every(Number.isFinite)), `${k} 加腮红要写位置`);
      if (spec.includes('tears')) assert.ok(((s.tears || {})[spec[0]] || []).length && s.tears[spec[0]].every(b => b.length >= 3 && b.every(Number.isFinite)), `${k} 加眼泪要写位置（按表情字母）`);
    }
  }
  // 素材不准转发原图：下载缓存、压好的图都不进仓库；清单由脚本生成，页面在 art.js 之前加载
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(/^web\/img\/cast\/$/m.test(ignore) && /^\.art-cache\/$/m.test(ignore));
  const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  assert.ok(html.indexOf('src="img/cast/manifest.js"') > 0 && html.indexOf('src="img/cast/manifest.js"') < html.indexOf('src="js/app/art.js"'));
});
