/**
 * 第一次打开：选用途（想瘦一点 / 就记记吃了啥 / 在健身），再简单填身体数据。
 */
Object.assign(FitnessApp.prototype, {
  showOnboarding() {
    const ob = document.getElementById('onboard');
    ob.classList.remove('hidden');
    document.getElementById('ob-step-1').classList.remove('hidden');
    document.getElementById('ob-step-2').classList.add('hidden');
    document.body.classList.add('onboarding');
  },

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
});
