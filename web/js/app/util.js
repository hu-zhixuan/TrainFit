/**
 * 练食AI · 主界面用到的常量和小工具（普通脚本，全局可用；一键记录的 log/pipeline.js 也会用到日期函数）。
 * 数据沿用旧版 localStorage：fit_profile / fit_workouts / fit_diet / fit_weights。
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
/** 这一条饮食是不是只有补剂（钙片、鱼油…） */
function isSuppOnly(rec) { return Array.isArray(rec && rec.items) && rec.items.length > 0 && rec.items.every(i => i.supp); }
/** 几样东西含的营养素加起来 */
function sumNutrients(items) {
  const n = {};
  (items || []).forEach(it => Object.keys(it.nutrients || {}).forEach(k => { n[k] = Math.round(((n[k] || 0) + it.nutrients[k]) * 10) / 10; }));
  return n;
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
