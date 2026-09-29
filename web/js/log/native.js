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
