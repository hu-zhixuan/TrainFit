/**
 * 小人主动找你说话（v4.8）：陪伴类产品留得住人，是因为它记得你、会问你、每天有个小仪式、你做了什么它有反应。
 * 我们的小人也这样，但不卖萌、不烦人：主动说的话共用一个节奏（voiceBudget，tf_voice），一天最多 5 句，设置里能关（profile.buddy.chatty）。
 *  - 每天第一次打开：打个招呼，接一句昨天的事，再问一句（早上问睡得怎么样，下午问练不练，晚上没记晚饭问吃了没）；
 *  - 头两周慢慢认识你：一天问一个（练多久了、有不吃的吗、有伤吗），答案记进小本本；
 *  - 练完问感受：还能加 / 刚好 / 很吃力，记在那几组上（rpe），下次加重量按这个来。
 * 都是手机自己算的，不调大模型；点的回答都是现成的选项，要说话的选项会让「按住说话」亮一下。
 */
Object.assign(FitnessApp.prototype, {
  chatty() {
    const look = this.buddyLook();
    return look.show && (this.profile.buddy || {}).chatty !== false;
  },

  /**
   * 小人主动说话的一个节奏（v5.3）：以前招呼、逛的时候、提醒、小提示各管各的次数，加起来一天能冒十几句。现在一起算：
   *  must   —— 卡住了 / 第一条 / 刚记的份量要问：随时说，不占次数
   *  guide  —— 打招呼、饭点空着、新手提示、练完问感受：一天一共 5 句以内
   *  remind —— 破纪录、晚上蛋白差很多、吃超了：一样算在这 5 句里
   *  chat   —— 逛的时候凑过来说的闲话：只在今天还没说满 3 句、离上一句 5 分钟以上时说
   * use=true 记一次；返回现在能不能说。
   */
  voiceBudget(level, use) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_voice') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0, at: 0 };
    const ok = level === 'must' || (level === 'chat' ? c.n < 3 && Date.now() - (c.at || 0) > 5 * 60000 : c.n < 5);
    if (use && ok) {
      if (level !== 'must') c.n += 1;
      c.at = Date.now();
      try { localStorage.setItem('tf_voice', JSON.stringify(c)); } catch (e) {}
    }
    return ok;
  },

  /** 打招呼、练完问感受这类（guide） */
  chatBudget(use) {
    return this.voiceBudget('guide', use);
  },

  /**
   * 小人问一句，下面几个现成的回答。options: [{ label, reply?, talk?, ask?, pick?() }]
   *  reply —— 小人接着说的话；talk —— 让「按住说话」亮一下（要你自己说）；ask —— 当成你问了这句；pick —— 点了要做的事
   */
  askUser(text, options) {
    const pop = document.getElementById('buddy-pop');
    if (!pop || this._touring) return false;
    pop.dataset.mode = 'chat';
    pop.dataset.level = 'none';
    pop.innerHTML = `<p class="buddy-say">${esc(text)}</p>` +
      `<div class="portion-opts chat-opts">${options.map((o, i) => `<button class="portion-opt" type="button" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`;
    pop.querySelectorAll('.portion-opt').forEach(b => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const o = options[+b.dataset.i];
      window.Haptics && window.Haptics.fire('tick');
      pop.querySelectorAll('.portion-opt').forEach(x => x.classList.toggle('on', x === b));
      if (o.pick) o.pick();
      clearTimeout(this._askT);
      if (o.ask && window.QuickLog) { window.QuickLog.submit(o.ask, { ask: true }); return; }
      if (o.talk) {
        const talk = document.querySelector('#voice-row:not(.hidden) .talk-btn') || document.querySelector('#text-row:not(.hidden) .cmp-text');
        if (talk) { talk.classList.add('tour-glow'); setTimeout(() => talk.classList.remove('tour-glow'), 3000); }
      }
      const reply = o.reply || (o.talk ? '按住下面说就行。' : '');
      if (reply) {
        const say = pop.querySelector('.buddy-say');
        say.textContent = reply;
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
    return this.chatty() && this.view === 'today' && this.selectedDate === getTodayDateString() && !this._touring && !this.needsOnboarding &&
      pop && pop.classList.contains('hidden') && !cmp.classList.contains('recording') && !(this.pending || []).some(p => p.status === 'working') &&
      (this.diet.length + this.workouts.length > 0) && this.chatBudget(false);
  },

  /** 昨天的事，接一句（破纪录了、蛋白差很多、吃超了、练了腿） */
  yesterdayLine() {
    const y = shiftDateString(getTodayDateString(), -1);
    const ws = this.workouts.filter(w => w.date === y);
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
    return this.greetToday() || this.firstGuide() || this.mealGapNudge();
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
    const name = this.userName();
    const hi = hour < 11 ? `早${name ? '，' + name : ''}。` : hour < 18 ? `${name ? name + '，' : ''}下午好。` : `${name ? name + '，' : ''}晚上好。`;
    const yest = this.yesterdayLine();
    const done = () => { try { localStorage.setItem('tf_greet', today); } catch (e) {} this.chatBudget(true); return true; };
    const st = this.profile.dayState && this.profile.dayState.date === today ? this.profile.dayState : null;
    // 好几天没记了：别让人有负担，从今天接着来；想补的话带你翻到昨天
    const lastDay = this.recordDates().reduce((m, d) => (d < today && d > m ? d : m), '');
    const gap = lastDay ? Math.round((new Date(today + 'T00:00:00') - new Date(lastDay + 'T00:00:00')) / 86400000) : 0;
    if (gap >= 3 && !this.recordDates().includes(today)) {
      this.askUser(`${hi}有 ${gap - 1} 天没记了，没关系，从今天接着来就行。`, [
        { label: '先补一下昨天', pick: () => { this.selectedDate = shiftDateString(today, -1); this.render(); }, reply: '在这页按住说，就记在昨天。记不清的说个大概就行。', talk: true },
        { label: '从今天开始', reply: '好，吃了啥说一句就行。' }]);
      return done();
    }
    const setSleep = (v) => () => { this.profile.dayState = { date: today, sleep: v }; this.saveData(); };
    const sleepOptions = [
      { label: '睡得不错', pick: setSleep('睡得好'), reply: '那今天可以练重一点。' },
      { label: '一般', pick: setSleep('睡得一般'), reply: '行，照常来。' },
      { label: '没睡好', pick: setSleep('没睡好'), reply: '那今天练轻点，或者歇一天也行。' }];
    // 早上打卡：先称体重（趋势图要靠它），记上了接着问睡得怎么样
    if (hour < 11 && !this.weightOn(today)) {
      this.askWeight(`${hi}${yest ? yest + '\n' : ''}`, st ? null : (reply) => this.askUser(`${reply}\n昨晚睡得怎么样？`, sleepOptions));
      return done();
    }
    // 头两周：认识你的问题
    const know = this.knowQuestion();
    if (know) { this.askUser(`${hi}${yest ? yest + '\n' : ''}${know.text}`, know.options); return done(); }
    if (hour < 11 && !st) {
      this.askUser(`${hi}${yest}\n昨晚睡得怎么样？`, sleepOptions);
      return done();
    }
    const trainedToday = this.workouts.some(w => w.date === today);
    const lastTrain = this.workouts.reduce((m, w) => (w.date > m ? w.date : m), '');
    if (hour >= 11 && hour < 18 && !trainedToday && !this.isSimple() && lastTrain && lastTrain <= shiftDateString(today, -2)) {
      this.askUser(`${hi}${yest}\n已经 ${Math.round((new Date(today) - new Date(lastTrain)) / 86400000)} 天没练了，今天练不练？`, [
        { label: '练，给我排一下', ask: '给我排今天练啥' },
        { label: '练完了，我说一下', talk: true },
        { label: '今天歇着', reply: '行，歇好了再练，休息也是练的一部分。' }]);
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
    if (yest) { this.sayTip(`${hi}${yest}`); return done(); }
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

  /** 不知道吃了多少、不想出声、还没吃：几个现成的回答 */
  firstOptions(m) {
    return [
      { label: '我说一下', talk: true, reply: `按住下面的按钮，说「${m.eg}」这样就行，说完松手。` },
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
    const name = this.userName();
    this.askUser(`${name ? name + '，' : ''}${this.weights.length ? '' : '来记第一条吧。'}${m.word}吃了啥？`, this.firstOptions(m));
    return true;
  },

  /** 饭点过了这顿还空着：问一句吃了没（每顿一天一次，算在「逛的时候」那 4 句里） */
  mealGapNudge() {
    if (!this.canChat() || Date.now() - (this._popAt || 0) < 60000) return false;
    const today = getTodayDateString();
    const now = new Date();
    const t = now.getHours() + now.getMinutes() / 60;
    const slot = t >= 9.5 && t < 11 ? ['早餐', '早饭'] : t >= 13 && t < 16 ? ['午餐', '午饭'] : t >= 19.5 && t < 23 ? ['晚餐', '晚饭'] : null;
    if (!slot || this.diet.some(x => x.date === today && x.mealType === slot[0])) return false;
    const key = 'meal:' + slot[0];
    if (this.nudgeSaid(key)) return false;
    this.askUser(`${slot[1]}吃了吗？`, [
      { label: '吃了，我说一下', talk: true },
      { label: '记不清吃了啥', talk: true, reply: '说个大概就行，比如「一份盖浇饭」，量我按常见的算，不准再改。' },
      { label: '还没', reply: '吃完说一声。' },
      { label: '不吃了', reply: '行，别饿过头就好。' }]);
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
  // 每种情况只掷一次骰子（6 成），一天最多 4 句、两句之间隔 4 分钟，刚说过话的 1 分钟内不说；都是手机自己算的。

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
    if (document.hidden) return;
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
    else if (where === 'today' && idle > 30000) { kind = 'idle'; ep = this._act; }
    if (!kind || this._rolled[kind] === ep) return;
    this._rolled[kind] = ep; // 这一回只掷一次，没掷中就等你下次动了再说
    if (kind === 'scroll') this._scrolled = 0;
    if (!this.canNudge(kind) || Math.random() >= (this.nudgeOdds == null ? 0.6 : this.nudgeOdds)) return;
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
    if (!this.chatty() || this._touring || this.needsOnboarding || !this.nudgeBudget(false)) return false;
    if (Date.now() - (this._popAt || 0) < 60000) return false;
    if ((this.pending || []).some(p => p.status === 'working')) return false;
    const shown = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
    if (['edit-overlay', 'share-overlay', 'rec-panel', 'ql-snackbar', 'gauge-pop'].some(shown)) return false;
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
      opts.push({ key: 'idle:dinner', ask: ['晚饭想好吃啥了吗？', [
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
    const fact = this.buddyFact();
    if (fact) opts.push({ key: 'idle:fact', say: fact, fact: true });
    // 跟你有关的优先，小知识垫底
    const mine = opts.filter(o => !o.fact && !this.nudgeSaid(o.key));
    const pick = mine.length ? mine[Math.floor(Math.random() * mine.length)] : opts.find(o => o.fact && !this.nudgeSaid(o.key));
    if (!pick) return null;
    if (pick.fact) this.useFact(pick.say);
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
