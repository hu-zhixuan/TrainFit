/**
 * 数据备份：导出、从备份恢复（合并进现有数据）、每天自动备份到手机的「下载/练食AI/」。
 *
 * 备份文件是 JSON：{ app: '练食AI', format: 1, exportedAt, range: {from, to}, counts, data: { fit_diet: [...], …, fit_plans: [...] } }
 * 只放记录和个人资料；AI 接口 / 语音识别的 key 不放进去，发给别人也不会漏。
 * 自动备份的文件在卸载 App 后还在。重装后点「从备份恢复」：系统的文件夹授权页直接停在「下载/练食AI」，
 * 点「使用此文件夹」→「允许」，我们自己挑记录最多的那份恢复（照 Mihon 的做法，不用自己翻文件）。
 * 换手机：旧手机「发送备份文件」到微信，新手机在微信里点开 →「用其他应用打开」→ 练食AI，直接恢复。
 */
const BACKUP_KEYS = ['fit_profile', 'fit_workouts', 'fit_diet', 'fit_weights', 'fit_my_foods', 'fit_plans'];
const BACKUP_FORMAT = 1;
const AUTO_BACKUP_NAME = '练食AI备份.json';
const AUTO_BACKUP_KEY = 'tf_autobackup'; // { at, where }

/** 读备份文件；不是练食AI的备份返回 null */
function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch (e) { return null; }
  if (!b || typeof b !== 'object' || !b.data || typeof b.data !== 'object') return null;
  const d = b.data;
  const arr = (x) => (Array.isArray(x) ? x.filter(r => r && typeof r === 'object') : []);
  return {
    exportedAt: b.exportedAt || null,
    fit_profile: d.fit_profile && typeof d.fit_profile === 'object' ? d.fit_profile : null,
    fit_workouts: arr(d.fit_workouts).filter(r => r.id && r.date),
    fit_diet: arr(d.fit_diet).filter(r => r.id && r.date),
    fit_weights: arr(d.fit_weights).filter(r => r.date && r.kg > 0),
    fit_my_foods: arr(d.fit_my_foods).filter(r => r.name),
    fit_plans: arr(d.fit_plans).filter(r => r.id && r.date && r.kind)
  };
}

/**
 * 把备份合并进现有数据：同一条记录（同 id）不记两遍，同一天的体重、同名的记住的食物以现在的为准。
 * 现在是新装的（没有记录、没改过身体数据），个人资料也用备份里的。
 * @returns {{ data: Object, added: {diet, workouts, weights, myFoods}, profileRestored: boolean }}
 */
function mergeBackupData(cur, bak) {
  const byId = (list) => new Set(list.map(r => r.id));
  const dietIds = byId(cur.fit_diet || []);
  const woIds = byId(cur.fit_workouts || []);
  const wDates = new Set((cur.fit_weights || []).map(w => w.date));
  const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
  const foodNames = new Set((cur.fit_my_foods || []).map(f => norm(f.name)));

  const newDiet = bak.fit_diet.filter(r => !dietIds.has(r.id));
  const newWo = bak.fit_workouts.filter(r => !woIds.has(r.id));
  const newW = bak.fit_weights.filter(w => !wDates.has(w.date));
  const newFoods = bak.fit_my_foods.filter(f => !foodNames.has(norm(f.name)));
  const planIds = byId(cur.fit_plans || []);
  const newPlans = (bak.fit_plans || []).filter(p => !planIds.has(p.id));

  const fresh = !(cur.fit_diet || []).length && !(cur.fit_workouts || []).length && !(cur.fit_profile && cur.fit_profile.customized);
  const profileRestored = fresh && !!bak.fit_profile;
  const byTime = (a, b) => (b.date === a.date ? (b.ts || 0) - (a.ts || 0) : (b.date > a.date ? 1 : -1));
  return {
    data: {
      fit_profile: profileRestored ? Object.assign({}, cur.fit_profile || {}, bak.fit_profile) : cur.fit_profile,
      fit_diet: (cur.fit_diet || []).concat(newDiet).sort(byTime),
      fit_workouts: (cur.fit_workouts || []).concat(newWo).sort(byTime),
      fit_weights: (cur.fit_weights || []).concat(newW).sort((a, b) => (a.date > b.date ? 1 : -1)),
      fit_my_foods: (cur.fit_my_foods || []).concat(newFoods),
      fit_plans: (cur.fit_plans || []).concat(newPlans)
    },
    added: { diet: newDiet.length, workouts: newWo.length, weights: newW.length, myFoods: newFoods.length, plans: newPlans.length },
    profileRestored
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parseBackup, mergeBackupData, BACKUP_FORMAT };

if (typeof FitnessApp !== 'undefined') Object.assign(FitnessApp.prototype, {
  /** 现在的数据 → 备份文件的文字 */
  backupText() {
    const dates = this.diet.map(d => d.date).concat(this.workouts.map(w => w.date), this.weights.map(w => w.date)).sort();
    return JSON.stringify({
      app: '练食AI',
      format: BACKUP_FORMAT,
      exportedAt: new Date().toISOString(),
      range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      counts: { diet: this.diet.length, workouts: this.workouts.length, weights: this.weights.length, myFoods: this.myFoods.length },
      data: { fit_profile: this.profile, fit_workouts: this.workouts, fit_diet: this.diet, fit_weights: this.weights, fit_my_foods: this.myFoods, fit_plans: this.plans || [] }
    });
  },

  hasFileApi() { return !!(window.TrainFitNative && window.TrainFitNative.pickFile); },

  /** 发送备份文件（微信、网盘）；浏览器里直接下载 */
  exportBackup() {
    const name = `练食AI备份-${getTodayDateString()}.json`;
    const text = this.backupText();
    if (this.hasFileApi()) {
      window.TrainFitNative.shareFile(name, 'application/json', text);
    } else {
      downloadBlob(new Blob([text], { type: 'application/json' }), name);
    }
    window.Haptics && window.Haptics.fire('tap');
  },

  /**
   * 从备份恢复 → 合并进来 → 底部提示可以撤销。
   * 安卓：先一键找回（授权「下载/练食AI」文件夹，自动挑记录最多的那份）；那里没有、或者那份的记录这里都有了，就让选文件。
   */
  importBackup() {
    const api = window.TrainFitNative;
    const picked = (ok, text) => {
      if (!ok) { if (text !== 'CANCEL') this.showToast('没读出这个文件'); return; }
      this.applyBackup(text);
    };
    if (api && api.restoreFromFolder) {
      window.__tfFile = (ok, text) => {
        if (ok && this.applyBackup(text, true) !== 'same') return;
        if (text === 'CANCEL') return;
        if (ok) { // 文件夹里那份的记录这里都有了：可能要的是别处的备份，让选文件
          this.showToast(this._sameMsg + '，可以选别的备份文件');
          window.__tfFile = picked;
          api.pickFile();
          return;
        }
        // 文件夹里没有：备份可能在微信、网盘里，让选文件
        this.showToast(text === 'NO_BACKUP' ? '这里没找到备份，选一下备份文件' : '没读出备份，选一下备份文件');
        window.__tfFile = picked;
        api.pickFile();
      };
      api.restoreFromFolder();
    } else if (this.hasFileApi()) {
      window.__tfFile = picked;
      api.pickFile();
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json,text/plain';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        f.text().then(t => picked(true, t), () => picked(false, 'READ_FAILED'));
      };
      input.click();
    }
  },

  /** @param quiet 记录都有了时不弹提示（调用方自己说）；返回 'bad' | 'same' | 'ok' */
  applyBackup(text, quiet) {
    const bak = parseBackup(text);
    if (!bak) { this.showToast('这不是练食AI的备份文件'); return 'bad'; }
    const before = { fit_profile: this.profile, fit_diet: this.diet, fit_workouts: this.workouts, fit_weights: this.weights, fit_my_foods: this.myFoods, fit_plans: this.plans || [] };
    const snapshot = JSON.parse(JSON.stringify(before));
    const r = mergeBackupData(before, bak);
    const total = r.added.diet + r.added.workouts + r.added.weights;
    if (!total && !r.added.myFoods && !r.added.plans && !r.profileRestored) {
      // 说清楚是哪一份，分得清是不是选错了文件
      const d = bak.exportedAt ? new Date(bak.exportedAt) : null;
      const n = bak.fit_diet.length + bak.fit_workouts.length + bak.fit_weights.length;
      this._sameMsg = `这份备份（${d ? `${d.getMonth() + 1}月${d.getDate()}日存的，` : ''}${n} 条记录）这里都有了`;
      if (!quiet) this.showToast(this._sameMsg);
      return 'same';
    }
    this.loadData(r.data);
    const lines = [`饮食 ${r.added.diet} 条、训练 ${r.added.workouts} 条、体重 ${r.added.weights} 次`];
    if (r.added.myFoods) lines.push(`记住的食物 ${r.added.myFoods} 样`);
    if (r.profileRestored) lines.push('身体数据和目标也恢复了');
    window.Haptics && window.Haptics.fire('success');
    window.Sound && window.Sound.play('success');
    if (window.QuickLog) window.QuickLog.showUndo('✓ 从备份恢复了', lines, () => this.loadData(snapshot));
    else this.showToast('已从备份恢复');
    return 'ok';
  },

  /** 换一整套数据（恢复 / 撤销恢复），存下来并刷新界面 */
  loadData(d) {
    this.profile = Object.assign({}, DEFAULT_PROFILE, d.fit_profile || {});
    this.diet = d.fit_diet || [];
    this.workouts = d.fit_workouts || [];
    this.weights = d.fit_weights || [];
    this.myFoods = d.fit_my_foods || [];
    this.plans = d.fit_plans || [];
    store(MY_FOODS_KEY, this.myFoods);
    this.recalculateMetabolism();
    this.saveData();
    if (this.needsOnboarding && this.profile.mode) this.finishOnboardingFromBackup();
    this.applyMode();
    this.render();
  },

  /**
   * 自动备份到「下载/练食AI/练食AI备份.json」（Android 10 及以上）：每天第一次打开、以及改过数据后切到后台时。
   * @param force 不管今天备份过没有
   */
  autoBackup(force) {
    const api = window.TrainFitNative;
    if (!api || !api.saveToDownloads) return;
    if (!this.diet.length && !this.workouts.length && !this.weights.length) return;
    const last = load(AUTO_BACKUP_KEY, null);
    const today = getTodayDateString();
    if (!force && !this._backupDirty && last && last.day === today) return;
    let where = '';
    try { where = api.saveToDownloads(AUTO_BACKUP_NAME, 'application/json', this.backupText()); } catch (e) {}
    if (where) {
      store(AUTO_BACKUP_KEY, { at: Date.now(), day: today, where });
      this._backupDirty = false;
    }
  },

  bindBackup() {
    const $ = (id) => document.getElementById(id);
    $('set-export').addEventListener('click', () => this.exportBackup());
    $('set-import').addEventListener('click', () => this.importBackup());
    $('ob-restore').addEventListener('click', () => this.importBackup());
    window.__tfToast = (msg) => this.showToast(msg);
    // 微信里点备份文件 →「用其他应用打开」→ 练食AI：打开时就恢复（App 没开着时等页面好了再取）
    const takeOpened = () => {
      const api = window.TrainFitNative;
      const text = api && api.takeOpenedFile ? api.takeOpenedFile() : '';
      if (text) this.applyBackup(text);
    };
    window.__tfOpenedFile = takeOpened;
    setTimeout(takeOpened, 400);
    // 改过数据、切到后台（锁屏、切 App）时存一份；每天第一次打开也存一份
    document.addEventListener('visibilitychange', () => { if (document.hidden && this._backupDirty) this.autoBackup(); });
    setTimeout(() => this.autoBackup(), 3000);
  },

  /** 设置页「数据」里自动备份那一行 */
  backupNote() {
    const api = window.TrainFitNative;
    if (!api || !api.saveToDownloads) return '在浏览器里用：点「发送备份文件」会下载一份，换设备时「从备份恢复」选它。';
    const last = load(AUTO_BACKUP_KEY, null);
    if (last && last.where) {
      const d = new Date(last.at);
      return `每天自动存一份到手机的「${last.where}」（上次 ${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}），卸载 App 也不会删。重装后点「从备份恢复」，再点「使用此文件夹」→「允许」就找回来了。换手机：「发送备份文件」到微信，新手机在微信里点开 →「用其他应用打开」→ 练食AI。`;
    }
    return '有记录后每天会自动存一份到手机的「下载/练食AI/」，卸载 App 也不会删；重装后点「从备份恢复」一键找回（Android 10 以下的手机存不了，记得定期「发送备份文件」到微信）。';
  }
});

/** 浏览器里下载一个文件 */
function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
