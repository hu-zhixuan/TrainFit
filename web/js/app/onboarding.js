/**
 * 第一次打开（v7.0，v9.1 改）：先选怎么用——极简模式（只有一个陪你记的小人，没有剧情）还是剧情模式（完整的故事），
 * 两种都选江叙 / 夏柚；再选用途（想瘦一点 / 就记记吃了啥 / 在健身），简单填身体数据。
 * 剧情模式进 App 先演第一章的开头（剧场），再由 TA 带三步教程；极简模式直接教程。
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
    this.obStep(0);
    // 剧情模式那张卡片上画两个人；极简模式那张，一个小人趴在按钮上（就像今天页）
    const pals = document.getElementById('ob-mode-pals');
    const pal = document.getElementById('ob-mode-pal');
    const mic = document.querySelector('.ob-mode-min i');
    const art = (char, pose, mood) => TF.Buddy.svg(Object.assign({ char }, TF.Buddy.CAST_LOOK[char], { build: 'normal', pose, mood, gear: [], scale: 3 }));
    if (mic && typeof ICONS !== 'undefined') mic.innerHTML = ICONS.mic;
    if (pals) pals.innerHTML = ['boy', 'girl'].map(char => art(char, 'stand', 'good')).join('');
    if (pal) pal.innerHTML = art(this.profile.gender === 'female' ? 'girl' : 'boy', 'lie', 'ok');
    document.body.classList.add('onboarding');
  },

  /** 引导页显示第几步（0 选模式、1 用途、2 填数据、3 选人） */
  obStep(n) {
    [0, 1, 2, 3].forEach(i => { const el = document.getElementById('ob-step-' + i); if (el) el.classList.toggle('hidden', i !== n); });
    const ob = document.getElementById('onboard');
    if (ob) ob.scrollTop = 0;
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
      this.obStep(2);
      setSeg('ob-gender', gender);
      setSeg('ob-goal', goal);
    });
    $('ob-gender').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (b) { gender = b.dataset.value; setSeg('ob-gender', gender); } });
    $('ob-goal').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (b) { goal = b.dataset.value; setSeg('ob-goal', goal); } });
    $('ob-back').addEventListener('click', () => this.obStep(1));
    // 第一屏：极简模式 / 剧情模式，都先选江叙 / 夏柚，选好了再选用途（v9.1：极简模式也有小人，只是没有剧情）
    $('ob-step-0').addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]');
      if (!m) return;
      window.Haptics && window.Haptics.fire('tap');
      this.showCastPick(() => this.obStep(1), { mid: true, mode: m.dataset.mode === 'lite' ? 'lite' : 'story' });
    });
    $('ob-back1').addEventListener('click', () => this.obStep(0));
    $('ob-back3').addEventListener('click', () => { this._castDone = null; this._castMid = false; this.obStep(0); });

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
      const enter = () => {
        this.needsOnboarding = false;
        this.saveData();
        document.getElementById('onboard').classList.add('hidden');
        document.body.classList.remove('onboarding');
        this.render();
        this.renderBuddy();
        // 剧情模式：先演第一章的开头（能离开），演完 TA 带着看三步；极简模式直接看三步
        if (this.storyOn() && this.playChapter && this.playChapter(1, { after: () => this.maybeTour() })) return;
        this.maybeTour();
      };
      // 第一屏已经选过模式和人了就直接进；没选过的（老路子）最后问一次
      if ((this.profile.buddy || {}).picked) enter();
      else this.showCastPick(() => { this.needsOnboarding = false; this.saveData(); this.render(); this.maybeTour(); });
    };
    $('ob-done').addEventListener('click', () => finish(true));
    this.bindCastPick();
    // 「重装了？从备份恢复」在 backup.js 里绑定；恢复成功后走下面的 finishOnboardingFromBackup
    $('ob-skip').addEventListener('click', () => finish(false));
  },

  /**
   * 选搭子（v6.0）：新用户建档时选；老用户升级后第一次打开也问一次（picked 记着选过了）；设置里从「不要小人」切回来、还没选过的也选一次。
   * 江叙 / 夏柚：点一下卡片，TA 招手、说一句自我介绍；「就选 TA」确定。「先不要小人」：只有一个按钮，之后设置里能叫出来。
   * opts.mode：选完是剧情模式（story）还是极简模式（lite，v9.1）；没给的照旧（老用户算剧情模式）。
   */
  showCastPick(done, opts) {
    const $ = (id) => document.getElementById(id);
    this._castDone = done;
    this._castPick = null;
    this._castMid = !!(opts && opts.mid); // 引导第一屏选了模式：选好人接着选用途，不关引导页
    this._castMode = (opts && opts.mode) || null;
    const fresh = this.needsOnboarding;
    const lite = this._castMode === 'lite';
    // v8.0（用户：「选定一个角色，后续就不可更改」）：选人时就说清楚，选了就是 TA
    $('ob-cast-title').innerHTML = lite ? '选一个<br>陪你记的小人' : this._castMid ? '选一个<br>陪你的人' : fresh ? '最后一步：<br>要不要一个陪你记的搭子？' : '选一个<br>陪你记的人';
    $('ob-cast-sub').textContent = lite ? 'TA 趴在按钮上面，你记了什么 TA 都回一句，记得你说过的事。没有剧情，选了就是 TA——点一下，听 TA 说句话。'
      : this._castMid ? '选了就是 TA，之后不能换。你们的故事从第一次见面开始，一天一段——点一下，听 TA 说句话。'
      : fresh ? '选了就是 TA，之后不能换。TA 记得你说过的事，在对的时候说一句。不要也行，只留一个按钮最干净。'
      : '选了就是 TA，之后不能换。TA 的样子跟着你们的故事变——点一下，听 TA 说句话。';
    $('ob-back3').classList.toggle('hidden', !this._castMid);
    $('ob-cast-off').classList.toggle('hidden', this._castMid);
    this.drawCastPick();
    $('ob-pal-say').textContent = '点一下，听 TA 说句话';
    $('ob-pal-say').classList.remove('said');
    $('ob-cast-done').disabled = true;
    $('ob-cast-done').textContent = '选一个吧';
    this.obStep(3);
    $('onboard').classList.remove('hidden');
    document.body.classList.add('onboarding');
  },

  drawCastPick() {
    document.querySelectorAll('#ob-cast .ob-pal').forEach(b => {
      const k = b.dataset.cast, on = this._castPick === k;
      b.classList.toggle('on', on);
      b.querySelector('small').textContent = TF.Cast[k].blurb;
      // 有立绘（v7.2）就放立绘的上半身，点中了换笑脸；没有就是像素小人招手
      const art = b.querySelector('.ob-pal-art');
      const url = TF.Art ? TF.Art.sprite(k, on ? '开心' : '平静') : '';
      art.classList.toggle('sprite', !!url);
      art.innerHTML = url ? `<img class="ob-pal-sprite" src="${esc(url)}" alt="" onerror="TF.Art.fail(this.getAttribute('src'));app.drawCastPick()">`
        : TF.Buddy.svg(Object.assign({ char: k === 'xy' ? 'girl' : 'boy' }, TF.Buddy.CAST_LOOK[k === 'xy' ? 'girl' : 'boy'], { build: 'normal', pose: on ? 'wave' : 'stand', mood: on ? 'good' : 'ok', gear: [], scale: 4 }));
    });
  },

  /** 选好了：记下来，关掉引导页 */
  endCastPick(k) {
    const show = k !== 'off';
    const char = k === 'xy' ? 'girl' : 'boy';
    // 选了就锁住（charLocked）：设置里不能换人；剧情模式 / 极简模式 / 不要小人随时能切
    const mode = this._castMode ? { mode: this._castMode } : {};
    this._castMode = null;
    // 刚选的人就是从新故事开始的，以后不用再清（storyMigrate 认 STORY_GEN：江叙 v10、夏柚 v11）
    const gen = TF.Story && TF.Story.STORY_GEN[char === 'girl' ? 'xy' : 'jx'];
    this.profile.buddy = Object.assign({}, this.profile.buddy || {}, show ? Object.assign({ char, show: true, picked: 6, charLocked: true }, mode, gen ? { [gen]: true } : {}) : { show: false, picked: 6 });
    if (this._castMid && this.needsOnboarding) { // 引导中：接着选用途
      this._castMid = false;
      window.Haptics && window.Haptics.fire('success');
      const next = this._castDone;
      this._castDone = null;
      if (next) next();
      return;
    }
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
      $('ob-cast-done').textContent = `就选${TF.Cast[k].name}（选了不能换）`;
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
    if (b.show === false) { this.profile.buddy = Object.assign({}, b, { picked: 6 }); this.saveData(); return false; } // 关过小人的：不打扰，还是不要小人
    this.showCastPick(null);
    return true;
  }
});
