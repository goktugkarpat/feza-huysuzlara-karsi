/* ── Arayüz (UI): HUD, menüler, dokunmatik/klavye girişi, mini harita, kamera, ana döngü ve boot() ──
   Bütün DOM burada JS ile kurulur (stiller: src/ui.css). Genel adlar: UI, boot. Sözleşme: src/SPEC.md → "UI". */
const UI = (() => {
  'use strict';

  const PREF_KEY = 'fezaKotulereKarsi.ayar';
  const SLOTS = ['weapon', 'hat', 'cape'];
  const SLOT_AD = { weapon: 'Işın Kılıçları', hat: 'Şapkalar', cape: 'Pelerinler' };
  const SLOT_EMO = { weapon: '⚔️', hat: '🎩', cape: '🦸' };   // weapon: replaced by the tiny saber SVG once SVG exists (below)
  const BLADE_DEF = '#5ad8ff';   // attack-button blade colour when ITEMS.bladeColor is missing
  const BASE_EMO = { migfer: '⛑️', sihirbaz: '🧙', kovboy: '🤠', korsan: '🏴‍☠️', tac: '👑' };
  const RAR = ['#f4f4f4', '#5aa8ff', '#ffd23f', '#ff8a1c'];
  const RAR_AD = ['Sıradan', 'Sihirli', 'Nadir', 'Efsane'];
  // Skill buttons around the attack button: [radius, angle°] (0° = left of it, 90° = above). Up to 3 sit on the inner arc
  // (the game has 3 skills); more would spill onto an outer arc.
  const ARC = [[142, 45], [142, 0], [142, 90], [238, 45], [238, 14], [238, 76]];
  const MAP_VIEW = 22, MAP_REVEAL = 11;   // minimap: metres from centre to rim; fog reveal radius
  const SAVE_KEY = 'fezaKotulereKarsi.v1', SAVE_BACKUP = 'fezaKotulereKarsi.v1.onceki';   // backup written before "Baştan Başla"

  // ── Modules (resolved at boot; any may be missing in tests). typeof on a module that threw at load → TDZ error. ──
  const M = {};
  function resolve() {
    const get = f => { try { return f(); } catch (e) { return null; } };
    M.GAME = get(() => (typeof GAME !== 'undefined' ? GAME : null));
    M.AUD = get(() => (typeof AUD !== 'undefined' ? AUD : null));
    M.FX = get(() => (typeof FX !== 'undefined' ? FX : null));
    M.TEX = get(() => (typeof TEX !== 'undefined' ? TEX : null));
    M.LEVEL = get(() => (typeof LEVEL !== 'undefined' ? LEVEL : null));
    M.ITEMS = get(() => (typeof ITEMS !== 'undefined' ? ITEMS : null));
    M.FEZA = get(() => (typeof FEZA !== 'undefined' ? FEZA : null));
    M.ZONES = get(() => (typeof ZONES !== 'undefined' ? ZONES : null));
    M.SKILLS = get(() => (typeof SKILLS !== 'undefined' ? SKILLS : null));
    M.EMODEL = get(() => (typeof EMODEL !== 'undefined' ? EMODEL : null));
  }
  const warned = {};
  function warn(k, e) { if (!warned[k]) { warned[k] = 1; console.warn('[UI] ' + k, e); } }
  function safe(k, f) { try { return f(); } catch (e) { warn(k, e); return undefined; } }
  function aud(fn, a, b) { const A = M.AUD; if (A && typeof A[fn] === 'function') return safe('AUD.' + fn, () => A[fn](a, b)); return undefined; }
  const sfx = (n, o) => { if (!SILENT) aud('sfx', n, o); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ol = (t, cls = '') => `<span class="u-ol ${cls}"><b>${esc(t)}</b><i>${esc(t)}</i></span>`;
  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  function shade(hex, k) {   // k < 0 darker (toward deep purple), k > 0 lighter
    const c = new THREE.Color(hex), t = k < 0 ? new THREE.Color('#1a0840') : new THREE.Color('#ffffff');
    return '#' + c.lerp(t, Math.abs(k)).getHexString();
  }

  // ── SVG icons ──
  const SVG = {
    play: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M7 4.2v15.6a1.2 1.2 0 0 0 1.8 1l12.4-7.8a1.2 1.2 0 0 0 0-2L8.8 3.2A1.2 1.2 0 0 0 7 4.2z"/></svg>',
    cont: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M2.5 5.2v13.6a1 1 0 0 0 1.6.8L12 13.7v5.1a1 1 0 0 0 1.6.8l8.6-6.8a1 1 0 0 0 0-1.6l-8.6-6.8a1 1 0 0 0-1.6.8v5.1L4.1 4.4a1 1 0 0 0-1.6.8z"/></svg>',
    pause: '<svg class="u-svg" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg>',
    note: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M9.5 17.8a3.3 3.3 0 1 1-2.2-3.1V5.6c0-.6.4-1.1 1-1.2l10-2.2c.8-.2 1.5.4 1.5 1.2v11.8a3.3 3.3 0 1 1-2.2-3.1V7.2l-8.1 1.8z"/></svg>',
    sound: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M3 9.2c0-.6.5-1.1 1.1-1.1h3.3l4.8-4.2c.7-.6 1.8-.1 1.8.8v14.6c0 .9-1.1 1.4-1.8.8l-4.8-4.2H4.1c-.6 0-1.1-.5-1.1-1.1z"/><path d="M16.3 8.4a5 5 0 0 1 0 7.2M18.8 5.8a8.6 8.6 0 0 1 0 12.4" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round"/></svg>',
    again: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M12 4.5a7.5 7.5 0 1 1-7.1 5.1" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/><path d="M12 1l4.5 3.6L12 8.2z"/></svg>',
    close: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>',
    check: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M4.5 12.5l5 5L19.5 7" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    // Lightsaber (attack button): chrome hilt + glowing blade. The blade colour is the CSS variable --blade (set from
    // ITEMS.bladeColor of the equipped saber); .u-blade can be scaled to 0 (retracted while Feza sleeps) and re-ignited.
    sword: `<svg viewBox="0 0 100 100"><defs>
      <linearGradient id="uiSbH" x1="0" x2="1"><stop offset="0" stop-color="#5d6882"/><stop offset=".32" stop-color="#f6f9ff"/><stop offset=".58" stop-color="#b3bdd3"/><stop offset="1" stop-color="#4c5670"/></linearGradient>
      <linearGradient id="uiSbG" x1="0" x2="1"><stop offset="0" stop-color="#1c2030"/><stop offset=".4" stop-color="#4a5168"/><stop offset="1" stop-color="#171a26"/></linearGradient>
      <filter id="uiSbF" x="-80%" y="-20%" width="260%" height="140%"><feGaussianBlur stdDeviation="3.4"/></filter></defs>
      <g transform="rotate(45 50 50)">
      <g class="u-blade">
      <line x1="50" y1="7" x2="50" y2="59" stroke-linecap="round" stroke-width="19" opacity=".8" filter="url(#uiSbF)" style="stroke:var(--blade,#5ad8ff)"/>
      <line x1="50" y1="8" x2="50" y2="59" stroke-linecap="round" stroke-width="11" style="stroke:var(--blade,#5ad8ff)"/>
      <line x1="50" y1="9.5" x2="50" y2="59" stroke-linecap="round" stroke-width="5.2" stroke="#ffffff"/></g>
      <g stroke="#150c28" stroke-width="2.4" stroke-linejoin="round">
      <path d="M41.5 57.5 h17 l-1.5 9.5 h-14 z" fill="url(#uiSbH)"/>
      <rect x="43.5" y="66" width="13" height="21" rx="2.2" fill="url(#uiSbG)"/>
      <path d="M44.5 70.5h11M44.5 75h11M44.5 79.5h11" stroke="#8c96b0" stroke-width="1.8"/>
      <rect x="42.5" y="85.5" width="15" height="6.5" rx="2.2" fill="url(#uiSbH)"/>
      <circle cx="50" cy="94.5" r="3.2" fill="url(#uiSbH)"/>
      <rect x="53" y="59.6" width="4.2" height="4.4" rx="1.3" fill="#ff5f8f" stroke-width="1.4"/></g>
      <circle cx="55.1" cy="61.3" r="1" fill="#fff" fill-opacity=".85"/></g></svg>`,
    // tiny saber for labels / thumbnail fallbacks (no filter: cheap to repeat)
    saber: '<svg class="u-emsvg" viewBox="0 0 100 100"><g transform="rotate(45 50 50)"><line x1="50" y1="8" x2="50" y2="60" stroke="#5ad8ff" stroke-opacity=".45" stroke-width="20" stroke-linecap="round"/><line x1="50" y1="9" x2="50" y2="60" stroke="#6fe0ff" stroke-width="11" stroke-linecap="round"/><line x1="50" y1="11" x2="50" y2="60" stroke="#fff" stroke-width="5" stroke-linecap="round"/><rect x="42" y="58" width="16" height="34" rx="4" fill="#c9d1e3" stroke="#150c28" stroke-width="3"/><path d="M44 70h12M44 76h12M44 82h12" stroke="#4a5168" stroke-width="3"/></g></svg>',
    potion: `<svg viewBox="0 0 100 100"><defs>
      <radialGradient id="uiPoL" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#ffb3c0"/><stop offset=".35" stop-color="#ff3a5c"/><stop offset=".8" stop-color="#c8102f"/><stop offset="1" stop-color="#7a0018"/></radialGradient>
      <clipPath id="uiPoC"><circle cx="50" cy="63" r="27"/></clipPath></defs>
      <rect x="39" y="6" width="22" height="15" rx="5" fill="#c98d4f" stroke="#4a220c" stroke-width="3.2"/>
      <path d="M42 20 h16 v14 a28.5 28.5 0 1 1 -16 0 z" fill="#eaf6ff" fill-opacity=".55" stroke="#2a1546" stroke-width="4"/>
      <g clip-path="url(#uiPoC)"><path d="M18 58 Q34 51 50 58 T82 58 V100 H18 Z" fill="url(#uiPoL)"/>
      <path d="M22 57.5 Q34 52 50 57.5 T80 57.5" fill="none" stroke="#ffc6cf" stroke-width="2.4" stroke-opacity=".9"/></g>
      <rect x="40.5" y="30" width="19" height="6" rx="3" fill="#ffd23f" stroke="#7a4205" stroke-width="2"/>
      <ellipse cx="38" cy="54" rx="6" ry="10" fill="#fff" fill-opacity=".65" transform="rotate(28 38 54)"/>
      <circle cx="60" cy="74" r="3.2" fill="#fff" fill-opacity=".5"/><circle cx="52" cy="82" r="2" fill="#fff" fill-opacity=".45"/></svg>`,
    // Friendly purple dragon head (stand-in until the portrait of the real boss model is rendered, see dragonPortrait).
    // Flat fills only (no gradient ids): several copies can be on the page at once. The pastel disc behind it is CSS (.u-dimg).
    dragon: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g stroke="#3a1d66" stroke-width="2.6" stroke-linejoin="round">' +
      '<path d="M34 31C29 22 28 14 31 8C36 14 41 21 44 28Z" fill="#f6dfae"/><path d="M66 31C71 22 72 14 69 8C64 14 59 21 56 28Z" fill="#f6dfae"/>' +
      '<path d="M22 46C12 43 7 35 8 27C16 30 23 35 28 41Z" fill="#f47cc6"/><path d="M78 46C88 43 93 35 92 27C84 30 77 35 72 41Z" fill="#f47cc6"/>' +
      '<path d="M44 25C45 17 55 17 56 25Z" fill="#f47cc6"/>' +
      '<ellipse cx="50" cy="50" rx="31" ry="27.5" fill="#8d5ad9"/><ellipse cx="50" cy="68" rx="22" ry="14.5" fill="#c7a6f4"/></g>' +
      '<ellipse cx="39" cy="34" rx="12" ry="5.5" fill="#fff" opacity=".3" transform="rotate(-18 39 34)"/>' +
      '<ellipse cx="43.5" cy="63" rx="2.3" ry="1.5" fill="#3a1a5a"/><ellipse cx="56.5" cy="63" rx="2.3" ry="1.5" fill="#3a1a5a"/>' +
      '<path d="M39 69.5Q50 82 61 69.5Q50 73 39 69.5Z" fill="#5c1733" stroke="#3a1250" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M45 75.2Q50 79 55 75.2Q50 73.6 45 75.2Z" fill="#ff7aa0"/>' +
      '<rect x="46.2" y="70.6" width="3.4" height="3.2" rx="1" fill="#fffaf0"/><rect x="50.4" y="70.6" width="3.4" height="3.2" rx="1" fill="#fffaf0"/>' +
      '<g stroke="#3a1d66" stroke-width="2"><ellipse cx="37.5" cy="47" rx="8.4" ry="9.8" fill="#fff"/><ellipse cx="62.5" cy="47" rx="8.4" ry="9.8" fill="#fff"/></g>' +
      '<circle cx="38.5" cy="49" r="5.8" fill="#b8661e"/><circle cx="61.5" cy="49" r="5.8" fill="#b8661e"/>' +
      '<circle cx="38.5" cy="49.6" r="3.1" fill="#2a1030"/><circle cx="61.5" cy="49.6" r="3.1" fill="#2a1030"/>' +
      '<circle cx="36.2" cy="45.7" r="2.3" fill="#fff"/><circle cx="59.2" cy="45.7" r="2.3" fill="#fff"/>' +
      '<ellipse cx="25.5" cy="60" rx="5.8" ry="3.3" fill="#ff6fb0" opacity=".55"/><ellipse cx="74.5" cy="60" rx="5.8" ry="3.3" fill="#ff6fb0" opacity=".55"/></svg>',
  };
  SLOT_EMO.weapon = SVG.saber;   // wardrobe row label + thumbnail fallback: a little lightsaber (there is no emoji for it)

  // ── State ──
  const S = {
    booted: false, ready: false, mode: 'boot', menu: null, paused: false, busy: false, hud: false,
    t: 0, frame: 0, primary: null, primaryT: 0, atkHeld: false, atkNext: 0, needRender: true, portraitDirty: true, portraitAt: 0,
    boss: false, bossFrac: 1, bossTrail: 1, dpr: 1, playPitch: 0.96, guardUntil: 0, lastGoldBump: 0,
    prefs: { music: true, sound: true }, portraitUrl: null, lastFrame: 0, hold: false, hintT: -1, hintOn: false, cheered: 0,   // hold: tests keep messages on screen
    hintX: 0, hintZ: 0, askT: 0, cine: null, bossTop: 90, titleT: 0, titleIdle: 0, titleSaid: 0,
  };
  const D = {};                                       // DOM refs
  const last = { xp: -1, lvl: -1, gold: -1, pot: -1, potEv: 99, low: null, empty: null, hint: null };
  let goldShown = 0, readyRes = null;
  const newItems = new Set();   // picked up into the bag but not seen yet
  const readyP = new Promise(r => { readyRes = r; });

  // ── Preferences (music / sound toggles) ──
  // Only music is restored: sound effects always start on, so an accidental mute in the pause menu is gone by the next launch.
  function loadPrefs() {
    try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (p) S.prefs.music = p.music !== false; } catch (e) { /* private mode */ }
    S.prefs.sound = true;
    aud('setMusic', S.prefs.music); aud('setSound', S.prefs.sound);
  }
  function setPref(k, on) {
    S.prefs[k] = !!on;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs)); } catch (e) { /* private mode */ }
    if (k === 'music') aud('setMusic', on); else aud('setSound', on);
    syncToggles();
  }
  function syncToggles() {
    document.querySelectorAll('#ui [data-tog]').forEach(b => {
      const k = b.dataset.tog, on = S.prefs[k];
      b.classList.toggle('off', !on);
      const lab = b.querySelector('.u-lab');
      if (lab) lab.textContent = (k === 'music' ? 'Müzik' : 'Efektler') + (on ? ' Açık' : ' Kapalı');   // effects only: the narrator stays on
    });
  }

  // ── Press helper: pointerdown fires instantly; one press per pointer; menus can rate-limit ──
  function onPress(b, fn, o = {}) {
    let downId = null, lastT = 0;
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      if (downId !== null && downId === e.pointerId) return;
      const t = performance.now();
      if (o.menu && (t < S.guardUntil || t - lastT < 350)) return;
      downId = e.pointerId; lastT = t;
      b.classList.add('down');
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (o.menu) sfx('click', { vol: 0.6 });
      try { fn(e); } catch (err) { console.error('[UI] button', err); }
    });
    const up = e => { if (e.pointerId !== downId) return; downId = null; b.classList.remove('down'); if (o.up) o.up(e); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  // Press-and-hold: fn fires only after the finger stayed down for `sec` seconds. Progress is written to the CSS variable --hp
  // (0..1, drives a filling ring/bar) by holdTick() in the main loop, so it also runs while a menu pauses the game.
  // A press inside a menu's tap guard (S.guardUntil) is not ignored: the fill starts right away, but the `sec` seconds only
  // count once the guard is over (the fill is stretched over the rest of the guard + sec), so a finger that lands early
  // still sees it working and simply holds a little longer.
  const HOLDS = [];
  function onHold(b, sec, fn, o = {}) {
    const h = { b, sec, fn, id: null, t0: 0, dur: sec };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      if (h.id !== null) return;
      if (o.can && !o.can()) return;
      const guard = o.menu ? clamp((S.guardUntil - performance.now()) / 1000, 0, 2) : 0;
      h.id = e.pointerId; h.t0 = S.t; h.dur = sec + guard;
      b.classList.add('down', 'holding'); b.style.setProperty('--hp', '0');
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (HOLDS.indexOf(h) < 0) HOLDS.push(h);
      sfx('click', { vol: 0.35, pitch: 0.8 });
    });
    const up = e => {
      if (e.pointerId !== h.id) return;
      const early = S.t - h.t0 < h.dur;
      endHold(h);
      if (early && o.early) o.early();
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return h;
  }
  function endHold(h) {
    h.id = null; h.b.classList.remove('down', 'holding'); h.b.style.setProperty('--hp', '0');
    const i = HOLDS.indexOf(h); if (i >= 0) HOLDS.splice(i, 1);
  }

  // HUD corner buttons (⏸, 🎒, portrait) sit where a steering finger lands when Feza walks toward a corner. They act on
  // release, and only after a still press of the right length: o.hold s (0 = plain tap) up to o.max s. A press that drags
  // more than DRAG_PX or lingers past o.max is steering: it is handed over to the canvas, so Feza simply walks there.
  const CORNERS = [], DRAG_PX = 25;
  function onCorner(b, fn, o) {
    const h = { b, fn, o, id: null, t0: 0, x0: 0, y0: 0, x: 0, y: 0 };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      if (h.id !== null) return;
      if (performance.now() < S.guardUntil) return;
      if (!canMenu()) { steerFrom(e.pointerId, e.clientX, e.clientY); return; }
      h.id = e.pointerId; h.t0 = S.t; h.x0 = h.x = e.clientX; h.y0 = h.y = e.clientY;
      b.classList.add('down');
      if (o.hold) { b.classList.add('holding'); b.style.setProperty('--hp', '0'); sfx('click', { vol: 0.35, pitch: 0.8 }); }
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (CORNERS.indexOf(h) < 0) CORNERS.push(h);
    });
    b.addEventListener('pointermove', e => {
      if (e.pointerId === S.primary && h.id === null) { steerMove(e); return; }   // capture stayed here after the hand-over
      if (e.pointerId !== h.id) return;
      h.x = e.clientX; h.y = e.clientY;
      if (Math.hypot(h.x - h.x0, h.y - h.y0) > DRAG_PX) cornerToSteer(h);
    });
    const up = e => {
      if (e.pointerId !== h.id) return;
      const held = S.t - h.t0, still = Math.hypot(e.clientX - h.x0, e.clientY - h.y0) <= DRAG_PX;
      endCorner(h);
      if (e.type !== 'pointerup' || !still) return;   // cancelled by the browser, or the finger slid away
      if (held < (o.hold || 0)) { if (o.early) o.early(); return; }
      if (held > o.max || !canMenu()) return;
      sfx('click', { vol: 0.6 });
      try { fn(); } catch (err) { console.error('[UI] corner', err); }
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return h;
  }
  function endCorner(h) {
    h.id = null; h.b.classList.remove('down', 'holding', 'armed'); h.b.style.setProperty('--hp', '0');
    const i = CORNERS.indexOf(h); if (i >= 0) CORNERS.splice(i, 1);
  }
  function cornerToSteer(h) {
    const id = h.id;
    endCorner(h);   // first, so the lostpointercapture that follows is ignored
    try { h.b.releasePointerCapture(id); } catch (err) { /* ignore */ }
    steerFrom(id, h.x, h.y);
  }
  function cornerTick() {
    for (let i = CORNERS.length - 1; i >= 0; i--) {
      const h = CORNERS[i];
      if (!canMenu()) { endCorner(h); continue; }
      const held = S.t - h.t0;
      if (held > h.o.max) { cornerToSteer(h); continue; }
      if (h.o.hold) {
        const p = clamp(held / h.o.hold, 0, 1);
        h.b.style.setProperty('--hp', p.toFixed(3));
        h.b.classList.toggle('armed', p >= 1);   // full ring: lift now to open
      }
    }
  }
  function holdTick() {
    for (let i = HOLDS.length - 1; i >= 0; i--) {
      const h = HOLDS[i], p = clamp((S.t - h.t0) / (h.dur || h.sec), 0, 1);
      h.b.style.setProperty('--hp', p.toFixed(3));
      if (p >= 1) { endHold(h); try { h.fn(); } catch (err) { console.error('[UI] hold', err); } }
    }
    // the restart question closes itself after 6 s without input (a kid who wandered in can't get stuck there)
    if (S.menu === 'pause' && D.pausePanel.classList.contains('asking') && !HOLDS.length && S.t - S.askT > 6) closeAsk();
  }

  // Tap (for scrollable bag rows): fires on pointerup if the finger didn't travel; a browser pan sends pointercancel.
  function onTap(b, fn) {
    let sx = 0, sy = 0, id = null;
    b.addEventListener('pointerdown', e => { if (e.button > 0) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; b.classList.add('down'); e.stopPropagation(); });
    b.addEventListener('pointerup', e => {
      if (e.pointerId !== id) return; id = null; b.classList.remove('down');
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 14 && performance.now() > S.guardUntil) { sfx('click', { vol: 0.6 }); fn(e); }
    });
    const cancel = () => { id = null; b.classList.remove('down'); };
    b.addEventListener('pointercancel', cancel); b.addEventListener('pointerleave', cancel);
  }

  // ───────────────────────── DOM ─────────────────────────
  function build() {
    const root = D.root = el('div', '', document.body); root.id = 'ui';
    if (ICON) { root.classList.add('ikon'); document.body.classList.add('u-ikon'); }
    const hud = D.hud = el('div', '', root); hud.id = 'uiHud';

    // top-left: portrait + level star + xp + gold
    const tl = D.tl = el('div', 'u-tl', hud);
    D.face = el('div', 'u-face', tl);
    D.faceIn = el('div', 'u-fimg', D.face, '<span class="u-femo">🧒</span>');
    D.lvl = el('div', 'u-lvl', D.face, '<span>1</span>');
    el('span', 'u-hold', D.face);   // hold the portrait 0.5 s → wardrobe
    const st = el('div', 'u-stats', tl);
    D.xp = el('div', 'u-xp', st);
    D.xpFill = el('div', 'u-xpfill', D.xp);
    el('div', 'u-xpstar', D.xp, '⭐');
    D.gold = el('div', 'u-gold', st, '<span class="u-coin"></span><span class="u-gn">' + ol('0', 'u-gold-t') + '</span>');
    D.goldB = D.gold.querySelector('.u-gn b'); D.goldI = D.gold.querySelector('.u-gn i');

    // top-right: 🎒 and ⏸ in one row hugging the top edge, left of the minimap (music lives in the pause menu)
    const tr = D.tr = el('div', 'u-tr', hud);
    const sb = el('div', 'u-sbtns', tr);
    D.bagBtn = el('button', 'u-rbtn', sb, '<span class="u-emo">🎒</span><span class="u-dot"></span>');
    D.pauseBtn = el('button', 'u-rbtn', sb, SVG.pause + '<span class="u-hold"></span>');   // 0.5 s hold
    const mini = el('div', 'u-mini', tr);
    D.map = el('canvas', '', mini);

    // boss bar
    D.boss = el('div', 'u-boss', hud);
    D.bossName = el('div', 'u-bossname', D.boss, ol('Huysuz Ejderha'));
    const brow = el('div', 'u-bossrow', D.boss);
    D.bossIco = el('div', 'u-bossico', brow, dragonHTML());   // portrait of the friendly dragon (never the fierce 🐲 emoji)
    const bbar = el('div', 'u-bossbar', brow);
    D.bossTrail = el('div', 'u-bosstrail', bbar);
    D.bossFill = el('div', 'u-bossfill', bbar);

    // toast, banner, item card, subtitles
    D.toast = el('div', 'u-toast', hud);
    D.banner = el('div', 'u-banner', hud);
    D.card = el('div', 'u-card', hud);
    D.hint = el('div', 'u-hint', hud, '<span class="u-hring"></span><span class="u-hring b"></span><span class="u-hand">👆</span>');

    // bottom-left: health orb + potion
    const bl = D.bl = el('div', 'u-bl', hud);
    D.orb = el('div', 'u-orb', bl);
    el('div', 'u-orbglow', D.orb);
    D.orbCv = el('canvas', '', D.orb);
    D.pot = el('button', 'u-potion', bl, SVG.potion + '<span class="u-badge">3</span>');
    D.potN = D.pot.querySelector('.u-badge');

    // bottom-right: attack + one button per skill on the arc around it
    const pad = D.pad = el('div', 'u-pad', hud);
    D.atk = el('button', 'u-atk', pad, SVG.sword);
    D.atkBlade = D.atk.querySelector('.u-blade');
    D.atk.style.setProperty('--x', 0); D.atk.style.setProperty('--y', 0);
    D.sk = [];
    const nSk = clamp((M.SKILLS && M.SKILLS.length) || 3, 1, ARC.length);
    for (let i = 0; i < nSk; i++) {
      const b = el('button', 'u-skill u-hide', pad, '<span class="u-ico"></span><span class="u-cd"></span><span class="u-cdn"></span>');
      const [r, a] = ARC[i], rad = a * Math.PI / 180;
      b.style.setProperty('--x', (-Math.cos(rad) * r).toFixed(1)); b.style.setProperty('--y', (-Math.sin(rad) * r).toFixed(1));
      D.sk.push({ b, ico: b.firstChild, cd: b.children[1], cdn: b.children[2], shown: false, p: -1, n: -1 });
    }

    buildTitle(root); buildPause(root); buildBag(root); buildWin(root);
    // subtitles live above every screen (the victory line plays over the victory panel)
    D.sub = el('div', 'u-sub', root, '<div class="u-subico">✨</div><div class="u-subtxt"></div>');
    D.subIco = D.sub.firstChild; D.subTxt = D.sub.lastChild;
    D.fade = el('div', '', document.body, '<div class="u-fstar">✨</div>');
    D.fade.id = 'uiFade';
    wireButtons();
  }

  function buildTitle(root) {
    const t = D.title = el('div', 'u-screen u-title', root);
    el('div', 'u-tshade', t);
    const logo = el('div', 'u-logo', t);
    const word = el('div', 'u-word', logo);
    for (const ch of 'FEZA') el('span', 'u-let', word, `<b>${ch}</b><i>${ch}</i>`);
    el('div', 'u-ribbon', logo, ol('Kötülere Karşı'));
    [[-8, 12, 0], [104, 6, 0.7], [96, 64, 1.4], [-4, 70, 1.9], [50, -8, 1.1]].forEach(([x, y, d]) => {
      const s = el('span', 'u-spark', logo, '✦'); s.style.left = x + '%'; s.style.top = y + '%'; s.style.animationDelay = d + 's';
    });
    const bt = el('div', 'u-tbtns', t);
    D.playBtn = el('button', 'u-btn g', bt, SVG.play + '<span>Oyna</span>');   // only without a save (never wipes progress)
    D.contBtn = el('button', 'u-btn g', bt, SVG.cont + '<span>Devam Et</span>');
    const tg = el('div', 'u-ttog', t);
    D.tMus = el('button', 'u-rbtn', tg, SVG.note + '<span class="u-slash"></span>'); D.tMus.dataset.tog = 'music';   // sound effects: pause menu only
  }
  function buildPause(root) {
    const s = D.pause = el('div', 'u-screen u-dim', root);
    const p = D.pausePanel = el('div', 'u-panel', s);
    el('div', 'u-ptitle', p, ol('Mola', 'u-gold-t'));
    const m = el('div', 'u-main', p);
    D.resume = el('button', 'u-btn g wide', m, SVG.play + '<span>Devam Et</span>');
    const row = el('div', 'u-prow', m);
    D.pSnd = el('button', 'u-btn p', row, SVG.sound + '<span class="u-lab">Efektler Açık</span>'); D.pSnd.dataset.tog = 'sound';   // sound effects only
    D.pMus = el('button', 'u-btn p', row, SVG.note + '<span class="u-lab">Müzik Açık</span>'); D.pMus.dataset.tog = 'music';
    D.restart = el('button', 'u-btn o wide', m, SVG.again + '<span>Baştan Başla</span>');
    // Restart question (parental gate): same height as the main panel; the big green "Hayır" lands exactly where
    // "Baştan Başla" was (a double tap is safe) and the small red "Evet" only fires after a 2 s press-and-hold.
    const ask = el('div', 'u-ask', p);
    el('div', 'u-asktxt', ask, 'Yeniden en baştan<br>başlansın mı?');
    const yb = el('div', 'u-yesbox', ask);
    D.yes = el('button', 'u-btn r u-small', yb, '<span class="u-hfill"></span>' + SVG.again + '<span>Evet</span>');
    el('div', 'u-yeshint', yb, 'Basılı tut');
    D.no = el('button', 'u-btn g wide', ask, SVG.close + '<span>Hayır</span>');
  }
  function buildBag(root) {
    const s = D.bagS = el('div', 'u-screen u-dim', root);
    const p = D.bagP = el('div', 'u-panel u-bag', s);
    D.bagClose = el('button', 'u-rbtn u-close', p, SVG.close);
    const l = el('div', 'u-bagl', p);
    D.bagFace = el('div', 'u-bagface', l, '<span class="u-femo">🧒</span>');
    const meta = el('div', 'u-bagmeta', l);
    el('div', 'u-bagname', meta, ol('Feza', 'u-gold-t'));
    D.bagChips = el('div', 'u-chips', meta);
    const r = el('div', 'u-bagr', p);
    el('div', 'u-bagtitle', r, ol('Dolabım', 'u-gold-t'));
    D.slots = {};
    for (const sl of SLOTS) {
      const box = el('div', 'u-slot', r);
      const hd = el('div', 'u-slothd', box, `<span>${SLOT_EMO[sl]} ${SLOT_AD[sl]}</span><small></small>`);
      D.slots[sl] = { hdName: hd.querySelector('small'), tiles: el('div', 'u-tiles', box) };
    }
  }
  function buildWin(root) {
    const s = D.win = el('div', 'u-screen u-dim u-win', root);
    D.conf = el('div', 'u-conf', s);
    const wrap = el('div', 'u-wwrap', s);
    el('div', 'u-rays', wrap);
    const p = el('div', 'u-panel', wrap);
    el('div', 'u-wcry', p, '💖');
    el('div', 'u-ptitle', p, ol('Tebrikler Feza!', 'u-gold-t'));
    el('div', 'u-wsub', p, 'Herkes yeniden neşeli! 🎉');
    D.winChips = el('div', 'u-chips', p);
    D.again = el('button', 'u-btn g wide', p, SVG.play + '<span>Tekrar Oyna</span>');
  }

  function wireButtons() {
    onPress(D.playBtn, () => startGame(false), { menu: true });
    onPress(D.contBtn, () => startGame(true), { menu: true });
    for (const b of [D.tMus, D.pMus, D.pSnd]) onPress(b, () => setPref(b.dataset.tog, !S.prefs[b.dataset.tog]), { menu: true });
    // ⏸: hold still 0.5 s, then lift (random taps near the top edge must not stop the game; a short tap only wiggles it).
    // 🎒: a quick tap. Longer or dragging presses on either are a steering finger and walk Feza instead (onCorner).
    onCorner(D.pauseBtn, () => openPause(), { hold: 0.5, max: 2.5, early: () => wiggle(D.pauseBtn) });
    onCorner(D.bagBtn, () => openBag(), { hold: 0, max: 0.8 });
    onPress(D.resume, () => closeMenu(), { menu: true });
    onPress(D.restart, () => { D.pausePanel.classList.add('asking'); S.askT = S.t; S.guardUntil = performance.now() + 800; }, { menu: true });
    onPress(D.no, () => closeAsk(), { menu: true });
    onHold(D.yes, 2, () => restartAll(), { menu: true });
    onPress(D.bagClose, () => closeMenu(), { menu: true });
    D.bagS.addEventListener('pointerdown', e => { if (e.target === D.bagS) closeMenu(); });
    D.pause.addEventListener('pointerdown', e => {
      S.askT = S.t;   // any touch keeps the restart question open a little longer
      if (e.target === D.pause && !D.pausePanel.classList.contains('asking')) closeMenu();
    }, true);
    onPress(D.again, () => playAgain(), { menu: true });
    // hold your own portrait 0.5 s, then lift → wardrobe (the item card no longer opens it: it slides over the play area)
    onCorner(D.face, () => openBag(), { hold: 0.5, max: 2.5 });
    // HUD action buttons (no rate limit: kids mash)
    onPress(D.atk, () => { attack(); S.atkHeld = true; S.atkNext = S.t + 0.34; }, { up: () => { S.atkHeld = false; } });
    onPress(D.pot, () => {
      const g = M.GAME; if (!g || !playing()) return;
      const ok = safe('potion', () => g.input.potion());
      if (ok) bump(D.pot, 1.18); else nope(D.pot);
    });
    D.sk.forEach((s, i) => onPress(s.b, () => {
      const g = M.GAME; if (!g || !playing()) return;
      const ok = safe('cast', () => g.input.cast(i));
      if (ok) { s.b.classList.remove('new'); bump(s.b, 1.15, true); } else nope(s.b, true);
    }));
  }
  function closeAsk() {
    if (!D.pausePanel.classList.contains('asking')) return;
    D.pausePanel.classList.remove('asking'); S.guardUntil = performance.now() + 300;
    for (const h of HOLDS.slice()) if (h.b === D.yes) endHold(h);
  }
  const canMenu = () => S.mode === 'play' && !S.menu && !S.busy && gameAllowsMenu();
  function gameAllowsMenu() { const g = M.GAME; return !g || g.state === 'play' || g.state === 'dead'; }
  const playing = () => S.mode === 'play' && !S.menu;
  function attack() { const g = M.GAME; if (g && playing()) safe('attack', () => g.input.attack()); }

  // Small WAAPI juice (composited, no reflow)
  function bump(e, k = 1.2, centred) {
    const b = centred ? 'translate(-50%,-50%) ' : '';
    if (e.animate) e.animate([{ transform: b + 'scale(1)' }, { transform: b + `scale(${k})` }, { transform: b + 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }
  function wiggle(e, centred) {
    const b = centred ? 'translate(-50%,-50%) ' : '';
    if (e.animate) e.animate([0, -7, 7, -5, 4, 0].map(x => ({ transform: b + `translateX(${x}px)` })), { duration: 300, easing: 'ease-out' });
  }
  function nope(e, centred) { wiggle(e, centred); sfx('nope', { vol: 0.5 }); }   // pressed, but it can't be used right now

  // ───────────────────────── Input ─────────────────────────
  function bindInput() {
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      steerFrom(e.pointerId, e.clientX, e.clientY);
    });
    const up = e => { if (e.pointerId === S.primary) releasePrimary(); };
    cv.addEventListener('pointermove', steerMove);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('dblclick', e => e.preventDefault());

    // Audio unlock: first pointerdown creates the context; pointerup/touchend/keydown (real activation on iOS) resume it.
    const unlock = () => {
      if (SILENT || !M.AUD) return;
      const A = M.AUD;
      if (A.ready && A.ready()) { for (const ev of UNLOCK_EVS) removeEventListener(ev, unlock, true); return; }
      safe('unlock', () => A.unlock());
    };
    const UNLOCK_EVS = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
    if (!SILENT) for (const ev of UNLOCK_EVS) addEventListener(ev, unlock, true);

    // Keyboard fallback
    const K = { left: false, right: false, up: false, down: false };
    const DIRS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
    let kx = 0, kz = 0;
    const sendKeys = () => {
      const x = (K.right ? 1 : 0) - (K.left ? 1 : 0), z = (K.down ? 1 : 0) - (K.up ? 1 : 0);
      if (x === kx && z === kz) return;
      kx = x; kz = z;
      if (M.GAME) safe('input.key', () => M.GAME.input.key(playing() ? x : 0, playing() ? z : 0));
    };
    addEventListener('keydown', e => {
      const c = e.code;
      if (DIRS[c]) { K[DIRS[c]] = true; sendKeys(); e.preventDefault(); return; }
      if (e.repeat) { if (c === 'Space') e.preventDefault(); return; }
      if (c === 'Escape') { if (S.menu) closeMenu(); else if (S.mode === 'play') openPause(); return; }
      if (S.mode === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); startGame(!!(M.GAME && safe('hasSave', () => M.GAME.hasSave()))); return; }
      if (!playing()) return;
      if (c === 'Space') { e.preventDefault(); attack(); bump(D.atk, 1.1, true); }
      else if (/^Digit[1-6]$/.test(c)) { const i = +c.slice(5) - 1, s = D.sk[i]; if (s && s.shown) { const ok = safe('cast', () => M.GAME.input.cast(i)); if (ok) { s.b.classList.remove('new'); bump(s.b, 1.15, true); } } }
      else if (c === 'KeyQ') { if (safe('potion', () => M.GAME.input.potion())) bump(D.pot, 1.18); }
      else if (c === 'KeyB' || c === 'KeyI') openBag();
    });
    addEventListener('keyup', e => { const d = DIRS[e.code]; if (d) { K[d] = false; sendKeys(); } });
    addEventListener('blur', () => { K.left = K.right = K.up = K.down = false; sendKeys(); releasePrimary(); S.atkHeld = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play' && !S.menu) openPause(); });
    const touched = () => { S.titleIdle = 0; };   // title voice prompt waits for a quiet moment
    addEventListener('pointerdown', touched, true); addEventListener('keydown', touched, true);
  }
  // Start steering with this finger (canvas press, or a HUD corner press handed over by onCorner).
  function steerFrom(id, x, y) {
    if (S.primary !== null) {   // another finger is steering; take over only if its events went silent (lost pointerup)
      if (performance.now() - S.primaryT < 1000) return false;
      releasePrimary();
    }
    if (!playing()) return false;
    S.primary = id; S.primaryT = performance.now();
    try { renderer.domElement.setPointerCapture(id); } catch (err) { /* ignore */ }
    const g = M.GAME; if (g) safe('input.down', () => g.input.down(x, y));
    return true;
  }
  function steerMove(e) {
    if (e.pointerId !== S.primary || !M.GAME) return;
    S.primaryT = performance.now();
    safe('input.move', () => M.GAME.input.move(e.clientX, e.clientY));
  }
  function releasePrimary() {
    if (S.primary === null) return;
    S.primary = null;
    if (M.GAME) safe('input.up', () => M.GAME.input.up());
  }

  // ───────────────────────── Layout ─────────────────────────
  function onResize() {
    const w = innerWidth, h = innerHeight;
    const k = clamp(Math.min(w, h) / 800, 0.6, 1.12);
    document.documentElement.style.setProperty('--k', k.toFixed(3));
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    D.root.classList.toggle('submid', w > h && w - (300 + 290) * k - 40 < 470);   // narrow landscape: subtitles sit right of the orb
    orbResize(); mapResize();
    measureBossBar();
    S.needRender = true;
  }
  // Lowest screen y the boss bar covers (layout box, ignores its drop-in transform): the boss camera keeps the dragon below it.
  function measureBossBar() { S.bossTop = D.boss.offsetTop + D.boss.offsetHeight + 10; }

  // ───────────────────────── Health orb (canvas) ─────────────────────────
  const ORB = { px: 0, back: null, front: null, grad: null, shown: 1, target: 1, t: 0, hurt: 0, heal: 0, acc: 1 };
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
  function orbResize() {
    const css = D.orb.clientWidth || 190, px = Math.max(64, Math.round(css * S.dpr));
    if (px === ORB.px) return;
    ORB.px = px; ORB.acc = 1; D.orbCv.width = D.orbCv.height = px;
    const cx = px / 2, R = px * 0.37;
    // back: empty dark glass
    ORB.back = cnv(px); let c = ORB.back.getContext('2d');
    let g = c.createRadialGradient(cx, cx * 0.92, R * 0.05, cx, cx, R);
    g.addColorStop(0, '#4d1024'); g.addColorStop(0.7, '#260612'); g.addColorStop(1, '#10020a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, R, 0, TAU); c.fill();
    // liquid shading
    ORB.grad = D.orbCv.getContext('2d').createRadialGradient(cx - R * 0.34, cx - R * 0.12, R * 0.08, cx, cx + R * 0.1, R * 1.08);
    ORB.grad.addColorStop(0, '#ff8a98'); ORB.grad.addColorStop(0.32, '#f5263f'); ORB.grad.addColorStop(0.72, '#b50d27'); ORB.grad.addColorStop(1, '#5a0012');
    // front: inner shadow, glass highlights, ornate gold rim with studs and a heart plaque
    ORB.front = cnv(px); c = ORB.front.getContext('2d');
    g = c.createRadialGradient(cx, cx, R * 0.62, cx, cx, R);
    g.addColorStop(0, 'rgba(30,0,12,0)'); g.addColorStop(1, 'rgba(30,0,12,0.6)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, R, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(cx, cx, R, 0, TAU); c.clip();
    c.translate(cx - R * 0.3, cx - R * 0.46); c.rotate(-0.55);
    g = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.62)'); g.addColorStop(0.6, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.scale(1, 0.55); c.beginPath(); c.arc(0, 0, R * 0.5, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(cx - R * 0.5, cx - R * 0.42, R * 0.06, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,190,205,0.35)'; c.lineWidth = R * 0.05; c.lineCap = 'round';
    c.beginPath(); c.arc(cx, cx, R * 0.86, 0.2, 1.25); c.stroke();
    // rim
    const rr = R * 1.1, rw = R * 0.2;
    let rg;
    if (c.createConicGradient) {
      rg = c.createConicGradient(-Math.PI / 2, cx, cx);
      [['#fff3b8', 0], ['#e6a526', 0.1], ['#8a560a', 0.2], ['#ffd766', 0.32], ['#fff6cf', 0.42], ['#c6861a', 0.55], ['#7a4a08', 0.66], ['#ffda70', 0.78], ['#fff3b8', 0.9], ['#fff3b8', 1]].forEach(([col, o]) => rg.addColorStop(o, col));
    } else {
      rg = c.createLinearGradient(0, 0, px, px); rg.addColorStop(0, '#fff3b8'); rg.addColorStop(0.5, '#d3921c'); rg.addColorStop(1, '#8a560a');
    }
    c.lineWidth = rw; c.strokeStyle = rg; c.beginPath(); c.arc(cx, cx, rr, 0, TAU); c.stroke();
    c.lineWidth = Math.max(1.5, px * 0.012); c.strokeStyle = 'rgba(70,30,4,0.95)';
    c.beginPath(); c.arc(cx, cx, rr + rw / 2, 0, TAU); c.stroke();
    c.beginPath(); c.arc(cx, cx, rr - rw / 2, 0, TAU); c.stroke();
    c.lineWidth = rw * 0.18; c.strokeStyle = 'rgba(255,252,225,0.75)';
    c.beginPath(); c.arc(cx, cx, rr + rw * 0.2, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    c.lineWidth = rw * 0.12; c.strokeStyle = 'rgba(90,45,5,0.45)';
    c.beginPath(); c.arc(cx, cx, rr - rw * 0.15, Math.PI * 0.05, Math.PI * 0.55); c.stroke();
    const stud = (x, y, r, col) => {
      const sg = c.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.35, col); sg.addColorStop(1, shade(col, -0.55));
      c.fillStyle = sg; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.lineWidth = Math.max(1, r * 0.22); c.strokeStyle = 'rgba(70,30,4,0.9)'; c.stroke();
    };
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 4;
      if (i === 4) continue;
      stud(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, rw * (i % 2 ? 0.34 : 0.42), i % 2 ? '#ffe27a' : '#ff5c82');
    }
    // heart plaque at the bottom
    const hy = cx + rr, hr = R * 0.23;
    stud(cx, hy, hr, '#ffd24a');
    c.save(); c.translate(cx, hy + hr * 0.08); c.scale(hr / 12, hr / 12);
    c.beginPath(); c.moveTo(0, 7); c.bezierCurveTo(-9, 1, -8, -7, -3.6, -7); c.bezierCurveTo(-1.6, -7, 0, -5.6, 0, -4);
    c.bezierCurveTo(0, -5.6, 1.6, -7, 3.6, -7); c.bezierCurveTo(8, -7, 9, 1, 0, 7); c.closePath();
    const hg = c.createLinearGradient(0, -7, 0, 7); hg.addColorStop(0, '#ff7b92'); hg.addColorStop(1, '#d4102f');
    c.fillStyle = hg; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#5a0010'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(-3.4, -3.6, 1.6, 0, TAU); c.fill();
    c.restore();
  }
  // Liquid surface path (hoisted: no per-frame closures)
  function orbWave(c, cx, R, lvl, amp, t, ph, k1, s1, k2, s2) {
    c.beginPath(); c.moveTo(cx - R, cx + R + 2);
    for (let i = 0; i <= 24; i++) {
      const x = cx - R + (2 * R * i) / 24, u = (x - cx) / R;
      c.lineTo(x, lvl + amp * Math.sin(u * k1 + t * s1 + ph) + amp * 0.45 * Math.sin(u * k2 - t * s2 + ph * 1.7));
    }
    c.lineTo(cx + R, cx + R + 2); c.closePath();
  }
  function orbDraw(dt) {
    if (!ORB.px) return;
    ORB.t += dt; ORB.acc += dt;
    const falling = ORB.target < ORB.shown;
    ORB.shown = damp(ORB.shown, ORB.target, falling ? 7 : 3.2, dt);
    ORB.hurt = Math.max(0, ORB.hurt - dt * 2.8); ORB.heal = Math.max(0, ORB.heal - dt * 1.6);
    // calm orb (only the waves move): redraw at ~30 Hz; while it fills/drains or flashes, every frame
    const busy = ORB.hurt > 0 || ORB.heal > 0 || Math.abs(ORB.shown - ORB.target) > 0.002;
    if (!busy && ORB.acc < 1 / 31) return;
    ORB.acc = 0;
    const c = D.orbCv.getContext('2d'), px = ORB.px, cx = px / 2, R = px * 0.37, f = clamp(ORB.shown, 0, 1), t = ORB.t;
    c.clearRect(0, 0, px, px);
    c.drawImage(ORB.back, 0, 0);
    if (f > 0.002) {
      c.save(); c.beginPath(); c.arc(cx, cx, R, 0, TAU); c.clip();
      const lvl = cx + R - 2 * R * f, amp = R * 0.055 * Math.min(1, f * 6, (1 - f) * 10 + 0.15);
      orbWave(c, cx, R, lvl, amp, t, 1.9, 4.2, 1.7, 7.5, 2.3); c.fillStyle = '#82041a'; c.globalAlpha = 0.9; c.fill(); c.globalAlpha = 1;
      orbWave(c, cx, R, lvl, amp, t, 0, 3.4, 2.4, 6.1, 3.1); c.fillStyle = ORB.grad; c.fill();
      // surface sheen
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const x = cx - R + (2 * R * i) / 24, u = (x - cx) / R;
        const y = lvl + amp * Math.sin(u * 3.4 + t * 2.4) + amp * 0.45 * Math.sin(u * 6.1 - t * 3.1);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.lineWidth = Math.max(1.5, R * 0.035); c.strokeStyle = '#ffbec8'; c.globalAlpha = 0.75; c.stroke();
      // bubbles
      c.fillStyle = '#ffd7de'; c.globalAlpha = 0.45;
      for (let i = 0; i < 6; i++) {
        const ph = (t * (0.18 + i * 0.037) + i * 0.29) % 1, bx = cx + Math.sin(i * 2.3 + t * 1.3) * R * 0.5, by = cx + R - ph * 2 * R * 0.95;
        if (by > lvl + amp * 1.5) { c.beginPath(); c.arc(bx, by, R * (0.025 + (i % 3) * 0.012), 0, TAU); c.fill(); }
      }
      if (ORB.heal > 0) { c.fillStyle = '#fff0c8'; c.globalAlpha = 0.35 * ORB.heal; c.fillRect(0, 0, px, px); }
      c.globalAlpha = 1;
      c.restore();
    }
    if (ORB.hurt > 0) { c.fillStyle = '#ffffff'; c.globalAlpha = 0.5 * ORB.hurt * ORB.hurt; c.beginPath(); c.arc(cx, cx, R, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.drawImage(ORB.front, 0, 0);
  }
  function orbHurt() {
    ORB.hurt = 1;
    if (D.orb.animate) D.orb.animate([
      { transform: 'translate(0,0) rotate(0)' }, { transform: 'translate(-7px,3px) rotate(-4deg)' }, { transform: 'translate(6px,-2px) rotate(3deg)' },
      { transform: 'translate(-4px,1px) rotate(-2deg)' }, { transform: 'translate(2px,0) rotate(1deg)' }, { transform: 'translate(0,0) rotate(0)' },
    ], { duration: 380, easing: 'ease-out' });
  }

  // ───────────────────────── Minimap ─────────────────────────
  const MM = { L: null, W: 0, H: 0, S: 4, base: null, mask: null, rev: null, seen: null, lx: -1e9, lz: -1e9, dirty: false, px: 0, bg: null, front: null, spr: {} };
  function mapResize() {
    const css = D.map.clientWidth || 166, px = Math.max(48, Math.round(css * S.dpr));
    if (px === MM.px) return;
    MM.px = px; D.map.width = D.map.height = px;
    const cx = px / 2;
    MM.bg = cnv(px); let c = MM.bg.getContext('2d');
    let g = c.createRadialGradient(cx, cx * 0.8, px * 0.05, cx, cx, cx);
    g.addColorStop(0, '#2a3566'); g.addColorStop(1, '#0c1028');
    c.fillStyle = g; c.fillRect(0, 0, px, px);
    c.fillStyle = 'rgba(160,190,255,0.10)';
    for (let y = px * 0.04; y < px; y += px * 0.07) for (let x = px * 0.04; x < px; x += px * 0.07) { c.beginPath(); c.arc(x, y, px * 0.006, 0, TAU); c.fill(); }
    MM.front = cnv(px); c = MM.front.getContext('2d');
    g = c.createRadialGradient(cx, cx, cx * 0.68, cx, cx, cx);
    g.addColorStop(0, 'rgba(8,4,26,0)'); g.addColorStop(1, 'rgba(8,4,26,0.7)');
    c.fillStyle = g; c.fillRect(0, 0, px, px);
    c.save(); c.translate(cx * 0.62, cx * 0.42); c.rotate(-0.6); c.scale(1, 0.45);
    g = c.createRadialGradient(0, 0, 0, 0, 0, cx * 0.55);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, cx * 0.55, 0, TAU); c.fill(); c.restore();
    makeSprites();
  }
  function sprite(css, draw) {
    const d = S.dpr, c = cnv(Math.ceil(css * d)), x = c.getContext('2d');
    x.scale(d, d); draw(x, css); c.css = css; return c;
  }
  function emojiSprite(ch, css, ring) {
    return sprite(css, (x, s) => {
      if (ring) { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, ring); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }
      x.font = `${Math.round(s * 0.66)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, s / 2, s / 2 + s * 0.04);
    });
  }
  function makeSprites() {
    const P = MM.spr;
    P.portal = sprite(28, (x, s) => {
      const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#c6a6ff'); g.addColorStop(0.62, '#7a4dff'); g.addColorStop(1, 'rgba(90,40,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      x.strokeStyle = '#f1e6ff'; x.lineWidth = 2; x.beginPath(); x.arc(s / 2, s / 2, s * 0.26, 0.3, 5.2); x.stroke();
    });
    P.chest = sprite(18, (x, s) => {
      x.fillStyle = '#3a1a08'; x.beginPath(); x.roundRect ? x.roundRect(1.5, 3.5, s - 3, s - 6, 3) : x.rect(1.5, 3.5, s - 3, s - 6); x.fill();
      x.fillStyle = '#c9803a'; x.fillRect(3, 5, s - 6, s - 9.5);
      x.fillStyle = '#ffd23f'; x.fillRect(3, 8.2, s - 6, 2); x.fillRect(s / 2 - 1.5, 5, 3, s - 9.5);
    });
    const diamond = (col, glow) => sprite(20, (x, s) => {
      if (glow) { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,150,220,0.9)'); g.addColorStop(1, 'rgba(255,150,220,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); }
      x.beginPath(); x.moveTo(s / 2, 2.5); x.lineTo(s - 5, s / 2); x.lineTo(s / 2, s - 2.5); x.lineTo(5, s / 2); x.closePath();
      x.fillStyle = col; x.fill(); x.lineWidth = 1.6; x.strokeStyle = '#3a0a3a'; x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.moveTo(s / 2, 4.5); x.lineTo(s / 2 + 2.5, s / 2 - 1); x.lineTo(s / 2, s / 2 - 1); x.closePath(); x.fill();
    });
    P.cp = diamond('#d9a0c8', false); P.cpOn = diamond('#ff6ad0', true);
    P.npc = emojiSprite('🦉', 22, 'rgba(255,230,160,0.7)');
    P.boss = dragonSprite();
    P.crystal = emojiSprite('💖', 26, 'rgba(255,150,220,0.9)');
  }
  function mapReset(L) {
    MM.L = L; MM.base = null; MM.lx = MM.lz = -1e9;
    if (!L || !L.grid || !L.W || !L.H) return;
    const W = MM.W = L.W, H = MM.H = L.H, s = MM.S = clamp(Math.floor(480 / Math.max(W, H)), 2, 5);
    let src = L.mapCanvas && L.mapCanvas.width ? L.mapCanvas : null;
    if (src && blankCanvas(src)) src = null;
    if (!src) src = gridCanvas(L);
    const base = MM.base = cnv(W * s, H * s), c = base.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.shadowColor = 'rgba(4,2,16,0.95)'; c.shadowBlur = s * 2.2;
    c.drawImage(src, 0, 0, W * s, H * s);
    c.shadowBlur = 0; c.drawImage(src, 0, 0, W * s, H * s);
    c.globalCompositeOperation = 'source-atop';   // soft top light so floors read as raised plates
    const g = c.createLinearGradient(0, 0, 0, H * s); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.08)');
    c.fillStyle = g; c.fillRect(0, 0, W * s, H * s);
    c.globalCompositeOperation = 'source-over';
    MM.mask = cnv(W, H); MM.rev = cnv(W * s, H * s); MM.seen = new Uint8Array(W * H);
    MM.dirty = true;
  }
  function blankCanvas(cv) {
    try {
      const t = cnv(cv.width, cv.height), x = t.getContext('2d', { willReadFrequently: true });
      x.drawImage(cv, 0, 0);
      const d = x.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 8) return false;
      return true;
    } catch (e) { return false; }
  }
  function gridCanvas(L) {   // fallback base when LEVEL gave no (or an empty) mapCanvas
    const c = cnv(L.W, L.H), x = c.getContext('2d'), img = x.createImageData(L.W, L.H), d = img.data;
    const theme = (L.Z && L.Z.theme) || 'forest';
    const col = new THREE.Color(theme === 'cave' ? '#86a9c9' : theme === 'castle' ? '#c3b2e6' : '#94d470');
    const r = Math.round(Math.pow(col.r, 1 / 2.2) * 255), gg = Math.round(Math.pow(col.g, 1 / 2.2) * 255), b = Math.round(Math.pow(col.b, 1 / 2.2) * 255);
    for (let i = 0; i < L.W * L.H; i++) {
      if (!L.grid[i]) continue;
      const n = ((i * 2654435761) >>> 24) / 255 * 14 - 7;
      d[i * 4] = clamp(r + n, 0, 255); d[i * 4 + 1] = clamp(gg + n, 0, 255); d[i * 4 + 2] = clamp(b + n, 0, 255); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (L.path && L.path.length > 1) {   // soft path line so the way forward reads on the map
      x.strokeStyle = 'rgba(255,238,190,0.45)'; x.lineWidth = 2; x.lineCap = x.lineJoin = 'round';
      x.beginPath(); L.path.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z))); x.stroke();
    }
    return c;
  }
  function mapReveal(x, z) {
    if (!MM.base || dist2(x, z, MM.lx, MM.lz) < 0.6) return;
    MM.lx = x; MM.lz = z;
    const c = MM.mask.getContext('2d'), R = MAP_REVEAL;
    const g = c.createRadialGradient(x, z, 0, x, z, R);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, z, R, 0, TAU); c.fill();
    const r = Math.ceil(R * 0.85), i0 = Math.max(0, Math.floor(x) - r), i1 = Math.min(MM.W - 1, Math.floor(x) + r);
    const j0 = Math.max(0, Math.floor(z) - r), j1 = Math.min(MM.H - 1, Math.floor(z) + r), rr = R * R * 0.72;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (dist2(i + 0.5, j + 0.5, x, z) < rr) MM.seen[j * MM.W + i] = 1;
    MM.dirty = true;
  }
  const seen = (x, z) => { if (!MM.seen) return true; const i = Math.floor(x), j = Math.floor(z); return i >= 0 && j >= 0 && i < MM.W && j < MM.H && MM.seen[j * MM.W + i] === 1; };
  function mapCompose() {
    const c = MM.rev.getContext('2d'), w = MM.rev.width, h = MM.rev.height;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    c.drawImage(MM.base, 0, 0);
    c.globalCompositeOperation = 'destination-in'; c.imageSmoothingEnabled = true;
    c.drawImage(MM.mask, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    MM.dirty = false;
  }
  // minimap view transform for the current frame (hoisted helpers: no per-frame closures)
  const MV = { c: null, cx: 0, sc: 1, px: 0, pz: 0, d: 1 };
  const msx = x => MV.cx + (x - MV.px) * MV.sc, msy = z => MV.cx + (z - MV.pz) * MV.sc;
  const mInView = (x, z, m) => dist2(x, z, MV.px, MV.pz) < (MAP_VIEW + m) * (MAP_VIEW + m);
  function mIcon(spr, x, z, k) { const w = spr.css * MV.d * k; MV.c.drawImage(spr, msx(x) - w / 2, msy(z) - w / 2, w, w); }
  function mapDraw() {
    const g = M.GAME; if (!g || !MM.px) return;
    const P = g.P, L = g.L;
    if (L !== MM.L) mapReset(L);
    const px = P.pos.x, pz = P.pos.z;
    mapReveal(px, pz);
    if (MM.dirty && MM.base) mapCompose();
    const c = D.map.getContext('2d'), N = MM.px, cx = N / 2, sc = cx / MAP_VIEW, d = S.dpr, t = S.t;
    MV.c = c; MV.cx = cx; MV.sc = sc; MV.px = px; MV.pz = pz; MV.d = d;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, N, N);
    c.save(); c.beginPath(); c.arc(cx, cx, cx, 0, TAU); c.clip();
    c.drawImage(MM.bg, 0, 0);
    if (MM.base) { c.imageSmoothingEnabled = true; c.drawImage(MM.rev, msx(0), msy(0), MM.W * sc, MM.H * sc); }
    if (L) {
      if (L.chestObjs) for (const o of L.chestObjs) if (!o.opened && mInView(o.x, o.z, 2) && seen(o.x, o.z)) mIcon(MM.spr.chest, o.x, o.z, 1);
      if (L.cpObjs) for (const o of L.cpObjs) if (mInView(o.x, o.z, 2) && (o.active || seen(o.x, o.z))) mIcon(o.active ? MM.spr.cpOn : MM.spr.cp, o.x, o.z, o.active ? 1 + 0.08 * Math.sin(t * 4) : 1);
      if (L.npcObj && mInView(L.npcObj.x, L.npcObj.z, 2) && seen(L.npcObj.x, L.npcObj.z)) mIcon(MM.spr.npc, L.npcObj.x, L.npcObj.z, 1);
    }
    // loot items (rarity coloured stars)
    if (g.loot) for (const o of g.loot) {
      if (o.kind !== 'item' || !o.item || !mInView(o.x, o.z, 0)) continue;
      c.fillStyle = RAR[o.item.rarity || 0]; c.strokeStyle = '#1a0a30'; c.lineWidth = 1.2 * d;
      starPath(c, msx(o.x), msy(o.z), 4.6 * d, 2 * d); c.fill(); c.stroke();
    }
    // enemies: red dots (elites bigger with a gold ring)
    if (g.enemies && g.enemies.length) {
      c.fillStyle = '#ff3b55'; c.strokeStyle = 'rgba(40,0,10,0.9)'; c.lineWidth = 1.3 * d;
      c.beginPath();
      for (const e of g.enemies) {
        if (e.boss || !e.m || !e.m.root || !e.m.root.visible || e.dead || !mInView(e.x, e.z, 0)) continue;
        const r = (e.elite ? 4.4 : 3) * d, x = msx(e.x), y = msy(e.z);
        c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
      }
      c.fill(); c.stroke();
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1.6 * d; c.beginPath();
      for (const e of g.enemies) if (e.elite && !e.boss && e.m && e.m.root && e.m.root.visible && mInView(e.x, e.z, 0)) { const x = msx(e.x), y = msy(e.z); c.moveTo(x + 6 * d, y); c.arc(x, y, 6 * d, 0, TAU); }
      c.stroke();
    }
    // goal: portal / boss / crystal — on the map when near; when far, a big pulsing arrow inside the rim plus the goal icon
    let goal = null, gspr = null;
    if (L && L.portalObj && L.portalObj.active !== false) { goal = L.portalObj; gspr = MM.spr.portal; }
    else if (g.boss && !g.boss.dead) { goal = g.boss; gspr = MM.spr.boss; }
    else if (L && L.crystalSpot && g.P.pet && g.state === 'play') { goal = L.crystalSpot; gspr = MM.spr.crystal; }
    if (goal) {
      const dx = goal.x - px, dz = goal.z - pz, dd = Math.hypot(dx, dz), lim = MAP_VIEW - 2.2;
      if (dd < lim) mIcon(gspr, goal.x, goal.z, 1 + 0.1 * Math.sin(t * 5));
      else {
        const a = Math.atan2(dz, dx), rr = cx - 17 * d, x = cx + Math.cos(a) * rr, y = cx + Math.sin(a) * rr, k = 1 + 0.14 * Math.sin(t * 6);
        c.save(); c.translate(x, y); c.rotate(a); c.scale(k, k);
        c.beginPath(); c.moveTo(12 * d, 0); c.lineTo(-10 * d, -11 * d); c.lineTo(-4 * d, 0); c.lineTo(-10 * d, 11 * d); c.closePath();
        c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2.2 * d; c.strokeStyle = '#4a2200'; c.lineJoin = 'round'; c.stroke();
        c.restore();
        const ws = Math.max(26, gspr.css * 0.95) * d, ir = rr - 26 * d;
        c.drawImage(gspr, cx + Math.cos(a) * ir - ws / 2, cx + Math.sin(a) * ir - ws / 2, ws, ws);
      }
    }
    // player arrow
    const fx = Math.sin(P.face), fz = Math.cos(P.face);
    c.save(); c.translate(cx, cx);
    c.fillStyle = '#8ce6ff'; c.globalAlpha = 0.25 + 0.12 * Math.sin(t * 4); c.beginPath(); c.arc(0, 0, 11 * d, 0, TAU); c.fill(); c.globalAlpha = 1;
    c.rotate(Math.atan2(fz, fx));
    c.beginPath(); c.moveTo(9 * d, 0); c.lineTo(-6 * d, -6.5 * d); c.lineTo(-3 * d, 0); c.lineTo(-6 * d, 6.5 * d); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = 2 * d; c.strokeStyle = '#1a3a6a'; c.lineJoin = 'round'; c.stroke();
    c.restore();
    c.restore();
    c.drawImage(MM.front, 0, 0);
  }
  function starPath(c, x, y, R, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath();
  }

  // ───────────────────────── HUD refresh ─────────────────────────
  function hudTick(dt) {
    const g = M.GAME; if (!g || !S.hud || S.menu) return;   // menus dim the HUD: don't redraw under the blur
    const P = g.P;
    ORB.target = clamp(P.hp / Math.max(1, P.maxHp), 0, 1);
    orbDraw(dt);
    const low = ORB.target < 0.3 && !P.dead;
    if (low !== last.low) { last.low = low; D.orb.classList.toggle('low', low); }
    const xf = clamp(P.xp / Math.max(1, P.xpNext), 0, 1);
    if (P.lvl !== last.lvl) {
      if (last.lvl > 0 && P.lvl > last.lvl) {   // level up: bar empties instantly, then refills (never slides backwards)
        D.xpFill.style.transition = 'none'; D.xpFill.style.transform = 'scaleX(0)'; void D.xpFill.offsetWidth; D.xpFill.style.transition = '';
        last.xp = 0;
      }
      last.lvl = P.lvl; D.lvl.firstChild.textContent = P.lvl;
    }
    if (Math.abs(xf - last.xp) > 0.002) { last.xp = xf; D.xpFill.style.transform = `scaleX(${xf.toFixed(4)})`; }
    // gold counts up smoothly
    if (P.gold < goldShown) goldShown = P.gold;
    goldShown = P.gold - goldShown < 1 ? P.gold : damp(goldShown, P.gold, 9, dt);
    const gi = Math.floor(goldShown);
    if (gi !== last.gold) { last.gold = gi; D.goldB.textContent = D.goldI.textContent = gi; }
    if (P.potions !== last.pot) { last.pot = P.potions; D.potN.textContent = P.potions; }
    const empty = P.potions <= 0;
    if (empty !== last.empty) { last.empty = empty; D.pot.classList.toggle('empty', empty); }
    const hint = low && !empty;
    if (hint !== last.hint) { last.hint = hint; D.pot.classList.toggle('hint', hint); }
    // skills
    const list = g.skills || [];
    for (let i = 0; i < D.sk.length; i++) {
      const s = list[i], v = D.sk[i];
      if (!s || !s.unlocked) { if (v.shown) { v.shown = false; v.b.classList.add('u-hide'); } continue; }
      if (!v.shown) showSkill(i, false);
      const p = s.cd > 0 ? clamp(s.cd / Math.max(0.01, s.cdMax || 1), 0, 1) : 0;
      if (Math.abs(p - v.p) > 0.004 || (p === 0 && v.p !== 0)) {
        if (p === 0 && v.p > 0) { bump(v.b, 1.14, true); }
        v.p = p; v.cd.style.setProperty('--p', p.toFixed(3)); v.b.classList.toggle('cool', p > 0);
      }
      const n = s.cd > 0.05 && (s.cdMax || 0) >= 3 ? Math.ceil(s.cd) : 0;
      if (n !== v.n) { v.n = n; v.cdn.textContent = n ? n : ''; }
    }
    if (S.frame % 3 === 0) bladeTick(P);
    if (S.frame % 2 === 0) mapDraw();
    if (S.hintT >= 0) hintTick(dt, P);
    // boss bar trail
    if (S.boss) {
      S.bossTrail = S.bossTrail < S.bossFrac ? S.bossFrac : damp(S.bossTrail, S.bossFrac, 2.2, dt);
      D.bossTrail.style.transform = `scaleX(${S.bossTrail.toFixed(4)})`;
    }
  }
  // Attack button lightsaber: glows in the equipped saber's colour (the rainbow saber cycles), retracts while Feza
  // sleeps and re-ignites (blade grows out of the hilt) when he wakes up or picks a different saber.
  function bladeTick(P) {
    const w = P.equip && P.equip.weapon, I = M.ITEMS;
    let col = null;
    if (w && I && typeof I.bladeColor === 'function') col = safe('ITEMS.bladeColor', () => I.bladeColor(w));
    if (typeof col !== 'string' || !col) col = BLADE_DEF;
    if (col !== last.blade) { last.blade = col; D.atk.style.setProperty('--blade', col); }
    const uid = w ? (w.uid != null ? w.uid : w) : null, off = !!P.dead;
    if (off !== last.bladeOff) { last.bladeOff = off; D.atk.classList.toggle('off', off); if (!off && last.bladeUid !== undefined) igniteIcon(); }
    if (uid !== last.bladeUid) { const first = last.bladeUid === undefined; last.bladeUid = uid; if (!first && !off) igniteIcon(); }
  }
  function igniteIcon() {
    const b = D.atkBlade;
    if (b && b.animate) safe('igniteIcon', () => b.animate([{ transform: 'scaleY(0.02)' }, { transform: 'scaleY(1.06)', offset: 0.75 }, { transform: 'scaleY(1)' }],
      { duration: 320, easing: 'cubic-bezier(.25,.9,.35,1)' }));
  }
  function showSkill(i, announce) {
    const g = M.GAME, s = g && g.skills && g.skills[i], v = D.sk[i];
    if (!s || !v) return;
    const def = s.def || {};
    v.ico.textContent = def.icon || '✨';
    v.b.style.setProperty('--c', def.color || '#ffd23f');
    v.b.style.setProperty('--cd', shade(def.color || '#ffd23f', -0.45));
    v.b.classList.remove('u-hide');
    v.shown = true; v.p = -1; v.n = -1;
    if (announce) { v.b.classList.remove('pop'); void v.b.offsetWidth; v.b.classList.add('pop', 'new'); }
  }
  function refreshAllSkills() {
    const g = M.GAME;
    D.sk.forEach((v, i) => {
      const s = g && g.skills && g.skills[i];
      v.b.classList.remove('new', 'pop');
      if (s && s.unlocked) showSkill(i, false); else { v.shown = false; v.b.classList.add('u-hide'); }
    });
  }

  // ── First-run hint: a finger taps the ground on the main route ~4.5 m ahead of Feza, until he has really walked ──
  const _hv = new THREE.Vector3(), _hs = { x: 0, y: 0, vis: false }, _hf = { x: 0, y: 0, vis: false }, _hp = { x: 0, z: 0 };
  function pathAhead(path, x, z, ahead, out) {   // point `ahead` metres further along the polyline than its closest point to (x,z)
    let best = 1e18, bi = 0, bt = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-6;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), d = dist2(a.x + dx * t, a.z + dz * t, x, z);
      if (d < best) { best = d; bi = i; bt = t; }
    }
    let rem = ahead;
    for (let i = bi, t = bt; i < path.length - 1; i++, t = 0) {
      const a = path[i], b = path[i + 1], seg = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6, left = seg * (1 - t);
      if (rem <= left) { const u = t + rem / seg; out.x = a.x + (b.x - a.x) * u; out.z = a.z + (b.z - a.z) * u; return out; }
      rem -= left;
    }
    const e = path[path.length - 1]; out.x = e.x; out.z = e.z; return out;
  }
  // Is a screen point clear of the HUD (corners + controls, with a margin)?
  const HR = { rects: [], frame: -99 };
  function hintFree(x, y) {
    const W = innerWidth, H = innerHeight, m = 110;
    if (x < 60 || x > W - 60 || y < 60 || y > H - 60) return false;
    if (S.frame - HR.frame > 30) {   // HUD rects, refreshed twice a second
      HR.frame = S.frame; HR.rects.length = 0;
      for (const e of [D.tl, D.tr, D.bl, D.atk].concat(D.sk.filter(v => v.shown).map(v => v.b))) HR.rects.push(e.getBoundingClientRect());
    }
    for (const r of HR.rects) if (r.width && x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m) return false;
    return true;
  }
  function hintTick(dt, P) {
    const g = M.GAME;
    S.hintT += dt;
    // done once Feza has walked ~3 m (a real drag / tap-to-walk), or after 45 s
    if (S.hintT >= 45 || dist2(P.pos.x, P.pos.z, S.hintX, S.hintZ) > 9) { stopHint(); return; }
    const show = S.hintT > 1.2 && !S.menu && !P.dead && S.primary === null && !!(g && g.state === 'play');
    if (show !== S.hintOn) { S.hintOn = show; D.hint.classList.toggle('on', show); }
    if (!show) return;
    const L = g.L;
    if (L && L.path && L.path.length > 1) pathAhead(L.path, P.pos.x, P.pos.z, 4.5, _hp);
    else { _hp.x = P.pos.x + 0.9; _hp.z = P.pos.z - 3.4; }
    toScreen(_hv.set(_hp.x, 0, _hp.z), _hs);
    if (!hintFree(_hs.x, _hs.y)) {   // slide it back toward Feza until it's clear of the HUD
      toScreen(_hv.set(P.pos.x, 0, P.pos.z), _hf);
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (hintFree(_hf.x + (_hs.x - _hf.x) * mid, _hf.y + (_hs.y - _hf.y) * mid)) lo = mid; else hi = mid; }
      const k = Math.max(lo, 0.45);
      _hs.x = _hf.x + (_hs.x - _hf.x) * k; _hs.y = _hf.y + (_hs.y - _hf.y) * k;
    }
    D.hint.style.transform = `translate(${_hs.x.toFixed(1)}px, ${_hs.y.toFixed(1)}px)`;
  }
  function startHint() {
    const g = M.GAME; if (S.hintDone || !g || !g.P) return;
    S.hintT = 0; S.hintX = g.P.pos.x; S.hintZ = g.P.pos.z;
  }
  function stopHint() {
    if (S.hintT < 0) return;
    S.hintT = -1; S.hintDone = true; S.hintOn = false; D.hint.classList.remove('on');
  }

  // ── Portrait ──
  function refreshPortrait() {
    const g = M.GAME, F = M.FEZA;
    let url = null;
    if (F && F.portrait && g && g.H) url = safe('FEZA.portrait', () => F.portrait(g.H));
    if (url === S.portraitUrl) return;
    S.portraitUrl = url || null;
    const html = url ? `<img src="${url}" alt="">` : '<span class="u-femo">🧒</span>';
    D.faceIn.innerHTML = html; D.bagFace.innerHTML = html;
  }
  const portraitSoon = (delay = 0.25) => { S.portraitDirty = true; S.portraitAt = S.t + delay; };

  // ── Friendly dragon portrait (boss bar, minimap goal, dragon subtitles, victory chip) ──
  // Rendered once from the real boss model (EMODEL.build('ejderha') with its happy face) into a small offscreen render target
  // and cached as a dataURL (transparent; the pastel disc behind it is CSS .u-dimg). The offscreen scene copies the main
  // scene's light counts and fog type, so the boss's shader programs are reused (no compile hitch). Until it exists — or
  // without WebGL / EMODEL — the SVG dragon head (SVG.dragon) stands in. Never the 🐲/🐉 emoji: they look fierce.
  const DRG = { url: null, cv: null, tried: false, img: null };
  const DRG_ST = { move: 0, windup: -1, attack: -1, hurt: 0, frozen: false, dying: -1, breath: -1, stomp: -1, roar: -1, fireball: -1 };
  // Framing (model metres: head centre ≈ (0, 3.56, 0.74), horns up to y 4.6): almost frontal, a little from above; the wings
  // are folded away (wings: false) so only the head, horns and hearts fill the badge. Light levels. Tests may tweak via UI._DC.
  const DRG_CAM = { cx: 0, cy: 3.78, cz: 1.1, rad: 1.5, dx: 0.16, dy: 0.3, fov: 24, hemi: 1.0, key: 2.4, rim: 3.5, wings: false };
  function dragonHTML() { return DRG.url ? `<img class="u-dimg" src="${DRG.url}" alt="">` : SVG.dragon; }
  function dragonPortrait() {
    if (DRG.tried) return DRG.url;
    DRG.tried = true;
    const E = M.EMODEL;
    if (!E || typeof E.build !== 'function' || typeof renderer === 'undefined' || !renderer || !renderer.readRenderTargetPixels) return null;
    const N = 256, sc = new THREE.Scene(), lights = [];
    const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    let m = null, rt = null;
    try {
      m = E.build('ejderha', {});
      if (!m || !m.root) throw new Error('no dragon model');
      if (m.setMood) m.setMood('happy');
      if (m.s) { m.s.t = 0; m.s.ph = 0; m.s.flap = 0; }   // calm idle pose, head straight
      if (m.anim) m.anim(0, DRG_ST);
      if (!DRG_CAM.wings && m.B) for (const w of [m.B.wingL, m.B.wingR]) if (w && w.scale) w.scale.setScalar(1e-4);   // head portrait: fold the wings away
      m.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      sc.add(m.root); m.root.updateMatrixWorld(true);
      // camera: a close-up of the head (horns, cheeks, smile), see DRG_CAM
      const F = DRG_CAM, cam = new THREE.PerspectiveCamera(F.fov, 1, 0.1, 60);
      const c = new THREE.Vector3(F.cx, F.cy, F.cz), rad = F.rad, dir = new THREE.Vector3(F.dx, F.dy, 1).normalize();
      const dist = rad / Math.sin(cam.fov * Math.PI / 360);
      cam.position.copy(c).addScaledVector(dir, dist); cam.near = dist * 0.3; cam.far = dist * 3; cam.updateProjectionMatrix();
      cam.lookAt(c); cam.updateMatrixWorld();
      const rel = (x, y, z, k) => new THREE.Vector3(x, y, z).applyQuaternion(cam.quaternion).multiplyScalar(k).add(c);
      // lights: the main scene's counts (spare slots at intensity 0); warm key from the upper left, pink rim from behind
      let np = 0, nd = 0, nds = 0, nh = 0, ns = 0;
      scene.traverseVisible(o => { if (!o.isLight) return; if (o.isPointLight) np++; else if (o.isDirectionalLight) { nd++; if (o.castShadow) nds++; } else if (o.isHemisphereLight) nh++; else if (o.isSpotLight) ns++; });
      const add = l => { sc.add(l); lights.push(l); return l; };
      const hemi = add(new THREE.HemisphereLight(0xf6eeff, 0x8a6a80, F.hemi)); hemi.visible = nh > 0;
      for (let i = 0; i < Math.max(1, nd); i++) {
        const k = add(new THREE.DirectionalLight(0xfff2e4, i === 0 ? F.key : 0));
        k.position.copy(rel(-1.4, 2.6, 1.2, 2)); k.target.position.copy(c); sc.add(k.target); k.target.updateMatrixWorld();
        if (i < nds) { k.castShadow = true; k.shadow.mapSize.set(256, 256); const s = k.shadow.camera; s.left = s.bottom = -3; s.right = s.top = 3; s.near = 0.1; s.far = 20; s.updateProjectionMatrix(); }
      }
      for (let i = 0; i < Math.max(1, np); i++) { const l = add(new THREE.PointLight(0xffb8ee, i === 0 ? F.rim : 0, 12, 1.5)); l.position.copy(rel(1.3, 0.9, -1.5, rad * 2.2)); }
      for (let i = 0; i < ns; i++) add(new THREE.SpotLight(0xffffff, 0));
      sc.fog = scene.fog ? (scene.fog.isFogExp2 ? new THREE.FogExp2(0, 0) : new THREE.Fog(0, 1e4, 2e4)) : null;
      sc.environment = scene.environment || null;
      rt = new THREE.WebGLRenderTarget(N, N, { samples: 4, colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
      renderer.render(sc, cam);
      const buf = new Uint8Array(N * N * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA);
      // flip + un-premultiply into a canvas, then add a soft drop shadow
      const raw = cnv(N), rc = raw.getContext('2d'), img = rc.createImageData(N, N), o = img.data;
      let cover = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = ((N - 1 - y) * N + x) * 4, d = (y * N + x) * 4, a = buf[s + 3], k = a > 0 && a < 255 ? 255 / a : 1;
        o[d] = Math.min(255, buf[s] * k); o[d + 1] = Math.min(255, buf[s + 1] * k); o[d + 2] = Math.min(255, buf[s + 2] * k); o[d + 3] = a;
        cover += a;
      }
      if (cover < N * N * 255 * 0.08) throw new Error('empty dragon portrait');   // nothing drawn (lost context…): keep the SVG
      rc.putImageData(img, 0, 0);
      const out = cnv(N), g = out.getContext('2d');
      g.shadowColor = 'rgba(60,10,90,0.4)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      g.drawImage(raw, 0, 0);
      DRG.cv = out; DRG.url = out.toDataURL('image/png');
    } catch (e) { warn('dragonPortrait', e); DRG.url = null; DRG.cv = null; }
    finally {
      try { renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); } catch (e) { /* ignore */ }
      if (m) { try { sc.remove(m.root); if (m.dispose) m.dispose(); } catch (e) { /* ignore */ } }
      for (const l of lights) { try { if (l.dispose) l.dispose(); } catch (e) { /* ignore */ } }
      if (rt) rt.dispose();
    }
    if (DRG.url) dragonApply();
    return DRG.url;
  }
  function dragonApply() {   // swap the SVG stand-in for the portrait wherever the dragon is on screen
    if (D.bossIco) D.bossIco.innerHTML = dragonHTML();
    if (MM.spr.boss) MM.spr.boss = dragonSprite();
    if (D.subIco && D.subIco.classList.contains('drg')) D.subIco.innerHTML = dragonHTML();
  }
  // Minimap goal icon: the portrait (or the SVG stand-in once it has loaded) on a pastel disc with a pink halo.
  function dragonSprite() {
    let src = DRG.cv;
    if (!src) {
      if (!DRG.img && typeof Image !== 'undefined') {
        const im = DRG.img = new Image();
        im.onload = () => { if (!DRG.cv && MM.spr.boss) MM.spr.boss = dragonSprite(); };
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG.dragon);
      }
      if (DRG.img && DRG.img.complete && DRG.img.naturalWidth) src = DRG.img;
    }
    return sprite(30, (x, s) => {
      const c = s / 2, r = s * 0.4;
      let g = x.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, 'rgba(255,90,140,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      g = x.createRadialGradient(c, c - r * 0.25, 0, c, c, r);
      g.addColorStop(0, '#fff6fc'); g.addColorStop(0.55, '#ffc9ec'); g.addColorStop(1, '#f59ad6');
      x.save(); x.beginPath(); x.arc(c, c, r, 0, TAU); x.fillStyle = g; x.fill(); x.clip();
      x.imageSmoothingQuality = 'high';
      if (src) x.drawImage(src, c - r, c - r, 2 * r, 2 * r);
      x.restore();
      x.lineWidth = 1.6; x.strokeStyle = '#ffd23f'; x.beginPath(); x.arc(c, c, r, 0, TAU); x.stroke();
    });
  }

  // ───────────────────────── Banners, toasts, cards, subtitles ─────────────────────────
  const BQ = [];
  let bTimer = 0, bBusy = false;
  function banner(o) {
    for (let i = BQ.length - 1; i >= 0; i--) if (BQ[i].kind === o.kind && (o.kind === 'level' || o.kind === 'zone')) BQ.splice(i, 1);   // newest wins
    if (BQ.length > 4) BQ.shift();
    BQ.push(o);
    if (!bBusy) nextBanner();
  }
  function nextBanner() {
    const o = BQ.shift();
    if (!o) { bBusy = false; return; }
    bBusy = true;
    const b = D.banner;
    b.className = 'u-banner ' + (o.kind || '');
    let h = '';
    if (o.rays) h += '<div class="u-rays"></div>';
    if (o.kind === 'zone') {
      if (o.small) h += `<div class="u-zsm">✦ ${esc(o.small)} ✦</div>`;
      h += `<div class="u-zrib"><div class="u-btitle">${ol(o.title, 'u-gold-t')}</div></div>`;
    } else {
      if (o.icon) h += `<div class="u-bico${o.med ? ' med' : ''}"${o.color ? ` style="--c:${o.color};--cd:${shade(o.color, -0.5)}"` : ''}>${o.icon}</div>`;
      if (o.title) h += `<div class="u-btitle">${ol(o.title, 'u-gold-t')}</div>`;
      if (o.sub) h += `<div class="u-bsub">${ol(o.sub)}</div>`;
    }
    b.innerHTML = h;
    void b.offsetWidth;
    b.classList.add('on');
    clearTimeout(bTimer);
    const dur = (o.dur || 2.4) * (BQ.length ? 0.7 : 1);
    if (S.hold) return;
    bTimer = setTimeout(() => {
      b.classList.remove('on'); b.classList.add('out');
      bTimer = setTimeout(() => { b.classList.remove('out'); nextBanner(); }, 430);
    }, dur * 1000);
  }
  function clearBanners() { BQ.length = 0; clearTimeout(bTimer); bBusy = false; D.banner.className = 'u-banner'; }

  let tTimer = 0;
  function toast(text, info) {
    const t = D.toast;
    t.textContent = text; t.classList.toggle('info', !!info);
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
    clearTimeout(tTimer); if (!S.hold) tTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }

  const CQ = [];
  let cTimer = 0, cBusy = false;
  function itemCard(item, equipped) {
    if (!item) return;
    if (CQ.length > 2) CQ.shift();
    CQ.push({ item, equipped });
    if (!cBusy) nextCard();
  }
  function itemThumb(item) {
    const I = M.ITEMS;
    const url = I && I.thumb ? safe('ITEMS.thumb', () => I.thumb(item)) : null;
    if (url) return `<img src="${url}" alt="">`;
    const base = typeof item.base === 'object' && item.base ? item.base.id : item.base;
    return `<span class="u-temo">${BASE_EMO[base] || SLOT_EMO[item.slot] || '🎁'}</span>`;
  }
  function stars(item) {
    const I = M.ITEMS;
    let n = I && I.stars ? safe('ITEMS.stars', () => I.stars(item)) : 0;
    if (!n) n = clamp(1 + (item.rarity || 0) + ((item.power || 0) > 20 ? 1 : 0), 1, 5);
    n = clamp(n | 0, 1, 5);
    return '★'.repeat(n) + `<span class="e">${'★'.repeat(5 - n)}</span>`;
  }
  const rarCol = r => { const I = M.ITEMS; return (I && I.RARITY && I.RARITY[r] && I.RARITY[r].color) || RAR[r] || '#fff'; };
  const rarAd = r => { const I = M.ITEMS; return (I && I.RARITY && I.RARITY[r] && I.RARITY[r].ad) || RAR_AD[r] || ''; };
  function nextCard() {
    const o = CQ.shift();
    if (!o) { cBusy = false; return; }
    cBusy = true;
    const it = o.item, r = clamp(it.rarity || 0, 0, 3), col = rarCol(r), c = D.card;
    c.style.setProperty('--rc', col); c.style.setProperty('--rl', shade(col, 0.55)); c.style.setProperty('--rd', shade(col, -0.55));
    c.classList.toggle('leg', r >= 3);
    const name = it.ad || (typeof it.base === 'string' ? it.base : 'Hazine');
    const slotWord = it.slot === 'weapon' ? 'IŞIN KILICI' : it.slot === 'hat' ? 'ŞAPKA' : 'PELERİN';
    c.innerHTML = `<div class="u-cthumb">${itemThumb(it)}</div><div class="u-ctext">
      <div class="u-cnew">YENİ ${slotWord} · ${esc(rarAd(r).toLocaleUpperCase('tr'))}</div>
      <div class="u-cname${name.length > 17 ? ' long' : ''}">${ol(name)}</div>
      <div class="u-stars">${stars(it)}</div>
      <div class="u-cstat${o.equipped ? ' eq' : ''}">${o.equipped ? '✔ Giydin!' : '🎒 Çantada'}</div></div>`;
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
    clearTimeout(cTimer);
    if (S.hold) return;
    cTimer = setTimeout(() => { c.classList.remove('on'); cTimer = setTimeout(nextCard, 480); }, (CQ.length ? 2.0 : 3.2) * 1000);
  }
  function clearCards() { CQ.length = 0; clearTimeout(cTimer); cBusy = false; D.card.classList.remove('on'); }

  let subHide = 0;
  function lineKey(text) {   // AUD calls onSubtitle before it sets AUD.current, so look the key up by text
    const A = M.AUD, L = A && A.LINES;
    if (L) for (const k in L) if (L[k] === text) return k;
    return A && A.current;
  }
  function subtitle(text) {
    clearTimeout(subHide);
    if (text) {
      const key = lineKey(text), drg = !!key && key.indexOf('ejder') === 0;   // dragon lines: the friendly dragon's portrait
      if (drg) { dragonPortrait(); D.subIco.innerHTML = dragonHTML(); }
      else D.subIco.textContent = key === 'baykus' ? '🦉' : key === 'ilk_salyangoz' ? '🐌' : key === 'ilk_kostebek' ? '⛏️' : '✨';
      D.subIco.classList.toggle('drg', drg);
      D.subTxt.textContent = text;
      D.sub.classList.add('on');
    } else subHide = setTimeout(() => D.sub.classList.remove('on'), 380);   // queued lines follow ~0.3 s later: no flicker
  }

  // ───────────────────────── Fade ─────────────────────────
  let fadeTok = 0;
  function fade(to, dur = 0.5, cls = '') {
    const f = D.fade, tok = ++fadeTok;
    if (cls !== null) f.className = cls;
    f.style.pointerEvents = to > 0.5 ? 'auto' : 'none';
    f.style.transition = `opacity ${dur}s ease`;
    void f.offsetWidth;   // commit the start value so the transition runs
    if (tok === fadeTok) f.style.opacity = to;
    return new Promise(res => setTimeout(res, dur * 1000 + 40));
  }
  function fadeSnap(to, cls) {
    const f = D.fade; fadeTok++;
    if (cls !== undefined) f.className = cls;
    f.style.transition = 'none'; f.style.opacity = to; void f.offsetWidth;
  }
  const frames = n => new Promise(res => { const f = () => (n-- <= 0 ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });

  // Generate a zone's lazy textures while the screen is black (avoids a hitch when the level first renders)
  function ensureTex(i) { const T = M.TEX; if (T && T.ensure && typeof i === 'number' && i >= 0) safe('TEX.ensure', () => T.ensure(i | 0)); }
  function savedZone() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && typeof s.zone === 'number' ? s.zone : -1; } catch (e) { return -1; } }

  // ───────────────────────── Screens / modes ─────────────────────────
  function showScreen(s, on) {
    if (on) { s.classList.remove('closing'); s.classList.add('on'); S.guardUntil = performance.now() + 320; }
    else if (s.classList.contains('on')) {
      s.classList.remove('on'); s.classList.add('closing');
      setTimeout(() => s.classList.remove('closing'), 300);
    }
  }
  function setHud(on) {
    S.hud = on; D.root.classList.toggle('hud-on', on);
    if (on) { last.xp = last.lvl = last.gold = last.pot = -1; last.potEv = M.GAME ? M.GAME.P.potions : 99; ORB.acc = 1; }
  }
  function setMode(m) {
    S.mode = m;
    if (m !== 'play') releasePrimary();
    setHud(m === 'play');
    showScreen(D.title, m === 'title');
  }
  function setPaused(on) {
    S.paused = on;
    D.root.classList.toggle('menu-on', on);   // subtitles slide under the menu dim
    if (M.GAME) M.GAME.paused = on;
    if (on) { releasePrimary(); S.atkHeld = false; }
    // gentle music dip while paused (needs AUD.dim; otherwise music just keeps playing)
    const A = M.AUD;
    if (A && typeof A.dim === 'function') safe('AUD.dim', () => A.dim(on));
    S.needRender = true;
  }
  // Menus only open during real play (not in the victory window, portal transition or title)
  function openPause() {
    if (!canMenu()) return;
    S.menu = 'pause'; D.pausePanel.classList.remove('asking');
    setPaused(true); showScreen(D.pause, true);
  }
  function openBag() {
    if (!canMenu()) return;
    S.menu = 'bag'; renderBag(); D.bagBtn.classList.remove('has-new');
    setPaused(true); showScreen(D.bagS, true);
  }
  function closeMenu() {
    if (!S.menu) return;
    if (S.menu === 'bag') newItems.clear();
    else closeAsk();
    showScreen(S.menu === 'bag' ? D.bagS : D.pause, false);
    S.menu = null; setPaused(false);
  }
  // With a save only "Devam Et" is offered: a non-reader can't wipe his progress from the title.
  // A fresh start lives in Pause › Baştan Başla (press-and-hold gate).
  function showTitle() {
    const g = M.GAME;
    const has = !!(g && g.hasSave && safe('hasSave', () => g.hasSave()));
    D.contBtn.classList.toggle('u-hide', !has); D.playBtn.classList.toggle('u-hide', has);
    D.playBtn.classList.add('main'); D.contBtn.classList.add('main');
    S.titleIdle = 0; S.titleSaid = 0; S.titleSave = has;
    setMode('title');
    aud('music', 'title');
  }
  // Spoken title prompt for a child who can't read: after a quiet moment, then every 25 s while idle (at most 3 times).
  function titleVoiceTick(dt) {
    if (S.mode !== 'title' || S.busy || S.titleSaid >= 3) return;
    const A = M.AUD; if (!A) return;
    if (!SILENT && !(A.ready && A.ready())) return;   // before the first touch iOS can't play it yet
    S.titleIdle += dt;
    if (S.titleIdle < (S.titleSaid ? 25 : 1.5) || (A.speaking && A.speaking())) return;
    const key = S.titleSave ? (A.LINES && A.LINES.devam ? 'devam' : null) : 'basla';   // 'devam' only once it is recorded
    S.titleIdle = 0; S.titleSaid = key ? S.titleSaid + 1 : 3;
    if (key) aud('say', key, { prio: 1 });
  }
  async function startGame(cont) {
    const g = M.GAME;
    if (S.busy || S.mode !== 'title' || !g) return;
    S.busy = true;
    clearBanners(); clearCards(); S.cine = null;
    const A = M.AUD;
    if (A && (A.current === 'basla' || A.current === 'devam')) aud('stopVoice');   // the title prompt must not delay the intro
    try {
      if (cont) {
        showScreen(D.title, false);
        await fade(1, 0.45, 'load');
        ensureTex(savedZone());
        safe('continueGame', () => g.continueGame());
        setMode('play'); refreshAllSkills(); portraitSoon(0);
        renderNow(); await frames(2);
        fade(0, 0.6, null);
      } else {
        newGameWithIntro(g);
        setMode('play'); refreshAllSkills(); portraitSoon(0);
        startHint();   // first-run "tap the ground" finger
      }
    } finally { S.busy = false; }
  }
  // GAME.newGame() says giris1/giris2 itself; only say them here if it didn't (keeps the lines from doubling).
  function newGameWithIntro(g, o) {
    const A = M.AUD;
    let said = false;
    const orig = A && A.say;
    if (orig) A.say = function (k) { if (k === 'giris1' || k === 'tekrar') said = true; return orig.apply(this, arguments); };
    S.cheered = 0;
    try { safe('newGame', () => g.newGame(o)); } finally { if (orig) A.say = orig; }
    if (!said && A && (!o || !o.plus)) { aud('say', 'giris1', { prio: 3 }); aud('say', 'giris2', { prio: 3 }); }
  }
  async function restartAll() {
    const g = M.GAME;
    if (!g || S.busy) return;
    S.busy = true;
    showScreen(D.pause, false); S.menu = null;   // the question stays up while the menu fades (openPause resets it)
    // safety net: keep the old progress under a backup key (a parent can copy it back in the browser console)
    try { const old = localStorage.getItem(SAVE_KEY); if (old) localStorage.setItem(SAVE_BACKUP, old); } catch (e) { /* private mode */ }
    try {
      await fade(1, 0.45, 'load');
      setPaused(false);
      clearBanners(); clearCards(); hideBoss(); S.cine = null;
      aud('stopVoice');
      newGameWithIntro(g, { plus: false });
      setMode('play'); refreshAllSkills(); portraitSoon(0);
      renderNow(); await frames(2);
      fade(0, 0.6, null);
    } finally { S.busy = false; }
  }
  function showVictory() {
    const g = M.GAME, P = g ? g.P : null;
    if (S.menu) closeMenu();   // never over an open bag/pause (it would also leave GAME.paused set for the next run)
    setMode('end');
    const chips = [];
    if (P) {
      chips.push(`<span class="u-chip">⭐ Seviye ${P.lvl}</span>`, `<span class="u-chip"><span class="u-coin"></span> ${P.gold}</span>`);
      if (S.cheered) chips.push(`<span class="u-chip">😊 ${S.cheered} huysuz neşelendi</span>`);
      if (P.pet) { dragonPortrait(); chips.push(`<span class="u-chip">${dragonHTML()} Yeni arkadaş</span>`); }
    }
    D.winChips.innerHTML = chips.join('');
    confetti();
    showScreen(D.win, true);
  }
  function confetti() {
    const cols = ['#ff5fa2', '#ffd23f', '#5ad1ff', '#7be23a', '#b06bff', '#ff8a1c', '#ffffff'];
    let h = '';
    for (let i = 0; i < 70; i++) {
      const dur = frand(3.2, 6.5), del = -frand(0, dur);
      h += `<i class="${i % 4 === 0 ? 'c' : ''}" style="left:${frand(0, 100).toFixed(1)}%;background:${fpick(cols)};animation-duration:${dur.toFixed(2)}s;animation-delay:${del.toFixed(2)}s;--dx:${frand(-80, 80).toFixed(0)}px;--rot:${frand(360, 1080).toFixed(0)}deg"></i>`;
    }
    D.conf.innerHTML = h;
  }
  async function playAgain() {
    const g = M.GAME;
    if (!g || S.busy) return;
    S.busy = true;
    try {
      if (S.menu) closeMenu();
      showScreen(D.win, false);
      await fade(1, 0.5, 'load');
      D.conf.innerHTML = '';
      clearBanners(); clearCards(); hideBoss(); S.cine = null;
      aud('stopVoice');   // lines from the old run must not play into the new one
      newGameWithIntro(g);   // state 'end' → GAME makes it a new game+
      setMode('play'); refreshAllSkills(); portraitSoon(0);
      renderNow(); await frames(2);
      fade(0, 0.7, null);
    } finally { S.busy = false; }
  }

  // ── Bag / wardrobe ──
  function renderBag() {
    const g = M.GAME; if (!g) return;
    const P = g.P;
    const chips = [`<span class="u-chip">❤️ ${Math.round(P.maxHp)}</span>`, `<span class="u-chip">⚔️ ${Math.round(P.dmg)}</span>`];
    if (P.armor > 0) chips.push(`<span class="u-chip">🛡️ %${Math.round(P.armor)}</span>`);
    D.bagChips.innerHTML = chips.join('');
    for (const sl of SLOTS) {
      const box = D.slots[sl], cur = P.equip[sl];
      box.hdName.innerHTML = cur ? `· ${esc(cur.ad || '')}` : '';
      box.tiles.innerHTML = '';
      const items = (P.bag || []).filter(it => it && it.slot === sl).sort((a, b) => (b.power || 0) - (a.power || 0) || (b.rarity || 0) - (a.rarity || 0));
      if (sl !== 'weapon') {
        const t = el('button', 'u-tile none' + (!cur ? ' on' : ''), box.tiles, `<span class="u-temo">🙂</span><span class="u-stars" style="color:#fff;text-shadow:none">Yok</span><span class="u-chk">✓</span>`);
        onTap(t, () => { if (P.equip[sl] && g.unequip) { safe('unequip', () => g.unequip(sl)); afterEquip(); } });
      }
      for (const it of items) {
        const r = clamp(it.rarity || 0, 0, 3), col = rarCol(r);
        const t = el('button', 'u-tile' + (it === cur ? ' on' : '') + (newItems.has(it) ? ' fresh' : ''), box.tiles,
          `${itemThumb(it)}<span class="u-stars">${stars(it)}</span><span class="u-chk">✓</span><span class="u-new">YENİ</span>`);
        t.style.setProperty('--rc', col); t.style.setProperty('--rl', shade(col, 0.5)); t.style.setProperty('--rd', shade(col, -0.6));
        onTap(t, () => {
          if (P.equip[sl] === it) { wiggle(t); return; }
          safe('equip', () => g.equip(it)); afterEquip(); sfx('star', { vol: 0.5, pitch: 1.2 });
        });
      }
    }
  }
  function afterEquip() {
    const keep = SLOTS.map(sl => D.slots[sl].tiles.scrollLeft);
    renderBag();
    SLOTS.forEach((sl, i) => { D.slots[sl].tiles.scrollLeft = keep[i]; });
    portraitSoon(0);
    if (D.bagFace.animate) D.bagFace.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08) rotate(-3deg)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,1.6,.4,1)' });
  }

  // ───────────────────────── Boss bar ─────────────────────────
  function showBoss(d) {
    if (!DRG.tried) dragonPortrait();   // normally done at the castle's zone load (behind the loading fade)
    S.boss = true; S.bossFrac = S.bossTrail = d && d.maxHp ? clamp(d.hp / d.maxHp, 0, 1) : 1;
    D.bossName.innerHTML = ol((d && d.name) || 'Huysuz Ejderha');
    D.bossFill.style.transform = `scaleX(${S.bossFrac})`; D.bossTrail.style.transform = `scaleX(${S.bossFrac})`;
    D.boss.classList.add('on');
  }
  function hideBoss() { S.boss = false; D.boss.classList.remove('on'); }

  // ───────────────────────── GAME events ─────────────────────────
  function wireEvents() {
    const g = M.GAME;
    if (!g || !g.on) return;
    const on = (e, f) => g.on(e, d => { try { f(d || {}); } catch (err) { console.error('[UI] event ' + e, err); } });
    on('zone', d => {
      mapReset(g.L);
      refreshAllSkills();
      portraitSoon(0.1);
      hideBoss(); S.cine = null;
      const Z = M.ZONES && M.ZONES[d.index];
      if ((Z && Z.boss) || (g.L && g.L.boss)) dragonPortrait();   // once per session, while the loading fade still covers the screen
      if (d.title || ICON) return;
      if (S.mode === 'title') setMode('play');
      const ng = g.P && g.P.ng ? ` · Macera ${g.P.ng + 1}` : '';
      banner({ kind: 'zone', title: d.name || (Z && Z.ad) || 'Yeni Yer', small: `${(d.index | 0) + 1}. Bölge${ng}`, dur: 3.2 });
    });
    on('portal', async () => {
      while (S.busy) await new Promise(r => setTimeout(r, 100));   // never drop it: GAME waits in 'transition' for us
      S.busy = true;
      try {
        await fade(1, 0.8, 'load');
        clearBanners(); clearCards(); hideBoss(); S.cine = null;
        ensureTex((g.P.zone | 0) + 1);
        safe('loadZone', () => g.loadZone((g.P.zone | 0) + 1));
        renderNow(); await frames(2);
        fade(0, 0.7, null);
      } finally { S.busy = false; }
    });
    on('levelup', d => {
      banner({ kind: 'level', icon: '⭐', title: `Seviye ${d.lvl}!`, sub: 'Daha da güçlendin!', rays: true, dur: 2.2 });
      bump(D.lvl, 1.35); portraitSoon(0.2);
    });
    on('skill', d => {
      const s = g.skills && g.skills[d.index], def = (s && s.def) || {};
      showSkill(d.index, true);
      banner({ kind: 'skill', icon: def.icon || '✨', med: true, color: def.color, title: 'Yeni Yetenek!', sub: def.ad || '', rays: true, dur: 2.8 });
    });
    on('item', d => {
      itemCard(d.item, d.equipped);
      if (d.equipped) portraitSoon(0.2);
      else if (d.item) { newItems.add(d.item); D.bagBtn.classList.add('has-new'); }
      if (S.menu === 'bag') renderBag();
    });
    on('equip', () => { portraitSoon(0.15); });
    on('gold', () => {
      if (S.t - S.lastGoldBump > 0.12) { S.lastGoldBump = S.t; bump(D.gold.firstChild, 1.3); }
    });
    on('hurt', () => orbHurt());
    on('potion', d => {
      if (d.count < last.potEv) ORB.heal = 1;   // drank (a pickup raises the count)
      last.potEv = d.count; bump(D.potN, 1.4);
    });
    on('dead', () => {
      fade(0.72, 1.4, 'sleep');
    });
    on('respawn', () => {
      fadeSnap(0.92, 'flash');
      fade(0, 0.9, null);
    });
    on('boss', d => { if (d.on) showBoss(d); else hideBoss(); });
    on('bossHp', d => {
      S.bossFrac = clamp(d.frac, 0, 1);
      D.bossFill.style.transform = `scaleX(${S.bossFrac.toFixed(4)})`;
      if (D.boss.animate) D.boss.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 200 });
    });
    on('victory', () => { hideBoss(); if (S.menu) closeMenu(); setTimeout(() => { if (g.state === 'end' && S.mode === 'play') showVictory(); }, 2600); });
    on('happy', d => {
      S.cheered++;
      if (d.boss) S.cine = { t: 0, bx: d.x, bz: d.z };   // camera story beat: dragon cheers up → pet → crystal rises
    });
    on('toast', d => toast(d.text || ''));
    on('checkpoint', () => toast('✨ Neşe taşı parladı!', true));
  }

  // ───────────────────────── Camera ─────────────────────────
  const CAMV = { zoom: 1, pitch: 0.96, yaw: 0, ty: 0.8, ox: 0, oz: 0 };   // ox/oz: look-at offset from Feza (boss fight, story beats)
  // Title: a slightly raised view over the plaza (the owl and a house frame Feza). A low angle sees the whole forest (≈2× the
  // triangles of a play frame), so the title also uses a short far plane. Tests may tweak via UI._TC.
  const TITLE_CAM = { zoom: 0.42, pitch: 0.4, yaw: null, swing: 0.22, ty: 1.15, far: 50 };   // yaw null = auto (titleYaw)
  // Look past Feza toward the houses (north) with the owl on one side: turn the view half-way toward the owl.
  const TY = { L: null, yaw: 0 };
  function titleYaw() {
    const g = M.GAME, L = g && g.L, P = g && g.P;
    if (TITLE_CAM.yaw !== null && TITLE_CAM.yaw !== undefined) return TITLE_CAM.yaw;
    if (!L || !P) return 0;
    if (TY.L !== L) {
      TY.L = L; TY.yaw = 0;
      const n = L.npcObj || L.npc;
      if (n) { const a = Math.atan2(n.x - P.pos.x, P.pos.z - n.z); TY.yaw = clamp(-a * 0.5, -0.8, 0.8); }   // a: owl's angle from north
    }
    return TY.yaw;
  }
  const CAM_FAR = camera.far;
  // Dragon silhouette sample points in its own frame (x right, y up, z toward its face), metres, from the model's bounds.
  // Horns, head, wing tops, wing tips, front feet, tail.
  const BOSS_PTS = [-0.6, 4.8, 0, 0.6, 4.8, 0, 0, 4.6, 0.8, -2.6, 3.6, -2.1, 2.6, 3.6, -2.1, -3.5, 2.6, -1.8, 3.5, 2.6, -1.8,
    0, 0, 2.3, -2.0, 0, 1.2, 2.0, 0, 1.2, 0, 0.5, -3.8];
  const FIT_F = [0.42, 0.48, 0.54, 0.6, 0.66, 0.36, 0.3];   // look-at fractions toward the focus, in order of preference
  const FIT = { pts: new Float32Array(72), n: 0, ox: 0, oz: 0, zoom: 1 };
  const CAMK = { k: 1 };   // cameraFollow's distance factor for this aspect (portrait pulls back), read off the real camera
  const _fc = new THREE.PerspectiveCamera(), _fv = new THREE.Vector3();
  function fitAdd(x, y, z) { const i = FIT.n++ * 3; FIT.pts[i] = x; FIT.pts[i + 1] = y; FIT.pts[i + 2] = z; }
  function fitBoss(b, sc) {   // add the dragon's sample points (scaled by its dying shrink `sc`)
    const cs = Math.cos(b.face || 0), sn = Math.sin(b.face || 0);
    for (let i = 0; i < BOSS_PTS.length; i += 3) {
      const lx = BOSS_PTS[i] * sc, ly = BOSS_PTS[i + 1] * sc, lz = BOSS_PTS[i + 2] * sc;
      fitAdd(b.x + lx * cs + lz * sn, ly, b.z - lx * sn + lz * cs);
    }
  }
  // Does every fit point project inside the safe screen box with the camera looking at (tx,ty,tz)?
  function fitsView(tx, ty, tz, zoom, pitch, yTop, yBot, xLim) {
    const d = CAM.dist * CAMK.k * zoom;   // same placement as cameraFollow (its aspect pull-back factor is measured, see CAMK)
    _fc.position.set(tx, ty + Math.sin(pitch) * d, tz + Math.cos(pitch) * d);
    _fc.lookAt(tx, ty, tz); _fc.updateMatrixWorld();
    for (let i = 0; i < FIT.n; i++) {
      _fv.set(FIT.pts[i * 3], FIT.pts[i * 3 + 1], FIT.pts[i * 3 + 2]).project(_fc);
      if (_fv.x < -xLim || _fv.x > xLim || _fv.y > yTop || _fv.y < yBot) return false;
    }
    return true;
  }
  // Aim part of the way from Feza to the focus and pick the smallest zoom (in [z0,z1]) that keeps Feza and all fit points
  // below the top HUD (boss bar) and above the bottom controls; the look-at fraction may slide (FIT_F) to use spare room.
  // If nothing fits even at z1, z1 with the preferred fraction is used. Result in FIT.ox/oz/zoom.
  function fitFrac(px, pz, fx, fz, ty, zoom, pitch, yTop, yBot, xLim) {
    for (let j = 0; j < FIT_F.length; j++) {
      const f = FIT_F[j];
      if (fitsView(px + (fx - px) * f, ty, pz + (fz - pz) * f, zoom, pitch, yTop, yBot, xLim)) return f;
    }
    return -1;
  }
  function fitSolve(px, pz, fx, fz, ty, pitch, z0, z1) {
    if (_fc.aspect !== camera.aspect || _fc.fov !== camera.fov) {
      _fc.fov = camera.fov; _fc.aspect = camera.aspect; _fc.near = camera.near; _fc.far = CAM_FAR; _fc.updateProjectionMatrix();
    }
    fitAdd(px, 0, pz); fitAdd(px, 1.7, pz);
    const H = innerHeight || 1, top = S.boss ? S.bossTop : 0.1 * H;
    const yTop = 1 - 2 * Math.min(top, 0.4 * H) / H, yBot = -0.78, xLim = 0.88;   // Feza's feet stay above the subtitle strip
    let lo = z0, hi = z1, f = fitFrac(px, pz, fx, fz, ty, z0, pitch, yTop, yBot, xLim);
    if (f >= 0) hi = z0;
    else {
      for (let i = 0; i < 7; i++) { const m = (lo + hi) / 2; if (fitFrac(px, pz, fx, fz, ty, m, pitch, yTop, yBot, xLim) >= 0) hi = m; else lo = m; }
      f = fitFrac(px, pz, fx, fz, ty, hi, pitch, yTop, yBot, xLim);
      if (f < 0) f = FIT_F[0];
    }
    FIT.ox = (fx - px) * f; FIT.oz = (fz - pz) * f; FIT.zoom = hi; FIT.n = 0;
  }
  function updateCamera(dt, snap) {
    const g = M.GAME, P = g && g.P;
    const px = P ? P.pos.x : 0, pz = P ? P.pos.z : 0;
    let zoom = 1, pitch = S.playPitch, yaw = 0, ty = 0.8, k = 2.4, ox = 0, oz = 0;
    const title = !ICON && (S.mode === 'title' || S.mode === 'boot');
    if (ICON) { zoom = 0.21; pitch = 0.16; yaw = 0.42; ty = 1.02; k = 50; }   // arms up: frame the raised, lit saber too
    else if (title) { zoom = TITLE_CAM.zoom * (camera.aspect < 0.9 ? 1.25 : 1); pitch = TITLE_CAM.pitch; yaw = titleYaw() + Math.sin(S.t * 0.11) * TITLE_CAM.swing; ty = TITLE_CAM.ty; k = 1.6; }
    else if (S.mode === 'end') { zoom = 0.62; pitch = 0.78; yaw = Math.sin(S.t * 0.16) * 0.35; ty = 1.0; k = 1.2; }
    else if (P && P.dead) { zoom = 0.82; }
    else if (S.boss && g.boss && !g.boss.dead) {   // keep the whole dragon on screen, not just Feza
      fitBoss(g.boss, 1);
      ty = 1.6; pitch = S.playPitch - 0.08;   // a little more frontal: the tall dragon needs less zoom-out
      // zoom cap keeps Feza ≥ ~70 px tall; only when he is far from the dragon (it walks closer) a bit more is allowed
      const bd = Math.hypot(g.boss.x - px, g.boss.z - pz);
      fitSolve(px, pz, g.boss.x, g.boss.z, ty, pitch, 1.05, 1.62 + clamp((bd - 10) * 0.05, 0, 0.16));
      zoom = FIT.zoom; ox = FIT.ox; oz = FIT.oz; k = 1.5;
    } else if (S.cine && P) {   // boss defeated: look at the cheering dragon / pet, then at the rising crystal
      const c = S.cine, L = g.L;
      pitch = 0.74; ty = 1.3;
      if (c.t < 4.6) {
        if (g.boss && c.t < 3.2) fitBoss(g.boss, Math.max(0.3, 1 - c.t / 3.2));
        else { fitAdd(c.bx, 0, c.bz); fitAdd(c.bx, 2.2, c.bz); }
        fitSolve(px, pz, c.bx, c.bz, ty, pitch, 1.15, 1.7);
      } else {
        const cs = (L && L.crystalSpot) || { x: c.bx, z: c.bz - 5 };
        pitch = 0.7; fitAdd(cs.x, 0, cs.z); fitAdd(cs.x, 3.4, cs.z); fitAdd(cs.x - 1.2, 1.5, cs.z); fitAdd(cs.x + 1.2, 1.5, cs.z);
        fitSolve(px, pz, cs.x, cs.z, ty, pitch, 1.15, 1.7);
      }
      zoom = FIT.zoom; ox = FIT.ox; oz = FIT.oz; k = 1.3;
    }
    if (snap) k = 1e3;
    CAMV.zoom = damp(CAMV.zoom, zoom, k, dt); CAMV.pitch = damp(CAMV.pitch, pitch, k, dt);
    CAMV.yaw = damp(CAMV.yaw, yaw, k, dt); CAMV.ty = damp(CAMV.ty, ty, k, dt);
    CAMV.ox = damp(CAMV.ox, ox, k, dt); CAMV.oz = damp(CAMV.oz, oz, k, dt);
    CAM.zoom = CAMV.zoom; CAM.pitch = CAMV.pitch; CAM.yaw = CAMV.yaw;
    const far = title ? TITLE_CAM.far : CAM_FAR;   // title: cull the distant forest chunks
    if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
    cameraFollow(px + CAMV.ox, CAMV.ty, pz + CAMV.oz, dt, snap);
    const sh = M.FX && M.FX.shakeOffset;
    if (!sh || sh.lengthSq() < 1e-8) {
      const t = CAM.target, cp = camera.position, base = CAM.dist * CAM.zoom;
      if (base > 0) CAMK.k = Math.hypot(cp.x - t.x, cp.y - t.y, cp.z - t.z) / base;
    }
  }
  // ?ikon: Feza close-up in a heroic outfit, cheer pose frozen at the top of the hop (arms + sword up), facing the camera.
  const IKON_ST = { move: 0, attack: -1, swingDir: 1, cast: -1, spin: false, hurt: 0, dead: false, cheer: true, idleT: 0 };
  let ikonT = 0, ikonDressed = false;
  const ikonPeak = hs => {   // clock time left until the next hop peak (|sin 7.5t| = 1)
    const k = Math.ceil((hs.t * 7.5 - Math.PI / 2) / Math.PI - 1e-6);   // tolerance: parked exactly on a peak stays there
    return Math.max(0, (Math.PI / 2 + k * Math.PI) / 7.5 - hs.t);
  };
  function ikonTick(dt) {
    const g = M.GAME, H = g && g.H; if (!H) return;
    g.P.face = CAMV.yaw - 0.28;
    H.root.position.copy(g.P.pos); H.root.rotation.y = g.P.face;
    const hs = H._S, clock = !!hs && typeof hs.t === 'number';
    if (!ikonDressed) {
      ikonDressed = true;
      const I = M.ITEMS;
      if (I && I.make && H.setEquip) safe('ikon.equip', () => H.setEquip({ weapon: I.make('weapon', 'gokkusagi', 3, 8), hat: null, cape: I.make('cape', 'kirmizi', 2, 8) }));
      if (typeof H.ignite === 'function' && !H.bladeOn) safe('ikon.ignite', () => H.ignite());   // lit lightsaber in the icon
      // The cheer face squeezes the eyes shut (^ ^); the icon keeps his big warm brown eyes open with the cheer grin + blush
      // (the hero's per-frame face hook, called after the pose is built).
      if (hs && !hs.fixed) hs.fixed = (P, face) => { face.happy = 0; };
      // The finished look from the very first frame (a screenshot may come early): let the rainbow blade grow out of the
      // hilt (0.3 s), put the clock on a hop peak, then update(0, st) settles every blend (cheer pose + face).
      safe('H.update', () => {
        for (let i = 0; i < 4; i++) H.update(0.1, IKON_ST);
        for (let i = 0; i < 6 && clock; i++) { const d = ikonPeak(hs); if (d < 1e-5) break; H.update(Math.min(d, 0.1), IKON_ST); }
        H.update(0, IKON_ST);
      });
      ikonT = 2;
      return;
    }
    ikonT += dt;
    let d = dt;
    if (ikonT > 1.5 && clock) d = ikonPeak(hs);   // stay parked on the hop peak
    safe('H.update', () => H.update(d, IKON_ST));
  }

  // ───────────────────────── Main loop ─────────────────────────
  function renderNow() { safe('renderNow', () => { updateCamera(0.016, true); camera.updateMatrixWorld(); renderFrame(); }); }
  function frame(ts) {
    requestAnimationFrame(frame);
    const raw = S.lastFrame ? (ts - S.lastFrame) / 1000 : 1 / 60;
    S.lastFrame = ts;
    step(clamp(raw, 0, 0.05), raw, true);
  }
  // One frame; every module call is isolated so a failing module never stops the loop (no per-frame closures).
  function step(dt, raw, render) {
    S.frame++; S.t += dt;
    // resolution watchdog only during play: the title/victory scenes must not lower the DPR before the game starts
    if (S.mode === 'play' && !S.paused) { try { perfTick(raw); } catch (e) { warn('perfTick', e); } }
    const g = M.GAME, P = g && g.P;
    if (!S.paused) {
      TIME.dt = dt; TIME.t += dt; TIME.u.value = TIME.t;
      if (g) {
        try { if (ICON) ikonTick(dt); else if (g.state === 'title') g.titleUpdate(dt); else g.update(dt); } catch (e) { warn('GAME.update', e); }
        const L = g.L;
        if (L && M.LEVEL && M.LEVEL.update) { try { M.LEVEL.update(dt, L, P.pos.x, P.pos.z); } catch (e) { warn('LEVEL.update', e); } }
      }
      if (M.FX && M.FX.update) { try { M.FX.update(dt); } catch (e) { warn('FX.update', e); } }
      try { updateCamera(dt); } catch (e) { warn('camera', e); }
      if (P) {
        try { lightsFollow(P.pos.x, P.pos.z); } catch (e) { warn('lightsFollow', e); }
        if (!SILENT && M.AUD && M.AUD.setListener) { try { M.AUD.setListener(P.pos.x, P.pos.z); } catch (e) { warn('AUD.setListener', e); } }
      }
      if (S.atkHeld && S.t >= S.atkNext) { attack(); S.atkNext = S.t + 0.27; }
      if (S.cine && (S.cine.t += dt) > 9.5) S.cine = null;
    }
    if (HOLDS.length || S.menu === 'pause') holdTick();
    if (CORNERS.length) cornerTick();
    if (S.mode === 'title') titleVoiceTick(dt);
    if (S.portraitDirty && S.t >= S.portraitAt) { S.portraitDirty = false; refreshPortrait(); }
    try { hudTick(dt); } catch (e) { warn('hud', e); }
    if (render && (!S.paused || S.needRender)) { S.needRender = false; try { renderFrame(); } catch (e) { warn('renderFrame', e); } }
  }

  // ───────────────────────── Boot ─────────────────────────
  function boot() {
    if (S.booted) return readyP;
    S.booted = true;
    resolve();
    S.playPitch = CAM.pitch;
    build();
    onResize();
    RESIZE_HOOKS.push(onResize);
    loadPrefs(); syncToggles();
    if (M.AUD) M.AUD.onSubtitle = subtitle;
    bindInput();
    // let the loading spinner paint before the heavy synchronous setup
    requestAnimationFrame(() => setTimeout(heavyInit, 0));
    // offline play: register sw.js on every http(s) build (it serves src/*.js network-first, so dev files are never stale)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
      if (document.readyState === 'complete') reg(); else addEventListener('load', reg);
    }
    return readyP;
  }
  function heavyInit() {
    const t0 = performance.now(), T = [];
    const lap = k => { if (DEBUG) T.push(k + ' ' + Math.round(performance.now() - t0)); };
    if (M.TEX && M.TEX.init) safe('TEX.init', () => M.TEX.init());
    lap('tex');
    if (M.FX && M.FX.init) safe('FX.init', () => M.FX.init());
    lap('fx');
    const g = M.GAME;
    if (g) {
      safe('GAME.init', () => g.init());
      lap('game');
      wireEvents();
      safe('loadZone(title)', () => g.loadZone(0, { title: true }));
      lap('zone');
    }
    portraitSoon(0);
    const ld = document.getElementById('loading');
    if (ld) { ld.style.transition = 'opacity 0.6s'; ld.style.opacity = '0'; setTimeout(() => ld.remove(), 700); }
    if (ICON) { S.mode = 'ikon'; if (g && g.P) g.P.face = 0; }
    else showTitle();
    renderNow();
    lap('first frame');
    S.ready = true;
    if (DEBUG) console.log('[UI] boot ms: ' + T.join(', '));
    requestAnimationFrame(frame);
    readyRes();
  }

  return {
    boot, ready: readyP, fade, banner, toast, itemCard, openBag, openPause, closeMenu, showVictory, showTitle, startGame,
    refreshPortrait, subtitle, setPref,
    get mode() { return S.mode; }, get menu() { return S.menu; }, get paused() { return S.paused; },
    _S: S, _D: D, _TC: TITLE_CAM, _DC: DRG_CAM,
    _dragon() { DRG.tried = false; DRG.url = DRG.cv = null; return dragonPortrait(); },   // tests: render the dragon portrait again
    _step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt, dt, i === n - 1); },   // tests: deterministic frames
  };
})();

function boot() { return UI.boot(); }
if (!window.UI_MANUAL) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
