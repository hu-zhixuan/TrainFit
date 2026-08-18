/**
 * 练食AI · 极简 3 分区主逻辑 (吃/缺口 · 练/加片 · 历史走势与时光回溯)
 * 具备工业级 MediaRecorder 真实录音 + 微信式按住/点击双模语音 + 每日全景回溯与彩色卡片
 */

const DEFAULT_PROFILE = {
  gender: "male",
  heightCm: 175,
  weightKg: 72.0,
  age: 26,
  bmr: 1650,
  tdee: 2392,
  goalType: "fat_loss",
  targetDeficitKcal: 450,
  targetProteinG: 144,
  targetCarbsG: 238,
  targetFatG: 58
};

function getTodayDateString(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function shiftDateString(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().split('T')[0];
}

class FitnessApp {
  constructor() {
    this.currentTab = 'diet';
    this.selectedDate = getTodayDateString();
    this.historyRange = 'WEEK';
    this.voiceMode = 'DIET'; // 'DIET' | 'WORKOUT'
    this.parsedWorkoutBuffer = [];
    this.parsedDietBuffer = null;
    this.onboardingGender = 'male';
    this.tutorialCurrentStep = 1;
    this.currentAudioUrl = null;
    this.audioPlayer = null;
    this.retrospectiveDate = getTodayDateString();

    this.initData();
    this.bindEvents();
    this.bindVoiceEvents();
    this.bindRetrospectiveEvents();
    this.render();
    this.checkOnboarding();
  }

  initData() {
    const cacheVer = localStorage.getItem('fit_cache_v5_pro');
    if (!cacheVer) {
      localStorage.removeItem('fit_workouts');
      localStorage.removeItem('fit_diet');
      localStorage.removeItem('fit_profile');
      localStorage.removeItem('fit_onboarded');
      localStorage.setItem('fit_cache_v5_pro', 'true');
    }

    const savedProfile = localStorage.getItem('fit_profile');
    this.profile = savedProfile ? JSON.parse(savedProfile) : { ...DEFAULT_PROFILE };
    this.recalculateMetabolism();

    // Clean 0 initial state
    const savedWorkouts = localStorage.getItem('fit_workouts');
    this.workouts = savedWorkouts ? JSON.parse(savedWorkouts) : [];

    const savedDiet = localStorage.getItem('fit_diet');
    this.diet = savedDiet ? JSON.parse(savedDiet) : [];

    // Custom Routines & Active To-Do (R2)
    const savedRoutines = localStorage.getItem('fit_custom_routines');
    this.customRoutines = savedRoutines ? JSON.parse(savedRoutines) : this.getDefaultRoutines();

    const savedActiveTodo = localStorage.getItem('fit_active_routine_todo');
    this.activeRoutineTodo = savedActiveTodo ? JSON.parse(savedActiveTodo) : null;
    this.editingRoutineId = null;
    this.initTheme();
  }

  // ==================== Theme Management (Light / Dark Mode) ====================
  initTheme() {
    let savedTheme = 'dark';
    try {
      savedTheme = localStorage.getItem('trainfit_theme') || 'dark';
    } catch (e) {}
    this.setTheme(savedTheme, false);
  }

  setTheme(theme, save = true) {
    this.currentTheme = theme === 'light' ? 'light' : 'dark';
    if (typeof document !== 'undefined') {
      if (document.body && document.body.classList) {
        if (this.currentTheme === 'light') {
          document.body.classList.add('theme-light');
        } else {
          document.body.classList.remove('theme-light');
        }
      }
      if (document.documentElement && typeof document.documentElement.setAttribute === 'function') {
        document.documentElement.setAttribute('data-theme', this.currentTheme === 'light' ? 'light' : 'dark');
      }

      const iconEl = typeof document.getElementById === 'function' ? document.getElementById('theme-toggle-icon') : null;
      if (iconEl) {
        iconEl.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
        if (iconEl.classList) {
          iconEl.classList.remove('theme-icon-rotate');
          void iconEl.offsetWidth;
          iconEl.classList.add('theme-icon-rotate');
        }
      }

      const badgeEl = typeof document.getElementById === 'function' ? document.getElementById('current-theme-badge') : null;
      if (badgeEl) badgeEl.textContent = this.currentTheme === 'light' ? '☀️ 纯净白昼' : '🌙 黑夜极简';

      const btnDark = typeof document.getElementById === 'function' ? document.getElementById('btn-theme-dark') : null;
      const btnLight = typeof document.getElementById === 'function' ? document.getElementById('btn-theme-light') : null;
      if (btnDark && btnDark.classList && typeof btnDark.classList.toggle === 'function') {
        btnDark.classList.toggle('active', this.currentTheme === 'dark');
      }
      if (btnLight && btnLight.classList && typeof btnLight.classList.toggle === 'function') {
        btnLight.classList.toggle('active', this.currentTheme === 'light');
      }

      if (typeof document.querySelector === 'function') {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor && typeof metaThemeColor.setAttribute === 'function') {
          metaThemeColor.setAttribute('content', this.currentTheme === 'light' ? '#f4f6f9' : '#09090b');
        }
      }
    }

    if (save) {
      try {
        localStorage.setItem('trainfit_theme', this.currentTheme);
      } catch (e) {}
      if (typeof this.render === 'function' && this.workouts) {
        this.render();
      }
      this.showToast(this.currentTheme === 'light' ? '☀️ 已切换至白天纯净模式' : '🌙 已切换至黑夜极简模式');
    }
  }

  toggleTheme() {
    const next = this.currentTheme === 'light' ? 'dark' : 'light';
    this.setTheme(next, true);
  }

  checkOnboarding() {
    const isOnboarded = localStorage.getItem('fit_onboarded');
    if (!isOnboarded) {
      this.openTutorialModal(1);
    }
  }

  openTutorialModal(startStep = 1) {
    this.tutorialCurrentStep = startStep;
    this.nextTutorialStep(startStep);
    const modal = document.getElementById('modal-onboarding');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  closeTutorialModal() {
    const modal = document.getElementById('modal-onboarding');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  nextTutorialStep(stepNum) {
    this.tutorialCurrentStep = stepNum;
    for (let i = 1; i <= 3; i++) {
      const slide = document.getElementById(`tutorial-slide-${i}`);
      const dot = document.getElementById(`onboarding-dot-${i}`);
      if (slide) slide.classList.toggle('active', i === stepNum);
      if (dot) dot.classList.toggle('active', i === stepNum);
    }
    if (stepNum === 3) {
      this.calcOnboardingTdee();
    }
  }

  skipToProfileStep() {
    this.nextTutorialStep(3);
  }

  setOnboardingGender(gender) {
    this.onboardingGender = gender;
    document.getElementById('onboarding-gender-male').classList.toggle('active', gender === 'male');
    document.getElementById('onboarding-gender-female').classList.toggle('active', gender === 'female');
    this.calcOnboardingTdee();
  }

  calcOnboardingTdee() {
    const height = parseFloat(document.getElementById('onboarding-height').value) || 175;
    const weight = parseFloat(document.getElementById('onboarding-weight').value) || 72;
    const age = parseInt(document.getElementById('onboarding-age').value, 10) || 26;
    const isMale = this.onboardingGender === 'male';

    const bmr = isMale
      ? (10 * weight + 6.25 * height - 5 * age + 5)
      : (10 * weight + 6.25 * height - 5 * age - 161);
    const tdee = Math.round(bmr * 1.45);

    const preview = document.getElementById('onboarding-calc-preview');
    if (preview) {
      preview.innerHTML = `预估基础代谢 BMR: <b>${Math.round(bmr)}</b> kcal | 预估日常总消耗 TDEE: <b>${tdee}</b> kcal`;
    }
  }

  completeOnboarding() {
    const height = parseFloat(document.getElementById('onboarding-height').value) || 175;
    const weight = parseFloat(document.getElementById('onboarding-weight').value) || 72;
    const age = parseInt(document.getElementById('onboarding-age').value, 10) || 26;
    const deficit = parseFloat(document.getElementById('onboarding-deficit').value) || 450;

    this.profile.gender = this.onboardingGender;
    this.profile.heightCm = height;
    this.profile.weightKg = weight;
    this.profile.age = age;
    this.profile.targetDeficitKcal = deficit;
    this.profile.targetProteinG = Math.round(weight * 2.0);
    this.profile.targetCarbsG = Math.round(weight * 3.3);
    this.profile.targetFatG = Math.round(weight * 0.8);

    this.recalculateMetabolism();
    this.saveData();
    localStorage.setItem('fit_onboarded', 'true');

    this.closeTutorialModal();
    this.render();
    this.showToast('🚀 身体参数初始化完成！');
  }

  saveData() {
    localStorage.setItem('fit_profile', JSON.stringify(this.profile));
    localStorage.setItem('fit_workouts', JSON.stringify(this.workouts));
    localStorage.setItem('fit_diet', JSON.stringify(this.diet));
  }

  recalculateMetabolism() {
    const { gender, heightCm, weightKg, age } = this.profile;
    const isMale = gender === 'male';
    const bmr = isMale
      ? (10 * weightKg + 6.25 * heightCm - 5 * age + 5)
      : (10 * weightKg + 6.25 * heightCm - 5 * age - 161);
    const tdee = Math.round(bmr * 1.45);
    this.profile.bmr = Math.round(bmr);
    this.profile.tdee = tdee;
  }

  onProfileParamChange() {
    const height = parseFloat(document.getElementById('input-height').value) || 175;
    const weight = parseFloat(document.getElementById('input-weight').value) || 72;
    const age = parseInt(document.getElementById('input-age').value, 10) || 26;
    const isMale = this.profile.gender === 'male';

    const bmr = isMale
      ? (10 * weight + 6.25 * height - 5 * age + 5)
      : (10 * weight + 6.25 * height - 5 * age - 161);
    const tdee = Math.round(bmr * 1.45);

    document.getElementById('profile-bmr-display').textContent = `${Math.round(bmr)} kcal`;
    document.getElementById('profile-tdee-display').textContent = `${tdee} kcal`;
  }

  getDaySummary(dateStr) {
    const isToday = dateStr === getTodayDateString();
    const dayWorkouts = this.workouts.filter(w => w.date === dateStr);
    const dayDiet = this.diet.filter(d => d.date === dateStr);

    const hasLogs = dayWorkouts.length > 0 || dayDiet.length > 0;

    const workoutBurn = dayWorkouts.reduce((sum, w) => sum + (w.burnedCalories || 0), 0);
    const totalVolume = dayWorkouts.reduce((sum, w) => sum + (w.weightKg * w.sets * w.reps), 0);
    const totalSets = dayWorkouts.reduce((sum, w) => sum + w.sets, 0);

    const dietIntake = dayDiet.reduce((sum, d) => sum + d.calories, 0);
    const totalProtein = dayDiet.reduce((sum, d) => sum + (d.proteinG || 0), 0);
    const totalCarbs = dayDiet.reduce((sum, d) => sum + (d.carbsG || 0), 0);
    const totalFat = dayDiet.reduce((sum, d) => sum + (d.fatG || 0), 0);

    const totalBurn = this.profile.tdee + workoutBurn;

    let deficit = 0;
    if (hasLogs || isToday) {
      deficit = totalBurn - dietIntake;
    }

    return {
      date: dateStr,
      isToday,
      hasLogs,
      tdee: this.profile.tdee,
      workoutBurn,
      totalBurn,
      totalVolume,
      totalSets,
      dietIntake,
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
      deficit,
      targetDeficit: this.profile.targetDeficitKcal,
      workoutCount: dayWorkouts.length,
      dietCount: dayDiet.length
    };
  }

  bindEvents() {
    // 3 Tab Navigation
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchTab(btn.dataset.tab);
      });
    });

    // Tutorial Buttons
    document.getElementById('btn-open-tutorial')?.addEventListener('click', () => {
      this.openTutorialModal(1);
    });
    document.getElementById('btn-profile-reopen-tutorial')?.addEventListener('click', () => {
      this.openTutorialModal(1);
    });

    // Profile Screen
    document.getElementById('btn-open-profile')?.addEventListener('click', () => {
      this.switchTab('profile');
    });
    document.getElementById('btn-profile-back')?.addEventListener('click', () => {
      this.switchTab('diet');
    });

    // Reset Data
    document.getElementById('btn-open-reset-modal')?.addEventListener('click', () => {
      document.getElementById('modal-reset-confirm').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-reset')?.addEventListener('click', () => {
      document.getElementById('modal-reset-confirm').classList.add('hidden');
    });
    document.getElementById('btn-confirm-reset')?.addEventListener('click', () => {
      this.resetAllDataToZero();
    });

    // Voice Action Buttons
    document.getElementById('btn-hero-diet-voice')?.addEventListener('click', () => {
      this.openVoiceSheet('DIET');
    });
    document.getElementById('btn-hero-workout-voice')?.addEventListener('click', () => {
      this.openVoiceSheet('WORKOUT');
    });

    // Manual Add buttons
    document.getElementById('btn-manual-add-diet')?.addEventListener('click', () => {
      this.openVoiceSheet('DIET');
    });
    document.getElementById('btn-manual-add-workout')?.addEventListener('click', () => {
      this.openManualWorkoutModal();
    });

    // Manual Workout Form Controls
    document.getElementById('btn-cancel-manual-workout')?.addEventListener('click', () => {
      this.closeManualWorkoutModal();
    });
    document.getElementById('btn-save-manual-workout')?.addEventListener('click', () => {
      this.saveManualWorkout();
    });

    // Onboarding Button
    document.getElementById('btn-complete-onboarding')?.addEventListener('click', () => {
      this.completeOnboarding();
    });

    // Confirmation Modals
    document.getElementById('btn-cancel-workout-confirm')?.addEventListener('click', () => {
      this.stopInlineFollowupRecording(true);
      document.getElementById('modal-confirm-workouts').classList.add('hidden');
    });
    document.getElementById('btn-save-confirmed-workouts')?.addEventListener('click', () => {
      this.saveConfirmedWorkouts();
    });
    document.getElementById('btn-modal-followup-voice')?.addEventListener('click', () => {
      this.toggleInlineFollowupRecording();
    });
    document.getElementById('btn-followup-recording-cancel')?.addEventListener('click', () => {
      this.stopInlineFollowupRecording(true);
    });
    document.getElementById('btn-followup-recording-finish')?.addEventListener('click', () => {
      this.stopInlineFollowupRecording(false);
    });

    // Routine Section & Cyclical To-Do Buttons (R2)
    document.getElementById('btn-open-routine-editor')?.addEventListener('click', () => {
      this.openRoutineEditor();
    });
    document.getElementById('btn-close-routine-editor')?.addEventListener('click', () => {
      this.closeRoutineEditor();
    });
    document.getElementById('btn-cancel-routine')?.addEventListener('click', () => {
      this.closeRoutineEditor();
    });
    document.getElementById('btn-save-routine')?.addEventListener('click', () => {
      this.saveCustomRoutine();
    });
    document.getElementById('btn-delete-routine')?.addEventListener('click', () => {
      if (this.editingRoutineId) {
        this.deleteCustomRoutine(this.editingRoutineId);
      }
    });
    document.getElementById('btn-routine-add-exercise-row')?.addEventListener('click', () => {
      this.addRoutineEditorExerciseRow();
    });
    document.getElementById('btn-reset-routine-cycle')?.addEventListener('click', () => {
      this.resetActiveRoutineCycle();
    });
    document.getElementById('btn-close-active-routine')?.addEventListener('click', () => {
      this.clearActiveRoutine();
    });

    document.getElementById('btn-cancel-diet-confirm')?.addEventListener('click', () => {
      document.getElementById('modal-confirm-diet').classList.add('hidden');
    });
    document.getElementById('btn-save-confirmed-diet')?.addEventListener('click', () => {
      this.saveConfirmedDiet();
    });

    // Meal type selector in confirm modal
    document.querySelectorAll('.meal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.meal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.parsedDietBuffer) {
          this.parsedDietBuffer.mealType = btn.dataset.type;
        }
      });
    });

    // History Period
    document.querySelectorAll('.period-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.historyRange = btn.dataset.range;
        this.renderHistoryScreen();
      });
    });

    // Profile Settings
    document.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.id && btn.id.startsWith('onboarding')) return;
        document.querySelectorAll('.gender-btn').forEach(b => {
          if (!b.id || !b.id.startsWith('onboarding')) b.classList.remove('active');
        });
        btn.classList.add('active');
        this.profile.gender = btn.dataset.gender || 'male';
        this.recalculateMetabolism();
        this.onProfileParamChange();
      });
    });

    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
      this.saveProfile();
    });

    // Audio preview player
    document.getElementById('btn-play-audio-preview')?.addEventListener('click', () => {
      this.toggleAudioPreview();
    });
  }

  /**
   * WeChat Style Hold-to-Talk + Click-to-Record Dual Mode Binding
   */
  bindVoiceEvents() {
    const micBtn = document.getElementById('btn-toggle-mic');
    const closeBtn = document.getElementById('btn-close-voice-sheet');
    const submitBtn = document.getElementById('btn-submit-voice-parse');

    closeBtn?.addEventListener('click', () => {
      this.closeVoiceSheet();
    });

    submitBtn?.addEventListener('click', () => {
      this.submitVoiceParse();
    });

    if (!micBtn) return;

    let holdTimer = null;
    let isHolding = false;
    let startY = 0;
    let cancelSlideThreshold = 60; // px to cancel

    const onPointerDown = (e) => {
      e.preventDefault();
      startY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      isHolding = false;

      holdTimer = setTimeout(async () => {
        isHolding = true;
        await this.startRecordingProcess(true);
      }, 150);
    };

    const onPointerMove = (e) => {
      if (!isHolding || !SpeechModule.isRecording) return;
      const currentY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const deltaY = startY - currentY;
      const label = document.getElementById('mic-status-label');
      if (deltaY > cancelSlideThreshold) {
        if (label) label.innerHTML = '<span style="color:var(--accent-red);">松开手指，取消录音</span>';
        micBtn.classList.add('canceling');
      } else {
        if (label) label.innerHTML = '正在录音中... 松开完成识别';
        micBtn.classList.remove('canceling');
      }
    };

    const onPointerUp = async (e) => {
      clearTimeout(holdTimer);
      if (isHolding) {
        isHolding = false;
        const currentY = e.clientY || (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0);
        const deltaY = startY - currentY;
        const isCanceled = deltaY > cancelSlideThreshold;
        micBtn.classList.remove('canceling');
        await SpeechModule.stop(isCanceled);
        if (isCanceled) {
          this.showToast('已取消录音');
        }
      } else {
        // Quick Click Mode: Toggle start / stop
        if (SpeechModule.isRecording) {
          await SpeechModule.stop(false);
        } else {
          await this.startRecordingProcess(false);
        }
      }
    };

    if (window.PointerEvent) {
      micBtn.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    } else {
      micBtn.addEventListener('touchstart', onPointerDown, { passive: false });
      window.addEventListener('touchmove', onPointerMove, { passive: false });
      window.addEventListener('touchend', onPointerUp);
      micBtn.addEventListener('mousedown', onPointerDown);
      window.addEventListener('mouseup', onPointerUp);
    }
  }

  /**
   * Daily Retrospective Time Machine Event Binding
   */
  bindRetrospectiveEvents() {
    document.getElementById('btn-close-retro')?.addEventListener('click', () => {
      document.getElementById('modal-day-retrospective').classList.add('hidden');
    });

    document.getElementById('btn-retro-close-bottom')?.addEventListener('click', () => {
      document.getElementById('modal-day-retrospective').classList.add('hidden');
    });

    document.getElementById('btn-retro-prev-day')?.addEventListener('click', () => {
      this.retrospectiveDate = shiftDateString(this.retrospectiveDate, -1);
      this.openDayRetrospective(this.retrospectiveDate);
    });

    document.getElementById('btn-retro-next-day')?.addEventListener('click', () => {
      this.retrospectiveDate = shiftDateString(this.retrospectiveDate, 1);
      this.openDayRetrospective(this.retrospectiveDate);
    });

    document.getElementById('btn-retro-set-active-day')?.addEventListener('click', () => {
      this.selectedDate = this.retrospectiveDate;
      document.getElementById('modal-day-retrospective').classList.add('hidden');
      this.switchTab('diet');
      this.showToast(`已切换为查看: ${this.selectedDate}`);
    });
  }

  /**
   * Opens and renders the full retrospective view for a specific day with animated ring & colored cards
   */
  openDayRetrospective(dateStr) {
    this.retrospectiveDate = dateStr;
    const summary = this.getDaySummary(dateStr);
    const isToday = dateStr === getTodayDateString();

    const titleEl = document.getElementById('retro-date-title');
    if (titleEl) {
      titleEl.textContent = isToday ? `${dateStr} · 今天` : dateStr;
    }

    // Status Pill
    const pill = document.getElementById('retro-status-pill');
    const isTargetMet = summary.deficit >= summary.targetDeficit && summary.targetDeficit > 0;
    const isDeficit = summary.deficit >= 0;

    if (!summary.hasLogs && !isToday) {
      pill.className = 'status-badge';
      pill.textContent = '暂无打卡';
    } else if (!isDeficit) {
      pill.className = 'status-badge surplus';
      pill.textContent = `热量盈余 +${Math.round(Math.abs(summary.deficit))} kcal`;
    } else if (isTargetMet) {
      pill.className = 'status-badge';
      pill.textContent = `✓ 缺口达标 ${Math.round(summary.deficit)} kcal`;
    } else {
      pill.className = 'status-badge';
      pill.textContent = `净缺口 ${Math.round(summary.deficit)} kcal`;
    }

    // Hero stats
    document.getElementById('retro-net-deficit-num').textContent = Math.round(summary.deficit).toLocaleString();
    document.getElementById('retro-total-burn').textContent = `${Math.round(summary.totalBurn)} kcal`;
    document.getElementById('retro-intake').textContent = `${Math.round(summary.dietIntake)} kcal`;
    document.getElementById('retro-target-deficit').textContent = `${this.profile.targetDeficitKcal} kcal`;

    // Draw animated ring gauge
    ChartEngine.drawRetrospectiveRing('retrospective-ring-canvas', summary.deficit, this.profile.targetDeficitKcal);

    // Colored Card 1: 🥗 饮食营养全景
    document.getElementById('retro-diet-total-cal').textContent = `${Math.round(summary.dietIntake)} kcal`;
    document.getElementById('retro-macro-p').textContent = `${Math.round(summary.totalProtein)}/${this.profile.targetProteinG}g`;
    document.getElementById('retro-macro-p-bar').style.width = `${Math.min((summary.totalProtein / this.profile.targetProteinG) * 100, 100)}%`;

    document.getElementById('retro-macro-c').textContent = `${Math.round(summary.totalCarbs)}/${this.profile.targetCarbsG}g`;
    document.getElementById('retro-macro-c-bar').style.width = `${Math.min((summary.totalCarbs / this.profile.targetCarbsG) * 100, 100)}%`;

    document.getElementById('retro-macro-f').textContent = `${Math.round(summary.totalFat)}/${this.profile.targetFatG}g`;
    document.getElementById('retro-macro-f-bar').style.width = `${Math.min((summary.totalFat / this.profile.targetFatG) * 100, 100)}%`;

    const dayDiet = this.diet.filter(d => d.date === dateStr);
    const dietContainer = document.getElementById('retro-diet-items-list');
    if (dayDiet.length === 0) {
      dietContainer.innerHTML = `<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:8px 0;">该日暂无饮食记录</div>`;
    } else {
      dietContainer.innerHTML = dayDiet.map(d => `
        <div class="retro-item-pill">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="tag-badge tag-orange">${d.mealType}</span>
            <span style="font-weight:600;">${d.foodSummary}</span>
          </div>
          <span style="color:var(--accent-orange);font-weight:700;">${d.calories} kcal</span>
        </div>
      `).join('');
    }

    // Colored Card 2: 🏋️ 训练与加片全景
    document.getElementById('retro-workout-vol').textContent = `${summary.totalVolume.toLocaleString()} kg 吨位`;
    document.getElementById('retro-workout-sets').textContent = `${summary.totalSets} 组`;
    document.getElementById('retro-workout-burn').textContent = `+${summary.workoutBurn} kcal`;

    const dayWorkouts = this.workouts.filter(w => w.date === dateStr);
    const workoutContainer = document.getElementById('retro-workout-items-list');
    const advices = WorkoutEngine.generateOverloadAdvices(this.workouts);

    if (dayWorkouts.length === 0) {
      workoutContainer.innerHTML = `<div style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:8px 0;">该日暂无力量训练记录</div>`;
    } else {
      workoutContainer.innerHTML = dayWorkouts.map(w => {
        const matchedAdvice = advices.find(a => a.exerciseName === w.exerciseName);
        let adviceHtml = '';
        if (matchedAdvice && matchedAdvice.status === 'READY_TO_ADD_PLATE') {
          adviceHtml = `<div style="font-size:0.65rem;color:var(--accent-cyan);margin-top:2px;">⚡ 建议下次加片至 ${matchedAdvice.targetWeightKg}kg</div>`;
        }

        return `
          <div class="retro-item-pill" style="flex-direction:column;align-items:stretch;gap:4px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="tag-badge tag-cyan">${w.muscleGroup}</span>
                <span style="font-weight:600;">${w.exerciseName}</span>
              </div>
              <span style="color:var(--accent-cyan);font-weight:700;">
                ${w.weightKg > 0 ? `${w.weightKg}kg × ` : '自重 × '}${w.sets}组 × ${w.reps}次
              </span>
            </div>
            ${adviceHtml}
          </div>
        `;
      }).join('');
    }

    const modal = document.getElementById('modal-day-retrospective');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  async startRecordingProcess(isHold = false) {
    const textarea = document.getElementById('voice-text-input');
    const baseText = textarea ? textarea.value.trim() : '';

    this.updateMicUi(true, isHold);
    document.getElementById('voice-audio-preview').style.display = 'none';

    const started = await SpeechModule.start({
      isHold,
      onResult: (text, isFinal) => {
        if (textarea && text) {
          textarea.value = baseText ? `${baseText}，${text}` : text;
        }
      },
      onVolumeChange: (volume) => {
        this.updateWaveformBars(volume);
      },
      onTimerTick: (formattedTime) => {
        const timerBadge = document.getElementById('mic-timer-badge');
        if (timerBadge) {
          timerBadge.style.display = 'inline-block';
          timerBadge.textContent = formattedTime;
        }
      },
      onTranscribingState: (isTranscribing) => {
        const transcribingBanner = document.getElementById('voice-transcribing-banner');
        const micBtn = document.getElementById('btn-toggle-mic');
        const submitBtn = document.getElementById('btn-submit-voice-parse');
        const statusLabel = document.getElementById('mic-status-label');
        const textarea = document.getElementById('voice-text-input');

        if (isTranscribing) {
          transcribingBanner?.classList.remove('hidden');
          micBtn?.classList.add('transcribing');
          if (statusLabel) statusLabel.innerHTML = '<span style="color:var(--accent-cyan);">⚡ 正在极速转译语音中...</span>';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ 正在转译语音...';
          }
          if (textarea && !textarea.value) {
            textarea.placeholder = '⚡ 正在转译您的语音内容...';
          }
        } else {
          transcribingBanner?.classList.add('hidden');
          micBtn?.classList.remove('transcribing');
          if (statusLabel) statusLabel.textContent = '按住麦克风说话，或点击开始录音';
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '🤖 AI 智能解析并提取';
          }
          if (textarea) {
            textarea.placeholder = '说出或输入内容... (支持搜狗/微信输入法语音键直接打字)';
          }
        }
      },
      onEnd: (result) => {
        this.updateMicUi(false);
        this.updateWaveformBars(0);
        const timerBadge = document.getElementById('mic-timer-badge');
        if (timerBadge) timerBadge.style.display = 'none';

        if (result && !result.isCanceled && result.audioUrl) {
          this.currentAudioUrl = result.audioUrl;
          const previewBar = document.getElementById('voice-audio-preview');
          if (previewBar) {
            previewBar.style.display = 'flex';
          }
          if (result.text && textarea) {
            textarea.value = result.text;
          }
        }
      },
      onError: (errType) => {
        this.updateMicUi(false);
        this.updateWaveformBars(0);
        if (errType === 'PERMISSION_DENIED') {
          this.showToast('⚠️ 请允许麦克风录音权限');
        } else if (errType === 'TOO_SHORT') {
          this.showToast('说话时间太短');
        }
      }
    });

    if (!started) {
      this.updateMicUi(false);
    }
  }

  toggleAudioPreview() {
    if (!this.currentAudioUrl) return;
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
      document.getElementById('btn-play-audio-preview').textContent = '▶';
      return;
    }

    const audio = new Audio(this.currentAudioUrl);
    this.audioPlayer = audio;
    document.getElementById('btn-play-audio-preview').textContent = '⏸';

    audio.onended = () => {
      this.audioPlayer = null;
      document.getElementById('btn-play-audio-preview').textContent = '▶';
    };

    audio.onerror = () => {
      this.audioPlayer = null;
      document.getElementById('btn-play-audio-preview').textContent = '▶';
    };

    audio.play();
  }

  updateWaveformBars(volume) {
    const bars = document.querySelectorAll('.waveform-bar');
    if (!bars || bars.length === 0) return;

    bars.forEach((bar, idx) => {
      const mult = [0.5, 0.8, 1.3, 1.6, 1.3, 0.8, 0.5][idx] || 1.0;
      const height = Math.max(3, Math.min(22, Math.round(volume * 22 * mult)));
      bar.style.height = `${height}px`;
      bar.classList.toggle('active', volume > 0.06);
    });
  }

  updateMicUi(isRec, isHold = false) {
    const btn = document.getElementById('btn-toggle-mic');
    const ring = document.getElementById('mic-pulse-ring');
    const label = document.getElementById('mic-status-label');

    btn?.classList.toggle('recording', isRec);
    ring?.classList.toggle('active', isRec);

    if (label) {
      if (isRec) {
        label.innerHTML = isHold ? '正在录音... 松开手指识别' : '🎙️ 正在录音... 再次点击停止';
      } else {
        label.textContent = '按住麦克风说话，或点击开始录音';
      }
    }
  }

  resetAllDataToZero() {
    this.workouts = [];
    this.diet = [];
    this.saveData();
    document.getElementById('modal-reset-confirm').classList.add('hidden');
    this.render();
    this.showToast('🗑️ 已彻底清空历史记录，恢复 0 状态');
    this.switchTab('diet');
  }

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.screen-view').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${tab}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tab);
    });

    this.render();
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  render() {
    this.updateHeaderDate();

    if (this.currentTab === 'diet') {
      this.renderDietScreen();
    } else if (this.currentTab === 'workout') {
      this.renderWorkoutScreen();
    } else if (this.currentTab === 'history') {
      this.renderHistoryScreen();
    } else if (this.currentTab === 'profile') {
      this.renderProfileForm();
    }
  }

  updateHeaderDate() {
    const d = new Date();
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const el = document.getElementById('header-date-indicator');
    if (el) {
      el.textContent = `今天 · ${months[d.getMonth()]}${d.getDate()}日`;
    }
  }

  renderDietScreen() {
    const summary = this.getDaySummary(this.selectedDate);

    // Deficit Numbers
    document.getElementById('diet-net-deficit-num').textContent = Math.round(summary.deficit).toLocaleString();
    document.getElementById('diet-total-burn-num').textContent = `${Math.round(summary.totalBurn)} kcal`;
    document.getElementById('diet-intake-num').textContent = `${Math.round(summary.dietIntake)} kcal`;

    // Remaining intake allowance
    const remainingKcal = Math.round(summary.totalBurn - summary.targetDeficit - summary.dietIntake);
    const remEl = document.getElementById('diet-remaining-num');
    if (remEl) {
      remEl.textContent = `${Math.max(0, remainingKcal)} kcal`;
    }

    // Status Badge
    const pill = document.getElementById('diet-status-pill');
    const isTargetMet = summary.deficit >= summary.targetDeficit && summary.targetDeficit > 0;
    const isDeficit = summary.deficit >= 0;

    if (!isDeficit) {
      pill.className = 'status-badge surplus';
      pill.textContent = `热量盈余 +${Math.round(Math.abs(summary.deficit))} kcal`;
    } else if (isTargetMet) {
      pill.className = 'status-badge';
      pill.textContent = `✓ 缺口达标 ${Math.round(summary.deficit)} kcal`;
    } else {
      const pct = summary.targetDeficit > 0 ? Math.round((summary.deficit / summary.targetDeficit) * 100) : 0;
      pill.className = 'status-badge';
      pill.textContent = `缺口进行中 ${pct}%`;
    }

    // Macros
    document.getElementById('macro-p-txt').textContent = `${Math.round(summary.totalProtein)}/${this.profile.targetProteinG}g`;
    document.getElementById('macro-p-bar').style.width = `${Math.min((summary.totalProtein / this.profile.targetProteinG) * 100, 100)}%`;

    document.getElementById('macro-c-txt').textContent = `${Math.round(summary.totalCarbs)}/${this.profile.targetCarbsG}g`;
    document.getElementById('macro-c-bar').style.width = `${Math.min((summary.totalCarbs / this.profile.targetCarbsG) * 100, 100)}%`;

    document.getElementById('macro-f-txt').textContent = `${Math.round(summary.totalFat)}/${this.profile.targetFatG}g`;
    document.getElementById('macro-f-bar').style.width = `${Math.min((summary.totalFat / this.profile.targetFatG) * 100, 100)}%`;

    // Render Meals List
    const dayDiet = this.diet.filter(d => d.date === this.selectedDate);
    const container = document.getElementById('diet-items-list');
    document.getElementById('diet-list-title').textContent = `今日饮食 (${dayDiet.length})`;

    if (dayDiet.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          🥗 今日暂无饮食记录<br>
          点击上方【🎙️ 口喷记饮食】说出吃了什么，即刻计算热量
        </div>
      `;
      return;
    }

    container.innerHTML = dayDiet.map(d => `
      <div class="record-card">
        <div class="record-row-top">
          <div class="record-name-group">
            <span class="tag-badge tag-orange">${d.mealType}</span>
            <span class="record-name">${d.foodSummary}</span>
          </div>
          <button class="btn-delete" onclick="window.app.deleteDiet('${d.id}')" title="删除记录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="record-row-bottom">
          <span class="record-stat-highlight" style="color:var(--accent-orange);">${d.calories} kcal</span>
          <span>蛋白 ${d.proteinG || 0}g · 碳水 ${d.carbsG || 0}g · 脂肪 ${d.fatG || 0}g</span>
        </div>
      </div>
    `).join('');
  }

  // ==========================================================================
  // Routine Cards & Cyclical To-Do System (R2)
  // ==========================================================================
  getDefaultRoutines() {
    return [
      {
        id: "default_chest",
        name: "胸部推类经典分化",
        muscleGroup: "胸部",
        icon: "💥",
        isCustom: false,
        exercises: [
          { name: "杠铃卧推", muscleGroup: "胸部", weightKg: 80, sets: 4, reps: 8 },
          { name: "哑铃上斜卧推", muscleGroup: "胸部", weightKg: 24, sets: 4, reps: 10 },
          { name: "双杠臂屈伸", muscleGroup: "胸部", weightKg: 0, sets: 3, reps: 10 },
          { name: "绳索夹胸", muscleGroup: "胸部", weightKg: 15, sets: 4, reps: 12 }
        ]
      },
      {
        id: "default_back",
        name: "背部拉类经典分化",
        muscleGroup: "背部",
        icon: "🦅",
        isCustom: false,
        exercises: [
          { name: "传统硬拉", muscleGroup: "背部/臀腿", weightKg: 100, sets: 3, reps: 6 },
          { name: "高位下拉", muscleGroup: "背部", weightKg: 50, sets: 4, reps: 10 },
          { name: "杠铃划船", muscleGroup: "背部", weightKg: 60, sets: 4, reps: 8 },
          { name: "引体向上", muscleGroup: "背部", weightKg: 0, sets: 3, reps: 8 }
        ]
      },
      {
        id: "default_legs",
        name: "腿部力量强化分化",
        muscleGroup: "腿部",
        icon: "🦵",
        isCustom: false,
        exercises: [
          { name: "杠铃深蹲", muscleGroup: "腿部", weightKg: 100, sets: 4, reps: 6 },
          { name: "倒蹬", muscleGroup: "腿部", weightKg: 160, sets: 3, reps: 10 },
          { name: "罗马尼亚硬拉", muscleGroup: "腿部", weightKg: 70, sets: 3, reps: 8 },
          { name: "腿屈伸", muscleGroup: "腿部", weightKg: 40, sets: 3, reps: 12 }
        ]
      }
    ];
  }

  saveRoutines() {
    localStorage.setItem('fit_custom_routines', JSON.stringify(this.customRoutines));
  }

  saveActiveRoutineTodo() {
    if (this.activeRoutineTodo) {
      localStorage.setItem('fit_active_routine_todo', JSON.stringify(this.activeRoutineTodo));
    } else {
      localStorage.removeItem('fit_active_routine_todo');
    }
  }

  getSmartHistoryRecommendations() {
    if (!this.workouts || this.workouts.length === 0) {
      return [];
    }

    const muscleExerciseMap = {};

    this.workouts.forEach(w => {
      const muscle = w.muscleGroup || '胸部';
      if (!muscleExerciseMap[muscle]) muscleExerciseMap[muscle] = {};
      muscleExerciseMap[muscle][w.exerciseName] = (muscleExerciseMap[muscle][w.exerciseName] || 0) + 1;
    });

    const recommendations = [];
    const muscleGroups = Object.keys(muscleExerciseMap).sort((a, b) => {
      const countA = Object.values(muscleExerciseMap[a]).reduce((s, v) => s + v, 0);
      const countB = Object.values(muscleExerciseMap[b]).reduce((s, v) => s + v, 0);
      return countB - countA;
    });

    muscleGroups.forEach((muscle, idx) => {
      const exercisesObj = muscleExerciseMap[muscle];
      const sortedExNames = Object.keys(exercisesObj).sort((a, b) => exercisesObj[b] - exercisesObj[a]);
      if (sortedExNames.length >= 2) {
        const topExercises = sortedExNames.slice(0, 4).map(name => {
          const lastLog = this.workouts.find(w => w.exerciseName === name);
          return {
            name: name,
            muscleGroup: muscle,
            weightKg: lastLog ? lastLog.weightKg : 60,
            sets: lastLog ? lastLog.sets : 4,
            reps: lastLog ? lastLog.reps : 8
          };
        });

        recommendations.push({
          id: `rec_${muscle}_${idx}`,
          name: `${muscle}常用训练循环`,
          muscleGroup: muscle,
          icon: '🔥',
          isRecommendation: true,
          badgeText: '🔥 历史常用',
          exercises: topExercises
        });
      }
    });

    return recommendations.slice(0, 3);
  }

  getAllRoutines() {
    const custom = Array.isArray(this.customRoutines) ? this.customRoutines : [];
    const recommendations = this.getSmartHistoryRecommendations();
    
    if (custom.length === 0 && recommendations.length === 0) {
      return this.getDefaultRoutines();
    }
    
    return [...custom, ...recommendations];
  }

  renderRoutineSection() {
    const scrollContainer = document.getElementById('routine-cards-scroll');
    if (!scrollContainer) return;

    const routines = this.getAllRoutines();
    const activeRoutineId = this.activeRoutineTodo ? this.activeRoutineTodo.routineId : null;

    let cardsHtml = routines.map(r => {
      const isActive = activeRoutineId === r.id;
      const badgeClass = r.isRecommendation ? 'recommendation' : (r.isCustom ? 'custom' : '');
      const badgeLabel = r.badgeText || (r.isCustom ? '🌟 自定义' : '⚡ 推荐分化');
      const exNames = r.exercises.map(e => e.name).join(' · ');

      let statusText = '未激活';
      if (isActive && this.activeRoutineTodo) {
        const done = this.activeRoutineTodo.items.filter(i => i.completed).length;
        const total = this.activeRoutineTodo.items.length;
        statusText = done === total ? `✓ 全部完成 (${done}/${total})` : `进行中 (${done}/${total})`;
      }

      return `
        <div class="routine-card ${isActive ? 'active' : ''}" onclick="window.app.selectRoutine('${r.id}')">
          <span class="routine-card-badge ${badgeClass}">${badgeLabel}</span>
          <div class="routine-card-title">${r.name}</div>
          <div class="routine-card-meta">${exNames}</div>
          <div class="routine-card-footer">
            <span class="routine-card-status">${statusText}</span>
            ${r.isCustom ? `<button class="routine-card-btn-edit" onclick="event.stopPropagation(); window.app.openRoutineEditor('${r.id}')" title="编辑计划">✏️</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    cardsHtml += `
      <div class="routine-card-add" onclick="window.app.openRoutineEditor()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span style="font-size:0.72rem;font-weight:600;">+ 自定义计划</span>
      </div>
    `;

    scrollContainer.innerHTML = cardsHtml;
  }

  selectRoutine(routineId) {
    const allRoutines = this.getAllRoutines();
    const routine = allRoutines.find(r => r.id === routineId);
    if (!routine) return;

    // Cyclical Re-activation: if clicked on already active routine, reset all items to false and reload!
    if (this.activeRoutineTodo && this.activeRoutineTodo.routineId === routineId) {
      this.activeRoutineTodo.items.forEach(item => {
        item.completed = false;
      });
      // Restore original sequence
      this.activeRoutineTodo.items.sort((a, b) => (a.initialIndex || 0) - (b.initialIndex || 0));
      this.saveActiveRoutineTodo();
      this.render();
      this.showToast(`🔄 已重新加载【${routine.name}】训练计划！`);
      return;
    }

    // Activate routine into today's To-Do checklist
    this.activeRoutineTodo = {
      routineId: routine.id,
      routineName: routine.name,
      muscleGroup: routine.muscleGroup,
      activatedDate: this.selectedDate,
      items: routine.exercises.map((ex, idx) => ({
        id: `todo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
        initialIndex: idx,
        exerciseName: ex.name,
        muscleGroup: ex.muscleGroup || routine.muscleGroup,
        targetWeightKg: ex.weightKg !== undefined ? ex.weightKg : 60,
        targetSets: ex.sets || 4,
        targetReps: ex.reps || 8,
        completed: false
      }))
    };

    this.saveActiveRoutineTodo();
    this.render();
    this.showToast(`📋 已选择【${routine.name}】训练计划！`);
  }

  renderActiveRoutineTodo() {
    const container = document.getElementById('routine-todo-container');
    if (!container) return;

    if (!this.activeRoutineTodo || !this.activeRoutineTodo.items || this.activeRoutineTodo.items.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    const doneCount = this.activeRoutineTodo.items.filter(i => i.completed).length;
    const totalCount = this.activeRoutineTodo.items.length;
    const allDone = doneCount === totalCount && totalCount > 0;

    const titleEl = document.getElementById('routine-todo-title-text');
    if (titleEl) titleEl.textContent = `⚡ ${this.activeRoutineTodo.routineName}`;

    const badgeEl = document.getElementById('routine-todo-progress-badge');
    if (badgeEl) {
      badgeEl.textContent = allDone ? `🎉 全部完成 (${doneCount}/${totalCount})` : `${doneCount}/${totalCount}`;
      badgeEl.style.color = allDone ? 'var(--accent-lime)' : 'var(--accent-cyan)';
    }

    // Sort: uncompleted items on top (in natural plan order), completed items sink to bottom
    const uncompletedItems = this.activeRoutineTodo.items.filter(i => !i.completed).sort((a, b) => (a.initialIndex || 0) - (b.initialIndex || 0));
    const completedItems = this.activeRoutineTodo.items.filter(i => i.completed).sort((a, b) => (a.initialIndex || 0) - (b.initialIndex || 0));
    const sortedDisplayItems = [...uncompletedItems, ...completedItems];

    const listEl = document.getElementById('routine-todo-list');
    if (listEl) {
      if (allDone) {
        listEl.innerHTML = `
          <div class="todo-completed-banner">
            <div style="font-size:1.3rem;margin-bottom:3px;">🎉</div>
            <b style="font-size:0.86rem;color:var(--accent-lime);">本组训练计划已全部完成！</b>
            <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px;">所有动作均已打钩并滑至底部置灰。点击上方计划 Card 可随时重新加载开启新循环。</div>
          </div>
          ${completedItems.map(item => `
            <div class="todo-item completed" id="todo-item-${item.id}">
              <div class="todo-item-left" onclick="window.app.toggleTodoItem('${item.id}')">
                <div class="todo-checkbox checked">✓</div>
                <div class="todo-item-info">
                  <span class="todo-name">${item.exerciseName}</span>
                  <span class="todo-specs">${item.targetWeightKg > 0 ? `${item.targetWeightKg}kg × ` : '自重 × '}${item.targetSets}组 × ${item.targetReps}次</span>
                </div>
              </div>
              <span class="todo-done-tag" onclick="window.app.toggleTodoItem('${item.id}')">✓ 已完成</span>
            </div>
          `).join('')}
        `;
      } else {
        listEl.innerHTML = sortedDisplayItems.map(item => `
          <div class="todo-item ${item.completed ? 'completed' : ''}" id="todo-item-${item.id}">
            <div class="todo-item-left" onclick="window.app.toggleTodoItem('${item.id}')">
              <div class="todo-checkbox ${item.completed ? 'checked' : ''}">${item.completed ? '✓' : ''}</div>
              <div class="todo-item-info">
                <span class="todo-name">${item.exerciseName}</span>
                <span class="todo-specs">${item.targetWeightKg > 0 ? `${item.targetWeightKg}kg × ` : '自重 × '}${item.targetSets}组 × ${item.targetReps}次</span>
              </div>
            </div>
            ${item.completed ? `
              <span class="todo-done-tag" onclick="window.app.toggleTodoItem('${item.id}')">✓ 已完成</span>
            ` : `
              <button class="btn-todo-log" onclick="window.app.logTodoItemDirectly('${item.id}')">打卡</button>
            `}
          </div>
        `).join('');
      }
    }
  }

  toggleTodoItem(itemId) {
    if (!this.activeRoutineTodo || !this.activeRoutineTodo.items) return;
    const item = this.activeRoutineTodo.items.find(i => i.id === itemId);
    if (!item) return;

    item.completed = !item.completed;
    this.saveActiveRoutineTodo();
    this.render();

    const doneCount = this.activeRoutineTodo.items.filter(i => i.completed).length;
    const totalCount = this.activeRoutineTodo.items.length;

    if (item.completed) {
      if (doneCount === totalCount) {
        this.showToast(`🎉 恭喜！本组【${this.activeRoutineTodo.routineName}】全部动作已顺利完成！`);
      } else {
        this.showToast(`✓ 【${item.exerciseName}】已打钩完成并滑至底部 (剩余 ${totalCount - doneCount} 项)`);
      }
    } else {
      this.showToast(`已恢复【${item.exerciseName}】为待完成`);
    }
  }

  logTodoItemDirectly(itemId) {
    if (!this.activeRoutineTodo || !this.activeRoutineTodo.items) return;
    const item = this.activeRoutineTodo.items.find(i => i.id === itemId);
    if (!item) return;

    const isCompound = item.exerciseName.includes("卧推") || item.exerciseName.includes("深蹲") || item.exerciseName.includes("硬拉") || item.exerciseName.includes("划船") || item.exerciseName.includes("倒蹬");
    const burn = isCompound ? Math.round(item.targetSets * 28 + (item.targetWeightKg * 0.45)) : Math.round(item.targetSets * 18 + (item.targetWeightKg * 0.2));

    this.workouts.unshift({
      id: "w_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      date: this.selectedDate,
      exerciseName: item.exerciseName,
      muscleGroup: item.muscleGroup,
      sets: item.targetSets,
      reps: item.targetReps,
      weightKg: item.targetWeightKg,
      rpe: 8.0,
      burnedCalories: burn,
      notes: `清单打卡: ${this.activeRoutineTodo.routineName}`
    });

    item.completed = true;
    this.saveData();
    this.saveActiveRoutineTodo();
    this.render();
    this.showToast(`✓ 已打卡并记录【${item.exerciseName}】！`);
  }

  resetActiveRoutineCycle() {
    if (!this.activeRoutineTodo || !this.activeRoutineTodo.items) return;
    this.activeRoutineTodo.items.forEach(item => {
      item.completed = false;
    });
    this.activeRoutineTodo.items.sort((a, b) => (a.initialIndex || 0) - (b.initialIndex || 0));
    this.saveActiveRoutineTodo();
    this.render();
    this.showToast(`🔄 清单已重置，开启下一循环！`);
  }

  clearActiveRoutine() {
    this.activeRoutineTodo = null;
    localStorage.removeItem('fit_active_routine_todo');
    this.render();
    this.showToast('已收起训练清单');
  }

  getActiveTodos() {
    if (!this.activeRoutineTodo || !this.activeRoutineTodo.items) return [];
    return this.activeRoutineTodo.items.map(t => ({
      name: t.exerciseName,
      exerciseName: t.exerciseName,
      muscleGroup: t.muscleGroup
    }));
  }

  openRoutineEditor(routineId = null) {
    this.editingRoutineId = routineId;
    const modal = document.getElementById('modal-routine-editor');
    const title = document.getElementById('routine-editor-title');
    const nameInput = document.getElementById('routine-edit-name');
    const muscleSelect = document.getElementById('routine-edit-muscle');
    const list = document.getElementById('routine-edit-exercises-list');
    const delBtn = document.getElementById('btn-delete-routine');

    if (!modal) return;

    if (routineId) {
      const routine = this.customRoutines.find(r => r.id === routineId);
      if (routine) {
        title.textContent = '编辑训练循环计划';
        nameInput.value = routine.name;
        muscleSelect.value = routine.muscleGroup || '胸部';
        if (delBtn) delBtn.classList.remove('hidden');
        list.innerHTML = '';
        routine.exercises.forEach(ex => {
          this.addRoutineEditorExerciseRow(ex.name, ex.weightKg, ex.sets, ex.reps);
        });
      }
    } else {
      title.textContent = '新建训练循环计划';
      nameInput.value = '';
      muscleSelect.value = '胸部';
      if (delBtn) delBtn.classList.add('hidden');
      list.innerHTML = '';
      this.addRoutineEditorExerciseRow('杠铃卧推', 80, 4, 8);
      this.addRoutineEditorExerciseRow('哑铃上斜卧推', 24, 4, 10);
      this.addRoutineEditorExerciseRow('双杠臂屈伸', 0, 3, 10);
    }

    modal.classList.remove('hidden');
  }

  closeRoutineEditor() {
    const modal = document.getElementById('modal-routine-editor');
    if (modal) modal.classList.add('hidden');
    this.editingRoutineId = null;
  }

  addRoutineEditorExerciseRow(name = '', weight = 60, sets = 4, reps = 8) {
    const list = document.getElementById('routine-edit-exercises-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'routine-exercise-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center;background:var(--bg-input);padding:6px 8px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);';
    row.innerHTML = `
      <input type="text" class="form-input routine-row-name" placeholder="动作名称" style="flex:1.2;font-size:0.75rem;padding:4px 6px;" value="${name}">
      <input type="number" step="0.5" class="form-input routine-row-weight" placeholder="kg" style="width:52px;font-size:0.75rem;padding:4px 4px;text-align:center;" value="${weight}">
      <span style="font-size:0.68rem;color:var(--text-muted);">kg</span>
      <input type="number" class="form-input routine-row-sets" placeholder="组" style="width:40px;font-size:0.75rem;padding:4px 4px;text-align:center;" value="${sets}">
      <span style="font-size:0.68rem;color:var(--text-muted);">组</span>
      <input type="number" class="form-input routine-row-reps" placeholder="次" style="width:40px;font-size:0.75rem;padding:4px 4px;text-align:center;" value="${reps}">
      <span style="font-size:0.68rem;color:var(--text-muted);">次</span>
      <button type="button" class="btn-delete" onclick="this.parentElement.remove()" style="padding:2px 6px;color:var(--text-muted);background:transparent;border:none;cursor:pointer;font-size:0.8rem;" title="移除动作">✕</button>
    `;
    list.appendChild(row);
  }

  saveCustomRoutine() {
    const nameInput = document.getElementById('routine-edit-name');
    const muscleSelect = document.getElementById('routine-edit-muscle');
    const name = nameInput ? nameInput.value.trim() : '';
    const muscle = muscleSelect ? muscleSelect.value : '胸部';

    if (!name) {
      this.showToast('请输入计划名称');
      return;
    }

    const rows = document.querySelectorAll('#routine-edit-exercises-list .routine-exercise-row');
    const exercises = [];

    rows.forEach(row => {
      const exName = row.querySelector('.routine-row-name').value.trim();
      const exWeight = parseFloat(row.querySelector('.routine-row-weight').value) || 0;
      const exSets = parseInt(row.querySelector('.routine-row-sets').value, 10) || 4;
      const exReps = parseInt(row.querySelector('.routine-row-reps').value, 10) || 8;

      if (exName) {
        exercises.push({
          name: exName,
          muscleGroup: muscle,
          weightKg: exWeight,
          sets: exSets,
          reps: exReps
        });
      }
    });

    if (exercises.length === 0) {
      this.showToast('请至少添加一个训练动作');
      return;
    }

    const routineObj = {
      id: this.editingRoutineId || `routine_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: name,
      muscleGroup: muscle,
      icon: muscle === '胸部' ? '💥' : (muscle === '背部' ? '🦅' : (muscle === '腿部' ? '🦵' : (muscle === '肩部' ? '🛡️' : '⚡'))),
      isCustom: true,
      exercises: exercises
    };

    if (this.editingRoutineId) {
      const idx = this.customRoutines.findIndex(r => r.id === this.editingRoutineId);
      if (idx !== -1) {
        this.customRoutines[idx] = routineObj;
      } else {
        this.customRoutines.push(routineObj);
      }
    } else {
      this.customRoutines.push(routineObj);
    }

    this.saveRoutines();
    this.closeRoutineEditor();
    this.render();
    this.showToast(`✓ 已保存计划【${name}】！`);
  }

  deleteCustomRoutine(routineId) {
    if (!routineId) return;
    this.customRoutines = this.customRoutines.filter(r => r.id !== routineId);
    if (this.activeRoutineTodo && this.activeRoutineTodo.routineId === routineId) {
      this.activeRoutineTodo = null;
      localStorage.removeItem('fit_active_routine_todo');
    }
    this.saveRoutines();
    this.closeRoutineEditor();
    this.render();
    this.showToast('已删除计划');
  }

  renderWorkoutScreen() {
    const summary = this.getDaySummary(this.selectedDate);
    document.getElementById('workout-total-vol').textContent = `${summary.totalVolume.toLocaleString()} kg`;
    document.getElementById('workout-total-sets').textContent = `${summary.totalSets} 组`;
    document.getElementById('workout-total-burn').textContent = `+${summary.workoutBurn} kcal`;

    this.renderRoutineSection();
    this.renderActiveRoutineTodo();

    const dayWorkouts = this.workouts.filter(w => w.date === this.selectedDate);
    const container = document.getElementById('workout-items-list');
    document.getElementById('workout-list-title').textContent = `今日动作与加片建议 (${dayWorkouts.length})`;

    if (dayWorkouts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          🏋️ 今日暂无训练记录<br>
          点击上方【🎙️ 口喷记训练】或【+ 手动加动作】添加训练
        </div>
      `;
      return;
    }

    // Overload Advices
    const advices = WorkoutEngine.generateOverloadAdvices(this.workouts);

    container.innerHTML = dayWorkouts.map(w => {
      const matchedAdvice = advices.find(a => a.exerciseName === w.exerciseName);

      let overloadBadgeHtml = '';
      if (matchedAdvice) {
        if (matchedAdvice.status === 'READY_TO_ADD_PLATE') {
          overloadBadgeHtml = `
            <div class="overload-badge">
              <span>⚡ <b>AI 加片建议</b>：下次目标加片至 <b>${matchedAdvice.targetWeightKg}kg</b> (${matchedAdvice.targetReps}次)</span>
            </div>
          `;
        } else {
          overloadBadgeHtml = `
            <div class="overload-badge" style="background:var(--bg-subtle);border-color:var(--border-subtle);color:var(--text-secondary);">
              <span>📈 <b>AI 进阶建议</b>：下次目标冲击 <b>${matchedAdvice.targetReps}次</b> 积累容量</span>
            </div>
          `;
        }
      }

      const est1RM = WorkoutEngine.calc1RM(w.weightKg, w.reps);
      const isBarbell = w.weightKg >= 20 && (w.exerciseName.includes("卧推") || w.exerciseName.includes("深蹲") || w.exerciseName.includes("硬拉") || w.exerciseName.includes("推举") || w.exerciseName.includes("杠铃"));

      return `
        <div class="record-card">
          <div class="record-row-top">
            <div class="record-name-group">
              <span class="tag-badge tag-cyan">${w.muscleGroup}</span>
              <span class="record-name">${w.exerciseName}</span>
              ${isBarbell ? `<button onclick="window.app.openPlateCalculator(${w.weightKg})" class="btn-subtle" style="padding:1px 6px;font-size:0.65rem;border-radius:4px;color:var(--accent-cyan);border:1px solid rgba(56,189,248,0.3);cursor:pointer;background:transparent;">⚡ 算片</button>` : ''}
            </div>
            <button class="btn-delete" onclick="window.app.deleteWorkout('${w.id}')" title="删除动作">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="record-row-bottom">
            <span class="record-stat-highlight" style="color:var(--accent-cyan);">
              ${w.weightKg > 0 ? `${w.weightKg}kg × ` : '自重 × '}${w.sets}组 × ${w.reps}次
            </span>
            <span>${est1RM > 0 ? `预估1RM: ${est1RM}kg · ` : ''}吨位: ${(w.weightKg * w.sets * w.reps).toLocaleString()}kg</span>
          </div>
          ${overloadBadgeHtml}
        </div>
      `;
    }).join('');
  }

  renderHistoryScreen() {
    const daysCount = this.historyRange === 'MONTH' ? 30 : 7;
    const historyData = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const dStr = getTodayDateString(-i);
      const summary = this.getDaySummary(dStr);
      historyData.push({
        date: dStr,
        label: dStr.slice(5),
        hasLogs: summary.hasLogs,
        isToday: summary.isToday,
        deficit: summary.hasLogs ? summary.deficit : 0,
        volume: summary.totalVolume,
        burn: summary.workoutBurn,
        intake: summary.dietIntake
      });
    }

    const trackedDays = historyData.filter(d => d.hasLogs || (d.isToday && (d.volume > 0 || d.intake > 0)));
    const totalDeficit = trackedDays.reduce((s, d) => s + d.deficit, 0);
    const activeDays = trackedDays.length;
    const avgDeficit = activeDays > 0 ? Math.round(totalDeficit / activeDays) : 0;
    const totalVol = historyData.reduce((s, d) => s + d.volume, 0);

    document.getElementById('hist-total-deficit').textContent = `${Math.round(totalDeficit).toLocaleString()} kcal`;
    document.getElementById('hist-avg-deficit').textContent = `${avgDeficit} kcal`;
    document.getElementById('hist-total-volume').textContent = `${totalVol.toLocaleString()} kg`;
    document.getElementById('hist-active-days').textContent = `${activeDays} 天`;

    // Charts with interactive day retrospective on click
    ChartEngine.drawDeficitTrend('deficit-trend-canvas', historyData, this.profile.targetDeficitKcal);
    ChartEngine.drawVolumeTrend('volume-trend-canvas', historyData);

    // History items timeline
    const container = document.getElementById('history-timeline-list');
    const pastRecords = historyData.filter(d => d.hasLogs || (d.isToday && (d.volume > 0 || d.intake > 0))).reverse();

    if (pastRecords.length === 0) {
      container.innerHTML = `<div class="empty-state">暂无历史打卡记录，点击任意图表也可回溯</div>`;
      return;
    }

    container.innerHTML = pastRecords.map(d => {
      const isToday = d.date === getTodayDateString();

      return `
        <div class="history-item" onclick="window.app.openDayRetrospective('${d.date}')" style="cursor:pointer;">
          <div class="history-item-header">
            <div>
              <div class="history-item-date">${isToday ? `${d.date} · 今天` : d.date}</div>
              <div class="history-item-sub">摄入 ${d.intake} kcal · 举铁 ${d.volume.toLocaleString()} kg · 运动 +${d.burn} kcal</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="tag-badge ${d.deficit >= this.profile.targetDeficitKcal ? 'tag-lime' : 'tag-cyan'}">
                ${d.deficit >= 0 ? `净缺口 ${Math.round(d.deficit)}` : `盈余 +${Math.round(Math.abs(d.deficit))}`}
              </span>
              <span style="font-size:0.75rem;color:var(--accent-cyan);font-weight:700;">回溯 ➔</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderProfileForm() {
    const p = this.profile;
    document.getElementById('profile-bmr-display').textContent = `${p.bmr} kcal`;
    document.getElementById('profile-tdee-display').textContent = `${p.tdee} kcal`;

    document.getElementById('input-height').value = p.heightCm;
    document.getElementById('input-weight').value = p.weightKg;
    document.getElementById('input-age').value = p.age;
    document.getElementById('input-target-deficit').value = p.targetDeficitKcal;
    document.getElementById('input-target-protein').value = p.targetProteinG;
    document.getElementById('input-target-carbs').value = p.targetCarbsG;
    document.getElementById('input-target-fat').value = p.targetFatG;

    document.querySelectorAll('.gender-btn').forEach(b => {
      if (!b.id || !b.id.startsWith('onboarding')) {
        b.classList.toggle('active', b.dataset.gender === p.gender);
      }
    });

    this.updateProfileMacroRatioBar();
  }

  // ==================== Custom Macro Targets Logic ====================
  openCustomMacrosModal() {
    document.getElementById('custom-macro-p').value = this.profile.targetProteinG;
    document.getElementById('custom-macro-c').value = this.profile.targetCarbsG;
    document.getElementById('custom-macro-f').value = this.profile.targetFatG;

    this.updateCustomMacroModalCalc();
    document.getElementById('modal-custom-macros')?.classList.remove('hidden');
  }

  closeCustomMacrosModal() {
    document.getElementById('modal-custom-macros')?.classList.add('hidden');
  }

  setCustomMacroPreset(presetType) {
    const weight = this.profile.weightKg || 72;
    const targetCal = Math.max(1200, (this.profile.tdee || 2392) - (this.profile.targetDeficitKcal || 450));

    let p = Math.round(weight * 2.0);
    let f = Math.round(weight * 0.8);
    let c = Math.max(50, Math.round((targetCal - p * 4 - f * 9) / 4));

    if (presetType === 'high_protein') {
      p = Math.round(weight * 2.2);
      f = Math.round(weight * 0.7);
      c = Math.max(40, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'balanced') {
      p = Math.round(weight * 1.6);
      f = Math.round(weight * 0.8);
      c = Math.max(50, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'bulking') {
      p = Math.round(weight * 1.8);
      f = Math.round(weight * 0.7);
      c = Math.max(80, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'low_carb') {
      c = Math.round(weight * 0.5); // ~35-40g
      p = Math.round(weight * 2.0);
      f = Math.max(30, Math.round((targetCal - p * 4 - c * 4) / 9));
    }

    document.getElementById('custom-macro-p').value = p;
    document.getElementById('custom-macro-c').value = c;
    document.getElementById('custom-macro-f').value = f;

    this.updateCustomMacroModalCalc();
  }

  onCustomMacroInputChange() {
    this.updateCustomMacroModalCalc();
  }

  updateCustomMacroModalCalc() {
    const p = parseFloat(document.getElementById('custom-macro-p').value) || 0;
    const c = parseFloat(document.getElementById('custom-macro-c').value) || 0;
    const f = parseFloat(document.getElementById('custom-macro-f').value) || 0;

    const totalCal = Math.round(p * 4 + c * 4 + f * 9);
    const targetDietCal = (this.profile.tdee || 2392) - (this.profile.targetDeficitKcal || 450);

    const totalCalEl = document.getElementById('custom-macro-total-cal');
    if (totalCalEl) {
      totalCalEl.textContent = `${totalCal} kcal`;
      const diff = totalCal - targetDietCal;
      totalCalEl.style.color = Math.abs(diff) <= 80 ? 'var(--accent-lime)' : 'var(--accent-cyan)';
    }

    const targetCalEl = document.getElementById('custom-macro-target-diet-cal');
    if (targetCalEl) {
      targetCalEl.textContent = `${targetDietCal} kcal (TDEE ${this.profile.tdee} - 缺口 ${this.profile.targetDeficitKcal})`;
    }

    const safeTotal = Math.max(1, totalCal);
    const pPct = Math.round((p * 4 / safeTotal) * 100);
    const cPct = Math.round((c * 4 / safeTotal) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);

    const segP = document.getElementById('custom-seg-p');
    const segC = document.getElementById('custom-seg-c');
    const segF = document.getElementById('custom-seg-f');

    if (segP) { segP.style.width = `${pPct}%`; segP.textContent = `蛋 ${pPct}%`; }
    if (segC) { segC.style.width = `${cPct}%`; segC.textContent = `碳 ${cPct}%`; }
    if (segF) { segF.style.width = `${fPct}%`; segF.textContent = `脂 ${fPct}%`; }
  }

  saveCustomMacros() {
    const p = parseFloat(document.getElementById('custom-macro-p').value) || 140;
    const c = parseFloat(document.getElementById('custom-macro-c').value) || 240;
    const f = parseFloat(document.getElementById('custom-macro-f').value) || 55;

    this.profile.targetProteinG = p;
    this.profile.targetCarbsG = c;
    this.profile.targetFatG = f;

    this.saveData();
    this.closeCustomMacrosModal();
    this.render();
    this.showToast(`✓ 碳蛋脂目标已更新：蛋 ${p}g / 碳 ${c}g / 脂 ${f}g`);
  }

  // Profile Screen Macro Helpers
  applyMacroPreset(presetType) {
    const weight = parseFloat(document.getElementById('input-weight').value) || this.profile.weightKg || 72;
    const height = parseFloat(document.getElementById('input-height').value) || this.profile.heightCm || 175;
    const age = parseInt(document.getElementById('input-age').value, 10) || this.profile.age || 26;
    const isMale = this.profile.gender === 'male';
    const deficit = parseFloat(document.getElementById('input-target-deficit').value) || 450;

    const bmr = isMale
      ? (10 * weight + 6.25 * height - 5 * age + 5)
      : (10 * weight + 6.25 * height - 5 * age - 161);
    const tdee = Math.round(bmr * 1.45);
    const targetCal = Math.max(1200, tdee - deficit);

    let p = Math.round(weight * 2.0);
    let f = Math.round(weight * 0.8);
    let c = Math.max(50, Math.round((targetCal - p * 4 - f * 9) / 4));

    if (presetType === 'high_protein') {
      p = Math.round(weight * 2.2);
      f = Math.round(weight * 0.7);
      c = Math.max(40, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'balanced') {
      p = Math.round(weight * 1.6);
      f = Math.round(weight * 0.8);
      c = Math.max(50, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'bulking') {
      p = Math.round(weight * 1.8);
      f = Math.round(weight * 0.7);
      c = Math.max(80, Math.round((targetCal - p * 4 - f * 9) / 4));
    } else if (presetType === 'low_carb') {
      c = Math.round(weight * 0.5);
      p = Math.round(weight * 2.0);
      f = Math.max(30, Math.round((targetCal - p * 4 - c * 4) / 9));
    }

    document.getElementById('input-target-protein').value = p;
    document.getElementById('input-target-carbs').value = c;
    document.getElementById('input-target-fat').value = f;

    this.updateProfileMacroRatioBar();
    this.showToast('已应用预设配比');
  }

  onProfileDeficitChange() {
    this.updateProfileMacroRatioBar();
  }

  onProfileMacroInputChange() {
    this.updateProfileMacroRatioBar();
  }

  updateProfileMacroRatioBar() {
    const p = parseFloat(document.getElementById('input-target-protein')?.value) || 0;
    const c = parseFloat(document.getElementById('input-target-carbs')?.value) || 0;
    const f = parseFloat(document.getElementById('input-target-fat')?.value) || 0;

    const totalCal = Math.round(p * 4 + c * 4 + f * 9);
    const badge = document.getElementById('profile-macro-cal-badge');
    if (badge) {
      badge.textContent = `配比: ${totalCal} kcal`;
    }

    const safeTotal = Math.max(1, totalCal);
    const pPct = Math.round((p * 4 / safeTotal) * 100);
    const cPct = Math.round((c * 4 / safeTotal) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);

    const segP = document.getElementById('profile-seg-p');
    const segC = document.getElementById('profile-seg-c');
    const segF = document.getElementById('profile-seg-f');

    if (segP) { segP.style.width = `${pPct}%`; segP.textContent = `蛋 ${pPct}%`; }
    if (segC) { segC.style.width = `${cPct}%`; segC.textContent = `碳 ${cPct}%`; }
    if (segF) { segF.style.width = `${fPct}%`; segF.textContent = `脂 ${fPct}%`; }
  }

  saveProfile() {
    const height = parseFloat(document.getElementById('input-height').value) || 175;
    const weight = parseFloat(document.getElementById('input-weight').value) || 72;
    const age = parseInt(document.getElementById('input-age').value, 10) || 26;
    const targetDeficit = parseFloat(document.getElementById('input-target-deficit').value) || 450;
    const protein = parseFloat(document.getElementById('input-target-protein').value) || 140;
    const carbs = parseFloat(document.getElementById('input-target-carbs').value) || 240;
    const fat = parseFloat(document.getElementById('input-target-fat').value) || 55;

    this.profile.heightCm = height;
    this.profile.weightKg = weight;
    this.profile.age = age;
    this.profile.targetDeficitKcal = targetDeficit;
    this.profile.targetProteinG = protein;
    this.profile.targetCarbsG = carbs;
    this.profile.targetFatG = fat;

    this.recalculateMetabolism();
    this.saveData();
    this.render();
    this.showToast('✓ 档案与设置已保存');
    this.switchTab('diet');
  }

  openManualWorkoutModal() {
    document.getElementById('modal-manual-workout').classList.remove('hidden');
  }

  closeManualWorkoutModal() {
    document.getElementById('modal-manual-workout').classList.add('hidden');
  }

  fillManualExercise(name, muscle, weight, sets, reps) {
    document.getElementById('manual-exercise-name').value = name;
    document.getElementById('manual-exercise-muscle').value = muscle;
    document.getElementById('manual-exercise-weight').value = weight;
    document.getElementById('manual-exercise-sets').value = sets;
    document.getElementById('manual-exercise-reps').value = reps;
  }

  saveManualWorkout() {
    const name = document.getElementById('manual-exercise-name').value.trim() || '力量训练';
    const muscle = document.getElementById('manual-exercise-muscle').value || '复合训练';
    const weight = parseFloat(document.getElementById('manual-exercise-weight').value) || 0;
    const sets = parseInt(document.getElementById('manual-exercise-sets').value, 10) || 4;
    const reps = parseInt(document.getElementById('manual-exercise-reps').value, 10) || 8;

    const isCompound = name.includes("卧推") || name.includes("深蹲") || name.includes("硬拉") || name.includes("划船") || name.includes("推举");
    const burn = Math.round(isCompound ? (sets * 28 + weight * 0.45) : (sets * 18 + weight * 0.2));

    const item = {
      id: "w_" + Date.now(),
      date: this.selectedDate,
      exerciseName: name,
      muscleGroup: muscle,
      sets,
      reps,
      weightKg: weight,
      rpe: 8.0,
      burnedCalories: burn,
      notes: `手动记录: ${weight > 0 ? weight + 'kg ' : '自重 '}${sets}组 x ${reps}次`
    };

    this.workouts.unshift(item);
    this.saveData();
    this.closeManualWorkoutModal();
    this.render();
    this.showToast(`✓ 已添加：${name}`);
  }

  openVoiceSheet(mode) {
    this.voiceMode = mode;
    const modal = document.getElementById('modal-voice-dictation');
    const title = document.getElementById('voice-sheet-title');
    const desc = document.getElementById('voice-sheet-desc');
    const samplesContainer = document.getElementById('voice-samples-container');
    const textarea = document.getElementById('voice-text-input');
    const previewBar = document.getElementById('voice-audio-preview');
    if (previewBar) previewBar.style.display = 'none';
    if (textarea) textarea.value = '';

    if (mode === 'WORKOUT') {
      title.textContent = '🎙️ 口喷记训练';
      desc.textContent = '支持【按住说话】或【点击录音】，也可直接打字';
      samplesContainer.innerHTML = `
        <span class="sample-chip" onclick="window.app.fillVoiceSample('卧推80公斤做4组每组10个，上斜哑铃24公斤3组')">卧推80kg 4x10 + 上斜哑铃</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('深蹲100公斤4组6次')">深蹲100kg 4x6</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('引体向上4组8次自重')">引体向上 4x8 自重</span>
      `;
    } else if (mode === 'WORKOUT_FOLLOWUP') {
      title.textContent = '🎙️ 补充训练参数';
      desc.textContent = '说出缺失的重量、组数或次数 (如 "4组8次" 或 "80kg")';
      samplesContainer.innerHTML = `
        <span class="sample-chip" onclick="window.app.fillVoiceSample('4组8次')">4组8次</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('80公斤')">80公斤</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('自重4组10次')">自重4组10次</span>
      `;
    } else {
      title.textContent = '🎙️ 口喷记饮食';
      desc.textContent = '支持【按住说话】或【点击录音】，也可直接打字';
      samplesContainer.innerHTML = `
        <span class="sample-chip" onclick="window.app.fillVoiceSample('中午吃了200克大米饭，200克黑椒鸡胸肉和一盘西兰花')">米饭200g + 鸡胸200g + 西兰花</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('早上吃了2个水煮蛋大概100克，一杯牛奶250毫升')">蛋2个 + 牛奶250ml</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('1勺乳清蛋白粉配1根香蕉')">蛋白粉1勺 + 香蕉1根</span>
      `;
    }

    this.updateWaveformBars(0);
    modal.classList.remove('hidden');
  }

  fillVoiceSample(text) {
    document.getElementById('voice-text-input').value = text;
  }

  closeVoiceSheet() {
    SpeechModule.stop(true);
    this.updateMicUi(false);
    this.updateWaveformBars(0);
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer = null;
    }
    document.getElementById('modal-voice-dictation').classList.add('hidden');
  }

  async submitVoiceParse() {
    const text = document.getElementById('voice-text-input').value.trim();
    if (!text) {
      this.showToast('请先说话或输入内容');
      return;
    }

    this.closeVoiceSheet();

    if (this.voiceMode === 'WORKOUT_FOLLOWUP') {
      const idx = this.parsedWorkoutBuffer.findIndex(i => !i.isComplete);
      const targetIdx = idx !== -1 ? idx : 0;
      if (this.parsedWorkoutBuffer[targetIdx]) {
        this.parsedWorkoutBuffer[targetIdx] = WorkoutEngine.mergeWorkoutFactors(this.parsedWorkoutBuffer[targetIdx], text);
      }
      this.showWorkoutConfirmModal(this.parsedWorkoutBuffer);
      return;
    }

    this.showToast('🧠 AI 正在智能提炼...', 1200);

    try {
      if (this.voiceMode === 'WORKOUT') {
        const activeTodos = this.getActiveTodos();
        const items = WorkoutEngine.parseWorkoutVoice(text, { activeTodos });
        this.parsedWorkoutBuffer = items;
        this.showWorkoutConfirmModal(items);
      } else {
        const result = typeof AiService !== 'undefined'
          ? await AiService.parseDiet(text)
          : NutritionEngine.parseDietVoice(text);
        this.parsedDietBuffer = result;
        this.showDietConfirmModal(result);
      }
    } catch (err) {
      console.error('[App] AI 解析异常降级:', err);
      if (this.voiceMode === 'WORKOUT') {
        const activeTodos = this.getActiveTodos();
        const items = WorkoutEngine.parseWorkoutVoice(text, { activeTodos });
        this.parsedWorkoutBuffer = items;
        this.showWorkoutConfirmModal(items);
      } else {
        const result = NutritionEngine.parseDietVoice(text);
        this.parsedDietBuffer = result;
        this.showDietConfirmModal(result);
      }
    }
  }

  showWorkoutConfirmModal(items) {
    this.parsedWorkoutBuffer = items || [];

    let hasIncomplete = false;
    let firstIncompleteItem = null;

    this.parsedWorkoutBuffer.forEach(item => {
      WorkoutEngine.validateWorkoutFactors ? WorkoutEngine.validateWorkoutFactors(item) : null;
      if (!item.isComplete && !item.followUpPrompt) {
        item.followUpPrompt = WorkoutEngine.generateFollowUpPrompt ? WorkoutEngine.generateFollowUpPrompt(item) : "请补全缺失参数";
      }
    });

    const container = document.getElementById('confirm-workouts-items-container');
    if (container) {
      container.innerHTML = this.parsedWorkoutBuffer.map((item, idx) => {
        const isWeightMissing = item.weightKg === null || item.weightKg === undefined || isNaN(item.weightKg) || item.weightKg < 0;
        const isSetsMissing = item.sets === null || item.sets === undefined || isNaN(item.sets) || item.sets < 1;
        const isRepsMissing = item.reps === null || item.reps === undefined || isNaN(item.reps) || item.reps < 1;

        return `
          <div class="confirm-workout-card" id="confirm-workout-card-${idx}" style="background:var(--bg-input);padding:10px 12px;border-radius:var(--radius-sm);border:1px solid ${!item.isComplete ? 'rgba(245,158,11,0.4)' : 'var(--border-subtle)'};display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="tag-badge tag-cyan">${item.muscleGroup || '胸部'}</span>
                <b style="font-size:0.85rem;">${item.exerciseName}</b>
              </div>
              <div id="confirm-workout-badge-${idx}">
                ${!item.isComplete ? `<span class="factor-missing-badge">⚠️ 缺失参数</span>` : `<span style="font-size:0.7rem;color:var(--accent-lime);font-weight:600;">✓ 参数完整</span>`}
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:0.75rem;">
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" step="0.5" id="input-confirm-weight-${idx}" value="${item.weightKg !== null && item.weightKg !== undefined ? item.weightKg : ''}" placeholder="重量" oninput="window.app.updateWorkoutBuffer(${idx}, 'weightKg', this.value)" class="form-input ${isWeightMissing ? 'input-invalid' : ''}" style="width:64px;padding:5px 6px;text-align:center;">
                <span style="color:var(--text-muted);">kg</span>
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="input-confirm-sets-${idx}" value="${item.sets !== null && item.sets !== undefined ? item.sets : ''}" placeholder="组数" oninput="window.app.updateWorkoutBuffer(${idx}, 'sets', this.value)" class="form-input ${isSetsMissing ? 'input-invalid' : ''}" style="width:48px;padding:5px 6px;text-align:center;">
                <span style="color:var(--text-muted);">组</span>
              </div>
              <div style="display:flex;align-items:center;gap:4px;">
                <input type="number" id="input-confirm-reps-${idx}" value="${item.reps !== null && item.reps !== undefined ? item.reps : ''}" placeholder="次数" oninput="window.app.updateWorkoutBuffer(${idx}, 'reps', this.value)" class="form-input ${isRepsMissing ? 'input-invalid' : ''}" style="width:48px;padding:5px 6px;text-align:center;">
                <span style="color:var(--text-muted);">次</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    this.resetInlineFollowupRecordingUI();
    this.updateWorkoutConfirmModalUI();
    document.getElementById('modal-confirm-workouts').classList.remove('hidden');
  }

  updateWorkoutConfirmModalUI() {
    if (!this.parsedWorkoutBuffer) return;

    const anyIncomplete = this.parsedWorkoutBuffer.some(i => !i.isComplete);
    const firstIncompleteItem = this.parsedWorkoutBuffer.find(i => !i.isComplete);

    const bubbleEl = document.getElementById('workout-followup-bubble');
    const bubbleTextEl = document.getElementById('followup-bubble-text');
    const chipsEl = document.getElementById('followup-quick-chips');
    const voiceBarEl = document.getElementById('modal-followup-voice-bar');
    const saveBtn = document.getElementById('btn-save-confirmed-workouts');

    if (anyIncomplete && firstIncompleteItem) {
      if (bubbleEl) {
        bubbleEl.style.display = 'flex';
        if (bubbleTextEl) {
          bubbleTextEl.textContent = firstIncompleteItem.followUpPrompt || (WorkoutEngine.generateFollowUpPrompt ? WorkoutEngine.generateFollowUpPrompt(firstIncompleteItem) : "请补全缺失参数");
        }
      }
      if (chipsEl) {
        chipsEl.style.display = 'flex';
        chipsEl.innerHTML = this.renderFollowupChipsHtml(firstIncompleteItem);
      }
      if (voiceBarEl) voiceBarEl.style.display = 'block';

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "请补全缺失参数";
        saveBtn.classList.add('disabled');
      }
    } else {
      if (bubbleEl) bubbleEl.style.display = 'none';
      if (chipsEl) chipsEl.style.display = 'none';
      if (voiceBarEl) voiceBarEl.style.display = 'none';

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "✓ 存入训练";
        saveBtn.classList.remove('disabled');
      }
    }

    // Update individual cards and inputs in place without tearing down DOM nodes
    this.parsedWorkoutBuffer.forEach((item, idx) => {
      const cardEl = document.getElementById(`confirm-workout-card-${idx}`);
      const badgeEl = document.getElementById(`confirm-workout-badge-${idx}`);
      const weightInput = document.getElementById(`input-confirm-weight-${idx}`);
      const setsInput = document.getElementById(`input-confirm-sets-${idx}`);
      const repsInput = document.getElementById(`input-confirm-reps-${idx}`);

      const isWeightMissing = item.weightKg === null || item.weightKg === undefined || isNaN(item.weightKg) || item.weightKg < 0;
      const isSetsMissing = item.sets === null || item.sets === undefined || isNaN(item.sets) || item.sets < 1;
      const isRepsMissing = item.reps === null || item.reps === undefined || isNaN(item.reps) || item.reps < 1;

      if (cardEl) {
        cardEl.style.borderColor = !item.isComplete ? 'rgba(245,158,11,0.4)' : 'var(--border-subtle)';
      }
      if (badgeEl) {
        badgeEl.innerHTML = !item.isComplete
          ? `<span class="factor-missing-badge">⚠️ 缺失参数</span>`
          : `<span style="font-size:0.7rem;color:var(--accent-lime);font-weight:600;">✓ 参数完整</span>`;
      }
      if (weightInput) {
        if (isWeightMissing) weightInput.classList.add('input-invalid');
        else weightInput.classList.remove('input-invalid');
      }
      if (setsInput) {
        if (isSetsMissing) setsInput.classList.add('input-invalid');
        else setsInput.classList.remove('input-invalid');
      }
      if (repsInput) {
        if (isRepsMissing) repsInput.classList.add('input-invalid');
        else repsInput.classList.remove('input-invalid');
      }
    });
  }

  renderFollowupChipsHtml(item) {
    const missing = item.missingFactors || [];
    const chips = [];
    if (missing.includes('sets') || missing.includes('reps')) {
      chips.push('4组×8次', '4组×10次', '5组×5次', '3组×12次');
    }
    if (missing.includes('weightKg')) {
      chips.push('60kg', '80kg', '100kg', '自重 0kg');
    }
    if (chips.length === 0) {
      chips.push('4组×8次', '4组×10次', '5组×5次', '3组×12次', '60kg', '80kg', '100kg', '自重 0kg');
    }
    return chips.map(chip => `
      <span class="sample-chip" onclick="window.app.applyFollowupChip('${chip}')">${chip}</span>
    `).join('');
  }

  applyFollowupChip(chipText) {
    if (!this.parsedWorkoutBuffer || this.parsedWorkoutBuffer.length === 0) return;
    const idx = this.parsedWorkoutBuffer.findIndex(i => !i.isComplete);
    const targetIdx = idx !== -1 ? idx : 0;

    if (this.parsedWorkoutBuffer[targetIdx]) {
      this.parsedWorkoutBuffer[targetIdx] = WorkoutEngine.mergeWorkoutFactors(this.parsedWorkoutBuffer[targetIdx], chipText);
      const updated = this.parsedWorkoutBuffer[targetIdx];

      // Update input fields in the DOM
      const weightInput = document.getElementById(`input-confirm-weight-${targetIdx}`);
      const setsInput = document.getElementById(`input-confirm-sets-${targetIdx}`);
      const repsInput = document.getElementById(`input-confirm-reps-${targetIdx}`);

      if (weightInput && updated.weightKg !== null && updated.weightKg !== undefined) {
        weightInput.value = updated.weightKg;
      }
      if (setsInput && updated.sets !== null && updated.sets !== undefined) {
        setsInput.value = updated.sets;
      }
      if (repsInput && updated.reps !== null && updated.reps !== undefined) {
        repsInput.value = updated.reps;
      }

      this.updateWorkoutConfirmModalUI();
      this.showToast(`✓ 已补全：${chipText}`);
    }
  }

  updateWorkoutBuffer(index, field, value) {
    if (!this.parsedWorkoutBuffer || !this.parsedWorkoutBuffer[index]) return;

    if (value === '' || value === null || value === undefined) {
      this.parsedWorkoutBuffer[index][field] = null;
    } else {
      const num = parseFloat(value);
      this.parsedWorkoutBuffer[index][field] = isNaN(num) ? null : (field === 'weightKg' ? num : Math.round(num));
    }

    // Re-validate in place
    if (WorkoutEngine.validateWorkoutFactors) {
      this.parsedWorkoutBuffer[index] = WorkoutEngine.validateWorkoutFactors(this.parsedWorkoutBuffer[index]);
    }

    // Update UI in place WITHOUT recreating DOM elements or losing input focus
    this.updateWorkoutConfirmModalUI();
  }

  toggleInlineFollowupRecording() {
    if (this.isInlineFollowupRecording) {
      this.stopInlineFollowupRecording(false);
    } else {
      this.startInlineFollowupRecording();
    }
  }

  async startInlineFollowupRecording() {
    const recordingBox = document.getElementById('modal-followup-recording-box');
    const voiceBtn = document.getElementById('btn-modal-followup-voice');
    const statusText = document.getElementById('followup-recording-status');
    const timerText = document.getElementById('followup-recording-timer');
    const liveText = document.getElementById('followup-recording-live-text');

    if (!SpeechModule.isMediaRecorderSupported() && !SpeechModule.isWebSpeechSupported()) {
      this.showToast('⚠️ 当前浏览器不支持语音录音');
      return;
    }

    this.isInlineFollowupRecording = true;
    if (recordingBox) recordingBox.style.display = 'block';
    if (voiceBtn) {
      voiceBtn.style.background = 'rgba(239,68,68,0.2)';
      voiceBtn.style.borderColor = '#ef4444';
      voiceBtn.innerHTML = `
        <span class="recording-pulse-dot" style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block;margin-right:6px;"></span>
        <span>🔴 正在倾听中... (点击结束)</span>
      `;
    }
    if (statusText) statusText.textContent = '正在录音倾听中... (请说出参数)';
    if (timerText) timerText.textContent = '00:00';
    if (liveText) liveText.textContent = '“请直接说：4组8次、80公斤 或 5组5个”';

    const started = await SpeechModule.start({
      isHold: false,
      onTimerTick: (formatted) => {
        if (timerText) timerText.textContent = formatted;
      },
      onResult: (text, isFinal) => {
        if (liveText && text) {
          liveText.textContent = `“${text}”`;
        }
      },
      onEnd: ({ isCanceled, text }) => {
        this.resetInlineFollowupRecordingUI();
        if (!isCanceled && text && text.trim()) {
          this.applyFollowupVoiceResult(text.trim());
        } else if (!isCanceled) {
          this.showToast('⚠️ 未检测到有效声音，请重试或手动输入');
        }
      },
      onError: (type) => {
        this.resetInlineFollowupRecordingUI();
        if (type === 'PERMISSION_DENIED') {
          this.showToast('⚠️ 麦克风权限被拒绝，请在手机设置中允许');
        } else {
          this.showToast('⚠️ 录音识别超时或未检测到声音');
        }
      }
    });

    if (!started) {
      this.resetInlineFollowupRecordingUI();
    }
  }

  stopInlineFollowupRecording(isCancel = false) {
    if (!this.isInlineFollowupRecording) return;
    this.isInlineFollowupRecording = false;
    SpeechModule.stop(isCancel);
  }

  resetInlineFollowupRecordingUI() {
    this.isInlineFollowupRecording = false;
    const recordingBox = document.getElementById('modal-followup-recording-box');
    const voiceBtn = document.getElementById('btn-modal-followup-voice');
    if (recordingBox) recordingBox.style.display = 'none';
    if (voiceBtn) {
      voiceBtn.style.background = '';
      voiceBtn.style.borderColor = '';
      voiceBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        <span>🎙️ 语音补充参数 (说出如 "4组8次" 或 "80kg")</span>
      `;
    }
  }

  applyFollowupVoiceResult(transcribedText) {
    if (!this.parsedWorkoutBuffer || this.parsedWorkoutBuffer.length === 0) return;
    const idx = this.parsedWorkoutBuffer.findIndex(i => !i.isComplete);
    const targetIdx = idx !== -1 ? idx : 0;

    if (this.parsedWorkoutBuffer[targetIdx]) {
      this.parsedWorkoutBuffer[targetIdx] = WorkoutEngine.mergeWorkoutFactors(this.parsedWorkoutBuffer[targetIdx], transcribedText);
      const updated = this.parsedWorkoutBuffer[targetIdx];

      // Update inputs in the DOM
      const weightInput = document.getElementById(`input-confirm-weight-${targetIdx}`);
      const setsInput = document.getElementById(`input-confirm-sets-${targetIdx}`);
      const repsInput = document.getElementById(`input-confirm-reps-${targetIdx}`);

      if (weightInput && updated.weightKg !== null && updated.weightKg !== undefined) {
        weightInput.value = updated.weightKg;
      }
      if (setsInput && updated.sets !== null && updated.sets !== undefined) {
        setsInput.value = updated.sets;
      }
      if (repsInput && updated.reps !== null && updated.reps !== undefined) {
        repsInput.value = updated.reps;
      }

      this.updateWorkoutConfirmModalUI();
      if (updated.isComplete) {
        this.showToast(`✓ 语音补全成功：${updated.exerciseName} ${updated.weightKg}kg ${updated.sets}组${updated.reps}次`);
      } else {
        this.showToast(`✓ 语音已识别：“${transcribedText}”，请补全剩余参数`);
      }
    }
  }

  saveConfirmedWorkouts() {
    if (!this.parsedWorkoutBuffer || this.parsedWorkoutBuffer.length === 0) return;

    const anyIncomplete = this.parsedWorkoutBuffer.some(i => !i.isComplete);
    if (anyIncomplete) {
      this.showToast('⚠️ 请先补全缺失参数');
      return;
    }

    this.parsedWorkoutBuffer.forEach(item => {
      this.workouts.unshift({
        id: "w_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        date: this.selectedDate,
        exerciseName: item.exerciseName,
        muscleGroup: item.muscleGroup,
        sets: item.sets,
        reps: item.reps,
        weightKg: item.weightKg,
        rpe: item.rpe || 8.0,
        burnedCalories: Math.round(item.burnedCalories || 0),
        notes: item.notes || "AI语音录入"
      });

      // Contextual sync: mark active To-Do item completed if matched
      if (this.activeRoutineTodo && this.activeRoutineTodo.items) {
        const todoMatch = this.activeRoutineTodo.items.find(t => !t.completed && (t.exerciseName === item.exerciseName || item.exerciseName.includes(t.exerciseName) || t.exerciseName.includes(item.exerciseName)));
        if (todoMatch) {
          todoMatch.completed = true;
        }
      }
    });

    this.saveData();
    this.saveActiveRoutineTodo();

    // 自动将口播/录入的一组序列生成并沉淀为置顶训练计划 Card
    if (this.parsedWorkoutBuffer && this.parsedWorkoutBuffer.length >= 1) {
      const muscleList = Array.from(new Set(this.parsedWorkoutBuffer.map(i => i.muscleGroup || '综合力量'))).join('/');
      const routineName = this.parsedWorkoutBuffer.length === 1
        ? `${this.parsedWorkoutBuffer[0].exerciseName}专项组`
        : `${muscleList}分化序列 (${this.parsedWorkoutBuffer.length}动作)`;

      if (!Array.isArray(this.customRoutines)) this.customRoutines = [];
      const existingRoutine = this.customRoutines.find(r => 
        r.exercises &&
        r.exercises.length === this.parsedWorkoutBuffer.length &&
        r.exercises.every((e, idx) => e.name === this.parsedWorkoutBuffer[idx].exerciseName)
      );

      let routineIdToActivate = null;
      if (!existingRoutine) {
        const newRoutine = {
          id: "routine_auto_" + Date.now(),
          name: routineName,
          muscleGroup: muscleList,
          isCustom: true,
          isAutoGenerated: true,
          badgeText: "🎙️ 口播生成",
          exercises: this.parsedWorkoutBuffer.map(i => ({
            name: i.exerciseName,
            muscleGroup: i.muscleGroup || '综合力量',
            weightKg: i.weightKg !== null && i.weightKg !== undefined ? i.weightKg : 60,
            sets: i.sets || 4,
            reps: i.reps || 8
          }))
        };
        this.customRoutines.unshift(newRoutine);
        this.saveData();
        routineIdToActivate = newRoutine.id;
      } else {
        routineIdToActivate = existingRoutine.id;
      }

      // 如果当前没有激活的计划清单，自动激活该计划为今日待办
      if (!this.activeRoutineTodo) {
        this.selectRoutine(routineIdToActivate);
      }
    }

    if (typeof document !== 'undefined') {
      const modal = document.getElementById('modal-confirm-workouts');
      if (modal) modal.classList.add('hidden');
    }
    this.render();
    this.showToast(`✓ 已存入 ${this.parsedWorkoutBuffer.length} 项训练并生成计划卡片`);
    this.switchTab('workout');
  }

  showDietConfirmModal(result) {
    this.parsedDietBuffer = result;
    this.renderDietConfirmItems();

    document.querySelectorAll('.meal-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === result.mealType);
    });

    document.getElementById('modal-confirm-diet').classList.remove('hidden');
  }

  renderDietConfirmItems() {
    if (!this.parsedDietBuffer) return;
    const result = this.parsedDietBuffer;

    document.getElementById('confirm-diet-summary').value = result.foodSummary;
    document.getElementById('confirm-diet-cal').value = result.totalCalories;
    document.getElementById('confirm-diet-p').value = result.proteinG;
    document.getElementById('confirm-diet-c').value = result.carbsG;
    document.getElementById('confirm-diet-f').value = result.fatG;

    const box = document.getElementById('confirm-diet-items-box');
    if (!box) return;

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:700;color:var(--text-muted);font-size:0.7rem;">🍽️ 菜品成分与精确克数微调</span>
        <span style="font-size:0.65rem;color:var(--accent-cyan);">支持 ± 微调克数实时重算</span>
      </div>
      ${result.items.map((i, idx) => `
        <div style="background:var(--bg-card);padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <div style="display:flex;flex-direction:column;gap:2px;">
            <b style="font-size:0.8rem;">${i.name}</b>
            <span style="font-size:0.68rem;color:var(--text-muted);">P:${i.proteinG}g · C:${i.carbsG}g · F:${i.fatG}g</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="display:flex;align-items:center;gap:2px;">
              <button onclick="window.app.adjustDietItemGrams(${idx}, -20)" class="btn-subtle" style="width:22px;height:22px;padding:0;font-size:0.75rem;border-radius:4px;display:flex;align-items:center;justify-content:center;">-</button>
              <input type="number" step="10" value="${Math.round(i.estimatedGrams)}" onchange="window.app.setDietItemGrams(${idx}, this.value)" class="form-input" style="width:55px;padding:2px 4px;text-align:center;font-size:0.75rem;height:24px;">
              <span style="font-size:0.7rem;color:var(--text-muted);">g</span>
              <button onclick="window.app.adjustDietItemGrams(${idx}, 20)" class="btn-subtle" style="width:22px;height:22px;padding:0;font-size:0.75rem;border-radius:4px;display:flex;align-items:center;justify-content:center;">+</button>
            </div>
            <b style="color:var(--accent-orange);font-size:0.82rem;min-width:55px;text-align:right;">${i.calories} kcal</b>
          </div>
        </div>
      `).join('')}
    `;
  }

  adjustDietItemGrams(index, delta) {
    if (!this.parsedDietBuffer || !this.parsedDietBuffer.items[index]) return;
    const item = this.parsedDietBuffer.items[index];
    const newGrams = Math.max(10, (item.estimatedGrams || 100) + delta);
    this.setDietItemGrams(index, newGrams);
  }

  setDietItemGrams(index, grams) {
    if (!this.parsedDietBuffer || !this.parsedDietBuffer.items[index]) return;
    const item = this.parsedDietBuffer.items[index];
    const g = Math.max(5, parseFloat(grams) || 100);
    item.estimatedGrams = g;

    if (item.rawItem) {
      const nut = NutritionEngine.calcItemNutrition(item.rawItem, g);
      item.calories = nut.calories;
      item.proteinG = nut.proteinG;
      item.carbsG = nut.carbsG;
      item.fatG = nut.fatG;
    } else {
      const ratio = g / 100;
      item.calories = Math.round(128 * ratio);
      item.proteinG = Math.round(7.2 * ratio * 10) / 10;
      item.carbsG = Math.round(16.0 * ratio * 10) / 10;
      item.fatG = Math.round(4.0 * ratio * 10) / 10;
    }

    // Recalculate totals
    const items = this.parsedDietBuffer.items;
    this.parsedDietBuffer.totalCalories = items.reduce((sum, i) => sum + i.calories, 0);
    this.parsedDietBuffer.proteinG = Math.round(items.reduce((sum, i) => sum + i.proteinG, 0) * 10) / 10;
    this.parsedDietBuffer.carbsG = Math.round(items.reduce((sum, i) => sum + i.carbsG, 0) * 10) / 10;
    this.parsedDietBuffer.fatG = Math.round(items.reduce((sum, i) => sum + i.fatG, 0) * 10) / 10;

    this.renderDietConfirmItems();
  }

  saveConfirmedDiet() {
    const mealType = document.querySelector('.meal-type-btn.active')?.dataset.type || '午餐';
    const summary = document.getElementById('confirm-diet-summary').value || '日常餐饮';
    const cal = parseFloat(document.getElementById('confirm-diet-cal').value) || 300;
    const p = parseFloat(document.getElementById('confirm-diet-p').value) || 20;
    const c = parseFloat(document.getElementById('confirm-diet-c').value) || 35;
    const f = parseFloat(document.getElementById('confirm-diet-f').value) || 8;

    const item = {
      id: "d_" + Date.now(),
      date: this.selectedDate,
      mealType,
      foodSummary: summary,
      calories: Math.round(cal),
      proteinG: Math.round(p * 10) / 10,
      carbsG: Math.round(c * 10) / 10,
      fatG: Math.round(f * 10) / 10
    };

    this.diet.unshift(item);
    this.saveData();
    document.getElementById('modal-confirm-diet').classList.add('hidden');
    this.render();
    this.showToast(`✓ 已存入：+${item.calories} kcal`);
    this.switchTab('diet');
  }

  setDietOilMode(multiplier, btn) {
    document.querySelectorAll('.oil-mode-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (this.parsedDietBuffer && this.parsedDietBuffer.items) {
      this.parsedDietBuffer.items.forEach(item => {
        if (item.rawItem) {
          const nut = NutritionEngine.calcItemNutrition(item.rawItem, item.estimatedGrams || 100);
          const baseFat = nut.fatG;
          const adjustedFat = Math.round((baseFat * multiplier) * 10) / 10;
          const fatDelta = adjustedFat - baseFat;
          item.fatG = Math.max(0, adjustedFat);
          item.calories = Math.max(10, Math.round(nut.calories + fatDelta * 9));
        }
      });

      const items = this.parsedDietBuffer.items;
      this.parsedDietBuffer.totalCalories = items.reduce((sum, i) => sum + i.calories, 0);
      this.parsedDietBuffer.proteinG = Math.round(items.reduce((sum, i) => sum + i.proteinG, 0) * 10) / 10;
      this.parsedDietBuffer.carbsG = Math.round(items.reduce((sum, i) => sum + i.carbsG, 0) * 10) / 10;
      this.parsedDietBuffer.fatG = Math.round(items.reduce((sum, i) => sum + i.fatG, 0) * 10) / 10;

      this.renderDietConfirmItems();
    }
  }

  // ==================== Barbell Plate Calculator (配重算片) ====================
  openPlateCalculator(initialWeight = 80) {
    const input = document.getElementById('plate-calc-weight-input');
    if (input) input.value = initialWeight;
    this.renderPlateCalculation();
    document.getElementById('modal-plate-calculator')?.classList.remove('hidden');
  }

  closePlateCalculator() {
    document.getElementById('modal-plate-calculator')?.classList.add('hidden');
  }

  adjustPlateCalcWeight(delta) {
    const input = document.getElementById('plate-calc-weight-input');
    if (!input) return;
    const current = parseFloat(input.value) || 80;
    const next = Math.max(20, Math.round((current + delta) * 10) / 10);
    input.value = next;
    this.renderPlateCalculation();
  }

  renderPlateCalculation() {
    const weight = parseFloat(document.getElementById('plate-calc-weight-input')?.value) || 80;
    const res = WorkoutEngine.calcBarbellPlates(weight);

    const visual = document.getElementById('plate-calc-visual');
    const summary = document.getElementById('plate-calc-text-summary');

    if (visual) {
      const plateClassMap = {
        25: 'plate-25',
        20: 'plate-20',
        15: 'plate-15',
        10: 'plate-10',
        5: 'plate-5',
        2.5: 'plate-2_5',
        1.25: 'plate-1_25'
      };

      // Left plates (mirrored)
      const leftPlatesHtml = [...res.platesPerSide].reverse().map(p => `
        <div class="plate-disc ${plateClassMap[p] || 'plate-10'}" title="${p}kg">${p}</div>
      `).join('');

      // Right plates
      const rightPlatesHtml = res.platesPerSide.map(p => `
        <div class="plate-disc ${plateClassMap[p] || 'plate-10'}" title="${p}kg">${p}</div>
      `).join('');

      visual.innerHTML = `
        <div class="bar-shaft"></div>
        <div style="display:flex;align-items:center;gap:1px;">${leftPlatesHtml}</div>
        <div class="bar-collar"></div>
        <div class="bar-sleeve" style="width:70px;text-align:center;font-size:0.6rem;color:#000;font-weight:700;display:flex;align-items:center;justify-content:center;">杆 20kg</div>
        <div class="bar-collar"></div>
        <div style="display:flex;align-items:center;gap:1px;">${rightPlatesHtml}</div>
        <div class="bar-shaft"></div>
      `;
    }

    if (summary) {
      if (res.platesPerSide.length === 0) {
        summary.innerHTML = `<div>奥林匹克标准空杆 <b>20kg</b>（两边无需挂片）</div>`;
      } else {
        const platesCount = {};
        res.platesPerSide.forEach(p => platesCount[p] = (platesCount[p] || 0) + 1);
        const perSideStr = Object.entries(platesCount).map(([p, count]) => `<b>${p}kg</b> × ${count}块`).join(' + ');

        summary.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span>单侧配重：<b style="color:var(--accent-cyan);">${res.perSideWeight} kg</b></span>
            <span style="color:var(--text-muted);">标准奥杆 20kg</span>
          </div>
          <div style="margin-top:4px;font-size:0.72rem;color:var(--text-secondary);">
            👉 每边装片：${perSideStr}
          </div>
        `;
      }
    }
  }

  deleteDiet(id) {
    this.diet = this.diet.filter(d => d.id !== id);
    this.saveData();
    this.render();
    this.showToast('已删除记录');
  }

  deleteWorkout(id) {
    this.workouts = this.workouts.filter(w => w.id !== id);
    this.saveData();
    this.render();
    this.showToast('已删除动作');
  }

  showToast(msg) {
    const t = document.getElementById('app-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      t.classList.add('hidden');
    }, 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new FitnessApp();
});

if (typeof window !== 'undefined') {
  window.FitnessApp = FitnessApp;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FitnessApp, DEFAULT_PROFILE, getTodayDateString, shiftDateString };
}
