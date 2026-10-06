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
    // v7.1：第一次表白在主线第四章最后一段（script_jx.js / script_xy.js）；这里只管「让我想想」七天后、或者设置里「让 TA 再问一次」之后再问
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

  // 小剧情来找你时的那句（v8.0）：[江叙, 夏柚]
  const EVENT_INVITE = {
    firstweek: ['……认识一周了。有句话，想当面说。', '我们认识一周啦！我有话想说～'],
    weekend: ['……周末。你有空吗。', '周末诶！你今天有空吗？'],
    hotpot: ['……火锅啊。我想起一件事。', '火锅！！我也想吃……啊不是，我有话要说！'],
    sweet: ['……甜的。我想起一件事。', '你吃甜的啦？我有个秘密要说～'],
    rain: ['……外面下雨了。你那边呢。', '下雨了诶……你那边呢？'],
    night: ['……还没睡。', '这么晚还没睡呀……陪我说两句？'],
    secret: ['……想带你去个地方。', '想带你去一个秘密的地方！'],
    confess: ['……今晚有空吗。那句话，我想再问一次。', '今晚……那句话，我想再问一次。'],
    date: ['……周末。出去走走吗。', '周末！要不要出去走走？'],
    firstpr: ['……破纪录了。我看见了。', '破纪录了！！我有话要说！'],
    stuffed: ['……今天吃撑了吧。没事。来，说两句。', '吃撑啦？没关系！来，陪我说两句～'],
    trainweek: ['……这周第五练了。', '这周第五练了！你看看我！'],
    lighter: ['……轻了。我有话想说。', '你轻了诶！我有话想说～']
  };

  // 还没看过的那段怎么解锁（设置「剧情」里写着，像游戏的任务提示；都是你本来就在做的事）
  const HINTS = {
    firstweek: '记满 7 天', hotpot: '记一顿火锅、烧烤', firstpr: '破一次自己的纪录', stuffed: '有一天吃撑了', trainweek: '一周练满 5 天', lighter: '比刚开始轻 1 公斤',
    sweet: '记一杯奶茶或甜点', weekend: '周末上午来看看', rain: '某个下雨天', night: '深夜还没睡的时候', secret: '到这一章过两天',
    confess: '这一章的某个晚上', date: '在一起以后的周末'
  };

  TF.Story = { EVENTS, HINTS, pick, EVENT_INVITE };
  if (typeof module !== 'undefined' && module.exports) module.exports = TF.Story;
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  storyData() {
    const s = (this.profile.buddy || {}).story;
    return s && typeof s === 'object' ? s : { seen: [], picks: {} };
  },

  /**
   * 剧情存档升级（只做一次）：
   *  v9.0（story.ver = 2，用户：「没有从头到尾一个完整的故事体验」）：以前看过的主线、选项、路线、加篇都清掉，从第一章重新开始；
   *   小剧情（cast.events）看过的、关系（恋人 / 搭子）留着。
   *  v10.0（ver = 3，用户：「剧情模式的老用户全部抹掉，重新开始」）：江叙的故事整个换了——剧情模式下的江叙，剧情、手机、关系（亲密度从头算）、
   *   剧情给的衣服、小纸条、小别扭都清掉（storyReset）。极简模式的先不动，切到剧情模式那一刻再清（storyKickoff）。夏柚 v10.1 换故事时再清。
   */
  storyMigrate() {
    const b = this.profile.buddy || {};
    const st = b.story;
    // v10.0 只认一次（profile.buddy.v10）：有旧进度（看过剧情、记过东西）的清掉；什么都没有的（新用户）记一下就行
    if (this.castKey() === 'jx' && this.storyOn() && !b.v10) {
      if ((st && (st.seen || []).length) || b.phone || (this.bondXpRaw && this.bondXpRaw() > 0)) this.storyReset();
      else this.setBuddy({ v10: true });
      return;
    }
    if (!st || typeof st !== 'object' || st.ver >= 2) return;
    const E = this.cast().events || {};
    const keepSeen = (st.seen || []).filter(id => E[id] || id === 'confess');
    const keepPicks = {};
    Object.keys(st.picks || {}).forEach(k => { if (E[k] || k === 'confess') keepPicks[k] = st.picks[k]; });
    const next = { ver: 2, seen: keepSeen, picks: keepPicks, seenOn: {} };
    ['romance', 'confessAfter', 'names'].forEach(k => { if (st[k] != null) next[k] = st[k]; });
    this.setBuddy({ story: next });
  },

  /** 剧情模式从头开始（v10.0）：故事、手机、关系、剧情给的样子都回到第一天；记录、小本本、近况、图鉴不动 */
  storyReset() {
    const raw = this.bondXpRaw ? this.bondXpRaw() : 0;
    const base = this.buddyBase ? this.buddyBase().outfit : '';
    this.setBuddy(Object.assign({ v10: true, story: { ver: 3, seen: [], picks: {}, seenOn: {} }, phone: {}, bondBase: raw || 0, lv: 1, lvAt: getTodayDateString(), note: null, sulk: null, sulkLast: '', comfort: 0 },
      base ? { outfit: base } : {}));
    try { ['tf_story', 'tf_story_left', 'tf_main_nudge', 'tf_bonus_nudge'].forEach(k => localStorage.removeItem(k)); } catch (e) {}
    if (typeof window !== 'undefined' && window.TrainFitNative && window.TrainFitNative.storyPush) { try { window.TrainFitNative.storyPush('{}'); } catch (e) {} }
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
    if (this.cast().main && !this.mainDone()) return false; // v9.0：主线没看完，零碎的小剧情先让路（别把故事打碎）
    if (!this.storyOn() || !(info.must || this.chatty()) || this._touring || this.needsOnboarding || !this.cast().events) return false; // 极简模式没有剧情（v9.1）
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
    // v8.0：不再一打开就直接演——TA 先来问一句（记了东西触发的，先对那条有反应），你点了才演
    setTimeout(() => this.storyInvite(ev.id, info), trigger === 'record' ? 600 : 0);
    return true;
  },

  /**
   * 小剧情的邀请（v8.0，用户：「进入 galgame 的方式有点机械」）：TA 用自己的话来找你（「……火锅啊。我想起一件事。」），
   * 「好」——记了东西触发的，刚记的那条飞向小人再进剧场；「等会儿」——这段以后还会来（没看就不算看过）。
   */
  storyInvite(id, info) {
    info = info || {};
    const E = this.cast().events[id];
    if (!E || this._scene) return false;
    const f = this.cast().sex === 'f';
    const L = EVENT_INVITE[id];
    const line = (L && L[f ? 1 : 0]) || (f ? `有件事想跟你说……「${E.title}」，现在有空吗？` : `……有件事。「${E.title}」。现在有空吗。`);
    const go = () => this.showStoryEvent(id);
    return this.askUser(line, [
      { label: f ? '好呀' : '好', pick: () => (info.recId ? this.carryIntoStory(info.recId, info.rec || '', go) : setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); go(); }, 200)) },
      { label: '等会儿', reply: f ? '好～下次再说！' : '嗯。下次说。' }
    ]);
  },

  /** 记完一顿（reactRecord 里）：火锅、奶茶这类会触发一段 */
  storyAfterRecord(batch) {
    const meals = ((batch && batch.dietIds) || []).map(id => this.diet.find(d => d.id === id)).filter(Boolean);
    if (!meals.length) return false;
    const food = meals.map(m => m.foodSummary || '').join('、');
    return this.storyEvent('record', { food, recId: meals[0].id, rec: String(meals[0].foodSummary || '').slice(0, 16) });
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

  // ---------------- 主线（v7.1，v8.0 剧本在 script_jx.js / script_xy.js） ----------------

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

  /**
   * seen 看过了 / ready 能看了 / locked 还没到。v9.0（用户：「第一天看完一章，之后每天一段」）：按顺序一段一段来，
   * 第一章三段第一天连着看；之后上一段是今天看的，下一段明天才来（跟亲密度、记了几天都没关系了）。
   */
  mainStatus(item) {
    const st = this.storyData();
    const seen = new Set(st.seen || []);
    if (seen.has(item.sc.id)) return 'seen';
    const list = this.mainList();
    const i = list.findIndex(x => x.sc.id === item.sc.id);
    if (i < 0 || list.slice(0, i).some(x => !seen.has(x.sc.id))) return 'locked';
    if (item.ch === 1) return 'ready';
    const on = (st.seenOn || {})[list[i - 1].sc.id];
    return on && on >= getTodayDateString() ? 'locked' : 'ready';
  },

  /** 还没到的这一段什么时候来：上一段今天刚看完 → 明天；前面还有没看的 → 接着看下去 */
  mainLockNote(item) {
    const list = this.mainList();
    const i = list.findIndex(x => x.sc.id === item.sc.id);
    const seen = new Set(this.storyData().seen || []);
    return i > 0 && seen.has(list[i - 1].sc.id) ? '明天' : '接着看下去';
  },

  /** 故事走到第几章了（下一段在哪一章；都看完了是最后一章） */
  storyChapter() {
    const list = this.mainList();
    const seen = new Set(this.storyData().seen || []);
    const next = list.find(x => !seen.has(x.sc.id));
    return next ? next.ch : (list.length ? list[list.length - 1].ch : 1);
  },

  /** 故事走到哪儿了（设置里那一行）：下一段能看了 / 明天来 / 看完了 */
  storyStatusLine() {
    const list = this.mainList();
    if (!list.length) return '';
    const seen = new Set(this.storyData().seen || []);
    const got = list.filter(x => seen.has(x.sc.id)).length;
    const pending = list.find(x => !seen.has(x.sc.id));
    if (!pending) return `故事看完了（${got}/${list.length}）。设置里随时能重看`;
    const st = this.mainStatus(pending);
    return `看到第 ${got}/${list.length} 段 · 下一段「${pending.sc.title}」${st === 'ready' ? '可以看了，点小人就能开始' : '明天来'}`;
  },

  /** 主线都看完了没有 */
  mainDone() {
    const seen = new Set(this.storyData().seen || []);
    const list = this.mainList();
    return !!list.length && list.every(x => seen.has(x.sc.id));
  },

  /** 下一段该看的（解锁了还没看的里面最早那段） */
  mainNext() {
    return this.mainList().find(x => this.mainStatus(x) === 'ready') || null;
  },

  /**
   * 演一段主线（v9.0，用户：「体验很生硬」「不应该只能从设置里点进去，用着用着到了某个阶段自动淡入淡出」）：
   * 章节第一段放一张章节卡，别的段落直接淡入，顶上淡出一句「上回」（sc.recap）；演到一半能「离开」，下次从离开的地方接着演
   * （story.resume；前面换过的背景、CG、手机模式先接上）；第一章里看完一段、下一段也能看了，最后问接着看还是先去记录。
   * 从记录切进来的（opts.bridge）：TA 先对你刚记的那条说一句再开始。你选的记进 story.picks；看完记进 seen + seenOn（下一段明天来）。
   * opts：{ resume（从剧本第几步）, bridge, auto, replay（设置里重看）, after, lead, outfits }
   */
  playMain(id, opts) {
    opts = opts || {};
    const item = this.mainFind(id);
    if (!item || this._touring || this._scene) return false;
    const sc = item.sc;
    const c = this.cast();
    const f = c.sex === 'f';
    const st = this.storyData();
    const base = sc.script;
    const at = Math.min(base.length - 1, Math.max(0, opts.resume != null ? opts.resume : (!opts.replay && st.resume && st.resume.id === id ? st.resume.at : 0)));
    let bg = sc.bg || (c.chapterBg || [])[item.ch - 1] || 'room', amb = sc.amb, cg = null, phone = false;
    base.slice(0, at).forEach(x => { if (!x || Array.isArray(x)) return; if (x.bg) bg = x.bg; if (x.amb != null) amb = x.amb; if (x.cg != null) cg = x.cg; if (x.phone != null) phone = !!x.phone; });
    const script = [];
    if (cg) script.push({ cg });
    if (phone) script.push({ phone: true });
    if (at > 0) script.push([null, '（接着上次。）']);
    if (opts.lead) script.push(['开心', opts.lead, 'wave']);
    script.push(...base.slice(at));
    // 隔了几天才来（v9.0，用户：「可以怪没来，这是游戏的一种方式」）：这段开头 TA 先闹点别扭（cast.absent：漏了一天 / 两三天 / 好几天）
    const gap = !opts.replay && at === 0 ? this.mainGap(id) : 0;
    const A = c.absent || [];
    const tier = gap >= 4 ? A[2] : gap >= 2 ? A[1] : gap >= 1 ? A[0] : null;
    if (tier && tier.length) {
      const pickA = tier[(new Date(getTodayDateString() + 'T12:00:00').getDate()) % tier.length];
      const fill = (l) => (Array.isArray(l) ? [l[0], String(l[1]).replace(/\{gap\}/g, String(gap)), l[2], l[3]] : l);
      script.splice(script.findIndex(x => Array.isArray(x)) < 0 ? script.length : script.findIndex(x => Array.isArray(x)), 0, ...pickA.map(fill));
    }
    // 从记录切进来的：TA 先对你刚记的那条说一句（手机聊天的段落里，是你发的第一条）
    if (opts.bridge && at === 0) {
      const ph = script.findIndex((x, i) => i < 4 && x && !Array.isArray(x) && x.phone === true);
      if (ph >= 0) script.splice(ph + 1, 0, ['你', opts.bridge]);
      else script.unshift(f ? ['开心', `${opts.bridge}，记好啦～`] : ['平静', `……${opts.bridge}。记下了。`]);
    }
    const outfits = (opts.outfits || []).slice(-2);
    if (outfits.length) script.push({ ask: '_wear', opts: this.wearChoices(outfits).map(o => ({ t: o[0], r: o[1] ? [[o[2], o[1]]] : [], sp: o[4] })) });
    // 第一天连着看完第一章：这段看完、下一段也能看了，问一句接着看还是先去记录
    const list = this.mainList();
    const nxt = list[list.findIndex(x => x.sc.id === id) + 1];
    // v10.0：剧情不再自己淡进来，第一段看完也问（不然第一天看完开场就断了）
    const chain = !opts.replay && item.ch === 1 && nxt && nxt.ch === 1 && !(st.seen || []).includes(nxt.sc.id);
    if (chain) script.push({ ask: '_next', opts: [{ t: `接着看「${nxt.sc.title}」`, r: [] }, { t: '先去记一下', r: [] }] });
    let talk = null, unlocked = null, goNext = false;
    const first = !(st.seen || []).includes(id);
    const card = item.k === 0 && at === 0;
    return this.playScene({
      label: this.chapterLabel(item.ch), title: card ? `「${sc.title}」` : '', sub: card ? (c.chapterLines || [])[item.ch - 1] : '',
      recap: at === 0 && !card ? sc.recap || '' : '',
      bg, amb, script, base, baseAt: at, replay: !!opts.replay, from: this.buddyCenter ? this.buddyCenter() : null,
      onChoose: (k, opt, askId) => {
        if (askId === '_wear') return this.wearChosen(opt);
        if (askId === '_next') { goNext = k === 0; return null; }
        if (!opts.replay || askId === 'confess') this.mainChoose(askId, k, opt); // 重看时换个选项玩玩，不改当时选的
        if (opt.sp === 'talk') talk = opt;
        if (opt.r && Array.isArray(opt.r[0]) && /害羞|心动/.test(opt.r[0][0])) this.buddyMood('love', 2400);
        return null;
      },
      onLeave: (pos) => { if (!opts.replay) this.mainLeave(id, pos); },
      afterLeave: () => {
        this.renderBuddy();
        if (!opts.replay && !this._touring) this.storyHandoff(f ? '好～你先忙！回来我们接着说。' : '……去吧。回来接着说。', 0, null);
      },
      onEnd: () => {
        this.mainSeen(id);
        if (first && !opts.replay) unlocked = this.wardrobeUnlock(id);
        if (talk && this.pushTalk) { this.pushTalk(talk.t, ((talk.r || [])[0] || [])[1] || ''); setTimeout(() => this.glowTalk && this.glowTalk(), 400); }
      },
      after: () => {
        this.renderBuddy();
        if (goNext && nxt) { setTimeout(() => this.playMain(nxt.sc.id, { after: opts.after }), 650); if (unlocked) setTimeout(() => this.wardrobeToast(unlocked), 400); return; }
        if (!opts.replay && !this._touring) this.storyHandoff(first ? sc.after : '', item.ch, sc);
        if (unlocked) setTimeout(() => this.wardrobeToast(unlocked), 1800);
        if (opts.after) opts.after();
      }
    });
  },

  /**
   * 演完回到今天页（v8.0，用户：「从 galgame 退出来，怎么丝滑地引导用户使用我们的记饮食」）：
   * 立绘缩回像素小人、落回原位（theater.js 收场），小人接一句余韵，再顺着时间引导记录——
   * 剧情里刚约好的事（「明早吃了，按住说一声就行」）> 这顿还没记（「午饭吃了吗」+ 我说一下 / 点图片记）> 今天还没练（白天）。
   * 输入框亮一下，提示语换成 TA 的话。这一章三段都看完了，先提一句它写了点东西（手册 / 搭子本）。不占每天说话的次数（是你自己点开的剧情）。
   */
  storyHandoff(line, ch, sc) {
    if (!this.buddyLook().show) return;
    const diary = false; // v9.0：演完不再追着问「看看我写的」（太多弹窗）；TA 写的那页在设置的剧情里
    const f = this.cast().sex === 'f';
    const cue = diary ? null : this.logCue(sc);
    setTimeout(() => {
      if (this._scene || this._touring) return;
      if (diary) {
        const tail = f ? '……我在节目单边上写了点东西。想偷看的话，现在就给你。' : '……我在本子角落写了几行。想看的话，现在给你。';
        this.askUser([line, tail].filter(Boolean).join(' '), [{ label: f ? '现在偷看' : '现在看', pick: () => setTimeout(() => this.showDiary(ch), 250) }, { label: '等会儿', reply: f ? '好～在设置的剧情里，随时能看！' : '……嗯。在设置的剧情里。' }]);
        return;
      }
      if (cue) {
        this.askUser([line, cue.say].filter(Boolean).join(' '), cue.opts);
        this.logHint(cue.hint);
      } else if (line) this.sayTip(line);
    }, this.reducedMotion() ? 200 : 900);
  },

  /** 加篇演完：一样的收尾（老名字留着） */
  storyAfterglow(line, ch) { this.storyHandoff(line, ch, null); },

  /** 演完以后引导记什么：{ say, opts, hint（输入框里的提示语） }，没有要引导的返回 null */
  logCue(sc) {
    const f = this.cast().sex === 'f';
    const today = getTodayDateString();
    const hour = new Date().getHours();
    const st = this.storyData();
    // 这段刚约的事
    const pid = sc && TF.Theater.scriptInfo(sc.script).promises.find(id => { const p = (st.promises || {})[id]; return p && !p.declined && !p.done && !p.lapsed; });
    const P = pid && (this.cast().promises || {})[pid];
    const talk = (label) => ({ label, talk: true, reply: f ? '按住下面说一句就好～' : '按住下面说就行。' });
    if (P) {
      const say = {
        breakfast: f ? '明天早上吃了，按住跟我说一声就行！' : '明早吃了，按住说一声就行。',
        train: f ? '练完了按住跟我说！散步也算哦～' : '练完了按住跟我说。走路也算。',
        newmove: f ? '练新动作的时候，记得跟我说是哪个！' : '练了新动作，跟我说是哪个。',
        protein: f ? '吃了鸡蛋、牛奶、肉，都按住跟我说～' : '吃了蛋白高的，按住跟我说。',
        threemeals: f ? '三顿饭，吃一顿记一顿就好！' : '三顿，吃一顿记一顿就行。',
        snack: f ? '饿了吃点东西，也按住跟我说～' : '饿了吃点东西，也跟我说。'
      }[P.kind];
      return { say, opts: [{ label: '好', reply: f ? '嗯！我等着！' : '嗯。等你。' }, talk('现在就记点什么')], hint: P.kind === 'breakfast' ? '明早：早饭吃了啥？' : '' };
    }
    // 这顿还没记
    const m = this.mealNow ? this.mealNow(hour) : { meal: '' };
    const cls = this.mealClasses ? this.mealClasses(today) : {};
    const eaten = new Set(this.diet.filter(d => d.date === today).map(d => (cls[d.id] || {}).group || d.mealType));
    if (m.meal && !eaten.has(m.meal)) {
      return {
        say: f ? `对了，${m.meal.replace('餐', '饭')}吃了吗？按住说一句就好～` : `……${m.meal.replace('餐', '饭')}吃了吗。按住说一句就行。`,
        opts: [talk('吃了，我说一下'), { label: '点图片记', pick: () => setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); this.openDex && this.openDex({ log: true }); }, 200) }, { label: '还没吃', reply: f ? '吃了再跟我说！别饿着～' : '吃了再说。别饿着。' }],
        hint: `${m.meal.replace('餐', '饭')}吃了啥？比如「${m.eg}」`
      };
    }
    // 白天还没练
    if (hour >= 9 && hour < 21 && !this.workouts.some(w => w.date === today)) {
      return {
        say: f ? '今天练了吗？练完跟我说～' : '今天练了吗。练完跟我说一声。',
        opts: [talk('练了，我说一下'), { label: '今天歇', reply: f ? '歇着也很好！' : '歇着也是练的一部分。' }],
        hint: '练了啥？比如「深蹲 60 公斤 4 组 8 个」'
      };
    }
    return null;
  },

  /** 输入框亮一下，提示语换成 TA 的话（「跟江叙说：午饭吃了啥？」），半分钟后换回来 */
  logHint(text) {
    if (this.glowTalk) this.glowTalk();
    const box = document.getElementById('cmp-text');
    if (!box || !text) return;
    if (!box.dataset.ph) box.dataset.ph = box.getAttribute('placeholder') || '';
    box.setAttribute('placeholder', `跟${this.buddyName()}说：${text}`);
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => box.setAttribute('placeholder', box.dataset.ph || ''), 30000);
  },

  /**
   * 在设置里刚切到剧情模式（v9.1）：告诉你回到今天页故事就来；回到今天页时（switchView）看一眼有没有能演的。
   */
  storyKickoff() {
    if (this.storyMigrate) this.storyMigrate(); // v10.0：以前的剧情进度（旧故事）清掉，从头开始
    this._storyKick = true;
    const next = this.mainNext ? this.mainNext() : null;
    if (this.showToast) this.showToast(next ? `回到今天页，点${this.buddyName()}就能开始看故事` : '剧情模式打开了');
  },

  /** 刚记的那条从卡片里飞向小人（像是你把它递给 TA），小人接住蹦一下，然后进剧场 */
  carryIntoStory(id, text, go) {
    this.closeBuddyPop && this.closeBuddyPop();
    const row = id && (document.querySelector(`.mg-row[data-id="${CSS.escape(id)}"]`) || document.querySelector(`.item[data-id="${CSS.escape(id)}"]`));
    const btn = document.getElementById('buddy');
    if (!row || !btn || this.reducedMotion()) { setTimeout(go, 150); return; }
    const a = row.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = 'rec-fly';
    fly.textContent = text;
    fly.style.left = `${a.left + 16}px`;
    fly.style.top = `${a.top + a.height / 2 - 16}px`;
    fly.style.setProperty('--dx', `${b.left + b.width / 2 - (a.left + 16) - 40}px`);
    fly.style.setProperty('--dy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
    document.body.appendChild(fly);
    row.classList.add('rec-glow');
    if (window.Sound) window.Sound.play('swoosh');
    setTimeout(() => {
      fly.remove();
      row.classList.remove('rec-glow');
      btn.classList.remove('catch'); void btn.offsetWidth; btn.classList.add('catch');
      if (window.Sound) window.Sound.play('pop');
      window.Haptics && window.Haptics.fire('tap');
      setTimeout(() => { btn.classList.remove('catch'); go(); }, 380);
    }, 640);
  },

  mainSeen(id) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    if (st.resume && st.resume.id === id) delete st.resume;
    if ((st.seen || []).includes(id)) { this.setBuddy({ story: st }); return; }
    st.seen = [...new Set((st.seen || []).concat(id))];
    st.seenOn = Object.assign({}, st.seenOn || {}, { [id]: getTodayDateString() }); // 下一段明天来（v9.0）
    this.setBuddy({ story: st });
    if (this.bondGain) this.bondGain('answer');
  },

  /** 上一段看完以后，你空了几天才来（第一章、重看不算；0 = 连着的） */
  mainGap(id) {
    const list = this.mainList();
    const i = list.findIndex(x => x.sc.id === id);
    if (i <= 0 || list[i].ch === 1) return 0;
    const on = (this.storyData().seenOn || {})[list[i - 1].sc.id];
    if (!on) return 0;
    const d = Math.round((new Date(getTodayDateString() + 'T00:00:00') - new Date(on + 'T00:00:00')) / 86400000);
    return Math.max(0, d - 1);
  },

  /** 演到一半离开了（v9.0「先去记录」）：记下停在剧本的第几步，下次从这儿接着演 */
  mainLeave(id, at) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    st.resume = { id, at: Math.max(0, at | 0) };
    this.setBuddy({ story: st });
    try { localStorage.setItem('tf_story_left', String(Date.now())); } catch (e) {}
  },

  /** 主线里选了：记下来；表白那一问和小剧情「那句话」是一回事（ask 都叫 confess），改关系 */
  mainChoose(askId, k, opt) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    st.picks = Object.assign({}, st.picks, { [askId]: k }); // k = -1：限时选项没选，沉默
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
    const st = this.storyData();
    const out = {
      you: name || '你', name, days, meals: this.diet.length, trains: new Set(this.workouts.map(w => w.date)).size,
      fav: favs.length ? favs[0][0] : '', lift: best ? `${best.exerciseName} ${round1(best.weightKg)} 公斤` : '',
      kg: drop >= 0.5 ? `轻了 ${drop} 公斤` : ''
    };
    // v8.0：剧情里起的名字（橘猫、搭子本最后一页）、关键时刻你说过的话
    Object.entries(st.names || {}).forEach(([k, v]) => { out[k] = v; });
    Object.entries(st.inputs || {}).forEach(([k, v]) => { const t = String(v || ''); out['said_' + k] = t.length > 24 ? t.slice(0, 24) + '…' : t; });
    return out;
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
    const st = this.storyData();
    return TF.Theater.evalCond(step.cond, { romance: st.romance, picks: st.picks, seen: st.seen, sv: st.sv, route: ((this.cast().endings || {})[st.route] || {}).route });
  },

  /**
   * 剧情里约好的时间，手机真的响一下（v8.0，用户：要）：at 'HH:MM'，今天这个点过了就明天（day 写了就是 day 天后）。
   * 安卓上排一条一次性通知（标题是 TA 的名字）；同时只排一条，新的替掉旧的。设置里关了（tf_story_push = '0'）、没有原生接口就不排。
   * 返回「明早 7:00」这样的话（剧场里冒一行提示），没排返回 ''。
   */
  storyPush(at, text, day) {
    try { if (localStorage.getItem('tf_story_push') === '0') return ''; } catch (e) {}
    const N = window.TrainFitNative;
    if (!N || !N.storyPush || !text) return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(at || ''));
    if (!m) return '';
    const now = new Date();
    const t = new Date(now);
    t.setHours(+m[1], +m[2], 0, 0);
    if (day) t.setDate(t.getDate() + (+day || 0));
    else if (t.getTime() <= now.getTime() + 60000) t.setDate(t.getDate() + 1);
    const tomorrow = t.toDateString() !== now.toDateString();
    const h = t.getHours();
    const part = h < 11 ? (tomorrow ? '明早' : '早上') : h < 18 ? (tomorrow ? '明天' : '今天') : (tomorrow ? '明晚' : '今晚');
    try { N.storyPush(JSON.stringify({ at: t.getTime(), title: this.buddyName(), body: String(text).slice(0, 80) })); } catch (e) { return ''; }
    // 还没给通知权限：TA 刚说完「手机会响」，正是问的时候（只问一次）
    try {
      if (N.notificationsEnabled && !N.notificationsEnabled() && this.requestNotif && localStorage.getItem('tf_story_perm') !== '1') {
        localStorage.setItem('tf_story_perm', '1');
        this.requestNotif(() => {});
      }
    } catch (e) {}
    return `${part} ${h}:${String(t.getMinutes()).padStart(2, '0')}`;
  },

  /** 小人头上挂本小书：有解锁了还没看的主线 */
  mainReady() {
    return !!(this.storyOn() && !this.needsOnboarding && this.cast().main && this.mainNext());
  },

  /**
   * 打开 App 时，有新的主线就由 TA 来找你（v8.0：每段有自己的邀请话——「……你醒了？我在泳池。」——和合适的时间，
   * 早上六点那段早上才来，深夜电话那段晚上才来；等了两天还没碰上那个时间就不等了）。你点了才演，一天问一次。
   */
  mainNudge() {
    const next = this.mainNext();
    if (!next || !this.storyOn() || this._touring) return false;
    if (!this.whenOk(next.sc.when) && this.mainWaited(next) < 2) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_main_nudge') || ''; } catch (e) {}
    if (last === today || !this.voiceBudget('guide', false)) return false;
    try { localStorage.setItem('tf_main_nudge', today); } catch (e) {}
    this.voiceBudget('guide', true);
    const inv = this.mainInvite(next);
    const f = this.cast().sex === 'f';
    return this.askUser(inv[0], [
      { label: inv[1], pick: () => setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); this.playMain(next.sc.id); }, 250) },
      { label: inv[2], reply: f ? '好～你忙完了点我，我等你！' : '嗯。忙完了点我。' }
    ]);
  },

  /** 这段的邀请：TA 来找你说的那句 + 去 / 不去（没写的用通用的） */
  mainInvite(item) {
    const f = this.cast().sex === 'f';
    const inv = item.sc.invite || [];
    const gen = item.k === 0 ? (f ? `新的一章开始啦——${this.chapterLabel(item.ch)}。现在有空吗？` : `新的一章。${this.chapterLabel(item.ch)}。……现在有空吗。`)
      : (f ? '有件事想跟你说……现在有空听吗？' : '……有件事想跟你说。现在有空吗。');
    return [inv[0] || gen, inv[1] || `听你说 ·「${item.sc.title}」`, inv[2] || '等会儿'];
  },

  /** 这段适合什么时候来：morning 5～10 点 / day 9～19 点 / evening 17～24 点 / night 20～3 点 / any */
  whenOk(when, hour) {
    const h = hour == null ? new Date().getHours() : hour;
    if (!when || when === 'any') return true;
    if (when === 'morning') return h >= 5 && h < 10;
    if (when === 'day') return h >= 9 && h < 19;
    if (when === 'evening') return h >= 17;
    if (when === 'night') return h >= 20 || h < 3;
    return true;
  },

  /** 解锁了多少天（亲密度一天记录 10 点，粗算） */
  mainWaited(item) {
    return Math.max(0, Math.floor((this.bond().xp - this.mainXp(item.ch, item.k)) / 10));
  },

  /**
   * TA 现在有什么想跟你说的（点小人气泡最上面那一行、头上的小气泡）：约定达成的加篇优先，其次新的主线。
   * 返回 { kind: 'bonus' | 'main', id, line（TA 的那句）, label } 或 null
   */
  storyCue() {
    if (!this.storyOn() || this.needsOnboarding || !this.cast().main) return null;
    const b = this.bonusReady();
    if (b) return { kind: 'bonus', id: b.id, line: this.cast().sex === 'f' ? '约好的事你做到了！我有东西给你看～' : '约好的事，你做到了。……有东西给你看。', label: `约定达成 ·「${b.title}」` };
    const next = this.mainNext();
    if (!next) return null;
    const f = this.cast().sex === 'f';
    const left = (this.storyData().resume || {}).id === next.sc.id;
    const line = left ? (f ? '上次说到一半！点这里接着听～' : '……上次说到一半。点这里接着。') : (f ? '有新的一段了！点这里就开始～' : '……下一段。点这里就开始。');
    return { kind: 'main', id: next.sc.id, line, label: `${this.chapterLabel(next.ch)}「${next.sc.title}」` };
  },

  // ---------------- 约定（v8.0）：剧情里跟你约的事，在真实的记录里做到了就解锁加篇 ----------------

  /** 打开 App 时：约定做到了、加篇还没看（记完那会儿小人在说别的），问一句；一天一次 */
  bonusNudge() {
    const B = this.bonusReady();
    if (!B || !this.storyOn() || this._touring) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_bonus_nudge') || ''; } catch (e) {}
    if (last === today) return false;
    try { localStorage.setItem('tf_bonus_nudge', today); } catch (e) {}
    const cue = this.storyCue();
    const f = this.cast().sex === 'f';
    return this.askUser(cue.line, [
      { label: `看看 ·「${B.title}」`, pick: () => setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); this.playBonus(B.id); }, 250) },
      { label: '等会儿', reply: f ? '好！点我就能看～' : '嗯。点我就能看。' }
    ]);
  },

  /** 剧场里发生的事记进存档（重看时剧场不调这个）：set / setmax 隐藏好感、input 你说的话、name 起的名字、promise 约定 */
  storyStep(kind, data) {
    const st = Object.assign({ seen: [], picks: {} }, this.storyData());
    if (kind === 'set') { st.sv = Object.assign({}, st.sv || {}); Object.keys(data).forEach(k => { st.sv[k] = (+st.sv[k] || 0) + (+data[k] || 0); }); }
    else if (kind === 'setmax') { st.sv = Object.assign({}, st.sv || {}); Object.keys(data).forEach(k => { st.sv[k] = Math.max(+st.sv[k] || 0, +data[k] || 0); }); }
    else if (kind === 'input') {
      st.inputs = Object.assign({}, st.inputs || {}, { [data.id]: String(data.text || '').slice(0, 80) });
      if (data.fact) st.inputFacts = Object.assign({}, st.inputFacts || {}, { [data.id]: String(data.fact).slice(0, 60) });
    } else if (kind === 'name') st.names = Object.assign({}, st.names || {}, { [data.key]: String(data.value || '').slice(0, 8) });
    else if (kind === 'docAdd') st.docAdds = [...new Set((st.docAdds || []).concat(String(data || '').slice(0, 40)))].slice(-6);
    else if (kind === 'route') st.route = data.key;
    else if (kind === 'promise') {
      const P = (this.cast().promises || {})[data.id];
      if (!P) return;
      const today = getTodayDateString();
      st.promises = Object.assign({}, st.promises || {}, { [data.id]: data.yes ? { at: today, due: shiftDateString(today, P.days || 2) } : { at: today, declined: true } });
    }
    this.setBuddy({ story: st });
  },

  // ---------------- 今天页的小人就是剧情里的 TA（v8.0，用户：「小人说的话跟剧情要对得上」「服装、发型、身材由剧情推进来变」） ----------------

  /** 这段剧情（主线 / 加篇 / 小剧情）看过没有 */
  storySeen(id) { return !id || (this.storyData().seen || []).includes(id); },

  /** 台词表里的一句：字符串，或者 [话, 要先看过的剧情]——剧情里还没说过的事（肩伤、爸爸），小人不先说 */
  castLine(x) {
    if (Array.isArray(x)) return this.storyOn() && this.storySeen(x[1]) ? String(x[0] || '') : ''; // 极简模式：剧情里的事不提
    return x ? String(x) : '';
  },

  /** 剧情的余韵（cast.echo）：最近看过的三段里挑一句，接着剧情说；刚说过的不重复 */
  storyEcho() {
    if (!this.storyOn()) return '';
    const E = this.cast().echo || {};
    const seen = this.storyData().seen || [];
    const ids = seen.filter(id => E[id]).slice(-3);
    const pool = ids.flatMap(id => E[id]).map(t => TF.Theater.fill(t, this.storyVars())).filter(t => t && !/\{/.test(t) && t !== this._echoLast);
    if (!pool.length) return '';
    const t = pool[Math.floor(Math.random() * pool.length)];
    this._echoLast = t;
    return t;
  },

  /**
   * 看完这段剧情，TA 的样子跟着变：解锁的衣服（cast.wardrobe）第一次看完时 TA 自己换上（wear: false 的只解锁）；
   * 小变化（cast.marks，v8.1：剪了刘海、夹了片叶子…）看过就一直带着，不用存（buddyMarks 按看过的剧情算）。回到今天页冒一行提示。
   * 返回 { k, label, worn, mark } 或 null。重看不算。
   */
  wardrobeUnlock(id) {
    const W = this.cast().wardrobe || {};
    const M = this.cast().marks || {};
    const m = Object.keys(M).find(x => M[x].scene === id);
    const out = m ? { mark: M[m].label } : null;
    const k = Object.keys(W).find(x => (W[x].scene || W[x].bonus) === id);
    if (!k) return out;
    const st = this.storyData();
    if ((st.wore || []).includes(k)) return out;
    const w = W[k];
    const worn = w.wear !== false;
    this.setBuddy(Object.assign({ story: Object.assign({}, st, { wore: (st.wore || []).concat(k) }) }, worn ? { outfit: k } : {}));
    return Object.assign({ k, label: w.label, worn }, out || {});
  },

  wardrobeToast(u) {
    if (!u || !this.showToast) return;
    const n = this.buddyName();
    if (!u.k) this.showToast(`${n}的样子变了一点：${u.mark}`);
    else if (u.mark) this.showToast(`${n}${u.worn ? '换上了' : '解锁了'}「${u.label}」，${u.mark}`);
    else this.showToast(u.worn ? `${n}换上了「${u.label}」· 设置 → 外观里能换回来` : `解锁了「${u.label}」· 设置 → 外观里能换上`);
    if (this.buddyDo) setTimeout(() => this.buddyDo(u.worn ? [['flex', 1100], ['stand', 300]] : [['stand', 200], ['wave', 1000], ['stand', 300]]), 700);
  },

  /** 这个约定在哪几天里算：吃早饭从第二天开始，别的从约好那天开始，到 due 为止 */
  promiseRange(id, p) {
    const P = (this.cast().promises || {})[id] || {};
    return { from: P.kind === 'breakfast' ? shiftDateString(p.at, 1) : p.at, to: p.due };
  },

  /** 这个约定做到了没有（按你的真实记录） */
  promiseDone(id, p) {
    const P = (this.cast().promises || {})[id];
    if (!P || !p || p.declined) return false;
    const { from, to } = this.promiseRange(id, p);
    const days = [];
    for (let d = from; d <= to; d = shiftDateString(d, 1)) days.push(d);
    const groups = (d) => { const cls = this.mealClasses ? this.mealClasses(d) : {}; return new Set(this.diet.filter(x => x.date === d).map(x => (cls[x.id] || {}).group || String(x.mealType || '').replace('/补剂', ''))); };
    if (P.kind === 'breakfast') return days.some(d => groups(d).has('早餐'));
    if (P.kind === 'train') return days.some(d => this.workouts.some(w => w.date === d));
    if (P.kind === 'threemeals') return days.some(d => { const g = groups(d); return g.has('早餐') && g.has('午餐') && g.has('晚餐'); });
    if (P.kind === 'snack') return days.some(d => groups(d).has('加餐'));
    if (P.kind === 'protein') {
      const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0;
      return !!target && days.some(d => this.diet.filter(x => x.date === d).reduce((t, x) => t + (x.proteinG || 0), 0) >= target);
    }
    if (P.kind === 'newmove') {
      const before = new Set(this.workouts.filter(w => w.date < p.at).map(w => String(w.exerciseName || '').trim()));
      return days.some(d => this.workouts.some(w => w.date === d && w.exerciseName && !before.has(String(w.exerciseName).trim())));
    }
    return false;
  },

  /**
   * 记完东西 / 打开 App 时看一眼约定：做到了就标上，小人马上说一句（不占说话次数，是你做到的事）+ 问要不要看加篇；
   * 过期了没做到的悄悄收起来，不提、不怪你（陪伴不绑架）。返回这次新做到的约定 id。
   */
  promiseCheck(quiet) {
    if (!this.storyOn()) return null;
    const st = this.storyData();
    const list = Object.entries(st.promises || {});
    if (!list.length) return null;
    const today = getTodayDateString();
    let hit = null, changed = false;
    const next = Object.assign({}, st.promises);
    list.forEach(([id, p]) => {
      if (!p || p.declined || p.done || p.lapsed) return;
      if (this.promiseDone(id, p)) { next[id] = Object.assign({}, p, { done: today }); hit = hit || id; changed = true; }
      else if (today > p.due) { next[id] = Object.assign({}, p, { lapsed: true }); changed = true; }
    });
    if (changed) this.setBuddy({ story: Object.assign({}, st, { promises: next }) });
    if (hit && !quiet) this.promiseCelebrate(hit);
    return hit;
  },

  promiseCelebrate(id) {
    const P = (this.cast().promises || {})[id];
    if (!P || !this.storyOn() || this._touring) return;
    const B = (this.cast().bonus || {})[P.bonus];
    const f = this.cast().sex === 'f';
    setTimeout(() => {
      if (this._scene) return;
      this.buddyBang && this.buddyBang('♥');
      if (this.buddyDo) this.buddyDo([['flex', 1000], ['wave', 700], ['stand', 300]]);
      if (window.Sound) window.Sound.play('unlock');
      const say = f ? `约定达成！「${P.title}」——你做到了！` : `约定达成。「${P.title}」。……你做到了。`;
      if (!B) { this.sayTip(say); return; }
      this.askUser(say + (f ? ' 我有东西给你看～' : ' 有东西给你看。'), [
        { label: `看看 ·「${B.title}」`, pick: () => setTimeout(() => { this.closeBuddyPop && this.closeBuddyPop(); this.playBonus(B.id); }, 250) },
        { label: '等会儿', reply: f ? '好！点我就能看～' : '嗯。点我就能看。' }
      ]);
    }, 1600);
  },

  /** 做到了、还没看的加篇（最早的那个） */
  bonusReady() {
    const st = this.storyData();
    const c = this.cast();
    const seen = new Set(st.seen || []);
    const id = Object.keys(c.promises || {}).find(k => (st.promises || {})[k] && st.promises[k].done && c.promises[k].bonus && !seen.has(c.promises[k].bonus));
    return id ? (c.bonus || {})[c.promises[id].bonus] : null;
  },

  /** 演一段约定加篇（重看也走这里） */
  playBonus(id, replay) {
    const B = (this.cast().bonus || {})[id];
    if (!B || this._touring) return false;
    const pid = Object.keys(this.cast().promises || {}).find(k => this.cast().promises[k].bonus === id);
    const ch = pid ? this.cast().promises[pid].ch : this.bond().lv;
    const first = !(this.storyData().seen || []).includes(id);
    return this.playScene({
      label: `约定 · ${this.chapterLabel(ch)}`, title: `「${B.title}」`, bg: B.bg || 'room', script: B.script.slice(), replay: !!replay, from: this.buddyCenter ? this.buddyCenter() : null,
      onChoose: (k, opt, askId) => { if (!replay) this.mainChoose(askId, k, opt); return null; },
      onEnd: () => { this.mainSeen(id); if (!replay && first) this._bonusWear = this.wardrobeUnlock(id); },
      after: () => {
        this.renderBuddy();
        if (!replay && first && B.after) this.storyAfterglow(B.after);
        if (this._bonusWear) { const u = this._bonusWear; this._bonusWear = null; setTimeout(() => this.wardrobeToast(u), 1800); }
      }
    });
  },

  // ---------------- TA 视角的手册边角 / 搭子本（v8.0）：每章三段主线都看完了解锁 ----------------

  diaryReady(ch) {
    const seen = new Set(this.storyData().seen || []);
    const list = (this.cast().main || [])[ch - 1] || [];
    return !!list.length && list.every(sc => seen.has(sc.id)) && !!((this.cast().diary || [])[ch - 1]);
  },

  diarySeen(ch) { return ((this.storyData().diary || [])).includes(ch); },

  /** 翻开这一章的手册边角 / 搭子本：一张纸，一行一行浮出来；只出你们真的经历过的那几行（按你当时选的） */
  showDiary(ch) {
    const D = (this.cast().diary || [])[ch - 1];
    if (!D || !this.diaryReady(ch)) return false;
    const vars = this.storyVars();
    const ctx = Object.assign(this.sceneCtx(), { vars, route: ((this.cast().endings || {})[this.storyData().route] || {}).route });
    const lines = D.lines.filter(l => TF.Theater.evalCond(l[1], ctx)).map(l => TF.Theater.fill(l[0], vars)).filter(Boolean);
    let el = document.getElementById('diary-sheet');
    if (!el) {
      el = document.createElement('div');
      el.id = 'diary-sheet';
      el.className = 'diary-sheet hidden';
      el.setAttribute('role', 'dialog');
      document.body.appendChild(el);
      el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.dy-close')) el.classList.add('hidden'); });
    }
    const f = this.cast().sex === 'f';
    el.dataset.who = f ? 'xy' : 'jx';
    el.innerHTML = `<div class="dy-paper"><small class="dy-from">${esc(f ? `${this.buddyName()}的节目单 · 边上的字` : `${this.buddyName()}的训练本 · 角落里的字`)}</small>` +
      `<b class="dy-title">${esc(D.title)}</b><span class="dy-ch">${esc(this.chapterLabel(ch))}</span>` +
      `<div class="dy-lines">${lines.map((t, i) => `<p style="--i:${i}">${esc(t)}</p>`).join('')}</div>` +
      `<button class="dy-close" type="button">${f ? '合上本子' : '合上'}</button></div>`;
    el.classList.remove('hidden');
    if (window.Sound) window.Sound.play('blip');
    if (!this.diarySeen(ch)) {
      const st = Object.assign({ seen: [], picks: {} }, this.storyData());
      st.diary = [...new Set((st.diary || []).concat(ch))];
      this.setBuddy({ story: st });
    }
    return true;
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
    const mains = this.mainList();
    const next = this.mainNext();
    const now = this.storyChapter(); // v9.0：章节跟着故事走（第一天一章、之后每天一段），不跟亲密度
    void b;
    el.innerHTML = c.story.map((x, i) => {
      const lv = i + 1, open = lv <= now;
      const evs = TF.Story.EVENTS.filter(e => e.lv === lv && c.events[e.id] && (e.id !== 'date' || st.romance === true) && e.id !== 'confess');
      const mine = mains.filter(m => m.ch === lv);
      const got = mine.filter(m => seen.has(m.sc.id)).length;
      const rows = mine.map(m => {
        const stt = this.mainStatus(m);
        if (stt === 'locked') return `<span class="sb-main locked"><i>${m.k + 1}</i><b>？？？</b><small>${this.mainLockNote(m)}</small></span>`;
        return `<button type="button" class="sb-main ${stt}" data-main="${m.sc.id}"><i>${m.k + 1}</i><b>${esc(m.sc.title)}</b><small>${stt === 'seen' ? '重看' : next && next.sc.id === m.sc.id ? '新 · 点开看' : '新'}</small></button>`;
      }).join('');
      const scenes = evs.map(e => seen.has(e.id)
        ? `<button type="button" class="sb-scene seen" data-scene="${e.id}">${esc(c.events[e.id].title)}</button>`
        : `<span class="sb-scene${open ? '' : ' far'}" title="${esc(TF.Story.HINTS[e.id] || '')}"><b>？？？</b>${open ? esc(TF.Story.HINTS[e.id] || '') : ''}</span>`).join('');
      const evGot = evs.filter(e => seen.has(e.id)).length;
      // v8.0：这一章的约定（约好了 · 还剩几天 / 做到了 · 加篇 / 下次吧）和 TA 写的那一页（三段都看完了解锁）
      const pid = Object.keys(c.promises || {}).find(k => c.promises[k].ch === lv);
      const P = pid && c.promises[pid];
      const pr = P && (st.promises || {})[pid];
      const B = P && (c.bonus || {})[P.bonus];
      const today = getTodayDateString();
      const left = pr && pr.due ? Math.max(0, Math.round((new Date(pr.due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)) : 0;
      const promise = !P ? '' : pr && pr.done && B ? `<button type="button" class="sb-promise done${seen.has(B.id) ? ' seen' : ''}" data-bonus="${B.id}"><i>约定</i><b>「${esc(B.title)}」</b><small>${seen.has(B.id) ? '重看' : '做到了 · 点开看'}</small></button>`
        : pr && !pr.declined && !pr.lapsed ? `<span class="sb-promise on" title="${esc(P.detail)}"><i>约定</i><b>${esc(P.title)}</b><small>${left ? `还剩 ${left} 天` : '今天'}</small></span>`
        : pr ? `<span class="sb-promise off" title="${esc(P.detail)}"><i>约定</i><b>${esc(P.title)}</b><small>${pr.declined ? '下次吧' : '这次没做到，没关系'}</small></span>`
        : open ? `<span class="sb-promise far" title="主线里会跟你约"><i>约定</i><b>？？？</b><small>这一章里会约</small></span>` : '';
      const f = c.sex === 'f';
      const diary = !(c.diary || [])[lv - 1] ? '' : this.diaryReady(lv) ? `<button type="button" class="sb-diary${this.diarySeen(lv) ? ' seen' : ''}" data-diary="${lv}"><i>${f ? '节目单' : '手册边角'}</i><b>${esc(c.diary[lv - 1].title)}</b><small>${this.diarySeen(lv) ? '再看看' : `${f ? '她' : '他'}写的 · 新`}</small></button>`
        : open ? `<span class="sb-diary far"><i>${f ? '节目单' : '手册边角'}</i><b>？？？</b><small>这章三段看完解锁</small></span>` : '';
      return `<div class="sb-ch${open ? '' : ' locked'}${now === lv ? ' now' : ''}">` +
        `<div class="sb-head"><span class="sb-open"><b>${esc(this.chapterLabel(lv))}</b><small>${open ? (now === lv && got < mine.length ? '正在这一章' : `主线 ${got}/${mine.length}`) : '接着看下去'}</small></span>` +
        `<span class="sb-count">${got + evGot}/${mine.length + evs.length}</span></div>` +
        (open || lv === now + 1 ? `<div class="sb-mains">${rows}</div>` + (promise || diary ? `<div class="sb-extras">${promise}${diary}</div>` : '') + (evs.length ? `<p class="sb-sub">小剧情${this.mainDone() ? '' : ' · 主线看完以后才会来'}</p><div class="sb-scenes">${scenes}</div>` : '') : '') + '</div>';
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
    if (!this.storyOn()) return [];
    const st = this.storyData();
    const E = this.cast().events || {};
    const picks = st.picks || {};
    const fact = (id) => {
      if (E[id]) { const c = E[id].choices[picks[id]]; return c ? [c[3]] : []; }
      const m = this.mainFind(id) || (this.cast().bonus && this.cast().bonus[id] ? { sc: this.cast().bonus[id] } : null); // 主线 / 加篇一段里可能有几问，按出场顺序
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
    // 关键时刻你对 TA 说过的话（v8.0）
    const said = Object.values(st.inputFacts || {}).filter(Boolean);
    return [...new Set((st.seen || []).flatMap(fact).concat(said).filter(Boolean))].slice(-6);
  },

  /** 你们现在的关系（给聊天的大模型）：恋人 / 好搭子 / 有点暧昧 */
  relationPrompt() {
    if (!this.storyOn()) return ''; // 极简模式：就是陪你记的搭子，不往暧昧、恋爱走
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
