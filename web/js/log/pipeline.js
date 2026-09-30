/**
 * 一键记录 · 后台整理和保存：说完的话先变成「正在整理」卡片，大模型整理好后
 * 新增 / 修改 / 删除记录（含体重），底部提示可以撤销；App 在后台时发通知。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const { MEAL_TYPES, quickWeight, Native, Haptics, Parser, QuickLog, mergeItems, sumItems } = TF;

  Object.assign(QuickLog, {
    // ----- 解析 + 保存（后台进行，不用等） -----
    submit(text) {
      text = (text || '').trim();
      if (!text) return;
      const p = root.app.addPending(text);
      this.process(p);
    },

    /** 给大模型的上下文：这天的记录（带编号）+ 各动作最近一次成绩 */
    buildContext(p) {
      const app = root.app;
      const date = p.date;
      const dayRecords = [];
      app.diet.filter(d => d.date === date).forEach(d => dayRecords.push({
        kind: 'meal', id: d.id,
        text: `${(d.mealType || '').replace('/补剂', '')} ${d.foodSummary} ${d.calories}kcal 蛋白${d.proteinG || 0} 碳水${d.carbsG || 0} 脂肪${d.fatG || 0}` +
          (Array.isArray(d.items) && d.items.length ? `（${d.items.map(i => `${i.name}${i.amount ? ' ' + i.amount : ''}${i.grams ? ' ' + i.grams + 'g' : ''} ${i.calories}kcal 蛋白${i.proteinG || 0}`).join('、')}）` : '')
      }));
      app.workouts.filter(w => w.date === date).forEach(w => dayRecords.push({
        kind: 'workout', id: w.id,
        text: w.durationMin ? `训练 ${w.exerciseName} ${w.durationMin}分钟 消耗${w.burnedCalories || 0}` :
          `训练 ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}组×${w.reps}次 消耗${w.burnedCalories || 0}`
      }));
      dayRecords.forEach((r, i) => { r.ref = 'r' + (i + 1); });

      const seen = new Set();
      const recent = [];
      app.workouts
        .filter(w => !w.durationMin)
        .sort((x, y) => (y.date === x.date ? (y.ts || 0) - (x.ts || 0) : (y.date > x.date ? 1 : -1)))
        .forEach(w => {
          if (seen.has(w.exerciseName)) return;
          seen.add(w.exerciseName);
          recent.push(`${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}（${w.date.slice(5)}）`);
        });

      const today = getTodayDateString();
      const dayLabel = date === today ? `今天 ${date}` : date;
      const lw = app.latestWeight ? app.latestWeight() : null;
      return { now: new Date(p.ts || Date.now()), history: app.workouts, dayRecords, recent, dayLabel, lastWeight: lw ? lw.kg : null, myFoods: app.myFoods || [] };
    },

    async process(p) {
      const app = root.app;
      const ctx = this.buildContext(p);
      let result;
      try {
        // 只是报体重：不用等大模型
        const kg = quickWeight(p.text, ctx.lastWeight);
        result = kg ? { dayOffset: 0, workouts: [], meals: [], updates: [], deletes: [], bodyWeight: kg, reply: '', source: 'fast' }
          : await Parser.parse(p.text, ctx);
      } catch (e) {
        console.warn('[QuickLog] 大模型没整理出来：', e && e.message);
        if (app.pending.some(x => x.id === p.id)) app.failPending(p.id, Parser.failReason(e));
        return;
      }
      if (!app.pending.some(x => x.id === p.id)) return; // 已被用户删掉
      const changes = result.workouts.length + result.meals.length + (result.updates || []).length + (result.deletes || []).length + (result.bodyWeight ? 1 : 0) + (result.remember || []).length;
      if (!changes) {
        app.failPending(p.id, result.reply || '没认出吃了什么');
        return;
      }
      app.finishPending(p.id);
      const batch = this.save(Object.assign(result, { said: p.text }), p.date, ctx);
      this.showSnack(batch, result);
    },

    save(result, baseDate, ctx) {
      const app = root.app;
      const base = baseDate || app.selectedDate || getTodayDateString();
      const date = result.dayOffset ? shiftDateString(base, result.dayOffset) : base;
      const stamp = Date.now();
      const batch = { workoutIds: [], dietIds: [], date, before: [], removed: [], changed: [] };
      const refMap = new Map(((ctx && ctx.dayRecords) || []).map(r => [r.ref, r]));
      const find = (r) => (r.kind === 'meal' ? app.diet : app.workouts).find(x => x.id === r.id);

      // 修改
      (result.updates || []).forEach(u => {
        const r = refMap.get(u.ref);
        const rec = r && find(r);
        if (!rec) return;
        batch.before.push({ kind: r.kind, snapshot: JSON.parse(JSON.stringify(rec)) });
        Object.keys(u.set).forEach(k => {
          if (r.kind === 'meal' && ['mealType', 'foodSummary', 'calories', 'proteinG', 'carbsG', 'fatG'].includes(k)) rec[k] = u.set[k];
          if (r.kind === 'workout' && ['exerciseName', 'muscleGroup', 'weightKg', 'sets', 'reps', 'durationMin', 'burnedCalories'].includes(k)) rec[k] = u.set[k];
        });
        // 改了其中几样：按名字换掉 / 去掉，其他原样保留，合计重算
        if (r.kind === 'meal' && (u.set.items || u.set.removeItems)) {
          const items = mergeItems(rec.items, u.set.items, u.set.removeItems);
          rec.items = items.length ? items : undefined;
          Object.assign(rec, sumItems(items));
          if (!u.set.foodSummary && items.length) rec.foodSummary = items.map(it => it.name + (it.amount || '')).join('、').slice(0, 60);
        }
        batch.changed.push(r.kind === 'meal' ? `改 · ${rec.foodSummary} ${rec.calories} kcal` :
          `改 · ${rec.exerciseName} ${rec.durationMin ? rec.durationMin + ' 分钟' : (rec.weightKg > 0 ? rec.weightKg + 'kg' : '自重') + ' ' + rec.sets + '×' + rec.reps}`);
      });

      // 删除
      (result.deletes || []).forEach(ref => {
        const r = refMap.get(ref);
        if (!r) return;
        const list = r.kind === 'meal' ? app.diet : app.workouts;
        const idx = list.findIndex(x => x.id === r.id);
        if (idx === -1) return;
        const [rec] = list.splice(idx, 1);
        batch.removed.push({ kind: r.kind, rec });
        batch.changed.push(`删 · ${r.kind === 'meal' ? rec.foodSummary : rec.exerciseName}`);
      });

      // 新增
      result.workouts.forEach((w, i) => {
        const id = 'w_' + stamp + '_' + i;
        batch.workoutIds.push(id);
        app.workouts.unshift({
          id,
          ts: stamp + i,
          date,
          exerciseName: w.exerciseName,
          muscleGroup: w.muscleGroup,
          sets: w.sets,
          reps: w.reps,
          weightKg: w.weightKg,
          durationMin: w.durationMin || undefined,
          rpe: 8.0,
          burnedCalories: w.burnedCalories,
          notes: w.estimated ? '一键记录（部分参数按上次/默认值估计）' : '一键记录'
        });
      });
      result.meals.forEach((m, i) => {
        const id = 'd_' + stamp + '_' + i;
        batch.dietIds.push(id);
        app.diet.unshift({
          id,
          ts: stamp + 50 + Math.max(0, MEAL_TYPES.indexOf(m.mealType)) * 2 + i,
          date,
          mealType: m.mealType,
          foodSummary: m.foodSummary,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          items: m.items && m.items.length ? m.items : undefined,
          said: result.said ? String(result.said).slice(0, 200) : undefined // 原话：分得清是没听清还是理解错
        });
      });

      // 体重
      if (result.bodyWeight && app.setWeight) {
        batch.weight = { date, prev: app.setWeight(date, result.bodyWeight) };
      }

      // 记住的食物（「记住，糯米鸡一个350大卡」、包装上的营养数）
      batch.remembered = (result.remember || []).map(f => ({ name: f.name, prev: app.rememberFood(f) }));

      app.saveData();
      app.render();
      return batch;
    },

    describe(result) {
      const lines = [];
      result.workouts.forEach(w => {
        if (w.durationMin) lines.push(`有氧 · ${w.exerciseName} ${w.durationMin} 分钟`);
        else lines.push(`训练 · ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}${w.estimated ? '（估）' : ''}`);
      });
      result.meals.forEach(m => {
        const supp = m.items && m.items.length && m.items.every(i => i.supp);
        lines.push(supp ? `补剂 · ${m.foodSummary}` : `${m.mealType.replace('/补剂', '')} · ${m.foodSummary} ${m.calories} kcal`);
      });
      if (result.bodyWeight) lines.push(`体重 · ${result.bodyWeight} kg`);
      (result.remember || []).forEach(f => lines.push(`记住 · ${f.name} ${f.amount || '1份'} ${f.calories} kcal`));
      return lines;
    },

    showSnack(batch, result) {
      const app = root.app;
      const n = result.workouts.length + result.meals.length + (result.bodyWeight ? 1 : 0);
      const kept = (result.remember || []).length;
      let t = result.reply ? '✓ ' + result.reply
        : result.bodyWeight && n === 1 ? `✓ 记下体重 ${result.bodyWeight} kg`
        : n ? `✓ 已记下 ${n} 条`
        : kept ? `✓ 记住了 ${result.remember.map(f => f.name).join('、')}`
        : '✓ 已更新';
      if (n && batch.date !== getTodayDateString()) t += `（${batch.date.slice(5).replace('-', '月')}日）`;
      const lines = this.describe(result).concat(batch.changed || []);
      const kcal = result.meals.reduce((a, m) => a + (m.calories || 0), 0);
      const eq = kcal > 0 && app.equivText ? app.equivText(kcal) : '';
      if (eq) lines.push(eq);
      Haptics.fire('success');
      // App 在后台（比如说完就锁屏了）：发一条通知
      if (typeof document !== 'undefined' && document.hidden && Native.has() && root.TrainFitNative.showNotification) {
        try { root.TrainFitNative.showNotification(t.replace(/^✓\s*/, ''), lines.join('\n')); } catch (e) {}
      }
      this.showUndo(t, lines, () => {
        app.workouts = app.workouts.filter(w => !batch.workoutIds.includes(w.id));
        app.diet = app.diet.filter(d => !batch.dietIds.includes(d.id));
        (batch.before || []).forEach(b => {
          const list = b.kind === 'meal' ? app.diet : app.workouts;
          const rec = list.find(x => x.id === b.snapshot.id);
          if (rec) Object.keys(rec).forEach(k => delete rec[k]), Object.assign(rec, b.snapshot);
        });
        (batch.removed || []).forEach(r => (r.kind === 'meal' ? app.diet : app.workouts).unshift(r.rec));
        if (batch.weight && app.restoreWeight) app.restoreWeight(batch.weight.date, batch.weight.prev);
        (batch.remembered || []).slice().reverse().forEach(r => app.restoreFood(r.name, r.prev));
        app.saveData();
        app.render();
      });
    },

    /** 通用：底部提示 + 撤销 */
    showUndo(title, lines, undoFn) {
      document.getElementById('ql-snack-title').textContent = title;
      const list = document.getElementById('ql-snack-list');
      list.innerHTML = '';
      (lines || []).forEach(line => {
        const li = document.createElement('div');
        li.className = 'ql-snack-line';
        li.textContent = line;
        list.appendChild(li);
      });
      this._undoFn = undoFn;
      this.snack.classList.remove('hidden');
      clearTimeout(this._snackTimer);
      this._snackTimer = setTimeout(() => this.hideSnack(), 6000);
    },

    undo() {
      Haptics.fire('tap');
      const fn = this._undoFn;
      this._undoFn = null;
      this.hideSnack();
      if (fn) { fn(); root.app && root.app.showToast('已撤销'); }
    },

    hideSnack() {
      clearTimeout(this._snackTimer);
      this.snack.classList.add('hidden');
    }
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
