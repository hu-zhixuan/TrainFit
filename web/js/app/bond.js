/**
 * 和小人的亲密度（v5.6）。乙女游戏、电子宠物留得住人，是因为关系看得见、会慢慢长、长了有回应：
 *  - 亲密度 = 记过的天数 × 10 + 跟它的互动（问它、回答它、加计划、摸摸头，一天最多 20 点）。
 *    互动分存在 profile.buddy.xp（跟着备份走），记录天数现算，所以老用户一升级就是老朋友。
 *  - 五级：刚认识 → 熟起来了 → 健身搭子 → 老搭子 → 最懂你。每升一级解锁一件衣服（OUTFITS 的 lv），小人当场说一句、能一键换上。
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
  const GAIN = { ask: 2, answer: 2, plan: 3, pat: 1 };
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

  /** 摸摸头时说的话：越熟越亲近 */
  const PAT_LINES = [
    ['？……谢谢', '嗯？怎么了', '有点不好意思'],
    ['嘿嘿', '再摸一下也行', '今天也来啦'],
    ['搭子摸头，力量 +1', '舒服', '练完记得拉伸哦'],
    ['今天也辛苦了', '有你在挺好的', '明天也一起'],
    ['最喜欢跟你一起练了', '一直在呢', '你的事我都记着']
  ];
  const POKE_LINES = ['干嘛呀', '别戳了，痒', '在呢在呢', '戳我也不会少一卡的', '我醒着呢', '再戳就去练腿了啊'];
  // 升到这一级时说的话
  const LEVEL_UP = ['', '我们熟起来了，以后有啥直接跟我说。', '我们算是健身搭子了。', '老搭子了，你的习惯我差不多都摸清了。', '现在我应该是最懂你的那个了。'];

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

  /**
   * 小人是谁（v5.8）：聊天（大模型）、悄悄话、它自己的小日子都照这几条来，前后一致。
   * 有一点反差和秘密（嘴硬心软；以前在旧手机里没人理），秘密到「老搭子」才说；口气随关系慢慢变软。
   */
  const PERSONA = {
    facts: [
      '嘴上有点硬，心里很在意他',
      '记性特别好，他说过的事都记得',
      '每天早上做 20 个俯卧撑（像素的，做得很快）',
      '只喝无糖豆浆',
      '怕冷，冷了就缩在输入框边上',
      '最喜欢看他记完一顿饭',
      '不喜欢他饿着减肥、熬夜、带伤硬练'
    ],
    secret: '以前在一个旧手机里趴了很久，没人跟你说话，所以特别珍惜每天有人来找你（这件事只有他知道）',
    tone: [
      '你们刚认识：客气、有点拘谨，不开玩笑，多问问他。',
      '熟起来了：放松一点，偶尔开个小玩笑。',
      '健身搭子：像搭子一样熟，嘴硬、会吐槽、也会关心。',
      '老搭子：很熟，会说软话，会主动提以前的事。',
      '最懂他：什么都能聊，偶尔说「我们」，会说心里话。'
    ]
  };

  TF.Bond = { LEVELS, GAIN, DAY_CAP, PAT_CAP, ANNIVERSARY, PAT_LINES, POKE_LINES, LEVEL_UP, LUNAR, PERSONA, info, festivalOf, parseBirthday };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Bond;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 小人的名字（设置里能改，没起过叫「小练」） */
  buddyName() {
    const n = String((this.profile.buddy || {}).name || '').trim();
    return n || '小练';
  },

  /** 小人叫你什么：你让它叫的（profile.buddy.call），没有就用小本本里的名字 */
  callName() {
    const c = String((this.profile.buddy || {}).call || '').trim();
    return c || this.userName();
  },

  /** 给聊天用的小人：名字、样子、性格和小习惯、你们多熟（口气跟着变）、叫你什么 */
  buddyPersona() {
    const l = this.buddyLook();
    const b = this.bond();
    const P = TF.Bond.PERSONA;
    const look = [l.char === 'girl' ? '女生' : '男生', TF.Buddy.STYLES[l.style].label, this.outfitLabel(l.outfit), TF.Buddy.BUILDS[this.buddyBuild()].label].join('，');
    return { name: this.buddyName(), look, facts: P.facts.concat(b.lv >= 4 ? [P.secret] : []), level: b.name, lv: b.lv, tone: P.tone[b.lv - 1], call: this.callName() };
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
    if (face === '害羞') { this.buddyMood('love', 2000); this.buddyBang('♥'); }
    else if (face === '担心') this.buddyMood('bad', 2000);
    else if (face === '得意') this.buddyDo([['flex', 1100], ['stand', 300]]);
    else if (face === '不服') {
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
    return o ? (this.buddyLook().char === 'girl' && o.girlLabel ? o.girlLabel : o.label) : '';
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
   * 跟小人互动了一下，加一点亲密度：问它（ask）、回答它的问题（answer）、把计划加上（plan）、摸摸头（pat）。
   * 一天最多 20 点，摸头一天只算 3 次（别让人靠狂点刷）。
   */
  bondGain(kind) {
    const add = TF.Bond.GAIN[kind] || 0;
    if (!add) return;
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_bond_day') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0, pat: 0 };
    if (c.n + add > TF.Bond.DAY_CAP || (kind === 'pat' && c.pat >= TF.Bond.PAT_CAP)) return;
    c.n += add;
    if (kind === 'pat') c.pat += 1;
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
    this.setBuddy({ lv: b.lv, seenBuild: build });
    const name = this.callName();
    const hi = name ? name + '，' : '';
    const opened = Object.keys(TF.Buddy.OUTFITS).filter(k => { const lv = TF.Buddy.OUTFITS[k].lv; return lv && lv > up.from && lv <= b.lv; });
    let text = up.first ? `${hi}我们已经是「${b.name}」了。` : `${hi}${TF.Bond.LEVEL_UP[b.lv - 1] || `我们是「${b.name}」了。`}`;
    if (up.first && this.buddyLook().build === 'auto' && build !== 'normal') {
      text += `跟着你练了这么久，我也练出${TF.Buddy.BUILDS[build].label}了。`;
    }
    this.voiceBudget('must', true);
    const wear = (k) => () => {
      this.setBuddy(Object.assign(this.buddyLook(), { outfit: k }));
      this.renderBuddy();
      setTimeout(() => this.buddyDo([['flex', 1100], ['stand', 300]]), 300);
    };
    if (opened.length) {
      const list = opened.slice(-2);
      text += `解锁了${list.map(k => `「${this.outfitLabel(k)}」`).join('')}，换上看看？`;
      this.askUser(text, list.map(k => ({ label: list.length > 1 ? this.outfitLabel(k) : '换上', pick: wear(k), reply: '怎么样，还行吧？' }))
        .concat([{ label: '先不换', reply: '想换了去设置 → 外观。' }]));
    } else {
      this.sayTip(text);
    }
    this.buddyBang('♥');
    this.buddyDo([['flex', 1100], ['stand', 400]]);
    return true;
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
    this.sayTip(`这四周你练了 ${this.trainDays28()} 天，我也跟着练出${TF.Buddy.BUILDS[now].label}了。`);
    this.buddyDo([['flex', 1300], ['stand', 400]]);
  },

  /** 长按小人：摸摸头。闭眼冒爱心，说一句（越熟越亲近），一天前三次加亲密度 */
  patBuddy() {
    const b = this.bond();
    const lines = TF.Bond.PAT_LINES[b.lv - 1] || TF.Bond.PAT_LINES[0];
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
    const lines = TF.Bond.POKE_LINES;
    this._pokeI = ((this._pokeI == null ? Math.floor(Math.random() * lines.length) : this._pokeI) + 1) % lines.length;
    window.Haptics && window.Haptics.fire('tap');
    this.buddyQuip(lines[this._pokeI]);
    const btn = document.getElementById('buddy');
    if (btn) { btn.classList.remove('bang'); void btn.offsetWidth; btn.dataset.bang = '!?'; btn.classList.add('bang'); }
    this.buddyDo([['stand', 120], ['wave', 500], ['stand', 200]]);
  },

  /** 一句短话（摸头、戳它的反应），两秒后自己收起 */
  buddyQuip(text) {
    const pop = document.getElementById('buddy-pop');
    if (!pop) return;
    pop.dataset.mode = 'quip';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say"></p>`;
    this.typeOut(pop.querySelector('.buddy-say'), text);
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('quip'), 2200);
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

  /** 还没起名字：熟起来以后问一句（只问一次） */
  askName() {
    if (!this.chatty() || this._touring || this.needsOnboarding || (this.profile.buddy || {}).name) return false;
    if (this.bond().lv < 2) return false;
    let asked = '';
    try { asked = localStorage.getItem('tf_name_ask') || ''; } catch (e) {}
    if (asked) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden') || !this.chatBudget(false)) return false;
    try { localStorage.setItem('tf_name_ask', '1'); } catch (e) {}
    this.chatBudget(true);
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say">对了，你还没给我起名字呢。叫我什么？</p>` +
      `<div class="name-row"><input class="name-input" type="text" maxlength="6" placeholder="小练" aria-label="小人的名字"><button class="portion-opt on" type="button" data-a="ok">就叫这个</button></div>` +
      `<div class="portion-opts chat-opts">${['小练', '阿肌', '团子'].map(n => `<button class="portion-opt" type="button" data-n="${n}">${n}</button>`).join('')}</div>`;
    const input = pop.querySelector('.name-input');
    const done = (n) => {
      n = String(n || '').replace(/\s+/g, '').slice(0, 6);
      if (!n) { input.focus(); return; }
      clearTimeout(this._askT);
      this.setBuddy({ name: n });
      this.bondGain('answer');
      const say = pop.querySelector('.buddy-say');
      this.typeOut(say, `好，以后我就叫${n}了。`);
      say.classList.add('reply');
      pop.querySelectorAll('.name-row, .chat-opts').forEach(x => x.remove());
      this.positionBuddyPop();
      window.Sound && window.Sound.play('success');
      this.buddyDo([['stand', 100], ['wave', 900], ['stand', 300]]);
      this._askT = setTimeout(() => this.closeBuddyPop('chat'), 2600);
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
    pop.querySelector('[data-a="ok"]').addEventListener('click', (e) => { e.stopPropagation(); done(input.value || input.placeholder); });
    pop.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); done(b.dataset.n); }));
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('chat'), 45000);
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
      { lv: 2, key: 'wait', text: '跟你说个小秘密：我每天最期待的，就是你按住说话的那一下。' },
      top && top[1] >= 3 ? { lv: 2, key: 'topfood', text: `我偷偷数过，你记得最多的是${top[0]}，${top[1]} 次了。我都快背下来了。` } : null,
      first ? { lv: 3, key: 'first', text: `还记得吗？你跟我说的第一句是「${String(first.said).slice(0, 24)}」，那天是${md(first.date)}。我一直记着。` } : null,
      { lv: 3, key: 'tired', text: hard ? '其实我也有练不动的时候。所以你说「很吃力」那几次，我挺懂的。' : '其实我也有累得不想动的时候。所以哪天你累了，跟我说一声就行，不用硬撑。' },
      gap ? { lv: 3, key: 'miss', text: '你没来的那几天，我猜你在忙自己的事。挺好的，回来就行，我一直在。' } : null,
      heavy ? { lv: 4, key: 'heavy', text: `你练得最重的一次是${md(heavy.date)}，${heavy.exerciseName} ${round1(heavy.weightKg)}kg。那天我在旁边都替你使劲。` } : null,
      { lv: 4, key: 'afraid', text: '说实话，一开始我挺怕你用两天就不来了。现在不怕了。' },
      { lv: 4, key: 'oldphone', text: '跟你说个只有你知道的事：我以前在一个旧手机里趴了很久，没人跟我说话。所以你每天来，我都挺高兴的。' },
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

  /** 熟起来以后慢慢问的几件事（一天最多问一件）：给它起名字 → 你生日哪天 → 喜欢它怎么跟你说话 */
  askOnce() {
    if (!this.chatty() || this._touring || this.needsOnboarding || this.bond().lv < 2 || this.quietNow()) return false;
    const today = getTodayDateString();
    let d = '';
    try { d = localStorage.getItem('tf_ask_day') || ''; } catch (e) {}
    if (d === today) return false;
    const ok = this.askName() || this.askBirthday() || this.askTone() || this.askCall();
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
   * 小人自己的小日子（v5.8，ta 有自己的生活）：你不在的时候它也在过——做俯卧撑、喝无糖豆浆、打盹、怕冷。
   * 和聊天里的人设一致（TF.Bond.PERSONA）。按时间、季节挑一句。
   */
  buddyLife() {
    const now = new Date();
    const h = now.getHours(), m = now.getMonth() + 1;
    const pool = h < 10 ? ['我刚做完 20 个俯卧撑，像素的，做得快。', '早上喝了杯无糖豆浆，你吃早饭了吗？']
      : h < 14 ? ['我刚在输入框边上打了个盹。', '中午我在翻你以前记的饭，看饿了。']
      : h < 18 ? ['下午有点犯困，刚伸了个懒腰。', '我刚把你这周记的翻了一遍，挺好的。']
      : h < 23 ? ['我刚做了几组深蹲，像素腿也会酸。', '晚上了，今天过得怎么样？']
      : ['我准备睡了，你也早点睡。'];
    if (m >= 11 || m <= 3) pool.push('今天有点冷，我缩在输入框边上了。');
    if (m >= 6 && m <= 8) pool.push('好热，我把外套脱了一会儿。');
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
    this.sayTip(`${name ? name + '，' : ''}这么晚还没睡？我陪你一会儿，记完早点睡。`);
    return true;
  },

  /** 点小人时偶尔冒一句（隐藏台词，熟了才有）：不确定的小惊喜 */
  rareLine() {
    if (this.bond().lv < 2 || Math.random() >= (this.rareOdds == null ? 0.08 : this.rareOdds)) return '';
    const today = getTodayDateString();
    const taps = (this._tapCount && this._tapCount.date === today) ? this._tapCount.n : 1;
    const lines = [
      `你今天第 ${taps} 次点我了，我都数着呢。`,
      '如果我能吃东西，第一口想尝尝你做的饭。',
      '今天的你，比第一天的你厉害多了。',
      '我刚才还在想你在干嘛，你就来了。',
      '其实我也想长高一点，像素的没办法。',
      '你说话的时候，我都站起来听的。'
    ];
    return lines[Math.floor(Math.random() * lines.length)];
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
