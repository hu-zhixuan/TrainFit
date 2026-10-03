/**
 * 小人给的计划（「给我定一下明天的食谱」「明天练什么」）：用户在气泡里点「加到明天」，
 * 那天的今天页上就多几条虚线的计划，做到了点 ✓ 就变成真的记录（不用再说一遍），不要了点 ×。
 * 也可以直接说「早餐照计划吃了」，大模型按计划记、把那条计划划掉（donePlans）。
 *
 * 存在 fit_plans：[{ id, date, kind: 'meal' | 'workout', ts, ...和记录一样的字段 }]，跟着备份走。
 */
Object.assign(FitnessApp.prototype, {
  /** 那天的计划（做完的也算在里面，用来算「完成 2/5」；要没做的用 todoPlans） */
  plansFor(date) {
    return (this.plans || []).filter(p => p.date === date)
      .sort((a, b) => (a.kind === b.kind ? (a.kind === 'meal' ? MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType) : 0) || a.ts - b.ts : (a.kind === 'meal' ? -1 : 1)));
  },

  todoPlans(date) { return this.plansFor(date).filter(p => !p.done); },

  /** 把小人给的计划放到那一天（同一天原来的计划换掉，免得改了几次叠在一起） */
  addPlans(date, plan, noSave) {
    const stamp = Date.now();
    const from = plan.from || stamp;
    const meals = (plan.meals || []).map((m, i) => ({
      id: `pl_${stamp}_m${i}`, date, kind: 'meal', ts: stamp + i, from,
      mealType: m.mealType, foodSummary: m.foodSummary, calories: m.calories, proteinG: m.proteinG,
      carbsG: m.carbsG, fatG: m.fatG, items: m.items && m.items.length ? m.items : undefined
    }));
    const lifts = (plan.workouts || []).map((w, i) => ({
      id: `pl_${stamp}_w${i}`, date, kind: 'workout', ts: stamp + 50 + i, from,
      exerciseName: w.exerciseName, muscleGroup: w.muscleGroup, weightKg: w.weightKg, sets: w.sets, reps: w.reps,
      durationMin: w.durationMin || undefined, burnedCalories: w.burnedCalories, tip: w.tip || undefined
    }));
    this.plans = (this.plans || []).filter(p => p.date !== date).concat(meals, lifts);
    if (!noSave) { this.saveData(); this.render(); }
    return meals.length + lifts.length;
  },

  /** 计划做到了：变成记录，可以撤销 */
  donePlan(id) {
    const p = (this.plans || []).find(x => x.id === id);
    if (!p) return;
    const stamp = Date.now();
    let rec;
    if (p.kind === 'meal') {
      rec = { id: 'd_' + stamp, ts: stamp, date: p.date, mealType: p.mealType, foodSummary: p.foodSummary, calories: p.calories,
        proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG, items: p.items, said: '照计划' };
      this.diet.unshift(rec);
    } else {
      rec = { id: 'w_' + stamp, ts: stamp, date: p.date, exerciseName: p.exerciseName, muscleGroup: p.muscleGroup, weightKg: p.weightKg,
        sets: p.sets, reps: p.reps, durationMin: p.durationMin, rpe: 8.0, burnedCalories: p.burnedCalories, notes: '照计划' };
      this.workouts.unshift(rec);
    }
    // 留着、标成做完：「计划」那行的进度条要算「完成 2/5」
    p.done = true;
    p.recId = rec.id;
    this.saveData();
    this.render();
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    const line = p.kind === 'meal' ? `${p.mealType.replace('/补剂', '')} · ${p.foodSummary} ${p.calories} kcal`
      : `训练 · ${p.exerciseName} ${p.durationMin ? p.durationMin + ' 分钟' : (p.weightKg > 0 ? p.weightKg + 'kg' : '自重') + ' ' + p.sets + '×' + p.reps}`;
    const undo = () => {
      const list = p.kind === 'meal' ? this.diet : this.workouts;
      const i = list.findIndex(x => x.id === rec.id);
      if (i !== -1) list.splice(i, 1);
      delete p.done;
      delete p.recId;
      this.saveData();
      this.render();
    };
    const fb = p.kind === 'workout' ? this.liftFeedback(rec) : '';
    if (window.QuickLog && window.QuickLog.showUndo) window.QuickLog.showUndo('✓ 照计划记上了', fb ? [line, fb] : [line], undo);
    // 小人回应这一条：破纪录、吃超了、蛋白够了…；图鉴里没吃过的举着照片说「图鉴点亮」（v6.2 / v6.4）
    if (this.reactRecord) this.reactRecord(null, { date: p.date, dietIds: p.kind === 'meal' ? [rec.id] : [], workoutIds: p.kind === 'meal' ? [] : [rec.id], asks: [] });
  },

  /** 点 ✓：这一行先打勾、划掉、滑走，再变成记录 */
  checkPlan(btn, id) {
    const row = btn.closest('.item.plan');
    window.Haptics && window.Haptics.fire('tick');
    if (!row || this.reducedMotion()) { this.donePlan(id); return; }
    row.classList.add('checking');
    setTimeout(() => this.donePlan(id), 420);
  },

  /** 进度条从上次的位置长到现在的位置 */
  growPlanBar() {
    const bar = document.querySelector('#timeline .plan-bar i[data-to]');
    if (!bar) return;
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = bar.dataset.to + '%'; }));
  },

  dropPlan(id) {
    this.plans = (this.plans || []).filter(x => x.id !== id);
    this.saveData();
    this.render();
  },

  /** 大模型说「早餐照计划吃了」：那几条标成做完（记录大模型已经记了） */
  markPlansDone(ids) {
    (this.plans || []).forEach(p => { if (ids.includes(p.id)) p.done = true; });
  },

  /** 给大模型看的：这天还没做的计划（「早餐照计划吃了」时用） */
  planContext(date) {
    return this.todoPlans(date).map((p, i) => ({
      ref: 'p' + (i + 1), id: p.id,
      text: p.kind === 'meal' ? `${p.mealType} ${p.foodSummary} ${p.calories}kcal 蛋白${p.proteinG || 0}`
        : `训练 ${p.exerciseName} ${p.durationMin ? p.durationMin + '分钟' : (p.weightKg > 0 ? p.weightKg + 'kg' : '自重') + ` ${p.sets}组×${p.reps}次`}`
    }));
  },

  /** 今天页：计划那几行（虚线框、点 ✓ 记上、点 × 不要了） */
  renderPlanRows(date) {
    const all = this.plansFor(date);
    if (!all.length) return '';
    const list = all.filter(p => !p.done);
    const done = all.length - list.length;
    const pct = Math.round(done / all.length * 100);
    // 「计划  完成 2/5」+ 一根进度条；全做完了只留一行
    let html = `<div class="group-head plan-head"><span>计划</span><b>${done ? (list.length ? `完成 ${done}/${all.length}` : `全部完成 ✓`) : '做完点 ✓'}</b></div>` +
      `<div class="plan-bar${list.length ? '' : ' full'}"><i style="width:${this._planPct && this._planPct[date] != null ? this._planPct[date] : pct}%" data-to="${pct}"></i></div>`;
    this._planPct = Object.assign(this._planPct || {}, { [date]: pct });
    if (!list.length) return html;
    html += list.map(p => {
      const meal = p.kind === 'meal';
      const title = meal ? `<span class="tag tag-meal">${esc(p.mealType.replace('/补剂', ''))}</span>${esc(p.foodSummary)}`
        : `<span class="tag ${p.durationMin ? 'tag-cardio' : 'tag-lift'}">${p.durationMin ? '有氧' : '训练'}</span>${esc(p.exerciseName)}`;
      const sub = meal ? [p.calories ? `${fmt(p.calories)} kcal` : '', p.proteinG ? `蛋白 ${round1(p.proteinG)}g` : ''].filter(Boolean).join(' · ')
        : (p.durationMin ? `${p.durationMin} 分钟` : `${p.weightKg > 0 ? p.weightKg + 'kg' : '自重'} · ${p.sets}×${p.reps}`);
      return `
        <div class="item plan" data-plan="${esc(p.id)}">
          <div class="item-icon ${meal ? 'meal' : 'lift'}">${meal ? ICONS.meal : ICONS.lift}</div>
          <div class="item-main">
            <div class="item-title">${title}</div>
            <div class="item-sub">${esc(sub)}</div>${p.tip ? `
            <div class="item-tip">${esc(p.tip)}</div>` : ''}
          </div>
          <div class="plan-acts">
            <button class="plan-drop" type="button" data-act="plan-drop" data-id="${esc(p.id)}" aria-label="不要这条计划">×</button>
            <button class="plan-done" type="button" data-act="plan-done" data-id="${esc(p.id)}" aria-label="做到了，记上">✓</button>
          </div>
        </div>`;
    }).join('');
    return html;
  }
});
