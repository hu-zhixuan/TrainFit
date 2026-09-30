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

  /** 每天蛋白质目标：自己设过就用设的；没设过，健身按设置里的（默认体重×2），只记吃的按每公斤 1.2g */
  gaugeProteinTarget() {
    if (this.isSimple() && !this.profile.proteinTouched) return Math.round((this.profile.weightKg || 60) * 1.2);
    return this.profile.targetProteinG || 0;
  },

  /** 健康度温度计：水银涨到哪一档，点一下看三项各怎么样 */
  renderThermo(s, isToday, target) {
    const el = document.getElementById('thermo');
    if (!el) return;
    const now = new Date();
    const g = TF.HealthGauge.evaluate({
      intake: s.intake, protein: s.protein, fat: s.fat, budget: s.budget, supps: s.supps, nutrients: s.nutrients,
      targetProteinG: this.gaugeProteinTarget(), hour: isToday ? now.getHours() + now.getMinutes() / 60 : null
    });
    const level = g.hasData ? String(g.level) : 'none';
    const name = document.getElementById('thermo-name');
    const fill = document.getElementById('thermo-fill');
    const changed = el.dataset.level !== level;
    el.dataset.level = level;
    name.textContent = g.hasData ? g.name : '未记录';
    if (changed && this.thermoShown) { name.classList.remove('pop'); void name.offsetWidth; name.classList.add('pop'); }
    // 水银高度：第一次出现时等一帧再涨，才有「涨上去」的动画
    const h = (g.hasData ? Math.max(0.08, g.pos) : 0) * 100 + '%';
    if (this.thermoShown) fill.style.height = h;
    else {
      this.thermoShown = true;
      void fill.offsetHeight;
      requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.height = h; }));
    }

    this.gaugeInfo = { g, deficit: s.deficit, target };
    if (!document.getElementById('gauge-pop').classList.contains('hidden')) this.showGaugePop();
  },

  /** 点温度计：弹出一张小卡片，三项各怎么样 */
  showGaugePop() {
    const pop = document.getElementById('gauge-pop');
    const { g, deficit, target } = this.gaugeInfo || {};
    if (!g) return;
    pop.dataset.level = g.hasData ? String(g.level) : 'none';
    if (!g.hasData) {
      pop.innerHTML = `<div class="gauge-pop-head"><b>未记录</b>今天吃得怎么样</div><p class="gauge-note">记上一顿之后，这里会按蛋白质、脂肪和热量赤字告诉你吃得健不健康。</p>`;
    } else {
      const d = g.detail, p = g.parts;
      const tone = (x) => (x >= 0.85 ? 'ok' : x >= 0.4 ? 'meh' : 'bad');
      const row = (name, value, part, word) => `<div class="gauge-row"><span>${name}</span><b>${value}</b><em class="${part == null ? '' : tone(part)}">${part == null ? '' : part >= 0.85 ? '合适' : word}</em></div>`;
      pop.innerHTML = `<div class="gauge-pop-head"><b>${g.name}</b>今天吃得怎么样</div>` +
        row('蛋白质', `${fmt(d.protein)} / ${fmt(d.proteinExpected)}g`, p.protein, '偏少') +
        row('脂肪', d.fatShare == null ? '—' : `占热量 ${Math.round(d.fatShare * 100)}%`, p.fat, d.fatShare != null && d.fatShare < 0.2 ? '偏少' : '偏多') +
        row('热量', deficit < 0 ? `盈余 ${fmt(-deficit)}` : `赤字 ${fmt(deficit)}`, p.energy, d.energyIssue === 'over' ? '吃多了' : '吃少了') +
        (d.supps.length || d.overUl.length ? `<div class="gauge-row"><span>补剂</span><b>${esc(d.supps.slice(0, 3).join('、') + (d.supps.length > 3 ? ` 等${d.supps.length}样` : ''))}</b>` +
          (d.overUl.length ? `<em class="bad">${esc(d.overUl[0].name)}超上限</em>` : d.bonus ? `<em class="ok">加 ${d.bonus} 分</em>` : '<em></em>') + '</div>' : '') +
        (d.overUl.length ? `<p class="gauge-warn">${d.overUl.map(o => `${esc(o.name)} 今天 ${round1(o.amount)}${o.unit}，超过每天上限 ${o.ul}${o.unit}`).join('；')}</p>` : '') +
        `<p class="gauge-note">蛋白质按已经吃的饭量算该有多少；脂肪占热量 20–35% 最好；热量看离目标${target >= 0 ? '赤字 ' + fmt(target) : '盈余 ' + fmt(-target)} 有多远。</p>`;
    }
    // 贴着温度计右边，从「预算 …」那行下面弹出来，别压住字
    const r = document.getElementById('thermo').getBoundingClientRect();
    const foot = document.getElementById('hero-foot').getBoundingClientRect();
    pop.style.top = Math.round(Math.max(r.bottom, foot.bottom) + 6) + 'px';
    pop.style.right = Math.max(16, Math.round(window.innerWidth - r.right - 6)) + 'px';
    pop.classList.remove('hidden');
  },

  bindGaugePop() {
    const pop = document.getElementById('gauge-pop');
    const close = () => pop.classList.add('hidden');
    document.getElementById('thermo').addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      if (pop.classList.contains('hidden')) this.showGaugePop(); else close();
    });
    // 点别的地方、滚动、切页都关掉
    document.addEventListener('click', (e) => { if (!pop.contains(e.target)) close(); });
    window.addEventListener('scroll', close, { passive: true, capture: true });
    window.addEventListener('resize', close);
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
    // 热量赤字 = 全天消耗（日常 + 训练）− 已吃；负数就是盈余
    const surplus = s.deficit < 0;
    $('hero-deficit-l').textContent = surplus ? '热量盈余' : '热量赤字';
    $('hero-deficit-v').textContent = fmt(Math.abs(s.deficit));
    $('hero-deficit-n').textContent = target > 0 ? `目标 ${fmt(target)}` : target < 0 ? `目标盈余 ${fmt(-target)}` : '目标 保持';
    $('hero-deficit').className = 'hero-side ' + (s.deficit >= target ? 'good' : surplus ? 'bad' : '');
    this.renderThermo(s, isToday, target);
    const simple = this.isSimple();
    if (simple) {
      const perMonth = Math.abs(target) * 30 / 7700;
      // 只记吃的也看蛋白质；运动消耗有才写在底下那行
      $('hero-foot').textContent = (target > 0 ? `每天少吃 ${fmt(target)} kcal，一个月大约瘦 ${perMonth.toFixed(1)} kg`
        : target < 0 ? `每天多吃 ${fmt(-target)} kcal，一个月大约长 ${perMonth.toFixed(1)} kg` : '按保持现在的体重算') +
        (s.workoutBurn ? ` · 运动 +${fmt(s.workoutBurn)}` : '');
      $('st-burn-l').textContent = '今天预算';
      $('st-burn').textContent = fmt(s.budget);
      $('st-protein-l').textContent = '蛋白质';
      $('st-protein').innerHTML = `${fmt(s.protein)}<small> / ${fmt(this.gaugeProteinTarget())}g</small>`;
    } else {
      $('hero-foot').textContent = `预算 ${fmt(s.budget)} = 消耗 ${fmt(s.totalBurn)} ${target >= 0 ? '− 目标赤字 ' + fmt(target) : '+ 目标盈余 ' + fmt(-target)}`;
      $('st-burn-l').textContent = '训练消耗';
      $('st-burn').textContent = s.workoutBurn ? '+' + fmt(s.workoutBurn) : '0';
      $('st-protein-l').textContent = '蛋白质';
      $('st-protein').innerHTML = `${fmt(s.protein)}<small> / ${fmt(this.gaugeProteinTarget())}g</small>`;
    }
    $('st-intake').textContent = fmt(s.intake);

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
      html += `<div class="group-head"><span>饮食</span><b>${fmt(s.intake)} kcal · 蛋白 ${fmt(s.protein)}g</b></div>`;
      html += meals.map(d => this.renderRow({ kind: 'meal', ts: recordTs(d), rec: d })).join('');
    }
    if (lifts.length) {
      html += `<div class="group-head"><span>${simple ? '运动' : '训练'}</span><b>消耗 ${fmt(s.workoutBurn)} kcal</b></div>`;
      html += lifts.map(w => this.renderRow({ kind: 'workout', ts: recordTs(w), rec: w })).join('');
    }
    if (!html) {
      const usual = isToday ? this.quickSuggestions().filter(q => q.kind === 'meal' && q.usual) : [];
      html = !isToday ? `<div class="empty">这天没有记录</div>`
        : usual.length
          ? `<div class="empty"><b>还是老样子？</b>点一下就记好<br>吃了别的，按住下面的按钮说一句<br><button type="button" class="empty-quick" data-quick-key="${esc(usual[0].key)}"><span class="qplus">+</span>${esc(usual[0].label)} · ${fmt(usual[0].kcal)} kcal</button></div>`
        : simple
          ? `<div class="empty"><div class="empty-icon">${ICONS.mic}</div><b>按住下面的按钮</b>，说说今天吃了啥<br>松手自动算好热量、记下来<br>说错了再说一句「改成…」「删掉…」<br><span class="empty-example">「早上包子豆浆，中午黄焖鸡，体重61.5」</span></div>`
          : `<div class="empty"><div class="empty-icon">${ICONS.mic}</div><b>按住下面的按钮</b>，一口气说完今天练了啥、吃了啥<br>松手就自动整理、记好<br>说错了再说一句「改成…」「删掉…」<br><span class="empty-example">「卧推80公斤4组8个，中午吃了黄焖鸡米饭」</span></div>`;
    }
    tl.innerHTML = html;

    this.renderChips();
    const tip = $('cmp-tip');
    if (tip) tip.classList.toggle('hidden', this.workouts.length + this.diet.length >= 3);
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
      // 只有补剂的一条：标「补剂」，下面写含的营养素
      const suppOnly = isSuppOnly(x);
      const macro = suppOnly ? TF.nutrientsText(sumNutrients(x.items), 3)
        : this.isSimple() ? (x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '')
        : [x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '', x.carbsG ? `碳水 ${round1(x.carbsG)}g` : '', x.fatG ? `脂肪 ${round1(x.fatG)}g` : ''].filter(Boolean).join(' · ');
      return `
        <button class="item" data-kind="meal" data-id="${esc(x.id)}" type="button">
          <div class="item-icon meal">${ICONS.meal}</div>
          <div class="item-main">
            <div class="item-title"><span class="tag tag-meal">${esc(suppOnly ? '补剂' : (x.mealType || '').replace('/补剂', ''))}</span>${esc(x.foodSummary)}</div>
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
