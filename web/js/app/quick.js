/**
 * 常吃一键记 + 打字联想：天天吃差不多的东西，点一下就记，不用每次都说。
 *
 *  - 底部「常吃」：从最近 60 天自己记过的东西里挑，按现在是早 / 中 / 晚排序，吃过一次就会出现；
 *    长按可以固定在最前面，或者不再推荐。
 *  - 打字时：输入一两个字，弹出自己吃过的整餐、其中的某一样、记住的食物，点一下直接记。
 *  - 记完给一句人话：≈ 几碗米饭、走路多久。
 */
const QUICK_PREFS_KEY = 'tf_quick_prefs';
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
  loadQuickPrefs() {
    const p = load(QUICK_PREFS_KEY, null) || {};
    return { pinned: Array.isArray(p.pinned) ? p.pinned : [], hidden: Array.isArray(p.hidden) ? p.hidden : [] };
  },

  saveQuickPrefs(p) { store(QUICK_PREFS_KEY, p); },

  /** 这次点「常吃」记到哪一顿：看的是今天就按现在的钟点，看的是别的日子就沿用原来的 */
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
          if (!it || !it.name || !(it.calories > 0)) return;
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

  /** 底部「常吃」：固定的在前，然后是这个钟点常吃的，再按次数和最近 */
  quickSuggestions() {
    const prefs = this.loadQuickPrefs();
    const slot = this.quickMealType();
    const date = this.selectedDate;
    const doneToday = new Set([
      ...this.diet.filter(d => d.date === date).map(d => 'm|' + this.normFoodName(d.foodSummary)),
      ...this.workouts.filter(w => w.date === date).map(w => 'w|' + workoutLabel(w))
    ]);
    const score = (e) => (e.slots[slot] || 0) * 3 + e.count + (Date.now() - e.last < 3 * 86400000 ? 1 : 0);
    return this.quickCandidates()
      .filter(e => (e.kind === 'meal' || e.kind === 'workout') && !prefs.hidden.includes(e.key))
      .map(e => Object.assign(e, { pinned: prefs.pinned.includes(e.key), done: doneToday.has(e.key), usual: (e.slots[slot] || 0) > 0 }))
      .sort((a, b) => (b.pinned - a.pinned) || (a.done - b.done) || (score(b) - score(a)) || (b.last - a.last))
      .slice(0, 8);
  },

  /** 打字联想：名字里包含输入的字 */
  typingSuggestions(text) {
    const q = this.normFoodName(text).replace(/[，,。.、]/g, '');
    if (!q) return [];
    const hidden = this.loadQuickPrefs().hidden;
    return this.quickCandidates()
      .filter(e => e.kind !== 'workout' && !hidden.includes(e.key) && this.normFoodName(e.label).includes(q))
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
    const typing = this._typing && window.QuickLog && window.QuickLog.mode === 'text';
    const list = typing ? this.typingSuggestions(this._typing) : this.quickSuggestions();
    this._quick = list;
    this._quickFromTyping = !!typing;
    if (!list.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    const slot = this.quickMealType().replace('/补剂', '');
    const head = typing ? '点一下直接记' : `${slot}常吃`;
    el.innerHTML = `<span class="qhead">${esc(head)}</span>` + list.map((q, i) => `
      <button type="button" class="qchip ${q.kind === 'workout' ? 'workout' : 'meal'}${q.pinned ? ' pinned' : ''}${q.done ? ' done' : ''}" data-quick="${i}">
        <span class="qplus">${q.pinned ? '★' : '+'}</span><span class="qlabel">${esc(q.label)}</span>${q.kcal ? `<small>${fmt(q.kcal)}</small>` : ''}
      </button>`).join('');
    el.classList.remove('hidden');
  },

  bindQuick() {
    const el = document.getElementById('cmp-chips');
    let timer = null, longPressed = false, startX = 0, startY = 0;
    const clear = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointerdown', (e) => {
      longPressed = false; // 上次长按松手在菜单上时，这里复位，免得吞掉这次点击
      const c = e.target.closest('[data-quick]');
      if (!c || this._quickFromTyping) return;
      startX = e.clientX; startY = e.clientY;
      timer = setTimeout(() => {
        longPressed = true;
        window.Haptics && window.Haptics.fire('tick');
        this.openChipMenu(Number(c.dataset.quick));
      }, 500);
    });
    el.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) clear(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => el.addEventListener(t, clear));
    el.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-quick]')) e.preventDefault(); });
    el.addEventListener('click', (e) => {
      const c = e.target.closest('[data-quick]');
      if (!c) return;
      if (longPressed) { longPressed = false; return; }
      this.quickRepeat(Number(c.dataset.quick));
    });

    const menu = document.getElementById('chip-menu');
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-chip-act]');
      if (e.target === menu || (b && b.dataset.chipAct === 'cancel')) { this.closeChipMenu(); return; }
      if (!b) return;
      const key = this._menuKey;
      const prefs = this.loadQuickPrefs();
      const before = JSON.parse(JSON.stringify(prefs));
      if (b.dataset.chipAct === 'pin') {
        prefs.pinned = prefs.pinned.includes(key) ? prefs.pinned.filter(k => k !== key) : [key].concat(prefs.pinned);
      } else if (b.dataset.chipAct === 'hide') {
        prefs.hidden = prefs.hidden.filter(k => k !== key).concat(key);
        prefs.pinned = prefs.pinned.filter(k => k !== key);
      }
      this.saveQuickPrefs(prefs);
      this.closeChipMenu();
      this.renderChips();
      if (b.dataset.chipAct === 'hide' && window.QuickLog) {
        window.QuickLog.showUndo('不再推荐了', [this._menuLabel], () => { this.saveQuickPrefs(before); this.renderChips(); });
      }
    });
  },

  openChipMenu(i) {
    const q = this._quick && this._quick[i];
    if (!q) return;
    this._menuKey = q.key;
    this._menuLabel = q.label;
    document.getElementById('chip-menu-title').textContent = q.label;
    document.getElementById('chip-menu-pin').textContent = q.pinned ? '取消固定' : '固定在最前面';
    document.getElementById('chip-menu').classList.remove('hidden');
  },

  closeChipMenu() {
    document.getElementById('chip-menu').classList.add('hidden');
  },

  /** 空白页上那个「老样子」按钮 */
  quickRepeatKey(key) {
    this._quick = this.quickSuggestions();
    this._quickFromTyping = false;
    const i = this._quick.findIndex(q => q.key === key);
    if (i >= 0) this.quickRepeat(i);
  },

  /** 点「常吃」或联想：直接记一条 */
  quickRepeat(i) {
    const q = this._quick && this._quick[i];
    if (!q) return;
    const ts = Date.now();
    const uid = ts + '_q' + Math.random().toString(36).slice(2, 6);
    let rec;
    if (q.kind === 'workout') {
      rec = Object.assign({}, q.src, { id: 'w_' + uid, ts, date: this.selectedDate });
      this.workouts.unshift(rec);
    } else if (q.kind === 'meal') {
      rec = Object.assign({}, q.src, { id: 'd_' + uid, ts, date: this.selectedDate, mealType: this.quickMealType(q.src.mealType) });
      if (Array.isArray(rec.items)) rec.items = rec.items.map(x => Object.assign({}, x));
      this.diet.unshift(rec);
    } else {
      // 某一样（item）或记住的食物（mine）：单独记成一条
      const it = q.src;
      const item = { name: it.name, amount: it.amount, grams: it.grams || null, src: q.kind === 'mine' ? '我的' : (it.src || '估算'),
        calories: Math.round(it.calories), proteinG: round1(it.proteinG || 0), carbsG: round1(it.carbsG || 0), fatG: round1(it.fatG || 0) };
      rec = { id: 'd_' + uid, ts, date: this.selectedDate, mealType: this.quickMealType(), foodSummary: q.label,
        calories: item.calories, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG, items: [item] };
      this.diet.unshift(rec);
    }
    window.Haptics && window.Haptics.fire('success');
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
