/**
 * 剧场（v7.0，用户：「能不能搞成像 GalGame 那样？身材、回忆、话多话少这些都融入一个 Galgame 的大系统，有剧情推进」）。
 *
 * 剧情不挤在小气泡里：整屏一个场景——背景、大大的 TA、名字牌、底下一个对话框，一句一句打出来，点一下下一句。
 *
 * v8.0（用户：「点进去一张一张一直玩下去，没有互动、没有玩法、没有代入感；过场、动效也要优化」）：剧本里能写这些——
 *   一行台词 [表情, 话, 姿势?, 条件?]：表情 null 是旁白，「@老周」是别人在说（TA 退到后面），「你」是你说的话；
 *     话里的 {p} 停顿一下，……和句号自动慢一点。
 *   { ask: 'jx2b', opts: [[你说的, TA 回的（几句，也可以夹互动）, 记下的事, 特别标记, { v: { trust: 1 }, need: 条件, tag: 小字 }], …],
 *     timed: 毫秒（限时：不选就是沉默）, silent: [沉默时的回应], silentFact, silentSp }
 *   { touch: 'tap' | 'hold' | 'swipe', target: 图标（cup / leaf / page / umbrella / cat / cheer / hand / hamster / eye / curtain / towel）, prompt, ms（按多久）, ok: [做完以后的台词] }
 *   { rhythm: id, beats: 8, bpm: 92, prompt, ok: [拍准了], meh: [没拍准] }：跟着节拍点，分数记在 story.sv.rhythm_<id>
 *   { input: id, prompt, hint, ctx（这一幕给大模型的说明）, fallback: [大模型回不来时的台词], skip, skipR, fact }：
 *     关键时刻你自己打一句，TA 按人设接（Parser.sceneReply）——用户要的「特殊时候再接 AI」；你说的记进 story.inputs
 *   { name: 'cat', prompt, opts: [几个现成的], max: 字数, r: [起好以后的台词（{cat}）] }：起名字
 *   { promise: 'jxp1' }：约定卡（cast.promises），约好了你在真实的记录里做到，就解锁一段加篇（story.js）
 *   { phone: true / false }：手机聊天的样子（对话变成气泡，TA 打字前有「正在输入…」）；{ typing: 毫秒, drop: true }：正在输入…然后没发（删掉了）
 *   { fx: 'shake' | 'flash' | 'close'（特写）| 'far' | 'sepia'（回忆）| 'nosepia' | 'dark' | 'light' | 'heart' }  { sfx: 音效 }  { amb: 环境声 }
 *   { time: '那天晚上' }：黑场 + 一行字      { bg: 'pool' } 换背景（暗下去再亮）    { cg: 'jx-pool6' } / { cg: '' }    { enter: true } / { exit: true }
 *   { set: { trust: 1 } }：隐藏的好感      { end: 'romance' }：演完放结局字幕
 *   条件：rel:romance / friend / none、pick:jx2b=0（-1 是沉默）、has:lift、seen:jx1a、lv>=3、said:jx4a、v:trust>=2、promise:jxp1、kept:jxp1，& 连，! 取反。
 *   占位符 {you}{name}{days}{meals}{trains}{fav}{lift}{kg}{cat}{page}{said_<input id>}{said}。
 * v8.0 第二轮（用户选了「TA 是 App 里的角色，自己发现了」，要活人感——「说错台词说了两遍，自己也愣住了，这种细节非常好，可以多加」）：
 *   台词第三格写 'sys'：这句是「写好的台词」（台词表上的，嘴自己说出来的）——一下子整句出来、没有说话音、灰一点；
 *     'own'：TA 自己的话（关键时刻大模型接的那几句自动标上，名字牌旁边写「自己的话」）。
 *   { fx: 'glitch' }：画面卡一下      { fx: 'onair' / 'offair' }：电台直播间的红灯亮 / 灭（背景 booth）
 *   { doc: true, hl: 4, add: '…' }：翻开 TA 的人设文档（cast.doc），hl 高亮第几行，add 是 TA 自己手写加上去的一行（记下来，以后再翻开还在）
 *   { recall: '…' }：手机里发出去一条、又撤回了（「江叙撤回了一条消息」）
 *   { memo: '…' }：TA 悄悄写进「小人记住的」（小本本，以后聊天大模型也知道）
 *   { push: { at: '07:00', text: '…' } }：约好的时间，手机真的响一下（安卓通知，标题是 TA 的名字；设置里能关）
 *   { route: true }：按一路上的选择（隐藏的 near 靠近 / brave 往前 / soft 温柔，选项的 v 里记的）定走哪条结局（cast.endings 的 route），
 *     后面的条件写 route:near；{ end: 'auto' } 放这条结局的字幕。
 *   条件还有 act:skip（这一场你按过「跳过」，TA 会发现）、time:morning / day / evening / night / late（现在几点）。
 *   互动 target 还有 mic / tear / wipe（擦掉屏幕上的雨）/ letter；dir: 'down' 往下划（顺着眼角画一滴眼泪）。
 * 剧场里能「回看」「自动」「跳过」（跳到下一个选项 / 互动；互动按默认的走完）。
 * 过场：从小人那儿圆形展开进来、演完收回小人那儿；章节开头有大字卡；立绘会眨眼、呼吸、冒情绪符号。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 小剧情 → 背景（秘密那段江叙在泳池、夏柚在直播间，按 cast.chapterBg 第 2 章的）
  const SCENE_BG = { firstweek: 'room', weekend: 'street', hotpot: 'cafe', sweet: 'cafe', rain: 'rain', night: 'night', confess: 'dusk', date: 'citynight',
    firstpr: 'gym', stuffed: 'roomnight', trainweek: 'gym', lighter: 'dawn' };

  /** 一段话拆成一屏一句（按句号、问号分，太短的并在一起，最多 34 个字一屏） */
  function splitLines(text) {
    const parts = String(text || '').match(/[^。！？!?]+[。！？!?…]*|[^。！？!?]+$/g) || [];
    const out = [];
    parts.map(x => x.trim()).filter(Boolean).forEach(p => {
      const last = out[out.length - 1];
      if (last && (last + p).length <= 34 && (last.length < 12 || p.length < 8)) out[out.length - 1] = last + p;
      else out.push(p);
    });
    return out;
  }

  /** 第几章：一二三四五 */
  const CN = ['一', '二', '三', '四', '五'];

  /** 现在算不算「早上 / 白天 / 傍晚 / 晚上 / 深夜」 */
  function timeOk(k, h) {
    if (h == null) h = new Date().getHours();
    return k === 'morning' ? h >= 5 && h < 10 : k === 'day' ? h >= 10 && h < 17 : k === 'evening' ? h >= 17 && h < 22
      : k === 'night' ? h >= 22 || h < 5 : k === 'late' ? h >= 23 || h < 5 : false;
  }

  /** 条件：ctx = { picks, seen, romance, vars, lv, inputs, sv, promises, route, acts, hour } */
  function evalCond(cond, ctx) {
    if (!cond) return true;
    ctx = ctx || {};
    return String(cond).split('&').every(part => {
      let p = part.trim();
      const neg = p[0] === '!';
      if (neg) p = p.slice(1);
      let ok = false;
      const lv = p.match(/^lv>=(\d)$/);
      const v = p.match(/^v:(\w+)(?:>=(-?\d+))?$/);
      const m = p.match(/^(\w+):(.+)$/);
      if (lv) ok = (ctx.lv || 1) >= +lv[1];
      else if (v) { const x = +((ctx.sv || {})[v[1]] || 0); ok = v[2] == null ? x > 0 : x >= +v[2]; }
      else if (m && m[1] === 'rel') ok = m[2] === 'none' ? ctx.romance == null : m[2] === 'romance' ? ctx.romance === true : m[2] === 'friend' ? ctx.romance === false : false;
      else if (m && m[1] === 'pick') {
        const [id, k] = m[2].split('=');
        const val = (ctx.picks || {})[id];
        ok = k == null ? val != null : val === +k;
      } else if (m && m[1] === 'has') ok = !!(ctx.vars || {})[m[2]];
      else if (m && m[1] === 'seen') ok = (ctx.seen || []).includes(m[2]);
      else if (m && m[1] === 'said') ok = !!(ctx.inputs || {})[m[2]];
      else if (m && m[1] === 'promise') { const pr = (ctx.promises || {})[m[2]]; ok = !!(pr && !pr.declined); }
      else if (m && m[1] === 'kept') ok = !!((ctx.promises || {})[m[2]] || {}).done;
      else if (m && m[1] === 'route') ok = ctx.route === m[2];
      else if (m && m[1] === 'act') ok = !!((ctx.acts || {})[m[2]]);
      else if (m && m[1] === 'time') ok = timeOk(m[2], ctx.hour);
      return neg ? !ok : ok;
    });
  }

  /** {name} 这些换成你自己的；没有的换成空 */
  function fill(text, vars) {
    return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (_, k) => (k === 'p' ? '' : vars && vars[k] != null ? String(vars[k]) : ''));
  }

  /** 选项统一成 { t, r: [[表情, 话, 姿势] 或互动], fact, sp, v, need, tag } */
  function normOpt(o) {
    if (!Array.isArray(o)) return Object.assign({ fact: '' }, o, { r: typeof o.r === 'string' ? (o.r ? [['平静', o.r]] : []) : o.r || [] });
    const x = o[4] || {};
    return { t: o[0], r: typeof o[1] === 'string' ? (o[1] ? [['平静', o[1]]] : []) : o[1] || [], fact: o[2] || '', sp: o[3], v: x.v, need: x.need, tag: x.tag };
  }

  /** 老格式（lines + 最后三个选项）→ 剧本 */
  function toSteps(sc) {
    if (sc.script) return sc.script.slice();
    const steps = (sc.lines || []).slice();
    if ((sc.choices || []).length) {
      steps.push({ ask: sc.askId || '_', opts: sc.choices.map(c => ({ t: c[0], r: c[1] ? [[c[2] || '平静', c[1]]] : [], fact: c[3] || '', sp: c[4], raw: c })) });
    }
    return steps;
  }

  // 剧本里认得的步骤（测试用：写错了一眼看出来）
  const STEP_KEYS = ['ask', 'opts', 'timed', 'silent', 'silentFact', 'silentSp', 'cond', 'cg', 'bg', 't', 'end', 'look', 'fx', 'sfx', 'amb', 'set', 'phone', 'typing', 'drop',
    'time', 'wait', 'enter', 'exit', 'touch', 'target', 'prompt', 'ms', 'ok', 'meh', 'rhythm', 'beats', 'bpm', 'input', 'hint', 'ctx', 'fallback', 'skip', 'skipR', 'fact',
    'name', 'max', 'r', 'promise', 'doc', 'hl', 'add', 'recall', 'memo', 'push', 'route', 'dir'];

  /** 剧本里有哪些选项、CG、结局、互动（测试、相册用） */
  function scriptInfo(script) {
    const out = { asks: [], cgs: [], ends: [], lines: 0, touch: 0, rhythm: [], inputs: [], names: [], promises: [], timed: 0, phone: 0, steps: [], docs: 0, memos: [], pushes: [], recalls: 0, routes: 0, sys: 0 };
    const walk = (steps) => (steps || []).forEach(s => {
      if (Array.isArray(s)) { out.lines += 1; if (s[2] === 'sys') out.sys += 1; return; }
      if (!s) return;
      out.steps.push(s);
      if (s.ask) { out.asks.push(s.ask); if (s.timed) out.timed += 1; (s.opts || []).forEach(o => walk(normOpt(o).r)); walk(s.silent); }
      if (s.cg) out.cgs.push(s.cg);
      if (s.end) out.ends.push(s.end);
      if (s.touch) { out.touch += 1; walk(s.ok); }
      if (s.rhythm) { out.rhythm.push(s.rhythm); walk(s.ok); walk(s.meh); }
      if (s.input) { out.inputs.push(s.input); walk(s.fallback); walk(s.skipR); }
      if (s.name) { out.names.push(s.name); walk(s.r); }
      if (s.promise) out.promises.push(s.promise);
      if (s.phone) out.phone += 1;
      if (s.doc) out.docs += 1;
      if (s.memo) out.memos.push(s.memo);
      if (s.push) out.pushes.push(s.push);
      if (s.recall) out.recalls += 1;
      if (s.route) out.routes += 1;
    });
    walk(script);
    return out;
  }

  /** 节拍点了几下准的：每一拍前后 tol 毫秒内有一下就算（一下只算一拍） */
  function rhythmScore(taps, beats, tol) {
    const used = new Set();
    let n = 0;
    (beats || []).forEach(b => {
      const i = (taps || []).findIndex((t, k) => !used.has(k) && Math.abs(t - b) <= tol);
      if (i >= 0) { used.add(i); n += 1; }
    });
    return n;
  }

  /** 像素小道具（CG 里用）：一行一个字符，'.' 是空，别的字符按调色板上色 */
  function pixSvg(rows, pal) {
    const w = rows[0].length, h = rows.length;
    let rects = '';
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[ch]}"/>`; }));
    return `<svg viewBox="0 0 ${w} ${h}" width="${w * 8}" height="${h * 8}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  }
  const PROPS = {
    // 泳池边那只橘猫（江叙三年没摸到过）
    cat: pixSvg(['..O.....O..', '..OO...OO..', '..OOOOOOO..', '..OEOOOEO..', '..OOOPOOO..', '...OOOOO...', '..OOWWWOO..', '.OOOWWWOOOT', '.OOOOOOOOOT', '.OO.OOO.OOT'],
      { O: '#f0a050', E: '#2a1a10', P: '#ff8fa3', W: '#fde6c8', T: '#d9853a' }),
    // 一把伞（下雨那天，他站你右边）
    umbrella: pixSvg(['.....RRR.....', '...RRRRRRR...', '..RRrRRRrRR..', '.RRRrRRRrRRR.', 'RRRRrRRRrRRRR', 'R.R.R.R.R.R.R', '......H......', '......H......', '......H......', '......H......', '...H..H......', '....HH.......'],
      { R: '#ff7a9a', r: '#e25b80', H: '#5a4636' }),
    // 搭子本 / 训练本
    book: pixSvg(['..WWWW.WWWW..', '.WLLWWBWWLLW.', '.WWWWWBWWWWW.', '.WLLLWBWLLLW.', '.WWWWWBWWWWW.', '.WLLWWBWWLLW.', 'CCCCCCBCCCCCC', '.CCCCCCCCCCC.'],
      { W: '#f6f1e6', L: '#b9b2a4', B: '#8a5a3c', C: '#c0603c' })
  };

  // 互动的图标（线条画，跟着主题色）
  const ic = (d) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    cup: ic('<path d="M13 16h20v14a8 8 0 0 1-8 8h-4a8 8 0 0 1-8-8z"/><path d="M33 20h3a4 4 0 0 1 0 8h-3"/><path d="M19 6c-2 3 2 4 0 7M26 6c-2 3 2 4 0 7"/>'),
    leaf: ic('<path d="M10 38C10 20 22 10 38 10c0 16-10 28-28 28z"/><path d="M10 38 28 20"/>'),
    page: ic('<path d="M12 8h17l9 9v23H12z"/><path d="M29 8v9h9"/><path d="M18 26h14M18 32h10"/>'),
    umbrella: ic('<path d="M6 24a18 18 0 0 1 36 0z"/><path d="M24 24v12a4 4 0 0 1-8 0"/><path d="M24 6v2"/>'),
    cat: ic('<path d="M12 20 10 8l8 6h12l8-6-2 12"/><path d="M12 20c0 10 5 16 12 16s12-6 12-16"/><path d="M19 24h.01M29 24h.01"/><path d="M22 29c1 1 3 1 4 0"/>'),
    cheer: ic('<path d="M8 20v8l22 8V12z"/><path d="M30 16a8 8 0 0 1 0 16"/><path d="M36 10a14 14 0 0 1 0 28"/>'),
    hand: ic('<path d="M16 26V12a3 3 0 0 1 6 0v10"/><path d="M22 20v-9a3 3 0 0 1 6 0v11"/><path d="M28 21v-6a3 3 0 0 1 6 0v12c0 7-5 12-11 12s-9-3-12-8l-4-7a3 3 0 0 1 5-3l2 3"/>'),
    hamster: ic('<circle cx="24" cy="27" r="13"/><circle cx="14" cy="15" r="4"/><circle cx="34" cy="15" r="4"/><path d="M20 25h.01M28 25h.01"/><path d="M22 30c1 1 3 1 4 0"/>'),
    eye: ic('<path d="M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24z"/><circle cx="24" cy="24" r="6"/>'),
    curtain: ic('<path d="M8 8h32"/><path d="M12 8c0 12 4 20 8 32"/><path d="M36 8c0 12-4 20-8 32"/><path d="M20 40h8"/>'),
    heart: ic('<path d="M24 40S8 30 8 18a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 12-16 22-16 22z"/>'),
    towel: ic('<path d="M10 10h28v8H10z"/><path d="M14 18v20h20V18"/><path d="M20 24h8M20 30h8"/>'),
    mic: ic('<rect x="17" y="6" width="14" height="22" rx="7"/><path d="M11 22a13 13 0 0 0 26 0"/><path d="M24 35v7M17 42h14"/>'),
    tear: ic('<path d="M24 6C19 15 14 22 14 29a10 10 0 0 0 20 0c0-7-5-14-10-23z"/><path d="M19 30a5 5 0 0 0 5 5"/>'),
    wipe: ic('<path d="M8 14c4 0 4 4 8 4s4-4 8-4 4 4 8 4 4-4 8-4"/><path d="M8 24c4 0 4 4 8 4s4-4 8-4 4 4 8 4 4-4 8-4"/><path d="M12 36h24"/>'),
    letter: ic('<rect x="7" y="12" width="34" height="24" rx="3"/><path d="M7 15l17 12 17-12"/>')
  };

  // 情绪符号：不服冒青筋、担心冒汗、惊讶「!」、得意闪光、困了「z」（害羞、心动是爱心，另外画）
  const EMOTES = {
    不服: '<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="#ff5a6e" stroke-width="4" stroke-linecap="round"><path d="M14 6c0 6 2 8 8 8"/><path d="M26 6c0 6-2 8-8 8" transform="translate(0 0)"/><path d="M14 34c0-6 2-8 8-8"/><path d="M26 34c0-6-2-8-8-8"/></g></svg>',
    担心: '<svg viewBox="0 0 30 40" aria-hidden="true"><path d="M15 4C11 13 7 19 7 25a8 8 0 0 0 16 0c0-6-4-12-8-21z" fill="#8fd3ff" stroke="#3a9ad9" stroke-width="2"/></svg>',
    惊讶: '<b class="emo-txt">!</b>',
    得意: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2l3 12 12 3-12 3-3 12-3-12-12-3 12-3z" fill="#ffe08a"/><path d="M33 26l1.5 5 5 1.5-5 1.5L33 39l-1.5-5-5-1.5 5-1.5z" fill="#fff3c4"/></svg>',
    闪亮: '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2l3 12 12 3-12 3-3 12-3-12-12-3 12-3z" fill="#ffe08a"/><path d="M33 26l1.5 5 5 1.5-5 1.5L33 39l-1.5-5-5-1.5 5-1.5z" fill="#fff3c4"/></svg>',
    困: '<b class="emo-txt z">z<small>z</small></b>'
  };

  TF.Theater = { SCENE_BG, splitLines, CN, evalCond, timeOk, fill, normOpt, toSteps, scriptInfo, rhythmScore, STEP_KEYS, PROPS, ICONS, EMOTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Theater;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 第 lv 章叫什么（「第三章 · 搭子」） */
  chapterLabel(lv) {
    const c = this.cast();
    const t = (c.chapters || [])[lv - 1] || (TF.Bond.LEVELS[lv - 1] || {}).name || '';
    return `第${TF.Theater.CN[lv - 1] || lv}章 · ${t}`;
  },

  theaterEl() {
    let el = document.getElementById('theater');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'theater';
    el.className = 'theater hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '剧情');
    el.innerHTML = '<div class="th-bg"></div><div class="th-fx" aria-hidden="true"></div><div class="th-cgimg" aria-hidden="true"></div><div class="th-cgfx" aria-hidden="true"></div>' +
      '<div class="th-top"><span class="th-label"></span><span class="th-tools">' +
      '<button class="th-tool th-log-btn" type="button" aria-label="回看刚才的话">回看</button>' +
      '<button class="th-tool th-auto" type="button" aria-label="自动播放">自动</button>' +
      '<button class="th-tool th-skip" type="button" aria-label="跳到下一个选项">跳过 ›</button></span></div>' +
      '<div class="th-cgtag" aria-hidden="true"></div>' +
      '<div class="th-stage"><div class="th-actor"></div><div class="th-emote" aria-hidden="true"></div><div class="th-hearts" aria-hidden="true"></div></div>' +
      '<div class="th-phone" aria-live="polite"><div class="th-ph-head"><span class="th-ph-ava"></span><span class="th-ph-name"></span><small class="th-ph-state"></small></div><div class="th-ph-list"></div><span class="th-ph-more" aria-hidden="true">▼</span></div>' +
      '<div class="th-choices"></div>' +
      '<div class="th-box"><div class="th-name"></div><p class="th-text"></p><span class="th-more" aria-hidden="true">▼</span></div>' +
      '<div class="th-act"></div>' +
      '<div class="th-card" aria-hidden="true"><small class="th-card-label"></small><b class="th-card-title"></b><i class="th-card-line"></i><span class="th-card-sub"></span></div>' +
      '<div class="th-time" aria-hidden="true"><span></span></div><div class="th-flash" aria-hidden="true"></div>' +
      '<div class="th-onair" aria-hidden="true">ON AIR</div><div class="th-glass" aria-hidden="true"></div>' +
      '<div class="th-doc hidden" role="document"></div><div class="th-toast" aria-live="polite"></div>' +
      '<div class="th-log hidden"><div class="th-log-head">回看<button class="th-tool th-log-close" type="button">关闭</button></div><div class="th-log-list"></div></div>' +
      '<div class="th-credits hidden"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const s = this._scene;
      if (!s) return;
      if (e.target.closest('.th-credits')) { if (e.target.closest('.th-done')) this.theaterClose(); return; }
      if (e.target.closest('.th-log')) { el.querySelector('.th-log').classList.add('hidden'); return; }
      if (s.phase === 'doc') { this.sceneDocClose(); return; }
      if (e.target.closest('.th-log-btn')) { this.sceneLog(); return; }
      if (e.target.closest('.th-auto')) { this.sceneAuto(!s.auto); return; }
      if (e.target.closest('.th-skip')) { this.sceneSkip(); return; }
      if (e.target.closest('.th-act')) return; // 互动自己处理
      const b = e.target.closest('.th-choice');
      if (b) { this.sceneChoose(+b.dataset.k); return; }
      if (['choose', 'credits', 'act', 'wait', 'doc'].includes(s.phase)) return;
      this.sceneTap();
    });
    return el;
  },

  /** 剧本条件要看的：选过什么、看过什么、你们的关系、你的数字、第几章、你说过的话、隐藏好感、约定 */
  sceneCtx() {
    const st = this.storyData ? this.storyData() : {};
    const s = this._scene;
    return { picks: Object.assign({}, st.picks || {}, s ? s.picks : {}), seen: st.seen || [], romance: st.romance, vars: s ? s.vars : {}, lv: this.bond ? this.bond().lv : 1,
      inputs: Object.assign({}, st.inputs || {}, s ? s.inputs : {}), sv: Object.assign({}, st.sv || {}, s ? s.sv : {}), promises: st.promises || {},
      route: s ? s.route : null, acts: { skip: !!(s && s.skipped) }, hour: new Date().getHours() };
  },

  /**
   * 演一场。sc：{ label（左上角「第三章 · 搭子」）, title（开场的大字，没有就不出）, sub（章节开头大字下面那句）, bg, amb（环境声）,
   *   from（从哪儿展开进来：小人的位置 {x, y}）, replay（重看：选的不记）,
   *   script（剧本，见文件开头）或者老格式 lines + choices,
   *   onChoose(k, 选项, askId) → 可以返回 { pose, outfit }, onEnd(选过没有, 跳过没有, 结局), viewer（相册里看一张）, after（关掉以后接着做的） }
   */
  playScene(sc) {
    if (this._scene || !sc) return false;
    const steps = TF.Theater.toSteps(sc);
    if (!steps.length) return false;
    const el = this.theaterEl();
    const pop = document.getElementById('buddy-pop');
    if (pop) pop.classList.add('hidden');
    let auto = false;
    try { auto = localStorage.getItem('tf_th_auto') === '1'; } catch (e) {}
    this._scene = { sc, steps, i: -1, phase: 'card', face: '', look: sc.look || null, log: [], auto, cg: '', phone: false, picks: {}, inputs: {}, sv: {},
      vars: this.storyVars ? this.storyVars() : {} };
    this.sceneTimersClear();
    this.sceneBg(sc.bg);
    el.dataset.cg = '';
    el.querySelector('.th-label').textContent = sc.label || '';
    el.querySelector('.th-name').textContent = this.buddyName();
    el.querySelector('.th-choices').innerHTML = '';
    el.querySelector('.th-text').textContent = '';
    el.querySelector('.th-actor').innerHTML = '';
    el.querySelector('.th-emote').innerHTML = '';
    el.querySelector('.th-act').innerHTML = '';
    el.querySelector('.th-ph-list').innerHTML = '';
    el.querySelector('.th-cgfx').innerHTML = '';
    el.querySelector('.th-cgtag').textContent = '';
    el.querySelector('.th-log').classList.add('hidden');
    el.querySelector('.th-credits').classList.add('hidden');
    el.querySelector('.th-auto').classList.toggle('on', auto);
    el.querySelector('.th-tools').classList.toggle('hidden', !!sc.viewer);
    el.querySelector('.th-cgimg').style.backgroundImage = '';
    el.classList.remove('hidden', 'closing', 'choosing', 'narr', 'other', 'me', 'in-cg', 'cg-art', 'rolling', 'phone', 'acting', 'has-sprite', 'fx-close', 'fx-sepia', 'fx-dark', 'iris-out',
      'sys-line', 'own-line', 'onair', 'glass-rain');
    el.querySelector('.th-doc').classList.add('hidden');
    document.body.classList.add('in-theater');
    // 从小人那儿圆形展开（没有位置就淡入）
    const from = sc.from;
    el.style.setProperty('--ix', from ? `${Math.round(from.x)}px` : '50%');
    el.style.setProperty('--iy', from ? `${Math.round(from.y)}px` : '82%');
    el.classList.remove('iris-in');
    void el.offsetWidth;
    if (!this.reducedMotion()) {
      el.classList.add('iris-in');
      // 像素小人放大、散开，变成剧场里的 TA（「像素一格一格拼起来」）
      if (from) this.sceneMorph('in');
      if (window.Sound) window.Sound.play('swoosh');
    }
    if (sc.amb && window.Sound && window.Sound.amb) window.Sound.amb(sc.amb);
    // TA 一开场就站在那儿（接住像素小人放大散开的那一下）；开头就是手机聊天的段落不站
    if (!sc.viewer && !steps.slice(0, 4).some(x => x && !Array.isArray(x) && x.phone === true)) {
      const actor = el.querySelector('.th-actor');
      actor.innerHTML = this.sceneActor('平静', 'stand', this._scene.look);
      this._scene.face = '平静';
      actor.classList.remove('th-enter', 'th-exit'); void actor.offsetWidth;
      actor.classList.add('th-enter');
    }
    const card = el.querySelector('.th-card');
    if (sc.title) {
      card.querySelector('.th-card-label').textContent = sc.label || '';
      card.querySelector('.th-card-title').textContent = sc.title;
      card.querySelector('.th-card-sub').textContent = sc.sub || '';
      card.classList.toggle('big', !!sc.sub);
      card.classList.remove('show');
      void card.offsetWidth;
      card.classList.add('show');
      clearTimeout(this._cardT);
      this._cardT = setTimeout(() => { if (this._scene && this._scene.phase === 'card') this.sceneTap(); }, this.reducedMotion() ? 700 : sc.sub ? 3200 : 1700);
    } else {
      card.classList.remove('show');
      this.sceneNext();
    }
    if (window.Sound) window.Sound.play('unlock', 0.45);
    window.Haptics && window.Haptics.fire('tap');
    return true;
  },

  sceneTimersClear() {
    clearTimeout(this._thTypeT); clearInterval(this._typeT); clearTimeout(this._autoT); clearTimeout(this._cardT);
    clearTimeout(this._waitT); clearTimeout(this._askTimer); clearTimeout(this._phT);
    (this._rhyT || []).forEach(t => clearTimeout(t)); this._rhyT = [];
    if (this._holdRaf) cancelAnimationFrame(this._holdRaf);
  },

  /** 点一下：开场大字收起 / 黑场字收起 / 正在输入跳过 / 还在打字就打完 / 下一句 */
  sceneTap() {
    const s = this._scene;
    if (!s) return;
    const el = this.theaterEl();
    if (s.phase === 'card') { el.querySelector('.th-card').classList.remove('show'); clearTimeout(this._cardT); this.sceneNext(); return; }
    if (s.phase === 'time') { this.sceneTimeEnd(); return; }
    if (s.phase === 'phtype') { if (this._phNow) this._phNow(); return; }
    const text = el.querySelector('.th-text');
    if (!s.phone && text.querySelector('.type-ghost')) { clearTimeout(this._thTypeT); text.textContent = s.line || ''; this.sceneAutoNext(); return; }
    window.Haptics && window.Haptics.fire('tick');
    this.sceneNext();
  },

  /** 往下走：条件不满足的跳过，换背景 / CG / 特效顺手做了，遇到台词、选项、互动停下来，没了就收场 */
  sceneNext() {
    const s = this._scene;
    if (!s) return;
    clearTimeout(this._autoT);
    for (;;) {
      s.i += 1;
      const step = s.steps[s.i];
      if (step == null) { this.sceneEnd(false); return; }
      const ctx = this.sceneCtx();
      if (Array.isArray(step)) {
        if (!TF.Theater.evalCond(step[3], ctx)) continue;
        s.phase = 'line';
        this.sceneLine(step);
        return;
      }
      if (step.cond && !TF.Theater.evalCond(step.cond, ctx)) continue;
      if (step.recall) { this.sceneRecall(step); return; }
      if (this.sceneQuick(step)) {
        if (step.typing) { this.sceneTyping(step); return; }
        if (step.time) { this.sceneTime(step.time); return; }
        if (step.wait) { s.phase = 'wait'; this._waitT = setTimeout(() => { if (this._scene === s) { s.phase = 'line'; this.sceneNext(); } }, step.wait); return; }
        continue;
      }
      if (step.ask) { this.sceneAsk(step); return; }
      if (step.touch) { this.sceneTouch(step); return; }
      if (step.rhythm) { this.sceneRhythm(step); return; }
      if (step.input) { this.sceneInput(step); return; }
      if (step.name) { this.sceneName(step); return; }
      if (step.promise) { if (this.scenePromise(step)) return; continue; }
      if (step.doc) { this.sceneDoc(step); return; }
    }
  },

  /** 不用停下来的步骤：背景、环境声、CG、样子、结局、特效、音效、隐藏好感、手机模式、进场出场。返回 true 表示这一步做完了（或者是要等一下的） */
  sceneQuick(step, skipping) {
    const s = this._scene;
    const el = this.theaterEl();
    if (step.bg) this.sceneBg(step.bg, skipping ? 'cut' : step.t || 'dip');
    if (step.amb != null && window.Sound && window.Sound.amb) window.Sound.amb(step.amb);
    if (step.cg != null) this.sceneCg(step.cg);
    if (step.look) s.look = Object.assign({}, s.look || {}, step.look);
    if (step.route) this.sceneRoute();
    if (step.end) s.ending = step.end === 'auto' ? this.routeEnding() : step.end;
    if (step.memo) this.sceneMemo(step.memo, skipping);
    if (step.push) this.scenePush(step.push, skipping);
    if (step.fx) this.sceneFx(step.fx, skipping);
    if (step.sfx && !skipping && window.Sound) window.Sound.play(step.sfx);
    if (step.set) this.sceneSet(step.set);
    if (step.phone != null) this.scenePhone(!!step.phone);
    if (step.enter || step.exit) {
      const a = el.querySelector('.th-actor');
      a.classList.remove('th-enter', 'th-exit');
      if (!skipping) { void a.offsetWidth; a.classList.add(step.exit ? 'th-exit' : 'th-enter'); }
      el.classList.toggle('actor-out', !!step.exit);
    }
    return !(step.ask || step.touch || step.rhythm || step.input || step.name || step.promise || step.doc);
  },

  /**
   * TA 在剧场里的样子：有立绘就用立绘（galgame 级美术，art.js 按表情取图），没有就用像素小人放大。
   * 立绘不跟着换装 / 姿势变（那是像素小人的事），只换表情；会眨眼（闭眼那张只露出眼睛那一块，叠在上面）、会呼吸。
   */
  sceneActor(face, pose, look) {
    const ch = this.castKey();
    const url = TF.Art ? TF.Art.sprite(ch, face) : '';
    // has-sprite：立绘是大半身，站到对话框后面去（像 galgame 那样框住下半身），选项挪到对话框上面，别挡脸
    this.theaterEl().classList.toggle('has-sprite', !!url);
    // 哭、泪笑没有自己那张图（退回了担心、开心 / 像素小人）：剧场自己在眼角画一滴往下流的眼泪
    const crying = /^(哭|泪笑)$/.test(face) && !(url && TF.Art.has && TF.Art.has(ch, face));
    if (url) {
      const bl = TF.Art.blink ? TF.Art.blink(ch, face) : null;
      const delay = (1.2 + Math.random() * 3).toFixed(2);
      const eye = bl && String(bl.inset).split(/\s+/).map(parseFloat);
      const tear = crying ? `<i class="th-tear" style="${eye && eye.length === 4 ? `top:${(100 - eye[2]).toFixed(1)}%;left:${(eye[3] + 3).toFixed(1)}%` : ''}"></i>` : '';
      return `<span class="th-spr" style="--blink-delay:${delay}s"><img class="th-sprite" src="${esc(url)}" alt="" onerror="app.spriteFail(this)">` +
        (bl && !crying ? `<img class="th-blink" src="${esc(bl.url)}" alt="" style="clip-path:inset(${bl.inset})" onerror="this.remove()">` : '') + tear + '</span>';
    }
    return TF.Buddy.svg(this.buddyArt(Object.assign({ pose: pose || 'stand', face, gear: [], scale: 8 }, look || {}))) + (crying ? '<i class="th-tear px"></i>' : '');
  },

  /** 立绘加载失败（清单在、图没打进包）：记下这张，换回像素小人 */
  spriteFail(img) {
    if (TF.Art) TF.Art.fail(img.getAttribute('src'));
    const s = this._scene;
    const box = img.closest('.th-actor') || img.parentNode;
    if (box) box.innerHTML = this.sceneActor((s && s.face) || '平静', 'stand', s && s.look);
  },

  /** 背景：有背景图用图，没有就是 CSS 画的；换背景时暗下去再亮起来（t: 'cut' 直接换、'flash' 闪白） */
  sceneBg(id, t) {
    const el = this.theaterEl();
    const next = id || 'room';
    const apply = () => {
      el.dataset.bg = next;
      const url = TF.Art ? TF.Art.bg(next) : '';
      el.querySelector('.th-bg').style.backgroundImage = url ? `url("${url}")` : '';
      el.classList.toggle('bg-art', !!url);
    };
    if (!t || t === 'cut' || this.reducedMotion() || el.dataset.bg === next) { apply(); return; }
    if (t === 'flash') { this.sceneFx('flash'); apply(); return; }
    el.classList.add('bg-dip');
    setTimeout(() => { apply(); el.classList.remove('bg-dip'); }, 260);
  },

  /** 谁在说：null 旁白（''），「@老周」别人，「你」是你，其余是 TA */
  sceneWho(face) {
    if (face == null) return '';
    if (face === '你') return '你';
    return String(face)[0] === '@' ? String(face).slice(1) : this.buddyName();
  },

  /** 一句：TA 的样子跟着表情换（眨眼、冒情绪符号、说话轻轻一顿），话一个字一个字打出来（标点慢一点） */
  sceneLine(line, look) {
    const s = this._scene;
    const face = line[0];
    const text = TF.Theater.fill(line[1], s.vars);
    // 第三格 'sys'：写好的台词（嘴自己说出来的）；'own'：TA 自己的话。这两个不是姿势
    const special = line[2] === 'sys' || line[2] === 'own' ? line[2] : '';
    const pose = special ? undefined : line[2];
    const el = this.theaterEl();
    s.line = text;
    el.classList.toggle('sys-line', special === 'sys');
    el.classList.toggle('own-line', special === 'own');
    if (s.phone) { this.sceneBubble(face, text, special); return; }
    const other = typeof face === 'string' && face[0] === '@';
    const me = face === '你';
    // 表情写 null 的是旁白：不挂名字牌；「@老周」是别人在说：名字牌换成他，TA 退到后面；「你」是你说的
    el.classList.toggle('narr', face == null);
    el.classList.toggle('other', other);
    el.classList.toggle('me', me);
    el.querySelector('.th-name').textContent = this.sceneWho(face);
    s.log.push({ who: this.sceneWho(face), text });
    if (face != null && !other && !me) {
      const actor = el.querySelector('.th-actor');
      if (look) s.look = Object.assign({}, s.look || {}, look);
      const cg = s.cg && this.cgDef(s.cg);
      if (face !== s.face || !actor.innerHTML) actor.innerHTML = this.sceneActor(face, (cg && cg.pose) || pose, Object.assign({}, s.look || {}, cg && cg.outfit ? { outfit: cg.outfit } : {}));
      // 表情动起来：开心、得意蹦一下，不服抖一下，害羞、心动冒爱心，别的冒符号；同一个表情接着说就轻轻一顿
      actor.classList.remove('th-hop', 'th-shake', 'th-talk', 'th-enter');
      void actor.offsetWidth;
      actor.classList.remove('th-startle', 'th-droop', 'th-sway', 'th-lean', 'th-doze');
      if (face !== s.face) {
        // 立绘的动作：开心蹦一下、不服抖一下、惊讶往后一缩、担心低一下头、害羞晃一晃、心动往前凑、困了慢慢点头
        const move = { 开心: 'th-hop', 得意: 'th-hop', 闪亮: 'th-hop', 不服: 'th-shake', 惊讶: 'th-startle', 担心: 'th-droop', 害羞: 'th-sway', 心动: 'th-lean', 困: 'th-doze', 哭: 'th-droop', 泪笑: 'th-sway' }[face];
        if (move) actor.classList.add(move);
        if (/害羞|心动/.test(face)) this.sceneHearts();
        else this.sceneEmote(face);
      } else actor.classList.add('th-talk');
      if (el.classList.contains('actor-out')) { el.classList.remove('actor-out'); actor.classList.add('th-enter'); }
      s.face = face;
    }
    // 写好的台词：整句一下子出来，像按了一个键（没有说话音，只有很轻的一声「嗒」）
    if (special === 'sys') {
      clearTimeout(this._thTypeT);
      el.querySelector('.th-text').textContent = text;
      if (window.Sound && !this.reducedMotion()) window.Sound.play('tick');
      this.sceneAutoNext();
      return;
    }
    this.sceneType(el.querySelector('.th-text'), text);
  },

  /** 剧场里的打字：一个字一个字，逗号停一下、句号停久一点、……慢慢出；{p} 停顿 */
  sceneType(el, text) {
    clearTimeout(this._thTypeT);
    clearInterval(this._typeT);
    const s = this._scene;
    const raw = String(text || '');
    const clean = raw.replace(/\{p\}/g, '');
    if (s) s.line = clean;
    if (this.reducedMotion() || !clean) { el.textContent = clean; this.sceneAutoNext(); return; }
    if (window.Sound && window.Sound.babble && el.closest('.th-box') && !(s && s.phone)) window.Sound.babble(clean, this.cast ? this.cast().sex : 'm');
    const parts = [];
    raw.split(/(\{p\})/).forEach(p => { if (p === '{p}') parts.push({ pause: 450 }); else [...p].forEach(ch => parts.push({ ch })); });
    const chars = parts.filter(x => x.ch).map(x => x.ch);
    let i = 0, k = 0;
    const draw = () => { el.innerHTML = esc(chars.slice(0, i).join('')) + `<span class="type-ghost">${esc(chars.slice(i).join(''))}</span>`; };
    draw();
    const tick = () => {
      if (!el.isConnected || this._scene !== s) return;
      let delay = 34;
      while (k < parts.length && parts[k].pause) { delay += parts[k].pause; k += 1; }
      if (k < parts.length) { i += 1; k += 1; }
      if (i >= chars.length) { el.textContent = clean; this.sceneAutoNext(); return; }
      draw();
      const ch = chars[i - 1];
      delay += /[，、]/.test(ch) ? 110 : /[。！？!?]/.test(ch) ? 230 : ch === '…' ? 80 : 0;
      this._thTypeT = setTimeout(tick, delay);
    };
    this._thTypeT = setTimeout(tick, 40);
  },

  sceneHearts() {
    if (this.reducedMotion()) return;
    const box = this.theaterEl().querySelector('.th-hearts');
    box.innerHTML = [0, 1, 2].map(i => `<i style="--d:${i * 0.18}s;--x:${(i - 1) * 34}px">♥</i>`).join('');
    clearTimeout(this._heartT);
    this._heartT = setTimeout(() => { box.innerHTML = ''; }, 1800);
  },

  /** 情绪符号（不服冒青筋、担心冒汗、惊讶「!」、得意闪光、困了「z」），一秒多自己没了 */
  sceneEmote(face) {
    const svg = TF.Theater.EMOTES[face];
    const box = this.theaterEl().querySelector('.th-emote');
    if (!svg || this.reducedMotion()) { box.innerHTML = ''; return; }
    box.innerHTML = `<span class="emo emo-${face === '不服' ? 'anger' : face === '担心' ? 'sweat' : face === '惊讶' ? 'bang' : face === '困' ? 'zz' : 'spark'}">${svg}</span>`;
    clearTimeout(this._emoT);
    this._emoT = setTimeout(() => { box.innerHTML = ''; }, 1700);
  },

  /** 特效：特写 / 拉远 / 抖 / 闪白 / 回忆（泛黄）/ 暗 / 心跳 */
  sceneFx(fx, skipping) {
    const el = this.theaterEl();
    const once = (cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
    if (fx === 'close') el.classList.add('fx-close');
    else if (fx === 'far') el.classList.remove('fx-close');
    else if (fx === 'sepia') el.classList.add('fx-sepia');
    else if (fx === 'nosepia') el.classList.remove('fx-sepia');
    else if (fx === 'dark') el.classList.add('fx-dark');
    else if (fx === 'light') el.classList.remove('fx-dark');
    else if (fx === 'onair') { el.classList.add('onair'); if (!skipping && window.Sound) window.Sound.play('tick'); }
    else if (fx === 'offair') el.classList.remove('onair');
    else if (skipping || this.reducedMotion()) return;
    else if (fx === 'shake') { once('fx-shake', 460); window.Haptics && window.Haptics.fire('tap'); }
    else if (fx === 'flash') once('fx-flash', 700);
    else if (fx === 'heart') { once('fx-heart', 1300); window.Haptics && window.Haptics.fire('success'); if (window.Sound) window.Sound.play('heart'); }
    else if (fx === 'glitch') { once('fx-glitch', 560); window.Haptics && window.Haptics.fire('tap'); if (window.Sound) window.Sound.play('glitch'); }
  },

  /** 隐藏的好感（v: trust…）：这一场先记在 s.sv，重看不记进存档 */
  sceneSet(obj) {
    const s = this._scene;
    if (!s || !obj) return;
    Object.keys(obj).forEach(k => { s.sv[k] = (+s.sv[k] || +((this.storyData().sv || {})[k]) || 0) + (+obj[k] || 0); });
    if (!s.sc.replay && this.storyStep) this.storyStep('set', obj);
  },

  // ---------------- 手机模式：对话变成气泡，TA 打字前「正在输入…」 ----------------

  scenePhone(on) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phone = on;
    el.classList.toggle('phone', on);
    if (on) {
      el.querySelector('.th-ph-name').textContent = this.buddyName();
      el.querySelector('.th-ph-ava').textContent = (this.buddyName() || '').slice(0, 1);
      el.querySelector('.th-ph-state').textContent = '';
      el.querySelector('.th-ph-list').innerHTML = '';
    }
  },

  /** 一条气泡：TA 先「正在输入…」（按字数等一会儿，点一下马上出），旁白是灰色小字，你说的在右边 */
  sceneBubble(face, text, special) {
    const s = this._scene;
    const el = this.theaterEl();
    const list = el.querySelector('.th-ph-list');
    const who = this.sceneWho(face);
    s.log.push({ who, text });
    const add = (html) => { list.insertAdjacentHTML('beforeend', html); list.scrollTop = list.scrollHeight; };
    if (face == null) { add(`<p class="ph-sys">${esc(text)}</p>`); s.phase = 'line'; this.sceneAutoNext(); return; }
    if (face === '你') { add(`<p class="ph-msg me">${esc(text)}</p>`); s.phase = 'line'; this.sceneAutoNext(); return; }
    const other = String(face)[0] === '@';
    const show = () => {
      this._phNow = null;
      clearTimeout(this._phT);
      list.querySelectorAll('.ph-typing').forEach(n => n.remove());
      el.querySelector('.th-ph-state').textContent = '';
      add(`<p class="ph-msg${other ? ' other' : ''}${special ? ' ' + special : ''}">${other ? `<b>${esc(who)}</b>` : ''}${esc(text)}</p>`);
      if (window.Sound) window.Sound.play('pop');
      window.Haptics && window.Haptics.fire('tick');
      if (/害羞|心动/.test(face)) this.sceneHearts();
      s.phase = 'line';
      this.sceneAutoNext();
    };
    if (this.reducedMotion()) { show(); return; }
    s.phase = 'phtype';
    el.querySelector('.th-ph-state').textContent = '正在输入…';
    add('<p class="ph-msg ph-typing"><i></i><i></i><i></i></p>');
    this._phNow = show;
    this._phT = setTimeout(show, Math.min(1700, 520 + [...text].length * 38));
  },

  /** 「正在输入…」又停了（删掉了没发）：一个人犹豫的样子 */
  sceneTyping(step) {
    const s = this._scene;
    const el = this.theaterEl();
    if (!s.phone || this.reducedMotion()) { this.sceneNext(); return; }
    const list = el.querySelector('.th-ph-list');
    list.insertAdjacentHTML('beforeend', '<p class="ph-msg ph-typing"><i></i><i></i><i></i></p>');
    list.scrollTop = list.scrollHeight;
    el.querySelector('.th-ph-state').textContent = '正在输入…';
    s.phase = 'phtype';
    const done = () => {
      this._phNow = null;
      clearTimeout(this._phT);
      if (step.drop !== false) list.querySelectorAll('.ph-typing').forEach(n => n.remove());
      el.querySelector('.th-ph-state').textContent = '';
      if (this._scene !== s) return;
      s.phase = 'line';
      this.sceneNext();
    };
    this._phNow = done;
    this._phT = setTimeout(done, step.typing);
  },

  /** 黑场 + 一行字（「那天晚上」「二十分钟后」），一秒多自己过去，点一下也过去 */
  sceneTime(text) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phase = 'time';
    const box = el.querySelector('.th-time');
    box.querySelector('span').textContent = text;
    box.classList.add('show');
    clearTimeout(this._waitT);
    this._waitT = setTimeout(() => this.sceneTimeEnd(), this.reducedMotion() ? 900 : 1800);
  },

  sceneTimeEnd() {
    const s = this._scene;
    if (!s || s.phase !== 'time') return;
    clearTimeout(this._waitT);
    this.theaterEl().querySelector('.th-time').classList.remove('show');
    s.phase = 'line';
    setTimeout(() => { if (this._scene === s) this.sceneNext(); }, this.reducedMotion() ? 0 : 260);
  },

  // ---------------- 选项 ----------------

  /** 选项：浮在上面，别盖住 TA；need 不满足的不出；限时的上面有一根慢慢缩短的条，不选就是沉默 */
  sceneAsk(step) {
    const s = this._scene;
    s.phase = 'choose';
    s.ask = step;
    clearTimeout(this._autoT);
    const el = this.theaterEl();
    el.classList.add('choosing');
    const ctx = this.sceneCtx();
    const list = step.opts.map((o, k) => ({ o: TF.Theater.normOpt(o), k })).filter(x => !x.o.need || TF.Theater.evalCond(x.o.need, ctx));
    const timed = step.timed && !this.reducedMotion() ? step.timed : 0;
    el.querySelector('.th-choices').innerHTML = (timed ? `<div class="th-timer" aria-hidden="true"><i style="animation-duration:${timed}ms"></i></div>` : '') +
      list.map((x, i) => `<button class="th-choice${x.o.tag ? ' tagged' : ''}" type="button" data-k="${x.k}" style="--i:${i}">${x.o.tag ? `<small>${esc(x.o.tag)}</small>` : ''}${esc(TF.Theater.fill(x.o.t, s.vars))}</button>`).join('');
    clearTimeout(this._askTimer);
    if (timed) this._askTimer = setTimeout(() => { if (this._scene === s && s.phase === 'choose' && s.ask === step) this.sceneChoose(-1); }, timed);
  },

  /** 选了第 k 个（-1：限时到了没选 = 沉默） */
  sceneChoose(k) {
    const s = this._scene;
    if (!s || s.phase !== 'choose' || !s.ask) return;
    const step = s.ask;
    let opt;
    if (k === -1) opt = { t: '……', r: step.silent || [], fact: step.silentFact || '', sp: step.silentSp };
    else {
      const raw = step.opts[k];
      if (!raw) return;
      opt = TF.Theater.normOpt(raw);
    }
    clearTimeout(this._askTimer);
    s.chose = true;
    const el = this.theaterEl();
    el.classList.remove('choosing');
    el.querySelector('.th-choices').innerHTML = '';
    window.Haptics && window.Haptics.fire('success');
    s.log.push({ who: '你', text: k === -1 ? '（沉默）' : TF.Theater.fill(opt.t, s.vars) });
    s.picks[step.ask] = k;
    if (opt.v) this.sceneSet(opt.v);
    const look = s.sc.onChoose ? s.sc.onChoose(k, opt, step.ask) : null;
    // 选项后面 TA 回的几句插在这里，接着往下演；改了样子（秀肌肉、换衣服）的从第一句起生效
    const reply = (opt.r || []).map((l, i) => (i === 0 && Array.isArray(l) && look && look.pose ? [l[0], l[1], look.pose, l[3]] : l));
    s.steps.splice(s.i + 1, 0, ...reply);
    s.ask = null;
    if (look && look.outfit) s.look = Object.assign({}, s.look || {}, { outfit: look.outfit });
    this.sceneNext();
  },

  // ---------------- 互动：点一下 / 按住 / 划一下 / 跟拍子 / 自己说一句 / 起名字 / 约定 ----------------

  /** 互动做完了：收起来，把后面的台词插进去，接着演 */
  sceneActDone(lines) {
    const s = this._scene;
    if (!s) return;
    if (this._holdRaf) cancelAnimationFrame(this._holdRaf);
    const el = this.theaterEl();
    el.querySelector('.th-act').innerHTML = '';
    el.classList.remove('acting', 'act-card');
    s.act = null;
    if (lines && lines.length) s.steps.splice(s.i + 1, 0, ...lines);
    s.phase = 'line';
    this.sceneNext();
  },

  /** 点一下（接过温水、碰一碰叶子）/ 按住（把伞推回去、喊他的名字）/ 划一下（翻页） */
  sceneTouch(step) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phase = 'act';
    clearTimeout(this._autoT);
    const kind = step.touch;
    const icon = TF.Theater.ICONS[step.target] || TF.Theater.ICONS.heart;
    const downward = kind === 'swipe' && step.dir === 'down';
    const hint = kind === 'hold' ? '按住' : kind === 'swipe' ? (downward ? '往下划' : '往左划') : '点一下';
    el.classList.add('acting');
    // 擦屏幕上的雨：先落满一层雨点，划一下擦掉
    if (step.target === 'wipe') el.classList.add('glass-rain');
    const act = el.querySelector('.th-act');
    act.innerHTML = `<div class="ta-touch ${kind}"><button class="ta-target" type="button" aria-label="${esc(step.prompt || hint)}">${icon}` +
      `<svg class="ta-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg></button>` +
      `<p class="ta-prompt">${esc(step.prompt || '')}</p><span class="ta-hint">${hint}</span></div>`;
    const btn = act.querySelector('.ta-target');
    const box = act.querySelector('.ta-touch');
    let finished = false;
    const finish = () => {
      if (finished || this._scene !== s) return;
      finished = true;
      box.classList.add('done');
      el.classList.remove('glass-rain');
      window.Haptics && window.Haptics.fire('success');
      if (window.Sound) window.Sound.play('blip');
      setTimeout(() => this.sceneActDone(step.ok), this.reducedMotion() ? 0 : 320);
    };
    s.act = { finish: () => { finished = true; el.classList.remove('glass-rain'); this.sceneActDone(step.ok); } };
    if (kind === 'tap') { btn.addEventListener('click', finish); return; }
    if (kind === 'swipe') {
      let x0 = null, y0 = null;
      if (downward) box.classList.add('down');
      btn.addEventListener('click', () => { if (x0 == null) finish(); }); // 划不动的（无障碍、电脑）点一下也行
      // 按下以后手指划出这块也接着认（不然划快了、划出按钮就收不到）
      act.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; try { act.setPointerCapture(e.pointerId); } catch (err) {} });
      act.addEventListener('pointermove', (e) => {
        if (x0 == null) return;
        const moved = downward ? e.clientY - y0 > 40 : Math.abs(e.clientX - x0) > 40;
        if (moved) { box.classList.add('flip'); finish(); }
      });
      act.addEventListener('pointerup', () => { setTimeout(() => { x0 = null; y0 = null; }, 0); });
      return;
    }
    // 按住：圈慢慢转满，松手就退回去；按的时候轻轻震
    const need = step.ms || 1800;
    let t0 = 0, buzz = 0;
    const loop = (now) => {
      if (finished || !t0) return;
      const p = Math.min(1, (now - t0) / need);
      box.style.setProperty('--p', p.toFixed(3));
      if (now - buzz > 380) { buzz = now; window.Haptics && window.Haptics.fire('tick'); }
      if (p >= 1) { finish(); return; }
      this._holdRaf = requestAnimationFrame(loop);
    };
    const down = (e) => { e.preventDefault(); if (finished) return; t0 = performance.now(); box.classList.add('holding'); this._holdRaf = requestAnimationFrame(loop); };
    const up = () => { if (finished) return; t0 = 0; box.classList.remove('holding'); box.style.setProperty('--p', '0'); if (this._holdRaf) cancelAnimationFrame(this._holdRaf); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') finish(); }); // 键盘：按一下就算
  },

  /** 跟着节拍点（夏柚教你的动作、公演时在台下打拍子）：先四拍预备，再 beats 拍，前后 0.3 拍以内都算准 */
  sceneRhythm(step) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phase = 'act';
    clearTimeout(this._autoT);
    const beats = step.beats || 8;
    const gap = 60000 / (step.bpm || 92);
    el.classList.add('acting');
    const act = el.querySelector('.th-act');
    act.innerHTML = `<div class="ta-rhythm"><p class="ta-prompt">${esc(step.prompt || '跟着拍子点')}</p>` +
      `<div class="tr-dots">${Array.from({ length: beats }, () => '<i></i>').join('')}</div>` +
      `<button class="tr-pad" type="button" aria-label="拍"><span class="tr-pulse"></span><b class="tr-count">准备</b></button><span class="ta-hint">四拍预备，然后跟着亮的圈点</span></div>`;
    const pad = act.querySelector('.tr-pad');
    const count = act.querySelector('.tr-count');
    const dots = [...act.querySelectorAll('.tr-dots i')];
    const taps = [];
    let start = 0;
    const times = [];
    const pulse = () => { pad.classList.remove('beat'); void pad.offsetWidth; pad.classList.add('beat'); };
    const end = (score) => {
      if (this._scene !== s) return;
      const ok = score >= Math.ceil(beats * 0.6);
      count.textContent = `${score}/${beats}`;
      act.querySelector('.ta-rhythm').classList.add(ok ? 'win' : 'lose');
      const key = 'rhythm_' + step.rhythm;
      const best = Math.max(score, +((this.storyData().sv || {})[key] || 0));
      s.sv[key] = Math.max(+s.sv[key] || 0, score);
      if (!s.sc.replay && this.storyStep) this.storyStep('setmax', { [key]: best });
      window.Haptics && window.Haptics.fire(ok ? 'success' : 'tap');
      if (window.Sound) window.Sound.play(ok ? 'unlock' : 'blip');
      this._rhyT.push(setTimeout(() => this.sceneActDone(ok ? step.ok : step.meh), 900));
    };
    s.act = { finish: () => { (this._rhyT || []).forEach(t => clearTimeout(t)); this._rhyT = []; this.sceneActDone(step.ok); } };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!start) return;
      const t = performance.now();
      taps.push(t);
      pad.classList.remove('tap'); void pad.offsetWidth; pad.classList.add('tap');
      const k = times.findIndex(b => Math.abs(t - b) <= gap * 0.3);
      if (k >= 0 && dots[k]) dots[k].classList.add('hit');
      window.Haptics && window.Haptics.fire('tick');
    });
    const reduced = this.reducedMotion();
    // 四拍预备：3、2、1、跳
    ['3', '2', '1', '跳'].forEach((t, i) => this._rhyT.push(setTimeout(() => { count.textContent = t; pulse(); if (window.Sound) window.Sound.play('tick'); }, i * gap)));
    this._rhyT.push(setTimeout(() => {
      start = performance.now();
      for (let k = 0; k < beats; k++) times.push(start + k * gap);
      for (let k = 0; k < beats; k++) {
        this._rhyT.push(setTimeout(() => { count.textContent = String((k % 4) + 1); pulse(); if (dots[k]) dots[k].classList.add('on'); if (window.Sound) window.Sound.play('tick'); }, k * gap));
      }
      this._rhyT.push(setTimeout(() => end(TF.Theater.rhythmScore(taps, times, gap * 0.3)), beats * gap + gap * 0.4));
    }, 4 * gap));
    if (reduced) { (this._rhyT || []).forEach(t => clearTimeout(t)); this._rhyT = []; end(beats); }
  },

  /**
   * 关键时刻自己说一句（深夜电话里他说完旧伤、她说完初中的事）：你打的话显示成「你」，TA 先「……」，
   * 大模型按人设和这一幕接 1～3 句（20 秒没回来、回得不对就用写好的备用台词）。说的话记进 story.inputs，以后剧情、日记里会提。
   */
  sceneInput(step) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phase = 'act';
    clearTimeout(this._autoT);
    el.classList.add('acting', 'act-card');
    const act = el.querySelector('.th-act');
    act.innerHTML = `<div class="ta-card ta-input"><p class="ta-prompt">${esc(step.prompt || '你想说什么？')}</p>` +
      `<textarea maxlength="80" rows="3" placeholder="${esc(step.hint || '说什么都行')}"></textarea>` +
      `<div class="ta-row"><button class="ta-btn ghost ti-skip" type="button">${esc(step.skip || '（什么也不说）')}</button><button class="ta-btn ti-send" type="button" disabled>说出口</button></div></div>`;
    const area = act.querySelector('textarea');
    const send = act.querySelector('.ti-send');
    area.addEventListener('input', () => { send.disabled = !area.value.trim(); });
    setTimeout(() => { try { area.focus(); } catch (e) {} }, 350);
    const skip = () => this.sceneActDone(step.skipR || step.fallback);
    s.act = { finish: skip };
    act.querySelector('.ti-skip').addEventListener('click', skip);
    send.addEventListener('click', () => {
      const text = area.value.replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!text) return;
      this.sceneSaid(step, text);
    });
  },

  async sceneSaid(step, text) {
    const s = this._scene;
    const el = this.theaterEl();
    el.querySelector('.th-act').innerHTML = '';
    el.classList.remove('act-card');
    s.act = null;
    s.inputs[step.input] = text;
    s.vars['said_' + step.input] = text.length > 24 ? text.slice(0, 24) + '…' : text;
    s.vars.said = s.vars['said_' + step.input];
    if (!s.sc.replay && this.storyStep) this.storyStep('input', { id: step.input, text, fact: TF.Theater.fill(step.fact || '', s.vars) });
    // 你说的那句显示在对话框里，TA 在想
    el.classList.remove('narr', 'other');
    el.classList.add('me');
    el.querySelector('.th-name').textContent = '你';
    el.querySelector('.th-text').textContent = text;
    s.log.push({ who: '你', text });
    await new Promise(r => setTimeout(r, 900));
    if (this._scene !== s) return;
    el.classList.remove('me');
    el.querySelector('.th-name').textContent = this.buddyName();
    el.querySelector('.th-text').innerHTML = '<span class="th-thinking"><i></i><i></i><i></i></span>';
    let lines = null;
    try {
      const P = TF.Parser;
      if (!P || !P.sceneReply) throw new Error('NO_PARSER');
      const ctx = { buddy: this.buddyPersona ? this.buddyPersona() : {}, scene: step.ctx || '', calm: this.castKey() === 'jx' };
      // v8.0 真实 Atria：中位 10 秒、最慢 26 秒（没开 7 秒补发）；20 秒还没回来就用写好的备用台词
      lines = await Promise.race([P.sceneReply(text, ctx), new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 20000))]);
    } catch (e) { lines = null; }
    if (this._scene !== s) return;
    el.classList.remove('acting');
    s.phase = 'line';
    // 这几句是 TA 自己的话（不是台词表上的）：对话框换个样子
    const said = ((lines && lines.length) ? lines : (step.fallback || [])).map(l => (Array.isArray(l) && l[0] != null && l[0] !== '你' && String(l[0])[0] !== '@' ? [l[0], l[1], 'own', l[3]] : l));
    s.steps.splice(s.i + 1, 0, ...said);
    this.sceneNext();
  },

  /** 起名字（橘猫、搭子本最后一页）：点一个现成的，或者自己写 */
  sceneName(step) {
    const s = this._scene;
    const el = this.theaterEl();
    s.phase = 'act';
    clearTimeout(this._autoT);
    el.classList.add('acting', 'act-card');
    const max = step.max || 6;
    const act = el.querySelector('.th-act');
    act.innerHTML = `<div class="ta-card ta-name"><p class="ta-prompt">${esc(step.prompt || '起个名字')}</p>` +
      `<div class="tn-chips">${(step.opts || []).map(o => `<button class="tn-chip" type="button">${esc(o)}</button>`).join('')}</div>` +
      `<div class="ta-row"><input type="text" maxlength="${max}" placeholder="自己起一个（${max} 个字以内）"><button class="ta-btn tn-ok" type="button" disabled>就叫这个</button></div></div>`;
    const input = act.querySelector('input');
    const ok = act.querySelector('.tn-ok');
    input.addEventListener('input', () => { ok.disabled = !input.value.trim(); });
    const done = (v) => {
      const val = String(v || '').replace(/[<>{}「」"']/g, '').replace(/\s+/g, '').slice(0, max);
      if (!val) return;
      s.vars[step.name] = val;
      if (!s.sc.replay && this.storyStep) this.storyStep('name', { key: step.name, value: val });
      if (window.Sound) window.Sound.play('unlock');
      this.sceneActDone(step.r);
    };
    s.act = { finish: () => done((step.opts || [])[0] || '它') };
    act.querySelectorAll('.tn-chip').forEach(b => b.addEventListener('click', () => done(b.textContent)));
    ok.addEventListener('click', () => done(input.value));
  },

  /** 约定卡：「约好了」记下来（你在真实的记录里做到了就解锁加篇），「下次吧」也没关系。重看时只是看看，不再约 */
  scenePromise(step) {
    const s = this._scene;
    const P = (this.cast().promises || {})[step.promise];
    if (!P) return false;
    const el = this.theaterEl();
    const had = ((this.storyData().promises || {})[step.promise]) || null;
    if (s.sc.replay && had) return false;
    s.phase = 'act';
    clearTimeout(this._autoT);
    el.classList.add('acting', 'act-card');
    const act = el.querySelector('.th-act');
    act.innerHTML = `<div class="ta-card ta-promise"><span class="tp-tag">约定</span><b class="tp-title">${esc(P.title)}</b><p class="tp-detail">${esc(P.detail || '')}</p>` +
      `<small class="tp-note">做到了，有一段只给你的加篇。没做到也没关系。</small>` +
      `<div class="ta-row"><button class="ta-btn ghost tp-no" type="button">下次吧</button><button class="ta-btn tp-yes" type="button">约好了</button></div></div>`;
    const pick = (yes) => {
      if (!s.sc.replay && this.storyStep) this.storyStep('promise', { id: step.promise, yes });
      s.log.push({ who: '你', text: yes ? `约好了：${P.title}` : '下次吧' });
      if (yes) { if (window.Sound) window.Sound.play('unlock'); act.querySelector('.ta-promise').classList.add('sealed'); }
      setTimeout(() => this.sceneActDone(yes ? P.yes : P.no), yes && !this.reducedMotion() ? 650 : 0);
    };
    s.act = { finish: () => pick(false) };
    act.querySelector('.tp-yes').addEventListener('click', () => pick(true));
    act.querySelector('.tp-no').addEventListener('click', () => pick(false));
    return true;
  },

  // ---------------- 回看、自动、跳过 ----------------

  /** 跳过：互动按默认的走完；一直往下，到下一个选项或互动停；没有了就收场（看过的照样算看过） */
  sceneSkip() {
    const s = this._scene;
    if (!s) return;
    clearTimeout(this._thTypeT);
    clearTimeout(this._autoT);
    clearTimeout(this._phT);
    const el = this.theaterEl();
    el.querySelector('.th-card').classList.remove('show');
    clearTimeout(this._cardT);
    if (s.phase === 'choose') return;
    s.skipped = (s.skipped || 0) + 1;
    if (s.phase === 'doc') { this.sceneDocClose(); return; }
    if (s.phase === 'act') { if (s.act && s.act.finish) s.act.finish(); return; }
    if (s.phase === 'time') { el.querySelector('.th-time').classList.remove('show'); clearTimeout(this._waitT); }
    clearTimeout(this._waitT);
    el.querySelectorAll('.ph-typing').forEach(n => n.remove());
    for (let j = s.i + 1; j < s.steps.length; j++) {
      const step = s.steps[j];
      const ctx = this.sceneCtx();
      if (Array.isArray(step)) {
        if (!TF.Theater.evalCond(step[3], ctx)) continue;
        const text = TF.Theater.fill(step[1], s.vars);
        s.log.push({ who: this.sceneWho(step[0]), text });
        if (s.phone) el.querySelector('.th-ph-list').insertAdjacentHTML('beforeend', step[0] == null ? `<p class="ph-sys">${esc(text)}</p>` : `<p class="ph-msg${step[0] === '你' ? ' me' : ''}">${esc(text)}</p>`);
        continue;
      }
      if (!step || (step.cond && !TF.Theater.evalCond(step.cond, ctx))) continue;
      s.i = j;
      if (step.recall) {
        s.log.push({ who: this.buddyName(), text: TF.Theater.fill(step.recall, s.vars) + '（撤回了）' });
        if (s.phone) el.querySelector('.th-ph-list').insertAdjacentHTML('beforeend', `<p class="ph-sys">${esc(this.buddyName())}撤回了一条消息</p>`);
        continue;
      }
      if (this.sceneQuick(step, true)) continue;
      // 停在选项 / 互动：选项前那一句留在对话框里，知道在选什么
      const prev = [...s.log].reverse().find(x => x.who !== '你');
      if (prev && !s.phone) { el.querySelector('.th-text').textContent = prev.text; el.querySelector('.th-name').textContent = prev.who || this.buddyName(); el.classList.toggle('narr', !prev.who); }
      if (s.phone) { const list = el.querySelector('.th-ph-list'); list.scrollTop = list.scrollHeight; }
      s.i = j - 1;
      this.sceneNext();
      return;
    }
    s.i = s.steps.length;
    this.sceneEnd(true);
  },

  /** 自动：打完一句，停一会儿（按字数）自己往下；选项、互动那里停 */
  sceneAuto(on) {
    const s = this._scene;
    if (!s) return;
    s.auto = !!on;
    try { localStorage.setItem('tf_th_auto', on ? '1' : '0'); } catch (e) {}
    this.theaterEl().querySelector('.th-auto').classList.toggle('on', !!on);
    if (on && s.phase === 'line') this.sceneAutoNext();
  },

  sceneAutoNext() {
    const s = this._scene;
    clearTimeout(this._autoT);
    if (!s || !s.auto || s.phase !== 'line') return;
    const ms = this.reducedMotion() ? 2200 : [...(s.line || '')].length * 40 + 1500;
    this._autoT = setTimeout(() => { if (this._scene === s && s.auto && s.phase === 'line') this.sceneNext(); }, ms);
  },

  /** 回看：这一场说过的话（你选的、你说的也在里面） */
  sceneLog() {
    const s = this._scene;
    if (!s) return;
    const el = this.theaterEl();
    const panel = el.querySelector('.th-log');
    const list = panel.querySelector('.th-log-list');
    list.innerHTML = s.log.map(x => `<p class="${x.who === '你' ? 'me' : x.who ? '' : 'narr'}">${x.who ? `<b>${esc(x.who)}</b>` : ''}${esc(x.text)}</p>`).join('') || '<p class="narr">还没开始呢</p>';
    panel.classList.remove('hidden');
    list.scrollTop = list.scrollHeight;
  },

  // ---------------- 人设文档、撤回、小本本、约好的通知、结局路线（v8.0 第二轮） ----------------

  /**
   * 翻开 TA 的人设文档（cast.doc：{ title, ver, lines }）：hl 那行高亮（「经历：高二肩伤，没进省队。」），
   * add 是 TA 自己手写加上去的一行（记进 story.docAdds，以后再翻开还在）。轻点合上。
   */
  sceneDoc(step) {
    const s = this._scene;
    const el = this.theaterEl();
    const d = this.cast().doc;
    if (!d) { this.sceneNext(); return; }
    s.phase = 'doc';
    clearTimeout(this._autoT);
    const fill = (t) => TF.Theater.fill(t, s.vars);
    const adds = ((this.storyData ? this.storyData().docAdds : null) || []).filter(x => x !== step.add);
    const add = step.add ? fill(step.add) : '';
    if (add && !s.sc.replay && this.storyStep) this.storyStep('docAdd', step.add);
    const box = el.querySelector('.th-doc');
    box.innerHTML = `<div class="td-paper"><div class="td-head"><b>${esc(d.title)}</b><small>${esc(d.ver || '')}</small></div>` +
      d.lines.map((l, i) => `<p class="${i === step.hl ? 'hl' : ''}">${esc(fill(l))}</p>`).join('') +
      adds.map(x => `<p class="td-add">${esc(fill(x))}</p>`).join('') +
      (add ? `<p class="td-add new">${esc(add)}</p>` : '') +
      '<span class="td-close">轻点合上</span></div>';
    box.classList.remove('hidden', 'show');
    void box.offsetWidth;
    box.classList.add('show');
    s.log.push({ who: '', text: `（${d.title}）` + (step.hl != null && d.lines[step.hl] ? fill(d.lines[step.hl]) : '') + (add ? ` ${add}` : '') });
    if (window.Sound) window.Sound.play('paper');
    window.Haptics && window.Haptics.fire('tick');
  },

  sceneDocClose() {
    const s = this._scene;
    if (!s || s.phase !== 'doc') return;
    const box = this.theaterEl().querySelector('.th-doc');
    box.classList.remove('show');
    box.classList.add('hidden');
    s.phase = 'line';
    this.sceneNext();
  },

  /** 手机里发出去一条、又撤回了：气泡出来一秒半，变成灰字「江叙撤回了一条消息」（点一下马上撤回） */
  sceneRecall(step) {
    const s = this._scene;
    const el = this.theaterEl();
    const text = TF.Theater.fill(step.recall, s.vars);
    s.log.push({ who: this.buddyName(), text: text + '（撤回了）' });
    if (!s.phone) { this.sceneNext(); return; }
    const list = el.querySelector('.th-ph-list');
    list.insertAdjacentHTML('beforeend', `<p class="ph-msg recalling">${esc(text)}</p>`);
    list.scrollTop = list.scrollHeight;
    if (window.Sound) window.Sound.play('pop');
    s.phase = 'phtype';
    const done = () => {
      this._phNow = null;
      clearTimeout(this._phT);
      const b = list.querySelector('.ph-msg.recalling');
      if (b) b.outerHTML = `<p class="ph-sys recalled">${esc(this.buddyName())}撤回了一条消息</p>`;
      if (this._scene !== s) return;
      s.phase = 'line';
      this.sceneNext();
    };
    this._phNow = done;
    this._phT = setTimeout(done, this.reducedMotion() ? 0 : 1500);
  },

  /** TA 悄悄写进「小人记住的」（重看不写）；剧场里冒一行小字 */
  sceneMemo(text, skipping) {
    const s = this._scene;
    if (!s || s.sc.replay || !this.updateMemo) return;
    const t = TF.Theater.fill(text, s.vars).replace(/\s+/g, '').slice(0, 40);
    if (!t) return;
    this.updateMemo([t], []);
    if (this.saveData) this.saveData();
    if (!skipping) this.sceneToast(`${this.buddyName()}在「小人记住的」里写了一行`);
  },

  /** 约好的时间手机响一下（重看不约）：安卓上排一条通知，剧场里冒一行「明早 7:00，手机会响」 */
  scenePush(p, skipping) {
    const s = this._scene;
    if (!s || s.sc.replay || !p || !p.text || !this.storyPush) return;
    const when = this.storyPush(p.at, TF.Theater.fill(p.text, s.vars), p.day);
    if (when && !skipping) this.sceneToast(`约好了：${when}，手机会响一下`);
  },

  sceneToast(text) {
    const box = this.theaterEl().querySelector('.th-toast');
    box.textContent = text;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => box.classList.remove('show'), 2600);
  },

  /**
   * 结局走哪条：cast.endings 里每条写着 route（near / brave / soft），看一路上哪个隐藏值最多；平手走 dflt 那条。
   * 记进 story.route（结局字幕、剧情书用）。
   */
  sceneRoute() {
    const s = this._scene;
    const ends = this.cast().endings || {};
    const sv = this.sceneCtx().sv;
    const keys = Object.keys(ends).filter(k => ends[k].route);
    if (!keys.length) return;
    let best = keys.find(k => ends[k].dflt) || keys[0];
    let bv = +sv[ends[best].route] || 0;
    keys.forEach(k => { const v = +sv[ends[k].route] || 0; if (v > bv) { bv = v; best = k; } });
    s.route = ends[best].route;
    s.routeEnd = best;
    if (!s.sc.replay && this.storyStep) this.storyStep('route', { key: best });
  },

  routeEnding() {
    const s = this._scene;
    if (!s.routeEnd) this.sceneRoute();
    return s.routeEnd || '';
  },

  // ---------------- CG、收场 ----------------

  /** CG：这张定格的画（背景 + TA 的姿势 + 道具），在 cast.cgs 里 */
  cgDef(id) {
    return ((this.cast().cgs || {})[id]) || null;
  },

  sceneCg(id) {
    const s = this._scene;
    const el = this.theaterEl();
    s.cg = id || '';
    const cg = id && this.cgDef(id);
    el.classList.toggle('in-cg', !!cg);
    el.dataset.cg = cg ? (cg.props || []).join(' ') : '';
    if (cg && cg.bg) this.sceneBg(cg.bg, 'cut');
    const tag = el.querySelector('.th-cgtag');
    tag.textContent = cg ? `CG · ${cg.title}` : '';
    tag.classList.remove('show');
    if (cg) { void tag.offsetWidth; tag.classList.add('show'); }
    // 有画好的 CG（art.js）就整屏放那张图；没有就用立绘 / 像素小人 + 道具拼（.th-cgfx 里：雨、星星、水面、聚光灯…）
    const img = cg && TF.Art ? TF.Art.cg(this.castKey(), id) : '';
    el.classList.toggle('cg-art', !!img);
    el.querySelector('.th-cgimg').style.backgroundImage = img ? `url("${img}")` : '';
    el.querySelector('.th-cgfx').innerHTML = cg && !img ? (cg.props || []).map(p => `<i class="cgp cgp-${p}">${TF.Theater.PROPS[p] || ''}</i>`).join('') : '';
    if (cg && !img) {
      el.querySelector('.th-actor').innerHTML = this.sceneActor(cg.face || s.face || '平静', cg.pose, Object.assign({}, s.look || {}, cg.outfit ? { outfit: cg.outfit } : {}));
    }
    if (cg && cg.face) s.face = cg.face;
  },

  /** 演完（skip：点了跳过）；有结局的先放一屏字幕（你们一起走过的数字），点「回到今天」再关 */
  sceneEnd(skip) {
    const s = this._scene;
    if (!s || s.phase === 'credits') return;
    const el = this.theaterEl();
    this.sceneTimersClear();
    if (s.sc.onEnd) s.sc.onEnd(!!s.chose, skip, s.ending);
    if (s.ending && this.creditsHtml) {
      s.phase = 'credits';
      el.classList.remove('choosing', 'phone', 'acting');
      el.classList.add('rolling');
      const cr = el.querySelector('.th-credits');
      cr.innerHTML = this.creditsHtml(s.ending);
      cr.classList.remove('hidden');
      if (window.Sound) window.Sound.play('unlock', 0.6);
      return;
    }
    this.theaterClose();
  },

  /** 收场：收回小人那儿（圆形缩小），环境声淡出；sc.after 接着做（演完小人说的那句余韵） */
  theaterClose() {
    const el = this.theaterEl();
    const s = this._scene;
    this._scene = null;
    this.sceneTimersClear();
    if (window.Sound && window.Sound.amb) window.Sound.amb('');
    const btn = document.getElementById('buddy');
    const r = btn && !btn.classList.contains('hidden') ? btn.getBoundingClientRect() : null;
    if (r && r.width) { el.style.setProperty('--ix', `${Math.round(r.left + r.width / 2)}px`); el.style.setProperty('--iy', `${Math.round(r.top + r.height / 2)}px`); }
    el.classList.remove('iris-in');
    el.classList.add('closing', r && r.width && !this.reducedMotion() ? 'iris-out' : 'fade-out');
    // 立绘缩回像素小人、落回原位（落地轻轻一声），接着才是小人说话、引导你记录
    if (r && r.width && !this.reducedMotion()) {
      this.sceneMorph('out');
      if (window.Sound) window.Sound.play('swoosh', 0.05);
      setTimeout(() => { btn.classList.remove('land'); void btn.offsetWidth; btn.classList.add('land'); if (window.Sound) window.Sound.play('land'); setTimeout(() => btn.classList.remove('land'), 700); }, 560);
    }
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('closing', 'choosing', 'rolling', 'in-cg', 'iris-out', 'fade-out', 'phone', 'acting', 'act-card', 'fx-close', 'fx-sepia', 'fx-dark', 'sys-line', 'own-line', 'onair', 'glass-rain');
      el.querySelector('.th-doc').classList.add('hidden');
      el.querySelector('.th-credits').classList.add('hidden');
      el.querySelector('.th-act').innerHTML = '';
      document.body.classList.remove('in-theater');
    }, this.reducedMotion() ? 0 : 520);
    this.renderBuddy && this.renderBuddy();
    if (s && s.sc.after) setTimeout(s.sc.after, 600);
  },

  /** 相册里点一张：只看这张 CG 和它那句话 */
  viewCg(id) {
    const cg = this.cgDef(id);
    if (!cg) return false;
    return this.playScene({ label: '相册', bg: cg.bg || 'room', viewer: true, replay: true, script: [{ cg: id }, [null, cg.caption || cg.title]] });
  },

  /**
   * 一章的开头（亲密度升级，或者设置里重看）：v7.1 起是这一章主线的第一段（story.js 的 playMain）；没有主线的退回那段回忆。
   * opts：{ lead（升级时先说的那句）, outfits（这次解锁的衣服：最后问换不换）, replay, after（演完接着做的，比如新手教程） }
   */
  playChapter(lv, opts) {
    opts = opts || {};
    const c = this.cast();
    const first = c.main && c.main[lv - 1] && c.main[lv - 1][0];
    if (first && this.playMain) {
      // 前面还有没看的主线（老用户一下跳了几章）：升级时不抢着演后面的章节，免得剧透、乱了顺序；退回一句话的升级气泡，剧情按顺序看
      const next = this.mainNext && this.mainNext();
      if (!opts.replay && next && next.sc.id !== first.id && next.ch < lv) return false;
      return this.playMain(first.id, opts);
    }
    const st = c.story[lv - 1];
    if (!st) return false;
    const faces = lv === 4 ? ['平静', '担心', '害羞'] : lv === 5 ? ['平静', '害羞', '心动'] : ['平静', '开心', '害羞'];
    const parts = TF.Theater.splitLines(st[1]);
    const lines = parts.map((t, i) => [faces[Math.min(faces.length - 1, Math.floor(i * faces.length / parts.length))], t]);
    if (opts.lead) lines.unshift(['开心', opts.lead, 'wave']);
    const outfits = (opts.outfits || []).slice(-2);
    return this.playScene({
      label: this.chapterLabel(lv), title: `「${st[0]}」`, bg: (c.chapterBg || [])[lv - 1] || 'room', lines, from: this.buddyCenter ? this.buddyCenter() : null,
      choices: outfits.length ? this.wearChoices(outfits) : null,
      onChoose: (k, ch) => this.wearChosen(ch),
      onEnd: () => { if (!opts.replay && this.buddyDo) setTimeout(() => this.buddyDo([['flex', 1100], ['stand', 300]]), 350); },
      after: opts.after
    });
  },

  /** 小人在屏幕上的中心（剧场从这儿圆形展开） */
  buddyCenter() {
    const btn = document.getElementById('buddy');
    if (!btn || btn.classList.contains('hidden')) return null;
    const r = btn.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  },

  /**
   * 进出剧场的那一下（v8.0，用户：「进入跟结束 galgame 也要很自然」）：
   * in：今天页上的像素小人飞到屏幕中间、放大、散开，立绘接着出来；out：反过来，从中间缩回小人原来的位置。
   */
  sceneMorph(dir) {
    const btn = document.getElementById('buddy');
    const svg = btn && btn.querySelector('svg');
    if (!svg || btn.classList.contains('hidden')) return;
    const r = btn.getBoundingClientRect();
    if (!r.width) return;
    const m = document.createElement('div');
    m.className = `th-morph ${dir}`;
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = svg.outerHTML;
    Object.assign(m.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    m.style.setProperty('--dx', `${Math.round(window.innerWidth / 2 - (r.left + r.width / 2))}px`);
    m.style.setProperty('--dy', `${Math.round(window.innerHeight * 0.36 - (r.top + r.height / 2))}px`);
    m.style.setProperty('--sc', Math.max(2, Math.min(6, (window.innerHeight * 0.42) / r.height)).toFixed(2));
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 950);
  },

  /** 新解锁的衣服：最后问换不换（老格式的选项，special 是衣服名） */
  wearChoices(outfits) {
    const wear = this.cast().sex === 'f' ? '嘿嘿，好看吗？' : '……好看吗。';
    return outfits.map(k => [`换上「${this.outfitLabel(k)}」`, wear, '害羞', '', k]).concat([['先不换', '', '平静']]);
  },

  wearChosen(opt) {
    const k = opt && opt.sp;
    if (!k || typeof k !== 'string' || !TF.Buddy.OUTFITS[k]) return null;
    this.setBuddy(Object.assign(this.buddyLook(), { outfit: k }));
    return { pose: 'flex', outfit: k };
  }
});
