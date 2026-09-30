/**
 * 练食AI · 主界面
 *
 * 两页：今天（还能吃多少 + 当天所有记录）、趋势（每天赤字 / 吃了多少 + 体重 + 动作进步）；设置在右上角。
 * 记录靠底部按钮一口气说完（见 js/log/），记错了点一下改。
 *
 * FitnessApp 在这里定义核心：数据、事件、页面切换、主题。各页面的方法按功能放在同目录的其它文件里，
 * 用 Object.assign(FitnessApp.prototype, …) 加到类上：today / weight / trend / settings / onboarding / editor。
 */
class FitnessApp {
  constructor() {
    this.selectedDate = getTodayDateString();
    this.view = 'today';
    this.trendDays = 7;
    this.pending = [];
    this.editing = null;

    const savedProfile = load('fit_profile', null);
    this.profile = Object.assign({}, DEFAULT_PROFILE, savedProfile || {});
    // 旧版里改过身体数据的，不再提示去设置
    if (savedProfile && !('customized' in savedProfile) &&
        (savedProfile.heightCm !== DEFAULT_PROFILE.heightCm || savedProfile.weightKg !== DEFAULT_PROFILE.weightKg || savedProfile.age !== DEFAULT_PROFILE.age)) {
      this.profile.customized = true;
    }
    this.workouts = load('fit_workouts', []);
    this.diet = load('fit_diet', []);
    this.weights = load('fit_weights', []);   // [{date, kg, ts}]，一天一条
    this.myFoods = load('fit_my_foods', []);  // 记住的食物，见 foods.js
    // 模式：eat = 只记吃的（想瘦 / 随便记记），fit = 吃和练都记（健身）
    // 老用户（已经有记录或改过身体数据）默认 fit，不打扰；新用户第一次打开先问
    this.needsOnboarding = false;
    if (!this.profile.mode) {
      if (this.workouts.length || this.diet.length || this.profile.customized) this.profile.mode = 'fit';
      else this.needsOnboarding = true;
    }
    this.recalculateMetabolism();

    // 上次没整理完就关了 App 的，恢复成「失败，可重试」
    this.pending = load(PENDING_KEY, []).map(p => Object.assign(p, { status: 'failed', error: '上次没整理完' }));

    this.bindEvents();
    this.applyTheme(load('trainfit_theme_v2', null) || this.legacyTheme());
    this.applyMode();
    this.render();
    if (this.needsOnboarding) this.showOnboarding();

    // 跨天了自动回到今天
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.lastToday && this.lastToday !== getTodayDateString() && this.selectedDate === this.lastToday) {
        this.selectedDate = getTodayDateString();
        this.render();
      }
    });
  }

  legacyTheme() {
    try { return localStorage.getItem('trainfit_theme') || 'system'; } catch (e) { return 'system'; }
  }

  saveData() {
    this._backupDirty = true; // 切到后台时自动备份一份（见 backup.js）
    store('fit_profile', this.profile);
    store('fit_workouts', this.workouts);
    store('fit_diet', this.diet);
    store('fit_weights', this.weights);
  }

  savePending() {
    store(PENDING_KEY, this.pending.map(p => ({ id: p.id, text: p.text, date: p.date, ts: p.ts })));
  }

  /** 只记吃的模式：藏起训练、蛋白质、赤字这些健身词 */
  isSimple() { return this.profile.mode === 'eat'; }

  applyMode() {
    const simple = this.isSimple();
    document.body.classList.toggle('mode-eat', simple);
    const t = document.getElementById('cmp-text');
    if (t) t.placeholder = simple ? '今天吃了啥？' : '今天练了啥、吃了啥？';
    const tip = document.getElementById('cmp-tip');
    if (tip) tip.textContent = simple ? '按住说今天吃了啥，松手自动算好热量' : '按住把练了啥、吃了啥一口气说完，松手自动记好';
  }

  recalculateMetabolism() {
    const { gender, heightCm, weightKg, age } = this.profile;
    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (gender === 'female' ? -161 : 5);
    this.profile.bmr = Math.round(bmr);
    this.profile.tdee = Math.round(bmr * 1.45);
  }

  getDaySummary(dateStr) {
    const ws = this.workouts.filter(w => w.date === dateStr);
    const ds = this.diet.filter(d => d.date === dateStr);
    const workoutBurn = ws.reduce((s, w) => s + (w.burnedCalories || 0), 0);
    const intake = ds.reduce((s, d) => s + (d.calories || 0), 0);
    const protein = ds.reduce((s, d) => s + (d.proteinG || 0), 0);
    const fat = ds.reduce((s, d) => s + (d.fatG || 0), 0);
    // 补剂：吃了哪些、合计含多少营养素（健康度温度计用）
    const supps = [];
    const nutrients = {};
    ds.forEach(d => (d.items || []).forEach(it => {
      if (it.supp && !supps.includes(it.name)) supps.push(it.name);
      Object.keys(it.nutrients || {}).forEach(k => { nutrients[k] = round1((nutrients[k] || 0) + it.nutrients[k]); });
    }));
    const totalBurn = this.profile.tdee + workoutBurn;
    const budget = totalBurn - (this.profile.targetDeficitKcal || 0);
    return {
      date: dateStr,
      hasLogs: ws.length > 0 || ds.length > 0,
      hasDiet: ds.length > 0,
      workoutBurn,
      intake,
      protein: round1(protein),
      fat: round1(fat),
      supps,
      nutrients,
      totalBurn,
      budget,
      remaining: budget - intake,
      deficit: totalBurn - intake,
      totalVolume: ws.reduce((s, w) => s + (w.weightKg || 0) * (w.sets || 0) * (w.reps || 0), 0)
    };
  }

  /** 某个动作：最近一次成绩 + 下次建议（双重累进） */
  exerciseProgress(name) {
    const logs = this.workouts
      .filter(w => w.exerciseName === name && !w.durationMin)
      .sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)));
    if (!logs.length) return null;
    const last = logs[0];
    const compound = isCompound(name);
    const cap = compound ? 8 : 12;
    const step = compound ? 2.5 : 1;
    let next;
    if (last.weightKg > 0 && last.reps >= cap && last.sets >= 3) {
      next = { kind: 'weight', text: `下次试 ${round1(last.weightKg + step)}kg`, weightKg: round1(last.weightKg + step), reps: Math.max(6, last.reps - 2) };
    } else if (last.reps < cap) {
      next = { kind: 'reps', text: `下次冲 ${last.reps + 1} 次`, weightKg: last.weightKg, reps: last.reps + 1 };
    } else {
      next = { kind: 'keep', text: '保持，练扎实', weightKg: last.weightKg, reps: last.reps };
    }
    const best = logs.reduce((m, w) => Math.max(m, w.weightKg || 0), 0);
    return { last, next, count: logs.length, best, isLatest: (id) => id === last.id };
  }

  bindEvents() {
    const $ = (id) => document.getElementById(id);

    document.querySelectorAll('#tabs .tab').forEach(b => b.addEventListener('click', () => { if (this.view !== b.dataset.view) window.Haptics && window.Haptics.fire('tick'); this.switchView(b.dataset.view); }));
    this.bindQuick();
    $('btn-settings').addEventListener('click', () => this.switchView(this.view === 'settings' ? 'today' : 'settings'));
    $('date-prev').addEventListener('click', () => this.shiftDate(-1));
    $('date-next').addEventListener('click', () => this.shiftDate(1));
    this.bindGaugePop();
    this.bindBackup();
    this.bindShare();
    this.bindBuddy();
    this.bindBuddySettings();
    $('date-label').addEventListener('click', () => { this.selectedDate = getTodayDateString(); this.render(); });
    $('setup-hint').addEventListener('click', () => this.switchView('settings'));
    $('weight-log').addEventListener('click', () => this.openWeightEditor(getTodayDateString()));
    this.bindOnboarding();

    // 左右滑动切换日期
    let sx = 0, sy = 0;
    const today = $('view-today');
    today.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    today.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) this.shiftDate(dx > 0 ? -1 : 1);
    }, { passive: true });

    $('timeline').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        const id = act.dataset.id;
        if (act.dataset.act === 'retry') this.retryPending(id);
        else if (act.dataset.act === 'drop') this.dropPending(id);
        else if (act.dataset.act === 'edit-text') this.editPendingText(id);
        return;
      }
      const quick = e.target.closest('[data-quick-key]');
      if (quick) { this.quickRepeatKey(quick.dataset.quickKey); return; }
      const item = e.target.closest('.item[data-kind]');
      if (item) this.openEditor(item.dataset.kind, item.dataset.id);
    });

    // 趋势
    $('trend-range').addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (!b) return;
      this.trendDays = Number(b.dataset.range);
      this.renderTrend();
    });

    // 设置
    this.bindSettings();
    this.bindReminders();

    // 编辑
    $('edit-form').addEventListener('submit', (e) => { e.preventDefault(); this.saveEditor(); });
    $('edit-cancel').addEventListener('click', () => this.closeEditor());
    $('edit-delete').addEventListener('click', () => this.deleteEditing());
    $('edit-overlay').addEventListener('click', (e) => { if (e.target.id === 'edit-overlay') this.closeEditor(); });

    // 安卓返回键：WebView 有历史就先后退，这里用 hash 管理弹层和页面
    window.addEventListener('popstate', () => {
      // 保存 / 取消弹层时自己调的 history.back()：只关弹层，别跟着回到今天页
      if (this._editorBack) { this._editorBack = false; return; }
      if (!$('share-overlay').classList.contains('hidden')) this.closeShare(true);
      else if (!$('edit-overlay').classList.contains('hidden')) this.closeEditor(true);
      else if (this.view !== 'today') this.switchView('today', true);
    });
  }

  switchView(view, fromBack) {
    const prev = this.view;
    if (window.QuickLog && prev !== view) window.QuickLog.hideSnack();
    this.view = view;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const isSettings = view === 'settings';
    document.getElementById('tabs').classList.toggle('hidden', isSettings);
    const title = document.getElementById('view-title');
    title.classList.toggle('hidden', !isSettings);
    title.textContent = isSettings ? '设置' : '';
    document.getElementById('composer').classList.toggle('hidden', view !== 'today');
    document.getElementById('btn-share').classList.toggle('hidden', view !== 'today');
    document.body.classList.toggle('no-composer', view !== 'today');
    const sb = document.getElementById('btn-settings');
    sb.innerHTML = isSettings ? ICON_CLOSE : ICON_SETTINGS;
    sb.setAttribute('aria-label', isSettings ? '关闭设置' : '设置');
    if (!fromBack && prev === 'today' && view !== 'today') history.pushState({ v: view }, '');
    else if (!fromBack && prev !== 'today' && view === 'today' && history.state && history.state.v) history.back();
    window.scrollTo(0, 0);
    this.render();
  }

  shiftDate(delta) {
    const next = shiftDateString(this.selectedDate, delta);
    if (next > getTodayDateString()) return;
    window.Haptics && window.Haptics.fire('tick');
    this.selectedDate = next;
    this.render();
  }

  /** 把今天的状态告诉安卓，提醒时用（午饭记了就不提醒午饭；晚间小结写还能吃多少） */
  pushDayState() {
    try {
      if (!window.TrainFitNative || !window.TrainFitNative.updateDayState) return;
      const today = getTodayDateString();
      const s = this.getDaySummary(today);
      const meals = [...new Set(this.diet.filter(d => d.date === today).map(d => d.mealType))];
      const count = this.diet.filter(d => d.date === today).length + this.workouts.filter(w => w.date === today).length;
      window.TrainFitNative.updateDayState(JSON.stringify({
        date: today, meals, count,
        remaining: Math.round(s.remaining),
        showProtein: true,
        proteinLeft: Math.max(0, Math.round(this.gaugeProteinTarget() - s.protein))
      }));
    } catch (e) {}
  }

  render() {
    this.lastToday = getTodayDateString();
    this.pushDayState();
    if (this.view === 'today') this.renderToday();
    else if (this.view === 'trend') this.renderTrend();
    else if (this.view === 'settings') this.renderSettings();
    this.renderBuddy();
  }

  /** 系统当前是不是浅色：安卓 App 问原生，浏览器看 prefers-color-scheme */
  systemIsLight() {
    try {
      if (window.TrainFitNative && window.TrainFitNative.isSystemDark) return !window.TrainFitNative.isSystemDark();
    } catch (e) {}
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
  }

  applyTheme(theme) {
    this.theme = ['light', 'dark', 'system'].includes(theme) ? theme : 'system';
    const light = this.theme === 'light' || (this.theme === 'system' && this.systemIsLight());
    const root = document.documentElement;
    root.classList.add('theme-switching');
    root.setAttribute('data-theme', light ? 'light' : 'dark');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f4f4f3' : '#0b0b0d');
    try { localStorage.setItem('trainfit_theme', this.theme); } catch (e) {}
    try { window.TrainFitNative && window.TrainFitNative.setSystemBarsLight && window.TrainFitNative.setSystemBarsLight(!!light); } catch (e) {}
    if (!this._mqBound && window.matchMedia) {
      this._mqBound = true;
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const onChange = () => { if (this.theme === 'system') this.applyTheme('system'); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
    }
  }

  showToast(msg) {
    const t = document.getElementById('app-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.FitnessApp = FitnessApp;
  // 等其它文件把方法都加到 FitnessApp 上之后再创建
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new FitnessApp();
  });
}
