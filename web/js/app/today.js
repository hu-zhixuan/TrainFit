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
    if (dateStr === shiftDateString(today, 1)) return '明天 · ' + md;
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

  /** 点「热量赤字」：用你今天的数说清楚它是什么（有人第一眼不知道赤字是啥） */
  showDeficitPop() {
    const pop = document.getElementById('gauge-pop');
    const h = this._heroSum;
    if (!h) return;
    const { s, target } = h;
    const burn = Math.round(s.totalBurn), daily = Math.round(s.totalBurn - (s.workoutBurn || 0));
    const perMonth = round1(Math.abs(target) * 30 / 7700);
    pop.dataset.level = 'none';
    pop.innerHTML = `<div class="gauge-pop-head"><b>${s.deficit < 0 ? '热量盈余' : '热量赤字'}</b>是什么</div>` +
      `<p class="deficit-eq">消耗 ${fmt(burn)} − 吃了 ${fmt(Math.round(s.intake))} = <b>${s.deficit < 0 ? '盈余 ' + fmt(-Math.round(s.deficit)) : fmt(Math.round(s.deficit))}</b></p>` +
      `<p class="gauge-note">消耗 = 日常 ${fmt(daily)}（不动也会烧掉的）${s.workoutBurn ? ` + 训练 ${fmt(Math.round(s.workoutBurn))}` : ''}。` +
      `吃得比消耗少，差的那部分就是热量赤字，身体会拿脂肪来补——大约 7700 kcal 是 1kg 脂肪。` +
      (target > 0 ? `你的目标每天赤字 ${fmt(target)}，一个月大约瘦 ${perMonth}kg。` : target < 0 ? `你在增肌，目标每天多吃 ${fmt(-target)}（盈余），一个月大约长 ${perMonth}kg。` : '你的目标是保持，吃的和消耗的差不多就行。') +
      (h.isToday && s.remaining > 0 ? `一天还没过完，吃得越多赤字越小：今天再吃 ${fmt(Math.round(s.remaining))} 正好到目标。` : '') + '</p>';
    const r = document.getElementById('hero-deficit').getBoundingClientRect();
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    pop.style.right = Math.max(16, Math.round(window.innerWidth - r.right - 8)) + 'px';
    pop.classList.remove('hidden');
  },

  bindGaugePop() {
    const pop = document.getElementById('gauge-pop');
    const close = () => pop.classList.add('hidden');
    const deficit = document.getElementById('hero-deficit');
    const openDeficit = (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      if (!pop.classList.contains('hidden') && pop.querySelector('.deficit-eq')) close(); else this.showDeficitPop();
    };
    deficit.addEventListener('click', openDeficit);
    deficit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDeficit(e); } });
    document.getElementById('thermo').addEventListener('click', (e) => {
      e.stopPropagation();
      window.Haptics && window.Haptics.fire('tick');
      if (pop.classList.contains('hidden') || pop.querySelector('.deficit-eq')) this.showGaugePop(); else close();
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
    $('date-next').disabled = date >= this.lastPlanDate();

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
    this._heroSum = { s, target, isToday };
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

    // 记录：整理中的在最上面（提问的在小人气泡里等，不占卡片；没整理出来才显示）；然后是计划的进度；
    // 饮食按顿分组（v7.1）：早餐 / 午餐 / 晚餐 / 加餐 / 补剂各一张卡，卡里一行一样，这顿的计划也放在里面；训练一张卡
    // 提问：整理中不出卡片（小人在想）；没答上来也不留卡片（小人的气泡里能重试），又记又问的才留
    const pend = this.pending.filter(p => p.date === date && !(p.ask && (p.status === 'working' || p.plan || p.chat || (TF.pureQuestion && TF.pureQuestion(p.text))))).sort((a, b) => b.ts - a.ts);
    const todo = this.plansFor ? this.plansFor(date).filter(p => !p.done) : [];

    const tl = $('timeline');
    let html = pend.map(p => this.renderRow({ kind: 'pending', ts: p.ts, rec: p })).join('');
    html += this.renderPlanHead ? this.renderPlanHead(date) : '';
    html += this.renderMealGroups(date, todo.filter(p => p.kind === 'meal'));
    html += this.renderTrainGroup(date, s, todo.filter(p => p.kind !== 'meal'));
    if (!html) {
      // 空着的时候只说一句（v6.3.1 用户：「空白页太复杂了，最多一句话」）。老样子、点图片记都交给小人饭点时问
      html = !isToday ? `<div class="empty">这天没有记录</div>`
        : `<div class="empty"><div class="empty-icon">${ICONS.mic}</div>按住下面，说说今天${simple ? '吃了啥' : '吃了啥、练了啥'}</div>`;
    }
    tl.innerHTML = html;
    this.growPlanBar && this.growPlanBar();

    this.renderChips();
    const tip = $('cmp-tip');
    if (tip) tip.classList.toggle('hidden', this.workouts.length + this.diet.length >= 3);
  },

  /**
   * 这天的吃的分顿（v8.0，log/meals.js）：原话说了顿的照原话；没说的按吃的时间、你自己的作息（最近 4 周几点吃饭）、
   * 这顿多大、吃的是不是零嘴来分，同一时间段只算一顿正餐，别的按时间算上午 / 下午加餐、夜宵。按记录算一次缓存起来。
   */
  mealClasses(date) {
    const meals = this.diet.filter(d => d.date === date);
    const key = date + '|' + meals.map(d => `${d.id}:${d.mealType}:${d.calories}:${d.mealFixed ? 1 : 0}`).join(',');
    if (this._mealCls && this._mealCls.key === key) return this._mealCls.val;
    const val = TF.Meals ? TF.Meals.classify(meals, { rhythm: this.mealRhythm() }) : {};
    this._mealCls = { key, val };
    return val;
  },

  /** 你几点吃饭（最近 4 周的中位数，一天算一次） */
  mealRhythm() {
    const today = getTodayDateString();
    if (!this._rhythm || this._rhythm.day !== today || this._rhythm.n !== this.diet.length) {
      this._rhythm = { day: today, n: this.diet.length, val: TF.Meals ? TF.Meals.rhythm(this.diet, today) : null };
    }
    return this._rhythm.val || undefined;
  },

  /** 这条吃的在今天页放哪组（「早餐」「加餐·pm」「夜宵」…的 key） */
  mealGroupOf(d) {
    if (isSuppOnly(d)) return '补剂';
    const c = this.mealClasses(d.date)[d.id];
    if (c && TF.Meals) return TF.Meals.groupKey(c);
    const t = MEAL_TYPES.includes(d.mealType) ? d.mealType : '加餐/补剂';
    return t === '加餐/补剂' ? '加餐·pm' : t;
  },

  /** 记完以后：这天没说顿的记录按分顿结果改 mealType（别处按 mealType 算早饭连续几天、晚饭吃没吃，跟今天页一致） */
  fixMealTypes(date) {
    if (!TF.Meals) return;
    this._mealCls = null;
    const cls = this.mealClasses(date);
    this.diet.forEach(d => {
      const c = d.date === date && cls[d.id];
      if (!c || c.why === 'said' || c.why === 'stored' || c.why === 'supp') return;
      d.mealType = TF.Meals.storedType(c);
    });
    this._mealCls = null;
  },

  /**
   * 饮食按顿分组（v7.1，用户：「每天的饮食自动分个组，现在有点乱」——以前一条一张卡，加餐、补剂、计划散在各处）：
   * 每顿一张卡，头上写这顿几点、多少千卡、多少蛋白，下面一行一样（点开能改），这顿还没吃的计划虚线放在最后。
   * v8.0 按吃的时间排：早餐 → 上午加餐 → 午餐 → 下午加餐 → 晚餐 → 夜宵 → 补剂。补记的（晚上说「中午吃了…」）不写成那顿的钟点。
   */
  renderMealGroups(date, plans) {
    const meals = this.diet.filter(d => d.date === date).sort((a, b) => recordTs(a) - recordTs(b));
    const cls = this.mealClasses(date);
    const planGroup = (p) => { const t = (p.mealType || '').replace('/补剂', ''); return t === '加餐' ? '加餐·pm' : t; };
    const order = TF.Meals ? TF.Meals.ORDER : ['早餐', '午餐', '晚餐', '加餐·pm', '补剂'];
    return order.map(g => {
      const rows = meals.filter(d => this.mealGroupOf(d) === g);
      const plan = plans.filter(p => planGroup(p) === g);
      if (!rows.length && !plan.length) return '';
      const name = TF.Meals ? TF.Meals.groupName(g) : g.replace(/·.*/, '');
      const kcal = rows.reduce((t, d) => t + (d.calories || 0), 0);
      const prot = rows.reduce((t, d) => t + (d.proteinG || 0), 0);
      const total = !rows.length ? `<span class="mg-total plan"><small>计划</small>${fmt(plan.reduce((t, p) => t + (p.calories || 0), 0))} kcal</span>`
        : g === '补剂' && !kcal ? `<span class="mg-total"><small>${rows.length} 样</small></span>`
        : `<span class="mg-total"><b>${fmt(kcal)}</b> kcal${prot ? `<small>蛋白 ${round1(prot)}g</small>` : ''}</span>`;
      // 小字：这顿几点（补记的不写）、几样；加餐写上午 / 下午 / 练后
      const first = rows.find(d => !(cls[d.id] || {}).late);
      const label = rows.map(d => (cls[d.id] || {}).label).find(Boolean) || '';
      const sub = [label, first ? hhmm(recordTs(first)) : '', rows.length > 1 ? `${rows.length} 样` : ''].filter(Boolean).join(' · ');
      return `<section class="mgroup" data-group="${esc(g)}"><div class="mg-head"><span class="mg-ico ${g === '补剂' ? 'supp' : g.startsWith('加餐') || name === '夜宵' ? 'snack' : 'meal'}">${ICONS.meal}</span>` +
        `<span class="mg-name">${name}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${total}</div>` +
        rows.map(d => this.renderMealLine(d, (cls[d.id] || {}).late)).join('') + plan.map(p => this.renderPlanRow(p, true)).join('') + '</section>';
    }).join('');
  },

  /** late：补记的（晚上说「中午吃了…」），时间写「补记 20:05」，免得看着像中午 8 点吃的 */
  renderMealLine(x, late) {
    const supp = isSuppOnly(x);
    const macro = supp ? TF.nutrientsText(sumNutrients(x.items), 3)
      : this.isSimple() ? (x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '')
      : [x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '', x.carbsG ? `碳水 ${round1(x.carbsG)}g` : '', x.fatG ? `脂肪 ${round1(x.fatG)}g` : ''].filter(Boolean).join(' · ');
    return `<button class="mg-row" data-kind="meal" data-id="${esc(x.id)}" type="button"><span class="mg-main"><span class="mg-title">${esc(x.foodSummary)}</span>` +
      `<span class="mg-sub">${late ? '补记 ' : ''}${esc(hhmm(recordTs(x)))}${macro ? ' · ' + macro : ''}</span></span><span class="mg-val">${supp && !x.calories ? '' : fmt(x.calories)}</span></button>`;
  },

  /** 训练一张卡：头上写几个动作、消耗多少，下面一行一个动作（下次练多少写在下面），还没做的计划虚线放最后 */
  renderTrainGroup(date, s, plans) {
    const lifts = this.workouts.filter(w => w.date === date).sort((a, b) => recordTs(a) - recordTs(b));
    if (!lifts.length && !plans.length) return '';
    const simple = this.isSimple();
    const total = lifts.length ? `<span class="mg-total"><b>${fmt(s.workoutBurn)}</b> kcal<small>${lifts.length} 个${simple ? '运动' : '动作'}</small></span>`
      : `<span class="mg-total plan"><small>计划</small>${plans.length} 个动作</span>`;
    return `<section class="mgroup" data-group="train"><div class="mg-head"><span class="mg-ico lift">${ICONS.lift}</span>` +
      `<span class="mg-name">${simple ? '运动' : '训练'}${lifts.length ? `<small>${esc(hhmm(recordTs(lifts[0])))}</small>` : ''}</span>${total}</div>` +
      lifts.map(w => this.renderWorkoutLine(w)).join('') + plans.map(p => this.renderPlanRow(p, true)).join('') + '</section>';
  },

  renderWorkoutLine(x) {
    const ts = recordTs(x);
    const parts = [];
    let value;
    if (ts) parts.push(esc(hhmm(ts)));
    if (x.durationMin) {
      value = `${fmt(x.durationMin)}<small>分钟</small>`;
      parts.push(`消耗约 ${fmt(x.burnedCalories)} kcal`);
    } else {
      value = `${x.weightKg > 0 ? round1(x.weightKg) + 'kg' : '自重'}<small>${fmt(x.sets)}×${fmt(x.reps)}</small>`;
      if (x.muscleGroup) parts.push(esc(x.muscleGroup));
      const p = this.exerciseProgress(x.exerciseName);
      if (x.notes && /估计/.test(x.notes)) parts.push('有数字是估的，点开改');
      else if (p && p.isLatest(x.id) && p.next.kind !== 'keep') parts.push(`<span class="up">${esc(p.next.text)}</span>`);
    }
    const tag = TF.workoutTag(x);
    return `<button class="mg-row" data-kind="workout" data-id="${esc(x.id)}" type="button"><span class="mg-main"><span class="mg-title"><span class="tag ${tag.cls}">${tag.label}</span>${esc(x.exerciseName)}</span>` +
      `<span class="mg-sub">${parts.join(' · ')}</span></span><span class="mg-val">${value}</span></button>`;
  },

  /** 整理中 / 没整理出来的那一行（记好的按顿放进卡里，见 renderMealGroups） */
  renderRow(r) {
    const x = r.rec;
    const failed = x.status === 'failed';
    return `
        <div class="item pending ${failed ? 'failed' : ''}">
          <div class="item-icon">${failed ? ICONS.alert : '<div class="spinner"></div>'}</div>
          <div class="item-main">
            <div class="item-title">${failed ? esc(x.error || '没整理出来') : `正在整理…<span class="pending-slow" style="animation-delay:${Math.max(0, 15000 - (Date.now() - (x.startedAt || x.ts)))}ms">有点慢，稍等</span>`}</div>
            <div class="item-sub">「${esc(x.text)}」</div>
          </div>
          ${failed ? `<div class="pending-actions">
            <button class="chip" data-act="drop" data-id="${esc(x.id)}" type="button">删除</button>
            <button class="chip" data-act="edit-text" data-id="${esc(x.id)}" type="button">改字</button>
            <button class="chip chip-primary" data-act="retry" data-id="${esc(x.id)}" type="button">重试</button>
          </div>` : ''}
        </div>`;
  },

  addPending(text, ask, extra) {
    const p = Object.assign({ id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text, date: this.selectedDate, ts: Date.now(), status: 'working', ask: !!ask }, extra || {});
    this.pending.unshift(p);
    this.savePending();
    this.buddyThinking && this.buddyThinking();
    if (this.view !== 'today') this.switchView('today'); else this.render();
    return p;
  },

  finishPending(id) {
    this.pending = this.pending.filter(p => p.id !== id);
    this.savePending();
    this.buddyThinking && this.buddyThinking();
  },

  failPending(id, message) {
    const p = this.pending.find(x => x.id === id);
    if (!p) return;
    window.Haptics && window.Haptics.fire('error');
    window.Sound && window.Sound.play('error');
    p.status = 'failed';
    p.error = message || '没整理出来';
    this.savePending();
    this.buddyThinking && this.buddyThinking();
    this.render();
  },

  retryPending(id) {
    const p = this.pending.find(x => x.id === id);
    if (!p || !window.QuickLog) return;
    p.status = 'working';
    p.error = null;
    p.startedAt = Date.now();
    if (p.ask && this.showBuddyThinking) this.showBuddyThinking(p.text, p.chat ? 'chat' : '');
    this.buddyThinking && this.buddyThinking();
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
