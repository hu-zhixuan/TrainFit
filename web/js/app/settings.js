/**
 * 设置页：身体数据、用途和目标、外观，以及提醒与震动（提醒由安卓端排闹钟，见 Reminders.kt）。
 */
const REMINDER_DEFAULTS = [
  { id: 'lunch', enabled: true, time: '12:40' },
  { id: 'dinner', enabled: true, time: '19:30' },
  { id: 'night', enabled: true, time: '21:30' }
];

Object.assign(FitnessApp.prototype, {
  bindSettings() {
    const $ = (id) => document.getElementById(id);
    $('memo-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-memo-del]');
      if (!b) return;
      const line = this.memoList()[+b.dataset.memoDel];
      const prev = this.updateMemo([], [line]);
      this.saveData();
      this.renderMemo();
      if (window.QuickLog) window.QuickLog.showUndo(`已删除「${line}」`, [], () => { this.profile.memo = prev; this.saveData(); this.renderMemo(); });
    });
    $('my-foods').addEventListener('click', (e) => {
      const b = e.target.closest('[data-forget]');
      if (!b) return;
      const name = b.dataset.forget;
      const prev = this.findMyFood(name);
      this.forgetFood(name);
      this.renderMyFoods();
      if (window.QuickLog && prev) window.QuickLog.showUndo(`已删除「${name}」`, [], () => { this.restoreFood(name, prev); this.renderMyFoods(); });
    });
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
  },

  onProfileChange() {
    this.profile.customized = true;
    this.recalculateMetabolism();
    this.saveData();
    this.renderSettings();
    this.showToast('已保存');
  },

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
    $('set-deficit-l').textContent = simple ? '每天少吃 kcal' : '每天热量赤字 kcal';
    $('set-goal-note').textContent = simple
      ? '想增重时填负数，比如 -250 表示每天多吃 250 kcal。改完自动保存。'
      : '增肌时赤字填负数，比如 -250 表示每天多吃 250 kcal。改完自动保存。';
    $('set-mode-note').textContent = simple ? '只显示吃了多少、还能吃多少、蛋白质和体重。说了运动也会记。' : '训练、蛋白质、热量赤字和动作进步都会显示。';
    $('rem-night-desc').textContent = '今天还能吃多少、蛋白还差多少';
    setSeg('set-theme', this.theme);
    $('set-theme-note').textContent = this.theme === 'system' ? `手机现在是${this.systemIsLight() ? '浅色' : '深色'}模式，App 跟着变` : '';
    this.renderBuddySettings();
    if (window.QuickLog && window.QuickLog.refreshAsrHint) window.QuickLog.refreshAsrHint();
    const setVal = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    setVal('set-height', p.heightCm);
    setVal('set-weight', p.weightKg);
    setVal('set-age', p.age);
    setVal('set-deficit', p.targetDeficitKcal);
    setVal('set-protein', this.gaugeProteinTarget());
    const budget = p.tdee - (p.targetDeficitKcal || 0);
    $('set-tdee-note').textContent = `每天日常消耗约 ${fmt(p.tdee)} kcal（不含训练）。按目标，不训练的日子大约吃 ${fmt(budget)} kcal。`;
    this.renderReminders();
    this.renderMemo();
    this.renderMyFoods();
    const ql = window.QuickLog;
    const days = new Set([...this.workouts, ...this.diet].map(r => r.date)).size;
    $('set-backup-note').textContent = this.backupNote();
    $('set-data-note').textContent = `共 ${this.diet.length} 条饮食、${this.workouts.length} 条${simple ? '运动' : '训练'}、${this.weights.length} 次体重，覆盖 ${days} 天。`;
  },

  hasNotifApi() { return !!(window.TrainFitNative && window.TrainFitNative.setReminders); },

  loadReminders() {
    const saved = load('tf_reminders', null);
    return REMINDER_DEFAULTS.map(d => Object.assign({}, d, (saved || []).find(x => x.id === d.id) || {}));
  },

  /** 保存并交给安卓排闹钟（没有通知权限时一律不排） */
  applyReminders(list, granted) {
    store('tf_reminders', list);
    if (!this.hasNotifApi()) return;
    const ok = granted !== undefined ? granted : !!(window.TrainFitNative.notificationsEnabled && window.TrainFitNative.notificationsEnabled());
    try { window.TrainFitNative.setReminders(JSON.stringify(list.map(r => Object.assign({}, r, { enabled: r.enabled && ok })))); } catch (e) {}
  },

  requestNotif(cb) {
    if (!this.hasNotifApi() || !window.TrainFitNative.requestNotifications) { cb(false); return; }
    window.__tfNotifPerm = (granted) => { window.__tfNotifPerm = null; cb(!!granted); };
    try { window.TrainFitNative.requestNotifications(); } catch (e) { cb(false); }
  },

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
    $('set-sound').addEventListener('change', () => {
      try { localStorage.setItem('tf_sound', $('set-sound').checked ? 'on' : 'off'); } catch (e) {}
      if ($('set-sound').checked && window.Sound) window.Sound.play('success');
    });
  },

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
    $('set-sound').checked = !window.Sound || window.Sound.on();
    $('rem-note').textContent = !this.hasNotifApi() ? '提醒只在安卓 App 里可用。' :
      (!granted && localStorage.getItem('tf_remind_asked') ? '通知权限没打开，提醒不会响。打开任意一个开关会请求权限。' : '');
  }
});
