/**
 * 今天页：大数字、记录列表、「常吃常练」快捷记录，以及正在整理中的语音记录卡片。
 */
Object.assign(FitnessApp.prototype, {
  dateLabel(dateStr) {
    const today = getTodayDateString();
    const d = new Date(dateStr + 'T00:00:00');
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (dateStr === today) return '今天 · ' + md;
    if (dateStr === shiftDateString(today, -1)) return '昨天 · ' + md;
    return `${md} 周${WEEKDAYS[d.getDay()]}`;
  },

  renderToday() {
    const $ = (id) => document.getElementById(id);
    const date = this.selectedDate;
    const isToday = date === getTodayDateString();
    const s = this.getDaySummary(date);

    $('date-label').textContent = this.dateLabel(date);
    $('date-next').disabled = isToday;

    const over = s.remaining < 0;
    $('hero').classList.toggle('over', over);
    $('hero-label').textContent = over ? (isToday ? '今天已经超出' : '这天超出了') : (isToday ? '今天还能吃' : '这天还剩');
    $('hero-num').textContent = fmt(Math.abs(s.remaining));
    const pct = s.budget > 0 ? Math.min(100, (s.intake / s.budget) * 100) : 100;
    $('hero-meter').style.width = pct + '%';
    const target = this.profile.targetDeficitKcal || 0;
    const simple = this.isSimple();
    if (simple) {
      const perMonth = Math.abs(target) * 30 / 7700;
      $('hero-foot').textContent = target > 0 ? `每天少吃 ${fmt(target)} kcal，一个月大约瘦 ${perMonth.toFixed(1)} kg`
        : target < 0 ? `每天多吃 ${fmt(-target)} kcal，一个月大约长 ${perMonth.toFixed(1)} kg` : '按保持现在的体重算';
      $('st-burn-l').textContent = '今天预算';
      $('st-burn').textContent = fmt(s.budget);
      $('st-protein-l').textContent = '运动消耗';
      $('st-protein').textContent = s.workoutBurn ? '+' + fmt(s.workoutBurn) : '0';
    } else {
      $('hero-foot').textContent = `预算 ${fmt(s.budget)} = 消耗 ${fmt(s.totalBurn)} ${target >= 0 ? '− 目标缺口 ' + fmt(target) : '+ 目标盈余 ' + fmt(-target)}`;
      $('st-burn-l').textContent = '训练消耗';
      $('st-burn').textContent = s.workoutBurn ? '+' + fmt(s.workoutBurn) : '0';
      $('st-protein-l').textContent = '蛋白质';
      $('st-protein').textContent = `${fmt(s.protein)} / ${fmt(this.profile.targetProteinG)}g`;
    }
    $('st-intake').textContent = fmt(s.intake);
    this.renderWeightRow(date);

    $('setup-hint').classList.toggle('hidden', !!this.profile.customized);
    let asked = true;
    try { asked = !!localStorage.getItem('tf_remind_asked'); } catch (e) {}
    // 有过记录后再问，别一打开就弹
    $('remind-banner').classList.toggle('hidden', asked || !this.hasNotifApi() || (this.workouts.length + this.diet.length) < 1);

    // 记录：整理中的在最上面；饮食按 早→午→晚→加餐，训练按先后顺序
    const pend = this.pending.filter(p => p.date === date).sort((a, b) => b.ts - a.ts);
    const meals = this.diet.filter(d => d.date === date)
      .sort((a, b) => (MEAL_TYPES.indexOf(a.mealType) - MEAL_TYPES.indexOf(b.mealType)) || (recordTs(a) - recordTs(b)));
    const lifts = this.workouts.filter(w => w.date === date).sort((a, b) => recordTs(a) - recordTs(b));

    const tl = $('timeline');
    let html = pend.map(p => this.renderRow({ kind: 'pending', ts: p.ts, rec: p })).join('');
    if (meals.length) {
      html += `<div class="group-head"><span>饮食</span><b>${fmt(s.intake)} kcal${simple ? '' : ` · 蛋白 ${fmt(s.protein)}g`}</b></div>`;
      html += meals.map(d => this.renderRow({ kind: 'meal', ts: recordTs(d), rec: d })).join('');
    }
    if (lifts.length) {
      html += `<div class="group-head"><span>${simple ? '运动' : '训练'}</span><b>消耗 ${fmt(s.workoutBurn)} kcal</b></div>`;
      html += lifts.map(w => this.renderRow({ kind: 'workout', ts: recordTs(w), rec: w })).join('');
    }
    if (!html) {
      html = !isToday ? `<div class="empty">这天没有记录</div>`
        : simple
          ? `<div class="empty"><div class="empty-icon">${ICONS.mic}</div><b>按住下面的按钮</b>，说说今天吃了啥<br>松手自动算好热量、记下来<br>说错了再说一句「改成…」「删掉…」<br><span class="empty-example">「早上包子豆浆，中午黄焖鸡，体重61.5」</span></div>`
          : `<div class="empty"><div class="empty-icon">${ICONS.mic}</div><b>按住下面的按钮</b>，一口气说完今天练了啥、吃了啥<br>松手就自动整理、记好<br>说错了再说一句「改成…」「删掉…」<br><span class="empty-example">「卧推80公斤4组8个，中午吃了黄焖鸡米饭」</span></div>`;
    }
    tl.innerHTML = html;

    this.renderChips();
    const tip = $('cmp-tip');
    if (tip) tip.classList.toggle('hidden', this.workouts.length + this.diet.length >= 3);
  },

  /** 常吃常练：最近 30 天里记过 2 次以上、这天还没记的，点一下直接再记一次 */
  quickSuggestions() {
    const since = shiftDateString(getTodayDateString(), -30);
    const date = this.selectedDate;
    const map = new Map();
    const add = (key, item) => {
      const e = map.get(key);
      if (!e) { map.set(key, Object.assign({}, item, { count: 1, last: item.ts })); return; }
      e.count += 1;
      if (item.ts > e.last) { e.last = item.ts; e.src = item.src; }
    };
    this.diet.filter(d => d.date >= since).forEach(d => add(`m|${d.mealType}|${d.foodSummary}`, {
      kind: 'meal', label: `${(d.mealType || '').replace('/补剂', '')} · ${d.foodSummary}`, ts: recordTs(d), src: d
    }));
    this.workouts.filter(w => w.date >= since).forEach(w => {
      const label = w.durationMin ? `${w.exerciseName} ${w.durationMin}分钟` : `${w.exerciseName} ${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`;
      add(`w|${label}`, { kind: 'workout', label, ts: recordTs(w), src: w });
    });
    const loggedToday = new Set([
      ...this.diet.filter(d => d.date === date).map(d => `m|${d.mealType}|${d.foodSummary}`),
      ...this.workouts.filter(w => w.date === date).map(w => w.durationMin ? `w|${w.exerciseName} ${w.durationMin}分钟` : `w|${w.exerciseName} ${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`)
    ]);
    return [...map.entries()]
      .filter(([k, e]) => e.count >= 2 && !loggedToday.has(k))
      .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
      .slice(0, 8)
      .map(([, e]) => e);
  },

  renderChips() {
    const el = document.getElementById('cmp-chips');
    this._quick = this.quickSuggestions();
    el.innerHTML = this._quick.map((q, i) =>
      `<button type="button" class="qchip ${q.kind}" data-quick="${i}"><span class="qplus">+</span>${esc(q.label)}</button>`).join('');
    el.classList.toggle('hidden', !this._quick.length);
  },

  quickRepeat(i) {
    const q = this._quick && this._quick[i];
    if (!q) return;
    const ts = Date.now();
    const copy = Object.assign({}, q.src, { id: (q.kind === 'meal' ? 'd_' : 'w_') + ts, ts, date: this.selectedDate });
    if (q.kind === 'meal') this.diet.unshift(copy); else this.workouts.unshift(copy);
    window.Haptics && window.Haptics.fire('success');
    this.saveData();
    this.render();
    if (window.QuickLog) {
      window.QuickLog.showUndo(`✓ 已再记一次`, [q.label + (q.kind === 'meal' ? ` · ${fmt(copy.calories)} kcal` : '')], () => {
        this.diet = this.diet.filter(d => d.id !== copy.id);
        this.workouts = this.workouts.filter(w => w.id !== copy.id);
        this.saveData();
        this.render();
      });
    }
  },

  renderRow(r) {
    const x = r.rec;
    if (r.kind === 'pending') {
      const failed = x.status === 'failed';
      return `
        <div class="item pending ${failed ? 'failed' : ''}">
          <div class="item-icon">${failed ? ICONS.alert : '<div class="spinner"></div>'}</div>
          <div class="item-main">
            <div class="item-title">${failed ? esc(x.error || '没整理出来') : '正在整理…'}</div>
            <div class="item-sub">「${esc(x.text)}」</div>
          </div>
          ${failed ? `<div class="pending-actions">
            <button class="chip" data-act="drop" data-id="${esc(x.id)}" type="button">删除</button>
            <button class="chip" data-act="edit-text" data-id="${esc(x.id)}" type="button">改字</button>
            <button class="chip chip-primary" data-act="retry" data-id="${esc(x.id)}" type="button">重试</button>
          </div>` : ''}
        </div>`;
    }
    if (r.kind === 'meal') {
      const macro = this.isSimple() ? '' : [x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '', x.carbsG ? `碳水 ${round1(x.carbsG)}g` : '', x.fatG ? `脂肪 ${round1(x.fatG)}g` : ''].filter(Boolean).join(' · ');
      return `
        <button class="item" data-kind="meal" data-id="${esc(x.id)}" type="button">
          <div class="item-icon meal">${ICONS.meal}</div>
          <div class="item-main">
            <div class="item-title"><span class="tag tag-meal">${esc((x.mealType || '').replace('/补剂', ''))}</span>${esc(x.foodSummary)}</div>
            <div class="item-sub">${esc(hhmm(r.ts))}${macro ? ' · ' + macro : ''}</div>
          </div>
          <div class="item-value">${fmt(x.calories)}<small>kcal</small></div>
        </button>`;
    }
    // workout
    let value;
    const parts = [];
    if (r.ts) parts.push(esc(hhmm(r.ts)));
    if (x.durationMin) {
      value = `${fmt(x.durationMin)}<small>分钟</small>`;
      parts.push(`消耗约 ${fmt(x.burnedCalories)} kcal`);
    } else {
      value = `${x.weightKg > 0 ? round1(x.weightKg) + 'kg' : '自重'}<small>${fmt(x.sets)} 组 × ${fmt(x.reps)} 次</small>`;
      if (x.muscleGroup) parts.push(esc(x.muscleGroup));
      const p = this.exerciseProgress(x.exerciseName);
      if (x.notes && /估计/.test(x.notes)) parts.push('有数字是估的，点开改');
      else if (p && p.isLatest(x.id) && p.next.kind !== 'keep') parts.push(`<span class="up">${esc(p.next.text)}</span>`);
    }
    return `
      <button class="item" data-kind="workout" data-id="${esc(x.id)}" type="button">
        <div class="item-icon ${x.durationMin ? 'cardio' : 'lift'}">${x.durationMin ? ICONS.cardio : ICONS.lift}</div>
        <div class="item-main">
          <div class="item-title"><span class="tag ${x.durationMin ? 'tag-cardio' : 'tag-lift'}">${x.durationMin ? '有氧' : '训练'}</span>${esc(x.exerciseName)}</div>
          <div class="item-sub">${parts.join(' · ')}</div>
        </div>
        <div class="item-value">${value}</div>
      </button>`;
  },

  addPending(text) {
    const p = { id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text, date: this.selectedDate, ts: Date.now(), status: 'working' };
    this.pending.unshift(p);
    this.savePending();
    if (this.view !== 'today') this.switchView('today'); else this.render();
    return p;
  },

  finishPending(id) {
    this.pending = this.pending.filter(p => p.id !== id);
    this.savePending();
  },

  failPending(id, message) {
    const p = this.pending.find(x => x.id === id);
    if (!p) return;
    window.Haptics && window.Haptics.fire('error');
    p.status = 'failed';
    p.error = message || '没整理出来';
    this.savePending();
    this.render();
  },

  retryPending(id) {
    const p = this.pending.find(x => x.id === id);
    if (!p || !window.QuickLog) return;
    p.status = 'working';
    p.error = null;
    this.render();
    window.QuickLog.process(p);
  },

  dropPending(id) {
    this.finishPending(id);
    this.render();
  },

  editPendingText(id) {
    const p = this.pending.find(x => x.id === id);
    if (!p || !window.QuickLog) return;
    this.finishPending(id);
    this.render();
    window.QuickLog.openWithText(p.text);
  }
});
