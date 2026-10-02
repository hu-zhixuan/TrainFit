/**
 * 和安卓 App 打交道：window.TrainFitNative 的包装（调大模型、语音识别信息）、震动反馈，
 * 以及设置里「AI 接口」「语音识别」的自定义地址和 key（存在 localStorage）。
 * 不在 App 里（浏览器调试）时，这些都会安全地退化。
 */
(function (root) {
  'use strict';
  if (typeof module !== 'undefined' && typeof require === 'function') {
    require('./helpers.js');
  }
  const TF = root.TF = root.TF || {};

  const OVERRIDE_KEY = 'tf_llm_override';

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

  const ASR_KEY = 'tf_asr_override';
  function readAsrOverride() {
    try {
      const o = JSON.parse((root.localStorage && root.localStorage.getItem(ASR_KEY)) || '{}');
      return { baseUrl: (o.baseUrl || '').trim(), model: (o.model || '').trim(), apiKey: (o.apiKey || '').trim() };
    } catch (e) { return { baseUrl: '', model: '', apiKey: '' }; }
  }
  function writeAsrOverride(o) {
    try { root.localStorage.setItem(ASR_KEY, JSON.stringify({ baseUrl: (o.baseUrl || '').trim(), model: (o.model || '').trim(), apiKey: (o.apiKey || '').trim() })); } catch (e) {}
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

    asrAvailable() {
      try { return this.has() && !!root.TrainFitNative.isAsrConfigured && !!root.TrainFitNative.isAsrConfigured(JSON.stringify(readAsrOverride())); } catch (e) { return false; }
    },

    asrInfo() {
      try { return this.has() && root.TrainFitNative.getAsrInfo ? JSON.parse(root.TrainFitNative.getAsrInfo()) : null; } catch (e) { return null; }
    },

    llmInfo() {
      try { return this.has() ? JSON.parse(root.TrainFitNative.getLlmInfo()) : null; } catch (e) { return null; }
    },

    /**
     * onDelta：有的话走流式（原生 llmChatStream，边出字边回调 window.__tfLlmDelta），最后照样回调完整结果。
     * Atria 实测要等 10～25 秒才出第一个字：流式时只要还在出字就不算超时
     */
    chat(body, override, timeoutMs, onDelta) {
      const stream = !!(onDelta && root.TrainFitNative.llmChatStream);
      return new Promise((resolve, reject) => {
        const id = 'r' + (++this._seq) + '_' + Date.now();
        const expire = (why) => {
          clearTimeout(p.timer);
          clearTimeout(p.hard);
          delete this._pending[id];
          reject(new Error(why || 'TIMEOUT'));
        };
        const limit = timeoutMs || 75000; // 原生那边连接 15 秒 + 读取 60 秒
        // 一直在出字也有个头：大模型偶尔停不下来（一直出字，上面的计时一直被重置），「正在整理」就永远转下去
        const p = { resolve, reject, timer: setTimeout(expire, limit), hard: setTimeout(() => expire('TOO_LONG'), this.hardMs || 150000) };
        if (stream) p.onDelta = (chunk) => { clearTimeout(p.timer); p.timer = setTimeout(expire, limit); onDelta(chunk); };
        this._pending[id] = p;
        try {
          if (stream) root.TrainFitNative.llmChatStream(id, JSON.stringify(Object.assign({}, body, { stream: true })), JSON.stringify(override || {}));
          else root.TrainFitNative.llmChat(id, JSON.stringify(body), JSON.stringify(override || {}));
        } catch (e) {
          clearTimeout(p.timer);
          clearTimeout(p.hard);
          delete this._pending[id];
          reject(e);
        }
      });
    },

    _onDelta(id, chunk) {
      const p = this._pending[id];
      if (p && p.onDelta) { try { p.onDelta(chunk); } catch (e) {} }
    },

    _onLlm(id, ok, payload) {
      const p = this._pending[id];
      if (!p) return;
      clearTimeout(p.timer);
      clearTimeout(p.hard);
      delete this._pending[id];
      if (ok) p.resolve(payload); else p.reject(new Error(payload || 'LLM_ERROR'));
    }
  };

  root.__tfLlm = function (id, ok, payload) { Native._onLlm(id, ok, payload); };
  root.__tfLlmDelta = function (id, chunk) { Native._onDelta(id, chunk); };

  /** 震动反馈：tick 轻 / tap 点击 / start 重击 / stop 点击 / success 双击 / error 三连 */
  const Haptics = {
    on() { try { return root.localStorage.getItem('tf_haptics') !== 'off'; } catch (e) { return true; } },
    fire(kind) {
      if (!this.on()) return;
      try {
        if (Native.has() && root.TrainFitNative.haptic) { root.TrainFitNative.haptic(kind); return; }
        if (root.navigator && root.navigator.vibrate) {
          root.navigator.vibrate({ tick: 8, tap: 15, start: 30, stop: 15, success: [20, 60, 20], error: [40, 60, 40, 60, 40] }[kind] || 15);
        }
      } catch (e) {}
    }
  };
  root.Haptics = Haptics;

  Object.assign(TF, { readOverride, writeOverride, readAsrOverride, writeAsrOverride, Native, Haptics });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
