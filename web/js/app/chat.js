/**
 * 小人主动找你说话（v4.8）：陪伴类产品留得住人，是因为它记得你、会问你、每天有个小仪式、你做了什么它有反应。
 * 我们的小人也这样，但不卖萌、不烦人：一次打开最多主动说一次，一天最多三次（tf_chat），设置里能关（profile.buddy.chatty）。
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

  /** 今天还能不能主动说（一天最多三次） */
  chatBudget(use) {
    const today = getTodayDateString();
    let c;
    try { c = JSON.parse(localStorage.getItem('tf_chat') || '{}'); } catch (e) { c = {}; }
    if (c.date !== today) c = { date: today, n: 0 };
    if (!use) return c.n < 3;
    c.n += 1;
    try { localStorage.setItem('tf_chat', JSON.stringify(c)); } catch (e) {}
    return true;
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
      if (o.ask && window.QuickLog) { window.QuickLog.submit(o.ask); return; }
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
      { key: 'food', skip: /不吃|过敏|素|忌口|都吃/.test(memo), text: '有什么不吃的吗？我排吃的时候避开。', options: [
        { label: '都吃', pick: add('什么都吃'), reply: '好养活。' },
        { label: '不吃辣', pick: add('不吃辣'), reply: '记住了，不给你排辣的。' },
        { label: '我说一下', talk: true, reply: '按住说，比如「我不吃香菜和羊肉」。' }] },
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
  }
});
