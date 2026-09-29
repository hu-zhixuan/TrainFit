/**
 * 练食AI · 懒人一键记录：底部「按住说话」按钮。
 *
 * 按住说、松手结束（也可以点一下开始、再点一下结束），上滑取消；也可以切到打字。
 * 语音优先用 App 里的本机识别（sherpa-onnx），其次云端识别，再其次手机系统识别。
 * 说完的文字交给 pipeline.js 在后台整理、保存。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  const { readAsrOverride, Native, Haptics } = TF;

  // ---------------------------------------------------------------------------
  // 界面
  // ---------------------------------------------------------------------------
  const QuickLog = {
    state: 'idle',          // idle | recording | transcribing
    engine: null,           // asr（自己录音 + 语音转文字）| system（手机系统识别，边说边出字）
    speechBroken: false,
    _snackTimer: null,

    init() {
      const $ = (id) => document.getElementById(id);
      this.composer = $('composer');
      this.talkBtn = $('talk-btn');
      this.talkLabel = $('talk-label');
      this.voiceRow = $('voice-row');
      this.textRow = $('text-row');
      this.textEl = $('cmp-text');
      this.sendBtn = $('cmp-send');
      this.statusEl = $('cmp-status');
      this.panel = $('rec-panel');
      this.snack = $('ql-snackbar');
      if (!this.talkBtn) return;

      this.bindTalk();
      $('cmp-kbd').addEventListener('click', () => this.setMode('text', true));
      $('cmp-voice').addEventListener('click', () => this.setMode('voice'));
      this.sendBtn.addEventListener('click', () => this.sendText());
      document.getElementById('ql-undo')?.addEventListener('click', () => this.undo());
      this.textEl.addEventListener('input', () => { this.autoGrow(); this.updateSend(); });
      this.textEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.sendText(); }
      });

      const syncHeight = () => document.documentElement.style.setProperty('--cmp-h', this.composer.offsetHeight + 'px');
      if (root.ResizeObserver) new ResizeObserver(syncHeight).observe(this.composer);
      syncHeight();

      let mode = 'voice';
      try { mode = root.localStorage.getItem('tf_input_mode') || 'voice'; } catch (e) {}
      this.setMode(this.canTalk() ? mode : 'text');

      this.initSettings();
      root.__tfSpeech = (type, text) => this.onSpeech(type, text);
      root.__tfRec = (type, value) => this.onRec(type, value);
      root.__tfAsr = (id, ok, text) => this.onAsr(id, ok, text);
    },

    // ----- 能不能说话 -----
    speechSupported() {
      if (this.speechBroken) return false;
      if (Native.has()) return Native.speechAvailable();
      return !!(root.SpeechRecognition || root.webkitSpeechRecognition);
    },
    pickEngine() {
      if (Native.asrAvailable()) return 'asr';
      if (this.speechSupported()) return 'system';
      return null;
    },
    canTalk() { return !!this.pickEngine(); },

    setMode(mode, focus) {
      this.mode = mode === 'text' ? 'text' : 'voice';
      try { root.localStorage.setItem('tf_input_mode', this.mode); } catch (e) {}
      this.voiceRow.classList.toggle('hidden', this.mode !== 'voice');
      this.textRow.classList.toggle('hidden', this.mode !== 'text');
      this.setStatus('');
      if (this.mode === 'text') {
        this.autoGrow();
        this.updateSend();
        if (focus) this.textEl.focus();
      }
    },

    autoGrow() {
      const el = this.textEl;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 132) + 'px';
    },
    updateSend() { this.sendBtn.disabled = !this.textEl.value.trim(); },

    setStatus(text, kind) {
      this.statusEl.textContent = text || '';
      this.statusEl.className = 'cmp-status' + (text ? '' : ' hidden') + (kind ? ' ' + kind : '');
    },

    sendText() {
      const text = this.textEl.value.trim();
      if (!text) { this.textEl.focus(); return; }
      this.textEl.value = '';
      this.autoGrow();
      this.updateSend();
      this.textEl.blur();
      this.submit(text);
    },

    /** 失败的记录「改字」：放回输入框 */
    openWithText(text) {
      if (root.app && root.app.view !== 'today') root.app.switchView('today');
      this.setMode('text');
      this.textEl.value = text || '';
      this.autoGrow();
      this.updateSend();
      this.setStatus('改一改，再点右边发送');
      this.textEl.focus();
    },

    // ----- 一个按钮：按住说、松手结束；或点一下开始、再点一下结束 -----
    bindTalk() {
      const btn = this.talkBtn;
      let downAt = 0, startY = 0, pressing = false, stopOnUp = false;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pressing = true;
        startY = e.clientY || 0;
        downAt = Date.now();
        if (this.state === 'recording') { stopOnUp = true; return; } // 点按模式下的第二次点击
        if (this.state !== 'idle') { pressing = false; return; }
        stopOnUp = false;
        this.startTalk();
      });
      root.addEventListener('pointermove', (e) => {
        if (!pressing || this.state !== 'recording' || this.tapMode) return;
        const cancel = startY - (e.clientY || 0) > 70;
        if (cancel !== this.panel.classList.contains('canceling')) Haptics.fire('tick');
        this.panel.classList.toggle('canceling', cancel);
        document.getElementById('rec-hint').textContent = cancel ? '松开手指，取消这次' : '松手结束 · 上滑取消';
      });
      const up = (e) => {
        if (!pressing) return;
        pressing = false;
        if (this.state !== 'recording') return;
        if (stopOnUp) { this.stopTalk(true); return; }
        if (Date.now() - downAt < 350) {
          // 很快松开：当作「点一下开始」，再点一下结束
          this.tapMode = true;
          this.talkLabel.textContent = '点一下结束';
          document.getElementById('rec-hint').textContent = '说完点一下按钮结束';
          return;
        }
        const cancel = startY - ((e && e.clientY) || 0) > 70;
        this.panel.classList.remove('canceling');
        if (cancel) this.cancelTalk('已取消'); else this.stopTalk(true);
      };
      root.addEventListener('pointerup', up);
      root.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    },

    startTalk() {
      const engine = this.pickEngine();
      if (!engine) {
        this.setMode('text', true);
        this.setStatus('这台手机没有语音识别，打字或者用键盘上的 🎤', 'warn');
        return;
      }
      this.engine = engine;
      this.tapMode = false;
      this.state = 'recording';
      Haptics.fire('start');
      this.recStart = Date.now();
      this.liveText = '';
      this._levels = [];
      this.composer.classList.add('recording');
      this.panel.classList.remove('hidden', 'canceling');
      document.getElementById('rec-live').textContent = '';
      document.getElementById('rec-hint').textContent = '松手结束 · 上滑取消';
      this.talkLabel.textContent = '松手结束';
      this.setStatus('');
      clearInterval(this._timer);
      this._timer = setInterval(() => this.tick(), 250);
      this.tick();
      if (engine === 'asr') {
        try { root.TrainFitNative.startRecording(); } catch (e) { this.failTalk('录音启动失败'); }
      } else {
        this.startSystem();
      }
    },

    tick() {
      const s = Math.floor((Date.now() - this.recStart) / 1000);
      document.getElementById('rec-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (this.engine === 'system') {
        // 系统识别没有音量，做个轻微的呼吸动效
        this.setLevel(0.15 + 0.25 * Math.abs(Math.sin(Date.now() / 260)));
      }
    },

    /** 滚动波形：保存最近的音量，从右往左画成竖条（参考微信语音、iOS 语音备忘录） */
    setLevel(v) {
      if (!this._levels) this._levels = [];
      this._levels.push(Math.max(0, Math.min(1, v)));
      if (this._levels.length > 120) this._levels.shift();
      this.drawWave();
    },

    drawWave() {
      const c = document.getElementById('rec-wave');
      if (!c) return;
      const dpr = root.devicePixelRatio || 1;
      const w = c.clientWidth, h = c.clientHeight;
      if (!w || !h) return;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const color = getComputedStyle(c).color || '#e05a4f';
      const barW = 3, gap = 2, step = barW + gap;
      const n = Math.floor(w / step);
      const lv = this._levels || [];
      for (let i = 0; i < n; i++) {
        const v = lv[lv.length - n + i];
        const amp = v == null ? 0 : Math.pow(v, 0.7);             // 小声也看得见
        const bh = Math.max(3, amp * (h - 4));
        const x = i * step;
        ctx.globalAlpha = v == null ? 0.25 : 0.35 + 0.65 * (i / n); // 越新越亮
        ctx.fillStyle = color;
        const y = (h - bh) / 2;
        const r = Math.min(barW / 2, bh / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, r); else ctx.rect(x, y, barW, bh);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },

    resetTalkUi() {
      clearInterval(this._timer);
      this.composer.classList.remove('recording', 'busy');
      this.panel.classList.add('hidden');
      this.panel.classList.remove('canceling');
      this.talkLabel.textContent = '按住说话';
      this.tapMode = false;
    },

    cancelTalk(msg) {
      Haptics.fire('tick');
      if (this.engine === 'asr') { try { root.TrainFitNative.cancelRecording(); } catch (e) {} }
      else this.cancelSystem();
      this.state = 'idle';
      this.resetTalkUi();
      this.setStatus(msg || '');
    },

    failTalk(msg) {
      Haptics.fire('error');
      this.state = 'idle';
      this.resetTalkUi();
      this.setStatus(msg, 'warn');
    },

    stopTalk() {
      if (this.state !== 'recording') return;
      this.state = 'transcribing';
      Haptics.fire('stop');
      clearInterval(this._timer);
      this.panel.classList.add('hidden');
      this.composer.classList.remove('recording');
      this.composer.classList.add('busy');
      this.talkLabel.textContent = '识别中…';
      if (this.engine === 'asr') {
        this._asrId = 'a' + Date.now();
        try { root.TrainFitNative.stopRecording(this._asrId, JSON.stringify(readAsrOverride())); } catch (e) { this.onAsr(this._asrId, false, 'STOP_FAILED'); }
        clearTimeout(this._asrWatch);
        this._asrWatch = setTimeout(() => { if (this.state === 'transcribing') this.onAsr(this._asrId, false, 'TIMEOUT'); }, 35000);
      } else {
        this.stopSystem();
      }
    },

    /** 拿到最终文字：交给大模型 */
    finishTalk(text) {
      this.state = 'idle';
      this.resetTalkUi();
      text = (text || '').trim();
      if (!text) { this.setStatus('没听到内容，再按住说一次', 'warn'); return; }
      this.setStatus('');
      this.submit(text);
    },

    // ----- 自己录音 + 语音转文字 -----
    onRec(type, value) {
      if (type === 'level') { if (this.state === 'recording') this.setLevel(Number(value) || 0); return; }
      if (type === 'partial') {
        // 本机识别：边说边出字
        if (this.state === 'recording' || this.state === 'transcribing') {
          this.liveText = value || '';
          document.getElementById('rec-live').textContent = this.liveText;
        }
        return;
      }
      if (type === 'max') { if (this.state === 'recording') this.stopTalk(); return; }
      if (type === 'error') {
        if (this.state !== 'recording') return;
        if (value === 'PERMISSION_JUST_GRANTED') this.failTalk('已允许使用麦克风，再按住说一次');
        else if (value === 'PERMISSION_DENIED') this.failTalk('没有麦克风权限，去系统设置里打开，或者点左边改成打字');
        else this.failTalk('录音没启动成功，再试一次');
      }
    },

    onAsr(id, ok, text) {
      if (id !== this._asrId || this.state !== 'transcribing') return;
      clearTimeout(this._asrWatch);
      if (ok) { this.finishTalk(text); return; }
      Haptics.fire('error');
      this.state = 'idle';
      this.resetTalkUi();
      const msg = String(text || '');
      if (msg === 'TOO_SHORT' || msg === 'NO_SPEECH') this.setStatus('没听到说话，按住再说一次', 'warn');
      else if (msg === 'LOCAL_NOT_READY') this.setStatus('识别模型还在加载，稍等一两秒再说', 'warn');
      else if (msg === 'NO_KEY') this.setStatus('还没有语音识别 key，去设置里填', 'warn');
      else if (/^HTTP 401|^HTTP 403/.test(msg)) this.setStatus('语音识别 key 不对，去设置里检查', 'warn');
      else this.setStatus('识别失败（网络不好？）再说一次，或点左边改成打字', 'warn');
    },

    // ----- 手机系统识别（没有语音识别 key 时用）：一直听到你松手 -----
    startSystem() {
      this._aborted = false;
      this._gotStart = false;
      this._speechError = null;
      this.clearWatchdogs();
      this._startWatch = setTimeout(() => {
        if (this.state === 'recording' && !this._gotStart) {
          this.speechBroken = true;
          this.cancelSystem();
          this.state = 'idle';
          this.resetTalkUi();
          this.setMode('text', false);
          this.setStatus('这台手机的系统语音没反应。可以打字，或在设置里填语音识别 key', 'warn');
        }
      }, 3000);
      if (Native.has()) {
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

    stopSystem() {
      clearTimeout(this._startWatch);
      if (Native.has()) { try { root.TrainFitNative.stopListening(); } catch (e) {} }
      else if (this._webRec) { try { this._webRec.stop(); } catch (e) {} }
      clearTimeout(this._stopWatch);
      this._stopWatch = setTimeout(() => {
        if (this.state === 'transcribing' && this.engine === 'system') { this.cancelSystem(); this.finishTalk(this.liveText); }
      }, 3000);
    },

    cancelSystem() {
      this._aborted = true;
      this.clearWatchdogs();
      if (Native.has()) { try { root.TrainFitNative.cancelListening(); } catch (e) {} }
      if (this._webRec) { try { this._webRec.abort(); } catch (e) {} this._webRec = null; }
    },

    clearWatchdogs() {
      clearTimeout(this._startWatch);
      clearTimeout(this._stopWatch);
    },

    onSpeech(type, text) {
      if (type === 'start') { this._gotStart = true; clearTimeout(this._startWatch); return; }
      if (this._aborted || this.engine !== 'system') return;
      if (this.state !== 'recording' && this.state !== 'transcribing') return;
      if (type === 'partial' || type === 'final') {
        if (type === 'partial') { this._gotStart = true; clearTimeout(this._startWatch); }
        if (text) {
          this.liveText = text.trim();
          document.getElementById('rec-live').textContent = this.liveText;
        }
      } else if (type === 'error') {
        this._speechError = text;
      } else if (type === 'end') {
        this.clearWatchdogs();
        if (this.state === 'recording' && !this.liveText) {
          const err = this._speechError;
          this.state = 'idle';
          this.resetTalkUi();
          if (err === 'PERMISSION_DENIED') this.setStatus('没有麦克风权限，去系统设置里打开', 'warn');
          else { this.speechBroken = true; this.setMode('text'); this.setStatus('系统语音用不了。可以打字，或在设置里填语音识别 key', 'warn'); }
          return;
        }
        if (this.state === 'transcribing') this.finishTalk(this.liveText);
      }
    }
  };

  Object.assign(TF, { QuickLog });

  root.QuickLog = QuickLog;
  root.QuickLogParser = TF.Parser;

  if (typeof document !== 'undefined') {
    // 等所有脚本（包括 pipeline.js、api_settings.js 往 QuickLog 上加的方法）都加载完再初始化
    const boot = () => setTimeout(() => QuickLog.init(), 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
