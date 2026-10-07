/**
 * 小人能动手（v6.5）：计划本、按大模型 / 本机技能给的动作改软件里的东西，以及计划一次就准（本机校准）。
 *
 * 计划本 profile.planBook：[{ name, auto?, at, workouts: [...], meals: [...], days?: [{ offset, workouts }] }]，跟着备份合并。
 *   你说「把这个计划存起来叫练腿日」、点计划气泡里的「存起来」就存一份；把小人给的计划加到某天时也悄悄存一份（auto，留最近 6 份），
 *   所以「照上次那个练腿的计划」也找得到。以后说「明天练练腿日」就放到那天（本机认得出，不调大模型）。
 * 动作（act，大模型规则 12 / 本机技能 agent_intent.js 给的）：usePlan / addPlan / savePlan / copyDay / movePlan / clearPlan / donePlan /
 *   renamePlan / dropPlan / goal / protein / remind。runActs 照着做，返回提示条上的几行和撤销。
 * 计划一次就准（calibratePlan）：小人给的训练计划，练过的动作按你的成绩定重量和次数（和「下次练多少」一样）；
 *   食谱按那天还剩的热量、还差的蛋白配平（多了少了 12% 以上才动，能按克数、个数改的才改）。用户不用再说「蛋白再多点」。
 */
Object.assign(FitnessApp.prototype, {
  planBook() {
    return Array.isArray(this.profile.planBook) ? this.profile.planBook : [];
  },

  /** 找存好的计划：一模一样 > 不分大小写 > 互相包含（「练腿」也找得到「练腿日」）；auto 的也能按部位找（「上次练腿的」） */
  planBookFind(name) {
    const n = String(name || '').toLowerCase().replace(/\s+|计划$|的$/g, '');
    if (!n) return null;
    const book = this.planBook();
    const k = (e) => e.name.toLowerCase().replace(/\s+/g, '');
    return book.find(e => e.name === name) || book.find(e => k(e) === n) ||
      book.filter(e => !e.auto).find(e => k(e).includes(n) || n.includes(k(e))) ||
      book.filter(e => e.auto).reverse().find(e => k(e).includes(n) || n.includes(k(e).replace(/（.*$/, ''))) || null;
  },

  /**
   * 序列轮着练（v10.1，用户：「序列A 上肢日、序列B 全身复合日」）：存了两份以上自己起名的训练计划时，按最近 21 天的训练记录
   * 认出每份上次是哪天练的（那天做了这份里六成以上的动作，或者至少三个），最久没练的那份就是「轮到」的；从没练过的排最前。
   * 返回 { entry, last: 上次练这份的日期 | '', done: 今天已经练了的那份 | null, others: [{ entry, last }] } 或 null（不到两份）。
   */
  nextSequence() {
    const book = this.planBook().filter(e => !e.auto && (e.workouts || []).length >= 2);
    if (book.length < 2) return null;
    const key = (n) => String(n || '').replace(/^(杠铃|哑铃|器械|史密斯|坐姿|站姿|绳索|俯身|上斜|下斜)/, '').replace(/\s+/g, '');
    const from = shiftDateString(getTodayDateString(), -21);
    const byDate = {};
    this.workouts.filter(w => w.date >= from).forEach(w => { (byDate[w.date] = byDate[w.date] || new Set()).add(key(w.exerciseName)); });
    const dates = Object.keys(byDate).sort().reverse();
    const lastOf = (e) => {
      const want = [...new Set(e.workouts.map(w => key(w.exerciseName)))];
      const d = dates.find(day => { const hit = want.filter(n => byDate[day].has(n)).length; return hit >= 3 || hit >= Math.ceil(want.length * 0.6); });
      return d || '';
    };
    const rows = book.map((e, i) => ({ entry: e, last: lastOf(e), i }));
    const today = getTodayDateString();
    const done = rows.find(r => r.last === today) || null;
    const pool = rows.filter(r => r !== done);
    pool.sort((a, b) => (a.last === b.last ? a.i - b.i : !a.last ? -1 : !b.last ? 1 : a.last < b.last ? -1 : 1));
    return { entry: pool[0].entry, last: pool[0].last, done: done && done.entry, others: rows.filter(r => r.entry !== pool[0].entry) };
  },

  /** 按动作的部位起个名字：练腿 / 胸+肩 / 全身 / 有氧；只有吃的叫「食谱」 */
  planAutoName(entry) {
    const lifts = (entry.workouts || []).concat(...(entry.days || []).map(d => d.workouts || []));
    if (!lifts.length) return '食谱';
    const n = {};
    lifts.forEach(w => { const m = w.muscleGroup || '全身'; n[m] = (n[m] || 0) + 1; });
    const top = Object.entries(n).sort((a, b) => b[1] - a[1]).map(x => x[0].replace(/部$/, ''));
    if ((entry.days || []).length > 1) return `${entry.days.length} 天训练`;
    return top.length === 1 ? (top[0] === '有氧' ? '有氧' : top[0] === '全身' ? '全身' : '练' + top[0]) : top.slice(0, 2).join('+');
  },

  /** 存进计划本。同名的换掉；auto 的只留最近 6 份；一共最多 26 份 */
  savePlanBook(entry, name, auto) {
    const clean = (list) => (list || []).map(x => Object.assign({}, x, { id: undefined, date: undefined, done: undefined, recId: undefined, from: undefined, ts: undefined }));
    const e = { name: '', at: getTodayDateString(), workouts: clean(entry.workouts), meals: clean(entry.meals) };
    if (entry.days && entry.days.length > 1) e.days = entry.days.map(d => ({ offset: d.offset || 0, workouts: clean(d.workouts), meals: clean(d.meals) }));
    if (!e.workouts.length && !e.meals.length && !e.days) return null;
    let base = TF.AgentIntent.cleanName(name) || this.planAutoName(e);
    if (auto) base = `${base}（${+e.at.slice(5, 7)}月${+e.at.slice(8)}日）`;
    e.name = base;
    if (auto) e.auto = true;
    let book = this.planBook().filter(x => x.name !== e.name);
    book.push(e);
    const autos = book.filter(x => x.auto);
    if (autos.length > 6) book = book.filter(x => !x.auto || autos.slice(-6).includes(x));
    this.profile.planBook = book.slice(-26);
    return e;
  },

  /** 把小人给的计划加到某天时：悄悄存一份（以后说「照上次那个练腿的计划」找得到） */
  rememberPlan(days) {
    if (!days || !days.length) return;
    // 已经存过一样的（刚点了「存起来」）就不再悄悄存一份
    const key = (ws, ms) => (ws || []).map(w => w.exerciseName).concat((ms || []).map(m => m.foodSummary)).join('|');
    const k = key([].concat(...days.map(d => d.workouts || [])), [].concat(...days.map(d => d.meals || [])));
    if (this.planBook().some(e => key((e.workouts || []).concat(...(e.days || []).map(d => d.workouts || [])), (e.meals || []).concat(...(e.days || []).map(d => d.meals || []))) === k)) return;
    const entry = days.length > 1
      ? { workouts: [], meals: [], days: days.map(d => ({ offset: Math.round((new Date(d.date + 'T00:00:00') - new Date(days[0].date + 'T00:00:00')) / 86400000), workouts: d.workouts, meals: d.meals })) }
      : { workouts: days[0].workouts, meals: days[0].meals };
    this.savePlanBook(entry, '', true);
  },

  /** 某天的记录 / 计划 → 一份计划（照搬、存起来用） */
  planFromDay(date, what, fromPlans) {
    const src = fromPlans ? (this.plans || []).filter(p => p.date === date) : null;
    const pick = (kind) => (fromPlans ? src.filter(p => p.kind === kind) : (kind === 'meal' ? this.diet : this.workouts).filter(r => r.date === date));
    const lifts = what === 'meals' ? [] : pick('workout').map(w => ({ exerciseName: w.exerciseName, muscleGroup: w.muscleGroup, weightKg: w.weightKg, sets: w.sets, reps: w.reps,
      durationMin: w.durationMin || undefined, burnedCalories: w.burnedCalories, tip: w.tip || undefined }));
    const meals = what === 'workouts' ? [] : pick('meal').map(m => ({ mealType: m.mealType, foodSummary: m.foodSummary, calories: m.calories, proteinG: m.proteinG,
      carbsG: m.carbsG, fatG: m.fatG, items: m.items }));
    return { workouts: lifts, meals };
  },

  /**
   * 把一份计划放到某天（只换掉同类的：放训练不动那天的食谱）；多天的按 offset 往后排。返回放了几条。
   * raw：你自己写的计划第一次放上去（v9.2），照你写的数，不按成绩改
   */
  putPlan(date, entry, raw) {
    const days = entry.days && entry.days.length ? entry.days : [{ offset: 0, workouts: entry.workouts, meals: entry.meals }];
    let n = 0;
    days.forEach(d => {
      const at = shiftDateString(date, d.offset || 0);
      const src = { workouts: d.workouts || [], meals: d.meals || [] };
      const plan = raw ? src : this.calibratePlan(src, at);
      n += this.addPlans(at, Object.assign(plan, { from: Date.now() }), true);
    });
    return n;
  },

  /**
   * 照着动作做。acts：[{ do, … }]，dayOffset / from / to 相对 base（本机技能是今天，大模型是正在看的那天）。
   * 返回 { lines（提示条上的几行）, undo(), jump（放了计划的那天，跳过去看）, ok（做成了几件） }
   */
  runActs(acts, base) {
    base = base || getTodayDateString();
    const lines = [];
    let jump = '', ok = 0;
    const made = []; // 照计划记上的记录（撤销时删掉）
    const snap = { plans: JSON.stringify(this.plans || []), book: JSON.stringify(this.planBook()), goal: this.profile.goalType, deficit: this.profile.targetDeficitKcal,
      protein: this.profile.targetProteinG, touched: this.profile.proteinTouched, reminders: (() => { try { return localStorage.getItem('tf_reminders'); } catch (e) { return null; } })() };
    const at = (n) => shiftDateString(base, Math.round(+n || 0));
    const md = (d) => `${+d.slice(5, 7)}月${+d.slice(8)}日`;
    const dayWord = (d) => (d === getTodayDateString() ? '今天' : d === shiftDateString(getTodayDateString(), 1) ? '明天' : md(d));
    const names = () => this.planBook().filter(e => !e.auto).map(e => `「${e.name}」`).join('、');
    (acts || []).slice(0, 4).forEach(a => {
      if (!a || !a.do) return;
      if (a.do === 'usePlan') {
        const e = this.planBookFind(a.name);
        if (!e) { lines.push(`没找到计划「${a.name || ''}」${names() ? '，存好的有：' + names() : '，先说「把这个计划存起来」'}`); return; }
        const d = at(a.dayOffset == null ? 1 : a.dayOffset);
        const n = this.putPlan(d, e);
        lines.push(`计划 · 「${e.name}」放到${dayWord(d)}（${n} 条，重量按你最近的成绩）`);
        jump = d; ok += 1;
      } else if (a.do === 'addPlan') {
        // 你自己发来的计划（「这是我的序列A上肢日，排到今天」，v9.2）：照你写的放到那天变成待办；给了名字就顺便存进计划本
        const d = at(a.dayOffset || 0);
        const src = { workouts: a.workouts || [], meals: a.meals || [] };
        const e = a.name ? this.savePlanBook(src, a.name) : null;
        const n = this.putPlan(d, src, true);
        if (!n) { lines.push('这份计划里没认出动作和吃的，再发一次试试'); return; }
        lines.push(`计划 · ${e ? `「${e.name}」` : ''}排进${dayWord(d)}的待办（${n} 条，做完点 ✓）`);
        if (e) lines.push(`存好了 · 以后说「${dayWord(d) === '今天' ? '明天' : '今天'}练${TF.AgentIntent.shortName(e.name)}」就行`);
        jump = d; ok += 1;
      } else if (a.do === 'savePlan') {
        let src = null;
        if (a.from === 'inline') src = { workouts: a.workouts || [], meals: a.meals || [] }; // 你自己发来的计划，只存不排
        else if (a.from === 'plan') {
          const last = this._lastAnswer && this._lastAnswer.plan && Date.now() - this._lastAnswer.at < 30 * 60 * 1000 ? this._lastAnswer : null;
          if (last) {
            const p = last.plan;
            src = p.days ? { workouts: [], meals: [], days: p.days.map(x => ({ offset: (x.dayOffset || 0) - (p.days[0].dayOffset || 0), workouts: x.workouts, meals: x.meals })) } : p;
          }
        } else {
          src = this.planFromDay(at(a.dayOffset), a.what || 'all', a.from === 'dayplan');
        }
        const e = src && this.savePlanBook(src, a.name);
        if (!e) { lines.push(a.from === 'plan' ? '刚才没有给过计划，先问「明天练什么」' : `${md(at(a.dayOffset))}没有可以存的`); return; }
        lines.push(`存好了 · 「${e.name}」，以后说「明天练${TF.AgentIntent.shortName(e.name)}」就行`);
        ok += 1;
      } else if (a.do === 'copyDay') {
        const from = at(a.from), to = at(a.to);
        let src = this.planFromDay(from, a.what || 'workouts');
        // 那天没有记录、有计划（「把明天的食谱复制到今天」）：照搬计划
        if (!src.workouts.length && !src.meals.length) src = this.planFromDay(from, a.what || 'workouts', true);
        if (!src.workouts.length && !src.meals.length) { lines.push(`${md(from)}没有${a.what === 'meals' ? '吃的' : '练的'}记录`); return; }
        const n = this.putPlan(to, src);
        lines.push(`计划 · ${md(from)}${a.what === 'meals' ? '吃的' : '练的'}照搬到${dayWord(to)}（${n} 条）`);
        jump = to; ok += 1;
      } else if (a.do === 'movePlan') {
        const from = at(a.from), to = at(a.to);
        const pick = (p) => !a.what || a.what === 'all' || (a.what === 'meals') === (p.kind === 'meal'); // 只挪吃的 / 练的（「把明天的饮食搬到今天」）
        const moving = (this.plans || []).filter(p => p.date === from && !p.done && pick(p));
        if (!moving.length) { lines.push(`${dayWord(from)}没有${a.what === 'meals' ? '吃的' : a.what === 'workouts' ? '练的' : ''}计划可挪`); return; }
        const kinds = new Set(moving.map(p => p.kind));
        this.plans = this.plans.filter(p => !(p.date === to && !p.done && kinds.has(p.kind)));
        moving.forEach(p => { p.date = to; });
        lines.push(`计划 · ${dayWord(from)}${a.what === 'meals' ? '吃的' : a.what === 'workouts' ? '练的' : '的'} ${moving.length} 条挪到${dayWord(to)}`);
        jump = to; ok += 1;
      } else if (a.do === 'donePlan') {
        // 那天的计划都做完了（「上肢日都练完了」「今天的计划都完成了」，v9.2）：一条条照计划记上，吃的加进已吃、练的加进训练消耗
        const d = at(a.dayOffset || 0);
        const todo = (this.plans || []).filter(p => p.date === d && !p.done && (!a.what || a.what === 'all' || (a.what === 'meals') === (p.kind === 'meal')));
        if (!todo.length) { lines.push(`${dayWord(d)}没有还没做的${a.what === 'meals' ? '吃的' : a.what === 'workouts' ? '练的' : ''}计划`); return; }
        let kcal = 0, burn = 0;
        todo.forEach((p, i) => { const rec = this.planToRecord(p, i); made.push(rec.id); if (p.kind === 'meal') kcal += rec.calories || 0; else burn += rec.burnedCalories || 0; });
        lines.push(`计划 · ${dayWord(d)}的 ${todo.length} 条都记上了` + (burn ? `，训练消耗 +${fmt(Math.round(burn))} 千卡` : '') + (kcal ? `，吃了 +${fmt(Math.round(kcal))} 千卡` : ''));
        jump = d; ok += 1;
      } else if (a.do === 'clearPlan') {
        const d = at(a.dayOffset);
        const left = (this.plans || []).filter(p => p.date === d && !p.done && (!a.what || a.what === 'all' || (a.what === 'meals') === (p.kind === 'meal')));
        if (!left.length) { lines.push(`${dayWord(d)}没有计划`); return; }
        this.plans = this.plans.filter(p => !left.includes(p));
        lines.push(`计划 · 清掉了${dayWord(d)}的 ${left.length} 条`);
        ok += 1;
      } else if (a.do === 'renamePlan') {
        const e = this.planBookFind(a.name);
        const to = TF.AgentIntent.cleanName(a.to);
        if (!e || !to) { lines.push(`没找到计划「${a.name || ''}」`); return; }
        this.profile.planBook = this.planBook().filter(x => x === e || x.name !== to);
        lines.push(`改名 · 「${e.name}」→「${to}」`);
        e.name = to; delete e.auto; ok += 1;
      } else if (a.do === 'dropPlan') {
        const e = this.planBookFind(a.name);
        if (!e) { lines.push(`没找到计划「${a.name || ''}」`); return; }
        this.profile.planBook = this.planBook().filter(x => x !== e);
        lines.push(`删掉了计划「${e.name}」`); ok += 1;
      } else if (a.do === 'goal') {
        if (!GOAL_DEFICIT.hasOwnProperty(a.goal) || a.goal === this.profile.goalType) return;
        this.profile.goalType = a.goal;
        this.profile.targetDeficitKcal = GOAL_DEFICIT[a.goal];
        lines.push(`目标 · 改成${{ fat_loss: '减脂', maintain: '保持', muscle_gain: '增肌' }[a.goal]}（每天的热量预算跟着变了）`);
        ok += 1;
      } else if (a.do === 'protein') {
        const g = Math.round(+a.g);
        if (!(g >= 40 && g <= 300)) return;
        this.profile.targetProteinG = g;
        this.profile.proteinTouched = true;
        lines.push(`蛋白目标 · 每天 ${g}g`); ok += 1;
      } else if (a.do === 'remind' && this.loadReminders) {
        const label = { weigh: '早上称体重', lunch: '午饭', dinner: '晚饭', night: '晚上小结' }[a.kind];
        if (!label) return;
        const time = /^\d{1,2}:\d{2}$/.test(a.time || '') ? a.time.padStart(5, '0') : '';
        const list = this.loadReminders().map(r => (r.id === a.kind ? Object.assign(r, { enabled: a.on !== false }, time ? { time } : {}) : r));
        if (this.applyReminders) this.applyReminders(list);
        const r = list.find(x => x.id === a.kind);
        lines.push(a.on === false ? `提醒 · 关掉了${label}提醒` : `提醒 · ${label} ${r.time}${this.hasNotifApi && this.hasNotifApi() ? '' : '（在手机 App 里才会响）'}`);
        ok += 1;
      }
    });
    if (ok) { this.saveData(); this.render(); if (this.renderSettings && this.view === 'settings') this.renderSettings(); }
    const undo = () => {
      if (made.length) { this.diet = this.diet.filter(x => !made.includes(x.id)); this.workouts = this.workouts.filter(x => !made.includes(x.id)); }
      this.plans = JSON.parse(snap.plans);
      this.profile.planBook = JSON.parse(snap.book);
      Object.assign(this.profile, { goalType: snap.goal, targetDeficitKcal: snap.deficit, targetProteinG: snap.protein, proteinTouched: snap.touched });
      try { if (snap.reminders == null) localStorage.removeItem('tf_reminders'); else localStorage.setItem('tf_reminders', snap.reminders); } catch (e) {}
      if (this.applyReminders && this.loadReminders) this.applyReminders(this.loadReminders());
      this.saveData();
      this.render();
    };
    return { lines, undo, jump, ok };
  },

  /** 本机技能：认得出的动手说法直接做（不调大模型）。做了返回 true */
  runSkill(text) {
    const names = this.planBook().map(e => e.name);
    const act = TF.AgentIntent && TF.AgentIntent.matchSkill(text, names, new Date());
    if (!act) return false;
    // 「明天练计划A」但计划本里没有：交给大模型（也许是说「上次那个练腿的」）
    if (act.do === 'usePlan' && !this.planBookFind(act.name)) return false;
    const r = this.runActs([act], getTodayDateString());
    // 没做成（「今天不练了，太累了」但今天没有计划、刚才没给过计划）：当没认出来，照常走（聊天 / 大模型）
    if (!r.ok) return false;
    if (window.QuickLog) window.QuickLog.showUndo('✓ 好了', r.lines, r.undo);
    window.Haptics && window.Haptics.fire('success');
    if (window.Sound) window.Sound.play('success');
    if (r.jump) this.jumpToPlans(r.jump);
    else if (r.ok && !this._touring) this.buddyHop && this.buddyHop();
    return true;
  },

  /** 放了计划：跳到那天，计划一行行落下来 */
  jumpToPlans(date) {
    if (!date) return;
    if (this.view !== 'today' && this.switchView) this.switchView('today');
    this.selectedDate = date;
    this.render();
    if (this.landPlanRows) this.landPlanRows();
    if (!this._touring && this.buddyDo) this.buddyDo([['stand', 100], ['wave', 900], ['stand', 300]]);
  },

  /** 给大模型看的：存好的计划（名字 + 练什么），说到计划、照着练、存起来的时候才带 */
  planBookContext(text) {
    const book = this.planBook();
    const said = String(text || '');
    // 说到计划的那些词，或者直接说了某份计划的名字（「今天练序列A」，v9.2）
    if (!book.length || (!/计划|那套|这套|那个练|存|照着|照搬|上次|之前|老样子|放到|排到|挪|改名|删|待办|todo|序列|课表|清单/i.test(said) &&
        !TF.AgentIntent.findName(said, book.map(e => e.name)))) return [];
    return book.slice(-12).map(e => {
      const lifts = (e.workouts || []).concat(...(e.days || []).map(d => d.workouts || []));
      const what = lifts.length ? lifts.slice(0, 4).map(w => w.exerciseName).join('、') + (lifts.length > 4 ? `等 ${lifts.length} 个` : '')
        : (e.meals || []).map(m => m.mealType.replace('/补剂', '')).join('、');
      return `「${e.name}」${e.days ? `${e.days.length} 天：` : ''}${what}`;
    });
  },

  /**
   * 计划一次就准：练过的动作按你的成绩定重量、次数（和「下次练多少」一样）；食谱按那天还剩的热量、还差的蛋白配平。
   * plan：{ dayOffset?, meals, workouts } 或者 { days: [{ dayOffset, … }] }；base：dayOffset 从哪天算。返回校准过的新计划（不改原来的）。
   */
  calibratePlan(plan, base) {
    if (!plan) return plan;
    base = base || getTodayDateString();
    // 好几天的：一天一天算（dayOffset 相对 base）
    if (plan.days) return Object.assign({}, plan, { days: plan.days.map(d => Object.assign({}, d, this.calibratePlan({ workouts: d.workouts, meals: d.meals }, shiftDateString(base, d.dayOffset || 0)))) });
    const date = shiftDateString(base, plan.dayOffset || 0);
    const out = Object.assign({}, plan);
    const today = getTodayDateString();
    // 训练：按你的成绩（今天已经练过的不动）
    out.workouts = (plan.workouts || []).map(w => {
      const p = !w.durationMin && this.exerciseProgress ? this.exerciseProgress(w.exerciseName) : null;
      if (!p || !p.next || (date === today && p.last.date === today)) return w;
      return Object.assign({}, w, { weightKg: p.next.weightKg, reps: p.next.reps, sets: w.sets || p.last.sets });
    });
    out.meals = this.balanceMeals(plan.meals || [], date, out.workouts);
    return out;
  },

  /**
   * 食谱配平：这几顿该占那天的多少（早 27% / 午 35% / 晚 30% / 加餐 8%，今天已经吃过的那几顿不算），
   * 按还剩的热量、还差的蛋白算出目标；差 12% 以上才改。蛋白多的（肉蛋奶豆、蛋白粉）和别的分开放大缩小，两头都对上。
   */
  balanceMeals(meals, date, lifts) {
    if (!meals.length) return meals;
    const SHARE = { 早餐: 0.27, 午餐: 0.35, 晚餐: 0.3, '加餐/补剂': 0.08 };
    const s = this.getDaySummary(date);
    const today = getTodayDateString();
    const burn = (lifts || []).reduce((t, w) => t + (w.burnedCalories || 0), 0);
    const budget = (s.budget || 0) + (date > today ? burn : 0);
    const eaten = new Set(date === today ? this.diet.filter(d => d.date === date).map(d => d.mealType) : []);
    const open = Object.keys(SHARE).filter(k => !eaten.has(k)).reduce((t, k) => t + SHARE[k], 0) || 1;
    const planned = [...new Set(meals.map(m => m.mealType))].reduce((t, k) => t + (SHARE[k] || 0.1), 0);
    const part = Math.min(1, planned / open);
    const kcalTarget = Math.max(0, budget - (s.intake || 0)) * part;
    const proteinTarget = Math.max(0, (this.gaugeProteinTarget ? this.gaugeProteinTarget() : 0) - (s.protein || 0)) * part;
    const items = [].concat(...meals.map(m => m.items || []));
    const total = items.reduce((t, i) => t + (i.calories || 0), 0);
    const prot = items.reduce((t, i) => t + (i.proteinG || 0), 0);
    if (!total || kcalTarget < 150) return meals;
    const kcalOff = Math.abs(total - kcalTarget) / kcalTarget;
    const protShort = proteinTarget > 10 && prot < proteinTarget * 0.85;
    if (kcalOff < 0.12 && !protShort) return meals;
    // 两组：蛋白多的（蛋白占热量 35% 以上）P、别的 O；kP·P + kO·O = 目标热量，kP·Pp + kO·Op = 目标蛋白
    const dense = (i) => i.calories > 0 && (i.proteinG || 0) * 4 >= i.calories * 0.35;
    const sum = (f, pick) => items.filter(f).reduce((t, i) => t + (i[pick] || 0), 0);
    const P = sum(dense, 'calories'), O = total - P, Pp = sum(dense, 'proteinG'), Op = prot - Pp;
    let kP = kcalTarget / total, kO = kP;
    const det = P * Op - O * Pp;
    if (proteinTarget > 10 && P > 0 && O > 0 && Math.abs(det) > 1) {
      kP = (kcalTarget * Op - O * proteinTarget) / det;
      kO = (P * proteinTarget - kcalTarget * Pp) / det;
    }
    const clamp = (k) => Math.max(0.6, Math.min(1.8, Number.isFinite(k) ? k : 1));
    kP = clamp(kP); kO = clamp(kO);
    // 蔬菜这种热量很低的（每克不到 0.6 千卡）不跟着放大缩小：多吃两倍西兰花也补不上热量
    const light = (i) => i.grams > 0 && (i.calories || 0) / i.grams < 0.6;
    const scaleItem = (i) => {
      if (light(i)) return i;
      const k = dense(i) ? kP : kO;
      if (Math.abs(k - 1) < 0.08) return i;
      const amt = String(i.amount || '');
      let m, ratio = 0, amount = amt;
      if ((m = amt.match(/^(\d+(?:\.\d+)?)\s*(g|克|ml|毫升)/i))) {
        const v = +m[1], step = v >= 100 ? 10 : 5;
        const nv = Math.max(step, Math.round(v * k / step) * step);
        ratio = nv / v; amount = amt.replace(m[0], `${nv}${m[2]}`);
      } else if ((m = amt.match(/^(\d+|[一两二三四五六七八九十])\s*(个|片|根|块|勺|杯|碗|份|盒|袋|瓶|只|颗|根|串)/))) {
        const CN = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
        const v = /\d/.test(m[1]) ? +m[1] : CN[m[1]];
        const nv = Math.max(1, Math.round(v * k));
        if (nv === v) return i;
        ratio = nv / v; amount = amt.replace(m[0], `${nv}${m[2]}`);
      } else return i;
      if (!ratio || ratio === 1) return i;
      const r1 = (x) => Math.round(x * 10) / 10;
      return Object.assign({}, i, { amount, grams: i.grams ? Math.round(i.grams * ratio) : i.grams, calories: Math.round((i.calories || 0) * ratio),
        proteinG: r1((i.proteinG || 0) * ratio), carbsG: r1((i.carbsG || 0) * ratio), fatG: r1((i.fatG || 0) * ratio), _was: i.amount });
    };
    return meals.map(m => {
      const its = (m.items || []).map(scaleItem);
      if (!its.some(i => i._was != null)) return m;
      let summary = m.foodSummary || '';
      // 菜名里的份量跟着改：「鸡胸肉100g」→「鸡胸肉150g」；同样的份量出现好几次（「牛肉100g、红薯150g」改红薯）只改名字后面那个
      its.forEach(i => {
        if (i._was) {
          if (summary.includes(i.name + i._was)) summary = summary.replace(i.name + i._was, i.name + i.amount);
          else if (summary.split(i._was).length === 2) summary = summary.replace(i._was, i.amount);
        }
        delete i._was;
      });
      const t = (k) => Math.round(its.reduce((a, i) => a + (i[k] || 0), 0) * (k === 'calories' ? 1 : 10)) / (k === 'calories' ? 1 : 10);
      return Object.assign({}, m, { items: its, foodSummary: summary, calories: t('calories'), proteinG: t('proteinG'), carbsG: t('carbsG'), fatG: t('fatG') });
    });
  }
});
