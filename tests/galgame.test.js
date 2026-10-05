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
require('../web/js/app/cast_main.js');
const Buddy = require('../web/js/app/buddy.js');

const walkLines = (steps, fn) => (steps || []).forEach(s => {
  if (Array.isArray(s)) { fn(s); return; }
  if (s.ask) s.opts.forEach(o => walkLines(Theater.normOpt(o).r, fn));
});

test('主线：两个人各五章、每章三段，id 不重复；每段有台词和选项，选项都写了记下的事', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    assert.strictEqual(c.main.length, 5, k);
    const ids = c.main.flat().map(sc => sc.id);
    assert.strictEqual(ids.length, 15);
    assert.strictEqual(new Set(ids).size, 15);
    assert.ok(ids.every(id => id.startsWith(k)), '主线 id 带人名前缀（换人不会串）');
    c.main.flat().forEach(sc => {
      const info = Theater.scriptInfo(sc.script);
      assert.ok(info.lines >= 8, `${sc.id} 太短`);
      assert.ok(info.asks.length >= 1, `${sc.id} 没有选项`);
      sc.script.filter(s => !Array.isArray(s) && s.ask).forEach(s => s.opts.forEach(o => {
        const n = Theater.normOpt(o);
        assert.ok(n.t && n.r.length >= 1, `${sc.id} 的选项要有回应`);
        assert.ok(n.fact || n.sp === 'later', `${sc.id}「${n.t}」没写记下的事`);
      }));
    });
  }
});

test('主线台词：表情、姿势都画得出来，条件写对了，占位符都认识，CG 都有', () => {
  const FACES = ['开心', '害羞', '担心', '得意', '惊讶', '不服', '平静', '心动', '困', '闪亮', '撑'];
  const VARS = ['you', 'name', 'days', 'meals', 'trains', 'fav', 'lift', 'kg'];
  const PROPS = ['water', 'dawnlight', 'cat', 'book', 'bokeh', 'umbrella', 'window', 'confetti', 'sunrise', 'petals', 'stars', 'mirror', 'sunset', 'spotlight', 'rain'];
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const asks = new Set(c.main.flat().flatMap(sc => Theater.scriptInfo(sc.script).asks));
    const condOk = (cond) => !cond || String(cond).split('&').every(p => /^!?(rel:(romance|friend|none)|has:\w+|seen:\w+|lv>=\d|pick:\w+(=\d)?)$/.test(p.trim()) &&
      (!/pick:/.test(p) || asks.has(p.trim().replace(/^!?pick:/, '').split('=')[0])));
    c.main.flat().forEach(sc => {
      sc.script.forEach(s => { if (!Array.isArray(s)) assert.ok(condOk(s.cond), `${sc.id} 条件写错：${s.cond}`); if (s.cg) assert.ok(c.cgs[s.cg], `${sc.id} 的 CG ${s.cg} 没定义`); });
      walkLines(sc.script, (l) => {
        const [face, text, pose, cond] = l;
        assert.ok(face == null || FACES.includes(face) || /^@\S+$/.test(face), `${sc.id} 表情「${face}」画不出来`);
        assert.ok(!pose || Buddy.POSES.includes(pose), `${sc.id} 姿势 ${pose}`);
        assert.ok(condOk(cond), `${sc.id} 条件写错：${cond}`);
        (String(text).match(/\{(\w+)\}/g) || []).forEach(v => assert.ok(VARS.includes(v.slice(1, -1)), `${sc.id} 不认识的占位符 ${v}`));
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

test('主线口吻：江叙不用感叹号和波浪号；夏柚不叠字、不叫宝宝；两个人都不情感勒索', () => {
  const GUILT = /怎么才来|终于舍得|不理我|丢下我|只有你|离不开|别走|冷落|你不来我/;
  for (const k of ['jx', 'xy']) {
    Cast[k].main.flat().forEach(sc => walkLines(sc.script, ([face, text]) => {
      if (face == null || String(face)[0] === '@') return; // 旁白、别人说的不算
      assert.ok(!GUILT.test(text), `${sc.id}：${text}`);
      assert.ok(!/宝宝|亲爱的/.test(text), `${sc.id}：${text}`);
      if (k === 'jx') assert.ok(!/[！!～~]/.test(text), `江叙用了感叹号：${sc.id}「${text}」`);
      if (k === 'xy') assert.ok(!/(吃饭饭|睡觉觉|喝水水|一下下)/.test(text), `夏柚叠字：${sc.id}「${text}」`);
    }));
  }
});

test('结局：恋人、搭子、还没想好三条线都走得到，各有一张 CG 和结局字幕', () => {
  for (const k of ['jx', 'xy']) {
    const c = Cast[k];
    const fin = c.main[4][2];
    for (const [romance, end] of [[true, 'romance'], [false, 'friend'], [undefined, 'wait']]) {
      const ctx = { romance, picks: {}, seen: [], vars: {} };
      const steps = fin.script.filter(s => !Array.isArray(s) && Theater.evalCond(s.cond, ctx));
      assert.deepStrictEqual(steps.filter(s => s.end).map(s => s.end), [end], `${k} ${end}`);
      assert.strictEqual(steps.filter(s => s.cg).length, 1, `${k} ${end} 的 CG`);
      assert.ok(c.endings[end].title && c.endings[end].last, `${k} ${end} 的字幕`);
      const lines = fin.script.filter(s => Array.isArray(s) && Theater.evalCond(s[3], ctx));
      assert.ok(lines.length >= 10, `${k} ${end} 太短`);
    }
    // 表白：没定关系才问，问的就是 confess（和小剧情「那句话」同一个），三个选项改关系
    const conf = c.main[3][2].script.find(s => !Array.isArray(s) && s.ask === 'confess');
    assert.strictEqual(conf.cond, 'rel:none');
    assert.deepStrictEqual(conf.opts.map(o => Theater.normOpt(o).sp), ['romance', 'friend', 'later']);
  }
});

test('剧本条件和占位符', () => {
  const ctx = { romance: true, picks: { jx4b: 1 }, seen: ['jx1a'], vars: { lift: '深蹲 80 公斤', fav: '' }, lv: 3 };
  assert.ok(Theater.evalCond('rel:romance', ctx));
  assert.ok(!Theater.evalCond('rel:none', ctx));
  assert.ok(Theater.evalCond('pick:jx4b=1&has:lift', ctx));
  assert.ok(!Theater.evalCond('pick:jx4b=0', ctx));
  assert.ok(Theater.evalCond('!pick:jx4b=0&!has:fav&seen:jx1a&lv>=3', ctx));
  assert.ok(!Theater.evalCond('lv>=4', ctx));
  assert.ok(Theater.evalCond('', ctx));
  assert.strictEqual(Theater.fill('{lift}，最重的一次。{nope}', ctx.vars), '深蹲 80 公斤，最重的一次。');
  assert.deepStrictEqual(Theater.normOpt(['好', '嗯。', '记下', 'talk']), { t: '好', r: [['平静', '嗯。']], fact: '记下', sp: 'talk' });
  // 老格式的小剧情也能演：lines + 最后三个选项
  const steps = Theater.toSteps({ lines: [['平静', 'a']], choices: [['x', 'y', '害羞', 'f', 'talk']] });
  assert.strictEqual(steps.length, 2);
  assert.deepStrictEqual(Theater.normOpt(steps[1].opts[0]).r, [['害羞', 'y']]);
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
      assert.match(spec, /^[a-z](\+blush)?$/, `${k} ${face}`);
      if (spec.includes('blush')) assert.ok((s.blush || []).length && s.blush.every(b => b.length === 4 && b.every(Number.isFinite)), `${k} 加腮红要写位置`);
    }
  }
  // 素材不准转发原图：下载缓存、压好的图都不进仓库；清单由脚本生成，页面在 art.js 之前加载
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.ok(/^web\/img\/cast\/$/m.test(ignore) && /^\.art-cache\/$/m.test(ignore));
  const html = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
  assert.ok(html.indexOf('src="img/cast/manifest.js"') > 0 && html.indexOf('src="img/cast/manifest.js"') < html.indexOf('src="js/app/art.js"'));
});
