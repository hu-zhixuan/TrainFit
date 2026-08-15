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
      document.getElementById('modal-confirm-workouts').classList.add('hidden');
    });
    document.getElementById('btn-save-confirmed-workouts')?.addEventListener('click', () => {
      this.saveConfirmedWorkouts();
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  renderWorkoutScreen() {
    const summary = this.getDaySummary(this.selectedDate);
    document.getElementById('workout-total-vol').textContent = `${summary.totalVolume.toLocaleString()} kg`;
    document.getElementById('workout-total-sets').textContent = `${summary.totalSets} 组`;
    document.getElementById('workout-total-burn').textContent = `+${summary.workoutBurn} kcal`;

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
    this.startRestTimer(90);
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

  submitVoiceParse() {
    const text = document.getElementById('voice-text-input').value.trim();
    if (!text) {
      this.showToast('请先说话或输入内容');
      return;
    }

    this.closeVoiceSheet();

    if (this.voiceMode === 'WORKOUT') {
      const items = WorkoutEngine.parseWorkoutVoice(text);
      this.parsedWorkoutBuffer = items;
      this.showWorkoutConfirmModal(items);
    } else {
      const result = NutritionEngine.parseDietVoice(text);
      this.parsedDietBuffer = result;
      this.showDietConfirmModal(result);
    }
  }

  showWorkoutConfirmModal(items) {
    const container = document.getElementById('confirm-workouts-items-container');
    container.innerHTML = items.map((item, idx) => `
      <div style="background:var(--bg-input);padding:10px;border-radius:var(--radius-sm);border:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="tag-badge tag-cyan">${item.muscleGroup}</span>
          <b style="font-size:0.85rem;">${item.exerciseName}</b>
        </div>
        <div style="display:flex;align-items:center;gap:4px;font-size:0.75rem;">
          <input type="number" step="0.5" value="${item.weightKg}" onchange="window.app.updateWorkoutBuffer(${idx}, 'weightKg', this.value)" class="form-input" style="width:58px;padding:3px 5px;text-align:center;"> kg
          <input type="number" value="${item.sets}" onchange="window.app.updateWorkoutBuffer(${idx}, 'sets', this.value)" class="form-input" style="width:40px;padding:3px 5px;text-align:center;"> 组
          <input type="number" value="${item.reps}" onchange="window.app.updateWorkoutBuffer(${idx}, 'reps', this.value)" class="form-input" style="width:40px;padding:3px 5px;text-align:center;"> 次
        </div>
      </div>
    `).join('');

    document.getElementById('modal-confirm-workouts').classList.remove('hidden');
  }

  updateWorkoutBuffer(index, field, value) {
    if (this.parsedWorkoutBuffer[index]) {
      this.parsedWorkoutBuffer[index][field] = parseFloat(value) || 0;
    }
  }

  saveConfirmedWorkouts() {
    if (!this.parsedWorkoutBuffer || this.parsedWorkoutBuffer.length === 0) return;

    this.parsedWorkoutBuffer.forEach(item => {
      this.workouts.unshift({
        id: "w_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        date: this.selectedDate,
        exerciseName: item.exerciseName,
        muscleGroup: item.muscleGroup,
        sets: item.sets,
        reps: item.reps,
        weightKg: item.weightKg,
        rpe: 8.0,
        burnedCalories: Math.round(item.burnedCalories),
        notes: item.notes || "AI语音录入"
      });
    });

    this.saveData();
    document.getElementById('modal-confirm-workouts').classList.add('hidden');
    this.render();
    this.showToast(`✓ 已存入 ${this.parsedWorkoutBuffer.length} 项训练`);
    this.startRestTimer(90);
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

  // ==================== Floating Rest Timer (组间休息计时器) ====================
  startRestTimer(totalSeconds = 90) {
    clearInterval(this.restTimerInterval);
    this.restTimeRemaining = totalSeconds;

    const timerEl = document.getElementById('floating-rest-timer');
    const digitsEl = document.getElementById('rest-timer-digits');
    if (timerEl) timerEl.classList.remove('hidden');

    const updateDigits = () => {
      const mm = String(Math.floor(this.restTimeRemaining / 60)).padStart(2, '0');
      const ss = String(this.restTimeRemaining % 60).padStart(2, '0');
      if (digitsEl) digitsEl.textContent = `${mm}:${ss}`;
    };

    updateDigits();

    this.restTimerInterval = setInterval(() => {
      this.restTimeRemaining--;
      if (this.restTimeRemaining <= 0) {
        clearInterval(this.restTimerInterval);
        this.restTimerInterval = null;
        if (timerEl) timerEl.classList.add('hidden');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([200, 100, 200]); } catch (e) {}
        }
        this.showToast('⏱️ 休息结束！开始下一组');
      } else {
        updateDigits();
      }
    }, 1000);
  }

  adjustRestTimer(deltaSeconds) {
    this.restTimeRemaining = Math.max(5, (this.restTimeRemaining || 90) + deltaSeconds);
    const mm = String(Math.floor(this.restTimeRemaining / 60)).padStart(2, '0');
    const ss = String(this.restTimeRemaining % 60).padStart(2, '0');
    const digitsEl = document.getElementById('rest-timer-digits');
    if (digitsEl) digitsEl.textContent = `${mm}:${ss}`;
  }

  skipRestTimer() {
    clearInterval(this.restTimerInterval);
    this.restTimerInterval = null;
    document.getElementById('floating-rest-timer')?.classList.add('hidden');
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
