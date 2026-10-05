/**
 * 剧场（v7.0，用户：「能不能搞成像 GalGame 那样？身材、回忆、话多话少这些都融入一个 Galgame 的大系统，有剧情推进」）。
 *
 * 剧情不挤在小气泡里：整屏一个场景——背景（房间、泳池、健身房、夜里、下雨…）、大大的 TA、名字牌、底下一个对话框，
 * 一句一句打出来，点一下下一句。都是写好的台词，不调大模型；选「陪你聊会儿」这种的，演完把输入框亮一下，接着才是大模型聊。
 *
 * v7.1（用户：「内容完整、故事吸引、有人格魅力、陪伴感强，像玩市面上很厉害的 galgame 一样」）：演出引擎改成剧本——
 *   一行台词 [表情, 话, 姿势?, 条件?]：表情写 null 是旁白，写「@老周」是别人在说（TA 退到后面）；
 *   { ask: 'jx2b', opts: [[你说的, TA 回的（一句或几句）, 记下的事, 特别标记], …] }：段中间就能选，选的记在 story.picks，后面的台词按它变；
 *   { cg: 'jx-pool' } 定格一张 CG（收进相册），{ cg: '' } 收起；{ bg: 'pool' } 换背景；{ end: 'romance' } 演完放结局字幕。
 *   条件：rel:romance / rel:friend / rel:none、pick:jx2b=0、has:lift、seen:jx1a、lv>=3，用 & 连，! 取反。
 *   台词里的 {name} {days} {meals} {fav} {lift} 换成你自己的（叫什么、认识几天、记了几顿、最常吃的、最重的一次）。
 * 剧场里能「回看」刚才的话、「自动」播放、「跳过」到下一个选项（像正经 galgame 那样）。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 小剧情 → 背景（秘密那段江叙在泳池、夏柚在舞蹈教室，按 cast.chapterBg 第 2 章的）
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

  /** 条件：ctx = { picks, seen, romance, vars, lv } */
  function evalCond(cond, ctx) {
    if (!cond) return true;
    ctx = ctx || {};
    return String(cond).split('&').every(part => {
      let p = part.trim();
      const neg = p[0] === '!';
      if (neg) p = p.slice(1);
      let ok = false;
      const lv = p.match(/^lv>=(\d)$/);
      const m = p.match(/^(\w+):(.+)$/);
      if (lv) ok = (ctx.lv || 1) >= +lv[1];
      else if (m && m[1] === 'rel') ok = m[2] === 'none' ? ctx.romance == null : m[2] === 'romance' ? ctx.romance === true : m[2] === 'friend' ? ctx.romance === false : false;
      else if (m && m[1] === 'pick') {
        const [id, k] = m[2].split('=');
        const v = (ctx.picks || {})[id];
        ok = k == null ? v != null : v === +k;
      } else if (m && m[1] === 'has') ok = !!(ctx.vars || {})[m[2]];
      else if (m && m[1] === 'seen') ok = (ctx.seen || []).includes(m[2]);
      return neg ? !ok : ok;
    });
  }

  /** {name} 这些换成你自己的；没有的换成空 */
  function fill(text, vars) {
    return String(text == null ? '' : text).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  }

  /** 选项统一成 { t, r: [[表情, 话, 姿势]], fact, sp } */
  function normOpt(o) {
    if (!Array.isArray(o)) return Object.assign({ fact: '' }, o, { r: typeof o.r === 'string' ? (o.r ? [['平静', o.r]] : []) : o.r || [] });
    return { t: o[0], r: typeof o[1] === 'string' ? (o[1] ? [['平静', o[1]]] : []) : o[1] || [], fact: o[2] || '', sp: o[3] };
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

  /** 剧本里有哪些选项、CG、结局（测试和相册用） */
  function scriptInfo(script) {
    const out = { asks: [], cgs: [], ends: [], lines: 0 };
    const walk = (steps) => (steps || []).forEach(s => {
      if (Array.isArray(s)) { out.lines += 1; return; }
      if (s.ask) { out.asks.push(s.ask); (s.opts || []).forEach(o => walk(normOpt(o).r)); }
      if (s.cg) out.cgs.push(s.cg);
      if (s.end) out.ends.push(s.end);
    });
    walk(script);
    return out;
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

  TF.Theater = { SCENE_BG, splitLines, CN, evalCond, fill, normOpt, toSteps, scriptInfo, PROPS };
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
      '<div class="th-card" aria-hidden="true"><small class="th-card-label"></small><b class="th-card-title"></b></div>' +
      '<div class="th-stage"><div class="th-actor"></div><div class="th-hearts" aria-hidden="true"></div></div>' +
      '<div class="th-choices"></div>' +
      '<div class="th-box"><div class="th-name"></div><p class="th-text"></p><span class="th-more" aria-hidden="true">▼</span></div>' +
      '<div class="th-log hidden"><div class="th-log-head">回看<button class="th-tool th-log-close" type="button">关闭</button></div><div class="th-log-list"></div></div>' +
      '<div class="th-credits hidden"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const s = this._scene;
      if (!s) return;
      if (e.target.closest('.th-credits')) { if (e.target.closest('.th-done')) this.theaterClose(); return; }
      if (e.target.closest('.th-log')) { el.querySelector('.th-log').classList.add('hidden'); return; }
      if (e.target.closest('.th-log-btn')) { this.sceneLog(); return; }
      if (e.target.closest('.th-auto')) { this.sceneAuto(!s.auto); return; }
      if (e.target.closest('.th-skip')) { this.sceneSkip(); return; }
      const b = e.target.closest('.th-choice');
      if (b) { this.sceneChoose(+b.dataset.k); return; }
      if (s.phase === 'choose' || s.phase === 'credits') return;
      this.sceneTap();
    });
    return el;
  },

  /** 剧本条件要看的：选过什么、看过什么、你们的关系、你的数字、第几章 */
  sceneCtx() {
    const st = this.storyData ? this.storyData() : {};
    return { picks: st.picks || {}, seen: st.seen || [], romance: st.romance, vars: this._scene ? this._scene.vars : {}, lv: this.bond ? this.bond().lv : 1 };
  },

  /**
   * 演一场。sc：{ label（左上角「第三章 · 搭子」）, title（开场的大字，没有就不出）, bg,
   *   script（剧本，见文件开头）或者老格式 lines: [[表情, 话, 姿势]] + choices: [[选项, TA 回的话, 表情, …]],
   *   onChoose(k, 选项, askId) → 可以返回 { pose, outfit } 改 TA 回话时的样子, onEnd(选过没有, 跳过没有, 结局), viewer（相册里看一张） }
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
    this._scene = { sc, steps, i: -1, phase: 'card', face: '', look: sc.look || null, log: [], auto, cg: '', vars: this.storyVars ? this.storyVars() : {} };
    this.sceneBg(sc.bg);
    el.dataset.cg = '';
    el.querySelector('.th-label').textContent = sc.label || '';
    el.querySelector('.th-name').textContent = this.buddyName();
    el.querySelector('.th-choices').innerHTML = '';
    el.querySelector('.th-text').textContent = '';
    el.querySelector('.th-actor').innerHTML = '';
    el.classList.remove('has-sprite');
    el.querySelector('.th-cgfx').innerHTML = '';
    el.querySelector('.th-cgtag').textContent = '';
    el.querySelector('.th-log').classList.add('hidden');
    el.querySelector('.th-credits').classList.add('hidden');
    el.querySelector('.th-auto').classList.toggle('on', auto);
    el.querySelector('.th-tools').classList.toggle('hidden', !!sc.viewer);
    el.querySelector('.th-cgimg').style.backgroundImage = '';
    el.classList.remove('hidden', 'closing', 'choosing', 'narr', 'other', 'in-cg', 'cg-art', 'rolling');
    document.body.classList.add('in-theater');
    const card = el.querySelector('.th-card');
    if (sc.title) {
      card.querySelector('.th-card-label').textContent = sc.label || '';
      card.querySelector('.th-card-title').textContent = sc.title;
      card.classList.add('show');
      clearTimeout(this._cardT);
      this._cardT = setTimeout(() => { if (this._scene && this._scene.phase === 'card') this.sceneTap(); }, this.reducedMotion() ? 600 : 1500);
    } else {
      card.classList.remove('show');
      this.sceneNext();
    }
    if (window.Sound) window.Sound.play('unlock', 0.45);
    window.Haptics && window.Haptics.fire('tap');
    return true;
  },

  /** 点一下：开场大字收起 / 还在打字就打完 / 下一句 */
  sceneTap() {
    const s = this._scene;
    if (!s) return;
    const el = this.theaterEl();
    if (s.phase === 'card') { el.querySelector('.th-card').classList.remove('show'); clearTimeout(this._cardT); this.sceneNext(); return; }
    const text = el.querySelector('.th-text');
    if (text.querySelector('.type-ghost')) { clearInterval(this._typeT); text.textContent = s.line || ''; this.sceneAutoNext(); return; }
    window.Haptics && window.Haptics.fire('tick');
    this.sceneNext();
  },

  /** 往下走：跳过条件不满足的，换背景 / CG 顺手做了，遇到台词停下来打字，遇到选项停下来让你选，没了就收场 */
  sceneNext() {
    const s = this._scene;
    if (!s) return;
    clearTimeout(this._autoT);
    const ctx = this.sceneCtx();
    for (;;) {
      s.i += 1;
      const step = s.steps[s.i];
      if (step == null) { this.sceneEnd(false); return; }
      if (Array.isArray(step)) {
        if (!TF.Theater.evalCond(step[3], ctx)) continue;
        s.phase = 'line';
        this.sceneLine(step);
        return;
      }
      if (step.cond && !TF.Theater.evalCond(step.cond, ctx)) continue;
      if (step.bg) this.sceneBg(step.bg);
      if (step.cg != null) this.sceneCg(step.cg);
      if (step.look) s.look = Object.assign({}, s.look || {}, step.look);
      if (step.end) s.ending = step.end;
      if (step.ask) { this.sceneAsk(step); return; }
    }
  },

  /**
   * TA 在剧场里的样子：有立绘就用立绘（galgame 级美术，art.js 按表情取图），没有就用像素小人放大。
   * 立绘不跟着换装 / 姿势变（那是像素小人的事），只换表情。
   */
  sceneActor(face, pose, look) {
    const url = TF.Art ? TF.Art.sprite(this.castKey(), face) : '';
    // has-sprite：立绘是大半身，站到对话框后面去（像 galgame 那样框住下半身），选项挪到对话框上面，别挡脸
    this.theaterEl().classList.toggle('has-sprite', !!url);
    if (url) return `<img class="th-sprite" src="${esc(url)}" alt="" onerror="app.spriteFail(this)">`;
    return TF.Buddy.svg(this.buddyArt(Object.assign({ pose: pose || 'stand', face, gear: [], scale: 8 }, look || {})));
  },

  /** 立绘加载失败（清单在、图没打进包）：记下这张，换回像素小人 */
  spriteFail(img) {
    if (TF.Art) TF.Art.fail(img.getAttribute('src'));
    const s = this._scene;
    const box = img.parentNode;
    if (box) box.innerHTML = this.sceneActor((s && s.face) || '平静', 'stand', s && s.look);
  },

  /** 背景：有背景图用图（盖在 CSS 画的上面），没有就是 CSS 画的 */
  sceneBg(id) {
    const el = this.theaterEl();
    el.dataset.bg = id || 'room';
    const url = TF.Art ? TF.Art.bg(el.dataset.bg) : '';
    el.querySelector('.th-bg').style.backgroundImage = url ? `url("${url}")` : '';
    el.classList.toggle('bg-art', !!url);
  },

  /** 谁在说：null 旁白（''），「@老周」别人，其余是 TA */
  sceneWho(face) {
    return face == null ? '' : String(face)[0] === '@' ? String(face).slice(1) : this.buddyName();
  },

  /** 一句：TA 的样子跟着表情、姿势换，话一个字一个字打出来 */
  sceneLine(line, look) {
    const s = this._scene;
    const face = line[0];
    const text = TF.Theater.fill(line[1], s.vars);
    const pose = line[2];
    const el = this.theaterEl();
    s.line = text;
    const other = typeof face === 'string' && face[0] === '@';
    // 表情写 null 的是旁白（「你说：…」）：不挂名字牌；「@老周」是别人在说：名字牌换成他，TA 退到后面
    el.classList.toggle('narr', face == null);
    el.classList.toggle('other', other);
    el.querySelector('.th-name').textContent = this.sceneWho(face);
    s.log.push({ who: this.sceneWho(face), text });
    if (face != null && !other) {
      const actor = el.querySelector('.th-actor');
      if (look) s.look = Object.assign({}, s.look || {}, look);
      const cg = s.cg && this.cgDef(s.cg);
      actor.innerHTML = this.sceneActor(face, (cg && cg.pose) || pose, Object.assign({}, s.look || {}, cg && cg.outfit ? { outfit: cg.outfit } : {}));
      // 表情动起来：害羞、心动冒爱心，不服抖一下，开心、得意蹦一下
      actor.classList.remove('th-hop', 'th-shake');
      void actor.offsetWidth;
      if (face !== s.face) {
        if (/开心|得意|闪亮/.test(face)) actor.classList.add('th-hop');
        else if (/不服/.test(face)) actor.classList.add('th-shake');
        if (/害羞|心动/.test(face)) this.sceneHearts();
      }
      s.face = face;
    }
    this.typeOut(el.querySelector('.th-text'), text);
    this.sceneAutoNext();
  },

  sceneHearts() {
    if (this.reducedMotion()) return;
    const box = this.theaterEl().querySelector('.th-hearts');
    box.innerHTML = [0, 1, 2].map(i => `<i style="--d:${i * 0.18}s;--x:${(i - 1) * 34}px">♥</i>`).join('');
    clearTimeout(this._heartT);
    this._heartT = setTimeout(() => { box.innerHTML = ''; }, 1800);
  },

  /** 选项：浮在上面，别盖住 TA */
  sceneAsk(step) {
    const s = this._scene;
    s.phase = 'choose';
    s.ask = step;
    clearTimeout(this._autoT);
    const el = this.theaterEl();
    el.classList.add('choosing');
    el.querySelector('.th-choices').innerHTML = step.opts.map((o, k) => `<button class="th-choice" type="button" data-k="${k}" style="--i:${k}">${esc(TF.Theater.fill(TF.Theater.normOpt(o).t, s.vars))}</button>`).join('');
  },

  sceneChoose(k) {
    const s = this._scene;
    if (!s || s.phase !== 'choose' || !s.ask) return;
    const raw = s.ask.opts[k];
    if (!raw) return;
    const opt = TF.Theater.normOpt(raw);
    s.chose = true;
    const el = this.theaterEl();
    el.classList.remove('choosing');
    el.querySelector('.th-choices').innerHTML = '';
    window.Haptics && window.Haptics.fire('success');
    s.log.push({ who: '你', text: TF.Theater.fill(opt.t, s.vars) });
    const look = s.sc.onChoose ? s.sc.onChoose(k, opt, s.ask.ask) : null;
    // 选项后面 TA 回的几句插在这里，接着往下演；改了样子（秀肌肉、换衣服）的从第一句起生效
    const reply = (opt.r || []).map((l, i) => (i === 0 && look && look.pose ? [l[0], l[1], look.pose, l[3]] : l));
    s.steps.splice(s.i + 1, 0, ...reply);
    s.ask = null;
    if (look && look.outfit) s.look = Object.assign({}, s.look || {}, { outfit: look.outfit });
    this.sceneNext();
  },

  /** 跳过：一直往下，到下一个选项停；没有选项了就收场（看过的照样算看过） */
  sceneSkip() {
    const s = this._scene;
    if (!s) return;
    clearInterval(this._typeT);
    clearTimeout(this._autoT);
    const el = this.theaterEl();
    el.querySelector('.th-card').classList.remove('show');
    clearTimeout(this._cardT);
    if (s.phase === 'choose') return;
    const ctx = this.sceneCtx();
    for (let j = s.i + 1; j < s.steps.length; j++) {
      const step = s.steps[j];
      if (Array.isArray(step)) {
        if (TF.Theater.evalCond(step[3], ctx)) s.log.push({ who: this.sceneWho(step[0]), text: TF.Theater.fill(step[1], s.vars) });
        continue;
      }
      if (step.cond && !TF.Theater.evalCond(step.cond, ctx)) continue;
      if (step.bg) this.sceneBg(step.bg);
      if (step.cg != null) this.sceneCg(step.cg);
      if (step.end) s.ending = step.end;
      if (step.ask) {
        s.i = j;
        // 选项前那一句留在对话框里，知道在选什么
        const prev = [...s.log].reverse().find(x => x.who !== '你');
        if (prev) { el.querySelector('.th-text').textContent = prev.text; el.querySelector('.th-name').textContent = prev.who || this.buddyName(); el.classList.toggle('narr', !prev.who); }
        this.sceneAsk(step);
        return;
      }
    }
    s.i = s.steps.length;
    this.sceneEnd(true);
  },

  /** 自动：打完一句，停一会儿（按字数）自己往下；选项那里停 */
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
    const ms = this.reducedMotion() ? 2200 : [...(s.line || '')].length * 45 / 2 + 1600;
    this._autoT = setTimeout(() => { if (this._scene === s && s.auto && s.phase === 'line') this.sceneNext(); }, ms);
  },

  /** 回看：这一场说过的话（你选的也在里面） */
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
    if (cg && cg.bg) this.sceneBg(cg.bg);
    const tag = el.querySelector('.th-cgtag');
    tag.textContent = cg ? `CG · ${cg.title}` : '';
    tag.classList.remove('show');
    if (cg) { void tag.offsetWidth; tag.classList.add('show'); }
    // 道具画在 .th-cgfx 里：雨伞、星星、水面、花瓣、灯光、聚光…（CSS 画的）
    // 有画好的 CG（art.js）就整屏放那张图；没有就用像素小人 + 道具拼（.th-cgfx 里：雨伞、橘猫、水面、聚光灯…）
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
    clearInterval(this._typeT);
    clearTimeout(this._cardT);
    clearTimeout(this._autoT);
    if (s.sc.onEnd) s.sc.onEnd(!!s.chose, skip, s.ending);
    if (s.ending && this.creditsHtml) {
      s.phase = 'credits';
      el.classList.remove('choosing');
      el.classList.add('rolling');
      const cr = el.querySelector('.th-credits');
      cr.innerHTML = this.creditsHtml(s.ending);
      cr.classList.remove('hidden');
      if (window.Sound) window.Sound.play('unlock', 0.6);
      return;
    }
    this.theaterClose();
  },

  theaterClose() {
    const el = this.theaterEl();
    const s = this._scene;
    this._scene = null;
    el.classList.add('closing');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('closing', 'choosing', 'rolling', 'in-cg'); el.querySelector('.th-credits').classList.add('hidden'); document.body.classList.remove('in-theater'); }, this.reducedMotion() ? 0 : 280);
    this.renderBuddy && this.renderBuddy();
    if (s && s.sc.after) setTimeout(s.sc.after, 400);
  },

  /** 相册里点一张：只看这张 CG 和它那句话 */
  viewCg(id) {
    const cg = this.cgDef(id);
    if (!cg) return false;
    return this.playScene({ label: '相册', bg: cg.bg || 'room', viewer: true, script: [{ cg: id }, [null, cg.caption || cg.title]] });
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
      // 前面还有没看的主线（老用户一下跳了几章）：升级时不抢着演后面的章节，免得剧透、乱了顺序；退回一句话的升级气泡，剧情按顺序在「新剧情」里看
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
      label: this.chapterLabel(lv), title: `「${st[0]}」`, bg: (c.chapterBg || [])[lv - 1] || 'room', lines,
      choices: outfits.length ? this.wearChoices(outfits) : null,
      onChoose: (k, ch) => this.wearChosen(ch),
      onEnd: () => { if (!opts.replay && this.buddyDo) setTimeout(() => this.buddyDo([['flex', 1100], ['stand', 300]]), 350); },
      after: opts.after
    });
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
