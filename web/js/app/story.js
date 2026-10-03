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
   *   food（刚记的吃的）, roll（0～1 的骰子）, today, seen: [id], romance, confessAfter }
   */
  function pick(c) {
    const seen = new Set(c.seen || []);
    return EVENTS.find(e => c.lv >= e.lv && (!seen.has(e.id) || (e.id === 'confess' && c.romance == null)) && e.when(c)) || null;
  }

  TF.Story = { EVENTS, pick };
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

  /** 能不能出一段剧情、出哪段（trigger：open 打开 / night 深夜打开 / record 刚记了吃的） */
  storyEvent(trigger, info) {
    if (!this.chatty() || this._touring || this.needsOnboarding || !this.cast().events) return false;
    if (trigger !== 'record' && (!this.canChat() || Date.now() - (this._popAt || 0) < 60000)) return false;
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_story') || ''; } catch (e) {}
    if (last === today || !this.voiceBudget('guide', false)) return false;
    const st = this.storyData();
    const now = new Date();
    const ev = TF.Story.pick({ trigger, lv: this.bond().lv, hour: now.getHours(), weekend: [0, 6].includes(now.getDay()),
      days: new Set(this.recordDates()).size, lvDays: this.storyLvDays(), food: (info && info.food) || '', roll: Math.random(), today,
      seen: st.seen || [], romance: st.romance, confessAfter: st.confessAfter });
    if (!ev || !this.cast().events[ev.id]) return false;
    try { localStorage.setItem('tf_story', today); } catch (e) {}
    this.voiceBudget('guide', true);
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
   * 演一段：小人的头像 + 标题，一句一句打出来（点「▸」下一句），最后三个选项；选了它回一句，记下来。
   */
  showStoryEvent(id) {
    const E = this.cast().events[id];
    const pop = document.getElementById('buddy-pop');
    if (!E || !pop || this._touring) return false;
    let i = 0;
    pop.dataset.mode = 'story';
    pop.dataset.level = 'none';
    const art = (face) => TF.Buddy.svg(this.buddyArt({ pose: 'stand', face, gear: [], scale: 3 }));
    pop.innerHTML = `<div class="story-card ev"><div class="story-art">${art(E.lines[0][0])}</div>` +
      `<div class="story-meta"><span class="story-tag ev"><i aria-hidden="true">✦</i>小剧情</span><b class="story-title">${esc(E.title)}</b>` +
      `<span class="story-who">${esc(this.buddyName())} · ${esc(this.bond().name)}</span></div></div>` +
      `<p class="story-text ev-text"></p><div class="buddy-acts story-acts ev-acts"></div>`;
    const text = pop.querySelector('.ev-text');
    const acts = pop.querySelector('.ev-acts');
    const face = (f) => { pop.querySelector('.story-art').innerHTML = art(f); };
    const step = () => {
      const [f, line] = E.lines[i];
      face(f);
      this.typeOut(text, line);
      if (i < E.lines.length - 1) {
        acts.innerHTML = '<button class="buddy-act ev-next" type="button" aria-label="下一句">▸</button>';
        return;
      }
      acts.innerHTML = E.choices.map((c, k) => `<button class="buddy-act ev-choice" type="button" data-k="${k}">${esc(c[0])}</button>`).join('');
    };
    acts.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = e.target.closest('button');
      if (!b) return;
      window.Haptics && window.Haptics.fire('tick');
      if (b.classList.contains('ev-next')) { i += 1; step(); return; }
      if (b.dataset.done) { this.closeBuddyPop('story'); return; }
      const c = E.choices[+b.dataset.k];
      if (!c) return;
      this.storyChoose(id, +b.dataset.k);
      face(c[2]);
      text.classList.add('reply');
      this.typeOut(text, c[1]);
      const talk = c[4] === 'talk';
      acts.innerHTML = `<button class="buddy-act primary" type="button" data-done="1">${talk ? '嗯，我说' : '嗯'}</button>`;
      if (/害羞|心动/.test(c[2])) { this.buddyMood('love', 2400); this.buddyBang('♥'); }
      else this.buddyMood(TF.Buddy.FACE_MOOD[c[2]] || 'good', 2000);
      if (talk) { this.pushTalk && this.pushTalk(c[0], c[1]); setTimeout(() => this.glowTalk && this.glowTalk(), 400); }
      clearTimeout(this._askT);
      this._askT = setTimeout(() => this.closeBuddyPop('story'), 9000);
    });
    step();
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('story'), 60000);
    if (window.Sound) window.Sound.play('unlock', 0.5);
    if (!this._touring) this.buddyDo([['stand', 120], ['wave', 900], ['stand', 400]]);
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
