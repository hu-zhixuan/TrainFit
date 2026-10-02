/**
 * 第一次打开：选用途（想瘦一点 / 就记记吃了啥 / 在健身），再简单填身体数据。
 */
Object.assign(FitnessApp.prototype, {
  /** 在引导页从备份恢复了：用备份里的身体数据和用途，不用再填 */
  finishOnboardingFromBackup() {
    if (!this.profile.mode) this.profile.mode = 'fit';
    this.needsOnboarding = false;
    this.saveData();
    document.getElementById('onboard').classList.add('hidden');
    document.body.classList.remove('onboarding');
    if (!this.maybeCastPick()) this.maybeTour();
  },

  showOnboarding() {
    const ob = document.getElementById('onboard');
    ob.classList.remove('hidden');
    document.getElementById('ob-logo').innerHTML = brandIcon(30);
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

    // 一句话建档：「男，175，70 公斤，28 岁，想减脂」→ 下面的表自动填好、闪一下，还能自己改
    let introName = '';
    const fill = (text) => {
      const r = TF.parseIntro ? TF.parseIntro(text) : {};
      const got = [];
      const put = (id, v, label) => { const el = $(id); el.value = v; el.classList.remove('ob-filled'); void el.offsetWidth; el.classList.add('ob-filled'); got.push(label); };
      if (r.gender) { gender = r.gender; setSeg('ob-gender', gender); got.push(gender === 'female' ? '女' : '男'); }
      if (r.goal && pick === 'fit') { goal = r.goal; setSeg('ob-goal', goal); got.push({ fat_loss: '减脂', maintain: '维持', muscle_gain: '增肌' }[goal]); }
      if (r.heightCm) put('ob-height', r.heightCm, `${r.heightCm}cm`);
      if (r.weightKg) put('ob-weight', r.weightKg, `${r.weightKg}kg`);
      if (r.age) put('ob-age', r.age, `${r.age}岁`);
      if (r.name) { introName = r.name; got.unshift(`叫${r.name}`); }
      $('ob-say-note').textContent = got.length ? `填好了：${got.join('、')}。看一眼对不对，不对直接改。` : '没听出身高体重，再说一次，或者直接填下面。';
      $('ob-say-note').classList.toggle('ok', got.length > 0);
      window.Haptics && window.Haptics.fire(got.length ? 'success' : 'error');
    };
    $('ob-say').addEventListener('change', () => { if ($('ob-say').value.trim()) fill($('ob-say').value); });
    $('ob-say').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('ob-say').blur(); } });
    const mic = $('ob-mic');
    mic.innerHTML = ICONS.mic;
    const QL = () => window.QuickLog;
    if (!QL() || !QL().canTalk()) mic.classList.add('hidden');
    let downAt = 0;
    mic.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const q = QL();
      if (!q) return;
      if (q.state === 'recording') { q.stopTalk(true); return; } // 点按模式：再点一下结束
      if (q.state !== 'idle') return;
      downAt = Date.now();
      q.capture = (text, err) => {
        mic.classList.remove('on');
        if (text) { $('ob-say').value = text; fill(text); } else { $('ob-say-note').textContent = err || '没听清，再说一次'; $('ob-say-note').classList.remove('ok'); }
      };
      mic.classList.add('on');
      q.startTalk();
    });
    mic.addEventListener('contextmenu', (e) => e.preventDefault());
    const up = () => {
      const q = QL();
      if (!q || q.state !== 'recording' || !mic.classList.contains('on')) return;
      if (Date.now() - downAt < 350) { $('ob-say-note').textContent = '在听，说完再点一下麦克风'; return; } // 点了一下：说完再点
      q.stopTalk(true);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

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
        if (introName && this.updateMemo) this.updateMemo(['叫' + introName], []); // 说了名字：小人以后叫你
      }
      this.recalculateMetabolism();
      this.saveData();
      this.applyMode();
      window.Haptics && window.Haptics.fire('success');
      // 最后一步：选一个陪你记的（江叙 / 夏柚），或者极简模式
      this.showCastPick(() => {
        this.needsOnboarding = false;
        this.saveData();
        this.render();
        this.maybeTour(); // 搭子带着看三步
      });
    };
    $('ob-done').addEventListener('click', () => finish(true));
    this.bindCastPick();
    // 「重装了？从备份恢复」在 backup.js 里绑定；恢复成功后走下面的 finishOnboardingFromBackup
    $('ob-skip').addEventListener('click', () => finish(false));
  },

  /**
   * 选搭子（v6.0）：新用户建档的最后一步；老用户升级后第一次打开也问一次（picked 记着选过了）。
   * 江叙 / 夏柚：点一下卡片，TA 招手、说一句自我介绍；「就选 TA」确定。「极简模式」：不要小人，界面最干净，之后设置里能叫出来。
   */
  showCastPick(done) {
    const $ = (id) => document.getElementById(id);
    this._castDone = done;
    this._castPick = null;
    const fresh = this.needsOnboarding;
    $('ob-cast-title').innerHTML = fresh ? '最后一步：<br>要不要一个陪你记的搭子？' : '小人长大了：<br>选一个陪你记吧';
    $('ob-cast-sub').textContent = fresh ? 'TA 记得你说过的事，看得见你每一点进步，在对的时候说一句。不要也行，极简模式最干净。'
      : '以前那个像素小人，现在是两个人了。你们之前的亲密度、解锁的衣服都还在，换谁都一样。';
    this.drawCastPick();
    $('ob-pal-say').textContent = '点一下，听 TA 说句话';
    $('ob-pal-say').classList.remove('said');
    $('ob-cast-done').disabled = true;
    $('ob-cast-done').textContent = '选一个吧';
    ['ob-step-1', 'ob-step-2'].forEach(id => $(id).classList.add('hidden'));
    $('ob-step-3').classList.remove('hidden');
    $('onboard').classList.remove('hidden');
    document.body.classList.add('onboarding');
  },

  drawCastPick() {
    document.querySelectorAll('#ob-cast .ob-pal').forEach(b => {
      const k = b.dataset.cast, on = this._castPick === k;
      b.classList.toggle('on', on);
      b.querySelector('small').textContent = TF.Cast[k].blurb;
      b.querySelector('.ob-pal-art').innerHTML = TF.Buddy.svg({ char: k, outfit: 'varsity', build: 'normal', pose: on ? 'wave' : 'stand', face: on ? '开心' : '平静', gear: [], w: 116 });
    });
  },

  /** 选好了：记下来，关掉引导页 */
  endCastPick(k) {
    const show = k !== 'off';
    this.profile.buddy = Object.assign({}, this.profile.buddy || {}, show ? { char: k, show: true, picked: 6 } : { show: false, picked: 6 });
    this.saveData();
    document.getElementById('onboard').classList.add('hidden');
    document.getElementById('ob-step-3').classList.add('hidden');
    document.body.classList.remove('onboarding');
    window.Haptics && window.Haptics.fire('success');
    const done = this._castDone;
    const fresh = this.needsOnboarding; // 新用户：接着是新手教程，第一步就是 TA 打招呼
    this._castDone = null;
    if (done) done();
    this.renderBuddy();
    // 老用户选了 TA：趴上去以后先说一句（TA 选你那一下）
    if (show && !fresh) {
      setTimeout(() => { this.buddyBang('♥'); this.sayTip && this.sayTip(TF.Cast[k].pick); }, 900);
      // 说完再接着今天的招呼（升级的回忆、打招呼…）
      clearTimeout(this._greetT);
      this._greetT = setTimeout(() => { this.closeBuddyPop('tip'); this.greetOrGuide(); }, 5200);
    }
  },

  bindCastPick() {
    const $ = (id) => document.getElementById(id);
    $('ob-cast').addEventListener('click', (e) => {
      const b = e.target.closest('.ob-pal');
      if (!b) return;
      const k = b.dataset.cast;
      this._castPick = k;
      this.drawCastPick();
      const say = $('ob-pal-say');
      say.classList.add('said');
      if (this.typeOut) this.typeOut(say, TF.Cast[k].intro); else say.textContent = TF.Cast[k].intro;
      $('ob-cast-done').disabled = false;
      $('ob-cast-done').textContent = `就选${TF.Cast[k].name}`;
      window.Haptics && window.Haptics.fire('tap');
      window.Sound && window.Sound.play('blip');
    });
    $('ob-cast-done').addEventListener('click', () => { if (this._castPick) this.endCastPick(this._castPick); });
    $('ob-cast-off').addEventListener('click', () => this.endCastPick('off'));
  },

  /** 老用户升级到 v6.0 后第一次打开：问一次选谁（选过、在引导、在教程就不问） */
  maybeCastPick() {
    const b = this.profile.buddy || {};
    if (b.picked || this.needsOnboarding || this._touring) return false;
    if (b.show === false) { this.profile.buddy = Object.assign({}, b, { picked: 6 }); this.saveData(); return false; } // 关过小人的：不打扰，还是极简
    this.showCastPick(null);
    return true;
  }
});
