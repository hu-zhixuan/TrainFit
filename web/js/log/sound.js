/**
 * 音效：用 Web Audio 现场合成，不放音频文件。都很短、很轻，像系统的提示音。
 *   start 按住开始说话（轻轻上扬）   stop 松手（轻轻落下）
 *   success 记好了（两声小铃）       undo 撤销    error 没听清 / 没整理好
 *   blip 点小人（8-bit 哔哔）        unlock 连续记录拿到新装备（8-bit 小琶音）
 *   babble(text) 小人主动说话时一个字一声的对话音
 *   剧场（v8.0）：pop 来消息、tick 节拍、heart 心跳、door 关门、whistle 哨子、phone 电话铃、clang 铁片、swoosh 进出剧场、land 小人落地；amb(rain / pool / crowd / night) 环境声
 * 设置里能关（localStorage tf_sound = off）；手机静音 / 震动模式时不响（问原生 soundAllowed）。
 * WebView 要在用户点屏幕时才让出声：第一次点屏幕时 warm() 一下，之后异步的「记好了」也能响。
 */
(function (root) {
  'use strict';
  const TF = root.TF = root.TF || {};
  let ctx = null;
  let out = null;

  function audio() {
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      // 总音量 + 低通，8-bit 方波也不刺耳
      const master = ctx.createGain();
      master.gain.value = 3.2;
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 4200;
      master.connect(soft).connect(ctx.destination);
      out = master;
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  /** 一个音：频率 f（可以滑到 f2），时长 dur 秒，音量 gain */
  function tone(c, t, o) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const attack = o.attack || 0.006;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + o.dur + 0.03);
  }

  /** 铃声：基音 + 两个很轻的泛音，尾音长一点 */
  function bell(c, t, f, dur, gain) {
    tone(c, t, { f, dur, gain });
    tone(c, t, { f: f * 2.01, dur: dur * 0.55, gain: gain * 0.22 });
    tone(c, t, { f: f * 3.03, dur: dur * 0.3, gain: gain * 0.08 });
  }

  const SOUNDS = {
    start: (c, t) => tone(c, t, { f: 520, f2: 780, dur: 0.06, gain: 0.07 }),
    stop: (c, t) => tone(c, t, { f: 780, f2: 540, dur: 0.08, gain: 0.06 }),
    success: (c, t) => { bell(c, t, 1046.5, 0.42, 0.085); bell(c, t + 0.085, 1568, 0.6, 0.075); },
    undo: (c, t) => tone(c, t, { f: 620, f2: 430, dur: 0.12, gain: 0.06, type: 'triangle' }),
    error: (c, t) => { tone(c, t, { f: 330, dur: 0.13, gain: 0.07, type: 'triangle' }); tone(c, t + 0.12, { f: 262, dur: 0.2, gain: 0.07, type: 'triangle' }); },
    blip: (c, t) => { tone(c, t, { f: 1320, dur: 0.045, gain: 0.045, type: 'square', attack: 0.002 }); tone(c, t + 0.055, { f: 1760, dur: 0.06, gain: 0.04, type: 'square', attack: 0.002 }); },
    unlock: (c, t) => {
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(c, t + i * 0.075, { f, dur: 0.09, gain: 0.03, type: 'square', attack: 0.002 }));
      bell(c, t + 0.3, 2093, 0.5, 0.045);
    },
    // ---- 剧场里的音效（v8.0）：都很轻，像背景里的一声 ----
    pop: (c, t) => tone(c, t, { f: 880, f2: 1320, dur: 0.06, gain: 0.035 }), // 手机来消息
    tick: (c, t) => tone(c, t, { f: 1500, dur: 0.03, gain: 0.03, type: 'square', attack: 0.002 }), // 节拍
    heart: (c, t) => { tone(c, t, { f: 70, dur: 0.14, gain: 0.12 }); tone(c, t + 0.2, { f: 62, dur: 0.16, gain: 0.1 }); },
    door: (c, t) => { noise(c, t, 0.18, 0.09, 'lowpass', 380); tone(c, t, { f: 110, f2: 70, dur: 0.16, gain: 0.08 }); },
    whistle: (c, t) => { tone(c, t, { f: 2600, f2: 2450, dur: 0.16, gain: 0.03 }); tone(c, t + 0.22, { f: 2600, f2: 2300, dur: 0.26, gain: 0.03 }); },
    phone: (c, t) => { for (let i = 0; i < 2; i++) { for (let k = 0; k < 6; k++) tone(c, t + i * 0.9 + k * 0.06, { f: k % 2 ? 620 : 480, dur: 0.055, gain: 0.025, type: 'triangle' }); } },
    swoosh: (c, t) => sweep(c, t, 0.42, 380, 2600, 0.05), // 进出剧场：一阵风
    land: (c, t) => { tone(c, t, { f: 180, f2: 90, dur: 0.12, gain: 0.07 }); tone(c, t + 0.1, { f: 660, dur: 0.05, gain: 0.025 }); }, // 小人落回原位
    // 画面卡一下（说错台词、找不到想要的表情）：一小段电流噪声 + 往下掉的音
    glitch: (c, t) => { noise(c, t, 0.07, 0.06, 'bandpass', 1800); tone(c, t + 0.02, { f: 920, f2: 210, dur: 0.12, gain: 0.03, type: 'square', attack: 0.002 }); noise(c, t + 0.14, 0.05, 0.04, 'highpass', 3000); },
    // 翻开一张纸（人设文档）
    paper: (c, t) => { noise(c, t, 0.12, 0.05, 'highpass', 2400); noise(c, t + 0.09, 0.08, 0.03, 'bandpass', 1200); },
    clang: (c, t) => { [523, 1310, 2150].forEach((f, i) => tone(c, t, { f, dur: 0.7 - i * 0.15, gain: 0.04 - i * 0.01, type: 'triangle' })); noise(c, t, 0.05, 0.05, 'highpass', 2000); }
  };

  // 一阵风：噪声过一个从低到高（或高到低）扫的带通
  function sweep(c, t, dur, f1, f2, gain) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  // 一小段噪声（关门、铁片碰撞）
  function noise(c, t, dur, gain, type, freq) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq || 800;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  // 环境声（v8.0）：雨、泳池的水声、看台的人声、夜里——白噪声过滤出来，很轻地循环；换一种先淡出再淡入
  let ambNode = null;
  const AMB = {
    rain: { type: 'highpass', freq: 1400, q: 0.5, gain: 0.028 },
    pool: { type: 'lowpass', freq: 420, q: 0.8, gain: 0.03, wobble: 0.35 },
    crowd: { type: 'bandpass', freq: 750, q: 0.6, gain: 0.02, wobble: 0.5 },
    night: { type: 'lowpass', freq: 260, q: 0.4, gain: 0.012 },
    // 电台直播间：很轻的底噪（话筒开着的那种安静）
    booth: { type: 'bandpass', freq: 520, q: 0.9, gain: 0.008 }
  };

  const Sound = {
    on() { try { return root.localStorage.getItem('tf_sound') !== 'off'; } catch (e) { return true; } },
    /** 手机静音 / 震动模式时不响 */
    allowed() {
      try {
        const n = root.TrainFitNative;
        return !(n && n.soundAllowed) || n.soundAllowed();
      } catch (e) { return true; }
    },
    /** delay：晚一点响（秒），比如松手时等麦克风先关掉，免得把提示音录进去 */
    play(kind, delay) {
      if (!SOUNDS[kind] || !this.on() || !this.allowed()) return;
      const c = audio();
      if (!c) return;
      try { SOUNDS[kind](c, c.currentTime + 0.01 + (delay || 0)); } catch (e) {}
    },
    warm() { if (this.on()) audio(); },
    /** 环境声：kind = rain / pool / crowd / night，'' 关掉（剧场收场时关）。静音、关了音效时不响 */
    amb(kind) {
      const c = ctx;
      if (ambNode && c) {
        const old = ambNode;
        ambNode = null;
        try { old.g.gain.cancelScheduledValues(c.currentTime); old.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.25); setTimeout(() => { try { old.src.stop(); } catch (e) {} }, 1200); } catch (e) {}
      }
      const A = AMB[kind];
      if (!A || !this.on() || !this.allowed()) return;
      const a = audio();
      if (!a) return;
      try {
        const len = a.sampleRate * 2;
        const buf = a.createBuffer(1, len, a.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = kind === 'rain' ? w : (last + 0.04 * w) / 1.04; d[i] = kind === 'rain' ? w : last * 3.5; }
        const src = a.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = a.createBiquadFilter();
        f.type = A.type;
        f.frequency.value = A.freq;
        f.Q.value = A.q;
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, a.currentTime);
        g.gain.setTargetAtTime(A.gain, a.currentTime, 0.6);
        src.connect(f).connect(g).connect(out);
        if (A.wobble) { // 水声、人声一阵一阵的
          const lfo = a.createOscillator();
          const lg = a.createGain();
          lfo.frequency.value = A.wobble;
          lg.gain.value = A.gain * 0.45;
          lfo.connect(lg).connect(g.gain);
          lfo.start();
          src.addEventListener('ended', () => { try { lfo.stop(); } catch (e) {} });
        }
        src.start();
        ambNode = { src, g };
      } catch (e) {}
    },
    /**
     * 小人说话的声音（像游戏里角色说话时的「哔哔」声，v5.7）：前二十几个字每个字一声很轻的方波，
     * 同一个字同一个音高，听着像在说话；男生低一点、女生高一点。静音、关了音效时不响。
     */
    babble(text, voice) {
      if (!this.on() || !this.allowed()) return;
      const c = audio();
      if (!c) return;
      const chars = [...String(text || '')].filter(ch => !/[\s，。、！？!?,.…：:；;「」（）()\d]/.test(ch)).slice(0, 24);
      const base = voice === 'f' || voice === 'girl' ? 640 : 430;
      let t = c.currentTime + 0.02;
      try {
        chars.forEach((ch) => {
          const f = base * (1 + ((ch.codePointAt(0) * 7) % 9) / 22);
          tone(c, t, { f, dur: 0.032, gain: 0.016, type: 'square', attack: 0.002 });
          t += 0.056;
        });
      } catch (e) {}
    },
    KINDS: Object.keys(SOUNDS)
  };
  root.Sound = Sound;
  TF.Sound = Sound;

  // 第一次点屏幕时把声音准备好（WebView 要求用户操作过才能出声）
  if (root.document) {
    const warmOnce = () => { Sound.warm(); root.document.removeEventListener('pointerdown', warmOnce, true); };
    root.document.addEventListener('pointerdown', warmOnce, true);
  }
})(typeof window !== 'undefined' ? window : globalThis);
