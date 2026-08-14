/**
 * 练食AI · 极简 3 分区主逻辑 (吃/缺口 · 练/加片 · 历史)
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
  targetProteinG: 140,
  targetCarbsG: 240,
  targetFatG: 55
};

function getTodayDateString(offsetDays = 0) {
  const d = new Date();
  if (offsetDays !== 0) d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

class FitnessApp {
  constructor() {
    this.currentTab = 'diet'; // Default start on Diet & Deficit
    this.selectedDate = getTodayDateString();
    this.historyRange = 'WEEK';
    this.voiceMode = 'DIET'; // 'DIET' | 'WORKOUT'
    this.parsedWorkoutBuffer = [];
    this.parsedDietBuffer = null;
    this.onboardingGender = 'male';

    this.initData();
    this.bindEvents();
    this.render();
    this.checkOnboarding();
  }

  initData() {
    // One-time purge of legacy mock data leftover from earlier testing sessions
    const cacheVer = localStorage.getItem('fit_cache_v2');
    if (!cacheVer) {
      localStorage.removeItem('fit_workouts');
      localStorage.removeItem('fit_diet');
      localStorage.removeItem('fit_profile');
      localStorage.removeItem('fit_onboarded');
      localStorage.setItem('fit_cache_v2', 'true');
    }

    const savedProfile = localStorage.getItem('fit_profile');
    this.profile = savedProfile ? JSON.parse(savedProfile) : { ...DEFAULT_PROFILE };
    this.recalculateMetabolism();

    // Clean initial state: no fake dummy history records!
    const savedWorkouts = localStorage.getItem('fit_workouts');
    this.workouts = savedWorkouts ? JSON.parse(savedWorkouts) : [];

    const savedDiet = localStorage.getItem('fit_diet');
    this.diet = savedDiet ? JSON.parse(savedDiet) : [];
  }

  checkOnboarding() {
    const isOnboarded = localStorage.getItem('fit_onboarded');
    if (!isOnboarded) {
      const modal = document.getElementById('modal-onboarding');
      if (modal) {
        modal.classList.remove('hidden');
        this.calcOnboardingTdee();
      }
    }
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
    this.profile.targetProteinG = Math.round(weight * 2.0); // 2g per kg bodyweight
    this.profile.targetCarbsG = Math.round(weight * 3.3);
    this.profile.targetFatG = Math.round(weight * 0.8);

    this.recalculateMetabolism();
    this.saveData();
    localStorage.setItem('fit_onboarded', 'true');

    document.getElementById('modal-onboarding').classList.add('hidden');
    this.render();
    this.showToast('🚀 档案设置成功！欢迎开启练食之旅！');
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

    // Only compute deficit if the day was actually tracked or is today
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

    // Profile Screen open & close
    document.getElementById('btn-open-profile').addEventListener('click', () => {
      this.switchTab('profile');
    });
    document.getElementById('btn-profile-back').addEventListener('click', () => {
      this.switchTab('diet');
    });

    // Voice Hero Buttons
    document.getElementById('btn-hero-diet-voice').addEventListener('click', () => {
      this.openVoiceSheet('DIET');
    });
    document.getElementById('btn-hero-workout-voice').addEventListener('click', () => {
      this.openVoiceSheet('WORKOUT');
    });

    // Manual Add buttons
    document.getElementById('btn-manual-add-diet').addEventListener('click', () => {
      this.openVoiceSheet('DIET');
    });
    
    // Direct Manual Workout Form Modal
    document.getElementById('btn-manual-add-workout').addEventListener('click', () => {
      this.openManualWorkoutModal();
    });

    // Manual Workout Form Controls
    document.getElementById('btn-cancel-manual-workout').addEventListener('click', () => {
      this.closeManualWorkoutModal();
    });
    document.getElementById('btn-save-manual-workout').addEventListener('click', () => {
      this.saveManualWorkout();
    });

    // Onboarding Button
    document.getElementById('btn-complete-onboarding').addEventListener('click', () => {
      this.completeOnboarding();
    });

    // Voice Modal Controls
    document.getElementById('btn-close-voice-sheet').addEventListener('click', () => {
      this.closeVoiceSheet();
    });
    document.getElementById('btn-toggle-mic').addEventListener('click', () => {
      this.toggleMic();
    });
    document.getElementById('btn-submit-voice-parse').addEventListener('click', () => {
      this.submitVoiceParse();
    });

    // Confirmation Modals
    document.getElementById('btn-cancel-workout-confirm').addEventListener('click', () => {
      document.getElementById('modal-confirm-workouts').classList.add('hidden');
    });
    document.getElementById('btn-save-confirmed-workouts').addEventListener('click', () => {
      this.saveConfirmedWorkouts();
    });

    document.getElementById('btn-cancel-diet-confirm').addEventListener('click', () => {
      document.getElementById('modal-confirm-diet').classList.add('hidden');
    });
    document.getElementById('btn-save-confirmed-diet').addEventListener('click', () => {
      this.saveConfirmedDiet();
    });

    // Meal type buttons in confirm modal
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
    document.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.historyRange = btn.dataset.range;
        this.renderHistoryScreen();
      });
    });

    // Profile Settings
    document.querySelectorAll('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.profile.gender = btn.dataset.gender;
        this.recalculateMetabolism();
        this.renderProfileForm();
      });
    });

    document.getElementById('btn-save-profile').addEventListener('click', () => {
      this.saveProfile();
    });
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
    document.getElementById('header-date-indicator').textContent = `今天 · ${months[d.getMonth()]}${d.getDate()}日`;
  }

  renderDietScreen() {
    const summary = this.getDaySummary(this.selectedDate);

    // Deficit Numbers
    document.getElementById('diet-net-deficit-num').textContent = Math.round(summary.deficit);
    document.getElementById('diet-total-burn-num').textContent = `${Math.round(summary.totalBurn)} kcal`;
    document.getElementById('diet-intake-num').textContent = `${Math.round(summary.dietIntake)} kcal`;
    document.getElementById('diet-target-deficit-num').textContent = `${Math.round(summary.targetDeficit)} kcal`;

    // Status Pill
    const pill = document.getElementById('diet-status-pill');
    const isTargetMet = summary.deficit >= summary.targetDeficit && summary.targetDeficit > 0;
    const isDeficit = summary.deficit >= 0;

    if (!isDeficit) {
      pill.className = 'status-pill surplus';
      pill.textContent = `热量盈余 +${Math.round(Math.abs(summary.deficit))} kcal`;
    } else if (isTargetMet) {
      pill.className = 'status-pill';
      pill.textContent = `✓ 缺口达标 ${Math.round(summary.deficit)} kcal`;
    } else {
      const pct = Math.round((summary.deficit / summary.targetDeficit) * 100);
      pill.className = 'status-pill';
      pill.textContent = `缺口进行中 ${pct}%`;
    }

    // Remaining allowance
    const remainingKcal = Math.round(summary.totalBurn - summary.targetDeficit - summary.dietIntake);
    const remTip = document.getElementById('diet-remaining-tip');
    if (remainingKcal >= 0) {
      remTip.innerHTML = `今日还可以摄入约 <b>${remainingKcal}</b> kcal`;
    } else {
      remTip.innerHTML = `⚠️ 今日摄入已超出计划 <b>${Math.abs(remainingKcal)}</b> kcal`;
    }

    // Draw Gauge Canvas
    ChartEngine.drawDeficitGauge(
      'gauge-canvas',
      summary.deficit,
      summary.targetDeficit,
      summary.totalBurn,
      summary.dietIntake
    );

    // Macros
    document.getElementById('macro-p-txt').textContent = `${Math.round(summary.totalProtein)}/${this.profile.targetProteinG}g`;
    document.getElementById('macro-p-bar').style.width = `${Math.min((summary.totalProtein / this.profile.targetProteinG) * 100, 100)}%`;

    document.getElementById('macro-c-txt').textContent = `${Math.round(summary.totalCarbs)}/${this.profile.targetCarbsG}g`;
    document.getElementById('macro-c-bar').style.width = `${Math.min((summary.totalCarbs / this.profile.targetCarbsG) * 100, 100)}%`;

    document.getElementById('macro-f-txt').textContent = `${Math.round(summary.totalFat)}/${this.profile.targetFatG}g`;
    document.getElementById('macro-f-bar').style.width = `${Math.min((summary.totalFat / this.profile.targetFatG) * 100, 100)}%`;

    // Render Meals
    const dayDiet = this.diet.filter(d => d.date === this.selectedDate);
    const container = document.getElementById('diet-items-list');
    document.getElementById('diet-list-title').textContent = `今日饮食记录 (${dayDiet.length})`;

    if (dayDiet.length === 0) {
      container.innerHTML = `<div class="empty-hint">今日尚未记录饮食，点击上方【🎙️ 口喷记饮食】快速添加</div>`;
      return;
    }

    container.innerHTML = dayDiet.map(d => `
      <div class="log-item-card">
        <div class="log-item-header">
          <div class="log-item-title-row">
            <span class="tag-pill orange-tag">${d.mealType}</span>
            <span class="log-item-name">${d.foodSummary}</span>
          </div>
          <button class="btn-delete-item" onclick="window.app.deleteDiet('${d.id}')" title="删除">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <div class="log-item-specs highlight-orange">
          ${d.calories} kcal <small style="color:var(--text-secondary);font-weight:normal;">(蛋白 ${d.proteinG || 0}g · 碳水 ${d.carbsG || 0}g · 脂肪 ${d.fatG || 0}g)</small>
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
    document.getElementById('workout-list-title').textContent = `今日训练与加片建议 (${dayWorkouts.length})`;

    if (dayWorkouts.length === 0) {
      container.innerHTML = `<div class="empty-hint">今日尚未记录训练，点击上方【🎙️ 口喷记训练】或【+ 手动加动作】添加</div>`;
      return;
    }

    // Generate Overload Advices
    const advices = WorkoutEngine.generateOverloadAdvices(this.workouts);

    container.innerHTML = dayWorkouts.map(w => {
      const matchedAdvice = advices.find(a => a.exerciseName === w.exerciseName);

      let overloadBadgeHtml = '';
      if (matchedAdvice) {
        if (matchedAdvice.adviceType === 'ADD_WEIGHT') {
          overloadBadgeHtml = `
            <div class="overload-tip-pill">
              <span>⚡ <b>AI 加片建议</b>：满足超负荷标准！下次目标加片至 <b>${matchedAdvice.targetWeightKg}kg</b> (${matchedAdvice.targetReps}次)</span>
            </div>
          `;
        } else {
          overloadBadgeHtml = `
            <div class="overload-tip-pill building">
              <span>📈 <b>AI 进阶建议</b>：当前重量保持，下次目标冲击 <b>${matchedAdvice.targetReps}次</b> 积累容量</span>
            </div>
          `;
        }
      }

      return `
        <div class="log-item-card">
          <div class="log-item-header">
            <div class="log-item-title-row">
              <span class="tag-pill cyan-tag">${w.muscleGroup}</span>
              <span class="log-item-name">${w.exerciseName}</span>
            </div>
            <button class="btn-delete-item" onclick="window.app.deleteWorkout('${w.id}')" title="删除">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="log-item-specs highlight-cyan">
            ${w.weightKg > 0 ? `${w.weightKg} kg × ` : '自重 × '}${w.sets} 组 × ${w.reps} 次 <span style="font-size:0.75rem;color:var(--text-muted);">(RPE ${w.rpe})</span>
          </div>
          <div class="log-item-subtext">
            总吨位: ${(w.weightKg * w.sets * w.reps).toLocaleString()} kg · 消耗约 +${w.burnedCalories} kcal
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
        deficit: summary.hasLogs ? summary.deficit : 0, // Past unrecorded days = 0
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

    // Charts
    ChartEngine.drawDeficitTrend('deficit-trend-canvas', historyData, this.profile.targetDeficitKcal);
    ChartEngine.drawVolumeTrend('volume-trend-canvas', historyData);

    // Interactive Memory Cards
    const container = document.getElementById('history-timeline-list');
    const pastRecords = historyData.filter(d => d.hasLogs || (d.isToday && (d.volume > 0 || d.intake > 0))).reverse();

    if (pastRecords.length === 0) {
      container.innerHTML = `<div class="empty-hint">暂无历史打卡数据，今日完成饮食或训练后将自动生成统计</div>`;
      return;
    }

    container.innerHTML = pastRecords.map(d => {
      const dayWorkouts = this.workouts.filter(w => w.date === d.date);
      const dayDiet = this.diet.filter(diet => diet.date === d.date);
      const isToday = d.date === getTodayDateString();

      return `
        <div class="history-memory-card" id="card-history-${d.date}">
          <div class="history-card-header" onclick="window.app.toggleHistoryCard('${d.date}')">
            <div class="history-card-left">
              <div class="history-card-date-row">
                <span class="history-card-date">${isToday ? `${d.date} · 今天` : d.date}</span>
                <span class="tag-pill ${d.deficit >= this.profile.targetDeficitKcal ? 'lime-tag' : 'cyan-tag'}">
                  ${d.deficit >= 0 ? `净缺口 ${Math.round(d.deficit)} kcal` : `盈余 +${Math.round(Math.abs(d.deficit))} kcal`}
                </span>
              </div>
              <div class="history-card-stats-line">
                <span>摄入 <b>${d.intake}</b> kcal</span>
                <span>·</span>
                <span>举铁 <b>${d.volume.toLocaleString()}</b> kg</span>
                <span>·</span>
                <span>运动 <b>+${d.burn}</b> kcal</span>
              </div>
            </div>
            <div class="history-card-right">
              <span class="history-toggle-hint">查看回忆</span>
              <span class="history-toggle-icon" id="icon-toggle-${d.date}">▾</span>
            </div>
          </div>

          <div class="history-card-body hidden" id="body-history-${d.date}">
            <!-- 饮食明细 -->
            <div class="history-section-block">
              <div class="history-section-title">🥗 饮食回忆 (${dayDiet.length})</div>
              ${dayDiet.length > 0 ? dayDiet.map(m => `
                <div class="history-subitem-row">
                  <span class="tag-pill orange-tag mini-tag">${m.mealType}</span>
                  <span class="history-subitem-name">${m.foodSummary}</span>
                  <span class="history-subitem-val">${m.calories} kcal</span>
                </div>
              `).join('') : '<div class="history-empty-sub">当天无饮食打卡记录</div>'}
            </div>

            <!-- 训练明细 -->
            <div class="history-section-block">
              <div class="history-section-title">🏋️ 训练回忆 (${dayWorkouts.length})</div>
              ${dayWorkouts.length > 0 ? dayWorkouts.map(w => `
                <div class="history-subitem-row">
                  <span class="tag-pill cyan-tag mini-tag">${w.muscleGroup}</span>
                  <span class="history-subitem-name">${w.exerciseName} (${w.weightKg > 0 ? w.weightKg + 'kg ' : '自重 '}${w.sets}x${w.reps})</span>
                  <span class="history-subitem-val">${(w.weightKg * w.sets * w.reps).toLocaleString()} kg</span>
                </div>
              `).join('') : '<div class="history-empty-sub">当天未记录力量训练</div>'}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  toggleHistoryCard(dateStr) {
    const body = document.getElementById(`body-history-${dateStr}`);
    const icon = document.getElementById(`icon-toggle-${dateStr}`);
    if (body) {
      const isHidden = body.classList.contains('hidden');
      body.classList.toggle('hidden', !isHidden);
      if (icon) {
        icon.textContent = isHidden ? '▴' : '▾';
      }
    }
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
      b.classList.toggle('active', b.dataset.gender === p.gender);
    });
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
    this.showToast('✓ 身体档案与热量目标保存成功！');
    this.switchTab('diet');
  }

  // Manual Workout Modal
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
    const muscle = document.getElementById('manual-exercise-muscle').value || '全身';
    const weight = parseFloat(document.getElementById('manual-exercise-weight').value) || 0;
    const sets = parseInt(document.getElementById('manual-exercise-sets').value, 10) || 4;
    const reps = parseInt(document.getElementById('manual-exercise-reps').value, 10) || 8;
    const rpe = parseFloat(document.getElementById('manual-exercise-rpe').value) || 8.0;

    const isCompound = name.includes("卧推") || name.includes("深蹲") || name.includes("硬拉") || name.includes("划船");
    const burn = Math.round(isCompound ? (sets * 28 + weight * 0.45) : (sets * 18 + weight * 0.2));

    const item = {
      id: "w_" + Date.now(),
      date: this.selectedDate,
      exerciseName: name,
      muscleGroup: muscle,
      sets,
      reps,
      weightKg: weight,
      rpe,
      burnedCalories: burn,
      notes: `手动记录: ${weight}kg x ${sets}组 x ${reps}次`
    };

    this.workouts.unshift(item);
    this.saveData();
    this.closeManualWorkoutModal();
    this.render();
    this.showToast(`✓ 已添加训练动作：${name} (${weight > 0 ? weight + 'kg ' : '自重 '}${sets}x${reps})`);
  }

  // Voice Sheet
  openVoiceSheet(mode) {
    this.voiceMode = mode;
    const modal = document.getElementById('modal-voice-dictation');
    const title = document.getElementById('voice-sheet-title');
    const desc = document.getElementById('voice-sheet-desc');
    const samplesContainer = document.getElementById('voice-samples-container');
    const textarea = document.getElementById('voice-text-input');
    textarea.value = '';

    if (mode === 'WORKOUT') {
      title.textContent = '口喷记训练 · AI 动作识别';
      desc.textContent = '说出动作名称、组数、次数及公斤数';
      samplesContainer.innerHTML = `
        <span class="sample-chip" onclick="window.app.fillVoiceSample('卧推80公斤4组8次rpe8，上斜哑铃卧推26公斤3组10次')">卧推80kg 4组8次 + 哑铃上斜</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('深蹲100公斤4组6次，腿屈伸45公斤3组12次')">深蹲100kg 4组6次</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('引体向上4组8次自重，杠铃划船70公斤4组8次')">引体向上 + 杠铃划船</span>
      `;
    } else {
      title.textContent = '口喷记饮食 · AI 营养识别';
      desc.textContent = '说出吃的美食及大概克数/分量规格';
      samplesContainer.innerHTML = `
        <span class="sample-chip" onclick="window.app.fillVoiceSample('吃了一大碗米饭配半斤酱牛肉和一盘水煮西兰花')">大碗米饭 + 半斤牛肉 + 西兰花</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('早餐喝了一盒纯牛奶吃了两个水煮蛋一片全麦面包')">纯牛奶1盒 + 2个蛋 + 全麦面包</span>
        <span class="sample-chip" onclick="window.app.fillVoiceSample('加餐喝了一大勺乳清蛋白粉吃了一根香蕉')">蛋白粉1大勺 + 香蕉1根</span>
      `;
    }

    modal.classList.remove('hidden');
  }

  fillVoiceSample(text) {
    document.getElementById('voice-text-input').value = text;
  }

  closeVoiceSheet() {
    SpeechModule.stop();
    this.updateMicUi(false);
    document.getElementById('modal-voice-dictation').classList.add('hidden');
  }

  toggleMic() {
    const textarea = document.getElementById('voice-text-input');
    if (SpeechModule.isRecording) {
      SpeechModule.stop();
      this.updateMicUi(false);
    } else {
      const baseText = textarea.value.trim();
      this.updateMicUi(true);
      SpeechModule.start(
        (transcript) => {
          if (transcript && transcript.trim()) {
            textarea.value = baseText ? `${baseText}，${transcript}` : transcript;
          }
        },
        () => {
          this.updateMicUi(false);
        }
      );
    }
  }

  updateMicUi(isRec) {
    const btn = document.getElementById('btn-toggle-mic');
    const ring = document.getElementById('mic-pulse-ring');
    const label = document.getElementById('mic-status-label');

    btn.classList.toggle('recording', isRec);
    ring.classList.toggle('active', isRec);
    label.textContent = isRec ? '🎙️ 正在聆听中... 再次点击停止' : '点击麦克风说话，或在下方快速输入';
  }

  submitVoiceParse() {
    const text = document.getElementById('voice-text-input').value.trim();
    if (!text) {
      this.showToast('请先说话或输入内容！');
      return;
    }

    this.closeVoiceSheet();

    if (this.voiceMode === 'WORKOUT') {
      const items = WorkoutEngine.parseWorkoutVoice(text);
      this.parsedWorkoutBuffer = items;
      this.showWorkoutConfirmModal(items, text);
    } else {
      const result = NutritionEngine.parseDietVoice(text);
      this.parsedDietBuffer = result;
      this.showDietConfirmModal(result, text);
    }
  }

  showWorkoutConfirmModal(items, rawText) {
    const container = document.getElementById('confirm-workouts-items-container');
    container.innerHTML = items.map((item, idx) => `
      <div class="confirm-item-row">
        <div class="confirm-item-title">
          <b>${item.exerciseName}</b> <span class="tag-pill cyan-tag">${item.muscleGroup}</span>
        </div>
        <div class="confirm-item-inputs">
          <input type="number" step="0.5" value="${item.weightKg}" onchange="window.app.updateWorkoutBuffer(${idx}, 'weightKg', this.value)" class="form-input mini-input" title="重量kg"> kg
          <input type="number" value="${item.sets}" onchange="window.app.updateWorkoutBuffer(${idx}, 'sets', this.value)" class="form-input mini-input" title="组数"> 组
          <input type="number" value="${item.reps}" onchange="window.app.updateWorkoutBuffer(${idx}, 'reps', this.value)" class="form-input mini-input" title="次数"> 次
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
        rpe: item.rpe || 8.0,
        burnedCalories: Math.round(item.burnedCalories),
        notes: item.notes || "AI语音录入"
      });
    });

    this.saveData();
    document.getElementById('modal-confirm-workouts').classList.add('hidden');
    this.render();
    this.showToast(`✓ 已存入 ${this.parsedWorkoutBuffer.length} 项训练！`);
    this.switchTab('workout');
  }

  showDietConfirmModal(result, rawText) {
    document.getElementById('confirm-diet-spoken-voice').textContent = `🎙️ 识别到语音: "${rawText}"`;
    document.getElementById('confirm-diet-summary').value = result.foodSummary;
    document.getElementById('confirm-diet-cal').value = result.totalCalories;
    document.getElementById('confirm-diet-p').value = result.proteinG;
    document.getElementById('confirm-diet-c').value = result.carbsG;
    document.getElementById('confirm-diet-f').value = result.fatG;

    // Highlights breakdown
    const box = document.getElementById('confirm-diet-items-box');
    box.innerHTML = `
      <div class="breakdown-title"><b>识别到的食物明细 (分量与热量)</b></div>
      ${result.items.map(i => `
        <div class="food-item-row">
          <span>${i.name} (${Math.round(i.estimatedGrams)}g)</span>
          <b class="highlight-orange">${i.calories} kcal</b>
        </div>
      `).join('')}
    `;

    // Activate current meal type
    document.querySelectorAll('.meal-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === result.mealType);
    });

    document.getElementById('modal-confirm-diet').classList.remove('hidden');
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
      fatG: Math.round(f * 10) / 10,
      advice: this.parsedDietBuffer ? this.parsedDietBuffer.advice : "科学饮食，精准控卡"
    };

    this.diet.unshift(item);
    this.saveData();
    document.getElementById('modal-confirm-diet').classList.add('hidden');
    this.render();
    this.showToast(`✓ 已存入饮食：+${item.calories} kcal`);
    this.switchTab('diet');
  }

  deleteDiet(id) {
    this.diet = this.diet.filter(d => d.id !== id);
    this.saveData();
    this.render();
    this.showToast('已删除该饮食记录');
  }

  deleteWorkout(id) {
    this.workouts = this.workouts.filter(w => w.id !== id);
    this.saveData();
    this.render();
    this.showToast('已删除该训练动作');
  }

  showToast(msg) {
    const t = document.getElementById('app-toast');
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
