/**
 * 剧场（v7.0，用户：「能不能搞成像 GalGame 那样？身材、回忆、话多话少这些都融入一个 Galgame 的大系统，有剧情推进」）。
 *
 * 剧情不再挤在小气泡里：整屏一个场景——背景（房间、泳池、健身房、夜里、下雨…）、大大的 TA、名字牌、底下一个对话框，
 * 一句一句打出来，点一下下一句，最后几个选项。每章开头（亲密度升级）、跟着你日子来的小剧情（story.js）、设置里重看，都在这里演。
 * 都是写好的台词，不调大模型；选「陪你聊会儿」这种的，演完把输入框亮一下，接着才是大模型聊。
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
  TF.Theater = { SCENE_BG, splitLines, CN };
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
    el.innerHTML = '<div class="th-bg"></div><div class="th-fx" aria-hidden="true"></div>' +
      '<div class="th-top"><span class="th-label"></span><button class="th-skip" type="button">跳过 ›</button></div>' +
      '<div class="th-card" aria-hidden="true"><small class="th-card-label"></small><b class="th-card-title"></b></div>' +
      '<div class="th-stage"><div class="th-actor"></div><div class="th-hearts" aria-hidden="true"></div></div>' +
      '<div class="th-choices"></div>' +
      '<div class="th-box"><div class="th-name"></div><p class="th-text"></p><span class="th-more" aria-hidden="true">▼</span></div>';
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const s = this._scene;
      if (!s) return;
      if (e.target.closest('.th-skip')) { this.sceneEnd(true); return; }
      const b = e.target.closest('.th-choice');
      if (b) { this.sceneChoose(+b.dataset.k); return; }
      if (s.phase === 'choose') return;
      this.sceneTap();
    });
    return el;
  },

  /**
   * 演一场。sc：{ label（左上角「第三章 · 搭子」）, title（开场的大字，没有就不出）, bg, lines: [[表情, 话, 姿势?]],
   *   choices: [[选项, TA 回的话, 表情, …]], onChoose(k) → 可以返回 { pose, outfit } 改 TA 的样子, onEnd(chose) }
   */
  playScene(sc) {
    if (this._scene || !sc || !(sc.lines || []).length) return false;
    const el = this.theaterEl();
    const pop = document.getElementById('buddy-pop');
    if (pop) pop.classList.add('hidden');
    this._scene = { sc, i: -1, phase: 'card', face: '', look: null };
    el.dataset.bg = sc.bg || 'room';
    el.querySelector('.th-label').textContent = sc.label || '';
    el.querySelector('.th-name').textContent = this.buddyName();
    el.querySelector('.th-choices').innerHTML = '';
    el.querySelector('.th-text').textContent = '';
    el.querySelector('.th-actor').innerHTML = '';
    el.classList.remove('hidden', 'closing', 'choosing');
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
    if (text.querySelector('.type-ghost')) { clearInterval(this._typeT); text.textContent = s.line || ''; return; }
    window.Haptics && window.Haptics.fire('tick');
    if (s.phase === 'reply' || s.phase === 'last') { this.sceneEnd(false); return; }
    this.sceneNext();
  },

  sceneNext() {
    const s = this._scene;
    const sc = s.sc;
    s.i += 1;
    if (s.i < sc.lines.length) {
      s.phase = s.i === sc.lines.length - 1 && !(sc.choices || []).length ? 'last' : 'line';
      this.sceneLine(sc.lines[s.i]);
      return;
    }
    if ((sc.choices || []).length && !s.chose) {
      s.phase = 'choose';
      const el = this.theaterEl();
      el.classList.add('choosing');
      el.querySelector('.th-choices').innerHTML = sc.choices.map((c, k) => `<button class="th-choice" type="button" data-k="${k}" style="--i:${k}">${esc(c[0])}</button>`).join('');
      return;
    }
    this.sceneEnd(false);
  },

  /** 一句：TA 的样子跟着表情、姿势换，话一个字一个字打出来 */
  sceneLine(line, look) {
    const s = this._scene;
    const [face, text, pose] = line;
    const el = this.theaterEl();
    s.line = text;
    // 表情写 null 的是旁白（「你说：…」）：不挂名字牌，TA 的样子不变
    el.classList.toggle('narr', face == null);
    if (face == null) { this.typeOut(el.querySelector('.th-text'), text); return; }
    const actor = el.querySelector('.th-actor');
    if (look) s.look = look;
    const art = this.buddyArt(Object.assign({ pose: pose || 'stand', face, gear: [], scale: 8 }, s.look || {}));
    actor.innerHTML = TF.Buddy.svg(art);
    // 表情动起来：害羞、心动冒爱心，不服抖一下，开心、得意蹦一下
    actor.classList.remove('th-hop', 'th-shake');
    void actor.offsetWidth;
    if (face !== s.face) {
      if (/开心|得意|闪亮/.test(face)) actor.classList.add('th-hop');
      else if (/不服/.test(face)) actor.classList.add('th-shake');
      if (/害羞|心动/.test(face)) this.sceneHearts();
    }
    s.face = face;
    this.typeOut(el.querySelector('.th-text'), text);
  },

  sceneHearts() {
    if (this.reducedMotion()) return;
    const box = this.theaterEl().querySelector('.th-hearts');
    box.innerHTML = [0, 1, 2].map(i => `<i style="--d:${i * 0.18}s;--x:${(i - 1) * 34}px">♥</i>`).join('');
    clearTimeout(this._heartT);
    this._heartT = setTimeout(() => { box.innerHTML = ''; }, 1800);
  },

  sceneChoose(k) {
    const s = this._scene;
    if (!s || s.phase !== 'choose') return;
    const c = s.sc.choices[k];
    if (!c) return;
    s.chose = true;
    const el = this.theaterEl();
    el.classList.remove('choosing');
    el.querySelector('.th-choices').innerHTML = '';
    window.Haptics && window.Haptics.fire('success');
    const look = s.sc.onChoose ? s.sc.onChoose(k, c) : null;
    if (!c[1]) { this.sceneEnd(false); return; }
    s.phase = 'reply';
    this.sceneLine([c[2] || '平静', c[1], look && look.pose], look && look.outfit ? { outfit: look.outfit } : null);
  },

  /** 演完（skip：点了跳过） */
  sceneEnd(skip) {
    const s = this._scene;
    if (!s) return;
    const el = this.theaterEl();
    clearInterval(this._typeT);
    clearTimeout(this._cardT);
    this._scene = null;
    el.classList.add('closing');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('closing', 'choosing'); document.body.classList.remove('in-theater'); }, this.reducedMotion() ? 0 : 280);
    if (s.sc.onEnd) s.sc.onEnd(!!s.chose, skip);
    this.renderBuddy && this.renderBuddy();
  },

  /**
   * 一章的开头（亲密度升级，或者设置里重看）：那段回忆拆成几句演出来。
   * opts：{ lead（升级时先说的那句）, outfits（这次解锁的衣服：最后问换不换）, replay, after（演完接着做的，比如新手教程） }
   */
  playChapter(lv, opts) {
    opts = opts || {};
    const c = this.cast();
    const st = c.story[lv - 1];
    if (!st) return false;
    const faces = lv === 4 ? ['平静', '担心', '害羞'] : lv === 5 ? ['平静', '害羞', '心动'] : ['平静', '开心', '害羞'];
    const parts = TF.Theater.splitLines(st[1]);
    const lines = parts.map((t, i) => [faces[Math.min(faces.length - 1, Math.floor(i * faces.length / parts.length))], t]);
    if (opts.lead) lines.unshift(['开心', opts.lead, 'wave']);
    const outfits = (opts.outfits || []).slice(-2);
    const wear = c.sex === 'f' ? '嘿嘿，好看吗？' : '……好看吗。';
    return this.playScene({
      label: this.chapterLabel(lv), title: `「${st[0]}」`, bg: (c.chapterBg || [])[lv - 1] || 'room', lines,
      choices: outfits.length ? outfits.map(k => [`换上「${this.outfitLabel(k)}」`, wear, '害羞', '', k]).concat([['先不换', '', '平静']]) : null,
      onChoose: (k, ch) => {
        if (!ch[4]) return null;
        this.setBuddy(Object.assign(this.buddyLook(), { outfit: ch[4] }));
        return { pose: 'flex', outfit: ch[4] };
      },
      onEnd: () => {
        if (!opts.replay && this.buddyDo) setTimeout(() => this.buddyDo([['flex', 1100], ['stand', 300]]), 350);
        if (opts.after) setTimeout(opts.after, 400);
      }
    });
  }
});
