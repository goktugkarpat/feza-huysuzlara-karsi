/* ── Düşmanlar: istatistikler (EDEF) + modeller ve animasyonlar (EMODEL) ──
   Her karakter tek bir iskeletli örgüdür (SkinnedMesh): parçalar Kit ile tek geometride birleşir, hareketli parçalar
   kemiklere bağlıdır → düşman başına 1 çizim çağrısı. Geometriler tür+varyant+elit başına önbellekte (huysuz/mutlu yüz
   için iki geometri), bütün örnekler paylaşır; her örneğin kendi malzemesi var (vuruş parlaması, buz rengi).
   Feza'nın isteği: hepsi sevimli ve gülümseyen. 'grumpy' yüz = haylaz-oyuncu (kocaman gözler, kalkık kaş, yamuk sırıtış,
   dil ucu), 'happy' yüz = çok mutlu (^ ^ gözler, kocaman gülüş, pembe yanak, kalpler). Örümcek yok; mağarada köstebek
   (toprağa dalar: st.burrow) ve salyangoz (baloncuk üfler, canı yanınca kabuğuna saklanır) var. */

// Base stats (zone 1 scale; GAME multiplies by zone and its DIFF table). hover = flying height of the model origin.
// Feza's request: no spiders any more (orumcek removed); the cave has moles (kostebek) and snails (salyangoz).
const EDEF = {
  jole:    { ad: 'Jöle', hp: 22, dmg: 5, speed: 2.6, r: 0.5, height: 0.78, xp: 10, gold: 3, kind: 'melee', atkRange: 0.9, atkCd: 1.6, windup: 0.6, fly: false, aggro: 8.5, variants: ['green', 'pink', 'blue', 'purple'] },
  mantar:  { ad: 'Huysuz Mantar', hp: 26, dmg: 6, speed: 1.8, r: 0.5, height: 1.02, xp: 12, gold: 3, kind: 'ranged', atkRange: 7, atkCd: 2.4, windup: 0.7, fly: false, aggro: 9, shot: { kind: 'spore', speed: 5.5, r: 0.32 } },
  yarasa:  { ad: 'Yarasa', hp: 12, dmg: 4, speed: 4.4, r: 0.45, height: 0.62, xp: 8, gold: 2, kind: 'melee', atkRange: 0.9, atkCd: 1.5, windup: 0.5, fly: true, hover: 0.9, aggro: 10 },
  goblin:  { ad: 'Haylaz Goblin', hp: 38, dmg: 8, speed: 2.9, r: 0.55, height: 1.22, xp: 16, gold: 5, kind: 'melee', atkRange: 1.1, atkCd: 1.8, windup: 0.65, fly: false, aggro: 9 },
  // kind 'burrow': when aggro and far it digs in (st.burrow 0→1), travels underground, pops up near Feza (1→0 = wind-up), bonks
  kostebek: { ad: 'Köstebek', hp: 30, dmg: 7, speed: 3.2, r: 0.5, height: 0.9, xp: 14, gold: 1, kind: 'burrow', atkRange: 1.4, atkCd: 1.6, windup: 0.6, fly: false, aggro: 9, burrowIn: 0.4, burrowOut: 0.35 },
  salyangoz: { ad: 'Salyangoz', hp: 40, dmg: 6, speed: 1.2, r: 0.6, height: 0.9, xp: 16, gold: 1, kind: 'ranged', atkRange: 6.5, range: 6.5, atkCd: 2.6, windup: 0.7, fly: false, aggro: 9, shot: { kind: 'bubble', speed: 4.5, r: 0.35 } },
  hayalet: { ad: 'Hayalet', hp: 30, dmg: 7, speed: 2.2, r: 0.5, height: 1.12, xp: 14, gold: 4, kind: 'ranged', atkRange: 6.5, atkCd: 2.6, windup: 0.75, fly: true, hover: 0.35, aggro: 9, shot: { kind: 'ghost', speed: 5, r: 0.32 } },
  golem:   { ad: 'Kaya Devi', hp: 140, dmg: 14, speed: 1.5, r: 1.1, height: 2.45, xp: 45, gold: 12, kind: 'slam', atkRange: 2.6, atkCd: 2.8, windup: 1.0, fly: false, aggro: 9, slamR: 2.2 },
  asker:   { ad: 'Teneke Asker', hp: 55, dmg: 10, speed: 2.6, r: 0.55, height: 1.6, xp: 22, gold: 6, kind: 'melee', atkRange: 1.2, atkCd: 1.9, windup: 0.7, fly: false, aggro: 9 },
  atescik: { ad: 'Ateşçik', hp: 32, dmg: 8, speed: 2.4, r: 0.5, height: 0.95, xp: 16, gold: 4, kind: 'ranged', atkRange: 7, atkCd: 2.5, windup: 0.7, fly: true, hover: 0.3, aggro: 9, shot: { kind: 'fire', speed: 5.5, r: 0.32 } },
  ejderha: { ad: 'Huysuz Ejderha', hp: 1600, dmg: 16, speed: 1.6, r: 2.2, height: 4.6, xp: 600, gold: 150, kind: 'boss', atkRange: 3, atkCd: 1.5, windup: 0.8, fly: false, aggro: 14, shot: { kind: 'dragonfire', speed: 5.5, r: 0.55 } },
};

const EMODEL = (function (G0) {
  'use strict';
  const PI = Math.PI;

  // ── Level of detail: builders ask for segment counts; they are scaled by LODK (set per character type while it is
  // built) so a character stays about 5-8k triangles (dragon about 20k). The shared core cache G0 keeps every variant. ──
  const LOD = { ejderha: 0.72, baby: 0.7, owl: 1 };
  let LODK = 1;
  const sN = (n, min) => Math.max(min, Math.round(n * LODK));
  const G = {
    sphere: (w = 20, h) => G0.sphere(sN(w, 6), sN(h ?? Math.max(6, Math.round(w * 0.7)), 4)),
    hemi: (w = 20) => G0.hemi(sN(w, 8)),
    cyl: (rt = 1, rb = 1, seg = 16, open = false) => G0.cyl(rt, rb, sN(seg, 5), open),
    cone: (seg = 12) => G0.cone(seg <= 4 ? seg : sN(seg, 6)),
    rbox: (seg = 2) => G0.rbox(LODK < 0.8 ? Math.max(1, seg - 1) : seg),
    torus: (arc = TAU, tube = 0.25, seg = 16) => {
      const rs = sN(8, 5), ts = sN(seg, 6);
      return gx(`T${arc.toFixed(3)}_${tube}_${rs}_${ts}`, () => new THREE.TorusGeometry(1, tube, rs, ts, arc));
    },
    box: G0.box, octa: G0.octa, ico: G0.ico, dodeca: G0.dodeca, capsule: G0.capsule,
  };

  // ── Surface patch: per-vertex flags aFx = (unlit 0..1, gloss 0..1 | 2 = metal, texture mask, wobble weight) ──
  const V_DECL = 'attribute vec4 aFx; varying vec4 vFx; uniform float uT; uniform vec4 uWob;';
  const V_BEGIN = `vFx = aFx;
    if (aFx.w > 0.0) {
      float wp = uT * uWob.z + uWob.w; vec3 wq = position * uWob.y;
      transformed += vec3(sin(wp + wq.y + wq.z * 0.7), 0.35 * sin(wp * 0.83 + wq.x * 1.3 + wq.y), cos(wp * 1.13 + wq.y * 0.9 + wq.x * 0.8)) * (uWob.x * aFx.w);
    }`;
  const F_DECL = 'varying vec4 vFx; uniform vec3 uSss; uniform vec4 uFl;';
  // Hit flash (uFl = colour, amount): lift the albedo toward the flash colour and add a little warm light. It stays lit, so
  // form and texture remain readable and nothing blooms; very dark albedo (pupils, brows, lash lines) is masked out so the
  // face stays readable too.
  const F_FLASH = `float flM = uFl.a * smoothstep(0.008, 0.06, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
    diffuseColor.rgb = mix(diffuseColor.rgb, uFl.rgb, flM * 0.3 * (1.0 - vFx.x));`;
  const F_MAP = '#ifdef USE_MAP\n diffuseColor *= mix(vec4(1.0), texture2D(map, vMapUv), vFx.z);\n#endif';
  const F_ROUGH = `{ float gl = min(vFx.y, 1.0), mt = step(1.5, vFx.y);
    roughnessFactor = mix(roughnessFactor, mix(0.1, 0.28, mt), gl); metalnessFactor = max(metalnessFactor, mt); }`;
  const F_NORM = THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vFx.z;');
  // (rimColor/rimPow come from core rimify, composed on every enemy material; the rim is damped while flashing)
  const F_OUT = `outgoingLight += uSss * diffuseColor.rgb * pow(saturate(dot(normal, normalize(vViewPosition))), 1.6);
    outgoingLight -= rimColor * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), rimPow) * (0.75 * uFl.a);
    outgoingLight = mix(outgoingLight, diffuseColor.rgb + totalEmissiveRadiance, vFx.x);
    outgoingLight += uFl.rgb * vec3(1.0, 0.9, 0.78) * (flM * 0.16);`;
  function surfPatch(mat, U) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + V_DECL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + V_BEGIN);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + F_DECL)
        .replace('#include <map_fragment>', F_MAP)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + F_FLASH)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + F_ROUGH)
        .replace('#include <normal_fragment_maps>', F_NORM)
        .replace('#include <opaque_fragment>', F_OUT + '\n#include <opaque_fragment>');
      prev.call(mat, sh, r);
    };
    const k = (mat.userData.pkey || '') + '|efx';
    mat.userData.pkey = k;
    mat.customProgramCacheKey = () => k;
    return mat;
  }
  // One material per character instance (flash/tint are per instance; the shader program is shared).
  function eMat(o = {}) {
    const p = { roughness: o.rough ?? 0.45, metalness: 0 };
    if (o.tex) {
      if (o.tex.map) p.map = o.tex.map;
      if (o.tex.normalMap) { p.normalMap = o.tex.normalMap; p.normalScale = new THREE.Vector2(o.ns ?? 1, o.ns ?? 1); }
    }
    const mat = vcMat(p);
    const U = {
      uT: TIME.u,
      uWob: { value: new THREE.Vector4(o.wob || 0, o.wobF || 3, o.wobS || 3, Math.random() * 20) },
      uSss: { value: new THREE.Color(o.sss ?? 0) },
      uFl: { value: new THREE.Vector4(1, 1, 1, 0) },
    };
    surfPatch(mat, U);
    rimify(mat, o.rim ?? 0xffffff, o.rimK ?? 0.26, o.rimP ?? 2.6);
    mat.userData.U = U;
    return mat;
  }
  function texOf(name) {
    if (typeof TEX === 'undefined' || !TEX || !TEX[name]) return null;
    return TEX.rep ? (TEX.rep(name, 1, 1) || TEX[name]) : TEX[name];
  }

  // ── Colour + math helpers ──
  const col = h => new THREE.Color(h);
  const hdr = (h, k) => new THREE.Color(h).multiplyScalar(k);
  const mixc = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  function rich(h, ks = 1.22, kl = 0.9) {   // elites: deeper, more saturated colours
    const c = new THREE.Color(h), hsl = {}; c.getHSL(hsl);
    return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * ks), hsl.l * kl);
  }
  // Vertical gradient colour function for Kit (stops: [[t, colour], ...] over y0..y1).
  function vgrad(y0, y1, stops) {
    const cs = stops.map(s => [s[0], s[1] && s[1].isColor ? s[1] : new THREE.Color(s[1])]), out = new THREE.Color();
    return (x, y) => {
      const t = clamp((y - y0) / (y1 - y0), 0, 1);
      let i = 0; while (i < cs.length - 2 && t > cs[i + 1][0]) i++;
      const a = cs[i], b = cs[i + 1];
      return out.copy(a[1]).lerp(b[1], smooth01((t - a[0]) / Math.max(1e-5, b[0] - a[0])));
    };
  }
  const _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);
  // Quaternion turning +z to the direction n (then spinning around it).
  function qz(nx, ny, nz, spin = 0) {
    const q = new THREE.Quaternion().setFromUnitVectors(_Z, new THREE.Vector3(nx, ny, nz).normalize());
    if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, spin));
    return q;
  }
  const qy = (dx, dy, dz) => new THREE.Quaternion().setFromUnitVectors(_Y, new THREE.Vector3(dx, dy, dz).normalize());
  // Basis quaternion: local +y along yDir, local +z as close as possible to zDir.
  function qb(yDir, zDir) {
    const y = new THREE.Vector3(...yDir).normalize(), z0 = new THREE.Vector3(...zDir);
    const x = new THREE.Vector3().crossVectors(y, z0).normalize(), z = new THREE.Vector3().crossVectors(x, y);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  function hash3(x, y, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = smooth01(x - xi), v = smooth01(y - yi), w = smooth01(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
      l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
  }
  const fbm3 = (x, y, z) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.28 + vnoise(x * 4.3, y * 4.3 + 9, z * 4.3) * 0.12;

  // ── Own geometry cache (never disposed; shared by all instances) ──
  const GX = {};
  function gx(key, make) { let g = GX[key]; if (!g) { g = GX[key] = make(); g.userData.keep = true; } return g; }
  // Average normals of coincident vertices (removes lighting seams of displaced spheres / lathes).
  function seamNormals(g) {
    const p = g.attributes.position, n = g.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      let a = map.get(k); if (!a) map.set(k, a = []); a.push(i);
    }
    for (const a of map.values()) {
      if (a.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of a) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); }
      const l = Math.hypot(x, y, z) || 1;
      for (const i of a) n.setXYZ(i, x / l, y / l, z / l);
    }
    return g;
  }
  // Non-indexed geometry → normals smoothed only across edges flatter than `angle` (keeps crisp creases).
  function creased(g, angle = 0.6) {
    if (g.index) g = g.toNonIndexed();
    const p = g.attributes.position, cnt = p.count, nf = cnt / 3, fn = new Float32Array(nf * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let f = 0; f < nf; f++) {
      a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
      b.sub(a); c.sub(a); b.cross(c); const l = b.length() || 1;
      fn[f * 3] = b.x / l; fn[f * 3 + 1] = b.y / l; fn[f * 3 + 2] = b.z / l;
    }
    const map = new Map();
    for (let i = 0; i < cnt; i++) {
      const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      let arr = map.get(k); if (!arr) map.set(k, arr = []); arr.push(i);
    }
    const nrm = new Float32Array(cnt * 3), ca = Math.cos(angle);
    for (const arr of map.values()) {
      for (const i of arr) {
        const fi = (i / 3) | 0; let x = 0, y = 0, z = 0;
        for (const j of arr) {
          const fj = (j / 3) | 0;
          if (fn[fi * 3] * fn[fj * 3] + fn[fi * 3 + 1] * fn[fj * 3 + 1] + fn[fi * 3 + 2] * fn[fj * 3 + 2] >= ca) { x += fn[fj * 3]; y += fn[fj * 3 + 1]; z += fn[fj * 3 + 2]; }
        }
        const l = Math.hypot(x, y, z) || 1;
        nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
      }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
    return g;
  }
  // Smooth lathe from a profile [[radius, y], ...] ordered bottom → top (outward normals).
  function lathe(key, pts, seg = 40, smooth = 5) {
    const sg = sN(seg, 10), sm = smooth ? Math.max(2, Math.round(smooth * LODK)) : 0;
    return gx('L' + key + '@' + sg + '_' + sm, () => {
      let v = pts.map(p => new THREE.Vector2(p[0], p[1]));
      if (sm) v = new THREE.SplineCurve(v).getPoints(v.length * sm);
      v.forEach(q => { q.x = Math.max(0, q.x); });
      return seamNormals(new THREE.LatheGeometry(v, sg));
    });
  }
  // Point on a lathe surface at height y and azimuth a (0 = +z): [pos, normal] (profile pts as in lathe()).
  function onLathe(pts, y, a, out = 0) {
    const v = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(pts.length * 12);
    let i = 0; while (i < v.length - 2 && v[i + 1].y < y) i++;
    const p0 = v[i], p1 = v[i + 1], t = clamp((y - p0.y) / ((p1.y - p0.y) || 1e-6), 0, 1), rr = lerp(p0.x, p1.x, t);
    const dx = p1.x - p0.x, dy = p1.y - p0.y, nl = Math.hypot(dx, dy) || 1, nr = dy / nl, ny = -dx / nl;
    const sx = Math.sin(a), cz = Math.cos(a);
    return [[sx * (rr + nr * out), y + ny * out, cz * (rr + nr * out)], [sx * nr, ny, cz * nr]];
  }
  function extrude(key, makeShape, depth, bevel, curveSeg = 10, angle = 0.62) {
    const cs = sN(curveSeg, 3), bs = LODK < 0.8 ? 2 : 3;
    return gx('X' + key + '@' + cs + '_' + bs, () => {
      const g = new THREE.ExtrudeGeometry(makeShape(), {
        depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: bs, curveSegments: cs,
      });
      g.translate(0, 0, -depth / 2);
      return creased(g, angle);
    });
  }
  // Chunky cut-stone boulder: sphere pushed by noise and flattened by a few random planes.
  function rockGeo(seed, fine) {
    const w = fine ? sN(34, 12) : sN(22, 10), h = fine ? sN(24, 8) : sN(15, 7);
    return gx('R' + seed + (fine ? 'f' : '') + '@' + w, () => {
      const g = new THREE.SphereGeometry(1, w, h);
      const rnd = mulberry32(seed * 977 + 13), planes = [];
      for (let i = 0; i < 8; i++) {
        const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
        planes.push([s * Math.cos(a), u, s * Math.sin(a), 0.74 + rnd() * 0.16]);
      }
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        v.multiplyScalar(0.93 + 0.2 * fbm3(v.x * 1.7 + seed * 3.1, v.y * 1.7 - seed, v.z * 1.7 + seed * 7.3));
        for (const pl of planes) { const e = v.x * pl[0] + v.y * pl[1] + v.z * pl[2] - pl[3]; if (e > 0) { v.x -= pl[0] * e * 0.88; v.y -= pl[1] * e * 0.88; v.z -= pl[2] * e * 0.88; } }
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return seamNormals(g);
    });
  }

  // ── Shapes ──
  function heartShape() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.12, -0.36, -0.56, -0.08, -0.5, 0.2);
    s.bezierCurveTo(-0.44, 0.52, -0.06, 0.56, 0, 0.26);
    s.bezierCurveTo(0.06, 0.56, 0.44, 0.52, 0.5, 0.2);
    s.bezierCurveTo(0.56, -0.08, 0.12, -0.36, 0, -0.5);
    return s;
  }
  // Scalloped membrane wing through finger tips (x mirrored by side sx).
  function wingShape(sx, pts) {
    const s = new THREE.Shape(), P = pts.map(p => [p[0] * sx, p[1]]);
    s.moveTo(P[0][0], P[0][1]);
    s.quadraticCurveTo(P[1][0], P[1][1], P[2][0], P[2][1]);   // leading edge
    for (let i = 3; i < P.length; i += 2) s.quadraticCurveTo(P[i][0], P[i][1], P[i + 1][0], P[i + 1][1]);
    s.lineTo(P[0][0], P[0][1]);
    return s;
  }
  // [root, leadCtrl, tip, (ctrl, finger)...]: control points pulled inward make the scallops.
  const BAT_WING = [[0, 0.1], [0.24, 0.36], [0.64, 0.27], [0.58, 0.1], [0.52, -0.05], [0.45, 0.05], [0.37, -0.1], [0.28, -0.01], [0.19, -0.11], [0.1, -0.02], [0, -0.07]];
  const DRAGON_WING = [[0, 0.35], [1.1, 1.55], [2.9, 1.2], [2.55, 0.62], [3.05, 0.1], [2.45, -0.18], [2.35, -0.85], [1.75, -0.55], [1.2, -1.15], [0.7, -0.6], [0.05, -0.45]];

  // ── Rig: Kit + bones + per-part flags, merged into one skinned geometry per mood ──
  class Rig {
    constructor() {
      this.k = new Kit(); this.meta = []; this.bones = []; this.map = {};
      this.cur = 0; this.fxv = [0, 0, 0, 0]; this.mood = 0; this.uvk = null; this.markers = {};
      this.bone('root', -1, [0, 0, 0]);
    }
    bone(name, parent, pos) {
      const i = this.bones.length, p = typeof parent === 'string' ? this.map[parent] : parent;
      this.bones.push({ name, parent: i === 0 ? -1 : (p === undefined || p < 0 ? 0 : p), pos: pos.slice() });
      this.map[name] = i; this.cur = i;
      return this;
    }
    on(name) { const i = this.map[name]; if (i === undefined) throw new Error('bone ' + name); this.cur = i; return this; }
    fx(unlit = 0, gloss = 0, tex = 0, wob = 0) { this.fxv = [unlit, gloss, tex, wob]; return this; }
    uv(u, v) { this.uvk = u ? [u, v ?? u] : null; return this; }
    mark(name, pos) { this.markers[name] = { bone: this.bones[this.cur].name, pos: pos.slice() }; return this; }   // pos in model space
    add(geo, color, pos, rot, scl) { this.k.add(geo, color, pos, rot, scl); this._m(); return this; }
    seg(p0, p1, r, color, r1 = r, sides = 10) { this.k.seg(p0, p1, r, color, r1, sN(sides, 5)); this._m(); return this; }
    push(p, r, s) { this.k.push(p, r, s); return this; }
    pop() { this.k.pop(); return this; }
    _m() { this.meta.push({ b: this.cur, fx: this.fxv, mood: this.mood, uv: this.uvk }); }
    geo(mood) {
      const parts = [], metas = [];
      for (let i = 0; i < this.k.parts.length; i++) {
        const mm = this.meta[i];
        if (mm.mood === 0 || mm.mood === mood) { parts.push(this.k.parts[i]); metas.push(mm); }
      }
      const g = mergeParts(parts), n = g.attributes.position.count;
      const P = g.attributes.position.array, U = g.attributes.uv.array;
      const fx = new Float32Array(n * 4), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      let vo = 0;
      for (let i = 0; i < parts.length; i++) {
        const cnt = parts[i].geo.attributes.position.count, mm = metas[i], f = mm.fx, wf = typeof f[3] === 'function' ? f[3] : null;
        for (let v = vo; v < vo + cnt; v++) {
          fx[v * 4] = f[0]; fx[v * 4 + 1] = f[1]; fx[v * 4 + 2] = f[2];
          fx[v * 4 + 3] = wf ? wf(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]) : f[3];
          si[v * 4] = mm.b; sw[v * 4] = 1;
          if (mm.uv) { U[v * 2] *= mm.uv[0]; U[v * 2 + 1] *= mm.uv[1]; }
        }
        vo += cnt;
      }
      g.setAttribute('aFx', new THREE.BufferAttribute(fx, 4));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.userData.keep = true;
      return g;
    }
    finish(extra) {
      const moods = new Set(this.meta.map(m => m.mood));
      const gG = this.geo(1), gH = moods.has(1) || moods.has(2) ? this.geo(2) : gG;
      const sphere = gG.boundingSphere.clone(); sphere.radius *= 1.3;
      const box = gG.boundingBox.clone();
      return Object.assign({ g: [gG, gH], bones: this.bones, markers: this.markers, sphere, box, verts: gG.attributes.position.count }, extra);
    }
  }

  // ── Faces (Feza's request: every creature is cute and SMILING, nothing scary) ──
  // mood 1 'grumpy' = MISCHIEVOUS-PLAYFUL: big open eyes whose lower lids are pushed up by the cheeks (smiling eyes),
  //   arched playful brows (one raised), a lopsided closed-mouth grin with a little tongue poking out, soft blush.
  //   No slanted brows, no frown, no fangs, no menacing glow.
  // mood 2 'happy' = OVERJOYED: ^ ^ eyes, big open smile, blush, little hearts.
  const DARK = '#23122e';
  // Open googly eye in its local frame (z = out of the head). o: er, iris, look, lookY, white, skin (cheek-lid colour), glowEye.
  function eyeOpen(r, s, o, cheeky) {
    const er = o.er, lx = -s * er * 0.12 * (o.look ?? 1), ly = -er * (o.lookY ?? 0.08);
    if (o.glowEye) {   // warm, friendly glowing eye (golem): soft glow ball, big round dark pupil, two catchlights
      r.fx(1, 0).add(G.sphere(20, 14), hdr(o.glowEye, 1.9), [0, 0, 0], null, [er, er * 1.04, er * 0.55]);
      r.fx(0, 1).add(G.sphere(14, 10), '#2a1606', [lx * 0.5, ly * 0.5, er * 0.44], null, [er * 0.52, er * 0.58, er * 0.2]);
      r.fx(1, 0).add(G.sphere(8, 6), hdr('#ffffff', 2), [lx * 0.5 - er * 0.17, ly * 0.5 + er * 0.2, er * 0.58], null, er * 0.15);
      r.add(G.sphere(8, 6), hdr('#ffffff', 1.6), [lx * 0.5 + er * 0.15, ly * 0.5 - er * 0.17, er * 0.56], null, er * 0.075);
      r.fx(0, 0);
      return;
    }
    r.fx(0, 1).add(G.sphere(24, 16), o.white || '#fbfbff', [0, 0, 0], null, [er, er * 1.1, er * 0.62]);
    r.add(G.sphere(20, 14), o.iris || '#4a2c1a', [lx, ly, er * 0.4], null, [er * 0.66, er * 0.72, er * 0.3]);
    r.add(G.sphere(16, 12), '#120a18', [lx * 1.08, ly * 1.08, er * 0.5], null, [er * 0.42, er * 0.47, er * 0.23]);
    r.fx(1, 0).add(G.sphere(10, 8), hdr('#ffffff', 1.7), [lx - er * 0.2, ly + er * 0.25, er * 0.64], null, er * 0.19);
    r.add(G.sphere(8, 6), hdr('#ffffff', 1.4), [lx + er * 0.17, ly - er * 0.19, er * 0.6], null, er * 0.09);
    if (cheeky && o.skin) {   // cheek pushes the lower lid up → the eye's lower edge curves like a smile
      r.fx(o.skinFx ?? 0, 0).add(G.sphere(20, 12), o.skin, [0, -er * 1.04, er * 0.08], null, [er * 1.22, er * 0.58, er * 0.68]);
    }
    r.fx(0, 0);
  }
  function eyeClosed(r, o) {   // ^ happy closed eye
    const er = o.er, arc = PI * 0.8;
    r.fx(o.glowEye ? 1 : 0, 0.3).add(G.torus(arc, 0.34, 18), o.glowEye ? hdr(o.glowEye, 2.0) : (o.happyCol || DARK),
      [0, -er * 0.34, er * 0.1], [0, 0, (PI - arc) / 2], [er * 0.92, er * 0.88, er * 0.7]);
    r.fx(0, 0);
  }
  // Two rounded buck teeth (mole, dragon) hanging just below y = 0 in the mouth frame.
  function buckTeeth(r, mw, o) {
    const w = mw * (o.buckW ?? 0.17), h = mw * (o.buckH ?? 0.2);
    r.fx(0, 0.8);
    for (const s of [-1, 1]) r.add(G.rbox(2), o.toothCol || '#ffffff', [s * w * 0.56, -h * 0.45, mw * 0.06], null, [w, h, w * 0.55]);
    r.fx(0, 0);
  }
  // Mischievous grin: a lopsided ∪ line (one corner higher, with a dimple) and a little tongue poking out.
  function smirk(r, mw, o) {
    mw *= o.smirkK ?? 1.3;
    const arc = PI * 0.6, sk = o.smirk ?? 0.26, mc = o.mouthCol || DARK, cy = mw * 0.3, rx = mw * 0.5, ry = mw * 0.44;
    r.fx(0, 0.3).add(G.torus(arc, 0.4, 20), mc, [0, cy, 0], [0, 0, -PI / 2 - arc / 2 + sk], [rx, ry, mw * 0.4]);
    const ca = -PI / 2 + arc / 2 + sk;   // raised corner
    r.add(G.sphere(10, 8), mc, [Math.cos(ca) * rx * 1.02, cy + Math.sin(ca) * ry + mw * 0.03, 0], null, mw * 0.075);
    if (o.buck) { r.push([0, cy - ry + mw * 0.02, 0]); buckTeeth(r, mw, o); r.pop(); }
    if (!o.noTongue) {
      const tx = o.buck ? mw * 0.3 : -mw * 0.1;
      r.fx(0, 0.6).add(G.sphere(14, 10), o.tongue || '#ff6f9a', [tx, cy - ry - mw * 0.07 + (o.buck ? mw * 0.05 : 0), mw * 0.05], [0, 0, o.buck ? -0.3 : 0.25], [mw * 0.17, mw * 0.14, mw * 0.09]);
    }
    r.fx(0, 0);
  }
  // Overjoyed big open smile (tongue inside, soft top teeth or buck teeth).
  function smile(r, mw, o) {
    r.fx(0, 0.5).add(G.hemi(24), o.mouthIn || '#6a1f3c', [0, mw * 0.1, 0], [PI, 0, 0], [mw * 0.56, mw * 0.5, mw * 0.3]);
    r.add(G.sphere(14, 10), '#ff7fa4', [0, -mw * 0.22, mw * 0.1], null, [mw * 0.3, mw * 0.14, mw * 0.14]);
    if (o.buck) { r.push([0, mw * 0.1, mw * 0.08]); buckTeeth(r, mw * 0.8, o); r.pop(); }
    else if (!o.noTeeth) r.fx(0, 0.8).add(G.rbox(2), '#ffffff', [0, mw * 0.05, mw * 0.14], null, [mw * 0.7, mw * 0.11, mw * 0.14]);
    r.fx(0, 0);
  }
  function blush(r, er, o, k = 1) {
    r.fx(0.35, 0).add(G.sphere(14, 8), o.blushCol || '#ff86b2', [0, 0, 0], null, [er * 0.74 * k, er * 0.42 * k, er * 0.2]);
    r.fx(0, 0);
  }
  const heartGeo = () => extrude('heart', heartShape, 0.06, 0.035, 14);
  // Full face on a roughly spherical head (centre c, radius R): mischievous (mood 1) + overjoyed (mood 2) parts,
  // plus 'eyes' (blink / giggle squint), 'brow' and 'joy' (hearts) bones.
  // o: bone, tilt, ex, ey, er, iris, skin, browCol, browY, browW, browRaise, browSide, mouthY, mouthW, mc/mR/mTilt (mouth
  //    sphere), mouthBone, smirk, noTongue, buck, blushX/blushY, heartX/heartY/heartS…
  function face(r, c, R, o) {
    const er = o.er, ex = o.ex, ey = o.ey, tilt = o.tilt ?? 0.25, eu = new THREE.Euler(-tilt, 0, 0), C = new THREE.Vector3(...c);
    const inset = o.inset ?? er * 0.3;
    const pe = onSphere(ex, ey, R, inset)[0], ec = new THREE.Vector3(0, pe[1], pe[2]).applyEuler(eu).add(C);
    const pb = onSphere(0, ey + er * 1.3, R)[0], bc = new THREE.Vector3(pb[0], pb[1], pb[2]).applyEuler(eu).add(C);
    r.bone('eyes', o.bone, [0, ec.y, ec.z]);
    r.bone('brow', o.bone, [0, bc.y, bc.z]);
    r.bone('joy', o.bone, [c[0], c[1] + R * 0.7, c[2]]);
    const mc = o.mc || c, mR = o.mR || R, mt = o.mTilt ?? tilt, mBone = o.mouthBone || o.bone;
    const mw = o.mouthW ?? er * 1.2, my = o.mouthY ?? (ey - er * 1.55);
    const blushAt = (k) => {
      for (const s of [-1, 1]) {
        const [p, q] = onSphere(s * (ex + er * (o.blushX ?? 0.3)), ey - er * (o.blushY ?? 1.05), R, -er * 0.02); r.push(p, q); blush(r, er, o, k); r.pop();
      }
    };
    // ── mischievous ──
    r.mood = 1;
    r.on('eyes').push(c, [-tilt, 0, 0]);
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * ex, ey, R, inset); r.push(p, q); eyeOpen(r, s, o, true); r.pop(); }
    r.pop();
    if (!o.noBrow) {   // arched playful brows, one raised a little higher (never slanted down toward the nose)
      r.on('brow').push(c, [-tilt, 0, 0]);
      const bA = PI * 0.56, side = o.browSide ?? 1;
      for (const s of [-1, 1]) {
        const up = s === side ? er * (o.browRaise ?? 0.3) : 0;
        const [p, q] = onSphere(s * (ex + er * 0.05), ey + er * (o.browY ?? 1.42) + up, R, -er * 0.02);
        r.push(p, q).fx(o.browGlow ? 1 : 0, 0.25).add(G.torus(bA, o.browT ?? 0.36, 14), o.browGlow ? hdr(o.browGlow, 2) : (o.browCol || DARK),
          [0, -er * 0.34 * (o.browW ?? 1), 0], [0, 0, (PI - bA) / 2], [er * 0.68 * (o.browW ?? 1), er * (up ? 0.56 : 0.46) * (o.browH ?? 1), er * 0.42]).pop();
      }
      r.pop();
    }
    if (!o.noBlush) { r.on(o.bone).push(c, [-tilt, 0, 0]); blushAt(0.8); r.pop(); }
    r.on(mBone).push(mc, [-mt, 0, 0]);
    { const [p, q] = onSphere(0, my, mR, o.mInset ?? 0); r.push(p, q); smirk(r, mw, o); r.pop(); }
    r.pop();
    // ── overjoyed ──
    r.mood = 2;
    r.on('eyes').push(c, [-tilt, 0, 0]);
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * ex, ey + er * 0.08, R, er * 0.05); r.push(p, q); eyeClosed(r, o); r.pop(); }
    if (!o.noBlush) blushAt(1.1);
    r.pop();
    r.on(mBone).push(mc, [-mt, 0, 0]);
    { const [p, q] = onSphere(0, my + mw * 0.08, mR, o.mInset ?? 0); r.push(p, q); smile(r, mw * (o.smileK ?? 1.5), o); r.pop(); }
    r.pop();
    if (!o.noHearts) {   // two little hearts floating beside the head (bob + pulse in m.anim)
      r.on('joy').push(c, [-tilt, 0, 0]).fx(0.5, 0.6);
      for (const s of [-1, 1]) {
        r.add(heartGeo(), o.heartCol || '#ff4f93', [s * R * (o.heartX ?? 1.02), R * (o.heartY ?? 0.62) + (s > 0 ? R * 0.14 : 0), R * 0.3],
          [-0.25, 0, -s * 0.38], R * (o.heartS ?? 0.34) * (s > 0 ? 0.8 : 1));
      }
      r.pop();
    }
    r.mood = 0; r.fx(0, 0);
  }
  const GOLD = '#ffc94a';
  function crown(r, p, s, gem = '#ff5fa8') {
    r.push(p, [-0.12, 0, 0], s).fx(0, 2);
    r.add(G.cyl(1, 0.9, 20), GOLD, [0, 0.1, 0], null, [0.2, 0.2, 0.2]);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      r.add(G.cone(8), GOLD, [Math.sin(a) * 0.17, 0.27, Math.cos(a) * 0.17], null, [0.06, 0.18, 0.06]);
      r.add(G.sphere(8, 6), GOLD, [Math.sin(a) * 0.17, 0.37, Math.cos(a) * 0.17], null, 0.035);
    }
    r.fx(0.5, 1).add(G.octa(), hdr(gem, 1.4), [0, 0.1, 0.2], null, [0.06, 0.08, 0.04]);
    r.pop().fx(0, 0);
  }
  // Cone from base point along dir (length len, base radius rad).
  function cone(r, base, dir, len, rad, color, seg = 10) {
    const d = new THREE.Vector3(...dir).normalize();
    r.add(G.cone(seg), color, [base[0] + d.x * len / 2, base[1] + d.y * len / 2, base[2] + d.z * len / 2], qy(d.x, d.y, d.z), [rad, len, rad]);
  }
  // Soft plush spike: a shorter cone with a rounded ball tip (nothing sharp).
  function softSpike(r, base, dir, len, rad, color, seg = 12) {
    const d = new THREE.Vector3(...dir).normalize();
    cone(r, base, dir, len * 0.8, rad, color, seg);
    r.add(G.sphere(12, 8), color, [base[0] + d.x * len * 0.62, base[1] + d.y * len * 0.62, base[2] + d.z * len * 0.62], null, rad * 0.42);
  }
  // Point on an ellipsoid (centre c, radii a) at polar angle phi from +y and azimuth th (0 = +z): [pos, normal].
  function onEll(c, a, phi, th) {
    const sx = Math.sin(phi) * Math.sin(th), sy = Math.cos(phi), sz = Math.sin(phi) * Math.cos(th);
    return [[c[0] + a[0] * sx, c[1] + a[1] * sy, c[2] + a[2] * sz], [sx / a[0], sy / a[1], sz / a[2]]];
  }

  // ════════════════ Character builders (r = Rig, o = {variant, elite}) ════════════════
  const JOLE = {
    green: ['#45c963', '#b0eb98', '#168a50'], pink: ['#e85aa3', '#f7b3d8', '#b8266f'],
    blue: ['#3f94ec', '#a6d4f7', '#1f4fc4'], purple: ['#9466ec', '#d2bdf7', '#5a31bf'],
  };
  function buildJole(r, o) {
    let [base, light, deep] = (JOLE[o.variant] || JOLE.green).map(col);
    if (o.elite) { base = rich(base, 1.3, 0.9); deep = rich(deep, 1.3, 0.8); light = rich(light, 1.2, 0.95); }
    const H = 0.86 * 0.9;
    r.bone('body', 'root', [0, 0, 0]);
    r.push([0, 0, 0], null, [1.08, 0.9, 1.08]);
    const wob = (x, y) => smooth01((y - 0.05) / 0.62);
    const GP = [[0, 0], [0.39, 0], [0.5, 0.035], [0.545, 0.12], [0.535, 0.24], [0.49, 0.34], [0.462, 0.45], [0.428, 0.55], [0.37, 0.65], [0.298, 0.72], [0.2, 0.79], [0.09, 0.835], [0, 0.86]];
    const body = lathe('gumdrop', GP, 48);
    r.fx(0, 0, 0, wob).add(body, vgrad(0, 0.8, [[0, deep], [0.45, base], [1, mixc(base, light, 0.4)]]));
    // painted gloss highlights + tiny bubbles (they wobble with the surface)
    r.fx(1, 0, 0, wob);
    { const [p, n] = onLathe(GP, 0.6, -0.72, 0.004); r.add(G.sphere(14, 10), hdr('#ffffff', 1.3), p, qz(...n, 0.9), [0.13, 0.045, 0.015]); }
    { const [p, n] = onLathe(GP, 0.45, -0.98, 0.004); r.add(G.sphere(10, 8), hdr('#ffffff', 1.25), p, qz(...n), [0.03, 0.03, 0.01]); }
    r.fx(0, 1, 0, wob);
    for (const b of [[0.16, 1.1, 0.035], [0.26, 1.9, 0.028], [0.13, -2.4, 0.03], [0.34, 0.9, 0.022], [0.22, -1.5, 0.025]]) {
      const [p, n] = onLathe(GP, b[0], b[1], -b[2] * 0.3);
      r.add(G.sphere(10, 8), mixc(light, '#ffffff', 0.35), p, qz(...n), [b[2], b[2], b[2] * 0.6]);
    }
    const iris = mixc(deep, '#1a0f24', 0.55), brow = mixc(deep, '#150a1c', 0.72);
    r.fx(0, 0, 0, wob);
    face(r, [0, 0.36, 0], 0.47, { bone: 'body', tilt: 0.42, ex: 0.16, ey: 0.04, er: 0.132, iris, skin: mixc(base, light, 0.08), browCol: brow, browY: 1.36, mouthY: -0.14, mouthW: 0.15, heartY: 0.75 });
    if (o.elite) crown(r.on('body').fx(0, 0, 0, wob), [0, 0.8, -0.04], 0.72);
    r.mark('muzzle', [0, 0.38, 0.5]);
    r.pop();
    return { height: H, glowC: col('#ff5a3a'), mat: { rough: 0.2, sss: mixc(base, '#ffffff', 0.2).multiplyScalar(0.06), rim: mixc(light, '#ffffff', 0.4), rimK: 0.24, rimP: 2.6, wob: 0.012, wobF: 2.2, wobS: 5 } };
  }
  function animJole(m, dt, st, s) {
    const b = m.B.body;
    let sy = 1, sxz = 1, y = 0, z = 0, x = 0, rx = 0;
    const br = Math.sin(s.t * 3.1 + s.ph);
    sy += 0.035 * br; sxz -= 0.02 * br;
    s.hopK = damp(s.hopK || 0, st.move > 0.05 ? 1 : 0, 6, dt);
    if (s.hopK > 0.02 || (s.hop % 1) > 0.03) s.hop += dt * (2.0 + 0.7 * s.mv);
    const u = s.hop % 1, A = s.hopK;
    if (u < 0.18) { const k = Math.sin(PI * u / 0.18); sy -= 0.2 * k * A; sxz += 0.12 * k * A; }
    else if (u < 0.82) {
      const k = (u - 0.18) / 0.64; y += Math.sin(PI * k) * 0.28 * A;
      const st2 = Math.abs(Math.cos(PI * k)); sy += 0.16 * st2 * A; sxz -= 0.07 * st2 * A; rx += 0.1 * Math.sin(PI * k) * A;
    } else { const k = Math.sin(PI * (u - 0.82) / 0.18); sy -= 0.24 * k * A; sxz += 0.15 * k * A; if (!s.landed && A > 0.3) { s.landed = true; s.wobA = 0.045; } }
    if (u < 0.5) s.landed = false;
    if (st.windup >= 0) { const w = st.windup; sy *= 1 - 0.3 * w; sxz *= 1 + 0.2 * w; rx -= 0.2 * w; x += Math.sin(s.t * 70) * 0.018 * w; }
    if (st.attack >= 0) { const k = Math.sin(PI * st.attack); y += 0.32 * k; z += 0.38 * k; sy *= 1 + 0.2 * k; sxz *= 1 - 0.08 * k; rx += 0.32 * k; }
    b.position.set(x, y, z); b.scale.set(sxz, sy, sxz); b.rotation.x = rx;
    s.wobA = damp(s.wobA ?? 0.012, 0.012, 3.5, dt);
    if (st.hurt > 0.5) s.wobA = Math.max(s.wobA, 0.04 * st.hurt);
    m.U.uWob.value.x = s.wobA;
  }

  function buildMantar(r, o) {
    const E = o.elite;
    const capC = E ? '#d81a36' : '#e8383f', capL = E ? '#ec4a4a' : '#f0645a', capD = E ? '#8c0c28' : '#b5202f';
    const stem = '#fff4de', stemD = '#e9cc9c', gill = '#efd2a4', foot = '#d9ae76';
    r.bone('body', 'root', [0, 0.06, 0]);
    r.bone('cap', 'body', [0, 0.66, 0]);
    r.bone('footL', 'root', [0.13, 0.08, 0.02]); r.bone('footR', 'root', [-0.13, 0.08, 0.02]);
    r.bone('armL', 'body', [0.25, 0.36, 0]); r.bone('armR', 'body', [-0.25, 0.36, 0]);
    r.on('body').add(lathe('mStem', [[0, 0.05], [0.19, 0.05], [0.265, 0.1], [0.29, 0.22], [0.28, 0.38], [0.245, 0.52], [0.21, 0.63], [0.19, 0.72], [0, 0.73]], 36),
      vgrad(0.05, 0.72, [[0, stemD], [0.3, stem], [1, stem]]));
    // cap tilted back a little so the camera always sees the face on the stem
    r.on('cap').push([0, 0.66, -0.03], [-0.3, 0, 0]);
    const cg = lathe('mCap', [[0, -0.02], [0.28, -0.035], [0.46, -0.05], [0.53, -0.02], [0.545, 0.04], [0.52, 0.13], [0.45, 0.23], [0.33, 0.31], [0.17, 0.355], [0, 0.365]], 48);
    const cfun = (() => {
      const out = new THREE.Color(), cc = col(capC), cl = col(capL), cd = col(capD), cgl = col(gill), cgd = mixc(gill, '#a8753f', 0.45);
      return (x, y, z) => {
        const ly = y - 0.66;
        if (ly < 0.0 && Math.hypot(x, z) < 0.5) { const a = Math.atan2(z, x); return out.copy(cgl).lerp(cgd, 0.5 + 0.5 * Math.sin(a * 30)); }
        const t = clamp(ly / 0.36, 0, 1);
        return t < 0.35 ? out.copy(cd).lerp(cc, t / 0.35) : out.copy(cc).lerp(cl, (t - 0.35) / 0.65);
      };
    })();
    r.fx(0, 0.1).add(cg, cfun);
    // white dots on the cap (ellipsoid fit of the dome)
    const DOTS = [[0, 0, 0.1], [0.62, 0.3, 0.085], [0.62, 1.55, 0.08], [0.62, 2.8, 0.085], [0.62, 4.05, 0.08], [0.62, 5.3, 0.08],
      [1.12, 0.9, 0.07], [1.12, 2.2, 0.065], [1.12, 3.4, 0.07], [1.12, 4.6, 0.065], [1.12, 5.8, 0.06]];
    r.fx(0, 0.7);
    for (const d of DOTS) {
      const [p, n] = onEll([0, 0.0, 0], [0.53, 0.36, 0.53], d[0], d[1]);
      r.add(G.sphere(14, 8), '#ffffff', p, qz(...n), [d[2], d[2], d[2] * 0.3]);
    }
    if (E) crown(r, [0, 0.33, 0], 0.7);
    r.pop().fx(0, 0);
    r.mark('muzzle', [0, 1.1, 0.05]);   // model space (markers ignore the Kit stack)
    // little feet + nub arms
    r.on('footL').add(G.sphere(14, 10), foot, [0.13, 0.06, 0.07], null, [0.1, 0.065, 0.13]);
    r.on('footR').add(G.sphere(14, 10), foot, [-0.13, 0.06, 0.07], null, [0.1, 0.065, 0.13]);
    r.on('armL').add(G.sphere(12, 8), stem, [0.31, 0.3, 0.03], [0, 0, 0.5], [0.07, 0.11, 0.07]);
    r.on('armR').add(G.sphere(12, 8), stem, [-0.31, 0.3, 0.03], [0, 0, -0.5], [0.07, 0.11, 0.07]);
    face(r, [0, 0.33, 0], 0.285, { bone: 'body', tilt: 0.1, ex: 0.105, ey: 0.03, er: 0.088, iris: '#5a2a18', skin: stem, browCol: '#6a3a24', browY: 1.3, mouthY: -0.1, mouthW: 0.1, heartY: 0.1, heartX: 1.25 });
    return { height: 1.02, glowC: col('#ffb13a'), mat: { rough: 0.58, rimK: 0.2, sss: col('#ffe0c0').multiplyScalar(0.05) } };
  }
  function animMantar(m, dt, st, s) {
    const B = m.B;
    if (s.mv > 0.03) s.walk += dt * (7 + 3 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.5);
    const bob = Math.abs(Math.sin(ph)) * 0.05 * k;
    B.body.position.y += bob + Math.sin(s.t * 2.4 + s.ph) * 0.008;
    B.body.rotation.z = Math.sin(ph) * 0.12 * k;
    B.footL.position.y += Math.max(0, Math.sin(ph)) * 0.08 * k; B.footL.position.z += Math.cos(ph) * 0.07 * k;
    B.footR.position.y += Math.max(0, -Math.sin(ph)) * 0.08 * k; B.footR.position.z -= Math.cos(ph) * 0.07 * k;
    B.armL.rotation.z = 0.15 + Math.sin(ph) * 0.3 * k + Math.sin(s.t * 2) * 0.05; B.armR.rotation.z = -0.15 + Math.sin(ph) * 0.3 * k - Math.sin(s.t * 2) * 0.05;
    B.cap.rotation.z = Math.sin(s.t * 1.7 + s.ph) * 0.04 - Math.sin(ph) * 0.06 * k;
    if (st.windup >= 0) {
      const w = st.windup, sh = Math.sin(s.t * 55) * 0.05 * w;
      B.cap.scale.set(1 + 0.22 * w, 1 + 0.12 * w, 1 + 0.22 * w); B.cap.rotation.x = -0.25 * w; B.cap.rotation.z += sh;
      B.body.scale.set(1 + 0.08 * w, 1 - 0.12 * w, 1 + 0.08 * w); B.body.rotation.x = -0.15 * w;
      B.armL.rotation.z = 0.15 + 1.2 * w; B.armR.rotation.z = -0.15 - 1.2 * w;
    }
    if (st.attack >= 0) {
      const a = st.attack, k2 = Math.sin(PI * Math.min(1, a * 1.4));
      B.cap.scale.set(1 - 0.12 * k2, 1 - 0.2 * k2, 1 - 0.12 * k2); B.cap.rotation.x = 0.2 * k2;
      B.body.scale.y = 1 + 0.12 * k2; B.body.rotation.x = 0.12 * k2;
    }
  }

  function buildYarasa(r, o) {
    const E = o.elite;
    const fur = E ? '#6f3fd0' : '#8a62dc', furL = E ? '#a57cf5' : '#b99cf3', furD = E ? '#4a2596' : '#5f3fad', mem = E ? '#7a45d8' : '#9471e0', ear = '#ff9ccb';
    const cy = 0.32;
    r.bone('body', 'root', [0, cy, 0]);
    r.bone('wingL', 'body', [0.2, cy + 0.04, -0.03]); r.bone('wingR', 'body', [-0.2, cy + 0.04, -0.03]);
    r.bone('earL', 'body', [0.12, cy + 0.2, 0]); r.bone('earR', 'body', [-0.12, cy + 0.2, 0]);
    r.bone('feet', 'body', [0, cy - 0.24, 0]);
    const fcol = (() => { const out = new THREE.Color(), a = col(furD), b = col(fur), c = col(furL); return (x, y, z) => {
      out.copy(a).lerp(b, smooth01((y - (cy - 0.28)) / 0.3));
      const belly = smooth01((z - 0.08) / 0.2) * smooth01((cy + 0.12 - y) / 0.2);
      return out.lerp(c, belly * 0.8);
    }; })();
    r.on('body').add(G.sphere(32, 24), fcol, [0, cy, 0], null, [0.28, 0.27, 0.27]);
    for (const t of [[0, 0.27, 0.02, 0.06], [0.05, 0.25, -0.04, 0.05], [-0.05, 0.25, -0.04, 0.05]]) r.add(G.sphere(12, 8), fur, [t[0], cy + t[1], t[2]], null, t[3]);
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'earL' : 'earR');
      cone(r, [0.12 * s, cy + 0.17, 0], [0.42 * s, 1, -0.05], 0.3, 0.1, fur, 12);
      r.fx(0, 0.3); cone(r, [0.125 * s, cy + 0.18, 0.025], [0.42 * s, 1, -0.05], 0.22, 0.062, ear, 12); r.fx(0, 0);
    }
    // scalloped wings with lighter finger ribs
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'wingL' : 'wingR').push([0.2 * s, cy + 0.04, -0.03], [-0.45, 0.25 * s, 0], 1);
      r.fx(0, 0.35).add(extrude('batWing' + s, () => wingShape(s, BAT_WING), 0.014, 0.008), mem, [0, 0, 0]);
      r.fx(0, 0.2);
      for (const f of [[0.64, 0.27], [0.52, -0.05], [0.37, -0.1], [0.19, -0.11]]) r.seg([0.02 * s, 0.06, 0.016], [f[0] * s * 0.98, f[1] * 0.96, 0.016], 0.012, furL, 0.006, 6);
      r.add(G.sphere(8, 6), furD, [0.64 * s, 0.27, 0], null, 0.022);
      r.pop().fx(0, 0);
    }
    r.on('feet');
    for (const s of [-1, 1]) r.add(G.sphere(10, 8), furD, [0.07 * s, cy - 0.27, 0.02], null, [0.045, 0.035, 0.05]);
    face(r, [0, cy, 0], 0.27, { bone: 'body', tilt: 0.4, ex: 0.1, ey: 0.04, er: 0.09, iris: '#5a2a50', skin: mixc(fur, furL, 0.3), browCol: '#3a1c5a', browY: 1.32, mouthY: -0.085, mouthW: 0.085, heartY: 0.55, heartX: 1.1 });
    if (E) crown(r.on('body'), [0, cy + 0.25, -0.02], 0.5);
    r.mark('muzzle', [0, cy - 0.05, 0.3]);
    return { height: 0.62, glowC: col('#ff4a7a'), mat: { rough: 0.62, sss: col('#c9a8ff').multiplyScalar(0.05) } };
  }
  function animYarasa(m, dt, st, s) {
    const B = m.B;
    const fast = 1 + s.mv * 0.5 + (st.attack >= 0 ? 0.6 : 0);
    s.flap += dt * 11 * fast;
    let amp = 0.75, base = 0.1;
    B.body.position.y += Math.sin(s.flap) * 0.025;
    B.body.rotation.x = 0.18 * s.mv;
    if (st.windup >= 0) { const w = st.windup; B.body.rotation.x -= 0.45 * w; B.body.position.z -= 0.12 * w; base += 0.6 * w; amp *= 1 - 0.6 * w; B.body.position.x += Math.sin(s.t * 60) * 0.015 * w; }
    if (st.attack >= 0) { const k = Math.sin(PI * st.attack); B.body.position.z += 0.45 * k; B.body.rotation.x += 0.6 * k; base -= 0.5 * k; }
    const f = Math.sin(s.flap);
    B.wingL.rotation.z = base + f * amp; B.wingR.rotation.z = -(base + f * amp);
    B.wingL.rotation.y = -0.15 * f; B.wingR.rotation.y = 0.15 * f;
    B.earL.rotation.z = -0.1 * f + Math.sin(s.t * 3) * 0.05; B.earR.rotation.z = 0.1 * f - Math.sin(s.t * 3) * 0.05;
    B.feet.rotation.x = 0.3 * Math.sin(s.flap - 1) * 0.5;
  }

  function buildGoblin(r, o) {
    const E = o.elite;
    const skin = E ? '#5cb83c' : '#7cc95a', skinD = E ? '#3f8f2b' : '#5ea844', tunic = E ? '#7a3f9e' : '#8f5a34', tunicD = E ? '#51246e' : '#6a3f22';
    const belt = '#4a2e1a', shoe = '#6b3f22', wood = '#b07a44', woodD = '#7c4f28', ear = '#ffa3a3';
    r.bone('hips', 'root', [0, 0.38, 0]);
    r.bone('body', 'hips', [0, 0.42, 0]);
    r.bone('head', 'body', [0, 0.72, 0]);
    r.bone('earL', 'head', [0.26, 0.97, -0.02]); r.bone('earR', 'head', [-0.26, 0.97, -0.02]);
    r.bone('armL', 'body', [0.23, 0.63, 0]); r.bone('armR', 'body', [-0.23, 0.63, 0]);
    r.bone('legL', 'hips', [0.1, 0.36, 0]); r.bone('legR', 'hips', [-0.1, 0.36, 0]);
    r.bone('club', 'armR', [-0.31, 0.41, 0.11]);
    const fab = texOf('fabric');
    // legs + curly shoes
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'legL' : 'legR');
      r.seg([0.1 * s, 0.36, 0], [0.11 * s, 0.1, 0.02], 0.062, skinD, 0.056, 12);
      r.add(G.sphere(16, 10), shoe, [0.11 * s, 0.065, 0.05], null, [0.085, 0.065, 0.14]);
      r.add(G.sphere(10, 8), shoe, [0.11 * s, 0.09, 0.18], null, 0.04);
    }
    // tunic (fabric texture) + belt with buckle
    r.on('body').fx(0, 0, 1).uv(3, 1);
    r.add(lathe('gTunic', [[0, 0.27], [0.25, 0.27], [0.285, 0.33], [0.265, 0.48], [0.22, 0.62], [0.16, 0.7], [0, 0.72]], 32),
      vgrad(0.27, 0.72, [[0, tunicD], [0.35, tunic], [1, tunic]]));
    r.uv(null).fx(0, 0.3);
    r.add(G.torus(TAU, 0.3, 32), belt, [0, 0.43, 0], [PI / 2, 0, 0], [0.272, 0.272, 0.12]);
    r.fx(0, 2).add(G.rbox(2), GOLD, [0, 0.43, 0.27], null, [0.08, 0.07, 0.03]);
    r.fx(0, 0);
    // arms (club in the right hand, resting on the shoulder)
    r.on('armL').seg([0.23, 0.63, 0], [0.3, 0.42, 0.06], 0.05, skin, 0.045, 10).add(G.sphere(14, 10), skin, [0.31, 0.39, 0.07], null, 0.065);
    r.on('armR').seg([-0.23, 0.63, 0], [-0.3, 0.44, 0.1], 0.05, skin, 0.045, 10).add(G.sphere(14, 10), skin, [-0.31, 0.41, 0.11], null, 0.065);
    {
      const d = new THREE.Vector3(-0.12, 0.85, -0.5).normalize(), q = qy(d.x, d.y, d.z);
      const wcol = (() => { const out = new THREE.Color(), a = col(wood), b = col(woodD); return (x, y, z) => out.copy(a).lerp(b, 0.5 + 0.5 * Math.sin((x * 3 + y * 40 + z * 3))); })();
      r.on('club').fx(0, 0.1).add(lathe('club', [[0, -0.06], [0.036, -0.06], [0.04, 0.0], [0.042, 0.18], [0.07, 0.3], [0.11, 0.42], [0.125, 0.52], [0.112, 0.6], [0.07, 0.655], [0, 0.665]], 18), wcol, [-0.31, 0.41, 0.11], q);
      const kp = new THREE.Vector3(-0.31, 0.41, 0.11).addScaledVector(d, 0.48);
      r.add(G.sphere(8, 6), woodD, [kp.x + 0.1, kp.y, kp.z + 0.04], null, 0.035);
      r.fx(0, 2).add(G.sphere(6, 5), '#c9ccd6', [kp.x - 0.09, kp.y + 0.06, kp.z + 0.06], null, 0.022).fx(0, 0);
    }
    // head: big, egg-ish, pointy ears, bulb nose, hair tuft
    r.on('head').add(G.sphere(40, 28), vgrad(0.66, 1.24, [[0, skinD], [0.45, skin], [1, mixc(skin, '#ffffff', 0.12)]]), [0, 0.95, 0], null, [0.31, 0.29, 0.29]);
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'earL' : 'earR');
      r.add(G.cone(16), skin, [0.42 * s, 1.04, -0.04], [0, 0.25 * s, -s * (PI / 2 - 0.42)], [0.12, 0.42, 0.05]);
      r.fx(0, 0.2).add(G.cone(16), ear, [0.4 * s, 1.035, -0.02], [0, 0.25 * s, -s * (PI / 2 - 0.42)], [0.075, 0.3, 0.03]).fx(0, 0);
    }
    r.on('head').add(G.sphere(18, 12), mixc(skin, skinD, 0.35), [0, 0.9, 0.3], null, [0.075, 0.065, 0.07]);
    for (const t of [[0, 0.3, 0.1], [0.07, 0.24, 0.35], [-0.07, 0.26, -0.3]]) cone(r, [t[0], 0.95 + 0.27, t[0] * 0.2 - 0.02], [t[0] * 3, 1, -0.3], 0.14 + t[1] * 0.1, 0.035, skinD, 8);
    face(r, [0, 0.95, 0], 0.295, { bone: 'head', tilt: 0.34, ex: 0.12, ey: 0.07, er: 0.1, iris: '#7a4a1c', skin: mixc(skin, '#ffffff', 0.06), browCol: '#3a4a22', browY: 1.36, mouthY: -0.13, mouthW: 0.12, heartY: 0.7, heartX: 1.05 });
    if (E) crown(r.on('head'), [0, 1.2, -0.02], 0.75);
    r.on('armR').mark('muzzle', [-0.38, 0.8, -0.1]);
    return { height: 1.22, glowC: col('#ff5a3a'), tex: fab, mat: { rough: 0.55, ns: 0.8 } };
  }
  function animGoblin(m, dt, st, s) {
    const B = m.B;
    if (s.mv > 0.03) s.walk += dt * (6 + 5 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.4);
    B.legL.rotation.x = Math.sin(ph) * 0.65 * k; B.legR.rotation.x = -Math.sin(ph) * 0.65 * k;
    B.hips.position.y += Math.abs(Math.cos(ph)) * 0.04 * k + Math.sin(s.t * 2.2 + s.ph) * 0.006;
    B.body.rotation.y = Math.sin(ph) * 0.1 * k; B.body.rotation.x = 0.08 * k;
    B.body.scale.y = 1 + Math.sin(s.t * 2.2 + s.ph) * 0.015;
    B.armL.rotation.x = -Math.sin(ph) * 0.5 * k; B.armR.rotation.x = Math.sin(ph) * 0.25 * k + Math.sin(s.t * 1.8) * 0.04;
    B.head.rotation.z = Math.sin(s.t * 1.3 + s.ph) * 0.05; B.head.rotation.x = -Math.cos(ph * 2) * 0.03 * k;
    const tw = Math.max(0, Math.sin(s.t * 0.9 + s.ph * 3) - 0.92) * 8;   // occasional ear twitch
    B.earL.rotation.z = Math.sin(ph * 2) * 0.1 * k + tw * 0.25 * Math.sin(s.t * 40); B.earR.rotation.z = -Math.sin(ph * 2) * 0.1 * k - tw * 0.2 * Math.sin(s.t * 40);
    if (st.windup >= 0) {
      const w = smooth01(st.windup * 1.3);
      B.armR.rotation.x = -2.8 * w; B.club.rotation.x = 2.4 * w; B.armR.rotation.z = -0.25 * w;
      B.body.rotation.x = -0.28 * w; B.head.rotation.x = -0.12 * w; B.hips.position.x += Math.sin(s.t * 50) * 0.01 * st.windup;
      B.armL.rotation.x = -0.6 * w; B.armL.rotation.z = 0.4 * w;
    }
    if (st.attack >= 0) {
      const a = st.attack, hit = smooth01(a / 0.26), back = smooth01((a - 0.36) / 0.64);
      B.armR.rotation.x = lerp(-2.8, -0.9, hit) * (1 - back); B.club.rotation.x = lerp(2.4, 3.0, hit) * (1 - back);
      B.armR.rotation.z = -0.25 * (1 - hit);
      B.body.rotation.x = 0.35 * Math.sin(PI * Math.min(1, a * 1.6)); B.head.rotation.x = 0.1 * hit * (1 - back);
    }
  }

  // ── Köstebek: chubby velvety miner mole with a yellow hard hat + headlamp and a tiny shovel. It burrows:
  // st.burrow 0 = up … 1 = fully underground (the body sinks, its own dirt mound appears and travels with it). ──
  function moundGeo() {
    const w = sN(30, 14), h = sN(16, 8);
    return gx('mound@' + w, () => {
      const g = new THREE.SphereGeometry(1, w, h, 0, TAU, 0, PI * 0.62), p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        v.multiplyScalar(0.86 + 0.28 * fbm3(v.x * 2.6 + 3, v.y * 2.6, v.z * 2.6 - 5));
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return seamNormals(g);
    });
  }
  function buildKostebek(r, o) {
    const E = o.elite;
    const fur = E ? '#7c4a28' : '#8a5a38', furD = E ? '#4f2c16' : '#5a3720', furL = E ? '#b37a4a' : '#ad7e56', belly = E ? '#dcae80' : '#d0a67c';
    const pink = '#ea86a2', pinkD = '#d06284', nose = '#ff5a90', snout = '#d49c82', hat = '#ecb01a', hatD = '#c97a0a';
    const dirt = '#7a5234', dirtD = '#4e321f', dirtL = '#a47650', steel = '#c9d3e2', wood = '#c08a50', woodD = '#8a5a2c';
    r.bone('body', 'root', [0, 0.02, 0]);
    r.bone('head', 'body', [0, 0.46, 0.05]);
    r.bone('armL', 'body', [0.26, 0.4, 0.08]); r.bone('armR', 'body', [-0.26, 0.4, 0.08]);
    r.bone('footL', 'body', [0.13, 0.05, 0.12]); r.bone('footR', 'body', [-0.13, 0.05, 0.12]);
    r.bone('shovel', 'armR', [-0.33, 0.27, 0.24]);
    r.bone('mound', 'root', [0, 0, 0]);
    // chubby pear body: velvety fur with a light tummy patch
    const bcol = (() => { const out = new THREE.Color(), a = col(furD), b = col(fur), c = col(furL), bl = col(belly); return (x, y, z) => {
      out.copy(a).lerp(b, smooth01((y - 0.0) / 0.28)).lerp(c, smooth01((y - 0.5) / 0.3) * 0.45);
      const bel = smooth01((z - 0.16) / 0.1) * smooth01((0.46 - y) / 0.1) * smooth01((y - 0.07) / 0.1) * smooth01((0.24 - Math.abs(x)) / 0.08);
      return out.lerp(bl, bel * 0.92);
    }; })();
    r.on('body').add(G.sphere(36, 26), bcol, [0, 0.28, 0], null, [0.35, 0.29, 0.32]);
    r.add(G.sphere(10, 8), pink, [0, 0.12, -0.31], null, [0.05, 0.04, 0.06]);   // tiny tail
    // head (no neck: it melts into the body), pink-tan snout, big glossy pink nose
    r.on('head').add(G.sphere(34, 26), vgrad(0.36, 0.8, [[0, fur], [1, mixc(fur, furL, 0.65)]]), [0, 0.56, 0.06], null, [0.25, 0.235, 0.24]);
    r.add(G.sphere(22, 16), snout, [0, 0.49, 0.26], null, [0.125, 0.105, 0.12]);
    r.fx(0, 1).add(G.sphere(20, 14), nose, [0, 0.545, 0.355], null, [0.07, 0.058, 0.058]);
    r.fx(1, 0).add(G.sphere(8, 6), hdr('#ffffff', 1.5), [-0.022, 0.572, 0.4], null, [0.018, 0.013, 0.01]);
    r.fx(0, 0.4);
    for (const s of [-1, 1]) r.add(G.sphere(8, 6), '#b83a64', [0.022 * s, 0.527, 0.408], null, [0.011, 0.008, 0.006]);
    r.fx(0, 0);
    // yellow miner's hard hat (tilted back so the eyes stay visible from the camera) with a glowing headlamp
    r.push([0, 0.74, 0.0], [-0.34, 0, 0]);
    r.fx(0, 0.35).add(G.hemi(28), vgrad(0.72, 0.9, [[0, hatD], [0.35, hat], [1, mixc(hat, '#fff0b0', 0.25)]]), [0, 0, 0], null, [0.2, 0.14, 0.21]);
    r.add(G.cyl(1, 1, 28), hatD, [0, 0.004, 0.025], null, [0.25, 0.022, 0.27]);
    r.add(G.torus(PI, 0.2, 20), mixc(hat, '#fff6c8', 0.3), [0, 0.0, 0], [0, PI / 2, 0], [0.205, 0.145, 0.07]);
    r.fx(0, 2).add(G.cyl(1, 1, 16), '#aab4c4', [0, 0.075, 0.2], [PI / 2 - 0.2, 0, 0], [0.05, 0.045, 0.05]);
    r.fx(1, 0).add(G.sphere(14, 10), hdr('#fff0a8', 1.7), [0, 0.08, 0.225], [-0.2, 0, 0], [0.034, 0.034, 0.012]);
    r.pop().fx(0, 0);
    // arms with big pink digging paws; little pink feet
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'armL' : 'armR').seg([0.26 * s, 0.4, 0.08], [0.32 * s, 0.29, 0.2], 0.075, fur, 0.065, 12);
      r.fx(0, 0.2).add(G.sphere(18, 12), pink, [0.33 * s, 0.27, 0.24], [0.3, 0, 0], [0.085, 0.05, 0.095]);
      for (let i = 0; i < 4; i++) r.add(G.sphere(8, 6), pinkD, [0.33 * s + (i - 1.5) * 0.034, 0.26, 0.325], null, [0.022, 0.02, 0.028]);
      r.fx(0, 0);
      r.on(s > 0 ? 'footL' : 'footR').fx(0, 0.2).add(G.sphere(16, 10), pink, [0.13 * s, 0.035, 0.17], null, [0.075, 0.04, 0.1]);
      for (let i = 0; i < 3; i++) r.add(G.sphere(8, 6), pinkD, [0.13 * s + (i - 1) * 0.034, 0.03, 0.26], null, 0.02);
      r.fx(0, 0);
    }
    // tiny shovel resting on the right shoulder (bonks with it)
    {
      const P0 = new THREE.Vector3(-0.33, 0.27, 0.24), d = new THREE.Vector3(-0.1, 0.82, -0.56).normalize(), q = qy(d.x, d.y, d.z);
      const a = P0.clone().addScaledVector(d, -0.1), b = P0.clone().addScaledVector(d, 0.42), bl = P0.clone().addScaledVector(d, 0.52);
      r.on('shovel').fx(0, 0.15).seg([a.x, a.y, a.z], [b.x, b.y, b.z], 0.018, wood, 0.018, 8);
      r.add(G.rbox(2), woodD, [a.x, a.y, a.z], q, [0.08, 0.03, 0.03]);
      r.fx(0, 2).add(G.rbox(2), steel, [bl.x, bl.y, bl.z], q, [0.13, 0.15, 0.024]);
      const tp = P0.clone().addScaledVector(d, 0.6);
      r.add(G.sphere(12, 8), steel, [tp.x, tp.y, tp.z], q, [0.065, 0.05, 0.012]).fx(0, 0);
    }
    face(r, [0, 0.56, 0.06], 0.24, {
      bone: 'head', tilt: 0.36, ex: 0.088, ey: 0.07, er: 0.06, iris: '#3a2210', skin: mixc(fur, furL, 0.4), browCol: '#3a2212', browY: 1.4, browT: 0.42,
      mc: [0, 0.49, 0.26], mR: 0.115, mTilt: 0.12, mouthY: -0.04, mouthW: 0.085, buck: true, buckW: 0.22, buckH: 0.3, noTongue: true,
      blushX: 0.75, blushY: 1.05, heartY: 0.95, heartX: 1.05,
    });
    if (E) crown(r.on('head'), [0, 0.9, -0.08], 0.5);
    r.on('head').mark('muzzle', [0, 0.54, 0.4]);
    // dirt mound with clods (only shown while burrowing; lives on its own bone so it stays on the ground)
    const mcol = (() => { const out = new THREE.Color(), a = col(dirtD), b = col(dirt), c = col(dirtL); return (x, y, z) => {
      const n = fbm3(x * 8, y * 8, z * 8);
      return out.copy(a).lerp(b, clamp(smooth01(y / 0.16) * 0.8 + 0.4 * n - 0.1, 0, 1)).lerp(c, smooth01((y - 0.12) / 0.12) * n * 0.8);
    }; })();
    r.on('mound').fx(0, 0).add(moundGeo(), mcol, [0, -0.08, 0], null, [0.56, 0.32, 0.56]);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU + (i % 3) * 0.3, rr = 0.5 + (i % 2) * 0.1, sz = 0.05 + (i % 3) * 0.018;
      r.add(G.sphere(10, 8), i % 4 === 0 ? dirtL : dirt, [Math.sin(a) * rr, sz * 0.4, Math.cos(a) * rr], null, [sz, sz * 0.75, sz]);
    }
    for (const c of [[0.08, 0.2, 0.05, 0.05], [-0.1, 0.18, -0.06, 0.045], [0.02, 0.23, -0.1, 0.04]]) r.add(G.sphere(10, 8), dirtL, [c[0], c[1], c[2]], null, c[3]);
    r.fx(0, 0.4).add(G.dodeca(), '#9ea6b2', [0.3, 0.1, 0.22], [0.3, 0.5, 0], 0.035).add(G.dodeca(), '#b3aa9c', [-0.28, 0.12, -0.2], [0.8, 0.1, 0.4], 0.03).fx(0, 0);
    return { height: 0.9, glowC: col('#ff7a4a'), mat: { rough: 0.72, sss: col('#e8c0a0').multiplyScalar(0.03), rimK: 0.26, rimP: 2.4 } };
  }
  function animKostebek(m, dt, st, s) {
    // turning happy while half dug in → it pops back up to cheer (quickly, not with a jump)
    s.bd = st.dying >= 0 ? damp(s.bd ?? 0, 0, 14, dt) : clamp(st.burrow || 0, 0, 1);
    const B = m.B, bur = s.bd, up = 1 - bur;
    if (s.mv > 0.03) s.walk += dt * (7 + 5 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.4) * up, br = Math.sin(s.t * 2.6 + s.ph);
    // waddle + breathing
    B.body.position.y += Math.abs(Math.sin(ph)) * 0.035 * k + br * 0.005;
    B.body.rotation.z = Math.sin(ph) * 0.1 * k;
    B.body.scale.set(1 + 0.018 * br, 1 - 0.012 * br, 1 + 0.018 * br);
    B.footL.position.y += Math.max(0, Math.sin(ph)) * 0.05 * k; B.footL.position.z += Math.cos(ph) * 0.05 * k;
    B.footR.position.y += Math.max(0, -Math.sin(ph)) * 0.05 * k; B.footR.position.z -= Math.cos(ph) * 0.05 * k;
    B.armL.rotation.x = -Math.sin(ph) * 0.45 * k + Math.sin(s.t * 1.9) * 0.04; B.armR.rotation.x = Math.sin(ph) * 0.18 * k;
    B.head.rotation.z = Math.sin(s.t * 1.4 + s.ph) * 0.05;
    const sniff = Math.max(0, Math.sin(s.t * 0.8 + s.ph * 2) - 0.85) * 6.6;   // now and then a happy little sniff
    B.head.rotation.x = Math.sin(s.t * 22) * 0.025 * sniff - 0.04 * sniff;
    if (st.windup >= 0) {   // shovel up high, lean back
      const w = smooth01(st.windup * 1.3);
      B.armR.rotation.x = -2.5 * w; B.shovel.rotation.x = 1.5 * w; B.armR.rotation.z = -0.2 * w;
      B.body.rotation.x = -0.25 * w; B.head.rotation.x = -0.12 * w; B.body.position.x += Math.sin(s.t * 50) * 0.008 * st.windup;
      B.armL.rotation.x = -0.7 * w; B.armL.rotation.z = 0.3 * w;
    }
    if (st.attack >= 0) {   // bonk!
      const a = st.attack, hit = smooth01(a / 0.24), back = smooth01((a - 0.36) / 0.64);
      B.armR.rotation.x = lerp(-2.5, -0.7, hit) * (1 - back); B.shovel.rotation.x = lerp(1.5, 2.1, hit) * (1 - back);
      B.armR.rotation.z = -0.2 * (1 - hit);
      B.body.rotation.x = 0.3 * Math.sin(PI * Math.min(1, a * 1.6)); B.body.position.y += 0.06 * Math.sin(PI * Math.min(1, a * 2));
    }
    // burrowing: dives nose first with a wiggle and sinks; the dirt mound grows, then bumps along while travelling
    if (bur > 0.001) {
      const sink = smooth01(bur);
      B.body.position.y -= sink * 1.04;
      B.body.rotation.x += 0.35 * sink;
      B.body.rotation.z += Math.sin(s.t * 34) * 0.1 * Math.sin(PI * bur);
      if (bur > 0.97) B.body.scale.setScalar(0.0001);
      const ms = smooth01(bur / 0.35), mv = s.mv;
      B.mound.scale.set(ms * (1 + 0.06 * Math.sin(s.t * 11) * mv), ms * (1 + 0.14 * Math.sin(s.t * 16) * mv), ms * (1 + 0.06 * Math.cos(s.t * 11) * mv));
      B.mound.position.y += Math.abs(Math.sin(s.t * 13)) * 0.035 * mv * ms;
      B.mound.rotation.y = Math.sin(s.t * 5 + s.ph) * 0.25;
      if (st.windup >= 0) {   // about to pop up: the mound trembles and swells
        const w = st.windup;
        B.mound.position.x += Math.sin(s.t * 57) * 0.035 * w; B.mound.position.z += Math.cos(s.t * 49) * 0.03 * w;
        B.mound.scale.multiplyScalar(1 + 0.12 * w + 0.05 * Math.sin(s.t * 30) * w);
      }
    } else B.mound.scale.setScalar(0.0001);
  }

  // ── Salyangoz: cute snail — glossy pastel spiral shell, soft body, eye stalks with big smiling eyes, rosy cheeks.
  // Ducks into its shell when hurt (st.hurt). ──
  // The shell is rolled a little to one side (like a real coiled shell) so the swirl also reads from the high gameplay camera.
  const SHELL_C = [0.02, 0.46, -0.14], SHELL_S = [0.28, 0.37, 0.39], SHELL_ROLL = 0.55;
  // Log-spiral coordinate on the shell's side (axis = x): frac() gives the position across a whorl (seam-free).
  function shellS(y, z) {
    const rho = Math.max(1e-3, Math.hypot(y, z)), a = Math.atan2(y, z) + 0.64;
    const phi = ((a % TAU) + TAU) % TAU;
    return { s: phi / TAU - Math.log(rho) / 0.82, rho };
  }
  function shellGeo() {
    const w = LODK < 0.8 ? 64 : 80, h = LODK < 0.8 ? 48 : 60;   // the swirl needs the resolution (vertex-coloured bands)
    return gx('snailShell@' + w, () => {
      const g = new THREE.SphereGeometry(1, w, h), p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const S = shellS(v.y, v.z), f = S.s - Math.floor(S.s), dd = Math.min(f, 1 - f);
        const side = smooth01((Math.abs(v.x) - 0.05) / 0.45) * smooth01((S.rho - 0.1) / 0.12);
        const groove = Math.exp(-(dd / 0.09) * (dd / 0.09)) * side;
        const bulge = 1 + 0.07 * Math.sin(PI * f) * side;   // each whorl a little rounded
        v.multiplyScalar(bulge * (1 - 0.1 * groove));
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return seamNormals(g);
    });
  }
  function buildSalyangoz(r, o) {
    const E = o.elite;
    let body = col('#f9c77c'), bodyD = col('#e09c55'), bodyL = col('#ffe2ae');
    let shA = col('#f77fb4'), shB = col('#a48cf2'), shL = col('#fff0c4'), shC = col('#ff6fa8');
    if (E) { body = rich(body, 1.2, 0.95); bodyD = rich(bodyD, 1.2, 0.9); shA = rich(shA, 1.25, 0.92); shB = rich(shB, 1.25, 0.9); shC = rich(shC, 1.2, 0.9); }
    r.bone('body', 'root', [0, 0.05, 0]);
    r.bone('shell', 'body', [0, 0.2, -0.14]);
    r.bone('head', 'body', [0, 0.3, 0.3]);
    r.bone('stalkL', 'head', [0.07, 0.55, 0.3]); r.bone('stalkR', 'head', [-0.07, 0.55, 0.3]);
    const EYE = [[0.14, 0.81, 0.35], [-0.14, 0.81, 0.35]], er = 0.082;
    r.bone('eyeL', 'stalkL', EYE[0]); r.bone('eyeR', 'stalkR', EYE[1]);
    r.bone('joy', 'head', [0, 0.8, 0.3]);
    // soft slug foot (lighter frilly edge below), neck and round head
    const fcol = (() => { const out = new THREE.Color(); return (x, y, z) => out.copy(bodyD).lerp(body, smooth01((y - 0.02) / 0.14)).lerp(bodyL, smooth01((y - 0.3) / 0.25) * 0.5); })();
    r.on('body').fx(0, 0.55).add(G.sphere(32, 20), fcol, [0, 0.1, -0.04], null, [0.25, 0.12, 0.54]);
    r.add(G.sphere(20, 12), fcol, [0, 0.06, -0.48], null, [0.13, 0.07, 0.16]);
    r.on('head').seg([0, 0.12, 0.24], [0, 0.36, 0.31], 0.155, fcol, 0.14, 18);
    r.add(G.sphere(32, 24), fcol, [0, 0.42, 0.32], null, [0.19, 0.18, 0.18]);
    // eye stalks with balls at the tips (the eyes themselves are per mood)
    for (let i = 0; i < 2; i++) {
      const sx = i ? -1 : 1, e = EYE[i];
      r.on(i ? 'stalkR' : 'stalkL').seg([0.065 * sx, 0.54, 0.3], [e[0], e[1] - 0.03, e[2] - 0.01], 0.034, body, 0.026, 10);
      r.on(i ? 'eyeR' : 'eyeL').add(G.sphere(20, 14), body, e, null, er * 0.98);
    }
    // glossy pastel spiral shell: swirl bands + a cream line in each groove
    const shcol = (() => { const out = new THREE.Color(); return (x, y, z) => {
      const dx = x - SHELL_C[0], dy = y - SHELL_C[1], cr = Math.cos(SHELL_ROLL), sr = Math.sin(SHELL_ROLL);
      const lx = (dx * cr + dy * sr) / SHELL_S[0], ly = (-dx * sr + dy * cr) / SHELL_S[1], lz = (z - SHELL_C[2]) / SHELL_S[2];
      const S = shellS(ly, lz), f = S.s - Math.floor(S.s), dd = Math.min(f, 1 - f), side = smooth01((Math.abs(lx) - 0.05) / 0.45);
      if (S.rho < 0.13 && side > 0.5) return out.copy(shC);   // centre of the swirl
      const band = (Math.floor(S.s * 2) & 1) ? shB : shA, hf = S.s * 2 - Math.floor(S.s * 2);
      out.copy(band).lerp(shL, 0.22 * Math.sin(PI * hf));   // each band lighter in its middle (rounded look)
      return out.lerp(shL, smooth01((0.075 - dd) / 0.03) * (0.5 + 0.5 * side));
    }; })();
    r.on('shell').fx(0, 1).add(shellGeo(), shcol, SHELL_C, [0, 0, SHELL_ROLL], SHELL_S);
    // eyes: mischievous (open, brows) / overjoyed (^ ^)
    for (let i = 0; i < 2; i++) {
      const sx = i ? -1 : 1, e = EYE[i], bn = i ? 'eyeR' : 'eyeL';
      r.on(bn).push(e, [-0.5, sx * 0.12, 0]);
      r.mood = 1;
      r.push([0, 0, er * 0.36]); eyeOpen(r, sx, { er, iris: '#4a2a1a', look: 0.7, lookY: 0.02 }, false); r.pop();
      const up = sx > 0 ? er * 0.35 : 0, bA = PI * 0.56;
      r.fx(0, 0.25).add(G.torus(bA, 0.42, 14), '#5a3020', [0, er * 1.02 + up, er * 0.42], [0, 0, (PI - bA) / 2], [er * 0.7, er * (up ? 0.58 : 0.46), er * 0.42]);
      r.mood = 2;
      r.push([0, er * 0.1, er * 0.72]); eyeClosed(r, { er }); r.pop();
      r.mood = 0; r.fx(0, 0);
      r.pop();
    }
    // mouth + rosy cheeks on the head
    const HC = [0, 0.42, 0.32], HR = 0.18;
    r.on('head').push(HC, [-0.3, 0, 0]);
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * 0.115, -0.035, HR, -0.004); r.push(p, q); blush(r, 0.085, { blushCol: '#ff7fa6' }); r.pop(); }
    r.mood = 1; { const [p, q] = onSphere(0, -0.06, HR, 0); r.push(p, q); smirk(r, 0.085, {}); r.pop(); }
    r.mood = 2; { const [p, q] = onSphere(0, -0.05, HR, 0); r.push(p, q); smile(r, 0.125, { noTeeth: true }); r.pop(); }
    r.mood = 0;
    r.pop();
    r.on('joy').push(HC, [-0.3, 0, 0]).fx(0.5, 0.6);
    r.mood = 2;
    for (const s of [-1, 1]) r.add(heartGeo(), '#ff4f93', [s * 0.3, 0.34 + (s > 0 ? 0.05 : 0), 0.05], [-0.25, 0, -s * 0.38], 0.075 * (s > 0 ? 0.8 : 1));
    r.mood = 0; r.pop().fx(0, 0);
    if (E) crown(r.on('shell'), [-0.1, 0.8, -0.14], 0.55);
    r.on('head').mark('muzzle', [0, 0.38, 0.52]);
    return { height: 0.9, glowC: col('#ff7ab0'), mat: { rough: 0.35, sss: col('#ffe2b8').multiplyScalar(0.06), rimK: 0.28 } };
  }
  function animSalyangoz(m, dt, st, s) {
    const B = m.B;
    if (s.mv > 0.03) s.walk += dt * (4 + 3 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.5), br = Math.sin(s.t * 2 + s.ph);
    // foot ripple, head bob, wiggly eye stalks
    B.body.scale.set(1, 1 - 0.03 * Math.sin(ph) * k + 0.01 * br, 1 + 0.06 * Math.sin(ph) * k);
    B.head.rotation.x = Math.sin(ph) * 0.06 * k + Math.sin(s.t * 1.6 + s.ph) * 0.04;
    B.head.rotation.z = Math.sin(s.t * 1.1 + s.ph) * 0.06;
    B.stalkL.rotation.z = -0.06 + Math.sin(s.t * 2.3 + s.ph) * 0.13; B.stalkR.rotation.z = 0.06 + Math.sin(s.t * 2.1 + s.ph + 1.7) * 0.13;
    B.stalkL.rotation.x = Math.sin(s.t * 1.7) * 0.08 - 0.1 * k; B.stalkR.rotation.x = Math.sin(s.t * 1.5 + 1) * 0.08 - 0.1 * k;
    B.shell.rotation.z = Math.sin(ph) * 0.035 * k; B.shell.position.y += Math.abs(Math.sin(ph)) * 0.012 * k;
    let bl = 1;
    if (s.mood !== 'happy') {
      s.bt -= dt;
      if (s.bt < 0) { const u = -s.bt / 0.14; if (u >= 1) s.bt = frand(1.6, 4.5); else bl = 1 - Math.sin(u * PI) * 0.9; }
    }
    if (st.windup >= 0) {   // takes a big breath: cheeks puff, leans back, eyes squeeze into a giggle
      const w = smooth01(st.windup);
      B.body.rotation.x = -0.14 * w; B.head.position.z -= 0.05 * w; B.head.rotation.x -= 0.25 * w;
      B.head.scale.set(1 + 0.2 * w, 1 + 0.06 * w, 1 + 0.12 * w);
      B.stalkL.rotation.x -= 0.35 * w; B.stalkR.rotation.x -= 0.35 * w;
      B.head.position.x += Math.sin(s.t * 50) * 0.008 * st.windup;
      if (s.mood !== 'happy') bl = Math.min(bl, 1 - 0.58 * smooth01(st.windup * 1.8));
    }
    if (st.attack >= 0) {   // pfff — blows the bubble
      const k2 = Math.sin(PI * st.attack);
      B.head.position.z += 0.07 * k2; B.head.rotation.x += 0.25 * k2; B.head.scale.set(1 - 0.08 * k2, 1, 1 + 0.08 * k2);
    }
    // ducks into its shell when hurt, then peeks out again
    s.duck = Math.max(damp(s.duck || 0, 0, 5, dt), st.hurt > 0.5 ? 1 : 0);
    const d = smooth01(s.duck);
    if (d > 0.001) {
      B.head.position.z -= 0.36 * d; B.head.position.y -= 0.12 * d; B.head.scale.multiplyScalar(1 - 0.55 * d);
      const ss = 1 - 0.85 * d; B.stalkL.scale.setScalar(ss); B.stalkR.scale.setScalar(ss);
      B.body.scale.z *= 1 - 0.3 * d; B.body.scale.y *= 1 - 0.15 * d;
    }
    B.eyeL.scale.y = bl; B.eyeR.scale.y = bl;
  }

  function ghostGeo() {
    const rows = sN(52, 24), segs = sN(54, 36);   // ≥ 6 segments per hem wave
    return gx('ghost@' + rows + '_' + segs, () => {
      const pts = [[0, 0.17], [0.2, 0.13], [0.36, 0.06], [0.47, 0.01], [0.52, 0.05], [0.5, 0.2], [0.47, 0.42], [0.45, 0.62], [0.42, 0.8], [0.34, 0.95], [0.21, 1.06], [0.08, 1.11], [0, 1.12]];
      const v = new THREE.SplineCurve(pts.map(p => new THREE.Vector2(p[0], p[1]))).getPoints(rows);
      v.forEach(q => { q.x = Math.max(0, q.x); });
      const g = new THREE.LatheGeometry(v, segs), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {   // wavy hem
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), f = smooth01((0.28 - y) / 0.26);
        const w = Math.sin(a * 6);
        const rr = Math.hypot(x, z), k = 1 + 0.06 * w * f;
        p.setXYZ(i, x * k, y - 0.055 * (0.5 + 0.5 * w) * f * Math.min(1, rr / 0.3), z * k);
      }
      g.computeVertexNormals();
      return seamNormals(g);
    });
  }
  function buildHayalet(r, o) {
    const E = o.elite;
    const top = E ? '#b69cf4' : '#d2c6f7', mid = E ? '#9272ee' : '#b4a2f0', hem = E ? '#cc88f0' : '#d4b0f4';
    r.bone('body', 'root', [0, 0.1, 0]);
    r.bone('armL', 'body', [0.4, 0.55, 0]); r.bone('armR', 'body', [-0.4, 0.55, 0]);
    const wob = (x, y) => smooth01((0.4 - y) / 0.38);
    r.on('body').fx(0.3, 0, 0, wob).add(ghostGeo(), vgrad(0, 1.12, [[0, hem], [0.35, mid], [1, top]]));
    r.fx(0.3, 0, 0, 0);
    cone(r, [0, 1.08, -0.02], [-0.3, 1, -0.4], 0.14, 0.07, top, 12);   // little curl on top
    r.on('armL').fx(0.3, 0).add(G.sphere(16, 12), mid, [0.46, 0.5, 0.05], [0, 0, 0.6], [0.09, 0.15, 0.09]);
    r.on('armR').fx(0.3, 0).add(G.sphere(16, 12), mid, [-0.46, 0.5, 0.05], [0, 0, -0.6], [0.09, 0.15, 0.09]);
    r.fx(0, 0);
    face(r, [0, 0.7, 0], 0.44, { bone: 'body', tilt: 0.34, ex: 0.15, ey: 0.05, er: 0.12, iris: '#3a2a78', skin: mixc(mid, top, 0.55), skinFx: 0.3, browCol: '#4a3a8c', browY: 1.36, mouthY: -0.13, mouthW: 0.12, blushCol: '#ff8fc8', heartY: 0.7 });
    if (E) crown(r.on('body'), [0, 1.08, -0.02], 0.62);
    r.mark('muzzle', [0, 0.58, 0.48]);
    return { height: 1.12, glowC: col('#ffffff'), mat: { rough: 0.35, sss: col(top).multiplyScalar(0.12), rim: '#f4eeff', rimK: 0.45, rimP: 2.0, wob: 0.035, wobF: 4, wobS: 3.2 } };
  }
  function animHayalet(m, dt, st, s) {
    const B = m.B;
    B.body.position.y += Math.sin(s.t * 2 + s.ph) * 0.04;
    B.body.rotation.z = Math.sin(s.t * 1.3 + s.ph) * 0.06;
    B.body.rotation.x = 0.16 * s.mv;
    B.armL.rotation.z = 0.2 + Math.sin(s.t * 2.6 + s.ph) * 0.25; B.armR.rotation.z = -0.2 - Math.sin(s.t * 2.6 + s.ph + 1) * 0.25;
    let wob = 0.035 + 0.02 * s.mv;
    if (st.windup >= 0) {
      const w = smooth01(st.windup);
      B.body.scale.set(1 + 0.14 * w, 1 + 0.1 * w, 1 + 0.14 * w); B.body.rotation.x -= 0.25 * w;
      B.armL.rotation.z = 0.2 + 2.1 * w; B.armR.rotation.z = -0.2 - 2.1 * w; wob += 0.03 * w;
    }
    if (st.attack >= 0) {
      const k = Math.sin(PI * st.attack);
      B.body.position.z += 0.3 * k; B.body.rotation.x += 0.3 * k; B.body.scale.z = 1 + 0.1 * k;
      B.armL.rotation.x = -1.2 * k; B.armR.rotation.x = -1.2 * k;
    }
    m.U.uWob.value.x = wob;
  }

  function buildGolem(r, o) {
    const E = o.elite;
    const rock = E ? '#b3a595' : '#a89c90', rockD = E ? '#7d6f62' : '#7b7169', moss = E ? '#6cb238' : '#72ad3e', cry = E ? '#ffd23f' : '#56eeff';
    const cK = E ? 0.8 : 1;   // gold crystals bloom more than cyan ones
    const rt = texOf('rock');
    r.bone('hips', 'root', [0, 0.85, 0]);
    r.bone('torso', 'hips', [0, 1.1, 0]);
    r.bone('head', 'torso', [0, 1.95, 0.25]);
    r.bone('armL', 'torso', [0.82, 1.78, 0]); r.bone('armR', 'torso', [-0.82, 1.78, 0]);
    r.bone('foreL', 'armL', [1.0, 1.28, 0.06]); r.bone('foreR', 'armR', [-1.0, 1.28, 0.06]);
    r.bone('legL', 'hips', [0.36, 0.7, 0]); r.bone('legR', 'hips', [-0.36, 0.7, 0]);
    // rock colour with moss on the tops of the big boulders
    function rcol(cx, cy, cz, ry, mossy) {
      const out = new THREE.Color(), a = col(rock), b = col(rockD), mc = col(moss), md = mixc(moss, '#2f6a22', 0.5);
      return (x, y, z) => {
        const n = fbm3(x * 2.3, y * 2.3, z * 2.3);
        out.copy(b).lerp(a, 0.35 + 0.65 * smooth01((y - cy + ry * 0.9) / (ry * 1.6)) * (0.7 + 0.5 * n));
        if (mossy) { const t = (y - cy) / ry - 0.42 - 0.35 * (n - 0.5); if (t > 0) out.copy(md).lerp(mc, smooth01(t * 3) * (0.6 + 0.4 * n)); }
        return out;
      };
    }
    const R = (bone, seed, fine, p, s, rot, mossy) => {
      r.on(bone).fx(0, 0, 1).uv(fine ? 3 : 2, fine ? 1.5 : 1)
        .add(rockGeo(seed, fine), rcol(p[0], p[1], p[2], s[1], mossy), p, rot || null, s);
    };
    R('hips', 3, false, [0, 0.88, -0.02], [0.52, 0.34, 0.44], [0.2, 0.5, 0.1]);
    R('torso', 1, true, [0, 1.52, -0.08], [0.86, 0.66, 0.66], [0.1, 0.3, 0.05], true);
    R('torso', 7, false, [0, 1.25, 0.28], [0.5, 0.36, 0.32], [0.4, 1, 0]);
    R('head', 5, true, [0, 2.06, 0.28], [0.44, 0.37, 0.4], [0.3, 0.2, 0.1], true);
    for (const s of [-1, 1]) {
      const A = s > 0 ? 'armL' : 'armR', F = s > 0 ? 'foreL' : 'foreR', Lg = s > 0 ? 'legL' : 'legR';
      R(A, 2 + (s > 0 ? 0 : 9), false, [0.84 * s, 1.8, -0.02], [0.4, 0.36, 0.38], [0.3 * s, 0.6, 0.2], true);
      R(A, 4 + (s > 0 ? 0 : 9), false, [0.98 * s, 1.42, 0.04], [0.27, 0.34, 0.27], [0.1, s, 0.2]);
      R(F, 6 + (s > 0 ? 0 : 9), true, [1.04 * s, 0.86, 0.14], [0.44, 0.42, 0.44], [0.5, 0.8 * s, 0.3]);
      R(Lg, 8 + (s > 0 ? 0 : 9), false, [0.37 * s, 0.34, 0.02], [0.33, 0.38, 0.36], [0.2, s, 0.1]);
      // glowing crystal cluster on the shoulder
      r.on(A).uv(null).fx(1, 0);
      for (const c of [[0.2, 0.42, -0.1, 0.33, 0.3], [0.04, 0.38, -0.2, 0.25, -0.2], [0.3, 0.3, 0.05, 0.2, 0.6]]) {
        const d = [c[0] * s, 1, c[2] + 0.2 * c[4]], q = qy(...d);
        r.add(G.octa(), (x, y, z) => { const t = clamp((y - 1.9) / 0.5, 0, 1); return _gc.copy(col(cry)).multiplyScalar((2.2 + 1.8 * t) * cK).lerp(_w3, t * 0.3 * cK); },
          [0.84 * s + c[0] * s, 1.8 + c[1], c[2]], q, [0.075, c[3], 0.075]);
      }
      r.fx(0, 0);
    }
    // crystals on the back + one on the head
    r.on('torso').uv(null).fx(1, 0);
    for (const c of [[0.25, 1.95, -0.55, 0.35, [0.3, 0.8, -0.8]], [-0.2, 1.85, -0.62, 0.28, [-0.4, 0.6, -0.9]], [0.05, 1.6, -0.72, 0.22, [0, 0.3, -1]]]) {
      r.add(G.octa(), hdr(cry, 2.6 * cK), [c[0], c[1], c[2]], qy(...c[4]), [0.08, c[3], 0.08]);
    }
    r.on('head').add(G.octa(), hdr(cry, 2.8 * cK), [0.12, 2.42, 0.18], qy(0.3, 1, -0.2), [0.06, 0.2, 0.06]);
    r.fx(0, 0);
    face(r, [0, 2.06, 0.28], 0.4, {   // gentle smiling rock giant: warm friendly eye glow, mossy arched brows, soft smile
      bone: 'head', tilt: 0.3, ex: 0.16, ey: 0.03, er: 0.11, glowEye: E ? '#ffe7a0' : '#ffcf6a', browCol: moss, browT: 0.5, browW: 1.2, browH: 1.25, browY: 1.5,
      mouthY: -0.17, mouthW: 0.17, mouthCol: '#3a2a22', smirk: 0.12, noTongue: true, blushCol: '#ff9aa8', heartY: 0.8, heartX: 1.1,
    });
    r.on('foreR').mark('muzzle', [-1.04, 0.86, 0.3]);
    return { height: 2.45, glowK: 0.6, glowC: col(E ? '#ffb13a' : '#ff8a4a'), tex: rt, mat: { rough: 0.85, ns: 1.2, rim: '#dff6ff', rimK: 0.3 }, eliteRim: { rimK: 0.24, rimP: 3.2 } };   // bumpy rock catches a lot of rim
  }
  const _gc = new THREE.Color(), _w3 = new THREE.Color(3, 3, 3);
  function animGolem(m, dt, st, s) {
    const B = m.B;
    if (s.mv > 0.03) s.walk += dt * (3.2 + 2.2 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.5), br = Math.sin(s.t * 1.6 + s.ph);
    B.torso.scale.set(1 + 0.015 * br, 1 + 0.02 * br, 1 + 0.015 * br);
    B.hips.rotation.z = Math.sin(ph) * 0.07 * k; B.hips.position.y += Math.abs(Math.cos(ph)) * 0.06 * k;
    B.legL.rotation.x = Math.sin(ph) * 0.45 * k; B.legR.rotation.x = -Math.sin(ph) * 0.45 * k;
    B.legL.position.y += Math.max(0, Math.sin(ph)) * 0.1 * k; B.legR.position.y += Math.max(0, -Math.sin(ph)) * 0.1 * k;
    B.torso.rotation.x = 0.1 * k; B.torso.rotation.y = -Math.sin(ph) * 0.08 * k;
    B.armL.rotation.x = -Math.sin(ph) * 0.35 * k + 0.03 * br; B.armR.rotation.x = Math.sin(ph) * 0.35 * k + 0.03 * br;
    B.armL.rotation.z = 0.05 * br; B.armR.rotation.z = -0.05 * br;
    B.head.rotation.z = Math.sin(s.t * 0.8 + s.ph) * 0.05;
    if (st.windup >= 0) {
      const w = smooth01(st.windup * 1.2);
      B.armL.rotation.x = -2.75 * w; B.armR.rotation.x = -2.75 * w; B.armL.rotation.z = -0.25 * w; B.armR.rotation.z = 0.25 * w;
      B.foreL.rotation.x = -0.5 * w; B.foreR.rotation.x = -0.5 * w;
      B.torso.rotation.x = -0.3 * w; B.hips.position.y += 0.1 * w; B.head.rotation.x = -0.2 * w;
      B.hips.position.x += Math.sin(s.t * 45) * 0.02 * st.windup;
    }
    if (st.attack >= 0) {
      const a = st.attack, hit = smooth01(a / 0.22), back = smooth01((a - 0.45) / 0.55), v = hit * (1 - back);
      const armX = lerp(-2.75, 0.3, hit) * (1 - back);
      B.armL.rotation.x = armX; B.armR.rotation.x = armX; B.armL.rotation.z = -0.25 * (1 - hit); B.armR.rotation.z = 0.25 * (1 - hit);
      B.foreL.rotation.x = -0.5 * (1 - hit); B.foreR.rotation.x = -0.5 * (1 - hit);
      B.torso.rotation.x = lerp(-0.3, 0.5, hit) * (1 - back); B.head.rotation.x = 0.2 * v;
      const sq = a > 0.2 && a < 0.4 ? Math.sin(PI * (a - 0.2) / 0.2) : 0;
      B.hips.scale.set(1 + 0.08 * sq, 1 - 0.1 * sq, 1 + 0.08 * sq); B.hips.position.y -= 0.08 * sq;
    }
  }

  function buildAsker(r, o) {
    const E = o.elite;
    const red = E ? '#c8102e' : '#e23c40', redD = E ? '#8c0a22' : '#b52a33', navy = '#27397f', shako = '#1d2240', skin = '#ffd8bd', stache = '#6b3b1f';
    const white = '#ece5d6', boot = '#221e2a', metal = '#d6dde8';
    const fab = texOf('fabric');
    r.bone('hips', 'root', [0, 0.46, 0]);
    r.bone('body', 'hips', [0, 0.5, 0]);
    r.bone('head', 'body', [0, 0.9, 0]);
    r.bone('key', 'body', [0, 0.66, -0.24]);
    r.bone('armL', 'body', [0.25, 0.8, 0]); r.bone('armR', 'body', [-0.25, 0.8, 0]);
    r.bone('legL', 'hips', [0.1, 0.46, 0]); r.bone('legR', 'hips', [-0.1, 0.46, 0]);
    r.bone('sword', 'armR', [-0.3, 0.55, 0.1]);
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'legL' : 'legR').fx(0, 0, 1).uv(1, 2).seg([0.1 * s, 0.47, 0], [0.1 * s, 0.14, 0.0], 0.075, navy, 0.068, 14);
      r.uv(null).fx(0, 0.7).add(G.sphere(16, 10), boot, [0.1 * s, 0.08, 0.035], null, [0.085, 0.085, 0.13]).fx(0, 0);
      r.fx(0, 0, 0).seg([0.1 * s + 0.07 * s, 0.44, 0.01], [0.1 * s + 0.065 * s, 0.16, 0.01], 0.012, red, 0.012, 6);
    }
    // jacket (fabric), belt, cross straps, gold buttons + epaulettes
    r.on('body').fx(0, 0, 1).uv(3, 1).add(lathe('aJacket', [[0, 0.42], [0.2, 0.42], [0.235, 0.46], [0.24, 0.6], [0.235, 0.74], [0.21, 0.83], [0.12, 0.87], [0, 0.875]], 32),
      vgrad(0.42, 0.87, [[0, redD], [0.3, red], [1, red]]), [0, 0, 0], null, [1, 1, 0.9]);
    r.uv(null).fx(0, 0.4).add(G.torus(TAU, 0.28, 32), white, [0, 0.47, 0], [PI / 2, 0, 0], [0.238, 0.216, 0.1]);
    for (const s of [-1, 1]) {   // straps wrapped over the curved jacket front
      const N = 6;
      for (let i = 0; i < N; i++) {
        const t0 = i / N, t1 = (i + 1) / N, x0 = lerp(0.2 * s, -0.17 * s, t0), x1 = lerp(0.2 * s, -0.17 * s, t1), y0 = lerp(0.84, 0.5, t0), y1 = lerp(0.84, 0.5, t1);
        const z0 = 0.9 * Math.sqrt(Math.max(0, 0.245 * 0.245 - x0 * x0)) + 0.008, z1 = 0.9 * Math.sqrt(Math.max(0, 0.245 * 0.245 - x1 * x1)) + 0.008;
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
        r.add(G.rbox(2), white, [mx, my, mz], qb([x1 - x0, y1 - y0, z1 - z0], [mx / 0.245, 0, mz / 0.22]), [0.045, len * 1.12, 0.016]);
      }
    }
    r.fx(0, 2);
    for (const y of [0.56, 0.64, 0.76]) r.add(G.sphere(10, 8), GOLD, [0, y, 0.215], null, [0.022, 0.022, 0.012]);
    r.add(G.rbox(2), GOLD, [0, 0.47, 0.205], null, [0.06, 0.05, 0.02]);
    for (const s of [-1, 1]) {
      r.add(G.sphere(16, 8), GOLD, [0.22 * s, 0.84, 0], null, [0.09, 0.03, 0.08]);
      for (let i = 0; i < 5; i++) r.add(G.cyl(1, 1, 6), GOLD, [0.22 * s + (0.075 * s), 0.8, -0.06 + i * 0.03], null, [0.008, 0.06, 0.008]);
    }
    r.add(G.torus(TAU, 0.3, 24), GOLD, [0, 0.86, 0], [PI / 2, 0, 0], [0.12, 0.11, 0.06]);
    r.fx(0, 0);
    // wind-up key
    r.on('key').fx(0, 2).seg([0, 0.66, -0.2], [0, 0.66, -0.3], 0.022, GOLD, 0.022, 10);
    for (const s of [-1, 1]) r.add(G.torus(TAU, 0.28, 24), GOLD, [0.085 * s, 0.66, -0.31], [0, PI / 2, 0], [0.075, 0.06, 0.075]);
    r.add(G.sphere(10, 8), GOLD, [0, 0.66, -0.31], null, 0.03).fx(0, 0);
    // arms: red sleeves, white gloves, toy sword in the right hand
    r.on('armL').fx(0, 0, 1).seg([0.25, 0.8, 0], [0.29, 0.56, 0.04], 0.055, red, 0.05, 12).fx(0, 0.2).add(G.sphere(14, 10), white, [0.3, 0.52, 0.05], null, 0.058);
    r.on('armR').fx(0, 0, 1).seg([-0.25, 0.8, 0], [-0.29, 0.58, 0.08], 0.055, red, 0.05, 12).fx(0, 0.2).add(G.sphere(14, 10), white, [-0.3, 0.55, 0.1], null, 0.058);
    r.on('sword').fx(0, 2).add(G.rbox(2), metal, [-0.3, 0.84, 0.13], [0.12, 0, 0], [0.045, 0.52, 0.014]);
    r.add(G.cone(4), metal, [-0.3, 1.13, 0.165], [0.12, PI / 4, 0], [0.032, 0.07, 0.01]);
    r.add(G.rbox(2), GOLD, [-0.3, 0.58, 0.1], [0.12, 0, 0], [0.16, 0.03, 0.04]);
    r.add(G.sphere(8, 6), GOLD, [-0.3, 0.5, 0.09], null, 0.03).fx(0, 0);
    // head + shako with plume
    r.on('head').add(G.sphere(36, 26), skin, [0, 1.04, 0], null, [0.27, 0.265, 0.26]);
    r.add(G.sphere(14, 10), '#ffc2a4', [0, 1.0, 0.26], null, [0.045, 0.04, 0.04]);
    for (const s of [-1, 1]) {
      r.add(G.sphere(16, 10), stache, [0.07 * s, 0.945, 0.24], [0, 0, s * 0.35], [0.085, 0.036, 0.042]);
      r.add(G.sphere(10, 8), stache, [0.145 * s, 0.965, 0.21], null, 0.03);
    }
    r.push([0, 1.04, 0], [-0.1, 0, 0]);
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * 0.155, -0.07, 0.265, -0.004); r.push(p, q); blush(r, 0.09, { blushCol: '#ff8a9a' }); r.pop(); }
    r.pop();
    // shako: short and pushed back on the head (pivot at the crown) so the brim clears the eyes from the gameplay camera
    const SH = 0.34;
    r.push([0, 1.16, -0.05], [-0.32, 0, 0]);
    r.fx(0, 0.35).add(G.cyl(1.12, 1, 28), vgrad(1.13, 1.53, [[0, shako], [1, mixc(shako, '#4a5290', 0.3)]]), [0, SH / 2, 0], null, [0.215, SH, 0.215]);
    r.fx(0, 0.7).add(G.hemi(24), boot, [0, 0.012, 0.16], [-0.4, 0, 0], [0.18, 0.04, 0.1]);
    r.fx(0, 2).add(G.torus(TAU, 0.2, 28), GOLD, [0, SH - 0.005, 0], [PI / 2, 0, 0], [0.237, 0.237, 0.06]);
    r.add(G.torus(TAU, 0.2, 28), GOLD, [0, 0.02, 0], [PI / 2, 0, 0], [0.216, 0.216, 0.05]);
    r.add(extrude('star5', () => { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = i & 1 ? 0.2 : 0.5; s[i ? 'lineTo' : 'moveTo'](Math.sin(a) * rr, Math.cos(a) * rr); } return s; }, 0.08, 0.04, 4, 0.3),
      GOLD, [0, SH * 0.52, 0.232], null, [0.14, 0.14, 0.2]);
    r.fx(0, 0.2).add(G.sphere(18, 12), white, [0, SH + 0.065, 0], null, [0.07, 0.095, 0.07]);
    r.add(G.sphere(16, 12), red, [0, SH + 0.165, -0.01], null, [0.055, 0.075, 0.055]).fx(0, 0);
    if (E) { r.fx(0, 2); for (const s of [-1, 1]) r.add(G.cone(8), GOLD, [0.21 * s, SH - 0.02, 0], [0, 0, -0.5 * s], [0.04, 0.12, 0.04]); r.fx(0, 0); }
    r.pop();
    face(r, [0, 1.04, 0], 0.265, { bone: 'head', tilt: 0.3, ex: 0.1, ey: 0.035, er: 0.088, iris: '#2e3f8f', skin, browCol: stache, browY: 1.3, mouthY: -0.155, mouthW: 0.085, smirk: 0.2, noBlush: true, heartY: 0.95, heartX: 1.15 });
    r.on('sword').mark('muzzle', [-0.3, 1.0, 0.16]);
    return { height: 1.6, glowC: col('#ff5a3a'), tex: fab, mat: { rough: 0.55, ns: 0.7 } };
  }
  function animAsker(m, dt, st, s) {
    const B = m.B;
    if (s.mv > 0.03) s.walk += dt * (6.5 + 4 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.4), sq = Math.sign(Math.sin(ph)) * Math.pow(Math.abs(Math.sin(ph)), 0.6);
    B.legL.rotation.x = sq * 0.5 * k; B.legR.rotation.x = -sq * 0.5 * k;
    B.hips.position.y += Math.abs(Math.sin(ph)) * 0.05 * k + Math.sin(s.t * 2 + s.ph) * 0.005;
    B.hips.rotation.z = Math.sin(ph) * 0.05 * k;
    B.armL.rotation.x = -sq * 0.45 * k; B.armR.rotation.x = sq * 0.2 * k;
    B.head.rotation.z = Math.sin(s.t * 1.1 + s.ph) * 0.04;
    s.key += dt * (2 + 5 * s.mv + (st.windup >= 0 ? 14 * st.windup : 0));
    B.key.rotation.z = s.key;
    if (st.windup >= 0) {
      const w = smooth01(st.windup * 1.25);
      B.armR.rotation.x = -2.6 * w; B.sword.rotation.x = 1.9 * w; B.armR.rotation.z = -0.3 * w;
      B.body.rotation.x = -0.2 * w; B.head.rotation.x = -0.1 * w; B.hips.position.x += Math.sin(s.t * 50) * 0.008 * st.windup;
    }
    if (st.attack >= 0) {
      const a = st.attack, hit = smooth01(a / 0.25), back = smooth01((a - 0.35) / 0.65);
      B.armR.rotation.x = lerp(-2.6, -0.6, hit) * (1 - back); B.sword.rotation.x = lerp(1.9, 2.5, hit) * (1 - back); B.armR.rotation.z = -0.3 * (1 - hit);
      B.body.rotation.x = 0.28 * hit * (1 - back); B.body.rotation.y = -0.2 * hit * (1 - back);
    }
  }

  function buildAtescik(r, o) {
    const E = o.elite;
    const core = E ? '#ffffff' : '#fff7c4', mid = E ? '#ffd23f' : '#ffc23a', outer = E ? '#ff5a1a' : '#ff7a1c', tip = E ? '#e8202a' : '#ff3d2e';
    r.bone('body', 'root', [0, 0.05, 0]);
    r.bone('top', 'body', [0, 0.5, 0]);
    r.bone('armL', 'body', [0.3, 0.35, 0]); r.bone('armR', 'body', [-0.3, 0.35, 0]);
    const fcol = (y0, y1) => vgrad(y0, y1, [[0, hdr(core, 1.9)], [0.3, hdr(mid, 1.5)], [0.62, hdr(outer, 1.3)], [1, hdr(tip, 1.15)]]);
    const wob = (x, y) => smooth01((y - 0.25) / 0.6);
    const flame = lathe('flame', [[0, 0.02], [0.17, 0.035], [0.29, 0.12], [0.35, 0.27], [0.34, 0.42], [0.27, 0.57], [0.17, 0.71], [0.08, 0.84], [0, 0.95]], 28, 3);
    r.on('body').fx(1, 0, 0, wob).add(flame, fcol(0.02, 0.95));
    r.on('top');
    r.add(flame, fcol(0.35, 0.95), [0.19, 0.4, -0.04], [0, 0, -0.5], [0.5, 0.6, 0.5]);
    r.add(flame, fcol(0.35, 0.95), [-0.2, 0.38, -0.02], [0, 0, 0.55], [0.45, 0.55, 0.45]);
    r.add(flame, fcol(0.45, 1.05), [0.02, 0.5, -0.14], [-0.4, 0, 0.1], [0.5, 0.55, 0.5]);
    r.on('armL').fx(1, 0, 0, 0.5).add(flame, fcol(0.2, 0.55), [0.36, 0.26, 0.04], [0, 0, -0.9], [0.28, 0.32, 0.28]);
    r.on('armR').fx(1, 0, 0, 0.5).add(flame, fcol(0.2, 0.55), [-0.36, 0.26, 0.04], [0, 0, 0.9], [0.28, 0.32, 0.28]);
    r.fx(0, 0);
    face(r, [0, 0.36, 0], 0.335, { bone: 'body', tilt: 0.34, ex: 0.12, ey: 0.035, er: 0.105, iris: '#5a2208', skin: hdr(mixc(mid, outer, 0.25), 1.45), skinFx: 1, browCol: '#7a2a0a', browY: 1.34, mouthY: -0.12, mouthW: 0.1, mouthCol: '#5a1404', blushCol: '#ff5a8a', heartY: 0.8 });
    if (E) crown(r.on('top').fx(0, 0), [0, 0.86, -0.04], 0.6);
    r.on('body').mark('muzzle', [0, 0.3, 0.38]);
    return { height: 0.95, glowC: col('#ffd23f'), mat: { rough: 0.5, sss: col('#fff2a0').multiplyScalar(0.3), rim: '#ffe6a0', rimK: 0.5, wob: 0.03, wobF: 6, wobS: 9 } };
  }
  function animAtescik(m, dt, st, s) {
    const B = m.B;
    const f1 = Math.sin(s.t * 13 + s.ph) * 0.5 + Math.sin(s.t * 21.7) * 0.3 + Math.sin(s.t * 7.3) * 0.2;
    B.body.scale.set(1 - 0.03 * f1, 1 + 0.06 * f1, 1 - 0.03 * f1);
    B.body.position.y += Math.sin(s.t * 2.2 + s.ph) * 0.03;
    B.body.rotation.x = 0.15 * s.mv;
    B.top.rotation.z = Math.sin(s.t * 3.1 + s.ph) * 0.12; B.top.rotation.x = -0.1 * s.mv + Math.sin(s.t * 2.3) * 0.06;
    B.armL.rotation.z = Math.sin(s.t * 4 + s.ph) * 0.2; B.armR.rotation.z = -Math.sin(s.t * 4 + s.ph + 1.3) * 0.2;
    let wob = 0.03 + 0.015 * s.mv;
    if (st.windup >= 0) {
      const w = smooth01(st.windup);
      B.body.scale.set(1 + 0.15 * w, 1 + 0.3 * w + 0.08 * f1, 1 + 0.15 * w); B.body.rotation.x -= 0.25 * w;
      B.armL.rotation.z = 1.4 * w; B.armR.rotation.z = -1.4 * w; wob += 0.03 * w;
    }
    if (st.attack >= 0) {
      const k = Math.sin(PI * st.attack);
      B.body.position.z += 0.25 * k; B.body.rotation.x += 0.35 * k; B.body.scale.y *= 1 - 0.15 * k;
    }
    m.U.uWob.value.x = wob;
  }

  // ── Boss: Huysuz Ejderha ──
  let SCALE_TEX = null;
  function scaleTex() {   // procedural overlapping-scale normal map (tileable, 8 × 8 scales)
    if (SCALE_TEX) return SCALE_TEX;
    const S = 128, N = 8, H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S * N, v = y / S * N; let h = 0;
      for (let dj = -1; dj <= 2; dj++) {
        const j = Math.floor(v) + dj, off = (j & 1) * 0.5;
        for (let di = -1; di <= 1; di++) {
          const i = Math.floor(u - off) + di, cx = i + 0.5 + off, cy = j + 0.15;
          const dx = u - cx, dy = (v - cy) * 1.1, d = Math.hypot(dx, dy);
          if (d < 0.66 && dy < 0.25) h = Math.max(h, 0.25 + 0.75 * Math.sqrt(1 - d / 0.66) * smooth01((0.25 - dy) / 0.5));
        }
      }
      H[y * S + x] = h;
    }
    const D = new Uint8Array(S * S * 4), k = 2.2;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)], hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
      let nx = -hx * k, ny = -hy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = (y * S + x) * 4; D[o] = (nx * 0.5 + 0.5) * 255; D[o + 1] = (ny * 0.5 + 0.5) * 255; D[o + 2] = (nz * 0.5 + 0.5) * 255; D[o + 3] = 255;
    }
    const t = new THREE.DataTexture(D, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = ANISO; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return (SCALE_TEX = { normalMap: t });
  }
  function buildEjderha(r, o) {
    const body = '#7a46cc', bodyD = '#55309f', bodyL = '#9563e0', belly = '#e2cffa', plate = '#cdb2f5', horn = '#f2d9a4', claw = '#f5e4c2';
    const spike = '#f06bbd', mem = '#a67ce6', strut = '#5f36a8';
    r.bone('hips', 'root', [0, 1.0, 0]);
    r.bone('body', 'hips', [0, 1.5, 0]);
    r.bone('chest', 'body', [0, 2.2, 0.15]);
    r.bone('neck', 'chest', [0, 2.5, 0.32]);
    r.bone('head', 'neck', [0, 3.3, 0.8]);
    r.bone('jaw', 'head', [0, 3.2, 1.02]);
    r.bone('glow', 'head', [0, 3.12, 2.02]);
    r.bone('wingL', 'chest', [0.62, 2.72, -0.55]); r.bone('wingR', 'chest', [-0.62, 2.72, -0.55]);
    r.bone('armL', 'chest', [0.82, 2.12, 0.5]); r.bone('armR', 'chest', [-0.82, 2.12, 0.5]);
    r.bone('legL', 'hips', [0.68, 1.02, 0.05]); r.bone('legR', 'hips', [-0.68, 1.02, 0.05]);
    const TP = [[0, 0.85, -0.95], [0.06, 0.58, -1.62], [0.26, 0.42, -2.22], [0.58, 0.36, -2.72], [0.95, 0.36, -3.1], [1.25, 0.4, -3.38]];
    r.bone('t1', 'hips', TP[0]); r.bone('t2', 't1', TP[1]); r.bone('t3', 't2', TP[2]); r.bone('t4', 't3', TP[3]); r.bone('t5', 't4', TP[4]);
    const tx = 0.55;   // metres per scale tile / 8
    const SC = (rad) => [2 * PI * rad / (8 * tx * 0.5), PI * rad / (8 * tx * 0.5)];
    const bcol = vgrad(0.2, 2.9, [[0, bodyD], [0.45, body], [1, bodyL]]);
    // body + belly with plates
    r.on('body').fx(0, 0, 1).uv(...SC(1.25)).add(G.sphere(40, 30), bcol, [0, 1.62, -0.06], null, [1.24, 1.32, 1.16]);
    r.fx(0, 0.2, 0.2).uv(...SC(0.8)).add(G.sphere(36, 26), belly, [0, 1.5, 0.5], null, [0.88, 1.02, 0.68]);
    r.uv(null).fx(0, 0.45);
    for (let i = 0; i < 6; i++) {   // soft overlapping belly plates hugging the belly
      const y = 0.76 + i * 0.28, t = (y - 1.5) / 1.02, ww = Math.sqrt(Math.max(0.05, 1 - t * t)), zz = 0.5 + 0.68 * ww;
      const nrm = [0, t / 1.02, (zz - 0.5) / (0.68 * 0.68)];
      r.add(G.sphere(28, 12), mixc(plate, belly, (i & 1) * 0.5), [0, y, zz - 0.045], qz(...nrm), [0.88 * ww * 0.86, 0.15, 0.06]);
    }
    r.fx(0, 0);
    // back spikes
    r.fx(0, 0.6);
    for (let i = 0; i < 6; i++) {
      const phi = 0.45 + i * 0.36, [p, n] = onEll([0, 1.62, -0.06], [1.24, 1.32, 1.16], phi, PI);
      softSpike(r, [p[0], p[1] - n[1] * 0.08, p[2] - n[2] * 0.08], n, 0.52 - i * 0.04, 0.24 - i * 0.018, spike, 16);
      r.add(G.sphere(12, 8), spike, [p[0] + n[0] * 0.02, p[1] + n[1] * 0.02, p[2] + n[2] * 0.02], null, 0.2 - i * 0.015);
    }
    r.fx(0, 0);
    // legs with claws
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'legL' : 'legR').fx(0, 0, 1).uv(...SC(0.55));
      r.add(G.sphere(28, 20), bcol, [0.72 * s, 0.82, 0.04], null, [0.56, 0.62, 0.6]);
      r.uv(...SC(0.4)).add(G.sphere(24, 16), bodyD, [0.78 * s, 0.24, 0.36], null, [0.46, 0.26, 0.62]);
      r.uv(null).fx(0, 0.6);
      for (let c = -1; c <= 1; c++) r.add(G.sphere(14, 10), claw, [0.78 * s + c * 0.22, 0.14, 0.9 - Math.abs(c) * 0.08], null, [0.1, 0.08, 0.11]);   // round toes
      r.fx(0, 0);
    }
    // little arms with claws
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'armL' : 'armR').fx(0, 0, 1).uv(3, 2).seg([0.82 * s, 2.12, 0.5], [1.0 * s, 1.62, 0.98], 0.22, body, 0.17, 14);
      r.uv(...SC(0.2)).add(G.sphere(20, 14), bodyL, [1.02 * s, 1.56, 1.02], null, 0.21).uv(null).fx(0, 0.6);
      for (let c = -1; c <= 1; c++) r.add(G.sphere(12, 8), claw, [1.02 * s + c * 0.1, 1.44, 1.17], null, [0.062, 0.055, 0.07]);   // round fingers
      r.fx(0, 0);
    }
    // neck + head
    r.on('neck').fx(0, 0, 1).uv(...SC(0.55));
    r.add(G.sphere(28, 20), bcol, [0, 2.62, 0.36], null, [0.62, 0.6, 0.6]);
    r.add(G.sphere(28, 20), bcol, [0, 2.95, 0.56], null, [0.55, 0.55, 0.52]);
    r.uv(null).fx(0, 0.45);
    for (let i = 0; i < 3; i++) r.add(G.sphere(20, 10), plate, [0, 2.48 + i * 0.25, 0.9 + i * 0.16], [-0.5, 0, 0], [0.34 - i * 0.02, 0.1, 0.06]);
    r.fx(0, 0.6);
    for (let i = 0; i < 2; i++) softSpike(r, [0, 2.95 + i * 0.3, 0.02 + i * 0.25], [0, 0.4, -1], 0.3, 0.13, spike, 12);
    r.on('head').fx(0, 0, 1).uv(...SC(0.8)).add(G.sphere(40, 30), vgrad(2.9, 4.3, [[0, body], [1, bodyL]]), [0, 3.56, 0.74], null, [0.86, 0.76, 0.8]);
    r.uv(...SC(0.5)).add(G.sphere(32, 22), mixc(bodyL, body, 0.3), [0, 3.28, 1.36], null, [0.6, 0.42, 0.56]);
    for (const s of [-1, 1]) r.add(G.sphere(20, 14), bodyL, [0.5 * s, 3.26, 1.02], null, [0.3, 0.26, 0.3]);
    r.uv(null).fx(0, 0.5);
    for (const s of [-1, 1]) r.add(G.sphere(12, 8), '#3a1a5a', [0.17 * s, 3.5, 1.83], [-0.5, 0, 0], [0.06, 0.035, 0.03]);
    // horns, ear fins, head spikes
    r.fx(0, 0.35);
    for (const s of [-1, 1]) {
      const pts = [[0.4 * s, 4.0, 0.52], [0.52 * s, 4.34, 0.36], [0.6 * s, 4.58, 0.1]];
      r.seg(pts[0], pts[1], 0.15, horn, 0.11, 14).add(G.sphere(12, 8), horn, pts[1], null, 0.11).seg(pts[1], pts[2], 0.11, horn, 0.07, 14);
      softSpike(r, pts[2], [0.2 * s, 0.6, -1], 0.24, 0.075, horn, 12);
      r.fx(0, 0.5).add(G.cone(12), spike, [0.84 * s, 3.66, 0.52], [0.3, 0.4 * s, -s * 1.2], [0.14, 0.44, 0.06]).fx(0, 0.35);
    }
    r.fx(0, 0.6);
    for (let i = 0; i < 3; i++) softSpike(r, [0, 4.26 - i * 0.15, 0.62 - i * 0.34], [0, 1, -0.5 - i * 0.4], 0.28 - i * 0.04, 0.12, spike, 12);
    r.fx(0, 0);
    // jaw + mouth inside + charging glow
    r.on('jaw').fx(0, 0, 0.6).uv(...SC(0.4)).add(G.sphere(28, 18), mixc(bodyL, belly, 0.35), [0, 3.02, 1.34], null, [0.5, 0.2, 0.5]);
    r.uv(null).fx(0, 0.5).add(G.sphere(20, 12), '#5c1733', [0, 3.13, 1.36], null, [0.44, 0.1, 0.44]);
    r.add(G.sphere(16, 10), '#ff7aa0', [0, 3.18, 1.46], null, [0.24, 0.05, 0.26]);
    r.on('glow').fx(1, 0).add(G.sphere(20, 14), hdr('#ff86e0', 2.2), [0, 3.12, 2.02], null, 0.24);
    r.add(G.sphere(16, 10), hdr('#fff0fb', 2.6), [0, 3.12, 2.06], null, 0.12);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; r.add(G.octa(), hdr(i & 1 ? '#c9a0ff' : '#ffe27a', 2.2), [Math.sin(a) * 0.3, 3.12 + Math.cos(a) * 0.3, 2.02], [0, 0, a], 0.05); }   // glitter
    r.fx(0, 0);
    // wings
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'wingL' : 'wingR').push([0.62 * s, 2.72, -0.55], [-0.72, 0.42 * s, 0.12 * s]);
      r.fx(0, 0.4).add(extrude('dWing' + s, () => wingShape(s, DRAGON_WING), 0.05, 0.03, 12), mem, [0, 0, 0]);
      r.fx(0, 0, 1).uv(3, 1);
      const E = [1.35 * s, 0.85, 0.05];
      r.seg([0, 0.2, 0], [E[0], E[1], 0], 0.12, strut, 0.09, 10).add(G.sphere(12, 8), strut, [E[0], E[1], 0], null, 0.11);
      for (const t of [[2.9, 1.2], [3.05, 0.1], [2.35, -0.85], [1.2, -1.15]]) r.seg([E[0], E[1], 0], [t[0] * s, t[1], 0], 0.07, strut, 0.035, 8);
      r.uv(null).fx(0, 0.5).add(G.sphere(12, 8), claw, [2.94 * s, 1.25, 0.03], null, 0.075);
      r.pop().fx(0, 0);
    }
    // tail with spikes + spade tip
    const TR = [0.55, 0.44, 0.34, 0.26, 0.19, 0.14];
    for (let i = 0; i < 5; i++) {   // smoothly tapering tail: cone segments with a ball at every joint
      const a = TP[i], b = TP[i + 1];
      r.on('t' + (i + 1)).fx(0, 0, 1).uv(3, 2);
      r.seg(a, b, TR[i], bcol, TR[i + 1], 20);
      r.uv(...SC(TR[i])).add(G.sphere(24, 16), bcol, a, null, TR[i]);
      if (i === 4) r.add(G.sphere(16, 12), bcol, b, null, TR[5]);
      r.uv(null).fx(0, 0.6);
      softSpike(r, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (TR[i] + TR[i + 1]) * 0.4, (a[2] + b[2]) / 2], [0, 1, -0.35], 0.34 - i * 0.04, 0.15 - i * 0.018, spike, 12);
    }
    {
      const b = TP[5], a = TP[4], d = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
      r.on('t5').fx(0, 0.8).add(extrude('heart', heartShape, 0.06, 0.035, 14), spike, [b[0] + d.x * 0.2, b[1] + 0.02, b[2] + d.z * 0.2],
        qb([-d.x, 0, -d.z], [0, 1, 0]), [0.62, 0.62, 0.5]);
    }
    r.fx(0, 0);
    face(r, [0, 3.56, 0.74], 0.8, {   // goofy, smiling: big friendly eyes, playful brows, round buck teeth, tongue out
      bone: 'head', tilt: 0.22, ex: 0.33, ey: 0.12, er: 0.27, iris: '#b8661e', skin: mixc(body, bodyL, 0.55), browCol: '#3a1d66', browY: 1.36, browW: 1.05,
      mc: [0, 3.28, 1.36], mR: 0.52, mTilt: 0.0, mouthY: -0.09, mouthW: 0.44, mouthCol: '#3a1250', blushX: 0.45, blushY: 1.2, buck: true, toothCol: '#fffaf0',
      heartY: 0.72, heartX: 1.08, heartS: 0.3,
    });
    r.on('head').mark('muzzle', [0, 3.2, 1.95]);
    return { height: 4.6, glowC: col('#ff5aa0'), tex: scaleTex(), mat: { rough: 0.45, ns: 0.45, rimK: 0.16, sss: col('#c9a0ff').multiplyScalar(0.04) } };
  }
  function animEjderha(m, dt, st, s) {
    const B = m.B;
    const br = Math.sin(s.t * 1.5 + s.ph);
    if (s.mv > 0.03) s.walk += dt * (3 + 2 * s.mv);
    const ph = s.walk, k = Math.min(1, s.mv * 1.4);
    B.body.scale.set(1 + 0.018 * br, 1 + 0.022 * br, 1 + 0.018 * br);
    B.hips.rotation.z = Math.sin(ph) * 0.06 * k; B.hips.position.y += Math.abs(Math.cos(ph)) * 0.1 * k;
    B.legL.rotation.x = Math.sin(ph) * 0.4 * k; B.legR.rotation.x = -Math.sin(ph) * 0.4 * k;
    B.legL.position.y += Math.max(0, Math.sin(ph)) * 0.15 * k; B.legR.position.y += Math.max(0, -Math.sin(ph)) * 0.15 * k;
    B.neck.rotation.y = Math.sin(s.t * 0.6 + s.ph) * 0.12; B.neck.rotation.x = 0.03 * br;
    B.head.rotation.z = Math.sin(s.t * 0.9) * 0.05; B.head.rotation.x = -0.03 * br;
    B.armL.rotation.x = -0.1 * br + Math.sin(ph) * 0.2 * k; B.armR.rotation.x = -0.1 * br - Math.sin(ph) * 0.2 * k;
    s.flap += dt * (1.3 + 1.2 * k);
    let wAmp = 0.14, wBase = 0.05;
    for (let i = 1; i <= 5; i++) { const t = B['t' + i]; t.rotation.y = Math.sin(s.t * 1.3 - i * 0.55 + s.ph) * (0.08 + i * 0.02); t.rotation.x = Math.sin(s.t * 0.9 - i * 0.4) * 0.03; }
    let jaw = 0, glow = 0;
    if (st.windup >= 0) {   // bite: pull back
      const w = smooth01(st.windup);
      B.neck.rotation.x = -0.35 * w; B.head.rotation.x = -0.25 * w; jaw = 0.45 * w; B.body.rotation.x = -0.08 * w;
    }
    if (st.attack >= 0) {   // bite: lunge + snap
      const a = st.attack, l = Math.sin(PI * Math.min(1, a * 1.5));
      B.neck.rotation.x = lerp(-0.35, 0.55, smooth01(a * 3)) * (1 - smooth01((a - 0.4) / 0.6)); B.head.rotation.x = 0.25 * l;
      jaw = a < 0.2 ? 0.45 : 0; B.body.rotation.x = 0.12 * l;
    }
    if (st.roar >= 0) {
      const a = st.roar, up = smooth01(a / 0.22) * (1 - smooth01((a - 0.82) / 0.18));   // playful "RAWR!" with a happy head wiggle
      B.neck.rotation.x = -0.45 * up; B.head.rotation.x = -0.3 * up; jaw = 0.6 * up;
      B.head.rotation.z += Math.sin(s.t * 9) * 0.14 * up; B.neck.rotation.y += Math.sin(s.t * 4.5) * 0.1 * up;
      B.body.rotation.x = -0.12 * up; wBase += 0.6 * up; wAmp += 0.3 * up; s.flap += dt * 6 * up;
      B.armL.rotation.x = -1.0 * up; B.armR.rotation.x = -1.0 * up; B.armL.rotation.z = 0.4 * up; B.armR.rotation.z = -0.4 * up;
    }
    if (st.fireball >= 0) {
      const a = st.fireball, ch = smooth01(a / 0.38) * (1 - smooth01((a - 0.8) / 0.2));
      B.neck.rotation.x = -0.25 * ch; B.head.rotation.x = -0.12 * ch; glow = a < 0.8 ? smooth01(a / 0.38) : 1 - smooth01((a - 0.8) / 0.15); jaw = 0.2 * ch;
      for (const sa of [0.4, 0.575, 0.75]) { const d = a - sa; if (d > 0 && d < 0.12) { const p = Math.sin(PI * d / 0.12); B.neck.rotation.x += 0.5 * p; B.head.rotation.x += 0.2 * p; jaw = 0.2 + 0.5 * p; } }
    }
    if (st.stomp >= 0) {
      const a = st.stomp, up = smooth01(a / 0.5), hit = smooth01((a - 0.55) / 0.07), rec = smooth01((a - 0.7) / 0.3);
      const lift = up * (1 - hit);
      B.hips.position.y += 0.45 * lift; B.hips.rotation.x = -0.3 * lift; B.legL.rotation.x = -0.7 * lift; B.legR.rotation.x = -0.35 * lift;
      B.armL.rotation.x = -1.1 * lift; B.armR.rotation.x = -1.1 * lift; wBase += 0.5 * lift; jaw = 0.4 * lift;
      const sq = hit * (1 - rec);
      B.hips.scale.set(1 + 0.08 * sq, 1 - 0.1 * sq, 1 + 0.08 * sq); B.neck.rotation.x = 0.2 * sq - 0.25 * lift;
    }
    if (st.breath >= 0) {
      const a = st.breath, inh = smooth01(a / 0.33) * (1 - smooth01((a - 0.33) / 0.05)), fire = smooth01((a - 0.33) / 0.06) * (1 - smooth01((a - 0.88) / 0.1));
      B.neck.rotation.x = -0.45 * inh + 0.3 * fire; B.head.rotation.x = -0.2 * inh + 0.18 * fire; B.chest.scale.setScalar(1 + 0.1 * inh);
      jaw = 0.2 * inh + 0.6 * fire; glow = Math.max(inh, fire);
      B.neck.rotation.y += Math.sin(s.t * 3) * 0.08 * fire;
    }
    const f = Math.sin(s.flap * TAU * 0.5);
    B.wingL.rotation.z = wBase + f * wAmp; B.wingR.rotation.z = -(wBase + f * wAmp);
    B.wingL.rotation.y = -0.1 * f; B.wingR.rotation.y = 0.1 * f;
    B.jaw.rotation.x = jaw + (st.hurt > 0 ? 0.2 * st.hurt : 0);
    const gs = glow > 0.01 ? glow * (1 + 0.12 * Math.sin(s.t * 30)) : 0.0001;
    B.glow.scale.setScalar(gs);
  }

  // ════════════════ Instances ════════════════
  const TYPES = {
    jole: [buildJole, animJole], mantar: [buildMantar, animMantar], yarasa: [buildYarasa, animYarasa], goblin: [buildGoblin, animGoblin],
    kostebek: [buildKostebek, animKostebek], salyangoz: [buildSalyangoz, animSalyangoz], hayalet: [buildHayalet, animHayalet], golem: [buildGolem, animGolem], asker: [buildAsker, animAsker],
    atescik: [buildAtescik, animAtescik], ejderha: [buildEjderha, animEjderha],
  };
  const DEFS = {};
  function getDef(type, variant, elite) {
    const T = TYPES[type] || TYPES.jole, v = type === 'jole' ? (JOLE[variant] ? variant : 'green') : '';
    const key = (TYPES[type] ? type : 'jole') + '|' + v + '|' + (elite ? 1 : 0);
    let d = DEFS[key];
    if (!d) { d = DEFS[key] = lodBuild(LOD[type] ?? 0.6, r => T[0](r, { variant: v, elite }) || {}); d.key = key; }
    return d;
  }
  function lodBuild(k, make) {
    LODK = k;
    try { const r = new Rig(); return r.finish(make(r)); } finally { LODK = 1; }
  }
  function skinned(def, mat) {
    const bones = [];
    for (const bd of def.bones) {
      const b = new THREE.Bone(); b.name = bd.name;
      if (bd.parent < 0) b.position.fromArray(bd.pos);
      else { const pp = def.bones[bd.parent].pos; b.position.set(bd.pos[0] - pp[0], bd.pos[1] - pp[1], bd.pos[2] - pp[2]); bones[bd.parent].add(b); }
      b.userData.p0 = b.position.clone();
      bones.push(b);
    }
    const mesh = new THREE.SkinnedMesh(def.g[0], mat);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.boundingSphere = def.sphere.clone(); mesh.boundingBox = def.box.clone();
    mesh.castShadow = true; mesh.receiveShadow = false;
    const B = {};
    for (const b of bones) B[b.name] = b;
    const marks = {};
    for (const k in def.markers) {
      const mk = def.markers[k], bone = B[mk.bone], bp = def.bones[def.bones.findIndex(x => x.name === mk.bone)].pos;
      const o = new THREE.Object3D(); o.position.set(mk.pos[0] - bp[0], mk.pos[1] - bp[1], mk.pos[2] - bp[2]); bone.add(o); marks[k] = o;
    }
    return { mesh, bones, B, marks };
  }
  function resetPose(bones) {
    for (let i = 0; i < bones.length; i++) { const b = bones[i]; b.position.copy(b.userData.p0); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); }
  }
  const ST0 = { move: 0, windup: -1, attack: -1, hurt: 0, frozen: false, dying: -1 };
  const ELITE_RIM = { rim: GOLD, rimK: 0.4, rimP: 2.6 };   // thin gold edge; crown, aura ring and name tag carry the rest
  const _ice = new THREE.Color();

  function build(type, o = {}) {
    if (!TYPES[type]) type = 'jole';
    const elite = !!o.elite && type !== 'ejderha', def = getDef(type, o.variant, elite), anim = TYPES[type][1];
    const mo = def.mat || {};
    const mat = eMat(Object.assign({ tex: def.tex }, mo, elite ? ELITE_RIM : {}, elite ? def.eliteRim : {}));
    const I = skinned(def, mat), sc = elite ? 1.4 : 1;
    I.mesh.scale.setScalar(sc);
    if (I.B.mound) I.B.mound.scale.setScalar(0.0001);   // the mole's dirt mound only shows while it burrows
    const root = new THREE.Group(); root.name = 'enemy_' + type; root.add(I.mesh);
    const base = EDEF[type] || {};
    const s = { t: frand(0, 10), ph: frand(0, TAU), mv: 0, walk: frand(0, TAU), hop: 0, flap: frand(0, 10), key: 0, bt: frand(0.5, 3), gg: frand(1, 6),
      mood: 'grumpy', fa: 0, fc: new THREE.Color(1, 1, 1), tint: null, glow: 0, wobA: mo.wob || 0, mz: new THREE.Vector3() };
    const m = {
      type, root, def, mat, U: mat.userData.U, B: I.B, bones: I.bones, mesh: I.mesh, s,
      height: (def.height || base.height || 1) * sc, radius: (base.r || 0.5) * sc,
      anim(dt, st) {
        st = st || ST0;
        const dying = st.dying >= 0;
        if (st.frozen && !dying) { applyEm(m); return; }
        if (dying && s.mood !== 'happy') m.setMood('happy');
        s.t += dt;
        s.mv = damp(s.mv, st.move || 0, 8, dt);
        resetPose(I.bones);
        anim(m, dt, st, s);
        const R = I.B.root;
        if (st.hurt > 0 && !dying) {
          const h = st.hurt * st.hurt;
          R.scale.set(1 + 0.2 * h, 1 - 0.2 * h, 1 + 0.2 * h); R.rotation.x -= 0.22 * h; R.position.z -= 0.08 * h;
        }
        if (I.B.eyes && s.mood !== 'happy') {   // blink, playful giggles, squint-giggle wind-up
          s.bt -= dt; let bl = 1;
          if (s.bt < 0) { const u = -s.bt / 0.14; if (u >= 1) s.bt = frand(1.6, 4.5); else bl = 1 - Math.sin(u * PI) * 0.9; }
          if (st.windup >= 0) {   // telegraph: eyes squeeze into a giggle while the body leans back / puffs up
            bl = Math.min(bl, 1 - 0.58 * smooth01(st.windup * 1.8));
            if (I.B.brow) I.B.brow.position.y += 0.03 * smooth01(st.windup * 2) * (m.height / sc);
          } else if (st.attack < 0 && !dying) {   // now and then a little mischievous giggle
            s.gg -= dt;
            if (s.gg < 0) {
              const u = -s.gg / 0.5;
              if (u >= 1) s.gg = frand(3, 7);
              else { const g = Math.sin(u * PI); bl = Math.min(bl, 1 - 0.38 * g); R.rotation.z += Math.sin(s.t * 36) * 0.035 * g; R.position.y += Math.abs(Math.sin(s.t * 18)) * 0.02 * g; }
            }
          }
          I.B.eyes.scale.y = bl;
        }
        if (s.mood === 'happy' && I.B.joy) {   // hearts pulse and bob
          const p = Math.sin(s.t * 9);
          I.B.joy.scale.setScalar(1 + 0.18 * p);
          I.B.joy.position.y += (0.03 + 0.03 * Math.sin(s.t * 5)) * (m.height / sc);
        }
        if (dying) {
          const d = st.dying, H = m.height / sc;
          const hop = Math.abs(Math.sin(d * PI * 2.2)) * H * 0.32 * (1 - smooth01(d)) * (type === 'ejderha' ? 0.35 : 1);
          R.position.y += hop;
          R.rotation.y += smooth01(d) * TAU * (type === 'ejderha' ? 1 : 1.5);
          R.rotation.z += Math.sin(d * 26) * 0.12 * (1 - d);
          const k = d < 0.55 ? 1 + 0.12 * Math.sin(PI * d / 0.55) : Math.max(0.0001, 1 - smooth01((d - 0.55) / 0.45));
          R.scale.multiplyScalar(k);
        }
        s.glow = st.windup >= 0 ? st.windup * st.windup * (0.15 + 0.1 * Math.sin(s.t * 28)) * (m.def.glowK ?? 1) : damp(s.glow, 0, 10, dt);
        applyEm(m);
      },
      setMood(md) {
        s.mood = md === 'happy' ? 'happy' : 'grumpy';
        I.mesh.geometry = def.g[s.mood === 'happy' ? 1 : 0];
        if (I.B.eyes) I.B.eyes.scale.y = 1;
      },
      flash(a, c = '#ffffff') { s.fa = clamp(a || 0, 0, 1); s.fc.set(c); applyEm(m); },
      setTint(c) {
        s.tint = c ? new THREE.Color(c) : null;
        if (c) mat.color.copy(_ice.set(0xffffff).lerp(s.tint, 0.6)); else mat.color.set(0xffffff);
        applyEm(m);
      },
      muzzle() {
        const mk = I.marks.muzzle;
        if (!mk) return s.mz.set(0, m.height * 0.6, m.radius).applyMatrix4(root.matrixWorld);
        root.updateMatrixWorld(true);
        return mk.getWorldPosition(s.mz);
      },
      dispose() {
        if (root.parent) root.parent.remove(root);
        mat.dispose();
        if (I.mesh.skeleton) I.mesh.skeleton.dispose();
      },
    };
    return m;
  }
  function applyEm(m) {
    const s = m.s, e = m.mat.emissive;
    e.setRGB(0, 0, 0);
    m.U.uFl.value.set(s.fc.r, s.fc.g, s.fc.b, s.fa);   // hit flash is done in the shader (F_FLASH)
    if (s.glow > 0.001) { const g = m.def.glowC; e.r += g.r * s.glow; e.g += g.g * s.glow; e.b += g.b * s.glow; }
    if (s.tint) { e.r += s.tint.r * 0.1; e.g += s.tint.g * 0.12; e.b += s.tint.b * 0.16; }
  }

  // ── Baby dragon pet (after the boss): tiny, happy, flying (origin = its centre of flight) ──
  function buildBaby(r) {
    const body = '#9a62e6', bodyL = '#b88af2', bodyD = '#7442c8', belly = '#f0e2ff', spike = '#ff7ac8', horn = '#fff0cc', mem = '#d3a8ff';
    r.bone('body', 'root', [0, 0.05, 0]);
    r.bone('head', 'body', [0, 0.3, 0.06]);
    r.bone('jaw', 'head', [0, 0.36, 0.25]);
    r.bone('wingL', 'body', [0.14, 0.2, -0.1]); r.bone('wingR', 'body', [-0.14, 0.2, -0.1]);
    r.bone('tail', 'body', [0, -0.05, -0.18]);
    r.bone('legs', 'body', [0, -0.1, 0.05]);
    r.on('body').add(G.sphere(28, 20), vgrad(-0.2, 0.3, [[0, bodyD], [0.5, body], [1, bodyL]]), [0, 0.06, 0], null, [0.23, 0.25, 0.22]);
    r.add(G.sphere(24, 16), belly, [0, 0.03, 0.1], null, [0.16, 0.19, 0.13]);
    r.fx(0, 0.5); for (let i = 0; i < 3; i++) cone(r, [0, 0.2 - i * 0.1, -0.16 - i * 0.03], [0, 0.5, -1], 0.1, 0.045, spike, 10); r.fx(0, 0);
    r.on('legs'); for (const s of [-1, 1]) { r.add(G.sphere(14, 10), bodyD, [0.1 * s, -0.17, 0.06], null, [0.07, 0.07, 0.09]); r.fx(0, 0.5).add(G.sphere(8, 6), horn, [0.1 * s, -0.2, 0.14], null, 0.025).fx(0, 0); }
    r.on('tail');
    const TP = [[0, -0.05, -0.18], [0.03, -0.1, -0.34], [0.1, -0.1, -0.48], [0.18, -0.06, -0.58]];
    for (let i = 0; i < 3; i++) { const a = TP[i], b = TP[i + 1]; r.seg(a, b, 0.09 - i * 0.022, body, 0.07 - i * 0.022, 12).add(G.sphere(12, 8), body, b, null, 0.07 - i * 0.022); }
    r.fx(0, 0.8).add(extrude('heart', heartShape, 0.06, 0.035, 14), spike, [0.22, -0.05, -0.64], qb([-0.5, 0, 0.9], [0, 1, 0.1]), [0.16, 0.16, 0.14]).fx(0, 0);
    // head
    r.on('head').add(G.sphere(32, 24), vgrad(0.12, 0.62, [[0, body], [1, bodyL]]), [0, 0.38, 0.06], null, [0.25, 0.23, 0.23]);
    r.add(G.sphere(24, 16), mixc(bodyL, belly, 0.3), [0, 0.32, 0.27], null, [0.15, 0.1, 0.12]);
    for (const s of [-1, 1]) r.add(G.sphere(8, 6), '#4a2a70', [0.05 * s, 0.37, 0.38], null, [0.015, 0.01, 0.01]);
    r.fx(0, 0.4); for (const s of [-1, 1]) cone(r, [0.1 * s, 0.57, 0.02], [0.3 * s, 1, -0.5], 0.1, 0.035, horn, 10);
    r.fx(0, 0.5); for (const s of [-1, 1]) r.add(G.cone(10), spike, [0.24 * s, 0.44, 0.0], [0.3, 0.3 * s, -s * 1.2], [0.04, 0.12, 0.02]);
    r.fx(0, 0);
    r.on('jaw').add(G.sphere(16, 10), mixc(bodyL, belly, 0.5), [0, 0.265, 0.26], null, [0.12, 0.045, 0.1]);
    // wings
    for (const s of [-1, 1]) {
      r.on(s > 0 ? 'wingL' : 'wingR').push([0.14 * s, 0.2, -0.1], [-0.4, 0.4 * s, 0], 0.62);
      r.fx(0, 0.4).add(extrude('batWing' + s, () => wingShape(s, BAT_WING), 0.014, 0.008), mem, [0, 0, 0]);
      r.fx(0, 0); for (const f of [[0.64, 0.27], [0.52, -0.05], [0.37, -0.1]]) r.seg([0.02 * s, 0.06, 0.016], [f[0] * s, f[1], 0.016], 0.016, bodyD, 0.008, 6);
      r.pop();
    }
    // open, sparkly happy eyes + smile + blush (always happy)
    const fo = { er: 0.085, iris: '#e8a915', look: 0, lookY: 0.02, noTeeth: false };
    r.on('head').bone('eyes', 'head', [0, 0.42, 0.24]);
    r.push([0, 0.38, 0.06], [-0.15, 0, 0]);
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * 0.1, 0.06, 0.235, 0.02); r.push(p, q); eyeOpen(r, s, fo, false); r.pop(); }
    r.on('head');
    for (const s of [-1, 1]) { const [p, q] = onSphere(s * 0.155, -0.03, 0.235, -0.005); r.push(p, q); blush(r, 0.075, {}); r.pop(); }
    r.pop();
    r.push([0, 0.32, 0.27], [0.1, 0, 0]); { const [p, q] = onSphere(0, -0.03, 0.12, 0.0); r.push(p, q); smile(r, 0.075, { noTeeth: true }); r.pop(); } r.pop();
    r.mark('muzzle', [0, 0.3, 0.4]);
    return { height: 0.9 };
  }
  function babyDragon() {
    const def = DEFS.baby || (DEFS.baby = lodBuild(LOD.baby, buildBaby));
    const mat = eMat({ rough: 0.42, rimK: 0.22, sss: col('#d8b8ff').multiplyScalar(0.04) });
    const I = skinned(def, mat), root = new THREE.Group(); root.name = 'babyDragon'; root.add(I.mesh);
    const s = { t: 0, flap: 0, atk: 0, mv: 0, bt: 1, mz: new THREE.Vector3() };
    return {
      root,
      anim(dt, moving, attacking) {
        const B = I.B; s.t += dt;
        s.mv = damp(s.mv, moving ? 1 : 0, 5, dt); s.atk = damp(s.atk, attacking ? 1 : 0, attacking ? 20 : 8, dt);
        resetPose(I.bones);
        s.flap += dt * (9 + 5 * s.mv);
        const f = Math.sin(s.flap);
        B.wingL.rotation.z = 0.2 + f * 0.7; B.wingR.rotation.z = -(0.2 + f * 0.7);
        B.body.position.y += Math.sin(s.flap) * 0.02;
        B.body.rotation.x = 0.25 * s.mv - 0.1 * s.atk;
        B.head.rotation.x = -0.15 * s.mv + 0.25 * s.atk + Math.sin(s.t * 2.1) * 0.05; B.head.position.z += 0.05 * s.atk;
        B.head.rotation.z = Math.sin(s.t * 1.4) * 0.1;
        B.jaw.rotation.x = 0.55 * s.atk;
        B.tail.rotation.y = Math.sin(s.t * 3) * 0.35; B.tail.rotation.x = -0.2 * s.mv;
        B.legs.rotation.x = 0.4 * s.mv + Math.sin(s.t * 3) * 0.1;
        s.bt -= dt; let bl = 1;
        if (s.bt < 0) { const u = -s.bt / 0.14; if (u >= 1) s.bt = frand(1.5, 4); else bl = 1 - Math.sin(u * PI) * 0.9; }
        B.eyes.scale.y = bl;
      },
      muzzle() { root.updateMatrixWorld(true); return I.marks.muzzle.getWorldPosition(s.mz); },
      dispose() { if (root.parent) root.parent.remove(root); mat.dispose(); I.mesh.skeleton.dispose(); },
    };
  }

  // ── Bilge Baykuş (owl NPC) on a tree stump ──
  function buildOwl(r) {
    const brown = '#8c5c37', brownD = '#5e3d22', brownL = '#b07e52', belly = '#f3dfbd', scal = '#c99e6c', disc = '#f0d6b4';
    const bark = '#8a5f3c', ring = '#e6c38e', ringD = '#b98d58', beak = '#ffab2e', feet = '#ffa53a';
    r.bone('stump', 'root', [0, 0, 0]);
    r.bone('body', 'root', [0, 0.52, 0]);
    r.bone('head', 'body', [0, 1.06, 0.02]);
    r.bone('beak', 'head', [0, 1.1, 0.3]);
    r.bone('wingL', 'body', [0.3, 0.98, -0.02]); r.bone('wingR', 'body', [-0.3, 0.98, -0.02]);
    // stump: bark sides (texture) with root flares, light rings on the cut top, a little mushroom
    r.on('stump').fx(0, 0, 1).uv(3, 0.6).add(lathe('stump', [[0, 0], [0.6, 0], [0.5, 0.05], [0.44, 0.14], [0.42, 0.3], [0.41, 0.46], [0.4, 0.49], [0, 0.49]], 30), bark);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; r.add(G.sphere(12, 8), bark, [Math.sin(a) * 0.42, 0.06, Math.cos(a) * 0.42], [0, a, 0], [0.13, 0.1, 0.2]); }
    r.uv(null).fx(0, 0);
    const rc = (() => { const out = new THREE.Color(), a = col(ring), b = col(ringD); return (x, y, z) => out.copy(a).lerp(b, Math.pow(0.5 + 0.5 * Math.cos(Math.hypot(x, z) * 48), 3)); })();
    r.add(G.hemi(40), rc, [0, 0.488, 0], null, [0.405, 0.03, 0.405]);
    r.add(G.cyl(0.6, 0.9, 10), '#fff1dc', [0.3, 0.12, 0.3], null, [0.035, 0.1, 0.035]);
    r.fx(0, 0.4).add(G.hemi(16), '#ff5a5a', [0.3, 0.17, 0.3], null, [0.08, 0.06, 0.08]).fx(0, 0);
    r.add(G.sphere(6, 5), '#ffffff', [0.33, 0.215, 0.33], null, 0.012);
    // body with scalloped belly feathers
    const bcol = (() => { const out = new THREE.Color(), bb = col(brown), bd = col(brownD), bl = col(belly), sc = col(scal); return (x, y, z) => {
      out.copy(bd).lerp(bb, smooth01((y - 0.5) / 0.4));
      const front = smooth01((z - 0.08) / 0.18);
      if (front > 0) {
        const u = x * 26, v = y * 22 + (Math.floor(u) & 1) * 0.5, fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v);
        const sca = Math.abs(Math.hypot(fu, fv * 0.9) - 0.42) < 0.09 ? 1 : 0;
        out.lerp(sca ? sc : bl, front);
      }
      return out;
    }; })();
    r.on('body').add(G.sphere(40, 30), bcol, [0, 0.84, 0], null, [0.33, 0.37, 0.31]);
    for (const s of [-1, 1]) r.fx(0, 0.4).add(G.sphere(8, 6), feet, [0.09 * s, 0.52, 0.2], null, [0.05, 0.03, 0.07]).fx(0, 0);
    // head with facial disc, ear tufts, beak
    r.on('head').add(G.sphere(40, 28), vgrad(0.95, 1.5, [[0, brown], [1, brownL]]), [0, 1.2, 0.02], null, [0.32, 0.29, 0.3]);
    for (const s of [-1, 1]) r.add(G.sphere(24, 16), disc, [0.11 * s, 1.2, 0.2], [0, s * 0.35, 0], [0.16, 0.18, 0.1]);
    for (const s of [-1, 1]) { cone(r, [0.2 * s, 1.43, 0.02], [0.45 * s, 1, -0.1], 0.2, 0.07, brownD, 10); }
    r.on('beak').fx(0, 0.5); cone(r, [0, 1.13, 0.28], [0, -0.6, 1], 0.1, 0.045, beak, 10);
    r.add(G.sphere(10, 8), mixc(beak, '#c86a10', 0.3), [0, 1.07, 0.28], null, [0.03, 0.02, 0.03]).fx(0, 0);
    // big eyes behind round glasses
    const fo = { er: 0.095, iris: '#f2a21e', look: 0.3, lookY: 0.02 };
    r.on('head').bone('eyes', 'head', [0, 1.22, 0.24]);
    r.push([0, 1.2, 0.02], [-0.12, 0, 0]);
    for (const s of [-1, 1]) {
      const [p, q] = onSphere(s * 0.11, 0.03, 0.3, 0.03);
      r.push(p, q); eyeOpen(r, s, fo, false); r.pop();
    }
    r.on('head');
    for (const s of [-1, 1]) {
      const [p, q] = onSphere(s * 0.11, 0.03, 0.3, -0.05);
      r.push(p, q).fx(0, 2).add(G.torus(TAU, 0.12, 32), GOLD, [0, 0, 0], null, [0.12, 0.12, 0.12]).pop();
      const [pb, qb2] = onSphere(s * 0.17, -0.1, 0.3, -0.002); r.push(pb, qb2); r.fx(0.3, 0).add(G.sphere(12, 8), '#ff9fb8', [0, 0, 0], null, [0.05, 0.028, 0.012]); r.pop();
    }
    r.fx(0, 2).seg([-0.04, 1.235, 0.36], [0.04, 1.235, 0.36], 0.012, GOLD, 0.012, 6).fx(0, 0);
    r.pop();
    // wings
    for (const s of [-1, 1]) {
      const wc = (() => { const out = new THREE.Color(), a = col(brown), b = col(brownD), c = col(brownL); return (x, y) => out.copy(a).lerp(b, smooth01((0.9 - y) / 0.3)).lerp(c, 0.5 * (0.5 + 0.5 * Math.sin(y * 60))); })();
      r.on(s > 0 ? 'wingL' : 'wingR').add(G.sphere(24, 16), wc, [0.3 * s, 0.82, -0.02], [0.1, 0, s * 0.15], [0.09, 0.26, 0.2]);
    }
    return { height: 1.5 };
  }
  function owl() {
    const def = DEFS.owl || (DEFS.owl = lodBuild(LOD.owl, buildOwl));
    const bt = texOf('bark');
    const mat = eMat({ rough: 0.62, tex: bt, ns: 1, rimK: 0.3 });
    const I = skinned(def, mat), root = new THREE.Group(); root.name = 'owl'; root.add(I.mesh);
    const s = { t: frand(0, 5), bt: 1, look: 0, lookT: 2, lookTo: 0, talk: 0 };
    return {
      root,
      anim(dt, talking) {
        const B = I.B; s.t += dt;
        s.talk = damp(s.talk, talking ? 1 : 0, 6, dt);
        resetPose(I.bones);
        const br = Math.sin(s.t * 1.8);
        B.body.scale.set(1 + 0.012 * br, 1 + 0.018 * br, 1 + 0.012 * br);
        s.lookT -= dt; if (s.lookT < 0) { s.lookT = frand(1.5, 4); s.lookTo = fpick([0, 0, -0.5, 0.45, 0.25]); }
        s.look = damp(s.look, talking ? 0 : s.lookTo, 5, dt);
        B.head.rotation.y = s.look;
        B.head.rotation.z = Math.sin(s.t * 0.7) * 0.08 + s.talk * Math.sin(s.t * 3.3) * 0.12;
        B.head.rotation.x = s.talk * Math.sin(s.t * 6.5) * 0.06;
        B.beak.rotation.x = s.talk * Math.max(0, Math.sin(s.t * 14)) * 0.5;
        const wf = s.talk * Math.max(0, Math.sin(s.t * 2.4)) * Math.sin(s.t * 16);
        B.wingL.rotation.z = 0.05 + wf * 0.3 + s.talk * 0.2; B.wingR.rotation.z = -(0.05 + wf * 0.3 + s.talk * 0.2);
        s.bt -= dt; let bl = 1;
        if (s.bt < 0) { const u = -s.bt / 0.16; if (u >= 1) s.bt = frand(2, 5); else bl = 1 - Math.sin(u * PI) * 0.92; }
        B.eyes.scale.y = bl;
      },
      dispose() { if (root.parent) root.parent.remove(root); mat.dispose(); I.mesh.skeleton.dispose(); },
    };
  }

  // ── Neşe kristali: big faceted pink gem with an inner light ──
  let HALO = null;
  function haloTex() {
    if (HALO) return HALO;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    HALO = new THREE.CanvasTexture(c); HALO.colorSpace = THREE.SRGBColorSpace;
    return HALO;
  }
  function gemGeo(key, seg, pts) {
    return gx('gem' + key, () => {
      const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg, PI / seg).toNonIndexed();
      g.computeVertexNormals();
      return g;
    });
  }
  function crystal() {
    const grp = new THREE.Group(); grp.name = 'neseKristali';
    const outerG = gemGeo('A', 8, [[0, -1], [0.42, -0.45], [0.55, 0.05], [0.5, 0.55], [0.3, 0.92], [0, 1.08]]);
    const outerM = rimify(stdMat({ color: '#ff4fb4', emissive: '#e8208f', emissiveIntensity: 0.32, roughness: 0.04, metalness: 0.35, flatShading: true, transparent: true, opacity: 0.74 }), '#ffc6ec', 0.8, 2.2);
    const core = new THREE.Mesh(gemGeo('B', 6, [[0, -0.7], [0.25, -0.2], [0.3, 0.2], [0.16, 0.65], [0, 0.8]]), glowMat('#ffb0e0', 2.4));
    const gem = new THREE.Mesh(outerG, outerM);
    const body = new THREE.Group(); body.position.y = 1.55; body.scale.set(1.0, 1.05, 1.0);
    core.renderOrder = 0; gem.renderOrder = 1;
    body.add(core, gem);
    gem.castShadow = true;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: new THREE.Color('#ff5ac0').multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(2.6); halo.position.y = 1.55;
    const shards = new THREE.Group(); shards.position.y = 1.5;
    const sg = gemGeo('C', 6, [[0, -0.5], [0.22, -0.1], [0.2, 0.25], [0, 0.55]]);
    const sm = rimify(stdMat({ color: '#ff7ccb', emissive: '#ff3fae', emissiveIntensity: 0.45, roughness: 0.05, metalness: 0.3, flatShading: true }), '#ffe0f4', 0.7, 2);
    for (let i = 0; i < 5; i++) {
      const sh = new THREE.Mesh(sg, sm), a = i / 5 * TAU;
      sh.position.set(Math.sin(a) * 1.05, Math.sin(i * 2.1) * 0.35, Math.cos(a) * 1.05); sh.scale.setScalar(0.28 + (i % 2) * 0.08);
      sh.rotation.set(0.3 * Math.sin(i), a, 0.25);
      shards.add(sh);
    }
    grp.add(body, halo, shards);
    core.onBeforeRender = () => {   // gentle heartbeat of the inner light + orbiting shards
      const t = TIME.t || performance.now() / 1000, p = 0.5 + 0.5 * Math.sin(t * 2.4);
      core.material.color.set('#ffb0e0').multiplyScalar(1.9 + 1.1 * p);
      core.scale.setScalar(0.95 + 0.08 * p);
      halo.material.opacity = 0.35 + 0.25 * p;
      shards.rotation.y = t * 0.6;
      for (let i = 0; i < shards.children.length; i++) shards.children[i].position.y = Math.sin(t * 1.3 + i * 2.1) * 0.35;
    };
    grp.userData.dispose = () => { outerM.dispose(); core.material.dispose(); sm.dispose(); halo.material.dispose(); };
    return grp;
  }

  // Build geometry caches (and optionally compile the shader programs against the live scene's lights) ahead of time,
  // e.g. right after a zone loads, so the first spawn of a type never hitches. Warm instances stay alive (programs persist).
  const WARM = {};
  function warm(types, compile = true) {
    const fresh = [];
    for (const t of types || Object.keys(TYPES)) {
      if (!TYPES[t]) continue;
      if (t === 'jole') for (const v of Object.keys(JOLE)) getDef('jole', v, false);
      else getDef(t, undefined, false);
      if (compile && !WARM[t]) fresh.push(WARM[t] = build(t, { variant: 'green' }));
    }
    if (fresh.length && typeof renderer !== 'undefined' && renderer.compile) {
      const tmp = new THREE.Scene();
      for (const m of fresh) tmp.add(m.root);
      try { renderer.compile(tmp, camera, scene); } catch (e) { console.warn('EMODEL.warm', e); }
      for (const m of fresh) tmp.remove(m.root);
    }
  }
  function stats() { const out = {}; for (const k in DEFS) out[k] = DEFS[k].verts; return out; }

  return { build, owl, babyDragon, crystal, warm, stats, TYPES: Object.keys(TYPES) };
})(G);
