/** 「怎么算的」里来源标签的颜色 */
const SRC_CLASS = { '估算': 'est', '补剂': 'est', '我的': 'mine', '包装': 'mine' };

/**
 * 修改一条饮食或训练记录的弹层（体重的弹层在 weight.js）。
 */
Object.assign(FitnessApp.prototype, {
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
        ${rec.said ? `<div class="said">你说的：「${esc(rec.said)}」</div>` : ''}
        ${Array.isArray(rec.items) && rec.items.length ? `<div class="breakdown">
          <div class="breakdown-head">怎么算的</div>
          ${rec.items.map((i, idx) => `<div class="breakdown-row">
            <span class="bd-name">${esc(i.name)}<small>${esc([i.amount, i.grams ? i.grams + 'g' : ''].filter(Boolean).join(' · '))}${
              i.supp ? (i.nutrients ? ' · ' + esc(TF.nutrientsText(i.nutrients)) : '') : ` · 蛋白 <b>${round1(i.proteinG || 0)}g</b>`}</small></span>
            <span class="bd-val"><input class="bd-input" name="item_${idx}" type="number" inputmode="numeric" min="0" value="${Math.round(i.calories || 0)}" aria-label="${esc(i.name)} 热量">kcal<em class="src ${SRC_CLASS[i.src] || ''}">${esc(i.src || '')}</em></span>
          </div>`).join('')}
          <div class="breakdown-note">哪样不对就直接改那一样（填 0 去掉），会记住，下次说到同样的东西就用你的数。「成分表」来自《中国食物成分表（第6版）》，「估算」是 AI 按常见大小估的；肉按生重算。</div>
        </div>` : ''}
        <div class="field-grid field-grid-2">
          ${input('calories', '热量 kcal', rec.calories)}
          ${input('proteinG', '蛋白质 g', rec.proteinG || 0)}
          ${input('carbsG', '碳水 g', rec.carbsG || 0)}
          ${input('fatG', '脂肪 g', rec.fatG || 0)}
        </div>`;
      // 改了某一样的热量：下面的合计跟着变
      f.querySelectorAll('.bd-input').forEach(inp => inp.addEventListener('input', () => {
        const r = this.itemsFromForm(rec, f.closest('form'));
        const t = r.items.reduce((a, x) => ({ c: a.c + x.calories, p: a.p + x.proteinG, cb: a.cb + x.carbsG, ft: a.ft + x.fatG }), { c: 0, p: 0, cb: 0, ft: 0 });
        const form = f.closest('form');
        form.elements.calories.value = Math.round(t.c);
        form.elements.proteinG.value = round1(t.p);
        form.elements.carbsG.value = round1(t.cb);
        form.elements.fatG.value = round1(t.ft);
      }));
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
  },

  /** 读出每一样改后的热量；改过的按比例缩放三大营养素，标成「我的」 */
  itemsFromForm(rec, form) {
    const items = [];
    const changed = [];
    (rec.items || []).forEach((it, idx) => {
      const el = form.elements['item_' + idx];
      const v = el ? parseFloat(el.value) : it.calories;
      if (!Number.isFinite(v) || v < 0 || Math.round(v) === Math.round(it.calories)) { items.push(it); return; }
      if (Math.round(v) === 0) return; // 填 0：去掉这一样
      const k = it.calories > 0 ? v / it.calories : 1;
      const next = Object.assign({}, it, {
        calories: Math.round(v), proteinG: round1((it.proteinG || 0) * k), carbsG: round1((it.carbsG || 0) * k),
        fatG: round1((it.fatG || 0) * k), src: '我的'
      });
      delete next.dbName;
      items.push(next);
      changed.push(next);
    });
    return { items, changed, removed: items.length < (rec.items || []).length };
  },

  closeEditor(fromBack) {
    if (!this.editing) return;
    this.editing = null;
    document.getElementById('edit-overlay').classList.add('hidden');
    if (!fromBack && history.state && history.state.edit) { this._editorBack = true; history.back(); }
  },

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

    let remembered = [];
    if (kind === 'meal') {
      const active = form.querySelector('#edit-meal-type .seg-btn.active');
      rec.mealType = active ? active.dataset.value : rec.mealType;
      rec.foodSummary = (val('foodSummary') || '').trim() || rec.foodSummary;
      const newCal = Math.round(numv('calories', rec.calories));
      const r = Array.isArray(rec.items) && rec.items.length ? this.itemsFromForm(rec, form) : null;
      const itemsTotal = r ? Math.round(r.items.reduce((a, x) => a + x.calories, 0)) : null;
      if (r && (r.changed.length || r.removed) && newCal === itemsTotal) {
        // 改的是某一样：保留明细，并记住改过的那几样
        rec.items = r.items;
        r.changed.forEach(x => this.rememberFood(x));
        remembered = r.changed.map(x => x.name);
      } else if (newCal !== rec.calories) {
        delete rec.items; // 直接改了合计：以填的为准
      }
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
    this.showToast(remembered.length ? `已保存，记住了 ${remembered.join('、')}` : '已保存');
  },

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
});
