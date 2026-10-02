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

  TF.Bond = { LEVELS, GAIN, DAY_CAP, PAT_CAP, ANNIVERSARY, PAT_LINES, POKE_LINES, LEVEL_UP, info };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Bond;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 小人的名字（设置里能改，没起过叫「小练」） */
  buddyName() {
    const n = String((this.profile.buddy || {}).name || '').trim();
    return n || '小练';
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
    const name = this.userName();
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
    const name = this.userName();
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
    pop.innerHTML = `<p class="buddy-say">${esc(text)}</p>`;
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
    const name = this.userName();
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
      say.textContent = `好，以后我就叫${n}了。`;
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

  /**
   * 通知用小人的口吻（交给安卓，闹钟响时挑一句）：
   *  say —— 今天打开过 App 时用；sayNext —— 明天一次都没打开时用；away —— 好几天没打开时的晚间那条。
   * 标题是小人的名字，像它给你发的消息。
   */
  buddyPushLines() {
    const look = this.buddyLook();
    if (!look.show) return null;
    const title = this.buddyName();
    const you = this.userName();
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
      away: [title, `${hi}好几天没见了，有点想你。不用补，从今天接着来就行。`]
    };
  }
});
