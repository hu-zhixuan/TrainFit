/**
 * 练食AI · 懒人一键记录
 *
 * 一口气把今天练了什么、吃了什么说出来 → 大模型拆成训练 + 饮食 → 直接保存（可撤销）。
 *
 *  - 语音：安卓 App 里走原生 SpeechRecognizer（window.TrainFitNative），
 *          浏览器里有 Web Speech API 就用，都没有就打字（输入法自带的语音键也能用）。
 *  - 解析：OpenAI 兼容的 /chat/completions。App 里由原生层发请求（key 在编译时注入，
 *          也可以在「身体档案」页的「AI 接口」里覆盖）；接口不可用时退回本地规则引擎。
 */

(function (root) {
  'use strict';

  const OVERRIDE_KEY = 'tf_llm_override';
  const MUSCLES = ['胸部', '背部', '腿部', '肩部', '手臂', '核心', '有氧'];
  const MEAL_TYPES = ['早餐', '午餐', '晚餐', '加餐/补剂'];

  // ---------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------
  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  function cleanText(s, maxLen) {
    return String(s == null ? '' : s)
      .replace(/[<>"'`&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxLen || 40);
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function mealTypeByHour(hour) {
    if (hour >= 4 && hour < 10) return '早餐';
    if (hour >= 10 && hour < 15) return '午餐';
    if (hour >= 17 && hour < 21) return '晚餐';
    return '加餐/补剂';
  }

  function guessMuscle(name) {
    const n = name || '';
    if (/跑|骑|单车|椭圆|跳绳|游泳|快走|爬坡|划船机|有氧|HIIT|楼梯/i.test(n)) return '有氧';
    if (/卧推|夹胸|飞鸟|俯卧撑|胸/.test(n)) return '胸部';
    if (/引体|划船|下拉|硬拉|背/.test(n)) return '背部';
    if (/蹲|腿|臀|箭步|提踵/.test(n)) return '腿部';
    if (/推举|侧平举|肩|面拉/.test(n)) return '肩部';
    if (/弯举|二头|三头|臂屈伸|下压/.test(n)) return '手臂';
    if (/卷腹|平板|腹|核心/.test(n)) return '核心';
    return '胸部';
  }

  function readOverride() {
    try {
      const raw = root.localStorage && root.localStorage.getItem(OVERRIDE_KEY);
      const o = raw ? JSON.parse(raw) : {};
      return {
        baseUrl: (o.baseUrl || '').trim(),
        model: (o.model || '').trim(),
        apiKey: (o.apiKey || '').trim()
      };
    } catch (e) {
      return { baseUrl: '', model: '', apiKey: '' };
    }
  }

  function writeOverride(o) {
    try {
      root.localStorage.setItem(OVERRIDE_KEY, JSON.stringify({
        baseUrl: (o.baseUrl || '').trim(),
        model: (o.model || '').trim(),
        apiKey: (o.apiKey || '').trim()
      }));
    } catch (e) {}
  }

  // ---------------------------------------------------------------------------
  // 原生桥（安卓 App）
  // ---------------------------------------------------------------------------
  const Native = {
    _seq: 0,
    _pending: {},

    has() {
      return typeof root.TrainFitNative !== 'undefined' && root.TrainFitNative !== null;
    },

    speechAvailable() {
      try { return this.has() && !!root.TrainFitNative.isSpeechAvailable(); } catch (e) { return false; }
    },

    llmInfo() {
      try { return this.has() ? JSON.parse(root.TrainFitNative.getLlmInfo()) : null; } catch (e) { return null; }
    },

    chat(body, override, timeoutMs) {
      return new Promise((resolve, reject) => {
        const id = 'r' + (++this._seq) + '_' + Date.now();
        const timer = setTimeout(() => {
          delete this._pending[id];
          reject(new Error('TIMEOUT'));
        }, timeoutMs || 45000);
        this._pending[id] = { resolve, reject, timer };
        try {
          root.TrainFitNative.llmChat(id, JSON.stringify(body), JSON.stringify(override || {}));
        } catch (e) {
          clearTimeout(timer);
          delete this._pending[id];
          reject(e);
        }
      });
    },

    _onLlm(id, ok, payload) {
      const p = this._pending[id];
      if (!p) return;
      clearTimeout(p.timer);
      delete this._pending[id];
      if (ok) p.resolve(payload); else p.reject(new Error(payload || 'LLM_ERROR'));
    }
  };

  root.__tfLlm = function (id, ok, payload) { Native._onLlm(id, ok, payload); };

  // ---------------------------------------------------------------------------
  // 大模型解析
  // ---------------------------------------------------------------------------
  const Parser = {
    buildMessages(text, ctx) {
      ctx = ctx || {};
      const now = ctx.now || new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const known = (ctx.knownExercises || []).slice(0, 30);

      const system = [
        '你是健身记录助手。用户会用口语一口气说出训练和/或饮食，文本来自语音识别，可能有同音错字（如"卧腿"=卧推，"四组八哥"=4组8个，"划川"=划船）。',
        '把所有内容拆成结构化记录，只输出一个 JSON 对象，不要 markdown，不要解释。格式：',
        '{"dayOffset":0,"workouts":[{"exerciseName":"杠铃卧推","muscleGroup":"胸部","weightKg":80,"sets":4,"reps":8,"durationMin":null,"burnedCalories":110}],"meals":[{"mealType":"午餐","foodSummary":"黄焖鸡米饭1份","calories":820,"proteinG":38,"carbsG":95,"fatG":30}]}',
        '规则：',
        '1. muscleGroup 只能是：' + MUSCLES.join('、') + '。',
        '2. 重量单位换算成公斤（"磅"×0.45，"斤"×0.5）。自重动作 weightKg=0；没说重量写 null。没说组数或次数写 null，不要编。',
        '3. 同一个动作用了不同重量，就拆成多条。',
        '4. 跑步、单车、跳绳、平板支撑这类按时间算的动作填 durationMin（分钟），sets 和 reps 写 null。',
        '5. burnedCalories 按一般成年人的常见强度估算。',
        '6. mealType 只能是：' + MEAL_TYPES.join('、') + '。用户说了就按说的；没说就结合当前时间和食物常识判断。',
        '7. 同一餐的多样食物合并成一条 meal，foodSummary 写食物和份量（如"米饭1碗、番茄炒蛋1份"）。按中国常见份量估算 calories（千卡）和 proteinG/carbsG/fatG（克）。',
        '8. 说"昨天"则 dayOffset=-1，"前天"=-2，否则为 0。',
        '9. 与训练和饮食无关的话忽略。什么都没有就返回空数组。',
        known.length ? '10. 用户以前记过这些动作，同一个动作请沿用原名：' + known.join('、') + '。' : ''
      ].filter(Boolean).join('\n');

      const user = '现在时间 ' + hh + ':' + mm + '。用户说：' + text;
      return [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ];
    },

    extractJson(content) {
      if (content && typeof content === 'object') return content;
      let s = String(content || '').trim();
      s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) s = fence[1].trim();
      const a = s.indexOf('{');
      const b = s.lastIndexOf('}');
      if (a === -1 || b <= a) throw new Error('NO_JSON');
      return JSON.parse(s.slice(a, b + 1));
    },

    /** 从 chat/completions 的原始响应里拿出 message.content */
    contentFromResponse(raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const choice = data && data.choices && data.choices[0];
      const content = choice && (choice.message ? choice.message.content : choice.text);
      if (!content) throw new Error('EMPTY_RESPONSE');
      return content;
    },

    /**
     * 把大模型输出整理成可以直接存的记录；缺的参数用历史记录补，补不到用默认值。
     * @returns {{dayOffset:number, workouts:Array, meals:Array}}
     */
    normalize(parsed, ctx) {
      ctx = ctx || {};
      const history = ctx.history || [];
      const now = ctx.now || new Date();
      const out = { dayOffset: 0, workouts: [], meals: [] };

      const off = num(parsed && parsed.dayOffset);
      if (off !== null && off <= 0 && off >= -7) out.dayOffset = Math.round(off);

      const lastOf = (name) => history.find(h => h.exerciseName === name && !h.durationMin);

      (Array.isArray(parsed && parsed.workouts) ? parsed.workouts : []).forEach(w => {
        const name = cleanText(w.exerciseName || w.name, 30);
        if (!name) return;
        let muscle = cleanText(w.muscleGroup, 6);
        if (!MUSCLES.includes(muscle)) muscle = guessMuscle(name);

        const duration = num(w.durationMin);
        let weight = num(w.weightKg);
        let sets = num(w.sets);
        let reps = num(w.reps);
        let estimated = false;

        if (duration && duration > 0 && !sets && !reps) {
          const burn = num(w.burnedCalories);
          out.workouts.push({
            exerciseName: name,
            muscleGroup: muscle,
            weightKg: 0,
            sets: 1,
            reps: 0,
            durationMin: Math.round(duration),
            burnedCalories: Math.round(burn && burn > 0 ? burn : duration * 8),
            estimated: false
          });
          return;
        }

        const last = lastOf(name);
        if (weight === null) { weight = last ? last.weightKg : 0; estimated = true; }
        if (!sets) { sets = last ? last.sets : 3; estimated = true; }
        if (!reps) { reps = last ? last.reps : 10; estimated = true; }
        weight = Math.max(0, round1(weight));
        sets = Math.max(1, Math.min(20, Math.round(sets)));
        reps = Math.max(1, Math.min(100, Math.round(reps)));

        let burn = num(w.burnedCalories);
        if (!burn || burn <= 0) {
          burn = sets * reps * (weight > 0 ? weight * 0.05 + 1.2 : 2.5);
        }
        out.workouts.push({
          exerciseName: name,
          muscleGroup: muscle,
          weightKg: weight,
          sets,
          reps,
          durationMin: null,
          burnedCalories: Math.round(burn),
          estimated
        });
      });

      (Array.isArray(parsed && parsed.meals) ? parsed.meals : []).forEach(m => {
        const summary = cleanText(m.foodSummary || m.name || (Array.isArray(m.items) ? m.items.map(i => i.name).join('、') : ''), 60);
        const cal = num(m.calories);
        if (!summary || !cal || cal <= 0) return;
        let type = cleanText(m.mealType, 8);
        if (type === '加餐' || type === '补剂') type = '加餐/补剂';
        if (!MEAL_TYPES.includes(type)) type = mealTypeByHour(now.getHours());
        out.meals.push({
          mealType: type,
          foodSummary: summary,
          calories: Math.round(cal),
          proteinG: round1(Math.max(0, num(m.proteinG) || 0)),
          carbsG: round1(Math.max(0, num(m.carbsG) || 0)),
          fatG: round1(Math.max(0, num(m.fatG) || 0))
        });
      });

      return out;
    },

    async viaLlm(text, ctx) {
      const override = readOverride();
      const body = {
        messages: this.buildMessages(text, ctx),
        temperature: 0.2,
        stream: false
      };
      if (override.model) body.model = override.model;

      let raw;
      if (Native.has()) {
        raw = await Native.chat(body, override);
      } else if (override.apiKey && override.baseUrl) {
        // 浏览器里调试：直接请求（部分服务商不允许跨域，会失败）
        body.model = body.model || 'gpt-4o-mini';
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(override.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + override.apiKey },
            body: JSON.stringify(body),
            signal: ctrl.signal
          });
          raw = await res.text();
          if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + raw.slice(0, 200));
        } finally {
          clearTimeout(t);
        }
      } else {
        throw new Error('NO_KEY');
      }

      const parsed = this.extractJson(this.contentFromResponse(raw));
      return this.normalize(parsed, ctx);
    },

    /** 离线兜底：按句子切开，吃喝相关的走饮食引擎，其余走训练引擎 */
    viaLocal(text, ctx) {
      ctx = ctx || {};
      const now = ctx.now || new Date();
      const WE = root.WorkoutEngine;
      const NE = root.NutritionEngine;
      const out = { dayOffset: 0, workouts: [], meals: [] };
      if (/前天/.test(text)) out.dayOffset = -2;
      else if (/昨天|昨晚/.test(text)) out.dayOffset = -1;

      const foodCue = /吃|喝|早餐|午餐|晚餐|早饭|午饭|晚饭|夜宵|加餐|外卖|零食|饮料|奶茶|咖啡|牛奶|鸡蛋|米饭|面条|水果/;
      const segs = String(text).split(/[，,。；;！!？?\n]|然后|接着|另外|还有/).map(s => s.trim()).filter(Boolean);
      const foodSegs = [];
      const workoutSegs = [];
      segs.forEach(s => (foodCue.test(s) ? foodSegs : workoutSegs).push(s));

      if (WE && workoutSegs.length) {
        const items = WE.parseWorkoutVoice(workoutSegs.join('，')) || [];
        const pseudo = {
          workouts: items
            // 旧引擎对无关的话也会返回一个默认动作：一个数字都没有的丢掉
            .filter(i => i && i.exerciseName && (i.weightKg != null || i.sets != null || i.reps != null))
            .map(i => {
              const isCardio = /有氧|跑|骑|单车|跳绳|平板/.test((i.muscleGroup || '') + i.exerciseName);
              return {
                exerciseName: i.exerciseName,
                muscleGroup: i.muscleGroup,
                weightKg: isCardio ? null : i.weightKg,
                sets: isCardio ? null : i.sets,
                reps: isCardio ? null : i.reps,
                durationMin: isCardio ? (i.durationMin || i.weightKg || null) : null,
                burnedCalories: isCardio ? null : i.burnedCalories
              };
            })
        };
        out.workouts = this.normalize(pseudo, ctx).workouts;
      }

      if (NE && foodSegs.length) {
        const joined = foodSegs.join('，');
        const r = NE.parseDietVoice(joined);
        if (r && r.totalCalories > 0) {
          let type = null;
          if (/早餐|早饭|早上/.test(joined)) type = '早餐';
          else if (/午餐|午饭|中午/.test(joined)) type = '午餐';
          else if (/晚餐|晚饭|晚上/.test(joined)) type = '晚餐';
          else if (/加餐|夜宵|零食/.test(joined)) type = '加餐/补剂';
          out.meals.push({
            mealType: type || mealTypeByHour(now.getHours()),
            foodSummary: cleanText(r.foodSummary, 60) || '饮食记录',
            calories: Math.round(r.totalCalories),
            proteinG: round1(r.proteinG || 0),
            carbsG: round1(r.carbsG || 0),
            fatG: round1(r.fatG || 0)
          });
        }
      }
      return out;
    },

    async parse(text, ctx) {
      try {
        const r = await this.viaLlm(text, ctx);
        return Object.assign(r, { source: 'llm' });
      } catch (e) {
        console.warn('[QuickLog] 大模型解析失败，改用本地规则：', e && e.message);
        const r = this.viaLocal(text, ctx);
        return Object.assign(r, { source: 'local', error: e && e.message });
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 界面
  // ---------------------------------------------------------------------------
  const QuickLog = {
    state: 'idle',          // idle（打字） | listening（系统语音在听）
    holdMode: false,        // 是不是按住按钮说话
    speechBroken: false,    // 本次打开 App 期间系统语音没反应过，就不再尝试
    _webRec: null,
    _snackTimer: null,
    _baseText: '',

    init() {
      this.fab = document.getElementById('ql-fab');
      this.overlay = document.getElementById('ql-overlay');
      this.textEl = document.getElementById('ql-text');
      this.statusEl = document.getElementById('ql-status');
      this.primaryBtn = document.getElementById('ql-primary');
      this.voiceBtn = document.getElementById('ql-voice');
      this.cancelBtn = document.getElementById('ql-cancel');
      this.snack = document.getElementById('ql-snackbar');
      if (!this.fab || !this.overlay) return;

      this.bindFab();
      this.primaryBtn.addEventListener('click', () => this.onPrimary());
      this.cancelBtn.addEventListener('click', () => this.close());
      if (this.voiceBtn) this.voiceBtn.addEventListener('click', () => this.toggleVoice());
      this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
      document.getElementById('ql-undo')?.addEventListener('click', () => this.undo());

      // 用户自己动了输入框（打字、输入法语音、粘贴）：立刻停掉系统语音，以用户输入为准
      this.textEl.addEventListener('input', (e) => {
        if (this.state === 'listening' && !this._programmatic) {
          this.abortListening();
          this.toTyping('');
        }
      });
      this.textEl.addEventListener('focus', () => {
        if (this.state === 'listening' && !this.holdMode) {
          this.abortListening();
          this.toTyping('');
        }
      });

      this.initSettings();
      root.__tfSpeech = (type, text) => this.onSpeech(type, text);
    },

    speechSupported() {
      if (this.speechBroken) return false;
      return Native.speechAvailable() || !!(root.SpeechRecognition || root.webkitSpeechRecognition);
    },

    typingHint() {
      return this.speechSupported()
        ? '打字，或点「语音」/ 输入法键盘上的🎤 说话'
        : '打字，或点输入法键盘上的🎤 说话';
    },

    // ----- 底部大按钮：按住 = 系统语音；点一下 = 打字 -----
    bindFab() {
      let holdTimer = null;
      let holding = false;
      let startY = 0;
      let downOnFab = false;

      const down = (e) => {
        if (!this.overlay.classList.contains('hidden')) return;
        e.preventDefault();
        downOnFab = true;
        startY = e.clientY || 0;
        holding = false;
        holdTimer = setTimeout(() => {
          if (!this.speechSupported()) return; // 没有系统语音：松手时按「点一下」处理
          holding = true;
          this.open(true);
        }, 250);
      };
      const move = (e) => {
        if (!holding || this.state !== 'listening') return;
        const cancel = startY - (e.clientY || 0) > 70;
        this.overlay.classList.toggle('ql-canceling', cancel);
        this.statusEl.textContent = cancel ? '松开手指，取消' : '正在听… 松开就记下，上滑取消';
      };
      const up = (e) => {
        clearTimeout(holdTimer);
        if (!downOnFab) return;
        downOnFab = false;
        if (holding) {
          holding = false;
          const cancel = startY - (e.clientY || 0) > 70;
          this.overlay.classList.remove('ql-canceling');
          if (cancel) this.close(); else this.stopListening(true);
        } else {
          this.open(false); // 在手势里直接聚焦，键盘才弹得出来
        }
      };

      this.fab.addEventListener('pointerdown', down);
      root.addEventListener('pointermove', move);
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', () => {
        clearTimeout(holdTimer);
        if (!downOnFab) return;
        downOnFab = false;
        if (holding) { holding = false; this.stopListening(true); }
      });
      this.fab.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    show() {
      this.overlay.classList.remove('hidden', 'ql-canceling');
      document.body.classList.add('ql-open');
      if (this.voiceBtn) this.voiceBtn.classList.toggle('hidden', !this.speechSupported());
    },

    open(holdMode) {
      this.holdMode = !!holdMode;
      this.textEl.value = '';
      this.show();
      if (this.holdMode) {
        this.startListening();
      } else {
        this.toTyping(this.typingHint());
        this.textEl.focus();
      }
    },

    openWithText(text) {
      this.holdMode = false;
      this.show();
      this.textEl.value = text || '';
      this.toTyping('改一改，再点「记下来」');
      this.textEl.focus();
    },

    close() {
      if (this.state === 'listening') this.abortListening();
      this.clearWatchdogs();
      this.setState('idle');
      this.overlay.classList.add('hidden');
      document.body.classList.remove('ql-open');
      this.textEl.blur();
    },

    /** 切到打字状态（输入框永远可编辑，按钮永远可点） */
    toTyping(message) {
      this.holdMode = false;
      this.setState('idle');
      if (message) this.statusEl.textContent = message;
    },

    setState(s) {
      this.state = s;
      this.overlay.dataset.state = s;
      this.primaryBtn.disabled = false;
      this.primaryBtn.textContent = '记下来';
      if (this.voiceBtn) this.voiceBtn.querySelector('span').textContent = s === 'listening' ? '停止' : '语音';
      if (this.voiceBtn) this.voiceBtn.classList.toggle('on', s === 'listening');
      if (s === 'listening') {
        this.statusEl.textContent = this.holdMode ? '正在听… 松开就记下，上滑取消' : '正在听… 说完点「停止」或直接「记下来」';
      }
    },

    onPrimary() {
      if (this.state === 'listening') {
        // 边听边点「记下来」：停下来，拿到最终文字后直接提交
        this.stopListening(true);
      } else {
        this.submit(this.textEl.value);
      }
    },

    toggleVoice() {
      if (this.state === 'listening') this.stopListening(false);
      else { this.holdMode = false; this.startListening(); }
    },

    clearWatchdogs() {
      clearTimeout(this._startWatch);
      clearTimeout(this._stopWatch);
    },

    // ----- 系统语音 -----
    startListening() {
      this._aborted = false;
      this._speechError = null;
      this._gotStart = false;
      this._submitOnEnd = false;
      this._baseText = this.textEl.value.trim();
      this.setState('listening');
      this.clearWatchdogs();
      // 看门狗：系统语音 3 秒内没反应，就当它不可用，退回打字
      this._startWatch = setTimeout(() => {
        if (this.state === 'listening' && !this._gotStart) {
          this.speechBroken = true;
          this.abortListening();
          if (this.voiceBtn) this.voiceBtn.classList.add('hidden');
          this.toTyping('这台手机的系统语音没反应。点输入框，用输入法键盘上的🎤说话');
        }
      }, 3000);

      if (Native.speechAvailable()) {
        try { root.TrainFitNative.startListening(); } catch (e) { this.onSpeech('error', 'START_FAILED'); this.onSpeech('end', ''); }
        return;
      }
      const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
      if (!SR) { this.onSpeech('error', 'NOT_AVAILABLE'); this.onSpeech('end', ''); return; }
      const rec = new SR();
      rec.lang = 'zh-CN';
      rec.continuous = true;
      rec.interimResults = true;
      let finalText = '';
      rec.onstart = () => this.onSpeech('start', '');
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
          else interim += ev.results[i][0].transcript;
        }
        this.onSpeech('partial', finalText + interim);
      };
      rec.onerror = (ev) => { if (!finalText) this.onSpeech('error', ev.error || 'ERROR'); };
      rec.onend = () => { this._webRec = null; this.onSpeech('final', finalText); this.onSpeech('end', ''); };
      this._webRec = rec;
      try { rec.start(); } catch (e) { this.onSpeech('error', 'START_FAILED'); this.onSpeech('end', ''); }
    },

    /** @param submit 拿到最终文字后是否直接提交 */
    stopListening(submit) {
      if (this.state !== 'listening') { if (submit) this.submit(this.textEl.value); return; }
      this._submitOnEnd = !!submit;
      this.statusEl.textContent = '识别收尾中…';
      clearTimeout(this._startWatch);
      if (Native.speechAvailable()) {
        try { root.TrainFitNative.stopListening(); } catch (e) {}
      } else if (this._webRec) {
        try { this._webRec.stop(); } catch (e) {}
      }
      // 看门狗：3 秒还没收尾，就用已经识别到的文字
      clearTimeout(this._stopWatch);
      this._stopWatch = setTimeout(() => {
        if (this.state === 'listening') {
          this.abortListening();
          this.finishSpeech();
        }
      }, 3000);
    },

    abortListening() {
      this._aborted = true;
      this.clearWatchdogs();
      if (Native.has()) { try { root.TrainFitNative.cancelListening(); } catch (e) {} }
      if (this._webRec) { try { this._webRec.abort(); } catch (e) {} this._webRec = null; }
    },

    setSpeechText(text) {
      this._programmatic = true;
      this.textEl.value = [this._baseText, (text || '').trim()].filter(Boolean).join('，');
      this._programmatic = false;
    },

    onSpeech(type, text) {
      if (type === 'start') { this._gotStart = true; clearTimeout(this._startWatch); return; }
      if (this._aborted || this.state !== 'listening') return;
      if (type === 'partial') {
        this._gotStart = true;
        clearTimeout(this._startWatch);
        this.setSpeechText(text);
      } else if (type === 'final') {
        if (text) this.setSpeechText(text);
      } else if (type === 'error') {
        this._speechError = text;
      } else if (type === 'end') {
        this.clearWatchdogs();
        this.finishSpeech();
      }
    },

    finishSpeech() {
      const said = this.textEl.value.trim();
      const submit = this._submitOnEnd;
      const err = this._speechError;
      this.toTyping('');
      if (said && submit) { this.submit(said); return; }
      if (said) { this.statusEl.textContent = '可以改一改，然后点「记下来」'; return; }
      if (err === 'PERMISSION_DENIED') this.statusEl.textContent = '没有麦克风权限。可以去系统设置里打开，或者直接打字';
      else if (err === 'NOT_AVAILABLE' || err === 'START_FAILED') {
        this.speechBroken = true;
        if (this.voiceBtn) this.voiceBtn.classList.add('hidden');
        this.statusEl.textContent = '这台手机没有系统语音识别。点输入框，用输入法键盘上的🎤说话';
      }
      else if (err === 'NETWORK') this.statusEl.textContent = '系统语音需要联网，或者点输入框用输入法的🎤';
      else this.statusEl.textContent = '没听清。再试一次，或者点输入框打字 / 用输入法的🎤';
    },

    // ----- 解析 + 保存（后台进行，不用等） -----
    submit(text) {
      text = (text || '').trim();
      if (!text) { this.statusEl.textContent = '先说点什么，或者打几个字'; return; }
      const app = root.app;
      this.close(false);
      const p = app.addPending(text);
      this.process(p);
    },

    async process(p) {
      const app = root.app;
      const ctx = {
        now: new Date(p.ts || Date.now()),
        history: app.workouts,
        knownExercises: Array.from(new Set(app.workouts.map(w => w.exerciseName)))
      };
      let result;
      try {
        result = await Parser.parse(p.text, ctx);
      } catch (e) {
        app.failPending(p.id, '整理出错了');
        return;
      }
      if (!app.pending.some(x => x.id === p.id)) return; // 已被用户删掉
      if (!result.workouts.length && !result.meals.length) {
        app.failPending(p.id, result.source === 'local' ? 'AI 没连上，也没认出内容' : '没认出训练或饮食');
        return;
      }
      app.finishPending(p.id);
      const batch = this.save(result, p.date);
      this.showSnack(batch, result);
    },

    save(result, baseDate) {
      const app = root.app;
      const base = baseDate || app.selectedDate || getTodayDateString();
      const date = result.dayOffset ? shiftDateString(base, result.dayOffset) : base;
      const stamp = Date.now();
      const batch = { workoutIds: [], dietIds: [], date };

      result.workouts.forEach((w, i) => {
        const id = 'w_' + stamp + '_' + i;
        batch.workoutIds.push(id);
        app.workouts.unshift({
          id,
          ts: stamp + i,
          date,
          exerciseName: w.exerciseName,
          muscleGroup: w.muscleGroup,
          sets: w.sets,
          reps: w.reps,
          weightKg: w.weightKg,
          durationMin: w.durationMin || undefined,
          rpe: 8.0,
          burnedCalories: w.burnedCalories,
          notes: w.estimated ? '一键记录（部分参数按上次/默认值估计）' : '一键记录'
        });
      });

      result.meals.forEach((m, i) => {
        const id = 'd_' + stamp + '_' + i;
        batch.dietIds.push(id);
        app.diet.unshift({
          id,
          // 同一次说的几顿饭按 早→午→晚→加餐 排时间，列表里倒序显示更自然
          ts: stamp + 50 + Math.max(0, ['早餐', '午餐', '晚餐', '加餐/补剂'].indexOf(m.mealType)) * 2 + i,
          date,
          mealType: m.mealType,
          foodSummary: m.foodSummary,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG
        });
      });

      app.saveData();
      app.render();
      return batch;
    },

    describe(result) {
      const lines = [];
      result.workouts.forEach(w => {
        if (w.durationMin) lines.push(`有氧 · ${w.exerciseName} ${w.durationMin} 分钟`);
        else lines.push(`训练 · ${w.exerciseName} ${w.weightKg > 0 ? w.weightKg + 'kg' : '自重'} ${w.sets}×${w.reps}${w.estimated ? '（估）' : ''}`);
      });
      result.meals.forEach(m => lines.push(`${m.mealType.replace('/补剂', '')} · ${m.foodSummary} ${m.calories} kcal`));
      return lines;
    },

    showSnack(batch, result) {
      const app = root.app;
      const n = result.workouts.length + result.meals.length;
      let t = `✓ 已记下 ${n} 条`;
      if (batch.date !== getTodayDateString()) t += `（${batch.date.slice(5).replace('-', '月')}日）`;
      if (result.source === 'local') t += ' · AI 没连上，用的简单规则';
      this.showUndo(t, this.describe(result), () => {
        app.workouts = app.workouts.filter(w => !batch.workoutIds.includes(w.id));
        app.diet = app.diet.filter(d => !batch.dietIds.includes(d.id));
        app.saveData();
        app.render();
      });
    },

    /** 通用：底部提示 + 撤销 */
    showUndo(title, lines, undoFn) {
      document.getElementById('ql-snack-title').textContent = title;
      const list = document.getElementById('ql-snack-list');
      list.innerHTML = '';
      (lines || []).forEach(line => {
        const li = document.createElement('div');
        li.className = 'ql-snack-line';
        li.textContent = line;
        list.appendChild(li);
      });
      this._undoFn = undoFn;
      this.snack.classList.remove('hidden');
      clearTimeout(this._snackTimer);
      this._snackTimer = setTimeout(() => this.hideSnack(), 6000);
    },

    undo() {
      const fn = this._undoFn;
      this._undoFn = null;
      this.hideSnack();
      if (fn) { fn(); root.app && root.app.showToast('已撤销'); }
    },

    hideSnack() {
      clearTimeout(this._snackTimer);
      this.snack.classList.add('hidden');
    },

    // ----- 设置：AI 接口 -----
    initSettings() {
      const baseEl = document.getElementById('ql-cfg-base');
      const modelEl = document.getElementById('ql-cfg-model');
      const keyEl = document.getElementById('ql-cfg-key');
      const hint = document.getElementById('ql-cfg-hint');
      const saveBtn = document.getElementById('ql-cfg-save');
      const testBtn = document.getElementById('ql-cfg-test');
      if (!baseEl || !saveBtn) return;

      const o = readOverride();
      baseEl.value = o.baseUrl;
      modelEl.value = o.model;
      keyEl.value = o.apiKey;

      const info = Native.llmInfo();
      if (info) {
        baseEl.placeholder = info.baseUrl || 'https://…/v1';
        modelEl.placeholder = info.model || '模型名';
        keyEl.placeholder = info.hasKey ? '已内置，留空即可' : '还没有内置 key，请填写';
        hint.textContent = info.hasKey ? '安装包里已经带了接口配置，一般不用填。填了会覆盖内置的。' : '安装包里没有内置 key，填上才能用 AI 解析；不填就只能用简单规则。';
      } else {
        hint.textContent = '浏览器里调试用：填 OpenAI 兼容接口（部分服务商不允许浏览器跨域调用）。';
      }

      saveBtn.addEventListener('click', () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        root.app && root.app.showToast('✓ AI 接口设置已保存');
      });

      testBtn.addEventListener('click', async () => {
        writeOverride({ baseUrl: baseEl.value, model: modelEl.value, apiKey: keyEl.value });
        testBtn.disabled = true;
        testBtn.textContent = '测试中…';
        try {
          const r = await Parser.viaLlm('卧推60公斤3组10个，中午吃了一碗牛肉面', { now: new Date(), history: [] });
          const n = r.workouts.length + r.meals.length;
          root.app && root.app.showToast(n ? `✓ 接口正常，识别出 ${n} 项` : '接口通了，但没识别出内容');
        } catch (e) {
          const msg = (e && e.message) || '';
          root.app && root.app.showToast(msg === 'NO_KEY' ? '还没有 API key' : ('✗ 连接失败：' + msg.slice(0, 60)));
        } finally {
          testBtn.disabled = false;
          testBtn.textContent = '测试连接';
        }
      });
    }
  };

  root.QuickLog = QuickLog;
  root.QuickLogParser = Parser;

  if (typeof document !== 'undefined') {
    const boot = () => setTimeout(() => QuickLog.init(), 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { QuickLogParser: Parser, Native };
  }
})(typeof window !== 'undefined' ? window : globalThis);
