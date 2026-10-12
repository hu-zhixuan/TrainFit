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

    /** 按住说话 / 点开键盘时先连上大模型接口（原生那边一分钟最多连一次），松手后整理不用再等握手 */
    warm() {
      try {
        if (!this.has() || !root.TrainFitNative.warmLlm) return;
        const ov = readOverride();
        // 两条线路都先连上：慢了补发、出错换线时也不用再握手
        LlmRoute.order(ov).forEach(id => root.TrainFitNative.warmLlm(JSON.stringify(LlmRoute.overrideFor(id, ov))));
      } catch (e) {}
    },

    llmInfo() {
      try { return this.has() ? JSON.parse(root.TrainFitNative.getLlmInfo()) : null; } catch (e) { return null; }
    },

    /**
     * onDelta：有的话走流式（原生 llmChatStream，边出字边回调 window.__tfLlmDelta），最后照样回调完整结果。
     * Atria 多数 2～6 秒出第一个字，偶尔 15～18 秒（v5.4 实测）：流式时只要还在出字就不算超时
     * handle：挂上 cancel()——补发的那份先出了字，这份就掐掉（原生那边断开连接，不再等、不再花 token）
     */
    chat(body, override, timeoutMs, onDelta, handle) {
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
        if (handle) {
          handle.cancel = () => {
            if (!this._pending[id]) return;
            try { if (root.TrainFitNative.llmCancel) root.TrainFitNative.llmCancel(id); } catch (e) {}
            expire('CANCELLED');
          };
        }
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

  // ---------------------------------------------------------------------------
  // 两条线路（v12）：主线路 = Atria（或设置里自己填的接口），备用 = 打包时带的 DeepSeek。
  // 先走哪条：设置里「AI 线路」——自动（默认：先走主线路；这台手机上实测另一条快得多、或者主线路刚连着出错，就先走另一条）/ 主线路优先 / 备用优先。
  // 慢了补发、出错换线都在 parser.js 的 sendHedged 里。
  // ---------------------------------------------------------------------------
  const ROUTE_KEY = 'tf_llm_route';
  const STATS_KEY = 'tf_llm_stats';
  const LlmRoute = {
    NAMES: { main: '主线路', backup: '备用' },
    mode() {
      try { const m = root.localStorage.getItem(ROUTE_KEY); return m === 'main' || m === 'backup' ? m : 'auto'; } catch (e) { return 'auto'; }
    },
    setMode(m) { try { root.localStorage.setItem(ROUTE_KEY, m === 'main' || m === 'backup' ? m : 'auto'); } catch (e) {} },
    _read() {
      try { const o = JSON.parse(root.localStorage.getItem(STATS_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
    },
    /** 记一次：ok 时 ms 是从发出到写完的时间；失败记时间点。每条线路只留最近 8 次 */
    note(id, ok, ms) {
      try {
        const all = this._read();
        const list = (all[id] || []).concat([{ ok: !!ok, ms: Math.round(ms || 0), at: Date.now() }]).slice(-8);
        all[id] = list;
        root.localStorage.setItem(STATS_KEY, JSON.stringify(all));
      } catch (e) {}
    },
    /** 最近几次写完的中位数（7 天内、至少 3 次才算），没有就 null */
    median(id, now) {
      const t = now || Date.now();
      const ms = (this._read()[id] || []).filter(x => x.ok && t - x.at < 7 * 86400000).map(x => x.ms).sort((a, b) => a - b);
      return ms.length >= 3 ? ms[Math.floor(ms.length / 2)] : null;
    },
    recentFails(id, now) {
      const t = now || Date.now();
      return (this._read()[id] || []).filter(x => !x.ok && t - x.at < 10 * 60000).length;
    },
    /** 哪些线路能用（主线路：设置里填了 key、或者安装包带了 key；备用：安装包带了 key）。至少返回主线路，没 key 时让它报 NO_KEY */
    available(override) {
      const info = Native.llmInfo();
      const out = [];
      const custom = !!(override && override.apiKey);
      if (custom || !info || info.hasKey) out.push('main');
      if (info && info.backup && info.backup.hasKey) out.push('backup');
      if (!out.length) out.push('main');
      return out;
    },
    /** 这次的先后顺序 */
    order(override, now) {
      const ids = this.available(override);
      if (ids.length < 2) return ids;
      const m = this.mode();
      if (m === 'backup') return ['backup', 'main'];
      if (m === 'main') return ['main', 'backup'];
      const fm = this.recentFails('main', now), fb = this.recentFails('backup', now);
      if (fm >= 2 && fb === 0) return ['backup', 'main'];
      if (fb >= 2 && fm === 0) return ['main', 'backup'];
      const a = this.median('main', now), b = this.median('backup', now);
      if (a && b && b < a * 0.75) return ['backup', 'main'];
      return ['main', 'backup'];
    },
    /** 这条线路用的 override：备用只写 provider，别的不看 */
    overrideFor(id, override) {
      return id === 'backup' ? { provider: 'backup' } : (override || {});
    },
    info() {
      const i = Native.llmInfo();
      if (!i) return null;
      return { main: { model: i.model, hasKey: !!i.hasKey }, backup: i.backup ? { model: i.backup.model, hasKey: !!i.backup.hasKey } : null };
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

  Object.assign(TF, { readOverride, writeOverride, readAsrOverride, writeAsrOverride, Native, LlmRoute, Haptics });

  if (typeof module !== 'undefined' && module.exports) module.exports = TF;
})(typeof window !== 'undefined' ? window : globalThis);
