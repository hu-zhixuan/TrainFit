/**
 * 体重：一天一条（fit_weights），说「体重 62」或在趋势页体重卡片里记；最新体重同步到身体数据。
 */
Object.assign(FitnessApp.prototype, {
  latestWeight() {
    return this.weights.length ? this.weights[this.weights.length - 1] : null;
  },

  weightOn(date) {
    return this.weights.find(w => w.date === date) || null;
  },

  /** 记一天的体重（同一天再说一次就覆盖），返回原来那条，撤销用 */
  setWeight(date, kg) {
    const prev = this.weightOn(date);
    this.weights = this.weights.filter(w => w.date !== date);
    this.weights.push({ date, kg: round1(kg), ts: Date.now() });
    this.weights.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    this.syncProfileWeight();
    this.saveData();
    return prev ? Object.assign({}, prev) : null;
  },

  removeWeight(date) {
    const prev = this.weightOn(date);
    this.weights = this.weights.filter(w => w.date !== date);
    this.syncProfileWeight();
    this.saveData();
    return prev;
  },

  restoreWeight(date, prev) {
    this.weights = this.weights.filter(w => w.date !== date);
    if (prev) {
      this.weights.push(prev);
      this.weights.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    }
    this.syncProfileWeight();
  },

  /** 最新体重就是身体数据里的体重（热量预算跟着变） */
  syncProfileWeight() {
    const w = this.latestWeight();
    if (!w || w.kg === this.profile.weightKg) return;
    const autoProtein = !this.profile.proteinTouched &&
      (this.profile.targetProteinG === Math.round(this.profile.weightKg * 2) || this.profile.targetProteinG === DEFAULT_PROFILE.targetProteinG);
    this.profile.weightKg = w.kg;
    if (autoProtein) this.profile.targetProteinG = Math.round(w.kg * 2);
    this.recalculateMetabolism();
  },

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
  },

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
});
