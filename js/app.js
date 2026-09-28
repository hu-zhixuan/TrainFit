/**
 * 练食AI · 精简版
 *
 * 两页：今天（还能吃多少 + 当天所有记录）、趋势（每天缺口 + 动作进步）；设置在右上角。
 * 记录靠底部按钮一口气说完（见 quick_log.js），记错了点一下改。
 * 数据沿用旧版 localStorage：fit_profile / fit_workouts / fit_diet。
 */

// ---------------------------------------------------------------------------
// 日期（一律用本地日期；toISOString 是 UTC，北京时间 0–8 点会算到前一天）
// ---------------------------------------------------------------------------
function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getTodayDateString(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  return formatLocalDate(d);
}
function shiftDateString(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return formatLocalDate(d);
}

const DEFAULT_PROFILE = {
  gender: 'male',
  heightCm: 175,
  weightKg: 72.0,
  age: 26,
  bmr: 1650,
  tdee: 2392,
  goalType: 'fat_loss',
  targetDeficitKcal: 450,
  targetProteinG: 144,
  targetCarbsG: 238,
  targetFatG: 58
};

const GOAL_DEFICIT = { fat_loss: 450, maintain: 0, muscle_gain: -250 };
const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐/补剂'];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PENDING_KEY = 'tf_pending';

const REMINDER_DEFAULTS = [
  { id: 'lunch', enabled: true, time: '12:40' },
  { id: 'dinner', enabled: true, time: '19:30' },
  { id: 'night', enabled: true, time: '21:30' }
];

const svgIcon = (d, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_SETTINGS = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.2" fill="var(--bg)"/><circle cx="15" cy="17" r="2.2" fill="var(--bg)"/></svg>';
const ICON_CLOSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const ICONS = {
  meal: svgIcon('<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5M16 3.5c-.6.8-.6 1.7 0 2.5"/>'),
  lift: svgIcon('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  cardio: svgIcon('<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
  alert: svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5v.01"/>'),
  mic: svgIcon('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>', 24)
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(n) { return Math.round(n || 0).toLocaleString('zh-CN'); }
function round1(n) { return Math.round((n || 0) * 10) / 10; }
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}
/** 记录的时间戳：新记录有 ts，旧记录从 id（w_1727…）里取 */
function recordTs(r) {
  if (r.ts) return r.ts;
  const m = /_(\d{12,})/.exec(r.id || '');
  return m ? Number(m[1]) : 0;
}
function hhmm(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function isCompound(name) {
  return /卧推|深蹲|硬拉|划船|推举|倒蹬|腿举/.test(name || '');
}

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

  // ======================= 数据 =======================
  saveData() {
    store('fit_profile', this.profile);
    store('fit_workouts', this.workouts);
    store('fit_diet', this.diet);
    store('fit_weights', this.weights);
  }

  /** 只记吃的模式：藏起训练、蛋白质、缺口这些健身词 */
  isSimple() { return this.profile.mode === 'eat'; }

  applyMode() {
    const simple = this.isSimple();
    document.body.classList.toggle('mode-eat', simple);
    const t = document.getElementById('cmp-text');
    if (t) t.placeholder = simple ? '今天吃了啥？' : '今天练了啥、吃了啥？';
    const tip = document.getElementById('cmp-tip');
    if (tip) tip.textContent = simple ? '按住说今天吃了啥，松手自动算好热量' : '按住把练了啥、吃了啥一口气说完，松手自动记好';
  }

  // ======================= 体重 =======================
  latestWeight() {
    return this.weights.length ? this.weights[this.weights.length - 1] : null;
  }

  weightOn(date) {
    return this.weights.find(w => w.date === date) || null;
  }

  /** 记一天的体重（同一天再说一次就覆盖），返回原来那条，撤销用 */
  setWeight(date, kg) {
    const prev = this.weightOn(date);
    this.weights = this.weights.filter(w => w.date !== date);
    this.weights.push({ date, kg: round1(kg), ts: Date.now() });
    this.weights.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    this.syncProfileWeight();
    this.saveData();
    return prev ? Object.assign({}, prev) : null;
  }

  removeWeight(date) {
    const prev = this.weightOn(date);
    this.weights = this.weights.filter(w => w.date !== date);
    this.syncProfileWeight();
    this.saveData();
    return prev;
  }

  restoreWeight(date, prev) {
    this.weights = this.weights.filter(w => w.date !== date);
    if (prev) {
      this.weights.push(prev);
      this.weights.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    }
    this.syncProfileWeight();
  }

  /** 最新体重就是身体数据里的体重（热量预算跟着变） */
  syncProfileWeight() {
    const w = this.latestWeight();
    if (!w || w.kg === this.profile.weightKg) return;
    const autoProtein = !this.profile.proteinTouched &&
      (this.profile.targetProteinG === Math.round(this.profile.weightKg * 2) || this.profile.targetProteinG === DEFAULT_PROFILE.targetProteinG);
    this.profile.weightKg = w.kg;
    if (autoProtein) this.profile.targetProteinG = Math.round(w.kg * 2);
    this.recalculateMetabolism();
  }

  /** 和大约一周前比 */
  weightTrend() {
    const last = this.latestWeight();
    if (!last) return null;
    const weekAgo = shiftDateString(last.date, -7);
    const older = this.weights.filter(w => w.date < last.date);
    if (!older.length) return { last, delta: null };
    const base = older.filter(w => w.date <= weekAgo).pop() || older[0];
    const days = Math.round((new Date(last.date + 'T00:00:00') - new Date(base.date + 'T00:00:00')) / 86400000);
    return { last, delta: round1(last.kg - base.kg), days };
  }

  savePending() {
    store(PENDING_KEY, this.pending.map(p => ({ id: p.id, text: p.text, date: p.date, ts: p.ts })));
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
    const totalBurn = this.profile.tdee + workoutBurn;
    const budget = totalBurn - (this.profile.targetDeficitKcal || 0);
    return {
      date: dateStr,
      hasLogs: ws.length > 0 || ds.length > 0,
      hasDiet: ds.length > 0,
      workoutBurn,
      intake,
      protein: round1(protein),
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

  // ======================= 界面事件 =======================
  bindEvents() {
    const $ = (id) => document.getElementById(id);

    document.querySelectorAll('#tabs .tab').forEach(b => b.addEventListener('click', () => { if (this.view !== b.dataset.view) window.Haptics && window.Haptics.fire('tick'); this.switchView(b.dataset.view); }));
    $('cmp-chips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-quick]');
      if (c) this.quickRepeat(Number(c.dataset.quick));
    });
    $('btn-settings').addEventListener('click', () => this.switchView(this.view === 'settings' ? 'today' : 'settings'));
    $('date-prev').addEventListener('click', () => this.shiftDate(-1));
    $('date-next').addEventListener('click', () => this.shiftDate(1));
    $('date-label').addEventListener('click', () => { this.selectedDate = getTodayDateString(); this.render(); });
    $('setup-hint').addEventListener('click', () => this.switchView('settings'));
    $('weight-row').addEventListener('click', () => this.openWeightEditor(this.selectedDate));
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
      if (!$('edit-overlay').classList.contains('hidden')) this.closeEditor(true);
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

  // ======================= 渲染 =======================
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
        showProtein: !this.isSimple(),
        proteinLeft: Math.max(0, Math.round((this.profile.targetProteinG || 0) - s.protein))
      }));
    } catch (e) {}
  }

  render() {
    this.lastToday = getTodayDateString();
    this.pushDayState();
    if (this.view === 'today') this.renderToday();
    else if (this.view === 'trend') this.renderTrend();
    else if (this.view === 'settings') this.renderSettings();
  }

  dateLabel(dateStr) {
    const today = getTodayDateString();
    const d = new Date(dateStr + 'T00:00:00');
    const md = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (dateStr === today) return '今天 · ' + md;
    if (dateStr === shiftDateString(today, -1)) return '昨天 · ' + md;
    return `${md} 周${WEEKDAYS[d.getDay()]}`;
  }

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
  }

  renderWeightRow(date) {
    const $ = (id) => document.getElementById(id);
    const on = this.weightOn(date);
    const tr = this.weightTrend();
    const main = $('wr-main'), sub = $('wr-sub');
    if (on) {
      main.innerHTML = `${round1(on.kg)}<small>kg</small>`;
      const isLatest = tr && tr.last.date === on.date;
      if (isLatest && tr.delta !== null) {
        const down = tr.delta < 0;
        sub.textContent = tr.delta === 0 ? `和 ${tr.days} 天前一样` : `比 ${tr.days} 天前${down ? '轻' : '重'} ${Math.abs(tr.delta)} kg`;
        sub.className = 'wr-sub ' + (tr.delta === 0 ? '' : (down === ((this.profile.targetDeficitKcal || 0) >= 0) ? 'good' : 'bad'));
      } else {
        sub.textContent = '点一下可以改';
        sub.className = 'wr-sub';
      }
    } else if (tr) {
      main.innerHTML = `<span class="wr-muted">上次 ${round1(tr.last.kg)} kg</span>`;
      sub.textContent = date === getTodayDateString() ? '说「体重 62」或点这里记今天的' : '点这里补记这天的体重';
      sub.className = 'wr-sub';
    } else {
      main.innerHTML = '<span class="wr-muted">还没记</span>';
      sub.textContent = '说「体重 62.5」就能记，也可以点这里';
      sub.className = 'wr-sub';
    }
  }

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
  }

  renderChips() {
    const el = document.getElementById('cmp-chips');
    this._quick = this.quickSuggestions();
    el.innerHTML = this._quick.map((q, i) =>
      `<button type="button" class="qchip ${q.kind}" data-quick="${i}"><span class="qplus">+</span>${esc(q.label)}</button>`).join('');
    el.classList.toggle('hidden', !this._quick.length);
  }

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
  }

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
  }

  // ----------------------- 趋势 -----------------------
  renderTrend() {
    const $ = (id) => document.getElementById(id);
    document.querySelectorAll('#trend-range .seg-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === this.trendDays));

    const today = getTodayDateString();
    const simple = this.isSimple();
    const days = [];
    for (let i = this.trendDays - 1; i >= 0; i--) {
      const date = shiftDateString(today, -i);
      const s = this.getDaySummary(date);
      days.push({ date, summary: s, value: s.hasDiet ? (simple ? s.intake : s.deficit) : null });
    }
    const logged = days.filter(d => d.value !== null);
    const total = logged.reduce((a, d) => a + d.value, 0);
    $('tr-days').textContent = days.filter(d => d.summary.hasLogs).length;

    if (simple) {
      const overDays = logged.filter(d => d.summary.remaining < 0).length;
      $('tr-avg-l').textContent = '平均每天吃';
      $('tr-avg').textContent = logged.length ? fmt(total / logged.length) : '–';
      $('tr-avg-u').textContent = 'kcal';
      $('tr-fat-l').textContent = '超预算';
      $('tr-fat').textContent = logged.length ? overDays : '–';
      $('tr-fat-u').textContent = '天';
      $('trend-chart-title').textContent = '每天吃了多少';
      $('trend-legend').innerHTML = '<span><i class="sw sw-pos"></i>没超</span><span><i class="sw sw-neg"></i>超了</span><span><i class="sw sw-target"></i>预算</span>';
      const budget = this.profile.tdee - (this.profile.targetDeficitKcal || 0);
      this.drawBarChart($('trend-chart'), days, {
        target: budget,
        cls: (d) => (d.summary.remaining < 0 ? 'bar-neg' : 'bar-pos'),
        tip: (d) => (d.value === null ? '没记饮食' : `吃了 ${fmt(d.value)} kcal${d.summary.remaining < 0 ? `，超 ${fmt(-d.summary.remaining)}` : ''}`),
        empty: '记几天饮食后，这里会显示每天吃了多少',
        aria: '每天摄入热量柱状图'
      });
    } else {
      const target = this.profile.targetDeficitKcal || 0;
      $('tr-avg-l').textContent = '平均每天缺口';
      $('tr-avg').textContent = logged.length ? fmt(total / logged.length) : '–';
      $('tr-avg-u').textContent = 'kcal';
      $('tr-fat-l').textContent = '折合脂肪';
      $('tr-fat').textContent = logged.length ? (total / 7700).toFixed(2) : '–';
      $('tr-fat-u').textContent = 'kg';
      $('trend-chart-title').textContent = '每天热量缺口';
      $('trend-legend').innerHTML = '<span><i class="sw sw-pos"></i>缺口</span><span><i class="sw sw-neg"></i>超出</span><span><i class="sw sw-target"></i>目标</span>';
      this.drawBarChart($('trend-chart'), days, {
        target: target > 0 ? target : null,
        cls: (d) => (d.value > 0 ? 'bar-pos' : 'bar-neg'),
        tip: (d) => (d.value === null ? '没记饮食' : (d.value >= 0 ? `缺口 ${fmt(d.value)} kcal` : `超出 ${fmt(-d.value)} kcal`)),
        empty: '记几天饮食后，这里会显示每天的热量缺口',
        aria: '每天热量缺口柱状图'
      });
    }
    this.drawWeightChart($('weight-chart'), shiftDateString(today, -(this.trendDays - 1)));
    this.renderProgressList($('progress-list'));
  }

  drawWeightChart(el, since) {
    const pts = this.weights.filter(w => w.date >= since);
    const tr = this.weightTrend();
    const legend = document.getElementById('weight-legend');
    legend.textContent = tr ? `最新 ${round1(tr.last.kg)} kg` : '';
    if (pts.length < 2) {
      el.innerHTML = `<div class="chart-empty">${this.weights.length ? '再记几天体重，这里会画出变化曲线' : '说「体重 62.5」就能记，记几天后这里会画出曲线'}</div>`;
      return;
    }
    const W = 340, H = 150, padL = 40, padR = 12, padT = 12, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    const kgs = pts.map(p => p.kg);
    let lo = Math.min(...kgs), hi = Math.max(...kgs);
    const span = Math.max(1, hi - lo);
    lo = Math.floor((lo - span * 0.25) * 2) / 2;
    hi = Math.ceil((hi + span * 0.25) * 2) / 2;
    const t0 = new Date(since + 'T00:00:00').getTime();
    const t1 = new Date(getTodayDateString() + 'T00:00:00').getTime();
    const x = (date) => padL + ((new Date(date + 'T00:00:00').getTime() - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (kg) => padT + ((hi - kg) / (hi - lo)) * ih;
    let grid = '';
    const step = (hi - lo) <= 2 ? 0.5 : (hi - lo) <= 5 ? 1 : 2;
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-6; v += step) {
      grid += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-text" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${round1(v)}</text>`;
    }
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle class="w-dot" cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.2"><title>${p.date.slice(5).replace('-', '/')} ${round1(p.kg)} kg</title></circle>`).join('');
    const md = (d) => d.slice(5).replace('-', '/').replace(/^0/, '');
    const labels = `<text class="axis-text" x="${padL}" y="${H - 6}" text-anchor="start">${md(since)}</text><text class="axis-text" x="${W - padR}" y="${H - 6}" text-anchor="end">今天</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="体重变化曲线">${grid}<path class="w-line" d="${path}"/>${dots}${labels}</svg>`;
  }

  drawBarChart(el, days, opts) {
    const target = opts.target;
    const vals = days.map(d => d.value).filter(v => v !== null);
    if (!vals.length) {
      el.innerHTML = `<div class="chart-empty">${esc(opts.empty)}</div>`;
      return;
    }
    const W = 340, H = 180, padL = 40, padR = 6, padT = 10, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    let max = Math.max(target || 0, ...vals, 0);
    let min = Math.min(0, ...vals, target || 0);
    const niceStep = (range) => {
      const raw = range / 3;
      const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
      const n = raw / mag;
      return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
    };
    const step = niceStep(max - min || 500);
    max = Math.ceil(max / step) * step || step;
    min = Math.floor(min / step) * step;
    const y = (v) => padT + ((max - v) / (max - min)) * ih;
    const n = days.length;
    const slot = iw / n;
    const gap = n > 14 ? 2 : 6;
    const bw = Math.max(2, slot - gap);
    const r = Math.min(4, bw / 2);

    let grid = '';
    for (let v = min; v <= max + 0.001; v += step) {
      grid += `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/>`;
      grid += `<text class="axis-text" x="${padL - 6}" y="${y(v) + 3}" text-anchor="end">${fmt(v)}</text>`;
    }
    const y0 = y(0);
    let bars = '';
    let labels = '';
    days.forEach((d, i) => {
      const x = padL + i * slot + (slot - bw) / 2;
      const md = d.date.slice(5).replace('-', '/').replace(/^0/, '');
      const showLabel = n <= 7 || i % 5 === (n - 1) % 5;
      if (showLabel) labels += `<text class="axis-text" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${n <= 7 ? '周' + WEEKDAYS[new Date(d.date + 'T00:00:00').getDay()] : md}</text>`;
      if (d.value !== null && d.value !== 0) {
        const pos = d.value > 0;
        const top = pos ? y(d.value) : y0;
        const h = Math.max(1, Math.abs(y(d.value) - y0));
        // 数据端圆角、基线端直角
        const path = pos
          ? `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y0} Z`
          : `M${x},${y0} V${y0 + h - r} Q${x},${y0 + h} ${x + r},${y0 + h} H${x + bw - r} Q${x + bw},${y0 + h} ${x + bw},${y0 + h - r} V${y0} Z`;
        bars += `<path class="${opts.cls(d)}" d="${path}"/>`;
      }
      const tip = opts.tip(d);
 bars += `<rect class="bar-hit" data-i="${i}" data-date="${d.date}" data-tip="${esc(md + ' · ' + tip)}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${ih}"><title>${esc(md + ' ' + tip)}</title></rect>`;
    });
    const targetLine = target ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : '';

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.aria)}">${grid}${targetLine}${bars}${labels}</svg><div class="chart-tip hidden"></div>`;

    const tipEl = el.querySelector('.chart-tip');
    const svg = el.querySelector('svg');
    el.querySelectorAll('.bar-hit').forEach(h => {
      h.addEventListener('mouseenter', () => {
        const box = svg.getBoundingClientRect();
        const scale = box.width / W;
        const [md, text] = h.dataset.tip.split(' · ');
        tipEl.innerHTML = `<span>${esc(md)}</span> ${esc(text)}`;
        const v = days[Number(h.dataset.i)].value;
        const topY = v === null ? y0 : Math.min(y(Math.max(v, 0)), y0);
        tipEl.style.left = Math.min(Math.max((Number(h.getAttribute('x')) + slot / 2) * scale, 60), box.width - 60) + 'px';
        tipEl.style.top = Math.max(topY * scale - 6, 34) + 'px';
        tipEl.classList.remove('hidden');
      });
      h.addEventListener('mouseleave', () => tipEl.classList.add('hidden'));
      h.addEventListener('click', () => {
        this.selectedDate = h.dataset.date;
        this.switchView('today');
      });
    });
  }

  renderProgressList(el) {
    const names = [];
    this.workouts
      .filter(w => !w.durationMin)
      .sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)))
      .forEach(w => { if (!names.includes(w.exerciseName)) names.push(w.exerciseName); });
    if (!names.length) {
      el.innerHTML = `<div class="empty">记几次力量训练后，这里会告诉你每个动作下次该加重量还是加次数</div>`;
      return;
    }
    el.innerHTML = names.slice(0, 12).map(name => {
      const p = this.exerciseProgress(name);
      const l = p.last;
      const d = new Date(l.date + 'T00:00:00');
      return `
        <div class="progress-item">
          <div class="progress-name">${esc(name)}</div>
          <div class="progress-last">${l.weightKg > 0 ? round1(l.weightKg) + 'kg' : '自重'} × ${l.sets} × ${l.reps}</div>
          <div class="progress-sub">${d.getMonth() + 1}/${d.getDate()} · 共 ${p.count} 次${p.best > 0 ? ` · 最重 ${round1(p.best)}kg` : ''}</div>
          <div class="progress-next">${esc(p.next.text)}</div>
        </div>`;
    }).join('');
  }

  // ----------------------- 设置 -----------------------
  bindSettings() {
    const $ = (id) => document.getElementById(id);
    const segPick = (id, fn) => $(id).addEventListener('click', (e) => {
      const b = e.target.closest('.seg-btn');
      if (b) fn(b.dataset.value);
    });

    segPick('set-gender', (v) => { this.profile.gender = v; this.onProfileChange(); });
    segPick('set-mode', (v) => {
      if (this.profile.mode === v) return;
      this.profile.mode = v;
      this.applyMode();
      this.onProfileChange();
    });
    segPick('set-goal', (v) => {
      this.profile.goalType = v;
      this.profile.targetDeficitKcal = GOAL_DEFICIT[v];
      this.onProfileChange();
    });
    segPick('set-theme', (v) => { this.applyTheme(v); store('trainfit_theme_v2', v); this.renderSettings(); });

    const num = (id, key, min, max) => $(id).addEventListener('change', () => {
      const v = parseFloat($(id).value);
      if (Number.isFinite(v) && v >= min && v <= max) {
        // 蛋白质目标之前是自动算的（体重×2 或默认值）才跟着体重变
        const autoProtein = !this.profile.proteinTouched &&
          (this.profile.targetProteinG === Math.round(this.profile.weightKg * 2) || this.profile.targetProteinG === DEFAULT_PROFILE.targetProteinG);
        this.profile[key] = key === 'weightKg' ? round1(v) : Math.round(v);
        if (key === 'weightKg' && autoProtein) this.profile.targetProteinG = Math.round(this.profile.weightKg * 2);
        if (key === 'targetProteinG') this.profile.proteinTouched = true;
        this.onProfileChange();
      } else {
        this.renderSettings();
      }
    });
    num('set-height', 'heightCm', 100, 250);
    num('set-weight', 'weightKg', 30, 250);
    num('set-age', 'age', 10, 100);
    num('set-deficit', 'targetDeficitKcal', -2000, 2000);
    num('set-protein', 'targetProteinG', 20, 400);

    $('set-clear').addEventListener('click', () => {
      if (!confirm('清空所有饮食、训练和体重记录？身体数据会保留。此操作不能撤销。')) return;
      this.workouts = [];
      this.diet = [];
      this.weights = [];
      this.pending = [];
      this.saveData();
      this.savePending();
      this.showToast('已清空');
      this.renderSettings();
    });
  }

  // ======================= 第一次打开 =======================
  showOnboarding() {
    const ob = document.getElementById('onboard');
    ob.classList.remove('hidden');
    document.getElementById('ob-step-1').classList.remove('hidden');
    document.getElementById('ob-step-2').classList.add('hidden');
    document.body.classList.add('onboarding');
  }

  bindOnboarding() {
    const $ = (id) => document.getElementById(id);
    let pick = null;
    let gender = 'male';
    let goal = 'fat_loss';
    const setSeg = (id, v) => document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.classList.toggle('active', b.dataset.value === v));

    $('onboard').addEventListener('click', (e) => {
      const opt = e.target.closest('[data-pick]');
      if (!opt) return;
      pick = opt.dataset.pick;
      window.Haptics && window.Haptics.fire('tap');
      $('ob-goal-field').classList.toggle('hidden', pick !== 'fit');
      $('ob-step-2-sub').textContent = pick === 'track'
        ? '用来估你每天大概消耗多少，好告诉你吃得多还是少。数据只存在这台手机上。'
        : '用来估你每天大概消耗多少，热量预算才准。数据只存在这台手机上。';
      $('ob-step-1').classList.add('hidden');
      $('ob-step-2').classList.remove('hidden');
      setSeg('ob-gender', gender);
      setSeg('ob-goal', goal);
    });
    $('ob-gender').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (b) { gender = b.dataset.value; setSeg('ob-gender', gender); } });
    $('ob-goal').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (b) { goal = b.dataset.value; setSeg('ob-goal', goal); } });
    $('ob-back').addEventListener('click', () => { $('ob-step-2').classList.add('hidden'); $('ob-step-1').classList.remove('hidden'); });

    const finish = (useInputs) => {
      const p = this.profile;
      p.mode = pick === 'fit' ? 'fit' : 'eat';
      p.goalType = pick === 'track' ? 'maintain' : pick === 'lose' ? 'fat_loss' : goal;
      p.targetDeficitKcal = GOAL_DEFICIT[p.goalType];
      p.gender = gender;
      if (useInputs) {
        const v = (id, min, max) => { const n = parseFloat($(id).value); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
        const h = v('ob-height', 100, 250), w = v('ob-weight', 25, 300), a = v('ob-age', 10, 100);
        if (h) p.heightCm = Math.round(h);
        if (a) p.age = Math.round(a);
        if (w) {
          p.weightKg = round1(w);
          if (!p.proteinTouched) p.targetProteinG = Math.round(w * 2);
          this.weights = this.weights.filter(x => x.date !== getTodayDateString());
          this.weights.push({ date: getTodayDateString(), kg: round1(w), ts: Date.now() });
        }
        if (h || w || a) p.customized = true;
      }
      this.needsOnboarding = false;
      this.recalculateMetabolism();
      this.saveData();
      this.applyMode();
      $('onboard').classList.add('hidden');
      document.body.classList.remove('onboarding');
      window.Haptics && window.Haptics.fire('success');
      this.render();
    };
    $('ob-done').addEventListener('click', () => finish(true));
    $('ob-skip').addEventListener('click', () => finish(false));
  }

  // ======================= 提醒 =======================
  hasNotifApi() { return !!(window.TrainFitNative && window.TrainFitNative.setReminders); }

  loadReminders() {
    const saved = load('tf_reminders', null);
    return REMINDER_DEFAULTS.map(d => Object.assign({}, d, (saved || []).find(x => x.id === d.id) || {}));
  }

  /** 保存并交给安卓排闹钟（没有通知权限时一律不排） */
  applyReminders(list, granted) {
    store('tf_reminders', list);
    if (!this.hasNotifApi()) return;
    const ok = granted !== undefined ? granted : !!(window.TrainFitNative.notificationsEnabled && window.TrainFitNative.notificationsEnabled());
    try { window.TrainFitNative.setReminders(JSON.stringify(list.map(r => Object.assign({}, r, { enabled: r.enabled && ok })))); } catch (e) {}
  }

  requestNotif(cb) {
    if (!this.hasNotifApi() || !window.TrainFitNative.requestNotifications) { cb(false); return; }
    window.__tfNotifPerm = (granted) => { window.__tfNotifPerm = null; cb(!!granted); };
    try { window.TrainFitNative.requestNotifications(); } catch (e) { cb(false); }
  }

  bindReminders() {
    const $ = (id) => document.getElementById(id);
    const asked = () => { try { return !!localStorage.getItem('tf_remind_asked'); } catch (e) { return true; } };
    const markAsked = () => { try { localStorage.setItem('tf_remind_asked', '1'); } catch (e) {} };

    // 启动时同步一次（重装 / 更新后安卓那边可能没有）
    if (this.hasNotifApi() && asked()) this.applyReminders(this.loadReminders());

    $('remind-yes').addEventListener('click', () => {
      markAsked();
      this.requestNotif((granted) => {
        this.applyReminders(this.loadReminders().map(r => Object.assign(r, { enabled: true })), granted);
        this.showToast(granted ? '已开启提醒，可以在设置里改时间' : '通知权限没打开，可以稍后在设置里开');
        this.render();
      });
    });
    $('remind-no').addEventListener('click', () => {
      markAsked();
      this.applyReminders(this.loadReminders().map(r => Object.assign(r, { enabled: false })), false);
      this.render();
    });

    ['lunch', 'dinner', 'night'].forEach(id => {
      const box = $('rem-' + id), time = $('rem-' + id + '-time');
      const save = (enabled, granted) => {
        const list = this.loadReminders().map(r => r.id === id ? Object.assign(r, { enabled, time: time.value || r.time }) : r);
        markAsked();
        this.applyReminders(list, granted);
        this.renderSettings();
      };
      box.addEventListener('change', () => {
        if (!box.checked) { save(false); return; }
        this.requestNotif((granted) => {
          if (!granted) {
            box.checked = false;
            $('rem-note').textContent = '通知权限没打开：去手机「设置 → 应用 → 练食AI → 通知」里打开后再试。';
            return;
          }
          save(true, true);
        });
      });
      time.addEventListener('change', () => save(box.checked));
    });

    $('set-haptics').addEventListener('change', () => {
      try { localStorage.setItem('tf_haptics', $('set-haptics').checked ? 'on' : 'off'); } catch (e) {}
      if ($('set-haptics').checked && window.Haptics) window.Haptics.fire('success');
    });
  }

  renderReminders() {
    const $ = (id) => document.getElementById(id);
    const list = this.loadReminders();
    const granted = this.hasNotifApi() && window.TrainFitNative.notificationsEnabled && window.TrainFitNative.notificationsEnabled();
    list.forEach(r => {
      const box = $('rem-' + r.id), time = $('rem-' + r.id + '-time');
      if (box) box.checked = !!(r.enabled && granted && localStorage.getItem('tf_remind_asked'));
      if (time && document.activeElement !== time) time.value = r.time;
    });
    let hap = true;
    try { hap = localStorage.getItem('tf_haptics') !== 'off'; } catch (e) {}
    $('set-haptics').checked = hap;
    $('rem-note').textContent = !this.hasNotifApi() ? '提醒只在安卓 App 里可用。' :
      (!granted && localStorage.getItem('tf_remind_asked') ? '通知权限没打开，提醒不会响。打开任意一个开关会请求权限。' : '');
  }

  onProfileChange() {
    this.profile.customized = true;
    this.recalculateMetabolism();
    this.saveData();
    this.renderSettings();
    this.showToast('已保存');
  }

  renderSettings() {
    const $ = (id) => document.getElementById(id);
    const p = this.profile;
    const setSeg = (id, v) => document.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.classList.toggle('active', b.dataset.value === v));
    setSeg('set-gender', p.gender);
    setSeg('set-goal', p.goalType || 'fat_loss');
    setSeg('set-mode', p.mode || 'fit');
    const simple = this.isSimple();
    const goalNames = simple ? { fat_loss: '想瘦', maintain: '保持', muscle_gain: '想增重' } : { fat_loss: '减脂', maintain: '维持', muscle_gain: '增肌' };
    document.querySelectorAll('#set-goal .seg-btn').forEach(b => { b.textContent = goalNames[b.dataset.value]; });
    $('set-deficit-l').textContent = simple ? '每天少吃 kcal' : '每天热量缺口 kcal';
    $('set-goal-note').textContent = simple
      ? '想增重时填负数，比如 -250 表示每天多吃 250 kcal。改完自动保存。'
      : '增肌时缺口是负数，比如 -250 表示每天多吃 250 kcal。改完自动保存。';
    $('set-mode-note').textContent = simple ? '只显示吃了多少、还能吃多少和体重。说了运动也会记。' : '训练、蛋白质、热量缺口和动作进步都会显示。';
    $('rem-night-desc').textContent = simple ? '今天还能吃多少' : '今天还能吃多少、蛋白还差多少';
    setSeg('set-theme', this.theme);
    $('set-theme-note').textContent = this.theme === 'system' ? `手机现在是${this.systemIsLight() ? '浅色' : '深色'}模式，App 跟着变` : '';
    const setVal = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    setVal('set-height', p.heightCm);
    setVal('set-weight', p.weightKg);
    setVal('set-age', p.age);
    setVal('set-deficit', p.targetDeficitKcal);
    setVal('set-protein', p.targetProteinG);
    const budget = p.tdee - (p.targetDeficitKcal || 0);
    $('set-tdee-note').textContent = `每天日常消耗约 ${fmt(p.tdee)} kcal（不含训练）。按目标，不训练的日子大约吃 ${fmt(budget)} kcal。`;
    this.renderReminders();
    const ql = window.QuickLog;
    const days = new Set([...this.workouts, ...this.diet].map(r => r.date)).size;
    $('set-data-note').textContent = `共 ${this.diet.length} 条饮食、${this.workouts.length} 条${simple ? '运动' : '训练'}、${this.weights.length} 次体重，覆盖 ${days} 天。`;
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

  // ======================= 修改记录 =======================
  openEditor(kind, id) {
    const list = kind === 'meal' ? this.diet : this.workouts;
    const rec = list.find(r => r.id === id);
    if (!rec) return;
    this.editing = { kind, id };
    document.getElementById('edit-delete').classList.remove('hidden');
    const f = document.getElementById('edit-fields');
    const input = (name, label, value, type = 'number', extra = '') =>
      `<label class="field"><span class="field-label">${label}</span><input class="input" name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} ${extra}></label>`;

    if (kind === 'meal') {
      document.getElementById('edit-title').textContent = '修改饮食';
      f.innerHTML = `
        <div class="seg seg-sm" id="edit-meal-type">
          ${MEAL_TYPES.map(t => `<button type="button" class="seg-btn ${rec.mealType === t ? 'active' : ''}" data-value="${t}">${t.replace('/补剂', '')}</button>`).join('')}
        </div>
        ${input('foodSummary', '吃了什么', rec.foodSummary, 'text', 'maxlength="60"')}
        ${Array.isArray(rec.items) && rec.items.length ? `<div class="breakdown">
          <div class="breakdown-head">怎么算的</div>
          ${rec.items.map(i => `<div class="breakdown-row"><span>${esc(i.name)}${i.grams ? ` ${i.grams}g` : ''}</span><span>${fmt(i.calories)} kcal <em class="src ${i.src === '估算' ? 'est' : ''}">${esc(i.src || '')}</em></span></div>`).join('')}
          <div class="breakdown-note">「成分表」来自《中国食物成分表（第6版）》，「估算」是 AI 按常见做法估的。改了下面的数字就以你填的为准。</div>
        </div>` : ''}
        <div class="field-grid field-grid-2">
          ${input('calories', '热量 kcal', rec.calories)}
          ${input('proteinG', '蛋白质 g', rec.proteinG || 0)}
          ${input('carbsG', '碳水 g', rec.carbsG || 0)}
          ${input('fatG', '脂肪 g', rec.fatG || 0)}
        </div>`;
      f.querySelector('#edit-meal-type').addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        f.querySelectorAll('#edit-meal-type .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      });
    } else if (rec.durationMin) {
      document.getElementById('edit-title').textContent = '修改有氧';
      f.innerHTML = `
        ${input('exerciseName', '项目', rec.exerciseName, 'text', 'maxlength="30"')}
        <div class="field-grid field-grid-2">
          ${input('durationMin', '时长 分钟', rec.durationMin)}
          ${input('burnedCalories', '消耗 kcal', rec.burnedCalories || 0)}
        </div>`;
    } else {
      document.getElementById('edit-title').textContent = '修改训练';
      f.innerHTML = `
        ${input('exerciseName', '动作', rec.exerciseName, 'text', 'maxlength="30"')}
        <div class="field-grid">
          ${input('weightKg', '重量 kg（自重填 0）', rec.weightKg)}
          ${input('sets', '组数', rec.sets)}
          ${input('reps', '每组次数', rec.reps)}
        </div>
        ${input('burnedCalories', '消耗 kcal', rec.burnedCalories || 0)}`;
    }
    document.getElementById('edit-overlay').classList.remove('hidden');
    history.pushState({ edit: true }, '');
  }

  openWeightEditor(date) {
    const on = this.weightOn(date);
    const last = this.latestWeight();
    this.editing = { kind: 'weight', date };
    const d = new Date(date + 'T00:00:00');
    document.getElementById('edit-title').textContent = `${on ? '改' : '记'}体重 · ${date === getTodayDateString() ? '今天' : `${d.getMonth() + 1}月${d.getDate()}日`}`;
    document.getElementById('edit-delete').classList.toggle('hidden', !on);
    const v = on ? on.kg : (last ? last.kg : '');
    document.getElementById('edit-fields').innerHTML = `
      <label class="field"><span class="field-label">体重 kg</span><input class="input input-big" name="kg" type="number" inputmode="decimal" step="0.1" min="25" max="300" value="${esc(v)}" placeholder="比如 62.5"></label>
      <div class="field-note">说话记也行：「体重 62.5」「今天称了 125 斤」。最新的体重会用来算每天消耗。</div>`;
    document.getElementById('edit-overlay').classList.remove('hidden');
    history.pushState({ edit: true }, '');
    const input = document.querySelector('#edit-fields input[name="kg"]');
    setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 60);
  }

  closeEditor(fromBack) {
    if (!this.editing) return;
    this.editing = null;
    document.getElementById('edit-overlay').classList.add('hidden');
    if (!fromBack && history.state && history.state.edit) history.back();
  }

  saveEditor() {
    if (!this.editing) return;
    const { kind, id } = this.editing;
    const form = document.getElementById('edit-form');
    if (kind === 'weight') {
      const kg = parseFloat(form.elements.kg.value);
      if (!Number.isFinite(kg) || kg < 25 || kg > 300) { this.showToast('填一个 25–300 之间的数'); return; }
      const date = this.editing.date;
      const prev = this.setWeight(date, kg);
      this.closeEditor();
      this.render();
      window.Haptics && window.Haptics.fire('success');
      if (window.QuickLog) window.QuickLog.showUndo(`✓ 记下体重 ${round1(kg)} kg`, [], () => { this.restoreWeight(date, prev); this.saveData(); this.render(); });
      return;
    }
    const list = kind === 'meal' ? this.diet : this.workouts;
    const rec = list.find(r => r.id === id);
    if (!rec) return this.closeEditor();
    const val = (name) => form.elements[name] ? form.elements[name].value : undefined;
    const numv = (name, fallback) => { const v = parseFloat(val(name)); return Number.isFinite(v) && v >= 0 ? v : fallback; };

    if (kind === 'meal') {
      const active = form.querySelector('#edit-meal-type .seg-btn.active');
      rec.mealType = active ? active.dataset.value : rec.mealType;
      rec.foodSummary = (val('foodSummary') || '').trim() || rec.foodSummary;
      const newCal = Math.round(numv('calories', rec.calories));
      if (newCal !== rec.calories) delete rec.items;
      rec.calories = newCal;
      rec.proteinG = round1(numv('proteinG', rec.proteinG || 0));
      rec.carbsG = round1(numv('carbsG', rec.carbsG || 0));
      rec.fatG = round1(numv('fatG', rec.fatG || 0));
    } else {
      rec.exerciseName = (val('exerciseName') || '').trim() || rec.exerciseName;
      if (rec.durationMin) {
        rec.durationMin = Math.max(1, Math.round(numv('durationMin', rec.durationMin)));
      } else {
        rec.weightKg = round1(numv('weightKg', rec.weightKg));
        rec.sets = Math.max(1, Math.round(numv('sets', rec.sets)));
        rec.reps = Math.max(1, Math.round(numv('reps', rec.reps)));
      }
      rec.burnedCalories = Math.round(numv('burnedCalories', rec.burnedCalories || 0));
      if (rec.notes && /估计/.test(rec.notes)) rec.notes = '一键记录（已手动修改）';
    }
    this.saveData();
    this.closeEditor();
    this.render();
    window.Haptics && window.Haptics.fire('tap');
    this.showToast('已保存');
  }

  deleteEditing() {
    if (!this.editing) return;
    const { kind, id } = this.editing;
    if (kind === 'weight') {
      const date = this.editing.date;
      const prev = this.removeWeight(date);
      window.Haptics && window.Haptics.fire('tap');
      this.closeEditor();
      this.render();
      if (prev && window.QuickLog) window.QuickLog.showUndo('已删除这天的体重', [], () => { this.restoreWeight(date, prev); this.saveData(); this.render(); });
      return;
    }
    const list = kind === 'meal' ? this.diet : this.workouts;
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return this.closeEditor();
    const [removed] = list.splice(idx, 1);
    window.Haptics && window.Haptics.fire('tap');
    this.saveData();
    this.closeEditor();
    this.render();
    if (window.QuickLog) {
      window.QuickLog.showUndo('已删除 1 条', [], () => {
        list.splice(idx, 0, removed);
        this.saveData();
        this.render();
      });
    } else {
      this.showToast('已删除');
    }
  }

  // ======================= 整理中的语音记录 =======================
  addPending(text) {
    const p = { id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text, date: this.selectedDate, ts: Date.now(), status: 'working' };
    this.pending.unshift(p);
    this.savePending();
    if (this.view !== 'today') this.switchView('today'); else this.render();
    return p;
  }

  finishPending(id) {
    this.pending = this.pending.filter(p => p.id !== id);
    this.savePending();
  }

  failPending(id, message) {
    const p = this.pending.find(x => x.id === id);
    if (!p) return;
    window.Haptics && window.Haptics.fire('error');
    p.status = 'failed';
    p.error = message || '没整理出来';
    this.savePending();
    this.render();
  }

  retryPending(id) {
    const p = this.pending.find(x => x.id === id);
    if (!p || !window.QuickLog) return;
    p.status = 'working';
    p.error = null;
    this.render();
    window.QuickLog.process(p);
  }

  dropPending(id) {
    this.finishPending(id);
    this.render();
  }

  editPendingText(id) {
    const p = this.pending.find(x => x.id === id);
    if (!p || !window.QuickLog) return;
    this.finishPending(id);
    this.render();
    window.QuickLog.openWithText(p.text);
  }

  showToast(msg) {
    const t = document.getElementById('app-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  // 兼容 quick_log.js 旧接口
  switchTab(tab) { if (tab === 'workout' || tab === 'diet') this.switchView('today'); else this.switchView(tab); }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.app = new FitnessApp();
  });
  window.FitnessApp = FitnessApp;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FitnessApp, DEFAULT_PROFILE, getTodayDateString, shiftDateString, formatLocalDate };
}
