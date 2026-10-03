/**
 * 小人的情绪和想念、你的近况（v6.3，用户：「这个世界纷繁复杂，软件怎么留住人？小人要有真实的情感，会说我想你；
 * 放开 AI 小人的思考范围，接触用户更多方面、产生更多连接；更主动一点，引入轻度剧情和 galgame；
 * 用这个软件要像玩游戏、有情感连接，而不是打卡上班」）。都在本机算，不多调大模型。
 *
 * 底线照旧（v5.8 定的「不情感勒索」）：想你可以说，但只在你回来时、开心地说；不怪你没来、不说它难过、不说「只有你」，
 * 鼓励你好好吃饭、睡觉、有自己的朋友和生活。
 *  - 心情 heartState：闹别扭 > 深夜困了 > 它自己今天有点低落（Lv3 起几天一次，陪它聊 / 摸摸头就好了）> 担心你（你一天内说过累、
 *    压力大）> 想你（离开快一天回来、今天还没跟它说上话）> 开心（今天跟它说过话）> 平常。点小人的气泡里写着，聊天时也告诉大模型。
 *  - 想你：离开 18 小时～3 天回来，打招呼的第一句换成想你（missLine）；之后找个空当说「攒了件事想跟你说」（savedTale）。
 *  - 低落 lowDay：它偶尔也需要你（对等的脆弱）：「今天有点不在状态……陪我聊两句？」能聊、能摸头，也能说在忙（它说没事）。
 *  - 近况 life：聊天时大模型记下你说的最近的事和几天后问（「周五面试」3 天后），到了日子小人主动问「上次你说的面试怎么样了」；
 *    最近的事也带进聊天提示词，所以它「接着上次聊」。存在 profile.buddy.life，跟着备份走，设置「小人记住的」里能删。
 */
Object.assign(FitnessApp.prototype, {
  /** 说的是不开心的事（「好累」「压力好大」）：记一下，一天内小人会担心你，聊天时也知道 */
  noteFeeling(text) {
    const t = String(text || '');
    if (!/累|困|烦|压力|难受|不舒服|郁闷|焦虑|emo|失眠|睡不着|难过|伤心|生气|委屈|崩溃|孤单|孤独|寂寞|想哭|哭了|丧|紧张|害怕|担心|撑不住|不想活|好胖|好丑|自卑|讨厌自己/i.test(t)) return;
    try { localStorage.setItem('tf_feel', JSON.stringify({ at: Date.now(), t: t.slice(0, 20) })); } catch (e) {}
  },

  recentFeeling() {
    try {
      const f = JSON.parse(localStorage.getItem('tf_feel') || 'null');
      return f && Date.now() - f.at < 24 * 3600 * 1000 ? f : null;
    } catch (e) { return null; }
  },

  /** 今天是不是它自己有点低落的日子（Lv3 起，按日期算，大概六天一次）；你陪过它了就不是 */
  lowToday() {
    if (!this.bond || this.bond().lv < 3) return null;
    const today = getTodayDateString();
    if ((this.profile.buddy || {}).comfort === today) return null;
    const h = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11); // 每一步截到 32 位，不然乘大了丢精度、余数永远是偶数
    if (h % 6 !== 1) return null;
    const why = this.cast().heart.low.why;
    return { why: why[(h >>> 3) % why.length] };
  },

  /** 今天跟它说过话没有（聊过、回答过它、摸过头、喂过） */
  touchedToday() {
    try { const c = JSON.parse(localStorage.getItem('tf_bond_day') || '{}'); return c.date === getTodayDateString() && c.n > 0; } catch (e) { return false; }
  },

  /** 它现在的心情：{ key, why } */
  heartState() {
    const h = new Date().getHours();
    if (this.sulkNow && this.sulkNow()) return { key: 'sulk' };
    if (h >= 23 || h < 5) return { key: 'sleepy' };
    const low = this.lowToday();
    if (low) return { key: 'low', why: low.why };
    const f = this.recentFeeling();
    if (f) return { key: 'worried', why: `他说过「${f.t}」` };
    if (this._missOpen && !this.touchedToday()) return { key: 'miss', why: this._missOpen };
    if (this.touchedToday()) return { key: 'happy' };
    return { key: 'calm' };
  },

  /** 点小人的气泡里那一行写的：「有点想你」 */
  heartLabel() {
    const s = this.heartState();
    return (this.cast().heart.mood || {})[s.key] || '';
  },

  /** 给聊天的大模型：它现在什么心情、为什么（想他的时候能说想，但不怪他） */
  heartPrompt() {
    const s = this.heartState();
    const M = { happy: '心情不错，见到他挺开心', miss: '有点想他（' + (s.why || '好久没说话了') + '），见到他很开心——可以说想他，但别怪他没来', worried: '有点担心他（' + (s.why || '') + '），想先问问他怎么样',
      low: '今天自己有点低落（' + (s.why || '') + '），他来陪你说话你会好很多；可以说一两句自己的事，但别把情绪都倒给他', sleepy: '很晚了，有点困，会催他早点睡', calm: '平常心情', sulk: '有点闹小别扭（嘴硬，但一哄就好）' };
    return M[s.key] || '';
  },

  /** 你们离开了多久（这次打开前），给打招呼用 */
  missLine() {
    const away = this._lastAway || 0;
    if (!this.bond || away < 18 * 3600 * 1000 || away > 72 * 3600 * 1000) return '';
    const lv = this.bond().lv;
    const line = this.cast().heart.miss[lv - 1];
    if (!line) return '';
    this._missOpen = `${Math.max(1, Math.round(away / 86400000))} 天没见了`;
    try { localStorage.setItem('tf_miss', getTodayDateString()); } catch (e) {}
    return line;
  },

  /** 想你了之后找个空当：「对了，攒了件事想跟你说」（它的小日子），一天一次 */
  savedTale() {
    if (!this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const today = getTodayDateString();
    let miss = '', told = '';
    try { miss = localStorage.getItem('tf_miss') || ''; told = localStorage.getItem('tf_tale') || ''; } catch (e) {}
    if (miss !== today || told === today || !this.voiceBudget('guide', false)) return false;
    try { localStorage.setItem('tf_tale', today); } catch (e) {}
    this.voiceBudget('guide', true);
    const H = this.cast().heart;
    const tale = H.saved[Math.floor(Math.random() * H.saved.length)];
    return this.askUser(`对了，攒了件事想跟你说：${tale}`, [
      { label: '我也想你', pick: () => { this.buddyMood('love', 2200); this.buddyBang('♥'); }, reply: H.missBack[Math.floor(Math.random() * H.missBack.length)] },
      { label: '哈哈，然后呢', chat: '哈哈，然后呢？' },
      { label: '嗯嗯', reply: '……嗯。今天也一起加油。' }]);
  },

  /** 它今天有点低落：「陪我聊两句？」（Lv3 起，几天一次）。聊 / 摸头都算陪过了 */
  lowDay() {
    const low = this.lowToday();
    if (!low || !this.canChat() || Date.now() - (this._popAt || 0) < 60000 || this.nudgeSaid('low') || !this.voiceBudget('guide', false)) return false;
    this.nudgeMark('low');
    this.voiceBudget('guide', true);
    const L = this.cast().heart.low;
    const text = L.ask.replace('{why}', low.why);
    const comfort = () => { this.setBuddy({ comfort: getTodayDateString() }); };
    this.buddyMood('bad', 2400);
    return this.askUser(text, [
      { label: '怎么了？', pick: comfort, chat: '怎么了？跟我说说' },
      { label: '摸摸头', pick: () => { comfort(); this.bondGain('pat'); this.buddyMood('love', 2200); }, reply: L.pat },
      { label: '我现在有点忙', reply: L.busy }]);
  },

  // ---------- 近况：你说过的最近的事，过几天主动问 ----------

  /** 大模型记下的近况 [{t, d}] → profile.buddy.life [{t, at, due, asked}]，同一件不重复，留最近 12 件 */
  addLife(list) {
    const today = getTodayDateString();
    const cur = Array.isArray((this.profile.buddy || {}).life) ? this.profile.buddy.life.slice() : [];
    (list || []).forEach(x => {
      const t = String(x && x.t || '').trim().slice(0, 16);
      if (!t || cur.some(y => y.t === t)) return;
      const d = Math.max(0, Math.min(14, Math.round(+x.d || 0)));
      cur.push({ t, at: today, due: d ? shiftDateString(today, d) : '', asked: false });
    });
    this.setBuddy({ life: cur.slice(-12) });
  },

  /** 给聊天用的：最近三周说过的事（「周五面试（10月3日说的）」） */
  lifeList() {
    const from = shiftDateString(getTodayDateString(), -21);
    return ((this.profile.buddy || {}).life || []).filter(x => x.at >= from).slice(-6)
      .map(x => `${x.t}（${+x.at.slice(5, 7)}月${+x.at.slice(8)}日说的${x.asked ? '，已经问过他了' : ''}）`);
  },

  /** 到日子该问的那件 */
  lifeDue() {
    const today = getTodayDateString();
    const from = shiftDateString(today, -21);
    return ((this.profile.buddy || {}).life || []).find(x => x.due && x.due <= today && !x.asked && x.at >= from) || null;
  },

  /** 「上次你说的面试怎么样了？」：挺顺利 / 不太顺 / 跟你说说（接着聊，大模型知道在聊这件事）。lead：打招呼时接在后面 */
  lifeFollowUp(lead) {
    const due = this.lifeDue();
    if (!due || this._touring) return false;
    if (!lead && (!this.canChat() || Date.now() - (this._popAt || 0) < 60000 || !this.voiceBudget('guide', false))) return false;
    if (!lead) this.voiceBudget('guide', true);
    const life = (this.profile.buddy.life || []).map(x => (x === due ? Object.assign({}, x, { asked: true }) : x));
    this.setBuddy({ life });
    const L = this.cast().heart.life;
    const name = this.callName();
    const q = L.ask.replace('{t}', due.t);
    const text = `${lead || (name ? name + '，' : '')}${q}`;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    return this.askUser(text, [
      { label: '挺顺利', pick: () => this.buddyMood('good', 2000), reply: pick(L.good) },
      { label: '不太顺', pick: () => this.buddyMood('bad', 2000), reply: pick(L.bad) },
      { label: '跟你说说', talk: true, reply: '嗯，你说，我听着。' }], { thread: true });
  }
});
