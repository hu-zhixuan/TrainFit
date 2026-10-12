/** 一样东西的份量文字：「2个」「250毫升」；没有就用克数 */
function amountOf(it) { return it.amount || (it.grams ? it.grams + 'g' : '1份'); }

/** 份量里写的克数（「150g」「150克」「300毫升」「半斤」「0.2kg」），没写克数返回 0 */
function gramsIn(amount) {
  const s = String(amount || '');
  let m = s.match(/(\d+(?:\.\d+)?)\s*(g|克|ml|毫升)(?![a-z])/i);
  if (m) return parseFloat(m[1]);
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(kg|公斤|千克)/i))) return parseFloat(m[1]) * 1000;
  if ((m = s.match(/(\d+(?:\.\d+)?|[半一两二三四五六七八九十])\s*斤/))) return (/\d/.test(m[1]) ? parseFloat(m[1]) : TF.countOf(m[1])) * 500;
  return 0;
}

/**
 * 按新的份量把一样东西等比例缩放（「2个」→「1个」是一半；认不出数字就不变）。
 * v12：改成克数（「1碗」→「150g」）按克数比（以前按 1 比 150，热量乘了 20 倍）；原来是克数、改成「1碗」这种换不了的，不动数
 */
function scaleItem(it, amount) {
  const gTo = gramsIn(amount), gFrom = gramsIn(amountOf(it)) || it.grams || 0;
  let from = TF.countOf(amountOf(it)), to = TF.countOf(amount);
  if (gTo > 0) { from = gFrom; to = gTo; } // 新的写了克数：按克数比
  else if (gramsIn(amountOf(it)) > 0) { from = 1; to = 1; } // 原来是克数、新的是「1碗」：换算不了，数不动
  const f = amount === amountOf(it) || !(from > 0) || !(to > 0) ? 1 : Math.min(20, Math.max(0.05, to / from));
  if (f === 1 && amount === amountOf(it)) return it;
  const next = Object.assign({}, it, {
    amount, calories: Math.round((it.calories || 0) * f), proteinG: round1((it.proteinG || 0) * f),
    carbsG: round1((it.carbsG || 0) * f), fatG: round1((it.fatG || 0) * f)
  });
  if (it.grams) next.grams = Math.round(it.grams * f);
  if (it.nutrients) next.nutrients = Object.fromEntries(Object.entries(it.nutrients).map(([k, v]) => [k, round1(v * f)]));
  return next;
}

/**
 * 改了标题「吃了什么」（v12，用户：「修改的时候统计什么时候才跟着改」——以前改标题里的数，热量蛋白一点不动）：
 * 只改了数（「米饭1碗」→「米饭2碗」「肉包2个、豆浆1杯」→「肉包3个、豆浆1杯」）就按新的份量算出每一样的新份量；
 * 整个标题只有一个数（「番茄炒蛋盖饭1份」→「2份」）就所有东西一起按比例。返回每一样的新份量（不变的写原来的），
 * 换了吃的（不只是数变了）返回 null——这种交给 AI 重新估。
 */
const AMT_UNIT = '个只根片粒勺杯碗盒包袋瓶份块条碟克毫升斤两串盘听罐支颗枚张';
function bareSummary(t) {
  return String(t || '').replace(new RegExp(`(\\d+(\\.\\d+)?|[一二两三四五六七八九十半几]+)\\s*(${AMT_UNIT.split('').join('|')}|g|ml|kg)?`, 'gi'), '')
    .replace(/[\s、，,；;（）()+＋和加]/g, '');
}
function summaryAmounts(rec, summary) {
  const items = rec.items || [];
  if (!items.length || bareSummary(summary) !== bareSummary(rec.foodSummary)) return null;
  const amtRe = `((?:\\d+(?:\\.\\d+)?|[一二两三四五六七八九十半几]+)\\s*(?:${AMT_UNIT.split('').join('|')}|g|ml|kg)?)`;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 每一样后面跟着的数
  const per = items.map(it => {
    const m = String(summary).match(new RegExp(esc(it.name) + '\\s*' + amtRe));
    const o = String(rec.foodSummary).match(new RegExp(esc(it.name) + '\\s*' + amtRe));
    return m && o && m[1] !== o[1] ? (gramsIn(m[1]) || /[个只根片粒勺杯碗盒包袋瓶份块条碟串盘听罐支颗枚张]/.test(m[1]) ? m[1] : m[1] + String(amountOf(it)).replace(/^[\d.一二两三四五六七八九十半几]+/, '')) : null;
  });
  if (per.some(Boolean)) return items.map((it, i) => per[i] || amountOf(it));
  // 整个标题只有一个数：都按这个比例
  const all = (t) => String(t).match(new RegExp(amtRe, 'g')) || [];
  const a = all(rec.foodSummary), b = all(summary);
  if (a.length === 1 && b.length === 1 && a[0] !== b[0]) {
    const f = (gramsIn(b[0]) && gramsIn(a[0])) ? gramsIn(b[0]) / gramsIn(a[0]) : TF.countOf(b[0]) / TF.countOf(a[0]);
    if (f > 0 && Number.isFinite(f) && f !== 1) return items.map(it => {
      const amt = amountOf(it);
      const g = gramsIn(amt);
      if (g) return Math.round(g * f) + 'g';
      const n = TF.countOf(amt);
      return round1(n * f) + String(amt).replace(/^[\d.一二两三四五六七八九十半几]+/, '');
    });
  }
  return null;
}

/**
 * 记住改过的数时用哪个名字：标题里有更具体的叫法就用那个（明细叫「牛奶」、标题是「甜牛奶250毫升」→「甜牛奶」），
 * 免得以后喝普通牛奶也按甜牛奶算
 */
function specificName(name, summary) {
  const units = '个只根片粒勺杯碗盒包袋瓶份块条碟克g毫升ml斤两';
  const strip = (t) => t.replace(new RegExp(`[\\d.]+\\s*[${units}]*$`, 'i'), '').replace(new RegExp(`[一二两三四五六七八九十半几]+[${units}]$`), '').trim();
  const better = String(summary || '').split(/[、，,；;\s]+/).map(strip)
    .filter(t => t.length > name.length && t.includes(name)).sort((a, b) => a.length - b.length)[0];
  return better || name;
}

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
      const hasItems = Array.isArray(rec.items) && rec.items.length > 0;
      f.innerHTML = `
        <div class="seg seg-sm" id="edit-meal-type">
          ${MEAL_TYPES.map(t => `<button type="button" class="seg-btn ${rec.mealType === t ? 'active' : ''}" data-value="${t}">${t.replace('/补剂', '')}</button>`).join('')}
        </div>
        ${input('foodSummary', '吃了什么', rec.foodSummary, 'text', 'maxlength="60"')}
        ${rec.said ? `<div class="said">你说的：「${esc(rec.said)}」</div>` : ''}
        ${hasItems ? `<div class="breakdown">
          <div class="breakdown-head">怎么算的</div>
          ${rec.items.map((i, idx) => `<div class="breakdown-row">
            <div class="bd-top">
              <span class="bd-name">${esc(i.name)}${i.grams && !String(i.amount || '').replace('克', 'g').includes(i.grams + 'g') ? `<small>${i.grams}g</small>` : ''}</span>
              <em class="src ${SRC_CLASS[i.src] || ''}">${esc(i.src || '')}</em>
            </div>
            ${i.supp && i.nutrients ? `<div class="bd-nut">${esc(TF.nutrientsText(i.nutrients))}</div>` : ''}
            <div class="bd-fields">
              <label class="bd-f bd-f-amt"><span>份量</span><input class="bd-input bd-amt" name="amt_${idx}" type="text" maxlength="12" value="${esc(amountOf(i))}" aria-label="${esc(i.name)} 份量"></label>
              <label class="bd-f"><input class="bd-input" name="item_${idx}" type="number" inputmode="numeric" min="0" value="${Math.round(i.calories || 0)}" aria-label="${esc(i.name)} 热量"><span>kcal</span></label>
              ${i.supp ? '' : `<label class="bd-f"><input class="bd-input" name="prot_${idx}" type="number" inputmode="decimal" step="0.1" min="0" value="${round1(i.proteinG || 0)}" aria-label="${esc(i.name)} 蛋白质"><span>g 蛋白</span></label>`}
            </div>
          </div>`).join('')}
          <div class="bd-total" id="bd-total"></div>
          <div class="breakdown-note">吃的量不一样就改份量（比如 2个 改成 1个），按比例重算；这东西本身的热量、蛋白质不一样（比如包装上写的）就改数，会记住，下次说到同样的东西就用你的数；热量填 0 去掉这一样。「成分表」来自《中国食物成分表（第6版）》，「USDA」来自美国农业部食物数据库（成分表里没有的），「台湾成分库」是台湾卫福部食药署实测的饺子包子这类熟食，「菜品库」是按菜谱和用油算的家常菜，「估算」是 AI 按常见大小估的；肉按生重算。</div>
        </div>` : `<div class="field-grid field-grid-2">
          ${input('calories', '热量 kcal', rec.calories)}
          ${input('proteinG', '蛋白质 g', rec.proteinG || 0)}
          ${input('carbsG', '碳水 g', rec.carbsG || 0)}
          ${input('fatG', '脂肪 g', rec.fatG || 0)}
        </div>`}`;
      if (hasItems) {
        const form = f.closest('form');
        // 合计永远是每一样加起来
        const showTotal = () => {
          const t = TF.sumItems(this.itemsFromForm(rec, form).items);
          document.getElementById('bd-total').innerHTML = `合计 <b>${fmt(t.calories)}</b> kcal · 蛋白 <b>${round1(t.proteinG)}</b>g · 碳水 ${round1(t.carbsG)}g · 脂肪 ${round1(t.fatG)}g`;
        };
        // 改份量：这一样的热量、蛋白质按比例跟着变
        f.querySelectorAll('.bd-amt').forEach(el => el.addEventListener('input', () => {
          const idx = +el.name.slice(4);
          const it = scaleItem(rec.items[idx], el.value.trim() || amountOf(rec.items[idx]));
          form.elements['item_' + idx].value = Math.round(it.calories);
          if (form.elements['prot_' + idx]) form.elements['prot_' + idx].value = round1(it.proteinG);
        }));
        f.querySelectorAll('.bd-input').forEach(el => el.addEventListener('input', showTotal));
        // 改标题里的数（「米饭1碗」→「米饭2碗」）：下面每一样的份量、热量跟着变（v12）；自己改过份量的那一样不动
        f.querySelectorAll('.bd-amt').forEach(el => el.addEventListener('input', () => { el.dataset.touched = '1'; }));
        form.elements.foodSummary.addEventListener('input', () => {
          const amts = summaryAmounts(rec, form.elements.foodSummary.value.trim());
          rec.items.forEach((it, idx) => {
            const el = form.elements['amt_' + idx];
            if (!el || el.dataset.touched) return;
            const amt = amts ? amts[idx] : amountOf(it);
            if (el.value === amt) return;
            el.value = amt;
            const sc = scaleItem(it, amt);
            form.elements['item_' + idx].value = Math.round(sc.calories);
            if (form.elements['prot_' + idx]) form.elements['prot_' + idx].value = round1(sc.proteinG);
          });
          showTotal();
        });
        showTotal();
      }
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

  /**
   * 读出每一样改后的样子：
   *  · 份量变了（2个 → 1个）：按比例重算，不记住——是吃的量不一样，不是这东西的数不对
   *  · 热量 / 蛋白质改了：这东西本身不一样（比如包装上写的），标成「我的」并记住；热量改成 0 就去掉这一样
   */
  itemsFromForm(rec, form) {
    const items = [];
    const changed = [];
    let dirty = false;
    let reshaped = false; // 份量改了或去掉了某一样：标题要跟着变
    (rec.items || []).forEach((it, idx) => {
      const amtEl = form.elements['amt_' + idx];
      const scaled = scaleItem(it, amtEl ? amtEl.value.trim() || amountOf(it) : amountOf(it));
      const kEl = form.elements['item_' + idx];
      const pEl = form.elements['prot_' + idx];
      const kIn = kEl ? parseFloat(kEl.value) : NaN;
      const pIn = pEl ? parseFloat(pEl.value) : NaN;
      const kChanged = Number.isFinite(kIn) && kIn >= 0 && Math.round(kIn) !== Math.round(scaled.calories);
      const pChanged = Number.isFinite(pIn) && pIn >= 0 && round1(pIn) !== round1(scaled.proteinG || 0);
      if (kChanged && Math.round(kIn) === 0) { dirty = reshaped = true; return; } // 填 0：去掉这一样
      if (scaled !== it) reshaped = true;
      let next = scaled;
      if (kChanged || pChanged) {
        const k = kChanged && scaled.calories > 0 ? kIn / scaled.calories : 1;
        next = Object.assign({}, scaled, {
          calories: kChanged ? Math.round(kIn) : scaled.calories,
          proteinG: pChanged ? round1(pIn) : round1((scaled.proteinG || 0) * k),
          carbsG: round1((scaled.carbsG || 0) * k), fatG: round1((scaled.fatG || 0) * k), src: '我的',
          name: specificName(scaled.name, rec.foodSummary)
        });
        delete next.dbName;
        changed.push(next);
      }
      if (next !== it) dirty = true;
      items.push(next);
    });
    return { items, changed, dirty, reshaped };
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
    let reestimate = '';
    if (kind === 'meal') {
      rec._oldSummary = rec.foodSummary;
      const active = form.querySelector('#edit-meal-type .seg-btn.active');
      if (active && active.dataset.value !== rec.mealType) { rec.mealType = active.dataset.value; rec.mealFixed = true; } // 手动改了顿：以后分顿照这个
      const summary = (val('foodSummary') || '').trim();
      const summaryTouched = summary && summary !== rec.foodSummary;
      rec.foodSummary = summary || rec.foodSummary;
      if (Array.isArray(rec.items) && rec.items.length) {
        // 有明细：合计永远由每一样加出来，不会两边对不上
        const oldSummary = rec._oldSummary || '';
        const r = this.itemsFromForm(rec, form);
        Object.assign(rec, TF.sumItems(r.items)); // 以前两边对不上的记录，保存一下也会对齐
        if (r.dirty) {
          rec.items = r.items.length ? r.items : undefined;
          if (!summaryTouched && r.reshaped && r.items.length) rec.foodSummary = r.items.map(it => it.name + (it.amount || '')).join('、').slice(0, 60);
          r.changed.forEach(x => this.rememberFood(x));
          remembered = r.changed.map(x => x.name);
        } else if (summaryTouched && oldSummary && bareSummary(summary) !== bareSummary(oldSummary) && window.QuickLog) {
          // 换了吃的（「牛肉面1碗」→「牛肉面1碗加个蛋」）：标题先改上，再让 AI 按新的说法重估这一条（v12，以前数一直不跟着变）
          reestimate = `把「${oldSummary}」改成「${summary}」`;
        }
      } else {
        rec.calories = Math.round(numv('calories', rec.calories));
        rec.proteinG = round1(numv('proteinG', rec.proteinG || 0));
        rec.carbsG = round1(numv('carbsG', rec.carbsG || 0));
        rec.fatG = round1(numv('fatG', rec.fatG || 0));
      }
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
    delete rec._oldSummary;
    this.saveData();
    this.closeEditor();
    this.render();
    window.Haptics && window.Haptics.fire('tap');
    if (reestimate) { this.selectedDate = rec.date; window.QuickLog.submit(reestimate, { again: true }); return; }
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

if (typeof module !== 'undefined' && module.exports) module.exports = { scaleItem, summaryAmounts, gramsIn, bareSummary };
