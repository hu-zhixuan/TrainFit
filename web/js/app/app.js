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
    this.plans = load('fit_plans', []);       // 小人给的计划（明天的食谱、训练），做完点 ✓ 变成记录，见 plans.js
    // 模式：eat = 只记吃的（想瘦 / 随便记记），fit = 吃和练都记（健身）
    // 老用户（已经有记录或改过身体数据）默认 fit，不打扰；新用户第一次打开先问
    this.needsOnboarding = false;
    if (!this.profile.mode) {
      if (this.workouts.length || this.diet.length || this.profile.customized) this.profile.mode = 'fit';
      else this.needsOnboarding = true;
    }
    this.recalculateMetabolism();

    // 上次没整理完就关了 App 的，恢复成「失败，可重试」；只是在问的就算了（旧版存的没有 ask 标记，按字判断）
    this.pending = load(PENDING_KEY, []).filter(p => !(TF.pureQuestion && TF.pureQuestion(p.text)))
      .map(p => Object.assign(p, { status: 'failed', error: '上次没整理完' }));

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
    store('fit_plans', this.plans);
  }

  savePending() {
    store(PENDING_KEY, this.pending.map(p => ({ id: p.id, text: p.text, date: p.date, ts: p.ts, ask: p.ask || undefined })));
  }

  /** 只记吃的模式：藏起训练、蛋白质、赤字这些健身词 */
  isSimple() { return this.profile.mode === 'eat'; }

  applyMode() {
    const simple = this.isSimple();
    document.body.classList.toggle('mode-eat', simple);
    const t = document.getElementById('cmp-text');
    if (t) t.placeholder = simple ? '今天吃了啥？' : '今天练了啥、吃了啥？';
    const tip = document.getElementById('cmp-tip');
    if (tip) tip.textContent = simple ? '按住说今天吃了啥，松手自动算好热量' : '按住说练了啥、吃了啥，一句一大段都行，松手自动记好';
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
    // 练完说的感受（小人问的）：很吃力就先保持，还能加就多加一档
    const easy = last.rpe && last.rpe <= 7, hard = last.rpe && last.rpe >= 9.5;
    if (hard) {
      next = { kind: 'keep', text: `保持 ${last.weightKg > 0 ? round1(last.weightKg) + 'kg' : '这个'}，练扎实了再加`, weightKg: last.weightKg, reps: last.reps };
    } else if (last.weightKg > 0 && (last.reps >= cap || (easy && last.reps >= cap - 2)) && last.sets >= 3) {
      const up = easy ? step * 2 : step;
      next = { kind: 'weight', text: `下次${easy ? '直接' : ''}试 ${round1(last.weightKg + up)}kg`, weightKg: round1(last.weightKg + up), reps: Math.max(6, last.reps - 2) };
    } else if (last.reps < cap) {
      next = { kind: 'reps', text: `下次冲 ${last.reps + 1} 次`, weightKg: last.weightKg, reps: last.reps + 1 };
    } else {
      next = { kind: 'keep', text: '保持，练扎实', weightKg: last.weightKg, reps: last.reps };
    }
    const best = logs.reduce((m, w) => Math.max(m, w.weightKg || 0), 0);
    return { last, next, count: logs.length, best, isLatest: (id) => id === last.id };
  }

  /**
   * 刚记的这组和以前比：「杠铃卧推：比上次多 1 次 · 下次冲 9 次」「新纪录 85kg（以前最多 82.5kg）」。
   * 有氧、数字是估的、第一次练的不说。
   */
  liftFeedback(rec) {
    if (!rec || rec.durationMin || /估计/.test(rec.notes || '')) return '';
    const t = recordTs(rec);
    const earlier = this.workouts
      .filter(w => w.id !== rec.id && w.exerciseName === rec.exerciseName && !w.durationMin && (w.date < rec.date || (w.date === rec.date && recordTs(w) < t)))
      .sort((a, b) => (b.date === a.date ? recordTs(b) - recordTs(a) : (b.date > a.date ? 1 : -1)));
    if (!earlier.length) return '';
    const prev = earlier[0];
    const best = earlier.reduce((m, w) => Math.max(m, w.weightKg || 0), 0);
    const w = rec.weightKg || 0, pw = prev.weightKg || 0;
    let how;
    if (best > 0 && w > best) how = `新纪录 ${round1(w)}kg（以前最多 ${round1(best)}kg）`;
    else if (w > pw) how = `比上次重 ${round1(w - pw)}kg`;
    else if (w === pw && rec.reps > prev.reps) how = `比上次多 ${rec.reps - prev.reps} 次`;
    else if (w === pw && rec.reps === prev.reps && rec.sets > prev.sets) how = `比上次多 ${rec.sets - prev.sets} 组`;
    else if (w === pw && rec.reps === prev.reps && rec.sets === prev.sets) how = '和上次一样';
    else how = `上次 ${pw > 0 ? round1(pw) + 'kg' : '自重'} ${prev.sets}×${prev.reps}`;
    const p = this.exerciseProgress(rec.exerciseName);
    const next = p && p.isLatest(rec.id) ? p.next.text : '';
    return `${rec.exerciseName}：${how}${next ? ' · ' + next : ''}`;
  }

  /**
   * 点小人时给一句训练建议：今天还没练，就挑最近三周里隔得最久没练的部位，
   * 「今天可以练腿：上次是 4 天前，杠铃深蹲下次试 102.5kg」。今天练过了、都练得很近、从没记过训练的，不说。
   */
  trainingTip() {
    const today = getTodayDateString();
    const lifts = this.workouts.filter(w => !w.durationMin && w.muscleGroup && w.muscleGroup !== '有氧' && w.date <= today);
    if (!lifts.length || lifts.some(w => w.date === today)) return '';
    const since = shiftDateString(today, -21);
    const last = {};
    lifts.filter(w => w.date >= since).forEach(w => {
      const cur = last[w.muscleGroup];
      if (!cur || w.date > cur.date || (w.date === cur.date && recordTs(w) > recordTs(cur))) last[w.muscleGroup] = w;
    });
    const pick = Object.values(last).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0];
    if (!pick) return '';
    const days = Math.round((new Date(today + 'T00:00:00') - new Date(pick.date + 'T00:00:00')) / 86400000);
    if (days < 2) return '';
    const p = this.exerciseProgress(pick.exerciseName);
    const part = pick.muscleGroup.replace(/部$/, '');
    return `今天可以练${part}：上次是 ${days} 天前${p && p.next.kind !== 'keep' ? `，${pick.exerciseName}${p.next.text}` : ''}`;
  }

  /**
   * 手机自己就能答的问题，马上答，不问大模型（「还差多少蛋白」「还能吃多少」「卧推最好多少」「这周练了几次」）。
   * 认不出来就返回 ''，交给大模型。
   */
  quickAnswer(text) {
    const names = [...new Set(this.workouts.filter(w => !w.durationMin).map(w => w.exerciseName))];
    const it = TF.quickIntent(text, names);
    if (!it) return null;
    const answer = this.quickAnswerText(it);
    if (!answer) return null;
    // 「接着问」：顺着这个问题，下一句最可能想问的
    const short = (it.name || '').replace(/^(杠铃|哑铃|器械|史密斯|坐姿|站姿|绳索)/, '');
    const NEXT = {
      protein: ['晚上吃点啥能补蛋白', '给我定明天的食谱'], kcal: ['晚上吃点啥好', '能不能吃火锅'], deficit: ['这周热量赤字怎么样', '晚上吃点啥好'],
      weight: ['怎么吃瘦得快一点', '最近蛋白够不够'], streak: ['这周练了几次', '最近蛋白够不够'], trains: ['明天练什么', '这周还该练哪儿'],
      lift: [`${short}怎么练能涨`, '明天练什么']
    };
    return { text: answer, next: NEXT[it.kind] || [] };
  }

  /** 还差多少蛋白，吃点啥能补上（按差的多少给，别差 89g 还说「一块鸡胸就够」） */
  proteinFix(left) {
    if (left >= 70) return '一块鸡胸肉（约 46g）再加一勺蛋白粉（约 24g）';
    if (left >= 40) return '一块鸡胸肉（200g 约 46g）';
    if (left >= 20) return '一勺蛋白粉（约 24g），或者两个鸡蛋加一杯牛奶（约 21g）';
    return '一杯牛奶加个鸡蛋';
  }

  quickAnswerText(it) {
    const today = getTodayDateString();
    const md = (d) => `${+d.slice(5, 7)}月${+d.slice(8)}日`;
    const s = this.getDaySummary(today);
    const simple = this.isSimple();
    if (it.kind === 'protein') {
      if (simple) return '';
      const target = Math.round(this.gaugeProteinTarget());
      const p = Math.round(s.protein), left = target - p;
      if (left <= 0) return `今天蛋白吃了 ${p}g，够了（目标 ${target}g）。`;
      return `今天蛋白吃了 ${p}g，目标 ${target}g，还差 ${left}g。\n补上的话：${this.proteinFix(left)}。`;
    }
    if (it.kind === 'kcal') {
      const budget = Math.round(s.budget), intake = Math.round(s.intake), rem = budget - intake;
      if (rem < 0) return `今天吃了 ${fmt(intake)} kcal，超了 ${fmt(-rem)}（预算 ${fmt(budget)}）。\n别慌，明天少吃一口就回来了。`;
      const b = rem / RICE_BOWL_KCAL;
      return `今天预算 ${fmt(budget)}，吃了 ${fmt(intake)}，还能吃 ${fmt(rem)} kcal。\n大概是 ${b < 0.75 ? '小半碗' : Math.round(b * 2) / 2 + ' 碗'}米饭的量。`;
    }
    if (it.kind === 'deficit') {
      if (simple) return '';
      // 一天还没过完，「现在的赤字」会越吃越小：直接说按目标还能吃多少
      const d = Math.round(s.deficit), tgt = Math.round(this.profile.targetDeficitKcal || 0), rem = Math.round(s.budget - s.intake);
      if (!s.intake) return `今天还没记吃的。按目标赤字 ${fmt(tgt)}，今天能吃 ${fmt(Math.round(s.budget))} kcal。`;
      return `现在热量赤字 ${fmt(d)}，目标 ${fmt(tgt)}。\n` + (rem >= 0 ? `按目标今天还能吃 ${fmt(rem)} kcal，吃到这儿正好。` : `已经比目标多吃了 ${fmt(-rem)} kcal，明天少吃一口就回来了。`);
    }
    if (it.kind === 'weight') {
      const ws = this.weights.slice().sort((a, b) => (a.date > b.date ? 1 : -1));
      if (!ws.length) return '还没记过体重。说一句「体重 62.5」就记上了。';
      const last = ws[ws.length - 1];
      const since = shiftDateString(today, -it.span);
      const base = ws.filter(w => w.date <= since).pop() || ws.find(w => w.date >= since && w.date < last.date);
      const lines = [`最新体重 ${round1(last.kg)}kg（${md(last.date)}）。`];
      if (base) {
        const diff = round1(last.kg - base.kg);
        lines.push(`比 ${md(base.date)} 的 ${round1(base.kg)}kg ${diff < 0 ? `轻了 ${-diff}kg` : diff > 0 ? `重了 ${diff}kg` : '没变'}${diff > 0 && (this.profile.goalType || 'fat_loss') === 'fat_loss' ? '，一两天的起伏正常，看一周的趋势' : ''}。`);
      } else lines.push('再记几天，我就能告诉你变化。');
      return lines.join('\n');
    }
    if (it.kind === 'streak') {
      const st = this.buddyState();
      return `${st.streak ? `连续记了 ${st.streak} 天` : '今天还没记'}，一共记了 ${st.days} 天。${st.next ? `\n再连续 ${st.next.days} 天拿${st.next.name}。` : ''}`;
    }
    if (it.kind === 'trains') {
      const since = shiftDateString(today, -(it.span - 1));
      const ws = this.workouts.filter(w => w.date >= since && w.date <= today);
      const days = [...new Set(ws.map(w => w.date))].sort();
      if (!days.length) return `${it.span === 30 ? '这 30 天' : '这一周'}还没练。找一天动一动，说一句我就帮你记上。`;
      const WK = '日一二三四五六';
      const what = days.map(d => {
        const parts = [...new Set(ws.filter(w => w.date === d).map(w => (w.durationMin ? w.exerciseName : (w.muscleGroup || '').replace(/部$/, ''))))].filter(Boolean);
        return `周${WK[new Date(d + 'T00:00:00').getDay()]} ${parts.join('、')}`;
      });
      return `${it.span === 30 ? '这 30 天' : '这一周'}练了 ${days.length} 天${it.span === 7 ? '：' + what.join('；') : ''}。`;
    }
    if (it.kind === 'lift') {
      const p = this.exerciseProgress(it.name);
      if (!p) return '';
      const logs = this.workouts.filter(w => w.exerciseName === it.name && !w.durationMin);
      const best = logs.reduce((m, w) => (!m || w.weightKg > m.weightKg || (w.weightKg === m.weightKg && w.reps > m.reps) ? w : m), null);
      const fmtSet = (w) => `${w.weightKg > 0 ? round1(w.weightKg) + 'kg' : '自重'} ${w.sets}×${w.reps}`;
      return `${it.name}：上次 ${fmtSet(p.last)}（${md(p.last.date)}）` +
        (best && best.id !== p.last.id ? `，最重 ${fmtSet(best)}（${md(best.date)}）` : '，就是你目前最重的') + `。\n${p.next.text}。`;
    }
    return '';
  }

  /**
   * 点小人时的一句观察（本机算）：最近 7 天（不算今天）里蛋白质没吃够的天数、早餐蛋白太少；
   * 只记吃的模式看吃没吃超。记的天数少于 3 天不说。
   */
  observation() {
    const today = getTodayDateString();
    const days = [1, 2, 3, 4, 5, 6, 7].map(i => shiftDateString(today, -i)).filter(d => this.diet.some(x => x.date === d));
    if (days.length < 3) return '';
    const half = Math.max(2, Math.ceil(days.length / 2));
    const target = this.gaugeProteinTarget ? this.gaugeProteinTarget() : (this.profile.targetProteinG || 0);
    if (!this.isSimple() && target > 0) {
      const sums = days.map(d => this.getDaySummary(d));
      const low = sums.filter(s => s.protein < target * 0.8);
      if (low.length >= half) {
        const bfDays = days.map(d => this.diet.filter(x => x.date === d && x.mealType === '早餐')).filter(l => l.length);
        const bf = bfDays.length ? bfDays.reduce((a, l) => a + l.reduce((s, x) => s + (x.proteinG || 0), 0), 0) / bfDays.length : null;
        const gap = Math.round(low.reduce((a, s) => a + (target - s.protein), 0) / low.length);
        return (low.length === days.length ? `最近 ${days.length} 天蛋白都没吃够` : `最近 ${days.length} 天有 ${low.length} 天蛋白没吃够`) +
          (bf !== null && bf < 12 ? `，早餐平均才 ${Math.round(bf)}g，加个鸡蛋、一杯牛奶就好很多` : `，平均差 ${gap}g`);
      }
    }
    const over = days.filter(d => { const s = this.getDaySummary(d); return s.intake > s.budget + 200; });
    if (over.length >= half) return over.length === days.length ? `最近 ${days.length} 天都吃超了预算` : `最近 ${days.length} 天有 ${over.length} 天吃超了预算`;
    return '';
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
        else if (act.dataset.act === 'plan-done') this.checkPlan(act, id);
        else if (act.dataset.act === 'plan-drop') this.dropPlan(id);
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
    // 点趋势页上的小人：招招手
    $('trend-buddy').addEventListener('click', (e) => {
      if (!e.target.closest('.coach-buddy')) return;
      window.Haptics && window.Haptics.fire('tap');
      window.Sound && window.Sound.play('blip');
      this._coachWave = true;
      this.renderTrendBuddy();
      clearTimeout(this._coachT);
      this._coachT = setTimeout(() => { this._coachWave = false; if (this.view === 'trend') this.renderTrendBuddy(); }, 1500);
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
    if (next > this.lastPlanDate()) return; // 以后的日子只有排了计划才能翻过去看
    window.Haptics && window.Haptics.fire('tick');
    this.selectedDate = next;
    this.render();
  }

  /** 最远能翻到哪天：今天，或者计划排到的那天 */
  lastPlanDate() {
    const today = getTodayDateString();
    return (this.plans || []).reduce((m, p) => (p.date > m ? p.date : m), today);
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
        date: today, meals, count, weighed: !!this.weightOn(today),
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
