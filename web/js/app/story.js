/**
 * 小剧情（v6.3，用户：「引入轻度的剧情和 galgame；用这个软件要像玩游戏、有情感连接，而不是打卡上班」）。
 * 跟着你的真实日子走：记了火锅、奶茶会触发，周末、深夜、下雨天会触发，熟到一定程度会触发。每段几句话 + 三个选项，
 * 你选的它会记住（profile.buddy.story），以后聊天时大模型也知道（「他答应过下次带你吃火锅」）。台词在 cast.js 的 events。
 * 一天最多一段（tf_story），每段只出一次；算在每天主动说话的次数里，「安静」档不出。
 *
 * 关系（用户定的：默认暧昧，用户自己选进不进恋爱线）：到「老搭子」（Lv4）以后晚上会有一段「那句话」——
 *  我也是 → 恋人线（story.romance = true：聊天更亲密、摸头的话不一样、周末晚上有「算约会吗」）；
 *  你是我最好的搭子 → 还是搭子（romance = false）；让我想想 → 七天后再问。设置「回忆」下面能看到、能改回搭子。
 * 恋人线也守同样的底线：可以说喜欢、想你，但不黏人、不吃醋、不管你和谁玩，鼓励你好好生活。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};

  // 什么时候出：lv 几级起；when(c) 看今天的情况。按顺序挑第一个能出的（记了东西触发的排前面）
  const EVENTS = [
    // v6.4 跟着记录来的（react.js 发现大的反应时问一下）：第一次破纪录、第一次吃得很撑、一周练满五天、比刚开始轻了一公斤
    { id: 'firstpr', lv: 1, when: (c) => c.trigger === 'record' && c.moment === 'pr' },
    { id: 'stuffed', lv: 1, when: (c) => c.trigger === 'record' && c.moment === 'over' && c.over >= 300 },
    { id: 'trainweek', lv: 1, when: (c) => c.trigger === 'record' && c.moment === 'week' && c.week >= 5 },
    { id: 'lighter', lv: 1, when: (c) => c.trigger === 'record' && c.moment === 'lighter' && c.drop >= 1 },
    { id: 'hotpot', lv: 1, when: (c) => c.trigger === 'record' && /火锅|烧烤|串串|麻辣烫|冒菜|香锅/.test(c.food) },
    { id: 'sweet', lv: 2, when: (c) => c.trigger === 'record' && /奶茶|蛋糕|甜品|冰淇淋|冰激凌|巧克力|甜点|雪糕|蛋挞|布丁/.test(c.food) },
    { id: 'night', lv: 3, when: (c) => c.trigger === 'night' && (c.hour >= 23 || c.hour < 2) },
    { id: 'firstweek', lv: 1, when: (c) => c.trigger === 'open' && c.days >= 7 },
    // v7.1：第一次表白在主线第四章最后一段（cast_main.js）；这里只管「让我想想」七天后、或者设置里「让 TA 再问一次」之后再问
    { id: 'confess', lv: 4, when: (c) => c.trigger === 'open' && c.hour >= 18 && c.hour < 23 && c.romance == null && !!c.confessAfter && c.confessAfter <= c.today },
    { id: 'date', lv: 4, when: (c) => c.trigger === 'open' && c.romance === true && c.weekend && c.hour >= 16 && c.hour < 22 },
    { id: 'weekend', lv: 2, when: (c) => c.trigger === 'open' && c.weekend && c.hour >= 9 && c.hour < 15 },
    { id: 'secret', lv: 3, when: (c) => c.trigger === 'open' && c.hour >= 6 && c.hour < 22 && c.lvDays >= 2 },
    { id: 'rain', lv: 2, when: (c) => c.trigger === 'open' && c.hour >= 7 && c.hour < 21 && c.roll < 0.3 }
  ];

  /**
   * 现在能出哪一段：c = { trigger: 'open' | 'record' | 'night', lv, hour, weekend, days（记了几天）, lvDays（到这一级几天了）,
   *   food（刚记的吃的）, roll（0～1 的骰子）, today, seen: [id], romance, confessAfter,
   *   moment / over / week / drop（记录的大反应：pr 破纪录 / over 吃超了多少 / week 这周第几练 / lighter 比刚开始轻了多少，v6.4） }
   */
  function pick(c) {
    const seen = new Set(c.seen || []);
    return EVENTS.find(e => c.lv >= e.lv && (!seen.has(e.id) || (e.id === 'confess' && c.romance == null)) && e.when(c)) || null;
  }

  // 还没看过的那段怎么解锁（设置「剧情」里写着，像游戏的任务提示；都是你本来就在做的事）
  const HINTS = {
    firstweek: '记满 7 天', hotpot: '记一顿火锅、烧烤', firstpr: '破一次自己的纪录', stuffed: '有一天吃撑了', trainweek: '一周练满 5 天', lighter: '比刚开始轻 1 公斤',
    sweet: '记一杯奶茶或甜点', weekend: '周末上午来看看', rain: '某个下雨天', night: '深夜还没睡的时候', secret: '到这一章过两天',
    confess: '这一章的某个晚上', date: '在一起以后的周末'
  };

  TF.Story = { EVENTS, HINTS, pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Story;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  storyData() {
    const s = (this.profile.buddy || {}).story;
    return s && typeof s === 'object' ? s : { seen: [], picks: {} };
  },

  /** 到这一级几天了（升级那天记在 profile.buddy.lvAt；老用户没记的按 3 天算） */
  storyLvDays() {
    const at = (this.profile.buddy || {}).lvAt;
    if (!at) return 3;
    return Math.round((new Date(getTodayDateString() + 'T00:00:00') - new Date(at + 'T00:00:00')) / 86400000);
  },

  /**
   * 能不能出一段剧情、出哪段（trigger：open 打开 / night 深夜打开 / record 刚记了东西）。
   * info：{ food }（记了火锅奶茶）或者 { moment, over, week, drop, must: true }（记录的大反应，安静档也演，不占每天说话的次数）
   */
  storyEvent(trigger, info) {
    info = info || {};
    if (!(info.must ? this.buddyLook().show : this.chatty()) || this._touring || this.needsOnboarding || !this.cast().events) return false;
    if (trigger !== 'record' && (!this.canChat() || Date.now() - (this._popAt || 0) < 60000)) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_story') || ''; } catch (e) {}
    const level = info.must ? 'must' : 'guide';
    if (last === today || !this.voiceBudget(level, false)) return false;
    const st = this.storyData();
    const now = new Date();
    const ev = TF.Story.pick({ trigger, lv: this.bond().lv, hour: now.getHours(), weekend: [0, 6].includes(now.getDay()),
      days: new Set(this.recordDates()).size, lvDays: this.storyLvDays(), food: info.food || '', roll: Math.random(), today,
      seen: st.seen || [], romance: st.romance, confessAfter: st.confessAfter,
      moment: info.moment || '', over: info.over || 0, week: info.week || 0, drop: info.drop || 0 });
    if (!ev || !this.cast().events[ev.id]) return false;
    if (info.moment && !ev.id.match(/^(firstpr|stuffed|trainweek|lighter)$/)) return false; // 大反应只演跟它有关的那段，别的照旧出卡片
    try { localStorage.setItem('tf_story', today); } catch (e) {}
    this.voiceBudget(level, true);
    if (trigger === 'record') setTimeout(() => this.showStoryEvent(ev.id), 900);
    else this.showStoryEvent(ev.id);
    return true;
  },

  /** 记完一顿（reactRecord 里）：火锅、奶茶这类会触发一段 */
  storyAfterRecord(batch) {
    const meals = ((batch && batch.dietIds) || []).map(id => this.diet.find(d => d.id === id)).filter(Boolean);
    if (!meals.length) return false;
    const food = meals.map(m => m.foodSummary || '').join('、');
    return this.storyEvent('record', { food });
  },

  /**
   * 演一段（v7.0 起在整屏的剧场里，theater.js）：背景、大大的 TA、一句一句打出来，最后三个选项；选了它回一句，记下来。
   * 「让我看看」（flex）：TA 秀一下跟着你练出来的样子；「陪你聊会儿」（talk）：演完把输入框亮一下，接着跟大模型聊。
   */
  showStoryEvent(id, replay) {
    const E = this.cast().events[id];
    if (!E || this._touring) return false;
    const ev = TF.Story.EVENTS.find(e => e.id === id);
    const c = this.cast();
    const bg = id === 'secret' ? (c.chapterBg || [])[1] || 'pool' : TF.Theater.SCENE_BG[id] || 'room';
    let talk = null;
    // 重看：最后接上你当时选的（旁白「你说：…」+ TA 回的），不再让你选
    const k = (this.storyData().picks || {})[id];
    const was = replay && k != null && E.choices[k];
    const lines = was ? E.lines.concat([[null, `你说：「${was[0]}」`], [was[2], was[1], was[4] === 'flex' ? 'flex' : undefined]]) : E.lines;
    // 左上角写第几章：正在发生的写你现在在第几章；设置里重看的写它属于哪一章
    return this.playScene({
      label: this.chapterLabel(replay && ev ? ev.lv : this.bond().lv), title: E.title, bg, lines, choices: replay ? null : E.choices,
      onChoose: (k, opt) => {
        const ch = opt.raw || E.choices[k];
        this.storyChoose(id, k);
        if (ch[4] === 'talk') talk = ch;
        if (/害羞|心动/.test(ch[2])) this.buddyMood('love', 2400);
        if (ch[4] === 'flex') return { pose: 'flex', outfit: this.showOffOutfit ? this.showOffOutfit() : 'tank' };
        return null;
      },
      onEnd: () => {
        if (talk) { this.pushTalk && this.pushTalk(talk[0], talk[1]); setTimeout(() => this.glowTalk && this.glowTalk(), 400); }
        if (!this._touring) this.buddyDo([['stand', 120], ['wave', 900], ['stand', 300]]);
      }
    });
  },

  // ---------------- 主线（v7.1，cast_main.js） ----------------

  /** 主线一段一段排好：[{ sc, ch（第几章）, k（这章第几段） }] */
  mainList() {
    const out = [];
    (this.cast().main || []).forEach((list, i) => list.forEach((sc, k) => out.push({ sc, ch: i + 1, k })));
    return out;
  },

  mainFind(id) { return this.mainList().find(x => x.sc.id === id) || null; },

  /** 这一段亲密度到多少解锁：章开头、走到三分之一、三分之二（第五章按 300 点算，一天记录 10 点） */
  mainXp(ch, k) {
    const L = TF.Bond.LEVELS.map(x => x.xp);
    const from = L[ch - 1] || 0;
    const span = ch < L.length ? L[ch] - from : 300;
    return from + Math.round(span * [0, 0.35, 0.7][k]);
  },

  /** seen 看过了 / ready 解锁了还没看 / locked 还没到 */
  mainStatus(item) {
    if ((this.storyData().seen || []).includes(item.sc.id)) return 'seen';
    return this.bond().xp >= this.mainXp(item.ch, item.k) ? 'ready' : 'locked';
  },

  /** 下一段该看的（解锁了还没看的里面最早那段） */
  mainNext() {
    return this.mainList().find(x => this.mainStatus(x) === 'ready') || null;
  },

  /**
   * 演一段主线：左上角写第几章，开场大字是这段的名字；你选的记进 story.picks，表白改关系；看完记进 seen（跳过也算）。
   * opts：{ lead（升级时先说的那句，加在最前面）, outfits（新解锁的衣服，最后问换不换）, replay（设置里重看）, after }
   */
  playMain(id, opts) {
    opts = opts || {};
    const item = this.mainFind(id);
    if (!item || this._touring) return false;
    const sc = item.sc;
    const script = sc.script.slice();
    if (opts.lead) script.unshift(['开心', opts.lead, 'wave']);
    const outfits = (opts.outfits || []).slice(-2);
    if (outfits.length) script.push({ ask: '_wear', opts: this.wearChoices(outfits).map(c => ({ t: c[0], r: c[1] ? [[c[2], c[1]]] : [], sp: c[4] })) });
    let talk = null;
    return this.playScene({
      label: this.chapterLabel(item.ch), title: `「${sc.title}」`, bg: sc.bg || (this.cast().chapterBg || [])[item.ch - 1] || 'room', script,
      onChoose: (k, opt, askId) => {
        if (askId === '_wear') return this.wearChosen(opt);
        if (!opts.replay || askId === 'confess') this.mainChoose(askId, k, opt); // 重看时换个选项玩玩，不改当时选的（表白除外，那是你的回答）
        if (opt.sp === 'talk') talk = opt;
        if (opt.r && opt.r[0] && /害羞|心动/.test(opt.r[0][0])) this.buddyMood('love', 2400);
        return null;
      },
      onEnd: () => {
        this.mainSeen(id);
        if (talk && this.pushTalk) { this.pushTalk(talk.t, (talk.r[0] || [])[1] || ''); setTimeout(() => this.glowTalk && this.glowTalk(), 400); }
        if (!opts.replay && !this._touring && this.buddyDo) setTimeout(() => this.buddyDo([['stand', 120], ['wave', 900], ['stand', 300]]), 350);
      },
      after: () => { this.renderBuddy(); if (opts.after) opts.after(); }
    });
  },

  mainSeen(id) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    if ((st.seen || []).includes(id)) return;
    st.seen = [...new Set((st.seen || []).concat(id))];
    this.setBuddy({ story: st });
    if (this.bondGain) this.bondGain('answer');
  },

  /** 主线里选了：记下来；表白那一问和小剧情「那句话」是一回事（ask 都叫 confess），改关系 */
  mainChoose(askId, k, opt) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    st.picks = Object.assign({}, st.picks, { [askId]: k });
    if (askId === 'confess') {
      st.seen = [...new Set((st.seen || []).concat('confess'))];
      if (opt.sp === 'romance') { st.romance = true; delete st.confessAfter; }
      else if (opt.sp === 'friend') { st.romance = false; delete st.confessAfter; }
      else st.confessAfter = shiftDateString(getTodayDateString(), 7);
    }
    this.setBuddy({ story: st });
    if (opt.sp && typeof opt.sp === 'object' && this.addLife) this.addLife([opt.sp]);
  },

  /** 剧本里 {name} 这些：你叫什么、认识几天、记了几顿、练了几天、最常吃的、最重的一次、体重变化 */
  storyVars() {
    const today = getTodayDateString();
    const dates = this.recordDates().filter(Boolean).sort();
    const first = dates[0] || today;
    const days = Math.max(1, Math.round((new Date(today + 'T00:00:00') - new Date(first + 'T00:00:00')) / 86400000) + 1);
    const from = shiftDateString(today, -60);
    const count = {};
    this.diet.filter(d => d.date >= from && !isSuppOnly(d)).forEach(d => (d.items || []).forEach(i => {
      const n = String(i.name || '').replace(/[（(].*$/, '').trim();
      if (n && n.length <= 8) count[n] = (count[n] || 0) + 1;
    }));
    const favs = Object.entries(count).filter(x => x[1] >= 2).sort((a, b) => b[1] - a[1]);
    const best = this.workouts.filter(w => w.weightKg > 0 && !w.durationMin).sort((a, b) => b.weightKg - a.weightKg)[0];
    const ws = (this.weights || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const drop = ws.length >= 2 ? Math.round((ws[0].kg - ws[ws.length - 1].kg) * 10) / 10 : 0;
    const name = this.callName ? this.callName() : '';
    return {
      you: name || '你', name, days, meals: this.diet.length, trains: new Set(this.workouts.map(w => w.date)).size,
      fav: favs.length ? favs[0][0] : '', lift: best ? `${best.exerciseName} ${round1(best.weightKg)} 公斤` : '',
      kg: drop >= 0.5 ? `轻了 ${drop} 公斤` : ''
    };
  },

  /** 结局那一屏：END · 恋人「以后的每个六点」，下面一行行浮上来你们一起走过的数字，最后 TA 说一句 */
  creditsHtml(ending) {
    const c = this.cast();
    const e = (c.endings || {})[ending] || { tag: '', title: '', last: '' };
    const v = this.storyVars();
    const st = this.storyData();
    const mainSeen = this.mainList().filter(x => (st.seen || []).includes(x.sc.id)).length;
    const cgs = this.cgList().filter(x => x.open).length;
    const rows = [
      ['认识', `${v.days} 天`], ['一起记了', `${v.meals} 顿饭`], ['练了', `${v.trains} 天`],
      v.lift ? ['最重的一次', v.lift] : null, v.kg ? ['体重', v.kg] : null,
      ['看过的剧情', `${mainSeen} 段主线 · ${(st.seen || []).filter(id => (c.events || {})[id]).length} 段小剧情`], ['收集的 CG', `${cgs} 张`]
    ].filter(Boolean);
    return `<div class="cr-inner"><small class="cr-tag">END · ${esc(e.tag)}</small><h2 class="cr-title">「${esc(e.title)}」</h2>` +
      `<div class="cr-rows">${rows.map((r, i) => `<p style="--i:${i}"><span>${esc(r[0])}</span><b>${esc(r[1])}</b></p>`).join('')}</div>` +
      `<p class="cr-last" style="--i:${rows.length}"><b>${esc(c.name)}</b>${esc(e.last)}</p>` +
      `<p class="cr-foot" style="--i:${rows.length + 1}">故事还在继续——明天也见</p>` +
      `<button class="th-done" type="button" style="--i:${rows.length + 2}">回到今天</button>` +
      (this.artCredit() ? `<p class="cr-art" style="--i:${rows.length + 2}">${esc(this.artCredit())}</p>` : '') + '</div>';
  },

  /** 署名（v7.2）：立绘是谁画的（わたおきば 的免费素材，条款不强制署名，但该写上）。没有立绘时是 '' */
  artCredit() {
    const list = TF.Art ? TF.Art.credits(this.castKey()) : [];
    return list.map(c => `${c.what} · ${c.credit}`).join('　');
  },

  /** 相册：主线里出现过的 CG（看过那段就点亮），按顺序 */
  cgList() {
    const c = this.cast();
    const seen = new Set(this.storyData().seen || []);
    const out = [];
    this.mainList().forEach(x => TF.Theater.scriptInfo(x.sc.script).cgs.forEach(id => {
      if ((c.cgs || {})[id] && !out.some(o => o.id === id)) out.push({ id, cg: c.cgs[id], open: seen.has(x.sc.id) && this.cgReached(x.sc, id) });
    }));
    return out;
  },

  /** 结局的 CG 只有走到那条线才算拿到（恋人线的拿不到搭子线那张） */
  cgReached(sc, id) {
    const step = sc.script.find(s => !Array.isArray(s) && s.cg === id);
    if (!step || !step.cond) return true;
    return TF.Theater.evalCond(step.cond, { romance: this.storyData().romance, picks: this.storyData().picks, seen: this.storyData().seen });
  },

  /** 小人头上挂本小书：有解锁了还没看的主线 */
  mainReady() {
    return !!(this.buddyLook().show && !this.needsOnboarding && this.cast().main && this.mainNext());
  },

  /** 打开 App 时，有新的主线就问一句「有件事想跟你说」——你点了才演，不打断你记东西；一天问一次 */
  mainNudge() {
    const next = this.mainNext();
    if (!next || !this.buddyLook().show || this._touring) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_main_nudge') || ''; } catch (e) {}
    if (last === today || !this.voiceBudget('guide', false)) return false;
    try { localStorage.setItem('tf_main_nudge', today); } catch (e) {}
    this.voiceBudget('guide', true);
    const f = this.cast().sex === 'f';
    const say = next.k === 0 ? (f ? `新的一章开始啦——${this.chapterLabel(next.ch)}。现在有空吗？` : `新的一章。${this.chapterLabel(next.ch)}。……现在有空吗。`)
      : (f ? '有件事想跟你说……现在有空听吗？' : '……有件事想跟你说。现在有空吗。');
    return this.askUser(say, [
      { label: `听你说 ·「${next.sc.title}」`, pick: () => setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); this.playMain(next.sc.id); }, 250) },
      { label: '等会儿', reply: f ? '好～你忙完了点我，我等你！' : '嗯。忙完了点我。' }
    ]);
  },

  /** 记下选了什么：看过、选的第几个；「那句话」的三个选项改关系；周末出去玩这类记成近况，过一天问问 */
  storyChoose(id, k) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    const c = this.cast().events[id].choices[k];
    st.seen = [...new Set((st.seen || []).concat(id))];
    st.picks = Object.assign({}, st.picks, { [id]: k });
    if (id === 'confess') {
      if (c[4] === 'romance') { st.romance = true; delete st.confessAfter; }
      else if (c[4] === 'friend') { st.romance = false; delete st.confessAfter; }
      else st.confessAfter = shiftDateString(getTodayDateString(), 7);
    }
    this.setBuddy({ story: st });
    if (c[4] && typeof c[4] === 'object' && this.addLife) this.addLife([c[4]]);
    if (this.bondGain) this.bondGain('answer');
  },

  /**
   * 设置里的「剧情」（v7.1）：五章，每章——主线三段（看过的点了重看，解锁了的写「新 · 点开看」，没到的写再记几天）
   * + 这章的小剧情（看过的重看，没看过的写怎么解锁）；最下面是相册（主线里的 CG，点开看大图）。
   */
  renderStoryBook() {
    const el = document.getElementById('buddy-story');
    if (!el) return;
    const c = this.cast(), b = this.bond(), st = this.storyData();
    const seen = new Set(st.seen || []);
    const days = (xp) => Math.max(1, Math.ceil((xp - b.xp) / 10)); // 一天记录 10 点亲密度
    const mains = this.mainList();
    const next = this.mainNext();
    el.innerHTML = c.story.map((x, i) => {
      const lv = i + 1, open = b.lv >= lv;
      const evs = TF.Story.EVENTS.filter(e => e.lv === lv && c.events[e.id] && (e.id !== 'date' || st.romance === true) && e.id !== 'confess');
      const mine = mains.filter(m => m.ch === lv);
      const got = mine.filter(m => seen.has(m.sc.id)).length;
      const rows = mine.map(m => {
        const stt = this.mainStatus(m);
        if (stt === 'locked') return `<span class="sb-main locked"><i>${m.k + 1}</i><b>？？？</b><small>再记 ${days(this.mainXp(m.ch, m.k))} 天左右</small></span>`;
        return `<button type="button" class="sb-main ${stt}" data-main="${m.sc.id}"><i>${m.k + 1}</i><b>${esc(m.sc.title)}</b><small>${stt === 'seen' ? '重看' : next && next.sc.id === m.sc.id ? '新 · 点开看' : '新'}</small></button>`;
      }).join('');
      const scenes = evs.map(e => seen.has(e.id)
        ? `<button type="button" class="sb-scene seen" data-scene="${e.id}">${esc(c.events[e.id].title)}</button>`
        : `<span class="sb-scene${open ? '' : ' far'}" title="${esc(TF.Story.HINTS[e.id] || '')}"><b>？？？</b>${open ? esc(TF.Story.HINTS[e.id] || '') : ''}</span>`).join('');
      const evGot = evs.filter(e => seen.has(e.id)).length;
      return `<div class="sb-ch${open ? '' : ' locked'}${b.lv === lv ? ' now' : ''}">` +
        `<div class="sb-head"><span class="sb-open"><b>${esc(this.chapterLabel(lv))}</b><small>${open ? (b.lv === lv ? '正在这一章' : `主线 ${got}/${mine.length}`) : `再记 ${days((TF.Bond.LEVELS[lv - 1] || {}).xp || 0)} 天左右`}</small></span>` +
        `<span class="sb-count">${got + evGot}/${mine.length + evs.length}</span></div>` +
        (open || lv === b.lv + 1 ? `<div class="sb-mains">${rows}</div>` + (evs.length ? `<p class="sb-sub">小剧情</p><div class="sb-scenes">${scenes}</div>` : '') : '') + '</div>';
    }).join('') + this.albumHtml() + (this.artCredit() ? `<p class="sb-credit">${esc(this.artCredit())} · wataokiba.net</p>` : '');
  },

  /** 相册：主线里的 CG，看过那段才点亮（结局的那张要走到那条线） */
  albumHtml() {
    const list = this.cgList();
    if (!list.length) return '';
    const got = list.filter(x => x.open).length;
    return `<div class="cg-album"><div class="cg-album-head">相册<small>${got}/${list.length}</small></div><div class="cg-grid">` +
      list.map(({ id, cg, open }) => {
        const img = open && TF.Art ? TF.Art.cg(this.castKey(), id) : ''; // 有画好的 CG 用图，没有就像素小人 + 背景
        return !open ? `<span class="cg-thumb locked"><b>？</b><span>还没解锁</span></span>`
          : img ? `<button type="button" class="cg-thumb art" data-cg="${esc(id)}" style="background-image:url('${esc(img)}')"><span>${esc(cg.title)}</span></button>`
          : `<button type="button" class="cg-thumb" data-cg="${esc(id)}" data-bg="${esc(cg.bg || 'room')}">${TF.Buddy.svg(this.buddyArt({ pose: cg.pose || 'stand', face: cg.face || '平静', gear: [], scale: 2, outfit: cg.outfit || this.buddyLook().outfit }))}<span>${esc(cg.title)}</span></button>`;
      }).join('') + '</div></div>';
  },

  /** 你们之间发生过的事（给聊天的大模型，最多 5 件，新的在后） */
  storyFacts() {
    const st = this.storyData();
    const E = this.cast().events || {};
    const picks = st.picks || {};
    const fact = (id) => {
      if (E[id]) { const c = E[id].choices[picks[id]]; return c ? [c[3]] : []; }
      const m = this.mainFind(id); // 主线一段里可能有几问，按出场顺序
      if (!m) return [];
      const out = [];
      const walk = (steps) => (steps || []).forEach(s => {
        if (!s || Array.isArray(s) || !s.ask || picks[s.ask] == null) return;
        const o = s.opts[picks[s.ask]];
        if (o) { const n = TF.Theater.normOpt(o); if (n.fact) out.push(n.fact); walk(n.r); }
      });
      walk(m.sc.script);
      return out;
    };
    return [...new Set((st.seen || []).flatMap(fact).filter(Boolean))].slice(-5);
  },

  /** 你们现在的关系（给聊天的大模型）：恋人 / 好搭子 / 有点暧昧 */
  relationPrompt() {
    const st = this.storyData();
    if (st.romance === true) return '你们在一起了（他在剧情里说也喜欢你）：可以更亲密，说喜欢他、想他；但不黏人、不吃醋、不管他和谁玩，鼓励他有自己的朋友和生活。';
    if (st.romance === false) return '他说你是他最好的搭子：很亲近、很在乎，但不往恋爱走，不说暧昧的话。';
    return this.bond().lv >= 3 ? '你们之间有点暧昧：你在乎他，偶尔流露一点心动，但不挑明、不表白。' : '';
  },

  /** 设置「回忆」下面：你们的关系 + 看过几段剧情；恋人可以改回搭子，选过搭子的可以让它再问一次 */
  relationNote() {
    const st = this.storyData();
    const n = (st.seen || []).length;
    const rel = st.romance === true ? '恋人' : st.romance === false ? '最好的搭子' : this.bond().lv >= 3 ? '有点暧昧' : this.bond().name;
    return `你们现在：${rel} · 看过 ${n}/${Object.keys(this.cast().events || {}).length} 段小剧情`;
  },

  resetRelation() {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    delete st.romance;
    st.confessAfter = getTodayDateString();
    st.seen = (st.seen || []).filter(x => x !== 'confess' && x !== 'date');
    this.setBuddy({ story: st });
  }
});
