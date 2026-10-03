/**
 * 老样子一键记 + 打字联想：天天吃差不多的东西，点一下就记，不用每次都说。
 *
 *  - 今天还没记时，空白页给一个「老样子」按钮（这个钟点最常吃的那一餐）。
 *  - 打字时：输入一两个字，弹出自己吃过的整餐、其中的某一样、记住的食物，点一下直接记。
 *  - 记完给一句人话：≈ 几碗米饭、走路多久。
 */
const QUICK_DAYS = 60;
const RICE_BOWL_KCAL = 210; // 一碗米饭约 180g ≈ 210 千卡

/** 按钟点猜这一顿（和 log/helpers.js 的 mealTypeByHour 一致） */
function mealSlotByHour(hour) {
  if (hour >= 4 && hour < 10) return '早餐';
  if (hour >= 10 && hour < 15) return '午餐';
  if (hour >= 17 && hour < 21) return '晚餐';
  return '加餐/补剂';
}

function workoutLabel(w) {
  return w.durationMin ? `${w.exerciseName} ${w.durationMin}分钟` : `${w.exerciseName} ${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`;
}

Object.assign(FitnessApp.prototype, {
  /** 这次一键记到哪一顿：看的是今天就按现在的钟点，看的是别的日子就沿用原来的 */
  quickMealType(fallback) {
    return this.selectedDate === getTodayDateString() ? mealSlotByHour(new Date().getHours()) : (fallback || '加餐/补剂');
  },

  /**
   * 所有能一键再记的东西。
   * kind: meal（整餐）| item（某一餐里的一样）| mine（记住的食物）| workout（训练，健身模式才有）
   */
  quickCandidates() {
    const since = shiftDateString(getTodayDateString(), -QUICK_DAYS);
    const map = new Map();
    const add = (key, base, ts, mealType) => {
      let e = map.get(key);
      if (!e) { e = Object.assign({ key, count: 0, last: 0, slots: {} }, base); map.set(key, e); }
      e.count += 1;
      if (mealType) e.slots[mealType] = (e.slots[mealType] || 0) + 1;
      if (ts >= e.last) { e.last = ts; Object.assign(e, base); }
    };
    this.diet.filter(d => d.date >= since && d.foodSummary).forEach(d => {
      const ts = recordTs(d);
      add('m|' + this.normFoodName(d.foodSummary), { kind: 'meal', label: d.foodSummary, kcal: d.calories, src: d }, ts, d.mealType);
      // 一餐里有好几样的，每一样也能单独再记（打字联想用）
      if (Array.isArray(d.items) && d.items.length > 1) {
        d.items.forEach(it => {
          if (!it || !it.name || !(it.calories > 0 || it.supp)) return;
          const label = it.name + (it.amount ? ' ' + it.amount : '');
          add('i|' + this.normFoodName(label), { kind: 'item', label, kcal: it.calories, src: it, itemOnly: true }, ts, d.mealType);
        });
      }
    });
    (this.myFoods || []).forEach(f => {
      const label = f.name + (f.amount ? ' ' + f.amount : '');
      if (!map.has('i|' + this.normFoodName(label))) {
        map.set('f|' + this.normFoodName(f.name), { key: 'f|' + this.normFoodName(f.name), kind: 'mine', label, kcal: f.calories, src: f, count: 1, last: f.ts || 0, slots: {}, itemOnly: true });
      }
    });
    if (!this.isSimple()) {
      this.workouts.filter(w => w.date >= since).forEach(w => {
        const label = workoutLabel(w);
        add('w|' + label, { kind: 'workout', label, src: w }, recordTs(w));
      });
    }
    return [...map.values()];
  },

  /** 「老样子」候选：这个钟点（或指定的那一顿）常吃的在前，再按次数和最近；今天已经记过的排后面 */
  quickSuggestions(slotFor) {
    const slot = slotFor || this.quickMealType();
    const date = this.selectedDate;
    const doneToday = new Set([
      ...this.diet.filter(d => d.date === date).map(d => 'm|' + this.normFoodName(d.foodSummary)),
      ...this.workouts.filter(w => w.date === date).map(w => 'w|' + workoutLabel(w))
    ]);
    const score = (e) => (e.slots[slot] || 0) * 3 + e.count + (Date.now() - e.last < 3 * 86400000 ? 1 : 0);
    return this.quickCandidates()
      .filter(e => e.kind === 'meal' || e.kind === 'workout')
      .map(e => Object.assign(e, { done: doneToday.has(e.key), usual: (e.slots[slot] || 0) > 0 }))
      .sort((a, b) => (a.done - b.done) || (score(b) - score(a)) || (b.last - a.last))
      .slice(0, 8);
  },

  /** 打字联想：名字里包含输入的字 */
  typingSuggestions(text) {
    const q = this.normFoodName(text).replace(/[，,。.、]/g, '');
    if (!q) return [];
    return this.quickCandidates()
      .filter(e => e.kind !== 'workout' && this.normFoodName(e.label).includes(q))
      .sort((a, b) => (b.kind === 'meal') - (a.kind === 'meal') || b.count - a.count || b.last - a.last)
      .slice(0, 6);
  },

  /** 输入框内容变了（quick_log.js 调） */
  onTyping(text) {
    this._typing = String(text || '').trim();
    this.renderChips();
  },

  renderChips() {
    const el = document.getElementById('cmp-chips');
    // 平时不显示（保持简洁）；只在打字时弹出联想
    const typing = this._typing && window.QuickLog && window.QuickLog.mode === 'text';
    const list = typing ? this.typingSuggestions(this._typing) : [];
    this._quick = list;
    this._quickFromTyping = !!typing;
    if (!list.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.innerHTML = `<span class="qhead">点一下直接记</span>` + list.map((q, i) => `
      <button type="button" class="qchip meal" data-quick="${i}">
        <span class="qplus">+</span><span class="qlabel">${esc(q.label)}</span>${q.kcal ? `<small>${fmt(q.kcal)}</small>` : ''}
      </button>`).join('');
    el.classList.remove('hidden');
  },

  bindQuick() {
    document.getElementById('cmp-chips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-quick]');
      if (c) this.quickRepeat(Number(c.dataset.quick));
    });
  },

  /** 空白页上那个「老样子」按钮；mealType：记到哪一顿（小人饭点过了问「还是老样子？」时是那一顿，不按现在的钟点） */
  quickRepeatKey(key, mealType) {
    this._quick = this.quickSuggestions(mealType);
    this._quickFromTyping = false;
    const i = this._quick.findIndex(q => q.key === key);
    if (i >= 0) this.quickRepeat(i, mealType);
  },

  /** 点「常吃」或联想：直接记一条 */
  quickRepeat(i, mealType) {
    const q = this._quick && this._quick[i];
    if (!q) return;
    const ts = Date.now();
    const uid = ts + '_q' + Math.random().toString(36).slice(2, 6);
    let rec;
    if (q.kind === 'workout') {
      rec = Object.assign({}, q.src, { id: 'w_' + uid, ts, date: this.selectedDate });
      this.workouts.unshift(rec);
    } else if (q.kind === 'meal') {
      rec = Object.assign({}, q.src, { id: 'd_' + uid, ts, date: this.selectedDate, mealType: isSuppOnly(q.src) ? '加餐/补剂' : mealType || this.quickMealType(q.src.mealType) });
      if (Array.isArray(rec.items)) rec.items = rec.items.map(x => Object.assign({}, x));
      this.diet.unshift(rec);
    } else {
      // 某一样（item）或记住的食物（mine）：单独记成一条
      const it = q.src;
      const item = { name: it.name, amount: it.amount, grams: it.grams || null, src: q.kind === 'mine' ? '我的' : (it.src || '估算'),
        calories: Math.round(it.calories), proteinG: round1(it.proteinG || 0), carbsG: round1(it.carbsG || 0), fatG: round1(it.fatG || 0) };
      if (it.supp) item.supp = true;
      if (it.nutrients) item.nutrients = Object.assign({}, it.nutrients);
      rec = { id: 'd_' + uid, ts, date: this.selectedDate, mealType: it.supp ? '加餐/补剂' : this.quickMealType(), foodSummary: q.label,
        calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG, items: [item] };
      this.diet.unshift(rec);
    }
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    if (this._quickFromTyping && window.QuickLog && window.QuickLog.clearText) window.QuickLog.clearText();
    this._typing = '';
    this.saveData();
    this.render();
    if (window.QuickLog) {
      const isMeal = q.kind !== 'workout';
      const lines = [isMeal ? `${rec.mealType.replace('/补剂', '')} · ${rec.foodSummary} · ${fmt(rec.calories)} kcal` : q.label];
      const eq = isMeal ? this.equivText(rec.calories) : '';
      if (eq) lines.push(eq);
      window.QuickLog.showUndo('✓ 记好了', lines, () => {
        this.diet = this.diet.filter(d => d.id !== rec.id);
        this.workouts = this.workouts.filter(w => w.id !== rec.id);
        this.saveData();
        this.render();
      });
    }
  },

  /** 「≈ 1.5 碗米饭，走路约 50 分钟」 */
  equivText(kcal) {
    if (!(kcal > 0)) return '';
    const b = kcal / RICE_BOWL_KCAL;
    const bowls = b < 0.35 ? '小半碗' : b < 0.75 ? '半碗' : `${Math.round(b * 2) / 2} 碗`;
    // 快走约 3.5 MET：每分钟千卡 = 3.5 × 3.5 × 体重 / 200
    const perMin = 3.5 * 3.5 * (this.profile.weightKg || 60) / 200;
    const min = Math.max(5, Math.round(kcal / perMin / 5) * 5);
    const walk = min >= 90 ? `${round1(min / 60)} 小时` : `${min} 分钟`;
    return `≈ ${bowls}米饭，快走约 ${walk}`;
  }
});
