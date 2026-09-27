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
  const SAVE_KEY = 'fezaKotulereKarsi.v3';   // same key as GAME's (only manual saves: Mola › Kaydet)

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
    M.EDEF = get(() => (typeof EDEF !== 'undefined' ? EDEF : null));
  }
  const zoneCount = () => (M.ZONES && M.ZONES.length) || 5;   // Round 4: orman, kefir, magara, yanardag, kale
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
    save: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M4.2 2.5h12.3l5 5v12.8a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 20.3V3.7a1.2 1.2 0 0 1 1.2-1.2z"/><rect x="7" y="4.2" width="8.6" height="5" rx="0.9" fill="#2266d0"/><rect x="6.4" y="12.6" width="11.2" height="7" rx="1.1" fill="#2266d0"/></svg>',
    check: '<svg class="u-svg" viewBox="0 0 24 24"><path d="M4.5 12.5l5 5 10-11" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
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
    // Friendly purple dragon head (stand-in until the portrait of the real boss model is rendered, see bossPortrait).
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
    // Stand-ins for the other bosses (same flat style, same use as SVG.dragon): Kral Jöle — a big jelly with a golden crown
    kraljole: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g stroke="#0c4a6a" stroke-width="2.6" stroke-linejoin="round">' +
      '<path d="M16 60C10 72 9 84 12 92H30Z" fill="#8a4ad8"/><path d="M84 60C90 72 91 84 88 92H70Z" fill="#8a4ad8"/>' +
      '<path d="M14 82C12 56 28 35 50 35C72 35 88 56 86 82C86 88 80 90 74 88C66 92 34 92 26 88C20 90 14 88 14 82Z" fill="#3fd0de"/>' +
      '<path d="M31 39L32 18L42 28L50 12L58 28L68 18L69 39Z" fill="#ffd23f"/><rect x="29" y="35" width="42" height="8.5" rx="3" fill="#ffb81c"/>' +
      '<circle cx="32" cy="17.5" r="2.6" fill="#fff3a0" stroke-width="1.8"/><circle cx="50" cy="11.5" r="2.8" fill="#fff3a0" stroke-width="1.8"/><circle cx="68" cy="17.5" r="2.6" fill="#fff3a0" stroke-width="1.8"/></g>' +
      '<circle cx="50" cy="39.2" r="2.9" fill="#ff5f9e"/><circle cx="38.5" cy="39.4" r="2.1" fill="#7be23a"/><circle cx="61.5" cy="39.4" r="2.1" fill="#7be23a"/>' +
      '<ellipse cx="50" cy="78" rx="25" ry="9" fill="#b8f6f0" opacity=".6"/>' +
      '<ellipse cx="28" cy="57" rx="4.6" ry="9" fill="#fff" opacity=".55" transform="rotate(22 28 57)"/><circle cx="32" cy="47" r="2.2" fill="#fff" opacity=".65"/>' +
      '<g stroke="#0c4a6a" stroke-width="2"><ellipse cx="39" cy="60" rx="7.6" ry="8.8" fill="#fff"/><ellipse cx="61" cy="60" rx="7.6" ry="8.8" fill="#fff"/></g>' +
      '<circle cx="40" cy="62" r="5" fill="#1a2a4a"/><circle cx="60" cy="62" r="5" fill="#1a2a4a"/>' +
      '<circle cx="38" cy="59.2" r="2.1" fill="#fff"/><circle cx="58" cy="59.2" r="2.1" fill="#fff"/>' +
      '<path d="M41 72Q50 83.5 59 72Q50 75 41 72Z" fill="#6a1a3a" stroke="#0c4a6a" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M45.6 77.2Q50 80.4 54.4 77.2Q50 75.6 45.6 77.2Z" fill="#ff7aa0"/>' +
      '<ellipse cx="27" cy="70" rx="5.6" ry="3.2" fill="#ff6fb0" opacity=".6"/><ellipse cx="73" cy="70" rx="5.6" ry="3.2" fill="#ff6fb0" opacity=".6"/></svg>',
    // Usta Köstebek — mole with a yellow hard hat and a headlamp
    kostebekusta: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g stroke="#4a2a18" stroke-width="2.6" stroke-linejoin="round">' +
      '<ellipse cx="50" cy="62" rx="31" ry="27" fill="#9a6b50"/><ellipse cx="50" cy="74" rx="17.5" ry="11.5" fill="#f0cfb2"/>' +
      '<path d="M43 24L50 4.5L57 24Z" fill="#d6deec"/>' +
      '<path d="M20 48C20 31 33 21 50 21C67 21 80 31 80 48Z" fill="#f5b82a"/>' +
      '<rect x="12" y="44" width="76" height="8.5" rx="4.2" fill="#d98a14"/></g>' +
      '<path d="M45.2 18.5L54.2 15.6M46.8 13.2L52.6 11.2" stroke="#8a96b0" stroke-width="1.8" stroke-linecap="round"/>' +
      '<circle cx="50" cy="35" r="10" fill="#fff6a0" opacity=".45"/>' +
      '<circle cx="50" cy="35" r="6.4" fill="#fff6c8" stroke="#4a2a18" stroke-width="2.2"/><circle cx="50" cy="35" r="2.9" fill="#fff"/>' +
      '<circle cx="31" cy="44.6" r="3" fill="#7fe0ff" stroke="#4a2a18" stroke-width="1.6"/><circle cx="69" cy="44.6" r="3" fill="#7fe0ff" stroke="#4a2a18" stroke-width="1.6"/>' +
      '<ellipse cx="34" cy="31" rx="6" ry="3.2" fill="#fff" opacity=".5" transform="rotate(-35 34 31)"/>' +
      '<path d="M32 71H21M32 75.5L22.5 78.5M68 71H79M68 75.5L77.5 78.5" stroke="#fbe8d4" stroke-width="1.8" stroke-linecap="round" opacity=".9"/>' +
      '<ellipse cx="39" cy="61" rx="4.4" ry="5.2" fill="#2a1a20"/><ellipse cx="61" cy="61" rx="4.4" ry="5.2" fill="#2a1a20"/>' +
      '<circle cx="37.6" cy="59.2" r="1.8" fill="#fff"/><circle cx="59.6" cy="59.2" r="1.8" fill="#fff"/>' +
      '<path d="M42 75Q50 85.5 58 75Q50 78 42 75Z" fill="#6a1a3a" stroke="#4a2a18" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="46.4" y="76" width="3.4" height="3.6" rx="1" fill="#fffaf0"/><rect x="50.2" y="76" width="3.4" height="3.6" rx="1" fill="#fffaf0"/>' +
      '<ellipse cx="50" cy="68.5" rx="7.6" ry="5.4" fill="#ff7a9c" stroke="#4a2a18" stroke-width="2"/><ellipse cx="47.8" cy="67" rx="2.4" ry="1.4" fill="#fff" opacity=".75"/>' +
      '<ellipse cx="28" cy="67" rx="5" ry="3" fill="#ff6f90" opacity=".5"/><ellipse cx="72" cy="67" rx="5" ry="3" fill="#ff6f90" opacity=".5"/></svg>',
    // Koca Lav Kaplumbağası — turtle whose shell is a little volcano (a cute steam puff on top)
    lavkaplumbaga: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g fill="#fff" stroke="#8a6a7a" stroke-width="1.6"><circle cx="57" cy="11" r="4.2"/><circle cx="62.5" cy="7.8" r="3"/><circle cx="52" cy="8.6" r="2.6"/></g>' +
      '<g stroke="#3a2c28" stroke-width="2.6" stroke-linejoin="round">' +
      '<path d="M10 55C10 37 28 27 50 27C72 27 90 37 90 55Z" fill="#ffae2e"/><path d="M38 33L44 13H56L62 33Z" fill="#7a6660"/>' +
      '<ellipse cx="50" cy="13.5" rx="7" ry="3" fill="#ffd04a"/><rect x="8" y="51" width="84" height="8" rx="4" fill="#4a3a34"/></g>' +
      '<path d="M46 14.5C45.5 19 48 21 47 26C49.5 24 51 19 51.5 14.5Z" fill="#ffc23a"/><path d="M53 14.5C53 17 55 18 54.5 21C56 19 56.5 16.5 56 14.5Z" fill="#ffe07a"/>' +
      '<g fill="#6a5852"><path d="M17 50L20 42L28 40L31 46L27 50Z"/><path d="M83 50L80 42L72 40L69 46L73 50Z"/><path d="M33 49L36 42H44L46 49Z"/><path d="M67 49L64 42H56L54 49Z"/>' +
      '<path d="M26 37L32 33H37L35 38L29 39Z"/><path d="M74 37L68 33H63L65 38L71 39Z"/></g>' +
      '<g stroke="#1f6a50" stroke-width="2.4" stroke-linejoin="round"><ellipse cx="19" cy="84" rx="8.5" ry="5.5" fill="#62d4a6"/><ellipse cx="81" cy="84" rx="8.5" ry="5.5" fill="#62d4a6"/>' +
      '<ellipse cx="50" cy="69" rx="25" ry="21" fill="#6fdcae"/></g>' +
      '<ellipse cx="50" cy="80" rx="15" ry="7" fill="#c4f5dc"/><circle cx="35" cy="57" r="2.6" fill="#3fae84"/><circle cx="65" cy="56.5" r="2" fill="#3fae84"/><circle cx="50" cy="52.5" r="1.8" fill="#3fae84"/>' +
      '<g stroke="#1f6a50" stroke-width="2"><ellipse cx="40" cy="65" rx="7" ry="8.2" fill="#fff"/><ellipse cx="60" cy="65" rx="7" ry="8.2" fill="#fff"/></g>' +
      '<circle cx="41" cy="67" r="4.7" fill="#3a2410"/><circle cx="59" cy="67" r="4.7" fill="#3a2410"/>' +
      '<circle cx="39.2" cy="64.3" r="2" fill="#fff"/><circle cx="57.2" cy="64.3" r="2" fill="#fff"/>' +
      '<path d="M41.5 77Q50 87 58.5 77Q50 80 41.5 77Z" fill="#7a2030" stroke="#1f6a50" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M46 81.6Q50 84.6 54 81.6Q50 80.2 46 81.6Z" fill="#ff7aa0"/>' +
      '<ellipse cx="29" cy="74" rx="5.4" ry="3.1" fill="#ff6fb0" opacity=".55"/><ellipse cx="71" cy="74" rx="5.4" ry="3.1" fill="#ff6fb0" opacity=".55"/></svg>',
    // Köpüklü Kefir Devi — a friendly glass kefir bottle: creamy kefir inside with fizzy bubbles, foam in the neck, its bottle
    // cap worn like a little crown (tilted), a label with a smiling face, tiny arms (one waving)
    kefirdev: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 100 100">' +
      '<g stroke="#2a4a7a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">' +
      '<path d="M19.5 60C11 57 5.5 50 6 41.5C11.5 41 16.5 46 22 53Z" fill="#a8d8f4"/><path d="M80.5 64C88 65 92 69 92.5 75.5C88 77 83.5 74.5 79.5 71Z" fill="#a8d8f4"/>' +
      '<path d="M41 13H59V22.5C59 28.5 81 31.5 83 43.5V97C83 101 80 103 76 103H24C20 103 17 101 17 97V43.5C19 31.5 41 28.5 41 22.5Z" fill="#bfe3ff"/></g>' +
      '<path d="M44.4 18.5H55.6V24C55.6 31 77.4 34 79.4 45V99H20.6V45C22.6 34 44.4 31 44.4 24Z" fill="#fffdf6"/>' +
      '<g fill="#fff" stroke="#a9d2f0" stroke-width="1.3"><circle cx="46.4" cy="19" r="3.2"/><circle cx="50.6" cy="17.2" r="3.7"/><circle cx="54.2" cy="19.3" r="2.8"/></g>' +
      '<path d="M22.5 44C27 35 40 32.5 41.8 25" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity=".95"/>' +
      '<g transform="rotate(-9 50 10)" stroke-linejoin="round">' +
      '<path d="M35 13L36.2 2.5L41.8 8L46 0.5L50 7L54 0.5L58.2 8L63.8 2.5L65 13Z" fill="#ffd23f" stroke="#7a4205" stroke-width="2.2"/>' +
      '<rect x="33.5" y="10.5" width="33" height="7.5" rx="3.4" fill="#ff6aa4" stroke="#8a2a56" stroke-width="2.2"/>' +
      '<g fill="#fff8ee" stroke="#7a4205" stroke-width="1"><circle cx="36.2" cy="2.5" r="1.7"/><circle cx="46" cy="0.5" r="1.7"/><circle cx="54" cy="0.5" r="1.7"/><circle cx="63.8" cy="2.5" r="1.7"/></g>' +
      '<path d="M50 16.6C46.6 14.4 46.6 11.6 48.3 11.6C49.2 11.6 50 12.4 50 13.1C50 12.4 50.8 11.6 51.7 11.6C53.4 11.6 53.4 14.4 50 16.6Z" fill="#fff"/></g>' +
      '<g fill="#fff" stroke="#9cc8ea" stroke-width="1.2"><circle cx="30" cy="41" r="2.3"/><circle cx="69" cy="40" r="1.9"/><circle cx="61" cy="36.5" r="1.3"/><circle cx="38" cy="36" r="1.2"/><circle cx="27" cy="95" r="1.6"/><circle cx="73" cy="95.5" r="1.4"/></g>' +
      '<rect x="22" y="46" width="56" height="44" rx="11" fill="#7cc8f6" stroke="#2a4a7a" stroke-width="2.3"/>' +
      '<ellipse cx="50" cy="69" rx="21.5" ry="19" fill="#fff8ec"/>' +
      '<g fill="#ff6aa0"><path d="M25.6 58.4C23.4 57 23.4 55.2 24.5 55.2C25.1 55.2 25.6 55.7 25.6 56.2C25.6 55.7 26.1 55.2 26.7 55.2C27.8 55.2 27.8 57 25.6 58.4Z"/>' +
      '<path d="M74.4 58.4C72.2 57 72.2 55.2 73.3 55.2C73.9 55.2 74.4 55.7 74.4 56.2C74.4 55.7 74.9 55.2 75.5 55.2C76.6 55.2 76.6 57 74.4 58.4Z"/></g>' +
      '<g fill="#fff"><circle cx="25.5" cy="83" r="1.2"/><circle cx="74.5" cy="83" r="1.2"/></g>' +
      '<g stroke="#2a4a7a" stroke-width="2.1"><ellipse cx="39.5" cy="65" rx="7.6" ry="8.8" fill="#fff"/><ellipse cx="60.5" cy="65" rx="7.6" ry="8.8" fill="#fff"/></g>' +
      '<circle cx="40.4" cy="67" r="5.1" fill="#1f2d4a"/><circle cx="59.6" cy="67" r="5.1" fill="#1f2d4a"/>' +
      '<circle cx="38.4" cy="64" r="2.1" fill="#fff"/><circle cx="57.6" cy="64" r="2.1" fill="#fff"/>' +
      '<path d="M42 76.5Q50 86 58 76.5Q50 79.5 42 76.5Z" fill="#6a1a3a" stroke="#2a4a7a" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M46 81Q50 83.8 54 81Q50 79.6 46 81Z" fill="#ff7aa0"/>' +
      '<ellipse cx="29" cy="75" rx="4.8" ry="2.9" fill="#ff6fa0" opacity=".6"/><ellipse cx="71" cy="75" rx="4.8" ry="2.9" fill="#ff6fa0" opacity=".6"/></svg>',
    // any other boss: a smiling golden star
    bstar: '<svg class="u-dimg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<path d="M50 12L60.5 37.5L88 39L67 56.5L74 84L50 69L26 84L33 56.5L12 39L39.5 37.5Z" fill="#ffd23f" stroke="#7a4205" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle cx="43" cy="51" r="3.6" fill="#3a1a10"/><circle cx="57" cy="51" r="3.6" fill="#3a1a10"/><circle cx="42" cy="49.6" r="1.3" fill="#fff"/><circle cx="56" cy="49.6" r="1.3" fill="#fff"/>' +
      '<path d="M44 59Q50 65 56 59" fill="none" stroke="#7a4205" stroke-width="2.6" stroke-linecap="round"/>' +
      '<ellipse cx="36.5" cy="58" rx="4" ry="2.4" fill="#ff8a6a" opacity=".6"/><ellipse cx="63.5" cy="58" rx="4" ry="2.4" fill="#ff8a6a" opacity=".6"/></svg>',
  };
  SLOT_EMO.weapon = SVG.saber;   // wardrobe row label + thumbnail fallback: a little lightsaber (there is no emoji for it)

  // ── State ──
  const S = {
    booted: false, ready: false, mode: 'boot', choiceFrom: 'title', menu: null, paused: false, busy: false, hud: false,
    t: 0, frame: 0, primary: null, primaryT: 0, atkHeld: false, atkNext: 0, needRender: true, portraitDirty: true, portraitAt: 0,
    boss: false, bossFrac: 1, bossTrail: 1, dpr: 1, playPitch: 0.96, guardUntil: 0, lastGoldBump: 0,
    prefs: { music: true, sound: true }, portraitUrl: null, lastFrame: 0, hold: false, hintT: -1, hintOn: false, cheered: 0,   // hold: tests keep messages on screen
    hintX: 0, hintZ: 0, askT: 0, cine: null, bossTop: 90, titleT: 0, titleIdle: 0, titleSaid: 0,
    subTop: -1, subBot: -1, logoBot: -1,   // layout top/bottom (px) of the subtitle box while a line shows, else -1 (the camera keeps it off Feza)
    hintGoal: null, hintD0: 0, pwatch: null,   // finger hint toward a goal (the awake portal) · watching whether Feza heads there
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
    // A longer Hardcore explanation needs reading time; either question still closes if a kid wanders away.
    if (S.menu === 'pause' && D.pausePanel.classList.contains('asking') && !HOLDS.length &&
      S.t - S.askT > (S.restartKind === 'normal' ? 6 : 15)) closeAsk();
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
    if (!(navigator.maxTouchPoints > 0)) root.classList.add('kbd');   // a computer: keyboard keys on the skill buttons from the start
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
    D.hardcoreTag = el('div', 'u-hardcore-tag u-hide', st, '⚔ Hardcore');

    // top-right: 🎒 and ⏸ in one row hugging the top edge, left of the minimap (music lives in the pause menu)
    const tr = D.tr = el('div', 'u-tr', hud);
    const sb = D.sbtns = el('div', 'u-sbtns', tr);
    D.bagBtn = el('button', 'u-rbtn', sb, '<span class="u-emo">🎒</span><span class="u-dot"></span>');
    D.pauseBtn = el('button', 'u-rbtn', sb, SVG.pause + '<span class="u-hold"></span>');   // 0.5 s hold
    const mini = D.mini = el('div', 'u-mini', tr);
    D.map = el('canvas', '', mini);

    // boss bar
    D.boss = el('div', 'u-boss', hud);
    D.bossName = el('div', 'u-bossname', D.boss, ol('Huysuz Ejderha'));
    const brow = el('div', 'u-bossrow', D.boss);
    D.bossIco = el('div', 'u-bossico', brow, bossHTML('ejderha'));   // the boss's friendly portrait (never a fierce 🐲 emoji); set in showBoss
    const bbar = el('div', 'u-bossbar', brow);
    D.bossTrail = el('div', 'u-bosstrail', bbar);
    D.bossFill = el('div', 'u-bossfill', bbar);
    D.bossFizz = el('div', 'u-bossfizz', D.bossFill, '<i></i>');   // Kefir Devi: fizzy bubbles rising in its bar (ui.css; hidden for the others)

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
    // count as a "×3" tag on the bottom rim; the keyboard key (Q) sits top-right like the skills' 1 2 3, so they never mix up
    D.pot = el('button', 'u-potion', bl, SVG.potion + '<span class="u-badge u-potn">×3</span><span class="u-key">Q</span>');
    D.potN = D.pot.querySelector('.u-potn');

    // bottom-right: attack + one button per skill on the arc around it
    const pad = D.pad = el('div', 'u-pad', hud);
    D.atk = el('button', 'u-atk', pad, SVG.sword);
    D.atkBlade = D.atk.querySelector('.u-blade');
    D.atk.style.setProperty('--x', 0); D.atk.style.setProperty('--y', 0);
    D.sk = [];
    const nSk = clamp((M.SKILLS && M.SKILLS.length) || 3, 1, ARC.length);
    for (let i = 0; i < nSk; i++) {
      const b = el('button', 'u-skill u-hide', pad, `<span class="u-ico"></span><span class="u-cd"></span><span class="u-cdn"></span><span class="u-key">${i + 1}</span>`);
      const [r, a] = ARC[i], rad = a * Math.PI / 180;
      b.style.setProperty('--x', (-Math.cos(rad) * r).toFixed(1)); b.style.setProperty('--y', (-Math.sin(rad) * r).toFixed(1));
      D.sk.push({ b, ico: b.firstChild, cd: b.children[1], cdn: b.children[2], shown: false, p: -1, n: -1 });
    }

    buildTitle(root); buildChoice(root); buildPause(root); buildBag(root); buildWin(root);
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
    const logo = D.logo = el('div', 'u-logo', t);
    const word = el('div', 'u-word', logo);
    for (const ch of 'FEZA') el('span', 'u-let', word, `<b>${ch}</b><i>${ch}</i>`);
    el('div', 'u-ribbon', logo, ol('Kötülere Karşı'));
    [[-8, 12, 0], [104, 6, 0.7], [96, 64, 1.4], [-4, 70, 1.9], [50, -8, 1.1]].forEach(([x, y, d]) => {
      const s = el('span', 'u-spark', logo, '✦'); s.style.left = x + '%'; s.style.top = y + '%'; s.style.animationDelay = d + 's';
    });
    const bt = D.tbtns = el('div', 'u-tbtns', t);
    D.playBtn = el('button', 'u-btn g', bt, SVG.play + '<span>Oyna</span>');   // always: a new game (a saved game is never touched)
    D.contBtn = el('button', 'u-btn b', bt, SVG.cont + '<span>Devam Et</span>');   // only with a save (Mola › Kaydet)
    const tg = el('div', 'u-ttog', t);
    D.tMus = el('button', 'u-rbtn', tg, SVG.note + '<span class="u-slash"></span>'); D.tMus.dataset.tog = 'music';   // sound effects: pause menu only
  }
  // All portraits share Feza's face; the silhouette and equipment make the choice readable without words.
  function heroArt(id) {
    const wizard = id === 'wizard', hybrid = id === 'hybrid';
    return `<svg class="u-heroart" viewBox="0 0 220 220" aria-hidden="true">
      <ellipse cx="110" cy="203" rx="68" ry="10" fill="#170d3d" opacity=".35"/>
      <path d="M82 123 Q52 154 63 196 L160 196 Q164 149 138 123" fill="${wizard ? '#7851cb' : hybrid ? '#207d84' : '#e14d60'}" stroke="#40225e" stroke-width="4"/>
      <path d="M88 136 L78 187 L143 187 L133 136" fill="${wizard ? '#344789' : hybrid ? '#316d88' : '#488bdd'}" stroke="#28265a" stroke-width="4"/>
      <path d="M90 187 L89 201 M132 187 L136 201" stroke="#332854" stroke-width="14" stroke-linecap="round"/>
      <path d="M84 142 L65 164 M136 143 L158 159" stroke="#ffd6aa" stroke-width="15" stroke-linecap="round"/>
      <circle cx="110" cy="94" r="40" fill="#ffd6aa" stroke="#8b543d" stroke-width="3"/>
      <path d="M70 94 Q62 53 101 51 Q148 43 150 91 L134 74 L113 81 L104 70 L82 85" fill="#8c542d"/>
      <ellipse cx="94" cy="99" rx="5" ry="7" fill="#332843"/><ellipse cx="124" cy="99" rx="5" ry="7" fill="#332843"/>
      <circle cx="92" cy="97" r="1.8" fill="white"/><circle cx="122" cy="97" r="1.8" fill="white"/>
      <path d="M100 115 Q110 125 121 114" fill="none" stroke="#a15b53" stroke-width="3" stroke-linecap="round"/>
      <circle cx="82" cy="111" r="6" fill="#f69c98" opacity=".65"/><circle cx="136" cy="111" r="6" fill="#f69c98" opacity=".65"/>
      ${wizard ? '<path d="M66 66 L103 13 L142 61 Z" fill="#7956be" stroke="#41245e" stroke-width="4"/><path d="M57 67 Q108 49 156 68" stroke="#bb95ff" stroke-width="12" stroke-linecap="round"/><path d="M108 31 L111 39 L120 40 L113 46 L115 54 L108 50 L101 54 L103 46 L97 40 L105 39Z" fill="#ffe895"/><path d="M156 164 L183 107" stroke="#714435" stroke-width="7" stroke-linecap="round"/><path d="M184 83 L190 99 L205 105 L190 111 L184 127 L178 111 L163 105 L178 99Z" fill="#ffe69a"/><circle cx="176" cy="72" r="4" fill="#b9f2ff"/><path d="M40 113l4 9 10 3-10 4-4 10-4-10-10-4 10-3Z" fill="#c9b3ff"/>' : '<path d="M156 161 L178 135" stroke="#515477" stroke-width="12" stroke-linecap="round"/><path d="M177 136 L208 87" stroke="#58dfff" stroke-width="15" stroke-linecap="round" opacity=".35"/><path d="M177 136 L208 87" stroke="#bdffff" stroke-width="7" stroke-linecap="round"/><path d="M168 130 L183 141" stroke="#d7daed" stroke-width="7" stroke-linecap="round"/><path d="M97 148h27l-3 22-10 8-11-8Z" fill="#ffce68" stroke="#9c6a3e" stroke-width="3"/>'}
      ${hybrid ? '<path d="M66 164 L37 104" stroke="#583928" stroke-width="10" stroke-linecap="round"/><path d="M43 116 L38 105" stroke="#ffd46f" stroke-width="12"/><path d="M35 80 L45 96 L36 111 L25 96Z" fill="#7cfff0" stroke="#fff2aa" stroke-width="3"/><circle cx="35" cy="96" r="23" fill="#70fff0" opacity=".15"/><path d="M85 68 Q110 57 137 69" fill="none" stroke="#ffd46f" stroke-width="7"/><path d="M109 57l7 9-7 9-7-9Z" fill="#b9fff5"/>' : ''}
    </svg>`;
  }
  function buildChoice(root) {
    const s = D.choice = el('div', 'u-screen u-dim u-choice', root);
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-labelledby', 'heroTitle');
    const p = el('div', 'u-panel', s);
    const title = el('div', 'u-ptitle', p, ol('Kahramanını Seç', 'u-gold-t')); title.id = 'heroTitle';
    el('div', 'u-choicehint', p, 'Bugün hangi Feza olacaksın?');
    const row = el('div', 'u-herorow', p);
    const names = ['Savaşçı Feza', 'Büyücü Feza', 'Büyülü Şövalye Feza'];
    const hints = ['Işın kılıcını kuşan, <br>cesurca yaklaş!', 'Değneğini salla, <br>uzaktan büyü yap!', 'Yakında kılıç, <br>uzakta büyü!'];
    D.heroes = ['warrior', 'wizard', 'hybrid'].map((id, i) => {
      const b = el('button', 'u-herocard ' + id, row, heroArt(id) +
        `<strong>${names[i]}</strong><span class="u-herodesc">${hints[i]}</span><span class="u-herogo">${SVG.play} Seç ve Oyna</span>`);
      b.dataset.heroClass = id;
      onPress(b, () => startGame(false, id), { menu: true });
      return b;
    });
    D.choiceBack = el('button', 'u-btn p u-choiceback', p, SVG.close + '<span>Geri</span>');
    onPress(D.choiceBack, () => closeChoice(), { menu: true });
  }
  function openChoice(from) {
    S.choiceFrom = from; S.atkHeld = false;
    if (S.clearKeys) S.clearKeys();
    aud('stopVoice'); setPaused(true); setMode('choose'); showScreen(D.choice, true);
    aud('say', 'kahraman_sec', { prio: 3 });
    D.heroes[0].focus({ preventScroll: true });
  }
  function closeChoice() {
    if (S.mode !== 'choose' || S.busy) return;
    aud('stopVoice');
    showScreen(D.choice, false);
    if (S.choiceFrom === 'pause') {
      setMode('play'); S.menu = 'pause'; D.pausePanel.classList.remove('asking'); showScreen(D.pause, true);
    } else { setPaused(false); showTitle(); D.playBtn.focus({ preventScroll: true }); }
  }
  function buildPause(root) {
    const s = D.pause = el('div', 'u-screen u-dim', root);
    const p = D.pausePanel = el('div', 'u-panel u-pause-panel', s);
    el('div', 'u-ptitle', p, ol('Mola', 'u-gold-t'));
    const m = el('div', 'u-main', p);
    const mode = D.modeCard = el('div', 'u-mode-card', m);
    D.modeName = el('div', 'u-mode-name', mode);
    D.modeSave = el('div', 'u-mode-save', mode);
    D.resume = el('button', 'u-btn g wide', m, SVG.play + '<span>Devam Et</span>');
    const row = el('div', 'u-prow', m);
    D.pSnd = el('button', 'u-btn p', row, SVG.sound + '<span class="u-lab">Efektler Açık</span>'); D.pSnd.dataset.tog = 'sound';   // sound effects only
    D.pMus = el('button', 'u-btn p', row, SVG.note + '<span class="u-lab">Müzik Açık</span>'); D.pMus.dataset.tog = 'music';
    D.saveBtn = el('button', 'u-btn b wide', m, SVG.save + '<span>Kaydet</span>');
    D.restart = el('button', 'u-btn o wide', m, SVG.again + '<span>Baştan Başla</span>');
    D.hardcore = el('button', 'u-btn r wide', m, '<span>Hardcore başlat</span>');
    D.hardcoreContinue = el('button', 'u-btn p wide u-hide', m, '<span>Hardcore kaydını aç</span>');
    // Restart question (parental gate): same height as the main panel; the big green "Hayır" lands exactly where
    // "Baştan Başla" was (a double tap is safe) and the small red "Evet" only fires after a 2 s press-and-hold.
    const ask = el('div', 'u-ask', p);
    D.askText = el('div', 'u-asktxt', ask, 'Yeniden en baştan<br>başlansın mı?');
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
      D.slots[sl] = { label: hd.firstChild, hdName: hd.querySelector('small'), tiles: el('div', 'u-tiles', box) };
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
    D.winBoss = el('div', 'u-wboss', p);   // every zone's boss, cheered up (portraits)
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
    onPress(D.saveBtn, () => saveNow(), { menu: true });
    onPress(D.restart, () => askRestart('normal'), { menu: true });
    onPress(D.hardcore, () => askRestart('hardcore'), { menu: true });
    onPress(D.hardcoreContinue, () => askRestart('hardcoreContinue'), { menu: true });
    onPress(D.no, () => closeAsk(), { menu: true });
    onHold(D.yes, 2, () => S.restartKind === 'normal' ? restartAll() : startHardcore(S.restartKind === 'hardcoreContinue'), { menu: true });
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
  function askRestart(kind) {
    S.restartKind = kind;
    const cp = M.GAME && M.GAME.hardcoreSaveInfo && M.GAME.hardcoreSaveInfo();
    D.askText.innerHTML = kind === 'normal' ? (M.GAME.hardcore
      ? 'Normal macera başlasın mı?<small>Karakter seçimine döneceksin.<br>Hardcore kaydın ayrı saklanır.</small>'
      : 'Yeniden en baştan<br>başlansın mı?') : kind === 'hardcoreContinue'
      ? `Hardcore kaydına dönülsün mü?<small>${cp ? cp.zone + 1 : '?'}. bölümün başında, kayıtlı karakterle devam edeceksin.</small>`
      : 'Yeni Hardcore macerası başlasın mı?<small>Onaylayınca Hardcore açılır; bu karakterle en baştan başlarsın.<br>Kayıt yalnızca 2. ve 4. bölüm başında.' +
        (cp ? '<br>Önceki Hardcore kaydı silinecek.' : '') + '</small>';
    D.pausePanel.classList.add('asking'); S.askT = S.t; S.guardUntil = performance.now() + 800;
  }
  async function startHardcore(cont) {
    const g = M.GAME;
    if (!g || S.busy) return;
    S.busy = true;
    try {
      const heroClass = g.P.heroClass;
      closeMenu(); clearBanners(); clearCards(); hideBoss(); S.cine = null; aud('stopVoice');
      await fade(1, 0.35, 'load');
      if (cont) g.continueHardcore();
      else newGameWithIntro(g, { heroClass, plus: false, hardcore: true });
      setMode('play'); refreshAllSkills(); portraitSoon(0);
      renderNow(); await frames(2); fade(0, 0.5, null);
    } finally { S.busy = false; }
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
    S.clearKeys = () => {
      K.left = K.right = K.up = K.down = false; kx = kz = 0;
      if (M.GAME) safe('input.key', () => M.GAME.input.key(0, 0));
    };
    addEventListener('keydown', e => {
      const c = e.code;
      if (!D.root.classList.contains('kbd')) D.root.classList.add('kbd');   // a keyboard is in use: show 1 2 3 on the skills, Q on the potion
      if (e.key === '.' || c === 'NumpadDecimal') { if (!e.repeat) toggleFps(); e.preventDefault(); return; }   // by character: '.' sits elsewhere on a Turkish keyboard
      if (S.mode === 'choose') {
        if (c === 'Escape') { e.preventDefault(); closeChoice(); }
        else if (c === 'ArrowLeft' || c === 'ArrowRight') {
          e.preventDefault(); const at = D.heroes.indexOf(document.activeElement), n = D.heroes.length;
          D.heroes[(Math.max(0, at) + (c === 'ArrowLeft' ? n - 1 : 1)) % n].focus();
        }
        else if (c === 'Tab') {
          const choices = [...D.heroes, D.choiceBack], at = choices.indexOf(document.activeElement);
          e.preventDefault(); choices[(at + (e.shiftKey ? choices.length - 1 : 1)) % choices.length].focus();
        } else if (!e.repeat && (c === 'Enter' || c === 'Space')) {
          e.preventDefault(); if (document.activeElement === D.choiceBack) closeChoice();
          else startGame(false, document.activeElement.dataset.heroClass || 'warrior');
        }
        return;
      }
      if (DIRS[c]) { K[DIRS[c]] = true; sendKeys(); e.preventDefault(); return; }
      if (e.repeat) { if (c === 'Space') e.preventDefault(); return; }
      if (c === 'Escape') { if (S.menu) closeMenu(); else if (S.mode === 'play') openPause(); return; }
      if (S.mode === 'title' && (c === 'Enter' || c === 'Space')) { e.preventDefault(); startGame(false); return; }
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
    measureBossBar(); subPlace();
    S.needRender = true;
  }
  // Lowest screen y the boss bar covers (layout box, ignores its drop-in transform): the boss camera keeps the dragon below it.
  function measureBossBar() { S.bossTop = D.boss.offsetTop + D.boss.offsetHeight + 10; }
  // Layout box of a HUD element in screen px (ignores transforms such as the HUD's slide-in; #ui is fixed at 0,0).
  function layBox(e, out) {
    let x = 0, y = 0, n = e;
    while (n && n !== D.root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    out.l = x; out.t = y; out.r = x + e.offsetWidth; out.b = y + e.offsetHeight;
    return out;
  }

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
  const MM = { L: null, W: 0, H: 0, S: 4, base: null, mask: null, rev: null, seen: null, lx: -1e9, lz: -1e9, dirty: false, px: 0, bg: null, front: null, spr: {}, theme: '' };
  // Minimap backdrop (the unexplored / non-walkable part) per zone theme. Kefir Vadisi: a blueberry-milk pool with little
  // milk bubbles (its floors — creamy yogurt, biscuit path, cheese plazas — read bright on it); elsewhere the night-blue dots.
  const MAP_BG = {
    _: { c0: '#2a3566', c1: '#0c1028', dot: 'rgba(160,190,255,0.10)', r: 0.006 },
    dairy: { c0: '#6a62c4', c1: '#231c5a', dot: 'rgba(255,246,228,0.2)', r: 0.011, ring: 'rgba(255,250,240,0.16)' },
  };
  function mapBg() {
    const px = MM.px, cx = px / 2, B = MAP_BG[MM.theme] || MAP_BG._;
    MM.bg = MM.bg && MM.bg.width === px ? MM.bg : cnv(px);
    const c = MM.bg.getContext('2d');
    const g = c.createRadialGradient(cx, cx * 0.8, px * 0.05, cx, cx, cx);
    g.addColorStop(0, B.c0); g.addColorStop(1, B.c1);
    c.clearRect(0, 0, px, px); c.fillStyle = g; c.fillRect(0, 0, px, px);
    c.fillStyle = B.dot;
    let n = 0;
    for (let y = px * 0.04; y < px; y += px * 0.07) for (let x = px * 0.04; x < px; x += px * 0.07) {
      n++;
      const r = px * B.r * (B.ring ? 0.6 + ((n * 7) % 5) * 0.2 : 1), ox = B.ring ? ((n * 13) % 7 - 3) * px * 0.006 : 0;   // milk bubbles: uneven sizes
      c.beginPath(); c.arc(x + ox, y, r, 0, TAU); c.fill();
    }
    if (B.ring) {   // a few bigger bubble rings with a tiny highlight
      c.lineWidth = Math.max(1, px * 0.006); c.strokeStyle = B.ring;
      for (let i = 0; i < 9; i++) {
        const x = px * (0.12 + ((i * 37) % 80) / 100), y = px * (0.1 + ((i * 53) % 82) / 100), r = px * (0.022 + (i % 3) * 0.008);
        c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
        c.fillStyle = B.ring; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); c.fill();
      }
    }
  }
  function mapResize() {
    const css = D.map.clientWidth || 166, px = Math.max(48, Math.round(css * S.dpr));
    if (px === MM.px) return;
    MM.px = px; D.map.width = D.map.height = px;
    const cx = px / 2;
    mapBg();
    MM.front = cnv(px); let c = MM.front.getContext('2d');
    let g = c.createRadialGradient(cx, cx, cx * 0.68, cx, cx, cx);
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
    // the sleeping portal (its boss is still grumpy): a dim, still ring — it lights up (P.portal + halo) once the boss is happy
    P.portalOff = sprite(24, (x, s) => {
      const c = s / 2;
      x.fillStyle = 'rgba(34,24,66,0.72)'; x.beginPath(); x.arc(c, c, s * 0.34, 0, TAU); x.fill();
      x.lineWidth = 2.2; x.strokeStyle = 'rgba(190,178,226,0.8)'; x.beginPath(); x.arc(c, c, s * 0.34, 0, TAU); x.stroke();
      x.lineWidth = 1.5; x.strokeStyle = 'rgba(190,178,226,0.45)'; x.beginPath(); x.arc(c, c, s * 0.18, 0.5, 4.9); x.stroke();
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
    for (const k in P) if (k.indexOf('b:') === 0) delete P[k];   // boss badges: rebuilt for the new size on first use (bossSpr)
    P.crystal = emojiSprite('💖', 26, 'rgba(255,150,220,0.9)');
  }
  function mapReset(L) {
    MM.L = L; MM.base = null; MM.lx = MM.lz = -1e9;
    const th = (L && L.Z && L.Z.theme) || '';
    if (th !== MM.theme) { MM.theme = th; if (MM.px) mapBg(); }
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
    const col = new THREE.Color(theme === 'cave' ? '#86a9c9' : theme === 'castle' ? '#c3b2e6' : theme === 'volcano' ? '#e0a47a' : theme === 'dairy' ? '#fff0d2' : '#94d470');
    const r = Math.round(Math.pow(col.r, 1 / 2.2) * 255), gg = Math.round(Math.pow(col.g, 1 / 2.2) * 255), b = Math.round(Math.pow(col.b, 1 / 2.2) * 255);
    for (let i = 0; i < L.W * L.H; i++) {
      if (!L.grid[i]) continue;
      const n = ((i * 2654435761) >>> 24) / 255 * 14 - 7;
      d[i * 4] = clamp(r + n, 0, 255); d[i * 4 + 1] = clamp(gg + n, 0, 255); d[i * 4 + 2] = clamp(b + n, 0, 255); d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    if (L.path && L.path.length > 1) {   // soft path line so the way forward reads on the map
      x.strokeStyle = theme === 'dairy' ? 'rgba(214,150,70,0.6)' : 'rgba(255,238,190,0.45)'; x.lineWidth = 2; x.lineCap = x.lineJoin = 'round';   // (dairy: the biscuit-crumb trail)
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
  const MV = { c: null, cx: 0, sc: 1, px: 0, pz: 0, d: 1, goal: null };
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
    // goal: boss → (once it is happy) the glowing portal, or the castle's crystal — on the map when near; when far, a big
    // pulsing arrow inside the rim plus the goal icon. The portal sleeps (dim, no arrow) while its boss is still grumpy.
    let goal = null, gspr = null;
    const po = L && L.portalObj, poOn = !!po && po.active !== false;
    if (po && !poOn && mInView(po.x, po.z, 2) && seen(po.x, po.z)) mIcon(MM.spr.portalOff, po.x, po.z, 1);
    if (poOn) { goal = po; gspr = MM.spr.portal; MV.goal = 'portal'; }
    else if (g.boss && !g.boss.dead) { goal = g.boss; gspr = bossSpr(g.boss.type); MV.goal = 'boss'; }
    else if (L && L.crystalSpot && g.boss && g.boss.dead && g.state === 'play') { goal = L.crystalSpot; gspr = MM.spr.crystal; MV.goal = 'crystal'; }
    else MV.goal = null;
    if (goal) {
      const dx = goal.x - px, dz = goal.z - pz, dd = Math.hypot(dx, dz), lim = MAP_VIEW - 2.2;
      if (dd < lim) {
        if (goal === po) {   // awake portal: a soft pulsing glow ring behind it
          const k = (t * 1.2) % 1, gx = msx(po.x), gy = msy(po.z);
          c.globalAlpha = 0.8 * (1 - k); c.lineWidth = 2.4 * d; c.strokeStyle = '#d8c2ff';
          c.beginPath(); c.arc(gx, gy, (9 + 12 * k) * d, 0, TAU); c.stroke(); c.globalAlpha = 1;
        }
        mIcon(gspr, goal.x, goal.z, 1 + 0.1 * Math.sin(t * 5));
      } else {
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
    const hpf = clamp(P.hp / Math.max(1, P.maxHp), 0, 1);
    if (hpf - ORB.target > 0.25 && !P.dead) ORB.heal = 1;   // a big heal (the Kefir Devi's kefir, a level-up): the orb glows warm as it fills
    ORB.target = hpf;
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
    if (P.potions !== last.pot) { last.pot = P.potions; D.potN.textContent = '×' + P.potions; }
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
    if (S.pwatch) portalWatchTick(dt, P);
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
    const wizard = P.heroClass === 'wizard', hybrid = P.heroClass === 'hybrid';
    if (last.heroClass !== P.heroClass) {
      last.heroClass = P.heroClass; D.atk.innerHTML = wizard ? '<span class="u-wandico">🪄</span>' : hybrid ? SVG.sword + '<span class="u-offhandico">🪄</span>' : SVG.sword;
      D.atkBlade = D.atk.querySelector('.u-blade');
      D.atk.setAttribute('aria-label', wizard ? 'Büyü at' : hybrid ? 'Yakında kılıçla vur, uzakta büyü at' : 'Kılıçla vur');
    }
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
    v.b.setAttribute('aria-label', def.ad || def.name || ('Yetenek ' + (i + 1)));
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
    const g = M.GAME, gl = S.hintGoal;
    S.hintT += dt;
    if (gl) {   // toward a goal (the awake portal): done once Feza is ~3 m closer or there, or after 30 s
      const d = Math.hypot(gl.x - P.pos.x, gl.z - P.pos.z);
      if (S.hintT >= 30 || d < 3 || d < S.hintD0 - 3) { stopHint(); return; }
    // first run: done once Feza has walked ~3 m (a real drag / tap-to-walk), or after 45 s
    } else if (S.hintT >= 45 || dist2(P.pos.x, P.pos.z, S.hintX, S.hintZ) > 9) { stopHint(); return; }
    const show = S.hintT > (gl ? 0.2 : 1.2) && !S.menu && !P.dead && S.primary === null && !!(g && g.state === 'play');
    if (show !== S.hintOn) { S.hintOn = show; D.hint.classList.toggle('on', show); }
    if (!show) return;
    const L = g.L;
    let onGoal = false;
    if (gl) {   // straight toward it (the portal stands at the open arena's edge); through a wall → along the route instead
      const dx = gl.x - P.pos.x, dz = gl.z - P.pos.z, d = Math.hypot(dx, dz) || 1, a = Math.min(4.5, Math.max(1.5, d - 1.2));
      _hp.x = P.pos.x + dx / d * a; _hp.z = P.pos.z + dz / d * a;
      const LV = M.LEVEL;
      onGoal = !L || !LV || !LV.los || !!safe('LEVEL.los', () => LV.los(L, P.pos.x, P.pos.z, _hp.x, _hp.z));
    }
    if (!onGoal) {
      if (L && L.path && L.path.length > 1) pathAhead(L.path, P.pos.x, P.pos.z, 4.5, _hp);
      else { _hp.x = P.pos.x + 0.9; _hp.z = P.pos.z - 3.4; }
    }
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
  // startHint(): the first-run finger (once per session); startHint({x, z}): the finger toward that goal (e.g. the portal)
  function startHint(goal) {
    const g = M.GAME; if (!g || !g.P) return;
    if (goal) {
      if (S.hintT >= 0 && !S.hintGoal) S.hintDone = true;   // (a first-run finger still up: this one takes its place)
      S.hintGoal = { x: goal.x, z: goal.z }; S.hintD0 = Math.hypot(goal.x - g.P.pos.x, goal.z - g.P.pos.z);
    } else { if (S.hintDone) return; S.hintGoal = null; }
    S.hintT = 0; S.hintX = g.P.pos.x; S.hintZ = g.P.pos.z;
  }
  function stopHint() {
    if (S.hintT < 0) return;
    if (!S.hintGoal) S.hintDone = true;
    S.hintT = -1; S.hintGoal = null; S.hintOn = false; D.hint.classList.remove('on');
  }
  // After a mid-boss story beat: if Feza has not headed for the awake portal within ~6 s, the finger shows the way.
  function armPortalWatch() {
    const g = M.GAME, po = g && g.L && g.L.portalObj;
    S.pwatch = po && po.active && g.P ? { t: 0, d0: Math.hypot(po.x - g.P.pos.x, po.z - g.P.pos.z) } : null;
  }
  function portalWatchTick(dt, P) {
    const w = S.pwatch, g = M.GAME, po = g && g.L && g.L.portalObj;
    if (!po || !po.active) { S.pwatch = null; return; }
    if (g.state !== 'play' || P.dead || S.cine) return;
    const d = Math.hypot(po.x - P.pos.x, po.z - P.pos.z);
    if (d < 4 || d < w.d0 - 2.5) { S.pwatch = null; return; }   // on his way
    if ((w.t += dt) >= 6) { S.pwatch = null; startHint(po); }
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

  // ── Friendly boss portraits (boss bar, minimap goal, boss subtitles, victory row) ──
  // Every boss type gets its happy face rendered once from its real model (EMODEL.build(type) + setMood('happy')) into a small
  // offscreen render target, cached as a dataURL (transparent; the pastel disc behind it is CSS .u-dimg.b-<type>). It is done
  // at the zone load of that boss's zone (behind the loading screen / fade). The offscreen scene copies the main scene's light
  // counts and fog type, so the boss's shader programs are reused (no compile hitch later). Until it exists — or without
  // WebGL / EMODEL, or while EMODEL does not know that boss yet — a cute inline SVG stands in. Never a fierce 🐲/🐉 emoji.
  const BOSS_UI = {   // ad: name fallback · lines: voice key prefixes · disc/halo: badge colours (CSS .b-<type> matches disc)
    kraljole: { ad: 'Kral Jöle', svg: SVG.kraljole, lines: ['kraljole_'], disc: ['#fbf6ff', '#e6d8ff', '#b99cf2'], halo: 'rgba(80,220,235,0.85)' },
    kefirdev: { ad: 'Köpüklü Kefir Devi', svg: SVG.kefirdev, lines: ['kefirdev_'], disc: ['#eaf7ff', '#b4e0fc', '#5494dc'], halo: 'rgba(130,205,255,0.9)' },
    kostebekusta: { ad: 'Usta Köstebek', svg: SVG.kostebekusta, lines: ['usta_'], disc: ['#fffaf0', '#ffe3b0', '#f5b86a'], halo: 'rgba(255,190,80,0.85)' },
    lavkaplumbaga: { ad: 'Koca Lav Kaplumbağası', svg: SVG.lavkaplumbaga, lines: ['kaplumbaga_'], disc: ['#fff8f0', '#ffd6b0', '#ff9f6a'], halo: 'rgba(255,130,60,0.85)' },
    ejderha: { ad: 'Huysuz Ejderha', svg: SVG.dragon, lines: ['ejderha_', 'ejder'], disc: ['#fff6fc', '#ffc9ec', '#f59ad6'], halo: 'rgba(255,90,140,0.85)' },
  };
  const BOSS_ORDER = ['kraljole', 'kefirdev', 'kostebekusta', 'lavkaplumbaga', 'ejderha'];   // when ZONES has no boss fields yet
  const bossUi = t => BOSS_UI[t] || { ad: 'Kocaman Huysuz', svg: SVG.bstar, lines: [], disc: BOSS_UI.ejderha.disc, halo: BOSS_UI.ejderha.halo };
  const BP = {};   // type → { url, cv, tried, img }
  const bpRec = t => BP[t] || (BP[t] = { url: null, cv: null, tried: false, img: null });
  const DRG = bpRec('ejderha');
  const BP_ST = { move: 0, windup: -1, attack: -1, hurt: 0, frozen: false, dying: -1, t: 0, phase: 'idle', phaseT: 0, burrow: 0,
    breath: -1, stomp: -1, roar: -1, fireball: -1 };
  // Dragon framing (model metres: head centre ≈ (0, 3.56, 0.74), horns up to y 4.6): almost frontal, a little from above; the
  // wings are folded away (wings: false) so only the head, horns and hearts fill the badge. Light levels. Tests: UI._DC.
  const DRG_CAM = { cx: 0, cy: 3.78, cz: 1.1, rad: 1.5, dx: 0.16, dy: 0.3, fov: 24, hemi: 1.0, key: 2.4, rim: 3.5, wings: false };
  // The other bosses: a close-up spot in model metres (cam: centre + radius, like DRG_CAM — the mole's head with its drill
  // hat, the turtle's face with the little volcano behind it), or they frame themselves from their drawn silhouette (a
  // first small render finds it, see bossPortrait): the band of its height to fill (y0..y1 from the feet up) and how much
  // of the badge it fills. dx/dy: view direction (right, up; toward the face). A model's own m.portrait = {cx, cy, cz, rad}
  // wins over both. Tests: UI._BF.
  const BOSS_FIT = {
    kraljole: { y0: 0, y1: 1, dx: 0.12, dy: 0.24, fill: 0.9 },
    // the bottle seen from the front (from above its white shoulders hide the neck): the whole crown cork on top (05 moved the
    // label face up: cork top ≈ y 2.76), the smiling label face and a bit of the glass shoulders, so it reads as a bottle
    kefirdev: { over: true, dx: 0.1, dy: -0.05, cam: { cx: 0, cy: 1.9, cz: 0.75, rad: 1.25 } },
    kostebekusta: { dx: 0.12, dy: 0.14, cam: { cx: 0, cy: 2.0, cz: 0.45, rad: 1.12 } },
    lavkaplumbaga: { dx: 0.12, dy: 0.2, cam: { cx: 0, cy: 1.26, cz: 1.62, rad: 1.0 } },   // the face fills the badge (reads at 58 px), lava-crack shell around
    _: { y0: 0, y1: 1, dx: 0.15, dy: 0.25, fill: 0.9 },
  };
  function bossSvg(t) { return bossUi(t).svg.replace('class="u-dimg"', `class="u-dimg b-${t}"`); }
  function bossHTML(t) { t = t || 'ejderha'; const R = BP[t]; return R && R.url ? `<img class="u-dimg b-${t}" src="${R.url}" alt="">` : bossSvg(t); }
  // Boss of zone i: ZONES[i].boss (Round 3), else the level's bossType, else the old castle-only dragon.
  function zoneBossOf(i) { const Z = M.ZONES && M.ZONES[i]; return Z ? Z.boss || null : null; }
  function zoneBoss(i) {
    const Z = M.ZONES && M.ZONES[i], L = M.GAME && M.GAME.L;
    if (Z && Z.boss) return Z.boss;
    if (L && L.bossType) return L.bossType;
    return L && L.boss ? 'ejderha' : null;
  }
  function bpRender(sc, cam, N, samples) {
    const rt = new THREE.WebGLRenderTarget(N, N, { samples, colorSpace: THREE.SRGBColorSpace, depthBuffer: true });
    try {
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
      renderer.render(sc, cam);
      const buf = new Uint8Array(N * N * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
      return buf;
    } finally { renderer.setRenderTarget(null); rt.dispose(); }   // the caller restores its own target afterwards
  }
  function bossPortrait(type) {
    type = type || 'ejderha';
    const R = bpRec(type);
    if (R.tried) return R.url;
    R.tried = true;
    const E = M.EMODEL;
    if (ICON || !E || typeof E.build !== 'function' || typeof renderer === 'undefined' || !renderer || !renderer.readRenderTargetPixels) return null;
    const N = 256, sc = new THREE.Scene(), lights = [];
    const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    let m = null;
    try {
      m = E.build(type, {});
      if (!m || !m.root) throw new Error('no model');
      if (m.type && m.type !== type) throw new Error('no model for ' + type + ' yet (got ' + m.type + ')');   // keep the SVG, not a stand-in jelly
      const drg = type === 'ejderha';
      if (m.setMood) m.setMood('happy');
      if (m.s) { m.s.t = 0; m.s.ph = 0; if (drg) m.s.flap = 0; }   // calm idle pose, head straight
      if (m.anim) m.anim(0, BP_ST);
      if (drg && !DRG_CAM.wings && m.B) for (const w of [m.B.wingL, m.B.wingR]) if (w && w.scale) w.scale.setScalar(1e-4);   // head portrait: fold the wings away
      m.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      sc.add(m.root); m.root.updateMatrixWorld(true);
      // camera: the dragon's head close-up (DRG_CAM), a model's own hint, or a generous first framing that is tightened below
      const F = DRG_CAM, fit = BOSS_FIT[type] || BOSS_FIT._, hint = (fit.over && fit.cam) || m.portrait || fit.cam;   // (over: the UI's close-up wins)
      const cam = new THREE.PerspectiveCamera(drg ? F.fov : 24, 1, 0.1, 60);
      let c, rad, dir, auto = false;
      if (drg) { c = new THREE.Vector3(F.cx, F.cy, F.cz); rad = F.rad; dir = new THREE.Vector3(F.dx, F.dy, 1); }
      else if (hint && hint.rad > 0) {
        c = new THREE.Vector3(hint.cx || 0, hint.cy || 0, hint.cz || 0); rad = hint.rad;
        dir = new THREE.Vector3(hint.dx !== undefined ? hint.dx : fit.dx, hint.dy !== undefined ? hint.dy : fit.dy, 1);
      } else {
        const box = new THREE.Box3().setFromObject(m.root);
        if (box.isEmpty()) throw new Error('empty model bounds');
        const sph = box.getBoundingSphere(new THREE.Sphere());
        c = sph.center; rad = Math.max(0.3, sph.radius * 1.15); auto = true;
        dir = new THREE.Vector3(fit.dx, fit.dy, 1);
      }
      dir.normalize();
      const dist = rad / Math.sin(cam.fov * Math.PI / 360);
      cam.position.copy(c).addScaledVector(dir, dist); cam.near = dist * 0.3; cam.far = dist * 3; cam.updateProjectionMatrix();
      cam.lookAt(c); cam.updateMatrixWorld();
      const rel = (x, y, z, k) => new THREE.Vector3(x, y, z).applyQuaternion(cam.quaternion).multiplyScalar(k).add(c);
      // lights: the main scene's counts (spare slots at intensity 0); warm key from the upper left, pink rim from behind
      let np = 0, nd = 0, nds = 0, nh = 0, ns = 0;
      scene.traverseVisible(o => { if (!o.isLight) return; if (o.isPointLight) np++; else if (o.isDirectionalLight) { nd++; if (o.castShadow) nds++; } else if (o.isHemisphereLight) nh++; else if (o.isSpotLight) ns++; });
      const add = l => { sc.add(l); lights.push(l); return l; };
      const hemi = add(new THREE.HemisphereLight(0xf6eeff, 0x8a6a80, F.hemi)); hemi.visible = nh > 0;
      const sb = Math.max(3, rad * 1.6);
      for (let i = 0; i < Math.max(1, nd); i++) {
        const k = add(new THREE.DirectionalLight(0xfff2e4, i === 0 ? F.key : 0));
        k.position.copy(rel(-1.4, 2.6, 1.2, Math.max(2, rad * 2))); k.target.position.copy(c); sc.add(k.target); k.target.updateMatrixWorld();
        if (i < nds) { k.castShadow = true; k.shadow.mapSize.set(256, 256); const s = k.shadow.camera; s.left = s.bottom = -sb; s.right = s.top = sb; s.near = 0.1; s.far = sb * 8; s.updateProjectionMatrix(); }
      }
      for (let i = 0; i < Math.max(1, np); i++) { const l = add(new THREE.PointLight(0xffb8ee, i === 0 ? F.rim : 0, 12 * Math.max(1, rad / 1.5), 1.5)); l.position.copy(rel(1.3, 0.9, -1.5, rad * 2.2)); }
      for (let i = 0; i < ns; i++) add(new THREE.SpotLight(0xffffff, 0));
      sc.fog = scene.fog ? (scene.fog.isFogExp2 ? new THREE.FogExp2(0, 0) : new THREE.Fog(0, 1e4, 2e4)) : null;
      sc.environment = scene.environment || null;
      if (auto) {   // small first render: where is the silhouette? Then look only at that square (same perspective, exact crop)
        const n1 = 128, a = bpRender(sc, cam, n1, 0);
        let x0 = n1, x1 = -1, y0 = n1, y1 = -1;
        for (let r = 0; r < n1; r++) for (let x = 0; x < n1; x++) {
          if (a[(r * n1 + x) * 4 + 3] < 24) continue;
          const y = n1 - 1 - r;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < 0) throw new Error('empty first render');
        const h = y1 + 1 - y0, top = y0 + h * (1 - (fit.y1 ?? 1)), bot = y0 + h * (1 - (fit.y0 ?? 0));
        const w = Math.max(x1 + 1 - x0, bot - top) / (fit.fill || 0.9), mx = (x0 + x1 + 1) / 2, my = (top + bot) / 2;
        cam.setViewOffset(n1, n1, mx - w / 2, my - w / 2, w, w);
      }
      const buf = bpRender(sc, cam, N, 4);
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA);
      // flip + un-premultiply into a canvas, then add a soft drop shadow
      const raw = cnv(N), rc = raw.getContext('2d'), img = rc.createImageData(N, N), o = img.data;
      let cover = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = ((N - 1 - y) * N + x) * 4, d = (y * N + x) * 4, a = buf[s + 3], k = a > 0 && a < 255 ? 255 / a : 1;
        o[d] = Math.min(255, buf[s] * k); o[d + 1] = Math.min(255, buf[s + 1] * k); o[d + 2] = Math.min(255, buf[s + 2] * k); o[d + 3] = a;
        cover += a;
      }
      if (cover < N * N * 255 * 0.08) throw new Error('empty portrait');   // nothing drawn (lost context…): keep the SVG
      rc.putImageData(img, 0, 0);
      const out = cnv(N), g = out.getContext('2d');
      g.shadowColor = 'rgba(60,10,90,0.4)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
      g.drawImage(raw, 0, 0);
      R.cv = out; R.url = out.toDataURL('image/png');
    } catch (e) { warn('bossPortrait ' + type, e); R.url = null; R.cv = null; }
    finally {
      try { renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); } catch (e) { /* ignore */ }
      if (m) { try { sc.remove(m.root); if (m.dispose) m.dispose(); } catch (e) { /* ignore */ } }
      for (const l of lights) { try { if (l.dispose) l.dispose(); } catch (e) { /* ignore */ } }
    }
    if (R.url) bossApply(type);
    return R.url;
  }
  const dragonPortrait = () => bossPortrait('ejderha');
  function bossApply(t) {   // swap the SVG stand-in for the portrait wherever this boss is on screen
    if (D.bossIco && D.boss.dataset.b === t) D.bossIco.innerHTML = bossHTML(t);
    if (MM.spr['b:' + t]) MM.spr['b:' + t] = bossSprite(t);
    if (D.subIco && D.subIco.dataset.b === t) D.subIco.innerHTML = bossHTML(t);
    if (D.winBoss) D.winBoss.querySelectorAll('.u-wb[data-b="' + t + '"]').forEach(e => { e.innerHTML = bossHTML(t); });
  }
  // Voice line → boss (its portrait sits next to the subtitle): EDEF[type].lines {giris, bitti, yarim}, else the key prefixes.
  function lineBoss(key) {
    if (!key) return null;
    const ED = M.EDEF;
    if (ED) for (const t in ED) { const l = ED[t] && ED[t].lines; if (l && typeof l === 'object') for (const k in l) if (l[k] === key) return t; }
    for (const t in BOSS_UI) for (const p of BOSS_UI[t].lines) if (key.indexOf(p) === 0) return t;
    return null;
  }
  // Minimap goal icon: the portrait (or the SVG stand-in once it has loaded) on the boss's pastel disc with a coloured halo.
  function bossSpr(t) { t = t || 'ejderha'; return MM.spr['b:' + t] || (MM.spr['b:' + t] = bossSprite(t)); }
  function bossSprite(t) {
    const R = bpRec(t), U = bossUi(t);
    let src = R.cv;
    if (!src) {
      if (!R.img && typeof Image !== 'undefined') {
        const im = R.img = new Image();
        im.onload = () => { if (!R.cv && MM.spr['b:' + t]) MM.spr['b:' + t] = bossSprite(t); };
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(U.svg);
      }
      if (R.img && R.img.complete && R.img.naturalWidth) src = R.img;
    }
    return sprite(30, (x, s) => {
      const c = s / 2, r = s * 0.4;
      let g = x.createRadialGradient(c, c, 0, c, c, c);
      g.addColorStop(0, U.halo); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, s);
      g = x.createRadialGradient(c, c - r * 0.25, 0, c, c, r);
      g.addColorStop(0, U.disc[0]); g.addColorStop(0.55, U.disc[1]); g.addColorStop(1, U.disc[2]);
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
  // milk drips under the Kefir Vadisi zone ribbon (stretched to the ribbon's width; drawn like the ribbon's cream)
  const ZONE_DRIP = '<svg class="u-zdrip" viewBox="0 0 400 34" preserveAspectRatio="none"><path d="M0 0H400V4C392 4 390 8 384 8C376 8 377 4 366 4' +
    'C356 4 354 13 352 22C350 30 340 30 339 22C338 12 336 6 326 5C312 4 306 10 296 9C286 8 284 4 272 4C262 4 262 9 258 16C255 22 247 22 246 15' +
    'C245 8 242 5 232 5C216 5 212 11 196 11C182 11 180 4 168 4C158 4 156 10 154 20C152 32 140 32 139 21C138 10 134 5 122 5C108 5 104 10 92 10' +
    'C82 10 80 4 70 4C60 4 58 8 56 14C54 20 46 20 45 14C44 8 40 4 30 4C20 4 18 8 10 8C4 8 4 4 0 4Z"/></svg>';
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
    b.className = 'u-banner ' + (o.kind || '') + (o.theme ? ' t-' + o.theme : '');
    let h = '';
    if (o.rays) h += '<div class="u-rays"></div>';
    if (o.kind === 'zone') {
      const dairy = o.theme === 'dairy', mk = dairy ? '<span class="u-zmk">🥛</span>' : '✦';
      if (o.small) h += `<div class="u-zsm">${mk} ${esc(o.small)} ${mk}</div>`;
      const rib = `<div class="u-zrib"><div class="u-btitle">${ol(o.title, 'u-gold-t')}</div></div>`;
      // Kefir Vadisi: a creamy ribbon with milk dripping from its lower edge
      h += dairy ? `<div class="u-zwrap">${rib}${ZONE_DRIP}</div>` : rib;
      if (o.pips && o.pips.n > 1) {   // where we are on the journey: one gem per zone (done · here · still ahead)
        let p = '';
        for (let i = 0; i < o.pips.n; i++) p += `<i class="${i < o.pips.i ? 'd' : i === o.pips.i ? 'c' : ''}"></i>`;
        h += `<div class="u-zpips">${p}</div>`;
      }
    } else {
      if (o.icon) h += `<div class="u-bico${o.med ? ' med' : ''}"${o.color ? ` style="--c:${o.color};--cd:${shade(o.color, -0.5)}"` : ''}>${o.icon}</div>`;
      if (o.title) h += `<div class="u-btitle">${ol(o.title, 'u-gold-t')}</div>`;
      if (o.sub) h += `<div class="u-bsub">${ol(o.sub)}</div>`;
    }
    b.innerHTML = h;
    b.style.removeProperty('--zs');
    if (o.kind === 'zone') {   // a long name ("Köstebek ve Salyangoz Mağarası") on a narrow portrait screen: the ribbon shrinks to fit
      const rib = b.querySelector('.u-zrib'), w = rib ? rib.offsetWidth : 0, max = (innerWidth || 1024) * 0.94;
      if (w > max) b.style.setProperty('--zs', Math.max(0.4, max / w).toFixed(3));
    }
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
    if (!n) { const p = item.power || 0; n = p >= 34 ? 5 : p >= 24 ? 4 : p >= 16 ? 3 : p >= 10 ? 2 : 1; }   // same power-only rule as ITEMS.stars
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
    const slotWord = it.slot === 'weapon' ? (M.ITEMS && M.ITEMS.isWand(it) ? 'BÜYÜ DEĞNEĞİ' : 'IŞIN KILICI') : it.slot === 'hat' ? 'ŞAPKA' : 'PELERİN';
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
  const SUB_EMO = { baykus: '🦉', ilk_salyangoz: '🐌', ilk_kostebek: '⛏️', ilk_kaplumbaga: '🐢', ilk_ateskusu: '🐥',
    // Kefir Vadisi (Round 4): the valley, its creatures, and the glass of kefir the happy Kefir Devi gives Feza
    kefir: '🥛', ilk_yogurt: '🥣', ilk_kaymak: '🍯', ilk_kopuk: '🫧', ilk_peynir: '🧀', kefir_ikram: '🥛', yolculuk: '🗺️' };
  const SUB_MILK = { kefir: 1, ilk_yogurt: 1, ilk_kaymak: 1, ilk_kopuk: 1, ilk_peynir: 1, kefir_ikram: 1 };   // their icon sits on a milky-blue disc (ui.css .u-subico.milk)
  // Title screen: the spoken "Oyna düğmesine bas…" line sits just above the Oyna / Devam Et buttons, never on them. Measured
  // from the buttons' layout box (offsetTop ignores their entry/breathing transforms); other screens use the CSS positions.
  function subPlace() {
    if (!D.sub) return;
    let b = '';
    if (S.mode === 'title' && D.tbtns && D.title.classList.contains('on')) {
      const top = D.tbtns.offsetTop, k = clamp(Math.min(innerWidth, innerHeight) / 800, 0.6, 1.12);
      if (top > 0) b = Math.round(Math.max(0, innerHeight - top) + 16 * k) + 'px';
    }
    if (D.sub.style.bottom !== b) D.sub.style.bottom = b;
    subMeasure();
  }
  // Where the subtitle box starts (layout top, ignores its slide-up transform) while it shows: the story/boss camera keeps
  // Feza (and the boss) above it, the title camera lifts Feza above it.
  function subMeasure() {
    const on = D.sub.classList.contains('on');
    S.subTop = on ? D.sub.offsetTop : -1; S.subBot = on ? D.sub.offsetTop + D.sub.offsetHeight : -1;
    S.logoBot = on && S.mode === 'title' && D.logo ? layBox(D.logo, _lb).b : -1;   // (the title lift keeps Feza's head under it)
  }
  function subtitle(text) {
    clearTimeout(subHide);
    if (text) {
      // a boss's lines: that boss's friendly portrait (cached at its zone load); a line with its own icon keeps it (the
      // glass of kefir while Feza drinks, even if EDEF lists that line with the Kefir Devi)
      const key = lineKey(text), emo = SUB_EMO[key], bt = emo ? null : lineBoss(key);
      if (bt) D.subIco.innerHTML = bossHTML(bt);
      else D.subIco.textContent = emo || '✨';
      D.subIco.classList.toggle('drg', !!bt); D.subIco.classList.toggle('milk', !bt && !!SUB_MILK[key]); D.subIco.dataset.b = bt || '';
      subPlace();
      D.subTxt.textContent = text;
      D.sub.classList.add('on');
      subMeasure();   // (after the text: one or two lines)
    } else subHide = setTimeout(() => { D.sub.classList.remove('on'); S.subTop = S.subBot = -1; }, 380);   // queued lines follow ~0.3 s later: no flicker
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
  // (by theme name: zone indices shifted when the volcano became zone 2)
  function ensureTex(i) {
    const T = M.TEX; if (!T || !T.ensure || typeof i !== 'number' || i < 0) return;
    const Z = M.ZONES && M.ZONES[i | 0];
    safe('TEX.ensure', () => T.ensure(Z && Z.theme ? Z.theme : i | 0));
  }
  // Zone a "Devam Et" will load (GAME's saveZone does the same): the save's zone id (zid, sv 4) when ZONES knows it, else
  // the index — saves from before the volcano (no sv or sv < 3) at zone ≥ 2 first move one zone on (Round 3), then saves
  // from before Kefir Vadisi (sv < 4) at zone ≥ 1 move one more (Round 4: the kefir zone is index 1, the castle index 4).
  function savedZone() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || typeof s.zone !== 'number') return -1;
      if (typeof s.zid === 'string' && M.ZONES && M.ZONES.findIndex) {
        const k = M.ZONES.findIndex(Z => Z && Z.id === s.zid);
        if (k >= 0) return k;
      }
      let z = s.zone | 0;
      const sv = typeof s.sv === 'number' ? s.sv : 0, n = zoneCount();
      if (sv < 3 && z >= 2 && n >= 4) z++;
      if (sv < 4 && z >= 1 && n >= 5) z++;
      return clamp(z, 0, n - 1);
    } catch (e) { return -1; }
  }

  // ───────────────────────── Screens / modes ─────────────────────────
  // A closing screen fades for 0.3 s: `.closing` (ui.css) and `inert` keep its buttons from catching taps meanwhile, so a
  // quick tap right after "Devam Et" reaches the game. The fade timer is per screen (a stale one must not cut a later fade).
  function showScreen(s, on) {
    if (on) { clearTimeout(s._closeT); s.classList.remove('closing'); s.classList.add('on'); s.inert = false; S.guardUntil = performance.now() + 320; }
    else if (s.classList.contains('on')) {
      clearTimeout(s._closeT); s.classList.remove('on'); s.classList.add('closing'); s.inert = true;
      s._closeT = setTimeout(() => { s.classList.remove('closing'); s.inert = false; }, 300);
    }
  }
  function setHud(on) {
    S.hud = on; D.root.classList.toggle('hud-on', on);
    if (M.GAME) D.hardcoreTag.classList.toggle('u-hide', !M.GAME.hardcore);
    if (on) { last.xp = last.lvl = last.gold = last.pot = -1; last.potEv = M.GAME ? M.GAME.P.potions : 99; ORB.acc = 1; }
  }
  function setMode(m) {
    S.mode = m;
    if (m !== 'play') releasePrimary();
    setHud(m === 'play');
    showScreen(D.title, m === 'title');
    subPlace();
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
    const hc = !!M.GAME.hardcore;
    const cp = M.GAME.hardcoreSaveInfo && M.GAME.hardcoreSaveInfo();
    D.modeCard.classList.toggle('hardcore', hc);
    D.modeName.textContent = hc ? '⚔ Hardcore açık' : '🌟 Normal macera';
    D.modeSave.textContent = hc ? (cp ? `Son kayıt: ${cp.zone + 1}. bölümün başı` : 'Henüz kayıt yok · İlk kayıt 2. bölümde')
      : 'İlerleme Mola → Kaydet ile saklanır';
    D.saveBtn.classList.toggle('u-hide', hc);
    D.restart.innerHTML = SVG.again + `<span>${hc ? 'Normal baştan başla' : 'Baştan Başla'}</span>`;
    D.hardcore.textContent = hc ? 'Hardcore’u yeniden başlat' : 'Hardcore başlat';
    D.hardcoreContinue.textContent = cp ? `Hardcore’a dön · ${cp.zone + 1}. bölüm` : 'Hardcore kaydını aç';
    D.hardcoreContinue.classList.toggle('u-hide', hc || !cp);
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
  // Parent's wish: every launch is a new game ("Oyna"); "Devam Et" appears next to it only when the parent saved with
  // Mola › Kaydet. Starting a new game never touches that save (nothing is saved by itself).
  function showTitle() {
    const g = M.GAME;
    const has = !!(g && g.hasSave && safe('hasSave', () => g.hasSave()));
    D.contBtn.classList.toggle('u-hide', !has); D.playBtn.classList.remove('u-hide');
    // With a save (parent's wish): a big green "Devam Et" first and an orange "Baştan Başla" beside it (a new game from the
    // forest; the save itself stays until the next Kaydet). Without a save: just "Oyna".
    D.playBtn.innerHTML = has ? SVG.again + '<span>Baştan Başla</span>' : SVG.play + '<span>Oyna</span>';
    D.playBtn.classList.toggle('g', !has); D.playBtn.classList.toggle('o', has);
    D.contBtn.classList.toggle('g', has); D.contBtn.classList.toggle('b', !has);
    D.contBtn.style.order = has ? '-1' : '';
    D.playBtn.classList.toggle('main', !has); D.contBtn.classList.toggle('main', has);
    S.titleIdle = 0; S.titleSaid = 0;
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
    S.titleIdle = 0; S.titleSaid++;
    const cont = !D.contBtn.classList.contains('u-hide');
    aud('say', cont ? 'devam' : 'basla', { prio: 1 });   // "Devam Et düğmesine bas…" with a save, else "Oyna düğmesine bas…"
  }
  async function startGame(cont, heroClass) {
    const g = M.GAME;
    if (S.busy || !g || (S.mode !== 'title' && S.mode !== 'choose')) return;
    if (!cont && !heroClass) { openChoice('title'); return; }
    S.busy = true;
    clearBanners(); clearCards(); hideBoss(); S.cine = null;
    const A = M.AUD;
    if (S.mode === 'choose' || (A && (A.current === 'basla' || A.current === 'devam'))) aud('stopVoice');   // the title prompt must not delay the intro
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
        showScreen(D.choice, false); setPaused(false);
        newGameWithIntro(g, { heroClass: heroClass === 'hybrid' ? 'hybrid' : heroClass === 'wizard' ? 'wizard' : 'warrior', plus: false });
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
    if (orig) A.say = function (k) { if (k === 'giris1' || k === 'giris_buyu' || k === 'giris_hibrit' || k === 'tekrar') said = true; return orig.apply(this, arguments); };
    S.cheered = 0;
    try { safe('newGame', () => g.newGame(o)); } finally { if (orig) A.say = orig; }
    if (!said && A && (!o || !o.plus)) { aud('say', o && o.heroClass === 'hybrid' ? 'giris_hibrit' : o && o.heroClass === 'wizard' ? 'giris_buyu' : 'giris1', { prio: 3 }); if (!o || (!o.heroClass || o.heroClass === 'warrior')) aud('say', 'giris2', { prio: 3 }); }
  }
  function restartAll() {
    if (!M.GAME || S.busy) return;
    showScreen(D.pause, false); S.menu = null;
    openChoice('pause');
  }
  // Mola › Kaydet: the only way progress is kept. The button itself says "Kaydedildi!" for a moment (the menu stays open).
  function saveNow() {
    const g = M.GAME, b = D.saveBtn;
    if (!g || !g.save || g.hardcore || S.saveT) return;
    const ok = !!safe('save', () => g.save());
    b.classList.toggle('g', ok); b.classList.toggle('r', !ok); b.classList.remove('b');
    b.innerHTML = ok ? SVG.check + '<span>Kaydedildi!</span>' : SVG.close + '<span>Kaydedilemedi</span>';
    if (ok) { sfx('checkpoint', { vol: 0.7 }); bump(b, 1.08); } else nope(b);
    S.saveT = setTimeout(() => {
      S.saveT = 0; b.classList.remove('g', 'r'); b.classList.add('b'); b.innerHTML = SVG.save + '<span>Kaydet</span>';
    }, 1800);
  }
  function showVictory() {
    const g = M.GAME, P = g ? g.P : null;
    if (S.menu) closeMenu();   // never over an open bag/pause (it would also leave GAME.paused set for the next run)
    setMode('end');
    const chips = [];
    if (P) {
      chips.push(`<span class="u-chip">⭐ Seviye ${P.lvl}</span>`, `<span class="u-chip"><span class="u-coin"></span> ${P.gold}</span>`);
      if (S.cheered) chips.push(`<span class="u-chip">😊 ${S.cheered} huysuz neşelendi</span>`);
    }
    D.winChips.innerHTML = chips.join('');
    // every zone's boss, happy now: portraits cached this session, else their SVG stand-ins — the missing ones (a game
    // continued from a save) are rendered one by one once the panel is up (S.bpq in step), behind the blur, and swapped in
    const bosses = [];
    for (let i = 0; i < zoneCount(); i++) { const t = M.ZONES ? zoneBossOf(i) : BOSS_ORDER[i]; if (t && bosses.indexOf(t) < 0) bosses.push(t); }
    D.winBoss.innerHTML = bosses.map((t, i) => `<span class="u-wb" data-b="${esc(t)}" style="animation-delay:${(-i * 0.35).toFixed(2)}s">${bossHTML(t)}</span>`).join('');
    D.winBoss.classList.toggle('u-hide', bosses.length < 2);
    S.bpq = bosses.length > 1 ? bosses.filter(t => !bpRec(t).tried) : []; S.bpqT = S.t + 0.8;
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
      // lines from the old run must not play into the new one — except the ending line itself, if a quick tap came before
      // it was over ("…Sen gerçek bir kahramansın!"): it finishes and 'tekrar' simply follows it
      // (GAME stops everything else just before it says 'son')
      const A = M.AUD;
      if (!(A && A.current === 'son')) aud('stopVoice');
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
    const chips = [`<span class="u-chip">❤️ ${Math.round(P.maxHp)}</span>`];
    if (P.heroClass === 'hybrid') {
      chips.push(`<span class="u-chip">${SVG.saber} ${Math.round(P.meleeDmg)}</span>`, `<span class="u-chip">🪄 ${Math.round(P.magicDmg)}</span>`);
    } else chips.push(`<span class="u-chip">${P.heroClass === 'wizard' ? '🪄' : SVG.saber} ${Math.round(P.dmg)}</span>`);
    if (P.armor > 0) chips.push(`<span class="u-chip">🛡️ %${Math.round(P.armor)}</span>`);
    D.bagChips.innerHTML = chips.join('');
    for (const sl of SLOTS) {
      const box = D.slots[sl], cur = P.equip[sl];
      if (sl === 'weapon') box.label.innerHTML = P.heroClass === 'wizard' ? '🪄 Büyü Değnekleri' : P.heroClass === 'hybrid' ? `${SVG.saber} Kılıçlar ve 🪄 Değnekler` : `${SVG.saber} Işın Kılıçları`;
      const worn = sl === 'weapon' && P.heroClass === 'hybrid' ? [cur, P.equip.offhand].filter(Boolean) : [cur].filter(Boolean);
      box.hdName.innerHTML = worn.length ? '· ' + worn.map(it => esc(it.ad || '')).join(' + ') : '';
      box.tiles.innerHTML = '';
      const items = (P.bag || []).filter(it => it && it.slot === sl).sort((a, b) => (b.power || 0) - (a.power || 0) || (b.rarity || 0) - (a.rarity || 0));
      if (sl !== 'weapon') {
        const t = el('button', 'u-tile none' + (!cur ? ' on' : ''), box.tiles, `<span class="u-temo">🙂</span><span class="u-stars" style="color:#fff;text-shadow:none">Yok</span><span class="u-chk">✓</span>`);
        onTap(t, () => { if (P.equip[sl] && g.unequip) { safe('unequip', () => g.unequip(sl)); afterEquip(); } });
      }
      for (const it of items) {
        const r = clamp(it.rarity || 0, 0, 3), col = rarCol(r), slot = g.equipSlot ? g.equipSlot(it) : sl, equipped = P.equip[slot];
        const t = el('button', 'u-tile' + (it === equipped ? ' on' : '') + (newItems.has(it) ? ' fresh' : ''), box.tiles,
          `${itemThumb(it)}<span class="u-stars">${stars(it)}</span><span class="u-chk">✓</span><span class="u-new">YENİ</span>`);
        const diff = (it.power || 0) - (equipped ? equipped.power || 0 : 0);
        t.setAttribute('aria-label', `${it.ad || 'Eşya'}${it === equipped ? ', kuşanıldı' : ', güç farkı ' + (diff > 0 ? '+' : '') + diff}`);
        t.title = t.getAttribute('aria-label');
        t.style.setProperty('--rc', col); t.style.setProperty('--rl', shade(col, 0.5)); t.style.setProperty('--rd', shade(col, -0.6));
        onTap(t, () => {
          if (P.equip[slot] === it) { wiggle(t); return; }
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
    const g = M.GAME, t = (d && d.type) || (g && g.boss && g.boss.type) || 'ejderha';
    if (!bpRec(t).tried) bossPortrait(t);   // normally done at its zone load (behind the loading fade)
    S.boss = true; S.bossFrac = S.bossTrail = d && d.maxHp ? clamp(d.hp / d.maxHp, 0, 1) : 1;
    const ED = M.EDEF, ad = (d && d.name) || (ED && ED[t] && ED[t].ad) || bossUi(t).ad;
    D.boss.dataset.b = t;   // per-boss bar colours (ui.css .u-boss[data-b])
    D.bossName.innerHTML = ol(ad);
    D.bossIco.innerHTML = bossHTML(t);
    measureBossBar();
    bossFill(S.bossFrac); D.bossTrail.style.transform = `scaleX(${S.bossFrac})`;
    D.boss.classList.add('on');
  }
  // The fill shrinks with scaleX; its bubble layer is scaled back (1/frac), so the bubbles stay round at any health.
  function bossFill(f) {
    D.bossFill.style.transform = `scaleX(${f.toFixed(4)})`;
    if (D.boss.dataset.b === 'kefirdev') D.bossFizz.style.transform = `scaleX(${(1 / Math.max(0.02, f)).toFixed(4)})`;
  }
  function hideBoss() { S.boss = false; D.boss.classList.remove('on'); }

  // ───────────────────────── GAME events ─────────────────────────
  function wireEvents() {
    const g = M.GAME;
    if (!g || !g.on) return;
    const on = (e, f) => g.on(e, d => { try { f(d || {}); } catch (err) { console.error('[UI] event ' + e, err); } });
    on('zone', d => {
      D.hardcoreTag.classList.toggle('u-hide', !g.hardcore);
      mapReset(g.L);
      refreshAllSkills();
      portraitSoon(0.1);
      hideBoss(); S.cine = null; S.pwatch = null;
      if (S.hintGoal) stopHint();
      const Z = M.ZONES && M.ZONES[d.index], bt = zoneBoss(d.index);
      // this zone's boss portrait: once per session, while the loading screen / fade still covers the screen
      if (bt && !ICON) bossPortrait(bt);
      if (d.title || ICON) return;
      if (S.mode === 'title') setMode('play');
      const ng = g.P && g.P.ng ? ` · Macera ${g.P.ng + 1}` : '';
      const zi = clamp(d.index | 0, 0, 98), nZ = Math.max(zoneCount(), zi + 1);
      banner({ kind: 'zone', title: d.name || (Z && Z.ad) || 'Yeni Yer', small: `${zi + 1}. Bölge${ng}`, pips: { n: nZ, i: zi }, dur: 3.2, theme: (Z && Z.theme) || '' });
    });
    on('portal', async () => {
      while (S.busy) await new Promise(r => setTimeout(r, 100));   // never drop it: GAME waits in 'transition' for us
      S.busy = true;
      try {
        await fade(1, 0.8, 'load');
        clearBanners(); clearCards(); hideBoss(); S.cine = null; stopHint();
        ensureTex((g.P.zone | 0) + 1);
        aud('stopVoice');   // the old zone's boss 'bitti' / 'kapi' lines must not talk about a door in the new zone
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
    on('respawn', d => {
      fadeSnap(0.92, 'flash');
      fade(0, 0.9, null);
      if (d.hardcore) toast(d.zone === 0 ? 'Hardcore: 1. bölümden başlıyorsun' : `Hardcore: ${d.zone + 1}. bölüm kaydına döndün`, true);
    });
    on('boss', d => { if (d.on) showBoss(d); else hideBoss(); });
    on('bossHp', d => {
      S.bossFrac = clamp(d.frac, 0, 1);
      bossFill(S.bossFrac);
      if (D.boss.animate) D.boss.animate([{ filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 200 });
    });
    on('victory', () => { hideBoss(); if (S.menu) closeMenu(); setTimeout(() => { if (g.state === 'end' && S.mode === 'play') showVictory(); }, 2600); });
    on('happy', d => {
      S.cheered++;
      if (d.boss) {   // camera story beat: the boss cheers up → the castle's crystal rises / the zone's portal wakes up
        const L = g.L, Z = M.ZONES && g.P && M.ZONES[g.P.zone | 0];
        S.cine = { t: 0, bx: d.x, bz: d.z, fin: !!(L && L.crystalSpot) || !!(Z && Z.final) || d.type === 'ejderha' };
      }
    });
    // The Kefir Devi's glass of kefir (GAME 'gift' {stage: 'drink' | 'drunk', x, z, dur}): the story camera moves in close on
    // Feza while he drinks it, stays for his cheer, then goes back to the happy giant and its portal (updateCamera, cineTick).
    on('gift', d => {
      const c = S.cine; if (!c || c.fin !== false) return;
      if (d.stage === 'drink') { c.drink = 1; c.dT = 0; c.dDur = clamp(Number(d.dur) || 1.6, 0.5, 4); }
      else if (d.stage === 'drunk') { c.drink = 2; c.dT = 0; }
    });
    on('toast', d => toast(d.text || ''));
    on('checkpoint', () => toast('✨ Neşe taşı parladı!', true));
    on('hardcoreCheckpoint', d => toast(`Hardcore kaydı: ${d.zone + 1}. bölümün başı`, true));
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
  // Boss silhouette sample points in its own frame (x right, y up, z toward its face), metres. The dragon's come from its
  // model's bounds (horns, head, wing tops, wing tips, front feet, tail); the rounder bosses use a box from height and radius.
  const BOSS_PTS = [-0.6, 4.8, 0, 0.6, 4.8, 0, 0, 4.6, 0.8, -2.6, 3.6, -2.1, 2.6, 3.6, -2.1, -3.5, 2.6, -1.8, 3.5, 2.6, -1.8,
    0, 0, 2.3, -2.0, 0, 1.2, 2.0, 0, 1.2, 0, 0.5, -3.8];
  const FIT_F = [0.42, 0.48, 0.54, 0.6, 0.66, 0.36, 0.3];   // look-at fractions toward the focus, in order of preference
  // … and, only while a subtitle narrows the box (portrait: it crosses the middle), aiming closer to Feza (or a little past
  // him, away from the focus) may be needed to lift everything above it
  const FIT_FX = FIT_F.concat([0.22, 0.12, 0, -0.12, -0.25]);
  const FIT = { pts: new Float32Array(72), n: 0, ox: 0, oz: 0, zoom: 1, res: 0, f: 0 };   // res/f: last rule + look-at fraction (tests)
  const CAMK = { k: 1 };   // cameraFollow's distance factor for this aspect (portrait pulls back), read off the real camera
  const _fc = new THREE.PerspectiveCamera(), _fv = new THREE.Vector3();
  function fitAdd(x, y, z) { const i = FIT.n++ * 3; FIT.pts[i] = x; FIT.pts[i + 1] = y; FIT.pts[i + 2] = z; }
  const BPC = { key: '', pts: null };
  function bossPts(b) {
    if (!b.type || b.type === 'ejderha') return BOSS_PTS;
    const h = b.height > 0.5 ? b.height : 2.8, r = Math.max(0.7, b.r || 1.2), key = b.type + h.toFixed(2) + r.toFixed(2);
    if (BPC.key !== key) {
      BPC.key = key;
      BPC.pts = [0, h * 1.08, 0, -r * 1.1, h * 0.62, 0, r * 1.1, h * 0.62, 0, 0, h * 0.62, r * 1.1, -r * 1.1, 0, 0, r * 1.1, 0, 0, 0, 0, r * 1.25, 0, 0, -r * 1.2];
    }
    return BPC.pts;
  }
  const bigBoss = b => !b.type || b.type === 'ejderha' || b.height > 3.6;   // the tall dragon: a more frontal, wider view
  function fitBoss(b, sc) {   // add the boss's sample points (scaled by its dying shrink `sc`)
    const cs = Math.cos(b.face || 0), sn = Math.sin(b.face || 0), PTS = bossPts(b);
    for (let i = 0; i < PTS.length; i += 3) {
      const lx = PTS[i] * sc, ly = PTS[i + 1] * sc, lz = PTS[i + 2] * sc;
      fitAdd(b.x + lx * cs + lz * sn, ly, b.z - lx * sn + lz * cs);
    }
  }
  // The safe screen box for the fit (NDC, y up): below the boss bar (else the top 10 %), above the bottom controls, inside the
  // sides; under the stricter rules the points must also stay clear of the HUD corners (portrait + XP block, 🎒⏸ row, minimap,
  // health orb + potion, attack + skill buttons: their real layout boxes) and above the subtitle box while a line shows
  // (landscape: the bottom strip; portrait: across the middle).
  const FL = { corners: true, sub: 0, fr: null, south: false, ax: 0, az: 0, af: 0, yTop: 0.8, yBot: -0.78, yBotS: -0.78, yBand: 2, xLim: 0.88, nR: 0, R: new Float32Array(40), frame: -99, W: 0, H: 0 };
  const _lb = { l: 0, t: 0, r: 0, b: 0 };
  function fitRect(l, t, r, b, W, H) {   // screen px box (+ margin) → NDC [x0, x1, y0, y1]
    if (FL.nR >= 10) return;
    const o = FL.nR++ * 4;
    FL.R[o] = 2 * (l - 8) / W - 1; FL.R[o + 1] = 2 * (r + 8) / W - 1; FL.R[o + 2] = 1 - 2 * (b + 12) / H; FL.R[o + 3] = 1 - 2 * (t - 12) / H;
  }
  function fitLimits() {
    const W = innerWidth || 1, H = innerHeight || 1, top = S.boss ? S.bossTop : 0.1 * H;
    FL.yTop = 1 - 2 * Math.min(top, 0.4 * H) / H; FL.yBot = -0.78; FL.xLim = 0.88;   // Feza's feet stay above the controls
    const sub = S.hud && S.subTop > 0;
    FL.yBotS = sub ? clamp(1 - 2 * (S.subTop - 10) / H, FL.yBot, FL.yTop - 0.6) : FL.yBot;
    FL.yBand = sub ? 1 - 2 * (S.subBot + 10) / H : 2;   // the box's bottom edge: Feza may stand below it (portrait), never in it
    if (S.frame - FL.frame > 30 || FL.W !== W || FL.H !== H) {   // corner boxes, refreshed twice a second
      FL.frame = S.frame; FL.W = W; FL.H = H; FL.nR = 0;
      if (S.hud) {
        for (const e of [D.tl, D.sbtns, D.mini, D.bl]) {
          if (!e) continue;
          layBox(e, _lb); if (_lb.r - _lb.l < 4) continue;
          fitRect(_lb.l, e === D.bl ? _lb.t : -1e4, _lb.r, e === D.bl ? 1e4 : _lb.b + (e === D.tl ? 6 : 0), W, H);   // (tl: + the level star)
        }
        for (const e of [D.atk].concat(D.sk.map(v => v.b))) {   // round buttons centred on their layout point (translate −50 %)
          if (!e || !e.offsetWidth) continue;
          layBox(e, _lb); const r = e.offsetWidth / 2;
          fitRect(_lb.l - r, _lb.t - r, _lb.l + r, _lb.t + r, W, H);
        }
      }
    }
  }
  // Does every fit point project inside the safe screen box with the camera looking at (tx,ty,tz)? FL.corners: every point
  // keeps clear of the HUD corners; FL.sub: 2 every point stays above the subtitle, 1 only Feza's (the last two points), 0 none
  // — but under every rule the subtitle box never covers Feza (his feet…head span stays above or below it).
  function fitsView(tx, ty, tz, zoom, pitch) {
    const d = CAM.dist * CAMK.k * zoom;   // same placement as cameraFollow (its aspect pull-back factor is measured, see CAMK)
    _fc.position.set(tx, ty + Math.sin(pitch) * d, tz + Math.cos(pitch) * d);
    _fc.lookAt(tx, ty, tz); _fc.updateMatrixWorld();
    const n = FIT.n, xl = FL.xLim, sm = FL.sub, nR = FL.corners ? FL.nR * 4 : 0, R = FL.R;
    let feet = 0;
    for (let i = 0; i < n; i++) {
      _fv.set(FIT.pts[i * 3], FIT.pts[i * 3 + 1], FIT.pts[i * 3 + 2]).project(_fc);
      const x = _fv.x, y = _fv.y;
      if (x < -xl || x > xl || y > FL.yTop) return false;
      if (i === n - 2) feet = y;   // Feza's feet, then his head (added last by fitSolve)
      else if (i === n - 1 && feet < FL.yBotS && y > FL.yBand) return false;
      if (y < (sm === 2 || (sm === 1 && i >= n - 2) ? FL.yBotS : FL.yBot)) return false;
      for (let o = 0; o < nR; o += 4) if (x > R[o] && x < R[o + 1] && y > R[o + 2] && y < R[o + 3]) return false;
    }
    return true;
  }
  // Where to aim: part of the way from Feza toward the focus (the first fraction in FL.fr order whose view fits), or — only
  // while a subtitle narrows the box (FL.south) — a little south of Feza, which lifts him and everything up the screen.
  // Sets FL.ax/az (look-at offset from Feza) and FL.af (the fraction; −1 for a south step); false when nothing fits.
  const FIT_SOUTH = [0.6, 1.2, 1.8, 2.4];   // metres
  function fitAim(px, pz, fx, fz, ty, zoom, pitch) {
    const fr = FL.fr;
    for (let j = 0; j < fr.length; j++) {
      const f = fr[j], ax = (fx - px) * f, az = (fz - pz) * f;
      if (fitsView(px + ax, ty, pz + az, zoom, pitch)) { FL.ax = ax; FL.az = az; FL.af = f; return true; }
    }
    if (FL.south) for (let j = 0; j < FIT_SOUTH.length; j++) {
      if (fitsView(px, ty, pz + FIT_SOUTH[j], zoom, pitch)) { FL.ax = 0; FL.az = FIT_SOUTH[j]; FL.af = -1; return true; }
    }
    return false;
  }
  // Pick the smallest zoom in [z0,z1] (and an aim) that keeps Feza and all fit points in the safe box, trying the strictest
  // rule first (FIT_RULES: [corners, subtitle, fractions, south steps]): everything clear of the HUD corners and above the
  // subtitle; then only Feza above it; then clear of the corners only; last the plain box (the older rule). Returns the rule's
  // number (1…), or 0 when nothing fits even at z1: then Feza alone stays in view at z1, leaning toward the focus as far as
  // that allows (noLean: returns -1 and leaves FIT alone). Result in FIT.ox/oz/zoom.
  const FIT_RULES = [
    [[true, 0, FIT_F, false], [false, 0, FIT_F, false]],   // no subtitle on screen
    [[true, 2, FIT_F, false], [true, 2, FIT_FX, true], [true, 1, FIT_F, false], [true, 1, FIT_FX, true], [true, 0, FIT_F, false], [false, 0, FIT_F, false]],
  ];
  const NO_FR = [];
  // A rule, once picked, is tried first for FIT_DWELL s while the shot (ctx) and the subtitle stay the same, so a hopping boss
  // doesn't flip the camera between framings (e.g. Feza above ↔ below a portrait subtitle) every few frames.
  const FITP = { ctx: '', sub: -2, rule: 0, t0: -9 }, FIT_DWELL = 1.5;
  const FK = { ax: 0, az: 0, af: 0 };   // the best aim found so far in this solve
  function keepAim() { FK.ax = FL.ax; FK.az = FL.az; FK.af = FL.af; }
  function fitSolve(ctx, px, pz, fx, fz, ty, pitch, z0, z1, noLean, frs) {   // frs: own look-at fractions for every rule
    if (_fc.aspect !== camera.aspect || _fc.fov !== camera.fov) {
      _fc.fov = camera.fov; _fc.aspect = camera.aspect; _fc.near = camera.near; _fc.far = CAM_FAR; _fc.updateProjectionMatrix();
    }
    fitAdd(px, 0, pz); fitAdd(px, 1.7, pz);
    fitLimits();
    let res = -1, zoom = z1;
    FK.ax = FK.az = FK.af = 0;
    const rules = FIT_RULES[FL.yBotS > FL.yBot + 0.005 ? 1 : 0];
    const st = FITP.ctx === ctx && FITP.sub === S.subTop && FITP.rule > 0 && FITP.rule <= rules.length && S.t - FITP.t0 < FIT_DWELL ? FITP.rule - 1 : -1;
    let fresh = true;
    for (let k = -1; k < rules.length; k++) {
      const q = k < 0 ? st : k;
      if (q < 0 || (k >= 0 && q === st)) continue;
      const m = q + 1, u = rules[q]; FL.corners = u[0]; FL.sub = u[1]; FL.fr = frs || u[2]; FL.south = u[3];
      if (noLean && !u[0]) continue;   // (story beat: a portal half behind the HUD is no view — it flies over instead)
      fresh = k >= 0;
      if (fitAim(px, pz, fx, fz, ty, z0, pitch)) { keepAim(); zoom = z0; res = m; break; }
      if (!fitAim(px, pz, fx, fz, ty, z1, pitch)) continue;
      keepAim();
      let lo = z0, hi = z1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        if (fitAim(px, pz, fx, fz, ty, mid, pitch)) { hi = mid; keepAim(); } else lo = mid;
      }
      zoom = hi; res = m; break;
    }
    if (res < 0) {
      if (noLean) { FIT.n = 0; FITP.rule = 0; return -1; }
      // too far apart even zoomed out (a far portal): Feza stays in view (above the subtitle if possible), leaning toward the focus
      const n = FIT.n; FIT.pts.copyWithin(0, (n - 2) * 3, n * 3); FIT.n = 2;   // his two points (added last)
      res = 0; FL.corners = false; FL.fr = NO_FR;
      let hit = false;
      for (let sm = 1; sm >= 0 && !hit; sm--) {
        FL.sub = sm;
        for (let ff = FIT_F[0]; ff > 0.01; ff -= 0.06) if (fitsView(px + (fx - px) * ff, ty, pz + (fz - pz) * ff, z1, pitch)) { FK.ax = (fx - px) * ff; FK.az = (fz - pz) * ff; FK.af = ff; hit = true; break; }
        FL.south = true;   // (the subtitle covers him wherever he leans: step the aim south to lift him above it)
        if (!hit && fitAim(px, pz, fx, fz, ty, z1, pitch)) { keepAim(); hit = true; }
      }
    }
    FIT.ox = FK.ax; FIT.oz = FK.az; FIT.zoom = zoom; FIT.n = 0; FIT.res = res; FIT.f = FK.af;
    if (fresh || res !== FITP.rule || FITP.ctx !== ctx) FITP.t0 = S.t;
    FITP.ctx = ctx; FITP.sub = S.subTop; FITP.rule = res;
    return res;
  }
  function fitPortal(po) {   // the stone arch (06: pillars at ±1.58, arch top + keystone ≈ 4.3 m, front step to z + 1.6)
    fitAdd(po.x, 0, po.z + 1.4); fitAdd(po.x, 4.25, po.z);
    fitAdd(po.x - 1.9, 0.2, po.z); fitAdd(po.x + 1.9, 0.2, po.z); fitAdd(po.x - 1.75, 3.3, po.z); fitAdd(po.x + 1.75, 3.3, po.z);
  }
  // Mid-boss story beat (S.cine, fin false): 0–4.6 s the cheering boss, then the portal that woke up — with Feza when both fit,
  // else (a far portal) a short flight to the portal (until CINE.back) and back to Feza (CINE.panEnd). Final boss: CINE.fin.
  const CINE = { boss: 4.6, end: 7.5, back: 8.0, panEnd: 9.0, fin: 9.5, wait: 22 };
  const cineEnd = c => (c.fin === false ? (c.pan ? CINE.panEnd : CINE.end) : CINE.fin);
  // A boss with a longer goodbye (the Kefir Devi first hands Feza a glass of kefir, he drinks it, then its portal wakes up):
  // the camera stays on Feza and the boss until the portal is awake (at most CINE.wait s), then shows the portal as usual.
  // The Kefir Devi's gift: close on Feza while he drinks (CINE_DRINK.hold s more for his cheer after the last sip), then back.
  const CINE_DRINK = { hold: 1.4, late: 0.6 };
  const DRINK_F = [0.13, 0.09, 0.05, 0.02, 0];   // look-at fractions of 8 m toward the giant (≤ 1 m)
  function cineTick(dt) {
    const c = S.cine, g = M.GAME, L = g && g.L, po = c.fin === false && L ? L.portalObj : null;
    c.t += dt;
    if (c.drink) {
      c.dT += dt;
      if (c.drink === 1 && c.dT > c.dDur + CINE_DRINK.late) { c.drink = 2; c.dT = 0; }   // (no 'drunk' came: go on anyway)
      else if (c.drink === 2 && c.dT > CINE_DRINK.hold) c.drink = 0;
    }
    if (po && po.active === false && c.t > CINE.boss - 0.05 && (c.wait || 0) < CINE.wait) {
      c.wait = (c.wait || 0) + dt; c.t = CINE.boss - 0.05;
      const b = g.boss;   // (it may walk over to Feza with the glass: follow it while it is still there)
      if (b && !b.gone && b.m && b.m.root && b.m.root.visible && Number.isFinite(b.x)) { c.bx = b.x; c.bz = b.z; }
    }
    if (c.t > cineEnd(c) && !c.drink) { const mid = c.fin === false; S.cine = null; if (mid) armPortalWatch(); }
  }
  const PAN_F = [0, 0.12, 0.24, 0.36, 0.48];
  function fitCheerBoss(c, b, dy) {   // the cheering boss, shrinking in its goodbye (dy 0..1), or where it stood
    if (b && dy < 1) fitBoss(b, Math.max(0.3, 1 - dy));
    else { fitAdd(c.bx, 0, c.bz); fitAdd(c.bx, c.wait ? clamp((b && b.height) || 2.2, 2.2, 3.4) : 2.2, c.bz); }   // (waiting: the whole boss)
  }
  // Title: while the spoken prompt shows, Feza steps up the screen so its box never covers his legs (his head stays under the logo).
  const _tv = new THREE.Vector3(), _ta = { x: 0, y: 0, vis: false }, _tb = { x: 0, y: 0, vis: false };
  let titleLiftM = 0;
  function titleLift(px, pz) {
    if (!(S.subTop > 0)) return (titleLiftM = 0);
    toScreen(_tv.set(px, 0, pz), _ta); toScreen(_tv.set(px, 1.45, pz), _tb);
    const ppm = (_ta.y - _tb.y) / 1.45;   // screen px per metre at Feza (lowering the look-at moves him up by this much)
    if (!(ppm > 20)) return titleLiftM;
    const cur = Math.max(0, TITLE_CAM.ty - CAMV.ty);   // lift already applied (CAMV.ty is damped toward the target)
    let want = (_ta.y + cur * ppm - (S.subTop - 12)) / ppm;
    if (S.logoBot > 0) want = Math.min(want, cur + (_tb.y - 0.04 * ppm - (S.logoBot + 4)) / ppm);
    return (titleLiftM = clamp(want, 0, 0.9));
  }
  function updateCamera(dt, snap) {
    const g = M.GAME, P = g && g.P;
    const px = P ? P.pos.x : 0, pz = P ? P.pos.z : 0;
    let zoom = 1, pitch = S.playPitch, yaw = 0, ty = 0.8, k = 2.4, ox = 0, oz = 0;
    const title = !ICON && (S.mode === 'title' || S.mode === 'boot');
    if (ICON) { zoom = 0.21; pitch = 0.16; yaw = 0.42; ty = 1.02; k = 50; }   // arms up: frame the raised, lit saber too
    else if (title) { zoom = TITLE_CAM.zoom * (camera.aspect < 0.9 ? 1.25 : 1); pitch = TITLE_CAM.pitch; yaw = titleYaw() + Math.sin(S.t * 0.11) * TITLE_CAM.swing; ty = TITLE_CAM.ty - (S.mode === 'title' ? titleLift(px, pz) : 0); k = 1.6; }
    else if (S.mode === 'end') { zoom = 0.62; pitch = 0.78; yaw = Math.sin(S.t * 0.16) * 0.35; ty = 1.0; k = 1.2; }
    else if (P && P.dead) { zoom = 0.82; }
    else if (S.boss && g.boss && !g.boss.dead) {   // keep the whole boss on screen, not just Feza
      fitBoss(g.boss, 1);
      const big = bigBoss(g.boss), bd = Math.hypot(g.boss.x - px, g.boss.z - pz);
      // a little more frontal (the tall dragon needs less zoom-out); zoom cap keeps Feza ≥ ~70 px tall, only when he is far
      // from the boss (it walks closer) a bit more is allowed
      if (big) { ty = 1.6; pitch = S.playPitch - 0.08; fitSolve('boss', px, pz, g.boss.x, g.boss.z, ty, pitch, 1.05, 1.62 + clamp((bd - 10) * 0.05, 0, 0.16)); }
      else { ty = clamp((g.boss.height || 2.8) * 0.42, 0.9, 1.5); pitch = S.playPitch - 0.05; fitSolve('boss', px, pz, g.boss.x, g.boss.z, ty, pitch, 1.0, 1.42 + clamp((bd - 10) * 0.05, 0, 0.16)); }
      zoom = FIT.zoom; ox = FIT.ox; oz = FIT.oz; k = 1.5;
    } else if (S.cine && P) {   // boss defeated: look at the cheering boss, then at the rising crystal (castle) or the portal
      const c = S.cine, L = g.L, po = c.fin === false && L ? L.portalObj || L.exit : null;
      pitch = 0.74; ty = 1.3; k = 1.3;
      let fit = true;
      const b = g.boss, gf = b && b.gift, gl = gf && gf.stage === 1 && gf.glass ? gf.glass.position : null;
      if (c.drink) {
        // the Kefir Devi's gift: close on Feza while he drinks his glass of kefir (a lower view sees the glass from the side),
        // a little wider for his cheer after the last sip, then a gentle move back to the giant and its portal
        // (the aim leans up to ~1 m toward the giant when that still fits: Feza a little lower, its smile in the background)
        pitch = 0.54; ty = 0.9; k = 2.4;
        const bd = Math.hypot(c.bx - px, c.bz - pz), s = bd > 0.5 ? 8 / bd : 0;
        fitSolve('drink', px, pz, px + (c.bx - px) * s, pz + (c.bz - pz) * s, ty, pitch, c.drink === 2 ? 0.56 : 0.42, c.drink === 2 ? 0.95 : 0.8, false, DRINK_F);
      } else if (gl && c.t < CINE.boss) {   // …and before that, the glass floating over to him from the giant's hand: follow it in
        fitAdd(gl.x, gl.y - 0.35, gl.z); fitAdd(gl.x, gl.y + 0.45, gl.z);
        pitch = 0.68; ty = 1.1; k = 2.2;
        fitSolve('glass', px, pz, gl.x, gl.z, ty, pitch, 0.62, 1.7);
      } else if (c.t < CINE.boss) {
        // the boss while it is still there: its happy goodbye shrinks it (GAME's st.dying 0..1; −1 while it still stands
        // there, e.g. the Kefir Devi handing Feza its glass of kefir), else the usual 3.2 s
        const dy = b && b.st && typeof b.st.dying === 'number' ? Math.max(0, b.st.dying) : c.t / 3.2;
        // A portal that wakes up while the boss still waves (1.5 s in) joins the shot, so the kid sees the gate light up
        // while its line plays — when boss, gate and Feza all fit (decided once as it wakes; else the gate gets its own
        // shot after CINE.boss, as before)
        const pa = po && L.portalObj && L.portalObj.active !== false ? L.portalObj : null;
        let done = false;
        if (pa && c.poFit !== false) {
          fitCheerBoss(c, b, dy); fitAdd(pa.x, 0.2, pa.z + 0.9); fitAdd(pa.x, 2.6, pa.z); fitAdd(pa.x - 1.5, 1.2, pa.z); fitAdd(pa.x + 1.5, 1.2, pa.z);
          done = fitSolve('cheerP', px, pz, (c.bx + pa.x) / 2, (c.bz + pa.z) / 2, ty, pitch, 1.15, 1.8, true) >= 0;
          if (c.poFit === undefined) c.poFit = done;
        }
        if (!done) { fitCheerBoss(c, b, dy); fitSolve('cheer', px, pz, c.bx, c.bz, ty, pitch, 1.15, 1.7); }
      } else if (po) {   // mid-boss: the portal that just woke up
        pitch = 0.72;
        if (!c.pan) {   // Feza and the portal together (a far one may zoom out a little more)…
          fitPortal(po);
          const far = Math.hypot(po.x - px, po.z - pz) > 12;
          c.pan = fitSolve('portal', px, pz, po.x, po.z, ty, pitch, 1.1, far ? 1.75 : 1.6, true) < 0;
        }
        if (c.pan && c.t < CINE.back) {   // …or they don't fit: fly over to the portal, frame it whole, then back to Feza
          fitPortal(po); fitSolve('pan', po.x, po.z, po.x, po.z + 5, ty, pitch, 1.0, 1.35, false, PAN_F);   // (aim a little south of it if a subtitle needs the room)
          FIT.ox += po.x - px; FIT.oz += po.z - pz; k = 1.5;
        } else if (c.pan) { fit = false; k = 1.6; }   // (flying back: the plain follow view)
      } else {
        const cs = (L && L.crystalSpot) || { x: c.bx, z: c.bz - 5 };
        pitch = 0.7; fitAdd(cs.x, 0, cs.z); fitAdd(cs.x, 3.4, cs.z); fitAdd(cs.x - 1.2, 1.5, cs.z); fitAdd(cs.x + 1.2, 1.5, cs.z);
        fitSolve('crystal', px, pz, cs.x, cs.z, ty, pitch, 1.15, 1.7);
      }
      if (fit) { zoom = FIT.zoom; ox = FIT.ox; oz = FIT.oz; }
      else { pitch = S.playPitch; ty = 0.8; }
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
  // iPad keeps the original, display-driven requestAnimationFrame pacing; the limiter could skip a 120 Hz callback.
  // Other devices retain the requested 120 FPS ceiling.
  const nativeIPadRaf = /iPad/i.test(navigator.userAgent) || (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const frameRate = 120;
  // FPS meter for the parent: the "." key toggles it (no button; ?fps on the address starts it on, handy on an iPad).
  // Counts the frames really drawn, the average frame time, the automatic quality level and the longest frame of the window.
  const FPSM = { el: null, n: 0, t0: 0, worst: 0 };
  function toggleFps(on = !FPSM.el) {
    if (!on) { if (FPSM.el) FPSM.el.remove(); FPSM.el = null; return; }
    if (FPSM.el) return;
    FPSM.el = document.createElement('div'); FPSM.el.className = 'u-fps'; FPSM.el.textContent = 'FPS ölçülüyor…';
    document.body.appendChild(FPSM.el); FPSM.t0 = 0; FPSM.n = 0; FPSM.worst = 0;
  }
  function fpsTick(ts, raw) {
    const m = FPSM; if (!m.el) return;
    if (S.paused || S.menu) { m.el.textContent = 'FPS · mola'; m.t0 = 0; return; }   // nothing is drawn while a menu is open
    if (!m.t0) { m.t0 = ts; m.n = 0; m.worst = 0; return; }
    m.n++; if (raw > m.worst) m.worst = raw;
    const span = ts - m.t0;
    if (span < 500) return;
    const q = typeof QUALITY !== 'undefined' ? QUALITY : null;
    m.el.textContent = Math.round(m.n * 1000 / span) + ' FPS · ' + (span / m.n).toFixed(1) + ' ms'   // two lines: fits a narrow phone
      + (m.worst > 0.034 ? ' · en uzun ' + Math.round(m.worst * 1000) + ' ms' : '')
      + (q ? '\nçözünürlük ' + (+q.dpr.toFixed(2)) + '× · MSAA ' + q.msaa + '×' : '');
    m.t0 = ts; m.n = 0; m.worst = 0;
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!nativeIPadRaf) {
      const interval = 1000 / frameRate;
      S.frameAcc = (S.frameAcc || 0) + (S.lastRaf ? ts - S.lastRaf : interval); S.lastRaf = ts;
      if (S.frameAcc < interval - 2) return;
      // Keep timing debt/fractions, but discard whole missed frames after a loading stall.
      S.frameAcc -= interval;
      if (S.frameAcc >= interval) S.frameAcc %= interval;
    }
    const raw = S.lastFrame ? (ts - S.lastFrame) / 1000 : 1 / frameRate;
    S.lastFrame = ts;
    step(clamp(raw, 0, 0.05), raw, true);
    try { perfHz(raw); } catch (e) { warn('perfHz', e); }   // tablets: a 120 Hz screen switches on the 120 FPS profile
    fpsTick(ts, raw);
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
      if (S.cine) cineTick(dt);
    }
    if (HOLDS.length || S.menu === 'pause') holdTick();
    if (CORNERS.length) cornerTick();
    if (S.mode === 'title') titleVoiceTick(dt);
    if (S.bpq && S.bpq.length && S.t >= S.bpqT) { if (S.mode === 'end') { bossPortrait(S.bpq.shift()); S.bpqT = S.t + 0.35; } else S.bpq.length = 0; }
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
    if (Q.has('fps')) toggleFps(true);
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
    _S: S, _D: D, _TC: TITLE_CAM, _DC: DRG_CAM, _BF: BOSS_FIT, _FIT: FIT, _FL: FL,
    _dragon() { DRG.tried = false; DRG.url = DRG.cv = null; return dragonPortrait(); },   // tests: render the dragon portrait again
    _boss(t) { const R = bpRec(t); R.tried = false; R.url = R.cv = null; return bossPortrait(t); },   // tests: (re)render a boss portrait
    _bossHTML: t => bossHTML(t), _bossSvg: t => bossSvg(t), _savedZone: () => savedZone(), _goal: () => MV.goal, _mapTheme: () => MM.theme, _CINE: CINE,
    _step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) step(dt, dt, i === n - 1); },   // tests: deterministic frames
  };
})();

function boot() { return UI.boot(); }
if (!window.UI_MANUAL) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
