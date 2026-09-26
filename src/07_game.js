/* ── Oyun: oyuncu kontrolü, dövüş, düşman yapay zekâsı, mermiler, ganimet, seviye, boss, bölgeler, kayıt ──
   Bütün simülasyon burada; DOM'a dokunmaz (UI'nin işi). Sözleşme: src/SPEC.md → "GAME".
   Extras beyond the SPEC: events 'happy' {type,x,z,elite,boss} and 'equip' {item,slot}; GAME.boss, GAME.time,
   GAME.unequip(slot), addItem(item), cast(i), hurtPlayer(n,x,z,kb), heal(frac). newGame() called in state 'end' (victory
   screen) starts NEW GAME+; newGame({plus:false}) forces a fresh start. GAME.update(dt) should run in every state except
   'title' (it drives the respawn timer, portal shrink and victory cheer); a timeout fallback respawns if it is not called.
   How hard the game is: the DIFF table below (measured with the kid bots in test/fix_src_07_game_js_balance.html; the
   dragon fight alone in test/fix_src_07_game_js_boss.html: its hp follows Feza's damage, and every nap tires it).
   loadZone() pre-compiles and draws everything the zone will show (warmZone) while the loading fade covers the screen.
   Feza's request: every sword is a LIGHTSABER (slash + hit sparks + Feza's light take ITEMS.bladeColor; the blade ignites
   with 'saberOn' at every zone start and respawn), the Köstebek burrows (kind 'burrow', st.burrow 0..1; untargetable while
   underground), the Salyangoz blows soap bubbles and leaves a slime trail, the dragon breathes bubbles and glitter. */
const GAME = (() => {
  'use strict';

  // ── Tuning (forgiving on purpose: a 5-year-old must always make progress) ──
  const T = {
    heroR: 0.42, speed: 5.2, baseHp: 100,
    swing: 0.34, swingBig: 0.46, hitAt: 0.4, reach: 2.1, arc: 70 * Math.PI / 180, autoR: 2.0, crit: 0.1,
    autoDragR: 1.1, autoDragArc: 80 * Math.PI / 180,
    activeR: 36, hideR: 46, leash: 26, maxMelee: 4, maxRanged: 3, enemyMaxSpeed: 4.5,
    windMin: 0.5, iframes: 0.3, respawn: 3.2, regenDelay: 5, magnet: 2.5,
  };
  // ── Difficulty: the one place to tune how hard the game is (parent, 2nd round: "the creatures go happy at once,
  //    only the dragon was strong — make the whole game a bit harder") ──
  const DIFF = {
    hp: 3.4,            // normal enemy hp (was 2.6; zone 0 jelly: ~6 sword hits at the start)
    zoneHp: [1.15, 1, 0.9],   // × per zone: the castle is spongy enough through its own hpMult
    hpType: { golem: 0.7, salyangoz: 0.8 },   // the big slow golem and the slow bubble snail are tanky enough already
    eliteHp: 3.4,       // elites: hp × this (on top of hp; was 3)
    eliteDmg: 1.5,      // elites: damage × this (their hp went up: their punch stays)
    // A strong sword must not turn the creatures happy in one or two hits (lots of treasure, or the next adventure round):
    // above the usual sword damage for the zone (× the round's hp factor), creature hp grows with Feza's damage^k.
    power: { dmg: [20, 36, 50], k: 0.8 },
    bossHp: 8,          // dragon hp at most (a button-masher with a good sword needs about a minute)
    bossHpPerDmg: 175, bossHpMin: 0.58,  // …sized to Feza's sword when the fight starts: 175 × P.dmg, at least 58 % of the max (were 230 / 70 %:
                                         //    the skills wait longer now, so the fight stays about as long as before, ~1 minute)
    bossDmg: 0.9,       // dragon damage (the fight is long now: a careless kid should nap only once or twice)
    bossNap: { dmg: 0.75, dmgMin: 0.55, hp: 0.08 },   // each nap in the dragon fight tires it: damage ×0.75 (down to ×0.55), −8 % hp
    dmg: 1.8,           // enemy damage (was 1.5)
    zoneDmg: [1.7, 1.2, 1],   // × per zone: the forest must bite a little too (a potion now and then)
    atkCd: 0.75,        // enemy attack cooldown (was 0.85; wind-ups unchanged, always ≥ T.windMin)
    xp: 1.1,            // xp per enemy (level pace stays about the same although fights are longer)
    heart: 0.1,         // a heart heals this fraction of max hp (was 0.12)
    heartDrop: 0.65,    // heart drop chances × this (was 0.75)
    potions: 2,         // potions at the start of a new game (max stays 5)
    regenFight: 0.012, regenCalm: 0.05,   // hp fraction per second, T.regenDelay s after the last hit (was 0.02 / 0.05)
  };
  // ── Treasure (parent: "too many items, the bag fills up with the same or similar things") ──
  // The bag keeps ONE piece per look (slot + base): a stronger copy takes the old one's place. Drops are rarer and look
  // for something Feza doesn't have yet; a roll that would only repeat what he has becomes a few coins instead.
  const DROP = {
    normal: 0.02,       // item chance from a normal enemy (was 0.05)
    elite: 0.5,         // from an elite (was: always)
    chest: 0.6,         // from a small chest (was: always); a big chest gives one (was two), the dragon one (was two)
    tries: 6,           // rolls looking for a new look (or a clearly stronger copy of one he has)
    upgrade: 1.3,       // a copy of a look he has, same rarity, must be this much stronger (and beat what he wears) to drop at all
  };
  // v2 (parent, 2nd round: "start Feza over with the new rules"): the new key starts every device from scratch once;
  // the old 'fezaKotulereKarsi.v1' save stays untouched on the device as a leftover backup. Keep in sync with 09_ui.js.
  const SAVE_KEY = 'fezaKotulereKarsi.v2';
  const WORDS = ['Pof!', 'Bam!', 'Vuuş!', 'Pat!', 'Güm!', 'Tak!', 'Hop!'];
  // Lightsaber blade colours (fallback when ITEMS.bladeColor is missing; gokkusagi cycles through the rainbow).
  const BLADE_COL = { tahta: '#c8f4ff', demir: '#3f9dff', kristal: '#3dff66', ates: '#ff3344', yildiz: '#b455ff' };
  const SHOT_KIND = { mantar: 'spore', salyangoz: 'bubble', hayalet: 'ghost', atescik: 'fire', ejderha: 'dragonfire' };
  const SHOT_COL = { spore: '#b9f07a', bubble: '#bfe6ff', ghost: '#bfe3ff', fire: '#ff9a3c', dragonfire: '#e46bff' };   // dragonfire = the dragon's pink bubbles
  const ELITE_AD = { kostebek: 'Kocaman Köstebek', salyangoz: 'Kocaman Salyangoz' };
  const FIRST_LINE = { kostebek: 'ilk_kostebek', salyangoz: 'ilk_salyangoz' };   // said once, the first time that type notices Feza
  const RAR_COL = ['#f4f4f4', '#5aa8ff', '#ffd23f', '#ff8a1c'];
  const VARIANTS = { jole: ['green', 'pink', 'blue', 'purple'] };
  // Fallback enemy stats (EDEF overrides every field it defines).
  const DEF0 = {
    jole:    { ad: 'Jöle', hp: 22, dmg: 5, speed: 2.6, r: 0.5, height: 0.8, xp: 10, gold: 3, kind: 'melee', atkRange: 0.9, atkCd: 1.6, windup: 0.6, aggro: 8.5 },
    mantar:  { ad: 'Huysuz Mantar', hp: 26, dmg: 6, speed: 1.8, r: 0.5, height: 1.0, xp: 12, gold: 3, kind: 'ranged', atkRange: 7, atkCd: 2.4, windup: 0.7, aggro: 9 },
    yarasa:  { ad: 'Yarasa', hp: 12, dmg: 4, speed: 4.4, r: 0.45, height: 0.6, xp: 8, gold: 2, kind: 'melee', atkRange: 0.9, atkCd: 1.5, windup: 0.5, fly: true, hover: 0.9, aggro: 10 },
    goblin:  { ad: 'Haylaz Goblin', hp: 38, dmg: 8, speed: 2.9, r: 0.55, height: 1.2, xp: 16, gold: 5, kind: 'melee', atkRange: 1.1, atkCd: 1.8, windup: 0.65, aggro: 9 },
    kostebek: { ad: 'Köstebek', hp: 30, dmg: 7, speed: 3.2, r: 0.5, height: 0.9, xp: 14, gold: 1, kind: 'burrow', atkRange: 1.4, atkCd: 1.6, windup: 0.6, aggro: 9 },
    salyangoz: { ad: 'Salyangoz', hp: 40, dmg: 6, speed: 1.2, r: 0.6, height: 0.9, xp: 16, gold: 1, kind: 'ranged', atkRange: 6.5, atkCd: 2.6, windup: 0.7, aggro: 9,
      shot: { kind: 'bubble', speed: 4.5, r: 0.35 } },
    hayalet: { ad: 'Hayalet', hp: 30, dmg: 7, speed: 2.2, r: 0.5, height: 1.1, xp: 14, gold: 4, kind: 'ranged', atkRange: 6.5, atkCd: 2.6, windup: 0.75, fly: true, hover: 0.35, aggro: 9 },
    golem:   { ad: 'Kaya Devi', hp: 140, dmg: 14, speed: 1.5, r: 1.1, height: 2.4, xp: 45, gold: 12, kind: 'slam', atkRange: 2.6, atkCd: 2.8, windup: 1.0, aggro: 9 },
    asker:   { ad: 'Teneke Asker', hp: 55, dmg: 10, speed: 2.6, r: 0.55, height: 1.3, xp: 22, gold: 6, kind: 'melee', atkRange: 1.2, atkCd: 1.9, windup: 0.7, aggro: 9 },
    atescik: { ad: 'Ateşçik', hp: 32, dmg: 8, speed: 2.4, r: 0.5, height: 0.9, xp: 16, gold: 4, kind: 'ranged', atkRange: 7, atkCd: 2.5, windup: 0.7, fly: true, hover: 0.3, aggro: 9 },
    ejderha: { ad: 'Huysuz Ejderha', hp: 1600, dmg: 16, speed: 1.6, r: 2.2, height: 4.5, xp: 600, gold: 150, kind: 'boss', atkRange: 3, atkCd: 1.5, windup: 0.8, aggro: 14 },
  };

  // ── Other modules are optional (tests, half-wired builds): every call is guarded ──
  const warned = {};
  function warnOnce(k, e) { if (!warned[k]) { warned[k] = 1; console.warn('[GAME] ' + k, e); } }
  function fx(fn, a, b, c, d, e, f, g, h, i) {
    if (typeof FX === 'undefined' || !FX || typeof FX[fn] !== 'function') return null;
    try { return FX[fn](a, b, c, d, e, f, g, h, i); } catch (err) { warnOnce('FX.' + fn, err); return null; }
  }
  function aud(fn, a, b) {
    if (typeof AUD === 'undefined' || !AUD || typeof AUD[fn] !== 'function') return null;
    try { return AUD[fn](a, b); } catch (err) { warnOnce('AUD.' + fn, err); return null; }
  }
  const sfx = (name, o) => aud('sfx', name, o);
  const say = (key, prio = 1, o) => aud('say', key, o ? Object.assign({ prio }, o) : { prio }) || 0;
  const hasLine = key => typeof AUD !== 'undefined' && !!AUD && !!AUD.LINES && !!AUD.LINES[key];
  const burst = (kind, x, y, z, o) => fx('burst', kind, x, y, z, o);
  const ftext = (x, y, z, text, style) => fx('floatText', x, y, z, text, style);
  const shake = a => fx('shake', a);
  const remove = h => { if (h && typeof h.remove === 'function') { try { h.remove(); } catch (err) { warnOnce('remove', err); } } };
  const hasLevel = () => typeof LEVEL !== 'undefined' && !!LEVEL;
  const zones = () => (typeof ZONES !== 'undefined' && ZONES && ZONES.length ? ZONES : null);
  function zdef(i = P.zone) {
    const Z = zones();
    return (Z && Z[i]) || { id: 'z' + i, ad: 'Bölge', line: null, music: null, hpMult: 1, dmgMult: 1, xpMult: 1, gold: 1, ilvl: 1 + i * 3 };
  }
  const defCache = {};
  function edef(type) {
    let d = defCache[type];
    if (!d) {
      const src = (typeof EDEF !== 'undefined' && EDEF && EDEF[type]) || {};
      d = defCache[type] = Object.assign({}, DEF0[type] || DEF0.jole, src);
    }
    return d;
  }
  const rarCol = r => (typeof ITEMS !== 'undefined' && ITEMS.RARITY && ITEMS.RARITY[r] && ITEMS.RARITY[r].color) || RAR_COL[r] || '#fff';

  // ── Events ──
  const handlers = {};
  function on(evt, fn) { (handlers[evt] || (handlers[evt] = [])).push(fn); }
  function emit(evt, data = {}) {
    const hs = handlers[evt];
    if (hs) for (let i = 0; i < hs.length; i++) { try { hs[i](data); } catch (err) { console.error('[GAME] event ' + evt, err); } }
  }

  // ── State ──
  const xpFor = lvl => 40 + 25 * lvl + 5 * lvl * lvl;
  const P = {
    pos: new THREE.Vector3(), face: Math.PI, hp: T.baseHp, maxHp: T.baseHp, lvl: 1, xp: 0, xpNext: xpFor(1), gold: 0,
    potions: DIFF.potions, maxPotions: 5, dmg: 8, armor: 0, speed: T.speed, equip: { weapon: null, hat: null, cape: null }, bag: [],
    skills: [], spin: 0, shield: 0, dead: false, checkpoint: { x: 0, z: 0 }, zone: 0, ng: 0, god: false,
  };
  // Controller (input intent, swing, timers). Private.
  const C = {
    drag: false, mode: null, sx: 0, sy: 0, downSx: 0, downSy: 0, keyX: 0, keyZ: 0,
    hasT: false, tx: 0, tz: 0, targetE: null, targetObj: null,
    vel: 0, mdx: 0, mdz: 1, swing: null, swingDir: 1, swingFace: null, combo: 0, lastSwingEnd: -9, queued: false,
    lunge: { vx: 0, vz: 0, t: 0 }, kbx: 0, kbz: 0, castT: -1, hurtT: 0, invuln: 0, idleT: 0, cheerT: 0,
    lastHurt: -99, playT: 0, deadT: 0, deathX: 0, deathZ: 0, transT: 0, stepT: 0, stepSide: 1,
    tgtRef: null, tgtBest: 1e9, tgtStall: 0, blockT: 0, waitT: 0,   // walk-to-target watchdogs
  };
  let F = {};                       // story flags (lines said once, intro done…)
  let ZF = {};                      // per-zone flags (reset on every zone load)
  let finale = false;               // dragon defeated: only story lines from now on
  let pathS = 0, pathCum = null;    // Feza's progress along L.path (auto-lights checkpoints he walks past)
  let L = null, H = null, gt = 0, hitstop = 0, inited = false;
  let baseScale = 1;
  const enemies = [], dying = [], projectiles = [], coins = [], loot = [], timers = [];
  let sleepers = [], boss = null, crystal = null;
  let actT = 0, tokT = 0, flowT = 0, flowCx = -1e9, flowCz = -1e9, flowAt = -9;
  let lastKocaman = -99, lastCanAz = -99, lastPraise = -99, lastPotionMsg = -99, lastSoft = -9, npcTalkUntil = -1, npcTalkAt = -99;
  const cheers = [];
  // Comic words (Pof!, Bam!, Hop!…) share one slot: at most one every WORD_GAP s of game time, so a crowd fight doesn't
  // bury the screen in text. 08_skills.js asks through GAME.wordOK() too. Never limited: the '!' spotted marker,
  // elite names and 'Seviye N!'.
  const WORD_GAP = 1.5;
  let wordAt = -99;
  function wordOK() {
    if (gt >= wordAt && gt - wordAt < WORD_GAP) return false;
    wordAt = gt; return true;   // allowed: the slot is taken now
  }
  const STATS = { windup: 0, strike: 0, strikeHit: 0, cancel: 0, shots: 0, freezes: 0, casts: 0 };
  let goldAcc = 0, goldAccT = 0, coinCombo = 0, coinComboT = 0;
  let saveAt = -1, lastSave = -99;
  const HST = { move: 0, attack: -1, swingDir: 1, cast: -1, spin: false, hurt: 0, dead: false, cheer: false, idleT: 0 };
  const _v = new THREE.Vector3(), _scr = { x: 0, y: 0, vis: false }, _tp = { x: 0, z: 0 }, _m4 = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

  // ── Level helpers ──
  function moveXZ(o, dx, dz, r) {   // o = {x,z} or Vector3; sub-steps so fast knockbacks never tunnel through walls
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.3));
    for (let i = 0; i < n; i++) {
      if (L && hasLevel() && LEVEL.move) LEVEL.move(L, o, dx / n, dz / n, r);
      else { o.x += dx / n; o.z += dz / n; }
    }
  }
  function moveE(e, dx, dz) { _tp.x = e.x; _tp.z = e.z; moveXZ(_tp, dx, dz, e.r * 0.9); e.x = _tp.x; e.z = _tp.z; }
  const isFloor = (x, z) => !(L && hasLevel() && LEVEL.isFloor) || !!LEVEL.isFloor(L, x, z);
  const los = (x0, z0, x1, z1) => !(L && hasLevel() && LEVEL.los) || !!LEVEL.los(L, x0, z0, x1, z1);
  const circleFree = (x, z, r) => !(L && hasLevel() && LEVEL.circleFree) || !!LEVEL.circleFree(L, x, z, r);

  // ── Shared visual resources (created in init) ──
  const R = {};
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  }
  function decalMat(tex, color, k, blend = THREE.AdditiveBlending) {
    return new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(k), transparent: true, blending: blend, depthWrite: false, fog: false });
  }
  function decal(mat, s) {
    const m = new THREE.Mesh(R.plane, mat); m.rotation.x = -Math.PI / 2; m.scale.setScalar(s); m.renderOrder = 2; return m;
  }
  function makeResources() {
    R.plane = new THREE.PlaneGeometry(1, 1);
    R.ring = canvasTex(128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.16)'); gr.addColorStop(0.76, 'rgba(255,255,255,1)');
      gr.addColorStop(0.86, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    R.disc = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    // Target reticle: four soft arcs with little arrow tips.
    R.reticle = canvasTex(128, (g, s) => {
      g.translate(s / 2, s / 2); g.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        g.strokeStyle = pass ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.28)'; g.lineWidth = pass ? 7 : 16;
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.28; g.beginPath(); g.arc(0, 0, 50, a, a + Math.PI / 2 - 0.56); g.stroke(); }
      }
      g.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); g.beginPath(); g.moveTo(0, -36); g.lineTo(-7, -46); g.lineTo(7, -46); g.closePath(); g.fill(); g.restore(); }
    });
    R.markMat = decalMat(R.ring, '#8fe8ff', 2.2);
    R.markDot = decalMat(R.disc, '#bff4ff', 1.6);
    R.selMat = decalMat(R.reticle, '#ff8a4a', 2.4);
    R.auraMat = decalMat(R.ring, '#ffc93c', 2.2);
    R.auraGlow = decalMat(R.disc, '#ffb42a', 0.7);
    R.blobMat = new THREE.MeshBasicMaterial({ map: R.disc, color: 0x1a1020, transparent: true, opacity: 0.42, depthWrite: false });
    R.lootRing = {};   // by colour
    R.warmEq = {};     // item bases Feza has already worn in a warm-up
    R.marker = new THREE.Group();
    R.marker.add(decal(R.markMat, 1), decal(R.markDot, 0.35));
    R.marker.children.forEach(c => { c.position.y = 0.045; });
    R.marker.visible = false; R.markerT = 0;
    R.sel = decal(R.selMat, 1); R.sel.position.y = 0.05; R.sel.visible = false;
    scene.add(R.marker, R.sel);
    makeCoins();
    makeBars();
  }
  function lootRingMat(color) { return R.lootRing[color] || (R.lootRing[color] = decalMat(R.ring, color, 1.5)); }

  // Coins: one instanced mesh, lathe profile with a raised rim (reads well from 16 m away).
  const COIN_MAX = 320;
  function makeCoins() {
    const half = [[0, 0.034], [0.05, 0.031], [0.075, 0.022], [0.108, 0.02], [0.122, 0.042], [0.152, 0.043], [0.17, 0.028], [0.176, 0]];
    const pr = half.concat(half.slice(0, -1).reverse().map(p => [p[0], -p[1]]));
    const geo = new THREE.LatheGeometry(pr.map(p => new THREE.Vector2(p[0], p[1])).reverse(), 32);
    geo.rotateX(Math.PI / 2); geo.scale(1.08, 1.08, 1.08);
    const mat = rimify(stdMat({ color: '#ffd84a', metalness: 0.72, roughness: 0.27, emissive: '#c98a00', emissiveIntensity: 0.42 }), '#fff3b0', 0.55, 2.2);
    R.coins = new THREE.InstancedMesh(geo, mat, COIN_MAX);
    R.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    R.coins.count = 0; R.coins.frustumCulled = false; R.coins.castShadow = true;
    scene.add(R.coins);
  }
  // Heart pickup: puffy extruded heart, glossy candy red.
  function heartGeo() {
    if (R.heartGeo) return R.heartGeo;
    const s = new THREE.Shape();
    s.moveTo(5, 5); s.bezierCurveTo(5, 5, 4, 0, 0, 0); s.bezierCurveTo(-6, 0, -6, 7, -6, 7);
    s.bezierCurveTo(-6, 11, -3, 15.4, 5, 19); s.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
    s.bezierCurveTo(16, 7, 16, 0, 10, 0); s.bezierCurveTo(7, 0, 5, 5, 5, 5);
    const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelThickness: 2.6, bevelSize: 2.2, bevelSegments: 5, curveSegments: 18 });
    g.center(); g.rotateZ(Math.PI); g.scale(0.024, 0.024, 0.024); g.computeVertexNormals();
    R.heartMat = rimify(stdMat({ color: '#f5142f', roughness: 0.18, metalness: 0.05, emissive: '#d0001e', emissiveIntensity: 0.3 }), '#ff9aa8', 0.32, 2.8);
    return (R.heartGeo = g);
  }
  // Red potion: glowing liquid inside a glass flask with a cork and a gold band.
  function potionTpl() {
    if (R.potion) return R.potion;
    const g = new THREE.Group();
    const liq = new Kit();
    liq.add(G.sphere(24), '#ff2d55', [0, 0.17, 0], 0, [0.15, 0.13, 0.15]);
    liq.add(G.cyl(1, 1, 14), '#ff2d55', [0, 0.3, 0], 0, [0.045, 0.1, 0.045]);
    const liquid = new THREE.Mesh(liq.build(), vcMat({ roughness: 0.15, emissive: '#e8002e', emissiveIntensity: 0.75 }));
    const gl = new Kit();
    gl.add(G.sphere(24), '#ffffff', [0, 0.17, 0], 0, 0.17);
    gl.add(G.cyl(1, 1, 16, true), '#ffffff', [0, 0.33, 0], 0, [0.06, 0.14, 0.06]);
    const glass = new THREE.Mesh(gl.build(), stdMat({ color: '#ffffff', transparent: true, opacity: 0.2, roughness: 0.03, metalness: 0.1, depthWrite: false }));
    const ck = new Kit();
    ck.add(G.cyl(0.9, 1, 12), '#b07a4a', [0, 0.43, 0], 0, [0.058, 0.08, 0.058]);
    ck.add(G.torus(TAU, 0.3, 18), '#ffcf4a', [0, 0.37, 0], [Math.PI / 2, 0, 0], 0.065);
    const cork = new THREE.Mesh(ck.build(), vcMat({ roughness: 0.5, metalness: 0.3 }));
    g.add(liquid, glass, cork);
    g.scale.setScalar(1.55);
    return (R.potion = g);
  }

  // Enemy health bars: ONE instanced billboard mesh, SDF pill drawn in the shader (gold frame for elites).
  const BAR_MAX = 48;
  function makeBars() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const aBar = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX * 4), 4);
    aBar.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBar', aBar);
    const aFade = new THREE.InstancedBufferAttribute(new Float32Array(BAR_MAX).fill(1), 1);   // dims a bar that covers Feza
    aFade.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFade', aFade);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uSize: { value: new THREE.Vector2(0.95, 0.15) },
        cFill: { value: new THREE.Color('#ff6b86') }, cFill2: { value: new THREE.Color('#e02a55') }, cTrail: { value: new THREE.Color('#fff1b8') },
        cBack: { value: new THREE.Color('#2a1638') }, cEdge: { value: new THREE.Color('#150b1d') }, cGold: { value: new THREE.Color('#ffd44a').multiplyScalar(1.3) },
        cEFill: { value: new THREE.Color('#ffae3c') }, cEFill2: { value: new THREE.Color('#ff6a1a') },
      },
      vertexShader: `attribute vec4 aBar; attribute float aFade; uniform vec2 uSize; varying vec2 vUv; varying vec4 vBar; varying vec2 vSize; varying float vFade;
        void main() {
          vUv = uv; vBar = aBar; vFade = aFade;
          vec2 size = uSize * vec2(aBar.w, aBar.z > 0.5 ? 1.25 : 1.0); vSize = size;
          vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          c.xy += position.xy * (size + 0.07);
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: `uniform vec3 cFill, cFill2, cTrail, cBack, cEdge, cGold, cEFill, cEFill2; varying vec2 vUv; varying vec4 vBar; varying vec2 vSize; varying float vFade;
        float sdPill(vec2 p, vec2 b) { float r = b.y; vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        void main() {
          vec2 p = (vUv - 0.5) * (vSize + 0.07);
          float d = sdPill(p, vSize * 0.5);
          float aa = max(fwidth(d), 1e-4);
          float halo = (1.0 - smoothstep(0.012, 0.03, d)) * 0.55;
          float alpha = 1.0 - smoothstep(-aa, aa, d);
          if (alpha + halo < 0.01) discard;
          if (alpha < 0.5) { gl_FragColor = vec4(vec3(1.0, 0.96, 0.9), halo * (1.0 - alpha) * vFade);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            return; }
          float bw = vSize.y * (vBar.z > 0.5 ? 0.24 : 0.2);
          float inner = 1.0 - smoothstep(-aa, aa, d + bw);
          float x = (p.x + vSize.x * 0.5 - bw) / (vSize.x - 2.0 * bw);
          float y = (p.y + vSize.y * 0.5 - bw) / (vSize.y - 2.0 * bw);
          float ax = max(fwidth(x), 1e-4);
          bool el = vBar.z > 0.5;
          vec3 fill = mix(el ? cEFill2 : cFill2, el ? cEFill : cFill, smoothstep(0.0, 0.9, y));
          fill += vec3(0.45) * smoothstep(0.55, 0.9, y);
          vec3 col = mix(cBack, cTrail, 1.0 - smoothstep(vBar.y - ax, vBar.y + ax, x));
          col = mix(col, fill, 1.0 - smoothstep(vBar.x - ax, vBar.x + ax, x));
          vec3 edge = el ? mix(cGold * 0.55, cGold, smoothstep(-0.5, 0.5, p.y / vSize.y)) : cEdge;
          col = mix(edge, col, inner);
          gl_FragColor = vec4(col, alpha * mix(1.0, 0.93, inner) * vFade);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    R.bars = new THREE.InstancedMesh(geo, mat, BAR_MAX);
    R.bars.count = 0; R.bars.frustumCulled = false; R.bars.renderOrder = 40;
    R.barAttr = aBar; R.barFade = aFade;
    scene.add(R.bars);
  }
  // Elite name tag (few elites → a small canvas sprite each).
  function nameTag(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.font = '900 54px "Avenir Next Rounded", "Avenir Next", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 14; g.strokeStyle = 'rgba(40,16,50,0.92)'; g.strokeText(text, 256, 50);
    const gr = g.createLinearGradient(0, 22, 0, 78); gr.addColorStop(0, '#fff6c2'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#ff9f1c');
    g.fillStyle = gr; g.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, fog: false }));
    sp.scale.set(2.6, 0.49, 1); sp.renderOrder = 41;
    return sp;
  }

  // Fallback visuals when a module is missing (keeps the game alive in half-wired builds).
  function fallbackEnemy(type, elite) {
    const root = new THREE.Group(), mat = stdMat({ color: '#7bd46a', roughness: 0.3 });
    const body = new THREE.Mesh(G.sphere(20), mat); body.scale.set(0.5, 0.42, 0.5); body.position.y = 0.42; root.add(body);
    if (elite) root.scale.setScalar(1.4);
    return { root, height: 0.85 * (elite ? 1.4 : 1), radius: 0.5 * (elite ? 1.4 : 1), anim() {}, setMood() {},
      flash(a) { mat.emissive.setScalar(a * 0.6); }, setTint() {}, muzzle() { return new THREE.Vector3(root.position.x, 0.6, root.position.z); },
      dispose() { mat.dispose(); } };
  }
  function fallbackHero() {
    const root = new THREE.Group(), m = new THREE.Mesh(G.capsule(1, 12), stdMat({ color: '#f4cdb2' }));
    m.scale.set(0.3, 0.45, 0.3); m.position.y = 0.75; root.add(m);
    return { root, update() {}, setEquip() {}, tip: new THREE.Vector3(), hand: new THREE.Vector3(), setXray() {} };
  }

  // ── Stats ──
  function recalcStats() {
    const w = P.equip.weapon, h = P.equip.hat, c = P.equip.cape;
    const old = P.maxHp;
    P.maxHp = Math.round(T.baseHp + 12 * (P.lvl - 1) + 5 * (h ? h.power : 0));
    P.dmg = 8 + 2 * (P.lvl - 1) + (w ? w.power : 0);
    P.armor = Math.min(45, c ? c.power : 0);
    P.speed = T.speed * (1 + 0.04 * (c ? c.rarity : 0));
    if (P.maxHp > old) P.hp += P.maxHp - old;
    P.hp = Math.min(P.hp, P.maxHp);
    P.xpNext = xpFor(P.lvl);
  }
  const heroDamageNow = () => Math.max(1, Math.round(P.dmg * frand(0.9, 1.12)));
  const ilvlNow = () => zdef().ilvl + P.ng * 3 + (Math.random() < 0.35 ? 1 : 0);

  function buildSkills() {
    const list = typeof SKILLS !== 'undefined' && Array.isArray(SKILLS) ? SKILLS : [];
    const old = GAME.skills || [];
    GAME.skills.length = 0;
    list.forEach((def, i) => GAME.skills.push({ def, unlocked: !!(old[i] && old[i].unlocked), cd: 0, cdMax: def.cd || 1 }));
    P.skills = GAME.skills;
  }
  function resetPlayer() {
    P.lvl = 1; P.xp = 0; P.gold = 0; P.potions = DIFF.potions; P.ng = 0; P.dead = false; P.spin = 0; P.shield = 0;
    const st = typeof ITEMS !== 'undefined' && ITEMS.starter ? ITEMS.starter() : { weapon: null, hat: null, cape: null };
    P.equip = { weapon: st.weapon || null, hat: st.hat || null, cape: st.cape || null };
    P.bag = [P.equip.weapon, P.equip.hat, P.equip.cape].filter(Boolean);
    for (const s of GAME.skills) { s.unlocked = false; s.cd = 0; }
    F = { zl: {}, kapi: {} };
    recalcStats(); P.hp = P.maxHp;
    if (H) H.setEquip(P.equip);
  }

  // ── Zone loading ──
  function removeObj(o) { if (o && o.parent) o.parent.remove(o); }
  function clearWorld() {
    for (const e of enemies) dropEnemy(e);
    for (const e of dying) dropEnemy(e);
    enemies.length = 0; dying.length = 0; sleepers = []; boss = null;
    for (const p of projectiles) killProjectileObj(p);
    projectiles.length = 0; coins.length = 0; if (R.coins) R.coins.count = 0;
    for (const o of loot) { removeObj(o.obj); remove(o.beam); }
    loot.length = 0; timers.length = 0;
    if (crystal) {   // EMODEL.crystal() keeps its disposer on userData
      removeObj(crystal.obj); remove(crystal.beam);
      crystal.obj.traverse(o => { if (o.userData && typeof o.userData.dispose === 'function') { try { o.userData.dispose(); } catch (err) { warnOnce('crystal.dispose', err); } } });
      crystal = null;
    }
    finale = false; ZF = {}; pathS = 0; pathCum = null;
    C.cheerT = 0; C.castT = -1;
    C.targetE = null; C.targetObj = null; C.hasT = false; C.drag = false; C.swing = null; C.queued = false; C.vel = 0;
    C.lunge.t = 0; C.kbx = C.kbz = 0;
    if (R.marker) { R.marker.visible = false; R.sel.visible = false; R.bars.count = 0; }
    fx('clear');
    if (typeof SKILLS_clear === 'function') { try { SKILLS_clear(); } catch (err) { warnOnce('SKILLS_clear', err); } }
  }
  function placeHero(x, z, face) {
    P.pos.set(x, 0, z); P.face = face;
    if (H) { H.root.position.copy(P.pos); H.root.rotation.y = face; H.root.scale.setScalar(baseScale); }
    if (typeof cameraFollow === 'function') cameraFollow(x, CAM.target.y, z, 0, true);
    if (typeof lightsFollow === 'function') lightsFollow(x, z);
  }
  function loadZone(i, o = {}) {
    if (!inited) init();
    const Z = zones();
    i = clamp(i | 0, 0, Z ? Z.length - 1 : 0);
    const title = !!o.title;
    clearWorld();
    if (L && hasLevel() && LEVEL.dispose) { try { LEVEL.dispose(L); } catch (err) { warnOnce('LEVEL.dispose', err); } }
    L = GAME.L = null;
    const seed = Q.has('tohum') ? ((parseInt(Q.get('tohum'), 10) || 1) + i * 7919) >>> 0 : (Math.random() * 4294967295) >>> 0;
    if (hasLevel()) {
      L = LEVEL.generate(i, seed);
      LEVEL.build(L);
      GAME.L = L;
      fezaLightBase();   // the theme's own hero light (LEVEL.build set it); the lightsaber tint is added on top every frame
      if (!R.warmed) { R.warmed = true; fx('warm'); }   // compile lit FX materials once, with real scene lights
    }
    P.zone = i;
    const st = (L && L.start) || { x: 0, z: 0 };
    P.checkpoint = { x: st.x, z: st.z };
    placeHero(st.x, st.z, 0);   // facing the camera: the kid sees Feza's face
    P.dead = false; C.deadT = 0; C.invuln = 1;
    if (L) L._title = title;
    if (!title) populate();
    warmZone(i, title);   // the UI's loading fade still covers the screen
    GAME.state = title ? 'title' : 'play';
    emit('zone', { index: i, name: zdef(i).ad, title });
    if (!title) enterZoneStory(i);
    return L;
  }
  // Pre-compile AND draw once everything this zone will show later (enemy types + elites + boss, pickups, name tag,
  // bars, item models, projectiles, telegraphs, skill meshes), so no shader compile / first-draw stall hits mid-fight.
  // compile() alone is not enough on ANGLE/Metal: the pipeline is only created at the first real draw.
  const WARM_E = {};   // one live enemy instance per type(+elite): keeps their programs alive (EMODEL does the same)
  function warmZone(i, title) {
    if (typeof renderer === 'undefined' || !renderer || !L) return;
    const t0 = performance.now();
    const Z = zdef(i), types = new Set(Object.keys(Z.enemies || {})), elites = new Set(Z.elites || []);
    for (const s of L.spawns || []) { types.add(s.type); if (s.elite) elites.add(s.type); }
    if (Z.boss || L.boss) { types.add(Z.boss || 'ejderha'); types.add('yarasa'); }
    const tmp = new THREE.Group(); tmp.name = 'gameWarm';
    const hasE = typeof EMODEL !== 'undefined' && EMODEL && EMODEL.build;
    if (hasE && EMODEL.warm) { try { EMODEL.warm([...types], false); } catch (err) { warnOnce('EMODEL.warm', err); } }   // geometry caches
    if (hasE) for (const t of types) for (const el of [false, true]) {
      if (el && !elites.has(t)) continue;
      const k = t + (el ? '*' : '');
      if (!WARM_E[k]) { try { WARM_E[k] = EMODEL.build(t, { variant: VARIANTS[t] ? VARIANTS[t][0] : undefined, elite: el }); } catch (err) { warnOnce('warm ' + k, err); } }
      if (WARM_E[k] && WARM_E[k].root) tmp.add(WARM_E[k].root);
    }
    if (hasE && (Z.boss || L.boss)) {   // the finale: neşe kristali
      try {
        if (!WARM_E._crystal && EMODEL.crystal) WARM_E._crystal = { root: EMODEL.crystal() };
      } catch (err) { warnOnce('warm finale', err); }
      if (WARM_E._crystal && WARM_E._crystal.root) tmp.add(WARM_E._crystal.root);
    }
    const temp = [];   // FX handles to release after the draw
    try {
      const hm = new THREE.Mesh(heartGeo(), R.heartMat); hm.castShadow = true; tmp.add(hm);
      const pot = potionTpl(); tmp.add(pot);
      tmp.add(decal(lootRingMat('#ff4d7a'), 1), decal(R.blobMat, 1), decal(R.auraGlow, 1), decal(R.auraMat, 1), decal(R.markMat, 1), decal(R.selMat, 1));
      if (!R.warmTag) R.warmTag = nameTag('Kocaman');
      tmp.add(R.warmTag);
      if (typeof ITEMS !== 'undefined' && ITEMS.make && ITEMS.BASES) {
        for (const slot of ['weapon', 'hat', 'cape']) for (const b of ITEMS.BASES[slot] || []) {
          if (!b.legendary && b.minLvl > Z.ilvl + 4) continue;
          try { tmp.add(itemModel(ITEMS.make(slot, b.id, b.legendary ? 3 : 2, Z.ilvl || 1))); } catch (err) { warnOnce('warm item', err); }
        }
      }
      const kinds = new Set(['star']);
      for (const t of types) { const d = edef(t); if (d.kind === 'ranged' || d.kind === 'boss') kinds.add((d.shot && d.shot.kind) || SHOT_KIND[t] || 'spore'); }
      if (typeof FX !== 'undefined' && FX) {
        for (const k of kinds) { const o = fx('projectile', k, SHOT_COL[k]); if (o) { tmp.add(o); temp.push({ proj: o }); } }
        const tx = CAM.target.x, tz = CAM.target.z;
        temp.push(fx('telegraph', tx, tz, 2, 1, '#ff4a3a'), fx('telegraphCone', tx, tz, 0, 1.5, 2.5, 1, '#ff5a44'), fx('beam', tx, tz, '#ffd23f', 3));
      }
    } catch (err) { warnOnce('warmZone', err); }
    tmp.position.copy(CAM.target); tmp.position.y = 0;
    const cull = [];
    tmp.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints) { cull.push(o, o.frustumCulled); o.frustumCulled = false; } });
    if (typeof SKILLS_update === 'function') { try { SKILLS_update(0); } catch (err) { warnOnce('SKILLS_update', err); } }   // builds its meshes
    const sk = scene.getObjectByName('skills'), skVis = [];   // 08_skills' root: draw its hidden meshes once too
    if (sk) sk.traverse(o => { if (o !== sk) { skVis.push(o, o.visible); o.visible = true; } });
    const coinsN = R.coins.count, barsN = R.bars.count;
    _m4.makeTranslation(CAM.target.x, 0.5, CAM.target.z);
    R.coins.setMatrixAt(0, _m4); R.coins.count = Math.max(1, coinsN); R.coins.instanceMatrix.needsUpdate = true;
    R.bars.setMatrixAt(0, _m4); R.bars.count = Math.max(1, barsN); R.bars.instanceMatrix.needsUpdate = true;
    scene.add(tmp);
    // Feza wearing each item this zone can drop (FEZA builds + caches the worn models): one real draw per outfit, since
    // the worn cape's shadow-depth shader differs per cape and compile() never builds shadow programs.
    const combos = [null];
    if (H && H.setEquip && typeof ITEMS !== 'undefined' && ITEMS.make && ITEMS.BASES) {
      const lists = {};
      for (const slot of ['weapon', 'hat', 'cape']) {
        lists[slot] = (ITEMS.BASES[slot] || []).filter(b => (b.legendary || b.minLvl <= (Z.ilvl || 1) + 4) && !R.warmEq[slot + b.id])
          .map(b => { R.warmEq[slot + b.id] = true; return ITEMS.make(slot, b.id, b.legendary ? 3 : 2, Z.ilvl || 1); });
      }
      const n = Math.max(lists.weapon.length, lists.hat.length, lists.cape.length);
      for (let k = 0; k < n; k++) combos[k] = { weapon: lists.weapon[k] || P.equip.weapon, hat: lists.hat[k] || P.equip.hat, cape: lists.cape[k] || P.equip.cape };
    }
    let dressed = false;
    const prevT = renderer.getRenderTarget();
    try {
      renderer.compile(scene, camera);   // everything in the level too (ignores frustum culling)
      renderer.setRenderTarget(typeof POST !== 'undefined' && POST.on && typeof rtMain !== 'undefined' && rtMain ? rtMain : null);
      for (const eq of combos) {
        if (eq) { try { H.setEquip(eq); dressed = true; } catch (err) { warnOnce('warm equip', err); } }
        renderer.render(scene, camera);  // a real draw (shadow pass included)
      }
    } catch (err) { warnOnce('warm render', err); }
    renderer.setRenderTarget(prevT);
    if (dressed) { try { H.setEquip(title && R.titleWear ? R.titleWear : P.equip); } catch (err) { warnOnce('H.setEquip', err); } }
    scene.remove(tmp);
    for (let k = 0; k < cull.length; k += 2) cull[k].frustumCulled = cull[k + 1];
    for (let k = 0; k < skVis.length; k += 2) skVis[k].visible = skVis[k + 1];
    R.coins.count = coinsN; R.bars.count = barsN;
    for (const h of temp) { if (h && h.proj) killProjectileObj(h.proj); else remove(h); }
    for (const k in WARM_E) if (WARM_E[k] && WARM_E[k].root) removeObj(WARM_E[k].root);
    removeObj(potionTpl());
    GAME.warmMs = Math.round(performance.now() - t0);
  }
  function populate() {
    if (!L) return;
    L._title = false;
    sleepers = (L.spawns || []).filter(s => s.type !== 'ejderha').map(s => Object.assign({}, s));
    const bs = (L.spawns || []).find(s => s.type === 'ejderha');
    const bz = zdef().boss;
    if (bs || (L.boss && bz)) {
      const b = makeEnemy({ type: bz || 'ejderha', x: (bs || L.boss).x, z: (bs || L.boss).z, elite: false, pack: 'boss' });
      b.face = 0; boss = GAME.boss = b;
    } else GAME.boss = null;
    if (L.portalObj && L.portalObj.setActive) L.portalObj.setActive(true);
    activate(true, 16);
    pathInit();
  }
  // Arc length along the main route of every checkpoint, so walking past one lights it even on the far side of the path.
  function pathProject(x, z, maxD) {
    const path = L && L.path;
    if (!path || path.length < 2 || !pathCum) return -1;
    let best = -1, bd = maxD * maxD;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1), d2 = dist2(a.x + dx * t, a.z + dz * t, x, z);
      if (d2 < bd) { bd = d2; best = pathCum[i] + t * Math.sqrt(l2); }
    }
    return best;
  }
  function pathInit() {
    pathS = 0; pathCum = null;
    const path = L && L.path;
    if (!path || path.length < 2) return;
    pathCum = [0];
    for (let i = 1; i < path.length; i++) pathCum.push(pathCum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    for (const cp of L.cpObjs || []) cp._s = pathProject(cp.x, cp.z, 12);
  }
  function enterZoneStory(i) {
    const Z = zdef(i);
    igniteSaber(0.45);   // vvzzum: the lightsaber lights up as the zone fades in
    if (Z.music) aud('music', Z.music);
    if (i > 0 && Z.line) later(0.8, () => say(Z.line, 2));
    save();
  }

  // ── Enemies ──
  // Creature hp factor for a sword stronger than usual in this zone and round (see DIFF.power); 1 at or below it.
  function powerHp(ngH) {
    const D = DIFF.power, zi = clamp(P.zone | 0, 0, D.dmg.length - 1), usual = D.dmg[zi] * ngH;
    return P.dmg > usual ? Math.pow(P.dmg / usual, D.k) : 1;
  }
  function makeEnemy(sp) {
    const type = sp.type, def = edef(type), Z = zdef();
    const isBoss = def.kind === 'boss';
    const elite = !!sp.elite && !isBoss;
    const ngH = 1 + 0.6 * P.ng, ngD = 1 + 0.3 * P.ng;
    const variant = sp.variant || (VARIANTS[type] ? fpick(VARIANTS[type]) : undefined);
    let m = null;
    if (typeof EMODEL !== 'undefined' && EMODEL.build) { try { m = EMODEL.build(type, { variant, elite }); } catch (err) { warnOnce('EMODEL.build ' + type, err); } }
    if (!m || !m.root) m = fallbackEnemy(type, elite);
    scene.add(m.root);
    const sc = elite ? 1.4 : 1;
    const hp = Math.round(isBoss ? def.hp * (1 + 0.5 * P.ng) * DIFF.bossHp
      : def.hp * (Z.hpMult || 1) * ngH * DIFF.hp * (DIFF.zoneHp[P.zone] || 1) * (DIFF.hpType[type] || 1) * (elite ? DIFF.eliteHp : 1) * powerHp(ngH));
    const e = {
      type, def, m, x: sp.x, z: sp.z, y: 0, face: sp.face !== undefined ? sp.face : frand(0, TAU), hp, maxHp: hp, elite, boss: isBoss,
      name: isBoss ? (def.ad || 'Huysuz Ejderha') : elite ? (def.eliteAd || ELITE_AD[type] || 'Kocaman ' + String(def.ad || type).replace(/^(Huysuz|Haylaz) /, '')) : (def.ad || type),
      r: m.radius || (def.r || 0.5) * sc, height: m.height || (def.height || 1) * sc,
      dmg: def.dmg * (isBoss ? 1.4 * DIFF.bossDmg : (Z.dmgMult || 1) * (DIFF.zoneDmg[P.zone] || 1) * DIFF.dmg) * ngD * (elite ? DIFF.eliteDmg : 1),
      speed: Math.min(def.speed || 2.5, T.enemyMaxSpeed) * (elite ? 0.92 : 1) * (1 + 0.03 * P.ng),
      xp: (def.xp || 10) * (isBoss ? 1 : (Z.xpMult || 1) * DIFF.xp) * (1 + 0.5 * P.ng) * (elite ? 3 : 1),
      gold: (def.gold || 3) * (Z.gold || 1) * (elite ? 3 : 1),
      kind: isBoss ? 'boss' : (def.kind || 'melee'), fly: !!def.fly, hover: def.hover !== undefined ? def.hover : 0.8,
      atkRange: def.atkRange || 1, atkCd: (def.atkCd || 1.7) * DIFF.atkCd, windup: Math.max(T.windMin, def.windup || 0.6), aggroR: def.aggro || 9,
      homeX: sp.x, homeZ: sp.z, pack: sp.pack, room: sp.room, sp,
      state: 'idle', stT: 0, wind: 0.6, cd: frand(0.4, 1.2), stun: 0, frozen: 0, flash: 0, hurt: 0, kvx: 0, kvz: 0,
      aggro: false, token: false, dist: 99, losOk: false, losT: frand(0, 0.3), lookT: frand(0, 0.25), wT: frand(0.5, 3), walking: false, wx: sp.x, wz: sp.z,
      t: frand(0, 10), phase: frand(0, TAU), strafe: Math.random() < 0.5 ? 1 : -1, strafeT: frand(1.5, 3),
      tele: null, ice: null, aura: null, tag: null, sparkT: 0, bar: { trail: 1, delay: 0 }, fade: 1, aggroAt: -99, dead: false,
      bur: 0, upT: 99, digT: 0, digS: 0, trailT: frand(0, 0.2),   // burrow amount (köstebek), time on the surface, fx timers
      // No EDEF entry for a burrower = the stand-in model cannot sink by itself: GAME lowers it into the ground instead.
      selfBurrow: def.kind === 'burrow' && !(typeof EDEF !== 'undefined' && EDEF && EDEF[type]),
      st: { move: 0, windup: -1, attack: -1, hurt: 0, frozen: false, dying: -1, t: 0, burrow: 0, breath: -1, stomp: -1, roar: -1, fireball: -1 },
    };
    if (elite) {
      e.aura = new THREE.Group();
      e.auraR = Math.min(e.r * 3.1, 3.4);
      const glow = decal(R.auraGlow, e.auraR * 1.35), ring = decal(R.auraMat, e.auraR);
      glow.position.y = 0.035; ring.position.y = 0.04;
      e.aura.add(glow, ring); scene.add(e.aura);
      e.tag = nameTag(e.name); scene.add(e.tag);
    }
    if (isBoss) { e.ph = 'idle'; e.wait = 1.5; e.last = ''; e.s66 = e.s50 = e.s33 = false; e.summon = 0; e.dmg0 = e.dmg; e.naps = 0; e.sized = false; }
    place(e);
    enemies.push(e);
    return e;
  }
  function dropEnemy(e) {
    remove(e.tele); e.tele = null; remove(e.ice); e.ice = null;
    if (e.aura) { removeObj(e.aura); e.aura = null; }
    if (e.tag) { removeObj(e.tag); e.tag.material.map.dispose(); e.tag.material.dispose(); e.tag = null; }
    removeObj(e.m.root);
    try { e.m.dispose && e.m.dispose(); } catch (err) { warnOnce('EMODEL.dispose', err); }
  }
  // Wake sleeping spawns near Feza (a few per tick so building models never causes a hitch).
  function activate(force, cap = 4) {
    const r2 = T.activeR * T.activeR;
    let n = 0;
    for (let i = sleepers.length - 1; i >= 0 && n < cap; i--) {
      const s = sleepers[i];
      if (dist2(s.x, s.z, P.pos.x, P.pos.z) < r2) { sleepers.splice(i, 1); makeEnemy(s); n++; }
    }
    if (force && n >= cap) activate(true, cap);
  }
  function place(e) {
    if (e.fly && !e.dead) e.y = e.hover + 0.14 * Math.sin(e.t * 2.6 + e.phase);
    const r = e.m.root;
    e.st.burrow = e.bur;
    r.position.set(e.x, e.y, e.z); r.rotation.y = e.face;
    if (e.selfBurrow) r.position.y = e.y - e.bur * e.height * 1.15;   // stand-in model only (the real köstebek sinks itself + shows its mound)
    if (e.aura) {
      e.aura.position.set(e.x, 0, e.z);
      const k = 1 + 0.08 * Math.sin(e.t * 4);
      e.aura.children[1].scale.setScalar(e.auraR * k); e.aura.children[1].rotation.z = e.t * 0.8;
    }
    if (e.tag) e.tag.position.set(e.x, e.y + e.height + 0.78, e.z);
  }
  function anim(e, dt) { if (e.m.anim) { try { e.m.anim(dt, e.st); } catch (err) { warnOnce('EMODEL.anim ' + e.type, err); } } }

  function setAggro(e, spread = true) {
    if (e.aggro || e.dead) return;
    if (e.boss) { bossAggro(e); return; }
    e.aggro = true; e.aggroAt = gt; e.state = 'chase'; e.walking = false; e.cd = Math.max(e.cd, frand(0.35, 0.9));
    if (spread && !e.elite) ftext(e.x, e.y + e.height + 0.5, e.z, '!', 'word');   // the one who spotted Feza
    if (e.elite && !finale) {
      ftext(e.x, e.y + e.height + 1.1, e.z, e.name + '!', 'word');
      if (gt - lastKocaman > 40) { lastKocaman = gt; emit('toast', { text: e.name + ' geliyor!' }); }
      // the voice line once per zone, now or never ("… geliyor!" said after the fight started would be wrong)
      if (!ZF.kocaman && chat('kocaman', dist2(e.x, e.z, P.pos.x, P.pos.z) < 12 * 12 ? 3 : 2, 6, { wait: 4 })) ZF.kocaman = true;
    }
    if (!F.intro0) introFirstSkill();
    const fl = FIRST_LINE[e.type];   // "Bak bak! Köstebekler toprağın altından çıkıyor!" — once per game, the first time
    if (fl && !F[fl] && !finale && hasLine(fl)) { F[fl] = true; later(0.5, () => say(fl, 2)); }
    if (spread && e.pack !== undefined && e.pack !== null) {
      for (let i = sleepers.length - 1; i >= 0; i--) if (sleepers[i].pack === e.pack) { const s = sleepers.splice(i, 1)[0]; makeEnemy(s); }
      for (const o of enemies) if (o !== e && o.pack === e.pack && !o.aggro && !o.boss) setAggro(o, false);
    }
  }
  function calm(e) {
    e.aggro = false; e.token = false; cancelWindup(e);
    e.state = 'idle'; e.walking = true; e.returning = true; e.wx = e.homeX; e.wz = e.homeZ;
  }
  function cancelWindup(e) {
    remove(e.tele); e.tele = null;
    if (e.state === 'windup' || e.state === 'strike' || e.state === 'recover' || BUR_ST[e.state]) {
      if (e.state === 'windup' || e.state === 'rise') STATS.cancel++;
      if (BUR_ST[e.state]) e.upT = 0;   // a köstebek pops up where it is (see enemyStep) and stays up a while
      e.state = e.aggro ? 'chase' : 'idle'; e.cd = Math.max(e.cd, frand(0.5, 0.9));
    }
  }
  function freeze(e, s) {
    if (e.boss) s = Math.min(s, 1);
    const was = e.frozen > 0;
    e.frozen = Math.max(e.frozen, s); STATS.freezes++;
    cancelWindup(e);
    if (!was) {
      if (e.m.setTint) e.m.setTint('#9fe6ff');
      if (!e.boss) e.ice = fx('iceBlock', e.m.root, e.r * 1.25 + 0.15);
    }
  }
  function unfreeze(e) {
    e.frozen = 0;
    if (e.m.setTint) e.m.setTint(null);
    remove(e.ice); e.ice = null;
    burst('ice', e.x, e.y + e.height * 0.5, e.z, { count: 12 });
  }

  // Only a few enemies fight at once; the rest wait their turn in a loose ring (kid-sized chaos).
  function assignTokens() {
    const mel = [], rng = [], big = [];
    for (const e of enemies) {
      e.token = false;
      if (!e.aggro || e.boss || e.frozen > 0) continue;
      (e.kind === 'ranged' ? rng : e.kind === 'slam' ? big : mel).push(e);
    }
    const byD = (a, b) => a.dist - b.dist;
    mel.sort(byD); rng.sort(byD); big.sort(byD);
    for (let i = 0; i < mel.length && i < T.maxMelee; i++) mel[i].token = true;
    for (let i = 0; i < rng.length && i < T.maxRanged; i++) rng[i].token = true;
    if (big.length) big[0].token = true;   // the big slow Kaya Devi gets its own turn (four moles up close must not lock it out)
    for (const e of mel) if (!e.token && e.state === 'windup') cancelWindup(e);
    for (let i = 1; i < big.length; i++) if (big[i].state === 'windup') cancelWindup(big[i]);
  }

  function stepToward(e, dx, dz, speed, dt, face = true) {
    moveE(e, dx * speed * dt, dz * speed * dt);
    if (face) e.face = dampAngle(e.face, Math.atan2(dx, dz), 9, dt);
    e.st.move = Math.min(1, speed / Math.max(1, e.speed));
  }
  function chaseDir(e, d, ux, uz) {
    if (e.losOk && d < 8) return _tp2.set(ux, uz);
    if (L && hasLevel() && LEVEL.flowDir) {
      const f = LEVEL.flowDir(L, e.x, e.z);
      if (f && (f.x || f.z)) return _tp2.set(f.x, f.z);
    }
    return _tp2.set(ux, uz);
  }
  const _tp2 = { x: 0, z: 0, set(x, z) { this.x = x; this.z = z; return this; } };

  function wander(e, dt) {
    e.wT -= dt;
    if (!e.walking && e.wT <= 0) {
      e.wT = frand(2.5, 5.5);
      if (Math.random() < 0.65) {
        const a = frand(0, TAU), r = frand(0.8, 2.6), x = e.homeX + Math.sin(a) * r, z = e.homeZ + Math.cos(a) * r;
        if (isFloor(x, z)) { e.wx = x; e.wz = z; e.walking = true; }
      }
    }
    if (e.returning) {
      if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
      e.retT = (e.retT || 0) + dt;
      if (e.retT > 6 && e.dist > 16) { e.x = e.homeX; e.z = e.homeZ; e.walking = e.returning = false; e.retT = 0; return; }   // stuck on a wall, out of sight
    } else e.retT = 0;
    if (e.walking) {
      const dx = e.wx - e.x, dz = e.wz - e.z, d = Math.hypot(dx, dz);
      if (d < 0.25) { e.walking = false; e.returning = false; return; }
      stepToward(e, dx / d, dz / d, e.speed * (e.returning ? 0.8 : 0.32), dt);
    }
  }

  function enemyStep(e, dt, canTarget) {
    const st = e.st;
    e.t += dt; st.t = e.t;
    const dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.hypot(dx, dz) || 1e-4;
    const ux = dx / d, uz = dz / d;
    e.dist = d;
    if (d > T.hideR && !e.aggro) { if (e.m.root.visible) { e.m.root.visible = false; if (e.aura) e.aura.visible = e.tag.visible = false; } return; }
    if (!e.m.root.visible) { e.m.root.visible = true; if (e.aura) e.aura.visible = true; }
    e.cd -= dt;
    e.hurt = Math.max(0, e.hurt - dt * 3.5); st.hurt = e.hurt;
    if (e.flash > 0) { e.flash = Math.max(0, e.flash - dt * 6); if (e.m.flash) e.m.flash(e.flash, e.flashCol || '#ffffff'); }
    if (e.kvx || e.kvz) {
      moveE(e, e.kvx * dt, e.kvz * dt);
      const k = Math.exp(-9 * dt); e.kvx *= k; e.kvz *= k;
      if (Math.abs(e.kvx) + Math.abs(e.kvz) < 0.06) e.kvx = e.kvz = 0;
    }
    st.move = 0; st.windup = -1; st.attack = -1; st.frozen = false;
    if (e.boss) { st.breath = st.stomp = st.roar = st.fireball = -1; }
    if (e.frozen > 0) {
      e.frozen -= dt; st.frozen = true;
      if (e.frozen <= 0) unfreeze(e);
      place(e); anim(e, dt); return;
    }
    if (e.stun > 0) { e.stun -= dt; st.hurt = Math.max(st.hurt, 0.5); place(e); anim(e, dt); return; }
    if (e.bur > 0 && !BUR_ST[e.state]) {   // köstebek calmed / reset / interrupted underground: pops up where it is first
      e.bur = Math.max(0, e.bur - dt / riseT(e));
      if (e.bur <= 0) { burst('dirt', e.x, 0.05, e.z, { count: 6, color: DIRT }); sfx('emerge', { x: e.x, z: e.z, vol: 0.6 }); }
      place(e); anim(e, dt); return;
    }
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = 0.3; e.losOk = d < 18 && los(e.x, e.z, P.pos.x, P.pos.z); }
    if (e.boss) bossStep(e, dt, d, ux, uz, canTarget);
    else if (!e.aggro) {
      e.lookT -= dt;
      if (canTarget && e.lookT <= 0) { e.lookT = 0.25; if (d < e.aggroR && e.losOk) setAggro(e); }
      if (!e.aggro) wander(e, dt);
    } else if (!canTarget || d > T.leash) calm(e);
    else if (e.kind === 'ranged') rangedStep(e, dt, d, ux, uz);
    else if (e.kind === 'burrow') burrowStep(e, dt, d, ux, uz);
    else meleeStep(e, dt, d, ux, uz);
    if (SLIMY[e.type] && st.move > 0.05 && d < 30) slimeTrail(e, dt);
    place(e); anim(e, dt);
    if (e.elite && d < 24 && e.bur < 0.5) {   // golden motes drifting up around elites
      e.sparkT -= dt;
      if (e.sparkT <= 0) {
        e.sparkT = 0.12;
        const a = frand(0, TAU), r = e.r * frand(0.7, 1.3);
        emitP(e.x + Math.sin(a) * r, e.y + frand(0.1, e.height * 0.8), e.z + Math.cos(a) * r, 0, frand(0.6, 1.3), 0, frand(0.8, 1.2), frand(0.14, 0.26), 0, '#ffd23f', '#fff6c8', 2, -0.3, 0.5);
      }
    }
  }

  function meleeStep(e, dt, d, ux, uz) {
    const st = e.st, reach = e.atkRange + e.r + T.heroR * 0.6;
    if (e.state === 'windup') {
      e.stT += dt; st.windup = clamp(e.stT / e.wind, 0, 1);
      if (e.stT >= e.wind) { e.state = 'strike'; e.stT = 0; e.tele = null; strike(e); }
      return;
    }
    if (e.state === 'strike') {
      e.stT += dt; st.attack = clamp(e.stT / 0.42, 0, 1);
      if (e.stT < 0.12 && e.kind !== 'slam') moveE(e, Math.sin(e.face) * 3 * dt, Math.cos(e.face) * 3 * dt);
      if (e.stT >= 0.42) { e.state = 'chase'; e.cd = e.atkCd * frand(0.85, 1.25); }
      return;
    }
    const want = e.token ? reach * 0.75 : 4.3 + e.r;
    if (d > want) {
      const c = chaseDir(e, d, ux, uz);
      stepToward(e, c.x, c.z, e.speed * (e.token ? 1 : 0.7), dt);
    } else if (!e.token && d < want - 1.4) {
      stepToward(e, -ux, -uz, e.speed * 0.35, dt, false);
      e.face = dampAngle(e.face, Math.atan2(ux, uz), 6, dt);
    } else e.face = dampAngle(e.face, Math.atan2(ux, uz), 7, dt);
    if (e.token && d <= reach && e.cd <= 0) startWindup(e, ux, uz, reach);
  }
  function startWindup(e, ux, uz, reach) {
    e.state = 'windup'; e.stT = 0; e.face = Math.atan2(ux, uz); STATS.windup++;
    e.wind = e.windup;
    if (e.kind === 'slam') {
      e.slamR = (e.def.slamR || 2.2) * (e.elite ? 1.25 : 1);
      e.sx = e.x + Math.sin(e.face) * e.r * 0.9; e.sz = e.z + Math.cos(e.face) * e.r * 0.9;
      e.tele = fx('telegraph', e.sx, e.sz, e.slamR, e.wind, '#ff4a3a');
    } else if (e.kind === 'ranged') {
      e.wind = Math.max(0.6, e.windup);
    } else {
      e.tele = fx('telegraphCone', e.x, e.z, e.face, 1.5, reach + 0.25, e.wind, '#ff5a44');
    }
  }
  function strike(e) {
    STATS.strike++;
    if (e.kind === 'slam') {
      fx('ring', e.sx, e.sz, { r0: 0.4, r1: e.slamR + 0.6, dur: 0.45, color: '#ffd9a0', width: 0.5 });
      burst('dust', e.sx, 0.1, e.sz, { count: 26, scale: 1.4 });
      burst('debris', e.sx, 0.2, e.sz, { color: '#b9a58a', count: 10 });
      shake(0.3 * clamp(1.4 - e.dist / 14, 0.2, 1));
      sfx('slam', { x: e.x, z: e.z });
      if (Math.hypot(P.pos.x - e.sx, P.pos.z - e.sz) < e.slamR + T.heroR * 0.5) hurtPlayer(e.dmg, e.sx, e.sz, 1.2);
      return;
    }
    sfx(e.type === 'yarasa' || e.type === 'jole' ? 'bite' : 'whoosh', { x: e.x, z: e.z, vol: 0.7, pitch: frand(0.9, 1.15) });
    const dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.hypot(dx, dz);
    const reach = e.atkRange + e.r + T.heroR * 0.6;
    if (d <= reach + 0.35 && Math.abs(angDiff(e.face, Math.atan2(dx, dz))) < 0.9) { STATS.strikeHit++; hurtPlayer(e.dmg, e.x, e.z, 0.4); }
  }

  function rangedStep(e, dt, d, ux, uz) {
    const st = e.st;
    if (e.state === 'windup') {
      e.stT += dt; st.windup = clamp(e.stT / e.wind, 0, 1);
      e.face = dampAngle(e.face, Math.atan2(ux, uz), 5, dt);
      chargeFx(e, st.windup, dt);
      if (e.stT >= e.wind) { shoot(e); e.state = 'recover'; e.stT = 0; }
      return;
    }
    if (e.state === 'recover') {
      e.stT += dt; st.attack = clamp(e.stT / 0.4, 0, 1);
      if (e.stT >= 0.4) { e.state = 'chase'; e.cd = e.atkCd * frand(0.9, 1.3); }
      return;
    }
    e.strafeT -= dt;
    if (e.strafeT <= 0) { e.strafeT = frand(1.5, 3); e.strafe = -e.strafe; }
    if (d < 3.4) { stepToward(e, -ux, -uz, e.speed * 0.65, dt, false); e.face = dampAngle(e.face, Math.atan2(ux, uz), 6, dt); }
    else if (d > e.atkRange * 0.9 || !e.losOk) { const c = chaseDir(e, d, ux, uz); stepToward(e, c.x, c.z, e.speed, dt); }
    else if (e.token) { stepToward(e, -uz * e.strafe, ux * e.strafe, e.speed * 0.3, dt, false); e.face = dampAngle(e.face, Math.atan2(ux, uz), 6, dt); }
    else e.face = dampAngle(e.face, Math.atan2(ux, uz), 6, dt);
    if (e.token && d < e.atkRange && e.losOk && e.cd <= 0) startWindup(e, ux, uz, e.atkRange);
  }

  // ── Köstebek ("whack-a-mole"): far from Feza it digs in (st.burrow 0→1), travels underground (a moving dirt mound; no
  // sword, skill, star or tap can reach it), stops ~1.4 m from him, the mound trembles over a dirt-circle telegraph, it pops
  // up (st.burrow 1→0 = the end of the wind-up) and bonks everything in the circle. Then it stays up ≥ 3 s to be whacked. ──
  const BUR = { sink: 0.4, rise: 0.35, near: 1.4, far: 3.2, upMin: 3, maxUnder: 7, teleR: 1.55 };
  const BUR_ST = { sink: 1, under: 1, rise: 1 };
  const DIRT = '#9a7550';
  const BREATH_COL = ['#ff3db4', '#d23cff', '#9d4bff', '#ff5ad0', '#b44dff'];
  const SLIMY = { salyangoz: 1 };
  const hidden = e => e.bur > 0.85;   // (almost) fully underground
  const riseT = e => e.def.burrowOut || BUR.rise;   // EDEF burrowIn / burrowOut: dig-in and pop-up times
  function burrowStep(e, dt, d, ux, uz) {
    const st = e.st;
    if (e.state === 'sink') {
      e.stT += dt; e.bur = Math.min(1, e.stT / (e.def.burrowIn || BUR.sink));
      digFx(e, dt, 0.07);
      if (e.bur >= 1) { e.state = 'under'; e.stT = 0; }
      return;
    }
    if (e.state === 'under') {
      e.stT += dt; e.bur = 1;
      const c = chaseDir(e, d, ux, uz);
      stepToward(e, c.x, c.z, e.speed, dt);
      digFx(e, dt, 0.1);
      if ((d <= BUR.near + 0.15 && circleFree(e.x, e.z, e.r * 0.7)) || e.stT > BUR.maxUnder) startRise(e);
      return;
    }
    if (e.state === 'rise') {
      e.stT += dt;
      st.windup = clamp(e.stT / e.wind, 0, 1);
      const rt = riseT(e), r0 = e.wind - rt;   // the mound trembles in place first, then it pops up during the last 0.35 s
      e.bur = e.stT < r0 ? 1 : Math.max(0, 1 - (e.stT - r0) / rt);
      e.face = dampAngle(e.face, Math.atan2(ux, uz), 8, dt);
      if (e.stT < r0) digFx(e, dt, 0.06);
      if (e.stT >= e.wind) { e.bur = 0; e.tele = null; bonk(e); e.state = 'strike'; e.stT = 0; e.upT = 0; }
      return;
    }
    if (e.state === 'windup' || e.state === 'strike') { meleeStep(e, dt, d, ux, uz); return; }
    e.upT += dt;
    if (e.token && e.upT >= BUR.upMin && d > BUR.far) { startSink(e); return; }
    const sp = e.speed; e.speed = sp * 0.6;   // a waddling mole on the surface: easy to catch and whack
    meleeStep(e, dt, d, ux, uz);
    e.speed = sp;
  }
  function startSink(e) {
    remove(e.tele); e.tele = null;
    e.state = 'sink'; e.stT = 0; e.walking = false;
    burst('dirt', e.x, 0.05, e.z, { count: 8, color: DIRT });
    sfx('dig', { x: e.x, z: e.z, vol: 0.8 });
  }
  function startRise(e) {
    e.state = 'rise'; e.stT = 0; STATS.windup++;
    e.wind = Math.max(T.windMin, e.windup, riseT(e) + 0.25);
    e.bonkR = BUR.teleR * (e.elite ? 1.25 : 1); e.bx = e.x; e.bz = e.z;   // the bonk lands exactly where the circle was drawn
    e.tele = fx('telegraph', e.x, e.z, e.bonkR, e.wind, '#ff7a3a');
    sfx('dig', { x: e.x, z: e.z, pitch: 1.2 });
  }
  function bonk(e) {
    STATS.strike++;
    const R = e.bonkR || BUR.teleR, bx = e.bx !== undefined ? e.bx : e.x, bz = e.bz !== undefined ? e.bz : e.z;
    burst('dirt', e.x, 0.08, e.z, { count: 12, scale: 1.1, color: DIRT });
    burst('dust', e.x, 0.08, e.z, { count: 6, color: '#c9a77e' });
    fx('ring', bx, bz, { r0: 0.3, r1: R + 0.2, dur: 0.35, color: '#ffd9a0', width: 0.3 });
    sfx('emerge', { x: e.x, z: e.z }); sfx('slam', { x: e.x, z: e.z, vol: 0.35, pitch: 1.7 });
    shake(0.07 * clamp(1.4 - e.dist / 12, 0.2, 1));
    if (Math.hypot(P.pos.x - bx, P.pos.z - bz) < R + T.heroR * 0.5) { STATS.strikeHit++; hurtPlayer(e.dmg, bx, bz, 0.6); }
  }
  function digFx(e, dt, every) {   // dust puffs over the moving mound + a soft 'dig' now and then
    e.digT -= dt;
    if (e.digT <= 0 && e.dist < 30) {
      e.digT = every;
      const bk = { x: -Math.sin(e.face) * 0.5, z: -Math.cos(e.face) * 0.5 };
      burst('dust', e.x + frand(-0.25, 0.25), 0.02, e.z + frand(-0.25, 0.25), { count: 2, color: '#b58f68', dir: bk });
      if (Math.random() < 0.35) burst('dirt', e.x, 0.05, e.z, { count: 2, color: DIRT, dir: bk });
    }
    e.digS -= dt;
    if (e.digS <= 0) { e.digS = 0.45; sfx('dig', { x: e.x, z: e.z, vol: 0.45, pitch: frand(0.9, 1.15) }); }
  }
  // Salyangoz: a short sparkly slime trail behind it while it moves.
  function slimeTrail(e, dt) {
    e.trailT -= dt;
    if (e.trailT > 0) return;
    e.trailT = 0.2;
    const bx = e.x - Math.sin(e.face) * e.r * 0.8, bz = e.z - Math.cos(e.face) * e.r * 0.8;
    burst('slime', bx, 0.03, bz, { dir: { x: Math.sin(e.face), z: Math.cos(e.face) }, scale: e.elite ? 1.4 : 1 });
  }
  const shape = (name, dflt) => (typeof FX !== 'undefined' && FX && FX.SHAPES && FX.SHAPES[name] !== undefined ? FX.SHAPES[name] : dflt);
  const PT = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0.4, size: 0.3, size1: 0, color: '#fff', color1: '#fff', alpha: 1, shape: 0, add: true, grav: 0, drag: 0, spin: 0, fade: 1, pop: 0 };
  function emitP(x, y, z, vx, vy, vz, life, size, size1, color, color1, shape, grav = 0, drag = 0) {
    if (typeof FX === 'undefined' || !FX.emit) return;
    PT.x = x; PT.y = y; PT.z = z; PT.vx = vx; PT.vy = vy; PT.vz = vz; PT.life = life; PT.size = size; PT.size1 = size1;
    PT.color = color; PT.color1 = color1; PT.shape = shape; PT.grav = grav; PT.drag = drag; PT.spin = frand(-3, 3);
    fx('emit', PT);
  }
  function muzzle(e) {
    let v = null;
    if (e.m.muzzle) { try { v = e.m.muzzle(); } catch (err) { warnOnce('muzzle', err); } }
    if (v) return _v.set(v.x, v.y, v.z);
    return _v.set(e.x + Math.sin(e.face) * e.r, e.y + e.height * 0.6, e.z + Math.cos(e.face) * e.r);
  }
  // Charging glow that gathers at the mouth: tells the kid "a shot is coming".
  function chargeFx(e, k, dt) {
    e.sparkT -= dt;
    if (e.sparkT > 0) return;
    e.sparkT = 0.03;
    const m = muzzle(e), kind = (e.def.shot && e.def.shot.kind) || SHOT_KIND[e.type] || 'spore', col = SHOT_COL[kind] || '#fff';
    const a = frand(0, TAU), r = 0.8 * (1 - k * 0.45);
    emitP(m.x + Math.sin(a) * r, m.y + frand(-0.35, 0.35), m.z + Math.cos(a) * r, -Math.sin(a) * r * 3, 0, -Math.cos(a) * r * 3, 0.26, 0.2, 0.06, col, '#ffffff', 2);
    emitP(m.x, m.y, m.z, 0, 0, 0, 0.07, 0.35 + k * 0.75, 0.3 + k * 0.7, col, '#ffffff', 0);   // growing orb at the mouth
  }
  function shoot(e) {
    STATS.shots++;
    const m = muzzle(e), sh = e.def.shot || {};
    const kind = sh.kind || SHOT_KIND[e.type] || 'spore', speed = Math.min(sh.speed || 5.5, 7);
    const dx = P.pos.x - m.x, dz = P.pos.z - m.z, d = Math.hypot(dx, dz) || 1;
    spawnProjectile({ x: m.x, y: m.y, z: m.z, vx: dx / d * speed, vz: dz / d * speed, r: sh.r || 0.32, dmg: e.dmg, owner: 'enemy', kind,
      life: (e.atkRange + 4) / speed, color: SHOT_COL[kind] });
    if (kind === 'bubble') { sfx('bubble', { x: e.x, z: e.z, vol: 0.8 }); burst('sparkle', m.x, m.y, m.z, { color: '#d8f4ff', count: 5 }); }
    else sfx(kind === 'fire' ? 'fireball' : 'spit', { x: e.x, z: e.z, vol: 0.7 });
  }

  function separate() {
    const n = enemies.length;
    for (let i = 0; i < n; i++) {
      const a = enemies[i];
      if (!a.m.root.visible || hidden(a)) continue;
      for (let j = i + 1; j < n; j++) {
        const b = enemies[j];
        const rr = (a.r + b.r) * 0.92, dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || !b.m.root.visible || hidden(b)) continue;
        const d = Math.sqrt(d2) || 0.01, push = (rr - d), ux = d2 > 1e-6 ? dx / d : 1, uz = d2 > 1e-6 ? dz / d : 0;
        const wa = a.boss ? 0 : b.boss ? 1 : 0.5, wb = 1 - wa;
        if (wa) moveE(a, -ux * push * wa, -uz * push * wa);
        if (wb) moveE(b, ux * push * wb, uz * push * wb);
      }
      if (P.dead) continue;
      const rr = a.r + T.heroR, dx = a.x - P.pos.x, dz = a.z - P.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.01, push = rr - d, ux = dx / d, uz = dz / d;
        if (a.boss || a.r >= 0.95) moveXZ(P.pos, -ux * push, -uz * push, T.heroR);
        else moveE(a, ux * push, uz * push);
      }
    }
  }

  // ── Boss: Huysuz Ejderha ──
  function inBossArena(b) {
    const rm = L && L.rooms && L.rooms.find(r => r.kind === 'boss');
    if (rm) {
      if (rm.hw && rm.hh) return Math.abs(P.pos.x - rm.x) < rm.hw - 0.5 && Math.abs(P.pos.z - rm.z) < rm.hh - 0.5;
      if (rm.r) return dist2(P.pos.x, P.pos.z, rm.x, rm.z) < (rm.r - 0.5) * (rm.r - 0.5);
    }
    return b.dist < 14;
  }
  function bossAggro(b) {
    if (b.aggro || b.dead) return;
    b.aggro = true; bossPhase(b, 'roar');
    if (!b.sized) {   // a weak sword must not mean a 2-minute fight: the dragon's hp follows Feza's damage (once)
      b.sized = true;
      const top = b.maxHp, hp = Math.round(clamp(DIFF.bossHpPerDmg * P.dmg * (1 + 0.5 * P.ng), top * DIFF.bossHpMin, top));
      b.hp = Math.max(1, Math.round(b.hp / b.maxHp * hp)); b.maxHp = hp;
    }
    if (!b.intro) { b.intro = true; say('ejderha_giris', 3); }
    // Falling asleep in the fight must not mean the long walk back: wake up at the arena entrance.
    if (GAME.state === 'play' && !P.dead && circleFree(P.pos.x, P.pos.z, T.heroR)) P.checkpoint = { x: P.pos.x, z: P.pos.z };
    emit('boss', { on: true, name: b.name, hp: b.hp, maxHp: b.maxHp });
    aud('music', 'boss');
  }
  function bossCalm(b) {
    b.aggro = false; remove(b.tele); b.tele = null; bossPhase(b, 'idle'); b.wait = 1;
    emit('boss', { on: false });
    const Z = zdef(); if (Z.music) aud('music', Z.music);
  }
  // Feza napped in the dragon fight: the dragon gets tired too, so a careless kid naps once or twice, not four times.
  // It never falls asleep for good from this (hp stays above 10 %).
  function bossTired(b) {
    const N = DIFF.bossNap;
    b.naps = (b.naps || 0) + 1;
    b.dmg = Math.max((b.dmg0 || b.dmg) * N.dmgMin, b.dmg * N.dmg);
    b.hp = Math.round(Math.max(Math.min(b.hp, b.maxHp * 0.1), b.hp - b.maxHp * N.hp));
    later(1.2, () => {   // a big dragon yawn (in front of its snout: the head itself is above the frame when Feza is close)
      if (!b.dead) burst('zzz', b.x + Math.sin(b.face) * b.r * 0.9, b.height * 0.45, b.z + Math.cos(b.face) * b.r * 0.9, {});
    });
  }
  function bossPhase(b, ph) { b.ph = ph; b.stT = 0; b.did = 0; }
  function bossStep(b, dt, d, ux, uz, canTarget) {
    const st = b.st;
    if (!b.aggro) {
      if (canTarget && inBossArena(b)) bossAggro(b);
      else { b.face = dampAngle(b.face, 0, 2, dt); return; }
    }
    if (!canTarget || d > 34) { bossCalm(b); return; }
    b.stT += dt;
    const faceP = Math.atan2(ux, uz);
    switch (b.ph) {
      case 'roar': {
        st.roar = clamp(b.stT / 1.6, 0, 1);
        if (b.did === 0 && b.stT > 0.35) {
          b.did = 1; sfx('roar', { x: b.x, z: b.z }); shake(0.35);
          fx('ring', b.x, b.z, { r0: 1, r1: 9, dur: 0.7, color: '#ffb0f0', width: 0.6 });
        }
        if (b.did === 1 && b.summon && b.stT > 0.75) { b.did = 2; summonBats(b, b.summon); b.summon = 0; }
        if (b.stT >= 1.6) { bossPhase(b, 'idle'); b.wait = frand(0.6, 1.0); }
        break;
      }
      case 'idle': {
        b.face = dampAngle(b.face, faceP, 3, dt);
        if (d > 8.5) stepToward(b, ux, uz, b.speed, dt);
        b.wait -= dt;
        if (b.wait <= 0) {
          if (b.summon) { bossPhase(b, 'roar'); say('ejderha_yarasa', 2); break; }
          const r = Math.random();
          let ph;
          if (d < b.r + 2.6) ph = r < 0.55 ? 'bite' : 'stomp';
          else if (d < 7) ph = r < 0.45 ? 'stomp' : r < 0.8 ? 'breath' : 'fireball';
          else if (d < 11) ph = r < 0.5 ? 'breath' : 'fireball';
          else ph = 'fireball';
          if (ph === b.last && b.last2 === ph) ph = ph === 'fireball' ? 'breath' : 'fireball';
          b.last2 = b.last; b.last = ph;
          bossPhase(b, ph);
          if (ph === 'stomp') { b.tele = fx('telegraph', b.x, b.z, 5.2, 1.1, '#ff4a3a'); }
          if (ph === 'breath') { b.face = faceP; b.tele = fx('telegraphCone', b.x, b.z, b.face, 1.0, 8.5, 0.9, '#b46bff'); }
          if (ph === 'bite') { b.face = faceP; b.tele = fx('telegraphCone', b.x, b.z, b.face, 1.4, b.r + 2.7, 0.65, '#ff5a44'); }
        }
        break;
      }
      case 'fireball': {
        const D = 2.0;
        st.fireball = clamp(b.stT / D, 0, 1);
        if (b.stT < 1.6) b.face = dampAngle(b.face, faceP, 4, dt);
        if (b.stT < 0.8) chargeFxAt(muzzle(b), '#ff7ad6', b.stT / 0.8);   // a pink glow gathers: bubbles are coming
        const shots = [0.8, 1.15, 1.5];
        if (b.did < 3 && b.stT >= shots[b.did]) {
          const m = muzzle(b), spread = [-0.22, 0, 0.22][b.did];
          const a = Math.atan2(P.pos.x - m.x, P.pos.z - m.z) + spread;
          spawnProjectile({ x: m.x, y: Math.max(1, m.y), z: m.z, vx: Math.sin(a) * 5.5, vz: Math.cos(a) * 5.5, r: 0.55, dmg: b.dmg * 0.7,
            owner: 'enemy', kind: 'dragonfire', life: 5, color: SHOT_COL.dragonfire });
          sfx('bubble', { x: b.x, z: b.z, pitch: 0.65 }); b.did++;   // big glittery pink bubbles (not fire)
        }
        if (b.stT >= D) { bossPhase(b, 'idle'); b.wait = frand(1.1, 1.7); }
        break;
      }
      case 'stomp': {
        const D = 1.8, HIT = 1.1;
        st.stomp = clamp(b.stT / D, 0, 1);
        if (b.did === 0 && b.stT >= HIT) {
          b.did = 1; b.tele = null;
          fx('ring', b.x, b.z, { r0: 1, r1: 6, dur: 0.5, color: '#ffcf8a', width: 0.7 });
          burst('dust', b.x, 0.1, b.z, { count: 40, scale: 2 });
          shake(0.45); sfx('slam', { x: b.x, z: b.z });
          if (d < 5.2 + T.heroR * 0.5) hurtPlayer(b.dmg * 1.1, b.x, b.z, 2.5);
        }
        if (b.stT >= D) { bossPhase(b, 'idle'); b.wait = frand(1.1, 1.6); }
        break;
      }
      case 'breath': {
        const D = 2.6, W = 0.9, E = 2.3;
        st.breath = clamp(b.stT / D, 0, 1);
        if (b.stT >= W && b.stT < E) {
          if (b.did === 0) { b.did = 1; b.tele = null; b.tick = 0; b.bubS = b.stT; sfx('bubble', { x: b.x, z: b.z, pitch: 0.6 }); sfx('whoosh', { x: b.x, z: b.z, pitch: 1.2 }); }
          if (b.stT - (b.bubS || 0) > 0.28) { b.bubS = b.stT; sfx('bubble', { x: b.x, z: b.z, vol: 0.6, pitch: frand(0.7, 1.0) }); }
          // A cone of pink/purple soap bubbles (saturated normal-blend rings + a faint pink haze: readable, never an additive
          // white cloud) arcing down from the mouth over the telegraphed cone, with a little glitter (additive sparkles/stars).
          const m = muzzle(b), RING = shape('RING', 0), SPARK = shape('SPARK', 2), STAR = shape('STAR', 1), GLOW = shape('GLOW', 0);
          const hy = m.y - 0.25, vy = -Math.max(0, hy - 1.0) * 1.3;   // they settle at ~1 m height at the far end
          PT.add = false; PT.fade = 4; PT.pop = 0.12;   // bubbles stay clear to the end of the cone, then pop away
          for (let i = 0; i < 2; i++) {
            const a = b.face + frand(-0.42, 0.42), s = frand(9.5, 12.5), c = fpick(BREATH_COL);
            emitP(m.x, hy, m.z, Math.sin(a) * s, vy + frand(-0.6, 0.6), Math.cos(a) * s, frand(0.9, 1.15), frand(0.3, 0.42), frand(0.75, 1.05), c, c, RING, -0.3, 0.6);
          }
          PT.fade = 1; PT.pop = 0;
          if (Math.random() < 0.5) {
            const a = b.face + frand(-0.3, 0.3), s = frand(8, 10);
            PT.alpha = 0.28;
            emitP(m.x, hy, m.z, Math.sin(a) * s, vy, Math.cos(a) * s, frand(0.8, 1.0), 0.6, 1.5, '#ff7ad6', '#c77dff', GLOW, 0, 0.6);
            PT.alpha = 1;
          }
          PT.add = true;
          { const a = b.face + frand(-0.35, 0.35), s = frand(8, 11.5);
            emitP(m.x, hy, m.z, Math.sin(a) * s, vy + frand(-0.5, 0.8), Math.cos(a) * s, frand(0.5, 0.8), frand(0.16, 0.26), 0.04,
              fpick(['#ffc2f2', '#e3b8ff', '#fff0a8']), '#ffffff', Math.random() < 0.3 ? STAR : SPARK, 0, 0.6); }
          b.tick -= dt;
          if (b.tick <= 0) {
            b.tick = 0.3;
            if (d < 8.5 + T.heroR && Math.abs(angDiff(b.face, faceP)) < 0.5) hurtPlayer(b.dmg * 0.4, b.x, b.z, 0.5);
          }
        }
        if (b.stT >= D) { bossPhase(b, 'idle'); b.wait = frand(1.2, 1.8); }
        break;
      }
      case 'bite': {
        const D = 1.25, HIT = 0.65;
        if (b.stT < HIT) st.windup = b.stT / HIT; else st.attack = clamp((b.stT - HIT) / (D - HIT), 0, 1);
        if (b.did === 0 && b.stT >= HIT) {
          b.did = 1; b.tele = null; sfx('bite', { x: b.x, z: b.z }); shake(0.18);
          moveE(b, Math.sin(b.face) * 0.5, Math.cos(b.face) * 0.5);
          if (d < b.r + 2.7 && Math.abs(angDiff(b.face, faceP)) < 0.75) hurtPlayer(b.dmg, b.x, b.z, 1.4);
        }
        if (b.stT >= D) { bossPhase(b, 'idle'); b.wait = frand(1.0, 1.5); }
        break;
      }
    }
  }
  function chargeFxAt(m, col, k) {
    if (Math.random() > 0.6) return;
    const a = frand(0, TAU), r = 1.1 * (1 - k * 0.6);
    emitP(m.x + Math.sin(a) * r, m.y + frand(-0.4, 0.4), m.z + Math.cos(a) * r, -Math.sin(a) * r * 2.5, 0, -Math.cos(a) * r * 2.5, 0.3, 0.2, 0.5, col, '#ffffff', 0);
  }
  function summonBats(b, n) {
    for (let i = 0; i < n; i++) {
      const a = b.face + (i - (n - 1) / 2) * 0.9, x = b.x + Math.sin(a) * (b.r + 2.2), z = b.z + Math.cos(a) * (b.r + 2.2);
      if (!isFloor(x, z)) continue;
      const e = makeEnemy({ type: 'yarasa', x, z, elite: false, pack: 'bossbats', face: a });
      e.xp *= 0.5; e.gold *= 0.5; setAggro(e, false);
      burst('magic', x, 1, z, { color: '#c77dff', count: 16 });
      burst('shadowPuff', x, 0.8, z, {});
    }
    sfx('bat', { x: b.x, z: b.z });
  }
  function bossThresholds(b) {
    const f = b.hp / b.maxHp;
    if (!b.s66 && f <= 0.66) { b.s66 = true; b.summon = 3; }
    if (!b.s33 && f <= 0.33) { b.s33 = true; b.summon = 4; }
    if (!b.s50 && f <= 0.25) { b.s50 = true; say('ejderha_yarim', 2); }   // 'çok az kaldı' must be true
  }

  // ── Damage ──
  function damage(e, amount, o = {}) {
    if (!e || e.dead) return false;
    if (hidden(e) && !o.force) return false;   // a köstebek underground: nothing reaches it
    const x = e.x, z = e.z;
    amount = Math.round(amount || 0);
    if (amount > 0) {
      e.hp -= amount; e.flash = 1; e.hurt = 1; e.bar.delay = 0.45;
      e.flashCol = o.kind === 'sword' ? saberFlashCol() : o.freeze ? '#cfefff' : '#ffffff';   // a lightsaber hit glows in its colour
      if (e.m.flash) e.m.flash(1, e.flashCol);
      if (!o.silent) {
        ftext(x, e.y + e.height + 0.25, z, String(amount), o.crit ? 'crit' : 'dmg');
        if (o.kind && o.kind !== 'sword' && gt - lastSoft > 0.06) { lastSoft = gt; sfx('hitSoft', { x, z, vol: 0.6, pitch: frand(0.9, 1.2) }); }
      }
      if (!e.aggro) setAggro(e);
      if (e.boss) { emit('bossHp', { frac: Math.max(0, e.hp / e.maxHp) }); bossThresholds(e); }
    }
    if (o.kb && o.fromX !== undefined && !e.boss && !(e.bur > 0)) {   // (a köstebek half in the ground is not knocked away)
      const mass = e.type === 'golem' ? 0.3 : e.elite ? 0.5 : 1;
      let dx = x - o.fromX, dz = z - o.fromZ; const d = Math.hypot(dx, dz);
      if (d > 1e-3) { dx /= d; dz /= d; } else { dx = Math.sin(P.face); dz = Math.cos(P.face); }
      e.kvx += dx * o.kb * 9 * mass; e.kvz += dz * o.kb * 9 * mass;
    }
    if (o.stun) { e.stun = Math.max(e.stun, e.boss ? o.stun * 0.3 : o.stun); if (!e.boss) cancelWindup(e); burst('star', x, e.y + e.height + 0.1, z, { count: 4, color: '#fff3a0' }); }
    if (o.freeze) freeze(e, o.freeze);
    if (o.crit && !e.boss && e.kind !== 'slam') cancelWindup(e);
    if (e.hp <= 0) { makeHappy(e, o); return true; }
    return false;
  }
  function makeHappy(e, o = {}) {
    e.dead = true; e.hp = 0;
    if (e.boss) finale = true;   // before its xp: no level-up line may queue in front of the ending
    const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
    remove(e.tele); e.tele = null;
    if (e.ice) { remove(e.ice); e.ice = null; }
    if (e.frozen > 0 && e.m.setTint) e.m.setTint(null);
    e.frozen = 0;
    if (e.aura) { removeObj(e.aura); e.aura = null; }
    if (e.tag) { removeObj(e.tag); e.tag.material.map.dispose(); e.tag.material.dispose(); e.tag = null; }
    if (e.m.setMood) e.m.setMood('happy');
    if (e.m.flash) e.m.flash(0);
    e.dieT = 0; e.dieDur = e.boss ? 3.2 : 1.15;
    dying.push(e);
    const cy = e.y + e.height * 0.7;
    burst('cheer', e.x, cy, e.z, { scale: e.boss ? 3 : e.elite ? 1.6 : 1 });
    burst('sparkle', e.x, cy, e.z, { count: e.elite ? 18 : 10 });
    sfx('pop', { x: e.x, z: e.z, pitch: e.boss ? 0.7 : e.elite ? 0.85 : frand(0.95, 1.2) });
    if (Math.random() < (e.elite ? 0.8 : 0.3) && wordOK()) ftext(e.x, e.y + e.height + 0.7, e.z, fpick(WORDS), 'word');
    hitstop = Math.max(hitstop, 0.06);
    const xp = Math.round(e.xp);
    // the XP bar's star (no letters to read) — only for the big ones: every cheered enemy showing it was just clutter
    if (e.elite || e.boss) later(0.25, () => ftext(e.x, e.y + e.height + 0.4, e.z, '+' + xp + ' ⭐', 'xp'));
    gainXp(xp);
    dropLoot(e);
    if (C.targetE === e) C.targetE = null;
    emit('happy', { type: e.type, x: e.x, z: e.z, elite: e.elite, boss: e.boss });
    cheers.push(gt);
    while (cheers.length && gt - cheers[0] > 2) cheers.shift();
    if ((cheers.length >= 3 || e.elite) && gt - lastPraise > 25) praise();
    if (e.boss) bossDefeated(e);
  }
  let lastPraiseKey = '';
  function praise() {
    if (finale || (boss && boss.aggro)) return;
    lastPraise = gt;
    let k; do { k = 'ovgu' + (1 + Math.floor(Math.random() * 6)); } while (k === lastPraiseKey);
    lastPraiseKey = k; chat(k, 0);
  }
  // Non-story narration (praise, items, chest, level, 'kocaman'): at most one line per `gap` s, none during the
  // dragon fight and none after it (the finale lines must not be buried).
  let lastChat = -99;
  function chat(key, prio = 1, gap = 15, o) {
    if (finale || (boss && boss.aggro && !boss.dead)) return 0;
    if (gt - lastChat < gap) return 0;
    const r = say(key, prio, o);
    if (r) lastChat = gt;
    return r;
  }

  // ── Player ──
  function hurtPlayer(amount, fromX, fromZ, kb = 0.4) {
    if (P.dead || GAME.state !== 'play' || C.invuln > 0) return false;
    if (P.god) return false;
    if (P.shield > 0) { burst('sparkle', P.pos.x, 1, P.pos.z, { color: '#ff8fd8', count: 10 }); sfx('shield', { vol: 0.5 }); return false; }
    const a = Math.max(1, Math.round(amount * (1 - P.armor / 100)));
    P.hp -= a; C.lastHurt = gt; C.hurtT = 1; C.invuln = T.iframes;
    fx('flash', '#ff2a4a', 0.45, 0.4); shake(0.16);
    sfx('hurt', { pitch: frand(0.95, 1.1) });
    burst('hit', P.pos.x, 0.9, P.pos.z, { color: '#ff8aa0', count: 8 });
    if (fromX !== undefined) {
      let dx = P.pos.x - fromX, dz = P.pos.z - fromZ; const d = Math.hypot(dx, dz) || 1;
      C.kbx = dx / d * kb * 8; C.kbz = dz / d * kb * 8;
    }
    emit('hurt', { amount: a });
    if (P.hp <= 0) defeat();
    else if (P.hp < P.maxHp * 0.3 && P.potions > 0 && gt - lastCanAz > 60) { lastCanAz = gt; say('can_az', 2); }
    return true;
  }
  function heal(frac, quiet) {
    const n = Math.round(P.maxHp * frac), before = P.hp;
    P.hp = Math.min(P.maxHp, P.hp + n);
    if (!quiet) { burst('heal', P.pos.x, 0.8, P.pos.z, {}); ftext(P.pos.x, 2.0, P.pos.z, '+' + Math.max(1, Math.round(P.hp - before)), 'heal'); }
  }
  function drinkPotion() {
    if (P.dead || GAME.state !== 'play') return false;
    if (P.potions <= 0) { if (gt - lastPotionMsg > 6) { lastPotionMsg = gt; say('iksir_yok', 2); } sfx('click'); return false; }
    if (P.hp >= P.maxHp) { sfx('click'); return false; }
    P.potions--; heal(0.6); sfx('potion');
    fx('ring', P.pos.x, P.pos.z, { r0: 0.3, r1: 1.8, dur: 0.4, color: '#ff6f91', width: 0.3 });
    emit('potion', { count: P.potions });
    return true;
  }
  function defeat() {
    P.hp = 0; P.dead = true; GAME.state = 'dead'; C.deadT = 0;
    C.swing = null; C.targetE = null; C.targetObj = null; C.hasT = false; C.drag = false; C.queued = false; C.vel = 0;
    C.deathX = P.pos.x; C.deathZ = P.pos.z;
    say('yoruldu', 3); emit('dead', {});
    sfx('saberOff', { vol: 0.7 });   // FEZA retracts the blade while he naps
    burst('zzz', P.pos.x, 1.2, P.pos.z, {});
    if (boss && boss.aggro && !boss.dead) bossTired(boss);
    for (const e of enemies) if (e.aggro) { if (e.boss) bossCalm(e); else calm(e); }
    const at = gt;
    setTimeout(() => { if (P.dead && gt === at && !GAME.paused) respawn(); }, 4500);   // UI stopped ticking us while dead
  }
  function respawn() {
    if (!P.dead) return;
    P.dead = false; P.hp = P.maxHp; GAME.state = 'play'; C.invuln = 2; C.hurtT = 0; C.kbx = C.kbz = 0;
    for (const e of enemies) {
      if (e.boss || dist2(e.x, e.z, C.deathX, C.deathZ) > 18 * 18) continue;
      e.hp = e.maxHp; e.x = e.homeX; e.z = e.homeZ; e.aggro = false; e.token = false; e.walking = false; e.returning = false;
      cancelWindup(e); e.state = 'idle'; e.kvx = e.kvz = 0; e.bar.trail = 1; e.bur = 0; e.upT = 99; place(e);
    }
    for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].owner === 'enemy') killProjectile(i, false);
    const cp = P.checkpoint;
    placeHero(cp.x, cp.z, 0);
    burst('magic', cp.x, 0.8, cp.z, { count: 24 }); burst('sparkle', cp.x, 1.2, cp.z, { count: 16 });
    sfx('checkpoint');
    igniteSaber(0);
    emit('respawn', {});
  }

  function startSwing(targetFace) {
    if (C.swing || P.spin > 0 || P.dead) return;
    C.combo = gt - C.lastSwingEnd < 0.55 ? C.combo + 1 : 0;
    const big = C.combo % 3 === 2;
    C.swing = { t: 0, dur: big ? T.swingBig : T.swing, dir: C.swingDir, big, hit: false, slash: false };
    C.swingDir = -C.swingDir;
    C.swingFace = targetFace === undefined || targetFace === null ? null : targetFace;
    C.idleT = 0;
    sfx(big ? 'swingBig' : 'swing', { pitch: frand(0.92, 1.1), vol: 0.8 });
  }
  // The lightsaber's colour (ITEMS.bladeColor; the rainbow one cycles). Used by the slash, hit sparks and Feza's light.
  const _hsl = new THREE.Color();
  const _fc = new THREE.Color(), _fw = new THREE.Color(1, 1, 1);
  function saberFlashCol() { return '#' + _fc.set(bladeColor()).lerp(_fw, 0.4).getHexString(); }
  function bladeColor(w = P.equip.weapon) {
    if (typeof ITEMS !== 'undefined' && ITEMS && typeof ITEMS.bladeColor === 'function') {
      try { const c = ITEMS.bladeColor(w); if (typeof c === 'string' && c) return c; } catch (err) { warnOnce('ITEMS.bladeColor', err); }
    }
    const id = w && (w.base && w.base.id ? w.base.id : w.base);
    if (id === 'gokkusagi') return '#' + _hsl.setHSL(((typeof TIME !== 'undefined' ? TIME.t : gt) * 0.18) % 1, 1, 0.6).getHexString();
    return BLADE_COL[id] || '#c8f4ff';
  }
  function swingHit(sw) {
    const px = P.pos.x, pz = P.pos.z;
    const reach = T.reach * (sw.big ? 1.12 : 1), arc = T.arc * (sw.big ? 1.15 : 1);
    let hits = 0, crits = 0;
    const list = enemies.slice();
    for (const e of list) {
      if (e.dead || hidden(e)) continue;
      const dx = e.x - px, dz = e.z - pz, d = Math.hypot(dx, dz);
      if (d > reach + e.r) continue;
      if (d > e.r + 0.3 && Math.abs(angDiff(P.face, Math.atan2(dx, dz))) > arc) continue;
      const crit = Math.random() < T.crit;
      const amt = heroDamageNow() * (sw.big ? 1.3 : 1) * (crit ? 2 : 1);
      damage(e, amt, { kb: e.boss ? 0 : sw.big ? 0.8 : 0.45, fromX: px, fromZ: pz, crit, kind: 'sword' });
      const hy = e.y + e.height * 0.5, dl = d || 1, bc = bladeColor();
      const hx = e.x - dx / dl * e.r * 0.6, hz = e.z - dz / dl * e.r * 0.6;
      burst(crit ? 'crit' : 'hit', hx, hy, hz, { dir: { x: dx / dl, z: dz / dl }, color: bc });   // FX: a crackly zap in the blade colour
      hits++; if (crit) crits++;
    }
    // Swatting enemy shots out of the air is fun and forgiving.
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.owner !== 'enemy') continue;
      const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
      if (d < reach + 0.3 && (d < 0.8 || Math.abs(angDiff(P.face, Math.atan2(dx, dz))) < arc)) {
        burst('sparkle', p.x, p.y, p.z, { color: p.color || '#fff', count: 10 });
        if (Math.random() < 0.5 && wordOK()) ftext(p.x, p.y + 0.5, p.z, 'Pof!', 'word');
        killProjectile(i, false); hits++;
      }
    }
    hitBreakables(px + Math.sin(P.face) * 0.9, pz + Math.cos(P.face) * 0.9, reach * 0.75);
    if (hits) {
      hitstop = Math.max(hitstop, crits ? 0.06 : 0.045);
      sfx(crits ? 'crit' : 'hit', { pitch: frand(0.92, 1.12) });
      shake(crits ? 0.14 : 0.05);
    }
  }
  function lungeToward(x, z, maxD) {
    const dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const go = Math.min(maxD, d);
    C.lunge.t = 0.14; C.lunge.vx = dx / d * go / 0.14; C.lunge.vz = dz / d * go / 0.14;
    burst('dust', P.pos.x, 0.05, P.pos.z, { count: 5 });
  }
  function attackButton() {
    if (GAME.state !== 'play' || P.dead || P.spin > 0) return;
    if (C.swing) { C.queued = true; return; }
    C.hasT = false; C.targetObj = null;
    const e = nearestEnemy(P.pos.x, P.pos.z, 4.8);
    let face = null;
    if (e) {
      face = Math.atan2(e.x - P.pos.x, e.z - P.pos.z);
      const gap = Math.hypot(e.x - P.pos.x, e.z - P.pos.z) - e.r - 1.2;
      if (gap > 0.15) lungeToward(e.x, e.z, Math.min(gap, 2.4));
    } else {
      const b = nearestBreakable(P.pos.x, P.pos.z, 2.6);
      if (b) face = Math.atan2(b.x - P.pos.x, b.z - P.pos.z);
    }
    startSwing(face);
  }
  function nearestBreakable(x, z, r) {
    if (!L || !L.breakObjs) return null;
    let best = null, bd = r * r;
    for (const b of L.breakObjs) { if (b.broken) continue; const d = dist2(b.x, b.z, x, z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  function cast(i) {
    const s = GAME.skills[i];
    if (!s || !s.unlocked || s.cd > 0 || P.dead || GAME.state !== 'play') return false;
    const target = nearestEnemy(P.pos.x, P.pos.z, 12);
    let ax = Math.sin(P.face), az = Math.cos(P.face);
    if (target) { const dx = target.x - P.pos.x, dz = target.z - P.pos.z, d = Math.hypot(dx, dz) || 1; ax = dx / d; az = dz / d; }
    let ok = false;
    try { ok = s.def.cast({ P, H, target, aim: { x: ax, z: az }, game: GAME }); } catch (err) { console.error('[GAME] skill ' + (s.def.id || i), err); ok = false; }
    if (ok === false) return false;
    s.cd = s.cdMax = s.def.cd || 1; STATS.casts++;
    C.castT = P.castT > 0 ? -1 : 0; C.idleT = 0; C.swing = null; C.queued = false;
    return true;
  }
  function movePlayer(dx, dz) {
    if (!circleFree(P.pos.x, P.pos.z, T.heroR * 0.8)) {   // overlapping a solid (knocked into a chest…): let him walk out
      if (isFloor(P.pos.x + dx, P.pos.z + dz)) { P.pos.x += dx; P.pos.z += dz; }
      return;
    }
    moveXZ(P.pos, dx, dz, T.heroR);
  }
  const skillsOwnTimers = () => typeof SKILLS_update === 'function';

  function updatePlayer(dt) {
    C.hurtT = Math.max(0, C.hurtT - dt * 3);
    C.invuln = Math.max(0, C.invuln - dt);
    C.cheerT = Math.max(0, C.cheerT - dt);
    if (C.castT >= 0) { C.castT += dt / 0.45; if (C.castT >= 1) C.castT = -1; }
    if (!skillsOwnTimers()) { P.spin = Math.max(0, P.spin - dt); P.shield = Math.max(0, P.shield - dt); }
    for (const s of GAME.skills) if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);

    if (C.swing) {
      const sw = C.swing; sw.t += dt;
      const k = sw.t / sw.dur;
      if (!sw.slash && k >= 0.2) {
        sw.slash = true;
        // a thin bright energy arc in the blade colour (FX reads the options; older FX just gets the colour)
        fx('slash', P.pos.x, 0.8, P.pos.z, P.face, sw.dir, bladeColor(), sw.big ? 2.2 : 1.9, sw.big ? 2.9 : 2.4, { saber: true, energy: true, thin: true });
        R.pulse = Math.max(R.pulse || 0, sw.big ? 1 : 0.7);
      }
      if (!sw.hit && k >= T.hitAt) { sw.hit = true; swingHit(sw); }
      if (k >= 1) {
        C.swing = null; C.lastSwingEnd = gt;
        if (C.targetObj && C.targetObj.type === 'break' && C.targetObj.ref.broken) C.targetObj = null;
        if (C.queued) { C.queued = false; attackButton(); }
      }
    }

    let mx = 0, mz = 0, want = 0, face = null;
    const keyMove = C.keyX !== 0 || C.keyZ !== 0;
    if (keyMove) {
      const l = Math.hypot(C.keyX, C.keyZ); mx = C.keyX / l; mz = C.keyZ / l; want = P.speed * Math.min(1, l);
      C.hasT = false; C.targetE = null; C.targetObj = null;
    } else {
      if (C.drag) {
        const g = typeof groundFromScreen === 'function' ? groundFromScreen(C.sx, C.sy, 0) : null;
        if (g) {
          let dx = g.x - P.pos.x, dz = g.z - P.pos.z; const d = Math.hypot(dx, dz);
          if (d > 30) { dx *= 30 / d; dz *= 30 / d; }
          C.tx = P.pos.x + dx; C.tz = P.pos.z + dz; C.hasT = true;
        }
      }
      if (C.targetE && C.targetE.dead) C.targetE = null;
      const tgt = C.targetE || C.targetObj;
      if (tgt !== C.tgtRef) { C.tgtRef = tgt; C.tgtBest = 1e9; C.tgtStall = 0; C.waitT = 0; }
      if (C.targetE) {
        const e = C.targetE, dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.hypot(dx, dz) || 1e-3;
        if (hidden(e)) {   // a köstebek dug in: follow its mound (it is coming anyway) and whack it when it pops up
          face = Math.atan2(dx, dz);
          if (d > 2.8) { mx = dx / d; mz = dz / d; want = P.speed * 0.8; }
        } else if (d <= T.reach + e.r - 0.3) { face = Math.atan2(dx, dz); if (!C.swing) startSwing(face); C.waitT = 0; }
        else if (C.waitT > 0 || (e.dist < 18 && !e.losOk)) {
          // Behind a wall (it comes round through the flow field) or stuck on something: face it and wait, never push into the wall.
          face = Math.atan2(dx, dz); C.waitT = Math.max(0, C.waitT - dt);
        } else {
          mx = dx / d; mz = dz / d; want = P.speed;
          if (C.blockT > 0.45) { C.waitT = 1.0; C.blockT = 0; }   // not getting anywhere: wait a moment, then try again
        }
      } else if (C.targetObj) {
        const o = C.targetObj, dx = o.x - P.pos.x, dz = o.z - P.pos.z, d = Math.hypot(dx, dz) || 1e-3;
        if (d <= o.reach) { face = Math.atan2(dx, dz); interact(o); }
        else {
          watchTarget(d, dt);
          const useR = o.type === 'break' ? 2.35 + (o.ref.r || 0.4) : o.reach + 0.8;   // a swing reaches ≈ 2.5 m + r
          if (C.tgtStall > 2.0) C.targetObj = null;   // cannot get there: give up rather than walk into a wall forever
          else if (C.tgtStall > 0.3 && d < useR) { face = Math.atan2(dx, dz); interact(o); }   // blocked by a neighbour: use it from here
          else { mx = dx / d; mz = dz / d; want = P.speed; }
        }
      } else if (C.hasT) {
        const dx = C.tx - P.pos.x, dz = C.tz - P.pos.z, d = Math.hypot(dx, dz);
        if (d > (C.drag ? 0.4 : 0.2)) { mx = dx / d; mz = dz / d; want = P.speed * clamp(d / 0.8, 0.35, 1); }
        else if (!C.drag) C.hasT = false;
      }
    }
    // Auto-attack: face a grumpy one and swing. Finger up: anything within T.autoR. Finger held (or keys): only one he
    // touches, ahead of him while he moves (so he fights his way through, but running away still works).
    if (!C.swing && P.spin <= 0 && !C.targetE) {
      const held = C.drag || keyMove, moving = want > 0.01, mf = moving ? Math.atan2(mx, mz) : 0;
      let best = null, bd = 1e9;
      for (const e of enemies) {
        if (!e.m.root.visible || hidden(e)) continue;
        const dx = e.x - P.pos.x, dz = e.z - P.pos.z, cd = Math.hypot(dx, dz);
        if (!held) { const g = cd - e.r; if (g < T.autoR && g < bd) { bd = g; best = e; } continue; }
        const g = cd - e.r - T.heroR;
        if (g >= T.autoDragR || g >= bd) continue;
        if (moving && cd > 1e-3 && Math.abs(angDiff(mf, Math.atan2(dx, dz))) > T.autoDragArc) continue;
        bd = g; best = e;
      }
      if (best) startSwing(Math.atan2(best.x - P.pos.x, best.z - P.pos.z));
    }
    if (C.swing) want *= 0.22;
    if (P.spin > 0) want *= 0.85;
    if (want > 0.01) { C.mdx = mx; C.mdz = mz; if (face === null && !C.swing) face = Math.atan2(mx, mz); }
    C.vel = damp(C.vel, want, want > C.vel ? 12 : 18, dt);
    if (C.vel > 0.01) {
      const ox = P.pos.x, oz = P.pos.z, step = C.vel * dt;
      movePlayer(C.mdx * step, C.mdz * step);
      const moved = Math.hypot(P.pos.x - ox, P.pos.z - oz);
      if (want > 0.01 && C.vel > 1 && moved < step * 0.25) C.blockT += dt; else C.blockT = Math.max(0, C.blockT - dt);
    } else C.blockT = 0;
    if (C.lunge.t > 0) { const k = Math.min(dt, C.lunge.t); movePlayer(C.lunge.vx * k, C.lunge.vz * k); C.lunge.t -= dt; }
    if (C.kbx || C.kbz) {
      movePlayer(C.kbx * dt, C.kbz * dt);
      const k = Math.exp(-10 * dt); C.kbx *= k; C.kbz *= k;
      if (Math.abs(C.kbx) + Math.abs(C.kbz) < 0.05) C.kbx = C.kbz = 0;
    }
    if (C.swing && C.swingFace !== null) face = C.swingFace;
    if (face !== null) P.face = dampAngle(P.face, face, C.swing ? 24 : 14, dt);
    C.idleT = (C.vel > 0.3 || C.swing || C.castT >= 0 || P.spin > 0) ? 0 : C.idleT + dt;
    if (face === null && C.idleT > 1.5 && !C.targetE && !C.targetObj && !C.hasT) {   // nothing to do: turn and look at the kid
      let calmNear = true;
      for (const e of enemies) if (e.dist < 8) { calmNear = false; break; }
      if (calmNear) P.face = dampAngle(P.face, CAM.yaw || 0, 2, dt);
    }
    if (C.vel > 2.5) {   // footsteps: little dust puffs + soft taps
      C.stepT -= dt * C.vel / P.speed;
      if (C.stepT <= 0) { C.stepT = 0.3; C.stepSide = -C.stepSide; burst('step', P.pos.x + Math.cos(P.face) * 0.12 * C.stepSide, 0.04, P.pos.z - Math.sin(P.face) * 0.12 * C.stepSide, {}); sfx('step', { vol: 0.22, pitch: frand(0.9, 1.1) }); }
    } else C.stepT = 0.08;
    if (gt - C.lastHurt > T.regenDelay && P.hp < P.maxHp) {
      let fighting = false;
      for (const e of enemies) if (e.aggro) { fighting = true; break; }
      P.hp = Math.min(P.maxHp, P.hp + P.maxHp * (fighting ? DIFF.regenFight : DIFF.regenCalm) * dt);
    }
    C.playT += dt;
    if (!F.intro0 && C.playT > 40) introFirstSkill();
    proximity(dt);
  }

  function watchTarget(d, dt) { if (d < C.tgtBest - 0.1) { C.tgtBest = d; C.tgtStall = 0; } else C.tgtStall += dt; }

  // ── Interactive objects ──
  function objFromRef(type, ref, reach) { return { type, ref, x: ref.x, z: ref.z, reach }; }
  function interact(o) {
    const r = o.ref;
    if (o.type !== 'break') C.targetObj = null;
    switch (o.type) {
      case 'chest': if (!r.opened) openChest(r); break;
      case 'npc': talkNpc(true); break;
      case 'cp': activateCp(r, true); break;
      case 'portal': enterPortal(); break;
      case 'crystal': victory(); break;
      case 'break':
        if (r.broken) { C.targetObj = null; break; }
        if (!C.swing) startSwing(Math.atan2(r.x - P.pos.x, r.z - P.pos.z));
        break;
    }
  }
  let pathT = 0;
  function proximity(dt) {
    if (!L || GAME.state !== 'play') return;
    const x = P.pos.x, z = P.pos.z;
    if (L.chestObjs) for (const c of L.chestObjs) {   // generous: a kid walking the path should find the treasure
      const rr = c.big ? 2.8 : 2.4;
      if (!c.opened && dist2(c.x, c.z, x, z) < rr * rr && los(x, z, c.x, c.z)) openChest(c);
    }
    pathT -= dt;
    if (pathT <= 0 && pathCum) { pathT = 0.25; const sp = pathProject(x, z, 4); if (sp > pathS) pathS = sp; }
    if (L.cpObjs) for (const cp of L.cpObjs) {   // the whole path width, or simply walking past it on the route
      const d2 = dist2(cp.x, cp.z, x, z);
      if (d2 < 3.2 * 3.2 || (!cp.active && cp._s >= 0 && pathS > cp._s + 0.5 && d2 < 12 * 12)) activateCp(cp, false);
    }
    const po = L.portalObj;
    if (po && po.active !== false) {
      const d2 = dist2(po.x, po.z, x, z);
      if (d2 < 1.35 * 1.35) enterPortal();
      else if (d2 < 9 * 9 && !F.kapi[P.zone]) { F.kapi[P.zone] = true; say('kapi', 1); }
    }
    if (L.npcObj && !F.baykus && dist2(L.npcObj.x, L.npcObj.z, x, z) < 3.6 * 3.6) talkNpc(false);
    if (crystal && crystal.ready && dist2(crystal.x, crystal.z, x, z) < 2.0 * 2.0) victory();
    if (P.zone === 0 && !F.zl[0] && L.start && dist2(L.start.x, L.start.z, x, z) > 14 * 14) {
      F.zl[0] = true; const Z = zdef(0); if (Z.line) say(Z.line, 2, { wait: 40 });   // may wait behind the intro, the owl and the first skill
    }
  }
  function openChest(c) {
    if (c.opened) return;
    try { c.open(); } catch (err) { warnOnce('chest.open', err); }
    c.opened = true;
    sfx('chest', { x: c.x, z: c.z });
    if (!F.sandik) { if (say('sandik', 1)) F.sandik = true; }
    else if (Math.random() < 0.25) chat('sandik', 1);
    C.cheerT = Math.max(C.cheerT, 0.6);
    later(0.45, () => {
      const Z = zdef(), big = !!c.big;
      spawnCoins(c.x, c.z, Math.round((big ? 34 : 16) * (Z.gold || 1) * frand(0.85, 1.2)), big ? 14 : 8);
      if (big || Math.random() < DROP.chest) dropItem(big ? 1.4 : 0.6, c.x, c.z);
      if (big || Math.random() < 0.5) spawnLoot('potion', c.x, c.z);
      if (Math.random() < 0.4 * DIFF.heartDrop) spawnLoot('heart', c.x, c.z);
      burst('sparkle', c.x, 0.9, c.z, { count: 20, color: '#ffe27a' });
    });
  }
  function breakObj(b) {
    if (b.broken) return;
    try { b.break(); } catch (err) { warnOnce('break', err); }
    b.broken = true;
    sfx('break', { x: b.x, z: b.z, pitch: frand(0.9, 1.15) });
    const Z = zdef();
    if (Math.random() < 0.5) spawnCoins(b.x, b.z, Math.round(frand(2, 6) * (Z.gold || 1)), 3);
    if (Math.random() < 0.1 * DIFF.heartDrop) spawnLoot('heart', b.x, b.z);
    else if (Math.random() < 0.03 && P.potions < P.maxPotions) spawnLoot('potion', b.x, b.z);
  }
  function hitBreakables(x, z, r) {
    if (!L || !L.breakObjs) return 0;
    let n = 0;
    for (const b of L.breakObjs) {
      if (b.broken) continue;
      if (dist2(b.x, b.z, x, z) < (r + (b.r || 0.4)) * (r + (b.r || 0.4))) { breakObj(b); n++; }
    }
    return n;
  }
  function activateCp(cp, tapped) {
    const cur = P.checkpoint && Math.abs(P.checkpoint.cx - cp.x) < 0.01 && Math.abs(P.checkpoint.cz - cp.z) < 0.01;
    if (cp.active && cur && !tapped) return;
    const first = !cp.active;
    if (first) { try { cp.activate(); } catch (err) { warnOnce('cp.activate', err); } cp.active = true; }
    let sx = cp.x, sz = cp.z + 1.6;
    if (!circleFree(sx, sz, T.heroR)) {
      const alt = hasLevel() && LEVEL.randomFloorNear ? LEVEL.randomFloorNear(L, cp.x, cp.z, 1.3, 2.6) : null;
      if (alt) { sx = alt.x; sz = alt.z; } else { sx = P.pos.x; sz = P.pos.z; }
    }
    P.checkpoint = { x: sx, z: sz, cx: cp.x, cz: cp.z };
    if (first || tapped) {
      sfx('checkpoint', { x: cp.x, z: cp.z });
      burst('magic', cp.x, 1.2, cp.z, { count: 20, color: '#ff9ae0' });
      heal(1, !first);
      if (!F.nese) { F.nese = true; say('nese_tasi', 2); }
      emit('checkpoint', {});
      save();
    }
  }
  function talkNpc(tapped) {
    if (gt - npcTalkAt < (tapped ? 4 : 8)) return;
    if (tapped && aud('speaking')) return;
    npcTalkAt = gt; F.baykus = true;
    if (L && L.npcObj && C.vel < 0.5 && !C.swing) faceTo(L.npcObj.x, L.npcObj.z);
    const s = say('baykus', 2);
    npcTalkUntil = gt + (s || 5);
  }
  function owlTalking() {   // AUD.current is the key string of the line playing now (null when silent)
    const cur = typeof AUD !== 'undefined' && AUD ? AUD.current : undefined;
    if (typeof cur === 'string') return cur === 'baykus';
    if (cur && typeof cur === 'object') return cur.key === 'baykus';
    return cur === undefined && gt < npcTalkUntil;
  }
  function enterPortal() {
    if (GAME.state !== 'play') return;
    GAME.state = 'transition'; C.transT = 0;
    C.targetE = null; C.targetObj = null; C.hasT = false; C.drag = false; C.swing = null; C.vel = 0;
    sfx('portal');
    burst('portal', P.pos.x, 1, P.pos.z, { count: 30 });
    save();
    emit('portal', {});
    if (!handlers.portal || !handlers.portal.length) later(1.2, () => loadZone(P.zone + 1));   // no UI listening: go on ourselves
  }

  // ── Projectiles (both owners) ──
  function spawnProjectile(o) {
    const p = {
      x: o.x, y: o.y !== undefined ? o.y : 0.9, z: o.z, vx: o.vx || 0, vz: o.vz || 0, r: o.r !== undefined ? o.r : 0.35,
      dmg: o.dmg !== undefined ? o.dmg : 5, owner: o.owner || 'feza', kind: o.kind || 'star', life: o.life !== undefined ? o.life : 3,
      pierce: o.pierce || 0, obj: o.obj || null, color: o.color, onHit: o.onHit || null, kb: o.kb !== undefined ? o.kb : 0.25,
      freeze: o.freeze || 0, stun: o.stun || 0, hit: [], t: 0,
    };
    if (!p.obj) p.obj = fx('projectile', p.kind, p.color);
    if (!p.obj) { p.obj = new THREE.Mesh(G.sphere(12), glowMat(p.color || '#ffd23f', 3)); p.obj.scale.setScalar(p.r * 0.8); }
    if (!p.obj.parent) scene.add(p.obj);
    p.obj.position.set(p.x, p.y, p.z);
    projectiles.push(p);
    return p;
  }
  // Soap bubbles (the snail's, and the dragon's big pink ones) always pop with sparkles: FX pops its own bubble visuals
  // when they leave the scene; a stand-in visual gets the burst from here.
  const isBubble = p => p.kind === 'bubble' || p.kind === 'dragonfire';
  function bubblePop(p) {
    const u = p.obj && p.obj.userData && p.obj.userData.fxp;
    if (!(u && u.pop)) burst('bubblePop', p.x, p.y, p.z, { color: p.color, scale: p.kind === 'dragonfire' ? 1.5 : 1 });
    sfx('bubblePop', { x: p.x, z: p.z, vol: 0.6 });
  }
  function killProjectileObj(p) {
    removeObj(p.obj);
    if (p.obj && p.obj.userData && typeof p.obj.userData.dispose === 'function') { try { p.obj.userData.dispose(); } catch (err) { warnOnce('proj.dispose', err); } }
  }
  function killProjectile(i, poof) {
    const p = projectiles[i];
    if (isBubble(p)) bubblePop(p);
    else if (poof) burst(p.owner === 'feza' ? (p.kind === 'star' ? 'star' : 'sparkle') : 'smoke', p.x, p.y, p.z, { color: p.color, count: 6 });
    killProjectileObj(p);
    projectiles.splice(i, 1);
  }
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t += dt; p.life -= dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (p.kind === 'bubble') { p.by = damp(p.by === undefined ? p.y : p.by, 0.95, 2.5, dt); p.y = p.by + 0.13 * Math.sin(p.t * 5.5); }   // floats and bobs
      else if (p.owner === 'enemy') p.y = damp(p.y, 0.85, 2.5, dt);
      p.obj.position.set(p.x, p.y, p.z);
      if (p.vx || p.vz) p.obj.rotation.y = Math.atan2(p.vx, p.vz);
      fx('trail', p.kind, p.x, p.y, p.z);
      if (p.life <= 0) { killProjectile(i, true); continue; }
      if (!isFloor(p.x, p.z)) { killProjectile(i, true); continue; }
      if (p.owner === 'enemy') {
        if (!P.dead && dist2(p.x, p.z, P.pos.x, P.pos.z) < (p.r + T.heroR) * (p.r + T.heroR)) {
          if (p.onHit) { try { p.onHit(p, null); } catch (err) { warnOnce('onHit', err); } }
          hurtPlayer(p.dmg, p.x - p.vx, p.z - p.vz, 0.3);
          if (!isBubble(p)) burst('hit', p.x, p.y, p.z, { color: p.color, count: 8 });
          killProjectile(i, false);
        }
        continue;
      }
      let dead = false;
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!e || e.dead || hidden(e) || p.hit.indexOf(e) >= 0) continue;
        const rr = p.r + e.r;
        if (dist2(p.x, p.z, e.x, e.z) > rr * rr) continue;
        p.hit.push(e);
        const sp = Math.hypot(p.vx, p.vz) || 1;
        const happy = p.dmg > 0 ? damage(e, p.dmg, { kb: p.kb, fromX: p.x - p.vx / sp, fromZ: p.z - p.vz / sp, kind: p.kind, freeze: p.freeze, stun: p.stun }) : false;
        burst('hit', p.x, p.y, p.z, { color: p.color, count: 6 });
        if (p.onHit) { try { p.onHit(p, e, happy); } catch (err) { warnOnce('onHit', err); } }
        if (p.pierce > 0) p.pierce--; else { dead = true; break; }
      }
      if (dead) { killProjectile(i, true); continue; }
      if (L && L.breakObjs) for (const b of L.breakObjs) {
        if (!b.broken && dist2(p.x, p.z, b.x, b.z) < (p.r + (b.r || 0.4)) * (p.r + (b.r || 0.4))) { breakObj(b); dead = true; break; }
      }
      if (dead) killProjectile(i, true);
    }
  }

  // ── Loot & pickups ──
  // One piece per look in the bag (see DROP): the key of a look, the bag's piece of that look, one lying on the ground.
  const lookKey = it => it.slot + ':' + (it.base && typeof it.base === 'object' ? it.base.id : it.base);
  function ownedLook(item) { const k = lookKey(item); for (const it of P.bag) if (it && lookKey(it) === k) return it; return null; }
  function groundLook(item) { const k = lookKey(item); for (const o of loot) if (o.kind === 'item' && o.item && lookKey(o.item) === k) return o.item; return null; }
  // May `item` replace `have` (same look)? Stronger, never less shiny (the kid's ✦ piece must not turn into a plain one).
  const replaces = (item, have) => item.power > have.power && (item.rarity | 0) >= (have.rarity | 0);
  // Is it worth dropping although Feza has that look? Only if it replaces it (shinier, or clearly stronger) AND he would
  // wear it (stronger than what he wears in that slot) — otherwise it just looks like the same thing dropping again.
  const upgradeOf = (item, have) => replaces(item, have) && ((item.rarity | 0) > (have.rarity | 0) || item.power >= have.power * DROP.upgrade) &&
    item.power > ((P.equip[item.slot] && P.equip[item.slot].power) || 0);
  function rollItem(bias) {
    if (typeof ITEMS === 'undefined' || !ITEMS.roll) return null;
    let up = null;
    for (let i = 0; i < DROP.tries; i++) {
      let it = null;
      try { it = ITEMS.roll(ilvlNow(), clamp(bias, 0, 2)); } catch (err) { warnOnce('ITEMS.roll', err); return null; }
      if (!it || groundLook(it)) continue;        // never two of the same look at once
      const have = ownedLook(it);
      if (!have) return it;                       // a look Feza doesn't have yet
      if (!up && upgradeOf(it, have)) up = it;    // …otherwise maybe a better copy of one he has, which he will wear
    }
    return up;
  }
  // An item drop; when nothing new or better came up, a little gold instead.
  function dropItem(bias, x, z) {
    const it = rollItem(bias);
    if (it) return spawnItem(it, x, z);
    spawnCoins(x, z, Math.round(5 * (zdef().gold || 1) * frand(0.8, 1.25)), 3);
    return null;
  }
  function dropLoot(e) {
    const gold = Math.round(e.gold * frand(0.8, 1.25));
    if (e.boss) {
      spawnCoins(e.x, e.z, gold, 40, 3.5);
      dropItem(2, e.x, e.z);
      for (let i = 0; i < 3; i++) spawnLoot('heart', e.x, e.z);
      return;
    }
    spawnCoins(e.x, e.z, gold);
    const lowHp = P.hp < P.maxHp * 0.5;
    if (Math.random() < (0.16 + (lowHp ? 0.16 : 0)) * DIFF.heartDrop + (e.elite ? 0.5 : 0)) spawnLoot('heart', e.x, e.z);
    let potOnGround = 0; for (const o of loot) if (o.kind === 'potion') potOnGround++;
    if (P.potions + potOnGround < P.maxPotions && Math.random() < (e.elite ? 0.35 : 0.045)) spawnLoot('potion', e.x, e.z);
    if (Math.random() < (e.elite ? DROP.elite : DROP.normal)) dropItem(e.elite ? 1 : 0, e.x, e.z);
  }
  function spawnCoins(x, z, gold, n, spread = 1) {
    gold = Math.max(1, Math.round(gold));
    n = clamp(n || Math.round(gold / 3), 1, Math.min(gold, 40));
    let left = gold;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.max(1, Math.round(gold / n));
      left -= v;
      if (coins.length >= COIN_MAX) { collectCoin(0); }
      const a = frand(0, TAU), s = frand(1.2, 3.0) * spread;
      coins.push({ x, y: 0.6, z, vx: Math.sin(a) * s, vy: frand(4.5, 7), vz: Math.cos(a) * s, value: v, t: 0, rot: frand(0, TAU), mag: false, mt: 0, ph: frand(0, TAU) });
      if (left <= 0) break;
    }
    sfx('drop', { x, z, vol: 0.5, pitch: 1.3 });
  }
  function collectCoin(i) {
    const c = coins[i];
    coins.splice(i, 1);
    P.gold += c.value; goldAcc += c.value; goldAccT = 0.35;
    coinCombo = coinComboT > 0 ? coinCombo + 1 : 0; coinComboT = 0.4;
    sfx('coin', { pitch: 1 + (coinCombo % 8) * 0.06, vol: 0.7 });
    emitP(P.pos.x, 1.1, P.pos.z, frand(-1, 1), frand(1.5, 3), frand(-1, 1), 0.45, 0.28, 0, '#ffe066', '#fff7c2', 2, -2);
    emit('gold', { amount: c.value });
  }
  function updateCoins(dt) {
    const px = P.pos.x, pz = P.pos.z;
    goldAccT -= dt; coinComboT -= dt;
    if (goldAcc && goldAccT <= 0) { ftext(px, 2.1, pz, '+' + goldAcc, 'gold'); goldAcc = 0; }
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.t += dt;
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
      if (!c.mag && c.t > 0.45 && !P.dead && d < T.magnet) c.mag = true;
      if (c.mag) {
        c.mt += dt;
        const sp = Math.min(d, (4 + c.mt * 16) * dt);
        c.x += dx / (d || 1) * sp; c.z += dz / (d || 1) * sp; c.y = damp(c.y, 0.9, 10, dt);
        if (d < 0.45) { collectCoin(i); continue; }
      } else {
        c.vy -= 20 * dt;
        const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
        if (isFloor(nx, c.z)) c.x = nx; else c.vx = -c.vx * 0.5;
        if (isFloor(c.x, nz)) c.z = nz; else c.vz = -c.vz * 0.5;
        c.y += c.vy * dt;
        if (c.y < 0.21) { c.y = 0.21; c.vy = Math.abs(c.vy) > 1 ? -c.vy * 0.38 : 0; c.vx *= 0.55; c.vz *= 0.55; }
      }
      c.rot += dt * (c.mag ? 14 : c.vy ? 8 : 2.6);
    }
    const n = coins.length;
    for (let i = 0; i < n; i++) {
      const c = coins[i], bob = c.vy === 0 && !c.mag ? 0.05 * Math.sin(c.t * 3 + c.ph) + 0.03 : 0;
      _q.setFromEuler(_e.set(0, c.rot, 0));
      _m4.compose(_v.set(c.x, c.y + bob, c.z), _q, _s);
      R.coins.setMatrixAt(i, _m4);
    }
    R.coins.count = n;
    if (n) R.coins.instanceMatrix.needsUpdate = true;
  }
  function itemModel(item) {
    let m = null;
    if (item && typeof ITEMS !== 'undefined' && ITEMS.model) { try { m = ITEMS.model(item); } catch (err) { warnOnce('ITEMS.model', err); } }
    if (!m) m = new THREE.Mesh(G.octa(), glowMat(rarCol(item ? item.rarity : 0), 2));
    const inner = new THREE.Group(); inner.add(m);
    const box = new THREE.Box3().setFromObject(inner), sz = new THREE.Vector3(); box.getSize(sz);
    const k = 0.95 / Math.max(0.2, sz.x, sz.y, sz.z);
    box.getCenter(sz);
    inner.scale.setScalar(k); inner.position.copy(sz).multiplyScalar(-k);
    const wrap = new THREE.Group(); wrap.add(inner);
    shadows(wrap, true, false);
    return wrap;
  }
  function spawnLoot(kind, x, z, item) {
    let main;
    if (kind === 'heart') main = new THREE.Mesh(heartGeo(), R.heartMat);
    else if (kind === 'potion') main = potionTpl().clone();
    else main = itemModel(item);
    if (kind === 'heart') main.castShadow = true;
    const obj = new THREE.Group();
    const col = kind === 'item' ? rarCol(item ? item.rarity : 0) : kind === 'heart' ? '#ff4d7a' : '#ff5d7d';
    const ring = decal(lootRingMat(col), kind === 'item' ? 1.15 : 1.05); ring.position.y = 0.04;
    const blob = decal(R.blobMat, kind === 'item' ? 1.0 : 0.7); blob.position.y = 0.03; blob.renderOrder = 1;
    obj.add(blob, ring, main); scene.add(obj);
    const a = frand(0, TAU), s = frand(0.9, 2.2);
    const o = { kind, obj, main, ring, item, x, z, y: 0.7, vx: Math.sin(a) * s, vz: Math.cos(a) * s, vy: frand(4.5, 6), t: 0, landed: false, beam: null, ph: frand(0, TAU), mag: false };
    loot.push(o);
    return o;
  }
  function spawnItem(item, x, z) {
    if (!item) return null;
    const o = spawnLoot('item', x, z, item);
    const r = item.rarity || 0;
    sfx(r >= 3 ? 'dropLegend' : r >= 2 ? 'dropRare' : 'drop', { x, z });
    if (r >= 3) later(0.4, () => { if (!finale) say('efsane', 2); burst('confetti', x, 1.5, z, {}); });
    return o;
  }
  function updateLoot(dt) {
    const px = P.pos.x, pz = P.pos.z;
    for (let i = loot.length - 1; i >= 0; i--) {
      const o = loot[i];
      o.t += dt;
      const hoverY = o.kind === 'item' ? 0.62 : o.kind === 'heart' ? 0.55 : 0.12;
      const dx = px - o.x, dz = pz - o.z, d = Math.hypot(dx, dz);
      const canTake = o.kind !== 'potion' || P.potions < P.maxPotions;
      if (!o.landed) {
        o.vy -= 18 * dt;
        const nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
        if (isFloor(nx, o.z)) o.x = nx; else o.vx = 0;
        if (isFloor(o.x, nz)) o.z = nz; else o.vz = 0;
        o.y += o.vy * dt;
        if (o.y <= hoverY && o.vy < 0) {
          o.y = hoverY; o.landed = true;
          if (o.kind === 'item') {
            const r = o.item ? o.item.rarity || 0 : 0;
            o.beam = fx('beam', o.x, o.z, rarCol(r), 2.4 + r * 0.9);
            burst('sparkle', o.x, 0.5, o.z, { color: rarCol(r), count: 8 + r * 6 });
          }
        }
      } else if (!P.dead && canTake && d < T.magnet && o.t > 0.6) o.mag = true;   // hearts, items (and potions if there is room) fly to Feza
      if (o.mag) {
        const sp = Math.min(d, (4 + o.t * 6) * dt);
        o.x += dx / (d || 1) * sp; o.z += dz / (d || 1) * sp;
      }
      const bob = o.landed ? 0.07 * Math.sin(o.t * 2.6 + o.ph) : 0;
      o.obj.position.set(o.x, 0, o.z);
      o.main.position.y = o.y + bob;
      if (o.kind === 'heart') o.main.rotation.set(-0.5, (CAM.yaw || 0) + 0.55 * Math.sin(o.t * 2.2 + o.ph), 0);
      else { o.main.rotation.y += dt * (o.kind === 'item' ? 1.3 : 1.8); if (o.kind === 'item') o.main.rotation.z = 0.35 * Math.sin(o.t * 1.3); }
      o.ring.scale.setScalar((o.kind === 'item' ? 1.15 : 1.05) * (1 + 0.08 * Math.sin(o.t * 4 + o.ph)));
      if (o.beam && o.beam.obj) o.beam.obj.position.set(o.x, o.beam.obj.position.y, o.z);
      if (o.kind === 'item' && o.item && o.item.rarity >= 2 && Math.random() < dt * 6)
        emitP(o.x + frand(-0.4, 0.4), 0.3, o.z + frand(-0.4, 0.4), 0, frand(0.8, 1.6), 0, 0.9, 0.22, 0, rarCol(o.item.rarity), '#ffffff', 2);
      const pickR = o.kind === 'item' ? 1.05 : 0.85;
      if (o.t > 0.55 && !P.dead && canTake && d < pickR) { pickLoot(o); loot.splice(i, 1); }
    }
  }
  function pickLoot(o) {
    removeObj(o.obj); remove(o.beam);
    if (o.kind === 'heart') {
      heal(DIFF.heart); sfx('heart');
    } else if (o.kind === 'potion') {
      P.potions = Math.min(P.maxPotions, P.potions + 1); sfx('potion', { pitch: 1.2 });
      ftext(P.pos.x, 2.0, P.pos.z, '+1 İksir', 'heal');
      emit('potion', { count: P.potions });
    } else if (o.item) {
      burst('sparkle', P.pos.x, 1, P.pos.z, { color: rarCol(o.item.rarity), count: 16 });
      sfx('star', { pitch: 1.1 });
      addItem(o.item);
    }
  }
  function addItem(item, force) {
    if (!item) return;
    const old = ownedLook(item);
    if (old && old !== item) {   // one piece per look: the stronger copy takes the old one's place (worn → stays worn)
      if (!force && !replaces(item, old)) {   // not stronger, or less shiny (the rolls avoid this): a few coins instead
        const g = Math.max(3, Math.round(item.power / 2));
        P.gold += g; ftext(P.pos.x, 2.1, P.pos.z, '+' + g, 'gold'); sfx('coin', { vol: 0.7 }); emit('gold', { amount: g });
        saveSoon();
        return;
      }
      P.bag[P.bag.indexOf(old)] = item;
    } else if (P.bag.indexOf(item) < 0) P.bag.push(item);
    const cur = P.equip[item.slot];
    const better = force || !cur || item.power > cur.power;
    if (better) equip(item, true);
    emit('item', { item, equipped: better });
    if (better && (item.rarity || 0) < 3) {   // once per slot per zone (shiny ones always), never over the dragon fight
      const line = item.slot === 'weapon' ? 'kilic' : item.slot === 'hat' ? 'sapka' : 'pelerin';
      if (!ZF['l_' + line] || (item.rarity || 0) >= 2) { if (chat(line, 1, (item.rarity || 0) >= 2 ? 6 : 15)) ZF['l_' + line] = true; }
    }
    if (!better && !F.canta && item.slot !== 'weapon' && !finale) { F.canta = true; later(1.5, () => say('canta', 1)); }
    saveSoon();
  }
  function equip(item, quiet) {
    if (!item || !item.slot) return;
    if (P.bag.indexOf(item) < 0) P.bag.push(item);
    const newBlade = item.slot === 'weapon' && P.equip.weapon !== item;
    P.equip[item.slot] = item;
    recalcStats();
    if (newBlade && GAME.state !== 'title') { sfx('saberOn', { vol: 0.8 }); R.pulse = 1; }   // FEZA.setEquip ignites the new blade
    if (H) { try { H.setEquip(P.equip); } catch (err) { warnOnce('H.setEquip', err); } }
    burst('sparkle', P.pos.x, 1.0, P.pos.z, { color: rarCol(item.rarity || 0), count: 14 });
    if (!quiet) sfx('click');
    C.cheerT = Math.max(C.cheerT, 0.7);
    emit('equip', { item, slot: item.slot });
    saveSoon();
  }
  function unequip(slot) {
    if (slot === 'weapon' || !P.equip[slot]) return;
    P.equip[slot] = null; recalcStats();
    if (H) H.setEquip(P.equip);
    emit('equip', { item: null, slot });
    saveSoon();
  }

  // ── XP, levels, skills ──
  function gainXp(n) {
    n = Math.max(0, Math.round(n));
    P.xp += n;
    let ups = 0;
    while (P.xp >= P.xpNext) { P.xp -= P.xpNext; P.lvl++; P.xpNext = xpFor(P.lvl); ups++; }
    if (ups) levelUp();
  }
  function levelUp() {
    recalcStats(); P.hp = P.maxHp;
    const x = P.pos.x, z = P.pos.z;
    burst('levelup', x, 0.1, z, {});
    fx('ring', x, z, { r0: 0.4, r1: 4.5, dur: 0.6, color: '#ffe066', width: 0.5 });
    fx('lightFlash', x, z, '#ffe8a0', 5, 0.5);
    const beam = fx('beam', x, z, '#ffd23f', 5);
    if (beam) later(1.3, () => remove(beam));
    ftext(x, 2.6, z, 'Seviye ' + P.lvl + '!', 'word');
    sfx('levelup');
    if (!GAME.skills.some((s, i) => canUnlock(s, i))) chat('seviye' + (1 + (P.lvl % 3)), 2, 6);   // a new skill's line matters more
    C.cheerT = 1.4;
    emit('levelup', { lvl: P.lvl });
    checkUnlocks(true);
    save();
  }
  // Skills unlock by level (SKILLS[i].lvl); the first one waits for the first fight (see introFirstSkill) unless lvl ≥ 2.
  const canUnlock = (s, i) => !s.unlocked && P.lvl >= (s.def.lvl || 1) && (i > 0 || !!F.intro0 || P.lvl >= 2);
  function checkUnlocks(announce) {
    GAME.skills.forEach((s, i) => {
      if (!canUnlock(s, i)) return;
      s.unlocked = true; s.cd = 0;
      if (announce) { later(0.3 + i * 0.05, () => sfx('unlock')); if (!finale && s.def.line) say(s.def.line, 2, { wait: 40 }); emit('skill', { index: i }); }   // teaches the new button: never dropped
    });
  }
  function introFirstSkill() {
    if (F.intro0) return;
    F.intro0 = true;
    later(1.2, () => checkUnlocks(true));
  }

  // ── Dragon's end, crystal, victory ──
  function bossDefeated(b) {
    emit('boss', { on: false });
    finale = true;
    aud('stopVoice');   // drop stale fight lines ('çok az kaldı', level-ups…): the story lines come next
    say('ejderha_bitti', 3);
    shake(0.4); C.cheerT = 2.5;
    burst('confetti', b.x, 3, b.z, {}); burst('confetti', P.pos.x, 2.5, P.pos.z, {});
    // everyone nearby cheers up too (directly: damage() would wake them and announce elites 'geliyor!')
    for (const e of enemies.slice()) if (!e.dead && dist2(e.x, e.z, b.x, b.z) < 30 * 30) makeHappy(e, { silent: true });   // (makeHappy directly: hidden() never blocks it)
    aud('music', zdef().music || 'kale');
  }
  function bossTransformed(b) {
    burst('magic', b.x, 1.5, b.z, { count: 40, color: '#ffb0f0' }); burst('sparkle', b.x, 1.5, b.z, { count: 30 });
    fx('lightFlash', b.x, b.z, '#ffc0f0', 6, 0.6);
    // Parent's wish: the dragon cheers up and goes on its way — no little dragon following Feza around afterwards.
    later(0.6, spawnCrystal);
    saveSoon();
  }
  function spawnCrystal() {
    if (crystal || !L) return;
    const spot = L.crystalSpot || (L.boss ? { x: L.boss.x, z: L.boss.z - 5 } : { x: P.pos.x, z: P.pos.z - 4 });
    let obj = null;
    if (typeof EMODEL !== 'undefined' && EMODEL.crystal) { try { obj = EMODEL.crystal(); } catch (err) { warnOnce('EMODEL.crystal', err); } }
    if (!obj) { obj = new THREE.Mesh(G.octa(), glowMat('#ff8fd8', 2.5)); obj.scale.set(0.8, 1.4, 0.8); obj.position.y = 1.4; }
    const g = new THREE.Group(); g.add(obj); g.position.set(spot.x, -3, spot.z); scene.add(g);
    crystal = { obj: g, x: spot.x, z: spot.z, t: 0, ready: false, beam: fx('beam', spot.x, spot.z, '#ff8fd8', 7) };
    burst('magic', spot.x, 1, spot.z, { count: 30, color: '#ff8fd8' });
    sfx('unlock');
  }
  function updateCrystal(dt) {
    if (!crystal) return;
    crystal.t += dt;
    const k = smooth01(crystal.t / 1.8);
    crystal.obj.position.y = -3 + 3 * k + (k >= 1 ? 0.12 * Math.sin(crystal.t * 2) : 0);
    crystal.obj.rotation.y += dt * 0.7;
    if (k >= 1 && !crystal.ready) { crystal.ready = true; say('kristal', 3); }   // 'touch it' only once it can be touched
    if (Math.random() < dt * 10) emitP(crystal.x + frand(-1, 1), frand(0.3, 2.5), crystal.z + frand(-1, 1), 0, frand(0.5, 1.2), 0, 1, 0.3, 0, '#ff9ae0', '#ffffff', 2);
  }
  function victory() {
    if (GAME.state === 'end') return;
    GAME.state = 'end'; C.cheerT = 1e9;
    C.targetE = null; C.targetObj = null; C.hasT = false; C.drag = false; C.swing = null; C.vel = 0;
    if (crystal) faceTo(crystal.x, crystal.z);
    emit('victory', {});
    aud('stopVoice');   // nothing stale may follow the ending line
    say('son', 3);
    aud('music', 'zafer');
    for (let i = 0; i < 5; i++) later(i * 0.6, () => { burst('confetti', P.pos.x + frand(-3, 3), 3, P.pos.z + frand(-3, 3), {}); sfx('cheer', { vol: 0.5 }); });
    writeSave(Object.assign(snapshot(), { zone: 0, ng: P.ng + 1, plus: true }));
  }
  function faceTo(x, z) { P.face = Math.atan2(x - P.pos.x, z - P.pos.z); }

  // ── Queries for SKILLS / UI ──
  function enemiesNear(x, z, r) {
    const out = [];
    for (const e of enemies) { const rr = r + e.r * 0.5; if (dist2(e.x, e.z, x, z) <= rr * rr && e.m.root.visible && !hidden(e)) out.push(e); }
    return out;
  }
  function nearestEnemy(x, z, maxR) {
    let best = null, bd = maxR * maxR;
    for (const e of enemies) {
      if (!e.m.root.visible || hidden(e)) continue;
      const d = dist2(e.x, e.z, x, z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ── Input (UI forwards pointer/keyboard here) ──
  let pickD = 1e9;   // screen distance of the last pick (enemy vs object arbitration)
  function pickEnemy(sx, sy) {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      if (!e.m.root.visible || hidden(e)) continue;
      toScreen(_v.set(e.x, e.y + e.height * 0.5, e.z), _scr);
      if (!_scr.vis) continue;
      const lim = 70 * (e.boss ? 2.4 : e.elite ? 1.3 : 1), d = Math.hypot(_scr.x - sx, _scr.y - sy);
      if (d < lim && d < bd) { bd = d; best = e; }
    }
    pickD = bd;
    return best;
  }
  function pickObject(sx, sy) {
    if (!L) return null;
    let best = null, bd = 1e9;
    const test = (type, ref, y, lim, reach) => {
      toScreen(_v.set(ref.x, y, ref.z), _scr);
      if (!_scr.vis) return;
      const d = Math.hypot(_scr.x - sx, _scr.y - sy);
      if (d < lim && d < bd) { bd = d; best = objFromRef(type, ref, reach); }
    };
    if (L.chestObjs) for (const c of L.chestObjs) if (!c.opened) test('chest', c, 0.5, 80, c.big ? 1.75 : 1.4);
    if (L.breakObjs) for (const b of L.breakObjs) if (!b.broken) test('break', b, 0.5, 60, 2.2 + (b.r || 0.4));   // a swing reaches ≈ 2.5 m + r
    if (L.cpObjs) for (const c of L.cpObjs) test('cp', c, 1.0, 75, 1.8);
    if (L.npcObj) test('npc', L.npcObj, 1.0, 85, 2.6);
    if (L.portalObj && L.portalObj.active !== false) test('portal', L.portalObj, 1.2, 90, 1.2);
    if (crystal && crystal.ready) test('crystal', crystal, 1.5, 100, 1.9);
    pickD = bd;
    return best;
  }
  const input = {
    down(sx, sy) {
      if (GAME.state !== 'play' || P.dead || GAME.paused) return 'move';
      C.sx = C.downSx = sx; C.sy = C.downSy = sy; C.keyX = C.keyZ = 0;
      let e = pickEnemy(sx, sy);
      const ed = pickD;
      const o = pickObject(sx, sy);
      if (e && o && pickD + 25 < ed) e = null;   // clearly aimed at the chest/portal, not the enemy beside it
      if (e) {
        C.targetE = e; C.targetObj = null; C.drag = false; C.hasT = false; C.mode = 'enemy';
        if (!e.aggro && !e.boss && !los(P.pos.x, P.pos.z, e.x, e.z)) { setAggro(e); e.losOk = false; e.losT = 0.3; }   // behind a wall: it notices Feza and comes round
        fx('ring', e.x, e.z, { r0: e.r, r1: e.r + 0.9, dur: 0.3, color: '#ff8a4a', width: 0.2 });
        return 'enemy';
      }
      if (o) {
        C.targetObj = o; C.targetE = null; C.drag = false; C.hasT = false; C.mode = 'object';
        fx('ring', o.x, o.z, { r0: 0.4, r1: 1.4, dur: 0.35, color: '#ffd84a', width: 0.2 });
        return 'object';
      }
      C.drag = true; C.mode = 'move'; C.targetE = null; C.targetObj = null;
      const g = typeof groundFromScreen === 'function' ? groundFromScreen(sx, sy, 0) : null;
      if (g) { C.tx = g.x; C.tz = g.z; C.hasT = true; fx('ring', g.x, g.z, { r0: 0.1, r1: 0.75, dur: 0.3, color: '#8fe8ff', width: 0.14 }); }
      return 'move';
    },
    move(sx, sy) {
      C.sx = sx; C.sy = sy;
      // a finger that follows a hopping enemy keeps attacking it; only a real drag turns into walking
      if (C.mode && C.mode !== 'move' && Math.hypot(sx - C.downSx, sy - C.downSy) > 90) { C.mode = 'move'; C.drag = true; C.targetE = null; C.targetObj = null; }
    },
    up() { C.drag = false; C.mode = null; },
    key(x, z) {
      x = x || 0; z = z || 0;
      const yaw = CAM.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
      C.keyX = x * c + z * s; C.keyZ = -x * s + z * c;
      if (x || z) { C.drag = false; }
    },
    attack() { attackButton(); },
    cast(i) { return cast(i); },
    potion() { return drinkPotion(); },
  };

  // ── Save / load ──
  function plainItem(it) {
    const o = {};
    for (const k in it) { const v = it[k]; if (v === null || typeof v !== 'object' && typeof v !== 'function') o[k] = v; else if (k === 'base' && v && v.id) o[k] = v.id; }
    return o;
  }
  function snapshot() {
    return {
      v: 1, t: Date.now(), zone: P.zone, lvl: P.lvl, xp: P.xp, gold: P.gold, potions: P.potions, ng: P.ng,
      bag: P.bag.map(plainItem),
      equip: { weapon: P.bag.indexOf(P.equip.weapon), hat: P.bag.indexOf(P.equip.hat), cape: P.bag.indexOf(P.equip.cape) },
      skills: GAME.skills.map(s => !!s.unlocked),
      flags: { intro0: !!F.intro0, baykus: !!F.baykus, sandik: !!F.sandik, nese: !!F.nese, canta: !!F.canta, zl0: !!(F.zl && F.zl[0]),
        ilk_kostebek: !!F.ilk_kostebek, ilk_salyangoz: !!F.ilk_salyangoz },
    };
  }
  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); lastSave = gt; saveAt = -1; return true; } catch (err) { warnOnce('save', err); return false; }
  }
  function save() {
    if (GAME.state === 'title' || GAME.state === 'end' || (L && L._title)) return false;   // 'end': the victory save (new game+) stands
    return writeSave(snapshot());
  }
  function saveSoon() { if (saveAt < 0) saveAt = gt + Math.max(0.5, 2 - (gt - lastSave)); }
  function readSave() {
    try { return cleanSave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch (err) { return null; }
  }
  // A save from an older build or a corrupted one must never softlock 'Devam Et': numbers must be finite, the bag an
  // array of known items; unknown items are dropped and equip slots that point at the wrong kind of item are emptied.
  function cleanSave(s) {
    if (!s || typeof s !== 'object' || s.v !== 1) return null;
    const num = (v, d) => (v === undefined || v === null ? d : typeof v === 'number' && isFinite(v) ? v : NaN);
    const lvl = num(s.lvl, 1), xp = num(s.xp, 0), gold = num(s.gold, 0), potions = num(s.potions, DIFF.potions), ng = num(s.ng, 0), zone = num(s.zone, 0);
    if ([lvl, xp, gold, potions, ng, zone].some(v => Number.isNaN(v))) return null;
    if (s.bag !== undefined && s.bag !== null && !Array.isArray(s.bag)) return null;
    const B = typeof ITEMS !== 'undefined' && ITEMS && ITEMS.BASES;
    const baseOf = it => (it.base && typeof it.base === 'object' ? it.base.id : it.base);
    const okItem = it => !!it && typeof it === 'object' && ['weapon', 'hat', 'cape'].indexOf(it.slot) >= 0 && typeof it.power === 'number' && isFinite(it.power) &&
      typeof baseOf(it) === 'string' && (!B || !B[it.slot] || B[it.slot].some(b => b.id === baseOf(it)));
    const raw = s.bag || [], bag = [], at = new Map();
    raw.forEach((it, i) => {
      if (!okItem(it)) return;
      const c = Object.assign({}, it, { base: baseOf(it), rarity: clamp(it.rarity | 0, 0, 3), ilvl: Math.max(1, it.ilvl | 0 || 1), power: Math.max(0, Math.round(it.power)) });
      // today's name (a save from the test build still says 'Demir Kılıç ✦': every sword is a lightsaber now)
      let nm = null;
      if (typeof ITEMS !== 'undefined' && ITEMS && typeof ITEMS.nameOf === 'function') { try { nm = ITEMS.nameOf(c); } catch (err) { warnOnce('ITEMS.nameOf', err); } }
      c.ad = typeof nm === 'string' && nm ? nm : typeof c.ad === 'string' ? c.ad : c.base;
      at.set(i, bag.length); bag.push(c);
    });
    const eqIn = s.equip && typeof s.equip === 'object' ? s.equip : {}, equip = {};
    for (const slot of ['weapon', 'hat', 'cape']) {
      const j = eqIn[slot], k = Number.isInteger(j) && at.has(j) ? at.get(j) : -1;
      equip[slot] = k >= 0 && bag[k].slot === slot ? k : -1;
    }
    // One piece per look (older builds kept every copy): the shiniest copy stays, then the strongest (same look, so a
    // copy that loses is plainer or weaker); a worn copy that goes hands its slot to the one that stays.
    const keepFirst = (a, b) => ((bag[a].rarity - bag[b].rarity) || (bag[a].power - bag[b].power)) > 0;
    const best = new Map();
    bag.forEach((c, k) => { const key = lookKey(c), j = best.get(key); if (j === undefined || keepFirst(k, j)) best.set(key, k); });
    const slim = [], re = bag.map(() => -1);
    bag.forEach((c, k) => { if (best.get(lookKey(c)) === k) { re[k] = slim.length; slim.push(c); } });
    bag.forEach((c, k) => { if (re[k] < 0) re[k] = re[best.get(lookKey(c))]; });
    for (const slot of ['weapon', 'hat', 'cape']) if (equip[slot] >= 0) equip[slot] = re[equip[slot]];
    const L1 = clamp(Math.floor(lvl), 1, 99);
    return Object.assign({}, s, {
      lvl: L1, xp: clamp(Math.floor(xp), 0, xpFor(L1) - 1), gold: Math.max(0, Math.floor(gold)), potions: clamp(Math.floor(potions), 0, P.maxPotions),
      ng: clamp(Math.floor(ng), 0, 99), zone: Math.max(0, Math.floor(zone)), bag: slim, equip,
      skills: Array.isArray(s.skills) ? s.skills : [], flags: s.flags && typeof s.flags === 'object' ? s.flags : {},
    });
  }
  function applySave(s) {
    P.lvl = s.lvl || 1; P.xp = s.xp || 0; P.gold = s.gold || 0; P.potions = clamp(s.potions ?? DIFF.potions, 0, P.maxPotions); P.ng = s.ng || 0;
    P.bag = (s.bag || []).filter(Boolean);
    const eq = s.equip || {};
    P.equip = { weapon: P.bag[eq.weapon] || null, hat: P.bag[eq.hat] || null, cape: P.bag[eq.cape] || null };
    if (!P.equip.weapon && typeof ITEMS !== 'undefined' && ITEMS.starter) { const w = ITEMS.starter().weapon; if (w) { P.bag.push(w); P.equip.weapon = w; } }
    const fl = s.flags || {};
    // Skills come from the level (saves by index are unreliable: the skill list changed from 6 to 3).
    GAME.skills.forEach((sk, i) => { sk.cd = 0; sk.unlocked = i === 0 ? !!(fl.intro0 || P.lvl >= 2 || (s.skills && s.skills[0])) : P.lvl >= (sk.def.lvl || 1); });
    F = { zl: { 0: !!fl.zl0 }, kapi: {}, intro0: !!fl.intro0, baykus: !!fl.baykus, sandik: !!fl.sandik, nese: !!fl.nese, canta: !!fl.canta,
      ilk_kostebek: !!fl.ilk_kostebek, ilk_salyangoz: !!fl.ilk_salyangoz };
    P.dead = false; P.spin = 0; P.shield = 0;
    recalcStats(); P.hp = P.maxHp;
    if (H) H.setEquip(P.equip);
    checkUnlocks(false);
  }

  // ── Game flow ──
  function useTitleLevel() { return L && L._title && P.zone === 0; }
  function startHere() {   // turn the idle title level into the playable zone 0
    P.zone = 0;
    const st = L.start || { x: 0, z: 0 };
    P.checkpoint = { x: st.x, z: st.z };
    placeHero(st.x, st.z, 0);
    populate();
    GAME.state = 'play';
    emit('zone', { index: 0, name: zdef(0).ad, title: false });
    enterZoneStory(0);
  }
  function newGame(o = {}) {
    if (!inited) init();
    const plus = o.plus !== undefined ? !!o.plus : GAME.state === 'end';
    if (plus) {
      P.ng++; P.dead = false; P.potions = Math.max(P.potions, DIFF.potions);
      for (const s of GAME.skills) s.cd = 0;
      F.zl = {}; F.kapi = {};
      recalcStats(); P.hp = P.maxHp;
    } else resetPlayer();
    C.playT = 0; C.lastHurt = gt - 99;
    if (!plus && useTitleLevel()) startHere(); else loadZone(0);
    if (plus) say('tekrar', 3);
    else { say('giris1', 3); say('giris2', 3); }
    save();
  }
  function continueGame() {
    if (!inited) init();
    const s = readSave();
    if (!s) { GAME.clearSave(); newGame({ plus: false }); return; }
    try { applySave(s); } catch (err) {   // never leave the kid on a dead HUD: start fresh instead
      console.warn('[GAME] unusable save, starting a new game', err);
      GAME.clearSave(); newGame({ plus: false }); return;
    }
    C.playT = 0; C.lastHurt = gt - 99;
    if (s.zone === 0 && useTitleLevel()) startHere(); else loadZone(s.zone || 0);
    say(s.plus ? 'tekrar' : 'hos_geldin', 3);
  }

  function later(t, fn) { timers.push({ t: gt + t, fn }); }
  function runTimers() {
    for (let i = timers.length - 1; i >= 0; i--) {
      const tm = timers[i];
      if (!tm || tm.t > gt) continue;   // a timer may have cleared the list (zone change)
      timers.splice(i, 1);
      try { tm.fn(); } catch (err) { console.error('[GAME] timer', err); }
    }
  }
  function updateMarkers(dt) {
    const mk = R.marker;
    const show = C.hasT && !C.targetE && !C.targetObj && GAME.state === 'play';
    if (show) {
      if (!mk.visible) { mk.visible = true; R.markerT = 0; }
      R.markerT += dt;
      mk.position.set(C.tx, 0, C.tz);
      const k = 1 - Math.exp(-R.markerT * 12);
      mk.children[0].scale.setScalar(0.5 + 0.45 * k + 0.06 * Math.sin(R.markerT * 8));
      mk.children[0].rotation.z += dt * 1.5;
    } else mk.visible = false;
    const e = C.targetE;
    if (e && !e.dead && GAME.state === 'play') {
      R.sel.visible = true; R.sel.position.set(e.x, 0.05, e.z);
      R.sel.scale.setScalar(e.r * 2.6 + 0.5 + 0.08 * Math.sin(gt * 7)); R.sel.rotation.z -= dt * 1.2;
    } else R.sel.visible = false;
  }
  // Feza's rectangle on screen (px), to dim bars and name tags that would cover him.
  const FR = { x0: 0, x1: 0, y0: 0, y1: 0, ppm: 0, ok: false };
  const _cr = new THREE.Vector3();
  function fezaRect() {
    FR.ok = false;
    if (typeof toScreen !== 'function') return;
    toScreen(_v.set(P.pos.x, 0.05, P.pos.z), _scr); const fx0 = _scr.x, fy = _scr.y;
    if (!_scr.vis) return;
    toScreen(_v.set(P.pos.x, 1.6, P.pos.z), _scr); const hy = _scr.y;
    _cr.setFromMatrixColumn(camera.matrixWorld, 0);   // camera right
    toScreen(_v.set(P.pos.x + _cr.x, 0.8, P.pos.z + _cr.z), _scr); const rx = _scr.x;
    toScreen(_v.set(P.pos.x, 0.8, P.pos.z), _scr);
    FR.ppm = Math.abs(rx - _scr.x);
    const hw = FR.ppm * 0.42;
    FR.x0 = fx0 - hw; FR.x1 = fx0 + hw; FR.y0 = Math.min(hy, fy); FR.y1 = Math.max(hy, fy) + FR.ppm * 0.12; FR.ok = true;
  }
  function coversFeza(x, y, z, hwM, hhM) {
    if (!FR.ok) return false;
    toScreen(_v.set(x, y, z), _scr);
    if (!_scr.vis) return false;
    const hw = hwM * FR.ppm, hh = hhM * FR.ppm;
    return _scr.x + hw > FR.x0 && _scr.x - hw < FR.x1 && _scr.y + hh > FR.y0 && _scr.y - hh < FR.y1;
  }
  function updateBars(dt) {
    const a = R.barAttr, af = R.barFade;
    let n = 0;
    fezaRect();
    for (const e of enemies) {
      if (e.boss || !e.m.root.visible) continue;
      if (e.bur > 0.5) { if (e.tag) e.tag.visible = false; continue; }   // underground: only the dirt mound shows
      const frac = Math.max(0, e.hp / e.maxHp);
      if (e.bar.delay > 0) e.bar.delay -= dt; else e.bar.trail = damp(e.bar.trail, frac, 5, dt);
      if (e.bar.trail < frac) e.bar.trail = frac;
      const near = e.aggro || e.dist < 14;   // an idle elite in the next room must not float its name over the wall
      const showBar = !(frac >= 0.999 && !(e.elite && near));
      const by = e.y + e.height + 0.32;
      let cover = false;
      if (e.dist < 9) {
        if (showBar) cover = coversFeza(e.x, by, e.z, e.elite ? 0.75 : 0.52, 0.12);
        if (!cover && e.tag && e.tag.visible) cover = coversFeza(e.x, e.y + e.height + 0.78, e.z, 1.1, 0.24);
      }
      e.fade = damp(e.fade, cover ? 0.25 : 1, 10, dt);
      if (e.tag) {   // name while it is idle nearby and for 3 s after it notices Feza; then only the bar
        e.tag.visible = near && (!e.aggro || gt - e.aggroAt < 3);
        e.tag.material.opacity = e.fade;
      }
      if (!showBar) continue;
      _m4.makeTranslation(e.x, by, e.z);
      R.bars.setMatrixAt(n, _m4);
      a.setXYZW(n, frac, e.bar.trail, e.elite ? 1 : 0, e.elite ? 1.45 : 1);
      af.setX(n, e.fade);
      if (++n >= BAR_MAX) break;
    }
    R.bars.count = n;
    if (n) { R.bars.instanceMatrix.needsUpdate = true; a.needsUpdate = true; af.needsUpdate = true; }
  }
  function updateHero(dt) {
    if (!H) return;
    const castP = P.castT > 0 && P.castDur ? 1 - P.castT / P.castDur : C.castT;
    HST.move = clamp(C.vel / P.speed, 0, 1);
    HST.attack = C.swing ? clamp(C.swing.t / C.swing.dur, 0, 1) : -1;
    HST.swingDir = C.swing ? C.swing.dir : C.swingDir;
    HST.cast = castP >= 0 && castP < 1 ? castP : -1;
    HST.spin = P.spin > 0; HST.hurt = C.hurtT; HST.dead = P.dead; HST.cheer = C.cheerT > 0; HST.idleT = C.idleT;
    H.root.position.copy(P.pos); H.root.rotation.y = P.face;
    bladeLight(dt);
    try { H.update(dt, HST); } catch (err) { warnOnce('H.update', err); }
  }
  // Feza's light takes the lightsaber's colour: clearly in the dark cave/castle (the theme light is tinted and a bit
  // brighter), subtly in the sunny forest (a small coloured glow around him). Slashes pulse it; it fades while he naps.
  const _lbc = new THREE.Color();
  function fezaLightBase() {
    if (typeof LIGHTS === 'undefined' || !LIGHTS.feza) return;
    const l = LIGHTS.feza;
    R.fezaBase = { c: l.color.clone(), i: l.intensity, d: l.distance, k: l.decay };
  }
  function bladeLight(dt) {
    if (typeof LIGHTS === 'undefined' || !LIGHTS.feza) return;
    const l = LIGHTS.feza;
    l.position.set(P.pos.x, 2.4, P.pos.z + 0.6);   // hero light (dark levels)
    const base = R.fezaBase;
    if (!base) return;
    const on = !P.dead && GAME.state !== 'transition' && H && H.bladeOn !== false && !!P.equip.weapon;
    R.bladeK = damp(R.bladeK || 0, on ? 1 : 0, on ? 5 : 8, dt);
    R.pulse = Math.max(0, (R.pulse || 0) - dt * 4);
    const k = R.bladeK, dark = base.i > 0.05;
    _lbc.set(bladeColor());
    l.color.copy(base.c).lerp(_lbc, (dark ? 0.6 : 1) * k);
    if (dark) { l.intensity = base.i * (1 + 0.12 * k + 0.3 * R.pulse) + (1.0 + 1.2 * R.pulse) * k; l.distance = base.d; l.decay = base.k; }
    else { l.intensity = (0.7 + 1.4 * R.pulse) * k; l.distance = 5; l.decay = 1.6; }
  }
  function igniteSaber(delay = 0) {
    const go = () => {
      if (!H || P.dead || GAME.state === 'title') return;
      if (typeof H.ignite === 'function') { try { H.ignite(); } catch (err) { warnOnce('H.ignite', err); } }
      sfx('saberOn', { vol: 0.85 }); R.pulse = 1;
    };
    if (delay > 0) later(delay, go); else go();
  }

  // One simulation step. UI calls it every frame while a game is running (states play/dead/transition/end).
  function update(dt) {
    if (!inited || GAME.paused || GAME.state === 'title') return;
    if (hitstop > 0) { hitstop -= dt; dt *= 0.1; }
    gt += dt;
    GAME.time = gt;
    runTimers();
    const st = GAME.state;
    if (st === 'play') updatePlayer(dt);
    else {
      C.hurtT = Math.max(0, C.hurtT - dt * 3); C.vel = damp(C.vel, 0, 10, dt); C.swing = null;
      if (st === 'dead') { C.deadT += dt; if (C.deadT >= T.respawn) respawn(); }
      if (st === 'transition' && H) { C.transT += dt; H.root.scale.setScalar(baseScale * Math.max(0.05, 1 - C.transT / 0.7)); P.face += dt * 12; }
    }
    if (L) {
      actT -= dt; if (actT <= 0) { actT = 0.3; activate(false); }
      tokT -= dt; if (tokT <= 0) { tokT = 0.2; assignTokens(); }
      flowT -= dt;
      if (flowT <= 0 && hasLevel() && LEVEL.flowTo && !P.dead) {
        flowT = 0.22;
        const cx = Math.floor(P.pos.x), cz = Math.floor(P.pos.z);
        let chasing = false;
        for (const e of enemies) if (e.aggro && !e.boss) { chasing = true; break; }
        if (chasing && (cx !== flowCx || cz !== flowCz || gt - flowAt > 1)) { flowCx = cx; flowCz = cz; flowAt = gt; LEVEL.flowTo(L, P.pos.x, P.pos.z); }
      }
    }
    const canTarget = st === 'play' && !P.dead;
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i]) enemyStep(enemies[i], dt, canTarget);
    separate();
    for (let i = dying.length - 1; i >= 0; i--) {
      const e = dying[i], s = e.st;
      e.dieT += dt / e.dieDur; e.t += dt;
      s.dying = Math.min(1, e.dieT); s.t = e.t; s.move = 0; s.windup = -1; s.attack = -1; s.frozen = false; s.hurt = 0;
      if (e.boss) s.breath = s.stomp = s.roar = s.fireball = -1;
      if (e.fly) e.y = Math.max(0.1, e.y - dt * 0.4);
      if (e.bur > 0) e.bur = Math.max(0, e.bur - dt / riseT(e));   // a happy köstebek pops out of the ground to celebrate
      place(e); anim(e, dt);
      if (e.dieT >= 1) {
        burst('sparkle', e.x, e.y + e.height * 0.4, e.z, { count: e.boss ? 40 : 12 });
        dying.splice(i, 1); dropEnemy(e);
        if (e.boss) bossTransformed(e);
      }
    }
    updateProjectiles(dt);
    updateCoins(dt);
    updateLoot(dt);
    updateCrystal(dt);
    if (L && L.npcObj && L.npcObj.model && L.npcObj.model.anim) { try { L.npcObj.model.anim(dt, owlTalking()); } catch (err) { warnOnce('owl.anim', err); } }
    if (typeof SKILLS_update === 'function') { try { SKILLS_update(dt); } catch (err) { warnOnce('SKILLS_update', err); } }
    updateMarkers(dt);
    updateBars(dt);
    updateHero(dt);
    if (saveAt >= 0 && gt >= saveAt && st === 'play') save();
  }
  function titleUpdate(dt) {
    if (!inited) return;
    C.vel = 0; C.swing = null; C.hurtT = 0; C.cheerT = 0; C.idleT += dt;
    P.face = dampAngle(P.face, 0, 3, dt);
    if (L && L.npcObj && L.npcObj.model && L.npcObj.model.anim) { try { L.npcObj.model.anim(dt, owlTalking()); } catch (err) { warnOnce('owl.anim', err); } }
    updateHero(dt);
  }

  function init() {
    if (inited) return;
    inited = true;
    makeResources();
    if (typeof FEZA !== 'undefined' && FEZA.create) { try { H = FEZA.create(); } catch (err) { console.error('[GAME] FEZA.create', err); } }
    if (!H || !H.root) H = fallbackHero();
    GAME.H = H;
    baseScale = H.root.scale.x || 1;
    scene.add(H.root);
    if (H.setXray) { try { H.setXray(true); } catch (err) { warnOnce('setXray', err); } }
    buildSkills();
    resetPlayer();
    const s = readSave();   // title screen: wear the saved outfit
    if (s && s.bag) {
      const eq = s.equip || {}, bag = s.bag;
      const wear = { weapon: bag[eq.weapon] || P.equip.weapon, hat: bag[eq.hat] || null, cape: bag[eq.cape] || null };
      R.titleWear = wear;
      try { H.setEquip(wear); } catch (err) { warnOnce('setEquip', err); }
    }
  }

  // ── Debug hooks (always on) ──
  function bossZone() { const Z = zones(); if (!Z) return 0; const i = Z.findIndex(z => z.boss); return i >= 0 ? i : Z.length - 1; }
  window.__T = {
    god(onv = true) { P.god = !!onv; return P.god; },
    tp(x, z) {
      if (!circleFree(x, z, T.heroR) && hasLevel() && LEVEL.randomFloorNear) { const f = LEVEL.randomFloorNear(L, x, z, 0.3, 3); if (f) { x = f.x; z = f.z; } }
      if (!circleFree(x, z, T.heroR)) {   // still inside a wall/solid: nearest free spot on growing rings
        search: for (let r = 0.5; r <= 5; r += 0.5) for (let k = 0; k < 16; k++) {
          const a = k / 16 * TAU, qx = x + Math.sin(a) * r, qz = z + Math.cos(a) * r;
          if (circleFree(qx, qz, T.heroR)) { x = qx; z = qz; break search; }
        }
      }
      placeHero(x, z, P.face); C.hasT = false; C.targetE = null; C.targetObj = null; activate(true, 12); },
    xp(n = 100) { gainXp(n); return P.lvl; },
    zone(i) { if (GAME.state === 'title') { resetPlayer(); } return loadZone(i); },
    kill() { let n = 0; for (const e of enemies.slice()) { if (damage(e, e.hp + 1, { silent: true, force: true })) n++; } return n; },
    give(slot = 'weapon', baseId, rarity = 2) {
      if (typeof ITEMS === 'undefined' || !ITEMS.make) return null;
      const bases = (ITEMS.BASES && ITEMS.BASES[slot]) || [];
      const id = baseId || (bases[bases.length - 1] && bases[bases.length - 1].id);
      const it = ITEMS.make(slot, id, rarity, ilvlNow());
      addItem(it, true);
      return it;
    },
    boss() {
      const bz = bossZone();
      if (P.zone !== bz || GAME.state === 'title') { if (GAME.state === 'title') resetPlayer(); loadZone(bz); }
      if (!boss) return null;
      window.__T.tp(boss.x, boss.z + boss.r + 8);
      return boss;
    },
    // extras for tests
    spawn(type = 'jole', x = P.pos.x, z = P.pos.z - 4, elite = false) { return makeEnemy({ type, x, z, elite: !!elite, pack: 'dbg', face: Math.atan2(P.pos.x - x, P.pos.z - z) }); },
    blade() { return bladeColor(); },
    hidden(e) { return !!e && hidden(e); },
    stats() { return Object.assign({}, STATS); },
    fr() { return Object.assign({}, FR); },
    hurt(n = 10) { const g = P.god; P.god = false; C.invuln = 0; const r = hurtPlayer(n); P.god = g; return r; },
    win() { if (boss && !boss.dead) damage(boss, boss.hp + 1, { silent: true }); return !!boss; },
    victory() { victory(); },
    loot(x = P.pos.x, z = P.pos.z, what = 'all') {
      const all = what === 'all', mk = (sl, id, r) => (typeof ITEMS !== 'undefined' && ITEMS.make ? ITEMS.make(sl, id, r, ilvlNow()) : null);
      if (all || what === 'coins') spawnCoins(x, z, 24, 10);
      if (all || what === 'heart') spawnLoot('heart', x, z);
      if (all || what === 'potion') spawnLoot('potion', x, z);
      if (all) { spawnItem(rollItem(2), x, z); spawnItem(mk('weapon', 'gokkusagi', 3), x, z); }
      if (typeof what === 'object' && what) spawnItem(mk(what.slot, what.id, what.rarity || 0), x, z);
    },
    state() {
      return { state: GAME.state, zone: P.zone, lvl: P.lvl, xp: P.xp, hp: Math.round(P.hp), maxHp: P.maxHp, gold: P.gold, potions: P.potions,
        dmg: P.dmg, enemies: enemies.length, sleepers: sleepers.length, dying: dying.length, proj: projectiles.length, coins: coins.length,
        loot: loot.length, crystal: crystal ? (crystal.ready ? 'ready' : 'rising') : null, boss: boss ? Math.round(boss.hp) + '/' + boss.maxHp + ' ' + boss.ph : null, pos: [+P.pos.x.toFixed(2), +P.pos.z.toFixed(2)] };
    },
  };

  const GAME = {
    P, H: null, enemies, L: null, state: 'title', paused: false, skills: [], boss: null, time: 0,
    init, newGame, continueGame, hasSave: () => !!readSave(), save, clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* private mode */ } },
    loadZone, update, titleUpdate, input, equip: item => equip(item), unequip, drinkPotion, addItem, cast,
    on, emit, enemiesNear, nearestEnemy, damage, spawnProjectile, hitBreakables, heroDamageNow, hurtPlayer, heal,
    xpFor, projectiles, loot, coins, wordOK,
  };
  return GAME;
})();
