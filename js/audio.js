/* ============================================================
 * رضای چاق - Audio (Web Audio API)
 * جلوه‌های صوتی سنتزشده - بدون فایل صوتی خارجی
 * ============================================================ */
window.RC = window.RC || {};

(function () {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;
  let unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  // فعال‌سازی صدا پس از نخستین تعامل کاربر (محدودیت Autoplay)
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (ensureCtx() && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (master) master.gain.value = enabled ? 0.5 : 0.0;
  }

  function ready() {
    return enabled && ctx && ctx.state === 'running';
  }

  // ---------- بلوک‌های پایه ----------
  function tone(opts) {
    if (!ready()) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(Math.max(30, opts.f0 || 440), t0);
    if (opts.f1 && opts.f1 !== opts.f0) {
      o.frequency.exponentialRampToValueAtTime(Math.max(30, opts.f1), t0 + (opts.dur || 0.15));
    }
    const v = opts.vol != null ? opts.vol : 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.15));
    o.connect(g); g.connect(master);
    o.start(t0);
    o.stop(t0 + (opts.dur || 0.15) + 0.05);
  }

  function noise(opts) {
    if (!ready()) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const dur = opts.dur || 0.1;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = opts.filter || 'lowpass';
    flt.frequency.value = opts.cutoff || 900;
    flt.Q.value = opts.q || 0.8;
    const g = ctx.createGain();
    const v = opts.vol != null ? opts.vol : 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ---------- افکت‌های بازی ----------
  const SFX = {
    click() { tone({ type: 'square', f0: 720, f1: 480, dur: 0.07, vol: 0.16 }); },
    select() { tone({ type: 'sine', f0: 880, f1: 990, dur: 0.06, vol: 0.14 }); },
    eat() {
      tone({ type: 'sawtooth', f0: 300, f1: 140, dur: 0.13, vol: 0.2 });
      noise({ dur: 0.09, cutoff: 700, vol: 0.14 });
    },
    chew() {
      noise({ dur: 0.07, cutoff: 500, vol: 0.16 });
      noise({ dur: 0.07, cutoff: 420, vol: 0.14, delay: 0.11 });
    },
    score() { tone({ type: 'sine', f0: 660, dur: 0.07, vol: 0.16 }); tone({ type: 'sine', f0: 880, dur: 0.09, vol: 0.14, delay: 0.07 }); },
    combo(n) {
      const base = 520 + Math.min(5, n) * 90;
      tone({ type: 'square', f0: base, dur: 0.07, vol: 0.13 });
      tone({ type: 'square', f0: base * 1.25, dur: 0.09, vol: 0.12, delay: 0.06 });
    },
    golden() {
      tone({ type: 'sine', f0: 1318, dur: 0.25, vol: 0.16 });
      tone({ type: 'sine', f0: 1760, dur: 0.3, vol: 0.13, delay: 0.09 });
      tone({ type: 'triangle', f0: 2637, dur: 0.25, vol: 0.07, delay: 0.16 });
    },
    stageUp() {
      // بویینگ بامزه
      tone({ type: 'triangle', f0: 150, f1: 420, dur: 0.28, vol: 0.26 });
      tone({ type: 'triangle', f0: 420, f1: 260, dur: 0.22, vol: 0.2, delay: 0.26 });
      noise({ dur: 0.16, cutoff: 300, vol: 0.22, delay: 0.02 });
    },
    rush() {
      tone({ type: 'sawtooth', f0: 200, f1: 800, dur: 0.5, vol: 0.18 });
      tone({ type: 'sine', f0: 1046, dur: 0.18, vol: 0.13, delay: 0.4 });
      tone({ type: 'sine', f0: 1568, dur: 0.22, vol: 0.11, delay: 0.52 });
    },
    timeUp() {
      tone({ type: 'square', f0: 440, dur: 0.16, vol: 0.2 });
      tone({ type: 'square', f0: 330, dur: 0.16, vol: 0.2, delay: 0.2 });
      tone({ type: 'square', f0: 220, dur: 0.3, vol: 0.22, delay: 0.4 });
    },
    record() {
      const seq = [523, 659, 784, 1046];
      seq.forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.16, vol: 0.2, delay: i * 0.12 }));
      tone({ type: 'sine', f0: 1568, dur: 0.4, vol: 0.12, delay: 0.5 });
    },
    error() { tone({ type: 'square', f0: 180, f1: 120, dur: 0.15, vol: 0.18 }); },
    tick() { tone({ type: 'square', f0: 990, dur: 0.04, vol: 0.1 }); }
  };

  // اجرای امن هر افکت
  function play(name, arg) {
    try {
      if (SFX[name]) SFX[name](arg);
    } catch (e) { /* صدا هرگز بازی را متوقف نکند */ }
  }

  RC.audio = { unlock, setEnabled, play, get enabled() { return enabled; } };
})();
