/* ── Audio: synthesized sound effects (WebAudio), generative music, narrator voice + subtitle hook ──
   Nothing is created until AUD.unlock() (first user gesture). ?sessiz → no AudioContext ever, but narrator
   lines still drive AUD.onSubtitle with (recorded or estimated) durations. Only global: AUD. */
const AUD = (() => {
  'use strict';
  const QUIET = typeof SILENT !== 'undefined' ? SILENT : /[?&]sessiz(&|=|$)/.test(location.search);
  const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const cl = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const semi = s => Math.pow(2, s / 12);
  const wallNow = () => performance.now() / 1000;

  // soundOn = sound effects only. The narrator has its own flag (voiceOn), never exposed in the kid-facing UI:
  // it is the only guidance a non-reader gets, so an accidental 'Ses' tap must not silence it.
  const A = { musicOn: true, soundOn: true, voiceOn: true, onSubtitle: null, LINES: {}, theme: null, current: null };
  let ctx = null, M = null, unlocked = false, want = null, lx = 0, lz = 0, dimmed = false;

  // ───────────────────────── mixer ─────────────────────────
  const MUSIC_VOL = 0.28, SFX_VOL = 0.8, VOICE_VOL = 1.0, DUCK = 0.3, DIM = 0.35;
  const musicLevel = () => (A.musicOn ? MUSIC_VOL * (dimmed ? DIM : 1) : 0);
  function gainNode(c, v) { const g = c.createGain(); g.gain.value = v; return g; }
  function wave(c, amps) {
    const n = amps.length + 1, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < amps.length; i++) im[i + 1] = amps[i];
    return c.createPeriodicWave(re, im);
  }
  // Soft room: decorrelated stereo noise, exponential decay, getting darker over time, a few early reflections.
  function makeIR(c, secs = 1.9) {
    const sr = c.sampleRate, n = Math.floor(sr * secs), b = c.createBuffer(2, n, sr), pre = Math.floor(sr * 0.012);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = pre; i < n; i++) {
        const x = (i - pre) / (n - pre);
        lp += (Math.random() * 2 - 1 - lp) * (0.75 - 0.62 * x);
        d[i] = lp * Math.exp(-x * 6.5);
      }
      const taps = ch ? [0.019, 0.034, 0.047] : [0.023, 0.029, 0.041];
      taps.forEach((tt, k) => { const i = Math.floor(sr * tt); if (i < n) d[i] += (0.5 - k * 0.12) * (k & 1 ? -1 : 1); });
    }
    return b;
  }
  function makeMix(c, full, raw) {
    const m = { c };
    m.out = gainNode(c, 0.95); m.out.connect(c.destination);
    const lim = c.createDynamicsCompressor();   // brick-wall-ish safety limiter
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.09;
    lim.connect(m.out);
    const comp = c.createDynamicsCompressor();  // glue: many sounds at once stay smooth
    comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    comp.connect(lim);
    const hp = c.createBiquadFilter();   // nothing below ~45 Hz: inaudible on tablet speakers, only eats headroom
    hp.type = 'highpass'; hp.frequency.value = 45; hp.Q.value = 0.7; hp.connect(raw ? m.out : comp);
    m.master = gainNode(c, 0.85); m.master.connect(hp);
    m.verb = c.createConvolver(); m.verb.buffer = makeIR(c);
    const vret = gainNode(c, 0.8); m.verb.connect(vret); vret.connect(m.master);
    m.sfx = gainNode(c, full || A.soundOn ? SFX_VOL : 0); m.sfx.connect(m.master);
    const ss = gainNode(c, 0.16); m.sfx.connect(ss); ss.connect(m.verb);
    m.duck = gainNode(c, 1); m.duck.connect(m.master);
    const ms = gainNode(c, 0.34); m.duck.connect(ms); ms.connect(m.verb);
    m.music = gainNode(c, full ? MUSIC_VOL : musicLevel()); m.music.connect(m.duck);
    m.voice = gainNode(c, full || A.voiceOn ? VOICE_VOL : 0); m.voice.connect(m.master);
    const vs = gainNode(c, 0.05); m.voice.connect(vs); vs.connect(m.verb);
    const nb = c.createBuffer(1, Math.floor(c.sampleRate * 3), c.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    m.noise = nb;
    m.waves = {
      sq: wave(c, [1, 0, 0.33, 0, 0.17, 0, 0.09, 0, 0.045, 0, 0.02]),
      saw: wave(c, [1, 0.5, 0.3, 0.2, 0.13, 0.09, 0.06, 0.04, 0.025, 0.015]),
      brass: wave(c, [1, 0.8, 0.55, 0.38, 0.25, 0.16, 0.1, 0.06, 0.035, 0.02]),
      flute: wave(c, [1, 0.16, 0.05, 0.015]),
    };
    return m;
  }

  // ───────────────────────── synthesis primitives (all take a mix so they also render offline) ─────────────────────────
  function curve(prm, t, pts, step) {
    prm.setValueAtTime(pts[0][1], t + pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const tt = t + pts[i][0], v = Math.max(1e-4, pts[i][1]);
      if (step) prm.setValueAtTime(v, tt); else prm.exponentialRampToValueAtTime(v, tt);
    }
  }
  // Percussive (exp decay to -60 dB at t+dur) or held (hold=1: attack, sustain, linear release) envelope.
  function env(prm, t, a, vol, dur, hold, rel) {
    a = Math.min(a, dur * 0.5);
    prm.setValueAtTime(0, t);
    prm.linearRampToValueAtTime(vol, t + a);
    if (hold) { const r = Math.min(rel || 0.08, dur - a); prm.setValueAtTime(vol, t + dur - r); prm.linearRampToValueAtTime(0, t + dur); }
    else prm.exponentialRampToValueAtTime(Math.max(1e-6, vol * 1e-3), t + dur);
  }
  // Oscillator voice. o: {f1, glide, fs:[[dt,f]..], step, type, wave, det, a, hold, rel, vib:[hz,cents,delay], lp|hp|bp: f or [[dt,f]..], q}
  function T(m, out, t, f, dur, vol, o) {
    o = o || {};
    const c = m.c, os = c.createOscillator(), g = gainNode(c, 0), end = t + dur + 0.03;   // gain starts at 0: no first-sample click
    if (o.wave) os.setPeriodicWave(m.waves[o.wave]); else os.type = o.type || 'sine';
    if (o.fs) curve(os.frequency, t, o.fs, o.step);
    else { os.frequency.setValueAtTime(f, t); if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || dur)); }
    if (o.det) os.detune.setValueAtTime(o.det, t);
    if (o.vib && dur > (o.vib[2] || 0.08)) {
      const l = c.createOscillator(), lg = gainNode(c, 0);
      l.frequency.value = o.vib[0];
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib[1], t + (o.vib[2] || 0.08));
      l.connect(lg); lg.connect(os.detune); l.start(t); l.stop(end);
    }
    let n = os;
    const ff = o.lp || o.hp || o.bp;
    if (ff) {
      const bq = c.createBiquadFilter();
      bq.type = o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass'; bq.Q.value = o.q ?? 0.7;
      if (Array.isArray(ff)) curve(bq.frequency, t, ff); else bq.frequency.setValueAtTime(ff, t);
      os.connect(bq); n = bq;
    }
    env(g.gain, t, o.a ?? 0.004, vol, dur, o.hold, o.rel);
    n.connect(g); g.connect(out);
    os.start(t); os.stop(end);
  }
  // Filtered noise. o: {type='bandpass', f, f1, fs, q, a, hold, rel, am:[hz, depth]}
  function N(m, out, t, dur, vol, o) {
    o = o || {};
    const c = m.c, s = c.createBufferSource(), bq = c.createBiquadFilter(), g = gainNode(c, 0);
    s.buffer = m.noise;
    bq.type = o.type || 'bandpass'; bq.Q.value = o.q ?? 1;
    if (o.fs) curve(bq.frequency, t, o.fs);
    else { bq.frequency.setValueAtTime(o.f || 1000, t); if (o.f1) bq.frequency.exponentialRampToValueAtTime(o.f1, t + dur); }
    env(g.gain, t, o.a ?? 0.003, vol, dur, o.hold, o.rel);
    s.connect(bq); bq.connect(g);
    if (o.am) {
      const a = gainNode(c, 1 - o.am[1] * 0.5), l = c.createOscillator(), lg = gainNode(c, o.am[1] * 0.5);
      l.frequency.value = o.am[0]; l.connect(lg); lg.connect(a.gain); g.connect(a); a.connect(out);
      l.start(t); l.stop(t + dur + 0.03);
    } else g.connect(out);
    s.start(t, rnd(0, Math.max(0, m.noise.duration - dur - 0.1)), dur + 0.03);
  }
  // FM bell: ratio 3.5 = glassy twinkle, 4 = music box / celesta.
  function B(m, out, t, f, dur, vol, ratio = 3.5, idx = 1.2) {
    const c = m.c, car = c.createOscillator(), mod = c.createOscillator(), mg = gainNode(c, 0), g = gainNode(c, 0), end = t + dur + 0.03;
    car.frequency.setValueAtTime(f, t); mod.frequency.setValueAtTime(Math.min(f * ratio, 18000), t);
    mg.gain.setValueAtTime(f * idx, t); mg.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.5);
    mod.connect(mg); mg.connect(car.frequency);
    env(g.gain, t, 0.002, vol, dur);
    car.connect(g); g.connect(out);
    car.start(t); mod.start(t); car.stop(end); mod.stop(end);
  }
  const arp = (m, o, t, fs, gap, dur, vol, p, ratio = 4, idx = 0.8) => fs.forEach((f, i) => B(m, o, t + i * gap, f * p, dur, vol, ratio, idx));
  const sparkle = (m, o, t, n, f0, f1, span, vol) => { for (let i = 0; i < n; i++) B(m, o, t + span * i / n, f0 * Math.pow(f1 / f0, i / (n - 1)) * rnd(0.98, 1.02), 0.35, vol * rnd(0.7, 1), 3.5, 0.9); };
  // Lightsaber voice: two slightly detuned buzzy saws + a quiet octave square, a "projector" flutter (AM) for the grit,
  // through a resonant lowpass (kept ≤ ~3.5 kHz so it stays soft). fs / lp are [[dt, value]..] curves: a swing is the
  // doppler "vvzzum" = pitch and brightness up, then down. o: {a, rel, hold (0 = percussive), q, flutter (Hz), buzz (0..0.5)}
  // A gentle high-pass thins the fundamental: tablet speakers cannot play it anyway, it would only eat headroom.
  function saber(m, out, t, dur, vol, fs, lp, o) {
    o = o || {};
    const c = m.c, g = gainNode(c, 0), bq = c.createBiquadFilter(), hp = c.createBiquadFilter(), end = t + dur + 0.03, bz = o.buzz ?? 0.28;
    bq.type = 'lowpass'; bq.Q.value = o.q ?? 3; curve(bq.frequency, t, lp);
    hp.type = 'highpass'; hp.Q.value = 0.6; hp.frequency.value = o.hp || 130; bq.connect(hp);
    const am = gainNode(c, 1 - bz), l = c.createOscillator(), lg = gainNode(c, bz);
    l.frequency.value = o.flutter || 36; l.connect(lg); lg.connect(am.gain);
    for (const [mul, det, w, v] of [[1, 0, 'saw', 1], [1, 11, 'saw', 0.75], [2, -5, 'sq', 0.22]]) {
      const os = c.createOscillator(), og = gainNode(c, v);
      os.setPeriodicWave(m.waves[w]); os.detune.value = det;
      curve(os.frequency, t, fs.map(([a, f]) => [a, f * mul]));
      os.connect(og); og.connect(bq); os.start(t); os.stop(end);
    }
    hp.connect(am); am.connect(g);
    if (o.hold === 0) env(g.gain, t, o.a ?? 0.003, vol, dur);
    else env(g.gain, t, o.a ?? 0.05, vol, dur, 1, o.rel ?? 0.12);
    g.connect(out); l.start(t); l.stop(end);
  }
  // A few tiny random crackles (the electric "zzkt" of a lightsaber touching something), bandpassed so they never get shrill.
  const crackle = (m, o, t, n, span, vol, p) => { for (let i = 0; i < n; i++) N(m, o, t + rnd(0, span), 0.016, vol * rnd(0.6, 1), { f: rnd(1500, 3200) * p, q: 2.5, a: 0.001 }); };

  // ───────────────────────── sound effects (return length in seconds) ─────────────────────────
  // All soft and cartoony: sine bonks, filtered-noise whooshes, little bell arpeggios. p = pitch multiplier.
  const SFX = {
    // ── lightsaber (every weapon is an ışın kılıcı): "vvzzum" swings, crackly zap + soft thump on hit, ignite / retract.
    // Only short one-shots: there is deliberately no constant hum while walking around.
    swing(m, o, t, p) {
      saber(m, o, t, 0.3, 0.22, [[0, 100 * p], [0.12, 165 * p], [0.3, 105 * p]], [[0, 560], [0.12, 2700], [0.3, 700]], { a: 0.06, rel: 0.15 });
      N(m, o, t, 0.28, 0.2, { fs: [[0, 480 * p], [0.12, 1900 * p], [0.28, 650 * p]], q: 1.2, a: 0.08 }); return 0.33;
    },
    swingBig(m, o, t, p) {   // combo finisher: a longer, deeper "vvvZZUUMM" and a little twinkle
      saber(m, o, t, 0.46, 0.24, [[0, 84 * p], [0.19, 180 * p], [0.46, 90 * p]], [[0, 480], [0.19, 3200], [0.46, 600]], { a: 0.09, rel: 0.22 });
      N(m, o, t, 0.44, 0.24, { fs: [[0, 350 * p], [0.19, 2000 * p], [0.44, 520 * p]], q: 1.1, a: 0.12 });
      B(m, o, t + 0.2, 1760 * p, 0.35, 0.03); B(m, o, t + 0.26, 2349 * p, 0.35, 0.026); return 0.55;
    },
    hit(m, o, t, p) {   // crackly "zzkt" + soft thump
      T(m, o, t, 290 * p, 0.13, 0.45, { f1: 95 * p, a: 0.002 });   // "thup" high enough for tablet speakers
      T(m, o, t, 580 * p, 0.05, 0.06, { f1: 200 * p, type: 'triangle', a: 0.001 });
      saber(m, o, t, 0.12, 0.2, [[0, 215 * p], [0.12, 125 * p]], [[0, 3000], [0.12, 800]], { hold: 0, flutter: 62, buzz: 0.45 });
      N(m, o, t, 0.09, 0.1, { f: 2300 * p, q: 1.2, am: [70, 0.9], a: 0.001 });
      crackle(m, o, t, 4, 0.07, 0.18, p); return 0.18;
    },
    hitSoft(m, o, t, p) { T(m, o, t, 600 * p, 0.08, 0.3, { f1: 260 * p, a: 0.002 }); N(m, o, t, 0.03, 0.09, { type: 'lowpass', f: 2500, a: 0.001 }); return 0.1; },
    crit(m, o, t, p) {   // bigger zap, rounder thump, then a happy twinkle
      T(m, o, t, 250 * p, 0.24, 0.55, { f1: 70 * p, a: 0.002 });
      T(m, o, t, 500 * p, 0.07, 0.07, { f1: 160 * p, type: 'triangle', a: 0.001 });
      saber(m, o, t, 0.22, 0.24, [[0, 240 * p], [0.05, 300 * p], [0.22, 110 * p]], [[0, 3400], [0.22, 750]], { hold: 0, flutter: 55, buzz: 0.5 });
      N(m, o, t, 0.18, 0.13, { f: 2200 * p, q: 1, am: [55, 0.9], a: 0.001 });
      crackle(m, o, t, 7, 0.14, 0.2, p);
      arp(m, o, t + 0.04, [1568, 2093, 2637], 0.05, 0.5, 0.1, p, 3.5, 1); return 0.7;
    },
    saberOn(m, o, t, p) {   // ignition: tiny snap-hiss, the hum rises into place ("tssh-vMMMM"), a sparkle for the flash, then fades
      N(m, o, t, 0.09, 0.22, { type: 'highpass', f: 2600, q: 0.7, a: 0.002 });
      saber(m, o, t, 0.8, 0.24, [[0, 44 * p], [0.26, 120 * p], [0.4, 104 * p], [0.8, 100 * p]], [[0, 300], [0.26, 2900], [0.45, 1400], [0.8, 650]], { a: 0.03, rel: 0.45 });
      T(m, o, t, 320 * p, 0.28, 0.035, { f1: 1250 * p, a: 0.02 });
      B(m, o, t + 0.24, 1760 * p, 0.5, 0.045); B(m, o, t + 0.3, 2637 * p, 0.5, 0.035); return 0.85;
    },
    saberOff(m, o, t, p) {   // retract: the hum sinks and closes ("vmmmp")
      saber(m, o, t, 0.46, 0.22, [[0, 104 * p], [0.08, 112 * p], [0.46, 38 * p]], [[0, 1900], [0.46, 240]], { a: 0.01, rel: 0.2 });
      N(m, o, t, 0.3, 0.07, { fs: [[0, 2400], [0.3, 420]], q: 1, a: 0.01 }); return 0.5;
    },
    pop(m, o, t, p) {   // enemy turned happy: bubbly bloop + happy little arpeggio
      T(m, o, t, 340 * p, 0.1, 0.42, { f1: 1250 * p, glide: 0.06, a: 0.002 });
      [1047, 1319, 1568, 2093].forEach((f, i) => B(m, o, t + 0.06 + i * 0.055, f * p, 0.42, 0.11 - i * 0.012, 4, 0.7));
      N(m, o, t + 0.05, 0.25, 0.035, { type: 'highpass', f: 6500, a: 0.02 }); return 0.65;
    },
    coin(m, o, t, p) {
      T(m, o, t, 988 * p, 0.075, 0.11, { wave: 'sq', lp: 5000, a: 0.001, hold: 1, rel: 0.012 });
      T(m, o, t + 0.07, 1319 * p, 0.4, 0.11, { wave: 'sq', lp: 5000, a: 0.001 });
      T(m, o, t + 0.07, 2638 * p, 0.2, 0.025, { a: 0.001 }); return 0.5;
    },
    heart(m, o, t, p) {
      T(m, o, t, 520 * p, 0.2, 0.3, { f1: 1040 * p, a: 0.01 });
      B(m, o, t + 0.08, 1319 * p, 0.5, 0.09, 4, 0.7); B(m, o, t + 0.16, 1760 * p, 0.5, 0.075, 4, 0.7); return 0.7;
    },
    potion(m, o, t, p) {
      for (let i = 0; i < 3; i++) T(m, o, t + i * 0.1, 280 * p * semi(i * 2), 0.08, 0.28, { f1: 500 * p * semi(i * 2), a: 0.005 });
      arp(m, o, t + 0.32, [1319, 1568, 2093, 2637], 0.05, 0.4, 0.065, p);
      N(m, o, t + 0.3, 0.45, 0.03, { type: 'highpass', f: 5500, a: 0.1 }); return 0.9;
    },
    levelup(m, o, t, p) {
      [523, 659, 784, 1047].forEach((f, i) => { T(m, o, t + i * 0.085, f * p, 0.25, 0.08, { wave: 'sq', lp: 3500 }); B(m, o, t + i * 0.085, f * p, 0.6, 0.07, 4, 0.7); });
      [1047, 1319, 1568].forEach((f, i) => T(m, o, t + 0.36, f * p, 1.0, 0.04, { wave: 'saw', lp: 2600, hold: 1, a: 0.04, rel: 0.55, vib: [5.5, 10, 0.25], det: (i - 1) * 6 }));
      B(m, o, t + 0.36, 2093 * p, 1.2, 0.07, 4, 0.8);
      sparkle(m, o, t + 0.42, 10, 2000 * p, 4200 * p, 0.5, 0.03);
      N(m, o, t + 0.36, 0.9, 0.022, { type: 'highpass', f: 7000, a: 0.25 }); return 1.5;
    },
    unlock(m, o, t, p) {
      arp(m, o, t, [784, 880, 1047, 1175, 1319, 1568, 1760, 2093], 0.05, 0.45, 0.065, p);
      [523, 784, 1319].forEach(f => T(m, o, t + 0.42, f * p, 1.0, 0.06, { hold: 1, a: 0.12, rel: 0.6, vib: [5, 8, 0.3] }));
      N(m, o, t + 0.4, 0.8, 0.022, { type: 'highpass', f: 6000, a: 0.2 }); return 1.5;
    },
    star(m, o, t, p) {
      T(m, o, t, 1760 * p, 0.15, 0.14, { f1: 900 * p, a: 0.003 });
      B(m, o, t, 2637 * p, 0.3, 0.07); N(m, o, t, 0.12, 0.035, { type: 'highpass', f: 5500, a: 0.01 }); return 0.35;
    },
    spin(m, o, t, p) {
      N(m, o, t, 0.9, 0.45, { fs: [[0, 350 * p], [0.2, 1500 * p], [0.4, 700 * p], [0.6, 1600 * p], [0.88, 500 * p]], q: 2.2, a: 0.12, hold: 1, rel: 0.35 });
      T(m, o, t, 180 * p, 0.9, 0.045, { type: 'triangle', fs: [[0, 180 * p], [0.45, 420 * p], [0.88, 220 * p]], hold: 1, a: 0.15, rel: 0.3 }); return 0.95;
    },
    ice(m, o, t, p) {
      for (let i = 0; i < 5; i++) B(m, o, t + rnd(0, 0.16), pick([2093, 2349, 2637, 3136, 3520]) * p, 0.6, 0.06, 2.76, 1);
      N(m, o, t, 0.4, 0.11, { type: 'highpass', f: 4200, a: 0.005 });
      T(m, o, t, 2600 * p, 0.18, 0.035, { f1: 3400 * p }); return 0.8;
    },
    shield(m, o, t, p) {
      T(m, o, t, 300 * p, 0.45, 0.13, { f1: 900 * p, a: 0.02 });
      [523, 784, 1319].forEach(f => T(m, o, t + 0.05, f * p, 1.0, 0.055, { hold: 1, a: 0.1, rel: 0.6, vib: [5, 10, 0.2] }));
      B(m, o, t + 0.1, 2093 * p, 0.8, 0.055, 4, 0.8); N(m, o, t, 0.7, 0.02, { type: 'highpass', f: 6000, a: 0.15 }); return 1.1;
    },
    zap(m, o, t, p) {   // cute "bzzt-ting", jagged pitch through a lowpass so it never gets harsh
      T(m, o, t, 700, 0.22, 0.08, { wave: 'saw', step: 1, lp: 2600, a: 0.002, fs: [[0, 700], [0.02, 1100], [0.04, 520], [0.06, 1300], [0.09, 600], [0.12, 1000], [0.16, 480], [0.19, 900]].map(([a, f]) => [a, f * p]) });
      N(m, o, t, 0.2, 0.11, { f: 3200, q: 1.2, am: [45, 0.8] });
      B(m, o, t + 0.12, 1760 * p, 0.35, 0.065); return 0.5;
    },
    meteorFall(m, o, t, p) {
      T(m, o, t, 1600 * p, 0.6, 0.13, { f1: 340 * p, a: 0.05, vib: [9, 25, 0.05] });
      N(m, o, t, 0.6, 0.09, { f: 2200 * p, f1: 600 * p, a: 0.08, q: 1.5 }); return 0.65;
    },
    boom(m, o, t, p) {   // round "pomf", no rumble tail
      T(m, o, t, 220 * p, 0.5, 0.55, { f1: 55 * p, a: 0.003 });
      N(m, o, t, 0.6, 0.4, { type: 'lowpass', fs: [[0, 2000], [0.5, 160]], q: 0.6 });
      N(m, o, t, 0.3, 0.22, { f: 450 * p, q: 0.8, a: 0.004 });
      T(m, o, t, 180 * p, 0.3, 0.16, { f1: 70 * p, type: 'triangle' });
      B(m, o, t + 0.06, 1319 * p, 0.5, 0.035); B(m, o, t + 0.12, 1760 * p, 0.5, 0.03); return 0.7;
    },
    hurt(m, o, t, p) {   // cartoony "boing-oof"
      T(m, o, t, 520 * p, 0.18, 0.24, { f1: 250 * p, type: 'triangle', a: 0.003, vib: [18, 40, 0.02] });
      T(m, o, t, 300 * p, 0.22, 0.24, { f1: 190 * p }); N(m, o, t, 0.05, 0.1, { type: 'lowpass', f: 1400 }); return 0.25;
    },
    chest(m, o, t, p) {
      T(m, o, t, 190 * p, 0.09, 0.28, { f1: 120 * p }); N(m, o, t, 0.05, 0.16, { f: 900, q: 1.5 });
      [784, 1047, 1319, 1568].forEach((f, i) => { B(m, o, t + 0.12 + i * 0.075, f * p, 0.55, 0.09, 4, 0.8); T(m, o, t + 0.12 + i * 0.075, f * p, 0.15, 0.035, { wave: 'sq', lp: 3000 }); });
      [1047, 1319, 1568].forEach(f => T(m, o, t + 0.45, f * p, 0.8, 0.035, { hold: 1, a: 0.05, rel: 0.5 }));
      N(m, o, t + 0.4, 0.7, 0.025, { type: 'highpass', f: 6000, a: 0.1 }); return 1.3;
    },
    portal(m, o, t, p) {
      N(m, o, t, 1.3, 0.26, { fs: [[0, 300], [0.9, 2600], [1.3, 1400]], q: 3, a: 0.3, hold: 1, rel: 0.4 });
      [220, 330, 440].forEach((f, i) => T(m, o, t, f * p, 1.3, 0.032, { wave: 'saw', lp: 900, hold: 1, a: 0.3, rel: 0.6, vib: [4, 14, 0.2], det: (i - 1) * 7 }));
      for (let i = 0; i < 5; i++) B(m, o, t + 0.2 + i * 0.18, pick([1319, 1568, 1760, 2093, 2637]) * p, 0.5, 0.035); return 1.4;
    },
    break(m, o, t, p) {   // clay pot / crate: a few woody clicks
      for (let i = 0; i < 5; i++) N(m, o, t + rnd(0, 0.12), 0.04, rnd(0.14, 0.28), { f: rnd(1200, 3400) * p, q: 2.5, a: 0.001 });
      T(m, o, t, 320 * p, 0.07, 0.24, { f1: 150 * p, a: 0.002 }); N(m, o, t, 0.1, 0.11, { type: 'lowpass', f: 1200 }); return 0.3;
    },
    drop(m, o, t, p) { T(m, o, t, 950 * p, 0.06, 0.11, { f1: 620 * p }); T(m, o, t, 260 * p, 0.09, 0.2, { f1: 150 * p }); N(m, o, t, 0.05, 0.09, { type: 'lowpass', f: 900 }); return 0.15; },
    dropRare(m, o, t, p) {
      SFX.drop(m, o, t, p); B(m, o, t + 0.06, 1319 * p, 0.5, 0.085, 4, 0.8); B(m, o, t + 0.14, 1976 * p, 0.6, 0.085, 4, 0.8);
      N(m, o, t + 0.1, 0.4, 0.02, { type: 'highpass', f: 6000, a: 0.08 }); return 0.8;
    },
    dropLegend(m, o, t, p) {
      SFX.drop(m, o, t, p);
      arp(m, o, t + 0.06, [784, 988, 1175, 1319, 1568, 1976, 2349, 2637], 0.055, 0.5, 0.065, p);
      [523, 659, 784].forEach((f, i) => T(m, o, t + 0.1, f * p, 1.6, 0.03, { wave: 'saw', lp: 1500, hold: 1, a: 0.25, rel: 0.7, vib: [5, 12, 0.3], det: (i - 1) * 5 }));
      T(m, o, t + 0.1, 1047 * p, 1.6, 0.03, { wave: 'flute', hold: 1, a: 0.3, rel: 0.7, vib: [5, 10, 0.3] });
      N(m, o, t + 0.1, 1.2, 0.028, { type: 'highpass', f: 6500, a: 0.3 }); return 1.8;
    },
    click(m, o, t, p) { T(m, o, t, 1150 * p, 0.045, 0.2, { f1: 880 * p, a: 0.002 }); T(m, o, t, 2300 * p, 0.02, 0.03, { type: 'triangle' }); return 0.06; },
    checkpoint(m, o, t, p) {
      arp(m, o, t, [659, 831, 988, 1319], 0.1, 0.9, 0.08, p);
      [659, 988, 1319].forEach(f => T(m, o, t + 0.35, f * p, 1.1, 0.04, { hold: 1, a: 0.2, rel: 0.7 }));
      N(m, o, t + 0.3, 1.0, 0.02, { type: 'highpass', f: 6000, a: 0.3 }); return 1.5;
    },
    roar(m, o, t, p) {   // a pretend, playful "rawr!" whose pitch goes UP (like a question), then a little "hee-hee-hee" giggle
      const c = m.c, os = c.createOscillator(), g = gainNode(c, 0), lp = c.createBiquadFilter(), d = 0.62, end = t + d + 0.05;
      os.setPeriodicWave(m.waves.brass);
      curve(os.frequency, t, [[0, 175 * p], [0.1, 225 * p], [0.34, 262 * p], [0.54, 335 * p], [0.62, 310 * p]]);
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 9; lg.gain.value = 40; l.connect(lg); lg.connect(os.detune);   // rolled "rrr" wobble
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(g);
      [[[0, 620], [0.2, 880], [0.62, 600]], [[0, 1150], [0.25, 1400], [0.62, 1000]]].forEach((fs, k) => {   // "a-w" vowel
        const bq = c.createBiquadFilter(); bq.type = 'bandpass'; bq.Q.value = k ? 5 : 3.5; curve(bq.frequency, t, fs.map(([a, f]) => [a, f * p]));
        const bg = gainNode(c, k ? 0.55 : 1); os.connect(bq); bq.connect(bg); bg.connect(lp);
      });
      env(g.gain, t, 0.035, 0.6, d, 1, 0.14); g.connect(o);
      os.start(t); l.start(t); os.stop(end); l.stop(end);
      N(m, o, t, 0.5, 0.035, { f: 900 * p, a: 0.06, hold: 1, rel: 0.2 });
      for (let i = 0; i < 3; i++) {   // giggle: breathy "h" + a bright little "ee" that dips
        const tt = t + 0.7 + i * 0.12, f = (880 - i * 70) * p;
        N(m, o, tt, 0.035, 0.07, { type: 'highpass', f: 3000, a: 0.004 });
        T(m, o, tt + 0.012, f, 0.09, 0.22, { f1: f * 0.86, type: 'triangle', a: 0.006, vib: [22, 30, 0.01] });
      }
      return 1.1;
    },
    bite(m, o, t, p) {   // "nom nom"
      for (let i = 0; i < 2; i++) { T(m, o, t + i * 0.1, 320 * p, 0.07, 0.3, { f1: 120 * p, a: 0.002 }); N(m, o, t + i * 0.1, 0.03, 0.2, { f: 1600, q: 1.5, a: 0.001 }); }
      return 0.22;
    },
    spit(m, o, t, p) { N(m, o, t, 0.06, 0.2, { f: 1300 * p, q: 1, a: 0.002 }); T(m, o, t + 0.02, 480 * p, 0.08, 0.17, { f1: 900 * p, a: 0.005 }); return 0.12; },
    fireball(m, o, t, p) {   // magic "fwoosh" full of glitter and bubbles (flame-sprite puffs, the dragon's bubble breath, the pet dragon)
      N(m, o, t, 0.5, 0.32, { type: 'lowpass', fs: [[0, 400 * p], [0.15, 2000 * p], [0.5, 600 * p]], q: 1, a: 0.06 });
      N(m, o, t + 0.05, 0.4, 0.028, { type: 'highpass', f: 6000, a: 0.12 });
      T(m, o, t, 300 * p, 0.3, 0.05, { f1: 700 * p, a: 0.05 });
      for (let i = 0; i < 3; i++) { const f = rnd(500, 900) * p; T(m, o, t + 0.06 + rnd(0, 0.3), f, 0.06, 0.07, { f1: f * 1.8, a: 0.004 }); }
      sparkle(m, o, t + 0.08, 6, 1800 * p, 3200 * p, 0.35, 0.03); return 0.6;
    },
    slam(m, o, t, p) {
      T(m, o, t, 170 * p, 0.45, 0.6, { f1: 45 * p, a: 0.002 });
      N(m, o, t, 0.45, 0.45, { type: 'lowpass', fs: [[0, 1100], [0.4, 120]], q: 0.5 });
      N(m, o, t, 0.25, 0.2, { f: 380 * p, q: 0.9, a: 0.003 });
      T(m, o, t, 120 * p, 0.25, 0.18, { f1: 60 * p, type: 'triangle' }); N(m, o, t + 0.05, 0.5, 0.09, { f: 400, q: 0.8, a: 0.05 }); return 0.6;
    },
    whoosh(m, o, t, p) { N(m, o, t, 0.38, 0.45, { fs: [[0, 300 * p], [0.18, 1600 * p], [0.38, 500 * p]], q: 1.4, a: 0.1 }); return 0.42; },
    bat(m, o, t, p) {
      N(m, o, t, 0.28, 0.13, { f: 900 * p, q: 1.3, a: 0.02, am: [24, 0.9] });
      T(m, o, t, 2500 * p, 0.05, 0.07, { f1: 3200 * p }); T(m, o, t + 0.11, 2700 * p, 0.05, 0.06, { f1: 3400 * p }); return 0.32;
    },
    splash(m, o, t, p) {
      N(m, o, t, 0.32, 0.28, { fs: [[0, 1400 * p], [0.3, 450 * p]], q: 0.9, a: 0.005 });
      for (let i = 0; i < 4; i++) { const f = rnd(500, 1000) * p; T(m, o, t + rnd(0.04, 0.26), f, 0.05, 0.09, { f1: f * 1.7 }); }
      return 0.38;
    },
    cheer(m, o, t, p) {   // "yippee": two happy whistles, a few claps, sparkles
      T(m, o, t, 700 * p, 0.16, 0.11, { f1: 1050 * p, a: 0.01, vib: [11, 25, 0.04] });
      T(m, o, t + 0.17, 900 * p, 0.22, 0.11, { f1: 1400 * p, a: 0.01, vib: [11, 25, 0.04] });
      for (let i = 0; i < 6; i++) N(m, o, t + rnd(0, 0.45), 0.025, rnd(0.07, 0.14), { f: rnd(1300, 2300), q: 1.2, a: 0.001 });
      arp(m, o, t + 0.2, [1568, 2093, 2637], 0.07, 0.4, 0.05, p, 3.5, 0.9); return 0.7;
    },
    step(m, o, t, p) { N(m, o, t, 0.05, 0.12, { f: 850 * p, q: 0.9, a: 0.003 }); T(m, o, t, 230 * p, 0.04, 0.07, { f1: 140 * p, a: 0.002 }); return 0.07; },
    dig(m, o, t, p) {   // mole digging underground: three soft "shff" scoops, a low tock and a few pebbles
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.09 + rnd(0, 0.02);
        N(m, o, tt, 0.07, rnd(0.2, 0.28), { fs: [[0, 650 * p], [0.07, 1400 * p]], q: 1.4, a: 0.006 });
        N(m, o, tt + 0.02, 0.05, 0.08, { type: 'lowpass', f: 480, a: 0.002 });
      }
      T(m, o, t, 150 * p, 0.08, 0.14, { f1: 90 * p, a: 0.003 });
      for (let i = 0; i < 4; i++) N(m, o, t + 0.05 + rnd(0, 0.2), 0.015, rnd(0.05, 0.09), { f: rnd(1500, 2600) * p, q: 2.5, a: 0.001 });
      return 0.33;
    },
    emerge(m, o, t, p) {   // mole pops out of the ground: dirt puff + a springy "fwoop!"
      N(m, o, t, 0.14, 0.25, { fs: [[0, 500 * p], [0.14, 1300 * p]], q: 1.2, a: 0.004 });
      T(m, o, t + 0.02, 240 * p, 0.16, 0.3, { f1: 720 * p, glide: 0.12, a: 0.006, vib: [16, 30, 0.04] });
      for (let i = 0; i < 4; i++) N(m, o, t + 0.04 + rnd(0, 0.18), 0.015, rnd(0.05, 0.09), { f: rnd(1400, 2400) * p, q: 2.5, a: 0.001 });
      return 0.3;
    },
    bubble(m, o, t, p) {   // snail blows a soap bubble: soft breath, "blub-blub-bloop" rising, an iridescent glint
      N(m, o, t, 0.2, 0.045, { f: 1100 * p, q: 0.8, a: 0.05 });
      [[0.03, 420, 900], [0.11, 560, 1250], [0.2, 700, 1650]].forEach(([dt, f0, f1], i) => T(m, o, t + dt, f0 * p, 0.09, 0.22 - i * 0.04, { f1: f1 * p, glide: 0.06, a: 0.004 }));
      B(m, o, t + 0.25, 2349 * p, 0.35, 0.03, 3.5, 0.6); return 0.45;
    },
    bubblePop(m, o, t, p) {   // a bubble bursts: tiny "plip" + sparkle
      T(m, o, t, 900 * p, 0.04, 0.2, { f1: 1800 * p, a: 0.001 });
      N(m, o, t, 0.03, 0.08, { type: 'highpass', f: 3000, a: 0.001 });
      B(m, o, t + 0.02, 2637 * p, 0.3, 0.04, 3.5, 0.7); B(m, o, t + 0.07, 3136 * p, 0.3, 0.03, 3.5, 0.7); return 0.35;
    },
    // ── Round 3: the volcano and the zone bosses. Warm, round and bubbly; nothing hissy or scary.
    lava(m, o, t, p) {   // lava pool bubbling: two or three thick, soft "blup"s rising from below, a tiny crust plop after each
      const n = Math.random() < 0.5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const tt = t + i * rnd(0.1, 0.15), f = rnd(165, 215) * p * (1 + i * 0.1);
        T(m, o, tt, f, 0.14, 0.3 - i * 0.06, { f1: f * 2.3, glide: 0.1, a: 0.01 });
        T(m, o, tt, f * 2, 0.08, 0.05, { f1: f * 4.2, glide: 0.07, type: 'triangle', a: 0.008 });
        N(m, o, tt + 0.09, 0.045, 0.06, { type: 'lowpass', f: 750, a: 0.003 });
      }
      return 0.5;
    },
    erupt(m, o, t, p) {   // volcano puff: a round soft "whoomp", warm air rushing up, then a gentle fizzy sizzle with little pops
      T(m, o, t, 210 * p, 0.45, 0.5, { f1: 62 * p, a: 0.012 });
      T(m, o, t, 330 * p, 0.25, 0.12, { f1: 125 * p, type: 'triangle', a: 0.008 });
      N(m, o, t, 0.55, 0.3, { type: 'lowpass', fs: [[0, 280 * p], [0.12, 1500 * p], [0.55, 330 * p]], q: 0.7, a: 0.02 });
      N(m, o, t + 0.12, 0.85, 0.04, { f: 4600, q: 0.9, a: 0.15, am: [21, 0.7] });   // soft fizz, bandpassed well below "hiss"
      crackle(m, o, t + 0.16, 9, 0.65, 0.07, p * 0.8);
      for (let i = 0; i < 4; i++) { const f = rnd(650, 1150) * p; T(m, o, t + 0.22 + rnd(0, 0.55), f, 0.045, 0.06, { f1: f * 1.6, a: 0.002 }); }
      return 1.05;
    },
    drill(m, o, t, p) {   // Usta Köstebek's hard-hat drill: a friendly toy "brrrrrr" that revs up, dirt and pebbles spraying
      const c = m.c, os = c.createOscillator(), g = gainNode(c, 0), lp = c.createBiquadFilter(), d = 0.72, end = t + d + 0.03;
      const am = gainNode(c, 0.55), l = c.createOscillator(), lg = gainNode(c, 0.45);
      os.setPeriodicWave(m.waves.sq);
      curve(os.frequency, t, [[0, 118 * p], [0.16, 188 * p], [0.56, 206 * p], [0.72, 150 * p]]);
      curve(l.frequency, t, [[0, 16], [0.2, 32], [0.72, 24]]);   // the rate of the "rrr"
      l.connect(lg); lg.connect(am.gain);
      lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 1.4;
      os.connect(lp); lp.connect(am); am.connect(g);
      env(g.gain, t, 0.05, 0.3, d, 1, 0.16); g.connect(o);
      os.start(t); os.stop(end); l.start(t); l.stop(end);
      N(m, o, t + 0.05, 0.62, 0.11, { f: 850 * p, q: 1, a: 0.06, hold: 1, rel: 0.2, am: [28, 0.8] });
      for (let i = 0; i < 6; i++) N(m, o, t + 0.1 + rnd(0, 0.55), 0.015, rnd(0.05, 0.1), { f: rnd(1400, 2600) * p, q: 2.5, a: 0.001 });
      return 0.78;
    },
    roll(m, o, t, p) {   // turtle tucks into its shell ("fwip") and rolls: a bumpy "rrrolll" with soft shell "tok"s
      T(m, o, t, 300 * p, 0.1, 0.18, { f1: 720 * p, glide: 0.07, a: 0.004 });
      N(m, o, t + 0.06, 0.95, 0.32, { fs: [[0, 320 * p], [0.35, 720 * p], [0.95, 360 * p]], q: 1.3, a: 0.1, hold: 1, rel: 0.32, am: [12, 0.8] });   // bandpass: no boomy sub-bass
      T(m, o, t + 0.06, 135 * p, 0.95, 0.1, { type: 'triangle', fs: [[0, 130 * p], [0.35, 205 * p], [0.95, 140 * p]], hold: 1, a: 0.1, rel: 0.3, vib: [12, 45, 0.02] });
      for (let i = 0; i < 7; i++) { const tt = t + 0.12 + i * 0.12 + rnd(0, 0.02); T(m, o, tt, rnd(400, 540) * p, 0.045, 0.08 * (1 - i * 0.08), { f1: 210 * p, a: 0.001 }); }
      return 1.05;
    },
    bounce(m, o, t, p) {   // big jelly hop: a squishy squeeze, then a springy "boi-oi-oing"
      N(m, o, t, 0.08, 0.13, { type: 'lowpass', f: 900, a: 0.01 });
      T(m, o, t + 0.03, 150 * p, 0.5, 0.42, { f1: 430 * p, glide: 0.15, a: 0.006, vib: [13, 60, 0.08] });
      T(m, o, t + 0.03, 300 * p, 0.34, 0.08, { f1: 860 * p, glide: 0.15, type: 'triangle', a: 0.006, vib: [13, 60, 0.08] });
      return 0.56;
    },
    chirp(m, o, t, p) {   // fire chick "cip-cip!": quick little up-and-down peeps
      const n = Math.random() < 0.35 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const tt = t + i * 0.1, f = 2000 * p * (i === n - 1 ? 1.1 : 1);
        T(m, o, tt, f, 0.075, 0.16, { fs: [[0, f * 0.8], [0.028, f * 1.12], [0.075, f * 0.92]], a: 0.004 });
        T(m, o, tt, f * 2, 0.05, 0.025, { fs: [[0, f * 1.6], [0.028, f * 2.24], [0.05, f * 1.9]], a: 0.004 });
      }
      return 0.1 * n + 0.06;
    },
    splat(m, o, t, p) {   // jelly blob lands: a wet squishy "splotch" and a wobbly low jiggle
      N(m, o, t, 0.16, 0.32, { fs: [[0, 1600 * p], [0.16, 380 * p]], q: 1.4, a: 0.002 });
      T(m, o, t, 260 * p, 0.22, 0.3, { f1: 110 * p, a: 0.002, vib: [18, 55, 0.03] });
      for (let i = 0; i < 3; i++) { const f = rnd(600, 1100) * p; T(m, o, t + rnd(0.04, 0.2), f, 0.04, 0.07, { f1: f * 1.5, a: 0.002 }); }
      return 0.32;
    },
    rumble(m, o, t, p) {   // gentle ground rumble (a boss about to pop up, the volcano grumbling): soft rolling murmur + pebbles
      N(m, o, t, 1.3, 0.42, { fs: [[0, 240 * p], [0.5, 460 * p], [1.3, 220 * p]], q: 0.9, a: 0.35, hold: 1, rel: 0.6, am: [7, 0.6] });   // bandpass: soft, not boomy
      T(m, o, t, 150 * p, 1.3, 0.06, { hold: 1, a: 0.4, rel: 0.6, vib: [5, 30, 0.1] });
      T(m, o, t, 98 * p, 1.3, 0.05, { type: 'triangle', hold: 1, a: 0.4, rel: 0.6, vib: [6, 30, 0.1] });
      for (let i = 0; i < 5; i++) N(m, o, t + 0.25 + rnd(0, 0.9), 0.015, rnd(0.03, 0.06), { f: rnd(1300, 2400) * p, q: 2.5, a: 0.001 });
      return 1.35;
    },
    // ── Round 4: Kefir Vadisi. Creamy, fizzy and bubbly; round and friendly, never hissy or gross.
    fizz(m, o, t, p) {   // kefir fizz: a soft sparkly shimmer of tiny bubbles rising and popping (bandpassed well below "hiss")
      N(m, o, t, 0.8, 0.1, { f: 3300 * p, q: 1.2, a: 0.05, am: [17, 0.8] });
      N(m, o, t, 0.5, 0.14, { fs: [[0, 800 * p], [0.5, 1800 * p]], q: 2.4, a: 0.03, am: [11, 0.6] });   // soft bubbly body, rising
      for (let i = 0; i < 12; i++) {   // little bubbles popping at the surface, quick upward "plip"s getting sparser
        const tt = t + 0.72 * Math.pow(i / 12, 1.35) + rnd(0, 0.03), f = rnd(1200, 2500) * p;
        T(m, o, tt, f, 0.035, rnd(0.07, 0.12) * (1 - i / 16), { f1: f * 1.9, a: 0.004 });
      }
      B(m, o, t + 0.14, 2637 * p, 0.35, 0.04, 3.5, 0.6); B(m, o, t + 0.38, 3136 * p, 0.35, 0.03, 3.5, 0.6);
      return 0.85;
    },
    cork(m, o, t, p) {   // friendly bottle pop: a round hollow "pok!", the cap spins away ("fwiii"), a little fizz and a happy "ting"
      N(m, o, t, 0.014, 0.28, { f: 1700 * p, q: 0.9, a: 0.0005 });   // the snap
      T(m, o, t, 420 * p, 0.1, 0.5, { fs: [[0, 420 * p], [0.012, 880 * p], [0.1, 540 * p]], a: 0.001 });   // cheek-pop body
      N(m, o, t + 0.004, 0.09, 0.16, { f: 760 * p, q: 9, a: 0.002 });   // hollow bottle-neck resonance
      T(m, o, t + 0.07, 900 * p, 0.2, 0.05, { f1: 1700 * p, a: 0.012, vib: [28, 60, 0.02] });   // the cap flying off
      for (let i = 0; i < 6; i++) { const f = rnd(1400, 2700) * p; T(m, o, t + 0.13 + rnd(0, 0.35), f, 0.03, 0.05, { f1: f * 1.8, a: 0.001 }); }
      B(m, o, t + 0.1, 2093 * p, 0.45, 0.05, 4, 0.8); B(m, o, t + 0.17, 2637 * p, 0.4, 0.035, 4, 0.8);
      return 0.6;
    },
    slurp(m, o, t, p) {   // Feza drinks a glass of kefir: a cute bubbly "sluuurp", two soft "gulp"s, a happy "ahh" sparkle
      N(m, o, t, 0.42, 0.32, { fs: [[0, 500 * p], [0.3, 1450 * p], [0.42, 1100 * p]], q: 3, a: 0.05, am: [26, 0.85] });
      T(m, o, t, 300 * p, 0.42, 0.06, { fs: [[0, 300 * p], [0.3, 600 * p], [0.42, 500 * p]], type: 'triangle', a: 0.04, vib: [26, 50, 0.02] });
      for (let i = 0; i < 2; i++) {
        const tt = t + 0.5 + i * 0.2;
        T(m, o, tt, 380 * p, 0.09, 0.15, { f1: 180 * p, a: 0.006 });
        N(m, o, tt, 0.04, 0.07, { type: 'lowpass', f: 700, a: 0.002 });
      }
      N(m, o, t + 0.92, 0.32, 0.05, { f: 1100 * p, q: 1.2, a: 0.05 });   // satisfied little breath
      T(m, o, t + 0.92, 620 * p, 0.28, 0.07, { f1: 880 * p, a: 0.03, vib: [9, 20, 0.05] });
      arp(m, o, t + 0.98, [1319, 1568, 2093], 0.06, 0.45, 0.05, p);
      return 1.45;
    },
    squish(m, o, t, p) {   // soft creamy squish (a yogurt hop, poking a pudding, stepping in cream): squeezy "sqlch" + tiny wobble
      N(m, o, t, 0.14, 0.26, { fs: [[0, 700 * p], [0.05, 1500 * p], [0.14, 600 * p]], q: 2.2, a: 0.006 });
      T(m, o, t, 200 * p, 0.16, 0.24, { fs: [[0, 200 * p], [0.05, 340 * p], [0.16, 150 * p]], a: 0.004, vib: [20, 45, 0.02] });
      N(m, o, t, 0.06, 0.1, { type: 'lowpass', f: 800, a: 0.003 });
      return 0.2;
    },
    moo(m, o, t, p) {   // a soft, cute cow far across the valley: a round "mmuuuu" (lifts, then settles) and a fainter echo
      const c = m.c, one = (t0, v, open, d) => {
        const os = c.createOscillator(), g = gainNode(c, 0), lp = c.createBiquadFilter(), fm = c.createBiquadFilter(), end = t0 + d + 0.05;
        os.setPeriodicWave(m.waves.brass);
        curve(os.frequency, t0, [[0, 176 * p], [0.2 * d, 214 * p], [0.62 * d, 204 * p], [d, 158 * p]]);
        const l = c.createOscillator(), lg = gainNode(c, 0);   // gentle vibrato arriving late
        l.frequency.value = 5; lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(16, t0 + d * 0.5); l.connect(lg); lg.connect(os.detune);
        lp.type = 'lowpass'; lp.Q.value = 1.1; curve(lp.frequency, t0, [[0, 300], [0.22 * d, open], [0.75 * d, open * 0.8], [d, 330]]);   // "m" → "uu" → closes
        fm.type = 'peaking'; fm.frequency.value = 400 * p; fm.Q.value = 2; fm.gain.value = 7;   // round "u" formant
        os.connect(lp); lp.connect(fm); fm.connect(g);
        env(g.gain, t0, 0.14, v, d, 1, d * 0.32); g.connect(o);
        os.start(t0); l.start(t0); os.stop(end); l.stop(end);
      };
      one(t, 0.1, 950, 0.95);
      one(t + 0.55, 0.022, 620, 0.8);   // echo from the far hills: quieter and duller
      return 1.45;
    },
    // extras
    nope(m, o, t, p) { T(m, o, t, 330 * p, 0.1, 0.14, { type: 'triangle', hold: 1, rel: 0.03 }); T(m, o, t + 0.12, 262 * p, 0.14, 0.14, { type: 'triangle', hold: 1, rel: 0.05 }); return 0.3; },
    open(m, o, t, p) { T(m, o, t, 620 * p, 0.09, 0.13, { f1: 930 * p }); B(m, o, t + 0.05, 1397 * p, 0.3, 0.05, 4, 0.7); return 0.35; },
    close(m, o, t, p) { T(m, o, t, 930 * p, 0.09, 0.13, { f1: 620 * p }); return 0.12; },
    cast(m, o, t, p) { N(m, o, t, 0.25, 0.14, { f: 800 * p, f1: 3000 * p, q: 1.2, a: 0.05 }); arp(m, o, t + 0.05, [1568, 2093], 0.05, 0.35, 0.06, p); return 0.4; },
  };
  // Loudness trim, calibrated offline (test/audio.html view=cal): voice ≈ -15, rewards -20…-23, combat -25…-28, steps -33
  // (speaker-weighted short-term loudness, dB). Keeps the order voice > effects > music.
  const SVOL = {
    swing: 0.42, swingBig: 0.58, hit: 0.82, hitSoft: 1.2, crit: 0.7, pop: 1.43, coin: 1.16, heart: 1.25, potion: 2.24,
    levelup: 2.12, unlock: 2.11, star: 1.89, spin: 1.5, ice: 1.64, shield: 1.44, zap: 3.8, meteorFall: 1.22, boom: 0.63,
    hurt: 1.24, chest: 2.54, portal: 2.12, break: 2.09, drop: 1.81, dropRare: 2.07, dropLegend: 2.74, click: 2.55, checkpoint: 2.67,
    roar: 0.68, bite: 1.53, spit: 1.95, fireball: 2.39, slam: 0.67, whoosh: 2.05, bat: 5.22, splash: 2.17, cheer: 2.61,
    step: 4.2, nope: 1.13, open: 2.12, close: 1.98, cast: 2.34,
    saberOn: 0.92, saberOff: 0.56, dig: 2.87, emerge: 1.13, bubble: 1.33, bubblePop: 1.83,
    lava: 0.68, erupt: 0.58, drill: 0.5, roll: 1.43, bounce: 0.61, chirp: 2.14, splat: 0.91, rumble: 1.36,
    fizz: 2.55, cork: 1.04, slurp: 3.1, squish: 1.19, moo: 0.64,
  };
  // Random pitch spread (semitones, default 0.45), min retrigger gap (s) and "droppable when busy".
  const SVAR = { levelup: 0.05, unlock: 0.05, checkpoint: 0.05, chest: 0.1, dropLegend: 0.05, dropRare: 0.15, portal: 0.1, click: 0.15, coin: 0.05, pop: 0.08,
    saberOn: 0.1, saberOff: 0.1, drill: 0.2, rumble: 0.25, erupt: 0.3, cork: 0.6, slurp: 0.2, moo: 1.2 };
  const SGAP = { step: 0.07, hit: 0.035, hitSoft: 0.035, coin: 0.035, pop: 0.05, swing: 0.06, bat: 0.12, spit: 0.05, drop: 0.05, zap: 0.04, boom: 0.05, heart: 0.05,
    saberOn: 0.2, saberOff: 0.2, dig: 0.14, emerge: 0.08, bubble: 0.08, bubblePop: 0.04,
    lava: 0.3, erupt: 0.18, drill: 0.35, roll: 0.3, bounce: 0.1, chirp: 0.14, splat: 0.06, rumble: 0.7,
    fizz: 0.12, cork: 0.12, slurp: 0.5, squish: 0.06, moo: 7 };   // moo: a rare ambient, never twice within 7 s however often it is asked for
  const LOW = { step: 1, hitSoft: 1, swing: 1, bat: 1, spit: 1, drop: 1, click: 1, whoosh: 1, dig: 1, bubblePop: 1, lava: 1, chirp: 1, splat: 1,
    fizz: 1, squish: 1, moo: 1 };
  const STREAK = [0, 2, 4, 7, 9, 12, 14, 16];   // coins picked up / enemies cheered up in a row climb a pentatonic scale

  function playRecipe(m, name, o, t) {
    const c = m.c, g = gainNode(c, o.g);
    let head = g;
    if (o.pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = o.pan; g.connect(pn); head = pn; }
    head.connect(m.sfx);
    const len = SFX[name](m, g, t, o.p) || 1;
    return { len, g, head };
  }

  // Distance attenuation (full within 4 m, ~0.6 at 10 m, ~0.16 at 20 m) and gentle stereo pan by screen x.
  function spatial(x, z) {
    if (x === undefined || z === undefined) return [1, 0];
    const dx = x - lx, dz = z - lz, d = Math.sqrt(dx * dx + dz * dz), e = Math.max(0, d - 4) / 7;
    return [1 / (1 + e * e), cl(dx / 14, -0.7, 0.7)];
  }
  let active = 0, stepAlt = 0, effectEpoch = 0;
  const lastT = {}, streak = { coin: [0, -9], pop: [0, -9] }, warned = {};
  function sfx(name, o) {
    if (!unlocked || !M || !A.soundOn || document.hidden || pageAway) return false;
    if (!SFX[name]) { if (!warned[name]) { warned[name] = 1; console.warn('AUD.sfx: unknown sound', name); } return false; }
    if (typeof o === 'number') o = { vol: o };
    o = o || {};
    const now = ctx.currentTime;
    if (now - (lastT[name] ?? -9) < (SGAP[name] ?? 0.025)) return false;
    if (active > 34 || (active > 22 && LOW[name])) return false;
    const sp = spatial(o.x, o.z), g = (o.vol ?? 1) * (SVOL[name] ?? 1) * sp[0], pan = sp[1];
    if (g < 0.02) return false;
    lastT[name] = now;
    let p = (o.pitch || 1) * semi(rnd(-1, 1) * (SVAR[name] ?? 0.45));
    if (name === 'step') p *= (stepAlt ^= 1) ? 1.04 : 0.96;
    const s = streak[name];
    if (s) { s[0] = now - s[1] < 0.5 ? Math.min(s[0] + 1, STREAK.length - 1) : 0; s[1] = now; p *= semi(STREAK[s[0]]); }
    try {
      const r = playRecipe(M, name, { g, p, pan }, now + 0.008);
      active++; const epoch = effectEpoch;
      setTimeout(() => { if (epoch === effectEpoch) active = Math.max(0, active - 1); try { r.head.disconnect(); } catch (e) { /* already gone */ } }, (r.len + 0.4) * 1000);
    } catch (e) { console.warn('AUD.sfx', name, e); return false; }
    return true;
  }

  // ───────────────────────── music: instruments ─────────────────────────
  const INST = {
    pad(m, out, t, f, d, v) { for (const det of [-9, 9]) T(m, out, t, f, d, v * 0.5, { wave: 'saw', det, hold: 1, a: Math.min(0.6, d * 0.3), rel: Math.min(0.9, d * 0.4) }); },
    bass(m, out, t, f, d, v) { T(m, out, t, f, d, v, { type: 'triangle', hold: 1, a: 0.012, rel: 0.08 }); T(m, out, t, f, d, v * 0.6, { hold: 1, a: 0.012, rel: 0.08 }); },
    pbass(m, out, t, f, d, v) { d = Math.max(d, 0.3); T(m, out, t, f, d, v, { wave: 'saw', lp: [[0, f * 7], [0.12, f * 2.2]], q: 2, a: 0.004 }); T(m, out, t, f, d, v * 0.7, { a: 0.004 }); },
    marimba(m, out, t, f, d, v) { d = cl(d * 2, 0.35, 0.8); T(m, out, t, f, d, v, { a: 0.002 }); T(m, out, t, f * 4, d * 0.16, v * 0.22, { a: 0.001 }); },
    kalimba(m, out, t, f, d, v) { T(m, out, t, f, 0.9, v, { a: 0.002 }); T(m, out, t, f * 5.4, 0.07, v * 0.18, { a: 0.001 }); },
    celesta(m, out, t, f, d, v) { B(m, out, t, f, 1.1, v, 4, 0.85); T(m, out, t, f * 2, 0.3, v * 0.12, { a: 0.001 }); },
    glock(m, out, t, f, d, v) { T(m, out, t, f, 1.2, v, { a: 0.001 }); T(m, out, t, f * 2.76, 0.35, v * 0.3, { a: 0.001 }); T(m, out, t, f * 5.4, 0.12, v * 0.1, { a: 0.001 }); },
    ocarina(m, out, t, f, d, v) { T(m, out, t, f, Math.max(d, 0.12), v, { wave: 'flute', hold: 1, a: 0.035, rel: 0.08, vib: [5.2, 14, 0.18] }); N(m, out, t, 0.08, v * 0.06, { f: f * 2, q: 6, a: 0.01 }); },
    brass(m, out, t, f, d, v) { d = Math.max(d, 0.12); T(m, out, t, f, d, v, { wave: 'brass', hold: 1, a: 0.025, rel: 0.09, lp: [[0, f * 1.5], [0.05, f * 5], [0.25, f * 3]], q: 1, vib: [5.5, 9, 0.22] }); },
    chip(m, out, t, f, d, v) { T(m, out, t, f, Math.max(d, 0.08), v, { wave: 'sq', lp: 3500, hold: 1, a: 0.005, rel: 0.04, vib: [6, 8, 0.15] }); },
    pluck(m, out, t, f, d, v) { T(m, out, t, f, cl(d * 2, 0.25, 0.6), v, { wave: 'saw', lp: [[0, f * 8], [0.1, f * 2]], a: 0.002 }); },
    // steel pan: round sine body (starts a hair sharp), strong octave, a little twelfth and a bright stick "ping" that mellows fast
    steel(m, out, t, f, d, v) {
      const dd = cl(d * 2.2, 0.45, 1.0);
      T(m, out, t, f, dd, v, { fs: [[0, f * 1.012], [0.03, f]], a: 0.003 });
      T(m, out, t, f * 2, dd * 0.6, v * 0.5, { det: 3, a: 0.002 });
      T(m, out, t, f * 3, dd * 0.28, v * 0.2, { det: -5, a: 0.001 });
      T(m, out, t, f * 4.02, 0.06, v * 0.1, { a: 0.001 });
    },
    // ── Round 4: Kefir Vadisi's little village band ──
    // accordion: two reeds tuned a hair apart (the "musette" shimmer, ~3 Hz beating), soft bellows attack, gently rounded top
    accordion(m, out, t, f, d, v) {
      d = Math.max(d, 0.05);   // short enough for the quick folk-turn notes
      const lp = Math.min(f * 5, 4000);
      T(m, out, t, f, d, v * 0.55, { wave: 'saw', det: -7, lp, q: 0.6, hold: 1, a: 0.03, rel: 0.07 });
      T(m, out, t, f, d, v * 0.45, { wave: 'sq', det: 8, lp, q: 0.6, hold: 1, a: 0.035, rel: 0.07 });
    },
    // ukulele: soft nylon pluck (the brightness closes quickly), a hair of pitch settle at the start
    uke(m, out, t, f, d, v) { T(m, out, t, f, 0.5, v, { wave: 'saw', fs: [[0, f * 1.006], [0.02, f]], lp: [[0, f * 6], [0.05, f * 2.2], [0.5, f * 1.2]], q: 0.8, a: 0.002 }); },
    // xylophone: hard mallet on a wooden bar: bright body, its tuned 3rd-harmonic overtone and a tiny woody tick, short
    xylo(m, out, t, f, d, v) {
      T(m, out, t, f, 0.34, v, { a: 0.001 });
      T(m, out, t, f * 3, 0.13, v * 0.28, { a: 0.001 });
      T(m, out, t, Math.min(f * 6.3, 16000), 0.025, v * 0.1, { a: 0.0005 });
    },
    // bağlama (saz): bright metallic pluck with its octave string; long notes turn into the saz's quick tremolo picking
    saz(m, out, t, f, d, v) {
      const one = (tt, vv) => {
        T(m, out, tt, f, 0.38, vv, { wave: 'saw', det: 4, lp: [[0, f * 9], [0.05, f * 3], [0.38, f * 1.6]], q: 1.5, a: 0.001 });
        T(m, out, tt, f * 2, 0.22, vv * 0.3, { wave: 'saw', det: -6, lp: [[0, f * 10], [0.05, f * 4]], q: 1, a: 0.001 });
      };
      if (d < 0.32) { one(t, v); return; }
      const step = 0.078, n = Math.min(8, Math.floor(d / step));
      for (let i = 0; i < n; i++) one(t + i * step, v * (i ? 0.5 - i * 0.025 : 1));
    },
  };
  const DRUM = {
    kick(m, o, t, v) { T(m, o, t, 150, 0.22, v, { fs: [[0, 150], [0.09, 50]], a: 0.002 }); N(m, o, t, 0.012, v * 0.2, { type: 'lowpass', f: 1800 }); },
    snare(m, o, t, v) { N(m, o, t, 0.13, v, { f: 1900, q: 0.8, a: 0.001 }); T(m, o, t, 200, 0.07, v * 0.5, { f1: 160, type: 'triangle' }); },
    rim(m, o, t, v) { T(m, o, t, 820, 0.035, v, { a: 0.001 }); N(m, o, t, 0.025, v * 0.5, { f: 2400, q: 2, a: 0.001 }); },
    clap(m, o, t, v) { for (let i = 0; i < 3; i++) N(m, o, t + i * 0.011, 0.02, v * 0.7, { f: 1300, q: 1.1, a: 0.001 }); N(m, o, t + 0.03, 0.12, v * 0.55, { f: 1300, q: 1.1, a: 0.002 }); },
    hat(m, o, t, v) { N(m, o, t, 0.035, v, { type: 'highpass', f: 7500, q: 0.7, a: 0.001 }); },
    shaker(m, o, t, v) { N(m, o, t, 0.07, v, { f: 5500, q: 1.2, a: 0.012 }); },
    wood(m, o, t, v) { T(m, o, t, 1000, 0.06, v, { a: 0.001 }); T(m, o, t, 2300, 0.03, v * 0.3, { a: 0.001 }); },
    tamb(m, o, t, v) { N(m, o, t, 0.06, v, { type: 'highpass', f: 6500, a: 0.002 }); N(m, o, t, 0.12, v * 0.5, { f: 9000, q: 4, a: 0.002 }); },
    crash(m, o, t, v) { N(m, o, t, 1.4, v, { type: 'highpass', f: 5000, q: 0.5, a: 0.005 }); },
    swell(m, o, t, v, d = 1) { N(m, o, t, d, v, { type: 'highpass', f: 4000, q: 0.5, a: d * 0.9, hold: 1, rel: 0.05 }); },
    timp(m, o, t, v, f = 98) { T(m, o, t, f * 1.4, 0.6, v, { f1: f, glide: 0.05, a: 0.003 }); N(m, o, t, 0.1, v * 0.3, { type: 'lowpass', f: 300 }); },
    conga(m, o, t, v, f = 196) { T(m, o, t, f * 1.35, 0.26, v, { f1: f, glide: 0.03, a: 0.002 }); N(m, o, t, 0.02, v * 0.3, { f: 1800, q: 1.2, a: 0.001 }); },
    bongo(m, o, t, v, f = 392) { T(m, o, t, f * 1.3, 0.13, v, { f1: f, glide: 0.02, a: 0.001 }); N(m, o, t, 0.012, v * 0.3, { f: 3000, q: 1.5, a: 0.001 }); },
    // darbuka: "düm" = round centre stroke (with a higher body partial so tablet speakers still hear it), "tek" = crisp rim, "ka" = soft rim
    dum(m, o, t, v) { T(m, o, t, 150, 0.3, v, { fs: [[0, 150], [0.05, 104]], a: 0.002 }); T(m, o, t, 245, 0.11, v * 0.35, { f1: 195, a: 0.002 }); N(m, o, t, 0.02, v * 0.15, { type: 'lowpass', f: 1500 }); },
    tek(m, o, t, v) { T(m, o, t, 720, 0.06, v * 0.5, { f1: 640, a: 0.0008 }); N(m, o, t, 0.05, v, { f: 3200, q: 1.4, a: 0.0008 }); },
    ka(m, o, t, v) { N(m, o, t, 0.035, v, { f: 2600, q: 1.6, a: 0.001 }); T(m, o, t, 680, 0.04, v * 0.3, { a: 0.001 }); },
  };

  // ───────────────────────── music: themes ─────────────────────────
  const MAJ = [0, 2, 4, 5, 7, 9, 11], DOR = [0, 2, 3, 5, 7, 9, 10], AEO = [0, 2, 3, 5, 7, 8, 10];
  const IV = { M: [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10], s4: [0, 5, 7], s2: [0, 2, 7], a9: [0, 4, 7, 14], m9: [0, 3, 7, 14], D7: [0, 4, 7, 10] };
  const C = (r, q) => ({ r, iv: IV[q] });
  // 16-bar forms "a b c d | a b c e | bridge | a b c e" so the melody's A phrase fits both halves.
  const form = (a, b, c, d, e, br) => [a, b, c, d, a, b, c, e].concat(br, [a, b, c, e]);
  const THEMES = {
    title: {   // warm, inviting lullaby: pad + kalimba arpeggios + music-box melody
      bpm: 76, key: 5, scale: MAJ, vol: 0.88, swing: 0,
      prog: form(C(41, 'M7'), C(38, 'm7'), C(46, 'M7'), C(48, 's4'), C(48, 'M'), [C(43, 'm7'), C(48, 'M'), C(45, 'm7'), C(38, 'm7')]),
      pad: { vol: 0.034, lo: 60, n: 3, cut: 1100 },
      bass: { inst: 'bass', pat: ['r.....5.'], vol: 0.045, oct: 12 },
      arp: { inst: 'kalimba', step: 8, pat: ['01232123', '01232101'], lo: 65, vol: 0.028 },
      lead: { inst: 'celesta', alt: 'kalimba', lo: 72, hi: 86, vol: 0.042, cells: 'slow', plan: [1, 1, 0, 1] },
      kit: { shaker: ['..o...o...o...o.', 0.01] }, drumsIn: 8,
      extra(p, t, bar, ch) { if (bar % 2 && Math.random() < 0.5) p.note('celesta', t + p.beat * pick([1.5, 2.5, 3.5]), pick(ch.iv) + ch.r + 36, 1, 0.012); },
    },
    orman: {   // bright, playful adventure: bouncy bass, marimba, ocarina tune, shaker
      bpm: 112, key: 0, scale: MAJ, vol: 0.91, swing: 0.14,
      prog: form(C(48, 'M'), C(43, 'M'), C(45, 'm'), C(41, 'M'), C(43, 'D7'), [C(41, 'M'), C(43, 'M'), C(40, 'm'), C(45, 'm')]),
      pad: { vol: 0.02, lo: 60, n: 3, cut: 1400 },
      bass: { inst: 'pbass', pat: ['r.f.r.5.', 'r.f.r.5o'], vol: 0.09 },
      stab: { inst: 'marimba', pos: [2, 6], lo: 62, n: 2, vol: 0.03 },
      lead: { inst: 'ocarina', alt: 'marimba', lo: 67, hi: 84, vol: 0.05, cells: 'mid', plan: [1, 1, 2, 1] },
      kit: { kick: ['x.......x.......', 0.13], rim: ['....o.......o...', 0.05], shaker: ['o.x.o.x.o.x.o.x.', 0.016], wood: ['..............x.', 0.03] },
      fill(p, t, bar, ch) { const v = voice(ch, 72, 4); v.forEach((mm, i) => p.note('marimba', t + p.beat * (3 + i * 0.25), mm, 0.2, 0.03)); },
    },
    magara: {   // mysterious but friendly: dark-warm pad, echoing celesta, water drops, twinkles
      bpm: 80, key: 2, scale: DOR, vol: 0.81, swing: 0,
      prog: form(C(38, 'm9'), C(46, 'M7'), C(41, 'a9'), C(48, 'M'), C(45, 's4'), [C(43, 'm7'), C(38, 'm7'), C(46, 'M7'), C(48, 'M')]),
      pad: { vol: 0.038, lo: 60, n: 4, cut: 900 },
      bass: { inst: 'bass', pat: ['r...5...'], vol: 0.045, oct: 12 },
      arp: { inst: 'celesta', step: 8, pat: ['0.12.3.2', '0.13.2.1'], lo: 69, vol: 0.02, echo: 1 },
      lead: { inst: 'kalimba', alt: 'celesta', lo: 69, hi: 86, vol: 0.045, cells: 'slow', plan: [1, 1, 0, 1], echo: 1 },
      kit: { shaker: ['....o.......o...', 0.009] },
      extra(p, t, bar) {
        if (Math.random() < 0.6) { const tt = t + p.beat * rnd(0, 3.5), f = rnd(1000, 1500); T(p.M, p.out, tt, f, 0.06, 0.018, { f1: f * 2.1 }); T(p.M, p.out, tt + p.beat * 0.75, f, 0.06, 0.007, { f1: f * 2.1 }); }
        if (Math.random() < 0.5) B(p.M, p.out, t + p.beat * pick([0.5, 1.5, 2.5, 3.5]), pick([2349, 2637, 2794, 3136, 3520]), 0.8, 0.012, 3.5, 0.9);
      },
    },
    yanardag: {   // warm, bouncy volcano adventure: calypso steel-pan tune, marimba comping, congas + clave, a lava "blup" now and then
      bpm: 120, key: 7, scale: MAJ, vol: 0.94, swing: 0.1,
      prog: form(C(43, 'M'), C(48, 'M'), C(45, 'm7'), C(50, 's4'), C(50, 'D7'), [C(40, 'm'), C(48, 'M'), C(45, 'm7'), C(50, 'D7')]),
      pad: { vol: 0.018, lo: 60, n: 3, cut: 1500 },
      bass: { inst: 'pbass', pat: ['r..5r.5.', 'r..5r.3o'], vol: 0.085 },
      stab: { inst: 'marimba', pos: [2, 5, 6], lo: 64, n: 2, vol: 0.022 },
      lead: { inst: 'steel', alt: 'marimba', lo: 67, hi: 84, vol: 0.05, cells: 'mid', plan: [1, 1, 2, 1] },
      kit: { kick: ['x.......x.......', 0.12], conga: ['......x...o.x...', 0.05], bongo: ['..o.......x...o.', 0.035],
        wood: ['x..x..x...x.x...', 0.02], shaker: ['o.x.o.x.o.x.o.x.', 0.013] }, crash: 0.02,
      fill(p, t) { for (let i = 8; i < 16; i++) p.drum(i & 1 ? 'bongo' : 'conga', t + i * p.beat / 4, 0.03 + (i - 8) * 0.004); },
      extra(p, t, bar, ch) {
        if (Math.random() < 0.35) { const tt = t + p.beat * pick([0.5, 1.5, 2.5, 3.5]), f = rnd(170, 230); T(p.M, p.out, tt, f, 0.12, 0.03, { f1: f * 2.3, glide: 0.08, a: 0.006 }); }
        if (bar % 4 === 3 && Math.random() < 0.6) voice(ch, 79, 3).forEach((mm, i) => p.note('steel', t + p.beat * (3 + i / 6), mm, 0.2, 0.017));   // pan twinkle
      },
    },
    kefir: {   // the happiest theme: a sunny village band in the kefir valley. Accordion tune with little folk turns and a
               // xylophone twin an octave up, ukulele strums, oom-pah bass, darbuka "düm-tek"; the bridge goes to a bağlama
               // tremolo (the light Anatolian touch); now and then a xylophone run, the fence bells and a far-away cuckoo
      bpm: 126, key: 5, scale: MAJ, vol: 1.0, swing: 0.12, drumsIn: 4,
      prog: form(C(41, 'M'), C(45, 'm7'), C(46, 'M'), C(48, 's4'), C(48, 'D7'), [C(46, 'M'), C(41, 'M'), C(43, 'm7'), C(48, 'M')]),
      pad: { vol: 0.015, lo: 60, n: 3, cut: 1300 },
      bass: { inst: 'pbass', pat: ['r.5.r.5.', 'r.5.r.3o'], vol: 0.09 },
      lead: { inst: 'accordion', alt: 'saz', lo: 67, hi: 84, vol: 0.05, cells: 'mid', plan: [1, 1, 2, 1], orn: 0.3, dbl: { inst: 'xylo', vol: 0.02, oct: 12 } },
      kit: { dum: ['x.......x.....o.', 0.1], tek: ['..x...x.....x...', 0.034], tamb: ['..o...o...o...o.', 0.008] },
      fill(p, t) { for (let i = 10; i < 16; i++) p.drum(i & 1 ? 'ka' : 'tek', t + i * p.beat / 4, 0.02 + (i - 10) * 0.005); },   // "te-ka-te-ka" roll
      extra(p, t, bar, ch) {
        const e8 = p.beat / 2, sw = p.th.swing * e8, v = voice(ch, 60, 4), PAT = 'D.DU.UDU';   // "island" strum: down, down-up, up-down-up
        for (let i = 0; i < 8; i++) {
          const s = PAT[i]; if (s === '.') continue;
          const tt = t + i * e8 + (i & 1 ? sw : 0), up = s === 'U', ns = up ? v.slice(1).reverse() : v, vol = up ? 0.014 : i % 4 === 0 ? 0.024 : 0.019;
          ns.forEach((mm, k) => p.note('uke', tt + k * 0.012, mm, e8, vol));
        }
        if (bar % 8 === 3 && Math.random() < 0.7) voice(ch, 84, 4).forEach((mm, i) => p.note('xylo', t + p.beat * (3 + i / 4), mm, 0.2, 0.016));   // xylophone run
        if (bar % 16 === 11 && Math.random() < 0.6) [96, 100].forEach((mm, i) => B(p.M, p.out, t + p.beat * (2.5 + i * 0.5), mtof(mm), 0.7, 0.012, 3.5, 0.9));   // fence bells
        if (bar % 16 === 13 && Math.random() < 0.5) [84, 81].forEach((mm, i) => { p.note('ocarina', t + p.beat * (2 + i * 0.75), mm, p.beat * 0.55, 0.011); p.note('ocarina', t + p.beat * (3.5 + i * 0.75), mm, p.beat * 0.5, 0.0035); });   // cuckoo + echo
      },
    },
    kale: {   // heroic, bouncy march: brass tune, oom-pah, snare
      bpm: 116, key: 2, scale: MAJ, vol: 1.02, swing: 0,
      prog: form(C(50, 'M'), C(43, 'M'), C(45, 'M'), C(47, 'm'), C(45, 'D7'), [C(43, 'M'), C(45, 'M'), C(42, 'm'), C(47, 'm')]),
      pad: { vol: 0.024, lo: 60, n: 3, cut: 1300 },
      bass: { inst: 'pbass', pat: ['r.5.r.5.', 'r.5.r.5o'], vol: 0.09 },
      stab: { inst: 'pluck', pos: [2, 6], lo: 62, n: 3, vol: 0.022 },
      lead: { inst: 'brass', alt: 'glock', lo: 66, hi: 81, vol: 0.042, cells: 'mid', plan: [1, 1, 2, 1], dbl: { inst: 'glock', vol: 0.012, oct: 12 } },
      kit: { kick: ['x.......x.....o.', 0.14], snare: ['....x.......x...', 0.05], hat: ['x.o.x.o.x.o.x.o.', 0.01] }, crash: 0.028,
      fill(p, t) { for (let i = 8; i < 16; i++) p.drum('snare', t + i * p.beat / 4, 0.02 + (i - 8) * 0.006); },
    },
    boss: {   // energetic and exciting, still friendly: four-on-the-floor, arpeggiator, brass/chip tune
      bpm: 136, key: 9, scale: AEO, vol: 1.04, swing: 0,
      prog: form(C(45, 'm'), C(41, 'M'), C(48, 'M'), C(43, 'M'), C(40, 's4'), [C(41, 'M'), C(43, 'M'), C(40, 'm'), C(45, 'm')]),
      pad: { vol: 0.022, lo: 60, n: 3, cut: 1600 },
      bass: { inst: 'pbass', pat: ['rorororo'], vol: 0.08 },
      arp: { inst: 'chip', step: 16, pat: ['0123212301232123'], lo: 69, vol: 0.013 },
      lead: { inst: 'brass', alt: 'chip', lo: 64, hi: 81, vol: 0.04, cells: 'busy', plan: [1, 1, 2, 1] },
      kit: { kick: ['x...x...x...x...', 0.15], clap: ['....x.......x...', 0.045], hat: ['..x...x...x...x.', 0.013] }, crash: 0.03,
      fill(p, t) { for (let i = 12; i < 16; i++) p.drum('snare', t + i * p.beat / 4, 0.03 + (i - 12) * 0.008); },
    },
    zafer: {   // victory: fanfare, then a happy glockenspiel loop with claps and tambourine
      bpm: 118, key: 0, scale: MAJ, vol: 0.82, swing: 0, fadeIn: 0.05,
      prog: form(C(48, 'M'), C(45, 'm'), C(41, 'M'), C(43, 'M'), C(43, 'D7'), [C(41, 'M'), C(43, 'M'), C(40, 'm'), C(45, 'm')]),
      pad: { vol: 0.024, lo: 60, n: 3, cut: 1500 },
      bass: { inst: 'pbass', pat: ['r.5.r.5.', 'r.3.5.o.'], vol: 0.085 },
      stab: { inst: 'marimba', pos: [2, 6], lo: 64, n: 2, vol: 0.026 },
      lead: { inst: 'glock', alt: 'ocarina', lo: 72, hi: 88, vol: 0.042, cells: 'mid', plan: [1, 1, 2, 1] },
      kit: { kick: ['x.......x.......', 0.13], clap: ['....x.......x...', 0.042], tamb: ['o.x.o.x.o.x.o.x.', 0.01] }, crash: 0.025,
      fill(p, t) { for (let i = 12; i < 16; i++) p.drum('snare', t + i * p.beat / 4, 0.025 + (i - 12) * 0.007); },
      intro(p, t0) {
        const b = p.beat, br = (ms, t, d, v) => ms.forEach(mm => p.note('brass', t, mm, d, v));
        [0, 1 / 3, 2 / 3].forEach(x => { br([55, 67], t0 + x * b, b * 0.26, 0.05); p.drum('snare', t0 + x * b, 0.03); });
        const t1 = t0 + b;   // bar 1: C … F G, snare roll into bar 2: big C chord with sparkles
        br([60, 64, 67, 72], t1, b * 1.4, 0.04); p.note('glock', t1, 84, 1, 0.05); p.drum('timp', t1, 0.2, 65);
        br([65, 69, 72], t1 + b * 1.5, b * 0.45, 0.04); p.drum('timp', t1 + b * 1.5, 0.14, 87);
        br([67, 71, 74], t1 + b * 2, b * 1.9, 0.04); p.drum('timp', t1 + b * 2, 0.16, 98); p.drum('swell', t1 + b * 2, 0.03, b * 2);
        for (let i = 0; i < 8; i++) p.drum('snare', t1 + b * (2 + i * 0.25), 0.015 + i * 0.006);
        const t2 = t1 + b * 4;
        br([60, 64, 67, 72, 76], t2, b * 3.5, 0.036); p.drum('timp', t2, 0.22, 65); p.drum('crash', t2, 0.05);
        for (let i = 0; i < 12; i++) p.note('glock', t2 + i * b / 4, [72, 76, 79][i % 3] + 12 * Math.floor(i / 3), 0.6, 0.03);
        return b * 9;
      },
    },
  };
  // Chord tones ascending from lo.
  function voice(ch, lo, n) {
    const pcs = ch.iv.map(i => (ch.r + i) % 12), out = [];
    for (let mm = lo; out.length < n && mm < lo + 40; mm++) if (pcs.includes(mm % 12)) out.push(mm);
    return out;
  }

  // ── generative melody: 4-bar phrases in an A A' B A' form, regenerated every so often ──
  const CELLS = {
    slow: [[[0, 4], [4, 4]], [[0, 2], [2, 2], [4, 4]], [[0, 6], [6, 2]], [[0, 3], [3, 1], [4, 4]], [[2, 2], [4, 4]], [[0, 4], [4, 2], [6, 2]]],
    mid: [[[0, 2], [2, 2], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 2], [4, 2], [6, 2]], [[0, 3], [3, 1], [4, 2], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 4]],
      [[0, 2], [2, 2], [4, 4]], [[1, 1], [2, 2], [4, 1], [5, 1], [6, 2]], [[0, 4], [4, 1], [5, 1], [6, 2]]],
  };
  CELLS.busy = CELLS.mid.concat([[[0, 1], [1, 1], [2, 1], [3, 1], [4, 2], [6, 2]], [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 2]], [[0, 2], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1]]]);
  const ENDS = [[[0, 2], [2, 2], [4, 4]], [[0, 4], [4, 4]], [[0, 2], [2, 6]], [[0, 1], [1, 1], [2, 6]]];
  const ENDS_SLOW = [[[0, 4], [4, 4]], [[0, 8]], [[0, 2], [2, 6]]];
  function scaleNotes(th) {
    const out = [];
    for (let mm = th.lead.lo - 12; mm <= th.lead.hi + 12; mm++) if (th.scale.includes(((mm - th.key) % 12 + 12) % 12)) out.push(mm);
    return out;
  }
  // Nearest scale index whose pitch class is in pcs, searching in the melody's direction first.
  function toPc(sc, i, pcs, dir = 1) {
    for (let k = 0; k < 8; k++) for (const s of k ? [dir, -dir] : [1]) { const j = i + k * s; if (j >= 0 && j < sc.length && pcs.includes(sc[j] % 12)) return j; }
    return cl(i, 0, sc.length - 1);
  }
  function genBars(th, bar0, b0, b1, startM, end) {
    const L = th.lead, sc = th._sc || (th._sc = scaleNotes(th)), cells = CELLS[L.cells || 'mid'], out = [], mid = (L.lo + L.hi) / 2, span = L.hi - L.lo;
    let i = 0, dir = Math.random() < 0.5 ? 1 : -1, p1 = -1, p2 = -1;
    for (let k = 1; k < sc.length; k++) if (Math.abs(sc[k] - startM) < Math.abs(sc[i] - startM)) i = k;
    for (let b = b0; b < b1; b++) {
      const ch = th.prog[(bar0 + b) % th.prog.length], pcs = ch.iv.map(x => (ch.r + x) % 12);
      const last = b === 3, cell = last ? pick(L.cells === 'slow' ? ENDS_SLOW : ENDS) : pick(cells);
      for (let k = 0; k < cell.length; k++) {
        const s = cell[k][0], d = cell[k][1], off = sc[i] - mid;
        if (Math.abs(off) > span * 0.3 && Math.random() < 0.75) dir = off > 0 ? -1 : 1;   // gravity toward the middle
        if (last && k === cell.length - 1) i = toPc(sc, i, end === 'a' ? (pcs.includes(th.key) ? [th.key] : [pcs[0]]) : [pcs[1], pcs[2]], dir);
        else if (s % 4 === 0) i = toPc(sc, i + dir * (Math.random() < 0.3 ? 2 : 1), pcs, dir);   // chord tone on strong beats
        else { i += dir * (Math.random() < 0.8 ? 1 : 2); if (Math.random() < 0.25) dir = -dir; }
        i = cl(i, 0, sc.length - 1);
        while (sc[i] > L.hi && i > 0) { i--; dir = -1; }
        while (sc[i] < L.lo && i < sc.length - 1) { i++; dir = 1; }
        if (i === p1 && i === p2) { i = cl(i + dir, 0, sc.length - 1); if (sc[i] > L.hi || sc[i] < L.lo) i = cl(i - 2 * dir, 0, sc.length - 1); }   // no 3 repeats
        p2 = p1; p1 = i;
        out.push({ s: b * 8 + s, d, m: sc[i] });
      }
    }
    return out;
  }

  // ── theme player: schedules one whole bar at a time, a little ahead of the audio clock ──
  class Player {
    constructor(m, name, t0) {
      const th = THEMES[name], c = m.c;
      this.m = m; this.M = m; this.th = th; this.name = name; this.beat = 60 / th.bpm; this.bar = 0; this.stopAt = Infinity;
      this.out = gainNode(c, 0); this.out.connect(m.music);
      this.padF = c.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.Q.value = 0.5;
      this.padF.frequency.value = th.pad ? th.pad.cut : 1000; this.padF.connect(this.out);
      this.lfo = c.createOscillator(); this.lfo.frequency.value = 0.06;
      const lg = gainNode(c, (th.pad ? th.pad.cut : 1000) * 0.3); this.lfo.connect(lg); lg.connect(this.padF.frequency); this.lfo.start(t0);
      this.ph = -1; this.A = this.A2 = this.cur = null; this.inst = null;
      this.t = t0 + (th.intro ? th.intro(this, t0) : 0);
    }
    note(inst, t, midi, dur, vol) { INST[inst](this.m, inst === 'pad' ? this.padF : this.out, t, mtof(midi), dur, vol); }
    drum(name, t, v, x) { DRUM[name](this.m, this.out, t, v, x); }
    // Own ramp bookkeeping instead of reading AudioParam.value mid-automation (not reliable on every Safari).
    fade(to, t, dur) {
      const g = this.out.gain, f = this.f, from = f ? f[0] + (f[1] - f[0]) * cl((t - f[2]) / Math.max(1e-3, f[3] - f[2]), 0, 1) : 0;
      g.cancelScheduledValues(t); g.setValueAtTime(from, t); g.linearRampToValueAtTime(to, t + dur);
      this.f = [from, to, t, t + dur];
    }
    stop(t, dur) { this.fade(0, t, dur); this.stopAt = t + dur; try { this.lfo.stop(t + dur + 3); } catch (e) { /* ignore */ } }
    pump(until) {
      const c = this.m.c;
      // fell behind (e.g. main thread stalled): skip ahead instead of piling notes into the past
      if (c.currentTime > 0 && this.t < c.currentTime - 0.05 && this.t < this.stopAt) {
        const bars = Math.ceil((Math.min(c.currentTime - 0.05, this.stopAt) - this.t) / (this.beat * 4));
        this.t += bars * this.beat * 4; this.bar += bars;
      }
      while (this.t < until && this.t < this.stopAt) { this.arrange(this.t, this.bar); this.t += this.beat * 4; this.bar++; }
    }
    leadBar(bar) {
      const th = this.th, L = th.lead, ph = Math.floor(bar / 4), part = ph % 4, mid = (L.lo + L.hi) >> 1, start = ph * 4;
      if (ph !== this.ph) {
        this.ph = ph;
        if (!this.A || (part === 0 && Math.random() < 0.6)) { this.A = genBars(th, start - part * 4, 0, 4, mid, 'q'); this.A2 = null; }
        if (part === 1 || part === 3) {
          if (!this.A2) { const keep = this.A.filter(n => n.s < 24); this.A2 = keep.concat(genBars(th, start - (part - 1) * 4, 3, 4, keep.length ? keep[keep.length - 1].m : mid, 'a')); }
          this.cur = this.A2;
        } else this.cur = part === 2 ? genBars(th, start, 0, 4, this.A[this.A.length - 1].m, 'a') : this.A;
        this.inst = L.plan[part] === 2 ? L.alt : L.plan[part] ? L.inst : null;
        this.dbl = L.dbl && L.plan[part] === 1 ? L.dbl : null;
      }
      const rel = bar % 4;
      return this.inst ? this.cur.filter(n => (n.s >> 3) === rel) : null;
    }
    arrange(t, bar) {
      const th = this.th, b = this.beat, e8 = b / 2, ch = th.prog[bar % th.prog.length];
      const T8 = i => t + i * e8 + (i & 1 ? th.swing * e8 : 0);
      const T16 = i => t + i * b / 4 + ((i & 3) === 2 ? th.swing * e8 : 0);
      if (th.pad) for (const mm of voice(ch, th.pad.lo, th.pad.n)) this.note('pad', t, mm, b * 4 + 0.35, th.pad.vol);
      if (th.bass) {
        const pat = th.bass.pat[bar % th.bass.pat.length];
        for (let i = 0; i < 8; i++) {
          const cc = pat[i]; if (cc === '.') continue;
          let j = i + 1; while (j < 8 && pat[j] === '.') j++;
          const mm = ch.r + (th.bass.oct || 0) + (cc === '5' ? 7 : cc === 'f' ? -5 : cc === 'o' ? 12 : cc === '3' ? ch.iv[1] : 0);
          this.note(th.bass.inst, T8(i), mm, (j - i) * e8 * 0.92, th.bass.vol);
        }
      }
      if (th.stab) { const v = voice(ch, th.stab.lo, th.stab.n); for (const i of th.stab.pos) for (const mm of v) this.note(th.stab.inst, T8(i), mm, e8, th.stab.vol); }
      if (th.arp) {
        const a = th.arp, pat = a.pat[bar % a.pat.length], v = voice(ch, a.lo, 4), n = a.step === 16 ? 16 : 8;
        for (let i = 0; i < n; i++) {
          const cc = pat[i]; if (cc === '.' || cc === undefined) continue;
          const tt = n === 16 ? T16(i) : T8(i), mm = v[+cc % v.length];
          this.note(a.inst, tt, mm, e8, a.vol);
          if (a.echo) this.note(a.inst, tt + b * 0.75, mm, e8, a.vol * 0.3);
        }
      }
      const mel = th.lead && this.leadBar(bar);
      if (mel) for (const n of mel) {
        const tt = T8(n.s & 7), d = n.d * e8 * 0.9, sc = th._sc;
        if (th.lead.orn && n.d >= 2 && sc && Math.random() < th.lead.orn) {   // folk turn on a longer note: note, upper neighbour, note
          const up = sc[Math.min(sc.length - 1, sc.indexOf(n.m) + 1)], g = Math.min(0.055, d * 0.2);
          this.note(this.inst, tt, n.m, g, th.lead.vol); this.note(this.inst, tt + g, up, g, th.lead.vol * 0.85);
          this.note(this.inst, tt + 2 * g, n.m, d - 2 * g, th.lead.vol);
        } else this.note(this.inst, tt, n.m, d, th.lead.vol);
        if (this.dbl) this.note(this.dbl.inst, tt, n.m + this.dbl.oct, d, this.dbl.vol);
        if (th.lead.echo) this.note(this.inst, tt + b * 0.75, n.m, d, th.lead.vol * 0.28);
      }
      if (th.kit && bar >= (th.drumsIn || 0)) {
        for (const k in th.kit) {
          const [pat, v] = th.kit[k];
          for (let i = 0; i < 16; i++) { const cc = pat[i]; if (cc === 'x' || cc === 'o') this.drum(k, T16(i), cc === 'x' ? v : v * 0.55); }
        }
        if (th.crash && bar % 16 === 0 && bar > 0) this.drum('crash', t, th.crash);
      }
      if (th.fill && bar % 8 === 7) th.fill(this, t, bar, ch);
      if (th.extra) th.extra(this, t, bar, ch);
    }
  }

  let players = [], curP = null, pumpTimer = null;
  function pumpAll() {
    if (!ctx || document.hidden || pageAway) return;
    const now = ctx.currentTime;
    players = players.filter(p => {
      if (now > p.stopAt + 0.3) { try { p.out.disconnect(); } catch (e) { /* ignore */ } return false; }
      try { p.pump(now + 0.4); } catch (e) { console.warn('AUD music', e); }
      return true;
    });
    if (!players.length) { clearInterval(pumpTimer); pumpTimer = null; }
  }
  function startMusic(name) {
    if (!ctx || (curP && curP.name === name)) return;
    const now = ctx.currentTime;
    if (curP) curP.stop(now, 1.5);
    curP = null;
    if (name) {
      const p = new Player(M, name, now + 0.1), th = THEMES[name];
      p.fade(th.vol, now + 0.02, th.fadeIn || 1.4);
      players.push(p); curP = p;
      if (!pumpTimer) pumpTimer = setInterval(pumpAll, 50);
      pumpAll();
    }
  }

  // ───────────────────────── narrator ─────────────────────────
  const GAP = 0.3, vbufs = {}, vpend = {}, VQ = [];
  let vcur = null, vgap = null, ducked = false;
  const mp3 = key => (typeof window !== 'undefined' && window.VOICE_MP3 && window.VOICE_MP3[key]) || null;
  // Recorded length if known (sesler.js also writes VOICE_DUR), otherwise ~14 characters per second.
  function lineDur(key) {
    const d = window.VOICE_DUR && window.VOICE_DUR[key];
    if (d) return d;
    if (vbufs[key]) return vbufs[key].duration;
    const s = A.LINES[key] || '';
    return Math.max(0.9, 0.3 + s.length * 0.071);
  }
  function b64buf(s) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function decodeWith(c, s) {
    return new Promise(res => {
      let done = false; const fin = b => { if (!done) { done = true; res(b || null); } };
      try { const pr = c.decodeAudioData(b64buf(s), fin, () => fin(null)); if (pr && pr.catch) pr.catch(() => fin(null)); } catch (e) { fin(null); }
    });
  }
  function getBuf(key) {
    if (vbufs[key]) return Promise.resolve(vbufs[key]);
    if (vpend[key]) return vpend[key];
    const s = mp3(key);
    if (!s || !ctx) return Promise.resolve(null);
    return (vpend[key] = decodeWith(ctx, s).then(b => { delete vpend[key]; if (b) vbufs[key] = b; return b; }));
  }
  function sub(text) { try { if (typeof A.onSubtitle === 'function') A.onSubtitle(text); } catch (e) { console.error(e); } }
  function duck(on) {
    if (!M || ducked === on) return;
    ducked = on;
    const g = M.duck.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(on ? DUCK : 1, t, on ? 0.06 : 0.35);
  }
  function show(it) { A.current = it.key; if (it.sub) { it.shown = true; sub(it.text); } }   // current first: onSubtitle may read it
  function startLine(it) {
    vcur = it; clearTimeout(vgap); vgap = null;
    it.end = wallNow() + it.dur;
    const subOnly = () => { if (vcur !== it) return; show(it); it.end = wallNow() + it.dur; it.timer = setTimeout(() => endLine(it), it.dur * 1000); };
    if (ctx && unlocked && A.voiceOn && !document.hidden && !pageAway && mp3(it.key)) {
      getBuf(it.key).then(buf => {
        if (vcur !== it) return;
        if (!buf || document.hidden || pageAway) return subOnly();
        const src = ctx.createBufferSource();
        src.buffer = buf; src.connect(M.voice); src.onended = () => endLine(it);
        src.start(ctx.currentTime + 0.02);
        it.src = src; it.dur = buf.duration; it.end = wallNow() + buf.duration;
        duck(true); show(it);
        it.timer = setTimeout(() => endLine(it), (buf.duration + 0.8) * 1000);   // in case onended never fires (suspended)
      });
    } else subOnly();
  }
  function endLine(it) {
    if (vcur !== it) return;
    clearTimeout(it.timer);
    if (it.shown) sub(null);
    vcur = null; A.current = null;
    const now = wallNow();
    for (let i = VQ.length - 1; i >= 0; i--) if (now + GAP - VQ[i].t > VQ[i].wait) VQ.splice(i, 1);   // stale
    if (VQ.length) vgap = setTimeout(nextLine, GAP * 1000);
    else duck(false);
  }
  function nextLine() {
    vgap = null;
    const now = wallNow();
    while (VQ.length) { const it = VQ.shift(); if (now - it.t <= it.wait) { startLine(it); return; } }
    duck(false);
  }
  function stopCur() {
    const it = vcur; if (!it) return;
    clearTimeout(it.timer);
    if (it.src) { it.src.onended = null; try { it.src.stop(); } catch (e) { /* ignore */ } }
    if (it.shown) sub(null);
    vcur = null; A.current = null;
  }
  function say(key, o) {
    o = o || {};
    const text = A.LINES[key];
    if (!text) { if (!warned['L' + key]) { warned['L' + key] = 1; console.warn('AUD.say: unknown line', key); } return 0; }
    const prio = o.prio ?? 1;
    const it = { key, text, prio, sub: o.sub !== false, dur: lineDur(key), t: wallNow(), wait: o.wait ?? 8 + 6 * prio };
    const busy = vcur || VQ.length || vgap;
    if (!busy) { startLine(it); return it.dur; }
    if (o.interrupt) { stopCur(); clearTimeout(vgap); vgap = null; startLine(it); return it.dur; }
    if (prio <= 0) return 0;
    if ((vcur && vcur.key === key) || VQ.some(q => q.key === key)) return 0;
    let i = VQ.findIndex(q => q.prio < prio); if (i < 0) i = VQ.length;
    VQ.splice(i, 0, it);
    while (VQ.length > 4) if (VQ.pop() === it) return 0;
    let w = vcur ? Math.max(0, vcur.end - wallNow()) : 0;
    for (let j = 0; j < i; j++) w += GAP + VQ[j].dur;
    return w + GAP + it.dur;
  }
  function prefetch() {
    const keys = ['basla', 'devam', 'giris1', 'giris2', 'hos_geldin', 'baykus'];
    let k = 0;
    const go = () => { if (k < keys.length) getBuf(keys[k++]).then(() => setTimeout(go, 40)); };
    setTimeout(go, 200);
  }

  // ───────────────────────── public API ─────────────────────────
  let listenersOn = false, waking = null, needsWake = false, pageAway = false;
  function resetMusic() {
    for (const p of players) { try { p.lfo.stop(); } catch (e) { /* already stopped */ } try { p.out.disconnect(); } catch (e) { /* already gone */ } }
    players = []; curP = null; clearInterval(pumpTimer); pumpTimer = null;
  }
  function awake(c) {
    if (c !== ctx || c.state !== 'running' || document.hidden || pageAway) return;
    waking = null;
    if (needsWake) {
      needsWake = false;
      // Timers and the audio clock may have advanced differently while the screen was locked. Start the current
      // theme at today's clock, and drop an old spoken line rather than leave its ducking gain stuck forever.
      A.stopVoice(); resetMusic();
      Object.keys(lastT).forEach(k => delete lastT[k]); active = 0; effectEpoch++;
      for (const k of Object.keys(streak)) { streak[k][0] = 0; streak[k][1] = -9; }
      ramp(M.sfx.gain, A.soundOn ? SFX_VOL : 0, 0.05);
      ramp(M.voice.gain, A.voiceOn ? VOICE_VOL : 0, 0.05);
      ramp(M.music.gain, musicLevel(), 0.05);
    }
    if (want && A.musicOn) startMusic(want);
  }
  function suspendAudio() {
    if (!ctx || ctx.state === 'closed') return;
    needsWake = true; waking = null;
    const c = ctx;
    try {
      const p = c.suspend();
      // A quick hide/show can finish suspend after resume. Reconcile that race once the promise settles.
      if (p && p.then) p.then(() => { if (c === ctx && !document.hidden && !pageAway) A.unlock(); }, () => {});
    } catch (e) { /* interrupted by the operating system */ }
  }
  A.unlock = function () {
    if (QUIET || document.hidden || pageAway) return false;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
    if (ctx && ctx.state === 'closed') {
      A.stopVoice(); resetMusic(); ctx = M = null; unlocked = false; waking = null; needsWake = true;
    }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { return false; } }
      M = makeMix(ctx);
      const c = ctx;
      c.onstatechange = () => {
        if (c !== ctx) return;
        if (c.state === 'running') awake(c);
        else needsWake = true;   // the next real gesture retries even if an earlier resume is still pending
      };
    }
    if (!unlocked) {
      try { const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
      unlocked = true;
      prefetch();
    }
    if (!listenersOn) {
      listenersOn = true;
      // Safari can require the *release* gesture after a screen lock. Keep these listeners after first unlock:
      // the UI's initial unlock listeners are intentionally removed as soon as sound first works.
      for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown']) addEventListener(ev, () => A.unlock(), true);
      document.addEventListener('visibilitychange', () => { if (document.hidden) suspendAudio(); else A.unlock(); });
      addEventListener('pagehide', () => { pageAway = true; suspendAudio(); });
      addEventListener('pageshow', () => { pageAway = false; A.unlock(); });
      addEventListener('focus', () => A.unlock());
    }
    if (ctx.state === 'running') awake(ctx);
    else {
      needsWake = true;
      const c = ctx;
      // Do not gate retries on a pending promise: iOS may leave resume() unresolved until a later touchend.
      try {
        const p = waking = c.resume();
        if (p && p.then) p.then(() => { if (c === ctx) awake(c); }, () => { if (waking === p) waking = null; });
      } catch (e) { waking = null; }
    }
    return true;
  };
  A.sfx = sfx;
  A.setListener = (x, z) => { lx = x; lz = z; };
  A.music = function (name) {
    if (name && !THEMES[name]) { console.warn('AUD.music: unknown theme', name); return; }
    want = name || null; A.theme = want;
    if (ctx && unlocked && A.musicOn) startMusic(want);
  };
  function ramp(g, v, tc) { const t = ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(v, t, tc); }
  A.setMusic = function (on) {
    A.musicOn = !!on;
    if (on && unlocked) A.unlock();
    if (!ctx) return;
    if (A.musicOn) { ramp(M.music.gain, musicLevel(), 0.05); startMusic(want); }   // the bus may have been built at 0 (saved "off")
    else { if (curP) curP.stop(ctx.currentTime, 0.6); curP = null; }
  };
  // Sound effects only; the narrator keeps talking (see voiceOn).
  A.setSound = function (on) {
    A.soundOn = !!on;
    if (on && unlocked) A.unlock();
    if (M) ramp(M.sfx.gain, A.soundOn ? SFX_VOL : 0, 0.05);
  };
  // Narrator voice (parent/debug only; subtitles keep running when off).
  A.setVoice = function (on) {
    A.voiceOn = !!on;
    if (on && unlocked) A.unlock();
    if (M) ramp(M.voice.gain, A.voiceOn ? VOICE_VOL : 0, 0.05);
  };
  // Pause / wardrobe: music dips to ~35% and comes back on resume. Only a flag while silent or before unlock.
  A.dim = function (on) {
    dimmed = !!on;
    if (!on && unlocked) A.unlock();
    if (M && A.musicOn) ramp(M.music.gain, musicLevel(), 0.25);
  };
  A.say = say;
  A.speaking = () => !!vcur || VQ.length > 0;
  A.stopVoice = function () { VQ.length = 0; clearTimeout(vgap); vgap = null; stopCur(); duck(false); };
  A.estimate = key => (A.LINES[key] ? lineDur(key) : 0);
  A.ready = () => !!(ctx && unlocked && ctx.state === 'running');

  // Test hooks: render into an OfflineAudioContext (never audible) to prove graphs build and measure levels.
  A._test = {
    sfxNames: Object.keys(SFX), themes: Object.keys(THEMES), svol: SVOL, THEMES,
    render(fn, secs = 2, sr = 44100, raw = false) {
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const c = new OC(2, Math.ceil(secs * sr), sr), m = makeMix(c, true, raw);
      fn(m, c);
      return c.startRendering();
    },
    sfx(name, secs = 2.2, o = {}) { return this.render(m => playRecipe(m, name, { g: o.vol ?? (SVOL[name] ?? 1), p: o.pitch || 1, pan: o.pan || 0 }, 0.02), secs, 44100, o.raw); },
    prim: { T, N, B },
    music(name, secs = 12) {
      return this.render(m => { const p = new Player(m, name, 0.05); p.fade(THEMES[name].vol, 0, 0.05); p.pump(secs); }, secs);
    },
    stress(secs = 3, theme = 'boss') {
      return this.render(m => {
        const p = new Player(m, theme, 0.05); p.fade(THEMES[theme].vol, 0, 0.05); p.pump(secs);
        for (let r = 0; r < 3; r++) for (const n of Object.keys(SFX)) playRecipe(m, n, { g: SVOL[n] ?? 1, p: semi(rnd(-0.5, 0.5)), pan: rnd(-0.6, 0.6) }, 0.1 + r * 0.05 + rnd(0, 0.02));
      }, secs);
    },
    decode(key) {
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, s = mp3(key);
      return s ? decodeWith(new OC(1, 44100, 44100), s) : Promise.resolve(null);
    },
    score(name, bars = 32) {   // generated lead line per bar (for reading, not playing)
      const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, p = new Player(makeMix(new OC(1, 128, 44100), true), name, 0), out = [];
      for (let b = 0; b < bars; b++) { const n = p.leadBar(b); out.push({ bar: b, ch: p.th.prog[b % p.th.prog.length], inst: p.inst, notes: n || [] }); }
      return out;
    },
    // Drive the real-time paths (unlock state, scheduler, crossfades, voice buffers, ducking) with an inaudible
    // OfflineAudioContext: attach(c) before c.startRendering(), call pump() at each c.suspend() step, detach() after.
    attach(c) { this._saved = [ctx, M, unlocked]; ctx = c; M = makeMix(c, true); unlocked = true; Object.keys(vbufs).forEach(k => delete vbufs[k]); return M; },
    detach() { players.forEach(p => { try { p.out.disconnect(); } catch (e) { /* ignore */ } }); players = []; curP = null; clearInterval(pumpTimer); pumpTimer = null; A.stopVoice(); [ctx, M, unlocked] = this._saved; },
    pump: () => pumpAll(),
    spatial: (x, z) => spatial(x, z),
    lineDur, state: () => ({ ctx: !!ctx, unlocked, dimmed, queue: VQ.map(q => q.key), cur: vcur && vcur.key, players: players.length }),
  };
  return A;
})();

AUD.LINES = /*SESLER*/{
  "giris1": "Merhaba Feza! Huysuz Ejderha köyün neşe kristalini aldı ve herkesi huysuz yaptı.",
  "kahraman_sec": "Bugün hangi Feza olacaksın? Savaşçı, büyücü ya da hem kılıç hem değnek kullanan büyülü şövalyeyi seç!",
  "seviye_buyu": "Seviye atladın! Sihirli değneğin artık daha güçlü!",
  "giris_hibrit": "Bir elinde ışın kılıcı, bir elinde sihirli değnek! Yakındaki huysuzlara kılıcınla dokun, uzaktakilere büyü gönder!",
  "seviye_hibrit": "Seviye atladın! Kılıcın ve sihirli değneğin artık daha güçlü!",
  "hibrit1": "Hilal Dalgası hazır! Kılıcından sihirli bir hilal gönder, önündeki huysuzlar neşelensin!",
  "hibrit2": "Işık Bağı açıldı! Çevrende dönen sihirli kılıçlar seni korusun, yakınındaki huysuzlara ışık göndersin!",
  "hibrit3": "Gökkuşağı Mührü hazır! Kılıcınla değneğini birleştir, rengarenk sihir dalgaları yayılsın!",
  "giris_buyu": "Sihirli değneğinle uzaktan ışık gönder, huysuzlar neşelensin! Gitmek istediğin yere parmağını bas.",
  "degnek": "Yeni bir sihirli değnek buldun!",
  "buyu1": "Işık Okları hazır! Mor düğmeye bas, değneğinden üç sihirli ok uçsun!",
  "buyu2": "Buz Çiçeği açıldı! Mavi düğmeyle huysuzları biraz dondur, sihirli kalkanın seni korusun!",
  "buyu3": "Yıldız Bahçesi hazır! Pembe düğmeye bas, yıldızlar bir çember olup huysuzları neşelendirsin!",
  "giris2": "Işın kılıcınla huysuzlara dokun, yeniden neşelensinler! Gitmek istediğin yere parmağını bas.",
  "yolculuk": "Kristali geri almaya gidiyoruz: önce Huysuz Orman, sonra Kefir Vadisi, mağara, yanardağ ve en sonunda ejderhanın kalesi!",
  "baykus": "Hu hu! Ben Bilge Baykuş. Toprak yolu takip et, ormana varırsın! Canın azalırsa kırmızı iksiri iç!",
  "orman": "Huysuz Orman! Jöleler ve mantarlar çok huysuzlanmış.",
  "kefir": "Kefir Vadisi! Ejderhanın büyüsü buraya da ulaşmış: yoğurtlar ekşimiş, kaymaklar kesilmiş. Hadi onları neşelendirelim!",
  "ilk_yogurt": "Bak bak! Ekşi yoğurtlar zıplıyor!",
  "ilk_kaymak": "Kaymaklar kayarak geliyor, dikkat!",
  "ilk_kopuk": "Kefir köpükleri uçuşuyor!",
  "magara": "Köstebek ve Salyangoz Mağarası! Kalenin yolu buradan geçiyor. Burası biraz karanlık ama sen çok cesursun.",
  "ilk_kostebek": "Bak bak! Köstebekler toprağın altından çıkıyor!",
  "ilk_salyangoz": "Salyangozlar baloncuk üflüyor, dikkat et!",
  "yanardag": "Lav Yanardağı! Lavlar çok sıcak, yoldan ayrılma! Ejderhanın kalesi çok yakında!",
  "ilk_kaplumbaga": "Bak bak! Minik lav kaplumbağaları!",
  "ilk_ateskusu": "Ateş kuşları uçuyor, kıvılcımlara dikkat!",
  "kale": "Ejderhanın Kalesi! Neşe kristali burada bir yerde.",
  "yetenek_yildiz": "Yeni yetenek: Yıldız Atışı! Yıldızlı düğmeye bas, uzaktaki huysuzlara yıldız fırlat!",
  "yetenek_kasirga": "Yeni yetenek: Kasırga! Parlayan yeni düğmeye bas, fırıl fırıl dön!",
  "yetenek_meteor": "Yeni yetenek: Meteor Yağmuru! Parlayan yeni düğmeye bas, gökyüzünden yıldız taşları yağsın!",
  "seviye1": "Seviye atladın! Daha da güçlendin!",
  "seviye2": "Bir seviye daha! Harikasın Feza!",
  "seviye3": "Seviye atladın! Işın kılıcın artık daha güçlü!",
  "kilic": "Yeni bir ışın kılıcı buldun!",
  "sapka": "Yeni bir şapka! Sana çok yakıştı!",
  "pelerin": "Yeni bir pelerin! Rüzgârda uçuşuyor!",
  "efsane": "Vay canına! Efsane bir hazine!",
  "sandik": "Hazine sandığı! Bakalım içinden ne çıkacak?",
  "can_az": "Canın azaldı! Kırmızı iksire bas!",
  "iksir_yok": "İksirin bitti. Kalpleri topla, canın dolsun!",
  "yoruldu": "Feza biraz yoruldu. Dinlenip hemen geri dönüyoruz!",
  "nese_tasi": "Neşe taşı parladı! Yorulursan buradan devam edeceksin.",
  "kapi": "Sihirli kapı! İçine gir, yeni bir yere gidelim!",
  "kocaman": "Dikkat! Kocaman bir huysuz geliyor!",
  "kraljole_giris": "İşte Kral Jöle! Zıplayınca yere dikkat et!",
  "kraljole_bitti": "Kral Jöle çok mutlu! Sihirli kapı Kefir Vadisi'ne açıldı!",
  "kefirdev_giris": "İşte Köpüklü Kefir Devi! Çalkalanınca köpük fışkırtıyor, dikkat et!",
  "kefirdev_bitti": "Kefir Devi çok mutlu! Artık hiç ekşi değil!",
  "kefir_ikram": "Kefir Devi sana en güzel kefirinden verdi. Afiyet olsun Feza!",
  "kefirdev_yol": "Kefir Devi diyor ki: Ejderha dağların ardındaki kalesine uçtu. Yol mağaradan geçiyor!",
  "usta_giris": "Usta Köstebek geldi! Topraktan çıkınca hemen vur!",
  "usta_bitti": "Usta Köstebek kocaman gülümsüyor! Kapı yanardağa açıldı!",
  "kaplumbaga_giris": "Koca Lav Kaplumbağası! Yerde parlayan dairelerden uzak dur!",
  "kaplumbaga_bitti": "Koca kaplumbağa çok sevindi! Sihirli kapı kaleye açıldı!",
  "ejderha_giris": "İşte Huysuz Ejderha! Hadi Feza, onu da neşelendir!",
  "ejderha_yarim": "Ejderha yoruluyor! Devam et, çok az kaldı!",
  "ejderha_yarasa": "Ejderha yarasalarını çağırdı!",
  "ejderha_bitti": "Başardın! Ejderha artık hiç huysuz değil. Meğer sadece bir arkadaş istiyormuş.",
  "kristal": "Neşe kristali! Ona dokun, köye neşe geri dönsün!",
  "son": "Tebrikler Feza! Herkesi neşelendirdin. Sen gerçek bir kahramansın!",
  "tekrar": "Yeni macera başlıyor! Hadi Feza, huysuzları yine neşelendirelim!",
  "hos_geldin": "Tekrar hoş geldin Feza! Macera kaldığın yerden devam ediyor.",
  "canta": "Çantana bak! Hangi kıyafeti giymek istersin?",
  "ovgu1": "Harika!",
  "ovgu2": "Süpersin!",
  "ovgu3": "Çok güçlüsün Feza!",
  "ovgu4": "İşte bu!",
  "ovgu5": "Aferin sana!",
  "ovgu6": "Muhteşem!",
  "basla": "Oyna düğmesine bas, maceraya başlayalım!",
  "devam": "Devam Et düğmesine bas, macera kaldığın yerden sürsün!"
}/*SESLER-SON*/;
