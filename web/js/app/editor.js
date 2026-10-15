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
/** 来源标签点一下，说一句这个数是哪来的（v12.7：以前写成面板底下一大段，用户嫌字多） */
const SRC_INFO = {
  '成分表': '《中国食物成分表》第 6 版',
  'USDA': '美国农业部食物数据库（成分表里没有的）',
  '台湾成分库': '台湾食药署实测的熟食（饺子、包子这类）',
  '菜品库': '按菜谱和用油算的家常菜',
  '估算': 'AI 按常见大小估的；改了数会记住',
  '我的': '你改过的数，下次说到同样的就用它',
  '包装': '按你念的包装上的数',
  '补剂': '补剂按常见一粒算'
};

/** 明细拼回「吃了什么」：「小鱼干2包、豆浆1杯」 */
function draftSummary(rows) {
  return rows.filter(r => r.name && r.name.trim()).map(r => r.name.trim() + (r.amount || '').trim()).join('、').slice(0, 60);
}

/**
 * 新加的一样（v12.7）：先看你记住的、再查库，按份量算出热量蛋白碳水脂肪；都没有返回 null（交给 AI 估）。
 * 份量写了克数按克数，写「2个」按库里常见一份的克数 × 个数。
 */
function lookupLocal(name, amount, myFoods) {
  name = String(name || '').trim();
  if (!name || !TF.FoodDB) return null;
  const g = gramsIn(amount);
  const my = TF.MyFoods && TF.MyFoods.match(myFoods || [], name);
  if (my) {
    const f = TF.MyFoods.factor(g || null, amount || my.amount, my);
    return { calories: Math.round(my.calories * f), proteinG: round1((my.proteinG || 0) * f), carbsG: round1((my.carbsG || 0) * f), fatG: round1((my.fatG || 0) * f),
      src: '我的', grams: my.grams ? Math.round(my.grams * f) : null };
  }
  const e = TF.FoodDB.find(name);
  if (!e) return null;
  const grams = g || (amount ? TF.countOf(amount) : 1) * (e.g || 100);
  return { calories: Math.round(e.k * grams / 100), proteinG: round1(e.p * grams / 100), carbsG: round1(e.c * grams / 100), fatG: round1(e.f * grams / 100),
    src: TF.FoodDB.label(e), grams: Math.round(grams), dbName: e.name };
}

/** 明细存回记录时去掉面板里用的记号 */
function cleanRow(r) {
  const o = Object.assign({}, r);
  ['_base', '_mine', '_new', '_found', 'opts'].forEach(k => delete o[k]);
  o.name = String(o.name || '').trim();
  if (o.amount != null) o.amount = String(o.amount).trim() || undefined;
  if (r._mine) { o.src = '我的'; delete o.dbName; }
  return o;
}

/**
 * 修改一条饮食或训练记录的弹层（体重的弹层在 weight.js）。
 */
Object.assign(FitnessApp.prototype, {
  openEditor(kind, id) {
    // 计划（v12.9）：和记录一样的面板，改的是那行计划；练的多一块「按你的成绩」、一行要点
    const plan = kind === 'plan' ? (this.plans || []).find(p => p.id === id) : null;
    if (kind === 'plan') { if (!plan || plan.done) return; kind = plan.kind === 'meal' ? 'meal' : 'workout'; }
    const list = kind === 'meal' ? this.diet : this.workouts;
    const rec = plan || list.find(r => r.id === id);
    if (!rec) return;
    this.editing = { kind, id, plan: !!plan };
    this._draft = null;
    // 照计划打勾记的那条：删掉 = 撤回打勾（计划回到还没做）
    const fromPlan = !plan && (this.plans || []).some(p => p.done && p.recId === id);
    const del = document.getElementById('edit-delete');
    del.classList.remove('hidden');
    del.textContent = plan ? '不要这条' : fromPlan ? '撤回打勾' : '删除';
    const f = document.getElementById('edit-fields');
    const input = (name, label, value, type = 'number', extra = '') =>
      `<label class="field"><span class="field-label">${label}</span><input class="input" name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} ${extra}></label>`;

    if (kind === 'meal') {
      document.getElementById('edit-title').textContent = plan ? '改计划 · 吃的' : '修改饮食';
      const hasItems = Array.isArray(rec.items) && rec.items.length > 0;
      f.innerHTML = `
        <div class="seg seg-sm" id="edit-meal-type">
          ${MEAL_TYPES.map(t => `<button type="button" class="seg-btn ${rec.mealType === t ? 'active' : ''}" data-value="${t}">${t.replace('/补剂', '')}</button>`).join('')}
        </div>
        ${input('foodSummary', plan ? '吃什么' : '吃了什么', rec.foodSummary, 'text', 'maxlength="60"')}
        ${rec.said ? `<div class="said">你说的：「${esc(rec.said)}」</div>` : ''}
        ${hasItems ? `<div class="breakdown">
          <div class="breakdown-head"><span>明细</span><button type="button" class="bd-add" id="bd-add">＋ 加一样</button></div>
          <div class="bd-ai hidden" id="bd-ai" role="status"><span id="bd-ai-text"></span><button type="button" id="bd-ai-go"></button></div>
          <div class="bd-list" id="bd-list"></div>
          <div class="bd-total" id="bd-total"></div>
          <div class="breakdown-note">${plan ? '改份量按比例算。' : '改份量按比例算；改了数会记住，下次照你的。'}点来源标签看数是哪来的。</div>
        </div>` : `<div class="field-grid field-grid-2">
          ${input('calories', '热量 kcal', rec.calories)}
          ${input('proteinG', '蛋白质 g', rec.proteinG || 0)}
          ${input('carbsG', '碳水 g', rec.carbsG || 0)}
          ${input('fatG', '脂肪 g', rec.fatG || 0)}
        </div>`}`;
      if (hasItems) this.bindMealDraft(rec, f.closest('form'));
      f.querySelector('#edit-meal-type').addEventListener('click', (e) => {
        const b = e.target.closest('.seg-btn');
        if (!b) return;
        f.querySelectorAll('#edit-meal-type .seg-btn').forEach(x => x.classList.toggle('active', x === b));
      });
    } else if (plan) {
      document.getElementById('edit-title').textContent = '改计划 · 训练';
      f.innerHTML = rec.durationMin ? `
        ${input('exerciseName', '项目', rec.exerciseName, 'text', 'maxlength="30"')}
        ${input('durationMin', '时长 分钟', rec.durationMin)}
        ${input('tip', '要点', rec.tip || '', 'text', 'maxlength="30" placeholder="可以不写"')}` : `
        ${input('exerciseName', '动作', rec.exerciseName, 'text', 'maxlength="30"')}
        <div class="plan-sug hidden" id="plan-sug"></div>
        <div class="field-grid">
          ${input('weightKg', '重量 kg', rec.weightKg || 0, 'number', 'placeholder="自重填 0"')}
          ${input('sets', '组数', rec.sets)}
          ${input('reps', '每组次数', rec.reps)}
        </div>
        ${input('tip', '要点', rec.tip || '', 'text', 'maxlength="30" placeholder="可以不写"')}`;
      if (!rec.durationMin) this.bindPlanSug(rec, f.closest('form'));
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
   * 改训练计划时「按你的成绩」那一块（v12.9）：练过的动作写下次该练多少 + 为什么，点「用这个」填进下面；
   * 动作名字改了就按新名字重算；没练过的写一句「练完记一次，下次按成绩给你加」。
   */
  bindPlanSug(rec, form) {
    const box = form.querySelector('#plan-sug');
    const draw = () => {
      const name = (form.elements.exerciseName.value || '').trim();
      const prog = name && this.exerciseProgress(name, { date: rec.date });
      const n = prog && prog.next;
      const cur = { w: parseFloat(form.elements.weightKg.value) || 0, s: parseInt(form.elements.sets.value, 10) || 0, r: parseInt(form.elements.reps.value, 10) || 0 };
      if (!n) {
        box.className = 'plan-sug none';
        box.textContent = name ? `还没练过「${name}」，练完记一次，下次按成绩给你加` : '';
        box.classList.toggle('hidden', !name);
        return;
      }
      const sets = n.kind === 'sets' || /都用/.test(n.text) ? n.sets : (cur.s || n.sets);
      const same = n.weightKg === cur.w && n.reps === cur.r && sets === cur.s;
      const kg = (w) => (w > 0 ? round1(w) + 'kg' : '自重');
      box.className = 'plan-sug';
      box.innerHTML = `<b>按你的成绩：${kg(n.weightKg)} · ${sets}×${n.reps}</b>` +
        `<small>上次 ${kg(prog.last.weightKg)} ${prog.last.sets}×${prog.last.reps}（${+prog.last.date.slice(5, 7)}月${+prog.last.date.slice(8)}日）${n.why ? ' · ' + esc(n.why) : ''}</small>` +
        (same ? '<button type="button" disabled>已经是了</button>' : '<button type="button" data-use="1">用这个</button>');
      const b = box.querySelector('[data-use]');
      if (b) b.addEventListener('click', () => {
        form.elements.weightKg.value = n.weightKg;
        form.elements.sets.value = sets;
        form.elements.reps.value = n.reps;
        if (n.kind === 'harder' && !form.elements.tip.value) form.elements.tip.value = n.text.replace(/^下次/, '').slice(0, 30);
        window.Haptics && window.Haptics.fire('tick');
        draw();
      });
    };
    form.elements.exerciseName.addEventListener('change', draw);
    ['weightKg', 'sets', 'reps'].forEach(k => form.elements[k].addEventListener('input', draw));
    draw();
  },

  /**
   * 饮食明细（v12.7，用户：「让用户也能改下面的食物信息，或者改上面自动对应下面；现在接了 AI，但改的还不是很清楚」）：
   * 每一样都能改名字、份量、热量、蛋白、碳水、脂肪，能删、能加一样；改了份量按比例算，改了数标成「我的」、保存时记住。
   * 上下两边对着走：
   *  · 上面只改了数（「小鱼干2包」→「1包」）：下面每一样的份量、数跟着变（`summaryAmounts`）；
   *  · 上面换了吃的：明细上面冒一条「换成「…」了 · AI 重算明细」，点了当场让 AI 估（`fastLog` 能秒记的先秒记），结果直接填进下面；
   *    不点就保存，照旧保存后让 AI 按新的说法重估这一条；
   *  · 下面改名字、份量、加一样、删一样：上面跟着拼出来（上面换了字、还没重算的，留着你写的）；
   *  · 新加的一样先查你记住的和食物库，查不到冒「「X」库里没有 · AI 估一下」。
   * 草稿在 `this._draft`，保存时 `saveEditor` 从这里取。
   */
  bindMealDraft(rec, form) {
    const list = form.querySelector('#bd-list');
    const top = form.elements.foodSummary;
    const bar = form.querySelector('#bd-ai');
    const d = this._draft = {
      rows: rec.items.map(it => Object.assign({}, it, { _base: it })),
      base: rec.foodSummary || '', // 下面这些明细对应的说法
      words: false, // 上面换了吃的、下面还没重算
      busy: false, fail: '', token: 0
    };
    const NUMS = [['calories', 'kcal', 0], ['proteinG', '蛋白 g', 1], ['carbsG', '碳水 g', 1], ['fatG', '脂肪 g', 1]];
    const v = (n, dec) => (n == null || n === '' ? '' : dec ? round1(n) : Math.round(n));
    const rowHtml = (r, i) => {
      const gramsHint = r.grams && !String(r.amount || '').replace('克', 'g').includes(r.grams + 'g') ? `≈${r.grams}g` : '';
      const nums = (r.supp ? NUMS.slice(0, 1) : NUMS).map(([k, label, dec]) =>
        `<label class="bd-num"><input class="bd-input" data-i="${i}" data-k="${k}" type="number" inputmode="decimal" step="any" min="0" value="${v(r[k], dec)}" placeholder="0" aria-label="${esc(r.name || '这一样')} ${label}"><span>${label}</span></label>`).join('');
      return `<div class="bd-row${r._new ? ' new' : ''}" data-i="${i}">
        <div class="bd-line">
          <input class="bd-input bd-name-in" data-i="${i}" data-k="name" type="text" maxlength="20" value="${esc(r.name || '')}" placeholder="吃的什么" aria-label="名字">
          <input class="bd-input bd-amt-in" data-i="${i}" data-k="amount" type="text" maxlength="12" value="${esc(r.amount != null ? r.amount : amountOf(r))}" placeholder="份量" aria-label="份量">
          <button type="button" class="bd-src ${r._mine ? 'mine' : SRC_CLASS[r.src] || ''}${r.src || r._mine ? '' : ' hidden'}" data-i="${i}" data-act="src">${esc(r._mine ? '我的' : r.src || '')}</button>
          <button type="button" class="bd-del" data-i="${i}" data-act="del" aria-label="去掉这一样">×</button>
        </div>
        ${gramsHint || (r.supp && r.nutrients) ? `<div class="bd-sub">${esc([gramsHint, r.supp && r.nutrients ? TF.nutrientsText(r.nutrients) : ''].filter(Boolean).join(' · '))}</div>` : ''}
        <div class="bd-nums${r.supp ? ' one' : ''}">${nums}</div>
      </div>`;
    };
    const render = () => { list.innerHTML = d.rows.map(rowHtml).join(''); total(); };
    const fillRow = (i) => {
      const r = d.rows[i];
      NUMS.forEach(([k, , dec]) => { const el = list.querySelector(`input[data-i="${i}"][data-k="${k}"]`); if (el && document.activeElement !== el) el.value = v(r[k], dec); });
      const tag = list.querySelector(`.bd-src[data-i="${i}"]`);
      if (tag) { const t = r._mine ? '我的' : r.src || ''; tag.textContent = t; tag.className = `bd-src ${r._mine ? 'mine' : SRC_CLASS[r.src] || ''}${t ? '' : ' hidden'}`; }
    };
    const total = () => {
      const t = TF.sumItems(d.rows.filter(r => r.name).map(cleanRow));
      form.querySelector('#bd-total').innerHTML = `合计 <b>${fmt(t.calories)}</b> kcal · 蛋白 <b>${round1(t.proteinG)}</b>g · 碳水 ${round1(t.carbsG)}g · 脂肪 ${round1(t.fatG)}g`;
    };
    const missing = () => d.rows.findIndex(r => r._new && r.name && r.name.trim() && !r._found && !r._mine && !(r.calories > 0));
    const showBar = () => {
      const text = form.querySelector('#bd-ai-text'), go = form.querySelector('#bd-ai-go');
      const m = missing();
      let msg = '', btn = '';
      if (d.busy) msg = 'AI 在算…';
      else if (d.fail) { msg = d.fail; btn = '再试一次'; }
      else if (d.words) { msg = `换成「${top.value.trim()}」了`; btn = 'AI 重算明细'; }
      else if (m >= 0) { msg = `「${d.rows[m].name.trim()}」库里没有`; btn = 'AI 估一下'; }
      bar.classList.toggle('hidden', !msg);
      bar.classList.toggle('busy', d.busy);
      text.textContent = msg;
      go.textContent = btn;
      go.classList.toggle('hidden', !btn);
    };
    // 下面动了名字 / 份量 / 加 / 删：上面跟着拼；上面换了字还没重算的，留着你写的、当你在下面自己对（不再提示重算）
    const reshaped = () => {
      if (!d.words) top.value = draftSummary(d.rows) || top.value;
      d.base = top.value;
      d.words = false; d.fail = '';
      total(); showBar();
    };
    const local = (i) => {
      const r = d.rows[i];
      const hit = lookupLocal(r.name, r.amount, this.myFoods);
      r._found = !!hit;
      if (hit) { Object.assign(r, hit); r._base = cleanRow(r); }
      else if (!r._mine) Object.assign(r, { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, src: '' });
      fillRow(i);
    };

    list.addEventListener('input', (e) => {
      const el = e.target.closest('input[data-k]');
      if (!el) return;
      const i = +el.dataset.i, k = el.dataset.k, r = d.rows[i];
      if (!r) return;
      if (k === 'name') {
        r.name = el.value;
        if (r._new && !r._mine) local(i);
        reshaped();
      } else if (k === 'amount') {
        r.amount = el.value;
        if (r._new && !r._mine && !r._base.name) local(i);
        else {
          const sc = scaleItem(r._base, el.value.trim() || amountOf(r._base));
          ['calories', 'proteinG', 'carbsG', 'fatG', 'grams', 'nutrients'].forEach(x => { if (sc[x] !== undefined) r[x] = sc[x]; });
          fillRow(i);
        }
        reshaped();
      } else {
        const n = parseFloat(el.value);
        r[k] = Number.isFinite(n) && n >= 0 ? (k === 'calories' ? Math.round(n) : round1(n)) : 0;
        r._mine = true;
        r._base = Object.assign(cleanRow(r), { amount: r.amount });
        fillRow(i);
        total(); showBar();
      }
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.act === 'del') {
        d.rows.splice(i, 1);
        window.Haptics && window.Haptics.fire('tick');
        render(); reshaped();
      } else if (b.dataset.act === 'src') {
        const r = d.rows[i];
        const t = r && (r._mine ? '我的' : r.src);
        if (t && SRC_INFO[t]) this.showToast(`${t}：${SRC_INFO[t]}`);
      }
    });
    form.querySelector('#bd-add').addEventListener('click', () => {
      d.rows.push({ name: '', amount: '', calories: 0, proteinG: 0, carbsG: 0, fatG: 0, src: '', _new: true, _base: {} });
      render(); showBar();
      const el = list.querySelector(`input[data-i="${d.rows.length - 1}"][data-k="name"]`);
      if (el) el.focus();
    });
    // 上面改了：只改了数 → 下面跟着按比例；换了吃的 → 冒「AI 重算明细」
    top.addEventListener('input', () => {
      const now = top.value.trim();
      const amts = summaryAmounts({ foodSummary: d.base, items: d.rows.map(cleanRow) }, now);
      if (amts) d.rows.forEach((r, i) => {
        if (amts[i] === amountOf(r)) return;
        r.amount = amts[i];
        const sc = scaleItem(r._base.name ? r._base : r, amts[i]);
        ['calories', 'proteinG', 'carbsG', 'fatG', 'grams'].forEach(x => { if (sc[x] !== undefined) r[x] = sc[x]; });
        const a = list.querySelector(`input[data-i="${i}"][data-k="amount"]`);
        if (a) a.value = amts[i];
        fillRow(i);
      });
      d.words = !!now && bareSummary(now) !== bareSummary(d.base);
      d.fail = '';
      total(); showBar();
    });
    // AI：上面换了吃的就整份重算；新加的一样库里没有就只估那一样
    form.querySelector('#bd-ai-go').addEventListener('click', async () => {
      if (d.busy) return;
      const m = missing();
      const whole = d.words || (d.fail && d._lastWhole);
      const text = whole ? top.value.trim() : m >= 0 ? `${d.rows[m].name.trim()}${(d.rows[m].amount || '').trim()}` : '';
      if (!text) return;
      d.busy = true; d.fail = ''; d._lastWhole = whole; showBar();
      const token = ++d.token;
      try {
        const items = await this.estimateFood(text);
        if (token !== d.token || this._draft !== d) return; // 面板关了 / 又点了一次
        if (!items.length) throw new Error('EMPTY');
        if (whole) {
          d.rows = items.map(it => Object.assign({}, it, { _base: it }));
          d.base = top.value.trim();
          d.words = false;
        } else {
          const r = d.rows[m];
          const t = TF.sumItems(items);
          Object.assign(r, { calories: t.calories, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG, src: items.length === 1 ? items[0].src : '估算', _found: true });
          if (items.length === 1 && items[0].grams) r.grams = items[0].grams;
          r._base = cleanRow(r);
        }
        d.busy = false;
        render(); showBar();
        list.classList.remove('flash'); void list.offsetWidth; list.classList.add('flash');
        window.Haptics && window.Haptics.fire('success');
      } catch (e) {
        if (token !== d.token) return;
        d.busy = false;
        d.fail = '没算出来';
        showBar();
      }
    });
    render(); showBar();
  },

  /** 估一句吃的（不记）：吃过的先本机秒记，不然问 AI；返回整理好、按库算过的明细 */
  async estimateFood(text) {
    const said = '吃了' + text;
    const now = new Date();
    let r = null;
    try {
      r = TF.fastLog ? TF.fastLog(said, { now, today: getTodayDateString(), myFoods: this.myFoods, diet: this.diet, workouts: this.workouts, simple: this.isSimple() }) : null;
    } catch (e) { r = null; }
    if (!r || !(r.meals || []).length) r = await TF.Parser.parse(said, { now, history: [], myFoods: this.myFoods });
    return [].concat(...((r && r.meals) || []).map(m => m.items || [])).map(it => cleanRow(it));
  },

  /** 改了计划里吃的、没点「AI 重算明细」：后台估一下，算好了换掉这一行的明细（算不出来就留着你写的字，点开再算） */
  async reestimatePlan(rec) {
    this.showToast('计划改好了，AI 在算热量…');
    try {
      const items = await this.estimateFood(rec.foodSummary);
      if (!items.length || !(this.plans || []).includes(rec)) throw new Error('EMPTY');
      rec.items = items;
      Object.assign(rec, TF.sumItems(items));
      this.saveData();
      this.render();
      this.showToast(`算好了：${rec.foodSummary} ${fmt(rec.calories)} kcal`);
    } catch (e) {
      this.showToast('热量没算出来，点开那行再点「AI 重算明细」');
    }
  },

  closeEditor(fromBack) {
    if (!this.editing) return;
    this.editing = null;
    this._draft = null;
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
    const isPlan = !!this.editing.plan;
    const list = isPlan ? (this.plans || []) : kind === 'meal' ? this.diet : this.workouts;
    const rec = list.find(r => r.id === id);
    if (!rec) return this.closeEditor();
    const val = (name) => form.elements[name] ? form.elements[name].value : undefined;
    const numv = (name, fallback) => { const v = parseFloat(val(name)); return Number.isFinite(v) && v >= 0 ? v : fallback; };

    let remembered = [];
    let reestimate = '';
    if (kind === 'meal') {
      rec._oldSummary = rec.foodSummary;
      const active = form.querySelector('#edit-meal-type .seg-btn.active');
      if (active && active.dataset.value !== rec.mealType) { rec.mealType = active.dataset.value; if (!isPlan) rec.mealFixed = true; } // 手动改了顿：以后分顿照这个
      const summary = (val('foodSummary') || '').trim();
      const summaryTouched = summary && summary !== rec.foodSummary;
      rec.foodSummary = summary || rec.foodSummary;
      const d = this._draft;
      if (d && Array.isArray(rec.items) && rec.items.length) {
        const oldSummary = rec._oldSummary || '';
        if (d.words && summaryTouched && isPlan) {
          // 计划：标题先改上，AI 在后台重算这一行的明细（计划不是记录，不能交给「把…改成…」）
          reestimate = 'plan';
        } else if (d.words && summaryTouched && window.QuickLog) {
          // 上面换了吃的、没点「AI 重算明细」：标题先改上，保存后让 AI 按新的说法重估这一条（v12）
          reestimate = `把「${oldSummary}」改成「${summary}」`;
        } else {
          // 明细就是面板里的草稿；合计永远由每一样加出来
          const rows = d.rows.filter(r => r.name && r.name.trim());
          const items = rows.map(r => {
            const o = cleanRow(r);
            if (r._mine) o.name = specificName(o.name, summary);
            return o;
          });
          if (!isPlan) rows.forEach((r, i) => { if (r._mine && !r.supp) { this.rememberFood(items[i]); remembered.push(items[i].name); } });
          rec.items = items.length ? items : undefined;
          Object.assign(rec, items.length ? TF.sumItems(items) : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
          rec.foodSummary = summary || draftSummary(items) || rec.foodSummary; // 下面改了名字 / 份量时上面已经跟着拼好了
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
      if (isPlan) {
        // 计划：消耗按改完的重新算；换了动作，部位跟着换；要点能改
        const lw = this.latestWeight ? this.latestWeight() : null;
        const info = TF.exerciseInfo(rec.exerciseName);
        if (info.muscle) rec.muscleGroup = info.muscle;
        rec.burnedCalories = rec.durationMin ? TF.metBurn(info.met, rec.durationMin, lw && lw.kg) : TF.strengthBurn(rec.exerciseName, rec.weightKg, rec.sets, rec.reps, lw && lw.kg);
        const tip = (val('tip') || '').trim();
        if (tip) rec.tip = tip.slice(0, 30); else delete rec.tip;
      }
    }
    delete rec._oldSummary;
    this.saveData();
    this.closeEditor();
    this.render();
    window.Haptics && window.Haptics.fire('tap');
    if (reestimate === 'plan') { this.reestimatePlan(rec); return; }
    if (reestimate) { this.selectedDate = rec.date; window.QuickLog.submit(reestimate, { again: true }); return; }
    this.showToast(isPlan ? '计划改好了' : remembered.length ? `已保存，记住了 ${remembered.join('、')}` : '已保存');
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
    if (this.editing.plan) { this.closeEditor(); this.dropPlan(id); return; }
    const list = kind === 'meal' ? this.diet : this.workouts;
    const idx = list.findIndex(r => r.id === id);
    if (idx === -1) return this.closeEditor();
    const [removed] = list.splice(idx, 1);
    // 照计划打勾记的：计划回到还没做（v12.9「撤回打勾」）
    const plan = (this.plans || []).find(p => p.done && p.recId === id);
    if (plan) { delete plan.done; delete plan.recId; }
    window.Haptics && window.Haptics.fire('tap');
    this.saveData();
    this.closeEditor();
    this.render();
    if (window.QuickLog) {
      window.QuickLog.showUndo(plan ? '撤回了，变回计划' : '已删除 1 条', [], () => {
        list.splice(idx, 0, removed);
        if (plan) { plan.done = true; plan.recId = removed.id; }
        this.saveData();
        this.render();
      });
    } else {
      this.showToast('已删除');
    }
  }
});

if (typeof module !== 'undefined' && module.exports) module.exports = { scaleItem, summaryAmounts, gramsIn, bareSummary, draftSummary, lookupLocal, cleanRow };
