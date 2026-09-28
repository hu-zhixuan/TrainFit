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
    this.recalculateMetabolism();

    // 上次没整理完就关了 App 的，恢复成「失败，可重试」
    this.pending = load(PENDING_KEY, []).map(p => Object.assign(p, { status: 'failed', error: '上次没整理完' }));

    this.bindEvents();
    this.applyTheme(load('trainfit_theme_v2', null) || this.legacyTheme());
    this.render();

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

    document.querySelectorAll('.dock-tab').forEach(b => b.addEventListener('click', () => this.switchView(b.dataset.view)));
    $('btn-settings').addEventListener('click', () => this.switchView(this.view === 'settings' ? 'today' : 'settings'));
    $('date-prev').addEventListener('click', () => this.shiftDate(-1));
    $('date-next').addEventListener('click', () => this.shiftDate(1));
    $('date-label').addEventListener('click', () => { this.selectedDate = getTodayDateString(); this.render(); });
    $('setup-hint').addEventListener('click', () => this.switchView('settings'));

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
    document.querySelectorAll('.dock-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const isToday = view === 'today';
    document.getElementById('date-switch').classList.toggle('hidden', !isToday);
    const title = document.getElementById('view-title');
    title.classList.toggle('hidden', isToday);
    title.textContent = view === 'trend' ? '趋势' : view === 'settings' ? '设置' : '';
    const sb = document.getElementById('btn-settings');
    sb.innerHTML = view === 'settings' ? ICON_CLOSE : ICON_SETTINGS;
    sb.setAttribute('aria-label', view === 'settings' ? '关闭设置' : '设置');
    if (!fromBack && prev === 'today' && view !== 'today') history.pushState({ v: view }, '');
    else if (!fromBack && prev !== 'today' && view === 'today' && history.state && history.state.v) history.back();
    window.scrollTo(0, 0);
    this.render();
  }

  shiftDate(delta) {
    const next = shiftDateString(this.selectedDate, delta);
    if (next > getTodayDateString()) return;
    this.selectedDate = next;
    this.render();
  }

  // ======================= 渲染 =======================
  render() {
    this.lastToday = getTodayDateString();
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
    $('hero-foot').textContent = `预算 ${fmt(s.budget)} = 消耗 ${fmt(s.totalBurn)} ${target >= 0 ? '− 目标缺口 ' + fmt(target) : '+ 目标盈余 ' + fmt(-target)}`;
    $('st-intake').textContent = fmt(s.intake);
    $('st-burn').textContent = s.workoutBurn ? '+' + fmt(s.workoutBurn) : '0';
    $('st-protein').textContent = `${fmt(s.protein)} / ${fmt(this.profile.targetProteinG)}g`;

    $('setup-hint').classList.toggle('hidden', !!this.profile.customized);

    // 时间线：整理中的 + 训练 + 饮食，按时间倒序
    const rows = [];
    this.pending.filter(p => p.date === date).forEach(p => rows.push({ kind: 'pending', ts: p.ts, rec: p }));
    this.workouts.filter(w => w.date === date).forEach(w => rows.push({ kind: 'workout', ts: recordTs(w), rec: w }));
    this.diet.filter(d => d.date === date).forEach(d => rows.push({ kind: 'meal', ts: recordTs(d), rec: d }));
    rows.sort((a, b) => (a.kind === 'pending' ? -1 : 0) - (b.kind === 'pending' ? -1 : 0) || b.ts - a.ts);

    $('list-head').textContent = rows.length ? `记录 · ${rows.filter(r => r.kind !== 'pending').length} 条` : '记录';
    const tl = $('timeline');
    if (!rows.length) {
      tl.innerHTML = isToday
        ? `<div class="empty"><div class="empty-icon">${ICONS.mic}</div>按住下面的按钮<br>说说今天<b>练了什么、吃了什么</b><br>松手就记好，不用等<br><span class="empty-example">「卧推80公斤4组8个，中午吃了黄焖鸡米饭」</span></div>`
        : `<div class="empty">这天没有记录</div>`;
      return;
    }
    tl.innerHTML = rows.map(r => this.renderRow(r)).join('');
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
      const macro = [x.proteinG ? `蛋白 ${round1(x.proteinG)}g` : '', x.carbsG ? `碳水 ${round1(x.carbsG)}g` : '', x.fatG ? `脂肪 ${round1(x.fatG)}g` : ''].filter(Boolean).join(' · ');
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
    const days = [];
    for (let i = this.trendDays - 1; i >= 0; i--) {
      const date = shiftDateString(today, -i);
      const s = this.getDaySummary(date);
      days.push({ date, summary: s, value: s.hasDiet ? s.deficit : null });
    }
    const logged = days.filter(d => d.value !== null);
    const total = logged.reduce((a, d) => a + d.value, 0);
    $('tr-avg').textContent = logged.length ? fmt(total / logged.length) : '–';
    $('tr-fat').textContent = logged.length ? (total / 7700).toFixed(2) : '–';
    $('tr-days').textContent = days.filter(d => d.summary.hasLogs).length;

    this.drawDeficitChart($('trend-chart'), days);
    this.renderProgressList($('progress-list'));
  }

  drawDeficitChart(el, days) {
    const target = this.profile.targetDeficitKcal || 0;
    const vals = days.map(d => d.value).filter(v => v !== null);
    if (!vals.length) {
      el.innerHTML = `<div class="chart-empty">记几天饮食后，这里会显示每天的热量缺口</div>`;
      return;
    }
    const W = 340, H = 180, padL = 40, padR = 6, padT = 10, padB = 22;
    const iw = W - padL - padR, ih = H - padT - padB;
    let max = Math.max(target, ...vals, 0);
    let min = Math.min(0, ...vals, target);
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
        bars += `<path class="${pos ? 'bar-pos' : 'bar-neg'}" d="${path}"/>`;
      }
      const tip = d.value === null ? '没记饮食' : (d.value >= 0 ? `缺口 ${fmt(d.value)} kcal` : `超出 ${fmt(-d.value)} kcal`);
 bars += `<rect class="bar-hit" data-i="${i}" data-date="${d.date}" data-tip="${esc(md + ' · ' + tip)}" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${ih}"><title>${esc(md + ' ' + tip)}</title></rect>`;
    });
    const targetLine = target > 0 ? `<line class="target" x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}"/>` : '';

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每天热量缺口柱状图">${grid}${targetLine}${bars}${labels}</svg><div class="chart-tip hidden"></div>`;

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
      if (!confirm('清空所有训练和饮食记录？身体数据会保留。此操作不能撤销。')) return;
      this.workouts = [];
      this.diet = [];
      this.pending = [];
      this.saveData();
      this.savePending();
      this.showToast('已清空');
      this.renderSettings();
    });
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
    const days = new Set([...this.workouts, ...this.diet].map(r => r.date)).size;
    $('set-data-note').textContent = `共 ${this.workouts.length} 条训练、${this.diet.length} 条饮食，覆盖 ${days} 天。`;
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

  closeEditor(fromBack) {
    if (!this.editing) return;
    this.editing = null;
    document.getElementById('edit-overlay').classList.add('hidden');
    if (!fromBack && history.state && history.state.edit) history.back();
  }

  saveEditor() {
    if (!this.editing) return;
    const { kind, id } = this.editing;
    const list = kind === 'meal' ? this.diet : this.workouts;
    const rec = list.find(r => r.id === id);
    if (!rec) return this.closeEditor();
    const form = document.getElementById('edit-form');
    const val = (name) => form.elements[name] ? form.elements[name].value : undefined;
    const numv = (name, fallback) => { const v = parseFloat(val(name)); return Number.isFinite(v) && v >= 0 ? v : fallback; };

    if (kind === 'meal') {
      const active = form.querySelector('#edit-meal-type .seg-btn.active');
      rec.mealType = active ? active.dataset.value : rec.mealType;
      rec.foodSummary = (val('foodSummary') || '').trim() || rec.foodSummary;
      rec.calories = Math.round(numv('calories', rec.calories));
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
    this.showToast('已保存');
  }

  deleteEditing() {
    if (!this.editing) return;
    const { kind, id } = this.editing;
    const list = kind === 'meal' ? this.diet : this.workouts;
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return this.closeEditor();
    const [removed] = list.splice(idx, 1);
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
