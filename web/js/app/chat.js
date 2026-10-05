/**
 * 小人主动找你说话（v4.8）：陪伴类产品留得住人，是因为它记得你、会问你、每天有个小仪式、你做了什么它有反应。
 * 主动说的话共用一个节奏（voiceBudget，tf_voice）。v5.6 起设置里分三档（profile.buddy.talk）：
 * 安静（只说要紧的）/ 正常（一天 8 句以内，默认）/ 话多（一天 14 句以内，逛的时候更常凑过来）。
 *  - 你回来了（离开 3 小时以上）：接一句今天的事（计划还剩几条、蛋白还差多少），熟了以后也会说「回来啦」；
 *  - 接着昨天说：昨晚没睡好，今天问睡好点没；昨天歇着，今天问有劲没；
 *  - 每天第一次打开：打个招呼，接一句昨天的事，再问一句（早上问睡得怎么样，下午问练不练，晚上没记晚饭问吃了没）；
 *  - 头两周慢慢认识你：一天问一个（练多久了、有不吃的吗、有伤吗），答案记进小本本；
 *  - 练完问感受：还能加 / 刚好 / 很吃力，记在那几组上（rpe），下次加重量按这个来。
 * 都是手机自己算的，不调大模型；点的回答都是现成的选项，要说话的选项会让「按住说话」亮一下。
 */
Object.assign(FitnessApp.prototype, {
  /** 小人话多少：quiet 安静 / normal 正常 / more 话多（以前的「主动说话」开关关了就是安静） */
  talkLevel() {
    const b = this.profile.buddy || {};
    return ['quiet', 'normal', 'more'].includes(b.talk) ? b.talk : b.chatty === false ? 'quiet' : 'normal';
  },

  chatty() {
    return this.buddyLook().show && this.talkLevel() !== 'quiet';
  },

  /**
   * 小人主动说话的一个节奏（v5.3，v5.6 分档）：招呼、逛的时候、提醒、小提示一起算：
   *  must   —— 卡住了 / 第一条 / 刚记的份量要问 / 升级了 / 纪念日：随时说，不占次数
   *  guide  —— 打招呼、饭点空着、新手提示、练完问感受、小剧情：正常一天 8 句以内，话多 20 句
   *  remind —— 深夜还吃、晚上蛋白差很多：一样算在里面
   *  chat   —— 逛的时候凑过来说的闲话、猜热量：只在话多档（16 句、隔 1.5 分钟）
   * v6.4 起记完东西的回应（react.js）不算在这里：那是你刚做了事、它在回应你，要每次都有；不该有存在感的是逛的时候的闲话。
   * use=true 记一次；返回现在能不能说。
   */
  voiceBudget(level, use) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_voice') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0, at: 0 };
    const lim = this.talkLevel() === 'more' ? { day: 20, chat: 16, gap: 1.5 } : { day: 8, chat: 0, gap: 2 }; // v6.4 正常档收回到 8 句，逛的时候不凑过来
    const ok = level === 'must' || (level === 'chat' ? c.n < lim.chat && Date.now() - (c.at || 0) > lim.gap * 60000 : c.n < lim.day);
    if (use && ok) {
      if (level !== 'must') c.n += 1;
      c.at = Date.now();
      try { localStorage.setItem('tf_voice', JSON.stringify(c)); } catch (e) {}
    }
    return ok;
  },

  /**
   * 常说的话手机自己接（v7.0）：「晚安」「在吗」「想你了」「你在干嘛」「好累」……用 TA 自己的台词马上回（cast.talk，按亲密度、恋人线），
   * 不等大模型，也不会「很 AI」。正在跟 TA 深聊（刚才在聊）的、说长了的、极简模式，照常走大模型。接上了返回 true。
   */
  localTalk(text) {
    // 刚跟 TA 深聊过（大模型接的，15 分钟内）：接着让大模型聊，别突然换成台词；只是本机台词接过的不算
    if (!TF.Talk || !this.buddyLook().show || this.needsOnboarding || Date.now() - (this._aiChatAt || 0) < 15 * 60 * 1000) return false;
    const key = TF.Talk.intent(text);
    const c = this.cast();
    if (!key || !c.talk) return false;
    let line = key === 'doing' && this.buddyLife && Math.random() < 0.5 ? this.buddyLife() : ''; // 问它在干嘛：一半说它自己的小日子
    if (!line) line = TF.Talk.line(c.talk, key, { lv: this.bond().lv, romance: this.storyData ? this.storyData().romance : undefined, name: this.callName(), used: this._talkUsed || [] });
    if (!line) return false;
    this._talkUsed = (this._talkUsed || []).concat(line).slice(-12);
    const face = { love: '害羞', miss: '害羞', hug: '心动', praise: '害羞', tease: '不服', laugh: '开心', tired: '担心', morning: '开心', back: '开心', hi: '开心', thanks: '害羞' }[key] || '平静';
    if (key === 'tired' && this.noteFeeling) this.noteFeeling(text);
    if (this.showBuddyAnswer) this.showBuddyAnswer(text, line, { chat: true, next: (c.talkNext || {})[key] || ['陪我聊会儿', '嗯'], face });
    return true;
  },

  /** 打招呼、练完问感受这类（guide） */
  chatBudget(use) {
    return this.voiceBudget('guide', use);
  },

  /**
   * 小人问一句，下面几个现成的回答。options: [{ label, reply?, talk?, ask?, pick?() }]
   *  reply —— 小人接着说的话；talk —— 让「按住说话」亮一下（要你自己说）；ask —— 当成你问了这句；pick —— 点了要做的事
   *  chat —— 当成你跟它聊了这句（走聊天，它接着说，v6.3）
   * extra：{ pics: [图鉴里的名字] } —— 在话下面放一排实物照片（饭前帮你挑的、考题，v6.2）
   *        { thread: true } —— 它问的这句和你点的回答算进「刚才在聊」，你接着说话时大模型知道在聊什么（近况追问、低落、剧情，v6.3）
   */
  askUser(text, options, extra) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return false;
    const thread = !!(extra && extra.thread) || options.some(o => o.chat);
    if (thread && this.pushTalk) this.pushTalk('（你先开口的）', text);
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say"></p>` + (extra && extra.pics && this.dexPicsHtml ? this.dexPicsHtml(extra.pics) : '') +
      `<div class="portion-opts chat-opts">${options.map((o, i) => `<button class="portion-opt" type="button" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`;
    this.typeOut(pop.querySelector('.buddy-say'), text);
    pop.querySelectorAll('.portion-opt').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const o = options[+b.dataset.i];
      window.Haptics && window.Haptics.fire('tick');
      pop.querySelectorAll('.portion-opt').forEach(x => x.classList.toggle('on', x === b));
      if (this.bondGain) this.bondGain('answer'); // 回答了它的问题：熟一点
      if (o.pick) o.pick();
      clearTimeout(this._askT);
      if (o.chat && window.QuickLog) { window.QuickLog.submit(o.chat, { ask: true, chat: true }); return; }
      if (o.ask && window.QuickLog) { window.QuickLog.submit(o.ask, { ask: true }); return; }
      if (thread && o.reply && this.pushTalk) this.pushTalk(o.label, o.reply);
      if (o.talk) {
        const talk = document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text');
        if (talk) { talk.classList.add('tour-glow'); setTimeout(() => talk.classList.remove('tour-glow'), 3000); }
      }
      const reply = o.reply || (o.talk ? '按住下面说就行。' : '');
      if (reply) {
        const say = pop.querySelector('.buddy-say');
        this.typeOut(say, reply);
        say.classList.add('reply');
        pop.querySelector('.chat-opts').remove();
        this.positionBuddyPop();
      }
      if (!this._touring) this.buddyDo([['stand', 100], ['wave', 700], ['stand', 300]]);
      this._askT = setTimeout(() => this.closeBuddyPop('chat'), reply ? 2600 : 300);
    }));
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('chat'), 30000);
    return true;
  },

  /** 能不能主动开口：在今天页、看的是今天、没别的气泡、没在录音 / 教程 / 引导 */
  canChat() {
    const pop = document.getElementById('buddy-pop');
    const cmp = document.getElementById('composer');
    const dex = document.getElementById('dex-overlay');
    return this.chatty() && this.view === 'today' && !this._scene && !(dex && !dex.classList.contains('hidden')) && this.selectedDate === getTodayDateString() && !this._touring && !this.needsOnboarding &&
      !(this.quietNow && this.quietNow()) && // 正在练、深夜：安静陪着
      pop && pop.classList.contains('hidden') && !cmp.classList.contains('recording') && !(this.pending || []).some(p => p.status === 'working') &&
      (this.diet.length + this.workouts.length > 0) && this.chatBudget(false);
  },

  /** 昨天的事，接一句（破纪录了、蛋白差很多、吃超了、练了腿） */
  yesterdayLine() {
    const y = shiftDateString(getTodayDateString(), -1);
    const ws = this.workouts.filter(w => w.date === y);
    if (this.dayNote(y).rest && !ws.length) return '昨天歇了一天，今天有劲了吧。';
    for (const w of ws) {
      const fb = this.liftFeedback(w);
      if (fb && fb.includes('新纪录')) return `昨天${w.exerciseName}破纪录了，今天让${(w.muscleGroup || '这块').replace(/部$/, '')}歇歇。`;
    }
    const s = this.getDaySummary(y);
    if (s.hasDiet && !this.isSimple()) {
      const left = Math.round(this.gaugeProteinTarget() - s.protein);
      if (left >= 25) return `昨天蛋白差了 ${left}g，今天早餐加个蛋、一杯奶。`;
    }
    if (s.hasDiet && s.intake > s.budget + 200) return '昨天吃超了点，今天清淡些就回来了。';
    if (ws.some(w => w.muscleGroup === '腿部')) return '昨天练了腿，今天腿酸正常。';
    return '';
  },

  /** 头两周慢慢认识你：没问过、小本本里也没有的，一天问一个 */
  knowQuestion() {
    const today = getTodayDateString();
    const first = this.diet.concat(this.workouts).reduce((m, r) => (r.date < m ? r.date : m), today);
    if (first < shiftDateString(today, -13)) return null;
    let asked;
    try { asked = JSON.parse(localStorage.getItem('tf_know') || '[]'); } catch (e) { asked = []; }
    const memo = this.memoList().join('；');
    const add = (line) => () => { this.updateMemo([line], []); this.saveData(); };
    const qs = [
      { key: 'exp', skip: /新手|练了|健身\d|年|老手/.test(memo) || this.isSimple(), text: '对了，你练健身多久了？', options: [
        { label: '刚开始', pick: add('健身新手'), reply: '好，那我排的都从轻的来，动作先练对。' },
        { label: '半年左右', pick: add('练了半年左右'), reply: '有底子了，重量可以慢慢往上加。' },
        { label: '一年以上', pick: add('练了一年以上'), reply: '老手了，那我按你的成绩排。' }] },
      { key: 'days', skip: /一周|每周|练\d|天练/.test(memo) || this.isSimple(), text: '一周大概能练几天？我排计划按这个来。', options: [
        { label: '2 天', pick: add('一周能练2天'), reply: '好，那我每次排全身的。' },
        { label: '3～4 天', pick: add('一周能练3～4天'), reply: '好，那我分上下肢排。' },
        { label: '5 天以上', pick: add('一周能练5天以上'), reply: '练得勤，那我分部位排。' },
        { label: '说不准', reply: '没事，想练的时候叫我排。' }] },
      { key: 'food', skip: /不吃|过敏|素|忌口|都吃/.test(memo), text: '有什么不吃的吗？我排吃的时候避开。', options: [
        { label: '都吃', pick: add('什么都吃'), reply: '好养活。' },
        { label: '不吃辣', pick: add('不吃辣'), reply: '记住了，不给你排辣的。' },
        { label: '我说一下', talk: true, reply: '按住说，比如「我不吃香菜和羊肉」。' }] },
      { key: 'eat', skip: /外卖|食堂|自己做|做饭|下馆子/.test(memo), text: '平时吃饭多是？我推荐吃的照这个来。', options: [
        { label: '自己做', pick: add('多自己做饭'), reply: '那我推荐的都按家常菜来。' },
        { label: '外卖食堂', pick: add('多吃外卖食堂'), reply: '那我推荐外卖、食堂能买到的。' },
        { label: '都有', reply: '行，两种都给你想着。' }] },
      { key: 'hurt', skip: /伤|疼|痛|不好/.test(memo) || this.isSimple(), text: '有没有哪儿有伤，练的时候要注意？', options: [
        { label: '没有', reply: '那就放开练。' },
        { label: '膝盖', pick: add('膝盖有旧伤'), reply: '记住了，深蹲跳、弓步这类我少排。' },
        { label: '腰', pick: add('腰不太好'), reply: '记住了，硬拉、弯腰的动作我小心排。' },
        { label: '我说一下', talk: true }] }
    ];
    const q = qs.find(x => !x.skip && !asked.includes(x.key));
    if (!q) return null;
    asked.push(q.key);
    try { localStorage.setItem('tf_know', JSON.stringify(asked)); } catch (e) {}
    return q;
  },

  /** 连续几天称了体重（到今天） */
  weighStreak() {
    let n = 0, d = getTodayDateString();
    while (this.weightOn(d)) { n += 1; d = shiftDateString(d, -1); }
    return n;
  },

  /**
   * 早上打卡：称体重了吗？数字先填上次的，− / + 一下、或者点数字直接改，点「记上」就好。
   * 记上以后接着问睡得怎么样（同一个气泡里，不算又打扰一次）。
   */
  askWeight(lead, then) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return false;
    const today = getTodayDateString();
    const before = this.weights.filter(w => w.date < today).sort((a, b) => (a.date > b.date ? 1 : -1)).pop();
    let kg = round1(before ? before.kg : (this.profile.weightKg || 60));
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say">${esc(lead + '称体重了吗？空腹称最准。')}</p>` +
      `<div class="weigh-row"><button class="weigh-step" type="button" data-d="-0.1" aria-label="减 0.1">−</button>` +
      `<input class="weigh-num" type="number" inputmode="decimal" step="0.1" min="25" max="300" value="${kg}" aria-label="体重"><span class="weigh-unit">kg</span>` +
      `<button class="weigh-step" type="button" data-d="0.1" aria-label="加 0.1">+</button></div>` +
      `<div class="portion-opts chat-opts"><button class="portion-opt on" type="button" data-a="save">记上</button><button class="portion-opt" type="button" data-a="skip">今天不称</button></div>`;
    const input = pop.querySelector('.weigh-num');
    pop.querySelectorAll('.weigh-step').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const v = parseFloat(input.value) || kg;
      input.value = round1(v + parseFloat(b.dataset.d));
      window.Haptics && window.Haptics.fire('tick');
    }));
    input.addEventListener('click', (e) => e.stopPropagation());
    pop.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(this._askT);
      window.Haptics && window.Haptics.fire('tick');
      if (b.dataset.a === 'skip') {
        const say = pop.querySelector('.buddy-say');
        say.textContent = '好，明天早上再称。';
        say.classList.add('reply');
        pop.querySelectorAll('.weigh-row, .chat-opts').forEach(x => x.remove());
        this.positionBuddyPop();
        this._askT = setTimeout(() => this.closeBuddyPop('chat'), 2000);
        return;
      }
      const v = round1(parseFloat(input.value));
      if (!(v >= 25 && v <= 300)) { input.focus(); return; }
      this.setWeight(today, v);
      this.render();
      window.Sound && window.Sound.play('success');
      const diff = before ? round1(v - before.kg) : 0;
      const days = before ? Math.round((new Date(today) - new Date(before.date)) / 86400000) : 0;
      const when = days === 1 ? '昨天' : `${+before?.date.slice(5, 7)}月${+before?.date.slice(8)}日`;
      const cmp = !before ? '' : diff < 0 ? `，比${when}轻 ${-diff}kg` : diff > 0 ? `，比${when}重 ${diff}kg` : `，和${when}一样`;
      const streak = this.weighStreak();
      const reply = `记上了，${v}kg${cmp}。${streak >= 2 ? `连续称了 ${streak} 天。` : ''}`;
      if (then) { then(reply); return; }
      const say = pop.querySelector('.buddy-say');
      say.textContent = reply;
      say.classList.add('reply');
      pop.querySelectorAll('.weigh-row, .chat-opts').forEach(x => x.remove());
      this.positionBuddyPop();
      if (!this._touring) this.buddyDo([['stand', 100], ['wave', 700], ['stand', 300]]);
      this._askT = setTimeout(() => this.closeBuddyPop('chat'), 2600);
    }));
    this.positionBuddyPop();
    this.popIn(pop);
    document.getElementById('gauge-pop').classList.add('hidden');
    this.buddyBang('?');
    clearTimeout(this._askT);
    this._askT = setTimeout(() => this.closeBuddyPop('chat'), 45000);
    return true;
  },

  /** 打开 App / 切回来：每天第一次打招呼；还没记过的带你记第一条；饭点空着问一句 */
  greetOrGuide() {
    if (document.body.classList.contains('onboarding') || this._scene) return false; // 还在选谁陪你 / 正在演剧情（v7.0）
    if (Date.now() - (this._recAt || 0) < 15000) return false; // 刚记了东西，小人正在回应，招呼别来抢（v6.4）
    const away = this.awayMs ? this.awayMs() : 0;
    if (away) this._lastAway = away; // 离开了多久：打招呼时说不说「想你」（heart.js）
    // v6.4：饭前帮你挑一顿、图鉴介绍、你回来了、考题这些跟你刚做的事无关的，只在「话多」档说
    const more = this.talkLevel() === 'more';
    // v6.3：深夜的剧情排在「这么晚还没睡」前面；近况追问、小剧情、它低落、攒着的事排在饭点之后；v7.1 新的主线（问你有没有空听）排在小剧情前面
    return (this.bondUpNow && this.bondUpNow()) || (this.anniversary && this.anniversary()) || (this.festivalGreet && this.festivalGreet()) ||
      (this.storyEvent && this.storyEvent('night')) ||
      (this.lateNight && this.lateNight()) || (this.goodNight && this.goodNight()) || (this.sulkGreet && this.sulkGreet()) || this.greetToday() || this.firstGuide() ||
      (more && this.mealPick && this.mealPick()) || this.mealGapNudge() || (more && this.dexIntro && this.dexIntro()) ||
      (this.lifeFollowUp && this.lifeFollowUp()) || (this.mainNudge && this.mainNudge()) || (this.storyEvent && this.storyEvent('open')) || (this.lowDay && this.lowDay()) || (this.savedTale && this.savedTale()) ||
      (more && this.welcomeBack(away)) || (this.askOnce && this.askOnce()) || (this.whisper && this.whisper()) || (more && this.quizNudge && this.quizNudge());
  },

  /** 记几件当天的小事（睡得怎么样、歇不歇），第二天接着问；只留最近 7 天 */
  dayNote(date, patch) {
    let m;
    try { m = JSON.parse(localStorage.getItem('tf_daylog') || '{}'); } catch (e) { m = {}; }
    if (!m || typeof m !== 'object') m = {};
    if (!patch) return m[date] || {};
    m[date] = Object.assign({}, m[date] || {}, patch);
    const keep = Object.keys(m).sort().slice(-7);
    const out = {};
    keep.forEach(k => { out[k] = m[k]; });
    try { localStorage.setItem('tf_daylog', JSON.stringify(out)); } catch (e) {}
    return out[date];
  },

  /** 离开了多久（切到后台 / 关掉 App 的那一刻记在 tf_seen） */
  awayMs() {
    let at = this._hiddenAt || 0;
    // 刚打开 App：上次离开的时间存在 tf_seen 里（只认一次，后面每次都是切回来前刚记的 _hiddenAt）
    if (!at && !this._seenRead) { try { at = +localStorage.getItem('tf_seen') || 0; } catch (e) {} }
    this._seenRead = true;
    this._hiddenAt = 0;
    return at ? Date.now() - at : 0;
  },

  markSeen() {
    this._hiddenAt = Date.now();
    try { localStorage.setItem('tf_seen', String(this._hiddenAt)); } catch (e) {}
  },

  /**
   * 离开 2 小时以上又回来（v6.2 从 3 小时改成 2 小时）：接一句今天的事（计划还剩几条、晚上蛋白还差多少、今天练了啥）；
   * 没什么事的，熟了（Lv3 以上）或者调成「话多」才说一句「回来啦」。一天最多两次。
   */
  welcomeBack(away) {
    if (!(away >= 2 * 3600 * 1000) || !this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_back') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0 };
    if (c.n >= 2) return false;
    const hour = new Date().getHours();
    if (hour < 6) return false;
    const name = this.callName();
    const hi = `回来啦${name ? '，' + name : ''}。`;
    const simple = this.isSimple();
    const todo = this.todoPlans ? this.todoPlans(today) : [];
    const s = this.getDaySummary(today);
    const left = Math.round(this.gaugeProteinTarget() - s.protein);
    const lifts = this.workouts.filter(w => w.date === today && !w.durationMin);
    let say = '', next = [];
    if (todo.length) { say = `${hi}今天的计划还剩 ${todo.length} 条，做完点 ✓ 就记上。`; next = ['给我排明天的']; }
    else if (!simple && hour >= 17 && s.hasDiet && left >= 30) { say = `${hi}蛋白还差 ${left}g，晚饭多吃点肉蛋。`; next = ['晚上吃点啥能补蛋白']; }
    else if (!simple && lifts.length) { say = `${hi}今天练了${(lifts[0].muscleGroup || '').replace(/部$/, '') || lifts[0].exerciseName}，记得多喝水、早点睡。`; next = ['明天练什么']; }
    else if (this.seenLine && this.seenLine(true)) say = hi + this.seenLine();
    else if (this.bond().lv >= 2 || this.talkLevel() === 'more') say = hi + this.buddyLife(); // 你不在的时候它也在过自己的小日子
    if (!say) return false;
    c.n += 1;
    try { localStorage.setItem('tf_back', JSON.stringify(c)); } catch (e) {}
    this.chatBudget(true);
    this.sayTip(say, simple ? next.filter(q => !/练|蛋白/.test(q)) : next);
    return true;
  },

  /** 每天第一次打开：打个招呼 + 接一句昨天的事 + 问一句 */
  greetToday() {
    if (!this.canChat()) return false;
    const today = getTodayDateString();
    let last = '';
    try { last = localStorage.getItem('tf_greet') || ''; } catch (e) {}
    if (last === today) return false;
    const hour = new Date().getHours();
    if (hour < 5) return false;
    const name = this.callName();
    // 离开快一天回来：第一句说想你（v6.3，只在你回来时、开心地说，不怪你没来）
    const miss = this.missLine ? this.missLine() : '';
    const hi = miss || (hour < 11 ? `早${name ? '，' + name : ''}。` : hour < 18 ? `${name ? name + '，' : ''}下午好。` : `${name ? name + '，' : ''}晚上好。`);
    // 接一句昨天的事；昨天的事是挑毛病（蛋白差了、吃超了）而你最近又真做到了点什么，先说做到的（被看见比被纠正更想再来）
    const y0 = this.yesterdayLine();
    const seen = this.seenLine ? this.seenLine(true) : '';
    // 都没有的话，提一件以前的事（「一个月前的今天你说的是…」）
    const fault = !y0 || /差了|吃超/.test(y0);
    // 刚说了想你：别紧跟着挑毛病，只说做到了的，没有就不提
    const yest = seen && fault ? this.seenLine() : miss && fault ? '' : (fault && this.memoryLine && this.memoryLine()) || y0;
    const done = () => { try { localStorage.setItem('tf_greet', today); } catch (e) {} this.chatBudget(true); return true; };
    const st = this.profile.dayState && this.profile.dayState.date === today ? this.profile.dayState : null;
    // 好几天没记了：别让人有负担，从今天接着来；想补的话带你翻到昨天
    const lastDay = this.recordDates().reduce((m, d) => (d < today && d > m ? d : m), '');
    const gap = lastDay ? Math.round((new Date(today + 'T00:00:00') - new Date(lastDay + 'T00:00:00')) / 86400000) : 0;
    if (gap >= 3 && !this.recordDates().includes(today)) {
      const missing = !miss && this.bond && this.bond().lv >= 2 ? '好几天没见，有点想你。' : '';
      this.askUser(`${hi}${missing}有 ${gap - 1} 天没记了，没关系，从今天接着来就行。`, [
        { label: '先补一下昨天', pick: () => { this.selectedDate = shiftDateString(today, -1); this.render(); }, reply: '在这页按住说，就记在昨天。记不清的说个大概就行。', talk: true },
        { label: '从今天开始', reply: '好，吃了啥说一句就行。' }]);
      return done();
    }
    const setSleep = (v) => () => { this.profile.dayState = { date: today, sleep: v }; this.dayNote(today, { sleep: v }); this.saveData(); };
    // 接着昨天说：昨晚没睡好的，今天问「睡好点没」
    const sleepQ = this.dayNote(shiftDateString(today, -1)).sleep === '没睡好' ? '昨晚睡好点了吗？' : '昨晚睡得怎么样？';
    const sleepOptions = [
      { label: '睡得不错', pick: setSleep('睡得好'), reply: '那今天可以练重一点。' },
      { label: '一般', pick: setSleep('睡得一般'), reply: '行，照常来。' },
      { label: '没睡好', pick: setSleep('没睡好'), reply: '那今天练轻点，或者歇一天也行。' }];
    // 早上打卡：先称体重（趋势图要靠它），记上了接着问睡得怎么样
    if (hour < 11 && !this.weightOn(today)) {
      this.askWeight(`${hi}${yest ? yest + '\n' : ''}`, st ? null : (reply) => this.askUser(`${reply}\n${sleepQ}`, sleepOptions));
      return done();
    }
    // 你说过的事到日子了（「上次你说的面试怎么样了」）：今天先问这个
    if (this.lifeDue && this.lifeDue()) { this.lifeFollowUp(`${hi}${yest ? yest + '\n' : ''}`); return done(); }
    // 头两周：认识你的问题
    const know = this.knowQuestion();
    if (know) { this.askUser(`${hi}${yest ? yest + '\n' : ''}${know.text}`, know.options); return done(); }
    if (hour < 11 && !st) {
      this.askUser(`${hi}${yest}\n${sleepQ}`, sleepOptions);
      return done();
    }
    const trainedToday = this.workouts.some(w => w.date === today);
    const lastTrain = this.workouts.reduce((m, w) => (w.date > m ? w.date : m), '');
    if (hour >= 11 && hour < 18 && !trainedToday && !this.isSimple() && lastTrain && lastTrain <= shiftDateString(today, -2)) {
      this.askUser(`${hi}${yest}\n已经 ${Math.round((new Date(today) - new Date(lastTrain)) / 86400000)} 天没练了，今天练不练？`, [
        { label: '练，给我排一下', ask: '给我排今天练啥' },
        { label: '练完了，我说一下', talk: true },
        { label: '今天歇着', pick: () => this.dayNote(today, { rest: true }), reply: '行，歇好了再练，休息也是练的一部分。' }]);
      return done();
    }
    if (hour >= 19 && !this.diet.some(d => d.date === today && d.mealType === '晚餐')) {
      this.nudgeMark('meal:晚餐');
      this.askUser(`${hi}${yest}\n晚饭吃了吗？`, [
        { label: '吃了，我说一下', talk: true },
        { label: '还没', ask: '晚上吃点啥好' },
        { label: '今天不吃了', reply: '偶尔一顿没事，别饿过头就行。' }]);
      return done();
    }
    const todo = this.todoPlans ? this.todoPlans(today) : [];
    if (todo.length) { this.sayTip(`${hi}${yest}${yest ? '\n' : ''}今天的计划有 ${todo.length} 条，做完点 ✓ 就记上。`); return done(); }
    if (yest) { this.sayTip(`${hi}${yest}`); return done(); }
    // 熟了以后，没什么事也打个招呼（刚认识时没事就不打扰）
    if (this.bond && this.bond().lv >= 3) { this.sayTip(hi + (this.buddyLife ? this.buddyLife() : '今天也一起加油。')); return done(); }
    return false;
  },

  /** 练完问一句感受（一天一次）：记在这几组上，下次加重量按这个来 */
  askFeeling(result, batch) {
    const today = getTodayDateString();
    if (!batch || batch.date !== today || !this.canChatNow()) return false;
    const ids = (batch.workoutIds || []).filter(id => { const w = this.workouts.find(x => x.id === id); return w && !w.durationMin && !/估计/.test(w.notes || ''); });
    if (!ids.length) return false;
    let d = '';
    try { d = localStorage.getItem('tf_feel') || ''; } catch (e) {}
    if (d === today) return false;
    try { localStorage.setItem('tf_feel', today); } catch (e) {}
    this.chatBudget(true);
    const setRpe = (v) => () => {
      ids.forEach(id => {
        const w = this.workouts.find(x => x.id === id);
        if (!w) return;
        w.rpe = v;
        // 提示条上「下次试多少」那行跟着改
        const fb = this.liftFeedback(w);
        document.querySelectorAll('#ql-snack-list .ql-snack-line').forEach(el => { if (fb && el.textContent.startsWith(w.exerciseName + '：')) el.textContent = fb; });
      });
      this.saveData();
      this.render();
    };
    return this.askUser('刚才那几组感觉怎么样？', [
      { label: '还能加', pick: setRpe(7), reply: '那下次直接往上加，别客气。' },
      { label: '刚好', pick: setRpe(8), reply: '稳，按计划慢慢加。' },
      { label: '很吃力', pick: setRpe(9.5), reply: '那下次先保持这个重量，练扎实了再加。' }]);
  },

  /** 记完东西接着问（不看「在今天页、没别的气泡」，因为刚记完气泡肯定是空的） */
  canChatNow() {
    return this.chatty() && !this._touring && this.chatBudget(false);
  },

  // ================= 手把手带你用（v5.1）：第一条、饭点空着、卡住了 =================

  /** 让「按住说话」（或打字框）亮一下 */
  glowTalk() {
    const talk = document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text');
    if (!talk) return;
    talk.classList.add('tour-glow');
    setTimeout(() => talk.classList.remove('tour-glow'), 3000);
  },

  /** 现在这顿饭：早餐 / 午餐 / 晚餐，和举例 */
  mealNow(hour) {
    if (hour >= 5 && hour < 10) return { meal: '早餐', word: '早上', eg: '两个包子一杯豆浆' };
    if (hour >= 10 && hour < 15) return { meal: '午餐', word: '中午', eg: '一份黄焖鸡米饭' };
    if (hour >= 17 && hour < 23) return { meal: '晚餐', word: '晚上', eg: '一碗牛肉面加个蛋' };
    return { meal: '', word: '今天', eg: '一碗米饭一个鸡蛋' };
  },

  /** 不知道吃了多少、不想出声、还没吃：几个现成的回答（v6.2 多了「点图片记」：不想说也不想打字，点照片就行） */
  firstOptions(m) {
    return [
      { label: '我说一下', talk: true, reply: `按住下面的按钮，说「${m.eg}」这样就行，说完松手。` },
      { label: '点图片记', pick: () => this.openDex && setTimeout(() => this.openDex({ log: true, date: getTodayDateString(), meal: m.meal || mealSlotByHour(new Date().getHours()) }), 60) },
      { label: '不知道吃了多少', talk: true, reply: '说个大概就行，「一碗」「一盘」「一个拳头大」都行，我按常见的份量算，算不准会问你。' },
      { label: '打字行吗', pick: () => window.QuickLog && window.QuickLog.setMode('text', true), reply: '行，在下面打字，打完点发送。' },
      { label: '还没吃', reply: `那吃完说一句。想吃啥也能问我，比如「${m.word === '今天' ? '' : m.word}吃点啥好」。` }];
  },

  /** 还一条都没记过：别光放个空页面，小人直接问「早上吃了啥？」，带你记第一条（每天一次，教程刚走完也来一次） */
  firstGuide(force) {
    if (!this.chatty() || this._touring || this.needsOnboarding || this.view !== 'today' || this.selectedDate !== getTodayDateString()) return false;
    if (this.diet.length + this.workouts.length > 0 || (this.pending || []).length) return false; // 只记过体重的也带一下
    const pop = document.getElementById('buddy-pop');
    if (!pop || !pop.classList.contains('hidden')) return false;
    const today = getTodayDateString();
    let d = '';
    try { d = localStorage.getItem('tf_first') || ''; } catch (e) {}
    if (d === today && !force) return false;
    try { localStorage.setItem('tf_first', today); } catch (e) {}
    this.voiceBudget('must', true);
    const m = this.mealNow(new Date().getHours());
    const name = this.callName();
    this.askUser(`${name ? name + '，' : ''}${this.weights.length ? '' : '来记第一条吧。'}${m.word}吃了啥？`, this.firstOptions(m));
    return true;
  },

  /**
   * 饭点过了这顿还空着：问一句吃了没（每顿一天一次，算在每天说话的次数里）。
   * v6.2 更省事：这顿有计划 →「照计划吃了」一键记上；这个钟点有常吃的 →「对，老样子」一键记上；不想说话 →「点图片选」。
   */
  mealGapNudge() {
    if (!this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const today = getTodayDateString();
    const now = new Date();
    const t = now.getHours() + now.getMinutes() / 60;
    const slot = t >= 9.5 && t < 11 ? ['早餐', '早饭'] : t >= 13 && t < 16 ? ['午餐', '午饭'] : t >= 19.5 && t < 23 ? ['晚餐', '晚饭'] : null;
    if (!slot || this.diet.some(x => x.date === today && x.mealType === slot[0])) return false;
    const key = 'meal:' + slot[0];
    if (this.nudgeSaid(key)) return false;
    const short = (s) => { const x = String(s || ''); return x.length > 16 ? x.slice(0, 15) + '…' : x; };
    const dex = { label: '点图片选', pick: () => this.openDex && setTimeout(() => this.openDex({ log: true, date: today, meal: slot[0] }), 60) };
    const later = { label: '还没', reply: '吃完说一声。' };
    const plan = (this.todoPlans ? this.todoPlans(today) : []).find(p => p.kind === 'meal' && p.mealType === slot[0]);
    const usual = !plan && this.quickSuggestions ? this.quickSuggestions(slot[0]).find(q => q.kind === 'meal' && q.usual && !q.done && !isSuppOnly(q.src)) : null; // 维生素、鱼油这种补剂不算一顿饭
    if (plan) {
      this.askUser(`${slot[1]}吃了吗？计划的是「${short(plan.foodSummary)}」。`, [
        { label: '照计划吃了', pick: () => this.donePlan(plan.id), reply: '记上了。' },
        { label: '吃了别的', talk: true, reply: '按住说一下吃了啥，量说个大概就行。' }, dex, later]);
    } else if (usual) {
      this.askUser(`${slot[1]}吃了吗？还是老样子「${short(usual.label)}」？`, [
        { label: '对，记上', pick: () => this.quickRepeatKey(usual.key, slot[0]), reply: '记上了。' },
        { label: '吃了别的', talk: true, reply: '按住说一下吃了啥，量说个大概就行。' }, dex, later]);
    } else {
      this.askUser(`${slot[1]}吃了吗？`, [
        { label: '吃了，我说一下', talk: true, reply: '按住说就行，记不清就说个大概，比如「一份盖浇饭」，量我按常见的算。' },
        dex, later, { label: '不吃了', reply: '行，别饿过头就好。' }]);
    }
    this.nudgeMark(key);
    this.chatBudget(true);
    return true;
  },

  /** 卡住了教一句：说了两次都没听清，告诉你可以打字（一天一次） */
  coachVoice() {
    if (!this.chatty() || this._touring || this.tipToday('voice')) return false;
    this.voiceBudget('must', true);
    this.sayTip('没听清。离手机近一点、正常说话就行；不方便出声就点左边的键盘打字，一样能记。');
    return true;
  },

  /** 卡住了教一句：大模型没认出吃了啥，告诉你怎么说好认（一天一次） */
  coachFail(p) {
    if (!this.chatty() || this._touring || this.tipToday('fail')) return false;
    this.voiceBudget('must', true);
    return this.askUser('这句没认出来吃了啥。说成「什么 + 大概多少」最好认，比如「中午一碗牛肉面」。', [
      { label: '改一下字', pick: () => this.editPendingText(p.id) },
      { label: '再说一次', talk: true, pick: () => this.dropPending(p.id) }]);
  },

  /** 这种提示今天说过没有；没说过就记上 */
  tipToday(kind) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_coach') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today || !Array.isArray(c.kinds)) c = { date: today, kinds: [] }; // 和 coachTip 共用 tf_coach
    if (c.kinds.includes('g:' + kind)) return true;
    c.kinds.push('g:' + kind);
    try { localStorage.setItem('tf_coach', JSON.stringify(c)); } catch (e) {}
    return false;
  },

  // ================= 逛的时候凑过来说一句（v5.0） =================
  // 你在今天页发呆、翻以前的日子、上下翻记录、在趋势页看半天，小人有时会凑过来说一句。
  // 每种情况只掷一次骰子（正常 6 成、话多 8 成半），次数和间隔按 voiceBudget 的 chat 那一档，刚说过话的 1 分钟内不说；都是手机自己算的。

  /** 开始留意你在干嘛（启动时调一次） */
  watchBrowse() {
    if (this._browseT) return;
    const act = () => { this._act = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, act, { passive: true, capture: true }));
    let lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      this._scrolled = (this._scrolled || 0) + Math.abs(y - lastY);
      lastY = y;
      act();
    }, { passive: true });
    act();
    this._rolled = {};
    this._browseT = setInterval(() => this.browseTick(), 2000);
  },

  browseTick() {
    // v6.4 用户：「在不应该太有存在感的地方太有存在感了」——逛的时候、发呆的时候凑过来说闲话，只在「话多」档
    if (document.hidden || this.talkLevel() !== 'more') return;
    const now = Date.now();
    const today = getTodayDateString();
    const where = this.view === 'today' ? (this.selectedDate === today ? 'today' : this.selectedDate < today ? 'past:' + this.selectedDate : 'plan') : this.view;
    if (where !== this._where) {
      if (this._where === 'trend') this._trendExtra = null; // 离开趋势页，补的那句收起来
      this._where = where; this._whereAt = now; this._scrolled = 0;
    }
    const idle = now - (this._act || now), stay = now - this._whereAt;
    let kind = null, ep = '';
    if (where === 'trend' && stay > 8000 && idle > 3000) { kind = 'trend'; ep = this._whereAt; }
    else if (where.startsWith('past:') && stay > 4000 && idle > 2500) { kind = 'past'; ep = this._whereAt; }
    else if (where === 'today' && this._scrolled > (window.innerHeight || 700) && idle > 2000) { kind = 'scroll'; ep = this._act; }
    else if (where === 'today' && idle > (this.talkLevel() === 'more' ? 12000 : 20000)) { kind = 'idle'; ep = this._act; } // v6.1：发呆 20 秒就凑过来
    if (!kind || this._rolled[kind] === ep) return;
    this._rolled[kind] = ep; // 这一回只掷一次，没掷中就等你下次动了再说
    if (kind === 'scroll') this._scrolled = 0;
    if (!this.canNudge(kind) || Math.random() >= (this.nudgeOdds == null ? (this.talkLevel() === 'more' ? 0.9 : 0.75) : this.nudgeOdds)) return;
    const n = kind === 'trend' ? this.trendNudge() : kind === 'past' ? this.pastNudge(this.selectedDate) : kind === 'scroll' ? this.scrollNudge() : this.idleNudge();
    if (n) this.nudgeBudget(true, n.key);
  },

  /** 逛的时候凑过来说的闲话（chat 那一档）；key 记下今天说过的（同一句不说两遍） */
  nudgeBudget(use, key) {
    if (!use) return this.voiceBudget('chat');
    if (key) this.nudgeMark(key);
    return this.voiceBudget('chat', true);
  },

  /** 记一下今天问过了（不占次数） */
  nudgeMark(key) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_nudge') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0, at: 0, said: [] };
    c.said.push(key);
    try { localStorage.setItem('tf_nudge', JSON.stringify(c)); } catch (e) {}
  },

  nudgeSaid(key) {
    try { const c = JSON.parse(localStorage.getItem('tf_nudge') || '{}'); return c.date === getTodayDateString() && (c.said || []).includes(key); } catch (e) { return false; }
  },

  /** 现在凑过去合不合适：没在录音、打字、改记录、看别的弹窗，小人那边也没在说话 */
  canNudge(kind) {
    if (!this.chatty() || this._touring || this._scene || this.needsOnboarding || !this.nudgeBudget(false)) return false;
    if (this.quietNow && this.quietNow()) return false; // 正在练、深夜：不凑过来
    if (Date.now() - (this._popAt || 0) < 60000) return false;
    if ((this.pending || []).some(p => p.status === 'working')) return false;
    const shown = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
    if (['edit-overlay', 'share-overlay', 'rec-panel', 'ql-snackbar', 'gauge-pop', 'dex-overlay'].some(shown)) return false;
    const cmp = document.getElementById('composer');
    if (cmp && cmp.classList.contains('recording')) return false;
    const ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return false;
    if (kind === 'trend') return !!document.querySelector('#trend-buddy .coach-buddy');
    return !shown('buddy-pop') && !!document.getElementById('buddy') && !document.getElementById('buddy').classList.contains('hidden');
  },

  /** 翻到以前的某天：那天的事和现在比一比（涨了多少、轻了多少、是不是这两周最好的一天）；那天空着就告诉你能补 */
  pastNudge(date) {
    const today = getTodayDateString();
    const key = 'past:' + date;
    if (date >= today || this.nudgeSaid(key)) return null;
    const simple = this.isSimple();
    const lifts = simple ? [] : this.workouts.filter(w => w.date === date && !w.durationMin && w.weightKg > 0);
    const meals = this.diet.filter(d => d.date === date);
    let text = '', next = ['这周练了几次', '这个月瘦了多少'];
    const pr = lifts.find(w => (this.liftFeedback(w) || '').includes('新纪录'));
    let gain = null;
    lifts.forEach(w => {
      const best = this.workouts.filter(x => x.exerciseName === w.exerciseName && !x.durationMin && x.date > date).reduce((m, x) => Math.max(m, x.weightKg || 0), 0);
      if (best > w.weightKg && (!gain || best - w.weightKg > gain.up)) gain = { w, best, up: best - w.weightKg };
    });
    const wt = this.weightOn(date), latest = this.latestWeight();
    const recent = [];
    for (let i = 0; i < 14; i++) { const d = shiftDateString(today, -i); const s = this.getDaySummary(d); if (s.hasDiet) recent.push({ d, s }); }
    const me = recent.find(x => x.d === date);
    const top = (arr, f) => arr.reduce((m, x) => (!m || f(x) > f(m) ? x : m), null);
    if (gain) text = `这天${gain.w.exerciseName} ${round1(gain.w.weightKg)}kg，现在练到 ${round1(gain.best)}kg 了，涨了 ${round1(gain.up)}kg。`;
    else if (pr) text = `这天${pr.exerciseName}破了纪录，${round1(pr.weightKg)}kg ${pr.sets}×${pr.reps}。`;
    else if (wt && latest && latest.date > date && Math.abs(latest.kg - wt.kg) >= 0.5) {
      const d = round1(latest.kg - wt.kg);
      text = `这天你 ${round1(wt.kg)}kg，现在 ${round1(latest.kg)}kg，${d < 0 ? `轻了 ${-d}` : `重了 ${d}`}kg。`;
    } else if (me && recent.length >= 4 && !simple && top(recent, x => x.s.protein).d === date) {
      const best = top(meals, m => m.proteinG || 0);
      text = `这天蛋白吃了 ${Math.round(me.s.protein)}g，是这两周最多的一天${best ? `，主要靠${String(best.foodSummary).slice(0, 12)}` : ''}。`;
      next = ['还差多少蛋白', '晚上吃点啥能补蛋白'];
    } else if (me && recent.length >= 4 && top(recent, x => x.s.intake).d === date) {
      text = `这天吃了 ${fmt(me.s.intake)} kcal，是这两周吃得最多的一天。`;
      next = ['还能吃多少', '这周练了几次'];
    } else if (!meals.length && !this.workouts.some(w => w.date === date) && date >= shiftDateString(today, -7)) {
      text = '这天还空着。想补的话就在这页按住说，记在这天。';
      next = [];
    }
    if (!text) return null;
    this.sayTip(text, simple ? next.filter(q => !/练|蛋白/.test(q)) : next);
    return { key };
  },

  /** 上下翻今天的记录：今天的热量 / 蛋白主要是哪一顿来的 */
  scrollNudge() {
    const today = getTodayDateString();
    const meals = this.diet.filter(d => d.date === today);
    if (meals.length < 2) return null;
    const s = this.getDaySummary(today);
    const big = meals.reduce((m, x) => (!m || x.calories > m.calories ? x : m), null);
    const pro = meals.reduce((m, x) => (!m || (x.proteinG || 0) > (m.proteinG || 0) ? x : m), null);
    const name = (x) => String(x.foodSummary || '').slice(0, 12);
    const left = Math.round(this.gaugeProteinTarget() - s.protein);
    const cands = [];
    if (s.intake >= 600 && big.calories / s.intake >= 0.35) cands.push({ key: 'scroll:kcal', text: `今天热量大头是${name(big)}，${fmt(big.calories)} kcal，占了 ${Math.round(big.calories / s.intake * 100)}%。`, next: ['还能吃多少', '晚上吃点啥好'] });
    if (!this.isSimple() && (pro.proteinG || 0) >= 15) cands.push({ key: 'scroll:protein', text: `今天蛋白主要靠${name(pro)}，${round1(pro.proteinG)}g。` + (left >= 20 ? `还差 ${left}g，${this.proteinFix(left)}。` : '已经差不多够了。'), next: ['还差多少蛋白', '晚上吃点啥能补蛋白'] });
    const c = cands.filter(x => !this.nudgeSaid(x.key));
    if (!c.length) return null;
    const pick = c[Math.floor(Math.random() * c.length)];
    this.sayTip(pick.text, pick.next);
    return pick;
  },

  /** 今天页上发呆：问一句、给个建议，实在没有就说个有用的小知识 */
  idleNudge() {
    const today = getTodayDateString();
    const hour = new Date().getHours();
    const simple = this.isSimple();
    const s = this.getDaySummary(today);
    const opts = []; // 认识你的问题只在打招呼时问，免得一天问两个
    if (hour >= 17 && hour < 21 && !this.diet.some(d => d.date === today && d.mealType === '晚餐')) {
      const avoid = this.memoList().find(m => /^不吃|过敏|忌口|吃素/.test(m));
      opts.push({ key: 'idle:dinner', ask: [`晚饭想好吃啥了吗？${avoid ? `（记着你${avoid.replace(/^我/, '')}）` : ''}`, [
        { label: '帮我想想', ask: '晚上吃点啥好' },
        { label: '想好了', reply: '吃完说一声就行。' }]] });
    }
    const tomorrow = shiftDateString(today, 1);
    if (!simple && hour >= 20 && !(this.plans || []).some(p => p.date === tomorrow)) {
      opts.push({ key: 'idle:plan', ask: ['明天练啥，要我先排好吗？', [
        { label: '排一下', ask: '给我排明天练啥' },
        { label: '不用', reply: '行，想练了随时叫我。' }]] });
    }
    const tip = !simple && hour < 20 && this.trainingTip ? this.trainingTip() : '';
    if (tip) opts.push({ key: 'idle:train', say: tip + '。', next: ['给我排今天练啥', '这周练了几次'] });
    const obs = this.observation ? this.observation() : '';
    if (obs) opts.push({ key: 'idle:obs', say: obs + '。', next: simple ? ['还能吃多少'] : ['还差多少蛋白', '晚上吃点啥能补蛋白'] });
    const left = Math.round(this.gaugeProteinTarget() - s.protein);
    if (!simple && hour >= 14 && s.hasDiet && left >= 30) opts.push({ key: 'idle:protein', say: `今天蛋白还差 ${left}g。补的话：${this.proteinFix(left)}。`, next: ['晚上吃点啥能补蛋白'] });
    const st = this.buddyState ? this.buddyState() : null;
    if (st && st.streak >= 3) opts.push({ key: 'idle:streak', say: `连续记了 ${st.streak} 天了。${st.next ? `再 ${st.next.days} 天拿${st.next.name}。` : ''}`, next: simple ? ['还能吃多少', '这个月瘦了多少'] : ['这周练了几次', '这个月瘦了多少'] });
    const seen = this.seenLine ? this.seenLine(true) : '';
    if (seen) opts.push({ key: 'idle:seen', seen: true, say: seen, next: [] });
    if (this.bond && this.bond().lv >= 2) opts.push({ key: 'idle:life', say: this.buddyLife(), next: [] });
    const fact = this.buddyFact();
    if (fact) opts.push({ key: 'idle:fact', say: fact, fact: true });
    // 饭前帮你挑一顿、考考你一份多少千卡（v6.1，图鉴那边算）
    if (this.mealPick && !this.nudgeSaid('idle:pick') && this.mealPick(true)) return { key: 'idle:pick' };
    if (this.quizNudge && !this.nudgeSaid('idle:quiz') && Math.random() < 0.5 && this.quizNudge(true)) return { key: 'idle:quiz' };
    // 推荐一样你没吃过的（带照片，「看看」直接打开图鉴那一样，v6.2）
    if (this.dexNudge && !this.nudgeSaid('idle:dex') && Math.random() < 0.4 && this.dexNudge()) return { key: 'idle:dex' };
    // 发呆的时候也是说悄悄话的好时候（两天最多一条）
    if (this.whisper && this.whisper(true)) return { key: 'idle:whisper' };
    // v6.3：你说过的事到日子了、它今天有点低落、攒着想跟你说的事（各自一天一次，次数在各自那边记）
    if (this.lifeFollowUp && this.lifeFollowUp()) return { key: 'idle:life' };
    if (this.lowDay && this.lowDay()) return { key: 'idle:low' };
    if (this.savedTale && this.savedTale()) return { key: 'idle:tale' };
    // 跟你有关的优先，小知识垫底
    const mine = opts.filter(o => !o.fact && !this.nudgeSaid(o.key));
    const pick = mine.length ? mine[Math.floor(Math.random() * mine.length)] : opts.find(o => o.fact && !this.nudgeSaid(o.key));
    if (!pick) return null;
    if (pick.fact) this.useFact(pick.say);
    if (pick.seen) this.seenLine(); // 记下这件事说过了
    if (pick.ask) this.askUser(pick.ask[0], pick.ask[1]);
    else this.sayTip(pick.say, pick.next);
    return pick;
  },

  /** 有用的小知识（没说过的挑一句；说完一轮再从头） */
  BUDDY_FACTS: [
    { t: '蛋黄别扔，一个鸡蛋的蛋白有四成在蛋黄里。' },
    { t: '牛奶 100ml 才 3g 蛋白，一杯也就 8g 左右，补蛋白主要还得靠肉、蛋、豆制品。' },
    { t: '没睡够的第二天更容易饿、更想吃甜的，今晚早点睡也算减脂。' },
    { t: '一碗米饭 200 来 kcal，一杯全糖奶茶常常 300 往上。' },
    { t: '一瓶 500ml 的啤酒大概 200 kcal，喝酒的热量别忘了说一声。' },
    { t: '体重一天能差 1～2kg，多半是水和肚子里的东西，看一周的趋势就行。' },
    { t: '练完不用急着半小时内吃蛋白，一天的总量够了更要紧。', fit: true },
    { t: '同一个重量多做一两个，也是进步，不一定非得加重。', fit: true },
    { t: '减脂时蛋白吃够（每公斤体重 1.6g 左右），掉的才更多是脂肪不是肌肉。', fit: true },
    { t: '深蹲蹲不下去，常常是脚踝太紧，蹲之前拉拉小腿。', fit: true },
    { t: '力量保肌肉，有氧多烧点热量，两样都做比只做一样好。', fit: true },
    { t: '饿得慌的时候先喝杯水、吃点高蛋白的，比硬扛好扛。' }
  ],

  buddyFact() {
    let used;
    try { used = JSON.parse(localStorage.getItem('tf_facts') || '[]'); } catch (e) { used = []; }
    const pool = this.BUDDY_FACTS.filter(f => !(f.fit && this.isSimple()));
    const left = pool.filter(f => !used.includes(f.t));
    const list = left.length ? left : pool;
    return list.length ? list[Math.floor(Math.random() * list.length)].t : '';
  },

  useFact(t) {
    let used;
    try { used = JSON.parse(localStorage.getItem('tf_facts') || '[]'); } catch (e) { used = []; }
    const pool = this.BUDDY_FACTS.filter(f => !(f.fit && this.isSimple())).map(f => f.t);
    used = used.filter(x => pool.includes(x));
    if (pool.every(x => used.includes(x))) used = [];
    used.push(t);
    try { localStorage.setItem('tf_facts', JSON.stringify(used)); } catch (e) {}
  },

  /** 在趋势页看了半天：小人招招手，对话框里多一句（上面那几句没说到的） */
  trendNudge() {
    const n = this.trendDays || 7;
    const key = 'trend:' + n;
    if (this.nudgeSaid(key)) return null;
    const today = getTodayDateString();
    const simple = this.isSimple();
    const range = n === 7 ? '这一周' : `这 ${n} 天`;
    const days = (from, len) => Array.from({ length: len }, (_, i) => shiftDateString(from, -i)).map(d => ({ d, s: this.getDaySummary(d) })).filter(x => x.s.hasDiet);
    const cur = days(today, n), prev = days(shiftDateString(today, -n), n);
    const avg = (arr) => arr.reduce((a, x) => a + x.s.intake, 0) / arr.length;
    const WK = '日一二三四五六';
    const cands = [];
    if (cur.length >= 3 && prev.length >= 3) {
      const d = Math.round(avg(cur) - avg(prev));
      if (Math.abs(d) >= 100) cands.push(`比前${n === 7 ? '一周' : ` ${n} 天`}平均每天${d < 0 ? '少' : '多'}吃 ${fmt(Math.abs(d))} kcal。`);
    }
    if (!simple) {
      const from = shiftDateString(today, -(n - 1));
      const parts = new Set(this.workouts.filter(w => w.date >= from && w.date <= today && w.muscleGroup).map(w => w.muscleGroup));
      const miss = ['胸部', '背部', '腿部', '肩部'].filter(p => !parts.has(p));
      if (parts.size >= 2 && miss.length && miss.length <= 2) cands.push({ t: `${range}${miss.map(p => p.replace(/部$/, '')).join('、')}一次没练，下次可以排上。`, next: [`给我排个练${miss[0].replace(/部$/, '')}的`] });
      if (cur.length >= 3) {
        const best = cur.reduce((m, x) => (!m || x.s.protein > m.s.protein ? x : m), null);
        cands.push(`${range}蛋白吃得最好的是${best.d === today ? '今天' : '周' + WK[new Date(best.d + 'T00:00:00').getDay()]}，${Math.round(best.s.protein)}g。`);
      }
    }
    if (n >= 14 && cur.length >= 8) {
      const we = cur.filter(x => [0, 6].includes(new Date(x.d + 'T00:00:00').getDay())), wd = cur.filter(x => ![0, 6].includes(new Date(x.d + 'T00:00:00').getDay()));
      if (we.length >= 2 && wd.length >= 4) {
        const d = Math.round(avg(we) - avg(wd));
        if (d >= 250) cands.push(`周末比平时平均多吃 ${fmt(d)} kcal，减脂卡住多半在这儿。`);
      }
    }
    if (!cands.length) return null;
    const c = cands[Math.floor(Math.random() * cands.length)];
    this._trendExtra = { days: n, text: typeof c === 'string' ? c : c.t, next: typeof c === 'string' ? [] : c.next || [] };
    this._coachWave = true;
    this._popAt = Date.now();
    this.renderTrendBuddy();
    window.Haptics && window.Haptics.fire('tick');
    clearTimeout(this._coachT);
    this._coachT = setTimeout(() => { this._coachWave = false; if (this.view === 'trend') this.renderTrendBuddy(); }, 1500);
    return { key };
  }
});
