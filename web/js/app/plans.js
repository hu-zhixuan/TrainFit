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

  /** 把小人给的计划放到那一天（同一天原来同类的计划换掉，免得改了几次叠在一起；v6.5 起只换同类：放训练不动那天的食谱） */
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
    const kinds = new Set([meals.length ? 'meal' : '', lifts.length ? 'workout' : ''].filter(Boolean));
    this.plans = (this.plans || []).filter(p => p.date !== date || p.done || !kinds.has(p.kind)).concat(meals, lifts);
    if (!noSave) { this.saveData(); this.render(); }
    return meals.length + lifts.length;
  },

  /**
   * 一行计划 → 一条记录（吃的算进「已吃」，练的算进「训练消耗」），计划留着标成做完（「完成 2/5」要算）。返回那条记录。
   * 练的没有消耗数的（老计划）按时间现算（v9.2，用户：「点一下完成，运动消耗的卡路里就加上去」）。
   */
  planToRecord(p, n) {
    const stamp = Date.now() + (n || 0);
    let rec;
    if (p.kind === 'meal') {
      rec = { id: 'd_' + stamp, ts: stamp, date: p.date, mealType: p.mealType, foodSummary: p.foodSummary, calories: p.calories,
        proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG, items: p.items, said: '照计划' };
      this.diet.unshift(rec);
    } else {
      const lw = this.latestWeight ? this.latestWeight() : null;
      const burn = p.burnedCalories > 0 ? p.burnedCalories
        : p.durationMin ? TF.metBurn(TF.exerciseInfo(p.exerciseName).met, p.durationMin, lw && lw.kg) : TF.strengthBurn(p.exerciseName, p.weightKg, p.sets, p.reps, lw && lw.kg);
      rec = { id: 'w_' + stamp, ts: stamp, date: p.date, exerciseName: p.exerciseName, muscleGroup: p.muscleGroup, weightKg: p.weightKg,
        sets: p.sets, reps: p.reps, durationMin: p.durationMin, rpe: 8.0, burnedCalories: burn, notes: '照计划' };
      this.workouts.unshift(rec);
    }
    p.done = true;
    p.recId = rec.id;
    return rec;
  },

  /** 计划做到了：变成记录，可以撤销 */
  donePlan(id) {
    const p = (this.plans || []).find(x => x.id === id);
    if (!p) return;
    const rec = this.planToRecord(p);
    this.saveData();
    this.render();
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    const line = p.kind === 'meal' ? `${p.mealType.replace('/补剂', '')} · ${p.foodSummary} ${p.calories} kcal`
      : `训练 · ${p.exerciseName} ${p.durationMin ? p.durationMin + ' 分钟' : (p.weightKg > 0 ? p.weightKg + 'kg' : '自重') + ' ' + p.sets + '×' + p.reps} · 消耗 ${rec.burnedCalories} kcal`;
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

  /** 不要这条计划（点 × 或者修改面板里「不要这条」）：能撤销 */
  dropPlan(id) {
    const i = (this.plans || []).findIndex(x => x.id === id);
    if (i === -1) return;
    const [p] = this.plans.splice(i, 1);
    this.saveData();
    this.render();
    window.Haptics && window.Haptics.fire('tap');
    const name = p.kind === 'meal' ? `${(p.mealType || '').replace('/补剂', '')} ${p.foodSummary}` : p.exerciseName;
    if (window.QuickLog && window.QuickLog.showUndo) window.QuickLog.showUndo('去掉了这条计划', [name], () => { this.plans.splice(Math.min(i, this.plans.length), 0, p); this.saveData(); this.render(); });
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

  /** 今天页：计划的进度（「计划  完成 2/5」+ 一根进度条）；每一行放进那顿 / 训练的卡里（v7.1，renderPlanRow） */
  renderPlanHead(date) {
    const all = this.plansFor(date);
    if (!all.length) return '';
    const left = all.filter(p => !p.done).length;
    const done = all.length - left;
    const pct = Math.round(done / all.length * 100);
    // 按成绩能往上加的（你自己写的计划第一次照抄，练过的动作这里推荐一下）：一点就全按成绩改（v12.9）
    const sug = Object.keys(this.planSuggest(date)).length;
    const html = `<div class="group-head plan-head"><span>计划</span>${sug ? `<button type="button" class="plan-up" data-act="plan-overload" data-id="${esc(date)}">按成绩调 ${sug} 个</button>` : ''}` +
      `<b>${done ? (left ? `完成 ${done}/${all.length}` : `全部完成 ✓`) : '点一行能改，做完点 ✓'}</b></div>` +
      `<div class="plan-bar${left ? '' : ' full'}"><i style="width:${this._planPct && this._planPct[date] != null ? this._planPct[date] : pct}%" data-to="${pct}"></i></div>`;
    this._planPct = Object.assign(this._planPct || {}, { [date]: pct });
    return html;
  },

  /**
   * 一行计划（虚线、点 ✓ 记上、点 × 不要了、点别处打开修改面板）；inGroup：放在那顿的卡里，不再写是哪顿。
   * 练过的动作按成绩能往上加的，下面写「按成绩 62.5kg · 4×8」；drag：这天还没做的训练有两个以上，左边有个把手能拖着排顺序（v12.9）
   */
  renderPlanRow(p, inGroup, drag) {
    const meal = p.kind === 'meal';
    const tag = meal ? (inGroup ? '<span class="tag tag-plan">计划</span>' : `<span class="tag tag-meal">${esc(p.mealType.replace('/补剂', ''))}</span>`)
      : `<span class="tag ${TF.workoutTag(p).cls}">${TF.workoutTag(p).label}</span>${inGroup ? '<span class="tag tag-plan">计划</span>' : ''}`;
    const title = tag + esc(meal ? p.foodSummary : p.exerciseName);
    const sub = meal ? [p.calories ? `${fmt(p.calories)} kcal` : '', p.proteinG ? `蛋白 ${round1(p.proteinG)}g` : ''].filter(Boolean).join(' · ')
      : (p.durationMin ? `${p.durationMin} 分钟` : `${p.weightKg > 0 ? p.weightKg + 'kg' : '自重'} · ${p.sets}×${p.reps}`) + (p.burnedCalories > 0 ? ` · 约 ${fmt(p.burnedCalories)} kcal` : ''); // 点 ✓ 以后加进训练消耗的数
    const sg = !meal && this.planSuggest(p.date)[p.id];
    const hint = sg ? ` · <span class="up">${sg.up ? '↑ ' : ''}按成绩 ${sg.weightKg > 0 ? round1(sg.weightKg) + 'kg' : '自重'} · ${sg.sets}×${sg.reps}</span>` : '';
    return `
        <div class="item plan${inGroup ? ' in-group' : ''}${drag ? ' can-drag' : ''}" data-plan="${esc(p.id)}" data-kind="plan" data-id="${esc(p.id)}">${drag ? `
          <span class="plan-grip" aria-label="按住拖动，排顺序" role="button"><i></i><i></i><i></i></span>` : ''}
          <div class="item-icon ${meal ? 'meal' : 'lift'}">${meal ? ICONS.meal : ICONS.lift}</div>
          <div class="item-main">
            <div class="item-title">${title}</div>
            <div class="item-sub">${esc(sub)}${hint}</div>${p.tip ? `
            <div class="item-tip">${esc(p.tip)}</div>` : ''}
          </div>
          <div class="plan-acts">
            <button class="plan-drop" type="button" data-act="plan-drop" data-id="${esc(p.id)}" aria-label="不要这条计划">×</button>
            <button class="plan-done" type="button" data-act="plan-done" data-id="${esc(p.id)}" aria-label="做到了，记上">✓</button>
          </div>
        </div>`;
  },

  /**
   * 这天还没做的训练计划，按你的成绩该练多少（和 calibratePlan、「下次练多少」一样）：和计划上写的不一样的才给。
   * { 计划 id: { weightKg, sets, reps, tip?, up（比计划上的重 / 多）, why } }；以前的日子、没练过的动作没有。
   */
  planSuggest(date) {
    if (!date || date < getTodayDateString() || !this.calibratePlan) return {};
    const rows = this.plansFor(date).filter(p => !p.done && p.kind !== 'meal' && !p.durationMin);
    if (!rows.length) return {};
    // 一次画今天页要问好几遍（头上一次、每行一次）：计划和记录没变就用上次算的
    const key = date + '|' + rows.map(p => `${p.id}:${p.exerciseName}:${p.weightKg}:${p.sets}:${p.reps}`).join(',') + '|' +
      this.workouts.length + ':' + this.workouts.reduce((t, w) => t + (w.weightKg || 0) * (w.sets || 0) * (w.reps || 0) + (w.rpe || 0), 0) + '|' + (this.profile && this.profile.goalType);
    if (this._sug && this._sug.key === key) return this._sug.val;
    const cal = this.calibratePlan({ workouts: rows }, date, {});
    const out = {};
    rows.forEach((p, i) => {
      const w = cal.workouts[i];
      if (!w || (w.weightKg === p.weightKg && w.sets === p.sets && w.reps === p.reps)) return;
      const prog = this.exerciseProgress(p.exerciseName, { date });
      const up = w.weightKg > (p.weightKg || 0) || (w.weightKg === (p.weightKg || 0) && (w.reps > p.reps || w.sets > p.sets));
      out[p.id] = { weightKg: w.weightKg, sets: w.sets, reps: w.reps, tip: w.tip !== p.tip ? w.tip : undefined, up, why: prog && prog.next ? prog.next.why || prog.next.text : '' };
    });
    this._sug = { key, val: out };
    return out;
  },

  /** 「加点重量」但按成绩不该加（或者没练过）：往上加一档（重量按器械一档、自重多做一两个、有氧多 5 分钟） */
  planHeavier(p) {
    if (p.durationMin) return { durationMin: p.durationMin + 5 };
    if (!(p.weightKg > 0)) return { reps: p.reps + (p.reps >= 12 ? 2 : 1) };
    const used = this.workouts.filter(w => w.exerciseName === p.exerciseName && w.weightKg > 0).map(w => w.weightKg);
    const inc = TF.Overload.incOf(TF.Overload.profileOf(p.exerciseName).eq, used.concat(p.weightKg));
    return { weightKg: Math.round((p.weightKg + inc) * 100) / 100 };
  },

  /** 「轻一点」：重量退一成（按器械一档取整，至少一档）；自重少做两成；有氧少两成时间 */
  planLighter(p) {
    if (p.durationMin) return { durationMin: Math.max(5, Math.round(p.durationMin * 0.8)) };
    if (p.weightKg > 0) {
      const used = this.workouts.filter(w => w.exerciseName === p.exerciseName && w.weightKg > 0).map(w => w.weightKg);
      const inc = TF.Overload.incOf(TF.Overload.profileOf(p.exerciseName).eq, used.concat(p.weightKg));
      let w = Math.floor(p.weightKg * 0.9 / inc) * inc;
      if (w >= p.weightKg) w = p.weightKg - inc;
      if (w > 0) return { weightKg: Math.round(w * 100) / 100 };
    }
    return p.reps > 1 ? { reps: Math.max(1, Math.round(p.reps * 0.8)) } : null;
  },

  /**
   * 改这天计划里的一行（v12.9，用户：「计划不能很方便地改，语音也不行；口喷做渐进超负荷、拖动排顺序、撤回打勾」）。
   * 本机技能（agent_intent 的 matchPlanEdit）、大模型规则 12 的 editPlan、「按成绩调」按钮、拖动都走这里。
   * a：{ id, set | drop | done | undone | move（first / last / before / after / swap / to）+ target / index | overload（true / 'up'）| lighter
   *      | workouts / meals（大模型给的整项，换掉这一行）}；没有 id、带着 workouts / meals 的是新加；{ all, overload | lighter, dayOffset } 是这天所有训练。
   * bag：{ made: [记上的记录 id], removed: [{ kind, rec, idx }] }，撤销用。返回 { lines, date, ok }
   */
  applyPlanEdit(a, base, bag) {
    bag = bag || { made: [], removed: [] };
    const plans = this.plans || (this.plans = []);
    const p = a.id ? plans.find(x => x.id === a.id) : null;
    if (a.id && !p) return { lines: ['这条计划已经不在了'], ok: false };
    const date = p ? p.date : shiftDateString(base || getTodayDateString(), Math.round(+a.dayOffset || 0));
    const lw = this.latestWeight ? this.latestWeight() : null;
    const name = (x) => (x.kind === 'meal' ? `${(x.mealType || '').replace('/补剂', '')}「${x.foodSummary}」` : `「${x.exerciseName}」`);
    const val = (x) => (x.kind === 'meal' ? `${fmt(x.calories || 0)} kcal` : x.durationMin ? `${x.durationMin} 分钟` : `${x.weightKg > 0 ? round1(x.weightKg) + 'kg' : '自重'} ${x.sets}×${x.reps}`);
    const reburn = (x) => {
      if (x.kind === 'meal') return;
      x.burnedCalories = x.durationMin ? TF.metBurn(TF.exerciseInfo(x.exerciseName).met, x.durationMin, lw && lw.kg) : TF.strengthBurn(x.exerciseName, x.weightKg, x.sets, x.reps, lw && lw.kg);
    };
    const change = (x, next, why) => {
      if (!next) return '';
      const before = val(x), was = x.exerciseName;
      Object.keys(next).forEach(k => { if (next[k] === undefined) delete x[k]; else x[k] = next[k]; });
      reburn(x);
      const head = x.kind === 'meal' ? name(x) : was !== x.exerciseName ? `${was} → ${x.exerciseName}` : x.exerciseName;
      return before === val(x) && was === x.exerciseName ? '' : `计划 · ${head} ${before === val(x) ? val(x) : `${before} → ${val(x)}`}${why ? `（${why}）` : ''}`;
    };
    const fromSug = (g) => Object.assign({ weightKg: g.weightKg, sets: g.sets, reps: g.reps }, g.tip ? { tip: g.tip } : {});
    const lifts = () => this.plansFor(date).filter(x => x.kind !== 'meal');
    const done = (lines) => ({ lines, date, ok: true });
    const no = (line) => ({ lines: [line], date, ok: false });

    if (a.all) {
      const todo = lifts().filter(x => !x.done);
      if (!todo.length) return no('这天没有还没做的训练计划');
      const sug = a.overload ? this.planSuggest(date) : {};
      const lines = todo.map(x => (a.overload ? (sug[x.id] ? change(x, fromSug(sug[x.id])) : '') : change(x, this.planLighter(x)))).filter(Boolean);
      if (!lines.length) return no(a.overload ? '计划已经是按你的成绩排的了' : '没有能再轻的了');
      return done(lines.length > 4 ? lines.slice(0, 3).concat(`…一共改了 ${lines.length} 个`) : lines);
    }
    // 新加一项（大模型给的：「再加一个侧平举」）：放在这天同类计划的最后
    if (!p) {
      const add = (a.workouts || []).map(w => Object.assign({ kind: 'workout' }, w)).concat((a.meals || []).map(m => Object.assign({ kind: 'meal' }, m)));
      if (!add.length) return no('没认出要加什么');
      let ts = Math.max(Date.now(), ...plans.filter(x => x.date === date).map(x => x.ts || 0));
      const lines = add.map((x, i) => {
        const row = Object.assign({ id: `pl_${Date.now()}_a${i}`, date, ts: ++ts, from: Date.now() }, this.planFields(x));
        reburn(row);
        plans.push(row);
        return `计划 · 加了${name(row)} ${val(row)}`;
      });
      return done(lines);
    }
    if (a.undone) {
      if (!p.done) return no(`${name(p)}还没打勾`);
      const list = p.kind === 'meal' ? this.diet : this.workouts;
      const idx = list.findIndex(r => r.id === p.recId);
      if (idx !== -1) bag.removed.push({ kind: p.kind, rec: list.splice(idx, 1)[0], idx });
      delete p.done;
      delete p.recId;
      return done([`撤回 · ${name(p)}变回计划，还没做`]);
    }
    if (p.done) return no(`${name(p)}已经打过勾了，说「${p.kind === 'meal' ? '撤回' : '撤回' + p.exerciseName}」能撤回`);
    if (a.drop) {
      plans.splice(plans.indexOf(p), 1);
      return done([`计划 · 去掉了${name(p)}`]);
    }
    if (a.done) {
      const rec = this.planToRecord(p);
      bag.made.push(rec.id);
      return done([`计划 ✓ · ${name(p)} ${val(p)}` + (p.kind === 'meal' ? '' : ` · 消耗 ${fmt(rec.burnedCalories || 0)} kcal`)]);
    }
    if (a.move) {
      if (p.kind === 'meal') return no('吃的按顿排，不用挪顺序');
      const all = lifts();
      const order = all.filter(x => !x.done);
      const from = order.indexOf(p);
      const tgt = a.target ? order.find(x => x.id === a.target) : null;
      if ((a.move === 'before' || a.move === 'after' || a.move === 'swap') && !tgt) return no('没找到要挨着的那个动作');
      if (a.move === 'swap') { const j = order.indexOf(tgt); order[from] = tgt; order[j] = p; } else {
        order.splice(from, 1);
        const to = a.move === 'first' ? 0 : a.move === 'last' ? order.length : a.move === 'to' ? Math.max(0, Math.min(order.length, Math.round(+a.index || 0)))
          : order.indexOf(tgt) + (a.move === 'after' ? 1 : 0);
        order.splice(to, 0, p);
      }
      if (order.indexOf(p) === from) return no(`${name(p)}本来就在那儿`);
      const ts0 = Math.min(...all.map(x => x.ts || 0));
      all.filter(x => x.done).concat(order).forEach((x, i) => { x.ts = ts0 + i; });
      const where = a.move === 'first' || (a.move === 'to' && order.indexOf(p) === 0) ? '挪到第一个' : a.move === 'last' ? '挪到最后' : a.move === 'swap' ? `和${name(tgt)}换了顺序`
        : a.move === 'to' ? `挪到第 ${order.indexOf(p) + 1} 个` : `挪到${name(tgt)}${a.move === 'after' ? '后面' : '前面'}`;
      return done([`计划 · ${name(p)}${where}`]);
    }
    if (a.overload) {
      if (p.kind === 'meal') return no('吃的计划不用加重量');
      const g = this.planSuggest(date)[p.id];
      if (a.overload === 'up') {
        const line = g && g.up ? change(p, fromSug(g), '按你的成绩') : change(p, this.planHeavier(p), '往上加一档');
        return line ? done([line]) : no(`${name(p)}没法再加了`);
      }
      if (!g) return no(this.exerciseProgress(p.exerciseName) ? `${name(p)}已经是按你的成绩排的了` : `还没练过${name(p)}，练完记一次，下次按成绩给你加`);
      return done([change(p, fromSug(g), g.up ? '按你的成绩' : '按成绩先退一步')]);
    }
    if (a.lighter) {
      const line = change(p, this.planLighter(p), '轻一点');
      return line ? done([line]) : no(`${name(p)}没法再轻了`);
    }
    // 大模型给的整项：换掉这一行（id、日子、顺序不变）
    const whole = p.kind === 'meal' ? (a.meals || [])[0] : (a.workouts || [])[0];
    if (whole) {
      const next = this.planFields(Object.assign({ kind: p.kind }, whole));
      if (p.kind !== 'meal' && next.tip === undefined && next.exerciseName === p.exerciseName) next.tip = p.tip;
      const line = change(p, next);
      return line ? done([line]) : { lines: [], date, ok: false }; // 大模型把没让改的也照抄了一遍：不吭声
    }
    // 改几个数 / 换个动作
    const s = a.set || {};
    const next = {};
    if (p.kind === 'meal') return no('吃的计划点开改');
    if (s.exerciseName && s.exerciseName !== p.exerciseName) {
      next.exerciseName = String(s.exerciseName).slice(0, 20);
      const info = TF.exerciseInfo(next.exerciseName);
      next.muscleGroup = info.muscle || p.muscleGroup;
      next.tip = undefined;
      const timed = info.kind === 'cardio' || info.kind === 'sport' || info.kind === 'flex';
      if (timed && !p.durationMin) Object.assign(next, { durationMin: 20, weightKg: 0, sets: 1, reps: 1 });
      else if (!timed && p.durationMin) Object.assign(next, { durationMin: undefined, weightKg: 0, sets: 3, reps: 10 });
      // 换成练过的动作、没说重量：按那个动作的成绩
      const prog = !timed && s.weightKg == null && this.exerciseProgress(next.exerciseName, { date });
      if (prog && prog.next) Object.assign(next, { weightKg: prog.next.weightKg, reps: prog.next.reps });
    }
    if (s.weightKg != null && s.weightKg >= 0 && s.weightKg <= 500) next.weightKg = Math.round(s.weightKg * 100) / 100;
    if (s.sets >= 1 && s.sets <= 20) next.sets = Math.round(s.sets);
    if (s.reps >= 1 && s.reps <= 100) next.reps = Math.round(s.reps);
    if (s.durationMin >= 1 && s.durationMin <= 300) next.durationMin = Math.round(s.durationMin);
    if (!Object.keys(next).length) return no('没听出要改成什么');
    const line = change(p, next);
    return line ? done([line]) : no(`${name(p)}本来就是这样`);
  },

  /** 计划一行该有的字段（大模型给的整项、新加的一项） */
  planFields(x) {
    if (x.kind === 'meal') {
      return { kind: 'meal', mealType: x.mealType, foodSummary: x.foodSummary, calories: x.calories, proteinG: x.proteinG, carbsG: x.carbsG, fatG: x.fatG,
        items: x.items && x.items.length ? x.items : undefined };
    }
    return { kind: 'workout', exerciseName: x.exerciseName, muscleGroup: x.muscleGroup, weightKg: x.weightKg || 0, sets: x.sets, reps: x.reps,
      durationMin: x.durationMin || undefined, burnedCalories: x.burnedCalories, tip: x.tip || undefined };
  },

  /**
   * 本机认得出的改计划的说法（「卧推改成 60 公斤」「深蹲加一组」「不做硬拉了」「先做深蹲」「卧推还没做」「按成绩调一下」）：直接改，不等大模型。
   * 改的是正在看的那天（说了「明天的卧推…」就是明天）；那天也记了同一个动作、又没说「计划」的，交给大模型（多半在改记录）。改了返回 true
   */
  planEditSkill(text) {
    const AI = TF.AgentIntent;
    if (!AI || !AI.matchPlanEdit) return false;
    if (this._planEdit && Date.now() - this._planEdit < 5 * 60 * 1000) return false; // 点了「改一改」：在改气泡里还没放上去的计划
    const today = getTodayDateString();
    const dm = String(text || '').match(new RegExp(AI.DAY));
    const off = dm ? AI.dayOffset(dm[1], new Date()) : null;
    const date = off != null ? shiftDateString(today, off) : this.selectedDate;
    const plans = this.plansFor(date);
    if (!plans.some(p => p.kind !== 'meal')) return false;
    const act = AI.matchPlanEdit(text, plans.map(p => ({ id: p.id, kind: p.kind, name: p.kind === 'meal' ? '' : p.exerciseName, done: !!p.done,
      weightKg: p.weightKg, sets: p.sets, reps: p.reps, durationMin: p.durationMin })));
    if (!act) return false;
    const p = act.id && plans.find(x => x.id === act.id);
    if (p && !p.done && !act.done && !/计划/.test(text) && this.workouts.some(w => w.date === date && w.exerciseName === p.exerciseName)) return false;
    const r = this.runActs([act.all ? Object.assign({ dayOffset: Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) }, act) : act], today);
    if (!r.ok) { this.showToast(r.lines[0] || '没改成'); return true; }
    if (window.QuickLog) window.QuickLog.showUndo(act.done ? '✓ 照计划记上了' : act.undone ? '✓ 撤回了' : '✓ 计划改好了', r.lines, r.undo);
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    if (date !== this.selectedDate) { this.selectedDate = date; this.render(); }
    if (act.done && this.reactRecord && r.made && r.made.length) this.reactRecord(null, { date, dietIds: [], workoutIds: r.made, asks: [] });
    return true;
  },

  /** 拖动排顺序（v12.9）：按住左边的把手上下拖，放手就排好（不用撤销，再拖回去就行） */
  bindPlanDrag() {
    const tl = document.getElementById('timeline');
    if (!tl || tl._planDrag) return;
    tl._planDrag = true;
    tl.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.plan-grip');
      const row = grip && grip.closest('.item.plan.can-drag');
      if (!row) return;
      e.preventDefault();
      const rows = [...row.parentElement.querySelectorAll('.item.plan.can-drag')];
      const start = rows.indexOf(row);
      if (rows.length < 2 || start === -1) return;
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      const y0 = e.clientY;
      const step = row.offsetHeight; // 拖走的那行空出来多高，别的行就挪多少
      const mid = rows.map(r => r.offsetTop + r.offsetHeight / 2);
      let at = start;
      row.classList.add('dragging');
      document.body.classList.add('plan-dragging');
      window.Haptics && window.Haptics.fire('tick');
      const move = (ev) => {
        const dy = ev.clientY - y0;
        row.style.transform = `translateY(${dy}px)`;
        const c = mid[start] + dy;
        let n = 0;
        mid.forEach((m, i) => { if (i !== start && m < c) n += 1; });
        if (n === at) return;
        at = n;
        rows.forEach((r, i) => {
          if (r === row) return;
          const shift = start < at && i > start && i <= at ? -step : start > at && i >= at && i < start ? step : 0;
          r.style.transform = shift ? `translateY(${shift}px)` : '';
        });
        window.Haptics && window.Haptics.fire('tick');
      };
      const end = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', end);
        grip.removeEventListener('pointercancel', end);
        document.body.classList.remove('plan-dragging');
        this._dragAt = Date.now();
        if (at === start) { rows.forEach(r => { r.style.transform = ''; }); row.classList.remove('dragging'); return; }
        const r = this.applyPlanEdit({ id: row.dataset.plan, move: 'to', index: at });
        if (r.ok) { this.saveData(); window.Haptics && window.Haptics.fire('success'); }
        this.render();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', end);
      grip.addEventListener('pointercancel', end);
    });
  },

  /** 「按成绩调 N 个」：这天的训练计划全按你的成绩改，能撤销 */
  overloadPlans(date) {
    const today = getTodayDateString();
    const off = Math.round((new Date(date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    const r = this.runActs([{ do: 'editPlan', all: true, overload: true, dayOffset: off }], today);
    if (!r.ok) { this.showToast(r.lines[0] || '没改'); return; }
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    if (window.QuickLog) window.QuickLog.showUndo('✓ 按你的成绩调好了', r.lines, r.undo);
  }
});
