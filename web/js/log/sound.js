/**
 * 音效：用 Web Audio 现场合成，不放音频文件。都很短、很轻，像系统的提示音。
 *   start 按住开始说话（轻轻上扬）   stop 松手（轻轻落下）
 *   success 记好了（两声小铃）       undo 撤销    error 没听清 / 没整理好
 *   blip 点小人（8-bit 哔哔）        unlock 连续记录拿到新装备（8-bit 小琶音）
 *   babble(text) 小人主动说话时一个字一声的对话音
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
    }
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
