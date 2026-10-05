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
    { id: 'confess', lv: 4, when: (c) => c.trigger === 'open' && c.hour >= 18 && c.hour < 23 && c.romance == null && c.lvDays >= 3 && (!c.confessAfter || c.confessAfter <= c.today) },
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
      onChoose: (k, ch) => {
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
   * 设置里的「剧情」（v7.0：回忆、小剧情、衣服都按章放在一起）：每章一行——开头（这一章的回忆，点了重看）+ 这章的几段小剧情
   * （看过的点了重看，没看过的写怎么解锁，还没到的章节写再记几天）。
   */
  renderStoryBook() {
    const el = document.getElementById('buddy-story');
    if (!el) return;
    const c = this.cast(), b = this.bond(), st = this.storyData();
    const seen = new Set(st.seen || []);
    const days = (lv) => Math.max(1, Math.ceil((((TF.Bond.LEVELS[lv - 1] || {}).xp || 0) - b.xp) / 10)); // 一天记录 10 点亲密度
    el.innerHTML = c.story.map((x, i) => {
      const lv = i + 1, open = b.lv >= lv;
      const evs = TF.Story.EVENTS.filter(e => e.lv === lv && c.events[e.id] && (e.id !== 'date' || st.romance === true));
      const got = evs.filter(e => seen.has(e.id)).length;
      const scenes = evs.map(e => seen.has(e.id)
        ? `<button type="button" class="sb-scene seen" data-scene="${e.id}">${esc(c.events[e.id].title)}</button>`
        : `<span class="sb-scene${open ? '' : ' far'}" title="${esc(TF.Story.HINTS[e.id] || '')}"><b>？？？</b>${open ? esc(TF.Story.HINTS[e.id] || '') : ''}</span>`).join('');
      return `<div class="sb-ch${open ? '' : ' locked'}${b.lv === lv ? ' now' : ''}">` +
        `<div class="sb-head">${open ? `<button type="button" class="sb-open" data-chapter="${lv}">` : '<span class="sb-open">'}` +
        `<b>${esc(this.chapterLabel(lv))}</b><small>${open ? `开头「${esc(x[0])}」${b.lv === lv ? ' · 正在这一章' : ''}` : `再记 ${days(lv)} 天左右`}</small>${open ? '</button>' : '</span>'}` +
        `<span class="sb-count">${got}/${evs.length}</span></div>` +
        (open || lv === b.lv + 1 ? `<div class="sb-scenes">${scenes}</div>` : '') + '</div>';
    }).join('');
  },

  /** 你们之间发生过的事（给聊天的大模型，最多 5 件，新的在后） */
  storyFacts() {
    const st = this.storyData();
    const E = this.cast().events || {};
    return (st.seen || []).map(id => { const k = (st.picks || {})[id]; const c = E[id] && E[id].choices[k]; return c && c[3]; }).filter(Boolean).slice(-5);
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
