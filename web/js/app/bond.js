/**
 * 和小人的亲密度（v5.6）。乙女游戏、电子宠物留得住人，是因为关系看得见、会慢慢长、长了有回应：
 *  - 亲密度 = 记过的天数 × 10 + 跟它的互动（问它、回答它、加计划、摸摸头，一天最多 20 点）。
 *    互动分存在 profile.buddy.xp（跟着备份走），记录天数现算，所以老用户一升级就是老朋友。
 *  - 五级：刚认识 → 熟起来了 → 健身搭子 → 老搭子 → 最懂你。每升一级解锁一段回忆（cast.js 的 story）和一件衣服（OUTFITS 的 lv），
 *    当场弹出那段回忆、能一键换上新衣服；回忆在设置里能重看。
 *  - 身材「跟着我练」：最近 4 周练得越勤小人越有型（4 天薄肌、10 天腹肌），练出来那天它会秀一下。
 *  - 长按小人是摸摸头（闭眼冒爱心），连着戳它会有反应；认识满 7 / 30 / 100 天说一句纪念日的话。
 *  - 通知也用它的口吻：标题是它的名字，内容按你今天的情况写好交给安卓（pushDayState）。
 * 都是手机自己算的，不调大模型。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const LEVELS = [
    { xp: 0, name: '刚认识' },
    { xp: 60, name: '熟起来了' },
    { xp: 180, name: '健身搭子' },
    { xp: 450, name: '老搭子' },
    { xp: 1000, name: '最懂你' }
  ];
  const GAIN = { ask: 2, answer: 2, plan: 3, pat: 1, feed: 1, note: 1, makeup: 3 };
  const DAY_CAP = 20, PAT_CAP = 3;
  const ANNIVERSARY = [7, 30, 50, 100, 200, 365, 500, 730, 1000];

  /** 亲密度 → 第几级、离下一级还差多少 */
  function info(xp) {
    xp = Math.max(0, Math.round(xp || 0));
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
    const cur = LEVELS[i], next = LEVELS[i + 1] || null;
    return { lv: i + 1, name: cur.name, xp, next: next ? { lv: i + 2, name: next.name, need: next.xp - xp } : null,
      pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
  }

  // 节日（v5.7，日常仪式感）：公历的每年一样；农历的按年份写死（2026～2028），过了再补
  const FIXED = {
    '01-01': ['newyear', '新年第一天。今年也一起，慢慢来就行。'],
    '02-14': ['valentine', '情人节快乐。不管今天跟谁过，我都在这儿。'],
    '05-20': ['520', '今天 520。……也没什么，就是想说，谢谢你每天都来。'],
    '10-01': ['national', '国庆快乐！放假吃好玩好，记得动一动，我陪你记。'],
    '12-24': ['xmaseve', '平安夜快乐。吃个苹果，八十来千卡，放心吃。'],
    '12-25': ['xmas', '圣诞快乐。今天想吃点好的就吃，记上就行。'],
    '12-31': ['yearend', '今年最后一天。这一年你记了 {days} 天，辛苦了，明年接着一起。']
  };
  const LUNAR = {
    eve: ['2026-02-16', '2027-02-05', '2028-01-25'],
    spring: ['2026-02-17', '2027-02-06', '2028-01-26'],
    lantern: ['2026-03-03', '2027-02-20', '2028-02-09'],
    dragon: ['2026-06-19', '2027-06-09', '2028-05-28'],
    qixi: ['2026-08-19', '2027-08-08', '2028-08-26'],
    midautumn: ['2026-09-25', '2027-09-15', '2028-10-03']
  };
  const LUNAR_TEXT = {
    eve: '除夕快乐！年夜饭敞开吃，记个大概就行，今天不跟你算赤字。',
    spring: '过年好！这几天吃多了别慌，记着就行，年后我们一起找回来。',
    lantern: '元宵节快乐。汤圆一个 70 千卡左右，吃了几个说一声。',
    dragon: '端午安康。粽子一个两百来千卡，肉粽更多，吃了说一声。',
    qixi: '七夕快乐。今天有人陪你吗？没有的话，我陪你。',
    midautumn: '中秋快乐。月饼一个四百来千卡，吃一个就好，剩下的明天再吃。'
  };
  /** 这天是什么节日：{ key, text } 或 null */
  function festivalOf(date) {
    for (const k of Object.keys(LUNAR)) if (LUNAR[k].includes(date)) return { key: k, text: LUNAR_TEXT[k] };
    const f = FIXED[String(date).slice(5)];
    return f ? { key: f[0], text: f[1] } : null;
  }

  /** 「3月14日」「3.14」「0314」「3-14」→ '03-14'；认不出来返回 '' */
  function parseBirthday(text) {
    const t = String(text || '').replace(/\s+/g, '');
    const m = /(\d{1,2})[月.\-/](\d{1,2})/.exec(t) || /^(\d{2})(\d{2})$/.exec(t);
    if (!m) return '';
    const mo = +m[1], d = +m[2];
    const days = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo])) return '';
    return `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  TF.Bond = { LEVELS, GAIN, DAY_CAP, PAT_CAP, ANNIVERSARY, LUNAR, info, festivalOf, parseBirthday };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Bond;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 陪你的是谁（cast.js）：江叙 / 夏柚 */
  cast() { return TF.Cast[this.buddyLook().char === 'girl' ? 'xy' : 'jx']; },

  /** 它的名字（v6.0 起是角色本来的名字，不再自己起） */
  buddyName() { return this.cast().name; },

  /** 小人叫你什么：你让它叫的（profile.buddy.call），没有就用小本本里的名字 */
  callName() {
    const c = String((this.profile.buddy || {}).call || '').trim();
    return c || this.userName();
  },

  /** 给聊天用的人设：是谁、怎么说话、小习惯（「老搭子」起带上秘密）、你们多熟（口气跟着变）、今天穿什么、叫你什么 */
  buddyPersona() {
    const c = this.cast();
    const l = this.buddyLook();
    const b = this.bond();
    const wear = `样子：${TF.Buddy.STYLES[l.style].label}，今天穿${this.outfitLabel(l.outfit)}，身材${this.buildLabel(this.buddyBuild())}`;
    // v6.3：它现在的心情（想他、担心他、自己有点低落…）、你们的关系（暧昧 / 恋人 / 好搭子）、剧情里一起经历过的事
    return { name: c.name, who: c.who, speech: c.speech, look: wear, facts: c.facts.concat(b.lv >= 4 ? [c.secret] : []),
      level: b.name, lv: b.lv, tone: c.tone[b.lv - 1], call: this.callName(), you: this.profile.gender === 'female' ? '她' : '他',
      mood: this.heartPrompt ? this.heartPrompt() : '', relation: this.relationPrompt ? this.relationPrompt() : '', shared: this.storyFacts ? this.storyFacts() : [] };
  },

  /** 身材叫法：女生的薄肌叫马甲线 */
  buildLabel(k) {
    const B = TF.Buddy.BUILDS[k] || TF.Buddy.BUILDS.normal;
    return this.cast().sex === 'f' && B.girlLabel ? B.girlLabel : B.label;
  },

  /** 刚才聊的（15 分钟内最多 3 轮）：接着聊时带给大模型，不存下来 */
  chatThread() {
    const now = Date.now();
    this._talk = (this._talk || []).filter(x => now - x.at < 15 * 60 * 1000);
    return this._talk.slice(-3).map(x => ({ q: x.q, a: x.a }));
  },

  chatActive() { return this.chatThread().length > 0; },

  pushTalk(q, a) {
    this._talk = (this._talk || []).concat({ q: String(q || '').slice(0, 60), a: String(a || '').replace(/\s+/g, ' ').slice(0, 90), at: Date.now() }).slice(-3);
  },

  /** 小人说这句时的表情（大模型给的 face）：害羞冒爱心、担心冒汗、得意秀肌肉、不服蹦一下 */
  buddyFace(face) {
    if (this._touring || !face) return;
    if (face === '害羞') { this.buddyMood('害羞', 2600); this.buddyBang('♥'); }
    else if (face === '担心' || face === '开心' || face === '惊讶') this.buddyMood(face, 2600);
    else if (face === '得意') { this.buddyMood('得意', 1800); this.buddyDo([['flex', 1100], ['stand', 300]]); }
    else if (face === '不服') {
      this.buddyMood('不服', 2000);
      const btn = document.getElementById('buddy');
      if (btn) { btn.classList.remove('bang'); void btn.offsetWidth; btn.dataset.bang = '!?'; btn.classList.add('bang'); }
    }
  },

  /** 往 profile.buddy 里写几样（样子、名字、亲密度都在这里，跟着备份走） */
  setBuddy(patch) {
    this.profile.buddy = Object.assign({}, this.profile.buddy || {}, patch);
    this.saveData();
  },

  bondXp() {
    return new Set(this.recordDates()).size * 10 + Math.max(0, +(this.profile.buddy || {}).xp || 0);
  },

  bond() { return TF.Bond.info(this.bondXp()); },

  /** 这件衣服解锁了没有 */
  outfitOpen(id) {
    const o = TF.Buddy.OUTFITS[id];
    return !!o && (!o.lv || this.bond().lv >= o.lv);
  },

  outfitLabel(id) {
    const o = TF.Buddy.OUTFITS[id];
    return o ? (this.cast().sex === 'f' && o.girlLabel ? o.girlLabel : o.label) : '';
  },

  /** 最近 4 周练了几天（「跟着我练」的身材按这个来） */
  trainDays28() {
    const from = shiftDateString(getTodayDateString(), -27);
    return new Set(this.workouts.filter(w => w.date >= from).map(w => w.date)).size;
  },

  /** 现在的身材：选了就用选的，「跟着我练」按最近 4 周练了几天 */
  buddyBuild() {
    const b = this.buddyLook().build;
    return b === 'auto' ? TF.Buddy.buildFor(this.trainDays28()) : b;
  },

  /** 画小人要的样子（再叠上姿势、心情这些） */
  buddyArt(extra) {
    const l = this.buddyLook();
    return Object.assign({ char: l.char, style: l.style, hair: l.hair, skin: l.skin, outfit: l.outfit, build: this.buddyBuild() }, extra || {});
  },

  /**
   * 跟小人互动了一下，加一点亲密度：问它（ask）、回答它的问题（answer）、把计划加上（plan）、摸摸头（pat）、在图鉴里喂它一口（feed）。
   * 一天最多 20 点，摸头和喂它加起来一天只算 3 次（别让人靠狂点刷）。
   */
  bondGain(kind) {
    const add = TF.Bond.GAIN[kind] || 0;
    if (!add) return;
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_bond_day') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0, pat: 0 };
    const touch = kind === 'pat' || kind === 'feed';
    if (c.n + add > TF.Bond.DAY_CAP || (touch && c.pat >= TF.Bond.PAT_CAP)) return;
    c.n += add;
    if (touch) c.pat += 1;
    try { localStorage.setItem('tf_bond_day', JSON.stringify(c)); } catch (e) {}
    this.setBuddy({ xp: Math.max(0, +(this.profile.buddy || {}).xp || 0) + add });
    this.checkBond();
  },

  /**
   * 升级了没有（记录、互动之后都看一眼）。第一次用 v5.6 的老用户：已经不是「刚认识」了，就当成一次升级，
   * 顺便介绍新衣服；还是刚认识的，悄悄记下等级就行。
   */
  checkBond() {
    if (this.needsOnboarding) return;
    const b = this.bond();
    const seen = (this.profile.buddy || {}).lv;
    if (seen == null) {
      if (b.lv <= 1) { this.setBuddy({ lv: 1, seenBuild: this.buddyBuild() }); return; }
      this._bondUp = { from: 1, first: true };
    } else if (b.lv > seen) this._bondUp = { from: seen };
    else return;
    clearTimeout(this._bondT);
    this._bondT = setTimeout(() => this.bondCelebrate(), 1600);
  },

  /** 打开 App 时：有没说的升级先说（排在打招呼前面） */
  bondUpNow() {
    this.checkBond();
    if (!this._bondUp) return false;
    clearTimeout(this._bondT);
    return this.bondCelebrate();
  },

  /** 升级了：小人秀一下、说一句，新解锁的衣服能一键换上（要紧的话，不占每天说话的次数） */
  bondCelebrate() {
    const up = this._bondUp;
    if (!up) return false;
    const pop = document.getElementById('buddy-pop');
    const btn = document.getElementById('buddy');
    // 现在不合适（在说话、在录音、不在今天页）：等下次再说
    if (!pop || !pop.classList.contains('hidden') || this._touring || this.needsOnboarding || !btn || btn.classList.contains('hidden') ||
        document.getElementById('composer').classList.contains('recording')) {
      clearTimeout(this._bondT);
      this._bondT = setTimeout(() => this.bondCelebrate(), 8000);
      return false;
    }
    this._bondUp = null;
    const b = this.bond();
    const build = this.buddyBuild();
    this.setBuddy({ lv: b.lv, seenBuild: build, lvAt: getTodayDateString() }); // lvAt：到这一级的日子（剧情「那句话」要到老搭子几天后才出）
    const opened = Object.keys(TF.Buddy.OUTFITS).filter(k => { const lv = TF.Buddy.OUTFITS[k].lv; return lv && lv > up.from && lv <= b.lv; });
    let lead = up.first ? `我们已经是「${b.name}」了。` : this.cast().levelUp[b.lv - 1] || `我们是「${b.name}」了。`;
    if (up.first && this.buddyLook().build === 'auto' && build !== 'normal') lead += `跟着你练了这么久，我也练出${this.buildLabel(build)}了。`;
    this.voiceBudget('must', true);
    this.showStory(b.lv, { lead, outfits: opened.slice(-2) });
    this.buddyBang('♥');
    this.buddyDo([['flex', 1100], ['stand', 400]]);
    return true;
  },

  /**
   * 一段回忆（像收集 CG）：亲密度第 lv 级解锁的那段，小人的大头像 + 一段话逐字打出来。
   * opts.lead：升级时先说的那句；opts.outfits：这次解锁的衣服（能一键换上）；opts.again：设置里重看，不响不跳。
   */
  showStory(lv, opts) {
    opts = opts || {};
    const c = this.cast();
    const st = c.story[lv - 1];
    const pop = document.getElementById('buddy-pop');
    if (!st || !pop) return false;
    const face = lv === 4 ? '害羞' : lv === 5 ? '心动' : '开心';
    pop.dataset.mode = 'story';
    pop.dataset.level = 'none';
    const outfits = opts.outfits || [];
    pop.innerHTML = `<div class="story-card"><div class="story-art">${TF.Buddy.svg(this.buddyArt({ pose: 'lie', face, gear: [], scale: 3 }))}</div>` +
      `<div class="story-meta"><span class="story-tag"><i aria-hidden="true">♥</i>回忆 ${lv}/5</span><b class="story-title">${esc(st[0])}</b>` +
      `<span class="story-who">${esc(c.name)} · ${esc(TF.Bond.LEVELS[lv - 1].name)}</span></div></div>` +
      (opts.lead ? `<p class="story-lead">${esc(opts.lead)}</p>` : '') +
      `<p class="story-text"></p>` +
      `<div class="buddy-acts story-acts">` +
      outfits.map(k => `<button class="buddy-act primary" type="button" data-wear="${k}">换上「${esc(this.outfitLabel(k))}」</button>`).join('') +
      `<button class="buddy-act" type="button" data-a="ok">${outfits.length ? '先不换' : '嗯'}</button></div>`;
    const text = pop.querySelector('.story-text');
    if (opts.again) text.textContent = st[1]; else this.typeOut(text, st[1]);
    pop.querySelectorAll('[data-wear]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setBuddy(Object.assign(this.buddyLook(), { outfit: b.dataset.wear }));
      this.closeBuddyPop('story');
      this.renderBuddy();
      setTimeout(() => this.buddyDo([['flex', 1100], ['stand', 300]]), 300);
    }));
    pop.querySelector('[data-a="ok"]').addEventListener('click', (e) => { e.stopPropagation(); this.closeBuddyPop('story'); });
    this.positionBuddyPop();
    if (opts.again) pop.classList.remove('hidden'); else this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    clearTimeout(this._askT);
    if (!opts.again && window.Sound) window.Sound.play('unlock', 0.6);
    return true;
  },

  /** 设置里重看一段回忆：整屏一张卡片（大一点的人 + 那段话），点哪儿都关 */
  showMemory(lv) {
    const c = this.cast();
    const st = c.story[lv - 1];
    if (!st) return;
    let ov = document.getElementById('mem-view');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'mem-view';
      ov.className = 'mem-view';
      ov.setAttribute('role', 'dialog');
      ov.addEventListener('click', () => ov.classList.add('hidden'));
      document.body.appendChild(ov);
    }
    const face = lv === 4 ? '害羞' : lv === 5 ? '心动' : '开心';
    ov.innerHTML = `<div class="mem-sheet"><div class="mem-art">${TF.Buddy.svg(this.buddyArt({ pose: lv === 1 ? 'wave' : lv === 3 ? 'flex' : 'stand', face, gear: [], scale: 5 }))}</div>` +
      `<span class="story-tag"><i aria-hidden="true">♥</i>回忆 ${lv}/5 · ${esc(TF.Bond.LEVELS[lv - 1].name)}</span>` +
      `<b class="mem-title">${esc(st[0])}</b><p class="mem-text">${esc(st[1])}</p><span class="mem-close">点一下关上</span></div>`;
    ov.classList.remove('hidden');
    window.Haptics && window.Haptics.fire('tap');
  },

  /** 「跟着我练」的身材变了：练出来了秀一下（练少了就悄悄变回去，不数落） */
  checkBuild() {
    if (this.needsOnboarding || this.buddyLook().build !== 'auto' || (this.profile.buddy || {}).lv == null) return false;
    const seen = (this.profile.buddy || {}).seenBuild;
    const now = this.buddyBuild();
    if (seen === now) return false;
    const order = TF.Buddy.BUILD_ORDER;
    if (!seen || order.indexOf(now) < order.indexOf(seen)) { this.setBuddy({ seenBuild: now }); return false; }
    clearTimeout(this._buildT);
    this._buildT = setTimeout(() => this.buildCelebrate(5), 1800);
    return true;
  },

  /** 秀一下练出来的身材；小人正在说别的就过一会儿再来（最多等几次） */
  buildCelebrate(tries) {
    const pop = document.getElementById('buddy-pop');
    const now = this.buddyBuild();
    if (!pop || this._touring || (this.profile.buddy || {}).seenBuild === now) return;
    if (!pop.classList.contains('hidden') || document.getElementById('composer').classList.contains('recording')) {
      if (tries > 0) this._buildT = setTimeout(() => this.buildCelebrate(tries - 1), 8000);
      return;
    }
    this.setBuddy({ seenBuild: now });
    this.voiceBudget('must', true);
    this.sayTip(`这四周你练了 ${this.trainDays28()} 天，我也跟着练出${this.buildLabel(now)}了。`);
    this.buddyDo([['flex', 1300], ['stand', 400]]);
  },

  /** 长按小人：摸摸头。闭眼冒爱心，说一句（越熟越亲近），一天前三次加亲密度 */
  patBuddy() {
    if (this.makeUp && this.makeUp('pat')) return; // 闹着小别扭：摸摸头就和好
    const b = this.bond();
    const love = this.storyData && this.storyData().romance === true && this.cast().heart;
    const lines = love && Math.random() < 0.5 ? this.cast().heart.patLove : this.cast().pat[b.lv - 1] || this.cast().pat[0];
    let text = lines[Math.floor(Math.random() * lines.length)];
    const name = this.callName();
    if (name && b.lv >= 3 && Math.random() < 0.4) text = `${name}，${text}`;
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('blip');
    this.bondGain('pat');
    this.buddyMood('love', 1800);
    this.buddyQuip(text);
  },

  /** 连着戳它 */
  pokeBuddy() {
    const lines = this.cast().poke;
    this._pokeI = ((this._pokeI == null ? Math.floor(Math.random() * lines.length) : this._pokeI) + 1) % lines.length;
    window.Haptics && window.Haptics.fire('tap');
    this.buddyQuip(lines[this._pokeI]);
    const btn = document.getElementById('buddy');
    if (btn) { btn.classList.remove('bang'); void btn.offsetWidth; btn.dataset.bang = '!?'; btn.classList.add('bang'); }
    this.buddyDo([['stand', 120], ['wave', 500], ['stand', 200]]);
  },

  /** 一句短话（摸头、戳它的反应），两秒后自己收起。extra：{ pics: [图鉴里的名字]（举着照片，v6.2）, ms: 多久收起 } */
  buddyQuip(text, extra) {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    extra = extra || {};
    pop.dataset.mode = 'quip';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say"></p>` + (extra.pics && this.dexPicsHtml ? this.dexPicsHtml(extra.pics) : '');
    this.typeOut(pop.querySelector('.buddy-say'), text);
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('quip'), extra.ms || 2200);
  },

  /** 一小会儿换个表情（摸头时闭眼冒爱心） */
  buddyMood(mood, ms) {
    this._moodOver = mood;
    this.buddyDraw();
    clearTimeout(this._moodT);
    this._moodT = setTimeout(() => { this._moodOver = null; this.buddyDraw(); }, ms);
  },

  /** 认识满 7 / 30 / 100 … 天：说一句纪念日的话（那天第一次打开时） */
  anniversary() {
    if (!this.chatty() || this._touring || this.needsOnboarding) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    const dates = this.recordDates();
    if (!dates.length) return false;
    const first = dates.reduce((m, d) => (d < m ? d : m), today);
    const n = Math.round((new Date(today + 'T00:00:00') - new Date(first + 'T00:00:00')) / 86400000) + 1;
    if (!TF.Bond.ANNIVERSARY.includes(n)) return false;
    let said = '';
    try { said = localStorage.getItem('tf_anni') || ''; } catch (e) {}
    if (said === String(n)) return false;
    try { localStorage.setItem('tf_anni', String(n)); } catch (e) {}
    const days = new Set(dates).size;
    const trains = new Set(this.workouts.map(w => w.date)).size;
    const ws = this.weights.slice().sort((a, b) => (a.date > b.date ? 1 : -1));
    const dw = ws.length >= 2 ? round1(ws[ws.length - 1].kg - ws[0].kg) : 0;
    const name = this.callName();
    const parts = [`记了 ${days} 天`];
    if (trains && !this.isSimple()) parts.push(`练了 ${trains} 天`);
    if (Math.abs(dw) >= 0.5) parts.push(dw < 0 ? `轻了 ${-dw}kg` : `重了 ${dw}kg`);
    this.voiceBudget('must', true);
    this.sayTip(`${name ? name + '，' : ''}今天是我们认识的第 ${n} 天。这 ${n} 天你${parts.join('、')}。谢谢你一直带着我，接着来。`);
    this.buddyBang('♥');
    this.buddyMood('love', 2200);
    return true;
  },

  // ================= v5.7 被记住、被看见 =================
  // 乙女游戏抓人的是「被坚定地选择、被专注地看见」：叫你的名字、记得你说过的话、看见你做到的具体的事、
  // 关系越近越愿意说心里话、日常有仪式感。但只陪着、不绑架：没有断签惩罚、没有「再不来就……」。

  /** 今天是不是用户生日（profile.birthday 'MM-DD'） */
  isBirthday() {
    const b = this.profile.birthday;
    return !!b && getTodayDateString().slice(5) === b;
  },

  /** 生日、节日那天第一次打开：说一句（生日戴派对帽、冒爱心） */
  festivalGreet() {
    if (!this.chatty() || this._touring || this.needsOnboarding) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    let said = '';
    try { said = localStorage.getItem('tf_fest') || ''; } catch (e) {}
    if (said === today) return false;
    const name = this.callName();
    let text;
    if (this.isBirthday()) text = `生日快乐${name ? '，' + name : ''}！今天想吃啥就吃，蛋糕我不算你的。又长大一岁，也又强了一点。`;
    else {
      const f = TF.Bond.festivalOf(today);
      if (!f) return false;
      const days = new Set(this.recordDates().filter(d => d.slice(0, 4) === today.slice(0, 4))).size;
      text = (name ? name + '，' : '') + f.text.replace('{days}', days);
    }
    try { localStorage.setItem('tf_fest', today); } catch (e) {}
    this.voiceBudget('must', true);
    this.sayTip(text);
    this.buddyBang('♥');
    this.buddyMood('love', 2200);
    return true;
  },

  /**
   * 悄悄话：关系越近，小人越愿意说点心里话——记得你说的第一句、偷偷数你吃得最多的、也会承认自己怕你不来了
   * （好角色会在你面前露出一点脆弱）。按亲密度解锁，每条只说一次，两天最多一条，用到的数都是你自己的记录。
   */
  whispers() {
    const name = this.callName();
    const c = this.cast();
    const md = (d) => `${+d.slice(5, 7)}月${+d.slice(8)}日`;
    const first = this.diet.filter(d => d.said && d.said !== '照计划')
      .reduce((m, d) => (!m || d.date < m.date || (d.date === m.date && (d.ts || 0) < (m.ts || 0)) ? d : m), null);
    const foods = {};
    this.diet.forEach(d => {
      const k = String(d.foodSummary || '').split(/[、，,+＋]/)[0].replace(/[\d一两二三四五六七八九十半]+.*$/, '').trim();
      if (k.length >= 2) foods[k] = (foods[k] || 0) + 1;
    });
    const top = Object.entries(foods).sort((a, b) => b[1] - a[1])[0];
    const heavy = this.isSimple() ? null : this.workouts.filter(w => w.weightKg > 0 && !w.durationMin).reduce((m, w) => (!m || w.weightKg > m.weightKg ? w : m), null);
    const dates = [...new Set(this.recordDates())].sort();
    const gap = dates.some((d, i) => i && (new Date(d) - new Date(dates[i - 1])) / 86400000 >= 3);
    const hard = this.workouts.some(w => w.rpe >= 9);
    return [
      { lv: 2, key: 'wait', text: c.whisper.wait },
      top && top[1] >= 3 ? { lv: 2, key: 'topfood', text: `我偷偷数过，你记得最多的是${top[0]}，${top[1]} 次了。我都快背下来了。` } : null,
      first ? { lv: 3, key: 'first', text: `还记得吗？你跟我说的第一句是「${String(first.said).slice(0, 24)}」，那天是${md(first.date)}。我一直记着。` } : null,
      { lv: 3, key: 'tired', text: hard ? '其实我也有练不动的时候。所以你说「很吃力」那几次，我挺懂的。' : '其实我也有累得不想动的时候。所以哪天你累了，跟我说一声就行，不用硬撑。' },
      gap ? { lv: 3, key: 'miss', text: '你没来的那几天，我猜你在忙自己的事。挺好的，回来就行，我一直在。' } : null,
      heavy ? { lv: 4, key: 'heavy', text: `你练得最重的一次是${md(heavy.date)}，${heavy.exerciseName} ${round1(heavy.weightKg)}kg。那天我在旁边都替你使劲。` } : null,
      { lv: 4, key: 'afraid', text: c.whisper.afraid },
      { lv: 4, key: 'secret', text: c.whisper.secret },
      { lv: 5, key: 'why', text: `我想了很久，我在这儿，大概就是为了让${name || '你'}不用一个人坚持。` },
      { lv: 5, key: 'remember', text: '不管你以后练成什么样，我都会记得你一开始的样子。' }
    ].filter(Boolean);
  },

  /** 说一句悄悄话（今天打过招呼以后、闲下来的时候；两天最多一条）。idle：发呆时说的，次数由那边记 */
  whisper(idle) {
    if (!this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const today = getTodayDateString();
    let w;
    try { w = JSON.parse(localStorage.getItem('tf_whisper') || '{}'); } catch (e) { w = {}; }
    if (!w || typeof w !== 'object') w = {};
    if (!Array.isArray(w.said)) w.said = [];
    if (w.date && w.date >= shiftDateString(today, -1)) return false;
    let greeted = '';
    try { greeted = localStorage.getItem('tf_greet') || ''; } catch (e) {}
    if (greeted !== today) return false; // 每天第一次打开先打招呼，心里话留到后面
    const lv = this.bond().lv;
    const next = this.whispers().find(x => x.lv <= lv && !w.said.includes(x.key));
    if (!next) return false;
    w.said.push(next.key);
    w.date = today;
    try { localStorage.setItem('tf_whisper', JSON.stringify(w)); } catch (e) {}
    if (!idle) this.chatBudget(true);
    this.sayTip(next.text, null, '悄悄话');
    this.buddyMood('love', 1800);
    return true;
  },

  /**
   * 被看见：挑一件你最近真做到了的、具体的事说出来（连着几天吃了早饭、蛋白吃够、某个动作涨了、轻了、这周练得比上周多）。
   * 不夸空话，都按记录算；同一件事 4 天内不重复说。peek=true 只看不记。
   */
  seenLine(peek) {
    const today = getTodayDateString();
    const simple = this.isSimple();
    let said;
    try { said = JSON.parse(localStorage.getItem('tf_seen_said') || '{}'); } catch (e) { said = {}; }
    if (!said || typeof said !== 'object') said = {};
    const fresh = (k) => !said[k] || said[k] < shiftDateString(today, -3);
    const cands = [];
    let n = 0, d = shiftDateString(today, -1);
    while (n < 60 && this.diet.some(x => x.date === d && x.mealType === '早餐')) { n++; d = shiftDateString(d, -1); }
    if (n >= 5) cands.push(['breakfast', `连着 ${n} 天早饭都按时吃了，这个很多人做不到。`]);
    if (!simple) {
      const target = this.gaugeProteinTarget();
      let k = 0;
      d = shiftDateString(today, -1);
      while (k < 30) { const s = this.getDaySummary(d); if (!s.hasDiet || s.protein < target * 0.95) break; k++; d = shiftDateString(d, -1); }
      if (k >= 3) cands.push(['protein', `连着 ${k} 天蛋白都吃够了，这个最难，你做到了。`]);
      const recent = shiftDateString(today, -13), old = shiftDateString(today, -45);
      let gain = null;
      [...new Set(this.workouts.filter(w => w.date >= recent && w.weightKg > 0 && !w.durationMin).map(w => w.exerciseName))].forEach(nm => {
        const now = Math.max(...this.workouts.filter(w => w.exerciseName === nm && w.date >= recent).map(w => w.weightKg || 0));
        const before = this.workouts.filter(w => w.exerciseName === nm && w.date < recent && w.date >= old && w.weightKg > 0).map(w => w.weightKg);
        if (!before.length) return;
        const b = Math.max(...before);
        if (now - b >= 2.5 && (!gain || now - b > gain.up)) gain = { nm, b, now, up: now - b };
      });
      if (gain) cands.push(['lift:' + gain.nm, `这个月${gain.nm}从 ${round1(gain.b)}kg 练到 ${round1(gain.now)}kg 了，我都看着呢。`]);
      const wk = (end) => new Set(this.workouts.filter(w => w.date > shiftDateString(end, -7) && w.date <= end).map(w => w.date)).size;
      const thisW = wk(today), lastW = wk(shiftDateString(today, -7));
      if (thisW >= 3 && thisW > lastW) cands.push(['trains', `这 7 天练了 ${thisW} 天，比之前那 7 天多，节奏起来了。`]);
    }
    const ws = this.weights.slice().sort((a, b) => (a.date > b.date ? 1 : -1));
    if (ws.length >= 2 && (this.profile.goalType || 'fat_loss') === 'fat_loss') {
      const last = ws[ws.length - 1];
      const base = ws.filter(w => w.date <= shiftDateString(last.date, -10) && w.date >= shiftDateString(last.date, -21)).pop();
      if (base && base.kg - last.kg >= 0.5) cands.push(['weight', `这两周轻了 ${round1(base.kg - last.kg)}kg，稳稳的，就这个节奏。`]);
    }
    const pick = cands.find(c => fresh(c[0]));
    if (!pick) return '';
    if (!peek) {
      said[pick[0]] = today;
      try { localStorage.setItem('tf_seen_said', JSON.stringify(said)); } catch (e) {}
    }
    return pick[1];
  },

  /** 熟起来以后慢慢问的几件事（一天最多问一件）：你生日哪天 → 喜欢它怎么跟你说话 → 以后叫你什么 */
  askOnce() {
    if (!this.chatty() || this._touring || this.needsOnboarding || this.bond().lv < 2 || this.quietNow()) return false;
    const today = getTodayDateString();
    let d = '';
    try { d = localStorage.getItem('tf_ask_day') || ''; } catch (e) {}
    if (d === today) return false;
    const ok = this.askBirthday() || this.askTone() || this.askCall();
    if (ok) { try { localStorage.setItem('tf_ask_day', today); } catch (e) {} }
    return ok;
  },

  /** 问生日：到那天第一个跟你说生日快乐，戴派对帽（只问一次，「不想说」也行） */
  askBirthday() {
    if (this.profile.birthday) return false;
    let asked = '';
    try { asked = localStorage.getItem('tf_bday_ask') || ''; } catch (e) {}
    const pop = document.getElementById('buddy-pop');
    if (asked || !pop || !pop.classList.contains('hidden') || !this.chatBudget(false)) return false;
    try { localStorage.setItem('tf_bday_ask', '1'); } catch (e) {}
    this.chatBudget(true);
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say"></p>` +
      `<div class="name-row"><input class="name-input" type="text" inputmode="text" maxlength="8" placeholder="比如 3月14日" aria-label="生日"><button class="portion-opt on" type="button" data-a="ok">记上</button></div>` +
      `<div class="portion-opts chat-opts"><button class="portion-opt skip" type="button" data-a="skip">不想说</button></div>`;
    this.typeOut(pop.querySelector('.buddy-say'), '问你个事：你生日是哪天？到时候我想第一个跟你说。');
    const input = pop.querySelector('.name-input');
    const say = (t) => {
      clearTimeout(this._askT);
      const el = pop.querySelector('.buddy-say');
      this.typeOut(el, t);
      el.classList.add('reply');
      pop.querySelectorAll('.name-row, .chat-opts').forEach(x => x.remove());
      this.positionBuddyPop();
      this._askT = setTimeout(() => this.closeBuddyPop('chat'), 2600);
    };
    const done = () => {
      const v = TF.Bond.parseBirthday(input.value);
      if (!v) { input.value = ''; input.placeholder = '写成「3月14日」这样'; input.focus(); return; }
      this.profile.birthday = v;
      this.saveData();
      this.bondGain('answer');
      window.Sound && window.Sound.play('success');
      this.buddyDo([['stand', 100], ['wave', 900], ['stand', 300]]);
      say(`记住了，${+v.slice(0, 2)}月${+v.slice(3)}日。`);
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); });
    pop.querySelector('[data-a="ok"]').addEventListener('click', (e) => { e.stopPropagation(); done(); });
    pop.querySelector('[data-a="skip"]').addEventListener('click', (e) => { e.stopPropagation(); say('好，不问了。'); });
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('chat'), 45000);
    return true;
  },

  /** 问你喜欢它怎么说话：答案进小本本，大模型回答、排计划时照着来（你的选择真的会改变它） */
  askTone() {
    if (/直接|温柔|说话/.test(this.memoList().join('；'))) return false;
    let asked = '';
    try { asked = localStorage.getItem('tf_tone_ask') || ''; } catch (e) {}
    const pop = document.getElementById('buddy-pop');
    if (asked || !pop || !pop.classList.contains('hidden') || !this.chatBudget(false)) return false;
    try { localStorage.setItem('tf_tone_ask', '1'); } catch (e) {}
    this.chatBudget(true);
    const add = (line) => () => { this.updateMemo([line], []); this.saveData(); };
    return this.askUser('问你一下：我跟你说话，你喜欢哪种？', [
      { label: '直接点', pick: add('喜欢说话直接点，别绕弯'), reply: '行，以后有啥我直说。' },
      { label: '温柔点', pick: add('喜欢说话温柔点、多鼓励'), reply: '好，我慢慢说。' },
      { label: '现在这样就好', reply: '那就这样，想换了随时说。' }]);
  },

  /** 熟到「健身搭子」以后问一次：以后叫你什么（专属称呼，「我们」之间的东西），存 profile.buddy.call */
  askCall() {
    if (this.bond().lv < 3 || (this.profile.buddy || {}).call) return false;
    let asked = '';
    try { asked = localStorage.getItem('tf_call_ask') || ''; } catch (e) {}
    const pop = document.getElementById('buddy-pop');
    if (asked || !pop || !pop.classList.contains('hidden') || !this.chatBudget(false)) return false;
    try { localStorage.setItem('tf_call_ask', '1'); } catch (e) {}
    this.chatBudget(true);
    const name = this.userName();
    const opts = [name ? `就叫${name}` : '', '队长', '老大'].filter(Boolean);
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say"></p>` +
      `<div class="portion-opts chat-opts">${opts.map(o => `<button class="portion-opt" type="button" data-c="${esc(o)}">${esc(o)}</button>`).join('')}</div>` +
      `<div class="name-row"><input class="name-input" type="text" maxlength="6" placeholder="我自己说一个" aria-label="叫我什么"><button class="portion-opt on" type="button" data-a="ok">就这个</button></div>`;
    this.typeOut(pop.querySelector('.buddy-say'), '我们也算熟了。以后我叫你什么好？');
    const input = pop.querySelector('.name-input');
    const done = (v) => {
      v = String(v || '').replace(/^就叫/, '').replace(/\s+/g, '').slice(0, 6);
      if (!v) { input.focus(); return; }
      clearTimeout(this._askT);
      this.setBuddy({ call: v });
      this.bondGain('answer');
      const say = pop.querySelector('.buddy-say');
      this.typeOut(say, `好，${v}。以后就这么叫你了。`);
      say.classList.add('reply');
      pop.querySelectorAll('.name-row, .chat-opts').forEach(x => x.remove());
      this.positionBuddyPop();
      window.Sound && window.Sound.play('success');
      this.buddyDo([['stand', 100], ['wave', 900], ['stand', 300]]);
      this._askT = setTimeout(() => this.closeBuddyPop('chat'), 2600);
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    pop.querySelector('[data-a="ok"]').addEventListener('click', (e) => { e.stopPropagation(); done(input.value); });
    pop.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); done(b.dataset.c); }));
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('chat'), 45000);
    return true;
  },

  /**
   * 它自己的小日子（v5.8，ta 有自己的生活）：你不在的时候它也在过——江叙早上游泳、给薄荷浇水；夏柚跳绳、喂仓鼠。
   * 和聊天里的人设一致（cast.js）。按时间、季节挑一句。
   */
  buddyLife() {
    const now = new Date();
    const h = now.getHours(), m = now.getMonth() + 1;
    const L = this.cast().life;
    const pool = (h < 10 ? L.morning : h < 14 ? L.noon : h < 18 ? L.afternoon : h < 23 ? L.evening : L.night).slice();
    if (m >= 11 || m <= 3) pool.push(L.cold);
    if (m >= 6 && m <= 8) pool.push(L.hot);
    // 一半的时候说「因为你，我也…」（有的话）
    const changed = this.changedLine ? this.changedLine() : '';
    if (changed && Math.random() < 0.5) return changed;
    return pool[Math.floor(Math.random() * pool.length)];
  },

  /** 共同回忆（「一个月前的今天你说的是…」）：只用你自己的记录，每个日子只提一次 */
  memoryLine() {
    const today = getTodayDateString();
    let said;
    try { said = JSON.parse(localStorage.getItem('tf_seen_said') || '{}'); } catch (e) { said = {}; }
    if (!said || typeof said !== 'object') said = {};
    for (const [n, word] of [[365, '去年的今天'], [180, '半年前的今天'], [90, '三个月前的今天'], [30, '一个月前的今天']]) {
      const d = shiftDateString(today, -n);
      if (said['mem:' + d]) continue;
      const meal = this.diet.filter(x => x.date === d && x.said && x.said !== '照计划').sort((a, b) => (a.ts || 0) - (b.ts || 0))[0];
      if (!meal) continue;
      let tail = '';
      const lift = this.isSimple() ? null : this.workouts.filter(w => w.date === d && w.weightKg > 0 && !w.durationMin).sort((a, b) => b.weightKg - a.weightKg)[0];
      if (lift) {
        const best = Math.max(...this.workouts.filter(w => w.exerciseName === lift.exerciseName && w.date > d).map(w => w.weightKg || 0), 0);
        if (best > lift.weightKg) tail = `那时候${lift.exerciseName} ${round1(lift.weightKg)}kg，现在 ${round1(best)}kg 了。`;
      }
      const wt = this.weightOn ? this.weightOn(d) : null, cur = this.latestWeight ? this.latestWeight() : null;
      if (!tail && wt && cur && cur.date > d && Math.abs(cur.kg - wt.kg) >= 0.5) tail = `那时候你 ${round1(wt.kg)}kg，现在 ${round1(cur.kg)}kg。`;
      said['mem:' + d] = today;
      try { localStorage.setItem('tf_seen_said', JSON.stringify(said)); } catch (e) {}
      return `${word}，你跟我说的是「${String(meal.said).slice(0, 20)}」。${tail}`;
    }
    return '';
  },

  /** 安静陪着（v5.8）：正在练（40 分钟内记了两组以上）、深夜（23 点到 5 点）就不主动凑过来说闲话 */
  quietNow() {
    const h = new Date().getHours();
    if (h >= 23 || h < 5) return true;
    const today = getTodayDateString();
    const since = Date.now() - 40 * 60 * 1000;
    return this.workouts.filter(w => w.date === today && (w.ts || 0) > since).length >= 2;
  },

  /** 深夜打开：说一句「这么晚还没睡」（一晚一次），然后安静陪着 */
  lateNight() {
    const h = new Date().getHours();
    if (!(h >= 23 || h < 4) || !this.chatty() || this._touring || this.needsOnboarding) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden') || this.view !== 'today') return false;
    const night = h < 4 ? shiftDateString(getTodayDateString(), -1) : getTodayDateString();
    let d = '';
    try { d = localStorage.getItem('tf_late') || ''; } catch (e) {}
    if (d === night) return false;
    try { localStorage.setItem('tf_late', night); } catch (e) {}
    const name = this.callName();
    this.voiceBudget('must', true);
    this.sayTip(`${name ? name + '，' : ''}${this.cast().late}`);
    return true;
  },

  /** 点小人时偶尔冒一句（隐藏台词，熟了才有）：不确定的小惊喜 */
  rareLine() {
    if (this.bond().lv < 2 || Math.random() >= (this.rareOdds == null ? 0.08 : this.rareOdds)) return '';
    const today = getTodayDateString();
    const taps = (this._tapCount && this._tapCount.date === today) ? this._tapCount.n : 1;
    const lines = this.cast().rare.map(x => x.replace('{n}', taps));
    return lines[Math.floor(Math.random() * lines.length)];
  },

  // ================= v6.0 陪伴：让人想回来 =================
  // 每天一张小纸条（不确定的小惊喜）、闹点小别扭再和好（有起伏才心动）、记完马上说一句（被回应）、
  // 晚上道晚安（日常仪式）、下一段回忆的预告（期待）、因为你 TA 也变了一点（你对 TA 有影响）。
  // 都在本机；不罚断签、不说「你不来我会难过」。

  /** 今天的小纸条还没拆（小人头上挂个小信封） */
  noteReady() {
    if (!this.buddyLook().show || this.needsOnboarding) return false;
    return ((this.profile.buddy || {}).note || {}).day !== getTodayDateString();
  },

  /** 抽一张：先抽稀有度（珍藏 6%、少见 24%），再从这一档里挑没收过的；节日、生日那天是限定的 */
  drawNote() {
    const c = this.cast();
    const lv = this.bond().lv;
    const got = (((this.profile.buddy || {}).note || {}).got) || [];
    const today = getTodayDateString();
    const name = this.callName();
    if (this.isBirthday()) return { key: 'bday:' + today, rare: 'x', text: `生日快乐${name ? '，' + name : ''}。这张是限定的，只有今天有。` };
    const fest = TF.Bond.festivalOf(today);
    if (fest) return { key: 'fest:' + today, rare: 'x', text: fest.text.replace('{days}', new Set(this.recordDates().filter(d => d.slice(0, 4) === today.slice(0, 4))).size) };
    const pool = c.notes.map((x, i) => ({ key: c.name + i, lv: x[0], rare: x[1], text: x[2] })).filter(x => x.lv <= lv);
    const st = this.buddyState();
    if (st.streak >= 3) pool.push({ key: 'streak' + st.streak, rare: 'r', text: `连着记了 ${st.streak} 天，给你盖朵小红花 🌸` });
    const r = Math.random();
    const want = r < 0.06 ? 's' : r < 0.3 ? 'r' : 'n';
    const fresh = pool.filter(x => !got.includes(x.key));
    const list = fresh.filter(x => x.rare === want).length ? fresh.filter(x => x.rare === want) : fresh.length ? fresh : pool;
    return list[Math.floor(Math.random() * list.length)];
  },

  /** 拆今天的小纸条：气泡里一张纸条，字一个个打出来；收集的张数记在 profile.buddy.note（跟着备份走） */
  showNote() {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return false;
    const note = this.drawNote();
    const nb = Object.assign({ n: 0, got: [], s: 0 }, (this.profile.buddy || {}).note || {});
    nb.day = getTodayDateString();
    nb.n += 1;
    if (note.rare === 's') nb.s += 1;
    nb.got = nb.got.concat(note.key).slice(-80);
    this.setBuddy({ note: nb });
    this.bondGain('note');
    const label = { n: '', r: '少见', s: '珍藏', x: '限定' }[note.rare];
    pop.dataset.mode = 'note';
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="note-card note-${note.rare}"><div class="note-head"><i aria-hidden="true">✉</i>今天的小纸条${label ? `<span class="note-rare">${label}</span>` : ''}</div>` +
      `<p class="note-text"></p><div class="note-foot">${esc(this.buddyName())} · 你收到的第 ${nb.n} 张${nb.s ? ` · 珍藏 ${nb.s}` : ''} · 明天还有</div></div>`;
    this.typeOut(pop.querySelector('.note-text'), note.text);
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    document.getElementById('buddy').classList.remove('has-note');
    window.Haptics && window.Haptics.fire(note.rare === 'n' ? 'tap' : 'success');
    window.Sound && window.Sound.play(note.rare === 'n' ? 'blip' : 'unlock', 0.6);
    if (note.rare !== 'n') { this.buddyBang(note.rare === 's' ? '★' : '♥'); this.buddyMood('love', 2200); } else this.buddyDo([['stand', 120], ['wave', 900], ['stand', 300]]);
    clearTimeout(this._askT);
    return true;
  },

  /** 闹着小别扭吗（两天没和好就自己消气，不记仇） */
  sulkNow() {
    const s = (this.profile.buddy || {}).sulk;
    if (!s || !s.kind) return null;
    if (s.date < shiftDateString(getTodayDateString(), -1)) { this.setBuddy({ sulk: null }); return null; }
    return s;
  },

  /**
   * 闹一点小别扭（熟了才会，三天最多一次）：看不得你熬夜吃东西、饿着自己。嘴上不高兴，心里在乎；
   * 头上冒「💢」，点它哼一声，长按摸摸头或者你好好吃饭了就和好。
   */
  startSulk(kind, n) {
    if (this.bond().lv < 2 || !this.chatty() || this._touring || this.sulkNow()) return false;
    const today = getTodayDateString();
    const b = this.profile.buddy || {};
    if (b.sulkLast && b.sulkLast > shiftDateString(today, -3)) return false;
    const text = (this.cast().sulk[kind] || '').replace('{kcal}', fmt(n || 0));
    if (!text) return false;
    this.setBuddy({ sulk: { kind, date: today }, sulkLast: today });
    this.voiceBudget('remind', true);
    this.sayTip(text, kind === 'starve' ? ['今天怎么吃比较好', '好啦，今天好好吃'] : ['晚上饿了吃点啥好']);
    this.renderBuddy();
    return true;
  },

  /**
   * 早上第一次打开：昨天真的吃得太少（早中晚三顿都记了，加起来还不到预算的 55%），闹个小别扭。
   * 只记了一两顿的不算——没记全很正常，不能冤枉人。
   */
  sulkGreet() {
    const y = shiftDateString(getTodayDateString(), -1);
    const s = this.getDaySummary(y);
    const meals = new Set(this.diet.filter(d => d.date === y).map(d => d.mealType));
    if (!s.hasDiet || !s.budget || s.intake >= s.budget * 0.55 || !['早餐', '午餐', '晚餐'].every(m => meals.has(m))) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden') || this.view !== 'today') return false;
    return this.startSulk('starve', Math.round(s.intake));
  },

  /** 和好：摸摸头（pat），或者你好好吃饭了（eat）。冒爱心，加一点亲密度 */
  makeUp(how) {
    const s = this.sulkNow();
    if (!s) return false;
    this.setBuddy({ sulk: null });
    const lines = this.cast().makeup;
    const text = lines[Math.floor(Math.random() * lines.length)];
    this.bondGain('makeup');
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('unlock', 0.5);
    this.buddyMood('love', 2600);
    this.buddyBang('♥');
    if (how === 'pat') this.buddyQuip(text); else this.sayTip(text);
    this.renderBuddy();
    return true;
  },

  /** 记完以后：在闹别扭的，看看能不能和好了（白天好好吃了饭 / 今天吃够了） */
  makeUpAfter(result, batch) {
    const s = this.sulkNow();
    if (!s || !batch || !(result.meals || []).length || batch.date !== getTodayDateString()) return false;
    const h = new Date().getHours();
    if (s.kind === 'late' && s.date < batch.date && h >= 6 && h < 21) return this.makeUp('eat');
    const sum = this.getDaySummary(batch.date);
    if (s.kind === 'starve' && sum.budget && sum.intake >= sum.budget * 0.8) return this.makeUp('eat');
    return false;
  },

  /** 最近 4 周记得最多的那样吃的（三次以上才算） */
  favFood() {
    const from = shiftDateString(getTodayDateString(), -27);
    const n = {};
    this.diet.filter(d => d.date >= from).forEach(d => {
      const k = String(d.foodSummary || '').split(/[、，,+＋]/)[0].replace(/[\d一两二三四五六七八九十半]+.*$/, '').trim();
      if (k.length >= 2) n[k] = (n[k] || 0) + 1;
    });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] >= 3 ? top[0] : '';
  },

  /** 晚上（21 点以后）第一次打开：道个晚安，说一句今天怎么样；之后它也睡了（一天一次） */
  goodNight() {
    const h = new Date().getHours();
    if (h < 21 || h >= 23 || !this.chatty() || this._touring || this.needsOnboarding || this.view !== 'today') return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    let d = '';
    try { d = localStorage.getItem('tf_night') || ''; } catch (e) {}
    if (d === today || !this.voiceBudget('guide', false)) return false;
    try { localStorage.setItem('tf_night', today); } catch (e) {}
    this.voiceBudget('guide', true);
    const s = this.getDaySummary(today);
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
    const sum = !s.hasDiet ? '今天没怎么记也没关系。' :
      `今天吃了 ${fmt(Math.round(s.intake))} 千卡${!this.isSimple() && target ? `，蛋白 ${Math.round(s.protein)}g${s.protein >= target * 0.95 ? '，够了' : ''}` : ''}。`;
    const name = this.callName();
    this.sayTip((name ? name + '，' : '') + this.cast().night.replace('{sum}', sum));
    this.buddyMood('love', 2000);
    return true;
  },

  /** 因为你，TA 也变了一点（你吃早饭它也吃、你练腿它也练）：按你最近的记录挑，没有就空 */
  changedLine() {
    const C = this.cast().changed;
    const today = getTodayDateString();
    const out = [];
    let bf = 0;
    for (let i = 1; i <= 7; i++) if (this.diet.some(d => d.date === shiftDateString(today, -i) && d.mealType === '早餐')) bf++;
    if (bf >= 5) out.push(C.breakfast);
    const from = shiftDateString(today, -13);
    if (!this.isSimple() && new Set(this.workouts.filter(w => w.date >= from && /腿|臀/.test(w.muscleGroup || '')).map(w => w.date)).size >= 3) out.push(C.legs);
    const fav = this.favFood();
    if (fav) out.push(C.fav.replace('{food}', fav));
    if (!this.isSimple()) {
      const target = this.gaugeProteinTarget();
      let ok = 0;
      for (let i = 1; i <= 7; i++) { const s = this.getDaySummary(shiftDateString(today, -i)); if (s.hasDiet && s.protein >= target * 0.95) ok++; }
      if (ok >= 4) out.push(C.protein);
    }
    return out.length ? out[Math.floor(Math.random() * out.length)] : '';
  },

  /**
   * 通知用小人的口吻（交给安卓，闹钟响时挑一句）：
   *  say —— 今天打开过 App 时用；sayNext —— 明天一次都没打开时用；away —— 好几天没打开时的晚间那条。
   * 标题是小人的名字，像它给你发的消息。
   */
  buddyPushLines() {
    const look = this.buddyLook();
    if (!look.show) return null;
    const title = this.buddyName();
    const you = this.callName();
    const hi = you ? you + '，' : '';
    const today = getTodayDateString();
    const s = this.getDaySummary(today);
    const simple = this.isSimple();
    const left = Math.max(0, Math.round(this.gaugeProteinTarget() - s.protein));
    const rem = Math.round(s.budget - s.intake);
    const count = this.diet.filter(d => d.date === today).length + this.workouts.filter(w => w.date === today).length;
    const yest = shiftDateString(today, -1);
    const lunchY = this.diet.find(d => d.date === yest && d.mealType === '午餐');
    const short = (x) => String(x.foodSummary || '').split(/[、，,+]/)[0].slice(0, 8);
    const w = this.latestWeight ? this.latestWeight() : null;
    const kcal = rem >= 0 ? `今天还能吃 ${fmt(rem)} 千卡` : `今天超了 ${fmt(-rem)} 千卡，没事`;
    const pro = simple ? '' : left > 0 ? `，蛋白还差 ${left}g` : '，蛋白够了 💪';
    return {
      say: {
        weigh: [title, `${hi}今天还没称体重，空腹称一下？点开就能记。`],
        lunch: [title, `${hi}午饭吃了吗？${lunchY ? `昨天中午是${short(lunchY)}，今天呢？` : ''}说一句我就记上。`],
        dinner: [title, `${hi}晚饭吃了吗？${rem >= 0 ? `今天还能吃 ${fmt(rem)} 千卡` : '今天已经吃超了点，晚饭清淡些'}${!simple && rem >= 0 && left >= 20 ? `，蛋白还差 ${left}g，多吃点肉蛋` : ''}。`],
        night: count ? [title, `今天辛苦了。${kcal}${pro}。`] : [title, `${hi}今天还没记呢。吃了啥、练了啥，睡前说一句就行。`]
      },
      sayNext: {
        date: shiftDateString(today, 1),
        weigh: [title, `早${you ? '，' + you : ''}。${w ? `上次 ${round1(w.kg)}kg，` : ''}空腹称一下？点开就能记。`],
        lunch: [title, `${hi}午饭吃了吗？说一句我就记上。`],
        dinner: [title, `${hi}晚饭吃了吗？说一句我就记上。`],
        night: [title, `${hi}今天还没见到你。吃了啥，睡前说一句就行。`]
      },
      away: [title, `${hi}好几天没见了，最近还好吗？不用补，从今天接着来就行。`]
    };
  }
});
