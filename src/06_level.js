/* ── Bölgeler ve seviye: seviye üretimi, görseller, çarpışma, yol bulma ──
   ZONES: dört bölgenin tanımı (sıra = kayıttaki bölge numarası). Her bölgenin sonunda büyük bir bölüm sonu canavarı arenası var.
   LEVEL.generate() saf veri üretir, LEVEL.build() sahneyi kurar (bkz. src/SPEC.md). */
const ZONES = [
  { id: 'orman', ad: 'Huysuz Orman', theme: 'forest', line: 'orman', music: 'orman', size: 100, rooms: 8, side: 3,
    enemies: { jole: 4, mantar: 2, yarasa: 2, goblin: 3 }, elites: ['jole', 'goblin'], hpMult: 1, dmgMult: 1, xpMult: 1, gold: 1, ilvl: 1, boss: 'kraljole' },
  { id: 'magara', ad: 'Köstebek ve Salyangoz Mağarası', theme: 'cave', line: 'magara', music: 'magara', size: 100, rooms: 9, side: 3,
    enemies: { kostebek: 4, salyangoz: 3, yarasa: 2, golem: 1 }, elites: ['kostebek', 'salyangoz'], hpMult: 1.8, dmgMult: 1.4, xpMult: 1.7, gold: 2, ilvl: 4, boss: 'kostebekusta' },
  { id: 'yanardag', ad: 'Lav Yanardağı', theme: 'volcano', line: 'yanardag', music: 'yanardag', size: 100, rooms: 8, side: 3,
    enemies: { jole: 3, kaplumbaga: 4, ateskusu: 3, atescik: 2, golem: 1 }, variants: { jole: ['lava'], golem: ['magma'] }, elites: ['kaplumbaga', 'ateskusu'],
    hpMult: 2.3, dmgMult: 1.65, xpMult: 2.1, gold: 2.5, ilvl: 6, boss: 'lavkaplumbaga' },
  { id: 'kale', ad: 'Ejderhanın Kalesi', theme: 'castle', line: 'kale', music: 'kale', size: 104, rooms: 8, side: 2,
    enemies: { asker: 4, atescik: 3, hayalet: 2, golem: 1 }, elites: ['asker', 'atescik'], hpMult: 2.8, dmgMult: 1.9, xpMult: 2.5, gold: 3, ilvl: 7, boss: 'ejderha', final: true },
];

const LEVEL = (function () {
  'use strict';
  const BIG = ['golem'];                   // at most one of these per pack
  const MARGIN = { x: 16, n: 18, s: 15 };  // empty border (trees / rock / wall mass) around the playable area
  const ARENA_R = 11.5;                    // boss arena radius (forest / cave / volcano; the castle keeps its 26×22 m hall)
  // Gameplay camera pitch, captured once at load (core has applied its default and any ?kam override by now). All occlusion
  // math uses it, never the live CAM.pitch the UI animates (title 0.32, victory 0.78), so a seed always builds the same level.
  const LV_PITCH = CAM.pitch || 0.86, LV_PK = 1 / Math.tan(LV_PITCH);   // floor distance hidden behind 1 m of height
  const LV_HQ = !(navigator.maxTouchPoints > 1) || Q.has('hd');          // desktop: extra floor anti-tiling sample

  // ── Small helpers ──
  const hyp = (x, z) => Math.sqrt(x * x + z * z);
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
    return hyp(px - ax - dx * t, pz - az - dz * t);
  }
  function segSegDist(a, b, c, d) {
    const cr = (o, p, q) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x);
    const d1 = cr(c, d, a), d2 = cr(c, d, b), d3 = cr(a, b, c), d4 = cr(a, b, d);
    if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) return 0;
    return Math.min(segDist(a.x, a.z, c.x, c.z, d.x, d.z), segDist(b.x, b.z, c.x, c.z, d.x, d.z),
      segDist(c.x, c.z, a.x, a.z, b.x, b.z), segDist(d.x, d.z, a.x, a.z, b.x, b.z));
  }
  function hash2(i, j, s) {
    let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 982451653);
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // Smooth 2D value noise in [-1, 1] (seeded)
  function vnoise(x, z, s) {
    const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(i, j, s), b = hash2(i + 1, j, s), c = hash2(i, j + 1, s), d = hash2(i + 1, j + 1, s);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function wpick(w, rnd) {   // weighted pick from {key: weight}
    let tot = 0; for (const k in w) tot += w[k];
    let r = rnd() * tot;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return Object.keys(w)[0];
  }
  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // Blob room radius at angle th (organic outline from a few harmonics)
  function blobR(rm, th) {
    let k = 1;
    for (const h of rm.hs) k += h[1] * Math.sin(h[0] * th + h[2]);
    return rm.r * k;
  }
  function inRoom(rm, x, z, pad = 0) {
    const dx = x - rm.x, dz = z - rm.z;
    if (rm.hw) return Math.abs(dx) < rm.hw - pad && Math.abs(dz) < rm.hh - pad;
    return hyp(dx, dz) < blobR(rm, Math.atan2(dz, dx)) - pad;
  }
  const roomExt = rm => (rm.hw ? Math.max(rm.hw, rm.hh) : rm.r * 1.3);

  // ── Layout: blobs (forest / cave / volcano). The last room is the round boss arena (radius 11.5 m, gently wobbly outline). ──
  function harmonics(amp) {
    return [[2, RNG.range(0.5, 1) * amp, RNG.range(0, TAU)], [3, RNG.range(0.4, 0.8) * amp, RNG.range(0, TAU)], [5, RNG.range(0.2, 0.5) * amp, RNG.range(0, TAU)]];
  }
  function layoutBlobs(Z, zi) {
    const N = Z.rooms, rooms = [], links = [];
    const r0 = zi === 0 ? 9 : 7.2;
    rooms.push({ x: 0, z: 0, r: r0, kind: 'start', hs: harmonics(zi === 0 ? 0.05 : 0.1) });
    const segOf = l => [rooms[l.a], rooms[l.b]];
    // A candidate room + its corridor must keep clear of everything else
    function clear(c, from) {
      for (let j = 0; j < rooms.length; j++) {
        const o = rooms[j];
        if (j === from) continue;
        if (hyp(c.x - o.x, c.z - o.z) < c.r + o.r + 5) return false;
        if (segDist(o.x, o.z, rooms[from].x, rooms[from].z, c.x, c.z) < o.r + 4.5) return false;
      }
      for (const l of links) {
        const [p, q] = segOf(l);
        if (segDist(c.x, c.z, p.x, p.z, q.x, q.z) < c.r + 4) return false;
        if (l.a !== from && l.b !== from && segSegDist(rooms[from], c, p, q) < 5) return false;
      }
      return true;
    }
    let side = RNG.chance(0.5) ? 1 : -1;
    for (let k = 1; k < N; k++) {
      const A = rooms[k - 1], last = k === N - 1;
      const r = last ? ARENA_R : RNG.range(6.4, 8.4);
      const kind = last ? 'boss' : 'main';
      let best = null;
      for (let t = 0; t < 80 && !best; t++) {
        const sd = t < 40 ? side : -side;
        const a = sd * RNG.range(0.62, 1.2), d = A.r + r + RNG.range(3.8, 6.2);
        const c = { x: A.x + Math.sin(a) * d, z: A.z - Math.cos(a) * d, r, kind, hs: harmonics(last ? 0.045 : 0.11) };
        if (Math.abs(c.x) > 22) continue;
        if (clear(c, k - 1)) best = c;
      }
      if (!best) best = { x: A.x, z: A.z - (A.r + r + 6), r, kind, hs: harmonics(last ? 0.045 : 0.1) };
      rooms.push(best);
      links.push({ a: k - 1, b: k, w: RNG.range(1.75, 2.05), bend: RNG.range(-2.6, 2.6), main: true });
      side = -side; if (RNG.chance(0.15)) side = -side;
    }
    // side rooms hang off the middle of the chain, pointing away from their neighbours
    const cand = [];
    for (let k = 1; k < N - 1; k++) cand.push(k);
    shuffle(cand, RNG._r);
    cand.sort((a, b) => (a % 2) - (b % 2));
    let made = 0;
    for (const k of cand) {
      if (made >= Z.side) break;
      if (rooms.some(o => o.kind === 'side' && Math.abs(o.host - k) < 2) && cand.length > Z.side * 2 - 1) continue;
      const A = rooms[k], nb = (rooms[k - 1].x + rooms[k + 1].x) / 2 - A.x;
      const away = Math.abs(nb) > 1.5 ? -Math.sign(nb) : (RNG.chance(0.5) ? 1 : -1);
      const r = RNG.range(4.3, 5.3);
      let best = null;
      for (let t = 0; t < 50 && !best; t++) {
        const sd = t < 30 ? away : -away;
        const a = sd * RNG.range(1.0, 2.1), d = A.r + r + RNG.range(3.5, 6);
        const c = { x: A.x + Math.sin(a) * d, z: A.z - Math.cos(a) * d, r, kind: 'side', host: k, hs: harmonics(0.1) };
        if (Math.abs(c.x) > 36) continue;
        if (clear(c, k)) best = c;
      }
      if (!best) continue;
      rooms.push(best); made++;
      links.push({ a: k, b: rooms.length - 1, w: 1.8, bend: RNG.range(-1.2, 1.2), main: false });
    }
    return { rooms, links };
  }

  // ── Layout: castle (axis-aligned halls, L-shaped corridors) ──
  function layoutCastle(Z) {
    const N = Z.rooms, rooms = [{ x: 0, z: 0, hw: 6, hh: 5, kind: 'start', entry: 9 }], links = [];
    const rectsHit = (x0, z0, x1, z1, skip) => {
      for (let j = 0; j < rooms.length; j++) {
        if (skip.includes(j)) continue;
        const o = rooms[j];
        if (x1 > o.x - o.hw - 2 && x0 < o.x + o.hw + 2 && z1 > o.z - o.hh - 2 && z0 < o.z + o.hh + 2) return true;
      }
      for (const l of links) {
        if (skip.includes(l.a) || skip.includes(l.b)) continue;
        for (const s of l.segs) {
          const sx0 = Math.min(s[0], s[2]) - 2, sx1 = Math.max(s[0], s[2]) + 2, sz0 = Math.min(s[1], s[3]) - 2, sz1 = Math.max(s[1], s[3]) + 2;
          if (x1 > sx0 - 2 && x0 < sx1 + 2 && z1 > sz0 - 2 && z0 < sz1 + 2) return true;
        }
      }
      return false;
    };
    let side = RNG.chance(0.5) ? 1 : -1;
    for (let k = 1; k < N; k++) {
      const A = rooms[k - 1], last = k === N - 1;
      const hw = last ? 13 : RNG.int(6, 9), hh = last ? 11 : RNG.int(5, 7);
      let type = RNG.r() < (last ? 0.55 : 0.3) ? 'S' : (RNG.chance(0.5) ? 'L1' : 'L2');
      if (type === 'L2' && A.entry === side) type = 'L1';
      let B, segs, pts, exit = 0, entry = 0;
      if (type === 'S') {
        const off = Math.max(0, Math.min(A.hw, hw) - 3);
        const bx = A.x + RNG.int(-off, off), bz = A.z - A.hh - hh - RNG.int(3, 6);
        const cx = Math.round((Math.max(A.x - A.hw, bx - hw) + Math.min(A.x + A.hw, bx + hw)) / 2);
        B = { x: bx, z: bz, hw, hh }; segs = [[cx, A.z, cx, bz]];
        pts = [[A.x, A.z], [cx, A.z], [cx, bz], [bx, bz]];
      } else if (type === 'L1') {
        const bx = A.x + side * (hw + 4 + RNG.int(0, 4)), bz = A.z - A.hh - hh - RNG.int(2, 4);
        B = { x: bx, z: bz, hw, hh }; segs = [[A.x, A.z, A.x, bz], [A.x, bz, bx, bz]];
        pts = [[A.x, A.z], [A.x, bz], [bx, bz]]; entry = -side;
      } else {
        const bx = A.x + side * (A.hw + RNG.int(3, 6)), bz = A.z - A.hh - hh - RNG.int(3, 5);
        B = { x: bx, z: bz, hw, hh }; segs = [[A.x, A.z, bx, A.z], [bx, A.z, bx, bz]];
        pts = [[A.x, A.z], [bx, A.z], [bx, bz]]; exit = side;
      }
      B.kind = last ? 'boss' : 'main'; B.entry = entry; B.r = Math.min(B.hw, B.hh);
      A.exit = exit;
      rooms.push(B);
      links.push({ a: k - 1, b: k, segs, pts, w: 2, main: true });
      side = -side; if (RNG.chance(0.2)) side = -side;
    }
    let made = 0;
    const cand = [];
    for (let k = 1; k < N - 1; k++) cand.push(k);
    shuffle(cand, RNG._r);
    for (const k of cand) {
      if (made >= Z.side) break;
      const A = rooms[k];
      const sides = [1, -1].filter(s => s !== A.entry && s !== A.exit);
      shuffle(sides, RNG._r);
      for (const s of sides) {
        const hw = RNG.int(4, 5), hh = RNG.int(4, 5);
        const bx = A.x + s * (A.hw + hw + RNG.int(4, 6)), bz = A.z + RNG.int(-1, 1);
        const cz = A.z;
        const x0 = Math.min(A.x + s * A.hw, bx) , x1 = Math.max(A.x + s * A.hw, bx);
        if (rectsHit(bx - hw, bz - hh, bx + hw, bz + hh, [k])) continue;
        if (rectsHit(x0, cz - 2, x1, cz + 2, [k])) continue;
        rooms.push({ x: bx, z: bz, hw, hh, r: Math.min(hw, hh), kind: 'side', host: k });
        links.push({ a: k, b: rooms.length - 1, segs: [[A.x, cz, bx, cz]], pts: [[A.x, cz], [bx, bz]], w: 2, main: false });
        made++;
        break;
      }
    }
    return { rooms, links };
  }

  // ── Grid helpers ──
  function chamfer(W, H, src, want) {   // distance (in cells) from each cell to the nearest cell with src === want
    const D = new Float32Array(W * H), INF = 1e6, S2 = Math.SQRT2;
    for (let i = 0; i < W * H; i++) D[i] = src[i] === want ? 0 : INF;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; let d = D[k];
      if (d === 0) continue;
      if (i > 0) d = Math.min(d, D[k - 1] + 1);
      if (j > 0) { d = Math.min(d, D[k - W] + 1); if (i > 0) d = Math.min(d, D[k - W - 1] + S2); if (i < W - 1) d = Math.min(d, D[k - W + 1] + S2); }
      D[k] = d;
    }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i; let d = D[k];
      if (d === 0) continue;
      if (i < W - 1) d = Math.min(d, D[k + 1] + 1);
      if (j < H - 1) { d = Math.min(d, D[k + W] + 1); if (i < W - 1) d = Math.min(d, D[k + W + 1] + S2); if (i > 0) d = Math.min(d, D[k + W - 1] + S2); }
      D[k] = d;
    }
    return D;
  }
  function floodFrom(W, H, grid, si, sj) {   // 4-connected reachability over floor cells
    const seen = new Uint8Array(W * H), q = new Int32Array(W * H);
    let h = 0, t = 0;
    const s = sj * W + si;
    if (!grid[s]) return seen;
    seen[s] = 1; q[t++] = s;
    while (h < t) {
      const c = q[h++], i = c % W;
      if (i > 0 && grid[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; q[t++] = c - 1; }
      if (i < W - 1 && grid[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; q[t++] = c + 1; }
      if (c >= W && grid[c - W] && !seen[c - W]) { seen[c - W] = 1; q[t++] = c - W; }
      if (c < W * (H - 1) && grid[c + W] && !seen[c + W]) { seen[c + W] = 1; q[t++] = c + W; }
    }
    return seen;
  }
  // Summed-area table of floor cells: count floor in any rectangle in O(1)
  function makeSAT(W, H, grid) {
    const S = new Int32Array((W + 1) * (H + 1)), W1 = W + 1;
    for (let j = 0; j < H; j++) {
      let row = 0;
      for (let i = 0; i < W; i++) { row += grid[j * W + i]; S[(j + 1) * W1 + i + 1] = S[j * W1 + i + 1] + row; }
    }
    return S;
  }
  function satCount(L, x0, z0, x1, z1) {   // floor cells overlapping [x0,x1)×[z0,z1) (metres)
    const W = L.W, H = L.H, W1 = W + 1, S = L._sat;
    const i0 = clamp(Math.floor(x0), 0, W), i1 = clamp(Math.ceil(x1), 0, W), j0 = clamp(Math.floor(z0), 0, H), j1 = clamp(Math.ceil(z1), 0, H);
    if (i1 <= i0 || j1 <= j0) return 0;
    return S[j1 * W1 + i1] - S[j0 * W1 + i1] - S[j1 * W1 + i0] + S[j0 * W1 + i0];
  }

  // ── LEVEL.generate ──
  function generate(zi, seed) {
    zi = clamp(zi | 0, 0, ZONES.length - 1);
    seed = (seed >>> 0) || 1;
    RNG.seed(seed);
    const Z = ZONES[zi], theme = Z.theme, castle = theme === 'castle', nseed = RNG.int(1, 1e9);
    const lay = castle ? layoutCastle(Z) : layoutBlobs(Z, zi);
    const rooms = lay.rooms, links = lay.links;

    // bounds → shift everything into positive grid space
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const r of rooms) { const e = roomExt(r) + 1.5; x0 = Math.min(x0, r.x - e); x1 = Math.max(x1, r.x + e); z0 = Math.min(z0, r.z - e); z1 = Math.max(z1, r.z + e); }
    const ox = Math.ceil(MARGIN.x - x0), oz = Math.ceil(MARGIN.n - z0);
    const W = Math.ceil(x1 - x0 + 2 * MARGIN.x), H = Math.ceil(z1 - z0 + MARGIN.n + MARGIN.s);
    for (const r of rooms) { r.x += ox; r.z += oz; }
    for (const l of links) {
      if (l.segs) for (const s of l.segs) { s[0] += ox; s[1] += oz; s[2] += ox; s[3] += oz; }
      if (l.pts) for (const p of l.pts) { p[0] += ox; p[1] += oz; }
    }
    const grid = new Uint8Array(W * H), idx = (i, j) => j * W + i;
    const inb = (i, j) => i >= 1 && j >= 1 && i < W - 1 && j < H - 1;

    // carve rooms
    for (const rm of rooms) {
      if (castle) {
        for (let j = rm.z - rm.hh; j < rm.z + rm.hh; j++) for (let i = rm.x - rm.hw; i < rm.x + rm.hw; i++) if (inb(i, j)) grid[idx(i, j)] = 1;
        continue;
      }
      const e = Math.ceil(rm.r * 1.35 + 2), na = rm.kind === 'start' && zi === 0 ? 0.35 : rm.kind === 'boss' ? 0.4 : theme === 'cave' ? 1.0 : theme === 'volcano' ? 0.8 : 0.7;
      for (let j = Math.floor(rm.z - e); j <= rm.z + e; j++) for (let i = Math.floor(rm.x - e); i <= rm.x + e; i++) {
        if (!inb(i, j)) continue;
        const x = i + 0.5, z = j + 0.5, dx = x - rm.x, dz = z - rm.z;
        const rr = blobR(rm, Math.atan2(dz, dx)) + na * vnoise(x / 3.2, z / 3.2, nseed);
        if (hyp(dx, dz) < rr) grid[idx(i, j)] = 1;
      }
    }
    // carve corridors (blobs: bent quadratic curves; castle: axis-aligned bands)
    const stamp = (x, z, r, v = 1) => {
      for (let j = Math.floor(z - r); j <= z + r; j++) for (let i = Math.floor(x - r); i <= x + r; i++)
        if (inb(i, j) && hyp(i + 0.5 - x, j + 0.5 - z) < r) grid[idx(i, j)] = v;
    };
    for (const l of links) {
      if (castle) {
        for (const s of l.segs) {
          const xa = Math.min(s[0], s[2]), xb = Math.max(s[0], s[2]), za = Math.min(s[1], s[3]), zb = Math.max(s[1], s[3]);
          for (let j = za - l.w; j < zb + l.w; j++) for (let i = xa - l.w; i < xb + l.w; i++) if (inb(i, j)) grid[idx(i, j)] = 1;
        }
        continue;
      }
      const A = rooms[l.a], B = rooms[l.b], dx = B.x - A.x, dz = B.z - A.z, len = hyp(dx, dz);
      const cx = (A.x + B.x) / 2 - dz / len * l.bend, cz = (A.z + B.z) / 2 + dx / len * l.bend;
      const n = Math.ceil(len / 0.35), pts = [];
      for (let s = 0; s <= n; s++) {
        const t = s / n, u = 1 - t;
        const x = u * u * A.x + 2 * u * t * cx + t * t * B.x, z = u * u * A.z + 2 * u * t * cz + t * t * B.z;
        pts.push([x, z]);
        stamp(x, z, l.w + 0.45 * Math.max(0, vnoise(s * 0.35 / 2.5, l.a * 7.1, nseed + 11)));   // noise only widens
      }
      l.curve = pts;
    }
    if (!castle) {
      // smooth jaggies (majority rule), then re-open corridor cores so nothing gets cut off
      const tmp = new Uint8Array(W * H);
      for (let it = 0; it < 2; it++) {
        tmp.set(grid);
        for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
          const k = idx(i, j);
          let n = 0;
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if (a || b) n += tmp[k + b * W + a];
          if (n >= 5) grid[k] = 1; else if (n <= 3) grid[k] = 0;
        }
      }
      for (const l of links) for (let s = 0; s < l.curve.length; s++) {   // full core width (3.5–4 m); diagonal runs lose ~0.7 m to the cell
        const c = l.curve, a = c[Math.max(0, s - 1)], b = c[Math.min(c.length - 1, s + 1)];   // staircase, so they get a little extra
        stamp(c[s][0], c[s][1], l.w + 0.4 * Math.abs(Math.sin(2 * Math.atan2(b[1] - a[1], b[0] - a[0]))));
      }
      // fill tiny wall islands inside the play area
      const seenW = new Uint8Array(W * H), q = new Int32Array(W * H);
      for (let k0 = 0; k0 < W * H; k0++) {
        if (grid[k0] || seenW[k0]) continue;
        let h = 0, t = 0, edge = false; q[t++] = k0; seenW[k0] = 1;
        while (h < t) {
          const c = q[h++], i = c % W, j = (c / W) | 0;
          if (i <= 1 || j <= 1 || i >= W - 2 || j >= H - 2) edge = true;
          for (const n of [c - 1, c + 1, c - W, c + W]) if (n >= 0 && n < W * H && !grid[n] && !seenW[n]) { seenW[n] = 1; q[t++] = n; }
          if (t > 40) edge = true;
        }
        if (!edge && t <= 6) for (let a = 0; a < t; a++) grid[q[a]] = 1;
      }
    }
    // path polyline (start → exit/boss) along the main corridors
    const path = [];
    const pushP = (x, z) => { const p = path[path.length - 1]; if (!p || hyp(p.x - x, p.z - z) > 0.2) path.push({ x, z }); };
    for (const l of links) {
      if (!l.main) continue;
      if (castle) for (const p of l.pts) pushP(p[0], p[1]);
      else for (let s = 0; s < l.curve.length; s += 4) pushP(l.curve[s][0], l.curve[s][1]);
    }
    const lastRoom = rooms[Z.rooms - 1];
    pushP(lastRoom.x, lastRoom.z);

    // castle pillars (grid cells, so pathing walks around them)
    const pillars = [];
    if (castle) {
      const nearPath = (x, z, d) => { for (let s = 1; s < path.length; s++) if (segDist(x, z, path[s - 1].x, path[s - 1].z, path[s].x, path[s].z) < d) return true; return false; };
      for (const rm of rooms) {
        const pts = [];
        if (rm.kind === 'boss') {
          for (let j = rm.z - rm.hh + 3; j <= rm.z + rm.hh - 4; j += 4) { pts.push([rm.x - rm.hw + 3, j]); pts.push([rm.x + rm.hw - 4, j]); }
        } else if (rm.hw >= 7 && rm.hh >= 5) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx < 0 ? rm.x - rm.hw + 2 : rm.x + rm.hw - 3, sz < 0 ? rm.z - rm.hh + 2 : rm.z + rm.hh - 3]);
        }
        for (const [i, j] of pts) {
          if (nearPath(i + 0.5, j + 0.5, 2.6)) continue;
          let ok = true;   // keep corridor mouths clear
          for (let b = -2; b <= 2 && ok; b++) for (let a = -2; a <= 2; a++) {
            const ii = i + a, jj = j + b;
            if (!inRoom(rm, ii + 0.5, jj + 0.5) && grid[idx(ii, jj)]) { ok = false; break; }
          }
          if (ok) { grid[idx(i, j)] = 0; pillars.push({ x: i + 0.5, z: j + 0.5, i, j }); }
        }
      }
    }
    // keep only what is reachable from the start (and drop pillars that would cut anything off)
    const st = rooms[0], si = Math.floor(st.x), sj = Math.floor(st.z);
    let seen = floodFrom(W, H, grid, si, sj);
    for (const rm of rooms) {
      if (!seen[idx(Math.floor(rm.x), Math.floor(rm.z))]) {
        for (const p of pillars) grid[idx(p.i, p.j)] = 1;   // should never happen; reopen pillars
        pillars.length = 0;
        seen = floodFrom(W, H, grid, si, sj);
        break;
      }
    }
    for (let k = 0; k < W * H; k++) if (grid[k] && !seen[k]) grid[k] = 0;

    const dWall = chamfer(W, H, grid, 0);
    const L = {
      zone: zi, Z, W, H, grid, rooms, seed, theme, links, pillars, path, dWall,
      start: null, exit: null, boss: null, npc: null, spawns: [], chests: [], breakables: [], checkpoints: [], torches: [],
      solids: [], village: null,
    };
    L._sat = makeSAT(W, H, grid);
    place(L);
    fixReach(L, unBreak, dropUnreachable);   // a breakable cluster must never seal a corridor mouth; ones Feza can't get to go
    return L;
  }

  // Distance to the nearest corridor polyline (main + side links, sampled every ~0.7 m)
  function linkDist(L, x, z) {
    let P = L._linkPts;
    if (!P) {
      P = L._linkPts = [];
      for (const l of L.links) {
        if (l.curve) for (let k = 0; k < l.curve.length; k += 2) P.push(l.curve[k][0], l.curve[k][1]);
        if (l.segs) for (const sg of l.segs) { const n = Math.max(1, Math.ceil(hyp(sg[2] - sg[0], sg[3] - sg[1]) / 0.7)); for (let k = 0; k <= n; k++) P.push(lerp(sg[0], sg[2], k / n), lerp(sg[1], sg[3], k / n)); }
      }
    }
    let d2 = 1e18;
    for (let k = 0; k < P.length; k += 2) { const dx = P[k] - x, dz = P[k + 1] - z, q = dx * dx + dz * dz; if (q < d2) d2 = q; }
    return Math.sqrt(d2);
  }

  // ── Placement of gameplay things ──
  function place(L) {
    const { Z, rooms, W, H, grid, dWall, path } = L, castle = L.theme === 'castle', zi = L.zone;
    const N = Z.rooms, main = rooms.slice(0, N), last = main[N - 1];
    const taken = [];   // {x,z,r}
    const free = (x, z, r) => { for (const t of taken) if (hyp(t.x - x, t.z - z) < t.r + r) return false; return true; };
    const dW = (x, z) => { const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= W || j >= H ? 0 : dWall[j * W + i]; };
    const pathD = (x, z) => { let d = 1e9; for (let s = 1; s < path.length; s++) d = Math.min(d, segDist(x, z, path[s - 1].x, path[s - 1].z, path[s].x, path[s].z)); return d; };
    // corridor points outside rooms (narrow passages + their mouths must stay clear of solids)
    const mouths = [];
    for (const l of L.links) {
      const pts = l.curve || [];
      if (l.segs) for (const sg of l.segs) { const n = Math.ceil(hyp(sg[2] - sg[0], sg[3] - sg[1])); for (let k = 0; k <= n; k++) pts.push([lerp(sg[0], sg[2], k / (n || 1)), lerp(sg[1], sg[3], k / (n || 1))]); }
      for (const q of pts) if (!inRoom(rooms[l.a], q[0], q[1], -1.2) && !inRoom(rooms[l.b], q[0], q[1], -1.2)) mouths.push(q);
    }
    const mouthD = (x, z) => { let d = 1e9; for (const q of mouths) d = Math.min(d, hyp(q[0] - x, q[1] - z)); return d; };
    const linkD = (x, z) => linkDist(L, x, z);   // any corridor (main or side), full length incl. the parts inside rooms
    const clearOfPath = (x, z, dp, dm) => pathD(x, z) >= dp && mouthD(x, z) >= dm;
    function spot(rm, minW, r, tries = 60, maxW = 99, extra) {
      for (let t = 0; t < tries; t++) {
        let x, z;
        if (rm.hw) { x = rm.x + RNG.range(-rm.hw + 1, rm.hw - 1); z = rm.z + RNG.range(-rm.hh + 1, rm.hh - 1); }
        else { const a = RNG.range(0, TAU), d = Math.sqrt(RNG.r()) * rm.r; x = rm.x + Math.cos(a) * d; z = rm.z + Math.sin(a) * d; }
        const w = dW(x, z);
        if (w < minW || w > maxW || !inRoom(rm, x, z, 0.5) || !free(x, z, r)) continue;
        if (extra && !extra(x, z)) continue;
        return { x, z };
      }
      return null;
    }
    const addSolid = (x, z, r, tag) => { const s = { x, z, r, alive: true, tag }; L.solids.push(s); return s; };
    // a solid either leaves a gap wide enough for anyone to pass, or hugs the wall (no gap to get stuck in)
    const gapOK = (x, z, r, g = 1.05) => gridFree(L, x, z, r + g) || !gridFree(L, x, z, r + 0.3);
    // slide a point toward the nearest wall until a circle of radius r just touches it (props standing against walls)
    const toWall = (x, z, r) => {
      let best = 9, bx = 0, bz = 0;
      for (let k = 0; k < 16; k++) {
        const a = k * TAU / 16, dx = Math.cos(a), dz = Math.sin(a);
        for (let d = 0.1; d < Math.min(best, 3); d += 0.1) if (!isFloor(L, x + dx * d, z + dz * d)) { best = d; bx = dx; bz = dz; break; }
      }
      if (best > 2.9) return null;
      let m = best - r - 0.18;
      while (m > 0 && !gridFree(L, x + bx * m, z + bz * m, r + 0.04)) m -= 0.05;
      return m > 0 ? { x: x + bx * m, z: z + bz * m } : null;
    };

    // start
    const S = rooms[0];
    L.start = zi === 0 ? { x: S.x - 0.3, z: S.z + 1.6 } : { x: S.x, z: S.z + (castle ? 1.5 : 1) };
    taken.push({ x: L.start.x, z: L.start.z, r: 2.5 });
    // zone 0: houses first — they turn part of the plaza rim into wall, which changes the distance field used below
    if (zi === 0) {
      villageHouses(L, S, clearOfPath);
      for (const h of L.village.houses) taken.push({ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.5 + 0.9 });
    }

    // boss (centre of the arena; the castle's dragon a little north of the hall's centre) · the castle's neşe kristali ·
    // every other zone's exit portal at the arena's north edge (GAME wakes it up when the boss is cheered up)
    L.bossType = Z.boss || null;
    if (Z.boss) {
      L.boss = castle ? { x: last.x, z: last.z - 1 } : { x: last.x, z: last.z };
      taken.push({ x: L.boss.x, z: L.boss.z, r: 5 });
    }
    if (Z.final) {
      L.crystalSpot = { x: last.x, z: last.z - (last.hh || last.r) + 4.5 };
      taken.push({ x: L.crystalSpot.x, z: L.crystalSpot.z, r: 3 });
    } else {
      let pz = last.z - (last.hh || last.r) * (Z.boss ? 0.95 : 0.5);
      while (pz < last.z - (Z.boss ? 3 : 0) && dW(last.x, pz) < 3.2) pz += 0.5;
      L.exit = { x: last.x, z: pz };
      taken.push({ x: L.exit.x, z: L.exit.z, r: 3 });
      addSolid(L.exit.x - 1.55, L.exit.z - 0.1, 0.5, 'portal'); addSolid(L.exit.x + 1.55, L.exit.z - 0.1, 0.5, 'portal');
    }
    {   // the main route ends at the portal / dragon, not at the last room's centre
      const g = L.exit || L.boss, e = path[path.length - 1];
      if (g && (!e || hyp(e.x - g.x, e.z - g.z) > 0.2)) path.push({ x: g.x, z: g.z });
    }

    // village edge (zone 0): owl on a stump, well, lamps, houses north of the plaza
    if (zi === 0) buildVillageData(L, S, taken, addSolid, dW, clearOfPath);

    // checkpoints: one on the way — at the way INTO its room, so Feza lights it before he meets that room's pack (which waits on the
    // far side, see packIn) — and one right before the boss arena (in the room before it, on the arena side; the castle too)
    const cpRooms = castle ? [Math.round((N - 1) * 0.45), N - 2] : [...new Set([Math.round((N - 1) * 0.4), N - 2])].filter(k => k > 0 && k < N - 1);
    const rsP = [];   // the route resampled every ≤ 0.8 m with its direction (the castle's path only has its corners)
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], l = hyp(b.x - a.x, b.z - a.z) || 1, n = Math.max(1, Math.ceil(l / 0.8));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) rsP.push({ x: lerp(a.x, b.x, k / n), z: lerp(a.z, b.z, k / n), dx: (b.x - a.x) / l, dz: (b.z - a.z) / l });
    }
    // …and clear of the corners a walker cuts (chords 4 and 8 m long across the route's bends, e.g. the castle's right-angle turns)
    const cutOK = (x, z) => {
      for (let i = 0; i + 5 < rsP.length; i++) {
        if (segDist(x, z, rsP[i].x, rsP[i].z, rsP[i + 5].x, rsP[i + 5].z) < 1.4) return false;
        if (i + 10 < rsP.length && segDist(x, z, rsP[i].x, rsP[i].z, rsP[i + 10].x, rsP[i + 10].z) < 1.4) return false;
      }
      return true;
    };
    for (const k of cpRooms) {
      const rm = main[k], pre = k === N - 2 && last.kind === 'boss';
      let p = null;
      // beside the main path (walking by lights it up) but never on it
      const onP = rsP.filter(q => inRoom(rm, q.x, q.z, 1));
      if (pre) onP.reverse();   // nearest the way out to the arena first (else nearest the way in)
      for (let t = 0; t < 48 && !p && onP.length; t++) {
        const q = onP[Math.min(onP.length - 1, t >> 2)], sd = t & 1 ? 1 : -1, o = RNG.range(1.5, 1.8);
        const x = q.x - q.dz * o * sd, z = q.z + q.dx * o * sd;
        if (dW(x, z) >= 2.2 && free(x, z, 2) && clearOfPath(x, z, 1.4, 3) && gapOK(x, z, 0.7) && cutOK(x, z)) p = { x, z };
      }
      if (!p) p = spot(rm, 2.4, 2, 60, 99, (x, z) => clearOfPath(x, z, 1.4, 3) && gapOK(x, z, 0.7) && cutOK(x, z));
      if (!p) p = spot(rm, 2.4, 2, 60, 99, (x, z) => clearOfPath(x, z, 1.4, 3) && gapOK(x, z, 0.7));
      if (!p) continue;
      L.checkpoints.push(p); taken.push({ x: p.x, z: p.z, r: 3.2 });
      addSolid(p.x, p.z, 0.7, 'cp');
    }

    // chests: one per side room (the last one big) + one in a middle main room
    const sides = rooms.filter(r => r.kind === 'side');
    sides.forEach((rm, n) => {
      const host = rooms[rm.host], dx = rm.x - host.x, dz = rm.z - host.z, l = hyp(dx, dz) || 1;
      let p = null;
      for (let t = 0; t < 20 && !p; t++) {
        const k = 0.25 + RNG.range(0, 0.15), x = rm.x + dx / l * (rm.hw ? rm.hw : rm.r) * k, z = rm.z + dz / l * (rm.hh ? rm.hh : rm.r) * k - 0.4;
        if (dW(x, z) >= 1.8 && free(x, z, 1.5) && clearOfPath(x, z, 2.2, 3) && gapOK(x, z, 0.8)) p = { x, z };
      }
      if (!p) p = spot(rm, 1.8, 1.5, 80, 99, (x, z) => clearOfPath(x, z, 2.2, 3) && gapOK(x, z, 0.8));
      for (let t = 0; t < 40 && !p; t++) {   // last resort: against the room's wall
        const q = spot(rm, 1, 0.5, 10);
        const w = q && toWall(q.x, q.z, 0.85);
        if (w && inRoom(rm, w.x, w.z) && free(w.x, w.z, 1.5) && clearOfPath(w.x, w.z, 2.2, 3)) p = w;
      }
      if (!p) return;
      L.chests.push({ x: p.x, z: p.z, big: n === sides.length - 1 });
      taken.push({ x: p.x, z: p.z, r: 2 });
    });
    {   // middle main room: right beside the route (walking it opens the chest, GAME auto-opens at 2.4 m) but never on it
      const sideP = [];   // side corridors, incl. their part inside the room: the chest must not plug one
      for (const l of L.links) if (!l.main) {
        if (l.curve) for (const q of l.curve) sideP.push(q[0], q[1]);
        if (l.segs) for (const sg of l.segs) { const n = Math.max(1, Math.ceil(hyp(sg[2] - sg[0], sg[3] - sg[1]) / 0.7)); for (let k = 0; k <= n; k++) sideP.push(lerp(sg[0], sg[2], k / n), lerp(sg[1], sg[3], k / n)); }
      }
      const ptsD = (P, x, z) => { let d = 1e9; for (let k = 0; k < P.length; k += 2) d = Math.min(d, hyp(P[k] - x, P[k + 1] - z)); return d; };
      const rs = [];   // path resampled every ≤0.4 m
      for (let s = 1; s < path.length; s++) {
        const a = path[s - 1], b = path[s], n = Math.max(1, Math.ceil(hyp(b.x - a.x, b.z - a.z) / 0.4));
        for (let k = s === 1 ? 0 : 1; k <= n; k++) rs.push(lerp(a.x, b.x, k / n), lerp(a.z, b.z, k / n));
      }
      const nr = rs.length >> 1, off = RNG.range(-0.2, 0.2);
      // A kid steering at a point a few metres ahead cuts the corners. Model that walk through the room: pure pursuit of the
      // route point `ahead` m past his progress (progress = the nearest route point, or — a kid looking further — the
      // furthest one within 3.5 m). Mildest first; the chest must sit beside these trails, not only beside the path.
      const trailsIn = rm => {
        const ext = roomExt(rm), near = ext + 10;
        let i0 = 0;
        while (i0 < nr - 1 && hyp(rs[2 * i0] - rm.x, rs[2 * i0 + 1] - rm.z) > near) i0++;
        return [[2.5, 0], [4.5, 0], [2.5, 3.5], [6, 3.5]].map(([ahead, look]) => {
          const tr = [], la = Math.round(ahead / 0.4), win = la + (look ? 16 : 6);
          let x = rs[2 * i0], z = rs[2 * i0 + 1], i = i0, inside = false;
          for (let step = 0; step < 600 && i < nr - 1; step++) {
            let bj = i, bd = 1e9;   // progress never goes backwards
            for (let j = i; j < Math.min(nr, i + win); j++) {
              const dj = hyp(rs[2 * j] - x, rs[2 * j + 1] - z);
              if (look ? dj < look : dj < bd) { bd = dj; bj = j; }
            }
            i = bj;
            const t = Math.min(nr - 1, i + la), dx = rs[2 * t] - x, dz = rs[2 * t + 1] - z, l = hyp(dx, dz);
            if (l < 0.05) break;
            x += dx / l * 0.25; z += dz / l * 0.25;
            const dr = hyp(x - rm.x, z - rm.z);
            if (dr < ext + 3) { tr.push(x, z); inside = true; } else if (inside && dr > near) break;
          }
          return tr;
        });
      };
      // best spot 1.3–1.9 m from the path and 1.1–2.0 m from the first `use` trails (off the kid's line, within reach)
      const beside = (rm, trails, use) => {
        const ext = roomExt(rm);
        let p = null, best = 1e9;
        for (let gz = rm.z - ext; gz <= rm.z + ext; gz += 0.4) for (let gx = rm.x - ext; gx <= rm.x + ext; gx += 0.4) {
          const x = gx + off, z = gz + off;
          if (!inRoom(rm, x, z, 0.5) || dW(x, z) < 1.2 || !free(x, z, 2) || !gridFree(L, x, z, 0.75)) continue;
          const d = pathD(x, z);
          if (d < 1.3 || d > 1.9) continue;
          let sc = Math.abs(d - 1.45) * 2, ok = true;
          for (let k = 0; k < use && ok; k++) { const dt = ptsD(trails[k], x, z); if (dt < 1.1 || dt > 2.0) ok = false; else sc += Math.abs(dt - 1.5); }
          if (!ok || mouthD(x, z) < 3 || ptsD(sideP, x, z) < 2.4 || !gapOK(x, z, 0.62)) continue;
          sc += hyp(x - rm.x, z - rm.z) * 0.12 - (z - rm.z) * 0.06;   // near the room's middle, slightly toward the camera (+z)
          if (sc < best) { best = sc; p = { x, z }; }
        }
        return p;
      };
      const k0 = clamp(Math.round((N - 1) * 0.55), 1, N - 2), rm = main[k0], trails = {};
      let p = null;
      for (const use of [4, 3, 2, 0]) {   // all trails (this room, else a neighbour); then fewer trails; then the path alone
        for (const k of use === 4 ? [k0, k0 + 1, k0 - 1] : [k0]) {
          if (k < 1 || k > N - 2) continue;
          p = beside(main[k], trails[k] || (trails[k] = trailsIn(main[k])), use);
          if (p) break;
        }
        if (p) break;
      }
      if (!p) p = spot(rm, 1.6, 2, 80, 2.6, (x, z) => clearOfPath(x, z, 2.6, 3) && gapOK(x, z, 0.62));
      for (let t = 0; t < 40 && !p; t++) {
        const q = spot(rm, 1, 0.5, 10);
        const w = q && toWall(q.x, q.z, 0.7);
        if (w && inRoom(rm, w.x, w.z) && free(w.x, w.z, 2) && clearOfPath(w.x, w.z, 2.6, 3)) p = w;
      }
      if (p) { L.chests.push({ x: p.x, z: p.z, big: false }); taken.push({ x: p.x, z: p.z, r: 2 }); }
    }
    for (const c of L.chests) addSolid(c.x, c.z, c.big ? 0.8 : 0.62, 'chest');

    // enemy packs — none within reach of a checkpoint's wake-up spot (cp.z + 1.6, where GAME puts Feza after a nap): creatures notice
    // him at ~9 m, so a pack there would be on him the moment he wakes up. 12 m (the pack's centre 13.5 m, room for its members),
    // else 10 m, else anywhere (a tiny room)
    const types = Z.enemies;
    let pack = 0;
    const wake = L.checkpoints.map(c => ({ x: c.x, z: c.z + 1.6 }));
    const cpD = (x, z) => { let d = 1e9; for (const w of wake) d = Math.min(d, hyp(w.x - x, w.z - z)); return d; };
    const spill = [];   // members that found no spot away from a checkpoint
    const eliteRooms = [];
    {   // not in the room right before the arena (its checkpoint): one room earlier; the castle's small halls can't keep a pack 12 m
        // off their checkpoint, so its first elite also waits a room before the middle checkpoint
      let a = clamp(Math.round((N - 1) * 0.45), 2, N - 2);
      const b = Z.boss ? N - 3 : N - 1;
      if (castle && cpRooms.includes(a) && a - 1 >= 2) a--;
      eliteRooms.push(a); if (b !== a) eliteRooms.push(b);
    }
    const packIn = (ri, n, elite) => {
      const rm = rooms[ri];
      const far = (x, z) => hyp(x - L.start.x, z - L.start.z) > 12;
      let c = null, memCp = 0;
      for (const [cc, cm] of [[13.5, 12], [11, 10]]) {
        const ok = (x, z) => far(x, z) && cpD(x, z) >= cc;
        c = spot(rm, 2.6, 1.2, 60, 99, ok) || spot(rm, 1.6, 0.8, 80, 99, ok);
        if (c) { memCp = cm; break; }
      }
      if (!c) {   // a small room with a checkpoint: the valid spot farthest from it; packmates that can't keep 9.6 m join other packs
        let bd = -1;
        for (let t = 0; t < 40; t++) { const q = spot(rm, 1.6, 0.8, 4, 99, far), d = q ? cpD(q.x, q.z) : -1; if (d > bd) { bd = d; c = q; } }
        if (c) memCp = 9.6;
      }
      if (!c) {   // small room next to the start: take the valid spot farthest from it
        let bd = -1;
        for (let t = 0; t < 40; t++) { const q = spot(rm, 1.2, 0.7, 4); if (q && hyp(q.x - L.start.x, q.z - L.start.z) > bd) { bd = hyp(q.x - L.start.x, q.z - L.start.z); c = q; } }
      }
      if (!c) return;
      pack++;
      const nearCp = memCp > 0 && cpD(c.x, c.z) < memCp + 6;   // a pack kept off a checkpoint: its members get a little more room
      let bigs = 0;
      const list = [];
      for (let m = 0; m < n; m++) {
        let t = wpick(types, RNG._r);
        if (BIG.includes(t) && (bigs > 0 || n > 4)) { const w = Object.assign({}, types); for (const b of BIG) delete w[b]; t = wpick(w, RNG._r); }
        if (BIG.includes(t)) bigs++;
        list.push(t);
      }
      if (elite) list[0] = Z.elites[eliteRooms.indexOf(ri) % Z.elites.length];
      let eliteDone = false;
      list.forEach((t, m) => {
        const big = BIG.includes(t) || (elite && m === 0);
        let p = m === 0 && hyp(c.x - L.start.x, c.z - L.start.z) > 12 ? { x: c.x, z: c.z } : null;
        for (let tr = 0; tr < (nearCp ? 80 : 40) && !p; tr++) {
          const wide = tr >= 40, a = RNG.range(0, TAU), d = RNG.range(1.3, wide ? 4.4 : 3.2);
          const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
          if (dW(x, z) >= (big ? 2.2 : 1.5) && inRoom(rm, x, z, 0.8) && free(x, z, big ? 1.4 : 0.7) && hyp(x - L.start.x, z - L.start.z) > 12 && cpD(x, z) >= (wide ? Math.min(memCp, 9.6) : memCp)) p = { x, z };
        }
        if (!p) { if (nearCp && !big && m > 0) spill.push(t); return; }   // no room away from the checkpoint: it joins another pack
        const el = !!elite && !eliteDone && (m === 0 || t === list[0] || m === list.length - 1);
        if (el) eliteDone = true;
        const sp = { type: el ? list[0] : t, x: p.x, z: p.z, elite: el, pack, room: ri }, vs = Z.variants && Z.variants[sp.type];
        if (vs && vs.length) sp.variant = RNG.pick(vs);   // e.g. the volcano's lava jellies (GAME passes it to EMODEL.build)
        L.spawns.push(sp);
        taken.push({ x: p.x, z: p.z, r: big ? 1.5 : 0.8 });
      });
    };
    for (let k = 1; k < N; k++) {
      if (main[k].kind === 'boss') continue;
      const n = k === 1 ? 3 : main[k].kind === 'exit' ? RNG.int(4, 6) : RNG.int(3, 6);
      packIn(k, n, eliteRooms.includes(k));
    }
    rooms.forEach((rm, ri) => { if (rm.kind === 'side' && RNG.chance(0.6)) packIn(ri, RNG.int(2, 3), false); });
    if (spill.length) {   // …so the level keeps its creatures: they join the packs of main rooms far from any checkpoint (smallest first, ≤ 7)
      const groups = {};
      for (const sp of L.spawns) if (sp.room >= 2 && sp.room < N - 1) (groups[sp.pack] || (groups[sp.pack] = [])).push(sp);
      const hosts = Object.values(groups).filter(g => g.every(q => cpD(q.x, q.z) >= 12));
      for (const t of spill) {
        hosts.sort((a, b) => a.length - b.length);
        for (const g of hosts) {
          if (g.length >= 7) break;
          const cx = g.reduce((a, q) => a + q.x, 0) / g.length, cz = g.reduce((a, q) => a + q.z, 0) / g.length, rm = rooms[g[0].room];
          let p = null;
          for (let tr = 0; tr < 40 && !p; tr++) {
            const a = RNG.range(0, TAU), d = RNG.range(1.3, 3.8), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
            if (dW(x, z) >= 1.5 && inRoom(rm, x, z, 0.8) && free(x, z, 0.7) && hyp(x - L.start.x, z - L.start.z) > 12 && cpD(x, z) >= 12) p = { x, z };
          }
          if (!p) continue;
          const sp = { type: t, x: p.x, z: p.z, elite: false, pack: g[0].pack, room: g[0].room }, vs = Z.variants && Z.variants[t];
          if (vs && vs.length) sp.variant = RNG.pick(vs);
          L.spawns.push(sp); g.push(sp);
          taken.push({ x: p.x, z: p.z, r: 0.8 });
          break;
        }
      }
    }
    if (!ensureBig(L, types, taken, N, dW, (x, z) => hyp(x - L.start.x, z - L.start.z) > 12 && cpD(x, z) >= 10)) ensureBig(L, types, taken, N, dW, (x, z) => hyp(x - L.start.x, z - L.start.z) > 12);

    // breakables: small clusters against the walls
    const kindsBy = { forest: ['barrel', 'crate', 'vase'], cave: ['crate', 'barrel', 'vase'], volcano: ['vase', 'crate', 'barrel'], castle: ['vase', 'vase', 'barrel', 'crate'] }[L.theme] || ['barrel', 'crate', 'vase'];
    rooms.forEach((rm, ri) => {
      if (rm.kind === 'boss') return;
      const nCl = rm.kind === 'start' ? (zi === 0 ? 1 : 0) : rm.kind === 'side' ? 1 : RNG.int(1, 2);
      for (let c = 0; c < nCl; c++) {
        const ctr = spot(rm, 1.2, 1.4, 80, 1.8, (x, z) => clearOfPath(x, z, 2.4, 3.4) && linkD(x, z) >= 2.4);
        if (!ctr) continue;
        const kind0 = RNG.pick(kindsBy), n = RNG.int(2, 4);
        let placed = 0;
        for (let t = 0; t < 40 && placed < n; t++) {
          const a = RNG.range(0, TAU), d = placed === 0 ? 0 : RNG.range(0.75, 1.5);
          const q = toWall(ctr.x + Math.cos(a) * d, ctr.z + Math.sin(a) * d, placed < 2 || RNG.chance(0.6) ? 0.45 : 1.35);
          if (!q) continue;
          const x = q.x, z = q.z, kind = RNG.chance(0.7) ? kind0 : RNG.pick(kindsBy), br = kind === 'crate' ? 0.6 : 0.42;
          if (!free(x, z, br) || !clearOfPath(x, z, 2.2, 3.2) || linkD(x, z) < 2.2 || !gapOK(x, z, 0.45, 0.95)) continue;
          L.breakables.push({ x, z, kind });
          taken.push({ x, z, r: br });
          placed++;
        }
      }
    });
    for (const b of L.breakables) b.solid = addSolid(b.x, b.z, b.kind === 'crate' ? 0.45 : 0.4, 'break');

    // torches on north walls (cave / castle; the volcano's light comes from its lava)
    if (L.theme === 'cave' || castle) {
      const nearT = (x, z, d) => L.torches.some(t => hyp(t.x - x, t.z - z) < d);
      if (castle) {
        const rowTorches = (xa, xb, jw) => {   // jw = wall row, floor at jw+1
          for (let x = xa + 2.5; x < xb - 1.5; x += 5) {
            const i = Math.floor(x);
            let ok = true;
            for (let a = -1; a <= 1; a++) if (grid[jw * W + i + a] || !grid[(jw + 1) * W + i + a]) ok = false;
            if (L.crystalSpot && Math.abs(i + 0.5 - L.crystalSpot.x) < 2 && Math.abs(jw + 1 - L.crystalSpot.z) < 6) ok = false;   // rose window
            if (ok && !nearT(i + 0.5, jw + 1, 3.5)) L.torches.push({ x: i + 0.5, y: 1.95, z: jw + 1.08 });
          }
        };
        for (const rm of rooms) rowTorches(rm.x - rm.hw, rm.x + rm.hw, rm.z - rm.hh - 1);
        for (const l of L.links) for (const s of l.segs) if (s[1] === s[3]) rowTorches(Math.min(s[0], s[2]), Math.max(s[0], s[2]), s[1] - l.w - 1);
        if (L.crystalSpot) for (const sx of [-4.2, 4.2]) L.torches.push({ x: L.crystalSpot.x + sx, y: 1.25, z: L.crystalSpot.z + 0.6, brazier: true });
      } else {
        const cells = [];
        for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) if (grid[j * W + i] && !grid[(j - 1) * W + i] && grid[j * W + i - 1] && grid[j * W + i + 1]) cells.push([i, j]);
        shuffle(cells, RNG._r);
        for (const [i, j] of cells) {
          const x = i + 0.5, z = j + 0.35;
          if (nearT(x, z, 9) || !free(x, z, 0.6)) continue;
          L.torches.push({ x, y: 1.55, z });
          taken.push({ x, z, r: 0.6 });
        }
      }
    }
    for (const t of L.torches) if (L.theme === 'cave' || t.brazier) addSolid(t.x, t.z, t.brazier ? 0.55 : 0.28, 'torch');
    for (const s of L.solids) s.r = +s.r.toFixed(2);
  }

  // Every level whose roster lists a big one (the Kaya Devi) gets at least one — the weighted pick alone left about 1 cave in 6
  // and 1 castle in 3 without. No RNG draws (levels that already have one stay exactly as they were). An ordinary member of an
  // elite-free pack in a room past the first becomes the big one where it has room to move (packIn's rules — ≥ 2.2 m from walls,
  // clear of the others by 1.4 m — plus a wall-free 1.1 m circle), else it steps to the first roomy spot around its pack.
  // Small packs (≤ 4, like packIn) first; in a pack of 5–6 the big one takes the place of two (its nearest packmate goes).
  // Main rooms near 60 % of the route are tried first, side rooms last.
  function ensureBig(L, types, taken, N, dW, farOK) {
    const big = BIG.find(b => types[b]);
    if (!big || L.spawns.some(s => BIG.includes(s.type))) return false;
    const packs = {};
    for (const s of L.spawns) (packs[s.pack] || (packs[s.pack] = [])).push(s);
    const want = Math.round((N - 1) * 0.6), rank = s => (s.room >= N ? 100 : 0) + Math.abs(s.room - want) + packs[s.pack].length * 0.01;
    const cand = L.spawns.filter(s => !s.elite && s.room >= 2 && L.rooms[s.room] && L.rooms[s.room].kind !== 'boss' && !packs[s.pack].some(o => o.elite))
      .sort((a, b) => rank(a) - rank(b) || L.spawns.indexOf(a) - L.spawns.indexOf(b));
    const own = s => (s && taken.find(t => t.x === s.x && t.z === s.z)) || null;
    const mateOf = s => packs[s.pack].length <= 4 ? null : packs[s.pack].filter(o => o !== s).sort((a, b) => hyp(a.x - s.x, a.z - s.z) - hyp(b.x - s.x, b.z - s.z))[0] || null;
    const roomy = (s, t, tm, x, z) => dW(x, z) >= 2.2 && gridFree(L, x, z, 1.1) && inRoom(L.rooms[s.room], x, z, 0.8) && farOK(x, z) &&
      taken.every(q => q === t || q === tm || hyp(q.x - x, q.z - z) >= q.r + 1.4);
    const vs = L.Z.variants && L.Z.variants[big];
    const make = (s, t, m, tm, x, z) => {
      s.type = big; s.x = x; s.z = z;
      if (vs && vs.length) s.variant = vs[L.spawns.indexOf(s) % vs.length]; else delete s.variant;
      if (t) { t.x = x; t.z = z; t.r = 1.5; } else taken.push({ x, z, r: 1.5 });
      if (m) { L.spawns.splice(L.spawns.indexOf(m), 1); if (tm) taken.splice(taken.indexOf(tm), 1); }
      return true;
    };
    for (const small of [true, false]) {
      const list = cand.filter(s => (packs[s.pack].length <= 4) === small);
      for (const s of list) { const t = own(s), m = mateOf(s), tm = own(m); if (roomy(s, t, tm, s.x, s.z)) return make(s, t, m, tm, s.x, s.z); }
      for (const s of list) {
        const t = own(s), m = mateOf(s), tm = own(m), P = packs[s.pack];
        const cx = P.reduce((a, q) => a + q.x, 0) / P.length, cz = P.reduce((a, q) => a + q.z, 0) / P.length;
        for (let d = 1.3; d <= 4.3; d += 0.5) for (let k = 0; k < 16; k++) {
          const x = cx + Math.cos(k / 16 * TAU) * d, z = cz + Math.sin(k / 16 * TAU) * d;
          if (roomy(s, t, tm, x, z)) return make(s, t, m, tm, x, z);
        }
      }
    }
    return false;
  }

  // Zone 0: 2–3 cute houses along the north rim of the start plaza, close enough to be seen from the start. They stand partly
  // on the room's floor, so the floor under them — and the strip behind them they would hide from the camera — becomes wall.
  const PKC = LV_PK;   // = 1 / tan(gameplay pitch): floor distance hidden behind 1 m of height
  function houseCells(L, S, hx, hz, w, d, yaw, top) {
    const W = L.W, H = L.H, cs = Math.cos(yaw), sn = Math.sin(yaw), out = [];
    const ex = w / 2 + 0.85, zb = d / 2 + 0.5, zf = d / 2 + 0.12, R = Math.hypot(ex, zb);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9;
    for (const [lx, lz] of [[-ex, -zb], [ex, -zb], [-ex, zf], [ex, zf]]) {
      const x = hx + lx * cs + lz * sn, z = hz - lx * sn + lz * cs;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z);
    }
    const zh = z0 - (top - 0.5) * PKC;   // hidden-by-the-roof strip north of the house
    let nFloor = 0;
    for (let j = Math.floor(zh); j <= Math.ceil(hz + R); j++) for (let i = Math.floor(hx - R); i <= Math.ceil(hx + R); i++) {
      if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) continue;
      const x = i + 0.5, z = j + 0.5, dx = x - hx, dz = z - hz, lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      const foot = Math.abs(lx) < ex && lz > -zb && lz < zf;
      const hid = x > x0 + 0.2 && x < x1 - 0.2 && z > zh && z < hz;
      if (!foot && !hid) continue;
      const c = j * W + i;
      if (!L.grid[c]) continue;
      if (!inRoom(S, x, z, -1.2)) return null;   // never eat into another room or corridor
      out.push(c); nFloor++;
    }
    return nFloor > 90 ? null : out;
  }
  function villageHouses(L, S, clearOfPath) {
    const V = L.village = { houses: [], well: null, lamps: [], fences: [], beds: [], sign: null, stump: null };
    const W = L.W, H = L.H, grid = L.grid;
    let exitA = 0;   // where the path leaves the plaza (angle from north, + = east)
    for (const p of L.path) if (hyp(p.x - S.x, p.z - S.z) > S.r * 0.9) { exitA = Math.atan2(p.x - S.x, S.z - p.z); break; }
    const cand = [];
    for (let a = -1.4; a <= 1.4; a += 0.05) {
      const da = Math.abs(angDiff(a, exitA));
      if (da < 0.75) continue;
      cand.push({ a, k: Math.abs(a) * 0.35 + RNG.r() * 0.45 - Math.min(da, 1.6) * 0.2 });
    }
    cand.sort((p, q) => p.k - q.k);
    const rooms = L.rooms.slice(0, L.Z.rooms);
    // pass 0: front row on the plaza rim · pass 1: a little further out · pass 2: second row peeking between them
    for (let pass = 0; pass < 3 && V.houses.length < 3; pass++) for (const { a } of cand) {
      if (V.houses.length >= 3) break;
      const small = V.houses.length === 2 || pass === 2, w = small ? RNG.range(3.8, 4.3) : RNG.range(4.4, 5.2), d = small ? RNG.range(3.3, 3.7) : RNG.range(3.7, 4.2);
      const wh = RNG.range(2.5, 2.9), front = pass === 2 ? S.r + RNG.range(1.5, 3) : S.r * (pass ? 0.7 : RNG.range(0.5, 0.6)), rr = front + d / 2;
      const hx = S.x + Math.sin(a) * rr, hz = S.z - Math.cos(a) * rr, yaw = Math.atan2(L.start.x - hx, L.start.z - hz);
      if (hz > L.start.z - 3 || hyp(hx - L.start.x, hz - L.start.z) < d / 2 + 3.6) continue;
      if (V.houses.some(h => hyp(h.x - hx, h.z - hz) < (h.w + w) * 0.5 + (pass === 2 ? 0.7 : 1.1))) continue;
      const span = Math.min(w, d), top = 0.3 + wh + 1.55 + span * 0.08 + 0.95;   // roof ridge + chimney
      const cells = houseCells(L, S, hx, hz, w, d, yaw, top);
      if (!cells) continue;
      let ok = true;
      for (const c of cells) {
        const x = c % W + 0.5, z = ((c / W) | 0) + 0.5;
        if (!clearOfPath(x, z, 2.4, 3.2) || hyp(x - L.start.x, z - L.start.z) < 3.4) { ok = false; break; }
      }
      if (!ok) continue;
      const keepG = grid.slice();
      for (const c of cells) grid[c] = 0;
      const seen = floodFrom(W, H, grid, Math.floor(L.start.x), Math.floor(L.start.z));
      if (rooms.some(r => !seen[Math.floor(r.z) * W + Math.floor(r.x)])) { grid.set(keepG); continue; }
      for (let k = 0; k < W * H; k++) if (grid[k] && !seen[k]) grid[k] = 0;
      V.houses.push({ x: hx, z: hz, w, d, yaw, h: wh, gable: RNG.chance(0.5), roof: RNG.int(0, 2), seed: RNG.int(1, 1e6), door: RNG.range(-0.12, 0.12) * w });
    }
    L.dWall.set(chamfer(W, H, grid, 0));
    L._sat = makeSAT(W, H, grid);
  }
  // Zone 0: the rest of the village edge around the start plaza (pure data, rendered in build)
  function buildVillageData(L, S, taken, addSolid, dW, clearOfPath) {
    const V = L.village;
    // flower beds in front of the houses (beside the door, in front of a window)
    for (const h of V.houses) {
      const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), ox = (h.door > 0 ? -1 : 1) * (h.w / 2 - 0.95), oz = h.d * 0.5 + 0.62;
      const bx = h.x + fx * oz + fz * ox, bz = h.z + fz * oz - fx * ox;
      V.beds.push({ x: bx, z: bz, yaw: h.yaw });
      taken.push({ x: bx, z: bz, r: 1.1 });
      for (const sd of [-1, 1]) addSolid(bx + fz * 0.45 * sd, bz - fx * 0.45 * sd, 0.46, 'bed');
    }
    // owl on a stump beside the plaza, a few steps from the start (east or west, whichever is free)
    let npc = null;
    const free = (x, z, r) => taken.every(q => hyp(q.x - x, q.z - z) >= q.r + r);
    for (let t = 0; t < 60 && !npc; t++) {   // east / west / north of the start only: the 1.5 m owl never stands on the camera side
      const sd = t & 1 ? -1 : 1, a = sd * RNG.range(0.75, 1.35), d = RNG.range(4.2, 5.6);
      const x = L.start.x + Math.sin(a) * d, z = L.start.z - Math.cos(a) * d;
      if (dW(x, z) >= 1.5 && dW(x, z) <= 4.5 && clearOfPath(x, z, 1.8, 2.5) && free(x, z, 1)) npc = { x, z };
    }
    if (!npc) npc = { x: S.x + 3, z: S.z - 1 };
    L.npc = npc; V.stump = npc;
    taken.push({ x: npc.x, z: npc.z, r: 2 });
    addSolid(npc.x, npc.z, 0.62, 'stump');
    // well in the northern half of the plaza, where its 2.4 m roof hides the least walkable floor behind it (it must never
    // cover Feza); if every spot would still hide some floor, it is built without the roof
    {
      let best = null;
      const ph = RNG.r() * 0.5;
      for (let wz = S.z - S.r; wz <= S.z + S.r; wz += 0.5) for (let wx = S.x - S.r; wx <= S.x + S.r; wx += 0.5) {   // every spot on a 0.5 m lattice
        const dx = wx - S.x, dz = wz - S.z;
        if (hyp(dx, dz) > S.r || dW(wx, wz) < 1.5 || hyp(wx - L.start.x, wz - L.start.z) < 3.2 || !free(wx, wz, 1.3) || !clearOfPath(wx, wz, 2.5, 3)) continue;
        const hid = hiddenBehind(L, wx, wz, 1.0, 2.5), k = hid + (dz > 0 ? 0.6 : 0) + hash2(wx * 2, wz * 2, L.seed) * 0.8 + ph;
        if (!best || k < best.k) best = { x: wx, z: wz, k, hid };
      }
      if (best) V.well = { x: best.x, z: best.z, low: best.hid > 1 };
    }
    if (V.well) { taken.push({ x: V.well.x, z: V.well.z, r: 1.8 }); addSolid(V.well.x, V.well.z, 1.0, 'well'); }
    // lamp posts near the plaza rim (east / south-west)
    for (const a0 of [1.25, -2.2, 2.35]) {
      for (let t = 0; t < 20; t++) {
        const a = a0 + RNG.range(-0.25, 0.25), d = S.r * (0.7 + t * 0.02);
        const x0 = S.x + Math.sin(a) * d, z0 = S.z - Math.cos(a) * d;
        if (dW(x0, z0) >= 1.1 && dW(x0, z0) <= 2.2 && clearOfPath(x0, z0, 1.8, 2.5) && taken.every(q => hyp(q.x - x0, q.z - z0) > q.r + 0.8)) {
          V.lamps.push({ x: x0, z: z0 }); taken.push({ x: x0, z: z0, r: 0.8 }); addSolid(x0, z0, 0.24, 'lamp'); break;
        }
      }
      if (V.lamps.length >= 2) break;
    }
    // fences along the southern rim of the plaza
    for (let a = 1.9; a < TAU - 1.9; a += 0.21) {
      let rr = S.r * 0.7;
      const dx = Math.sin(a), dz = -Math.cos(a);
      while (rr < S.r + 6 && L.grid[Math.floor(S.z + dz * rr) * L.W + Math.floor(S.x + dx * rr)]) rr += 0.25;
      rr += 0.55;
      V.fences.push({ x: S.x + dx * rr, z: S.z + dz * rr });
    }
    // sign post where the path leaves the plaza
    const p = L.path;
    for (let s = 1; s < p.length; s++) if (hyp(p[s].x - S.x, p[s].z - S.z) > S.r - 2.2) {
      const dx = p[s].x - p[s - 1].x, dz = p[s].z - p[s - 1].z, l = hyp(dx, dz) || 1;
      for (const sd of [1, -1]) {   // just off the floor edge beside the path, so it never blocks anyone
        let o = 1.5;
        while (o < 6 && L.grid[Math.floor(p[s].z + dx / l * o * sd) * L.W + Math.floor(p[s].x - dz / l * o * sd)]) o += 0.25;
        const sx = p[s].x - dz / l * (o + 0.45) * sd, sz = p[s].z + dx / l * (o + 0.45) * sd;
        if (o < 6 && sz < S.z + 2) { V.sign = { x: sx, z: sz, dir: Math.atan2(dx, dz) }; break; }
      }
      break;
    }
  }

  // ── Collision + pathing ──
  function isFloor(L, x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    return i >= 0 && j >= 0 && i < L.W && j < L.H && L.grid[j * L.W + i] === 1;
  }
  function gridFree(L, x, z, r) {
    const W = L.W, H = L.H, g = L.grid, r2 = r * r;
    const i0 = Math.floor(x - r), i1 = Math.floor(x + r), j0 = Math.floor(z - r), j1 = Math.floor(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i >= 0 && j >= 0 && i < W && j < H && g[j * W + i] === 1) continue;
      const cx = x < i ? i : x > i + 1 ? i + 1 : x, cz = z < j ? j : z > j + 1 ? j + 1 : z;
      if ((cx - x) * (cx - x) + (cz - z) * (cz - z) < r2) return false;
    }
    return true;
  }
  const SH_CS = 4;
  function solidHash(L) {
    const sol = L.solids || [];
    let h = L._sh;
    if (h && h.n === sol.length) return h;
    const nx = Math.ceil(L.W / SH_CS) + 1, nz = Math.ceil(L.H / SH_CS) + 1, cells = new Array(nx * nz);
    for (let k = 0; k < cells.length; k++) cells[k] = [];
    let maxR = 0;
    for (const s of sol) {
      maxR = Math.max(maxR, s.r);
      const ci = clamp(Math.floor(s.x / SH_CS), 0, nx - 1), cj = clamp(Math.floor(s.z / SH_CS), 0, nz - 1);
      cells[cj * nx + ci].push(s);
    }
    h = L._sh = { n: sol.length, nx, nz, cells, maxR };
    return h;
  }
  function solidFree(L, x, z, r) {
    if (!L.solids || !L.solids.length) return true;
    const h = solidHash(L), reach = r + h.maxR;
    const i0 = clamp(Math.floor((x - reach) / SH_CS), 0, h.nx - 1), i1 = clamp(Math.floor((x + reach) / SH_CS), 0, h.nx - 1);
    const j0 = clamp(Math.floor((z - reach) / SH_CS), 0, h.nz - 1), j1 = clamp(Math.floor((z + reach) / SH_CS), 0, h.nz - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = h.cells[j * h.nx + i];
      for (let k = 0; k < c.length; k++) {
        const s = c[k];
        if (!s.alive) continue;
        const rr = s.r + r, dx = s.x - x, dz = s.z - z;
        if (dx * dx + dz * dz < rr * rr) return false;
      }
    }
    return true;
  }
  function circleFree(L, x, z, r) { return !!L && gridFree(L, x, z, r) && solidFree(L, x, z, r); }
  // Deepest overlap of a circle with walls / solids → push-out normal, and whether it is round (a solid, which is walked
  // around at full speed) or a wall (face or corner: the step only slides along it; head-on the side-step takes over).
  const _ct = { nx: 0, nz: 0, round: false };
  function contact(L, x, z, r) {
    const W = L.W, H = L.H, g = L.grid, fl = (i, j) => i >= 0 && j >= 0 && i < W && j < H && g[j * W + i] === 1;
    let deep = 0, nx = 0, nz = 0, round = false;
    const i0 = Math.floor(x - r), i1 = Math.floor(x + r), j0 = Math.floor(z - r), j1 = Math.floor(z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (fl(i, j)) continue;
      const cx = x < i ? i : x > i + 1 ? i + 1 : x, cz = z < j ? j : z > j + 1 ? j + 1 : z;
      const ddx = x - cx, ddz = z - cz, d = Math.sqrt(ddx * ddx + ddz * ddz), pen = r - d;
      if (pen <= deep) continue;
      deep = pen; round = false;
      if (d > 1e-6) { nx = ddx / d; nz = ddz / d; } else { nx = x - i - 0.5; nz = z - j - 0.5; const l = hyp(nx, nz) || 1; nx /= l; nz /= l; }
    }
    if (L.solids && L.solids.length) {
      const h = solidHash(L), reach = r + h.maxR;
      const a0 = clamp(Math.floor((x - reach) / SH_CS), 0, h.nx - 1), a1 = clamp(Math.floor((x + reach) / SH_CS), 0, h.nx - 1);
      const b0 = clamp(Math.floor((z - reach) / SH_CS), 0, h.nz - 1), b1 = clamp(Math.floor((z + reach) / SH_CS), 0, h.nz - 1);
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) for (const s of h.cells[b * h.nx + a]) {
        if (!s.alive) continue;
        const ddx = x - s.x, ddz = z - s.z, d = Math.sqrt(ddx * ddx + ddz * ddz), pen = s.r + r - d;
        if (pen <= deep) continue;
        deep = pen; round = true;
        if (d > 1e-6) { nx = ddx / d; nz = ddz / d; } else { nx = 0; nz = 1; }
      }
    }
    if (deep <= 0) return null;
    _ct.nx = nx; _ct.nz = nz; _ct.round = round;
    return _ct;
  }
  // Collision response. Full step if free; otherwise the free candidate with the most progress: the step slid along the
  // contact (round things are walked around at full speed, flat walls slide by the projected step), axis slides, rotated
  // tries. Head-on with no progress possible → side-step toward the nearest opening within ~1 m, so pillars, barrels, stumps
  // and wall corners never snag, while pushing straight into a long wall does not drift. If already overlapping something,
  // any move onto floor is allowed (so nothing stays stuck).
  const DEFL = [0.55, -0.55, 1.1, -1.1, 1.45, -1.45].map(a => [Math.cos(a), Math.sin(a), Math.abs(a) > 1.3 ? 1 : 0.85]);
  function move(L, p, dx, dz, r) {
    if (!L || !p || (!dx && !dz)) return p;
    r = r || 0.4;
    if (!circleFree(L, p.x, p.z, r)) {
      if (isFloor(L, p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
      return p;
    }
    if (circleFree(L, p.x + dx, p.z + dz, r)) { p.x += dx; p.z += dz; return p; }
    const len = Math.sqrt(dx * dx + dz * dz), ux = dx / len, uz = dz / len;
    let bx = 0, bz = 0, bp = 0.12 * len;   // a candidate must make at least 12% of the step's progress (no crawling)
    const tryC = (ex, ez) => { const pr = ex * ux + ez * uz; if (pr > bp && circleFree(L, p.x + ex, p.z + ez, r)) { bp = pr; bx = ex; bz = ez; } };
    const c = contact(L, p.x + dx, p.z + dz, r);
    let tx = 0, tz = 0;
    if (c) {
      const dn = dx * c.nx + dz * c.nz, round = c.round;
      let sx = dx - c.nx * dn, sz = dz - c.nz * dn;
      const sl = Math.sqrt(sx * sx + sz * sz);
      tx = -c.nz; tz = c.nx;
      if (round && sl > 1e-6) { sx *= len / sl; sz *= len / sl; }
      tryC(sx, sz);
    }
    tryC(dx, 0); tryC(0, dz);
    if (!bx && !bz) for (const [cs, sn, k] of DEFL) tryC((dx * cs - dz * sn) * k, (dx * sn + dz * cs) * k);
    if (bx || bz) { p.x += bx; p.z += bz; return p; }
    if (!c) return p;
    const fw = Math.max(len, 0.15);
    let side = 0, bestK = 9;
    for (const sd of [1, -1]) {
      for (let k = 0.15; k <= 1.06 && k < bestK; k += 0.15) {
        const qx = p.x + tx * sd * k, qz = p.z + tz * sd * k;
        if (!circleFree(L, qx, qz, r)) break;
        if (circleFree(L, qx + ux * fw, qz + uz * fw, r)) { bestK = k; side = sd; break; }
      }
    }
    if (side) {
      const m = Math.min(len, bestK), ex = tx * side * m, ez = tz * side * m;
      if (circleFree(L, p.x + ex, p.z + ez, r)) { p.x += ex; p.z += ez; }
    }
    return p;
  }
  // Grid line of sight (exact cell traversal; solids don't block)
  function los(L, x0, z0, x1, z1) {
    if (!L) return true;
    let i = Math.floor(x0), j = Math.floor(z0);
    const ie = Math.floor(x1), je = Math.floor(z1), dx = x1 - x0, dz = z1 - z0;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? i + 1 - x0 : x0 - i) * tdx : Infinity, tmz = dz !== 0 ? (dz > 0 ? j + 1 - z0 : z0 - j) * tdz : Infinity;
    const W = L.W, H = L.H, g = L.grid;
    const ok = (a, b) => a >= 0 && b >= 0 && a < W && b < H && g[b * W + a] === 1;
    if (!ok(i, j)) return false;
    for (let n = Math.abs(ie - i) + Math.abs(je - j); n > 0; n--) {
      if (tmx < tmz) { tmx += tdx; i += si; } else { tmz += tdz; j += sj; }
      if (!ok(i, j)) return false;
    }
    return true;
  }
  // Flow field toward the hero: Dial's algorithm, costs 2 (straight) / 3 (diagonal), capped at ~45 cells.
  const FLOW_MAX = 90;
  let flowB = null;
  function flowTo(L, x, z) {
    if (!L) return;
    const W = L.W, H = L.H, g = L.grid;
    const cell = Math.floor(z) * W + Math.floor(x), now = performance.now();
    if (L._flow && L._flowCell === cell && now - L._flowAt < 180) return;   // same cell, just rebuilt
    L._flowCell = cell; L._flowAt = now;
    const D = L._flow || (L._flow = new Int16Array(W * H));
    D.fill(-1);
    let si = Math.floor(x), sj = Math.floor(z);
    if (!isFloor(L, x, z)) {   // hero pushed onto a wall edge: start from the nearest floor cell
      let best = null, bd = 9;
      for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (isFloor(L, si + a + 0.5, sj + b + 0.5) && a * a + b * b < bd) { bd = a * a + b * b; best = [si + a, sj + b]; }
      if (!best) return;
      si = best[0]; sj = best[1];
    }
    // cells covered by solids (barrels, chests…) cost extra so chasers walk around them
    const blk = L._blk || (L._blk = new Uint8Array(W * H));
    blk.fill(0);
    if (L.solids) for (const s of L.solids) {
      if (!s.alive) continue;
      const rr = Math.max(0.6, s.r + 0.55);
      for (let j = Math.floor(s.z - rr); j <= s.z + rr; j++) for (let i = Math.floor(s.x - rr); i <= s.x + rr; i++)
        if (i >= 0 && j >= 0 && i < W && j < H && hyp(i + 0.5 - s.x, j + 0.5 - s.z) < rr) blk[j * W + i] = 1;
    }
    if (!flowB) { flowB = []; for (let k = 0; k <= FLOW_MAX + 9; k++) flowB.push([]); }
    for (const b of flowB) b.length = 0;
    const s0 = sj * W + si;
    D[s0] = 0; flowB[0].push(s0);
    for (let c = 0; c <= FLOW_MAX; c++) {
      const B = flowB[c];
      for (let q = 0; q < B.length; q++) {
        const k = B[q];
        if (D[k] !== c) continue;
        const i = k % W, j = (k / W) | 0;
        for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
          if (!a && !b) continue;
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
          const n = jj * W + ii;
          if (!g[n]) continue;
          if (a && b && (!g[j * W + ii] || !g[jj * W + i])) continue;
          const nc = c + (a && b ? 3 : 2) + (blk[n] ? 8 : 0);
          if (nc > FLOW_MAX + 6) continue;
          if (D[n] < 0 || D[n] > nc) { D[n] = nc; flowB[nc].push(n); }
        }
      }
    }
  }
  function flowDir(L, x, z) {
    const D = L && L._flow;
    if (!D) return null;
    const W = L.W, H = L.H, g = L.grid, i = Math.floor(x), j = Math.floor(z);
    if (i < 0 || j < 0 || i >= W || j >= H) return null;
    const c = D[j * W + i];
    if (c <= 0) return null;
    let gx = 0, gz = 0, best = c, bx = 0, bz = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      if (!a && !b) continue;
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const n = jj * W + ii, dn = D[n];
      if (dn < 0 || dn >= c || !g[n]) continue;
      if (a && b && (!g[j * W + ii] || !g[jj * W + i])) continue;
      const diag = a && b, w = (c - dn) / (diag ? 3 : 2), l = diag ? Math.SQRT2 : 1;
      gx += a / l * w; gz += b / l * w;
      if (dn < best) { best = dn; bx = a; bz = b; }
    }
    // blend the smooth gradient with a pull toward the best neighbour's centre (keeps agents off wall corners)
    const tx = i + bx + 0.5 - x, tz = j + bz + 0.5 - z, tl = hyp(tx, tz) || 1;
    const gl = hyp(gx, gz);
    if (gl < 1e-6 && !bx && !bz) return null;
    let ox = (gl > 1e-6 ? gx / gl : 0) + tx / tl * 0.6, oz = (gl > 1e-6 ? gz / gl : 0) + tz / tl * 0.6;
    const ol = hyp(ox, oz) || 1;
    return { x: ox / ol, z: oz / ol };
  }
  // a solid either leaves a gap wide enough for anyone to pass, or hugs the wall (no gap to get stuck in)
  const gapOKL = (L, x, z, r, g = 1.05) => gridFree(L, x, z, r + g) || !gridFree(L, x, z, r + 0.3);

  // Safety net: hero-radius reachability (0.42 m, 0.25 m grid, walls + solids) flooded from the start. If a room centre,
  // chest, checkpoint, the portal, the owl or the crystal cannot be reached, the removable solids (s.vis: decor props added at
  // build time, or breakables) on the border between the reached area and the cut-off pocket are taken out.
  const RF = 0.25, HERO_R = 0.42;
  function fixReach(L, removeFn, after) {
    const W = L.W, FW = Math.ceil(W / RF), FH = Math.ceil(L.H / RF), N = FW * FH;
    const st = new Uint8Array(N), q = new Int32Array(N);   // st: 0 unknown · 1 free · 2 blocked · +4 reached · +8 pocket
    const free = c => {
      if (!st[c]) { const x = (c % FW + 0.5) * RF, z = ((c / FW | 0) + 0.5) * RF; st[c] = L.grid[Math.floor(z) * W + Math.floor(x)] && circleFree(L, x, z, HERO_R) ? 1 : 2; }
      return (st[c] & 3) === 1;
    };
    const flood = (c0, bit, skip) => {
      let h = 0, t = 0; q[t++] = c0; st[c0] |= bit;
      while (h < t) {
        const c = q[h++], a = c % FW;
        for (const n of [a > 0 ? c - 1 : -1, a < FW - 1 ? c + 1 : -1, c >= FW ? c - FW : -1, c < N - FW ? c + FW : -1])
          if (n >= 0 && !(st[n] & (bit | skip)) && free(n)) { st[n] |= bit; q[t++] = n; }
      }
    };
    const near = (x, z, d, bit, want) => {   // a cell with (state & bit) within d of (x,z)
      for (let b = Math.max(0, Math.floor((z - d) / RF)); b <= Math.min(FH - 1, Math.floor((z + d) / RF)); b++)
        for (let a = Math.max(0, Math.floor((x - d) / RF)); a <= Math.min(FW - 1, Math.floor((x + d) / RF)); a++) {
          const c = b * FW + a;
          if (hyp((a + 0.5) * RF - x, (b + 0.5) * RF - z) >= d) continue;
          if (want ? want(c) : (st[c] & bit)) return c;
        }
      return -1;
    };
    const targets = L.rooms.map(r => [r.x, r.z, 3]);
    for (const c of L.chests) targets.push([c.x, c.z, c.big ? 1.7 : 1.35]);
    for (const c of L.checkpoints) targets.push([c.x, c.z, 1.85]);
    if (L.exit) targets.push([L.exit.x, L.exit.z, 1.3]);
    if (L.crystalSpot) targets.push([L.crystalSpot.x, L.crystalSpot.z, 1.9]);
    if (L.npc) targets.push([L.npc.x, L.npc.z, 3.5]);
    let removed = 0;
    for (let it = 0; it < 4; it++) {
      st.fill(0);
      const s0 = Math.floor(L.start.z / RF) * FW + Math.floor(L.start.x / RF);
      if (!free(s0)) return removed;
      flood(s0, 4, 0);
      const bad = targets.find(t => near(t[0], t[1], t[2], 4) < 0);
      if (!bad) { if (after) after((x, z, d) => near(x, z, d, 4) >= 0, L); return removed; }
      const p0 = near(bad[0], bad[1], bad[2] + 1, 0, c => free(c) && !(st[c] & 4));
      if (p0 < 0) return removed;
      flood(p0, 8, 4);
      const cut = L.solids.filter(s => s.alive && (s.vis || s.tag === 'break') && near(s.x, s.z, s.r + HERO_R + 0.45, 8) >= 0 && near(s.x, s.z, s.r + HERO_R + 0.45, 4) >= 0);
      if (!cut.length) return removed;
      for (const s of cut) { L.solids.splice(L.solids.indexOf(s), 1); removeFn(L, s); removed++; }
      L._sh = null;
    }
    return removed;
  }
  function dropUnreachable(reached, L) {
    for (const b of L.breakables.slice()) if (!reached(b.x, b.z, 1.5)) { const i = L.solids.indexOf(b.solid); if (i >= 0) L.solids.splice(i, 1); unBreak(L, b.solid); L._sh = null; }
  }
  function unBreak(L, s) { const i = L.breakables.findIndex(b => b.solid === s); if (i >= 0) L.breakables.splice(i, 1); }
  function unProp(L, s) { if (s.vis && s.vis.length) { for (const r of s.vis) { const i = r.arr.indexOf(r.item); if (i >= 0) r.arr.splice(i, 1); } } else unBreak(L, s); }
  function randomFloorNear(L, x, z, rmin = 1, rmax = 3) {
    if (!L) return null;
    for (let k = 0; k < 48; k++) {
      const a = Math.random() * TAU, d = rmin + Math.random() * Math.max(0, rmax - rmin);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      if (circleFree(L, px, pz, 0.45) && (k > 32 || los(L, x, z, px, pz))) return { x: px, z: pz };
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  //  Visuals. Shared GPU resources (R) are created once and kept across levels (userData.keep).
  // ════════════════════════════════════════════════════════════════════════════════════════════════
  const CHUNK = 16;
  const R = { ready: false, geo: {}, mat: {}, tex: {} };
  const keep = o => { o.userData.keep = true; return o; };
  const texOK = () => typeof TEX !== 'undefined' && !!TEX && !!TEX.grass && !!TEX.grass.map;
  let FLAT = null;
  function surf(name) {   // {map, normalMap} or neutral fallbacks when TEX is absent
    if (texOK() && TEX[name]) return TEX[name];
    if (!FLAT) {
      const w = new THREE.DataTexture(new Uint8Array([205, 205, 205, 255]), 1, 1); w.needsUpdate = true; w.colorSpace = THREE.SRGBColorSpace;
      const n = new THREE.DataTexture(new Uint8Array([128, 128, 255, 128]), 1, 1); n.needsUpdate = true;
      w.wrapS = w.wrapT = n.wrapS = n.wrapT = THREE.RepeatWrapping;
      FLAT = { map: w, normalMap: n };
    }
    return FLAT;
  }
  const tM = name => (texOK() && TEX.M && TEX.M[name]) || 2;
  const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e3 = new THREE.Euler(), _m = new THREE.Matrix4();
  const mat4 = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) =>
    new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e3.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz));

  // ── GLSL shared by the level materials ──
  const GLSL_TRI = `
    vec3 lvW3(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z + 1e-5); }
    vec4 lvTri(sampler2D t, vec3 p, vec3 w, vec3 dx, vec3 dy) {
      vec4 c = vec4(0.0); float s = 0.0;
      if (w.x > 0.03) { c += w.x * textureGrad(t, p.zy, dx.zy, dy.zy); s += w.x; }
      if (w.y > 0.03) { c += w.y * textureGrad(t, p.xz, dx.xz, dy.xz); s += w.y; }
      if (w.z > 0.03) { c += w.z * textureGrad(t, p.xy, dx.xy, dy.xy); s += w.z; }
      return c / max(s, 1e-4);
    }
    vec3 lvTriN(sampler2D t, vec3 p, vec3 n, vec3 w, vec3 dx, vec3 dy, float k) {
      vec3 r = n * 1e-3;
      if (w.x > 0.03) { vec3 a = textureGrad(t, p.zy, dx.zy, dy.zy).xyz * 2.0 - 1.0; a.xy *= k; a = vec3(a.xy + n.zy, abs(a.z) * n.x); r += w.x * a.zyx; }
      if (w.y > 0.03) { vec3 b = textureGrad(t, p.xz, dx.xz, dy.xz).xyz * 2.0 - 1.0; b.xy *= k; b = vec3(b.xy + n.xz, abs(b.z) * n.y); r += w.y * b.xzy; }
      if (w.z > 0.03) { vec3 c = textureGrad(t, p.xy, dx.xy, dy.xy).xyz * 2.0 - 1.0; c.xy *= k; c = vec3(c.xy + n.xy, abs(c.z) * n.z); r += w.z * c; }
      return normalize(r);
    }`;
  const VS_WORLD = `
    vec4 lvWp = vec4(position, 1.0); vec3 lvNo = objectNormal;
    #ifdef USE_INSTANCING
      lvWp = instanceMatrix * lvWp; lvNo = mat3(instanceMatrix) * lvNo;
    #endif
    lvWp = modelMatrix * lvWp; vLvW = lvWp.xyz; vLvN = normalize(mat3(modelMatrix) * lvNo);`;
  const VS_WORLD_P = `
    vec4 lvWp = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      lvWp = instanceMatrix * lvWp;
    #endif
    lvWp = modelMatrix * lvWp; vLvW = lvWp.xyz;`;
  const GLSL_NOISE = `
    float lvH21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float lvVN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(lvH21(i), lvH21(i + vec2(1.0, 0.0)), f.x), mix(lvH21(i + vec2(0.0, 1.0)), lvH21(i + vec2(1.0, 1.0)), f.x), f.y); }`;

  // Inject GLSL into a built-in material (like core patchMat, plus colour/normal/AO chunk replacement).
  function lvShade(mat, o) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (o.uniforms) Object.assign(sh.uniforms, o.uniforms);
      let v = sh.vertexShader, f = sh.fragmentShader;
      if (o.vDecl) v = v.replace('#include <common>', '#include <common>\n' + o.vDecl);
      if (o.vColor) v = v.replace('#include <color_vertex>', o.vColor);
      if (o.vBegin) v = v.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + o.vBegin);
      if (o.fDecl) f = f.replace('#include <common>', '#include <common>\n' + o.fDecl);
      if (o.fMap !== undefined) f = f.replace('#include <map_fragment>', o.fMap);
      if (o.fNormal !== undefined) f = f.replace('#include <normal_fragment_maps>', o.fNormal);
      if (o.fAO !== undefined) f = f.replace('#include <aomap_fragment>', o.fAO);
      if (o.fOut) f = f.replace('#include <opaque_fragment>', o.fOut + '\n#include <opaque_fragment>');
      sh.vertexShader = v; sh.fragmentShader = f;
      if (prev) prev.call(mat, sh, r);
    };
    mat.userData.pkey = 'lv-' + o.key;
    mat.customProgramCacheKey = () => mat.userData.pkey;
    return mat;
  }

  // ── Geometry helpers ──
  function weldNormals(g) {   // smooth normals across seams/duplicated vertices (by position)
    const P = g.attributes.position, n = P.count, ids = new Int32Array(n), map = new Map();
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      const k = Math.round(P.getX(i) * 1e4) + '_' + Math.round(P.getY(i) * 1e4) + '_' + Math.round(P.getZ(i) * 1e4);
      let id = map.get(k); if (id === undefined) { id = cnt++; map.set(k, id); } ids[i] = id;
    }
    const acc = new Float32Array(cnt * 3), I = g.index ? g.index.array : null, tn = I ? I.length : n;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < tn; t += 3) {
      const i0 = I ? I[t] : t, i1 = I ? I[t + 1] : t + 1, i2 = I ? I[t + 2] : t + 2;
      a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1).sub(a); c.fromBufferAttribute(P, i2).sub(a);
      b.cross(c);
      for (const i of [i0, i1, i2]) { const o = ids[i] * 3; acc[o] += b.x; acc[o + 1] += b.y; acc[o + 2] += b.z; }
    }
    const N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const o = ids[i] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
      N[i * 3] = acc[o] / l; N[i * 3 + 1] = acc[o + 1] / l; N[i * 3 + 2] = acc[o + 2] / l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return g;
  }
  function markUV(g, u) {   // uv.x > 5 marks parts for the shaders (leaves 10, plain colour 20, sway 30…)
    const n = g.attributes.position.count, uv = new Float32Array(n * 2).fill(u);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }
  function marked(geo, u) {
    const key = 'mk' + geo.uuid + '_' + u;
    return R.geo[key] || (R.geo[key] = keep(markUV(geo.clone(), u)));
  }
  // Lumpy sphere (foliage blobs, boulders): sum of a few directional sines, smooth normals
  function lumpy(detail, amp, seed, o = {}) {
    const g = new THREE.IcosahedronGeometry(1, detail), P = g.attributes.position, rnd = mulberry32(seed), dirs = [], crg = [];
    for (let k = 0; k < 6; k++) dirs.push([new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 1.6 + rnd() * 2.6, rnd() * TAU]);
    for (let k = 0; k < 4; k++) crg.push([new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), 2.5 + rnd() * 3, rnd() * TAU]);
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      let d = 0; for (const [dir, f, ph] of dirs) d += Math.sin(v.dot(dir) * f + ph);
      if (o.crag) for (const [dir, f, ph] of crg) d += o.crag * (Math.abs(Math.sin(v.dot(dir) * f + ph)) - 0.6);
      v.multiplyScalar(1 + amp * d / 3);
      if (o.flat !== undefined && v.y < o.flat) v.y = o.flat + (v.y - o.flat) * 0.2;
      P.setXYZ(i, v.x, v.y, v.z);
    }
    weldNormals(g);
    markUV(g, o.uv ?? 0);
    return keep(g);
  }
  // Tiered, droopy cone for fir trees / stalagmites
  function lumpyCone(seed, seg = 16, droop = 0.12, uvm = 10) {
    const g = new THREE.ConeGeometry(1, 1, seg, 4, false), P = g.attributes.position, rnd = mulberry32(seed), ph = rnd() * TAU;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x);
      if (r < 1e-4) continue;
      const k = 1 + 0.13 * Math.sin(a * 7 + ph) * (0.5 - y) + 0.06 * Math.sin(a * 13 + ph * 2);
      P.setXYZ(i, x * k, y - (y < -0.45 ? droop * (0.6 + 0.4 * Math.sin(a * 7 + ph)) : 0), z * k);
    }
    weldNormals(g);
    markUV(g, uvm);
    return keep(g);
  }
  function boxUV(sx, sy, sz, m) {   // box whose UVs are in metres/m (textures keep their real size)
    const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / m, uv.getY(i) * dims[f][1] / m); }
    return g;
  }
  // Fast merge of prototype geometries with per-item matrix + tint (static decor chunks, village)
  function mergeList(list) {
    let nv = 0, ni = 0;
    for (const it of list) { const P = it.geo.attributes.position; nv += P.count; ni += it.geo.index ? it.geo.index.count : P.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), nm = new THREE.Matrix3();
    let vo = 0, io = 0;
    for (const it of list) {
      const g = it.geo, P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color ? g.attributes.color.array : null, U = g.attributes.uv ? g.attributes.uv.array : null;
      const e = it.m.elements, n = g.attributes.position.count, tr = it.c ? it.c.r : 1, tg = it.c ? it.c.g : 1, tb = it.c ? it.c.b : 1;
      nm.getNormalMatrix(it.m); const q = nm.elements;
      for (let i = 0; i < n; i++) {
        const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], o = (vo + i) * 3;
        pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12]; pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const a = N[i * 3], b = N[i * 3 + 1], c = N[i * 3 + 2];
        let nx = q[0] * a + q[3] * b + q[6] * c, ny = q[1] * a + q[4] * b + q[7] * c, nz = q[2] * a + q[5] * b + q[8] * c;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
        col[o] = (C ? C[i * 3] : 1) * tr; col[o + 1] = (C ? C[i * 3 + 1] : 1) * tg; col[o + 2] = (C ? C[i * 3 + 2] : 1) * tb;
        if (U) { uv[(vo + i) * 2] = U[i * 2]; uv[(vo + i) * 2 + 1] = U[i * 2 + 1]; }
      }
      if (g.index) { const I = g.index.array; for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo; io += I.length; }
      else { for (let k = 0; k < n; k++) idx[io + k] = vo + k; io += n; }
      vo += n;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }

  // ── Materials ──
  function makeFoliageMat() {   // bark (uv<5) + leaves (uv 10, instance-tinted) + plain colour (uv 20); wind sway
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
    const bark = surf('bark'), leaf = surf('leaves');
    lvShade(m, {
      key: 'foliage',
      uniforms: { uTime: TIME.u, tBark: { value: bark.map }, tBarkN: { value: bark.normalMap }, tLeaf: { value: leaf.map }, tLeafN: { value: leaf.normalMap },
        uSc: { value: new THREE.Vector2(1 / tM('bark'), 1.25 / tM('leaves')) }, uTrans: { value: new THREE.Color(0.5, 0.58, 0.3) } },
      vDecl: 'uniform float uTime; varying vec3 vLvW; varying vec3 vLvN; varying float vLvK;',
      vColor: `vColor = vec3(1.0);
        #ifdef USE_COLOR
          vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
          if (uv.x > 5.0 && uv.x < 15.0) vColor *= instanceColor.xyz;
        #endif`,
      vBegin: VS_WORLD + `
        vLvK = uv.x > 15.0 ? 2.0 : uv.x > 5.0 ? 1.0 : 0.0;
        vec3 lvIp = vec3(0.0);
        #ifdef USE_INSTANCING
          lvIp = instanceMatrix[3].xyz;
        #endif
        float lvPh = lvIp.x * 0.37 + lvIp.z * 0.23;
        float lvHt = max(0.0, position.y - 0.4);
        float lvSw = lvHt * lvHt * 0.0075;
        transformed.x += (sin(uTime * 1.2 + lvPh) + 0.45 * sin(uTime * 2.3 + lvPh * 1.7)) * lvSw;
        transformed.z += cos(uTime * 1.0 + lvPh * 1.3) * lvSw * 0.6;
        if (vLvK > 0.5 && vLvK < 1.5) transformed += objectNormal * sin(uTime * 3.5 + dot(position, vec3(5.0, 7.0, 3.0))) * 0.02;`,
      fDecl: GLSL_TRI + 'uniform sampler2D tBark, tBarkN, tLeaf, tLeafN; uniform vec2 uSc; uniform vec3 uTrans; varying vec3 vLvW; varying vec3 vLvN; varying float vLvK;',
      fMap: `vec3 lvN0 = normalize(vLvN); vec3 lvWt = lvW3(lvN0);
        vec3 lvP = vLvW * (vLvK < 0.5 ? uSc.x : uSc.y); vec3 lvDx = dFdx(lvP), lvDy = dFdy(lvP);
        if (vLvK < 0.5) diffuseColor *= lvTri(tBark, lvP, lvWt, lvDx, lvDy);
        else if (vLvK < 1.5) diffuseColor *= lvTri(tLeaf, lvP, lvWt, lvDx, lvDy);`,
      fNormal: `if (vLvK < 1.5) {
          vec3 lvTn = vLvK < 0.5 ? lvTriN(tBarkN, lvP, lvN0, lvWt, lvDx, lvDy, 1.0) : lvTriN(tLeafN, lvP, lvN0, lvWt, lvDx, lvDy, 1.1);
          normal = normalize((viewMatrix * vec4(lvTn, 0.0)).xyz);
        }`,
      fOut: `if (vLvK > 0.5 && vLvK < 1.5) outgoingLight += diffuseColor.rgb * uTrans * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);`,
    });
    return keep(m);
  }
  // Triplanar textured stone (boulders, bricks, pillars, arches) with optional moss on top and darker bases
  function makeTriMat(texName, o = {}) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.rough ?? 0.85, metalness: 0 });
    const t = surf(texName), moss = surf('moss');
    const U = { tT: { value: t.map }, tTn: { value: t.normalMap }, tMoss: { value: moss.map }, uS: { value: 1 / (o.m || tM(texName)) },
      uMoss: { value: new THREE.Vector4(1, 1, 1, 0) }, uAO: { value: new THREE.Vector2(o.aoH ?? 0.9, o.ao ?? 0.5) }, uNK: { value: o.nk ?? 1 },
      uRim: { value: new THREE.Vector4(1, 1, 1, 0) } };
    m.userData.u = U;
    lvShade(m, {
      key: 'tri-' + (o.key || texName),
      uniforms: U,
      vDecl: 'varying vec3 vLvW; varying vec3 vLvN;',
      vBegin: VS_WORLD,
      fDecl: GLSL_TRI + 'uniform sampler2D tT, tTn, tMoss; uniform float uS, uNK; uniform vec4 uMoss, uRim; uniform vec2 uAO; varying vec3 vLvW; varying vec3 vLvN;',
      fMap: `vec3 lvN0 = normalize(vLvN); vec3 lvWt = lvW3(lvN0); vec3 lvP = vLvW * uS; vec3 lvDx = dFdx(lvP), lvDy = dFdy(lvP);
        vec4 lvT = lvTri(tT, lvP, lvWt, lvDx, lvDy); diffuseColor *= lvT;
        vec2 lvMp = vLvW.xz * 0.5; vec2 lvMdx = dFdx(lvMp), lvMdy = dFdy(lvMp);`,
      fNormal: `vec3 lvTn = lvTriN(tTn, lvP, lvN0, lvWt, lvDx, lvDy, uNK);
        float lvMs = uMoss.w * smoothstep(0.5, 0.85, lvTn.y + (lvT.g - 0.5) * 0.7);
        if (lvMs > 0.002) { vec3 mc = textureGrad(tMoss, lvMp, lvMdx, lvMdy).rgb * uMoss.rgb; diffuseColor.rgb = mix(diffuseColor.rgb, mc, lvMs); roughnessFactor = mix(roughnessFactor, 0.95, lvMs); }
        diffuseColor.rgb *= mix(uAO.y, 1.0, smoothstep(0.0, uAO.x, vLvW.y));
        normal = normalize((viewMatrix * vec4(lvTn, 0.0)).xyz);`,
      fOut: 'outgoingLight += uRim.rgb * uRim.a * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);',
    });
    return keep(m);
  }
  // Wood (TEX.wood via uv) + plain metal parts (uv.x > 5): chests, barrels, crates, fences, houses' timber
  function makePropMat() {
    const w = surf('wood');
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: w.map, normalMap: w.normalMap, roughness: 0.7, metalness: 0 });
    lvShade(m, {
      key: 'prop',
      vDecl: 'varying float vLvMt;',
      vBegin: 'vLvMt = step(5.0, uv.x);',
      fDecl: 'varying float vLvMt;',
      fMap: `vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        if (vLvMt > 0.5) sampledDiffuseColor = vec4(1.0);
        diffuseColor *= sampledDiffuseColor;`,
      fNormal: `if (vLvMt < 0.5) {
          vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale; normal = normalize(tbn * mapN);
        } else { metalnessFactor = 0.85; roughnessFactor = 0.32; }`,
    });
    return keep(m);
  }
  function makeDecorMat(shiny) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: shiny ? 0.38 : 0.66, metalness: shiny ? 0.15 : 0 });
    lvShade(m, {
      key: shiny ? 'decorS' : 'decor',
      uniforms: { uTime: TIME.u },
      vDecl: 'uniform float uTime;',
      vBegin: `if (uv.x > 25.0) { float lvS = max(0.0, position.y) * 0.09;
        transformed.x += sin(uTime * 2.1 + position.x * 0.9 + position.z * 0.7) * lvS; transformed.z += cos(uTime * 1.7 + position.x * 0.6) * lvS * 0.6; }`,
    });
    rimify(m, 0xffffff, shiny ? 0.16 : 0.1, 2.6);
    return keep(m);
  }
  function makeGlowMat(k = 2.2) {   // unlit HDR vertex colours with a slow shimmer
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(k, k, k) });
    lvShade(m, {
      key: 'glow',
      uniforms: { uTime: TIME.u },
      vDecl: 'varying vec3 vLvW;', vBegin: VS_WORLD_P,
      fDecl: 'uniform float uTime; varying vec3 vLvW;',
      fOut: 'outgoingLight *= 0.78 + 0.22 * sin(uTime * 1.6 + vLvW.x * 0.9 + vLvW.z * 0.7 + vLvW.y * 2.0);',
    });
    return keep(m);
  }
  function ensureRes() {
    if (R.ready && R.texOK === texOK()) return;
    R.ready = true; R.texOK = texOK();
    R.heroU = R.heroU || { value: new THREE.Vector3(0, 0, -999) };
    R.ptOn = R.ptOn || { value: new Float32Array(16).fill(1) };
    R.ptScale = R.ptScale || { value: 400 };
    R.portalOn = R.portalOn || { value: 1 };
    R.cpPool = [];
    const M = R.mat;
    M.foliage = makeFoliageMat();
    M.rock = makeTriMat('rock', { aoH: 1.2, ao: 0.45, nk: 1.7, m: 2.2 });
    M.brick = makeTriMat('brick', { aoH: 1.4, ao: 0.42, key: 'brick' });
    M.stone = makeTriMat('rock', { aoH: 0.6, ao: 0.6, key: 'stone', m: 1.6 });
    M.soil = makeTriMat('caveSand', { aoH: 0.3, ao: 0.5, key: 'rock', m: 1.2, rough: 0.95 });   // molehills: the cave path's sand (same shader as the rocks)
    M.prop = makePropMat();
    M.decor = makeDecorMat(false);
    M.shiny = makeDecorMat(true);
    M.glow = makeGlowMat(2.2);
    M.gold = keep(stdMat({ color: 0xffc94a, metalness: 0.95, roughness: 0.28 }));
    M.plaster = keep(stdMat({ map: surf('plaster').map, normalMap: surf('plaster').normalMap, roughness: 0.9, vertexColors: true }));
    M.roof = keep(stdMat({ map: surf('roof').map, normalMap: surf('roof').normalMap, roughness: 0.6, vertexColors: true }));
    M.window = keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.35, 0.6), vertexColors: true }));
    M.pillar = makePillarMat();
    M.roofC = M.brick;   // castle battlement roof: same bricks, own merge key (no shadow casting)
    M.coin = keep(stdMat({ color: 0xffffff, vertexColors: true, metalness: 0.8, roughness: 0.4 }));
  }

  // ── Floor: one plane, splat of 3 textures by a baked mask (R path, G wall AO, B plaza/rug, A outside) ──
  const MPX = 4;   // mask pixels per metre
  function boxBlur(src, W, H, r) {
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), k = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {
      const o = y * W; let acc = 0;
      for (let x = -r; x <= r; x++) acc += src[o + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) { tmp[o + x] = acc * k; acc += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) { out[y * W + x] = acc * k; acc += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
    }
    return out;
  }
  const FLOOR = {
    forest: { a: 'grass', b: 'dirt', c: 'cobble', tA: 0xdce6c8, tB: 0xf2e6da, tC: 0xf6ecdc, rough: [0.92, 0.96, 0.82], crispB: 0, crispC: 0, ao: 0.62, border: 0, out: 0x1e3a18, outAmt: 0.45, anti: 1, macro: 0xffe890 },
    cave: { a: 'caveFloor', b: 'caveSand', c: 'moss', lumC: 1.05, cScale: 1.6, tA: 0xb6b2c6, tB: 0xc8bec8, tC: 0x2a7a80, rough: [0.55, 0.95, 0.9], crispB: 0, crispC: 0, ao: 0.75, border: 0, out: 0x04050a, outAmt: 0.92, anti: 1, macro: 0x9cc0ff, speck: [0x7affe0, 2.6] },
    castle: { a: 'castleFloor', b: 'carpet', c: 'carpet', lumC: 1.5, tA: 0xe2dcf0, tB: 0xffffff, tC: 0x2e9aa4, tA2: 0xf8e4c8, tC2: 0xc8303e, rough: [0.3, 0.95, 0.95], crispB: 1, crispC: 1, ao: 0.62, border: 1, out: 0x2c2248, outAmt: 1, anti: 0, macro: 0xffffff },
    // basalt slabs, an ash path, paved bridges / checkpoint discs; the lava itself is drawn by the same floor shader (uLava)
    volcano: { a: 'basalt', b: 'ash', c: 'cobble', lumC: 1.1, tA: 0xf2f0f2, tB: 0xfff6ee, tC: 0xb8a498, rough: [0.8, 0.96, 0.82], crispB: 0, crispC: 0, ao: 0.62, border: 0, out: 0x5a3a2c, outAmt: 0.58, anti: 0, macro: 0xfff0e4, lava: 1 },   // out: warm mid-brown (bright volcano, no black holes)
  };
  // ── Volcano ground: which non-walkable ground is lava (at the floor mask's 4 px/m) ──
  // Lava fills most of the ground next to the floor — always on the camera side, where it is flat and hides nothing — and the rest
  // is basalt ground with rocks (more of it far away and behind the rooms). The shore keeps 0.26–0.94 m outside the walkable cells,
  // so Feza never looks like he stands in it. The boss arena is ringed by a lava moat with basalt cliffs behind it (north). Where a
  // corridor runs with lava on both sides it becomes a paved stone bridge (L._volc.bridges; deck in the floor mask, parapets in build).
  function volcanoField(L) {
    const P = MPX, W = L.W, H = L.H, MW = W * P, MH = H * P, n = MW * MH, grid = L.grid, seed = (L.seed & 0xffff) + 31;
    const fl = new Uint8Array(n);
    for (let py = 0; py < MH; py++) { const row = ((py / P) | 0) * W, o = py * MW; for (let px = 0; px < MW; px++) fl[o + px] = grid[row + ((px / P) | 0)]; }
    const D = chamfer(MW, MH, fl, 1);   // mask pixels to the nearest floor pixel
    const up = new Float32Array(W * H), dn = new Float32Array(W * H);   // metres to floor straight north (camera side) / south (behind a room)
    for (let i = 0; i < W; i++) {
      let lf = -99; for (let j = 0; j < H; j++) { if (grid[j * W + i]) lf = j; up[j * W + i] = j - lf; }
      lf = 1e9; for (let j = H - 1; j >= 0; j--) { if (grid[j * W + i]) lf = j; dn[j * W + i] = lf - j; }
    }
    const ar = L.rooms.find(r => r.kind === 'boss' && !r.hw);
    let dA = null;
    if (ar) { const src = new Uint8Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) src[j * W + i] = grid[j * W + i] && inRoom(ar, i + 0.5, j + 0.5, -1.5) ? 1 : 0; dA = chamfer(W, H, src, 1); }
    // The per-cell fields are sampled bilinearly (and up/dn through a gentle noise warp), then the rock factor is blurred ~0.75 m, so
    // the lava / basalt borders curve naturally instead of following the 1 m cell lines (straight strips, right-angled pockets).
    const Uc = new Float32Array(W * H), Dc = new Float32Array(W * H), Ac = dA ? new Float32Array(W * H) : null;
    for (let c = 0; c < W * H; c++) {   // camera side reaches round a floor edge sideways too, fading with the sideways distance
      const i = c % W;
      let u = Math.min(20, up[c]);
      for (let di = 1; di <= 4; di++) { if (i - di >= 0) u = Math.min(u, up[c - di] + 1.6 * di); if (i + di < W) u = Math.min(u, up[c + di] + 1.6 * di); }
      Uc[c] = u;
      Dc[c] = Math.min(20, dn[c]);
      if (Ac) Ac[c] = Math.min(30, dA[c]);
    }
    const bil = (F, x, z) => {
      const fx = clamp(x - 0.5, 0, W - 1.001), fz = clamp(z - 0.5, 0, H - 1.001), i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * W + i;
      return (F[k] * (1 - tx) + F[k + 1] * tx) * (1 - tz) + (F[k + W] * (1 - tx) + F[k + W + 1] * tx) * tz;
    };
    const rkF = new Float32Array(n), nfF = new Float32Array(n);
    for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
      const k = py * MW + px;
      if (fl[k]) continue;
      const x = (px + 0.5) / P, z = (py + 0.5) / P, d = D[k] / P;
      let rk = vnoise(x / 7.5, z / 7.5, seed + 1) * 0.75 + vnoise(x / 2.6, z / 2.6, seed + 2) * 0.22 + Math.max(0, d - 4) * 0.13 - 0.04;
      const wa = 1.1 * smooth01((d - 0.4) / 1.6), wx = x + vnoise(x / 2.3, z / 2.3, seed + 5) * wa, wz = z + vnoise(x / 2.3, z / 2.3, seed + 6) * wa;   // no warp at the shore (floor cells read as u = dn = 0)
      const u = bil(Uc, wx, wz), cam = 1 - smooth01((u - 6.25) / 1.5);
      rk -= 0.5 * Math.max(0, 1 - u / 9) * cam;                                          // camera side: lava
      rk += 0.3 * (1 - cam) * (1 - smooth01((bil(Dc, wx, wz) - 5.75) / 1.5));            // behind a room: rocky shore, cliffs
      if (Ac) {   // moat · cliffs north of the arena
        const a = bil(Ac, x, z), cl = (1 - smooth01((a - 9.5) / 1.0)) * smooth01((ar.z - 3 - z) / 2 + 0.5), moat = 1 - smooth01((a - 4.7) / 1.0);
        rk += Math.max(0, 0.6 - rk) * cl;
        rk = rk * (1 - moat) - moat;
      }
      rkF[k] = rk; nfF[k] = 1;
    }
    const rkB = boxBlur(rkF, MW, MH, 3), nfB = boxBlur(nfF, MW, MH, 3);   // normalised: walkable floor pixels don't pull the average
    const raw = new Float32Array(n);
    for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
      const k = py * MW + px;
      if (fl[k]) continue;
      const x = (px + 0.5) / P, z = (py + 0.5) / P, d = D[k] / P;
      const off = 0.6 + 0.22 * vnoise(x / 2.6, z / 2.6, seed) + 0.12 * vnoise(x / 1.1, z / 1.1, seed + 7);   // a wavy shore, 0.26–0.94 m off the walkable cells
      const rock = smooth01((rkB[k] / Math.max(1e-3, nfB[k]) - 0.14) / 0.16 + 0.5);
      raw[k] = smooth01((d - off) / 0.22 + 0.5) * (1 - rock);
    }
    const lava = boxBlur(raw, MW, MH, 1);
    for (let k = 0; k < n; k++) if (fl[k]) lava[k] = 0;   // never on walkable floor, even blurred
    const V = L._volc = { lava, MW, MH, P, dA, arena: ar || null, bridges: [] };
    // bridges: corridor stretches (outside both rooms) with lava close on both sides
    const lavaAt = (x, z) => lava[clamp(Math.floor(z * P), 0, MH - 1) * MW + clamp(Math.floor(x * P), 0, MW - 1)];
    const edge = (x, z, nx, nz) => { for (let d = 0; d < 4.5; d += 0.1) if (!isFloor(L, x + nx * d, z + nz * d)) return d; return 9; };
    for (const l of L.links) {
      const c = l.curve;
      if (!c) continue;
      const A = L.rooms[l.a], B = L.rooms[l.b];
      let run = null, gap = 0;
      const flush = () => { if (run && run.pts.length >= 4) V.bridges.push(run); run = null; gap = 0; };
      for (let s = 0; s < c.length; s += 2) {
        const x = c[s][0], z = c[s][1], a = c[Math.max(0, s - 2)], b = c[Math.min(c.length - 1, s + 2)];
        const dx = b[0] - a[0], dz = b[1] - a[1], ll = hyp(dx, dz) || 1, nx = -dz / ll, nz = dx / ll;
        let ok = !inRoom(A, x, z, -0.8) && !inRoom(B, x, z, -0.8) && isFloor(L, x, z), e1 = 0, e2 = 0;
        if (ok) {
          e1 = edge(x, z, nx, nz); e2 = edge(x, z, -nx, -nz);
          ok = e1 < 4 && e2 < 4 && lavaAt(x + nx * (e1 + 1.1), z + nz * (e1 + 1.1)) > 0.5 && lavaAt(x - nx * (e2 + 1.1), z - nz * (e2 + 1.1)) > 0.5;
        }
        if (ok) { if (!run) run = { pts: [], main: !!l.main }; if (gap) run.pts.push(...run.hold); run.hold = []; gap = 0; run.pts.push({ x, z, nx, nz, e1, e2 }); }
        else if (run && gap < 2 && isFloor(L, x, z)) { gap++; run.hold.push({ x, z, nx, nz, e1: Math.min(edge(x, z, nx, nz), 4), e2: Math.min(edge(x, z, -nx, -nz), 4) }); }   // bridge a short break
        else flush();
      }
      flush();
    }
    for (const b of V.bridges) for (let it = 0; it < 2; it++) {   // smooth the edge distances (cell staircase) so the parapets run in a line
      const e1 = b.pts.map(q => q.e1), e2 = b.pts.map(q => q.e2), n = b.pts.length;
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1); b.pts[i].e1 = (e1[a] + e1[i] * 2 + e1[c]) / 4; b.pts[i].e2 = (e2[a] + e2[i] * 2 + e2[c]) / 4; }
    }
    return V;
  }
  function buildMask(L) {
    const P = MPX, MW = L.W * P, MH = L.H * P, n = MW * MH, seed = L.seed & 0xffff, VL = L._volc && L._volc.lava;
    const wall = new Float32Array(n);
    for (let py = 0; py < MH; py++) { const row = ((py / P) | 0) * L.W, o = py * MW; for (let px = 0; px < MW; px++) wall[o + px] = L.grid[row + ((px / P) | 0)] ? 0 : VL ? 1 - VL[o + px] : 1; }   // volcano: lava is no wall (no AO, no dark ground)
    let g = boxBlur(wall, MW, MH, 3); g = boxBlur(g, MW, MH, 2);
    let a = boxBlur(g, MW, MH, 7); a = boxBlur(a, MW, MH, 7);
    const Rm = new Float32Array(n), Bm = new Float32Array(n);
    const band = (pts, hw, ramp, dst, na) => {
      for (let s = 1; s < pts.length; s++) {
        const p0 = pts[s - 1], p1 = pts[s], e = hw + ramp + na;
        const x0 = Math.max(0, Math.floor((Math.min(p0.x, p1.x) - e) * P)), x1 = Math.min(MW - 1, Math.ceil((Math.max(p0.x, p1.x) + e) * P));
        const y0 = Math.max(0, Math.floor((Math.min(p0.z, p1.z) - e) * P)), y1 = Math.min(MH - 1, Math.ceil((Math.max(p0.z, p1.z) + e) * P));
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
          const x = (px + 0.5) / P, z = (py + 0.5) / P;
          const w = hw + (na ? vnoise(x / 1.6, z / 1.6, seed) * na : 0);
          const v = clamp(0.5 + (w - segDist(x, z, p0.x, p0.z, p1.x, p1.z)) / ramp, 0, 1), k = py * MW + px;
          if (v > dst[k]) dst[k] = v;
        }
      }
    };
    const disc = (cx, cz, r, ramp, dst, na) => band([{ x: cx, z: cz }, { x: cx + 0.01, z: cz }], r, ramp, dst, na);
    const curvePts = l => (l.curve || []).map(q => ({ x: q[0], z: q[1] }));
    if (L.theme === 'forest') {
      band(L.path, 1.2, 1.3, Rm, 0.4);
      for (const l of L.links) if (!l.main) band(curvePts(l), 0.75, 1.1, Rm, 0.3);
      if (L.village) {
        const S = L.rooms[0], cx = S.x - 0.3, cz = S.z + 0.7;
        disc(cx, cz, S.r * 0.5, 1.4, Bm, 1.1);
        for (const h of L.village.houses) {   // little cobbled walks from each front door to the plaza
          const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), dx = h.door, oz = h.d / 2 + 0.3;
          const p0 = { x: h.x + fx * oz + fz * dx, z: h.z + fz * oz - fx * dx }, t = 0.55;
          band([p0, { x: lerp(p0.x, cx, t), z: lerp(p0.z, cz, t) }], 0.62, 0.9, Bm, 0.25);
        }
      }
      for (const c of L.checkpoints) disc(c.x, c.z, 2.1, 1.2, Bm, 0.5);
      if (L.exit) disc(L.exit.x, L.exit.z + 0.6, 2.6, 1.3, Bm, 0.5);
    } else if (L.theme === 'cave') {
      band(L.path, 1.35, 1.7, Rm, 0.55);
      for (const l of L.links) if (!l.main) band(curvePts(l), 0.9, 1.4, Rm, 0.4);
      for (let py = 0; py < MH; py += 1) for (let px = 0; px < MW; px += 1) {
        const x = px / P, z = py / P, k = py * MW + px;
        Bm[k] = clamp(0.5 + (vnoise(x / 4.5, z / 4.5, seed + 3) * 0.7 + vnoise(x / 1.7, z / 1.7, seed + 4) * 0.3 - 0.45) * 1.5 + g[k] * 1.1 - 0.2, 0, 1);
      }
    } else if (L.theme === 'castle') {
      const p = L.path.slice();
      if (L.crystalSpot) p.push({ x: L.crystalSpot.x, z: L.crystalSpot.z + 2.6 });
      band(p, 1.25, 0.8, Rm, 0);
      for (const c of L.checkpoints) disc(c.x, c.z, 2.0, 0.8, Bm, 0);
      for (const rm of L.rooms) if (rm.kind === 'side') {   // a rug in every treasure room
        const a = Math.max(0.01, rm.hw - rm.hh);
        band([{ x: rm.x - a, z: rm.z + 0.3 }, { x: rm.x + a, z: rm.z + 0.3 }], rm.hh - 1.9, 0.8, Bm, 0);
      }
      for (const rm of L.rooms) {   // a round medallion rug in the bigger halls (over the runner)
        if (rm.kind !== 'main' || rm.hw < 7 || rm.hh < 5 || L.checkpoints.some(c => inRoom(rm, c.x, c.z, -2))) continue;
        disc(rm.x, rm.z, Math.min(rm.hw, rm.hh) - 2.4, 0.8, Bm, 0);
      }
      if (L.crystalSpot) disc(L.crystalSpot.x, L.crystalSpot.z, 3.3, 0.8, Bm, 0);
      if (L.boss) disc(L.boss.x, L.boss.z + 3.2, 3.6, 0.8, Bm, 0);
    }
    if (L.theme === 'volcano') {
      band(L.path, 1.2, 1.5, Rm, 0.5);
      for (const l of L.links) if (!l.main) band(curvePts(l), 0.8, 1.2, Rm, 0.35);
      for (const c of L.checkpoints) disc(c.x, c.z, 2.1, 1.0, Bm, 0.45);
      if (L.exit) disc(L.exit.x, L.exit.z + 0.6, 2.6, 1.1, Bm, 0.45);
      for (const b of (L._volc && L._volc.bridges) || []) for (let i = 1; i < b.pts.length; i++) {   // paved bridge decks, wall to wall
        const p0 = b.pts[i - 1], p1 = b.pts[i];
        band([p0, p1], Math.max(p0.e1, p0.e2, p1.e1, p1.e2) + 0.25, 0.6, Bm, 0.12);
      }
      const ar = L._volc && L._volc.arena;
      if (ar) disc(ar.x, ar.z, 3.3, 0.9, Bm, 0.35);   // the arena island: a round paved dais in the middle where the boss waits
      if (ar && L.exit) band([{ x: ar.x, z: ar.z }, { x: L.exit.x, z: L.exit.z + 0.6 }], 1.35, 0.9, Bm, 0.3);   // …and a paved walk from it to the portal
    }
    const D = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) { D[k * 4] = Rm[k] * 255; D[k * 4 + 1] = g[k] * 255; D[k * 4 + 2] = Bm[k] * 255; D[k * 4 + 3] = a[k] * 255; }
    const t = new THREE.DataTexture(D, MW, MH, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    L._mask = { data: D, W: MW, H: MH };
    return t;
  }
  function buildFloor(L, B) {
    const mask = buildMask(L);
    B.dispose.push(mask);
    const m = floorMat(L.theme);
    m.userData.u.tMask.value = mask; m.userData.u.uMaskInv.value.set(1 / L.W, 1 / L.H);
    const fg = new THREE.PlaneGeometry(L.W + 28, L.H + 28);
    fg.rotateX(-Math.PI / 2); fg.translate(L.W / 2, 0, L.H / 2);
    const floor = new THREE.Mesh(fg, m);
    floor.receiveShadow = true; floor.name = 'floor';
    B.g.add(floor);
  }
  // Baked glow pools: soft coloured discs accumulated into a small RGB texture (2 px/m) the floor adds as light
  const GPX = 2, GLOW_K = 3;
  let BLACK = null;
  function blackTex() {
    if (!BLACK) { BLACK = keep(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)); BLACK.needsUpdate = true; }
    return BLACK;
  }
  function glowAt(B, x, z, r, col, k, sx = 1, sz = 1) { B.glows.push({ x, z, r, c: col && col.isColor ? col : new THREE.Color(col), k, sx, sz }); }
  function buildGlowTex(L, B) {
    const m = R.mat['floor-' + L.theme];
    if (!m) return;
    const styled = L.rooms.filter(r => r.style === 0), V = L._volc;
    if (!B.glows.length && !styled.length && !V) { m.userData.u.tGlow.value = blackTex(); return; }
    const gp = V ? V.P : GPX, GW = L.W * gp, GH = L.H * gp, acc = new Float32Array(GW * GH * 3);   // volcano: 4 px/m (alpha carries the lava)
    for (const g of B.glows) {
      const rx = g.r * g.sx, rz = g.r * g.sz;
      const x0 = Math.max(0, Math.floor((g.x - rx) * gp)), x1 = Math.min(GW - 1, Math.ceil((g.x + rx) * gp));
      const y0 = Math.max(0, Math.floor((g.z - rz) * gp)), y1 = Math.min(GH - 1, Math.ceil((g.z + rz) * gp));
      const cr = g.c.r * g.k, cg = g.c.g * g.k, cb = g.c.b * g.k;
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const dx = ((px + 0.5) / gp - g.x) / rx, dz = ((py + 0.5) / gp - g.z) / rz, d2 = dx * dx + dz * dz;
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2), o = (py * GW + px) * 3;
        acc[o] += cr * f; acc[o + 1] += cg * f; acc[o + 2] += cb * f;
      }
    }
    if (V) {   // the lava's warm light on the floor next to it: a soft orange band along every shore
      let bl = boxBlur(V.lava, GW, GH, 4); bl = boxBlur(bl, GW, GH, 3);
      const c = lin(0xff8a3c), k = 0.4;
      for (let i = 0, n = GW * GH; i < n; i++) { const f = bl[i] * k; acc[i * 3] += c.r * f; acc[i * 3 + 1] += c.g * f; acc[i * 3 + 2] += c.b * f; }
    }
    const D = new Uint8Array(GW * GH * 4), sc = 255 / GLOW_K;
    for (let i = 0, n = GW * GH; i < n; i++) {
      D[i * 4] = Math.min(255, acc[i * 3] * sc); D[i * 4 + 1] = Math.min(255, acc[i * 3 + 1] * sc); D[i * 4 + 2] = Math.min(255, acc[i * 3 + 2] * sc);
      D[i * 4 + 3] = V ? 255 - Math.round(clamp(V.lava[i], 0, 1) * 255) : 255;
    }
    for (const rm of styled) {   // alpha = room style (rectangular castle rooms, reaching a little under the walls)
      const x0 = Math.max(0, Math.floor((rm.x - rm.hw - 0.25) * gp)), x1 = Math.min(GW - 1, Math.ceil((rm.x + rm.hw + 0.25) * gp) - 1);
      const y0 = Math.max(0, Math.floor((rm.z - rm.hh - 0.25) * gp)), y1 = Math.min(GH - 1, Math.ceil((rm.z + rm.hh + 0.25) * gp) - 1);
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) D[(py * GW + px) * 4 + 3] = 0;
    }
    const t = new THREE.DataTexture(D, GW, GH, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    B.dispose.push(t);
    m.userData.u.tGlow.value = t;
  }
  function floorMat(theme) {   // one kept material per theme (shared program): zone changes never recompile it
    const key = 'floor-' + theme;
    if (R.mat[key]) return R.mat[key];
    const th = FLOOR[theme];
    const A = surf(th.a), Bt = surf(th.b), C = surf(th.c), noise = texOK() && TEX.noise ? TEX.noise : surf('grass').map;
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    const oc = lin(th.out);
    const U = m.userData.u = {
        tMask: { value: null }, tNoise: { value: noise }, tA: { value: A.map }, tAn: { value: A.normalMap }, tB: { value: Bt.map }, tBn: { value: Bt.normalMap },
        tC: { value: C.map }, tCn: { value: C.normalMap },
        uSc: { value: new THREE.Vector4(1 / tM(th.a), 1 / tM(th.b), 1 / (tM(th.c) * (th.cScale || 1)), th.anti && LV_HQ ? 1 : 0) }, uMaskInv: { value: new THREE.Vector2(1, 1) },
        uTintA: { value: lin(th.tA) }, uTintB: { value: lin(th.tB) }, uTintC: { value: lin(th.tC) }, uRough: { value: new THREE.Vector3(...th.rough) },
        uTintA2: { value: lin(th.tA2 ?? th.tA) }, uTintC2: { value: lin(th.tC2 ?? th.tC) },
        uMode: { value: new THREE.Vector4(th.crispB, th.crispC, th.ao, th.border) }, uOut: { value: new THREE.Vector4(oc.r, oc.g, oc.b, th.outAmt) },
        uTrim: { value: lin(0xffcf5a, 0.9) }, uMacro: { value: lin(th.macro) }, uLumC: { value: th.lumC || 0 },
        tGlow: { value: blackTex() }, uTime: TIME.u, uSpeck: { value: th.speck ? lin(th.speck[0], th.speck[1]) : new THREE.Color(0, 0, 0) },
        // lava (volcano): TEX.lava scrolled + wobbled; tGlow.a = 1 - lava there. x on · y 1/tile · z shore rim · w emissive gain
        tLava: { value: th.lava ? surf('lava').map : blackTex() },
        uLava: { value: new THREE.Vector4(th.lava ? 1 : 0, 1 / (th.lava ? tM('lava') : 6), 0.55, 1) },
        uLavaT: { value: th.lava && !(texOK() && TEX.lava) ? lin(0xff8a30) : new THREE.Color(1, 1, 1) },
    };
    lvShade(m, {
      key: 'floor',
      uniforms: U,
      vDecl: 'varying vec3 vLvW;',
      vBegin: 'vLvW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      fDecl: `uniform sampler2D tMask, tNoise, tA, tAn, tB, tBn, tC, tCn, tGlow, tLava; uniform vec4 uSc, uMode, uOut, uLava; uniform vec2 uMaskInv;
        uniform vec3 uTintA, uTintB, uTintC, uTintA2, uTintC2, uRough, uTrim, uMacro, uSpeck, uLavaT; uniform float uLumC, uTime; varying vec3 vLvW;
        ${GLSL_NOISE}
        float lvHB(float h1, float h2, float t) {   // height-aware blend weight of layer 2
          t = clamp(t, 0.0, 1.0);
          float a = h1 + (1.0 - t) * 1.5, b = h2 + t * 1.5, m = max(a, b) - 0.22;
          float wa = max(a - m, 0.0), wb = max(b - m, 0.0);
          return wb / (wa + wb + 1e-4);
        }`,
      fMap: `vec2 lvXZ = vLvW.xz;
        vec4 lvM = texture2D(tMask, lvXZ * uMaskInv);
        vec4 lvGs = texture2D(tGlow, lvXZ * uMaskInv);   // rgb: baked light pools · a: room style (castle: 0 = sandstone + red rugs)
        vec4 lvN = texture2D(tNoise, lvXZ * 0.027);      // r: brightness · g: macro tint, rug-edge noise · b: anti-tiling, path-edge noise
        vec2 lvU = vec2(lvXZ.x, -lvXZ.y);
        vec2 uA = lvU * uSc.x, uB = lvU * uSc.y, uC = lvU * uSc.z;
        vec4 cA = texture2D(tA, uA), nA = texture2D(tAn, uA);
        vec3 nAu = nA.xyz * 2.0 - 1.0;
        if (uSc.w > 0.5) {   // a second rotated, rescaled sample hides the tiling
          vec2 uA2 = mat2(0.8, 0.6, -0.6, 0.8) * lvU * uSc.x * 0.61 + vec2(0.37, 0.71);
          vec4 cA2 = texture2D(tA, uA2), nA2 = texture2D(tAn, uA2);
          vec3 n2 = nA2.xyz * 2.0 - 1.0; n2.xy = vec2(0.8 * n2.x + 0.6 * n2.y, -0.6 * n2.x + 0.8 * n2.y);
          float k2 = smoothstep(0.32, 0.68, lvN.b);
          cA = mix(cA, cA2, k2); nAu = mix(nAu, n2, k2); nA.a = mix(nA.a, nA2.a, k2);
        }
        vec4 cB = texture2D(tB, uB), nB = texture2D(tBn, uB), cC = texture2D(tC, uC), nC = texture2D(tCn, uC);
        float fwB = fwidth(lvM.r) * 0.7 + 0.004, fwC = fwidth(lvM.b) * 0.7 + 0.004;
        float wB = uMode.x > 0.5 ? smoothstep(0.5 - fwB, 0.5 + fwB, lvM.r) : lvHB(nA.a, nB.a, lvM.r + (lvN.b - 0.5) * 0.3);
        float wC = uMode.y > 0.5 ? smoothstep(0.5 - fwC, 0.5 + fwC, lvM.b) : lvHB(mix(nA.a, nB.a, wB), nC.a, lvM.b + (lvN.g - 0.5) * 0.3);
        vec3 lvCol = mix(cA.rgb * mix(uTintA2, uTintA, lvGs.a), cB.rgb * uTintB, wB);
        vec3 cCc = uLumC > 0.5 ? vec3(mix(0.42, dot(cC.rgb, vec3(0.5, 0.35, 0.15)) * 2.4, uLumC - 0.5)) : cC.rgb;   // rugs / cave moss: recoloured from the texture's luminance (uLumC-0.5 = contrast)
        lvCol = mix(lvCol, cCc * mix(uTintC2, uTintC, lvGs.a), wC);
        float lvTrim = 0.0;
        if (uMode.x > 0.5) lvTrim += (smoothstep(0.5 - fwB, 0.5 + fwB, lvM.r) - smoothstep(0.64 - fwB, 0.64 + fwB, lvM.r)) * (1.0 - smoothstep(0.5 - fwC, 0.5 + fwC, lvM.b));
        if (uMode.y > 0.5) lvTrim += smoothstep(0.5 - fwC, 0.5 + fwC, lvM.b) - smoothstep(0.64 - fwC, 0.64 + fwC, lvM.b);
        lvTrim = clamp(lvTrim, 0.0, 1.0);
        lvCol = mix(lvCol, uTrim * (0.75 + 0.5 * cA.r), lvTrim);
        lvCol *= mix(0.8, 1.12, lvN.r) * mix(vec3(1.0), uMacro, smoothstep(0.42, 0.78, lvN.g) * 0.6 * (1.0 - wB) * (1.0 - wC));
        float lvAOv = 1.0 - smoothstep(0.02, 0.55, lvM.g) * uMode.z;
        lvCol *= mix(1.0, lvAOv, 0.85);
        if (uMode.w > 0.0) {   // castle: darker inlaid border along the walls with a thin gold line
          float fg = fwidth(lvM.g) * 0.7 + 0.003;
          float bd = smoothstep(0.1 - fg, 0.1 + fg, lvM.g);
          lvCol *= mix(1.0, 0.7, bd * uMode.w * (1.0 - wB));
          float ln = (bd - smoothstep(0.13 - fg, 0.13 + fg, lvM.g)) * (1.0 - wB);
          lvCol = mix(lvCol, uTrim, ln * 0.85); lvTrim = max(lvTrim, ln);
        }
        lvCol = mix(lvCol, uOut.rgb, smoothstep(0.25, 0.95, lvM.a) * uOut.a);
        float lvLv = 0.0; vec3 lvLvE = vec3(0.0);
        if (uLava.x > 0.5) {   // volcano: molten lava wherever the baked lava mask says so (never on walkable floor)
          lvLv = 1.0 - lvGs.a;
          if (lvLv > 0.002) {
            // TEX.lava (brightness = heat) in two drifting layers wobbled by the noise; brightness² → emission: the molten rivers
            // glow and bloom, the crust plates stay warm red. Lava is (almost) unlit.
            float lt = uTime;
            vec4 lz = texture2D(tNoise, lvXZ * 0.045 + vec2(lt * 0.006, lt * 0.004));
            vec2 lu = lvU * uLava.y + (lz.rg - 0.5) * 0.16 + vec2(0.0, lt * 0.035);
            vec3 l1 = texture2D(tLava, lu).rgb, l2 = texture2D(tLava, mat2(0.8, 0.6, -0.6, 0.8) * lu * 0.71 + vec2(0.31, 0.57) - vec2(lt * 0.018, 0.0)).rgb;
            vec3 lc = max(l1, l2 * 0.92) * uLavaT;
            float lh = dot(lc, vec3(0.45, 0.45, 0.1));
            float lsh = smoothstep(0.0, 0.22, lvLv) * (1.0 - smoothstep(0.3, 0.85, lvLv));                  // hot rim along the shore
            lvLvE = (lc * (0.62 + 1.7 * lh * lh) * (0.94 + 0.12 * sin(lt * 1.3 + lz.b * 6.0)) + vec3(1.0, 0.42, 0.08) * lsh * uLava.z) * uLava.w;
            lvCol = mix(lvCol, lc * 0.06, lvLv);
          }
        }
        diffuseColor.rgb = lvCol;
        float lvSp = 0.0;
        if (uSpeck.r + uSpeck.g + uSpeck.b > 0.0) {   // bioluminescent specks in the moss (cave)
          vec2 sp = lvXZ * 2.7, si = floor(sp); float h = lvH21(si);
          vec2 so = fract(sp) - 0.5 - (vec2(lvH21(si + 7.1), lvH21(si + 3.3)) - 0.5) * 0.55;
          lvSp = smoothstep(0.1, 0.02, length(so)) * step(0.55, h) * wC * (1.0 - smoothstep(0.25, 0.8, lvM.a)) * (0.55 + 0.45 * sin(uTime * 1.7 + h * 40.0));
        }`,
      fNormal: `vec3 lvNt = normalize(mix(mix(nAu, nB.xyz * 2.0 - 1.0, wB), nC.xyz * 2.0 - 1.0, wC));
        lvNt = normalize(mix(lvNt, vec3(0.0, 0.0, 1.0), lvLv));
        vec3 lvWn = normalize(vec3(lvNt.x, lvNt.z, -lvNt.y));
        normal = normalize((viewMatrix * vec4(lvWn, 0.0)).xyz);
        roughnessFactor = mix(mix(mix(mix(uRough.x, uRough.y, wB), uRough.z, wC), 0.3, lvTrim), 0.8, lvLv);
        metalnessFactor = lvTrim * 0.9;`,
      fAO: 'reflectedLight.indirectDiffuse *= lvAOv; reflectedLight.indirectSpecular *= lvAOv * lvAOv;',
      // baked coloured light pools (crystals, torches, lamps, stained glass) with a gentle shimmer
      fOut: `vec3 lvGl = lvGs.rgb * ${GLOW_K.toFixed(1)};
        outgoingLight += lvGl * (diffuseColor.rgb + 0.07) * (0.86 + 0.14 * sin(uTime * 1.9 + vLvW.x * 0.41 + vLvW.z * 0.53)) + uSpeck * lvSp + lvLvE * lvLv;`,
    });
    return (R.mat[key] = keep(m));
  }

  // Minimap: 1 px per cell, floor coloured (path / plaza tinted), walls transparent
  function buildMapCanvas(L) {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = L.W; c.height = L.H;
    const g = c.getContext('2d'), id = g.createImageData(L.W, L.H), M = L._mask;
    const pal = { forest: [[112, 178, 86], [206, 164, 110], [196, 190, 176]], cave: [[98, 112, 150], [176, 160, 132], [90, 170, 160]], castle: [[168, 156, 196], [196, 52, 64], [140, 100, 200]],
      volcano: [[132, 112, 104], [214, 186, 156], [186, 160, 140]] }[L.theme] || [[150, 150, 150], [200, 180, 150], [180, 180, 180]];
    for (let j = 0; j < L.H; j++) for (let i = 0; i < L.W; i++) {
      if (!L.grid[j * L.W + i]) continue;
      const k = ((j * MPX + 2) * M.W + i * MPX + 2) * 4, pr = M.data[k] / 255, pb = M.data[k + 2] / 255, ao = M.data[k + 1] / 255;
      const w1 = pr > 0.5 ? 1 : 0, w2 = pb > 0.5 && L.theme !== 'cave' ? 1 : 0;
      const o = (j * L.W + i) * 4, sh = 1 - ao * 0.35;
      for (let c3 = 0; c3 < 3; c3++) id.data[o + c3] = (w2 ? pal[2][c3] : w1 ? pal[1][c3] : pal[0][c3]) * sh;
      id.data[o + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    L.mapCanvas = c;
  }

  // ── Theme lighting ──
  const THEME = {
    forest: { moss: [0x5a9a3a, 0.75], rim: [0xfff6e0, 0.1], fog: [0xb4dcc0, 36, 84], hemiSky: 0xe2f2ff, hemiGround: 0x56703a, hemi: 0.95, sunColor: 0xfff0d8, sun: 2.6, sunOffset: [-12, 26, 14],
      env: [0x9fd0ff, 0xf6ecd6, 0x4a6634, 1.0], bloom: 0.5, exposure: 1.0, fezaLight: 0, fezaLightColor: 0xffd9a0, sat: 1.04 },
    cave: { moss: [0x3a9a90, 0.35], rim: [0xb8c8ff, 0.14], fog: [0x0b1020, 15, 42], hemiSky: 0x6f8cd0, hemiGround: 0x1e1828, hemi: 0.34, sunColor: 0xa8c0ff, sun: 0.6, sunOffset: [-10, 26, 12],
      env: [0x3a4a7a, 0x252a44, 0x10101a, 0.45], bloom: 0.9, exposure: 1.15, fezaLight: 6, fezaLightColor: 0xffd9a0, sat: 1.12 },
    castle: { moss: [0x6a8a5a, 0], rim: [0xe0d0ff, 0.08], fog: [0x2a2046, 26, 64], hemiSky: 0xc4b2ff, hemiGround: 0x3a2848, hemi: 0.62, sunColor: 0xffd8bc, sun: 1.6, sunOffset: [-11, 26, 13],
      env: [0x7a68b8, 0xe0c0d8, 0x2a2038, 0.75], bloom: 0.72, exposure: 1.05, fezaLight: 1.1, fezaLightColor: 0xffc890, sat: 1.1 },
    // bright, warm and cheerful: a peach sky-fog, a strong warm sun, orange bounce light from the lava
    volcano: { moss: [0xc8b8a8, 0], rim: [0xffb888, 0.15], fog: [0xf2ac84, 30, 78], hemiSky: 0xfff0e6, hemiGround: 0x6a3a2c, hemi: 0.85, sunColor: 0xfff2e4, sun: 2.3, sunOffset: [-12, 26, 14],
      env: [0xffe0cc, 0xffbc98, 0x4a2a20, 0.85], bloom: 0.55, exposure: 1.0, fezaLight: 0.35, fezaLightColor: 0xffc890, sat: 1.06 },
  };

  // ── Instancing (chunked ~16 m for frustum culling) and merged static decor per chunk ──
  const WHITE = new THREE.Color(1, 1, 1);
  const KIND = {};   // kind → { geo(), mat: key, shadow: true|false|'near', recv }
  function kgeo(k) { return R.geo['k_' + k] || (R.geo['k_' + k] = keep(KIND[k].geo())); }
  // inst / dec return a handle { arr, item } so a build-time prop can be taken out again (see fixReach)
  function inst(B, kind, m, col) {
    const x = m.elements[12], z = m.elements[14], arr = B.inst[kind] || (B.inst[kind] = []), item = { x, z, m, c: col || null };
    arr.push(item);
    return { arr, item };
  }
  function dec(B, matKey, geo, m, col) {
    const key = matKey + '|' + Math.floor(m.elements[12] / CHUNK) + '|' + Math.floor(m.elements[14] / CHUNK);
    const arr = B.dec[key] || (B.dec[key] = []), item = { geo, m, c: col || null };
    arr.push(item);
    return { arr, item };
  }
  // a collision circle whose visuals (inst / dec handles) can be removed again if it turns out to cut a route
  function propSolid(L, x, z, r, tag, vis) {
    const s = { x, z, r, alive: true, tag, vis: vis || [], built: true };
    L.solids.push(s);
    return s;
  }
  function finishInst(L, B) {
    const near = (x0, z0, sz) => satCount(L, x0 - 6, z0 - 6, x0 + sz + 6, z0 + sz + 6) > 0;
    for (const kind in B.inst) {
      const K = KIND[kind], list = B.inst[kind], chunks = new Map();
      for (const it of list) { const key = Math.floor(it.x / CHUNK) * 4096 + Math.floor(it.z / CHUNK); let a = chunks.get(key); if (!a) chunks.set(key, a = []); a.push(it); }
      const geo = kgeo(kind), mat = R.mat[K.mat];
      for (const [key, a] of chunks) {
        const im = new THREE.InstancedMesh(geo, mat, a.length), anyCol = a.some(it => it.c);
        for (let i = 0; i < a.length; i++) { im.setMatrixAt(i, a[i].m); if (anyCol) im.setColorAt(i, a[i].c || WHITE); }
        const cx = Math.floor(key / 4096), cz = key - cx * 4096;
        const cast = K.shadow === true || (K.shadow === 'near' && near(cx * CHUNK, cz * CHUNK, CHUNK));
        if (K.proxy) {   // cheap stand-ins cast the shadow instead of the detailed mesh
          im.castShadow = false;
          if (cast) for (const it of a) {
            const pk = Math.floor(it.x / 32) * 4096 + Math.floor(it.z / 32), P = B.prox[pk] || (B.prox[pk] = { c: [], t: [] }), c = K.proxy.c, t = K.proxy.t;
            P.c.push(new THREE.Matrix4().multiplyMatrices(it.m, _m.compose(_v.set(0, c[0], 0), _q.identity(), _s.set(c[1], c[2], c[1]))));
            if (t) P.t.push(new THREE.Matrix4().multiplyMatrices(it.m, _m.compose(_v.set(0, 0, 0), _q.identity(), _s.set(t[1], t[0], t[1]))));
          }
        } else im.castShadow = cast;
        im.receiveShadow = K.recv !== false;
        im.computeBoundingSphere();
        im.name = kind;
        B.g.add(im);
      }
    }
    const pm = R.mat.proxy || (R.mat.proxy = keep(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })));
    const pc = R.geo.proxC || (R.geo.proxC = keep(new THREE.IcosahedronGeometry(1, 0)));
    const pt = R.geo.proxT || (R.geo.proxT = keep(new THREE.CylinderGeometry(0.7, 1, 1, 5, 1, true).translate(0, 0.5, 0)));
    for (const k in B.prox) for (const [g, list] of [[pc, B.prox[k].c], [pt, B.prox[k].t]]) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(g, pm, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = true; im.receiveShadow = false; im.computeBoundingSphere(); im.name = 'shadow-proxy';
      B.g.add(im);
    }
  }
  const DEC_CAST = { prop: 1, stone: 1, plaster: 1, roof: 1, brick: 1, rock: 1, shiny: 1, gold: 1, coin: 1, soil: 1 };
  function finishDecor(L, B) {
    for (const key in B.dec) {
      const mk = key.split('|')[0], mesh = new THREE.Mesh(mergeList(B.dec[key]), R.mat[mk]);
      mesh.receiveShadow = mk !== 'glow' && mk !== 'window';
      mesh.castShadow = !!DEC_CAST[mk];
      mesh.name = 'decor-' + mk;
      B.g.add(mesh);
      if (mk === 'decor') { const bs = mesh.geometry.boundingSphere; B.far.push({ o: mesh, x: bs.center.x, z: bs.center.z, r: bs.radius }); }
    }
  }
  // Would a volume (radius cr, heights yb..yt) standing at (x,z) hide any floor from the gameplay camera?
  // Floor cells (count) that an object standing ON the floor (radius cr, height yt) hides north of its own footprint
  function hiddenBehind(L, x, z, cr, yt) {
    return satCount(L, x - cr * 0.7, z - cr - Math.max(0, yt - 0.5) * LV_PK, x + cr * 0.7, z - cr - 0.1);
  }
  function hides(L, x, z, cr, yb, yt, sh = 0.3) {
    const k = LV_PK, y0 = 0.5;
    const z0 = z - cr - Math.max(0, yt - y0) * k + sh, z1 = z + cr - Math.max(0, yb - y0) * k - sh;
    if (z1 <= z0) return false;
    return satCount(L, x - cr + sh, z0, x + cr - sh, z1) > 0;
  }

  // How far a prop stands on the camera side of the walkable floor: metres north from (x, z) to floor inside a cone that widens
  // northward (99: none within 8 m). southCap: the highest top (m) allowed there — `near` within 2 m, `mid` within 5 m, further
  // out the top must stay ≥ 3 m (on screen) south of the floor edge; props with no floor to their north are free.
  function southGap(L, x, z) {
    for (let j = Math.floor(z) - 1; j >= Math.max(0, Math.floor(z) - 8); j--) {
      const dz = Math.max(0, z - (j + 1));
      if (satCount(L, x - 0.9 - dz * 0.45, j, x + 0.9 + dz * 0.45, j + 1) > 0) return dz;
    }
    return 99;
  }
  const southCap = (g, near, mid) => g <= 2 ? near : g <= 5 ? mid : g < 99 ? Math.max(mid, (g - 3) / LV_PK) : 1e9;

  // ── Prototype geometries ──
  const leafBlob = i => R.geo['leaf' + i] || (R.geo['leaf' + i] = lumpy(2, 0.17, 101 + i * 17, { uv: 10 }));
  const leafBlob1 = i => R.geo['leaf1' + i] || (R.geo['leaf1' + i] = lumpy(1, 0.19, 151 + i * 19, { uv: 10 }));
  const leafBlobLo = i => R.geo['leafL' + i] || (R.geo['leafL' + i] = lumpy(1, 0.17, 131 + i * 13, { uv: 10, flat: -0.35 }));   // bushes: detail 1 (80 tris)
  const leafRamp = (y0, y1) => (x, y, z) => {
    const t = clamp((y - y0) / (y1 - y0), 0, 1), v = 0.42 + 0.72 * t, w = 0.06 * Math.sin(x * 3.1 + z * 2.3);
    return new THREE.Color(v * (1.02 + t * 0.06) + w, v + w, v * (0.9 - t * 0.08) + w);
  };
  const BARK = 0xd8c6b2;
  function canopy(k, blobs, y0, y1, lo) {
    blobs.forEach((c, i) => k.add(lo ? leafBlobLo(i % 3) : c[3] >= 0.7 ? leafBlob(i % 3) : leafBlob1(i % 3), leafRamp(y0, y1), [c[0], c[1], c[2]], [0.3 * i, i * 1.3, 0.2 * i], [c[3], c[3] * (c[4] ?? 0.86), c[3]]));
  }
  function roots(k, r, n, col, y = 0.35) {
    for (let a = 0; a < n; a++) { const an = a * TAU / n + 0.4; k.seg([Math.cos(an) * r * 0.3, y, Math.sin(an) * r * 0.3], [Math.cos(an) * r * 1.7, -0.06, Math.sin(an) * r * 1.7], r * 0.36, col, r * 0.12, 6); }
  }
  const SPEC = {   // canopy radius / bottom / top at scale 1 (for the occlusion test)
    oak: { cr: 2.25, yb: 1.9, yt: 5.3 }, blossom: { cr: 2.5, yb: 1.9, yt: 4.3 }, pine: { cr: 1.75, yb: 0.5, yt: 5.1 },
    lolli: { cr: 1.55, yb: 1.7, yt: 4.8 }, bush: { cr: 0.95, yb: 0, yt: 1.05 },
  };
  KIND.oak = { mat: 'foliage', shadow: 'near', proxy: { c: [3.5, 1.9, 1.3], t: [2.4, 0.3] }, geo() {
    const k = new Kit();
    k.seg([0, -0.1, 0], [0.06, 2.4, 0.03], 0.34, BARK, 0.21, 12); roots(k, 0.34, 5, BARK);
    k.seg([0.05, 1.8, 0], [0.85, 2.75, 0.25], 0.13, BARK, 0.07, 8);
    k.seg([0.02, 2.0, 0], [-0.75, 2.9, -0.3], 0.12, BARK, 0.06, 8);
    canopy(k, [[0, 3.55, 0, 1.5], [1.0, 3.15, 0.35, 1.1], [-0.95, 3.2, -0.25, 1.12], [0.25, 3.1, 1.0, 1.0], [-0.3, 3.15, -0.95, 1.02], [0.15, 4.3, 0.1, 1.02]], 2.0, 5.2);
    return k.build();
  } };
  KIND.blossom = { mat: 'foliage', shadow: 'near', proxy: { c: [3.1, 2.1, 0.9], t: [2.0, 0.26] }, geo() {
    const k = new Kit(), bc = 0xb8a090;
    k.seg([0, -0.1, 0], [0.28, 1.25, 0.05], 0.3, bc, 0.22, 10); roots(k, 0.3, 4, bc);
    k.seg([0.28, 1.2, 0.05], [0.05, 2.0, -0.1], 0.22, bc, 0.16, 10);
    k.seg([0.05, 1.9, -0.1], [1.1, 2.7, 0.3], 0.12, bc, 0.06, 7); k.seg([0.05, 1.9, -0.1], [-1.05, 2.75, 0.1], 0.12, bc, 0.06, 7);
    k.seg([0.1, 2.0, 0], [0.2, 2.85, -0.95], 0.1, bc, 0.05, 7); k.seg([0.1, 2.0, 0], [-0.2, 2.8, 1.0], 0.1, bc, 0.05, 7);
    canopy(k, [[1.2, 3.0, 0.35, 1.0, 0.75], [-1.15, 3.05, 0.1, 1.02, 0.75], [0.25, 2.95, -1.1, 0.95, 0.75], [-0.2, 2.95, 1.1, 0.95, 0.75], [0, 3.45, 0, 1.2, 0.8], [0.8, 3.5, -0.6, 0.8, 0.8], [-0.7, 3.55, 0.6, 0.8, 0.8]], 2.3, 4.2);
    return k.build();
  } };
  KIND.pine = { mat: 'foliage', shadow: 'near', proxy: { c: [2.7, 1.35, 2.2], t: [1.3, 0.2] }, geo() {
    const k = new Kit();
    k.seg([0, -0.1, 0], [0, 1.6, 0], 0.22, BARK, 0.13, 10); roots(k, 0.22, 4, BARK, 0.25);
    const cone = i => R.geo['pc' + i] || (R.geo['pc' + i] = lumpyCone(300 + i, 18, 0.14));
    [[1.1, 1.7, 1.7], [1.95, 1.4, 1.55], [2.75, 1.1, 1.4], [3.5, 0.8, 1.25], [4.2, 0.48, 1.0]].forEach((t, i) =>
      k.add(cone(i % 3), leafRamp(0.3, 5.0), [0, t[0], 0], [0, i * 0.9, 0], [t[1], t[2], t[1]]));
    return k.build();
  } };
  KIND.lolli = { mat: 'foliage', shadow: 'near', proxy: { c: [3.35, 1.35, 1.2], t: [2.3, 0.22] }, geo() {
    const k = new Kit();
    k.seg([0, -0.1, 0], [0, 2.3, 0], 0.23, BARK, 0.16, 10); roots(k, 0.23, 4, BARK, 0.3);
    canopy(k, [[0, 3.35, 0, 1.42], [0.8, 2.95, 0.3, 0.78], [-0.72, 3.05, -0.35, 0.76], [0.2, 4.1, 0.05, 0.85]], 2.1, 4.8);
    return k.build();
  } };
  KIND.bush = { mat: 'foliage', shadow: false, geo() {
    const k = new Kit();
    canopy(k, [[0, 0.46, 0, 0.68], [0.56, 0.34, 0.18, 0.52], [-0.52, 0.36, -0.08, 0.54], [0.0, 0.33, 0.56, 0.48]], -0.1, 1.05, true);
    return k.build();
  } };
  function bushDotsGeo() {   // little five-petal blossoms dotted over some bushes (merged into the decor chunks)
    if (R.geo.bushDots) return R.geo.bushDots;
    const k = new Kit(), fl = [0xffffff, 0xffb3d9, 0xfff07a, 0xffd0e8], rnd = mulberry32(77), n = new THREE.Vector3(), q = new THREE.Quaternion(), ctr = G.octa();
    for (let i = 0; i < 22; i++) {
      const a = rnd() * TAU, e = 0.3 + rnd() * 1.0, r = 0.66;
      n.set(Math.cos(a) * Math.cos(e) * 1.2, Math.sin(e) * 0.85, Math.sin(a) * Math.cos(e) * 1.2).normalize();
      q.setFromUnitVectors(UP, n);
      const p = [Math.cos(a) * Math.cos(e) * r * 1.2, 0.42 + Math.sin(e) * r * 0.85, Math.sin(a) * Math.cos(e) * r * 1.2];
      k.push(p, q.clone());
      k.add(petalDisc(), fl[i % 4], [0, 0, 0], [0, rnd() * TAU, 0], 0.075);
      k.add(ctr, 0xffc83a, [0, 0.012, 0], 0, [0.022, 0.012, 0.022]);
      k.pop();
    }
    return (R.geo.bushDots = keep(k.build()));
  }
  function addBush(B, m, col, flowers) {
    inst(B, 'bush', m, col);
    if (flowers) dec(B, 'decor', bushDotsGeo(), m, null);
  }
  KIND.stump = { mat: 'foliage', shadow: true, geo() {
    const k = new Kit();
    k.seg([0, -0.1, 0], [0, 0.55, 0], 0.46, BARK, 0.42, 14); roots(k, 0.42, 5, BARK, 0.3);
    k.add(marked(G.cyl(1, 1, 14), 20), 0xe2c290, [0, 0.555, 0], 0, [0.4, 0.02, 0.4]);
    k.add(marked(G.torus(TAU, 0.05, 20), 20), 0xb08a5a, [0, 0.568, 0], [Math.PI / 2, 0, 0], [0.26, 0.26, 0.26]);
    k.add(marked(G.torus(TAU, 0.08, 20), 20), 0xc49c68, [0, 0.568, 0], [Math.PI / 2, 0, 0], [0.13, 0.13, 0.13]);
    return k.build();
  } };
  const rockGeo = i => R.geo['rock' + i] || (R.geo['rock' + i] = lumpy(2, 0.18 + i * 0.03, 501 + i * 31, { flat: -0.3, crag: 1.1 }));
  for (let i = 0; i < 3; i++) KIND['rock' + i] = { mat: 'rock', shadow: 'near', proxy: { c: [0.3, 0.95, 0.7] }, geo: () => { const k = new Kit(); k.add(rockGeo(i), 0xffffff); return k.build(); } };
  const rockSGeo = () => R.geo.rockS || (R.geo.rockS = lumpy(1, 0.2, 577, { flat: -0.3, crag: 1.0 }));   // small low rocks (80 tris): the cave's camera-side band
  KIND.rockS = { mat: 'rock', shadow: false, geo: () => { const k = new Kit(); k.add(rockSGeo(), 0xffffff); return k.build(); } };
  KIND.stal = { mat: 'rock', shadow: 'near', geo() {
    const k = new Kit(), c = i => R.geo['st' + i] || (R.geo['st' + i] = lumpyCone(700 + i, 10, 0.02, 0));
    k.add(c(0), 0xffffff, [0, 0.9, 0], 0, [0.42, 1.8, 0.42]); k.add(c(1), 0xe8e4f0, [0.35, 0.45, 0.12], [0, 1, 0.12], [0.22, 0.9, 0.22]);
    k.add(c(2), 0xf0ecf8, [-0.28, 0.32, -0.15], [0, 2, -0.1], [0.18, 0.64, 0.18]);
    return k.build();
  } };

  // Decor prototypes (vertex coloured, merged per chunk). uv 30 = sways in the wind.
  function petalDisc() {
    return R.geo.petal || (R.geo.petal = (() => {
      const g = new THREE.CircleGeometry(1, 10), P = g.attributes.position;   // 10 segments: tips + valleys of the 5 petals
      for (let i = 1; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), a = Math.atan2(y, x), k = 0.5 + 0.5 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.7);
        P.setXYZ(i, x * k, y * k, (x * x + y * y) * k * k * 0.28);
      }
      g.rotateX(-Math.PI / 2); g.computeVertexNormals(); markUV(g, 30);
      return keep(g);
    })());
  }
  const FLOWER_COL = [0xf4f0ea, 0xfff176, 0xff8fc8, 0x7ab0f0, 0xff6b6b, 0xb88af0, 0xffb35a];
  function flowerGeo(ci) {
    const key = 'fl' + ci;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), col = FLOWER_COL[ci], h = 0.28 + (ci % 3) * 0.05;
    k.add(marked(G.cyl(1, 1, 4, true), 30), 0x4f9a3a, [0, h / 2, 0], 0, [0.014, h, 0.014]);
    k.add(marked(G.octa(), 30), 0x5aa844, [0.05, h * 0.35, 0], [0, 0, -0.7], [0.07, 0.015, 0.03]);
    k.add(petalDisc(), col, [0, h, 0], [0.25, ci, 0.1], 0.1);
    k.add(marked(G.octa(), 30), ci === 1 ? 0xffa726 : 0xffd23f, [0, h + 0.025, 0], 0, [0.035, 0.022, 0.035]);
    return (R.geo[key] = keep(k.build()));
  }
  const bladeGeo = () => R.geo.blade || (R.geo.blade = keep(markUV(new THREE.ConeGeometry(1, 1, 3, 1, true), 30)));   // 3 tris
  function tuftGeo(v) {
    const key = 'tuft' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(900 + v), blade = bladeGeo();
    const base = new THREE.Color(0x3f8a2c), tip = new THREE.Color(v === 2 ? 0xd8e86a : 0x9ad85a);
    const n = 7 + v * 2;
    for (let i = 0; i < n; i++) {
      const h = 0.22 + rnd() * 0.28, a = rnd() * TAU, r = rnd() * 0.12;
      k.add(blade, (x, y) => base.clone().lerp(tip, clamp(y / 0.45, 0, 1)), [Math.cos(a) * r, h / 2, Math.sin(a) * r], [Math.sin(a) * 0.35, a, Math.cos(a) * 0.35], [0.028, h, 0.028]);
    }
    return (R.geo[key] = keep(k.build()));
  }
  function mushroomGeo(v) {   // 0 red, 1 brown, 2 lilac — glowing variants use capGlowGeo
    const key = 'mush' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), cap = [0xe8453c, 0xb07a4a, 0xb58cff][v], dot = G.octa();
    k.add(G.cyl(0.8, 1, 10), 0xf4ead8, [0, 0.11, 0], 0, [0.06, 0.22, 0.06]);
    k.add(G.hemi(10), cap, [0, 0.2, 0], 0, [0.17, 0.13, 0.17]);
    k.add(G.cyl(1, 1, 10), 0xf0e2c8, [0, 0.2, 0], 0, [0.16, 0.01, 0.16]);
    if (v !== 1) for (let i = 0; i < 5; i++) { const a = i * 1.3, e = 0.45 + (i % 2) * 0.35; k.add(dot, 0xffffff, [Math.cos(a) * 0.15 * Math.cos(e), 0.2 + 0.12 * Math.sin(e), Math.sin(a) * 0.15 * Math.cos(e)], 0, [0.03, 0.012, 0.03]); }
    return (R.geo[key] = keep(k.build()));
  }
  function fernGeo() {   // tall grass clump (softens the edge of the walkable area)
    if (R.geo.fern) return R.geo.fern;
    const k = new Kit(), rnd = mulberry32(31), blade = bladeGeo();
    const base = new THREE.Color(0x2f6e26), tip = new THREE.Color(0xa8d860);
    for (let i = 0; i < 16; i++) {
      const h = 0.4 + rnd() * 0.4, a = rnd() * TAU, r = rnd() * 0.18, tl = 0.2 + rnd() * 0.45;
      k.add(blade, (x, y) => base.clone().lerp(tip, clamp(y / 0.7, 0, 1)), [Math.cos(a) * r, h / 2 - 0.02, Math.sin(a) * r], [Math.sin(a) * tl, a, Math.cos(a) * tl], [0.035, h, 0.035]);
    }
    return (R.geo.fern = keep(k.build()));
  }
  function pebbleGeo(v, cave) {   // cave: light blue-grey stones (brown ones read as lumps under the blue light)
    const key = (cave ? 'pebC' : 'peb') + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(1200 + v), rg = lumpy(1, 0.22, 1300 + v, { flat: -0.3 });
    const n = v === 0 ? 1 : 3 + v;
    for (let i = 0; i < n; i++) {
      const s = v === 0 ? 0.32 : 0.06 + rnd() * 0.07, c = cave ? new THREE.Color().setHSL(0.6 + rnd() * 0.05, 0.12, 0.48 + rnd() * 0.12, THREE.SRGBColorSpace)
        : new THREE.Color().setHSL(0.07 + rnd() * 0.06, 0.12, 0.36 + rnd() * 0.16, THREE.SRGBColorSpace);
      k.add(rg, (x, y) => (y > s * 0.35 && v === 0 ? c.clone().lerp(new THREE.Color(0x6aa84a), 0.55) : c), [(rnd() - 0.5) * 0.5 * (n > 1), s * 0.25, (rnd() - 0.5) * 0.5 * (n > 1)], [rnd(), rnd() * 6, rnd()], [s * 1.2, s * 0.8, s]);
    }
    return (R.geo[key] = keep(k.build()));
  }

  // ── Forest ──
  const PAL = {
    green: [0x6cc04a, 0x5fb444, 0x7acb52, 0x57a83e, 0x86cf5a],
    autumn: [0xf2a040, 0xe8743a, 0xf4c84a, 0xd95a36],
    blossom: [0xffb8d8, 0xffa6cc, 0xffd2e6, 0xf7a0c8],
    pine: [0x3f8a45, 0x4a9a50, 0x367c42],
    lolli: [0x8fd45a, 0x7cc850, 0xa8d85a],
  };
  function treeLayer(L, B, opt) {
    const rnd = B.rnd, W = L.W, H = L.H, dF = L._dF, s1 = (L.seed & 0xffff) + 5, s2 = s1 + 9;
    const bCap = g => southCap(g, 0.85, 1.15);   // bushes: top ≤ 0.85 m within 2 m south of the floor, ≤ 1.15 m within 5 m
    const blocked = (x, z, r) => B.noTree.some(o => hyp(o.x - x, o.z - z) < o.r + r);
    const cell = (x, z) => { const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const place = (sp, x, z, s, colPal) => {
      inst(B, sp, mat4(x, 0, z, rnd() * TAU, s, s * (0.92 + rnd() * 0.16), s), lin(pick(colPal), 0.94 + rnd() * 0.12));
      if ((sp === 'blossom' || colPal === PAL.autumn) && dF[cell(x, z)] < 5 && rnd() < 0.5) opt.petals.push([x, z, s, colPal]);
    };
    // trees: dense near the play area, sparser and bigger further out
    for (let z0 = 0; z0 < H; z0 += 2.7) for (let x0 = 0; x0 < W; x0 += 2.7) {
      const x = x0 + rnd() * 2.5, z = z0 + rnd() * 2.5, c = cell(x, z);
      if (c < 0 || L.grid[c]) continue;
      const d = dF[c];
      if (d < 1.2) continue;
      const far = d > 6.5;
      if (far && rnd() < 0.55) continue;
      if (blocked(x, z, 1.6)) continue;
      const b = vnoise(x / 17, z / 17, s1), au = vnoise(x / 12, z / 12, s2) > 0.42;
      let sp = b > 0.33 ? (rnd() < 0.72 ? 'blossom' : 'lolli') : b < -0.38 ? (rnd() < 0.75 ? 'pine' : 'oak') : (rnd() < 0.55 ? 'oak' : rnd() < 0.65 ? 'lolli' : 'pine');
      let s = (0.85 + rnd() * 0.35) * (far ? 1.4 : 1);
      const tries = [[sp, s], [sp, s * 0.72], ['lolli', 0.66], ['lolli', 0.5]];
      const g = southGap(L, x, z), tCap = southCap(g, 0, 0);   // camera side: no trees within 5 m south of the floor, then graded
      let done = false;
      for (const [q, k] of tries) {
        const S = SPEC[q];
        if (S.yt * k > tCap || hides(L, x, z, S.cr * k, S.yb * k, S.yt * k)) continue;
        const pal = q === 'blossom' ? PAL.blossom : q === 'pine' ? PAL.pine : au ? PAL.autumn : q === 'lolli' ? PAL.lolli : PAL.green;
        place(q, x, z, k, pal); done = true; break;
      }
      if (!done && (d < 4 || g <= 5)) {
        const k = 0.8 + rnd() * 0.4, ky = Math.min(k, bCap(g) / 1.05);
        if (!hides(L, x, z, 0.95 * k, 0, 1.05 * ky, 0.85)) addBush(B, mat4(x, 0, z, rnd() * TAU, k, ky, k), lin(pick(PAL.green), 0.9 + rnd() * 0.15), rnd() < 0.3);
      }
    }
    // bushes hide the cell-shaped edge of the walkable area (the only thing allowed on the camera side)
    for (let z0 = 0; z0 < H; z0 += 1.2) for (let x0 = 0; x0 < W; x0 += 1.2) {
      const x = x0 + rnd() * 1.1, z = z0 + rnd() * 1.1, c = cell(x, z);
      if (c < 0 || L.grid[c]) continue;
      const d = dF[c];
      if (d < 0.5 || d > 2.5 || rnd() < (d > 1.8 ? 0.5 : 0.12)) continue;
      if (blocked(x, z, 0.8)) continue;
      let s = 0.85 + rnd() * 0.4;
      if (hides(L, x, z, 0.95 * s, 0, 1.05 * s, 0.85)) s *= 0.7;
      const sy = Math.min(s * (0.85 + rnd() * 0.3), bCap(southGap(L, x, z)) / 1.05);   // lower on the camera side (a soft hedge)
      addBush(B, mat4(x, 0, z, rnd() * TAU, s, sy, s), lin(pick(PAL.green), 0.88 + rnd() * 0.2), rnd() < 0.28);
    }
  }
  function buildForest(L, B) {
    const rnd = B.rnd, W = L.W, H = L.H, grid = L.grid, dW = L.dWall, M = L._mask;
    L._dF = chamfer(W, H, grid, 1);
    const opt = { petals: [] }, arenaPlan = forestArenaPlan(L, B);   // the arena's giant toadstools keep the trees away first
    treeLayer(L, B, opt);
    const maskAt = (x, z, ch) => { const px = clamp(Math.floor(x * MPX), 0, M.W - 1), py = clamp(Math.floor(z * MPX), 0, M.H - 1); return M.data[(py * M.W + px) * 4 + ch] / 255; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    // stumps + mossy rocks just outside the walkable edge
    for (let n = 0; n < W * H / 260; n++) {
      const x = rnd() * W, z = rnd() * H, c = Math.floor(z) * W + Math.floor(x);
      if (grid[c] || L._dF[c] < 1 || L._dF[c] > 3.2 || B.noTree.some(o => hyp(o.x - x, o.z - z) < o.r + 1)) continue;
      if (rnd() < 0.35) inst(B, 'stump', mat4(x, 0, z, rnd() * TAU, 0.7 + rnd() * 0.5));
      else inst(B, 'rock' + (n % 3), mat4(x, 0, z, rnd() * TAU, 0.5 + rnd() * 0.6, 0.4 + rnd() * 0.4, 0.5 + rnd() * 0.6), lin(0xb0a494, 0.8 + rnd() * 0.25));
    }
    // ground cover inside and along the edge
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const c = j * W + i, fl = grid[c], d = fl ? dW[c] : -L._dF[c];
      if ((!fl && d < -1.6) || B.noDec[c]) continue;
      for (let t = 0; t < 2; t++) {
        const x = i + rnd(), z = j + rnd(), pv = maskAt(x, z, 0), pl = maskAt(x, z, 2);
        const open = (1 - smooth01((pv - 0.3) * 4)) * (1 - smooth01((pl - 0.3) * 4));
        const edge = fl ? clamp(1.8 - d * 0.45, 0.25, 1) : 1;
        if (rnd() < 0.3 * open * edge) dec(B, 'decor', tuftGeo(Math.floor(rnd() * 3)), mat4(x, 0, z, rnd() * TAU, (fl && d > 2 ? 0.9 : 1.3) + rnd() * 0.7), null);
        if (fl && open > 0.9 && rnd() < 0.035) dec(B, 'decor', flowerGeo(rnd() < 0.6 ? 0 : 1), mat4(x, 0, z, rnd() * TAU, 0.62 + rnd() * 0.25), null);   // lone daisies
        if (!fl && rnd() < 0.18) dec(B, 'decor', fernGeo(), mat4(x, 0, z, rnd() * TAU, 0.8 + rnd() * 0.6), lin(0xffffff, 0.85 + rnd() * 0.3));
        if (fl && d < 2.2 && rnd() < 0.012 * open) {
          const v = Math.floor(rnd() * 3);
          if (v === 0) inst(B, 'rock' + Math.floor(rnd() * 3), mat4(x, 0.05, z, rnd() * TAU, 0.28 + rnd() * 0.2, 0.2 + rnd() * 0.15, 0.28 + rnd() * 0.2), lin(0xb0a494, 0.8 + rnd() * 0.25));
          else dec(B, 'decor', pebbleGeo(v), mat4(x, 0, z, rnd() * TAU, 1), null);
        }
        if (fl && d < 2 && rnd() < 0.008 * open) {
          const v = Math.floor(rnd() * 2) * (rnd() < 0.8 ? 0 : 1), n = 1 + Math.floor(rnd() * 3);
          for (let m = 0; m < n; m++) dec(B, 'decor', mushroomGeo(v), mat4(x + (rnd() - 0.5) * 0.6, 0, z + (rnd() - 0.5) * 0.6, rnd() * TAU, 0.7 + rnd() * 0.7), null);
        }
      }
    }
    // flower patches (+ a little blossom drifting in the breeze over some of them; no insects: Feza's rule)
    const nPatch = Math.round(L.W * L.H / 70);
    for (let n = 0; n < nPatch; n++) {
      const x = 1 + rnd() * (W - 2), z = 1 + rnd() * (H - 2), c = Math.floor(z) * W + Math.floor(x);
      const d = grid[c] ? dW[c] : -L._dF[c];
      if (d < -1.4 || maskAt(x, z, 0) > 0.35 || maskAt(x, z, 2) > 0.35 || (grid[c] && d > 3.5 && rnd() < 0.45) || B.noDec[c]) continue;
      const ci = Math.floor(rnd() * FLOWER_COL.length), mix = rnd() < 0.35, cnt = 4 + Math.floor(rnd() * 7);
      for (let m = 0; m < cnt; m++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.1, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, fi = mix ? Math.floor(rnd() * FLOWER_COL.length) : ci;
        if (B.noDec[Math.floor(pz) * W + Math.floor(px)]) continue;
        dec(B, 'decor', flowerGeo(fi), mat4(px, 0, pz, rnd() * TAU, 0.85 + rnd() * 0.5), null);
      }
      if (grid[c] && rnd() < 0.3) B.pts.norm.push({ x, y: 0.9, z, kind: 6, ph: rnd(), size: 0.34, prm: 0.7 + rnd() * 0.6, col: pick([0xffe066, 0xff9ad0, 0x9ad0ff, 0xffffff, 0xffa24a]) });
    }
    forestArenaDecor(L, B, arenaPlan);
    // falling petals under blossom trees, soft light motes floating over the paths
    for (const [x, z, s, pal] of opt.petals) for (let m = 0; m < 3; m++)
      B.pts.norm.push({ x: x + (rnd() - 0.5) * 2.4 * s, y: 3.2 * s, z: z + (rnd() - 0.5) * 2.4 * s, kind: 5, ph: rnd(), size: pal === PAL.autumn ? 0.17 : 0.13, prm: 0.1 + rnd() * 0.06, col: pick(pal || PAL.blossom) });
    for (let n = 0; n < 70; n++) {
      const x = rnd() * W, z = rnd() * H;
      if (!grid[Math.floor(z) * W + Math.floor(x)]) continue;
      B.pts.add.push({ x, y: 0.6 + rnd() * 2.2, z, kind: 1, ph: rnd(), size: 0.09 + rnd() * 0.05, prm: 0.6 + rnd() * 0.8, col: lin(0xfff2b0, 1.4) });
    }
  }

  // ── GPU-animated points: embers, motes, sparkles, portal swirl, glowing light motes, twinkles (additive) · petals, drifting blossoms, smoke (normal) ──
  const PT_VS = `uniform float uTime, uScale; uniform float uOn[16];
    attribute vec4 aData; attribute vec3 aCol; attribute float aGrp;
    varying vec3 vCol; varying float vA, vK, vF;
    void main() {
      float kind = aData.x, ph = aData.y, s = aData.z, prm = aData.w, t = uTime, a = 1.0;
      vec3 p = position; vF = 0.0;
      float on = uOn[int(aGrp + 0.5)];
      if (kind < 0.5) { float f = fract(t * prm + ph);
        p += vec3(sin(f * 6.0 + ph * 40.0) * 0.1, f * 1.1, cos(f * 5.0 + ph * 30.0) * 0.1); a = smoothstep(0.0, 0.12, f) * (1.0 - f); s *= 1.0 - f * 0.5;
      } else if (kind < 1.5) {
        p += vec3(sin(t * 0.21 * prm + ph * 6.3) * 1.3, sin(t * 0.4 * prm + ph * 3.1) * 0.35, cos(t * 0.17 * prm + ph * 4.7) * 1.3);
        a = 0.3 + 0.7 * (0.5 + 0.5 * sin(t * 1.3 + ph * 11.0));
      } else if (kind < 2.5) { float f = fract(t * prm + ph);
        p.y += f * 0.5; a = sin(f * 3.14159); s *= 0.5 + a * 0.7; vF = 1.0;
      } else if (kind < 3.5) { float f = fract(t * 0.3 + ph), an = ph * 6.2831 + t * 1.4;
        p += vec3(cos(an) * prm * (1.0 - f * 0.3), f * 3.0, sin(an) * 0.3); a = sin(f * 3.14159); vF = 1.0;
      } else if (kind < 4.5) {
        p += vec3(sin(t * 0.5 + ph * 6.3) * 1.4 + sin(t * 1.7 + ph * 9.0) * 0.25, sin(t * 0.9 + ph * 3.1) * 0.45, cos(t * 0.45 + ph * 4.7) * 1.4);
        a = smoothstep(0.2, 0.85, 0.5 + 0.5 * sin(t * 2.2 * prm + ph * 20.0));
      } else if (kind < 5.5) { float f = fract(t * prm + ph);
        p += vec3(sin(f * 9.0 + ph * 5.0) * 0.5 + f * 1.4, -position.y * f, cos(f * 7.0 + ph * 3.0) * 0.4);
        a = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.85, f); vF = f * 25.0 + ph * 6.0;
      } else if (kind < 6.5) { float an = t * 0.45 * prm + ph * 6.28;   // blossom drifting in lazy loops on the breeze, slowly turning
        p += vec3(cos(an) * 1.3 + sin(an * 2.3) * 0.3, sin(t * 0.9 + ph * 9.0) * 0.2 + sin(an * 1.7) * 0.3, sin(an) * 0.9); vF = t * 0.8 * (prm - 0.4) * sign(ph - 0.5) + ph * 6.28;
      } else if (kind > 8.5) {   // lava ember: drifts up ~3 m, glowing, fading
        float f = fract(t * prm + ph);
        p += vec3(sin(f * 5.0 + ph * 30.0) * 0.35 + f * 0.5, f * 3.2, cos(f * 4.0 + ph * 20.0) * 0.3);
        a = smoothstep(0.0, 0.08, f) * (1.0 - f) * (1.0 - f) * 1.4; s *= 1.0 - f * 0.55;
      } else if (kind > 7.5) {   // twinkle in place (sparkles on the snail-slime trails)
        a = pow(max(0.0, sin(t * 2.2 * prm + ph * 40.0)), 5.0); s *= 0.35 + 0.65 * a; vF = 1.0;
      } else { float f = fract(t * prm + ph);
        p += vec3(sin(f * 3.0 + ph * 9.0) * 0.3 + f * 0.7, f * 2.8, cos(f * 2.0 + ph * 7.0) * 0.2); s *= 0.5 + f * 1.8; a = smoothstep(0.0, 0.15, f) * (1.0 - f) * 0.5;
      }
      vCol = aCol; vA = a * on; vK = kind;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = on < 0.01 ? 0.0 : s * uScale / max(0.5, -mv.z);
    }`;
  const PT_FS = `varying vec3 vCol; varying float vA, vK, vF;
    void main() {
      vec2 c = gl_PointCoord - 0.5; c.y = -c.y;
      float d = length(c);
      if (vK > 5.5 && vK < 6.5) {   // drifting blossom: five round petals around a golden heart, turning slowly
        float r = vF; vec2 q = mat2(cos(r), sin(r), -sin(r), cos(r)) * c;
        float pa = atan(q.y, q.x), sec = floor(pa / 1.25664 + 0.5) * 1.25664;   // nearest of the 5 petal directions
        vec2 pc = q - vec2(cos(sec), sin(sec)) * 0.2;
        float pd = length(pc), petal = smoothstep(0.17, 0.14, pd), heart = smoothstep(0.1, 0.075, d);
        if (max(petal, heart) < 0.05) discard;
        vec3 col = mix(vCol, vec3(1.0), 0.28 * smoothstep(0.05, 0.16, pd));           // paler petal rims
        col *= 0.8 + 0.2 * smoothstep(0.06, 0.2, d);                                  // a soft shade at the petals' base
        vec3 hc = vCol.g > 0.5 && vCol.b < 0.3 ? vec3(1.0, 0.5, 0.16) : vec3(1.0, 0.8, 0.26);   // yellow blossoms get an orange heart
        col = mix(col, hc, heart);
        gl_FragColor = vec4(col, max(petal, heart) * vA);
      } else if (vK > 4.5 && vK < 5.5) {
        float r = vF; vec2 q = mat2(cos(r), sin(r), -sin(r), cos(r)) * c;
        float al = smoothstep(0.4, 0.28, length(q * vec2(1.0, 1.9)));
        if (al < 0.02) discard;
        gl_FragColor = vec4(vCol * (0.85 + 0.4 * (0.3 - q.y)), al * vA);
      } else if (vK > 6.5 && vK < 7.5) {
        float al = smoothstep(0.5, 0.05, d); al *= al;
        if (al * vA < 0.005) discard;
        gl_FragColor = vec4(vCol, al * vA);
      } else {
        float k = exp(-d * d * 24.0);
        if (vF > 0.5) k += max(0.0, 1.0 - abs(c.x) * 16.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 16.0 - abs(c.x) * 2.2);
        gl_FragColor = vec4(vCol * k * vA, 1.0);
      }
      #include <colorspace_fragment>
    }`;
  function finishPoints(L, B) {
    for (const mode of ['add', 'norm']) {
      const list = B.pts[mode];
      if (!list.length) continue;
      const n = list.length, pos = new Float32Array(n * 3), dat = new Float32Array(n * 4), col = new Float32Array(n * 3), grp = new Float32Array(n);
      list.forEach((p, i) => {
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        dat[i * 4] = p.kind; dat[i * 4 + 1] = p.ph; dat[i * 4 + 2] = p.size; dat[i * 4 + 3] = p.prm;
        const c = p.col && p.col.isColor ? p.col : lin(p.col ?? 0xffffff);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; grp[i] = p.grp || 0;
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aData', new THREE.BufferAttribute(dat, 4));
      g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGrp', new THREE.BufferAttribute(grp, 1));
      const mk = 'pts-' + mode, m = R.mat[mk] || (R.mat[mk] = keep(new THREE.ShaderMaterial({
        uniforms: { uTime: TIME.u, uScale: R.ptScale, uOn: R.ptOn }, vertexShader: PT_VS, fragmentShader: PT_FS,
        transparent: true, depthWrite: false, blending: mode === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
      })));
      const pts = new THREE.Points(g, m);
      pts.frustumCulled = false; pts.renderOrder = mode === 'add' ? 5 : 4; pts.name = 'pts-' + mode;
      B.g.add(pts);
    }
  }

  // ── Flames: one instanced billboard for every torch / brazier / candle ──
  const FLAME_VS = `uniform float uTime; varying vec2 vUv; varying float vPh;
    void main() {
      vUv = uv;
      vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float s = length(instanceMatrix[0].xyz);
      vPh = fract(c.x * 0.37 + c.z * 0.71) * 6.2831;
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 wp = c.xyz + right * position.x * s + vec3(0.0, position.y * s, 0.0);
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }`;
  const FLAME_FS = `uniform float uTime; varying vec2 vUv; varying float vPh;
    ${GLSL_NOISE}
    void main() {
      vec2 m = vec2((vUv.x - 0.5) * 0.8, vUv.y * 1.5 - 0.25);   // metres from the anchor (scale 1)
      float t = uTime + vPh;
      float n = lvVN(vec2(m.x * 7.0, m.y * 5.0 - t * 3.4)) * 0.6 + lvVN(vec2(m.x * 15.0 + 3.0, m.y * 10.0 - t * 5.5)) * 0.4;
      float y = m.y;
      float w = 0.13 * (1.0 - smoothstep(0.0, 0.58, y)) * smoothstep(-0.1, 0.03, y) + 0.003;
      float x = m.x + (n - 0.5) * 0.08 * smoothstep(0.0, 0.4, y) + sin(t * 2.3 + y * 8.0) * 0.015 * y;
      float d = abs(x) / w;
      float fl = smoothstep(1.0, 0.3, d + (n - 0.5) * 0.6 * smoothstep(0.03, 0.5, y)) * smoothstep(0.62, 0.3, y + n * 0.1);
      float core = smoothstep(0.6, 0.0, d) * smoothstep(0.3, 0.02, y) * smoothstep(-0.08, 0.02, y);
      vec3 col = mix(vec3(1.0, 0.22, 0.04), vec3(1.0, 0.6, 0.14), fl);
      col = mix(col, vec3(1.0, 0.93, 0.7), core);
      float glow = exp(-length((m - vec2(0.0, 0.14)) * vec2(1.0, 0.8)) * 7.0) * (0.32 + 0.05 * sin(t * 8.0));
      gl_FragColor = vec4(col * fl * 3.2 + vec3(1.0, 0.45, 0.12) * glow, 1.0);
      #include <colorspace_fragment>
    }`;
  function flameMat() {
    return R.mat.flame || (R.mat.flame = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: TIME.u }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
  }
  function addFlame(B, x, y, z, s, light) {
    B.flames.push(mat4(x, y, z, 0, s));
    const n = Math.max(2, Math.round(4 * s));
    for (let i = 0; i < n; i++) B.pts.add.push({ x: x + (B.rnd() - 0.5) * 0.15 * s, y: y + 0.25 * s, z, kind: 0, ph: B.rnd(), size: 0.07 * Math.sqrt(s), prm: 0.45 + B.rnd() * 0.4, col: lin(0xffa040, 2.6) });
    if (light) B.lights.push({ x, y: y + 0.4 * s, z: z + 0.25, col: new THREE.Color(0xff9a48), int: light, dist: 9.5, fl: 1, ph: B.rnd() * 10 });
  }
  function finishFlames(L, B) {
    if (!B.flames.length) return;
    const geo = R.geo.flameQuad || (R.geo.flameQuad = keep((() => { const g = new THREE.PlaneGeometry(0.8, 1.5); g.translate(0, 0.5, 0); return g; })()));
    const im = new THREE.InstancedMesh(geo, flameMat(), B.flames.length);
    B.flames.forEach((m, i) => im.setMatrixAt(i, m));
    im.computeBoundingSphere();
    im.boundingSphere.radius += 2;
    im.renderOrder = 6; im.name = 'flames';
    B.g.add(im);
  }

  // ── Canvas-drawn textures (banners, stained glass, rug emblem, rose window) ──
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ANISO;
    return keep(t);
  }
  function bannerTex(hue) {
    const key = 'banner' + hue;
    return R.tex[key] || (R.tex[key] = canvasTex(128, 256, (g, w, h) => {
      const base = hue === 0 ? ['#7a3fc0', '#51287f'] : ['#c83a52', '#8a2236'];
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(w / 2, h - 34); g.lineTo(0, h); g.closePath();
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, base[1]); gr.addColorStop(0.5, base[0]); gr.addColorStop(1, base[1]);
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      g.strokeStyle = '#ffd35a'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(9, 0); g.lineTo(9, h - 12); g.moveTo(w - 9, 0); g.lineTo(w - 9, h - 12); g.stroke();
      g.beginPath(); g.moveTo(6, h - 8); g.lineTo(w / 2, h - 40); g.lineTo(w - 6, h - 8); g.stroke();
      // cute crown + star emblem
      g.fillStyle = '#ffd35a';
      g.beginPath(); g.moveTo(34, 118); g.lineTo(34, 78); g.lineTo(50, 96); g.lineTo(64, 70); g.lineTo(78, 96); g.lineTo(94, 78); g.lineTo(94, 118); g.closePath(); g.fill();
      g.fillStyle = '#ff8fd8'; for (const x of [44, 64, 84]) { g.beginPath(); g.arc(x, 108, 5, 0, TAU); g.fill(); }
      g.fillStyle = '#fff3b0';
      g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k & 1 ? 9 : 21; g.lineTo(64 + Math.cos(a) * r, 162 + Math.sin(a) * r); } g.closePath(); g.fill();
      g.restore();
    }));
  }
  const GLASS = [['#ff7ad8', '#7ad8ff', '#ffd35a', '#b07aff'], ['#7affc0', '#ff9a5a', '#7ab0ff', '#ff7ad8'], ['#ffd35a', '#b07aff', '#7affc0', '#ff5a8a']];
  const GLASS_LIGHT = [[0xff70d0, 0x60c8ff], [0x60ffb0, 0xff9050], [0xffc040, 0xa060ff]];   // two main colours of each window (light pools)   // average colour of each window (for its light pool)
  function glassTex(v) {   // arched stained-glass window: colourful panes, dark lead lines, a star in the middle
    const key = 'glass' + v;
    return R.tex[key] || (R.tex[key] = canvasTex(128, 256, (g, w, h) => {
      const cols = GLASS[v], arch = () => { g.beginPath(); g.moveTo(8, h - 6); g.lineTo(8, 64); g.arc(64, 64, 56, Math.PI, 0); g.lineTo(120, h - 6); g.closePath(); };
      arch(); g.save(); g.clip();
      const rnd = mulberry32(900 + v);
      for (let y = 0; y < h; y += 34) for (let x = 0; x < w; x += 30) {
        g.fillStyle = cols[Math.floor(rnd() * 4)];
        g.beginPath(); g.moveTo(x + rnd() * 8, y + rnd() * 8); g.lineTo(x + 30 + rnd() * 8, y + rnd() * 8); g.lineTo(x + 30 + rnd() * 8, y + 34 + rnd() * 8); g.lineTo(x + rnd() * 8, y + 34 + rnd() * 8); g.closePath(); g.fill();
      }
      const gr = g.createRadialGradient(64, 60, 4, 64, 60, 60); gr.addColorStop(0, 'rgba(255,255,240,0.85)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff6c8'; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k & 1 ? 10 : 24; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
      g.closePath(); g.fill();
      g.strokeStyle = '#2a1a3a'; g.lineWidth = 4; g.lineJoin = 'round';
      for (let y = 34; y < h; y += 34) { g.beginPath(); g.moveTo(0, y + 4); g.lineTo(w, y + 2); g.stroke(); }
      for (let x = 34; x < w; x += 30) { g.beginPath(); g.moveTo(x, 110); g.lineTo(x + 2, h); g.stroke(); }
      g.beginPath(); g.arc(64, 64, 30, 0, TAU); g.stroke();
      g.restore();
      g.lineWidth = 9; g.strokeStyle = '#2a1a3a'; arch(); g.stroke();
    }));
  }
  function emblemTex() {   // round gold star rug emblem for the boss hall
    return R.tex.emblem || (R.tex.emblem = canvasTex(512, 512, (g, w) => {
      const c = w / 2;
      g.strokeStyle = '#ffd35a'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, 236, 0, TAU); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.arc(c, c, 214, 0, TAU); g.stroke();
      g.fillStyle = '#ffd35a';
      for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.beginPath(); g.arc(c + Math.cos(a) * 225, c + Math.sin(a) * 225, 6, 0, TAU); g.fill(); }
      const star = (n, r0, r1, rot, col) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, r = k & 1 ? r1 : r0; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.closePath(); g.fill(); };
      star(8, 190, 70, Math.PI / 8, 'rgba(255,211,90,0.55)');
      star(8, 150, 60, 0, '#ffd35a');
      star(5, 70, 30, -Math.PI / 2, '#ff8fd8');
      g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(c, c, 16, 0, TAU); g.fill();
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; g.fillStyle = k & 1 ? '#7ad8ff' : '#ff8fd8'; g.beginPath(); g.arc(c + Math.cos(a) * 176, c + Math.sin(a) * 176, 10, 0, TAU); g.fill(); }
    }));
  }
  function roseTex() {
    return R.tex.rose || (R.tex.rose = canvasTex(256, 256, (g, w) => {
      const c = w / 2, cols = ['#ff7ad8', '#7ad8ff', '#ffd35a', '#b07aff', '#7affc0', '#ff9a5a'];
      g.fillStyle = '#20122e'; g.beginPath(); g.arc(c, c, 126, 0, TAU); g.fill();
      for (let ring = 0; ring < 3; ring++) {
        const n = [6, 12, 12][ring], r0 = [18, 50, 88][ring], r1 = [50, 88, 120][ring];
        for (let i = 0; i < n; i++) {
          const a0 = i / n * TAU + ring * 0.26, a1 = (i + 1) / n * TAU + ring * 0.26;
          g.beginPath(); g.arc(c, c, r1 - 3, a0 + 0.03, a1 - 0.03); g.arc(c, c, r0 + 3, a1 - 0.03, a0 + 0.03, true); g.closePath();
          g.fillStyle = cols[(i + ring * 2) % cols.length]; g.fill();
        }
      }
      g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(c, c, 16, 0, TAU); g.fill();
    }));
  }

  // ── Cave: boulder walls (low on the camera side), stalagmites, glowing crystals, light motes — and the moles' and snails' home ──
  const CRYSTAL_COL = [0x5ef0ff, 0xb07aff, 0xff7ad8, 0x4affc0];
  function crystalGeo(v) {
    const key = 'cry' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(1500 + v), c = new THREE.Color(CRYSTAL_COL[v % 4]);
    const n = 4 + (v % 3);
    for (let i = 0; i < n; i++) {
      const h = (i ? 0.35 + rnd() * 0.5 : 0.95) * (1 + (v % 2) * 0.3), r = h * 0.16, a = rnd() * TAU, tl = i ? 0.3 + rnd() * 0.45 : 0.08;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * tl, rnd() * TAU, Math.sin(a) * tl));
      const col = (x, y) => c.clone().multiplyScalar(0.35 + 0.9 * clamp(y / (h * 1.1), 0, 1));
      k.push([Math.cos(a) * 0.12 * (i > 0), 0, Math.sin(a) * 0.12 * (i > 0)], q);
      k.add(G.cyl(1, 1, 6), col, [0, h * 0.4, 0], 0, [r, h * 0.8, r]);
      k.add(G.cone(6), col, [0, h * 0.8 + h * 0.12, 0], 0, [r, h * 0.24, r]);
      k.pop();
    }
    return (R.geo[key] = keep(k.build()));
  }
  function glowCapGeo(v) {
    const key = 'gcap' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), col = [0x6ae8ff, 0x9a8cff, 0x6affc0][v];
    for (let i = 0; i < 3; i++) {
      const s = [1, 0.7, 0.55][i], x = [0, 0.18, -0.14][i], z = [0, 0.1, 0.15][i];
      k.add(G.hemi(12), col, [x, 0.26 * s, z], 0, [0.16 * s, 0.11 * s, 0.16 * s]);
    }
    return (R.geo[key] = keep(k.build()));
  }
  function glowStemGeo() {
    if (R.geo.gstem) return R.geo.gstem;
    const k = new Kit();
    for (let i = 0; i < 3; i++) { const s = [1, 0.7, 0.55][i], x = [0, 0.18, -0.14][i], z = [0, 0.1, 0.15][i]; k.add(G.cyl(0.8, 1, 8), 0xdfe8f4, [x, 0.13 * s, z], 0, [0.045 * s, 0.26 * s, 0.045 * s]); }
    return (R.geo.gstem = keep(k.build()));
  }
  // ── The moles' and snails' cave: molehills, roots with moss and glowing mushrooms, moss cushions, lamp mushrooms, slime trails ──
  // Everything here is soft, round and friendly. Only the lamp mushrooms standing inside a room block (like the crystals there).
  // L.caveDecor keeps the spots (tests / debugging).
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
  function segTf(p0, p1, r) {   // Kit transform of a cylinder from p0 to p1 (radius r); fixed taper ratios keep the cylinder cache small
    _sa.set(p0[0], p0[1], p0[2]); _sb.set(p1[0], p1[1], p1[2]);
    const len = _sa.distanceTo(_sb), q = new THREE.Quaternion().setFromUnitVectors(UP, _sb.clone().sub(_sa).normalize());
    return [[(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], q, [r, len, r]];
  }
  // A molehill: the moles' front door. A crumbly heap of the cave path's sand (triplanar), a dark hole on top ringed by clods, crumbs
  // on and around it. Returns { soil, extra }: extra (decor material) = v 1 a sprout with a pink bud · v 2 the mole's tiny shovel.
  // v 3 = a small double heap.
  function moleHillData(v) {
    const key = 'moleH' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), ke = new Kit(), rnd = mulberry32(2100 + v * 7), lo = new THREE.Color(0x8a5e40), hi = new THREE.Color(0xe8bc90);
    const mound = i => R.geo['mound' + i] || (R.geo['mound' + i] = lumpy(2, 0.12, 2150 + i * 5, { flat: 0.02, crag: 0.35 }));
    const clod = R.geo.clod || (R.geo.clod = lumpy(0, 0.3, 2190, { flat: -0.35, crag: 0.8 }));   // 20 tris
    const soil = h => (x, y, z) => lo.clone().lerp(hi, clamp(y / h * 0.8 + 0.12 + Math.sin(x * 23 + z * 17) * 0.06, 0, 1));
    const addClod = (x, y, z, sz, t) => k.add(clod, lo.clone().lerp(hi, t), [x, y, z], [rnd() * 3, rnd() * 3, rnd() * 3], [sz * 1.25, sz * 0.85, sz]);
    const hills = v === 3 ? [[0.16, 0.06, 0.38, 0.3], [-0.3, -0.14, 0.28, 0.22]] : [[0, 0, 0.46, 0.4]];
    for (const [hx, hz, hr, hh] of hills) {
      const mg = mound(v % 2);
      if (!mg.boundingBox) mg.computeBoundingBox();
      k.add(mg, soil(hh), [hx, -0.02, hz], 0, [hr, hh, hr * 0.92]);
      const ty = mg.boundingBox.max.y * hh - 0.02;   // top of the heap
      k.add(G.sphere(14, 8), 0x140a04, [hx, ty - 0.012, hz], 0, [hr * 0.22, 0.03, hr * 0.2]);   // the hole
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rnd() * 0.4, d = hr * (0.25 + rnd() * 0.05); addClod(hx + Math.cos(a) * d, ty - 0.02, hz + Math.sin(a) * d * 0.9, 0.034 + rnd() * 0.02, 0.75 + rnd() * 0.25); }
      for (let i = 0; i < 5; i++) {   // crumbs on the slopes
        const a = rnd() * TAU, f = 0.42 + rnd() * 0.45, y = hh * Math.sqrt(1 - f * f) * 0.92 - 0.02;
        addClod(hx + Math.cos(a) * hr * f, y, hz + Math.sin(a) * hr * f * 0.92, 0.026 + rnd() * 0.024, 0.3 + rnd() * 0.6);
      }
    }
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + rnd() * 0.7, d = 0.55 + rnd() * 0.2, sz = 0.03 + rnd() * 0.035; addClod(Math.cos(a) * d, sz * 0.3, Math.sin(a) * d * 0.9, sz, 0.2 + rnd() * 0.6); }
    if (v === 1) {   // a little green sprout with a pink bud
      ke.add(G.cyl(0.7, 1, 6), 0x5aa83a, [-0.2, 0.3, 0.12], [0.1, 0, 0.15], [0.016, 0.16, 0.016]);
      ke.add(G.sphere(10, 6), 0x7ad05a, [-0.29, 0.36, 0.12], [0, 0, 0.6], [0.08, 0.02, 0.04]);
      ke.add(G.sphere(10, 6), 0x8ade62, [-0.13, 0.35, 0.13], [0, 0.4, -0.5], [0.07, 0.018, 0.035]);
      ke.add(G.sphere(10, 8), 0xff8fc8, [-0.215, 0.39, 0.12], 0, [0.035, 0.045, 0.035]);
    } else if (v === 2) {   // the mole's tiny shovel, stuck in the side of the heap
      ke.push([0.3, 0.1, 0.12], [0.15, 0.3, -0.5]);
      ke.add(G.cyl(1, 1, 8), 0xd09a5a, [0, 0.3, 0], 0, [0.02, 0.5, 0.02]);
      ke.add(G.cyl(1, 1, 8), 0xe8b070, [0, 0.55, 0], [0, 0, Math.PI / 2], [0.02, 0.12, 0.02]);
      ke.add(G.rbox(1), 0xb8c4dc, [0, 0.02, 0], 0, [0.12, 0.15, 0.022]);
      ke.pop();
    }
    return (R.geo[key] = { soil: keep(k.build()), extra: v === 1 || v === 2 ? keep(ke.build()) : null });
  }
  // A gnarly root coming out of the rock, arching over the floor edge and diving into the ground (local +z = into the room,
  // origin at the foot of the wall). root: plain vertex colours (decor material) with moss patches · caps: tiny glowing
  // mushrooms sitting on it (glow material)
  function rootArchData(v) {
    const key = 'rootA' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), kc = new Kit(), rnd = mulberry32(2300 + v * 13), dark = new THREE.Color(0x3e2618), light = new THREE.Color(0x8a6244);
    const moss = R.geo.mossLump || (R.geo.mossLump = lumpy(1, 0.2, 2350, { flat: -0.2 }));
    const curve = (p0, p1, p2, n, r0, r1, c0 = 0) => {   // wiggly quadratic bezier as a chain of tapered segments; returns the points
      const pts = [], ph = rnd() * 9;
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t, w = Math.sin(t * 11 + ph) * 0.05 * Math.sin(t * Math.PI);
        pts.push([p0[0] * a + p1[0] * b + p2[0] * c + w, p0[1] * a + p1[1] * b + p2[1] * c + w * 0.5, p0[2] * a + p1[2] * b + p2[2] * c]);
      }
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, col = (x, y, z) => dark.clone().lerp(light, clamp(c0 + (1 - c0) * lerp(t0, t1, 0.5) + Math.sin(x * 31 + y * 17 + z * 23) * 0.08, 0, 1));
        k.add(G.cyl(0.8, 1, 8), col, ...segTf(pts[i], pts[i + 1], lerp(r0, r1, t0)));
        if (i) k.add(G.sphere(6, 4), col, pts[i], 0, lerp(r0, r1, t0) * 1.02);   // smooth knees between the segments
      }
      return pts;
    };
    const side = v === 1 ? -1 : 1, lean = (rnd() - 0.5) * 0.3;
    const main = curve([lean, 1.3, -0.7], [lean * 0.5, 0.95, 0.35], [side * 0.15, -0.1, 1.25], 9, 0.2, 0.075);
    const br = curve(main[4], [side * -0.55, 0.45, 0.7], [side * -0.85, -0.08, 0.85], 6, 0.08, 0.035, 0.45);
    if (v === 2) curve(main[3], [side * 0.6, 0.6, 0.3], [side * 0.9, -0.08, 0.45], 6, 0.075, 0.032, 0.35);
    const mossC = new THREE.Color(0x245e4c), mossT = new THREE.Color(0x6ab88a), end = main[main.length - 1], be = br[br.length - 1];
    for (const [p, sz] of [[end, 0.24], [be, 0.17], [main[1], 0.2]]) {   // moss patches where the roots meet the ground / leave the rock
      k.add(moss, (x, y) => mossC.clone().lerp(mossT, clamp((y - p[1]) / 0.07, 0, 1)), [p[0], Math.max(0, p[1]) - 0.01, p[2]], [0, rnd() * 6, 0], [sz * 1.4, sz * 0.32, sz]);
    }
    const CAP = [0x6ae8ff, 0xff9ad8, 0xb89aff];
    for (let i = 0; i < 3; i++) {   // a little cluster of glowing mushrooms beside the root's end
      const a = rnd() * TAU, d = 0.18 + i * 0.08, sz = [0.1, 0.075, 0.06][i], px = end[0] + side * 0.28 + Math.cos(a) * d, pz = end[2] - 0.12 + Math.sin(a) * d * 0.6;
      const c = new THREE.Color(CAP[(v + i) % 3]), h = sz * 1.9;
      k.add(G.cyl(0.8, 1, 6), 0xeef0ff, [px, h * 0.5, pz], 0, [sz * 0.24, h, sz * 0.24]);
      kc.add(G.hemi(10), (x, y) => c.clone().multiplyScalar(0.5 + 0.5 * clamp((y - h) / (sz * 0.6), 0, 1)), [px, h - 0.005, pz], 0, [sz, sz * 0.66, sz]);
    }
    return (R.geo[key] = { root: keep(k.build()), caps: keep(kc.build()) });
  }
  // A soft moss cushion hugging the base of a wall, with a few tiny flowers
  function mossCushionGeo(v) {
    const key = 'mossC' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(2400 + v * 11), moss = R.geo.mossLump || (R.geo.mossLump = lumpy(1, 0.2, 2350, { flat: -0.2 }));
    const base = new THREE.Color(0x1f5a4c), top = new THREE.Color(v === 1 ? 0x6ab89a : 0x62a878), FL = [0xffffff, 0xffb8e0, 0xfff07a, 0xb8d8ff];
    const nb = 2 + v;
    for (let i = 0; i < nb; i++) {
      const s = 0.22 + rnd() * 0.12, x = (rnd() - 0.5) * 0.55, z = (rnd() - 0.5) * 0.4;
      k.add(moss, (px, py) => base.clone().lerp(top, clamp(py / 0.08, 0, 1)), [x, -0.01, z], [0, rnd() * 6, 0], [s * 1.35, s * 0.36, s]);
      for (let f = 0; f < 3; f++) {
        const a = rnd() * TAU, r = s * 0.7 * rnd();
        k.add(petalDisc(), FL[Math.floor(rnd() * FL.length)], [x + Math.cos(a) * r, s * 0.34, z + Math.sin(a) * r], [0, rnd() * 6, 0], 0.05);
      }
    }
    return (R.geo[key] = keep(k.build()));
  }
  // A lighter moss cap for the crowns of the camera-side rocks: 1–2 flat moss lumps with a few tiny flowers
  function rockMossGeo(v) {
    const key = 'rMoss' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(2450 + v * 7), moss = R.geo.mossLump || (R.geo.mossLump = lumpy(1, 0.2, 2350, { flat: -0.2 }));
    const base = new THREE.Color(0x1f5a4c), top = new THREE.Color(v === 1 ? 0x6ab89a : 0x62a878), FL = [0xffffff, 0xffb8e0, 0xfff07a, 0xb8d8ff];
    for (let i = 0; i < 1 + (v % 2); i++) {
      const s = 0.3 + rnd() * 0.08, x = i ? (rnd() - 0.5) * 0.45 : 0, z = i ? (rnd() - 0.5) * 0.35 : 0;
      k.add(moss, (px, py) => base.clone().lerp(top, clamp(py / 0.08, 0, 1)), [x, -0.01, z], [0, rnd() * 6, 0], [s * 1.35, s * 0.36, s]);
      for (let f = 0; f < 2; f++) {
        const a = rnd() * TAU, r = s * 0.65 * rnd();
        k.add(petalDisc(), FL[Math.floor(rnd() * FL.length)], [x + Math.cos(a) * r, s * 0.34, z + Math.sin(a) * r], [0, rnd() * 6, 0], 0.05);
      }
    }
    return (R.geo[key] = keep(k.build()));
  }
  // Lamp mushrooms: one big + two small; stems (decor) and caps with spots (glow) come from the same layout
  const LAMP_COL = [0xff8ad8, 0x7ae8ff, 0xb89aff, 0x7affc8, 0xffc86a];
  function lampData(v) {
    const key = 'lamp' + v;
    if (R.geo[key]) return R.geo[key];
    const ks = new Kit(), kc = new Kit(), rnd = mulberry32(2500 + v * 17), col = new THREE.Color(LAMP_COL[v % LAMP_COL.length]);
    const spotC = col.clone().lerp(new THREE.Color(1, 1, 1), 0.72);
    const L3 = [[0, 0, 1, 0.08], [0.34, 0.12, 0.55, -0.22], [-0.24, 0.22, 0.42, 0.28]];
    for (const [x, z, s, lean] of L3) {
      const h = 0.62 * s, cr = 0.34 * s, ch = 0.2 * s, tx = x + Math.sin(lean) * h * 0.5, top = [tx, h, z];
      ks.seg([x, -0.02, z], [tx, h * 0.55, z], 0.085 * s, 0xf4ecff, 0.07 * s, 10);
      ks.seg([tx * 0.5 + x * 0.5, h * 0.5, z], top, 0.07 * s, 0xfaf4ff, 0.065 * s, 10);
      const capY = h - 0.01, tilt = [0, 0, lean * 0.4];
      ks.push([tx, capY, z], tilt); ks.add(G.cyl(1, 1, 16), col.clone().lerp(new THREE.Color(1, 1, 1), 0.55), [0, 0.005, 0], 0, [cr * 0.94, 0.02, cr * 0.94]); ks.pop();   // pale gills
      kc.push([tx, capY, z], tilt);
      kc.add(G.hemi(14), (px, py) => { const t = clamp((py - capY) / ch, 0, 1); return col.clone().multiplyScalar(0.42 + 0.58 * t * t); }, [0, 0, 0], 0, [cr, ch, cr]);
      const ns = s > 0.8 ? 7 : 4;
      for (let i = 0; i < ns; i++) {
        const a = i / ns * TAU + rnd() * 0.6, e = i === 0 && s > 0.8 ? 1.45 : 0.45 + rnd() * 0.5, ss = (0.045 + rnd() * 0.03) * s / 0.8;
        kc.add(G.sphere(6, 4), spotC, [Math.cos(a) * Math.cos(e) * cr * 0.98, Math.sin(e) * ch * 0.98, Math.sin(a) * Math.cos(e) * cr * 0.98], 0, [ss, ss * 0.45, ss]);
      }
      kc.pop();
    }
    return (R.geo[key] = { stems: keep(ks.build()), caps: keep(kc.build()) });
  }

  // Sparkly snail-slime trails: soft iridescent ribbons on the floor (additive, one mesh per level)
  const SLIME_VS = `attribute vec4 aT; varying vec4 vT; varying float vFogD;
    void main() { vT = aT; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SLIME_FS = `uniform float uTime, fogNear, fogFar; uniform vec3 fogColor; varying vec4 vT; varying float vFogD;
    ${GLSL_NOISE}
    void main() {
      float v = abs(vT.y), u = vT.x;
      float body = smoothstep(1.0, 0.55, v) * (0.65 + 0.35 * lvVN(vec2(u * 2.2, vT.y * 1.4 + vT.w * 20.0)));   // wet, a little blotchy
      float rim = smoothstep(0.35, 0.85, v) * smoothstep(1.0, 0.8, v);                                        // brighter wet edge
      float hue = vT.w * 6.2831 + u * 0.07 + uTime * 0.04;                                                   // one pastel hue per trail, drifting
      vec3 iri = 0.6 + 0.4 * cos(hue + vec3(0.0, 2.1, 4.2) + v * 1.6);                                     // a soft rainbow sheen across it
      vec3 base = mix(vec3(0.74, 0.78, 1.0), iri, 0.62);
      float sheen = pow(0.5 + 0.5 * sin(u * 2.1 - uTime * 1.2 + vT.w * 7.0), 4.0);                           // a highlight gliding along
      vec2 gp = vec2(u * 5.0, vT.y * 1.5 + 11.0), gi = floor(gp); float h = lvH21(gi + vec2(vT.w * 17.0, 3.0));
      vec2 gf = fract(gp) - 0.5 - (vec2(lvH21(gi + 5.3), lvH21(gi + 9.1)) - 0.5) * 0.4;
      float tw = pow(max(0.0, sin(uTime * 2.2 + h * 50.0)), 8.0);
      float gl = step(0.66, h) * smoothstep(0.17, 0.0, length(gf)) * tw * smoothstep(1.0, 0.5, v);
      vec3 col = base * (body * 0.075 + rim * 0.15 + body * sheen * 0.09) + vec3(1.0, 0.96, 1.0) * gl * 1.1;
      col *= vT.z * (1.0 - smoothstep(fogNear, fogFar, vFogD));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;
  function slimeMat() {
    return R.mat.slime || (R.mat.slime = keep(new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTime: TIME.u }, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)), vertexShader: SLIME_VS, fragmentShader: SLIME_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })));
  }
  function finishSlime(B) {
    const list = B.slime;
    if (!list.length) return;
    let nv = 0, ni = 0;
    for (const t of list) { nv += t.pts.length * 2; ni += (t.pts.length - 1) * 6; }
    const pos = new Float32Array(nv * 3), at = new Float32Array(nv * 4), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    for (const t of list) {
      const P = t.pts, n = P.length, total = P[n - 1][2];
      for (let i = 0; i < n; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
        const u = P[i][2], w = t.w * (0.82 + 0.18 * Math.sin(u * 1.7 + t.seed * 9)) * (0.55 + 0.45 * smooth01(u / 0.6));
        const nx = -dz / l * w, nz = dx / l * w, fade = smooth01(u / 1.1) * smooth01((total - u) / 0.5) * (0.55 + 0.45 * (u / total));   // fresher toward the snail's end
        for (let sd = 0; sd < 2; sd++) {
          const o = vo + i * 2 + sd, sg = sd ? -1 : 1;
          pos[o * 3] = P[i][0] + nx * sg; pos[o * 3 + 1] = 0.012; pos[o * 3 + 2] = P[i][1] + nz * sg;
          at[o * 4] = u; at[o * 4 + 1] = sg; at[o * 4 + 2] = fade; at[o * 4 + 3] = t.seed;
        }
        if (i < n - 1) { const q = vo + i * 2; idx[io++] = q; idx[io++] = q + 2; idx[io++] = q + 1; idx[io++] = q + 1; idx[io++] = q + 2; idx[io++] = q + 3; }
      }
      vo += n * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(at, 4));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
    B.dispose.push(g);
    const m = new THREE.Mesh(g, slimeMat());
    m.renderOrder = 2; m.name = 'slime';
    B.g.add(m);
  }

  function caveFriends(L, B, crystals, roomSpot) {
    const rnd = B.rnd, W = L.W, H = L.H, grid = L.grid, dW = L.dWall, dF = L._dF;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const cellOf = (x, z) => { const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
    const dwAt = (x, z) => { const c = cellOf(x, z); return c < 0 || !grid[c] ? 0 : dW[c]; };
    const nearPath = (x, z, d) => { for (const p of L.path) if (Math.abs(p.x - x) < d && Math.abs(p.z - z) < d && hyp(p.x - x, p.z - z) < d) return true; return false; };
    const busy = (x, z, pad) => (L.exit && hyp(L.exit.x - x, L.exit.z - z) < 3.4 + pad) || L.checkpoints.some(q => hyp(q.x - x, q.z - z) < 2.4 + pad) ||
      L.chests.some(q => hyp(q.x - x, q.z - z) < 1.3 + pad) || L.torches.some(q => hyp(q.x - x, q.z - z) < 0.8 + pad) ||
      L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + pad) || (L.start && hyp(L.start.x - x, L.start.z - z) < 1.5 + pad) ||
      (L.boss && hyp(L.boss.x - x, L.boss.z - z) < 4 + pad);
    const cells = (test) => { const out = []; for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) if (test(j * W + i, i, j)) out.push([i, j]); return shuffle(out, rnd); };

    // molehills near the room edges: never on the main path, next to a spawn or in a doorway (a mole in the game shows a *moving* mound)
    const hills = [];
    for (const [i, j] of cells(c => grid[c] && dW[c] >= 1.2 && dW[c] <= 3.8 && !B.noDec[c])) {
      if (hills.length >= 26) break;
      const x = i + 0.2 + rnd() * 0.6, z = j + 0.2 + rnd() * 0.6;
      if (hills.some(h => hyp(h[0] - x, h[1] - z) < 3.2) || nearPath(x, z, 2.4) || linkDist(L, x, z) < 1.8 || busy(x, z, 0.8) ||
        L.spawns.some(q => hyp(q.x - x, q.z - z) < 2.2)) continue;
      hills.push([x, z]);
      const v = rnd() < 0.28 ? 1 : rnd() < 0.3 ? 2 : rnd() < 0.3 ? 3 : 0, D = moleHillData(v), m = mat4(x, 0, z, rnd() * TAU, 0.9 + rnd() * 0.3);
      dec(B, 'soil', D.soil, m, null);
      if (D.extra) dec(B, 'decor', D.extra, m, null);
    }
    // gnarly roots with moss and tiny glowing mushrooms, coming out of the rock at the foot of the walls (where the cobwebs used to
    // be), a few more in the northern corners
    const hang = [];
    const wallDir = (x, z) => { const gx = dwAt(x + 0.7, z) - dwAt(x - 0.7, z), gz = dwAt(x, z + 0.7) - dwAt(x, z - 0.7), l = hyp(gx, gz); return l > 0.01 ? [gx / l, gz / l] : null; };
    for (const [i, j] of cells(c => grid[c] && dW[c] <= 1.5)) {
      if (hang.length >= 18) break;
      const cx = i + 0.5, cz = j + 0.5, g = wallDir(cx, cz);
      if (!g) continue;
      if (g[1] < 0.75) continue;   // only north walls: the root comes down the rock face toward the camera
      const x = cx - g[0] * 0.5, z = cz - g[1] * 0.5, tx = x + g[0] * 1.1, tz = z + g[1] * 1.1;
      if (hang.some(h => hyp(h[0] - x, h[1] - z) < 5) || busy(tx, tz, 0.5) || busy(x, z, 0.3) || nearPath(tx, tz, 1.6) || linkDist(L, tx, tz) < 1.6 ||
        L.spawns.some(q => hyp(q.x - tx, q.z - tz) < 1.4)) continue;
      hang.push([x, z]);
      const v = Math.floor(rnd() * 3), s = 0.95 + rnd() * 0.3, ry = Math.atan2(g[0], g[1]) + (rnd() - 0.5) * 0.35, D = rootArchData(v);
      dec(B, 'decor', D.root, mat4(x, 0, z, ry, s), null);
      dec(B, 'glow', D.caps, mat4(x, 0, z, ry, s), lin(0xffffff, 0.62));
      glowAt(B, tx, tz, 1.2, 0x9ad8ff, 0.14);
    }
    // moss cushions along the wall bases
    let nMoss = 0;
    for (const [i, j] of cells(c => grid[c] && dW[c] <= 1.5 && !B.noDec[c])) {
      if (nMoss >= 60) break;
      const x = i + rnd(), z = j + rnd();
      if (rnd() < 0.6 || busy(x, z, 0.2) || nearPath(x, z, 1.4) || hang.some(h => hyp(h[0] - x, h[1] - z) < 1.2)) continue;
      dec(B, 'decor', mossCushionGeo(Math.floor(rnd() * 3)), mat4(x, 0, z, rnd() * TAU, 0.8 + rnd() * 0.5), null);
      nMoss++;
    }
    // lamp mushrooms in the rock band next to the floor (soft coloured light pools, spores floating up)
    const lamps = [];
    let nIn = 0;
    for (const [i, j] of cells(c => grid[c] ? dW[c] >= 0.7 && dW[c] <= 1.2 : dF[c] <= 0.9)) {
      if (lamps.length >= 13) break;
      const x = i + rnd(), z = j + rnd(), s = 1.05 + rnd() * 0.4, inside = grid[cellOf(x, z)] === 1, r = 0.42 * s;
      if (lamps.some(q => hyp(q[0] - x, q[1] - z) < 6.5) || crystals.some(q => hyp(q[0] - x, q[1] - z) < 3) || hang.some(q => hyp(q[0] - x, q[1] - z) < 2.5)) continue;
      if (inside ? (nIn >= 8 || nearPath(x, z, 2.8) || !roomSpot(x, z, r, 0.85 * s)) : (hides(L, x, z, 0.5 * s, 0, 0.85 * s, 0.05) || busy(x, z, 0.3))) continue;
      lamps.push([x, z]);
      const v = Math.floor(rnd() * LAMP_COL.length), ry = rnd() * TAU, D = lampData(v), col = new THREE.Color(LAMP_COL[v]);
      const vis = [dec(B, 'decor', D.stems, mat4(x, 0, z, ry, s), null), dec(B, 'glow', D.caps, mat4(x, 0, z, ry, s), lin(0xffffff, 0.66))];
      if (inside) { propSolid(L, x, z, r, 'lamp', vis); nIn++; }
      B.lights.push({ x, y: 0.95 * s, z: z + 0.2, col, int: 3.4, dist: 6.5, fl: 0, ph: rnd() * 10 });
      glowAt(B, x, z + 0.25, 2.4 * s, col, 0.5);
      for (let m = 0; m < 4; m++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.9, y: 0.7 + rnd() * 0.9, z: z + (rnd() - 0.5) * 0.9, kind: 1, ph: rnd(), size: 0.06, prm: 0.3 + rnd() * 0.3, col: col.clone().multiplyScalar(1.5) });
    }
    // snail-slime trails: wander over the floor of most rooms, turning away from walls, busy spots and each other
    const SL_COL = [0xffb0e8, 0xa8e8ff, 0xd0b8ff, 0xb8ffe0, 0xffffff];
    const trails = [], order = [0, 1].concat(shuffle(L.rooms.map((r, i) => i).filter(i => i > 1 && L.rooms[i].kind !== 'boss'), rnd));
    const want = clamp(Math.round(L.rooms.length * 0.9), 7, 13);
    const bad = (x, z) => dwAt(x, z) < 0.95 || busy(x, z, 0.1) || trails.some(t => t.near(x, z));
    for (const ri of order) {
      if (trails.length >= want) break;
      const rm = L.rooms[ri];
      if (!rm) continue;
      for (let tr = 0; tr < 24; tr++) {
        const a0 = rnd() * TAU, d0 = Math.sqrt(rnd()) * (rm.r || Math.min(rm.hw, rm.hh)) * 0.75;
        let x = rm.x + Math.cos(a0) * d0, z = rm.z + Math.sin(a0) * d0;
        if (dwAt(x, z) < 1.6 || bad(x, z)) continue;
        let h = rnd() * TAU, u = 0;
        const len = 4.5 + rnd() * 5, ph = rnd() * 10, pts = [[x, z, 0]];
        for (let st = 0; st < 120 && u < len; st++) {
          h += Math.sin(st * 0.21 + ph) * 0.1 + (rnd() - 0.5) * 0.14;
          let nx = x + Math.cos(h) * 0.22, nz = z + Math.sin(h) * 0.22;
          if (dwAt(nx, nz) < 1.3) {   // steer toward open floor (up the wall-distance gradient)
            const gx = dwAt(x + 0.6, z) - dwAt(x - 0.6, z), gz = dwAt(x, z + 0.6) - dwAt(x, z - 0.6);
            if (gx || gz) { const ga = Math.atan2(gz, gx); h += clamp(angDiff(h, ga), -0.45, 0.45); }
            nx = x + Math.cos(h) * 0.22; nz = z + Math.sin(h) * 0.22;
          }
          if (bad(nx, nz)) break;
          u += hyp(nx - x, nz - z); x = nx; z = nz; pts.push([x, z, u]);
        }
        if (u < 3.2) continue;
        for (let it = 0; it < 2; it++) for (let i = 1; i < pts.length - 1; i++) { pts[i][0] = (pts[i - 1][0] + pts[i][0] * 2 + pts[i + 1][0]) / 4; pts[i][1] = (pts[i - 1][1] + pts[i][1] * 2 + pts[i + 1][1]) / 4; }
        const seed = rnd();
        trails.push({ near: (qx, qz) => { for (let i = 0; i < pts.length; i += 3) if (hyp(pts[i][0] - qx, pts[i][1] - qz) < 1.5) return true; return false; } });
        B.slime.push({ pts, w: 0.16 + rnd() * 0.04, seed });
        for (let k = 1; k < pts.length - 1; k += 3) {   // twinkles on the trail + a faint sheen baked into the floor
          const p = pts[k];
          B.pts.add.push({ x: p[0] + (rnd() - 0.5) * 0.25, y: 0.05, z: p[1] + (rnd() - 0.5) * 0.25, kind: 8, ph: rnd(), size: 0.12 + rnd() * 0.1, prm: 0.5 + rnd() * 0.5, col: lin(pick(SL_COL), 1.6) });
          if (k % 6 === 1) glowAt(B, p[0], p[1], 0.75, pick([0xd8a0ff, 0xa0d8ff, 0xffa0d8]), 0.09);
        }
        break;
      }
    }
    L.caveDecor = { hills, roots: hang, lamps, moss: nMoss, trails: B.slime.map(t => t.pts[Math.floor(t.pts.length / 2)]) };   // for tests / debugging
  }
  function buildCave(L, B) {
    const rnd = B.rnd, W = L.W, H = L.H, grid = L.grid, dW = L.dWall;
    const dF = L._dF = chamfer(W, H, grid, 1);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const rockTint = () => lin(pick([0x9aa0b8, 0xa49cb8, 0x8ea0b0, 0xb0aabc, 0x9890b0]), 0.8 + rnd() * 0.35);
    // Boulders. On the camera side of the walkable floor they are graded by how far SOUTH of it they stand (southGap: a cone
    // looking north from the rock): ≤ 2 m → top ≤ 0.6 m, 2–5 m → top ≤ 1.0 m — smaller, rounder rocks packed closer, some with a
    // moss cushion or tiny glowing mushrooms on top; the ground there is near-black, so real holes get small filler rocks.
    // Further out the big boulders only rise as far as keeps their top ≥ 3 m (on screen) south of the floor edge. So the rock
    // band never fills the bottom of the screen when Feza walks along a south wall. Beside / behind the rooms (no floor to their
    // north): big boulders as before.
    const cellOf = (x, z) => { const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
    const gapAt = (x, z) => southGap(L, x, z), capAt = g => southCap(g, 0.6, 1.0);   // highest allowed top (m)
    const RG = [rockGeo(0), rockGeo(1), rockGeo(2), rockSGeo()];   // 3 boulders + the low-poly small one (companions, fillers)
    const rTop = RG.map(g => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.max.y + 0.22; });   // top per unit sy (incl. the lift)
    const rApex = RG.map(g => { const P = g.attributes.position; let b = 0; for (let v = 1; v < P.count; v++) if (P.getY(v) > P.getY(b)) b = v; return new THREE.Vector3(P.getX(b), P.getY(b), P.getZ(b)); });
    const RS = L.caveRocks = { near: 0, mid: 0, far: 0, fill: 0, topNear: 0, topMid: 0, topFar: 0, moss: 0, caps: 0 };   // for tests / debugging
    const CW = W * 2, CH = H * 2, cov = new Uint8Array(CW * CH);   // 0.5 m cells already covered by a rock
    const cover = (x, z, r) => {
      for (let b = Math.max(0, Math.floor((z - r) * 2)); b <= Math.min(CH - 1, Math.floor((z + r) * 2)); b++)
        for (let a = Math.max(0, Math.floor((x - r) * 2)); a <= Math.min(CW - 1, Math.floor((x + r) * 2)); a++) if (hyp((a + 0.5) / 2 - x, (b + 0.5) / 2 - z) < r) cov[b * CW + a] = 1;
    };
    const _ap = new THREE.Vector3();
    // one rock: width s, depth sz, wanted height scale syW (≥ syMin), kept under capAt(g) incl. what its tilt adds → its apex (world)
    const addRock = (x, z, s, syW, syMin, sz, tilt, g, small) => {
      const k = small ? 3 : Math.floor(rnd() * 3), tm = tilt * 0.65 * Math.max(s, sz), sy = Math.max(syMin, Math.min(syW, (capAt(g) - tm) / rTop[k]));
      const m = mat4(x, 0.22 * sy, z, rnd() * TAU, s, sy, sz, (rnd() - 0.5) * tilt, (rnd() - 0.5) * tilt);
      inst(B, small ? 'rockS' : 'rock' + k, m, rockTint());
      cover(x, z, Math.min(s, sz) * 0.85);
      const band = g <= 2 ? 'Near' : g <= 5 ? 'Mid' : 'Far';
      RS[band.toLowerCase()]++; RS['top' + band] = Math.max(RS['top' + band], g < 99 ? +(rTop[k] * sy + tm).toFixed(2) : 0);
      return _ap.copy(rApex[k]).applyMatrix4(m);
    };
    const hug = (x, z, g, sz) => g < 1.1 * sz - 0.35 ? z - g - 0.35 + 1.1 * sz : z;   // overlap the floor to the north by ≤ 0.35 m (Feza's feet never sink into a rock)
    for (let z0 = 0; z0 < H; z0 += 1.85) for (let x0 = 0; x0 < W; x0 += 1.85) {
      const x = x0 + rnd() * 1.7, z = z0 + rnd() * 1.7, i = Math.floor(x), j = Math.floor(z);
      if (i < 0 || j < 0 || i >= W || j >= H || grid[j * W + i]) continue;
      const d = dF[j * W + i];
      if (d < 0.5 || d > 5 || (d > 3.2 && rnd() < 0.4)) continue;
      const g = gapAt(x, z);
      if (g <= 5) continue;   // the camera-side band is packed below
      const s = d < 2 ? 0.95 + rnd() * 0.75 : 1.4 + rnd() * 1.2, sz = s * (0.8 + rnd() * 0.4);
      let hy = 1.15 + rnd() * 0.8;
      for (const h of [hy, 0.75, 0.45, 0.3]) { hy = h; if (!hides(L, x, z, s, 0, 1.45 * s * h, 0.15)) break; }
      if (satCount(L, x - s * 0.9, z - s - 2, x + s * 0.9, z) > 0) hy = Math.min(hy, 0.8 / (1.45 * s));
      addRock(x, z, s, s * hy, 0.28 * s, sz, 0.25, g);
    }
    // the camera-side band: a jittered 1.3 m grid of low rocks, a smaller companion now and then
    for (let z0 = 0; z0 < H; z0 += 1.3) for (let x0 = 0; x0 < W; x0 += 1.3) {
      let x = x0 + rnd() * 1.2, z = z0 + rnd() * 1.2;
      const c = cellOf(x, z);
      if (c < 0 || grid[c]) continue;
      let g = gapAt(x, z);
      if (g > 5) continue;
      const near = g <= 2, n = near ? (rnd() < 0.45 ? 2 : 1) : (rnd() < 0.3 ? 2 : 1);
      for (let r = 0; r < n; r++) {
        const s = r ? 0.42 + rnd() * 0.3 : near ? 0.58 + rnd() * 0.42 : 0.8 + rnd() * 0.55, sz = s * (0.8 + rnd() * 0.45);
        if (r) { x += (rnd() - 0.5) * 1.5; z += (rnd() - 0.5) * 1.2; const c2 = cellOf(x, z); if (c2 < 0 || grid[c2]) continue; g = gapAt(x, z); }
        const z1 = hug(x, z, g, sz); g += z1 - z; z = z1;
        const ap = addRock(x, z, s, s * (0.5 + rnd() * 0.55), 0.2 * s, sz, 0.14, g, r > 0);
        if (r) continue;
        const roll = rnd();
        if (roll < 0.2) {   // a soft moss cushion (tiny flowers) on the rock's crown
          const ms = Math.min(s, sz) * (0.6 + rnd() * 0.25);
          dec(B, 'decor', rockMossGeo(Math.floor(rnd() * 3)), mat4(ap.x, ap.y - 0.05 * ms, ap.z, rnd() * TAU, ms, ms * 0.8, ms), null);
          RS.moss++;
        } else if (roll < 0.29) {   // a few tiny glowing mushrooms growing on top
          const v = Math.floor(rnd() * 3), gs = 0.55 + rnd() * 0.3, ry = rnd() * TAU;
          dec(B, 'glow', glowCapGeo(v), mat4(ap.x, ap.y - 0.03, ap.z, ry, gs), lin(0xffffff, 0.8));
          dec(B, 'decor', glowStemGeo(), mat4(ap.x, ap.y - 0.03, ap.z, ry, gs), null);
          B.pts.add.push({ x: ap.x, y: ap.y + 0.35, z: ap.z, kind: 2, ph: rnd(), size: 0.12, prm: 0.3 + rnd() * 0.3, col: lin([0x6ae8ff, 0x9a8cff, 0x6affc0][v], 2) });
          RS.caps++;
        }
      }
    }
    // fill the holes of the band (0.5 m cells no rock covers, with most of their neighbours open too — thin cracks stay as dark
    // crevices) with small low rocks
    const open = (a, b) => a >= 0 && b >= 0 && a < CW && b < CH && !cov[b * CW + a];
    for (let b = 0; b < CH; b++) for (let a = 0; a < CW; a++) {
      if (cov[b * CW + a]) continue;
      let no = 0;
      for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) no += open(a + da, b + db);
      if (no < 8) continue;
      let x = (a + 0.2 + rnd() * 0.6) / 2, z = (b + 0.2 + rnd() * 0.6) / 2;
      const c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 6) continue;
      let g = gapAt(x, z);
      if (g > 5) continue;
      const s = 0.5 + rnd() * 0.3, sz = s * (0.8 + rnd() * 0.4), z1 = hug(x, z, g, sz);
      g += z1 - z; z = z1;
      addRock(x, z, s, s * (0.55 + rnd() * 0.5), 0.2 * s, sz, 0.14, g, true);
      RS.fill++;
    }
    // stalagmites in the rock band
    for (let n = 0; n < W * H / 45; n++) {
      const x = rnd() * W, z = rnd() * H, i = Math.floor(x), j = Math.floor(z), c = j * W + i;
      if (grid[c] || dF[c] < 0.8 || dF[c] > 4.5) continue;
      const s = Math.min(0.6 + rnd() * 0.8, capAt(gapAt(x, z)) / 1.8);   // graded like the boulders on the camera side
      if (s < 0.3 || hides(L, x, z, 0.5 * s, 0, 1.8 * s, 0.1)) continue;
      inst(B, 'stal', mat4(x, 0, z, rnd() * TAU, s), rockTint());
    }
    // things standing on the floor inside a room: against a wall, never in a corridor (main or side), leaving a real gap or
    // none, and never hiding floor behind them from the camera (so only in front of north walls)
    const arenaRm = L.rooms.find(q => q.kind === 'boss' && !q.hw);   // the boss arena's floor stays clear (its rim gets its own decor)
    const roomSpot = (x, z, r, h) => !(arenaRm && inRoom(arenaRm, x, z, -1.5)) && linkDist(L, x, z) >= 2.5 && gapOKL(L, x, z, r) && hiddenBehind(L, x, z, r, h) === 0 &&
      !L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + r + 1.1) && !L.spawns.some(q => hyp(q.x - x, q.z - z) < 1.6) &&
      !L.chests.some(q => hyp(q.x - x, q.z - z) < 2.5) && !L.checkpoints.some(q => hyp(q.x - x, q.z - z) < 3) && !(L.exit && hyp(L.exit.x - x, L.exit.z - z) < 4);
    // a few stalagmites inside the rooms, hugging the walls (they block like the rocks around them)
    let nIn = 0;
    for (let n = 0; n < W * H / 25 && nIn < 18; n++) {
      const x = rnd() * W, z = rnd() * H, c = Math.floor(z) * W + Math.floor(x);
      if (!grid[c] || dW[c] > 1.25 || dW[c] < 0.9) continue;
      const s = 0.45 + rnd() * 0.35, r = 0.38 * s + 0.12;
      if (L.path.some(p => hyp(p.x - x, p.z - z) < 2.8) || !roomSpot(x, z, r, 1.8 * s)) continue;
      propSolid(L, x, z, r, 'stal', [inst(B, 'stal', mat4(x, 0, z, rnd() * TAU, s), rockTint())]);
      nIn++;
    }
    // crystal clusters (glow + a few assigned point lights) and glowing mushrooms: mostly in the rock band next to the floor,
    // a few inside the rooms against a north wall (those block like the stalagmites)
    const crystals = [];
    let nCin = 0;
    for (let n = 0; n < W * H / 20 && crystals.length < 42; n++) {
      const x = rnd() * W, z = rnd() * H, i = Math.floor(x), j = Math.floor(z), c = j * W + i;
      const inside = grid[c] === 1;
      if (inside ? (dW[c] > 1.25 || nCin >= 8) : dF[c] > 1.6) continue;
      if (crystals.some(q => hyp(q[0] - x, q[1] - z) < 4.2)) continue;
      const v = Math.floor(rnd() * 8), s = inside ? 0.9 + rnd() * 0.8 : Math.min(0.9 + rnd() * 0.8, (capAt(gapAt(x, z)) + 0.3) / 1.3), r = 0.3 * s + 0.1;   // thin + glowing: a little taller than the rocks may be
      if (inside ? !roomSpot(x, z, r, 1.3 * s) : hides(L, x, z, 0.35 * s, 0, 1.3 * s, 0.05)) continue;
      crystals.push([x, z]);
      const vis = [dec(B, 'glow', crystalGeo(v), mat4(x, -0.05, z, rnd() * TAU, s), null),
        dec(B, 'rock', rockGeo(v % 3), mat4(x, 0, z, rnd() * TAU, 0.35 * s, 0.2 * s, 0.3 * s), lin(0x7a7f98))];
      if (inside) { propSolid(L, x, z, r, 'cry', vis); nCin++; }
      const col = new THREE.Color(CRYSTAL_COL[v % 4]);
      B.lights.push({ x, y: 1.1, z, col, int: 5.5, dist: 7.5, fl: 0, ph: rnd() * 10 });
      glowAt(B, x, z, 2.8 + s * 1.1, col, 0.85);
      for (let m = 0; m < 3; m++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.8, y: 0.3 + rnd() * 0.8, z: z + (rnd() - 0.5) * 0.8, kind: 2, ph: rnd(), size: 0.16, prm: 0.3 + rnd() * 0.3, col: col.clone().multiplyScalar(2.2) });
    }
    for (let n = 0; n < W * H / 90; n++) {
      const x = rnd() * W, z = rnd() * H, i = Math.floor(x), j = Math.floor(z), c = j * W + i;
      const inside = grid[c] === 1;
      if (inside ? dW[c] > 1.8 : (dF[c] < 0.3 || dF[c] > 1.5)) continue;
      const v = Math.floor(rnd() * 3), s = 0.8 + rnd() * 0.8, ry = rnd() * TAU;
      dec(B, 'glow', glowCapGeo(v), mat4(x, 0, z, ry, s), lin(0xffffff, 0.8));
      glowAt(B, x, z, 1.3 * s, [0x6ae8ff, 0x9a8cff, 0x6affc0][v], 0.3);
      dec(B, 'decor', glowStemGeo(), mat4(x, 0, z, ry, s), null);
    }
    // pebbles and small rocks along the walls
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const c = j * W + i;
      if (!grid[c] || dW[c] > 2.2 || rnd() > 0.05) continue;
      dec(B, 'decor', pebbleGeo(1 + Math.floor(rnd() * 2), true), mat4(i + rnd(), 0, j + rnd(), rnd() * TAU, 1), null);
    }
    // the boss arena: crystal clusters around its rim, the mine-cart corner
    caveArena(L, B, crystals, capAt, gapAt);
    // the moles' and snails' home: molehills, hanging roots with glowing buds, moss cushions, lamp mushrooms, slime trails
    caveFriends(L, B, crystals, roomSpot);
    // glowing light motes and floating dust
    for (let n = 0; n < 60; n++) {
      const x = rnd() * W, z = rnd() * H;
      if (!grid[Math.floor(z) * W + Math.floor(x)]) continue;
      B.pts.add.push({ x, y: 0.5 + rnd() * 1.8, z, kind: 4, ph: rnd(), size: 0.12, prm: 0.6 + rnd() * 0.6, col: lin(pick([0x7affb0, 0x7ae8ff, 0xd0ff7a]), 2.4) });
    }
    for (let n = 0; n < 50; n++) {
      const x = rnd() * W, z = rnd() * H;
      if (!grid[Math.floor(z) * W + Math.floor(x)]) continue;
      B.pts.add.push({ x, y: 0.5 + rnd() * 2.2, z, kind: 1, ph: rnd(), size: 0.07, prm: 0.5 + rnd() * 0.5, col: lin(0xb0c8ff, 0.9) });
    }
  }
  // ── Boss arenas (forest / cave; the volcano's is in buildVolcano, the castle keeps its hall). L.arenaDecor: spots for tests ──
  // Walk from the arena's centre outward along angle a to the floor edge (null where a corridor leaves)
  function arenaEdge(L, ar, a, far = 5) {
    const dx = Math.cos(a), dz = Math.sin(a);
    let r = ar.r * 0.6;
    while (r < ar.r + far && isFloor(L, ar.x + dx * r, ar.z + dz * r)) r += 0.2;
    return r >= ar.r + far ? null : { r, dx, dz, x: ar.x + dx * r, z: ar.z + dz * r };
  }
  // Forest: Kral Jöle's flower-and-mushroom clearing — giant friendly toadstools around the rim (low ones on the camera side),
  // a fairy ring of little mushrooms and flowers where the king waits, glowing light motes, sparkles and drifting blossoms
  function bigMushGeo(v) {   // a big friendly toadstool (≈1.03 m tall at scale 1): cream stem, round cap with white spots, pale gills
    const key = 'bigMush' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32(3100 + v * 13), capC = new THREE.Color([0xd84434, 0xd86a98, 0x8466c8, 0xd88430][v % 4]), capT = capC.clone().lerp(new THREE.Color(0xffffff), 0.12);   // not too bright: the forest sun is strong
    k.add(G.cyl(0.8, 1, 14), (x, y) => new THREE.Color(0xf6ecd8).multiplyScalar(0.82 + 0.18 * clamp(y / 0.6, 0, 1)), [0, 0.31, 0], 0, [0.19, 0.62, 0.19]);
    k.add(G.sphere(14, 10), 0xf2e6d0, [0, 0.07, 0], 0, [0.24, 0.12, 0.24]);
    k.add(G.cyl(1, 1, 22), 0xf4dcc4, [0, 0.605, 0], 0, [0.56, 0.03, 0.56]);
    k.add(G.hemi(22), (x, y) => capC.clone().lerp(capT, clamp((y - 0.6) / 0.42, 0, 1)), [0, 0.6, 0], 0, [0.6, 0.42, 0.6]);
    for (let i = 0; i < 10; i++) {
      const a = rnd() * TAU, e = 0.3 + rnd() * 1.0, px = Math.cos(a) * Math.cos(e) * 0.6, py = 0.6 + Math.sin(e) * 0.42, pz = Math.sin(a) * Math.cos(e) * 0.6;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(px / 0.36, (py - 0.6) / 0.18, pz / 0.36).normalize());
      k.add(G.sphere(10, 6), 0xffffff, [px, py, pz], q, [0.07 + rnd() * 0.03, 0.02, 0.07 + rnd() * 0.03]);
    }
    return (R.geo[key] = keep(k.build()));
  }
  function forestArenaPlan(L, B) {
    const ar = L.rooms.find(r => r.kind === 'boss' && !r.hw);
    if (!ar) return null;
    const rnd = B.rnd, big = [];
    for (let a = rnd(); a < TAU + rnd() * 0.1; a += 0.26 + rnd() * 0.1) {
      const e = arenaEdge(L, ar, a);
      if (!e) continue;
      const o = 0.75 + rnd() * 1.0, x = e.x + e.dx * o, z = e.z + e.dz * o;
      if (isFloor(L, x, z) || linkDist(L, x, z) < 3 || big.some(m => hyp(m.x - x, m.z - z) < 1.1)) continue;
      let s = Math.min(1.1 + rnd() * 1.2, southCap(southGap(L, x, z), 0.7, 1.0) / 1.03);
      while (s >= 0.5 && hides(L, x, z, 0.6 * s, 0.4 * s, 1.03 * s, 0.25)) s *= 0.85;
      if (s < 0.5) continue;
      big.push({ x, z, s, v: Math.floor(rnd() * 4), ry: rnd() * TAU });
      B.noTree.push({ x, z, r: 0.75 * s + 0.5 });
    }
    return { ar, big };
  }
  function forestArenaDecor(L, B, plan) {
    if (!plan) return;
    const rnd = B.rnd, ar = plan.ar, M = L._mask;
    const maskAt = (x, z, ch) => { const px = clamp(Math.floor(x * MPX), 0, M.W - 1), py = clamp(Math.floor(z * MPX), 0, M.H - 1); return M.data[(py * M.W + px) * 4 + ch] / 255; };
    for (const m of plan.big) {
      dec(B, 'decor', bigMushGeo(m.v), mat4(m.x, 0, m.z, m.ry, m.s), null);
      for (let n = 0; n < 2; n++) { const a = rnd() * TAU, d = 0.55 * m.s + 0.2 + rnd() * 0.3; dec(B, 'decor', mushroomGeo(rnd() < 0.7 ? 0 : 1), mat4(m.x + Math.cos(a) * d, 0, m.z + Math.sin(a) * d, rnd() * TAU, 1.1 + rnd() * 0.6), null); }
    }
    // the fairy ring
    const R0 = ar.r * 0.62, ring = [];
    for (let a = 0; a < TAU; a += 0.1) {
      const r = R0 + (rnd() - 0.5) * 0.3, x = ar.x + Math.cos(a) * r, z = ar.z + Math.sin(a) * r;
      if (!isFloor(L, x, z) || maskAt(x, z, 0) > 0.4 || maskAt(x, z, 2) > 0.4 || (L.exit && hyp(L.exit.x - x, L.exit.z - z) < 3)) continue;
      ring.push([x, z]);
      if (rnd() < 0.75) dec(B, 'decor', mushroomGeo(rnd() < 0.8 ? 0 : 1), mat4(x, 0, z, rnd() * TAU, 1.05 + rnd() * 0.45), null);
      const fr = r + (rnd() < 0.5 ? -0.45 : 0.45);   // flowers just inside / outside the ring
      if (rnd() < 0.6) dec(B, 'decor', flowerGeo(Math.floor(rnd() * FLOWER_COL.length)), mat4(ar.x + Math.cos(a + 0.05) * fr, 0, ar.z + Math.sin(a + 0.05) * fr, rnd() * TAU, 0.85 + rnd() * 0.35), null);
      if (rnd() < 0.2) B.pts.add.push({ x, y: 0.25, z, kind: 2, ph: rnd(), size: 0.14, prm: 0.3 + rnd() * 0.3, col: lin(0xfff0a0, 2) });
    }
    for (let n = 0; n < 16; n++) {   // glowing light motes over the clearing, a few blossoms drifting on the breeze (no insects)
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * ar.r * 0.8;
      B.pts.add.push({ x: ar.x + Math.cos(a) * r, y: 0.6 + rnd() * 1.4, z: ar.z + Math.sin(a) * r, kind: 4, ph: rnd(), size: 0.13, prm: 0.6 + rnd() * 0.6, col: lin(0xfff08a, 2.2) });
    }
    for (let n = 0; n < 4; n++) B.pts.norm.push({ x: ar.x + (rnd() - 0.5) * ar.r, y: 0.9, z: ar.z + (rnd() - 0.5) * ar.r, kind: 6, ph: rnd(), size: 0.34, prm: 0.7 + rnd() * 0.6, col: [0xffe066, 0xff9ad0, 0x9ad0ff][n % 3] });
    L.arenaDecor = { mushrooms: plan.big.length, ring: ring.length };
  }
  // Cave: Usta Köstebek's crystal cavern — big glowing crystal clusters around the rim (small ones on the camera side), and a
  // mine-cart corner: rails coming out of the rock, a cart full of glowing crystals, a lantern post, a pickaxe
  function mineCartData() {
    if (R.geo.cart) return R.geo.cart;
    const w = new Kit(), m = new Kit(), iron = 0x5a5866, wood = 0xf0dcc0;
    const box = R.geo.cartBox || (R.geo.cartBox = keep(boxUV(1, 1, 1, 0.5)));
    w.add(box, wood, [0, 0.5, 0], 0, [0.78, 0.44, 1.1]);                                 // the tub
    w.add(G.box(), 0x2a1a10, [0, 0.715, 0], 0, [0.68, 0.02, 1.0]);
    for (const z of [-0.5, 0, 0.5]) m.add(MK(G.box()), iron, [0, 0.5, z], 0, [0.82, 0.46, 0.06]);   // iron bands
    m.add(MK(G.box()), iron, [0, 0.73, 0], 0, [0.84, 0.04, 1.14]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      m.add(MK(G.cyl(1, 1, 16)), 0x3a3844, [sx * 0.36, 0.17, sz * 0.36], [0, 0, Math.PI / 2], [0.16, 0.07, 0.16]);
      m.add(MK(G.cyl(1, 1, 8)), 0xc8a050, [sx * 0.4, 0.17, sz * 0.36], [0, 0, Math.PI / 2], [0.05, 0.02, 0.05]);
    }
    m.add(MK(G.cyl(1, 1, 8)), iron, [0, 0.17, 0.36], [0, 0, Math.PI / 2], [0.03, 0.72, 0.03]);
    m.add(MK(G.cyl(1, 1, 8)), iron, [0, 0.17, -0.36], [0, 0, Math.PI / 2], [0.03, 0.72, 0.03]);
    const g = new Kit();   // glowing crystals heaped in the tub
    for (let i = 0; i < 6; i++) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((i % 3 - 1) * 0.4, i * 1.1, (i % 2 - 0.5) * 0.5)); g.push([(i % 2 - 0.5) * 0.3, 0.62, (i % 3 - 1) * 0.32], q); g.add(G.cyl(1, 1, 6), new THREE.Color(CRYSTAL_COL[i % 4]).multiplyScalar(0.7), [0, 0.12, 0], 0, [0.07, 0.3, 0.07]); g.add(G.cone(6), CRYSTAL_COL[i % 4], [0, 0.32, 0], 0, [0.07, 0.1, 0.07]); g.pop(); }
    const r = new Kit();   // rails + sleepers (local +z: into the arena, from under the rock at z = -1)
    for (let z = -0.9; z <= 4.0; z += 0.55) r.add(box, 0xd0b090, [0, 0.025, z], [0, (Math.sin(z * 7) * 0.06), 0], [1.05, 0.05, 0.2]);
    for (const sx of [-0.36, 0.36]) r.add(MK(G.box()), 0x8a8a98, [sx, 0.07, 1.55], 0, [0.05, 0.06, 5.1]);
    r.add(box, 0xb88a5a, [0, 0.16, 4.1], 0, [0.95, 0.2, 0.16]); for (const sx of [-0.32, 0.32]) r.add(box, 0xa87a4a, [sx, 0.1, 4.2], 0, [0.12, 0.2, 0.12]);   // buffer stop
    const p = new Kit();   // lantern post + pickaxe
    p.add(G.cyl(0.8, 1, 8), 0xc49a6a, [0, 0.75, 0], 0, [0.06, 1.5, 0.06]);
    p.add(G.box(), 0xc49a6a, [0.18, 1.45, 0], 0, [0.4, 0.06, 0.06]);
    p.add(MK(G.cyl(1, 1, 8)), iron, [0.34, 1.34, 0], 0, [0.09, 0.03, 0.09]); p.add(MK(G.cone(8)), iron, [0.34, 1.13, 0], [Math.PI, 0, 0], [0.1, 0.06, 0.1]);
    p.add(G.cyl(1, 1, 8), 0xc49a6a, [0.9, 0.45, 0.35], [0, 0, 0.45], [0.03, 0.9, 0.03]);   // pickaxe handle leaning on the cart
    p.add(MK(G.torus(Math.PI * 0.8, 0.12, 12)), 0x9aa0b0, [0.72, 0.86, 0.35], [0, 0, 0.45 + Math.PI * 0.6], [0.28, 0.28, 0.28]);
    const lg = new Kit(); lg.add(G.box(), 0xffe0a0, [0.34, 1.22, 0], 0, [0.12, 0.16, 0.12]);
    return (R.geo.cart = { wood: keep(w.build()), metal: keep(m.build()), glow: keep(g.build()), rails: keep(r.build()), post: keep(p.build()), lamp: keep(lg.build()) });
  }
  function caveArena(L, B, crystals, capAt, gapAt) {
    const ar = L.rooms.find(r => r.kind === 'boss' && !r.hw);
    if (!ar) return;
    const rnd = B.rnd, out = L.arenaDecor = { crystals: 0, cart: null };
    for (let a = rnd(); a < TAU; a += 0.4 + rnd() * 0.18) {
      const e = arenaEdge(L, ar, a);
      if (!e) continue;
      const o = 0.45 + rnd() * 1.1, x = e.x + e.dx * o, z = e.z + e.dz * o;
      if (isFloor(L, x, z) || linkDist(L, x, z) < 2.8 || crystals.some(q => hyp(q[0] - x, q[1] - z) < 2.0) || (L.exit && hyp(L.exit.x - x, L.exit.z - z) < 2.6)) continue;
      const north = e.dz < -0.35;
      let s = north ? 1.3 + rnd() * 1.2 : Math.min(1.2 + rnd() * 0.4, (capAt(gapAt(x, z)) + 0.3) / 1.3);
      while (s >= 0.45 && hides(L, x, z, 0.35 * s, 0, 1.3 * s, 0.05)) s *= 0.85;
      if (s < 0.45) continue;
      crystals.push([x, z]);
      const v = Math.floor(rnd() * 8), col = new THREE.Color(CRYSTAL_COL[v % 4]);
      dec(B, 'glow', crystalGeo(v), mat4(x, -0.05, z, rnd() * TAU, s), null);
      dec(B, 'rock', rockGeo(v % 3), mat4(x, 0, z, rnd() * TAU, 0.4 * s, 0.22 * s, 0.34 * s), lin(0x7a7f98));
      if (out.crystals % 2 === 0) B.lights.push({ x: x - e.dx * 0.6, y: 1.1, z: z - e.dz * 0.6, col, int: 5, dist: 8, fl: 0, ph: rnd() * 10 });
      glowAt(B, x - e.dx * 0.8, z - e.dz * 0.8, 2.6 + s, col, 0.75);
      for (let m = 0; m < 3; m++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.8, y: 0.3 + rnd() * 1.1, z: z + (rnd() - 0.5) * 0.8, kind: 2, ph: rnd(), size: 0.17, prm: 0.3 + rnd() * 0.3, col: col.clone().multiplyScalar(2.2) });
      out.crystals++;
    }
    // the mine-cart corner: north-west or north-east (the side whose cart hides the least floor), cart hugging the rock
    let best = null;
    for (let a = -Math.PI * 0.95; a <= Math.PI * 0.2; a += 0.12) {   // the northern half first (it hides nothing), then the sides
      const e = arenaEdge(L, ar, a);
      if (!e) continue;
      for (const o of [0.75, 0.65, 0.85]) {
        const cx = e.x - e.dx * o, cz = e.z - e.dz * o;
        if (!isFloor(L, cx, cz) || gridFree(L, cx, cz, 0.9) || !gridFree(L, cx, cz, 0.45)) continue;   // hugging the rock, no gap to get stuck in
        if ((L.exit && hyp(L.exit.x - cx, L.exit.z - cz) < 4.5) || linkDist(L, cx, cz) < 3 || L.torches.some(t => hyp(t.x - cx, t.z - cz) < 1.6) || L.solids.some(q => hyp(q.x - cx, q.z - cz) < q.r + 1.4)) continue;
        const k = hiddenBehind(L, cx, cz, 0.7, 1.0) + Math.abs(Math.abs(a + Math.PI / 2) - 0.8) * 0.6 + (a > -0.2 || a < -Math.PI + 0.2 ? 3 : 0);
        if (!best || k < best.k) best = { e, cx, cz, k };
        break;
      }
    }
    if (best) {
      const { e, cx, cz } = best, D = mineCartData(), yaw = Math.atan2(-e.dx, -e.dz);   // local +z points into the arena
      const at = (lx, lz) => [cx + Math.sin(yaw) * lz + Math.cos(yaw) * lx, cz + Math.cos(yaw) * lz - Math.sin(yaw) * lx];
      const [rx, rz] = at(0, -0.3), Mr = mat4(rx, 0, rz, yaw), Mc = mat4(cx, 0.02, cz, yaw);
      dec(B, 'prop', D.rails, Mr, null);
      const vis = [dec(B, 'prop', D.wood, Mc, null), dec(B, 'prop', D.metal, Mc, null), dec(B, 'glow', D.glow, Mc, lin(0xffffff, 0.75))];
      propSolid(L, cx, cz, 0.62, 'cart', vis);
      const [px, pz] = at(-0.95, -0.25), Mp = mat4(px, 0, pz, yaw);
      if (isFloor(L, px, pz) && !gridFree(L, px, pz, 0.5)) {
        const pv = [dec(B, 'prop', D.post, Mp, null), dec(B, 'window', D.lamp, Mp, null)];
        propSolid(L, px, pz, 0.14, 'lamp', pv);
        const [lx, lz] = at(-0.61, -0.25);
        B.lights.push({ x: lx, y: 1.25, z: lz + 0.2, col: new THREE.Color(0xffc070), int: 3, dist: 6.5, fl: 0.25, ph: rnd() * 9 });
        glowAt(B, lx, lz + 0.3, 2.2, 0xffc070, 0.35);
      }
      B.lights.push({ x: cx, y: 1.0, z: cz, col: new THREE.Color(0x7ae8ff), int: 3.2, dist: 6, fl: 0, ph: 0 });
      glowAt(B, cx, cz, 2.2, 0x7ae8ff, 0.4);
      for (let n = 0; n < 4; n++) { const [gx, gz] = at((rnd() - 0.5) * 1.6, 0.9 + rnd() * 1.4); if (isFloor(L, gx, gz)) dec(B, 'glow', crystalGeo(Math.floor(rnd() * 8)), mat4(gx, -0.03, gz, rnd() * TAU, 0.3 + rnd() * 0.15), null); }
      out.cart = { x: cx, z: cz };
    }
  }
  // ── Volcano: lava (drawn by the floor shader), basalt boulders + columns, glossy obsidian and glowing fire gems, steam vents with
  //    cute puffs, fire flowers, rising embers, warm lava light, paved bridges, and the boss arena's lava moat with cliffs and little
  //    lavafalls. Bright and cheerful: warm sun, peach fog, nothing dark or spiky. ──
  KIND.basaltC = { mat: 'rock', shadow: 'near', geo() {   // a cluster of hexagonal basalt columns (≈1 m tall at scale 1), flat tops
    const k = new Kit(), rnd = mulberry32(3300);
    for (const [x, z, h, r] of [[0, 0, 1.0, 0.34], [0.52, 0.12, 0.8, 0.3], [-0.46, 0.2, 0.72, 0.3], [0.1, -0.5, 0.64, 0.28], [0.2, 0.55, 0.88, 0.29], [-0.32, -0.42, 0.55, 0.26], [-0.64, -0.16, 0.46, 0.24]]) {
      const ry = rnd() * 1.05;
      k.add(G.cyl(1, 1, 6), 0xffffff, [x, h / 2 - 0.06, z], [0, ry, 0], [r, h + 0.12, r]);
      k.add(G.cyl(0.8, 1, 6), 0xf0e8e2, [x, h + 0.025, z], [0, ry, 0], [r, 0.05, r]);   // chamfered top
    }
    return k.build();
  } };
  function gemGeo(v, warm) {   // chunky crystal clusters with blunt tops: glossy obsidian (decor 'shiny') or glowing fire gems ('glow')
    const key = (warm ? 'fgem' : 'obs') + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), rnd = mulberry32((warm ? 3500 : 3400) + v * 7);
    const lo = new THREE.Color(warm ? [0xff7a2a, 0xff5a6a, 0xffa030, 0xff8a50][v % 4] : 0x1e1828), hi = new THREE.Color(warm ? [0xffe070, 0xffb0c0, 0xfff0a0, 0xffd090][v % 4] : 0x8a74c4);
    const n = 3 + (v % 3);
    for (let i = 0; i < n; i++) {
      const h = (i ? 0.34 + rnd() * 0.36 : 0.82) * (1 + (v % 2) * 0.2), r = h * (warm ? 0.22 : 0.3), a = rnd() * TAU, tl = i ? 0.25 + rnd() * 0.35 : 0.06;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(a) * tl, rnd() * TAU, Math.sin(a) * tl));
      const facet = (x, z) => (Math.sin(x * 41.3 + z * 29.7) > 0 ? 1 : 0.7);   // alternate light / dark edges: reads as facets, even unlit
      const col = (x, y, z) => (warm ? lo.clone().lerp(hi, clamp(y / (h * 1.05), 0, 1)).multiplyScalar((0.4 + 0.75 * clamp(y / h, 0, 1)) * facet(x, z)) : lo.clone().lerp(hi, clamp(y / (h * 1.15), 0, 1) * 0.75 + Math.sin(x * 37 + y * 23) * 0.05));
      k.push([Math.cos(a) * 0.13 * (i > 0), 0, Math.sin(a) * 0.13 * (i > 0)], q);
      k.add(G.cyl(1, 1, 6), col, [0, h * 0.4, 0], 0, [r, h * 0.8, r]);
      k.add(G.cyl(0.42, 1, 6), col, [0, h * 0.88, 0], 0, [r, h * 0.16, r]);   // a blunt, rounded-looking top (no spikes)
      k.pop();
    }
    return (R.geo[key] = keep(k.build()));
  }
  function ventData() {   // a little basalt cone with a crater (rock material) and its glowing heart (glow)
    if (R.geo.vent) return R.geo.vent;
    const pts = [[0.001, 0.13], [0.12, 0.14], [0.17, 0.3], [0.24, 0.33], [0.42, 0.22], [0.62, 0.07], [0.72, 0]].map(p => new THREE.Vector2(p[0], p[1]));
    const k = new Kit(), g = new Kit(), rnd = mulberry32(3600);
    k.add(new THREE.LatheGeometry(pts, 14), (x, y) => new THREE.Color(0.62 + y * 0.9, 0.56 + y * 0.8, 0.54 + y * 0.75));
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rnd(), d = 0.62 + rnd() * 0.2; k.add(rockSGeo(), 0xd8d0cc, [Math.cos(a) * d, 0.02, Math.sin(a) * d], [rnd(), rnd() * 6, rnd()], [0.12 + rnd() * 0.07, 0.08, 0.1 + rnd() * 0.06]); }
    g.add(G.cyl(1, 1, 14), 0xffa040, [0, 0.14, 0], 0, [0.14, 0.02, 0.14]);
    g.add(G.torus(TAU, 0.3, 14), 0xff7a2a, [0, 0.29, 0], [Math.PI / 2, 0, 0], [0.19, 0.19, 0.19]);
    return (R.geo.vent = { rock: keep(k.build()), glow: keep(g.build()) });
  }
  function fireFlowerData(v) {   // stem + leaves + flame-coloured petals (decor, no wind: it's warm and still) and a glowing heart
    const key = 'ffl' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), g = new Kit(), h = 0.27 + (v % 2) * 0.08, pc = [[0xff5a1a, 0xffa020], [0xff3a5a, 0xff9040], [0xff9a10, 0xffd84a]][v % 3];
    const petal = R.geo.petalStill || (R.geo.petalStill = keep(markUV(petalDisc().clone(), 0)));
    k.add(G.cyl(1, 1, 4, true), 0x5a8a3a, [0, h / 2, 0], 0, [0.016, h, 0.016]);
    k.add(G.octa(), 0x6aa844, [0.05, h * 0.35, 0], [0, 0, -0.7], [0.08, 0.016, 0.035]);
    k.add(G.octa(), 0x62a040, [-0.045, h * 0.55, 0.01], [0, 0.4, 0.7], [0.07, 0.014, 0.03]);
    k.add(petal, pc[0], [0, h, 0], [0.2, v, 0.1], 0.13);
    k.add(petal, pc[1], [0, h + 0.018, 0], [0.2, v + 0.6, 0.1], 0.085);
    g.add(G.sphere(8, 6), 0xffd060, [0, h + 0.035, 0], 0, [0.036, 0.026, 0.036]);
    return (R.geo[key] = { decor: keep(k.build()), glow: keep(g.build()) });
  }
  // Little lavafalls pouring from the arena cliffs into the moat: curved ribbons, one mesh for all of them
  const LAVAFALL_VS = `attribute vec2 aF; varying vec2 vF; varying float vFogD;
    void main() { vF = aF; vec4 mv = modelViewMatrix * vec4(position, 1.0); vFogD = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const LAVAFALL_FS = `uniform float uTime, fogNear, fogFar; uniform vec3 fogColor; uniform sampler2D tNoise, tLava; varying vec2 vF; varying float vFogD;
    void main() {
      float x = vF.x, v = vF.y;   // x: 0..1 across · v: metres down from the lip (+ a phase)
      float e = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
      float s2 = texture2D(tNoise, vec2(x * 1.7 + 0.6, v * 0.3 - uTime * 0.7)).g;
      if (e * (0.85 + 0.5 * s2) < 0.3) discard;   // a wobbly edge
      vec3 lc = texture2D(tLava, vec2(x * 0.55 + v * 0.01, v * 0.028 - uTime * 0.1)).rgb;   // the lake's lava, stretched into falling streaks
      float h = dot(lc, vec3(0.45, 0.45, 0.1));
      vec3 col = lc * (0.7 + 1.6 * h * h) * (0.8 + 0.35 * s2) * mix(0.55, 1.0, e);
      col = mix(col, fogColor, smoothstep(fogNear, fogFar, vFogD));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;
  function lavafallMat() {
    return R.mat.lavafall || (R.mat.lavafall = keep(new THREE.ShaderMaterial({
      uniforms: Object.assign({ uTime: TIME.u, tNoise: { value: texOK() && TEX.noise ? TEX.noise : blackTex() }, tLava: { value: surf('lava').map } }, THREE.UniformsUtils.clone(THREE.UniformsLib.fog)),
      vertexShader: LAVAFALL_VS, fragmentShader: LAVAFALL_FS, side: THREE.DoubleSide, fog: true,
    })));
  }
  function finishLavafalls(B) {
    const list = B.falls;
    if (!list || !list.length) return;
    const NR = 12, NC = 5, pos = [], fa = [], idx = [];
    for (const f of list) {   // f: base (x, z), facing yaw (toward +z locally), height h, width w
      const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw), v0 = pos.length / 3;
      for (let r = 0; r <= NR; r++) {
        const t = r / NR, y = f.h * (1 - Math.pow(t, 1.25)), back = -1.25 * Math.pow(1 - t, 2) - 0.05, w = f.w * (0.78 + 0.3 * t);
        for (let c = 0; c <= NC; c++) {
          const u = c / NC, lx = (u - 0.5) * w + Math.sin(t * 7 + f.ph + u * 3) * 0.03, lz = back + Math.sin(u * Math.PI) * 0.08;
          pos.push(f.x + lx * cs + lz * sn, y, f.z - lx * sn + lz * cs);
          fa.push(u, t * f.h * 1.25 + f.ph);
        }
      }
      for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) { const a = v0 + r * (NC + 1) + c, b = a + NC + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aF', new THREE.Float32BufferAttribute(fa, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    B.dispose.push(g);
    const m = new THREE.Mesh(g, lavafallMat()); m.name = 'lavafalls'; m.renderOrder = 1;
    B.g.add(m);
  }
  function buildVolcano(L, B) {
    const rnd = B.rnd, W = L.W, H = L.H, grid = L.grid, dW = L.dWall, V = L._volc || volcanoField(L), M = L._mask;
    const dF = L._dF = chamfer(W, H, grid, 1);
    const pick = a => a[Math.floor(rnd() * a.length)];
    const lavaAt = (x, z) => V.lava[clamp(Math.floor(z * V.P), 0, V.MH - 1) * V.MW + clamp(Math.floor(x * V.P), 0, V.MW - 1)];
    const cellOf = (x, z) => { const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
    const maskAt = (x, z, ch) => { const px = clamp(Math.floor(x * MPX), 0, M.W - 1), py = clamp(Math.floor(z * MPX), 0, M.H - 1); return M.data[(py * M.W + px) * 4 + ch] / 255; };
    const gapAt = (x, z) => southGap(L, x, z), capAt = g => southCap(g, 0.6, 1.0);
    const ar = V.arena, inArena = (x, z, pad = 0) => !!ar && inRoom(ar, x, z, pad);
    const tint = () => lin(pick([0x857672, 0x7a6e6c, 0x8e7e78, 0x746868, 0x94847c]), 0.8 + rnd() * 0.28);
    const tintC = () => lin(pick([0x6e6260, 0x645a5a, 0x76686a]), 0.85 + rnd() * 0.25);   // basalt columns: darker
    const busy = (x, z, pad) => (L.exit && hyp(L.exit.x - x, L.exit.z - z) < 3.4 + pad) || L.checkpoints.some(q => hyp(q.x - x, q.z - z) < 2.4 + pad) ||
      L.chests.some(q => hyp(q.x - x, q.z - z) < 1.3 + pad) || L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + pad) || (L.start && hyp(L.start.x - x, L.start.z - z) < 1.5 + pad) ||
      (L.boss && hyp(L.boss.x - x, L.boss.z - z) < 4 + pad);
    const RS = L.volcDecor = { rocks: 0, cols: 0, islands: 0, gems: 0, vents: 0, flowers: 0, lights: 0, embers: 0, falls: 0, bridges: V.bridges.length };   // tests / debugging
    const RG = [rockGeo(0), rockGeo(1), rockGeo(2), rockSGeo()], rTop = RG.map(g => { if (!g.boundingBox) g.computeBoundingBox(); return g.boundingBox.max.y + 0.22; });
    const nearLava = (x, z, r) => { let m = lavaAt(x, z); for (let k = 0; k < 8; k++) m = Math.max(m, lavaAt(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r)); return m; };
    const nearLavaMin = (x, z, r) => { let m = lavaAt(x, z); for (let k = 0; k < 8; k++) m = Math.min(m, lavaAt(x + Math.cos(k * 0.785) * r, z + Math.sin(k * 0.785) * r)); return m; };
    const rock = (x, z, s, sy, sz, tilt, small) => {
      const k = small ? 3 : Math.floor(rnd() * 3);
      inst(B, small ? 'rockS' : 'rock' + k, mat4(x, 0.22 * sy, z, rnd() * TAU, s, sy, sz, (rnd() - 0.5) * tilt, (rnd() - 0.5) * tilt), tint());
      RS.rocks++;
      return rTop[k] * sy;
    };
    // basalt ground: boulders, columns (tall only where they hide no floor), a low band on the camera side; small islets in the lava
    for (let z0 = 0; z0 < H; z0 += 1.9) for (let x0 = 0; x0 < W; x0 += 1.9) {
      const x = x0 + rnd() * 1.75, z = z0 + rnd() * 1.75, c = cellOf(x, z);
      if (c < 0 || grid[c]) continue;
      const d = dF[c], lv = lavaAt(x, z), g = gapAt(x, z);
      if (d < 0.6 || d > 12.5 || (V.dA && V.dA[c] < 5.4 && lv <= 0.35)) continue;
      if (lv > 0.35) {   // an islet now and then (low, round)
        if (d > 1.8 && rnd() < 0.045 && !inArena(x, z, -4.2)) { const s = 0.45 + rnd() * 0.45; rock(x, z, s, Math.min(s * 0.5, capAt(g) * 0.8 / rTop[3]), s * (0.8 + rnd() * 0.4), 0.1, true); RS.islands++; }
        continue;
      }
      if (d > 5.5 && rnd() < (d > 8.5 ? 0.5 : 0.3)) continue;
      if (nearLava(x, z, 0.9) > 0.5) continue;   // the lava shores stay open (bridges, moat)
      if (g <= 5) {   // camera side: low and round
        const s = 0.6 + rnd() * 0.45, sz = s * (0.8 + rnd() * 0.4);
        if (nearLava(x, z, s + 0.3) > 0.5) continue;
        rock(x, z, s, Math.max(0.2 * s, Math.min(s * (0.5 + rnd() * 0.5), capAt(g) / rTop[0])), sz, 0.14);
        continue;
      }
      if (d > 1.1 && d < 6.5 && rnd() < 0.4) {   // basalt columns
        const s = 0.8 + rnd() * 0.6;
        let hy = 0;
        if (nearLava(x, z, 0.8 * s + 0.3) > 0.5) continue;
        for (const h of [3.2, 2.4, 1.7, 1.1, 0.7]) if (!hides(L, x, z, 0.8 * s, 0, h, 0.2)) { hy = h; break; }
        if (hy && hy <= southCap(g, 0.6, 1.0) + 1e-6) { inst(B, 'basaltC', mat4(x, 0, z, rnd() * TAU, s, hy * (0.85 + rnd() * 0.2), s), tintC()); RS.cols++; continue; }
      }
      const s = d < 2 ? 0.95 + rnd() * 0.7 : d > 7 ? 1.9 + rnd() * 1.3 : 1.4 + rnd() * 1.1, sz = s * (0.8 + rnd() * 0.4);
      if (nearLava(x, z, Math.max(s, sz) + 0.3) > 0.5) continue;
      let hy = 1.1 + rnd() * 0.7;
      for (const h of [hy, 0.75, 0.45, 0.3]) { hy = h; if (!hides(L, x, z, s, 0, 1.45 * s * h, 0.15)) break; }
      rock(x, z, s, s * hy, sz, 0.25);
    }
    // fill the basalt ground near the floor with small stones (the lava needs none)
    for (let z0 = 0; z0 < H; z0 += 1.3) for (let x0 = 0; x0 < W; x0 += 1.3) {
      const x = x0 + rnd() * 1.2, z = z0 + rnd() * 1.2, c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 4 || dF[c] < 0.7 || lavaAt(x, z) > 0.2 || (V.dA && V.dA[c] < 5.4) || rnd() < 0.55 || nearLava(x, z, 0.7) > 0.5) continue;
      const s = 0.4 + rnd() * 0.3;
      rock(x, z, s, Math.min(s * (0.5 + rnd() * 0.4), capAt(gapAt(x, z)) / rTop[3]), s * (0.8 + rnd() * 0.4), 0.14, true);
    }
    // obsidian clusters and glowing fire gems on the basalt ground next to the floor (fire gems light their surroundings)
    const gems = [];
    for (let n = 0; n < W * H / 10 && gems.length < 34; n++) {
      const x = rnd() * W, z = rnd() * H, c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 4 || dF[c] < 0.5 || lavaAt(x, z) > 0.3) continue;
      if (gems.some(q => hyp(q[0] - x, q[1] - z) < 4.2)) continue;
      const warm = rnd() < 0.42, s = Math.min(0.85 + rnd() * 0.75, (capAt(gapAt(x, z)) + 0.25) / 1.05);
      if (s < 0.4 || hides(L, x, z, 0.35 * s, 0, 1.0 * s, 0.05)) continue;
      gems.push([x, z]);
      const v = Math.floor(rnd() * 6), m = mat4(x, -0.04, z, rnd() * TAU, s);
      dec(B, warm ? 'glow' : 'shiny', gemGeo(v, warm), m, warm ? lin(0xffffff, 0.55) : null);
      dec(B, 'rock', rockGeo(v % 3), mat4(x, 0, z, rnd() * TAU, 0.34 * s, 0.18 * s, 0.3 * s), lin(0x8a7a76));
      if (!warm && rnd() < 0.4) dec(B, 'glow', gemGeo(v + 1, true), mat4(x + 0.35 * s, -0.04, z + 0.2 * s, rnd() * TAU, s * 0.45), lin(0xffffff, 0.55));
      if (warm) {
        const col = new THREE.Color([0xffa040, 0xff7a8a, 0xffc050, 0xff9a60][v % 4]);
        B.lights.push({ x, y: 0.9, z: z + 0.2, col, int: 3.2, dist: 6, fl: 0, ph: rnd() * 10 });
        glowAt(B, x, z + 0.2, 2.2 + s, col, 0.5);
        for (let m2 = 0; m2 < 3; m2++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.7, y: 0.3 + rnd() * 0.7, z: z + (rnd() - 0.5) * 0.7, kind: 2, ph: rnd(), size: 0.15, prm: 0.3 + rnd() * 0.3, col: col.clone().multiplyScalar(2) });
      }
      RS.gems++;
    }
    // glowing fire-gem islets in the lava near the shores (low: the camera side has lots of lava)
    for (let n = 0, made = 0; n < W * H / 8 && made < 12; n++) {
      const x = rnd() * W, z = rnd() * H, c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 4.5 || dF[c] < 1.8 || lavaAt(x, z) < 0.85 || nearLavaMin(x, z, 1.0) < 0.6 || inArena(x, z, -5)) continue;
      if (gems.some(q => hyp(q[0] - x, q[1] - z) < 5) || linkDist(L, x, z) < 3) continue;
      const s = Math.min(0.6 + rnd() * 0.3, (capAt(gapAt(x, z)) + 0.2) / 0.95);
      if (s < 0.45 || hides(L, x, z, 0.45 * s, 0, 0.9 * s, 0.05)) continue;
      gems.push([x, z]); made++;
      rock(x, z, s, s * 0.45, s * 0.9, 0.08, true);
      const v = rnd() < 0.5 ? 0 : 2, col = new THREE.Color(v ? 0xffc050 : 0xffa040);
      dec(B, 'glow', gemGeo(v, true), mat4(x, 0.08, z, rnd() * TAU, s), lin(0xffffff, 0.6));
      glowAt(B, x, z, 1.8, col, 0.3);
      RS.gems++;
    }
    // steam vents on the basalt ground beside the floor: soft round puffs rising
    const vents = [];
    for (let n = 0; n < W * H / 8 && vents.length < 14; n++) {
      const x = rnd() * W, z = rnd() * H, c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 3.5 || dF[c] < 0.8 || lavaAt(x, z) > 0.15) continue;
      if (vents.some(q => hyp(q[0] - x, q[1] - z) < 7) || gems.some(q => hyp(q[0] - x, q[1] - z) < 1.6)) continue;
      const s = Math.min(0.9 + rnd() * 0.5, capAt(gapAt(x, z)) / 0.35);
      if (s < 0.5 || hides(L, x, z, 0.6 * s, 0, 0.35 * s, 0.1)) continue;
      vents.push([x, z]);
      const D = ventData(), m = mat4(x, 0, z, rnd() * TAU, s);
      dec(B, 'rock', D.rock, m, tint()); dec(B, 'glow', D.glow, m, lin(0xffffff, 0.9));
      glowAt(B, x, z, 1.6 * s, 0xff8a3c, 0.35);
      for (let p = 0; p < 6; p++) B.pts.norm.push({ x: x + (rnd() - 0.5) * 0.1, y: 0.32 * s, z: z + (rnd() - 0.5) * 0.1, kind: 7, ph: p / 6 + rnd() * 0.05, size: 0.62, prm: 0.2 + rnd() * 0.04, col: lin(0xfff6f0, 1.0) });
      for (let p = 0; p < 2; p++) B.pts.add.push({ x, y: 0.3 * s, z, kind: 9, ph: rnd(), size: 0.09, prm: 0.3 + rnd() * 0.2, col: lin(0xffa040, 2.6) });
      RS.vents++;
    }
    // inside the rooms, against a wall (never in a corridor, never hiding floor, leaving a real gap or none): glowing fire-gem
    // clusters and little steam vents; they block like the cave's crystals
    const roomSpot = (x, z, r, h) => !inArena(x, z, -1.5) && linkDist(L, x, z) >= 2.5 && gapOKL(L, x, z, r) && hiddenBehind(L, x, z, r, h) === 0 &&
      !L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + r + 1.1) && !L.spawns.some(q => hyp(q.x - x, q.z - z) < 1.6) &&
      !L.chests.some(q => hyp(q.x - x, q.z - z) < 2.5) && !L.checkpoints.some(q => hyp(q.x - x, q.z - z) < 3) && !(L.exit && hyp(L.exit.x - x, L.exit.z - z) < 4) &&
      !L.path.some(p => hyp(p.x - x, p.z - z) < 2.8);
    for (let n = 0, nIn = 0, nV = 0; n < W * H / 12 && (nIn < 9 || nV < 5); n++) {
      const x = rnd() * W, z = rnd() * H, c = cellOf(x, z);
      if (c < 0 || !grid[c] || dW[c] > 1.3 || dW[c] < 0.85) continue;
      const vent = nV < 5 && rnd() < 0.35;
      if (vent ? vents.some(q => hyp(q[0] - x, q[1] - z) < 6) : (nIn >= 9 || gems.some(q => hyp(q[0] - x, q[1] - z) < 4.5))) continue;
      const s = vent ? 0.75 + rnd() * 0.3 : 0.8 + rnd() * 0.6, r = vent ? 0.55 * s : 0.3 * s + 0.1;
      if (!roomSpot(x, z, r, vent ? 0.4 * s : 1.0 * s)) continue;
      if (vent) {
        vents.push([x, z]); nV++;
        const D = ventData(), m = mat4(x, 0, z, rnd() * TAU, s);
        propSolid(L, x, z, r, 'vent', [dec(B, 'rock', D.rock, m, tint()), dec(B, 'glow', D.glow, m, lin(0xffffff, 0.9))]);
        glowAt(B, x, z, 1.6 * s, 0xff8a3c, 0.35);
        for (let p = 0; p < 6; p++) B.pts.norm.push({ x, y: 0.32 * s, z, kind: 7, ph: p / 6 + rnd() * 0.05, size: 0.6, prm: 0.2 + rnd() * 0.04, col: lin(0xfff6f0, 1.0) });
        RS.vents++;
      } else {
        gems.push([x, z]); nIn++;
        const v = Math.floor(rnd() * 4), col = new THREE.Color([0xffa040, 0xff7a8a, 0xffc050, 0xff9a60][v]), m = mat4(x, -0.04, z, rnd() * TAU, s);
        propSolid(L, x, z, r, 'gem', [dec(B, 'glow', gemGeo(v, true), m, lin(0xffffff, 0.55)), dec(B, 'rock', rockGeo(v % 3), mat4(x, 0, z, rnd() * TAU, 0.34 * s, 0.18 * s, 0.3 * s), lin(0x8a7a76))]);
        B.lights.push({ x, y: 0.9, z: z + 0.25, col, int: 3.2, dist: 6, fl: 0, ph: rnd() * 10 });
        glowAt(B, x, z + 0.3, 2.3 + s, col, 0.5);
        for (let m2 = 0; m2 < 3; m2++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.7, y: 0.3 + rnd() * 0.7, z: z + (rnd() - 0.5) * 0.7, kind: 2, ph: rnd(), size: 0.15, prm: 0.3 + rnd() * 0.3, col: col.clone().multiplyScalar(2) });
        RS.gems++;
      }
    }
    // fire flowers: small patches along the floor's edges (off the path) and on the basalt ground next to it
    const nPatch = Math.round(W * H / 90);
    for (let n = 0; n < nPatch; n++) {
      const x = 1 + rnd() * (W - 2), z = 1 + rnd() * (H - 2), c = cellOf(x, z);
      if (c < 0) continue;
      const onF = grid[c] === 1;
      if (onF ? (dW[c] > 2.6 || maskAt(x, z, 0) > 0.3 || maskAt(x, z, 2) > 0.3 || busy(x, z, 0.6) || inArena(x, z, 1.5)) : (dF[c] > 1.6 || lavaAt(x, z) > 0.2 || B.noDec[c])) continue;
      const cnt = 3 + Math.floor(rnd() * 4), v0 = Math.floor(rnd() * 3);
      for (let m = 0; m < cnt; m++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.8, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, cc = cellOf(px, pz);
        if (cc < 0 || B.noDec[cc] || lavaAt(px, pz) > 0.1) continue;
        const D = fireFlowerData(rnd() < 0.7 ? v0 : Math.floor(rnd() * 3)), mm = mat4(px, 0, pz, rnd() * TAU, 1.1 + rnd() * 0.5);
        dec(B, 'decor', D.decor, mm, null); dec(B, 'glow', D.glow, mm, lin(0xffffff, 0.55));
        RS.flowers++;
      }
    }
    // dark pebbles along the walls
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const c = j * W + i;
      if (!grid[c] || dW[c] > 2 || rnd() > 0.035) continue;
      dec(B, 'decor', pebbleGeo(1 + Math.floor(rnd() * 2)), mat4(i + rnd(), 0, j + rnd(), rnd() * TAU, 1), lin(0xa89c98));
    }
    // warm light from the lava along the shores (the 4 pooled torch lights pick the nearest), embers rising, bubbles glinting
    const lit = [];
    for (const [i, j] of shuffle((() => { const o = []; for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) if (grid[j * W + i] && dW[j * W + i] <= 1.6) o.push([i, j]); return o; })(), rnd)) {
      const x = i + 0.5, z = j + 0.5;
      if (lit.some(q => hyp(q[0] - x, q[1] - z) < 6.5)) continue;
      let best = null;
      for (let a = 0; a < 8 && !best; a++) { const dx = Math.cos(a * TAU / 8), dz = Math.sin(a * TAU / 8); if (lavaAt(x + dx * 1.8, z + dz * 1.8) > 0.6) best = [x + dx * 1.8, z + dz * 1.8]; }
      if (!best) continue;
      lit.push([x, z]);
      B.lights.push({ x: best[0], y: 0.55, z: best[1], col: new THREE.Color(0xff7a34), int: 3.4, dist: 7.5, fl: 0.14, ph: rnd() * 10 });
      RS.lights++;
    }
    for (let n = 0, tries = 0; n < 190 && tries < 6000; tries++) {
      const x = rnd() * W, z = rnd() * H, c = cellOf(x, z);
      if (c < 0 || grid[c] || dF[c] > 6 || lavaAt(x, z) < 0.7) continue;
      B.pts.add.push({ x, y: 0.05, z, kind: 9, ph: rnd(), size: 0.07 + rnd() * 0.06, prm: 0.14 + rnd() * 0.16, col: lin(pick([0xffa040, 0xffc060, 0xff7a30]), 2.6) });
      if (n % 3 === 0) B.pts.add.push({ x: x + rnd() - 0.5, y: 0.04, z: z + rnd() - 0.5, kind: 2, ph: rnd(), size: 0.14, prm: 0.25 + rnd() * 0.25, col: lin(0xffc070, 1.8) });
      n++; RS.embers++;
    }
    // paved bridges: low parapet stones along both edges, little lamp posts at the ends
    for (const b of V.bridges) {
      for (const sd of [1, -1]) {
        const P = b.pts;
        for (let i = 0; i < P.length; i++) {
          const q = P[i], e = sd > 0 ? q.e1 : q.e2, nx = q.nx * sd, nz = q.nz * sd, x = q.x + nx * (e + 0.24), z = q.z + nz * (e + 0.24), ry = Math.atan2(q.nx, q.nz);
          const end = i === 0 || i === P.length - 1;
          if (end) {
            dec(B, 'stone', G.rbox(), mat4(x, 0.3, z, ry, 0.42, 0.6, 0.42), lin(0xd8ccc4));
            dec(B, 'glow', G.sphere(12, 8), mat4(x, 0.72, z, 0, 0.13), lin(0xffb050, 1.1));
            glowAt(B, x, z, 1.4, 0xffa050, 0.3);
          } else dec(B, 'stone', G.rbox(), mat4(x, 0.13, z, ry, 0.62, 0.28, 0.38), lin(pick([0xcfc2ba, 0xc4b8b0, 0xd8ccc4])));
        }
      }
      for (const q of b.pts) { const c = cellOf(q.x, q.z); if (c >= 0) B.noDec[c] = 1; }
    }
    // the boss arena: an island in a lava moat, basalt cliffs to the north with little lavafalls, glowing islets in the moat
    if (ar) {
      B.falls = [];
      const offs = [-0.95, -0.4, 0.4, 0.95];
      offs.splice(Math.floor(rnd() * 4), 1);
      for (const o of offs) {
        const a = -Math.PI / 2 + o, dx = Math.cos(a), dz = Math.sin(a);
        let r = ar.r * 0.8;
        while (r < ar.r + 12 && (V.dA ? V.dA[cellOf(ar.x + dx * r, ar.z + dz * r)] < 4.7 : r < ar.r + 4.7)) r += 0.25;
        const x = ar.x + dx * r, z = ar.z + dz * r;
        if (lavaAt(x - dx * 0.6, z - dz * 0.6) < 0.5) continue;
        let h = 2.6 + rnd() * 0.8;
        while (h > 1.4 && hides(L, x, z, 0.7, 0, h + 0.5, 0.1)) h -= 0.3;
        if (h <= 1.4) continue;
        const yaw = Math.atan2(-dx, -dz);   // local +z faces the arena
        B.falls.push({ x, z, yaw, h, w: 1.5 + rnd() * 0.5, ph: rnd() * 5 });
        // the cliff behind it: a big basalt column cluster + boulders at its sides
        const bx = x + dx * 2.0, bz = z + dz * 2.0;
        inst(B, 'basaltC', mat4(bx, 0, bz, rnd() * TAU, 1.35, h + 0.5, 1.35), tintC());
        for (const sd of [-1, 1]) { const px = bx - dz * sd * 1.6 - dx * 0.3, pz = bz + dx * sd * 1.6 - dz * 0.3; if (!hides(L, px, pz, 1.1, 0, (h + 0.2) * 0.9, 0.15)) inst(B, 'basaltC', mat4(px, 0, pz, rnd() * TAU, 1.1, (h + 0.2) * (0.7 + rnd() * 0.25), 1.1), tintC()); }
        // the splash: a bubbling glowing mound, steam and embers, a warm light
        dec(B, 'glow', R.geo.splash || (R.geo.splash = lumpy(1, 0.25, 3700, { flat: 0 })), mat4(x + dx * 0.05, -0.1, z + dz * 0.05, rnd() * TAU, 0.6, 0.26, 0.5), lin(0xff7a28, 0.5));
        for (let p = 0; p < 5; p++) B.pts.norm.push({ x: x + (rnd() - 0.5) * 0.6, y: 0.2, z: z + (rnd() - 0.5) * 0.4, kind: 7, ph: p / 5 + rnd() * 0.05, size: 0.75, prm: 0.22, col: lin(0xfff0e6, 1.0) });
        for (let p = 0; p < 7; p++) B.pts.add.push({ x: x + (rnd() - 0.5) * 0.8, y: 0.1, z: z + (rnd() - 0.5) * 0.5, kind: 9, ph: rnd(), size: 0.1, prm: 0.35 + rnd() * 0.3, col: lin(0xffb050, 2.8) });
        B.lights.push({ x: x - dx * 0.6, y: 1.2, z: z - dz * 0.6, col: new THREE.Color(0xff8a3c), int: 5, dist: 9, fl: 0.2, ph: rnd() * 10 });
        glowAt(B, x - dx * 1.2, z - dz * 1.2, 3.2, 0xff8a3c, 0.45);
        RS.falls++;
      }
      // on the island: a ring of fire-flower clumps around the fight (decor only), little glowing gem clusters along its lava shore
      RS.ring = 0;
      for (let a = rnd() * 0.4; a < TAU; a += 0.27 + rnd() * 0.14) {
        const r = ar.r * 0.74 + (rnd() - 0.5) * 0.9, x = ar.x + Math.cos(a) * r, z = ar.z + Math.sin(a) * r, c = cellOf(x, z);
        if (c < 0 || !grid[c] || dW[c] < 1.6 || linkDist(L, x, z) < 2.6 || busy(x, z, 0.6) || maskAt(x, z, 0) > 0.3 || maskAt(x, z, 2) > 0.3) continue;
        const n = 4 + Math.floor(rnd() * 3), v0 = Math.floor(rnd() * 3);
        for (let m = 0; m < n; m++) {
          const px = x + (rnd() - 0.5) * 1.1, pz = z + (rnd() - 0.5) * 1.1;
          const D = fireFlowerData(rnd() < 0.75 ? v0 : Math.floor(rnd() * 3)), mm = mat4(px, 0, pz, rnd() * TAU, 1.3 + rnd() * 0.55);
          dec(B, 'decor', D.decor, mm, null); dec(B, 'glow', D.glow, mm, lin(0xffffff, 0.55));
          RS.flowers++;
        }
        RS.ring++;
      }
      for (let a = rnd() * 0.5; a < TAU; a += 0.42 + rnd() * 0.3) {
        let r = ar.r * 0.8;
        const dx = Math.cos(a), dz = Math.sin(a);
        while (r < ar.r + 4 && isFloor(L, ar.x + dx * r, ar.z + dz * r)) r += 0.2;
        const x = ar.x + dx * (r + 0.2), z = ar.z + dz * (r + 0.2);   // just past the walkable edge, on the moat's shore (Feza can't walk into it)
        if (isFloor(L, x, z) || r >= ar.r + 4 || nearLava(x, z, 1.3) < 0.5 || linkDist(L, x, z) < 3 || busy(x, z, 0.4) || gems.some(q => hyp(q[0] - x, q[1] - z) < 2.2)) continue;
        const s = Math.min(0.55 + rnd() * 0.3, (capAt(gapAt(x, z)) + 0.2) / 1.05);
        if (s < 0.35) continue;
        gems.push([x, z]);
        const v = Math.floor(rnd() * 4), col = new THREE.Color([0xffa040, 0xff7a8a, 0xffc050, 0xff9a60][v]);
        dec(B, 'glow', gemGeo(v, true), mat4(x, -0.03, z, rnd() * TAU, s), lin(0xffffff, 0.55));   // (no rock base: fewer draw calls)
        glowAt(B, x, z, 1.5, col, 0.35);
        RS.gems++; RS.ring++;
      }
      // glowing islets in the moat (low; the camera side too)
      for (let k = 0, made = 0; k < 40 && made < 5; k++) {
        const a = rnd() * TAU, dx = Math.cos(a), dz = Math.sin(a);
        let r = ar.r * 0.8;
        while (r < ar.r + 10 && isFloor(L, ar.x + dx * r, ar.z + dz * r)) r += 0.25;
        r += 1.9 + rnd() * 1.2;
        const x = ar.x + dx * r, z = ar.z + dz * r;
        if (lavaAt(x, z) < 0.8 || linkDist(L, x, z) < 3.5 || gems.some(q => hyp(q[0] - x, q[1] - z) < 3.5)) continue;
        const s = 0.6 + rnd() * 0.3;
        if (hides(L, x, z, 0.5 * s, 0, 0.75 * s, 0.05)) continue;
        gems.push([x, z]); made++;
        rock(x, z, s, s * 0.45, s * 0.9, 0.08, true);
        dec(B, 'glow', gemGeo(rnd() < 0.5 ? 0 : 2, true), mat4(x, 0.08, z, rnd() * TAU, 1.0 * s), lin(0xffffff, 0.6));
        glowAt(B, x, z, 2.0, 0xffb050, 0.3);
      }
    }
    // soft warm motes in the air
    for (let n = 0; n < 50; n++) {
      const x = rnd() * W, z = rnd() * H;
      if (!grid[Math.floor(z) * W + Math.floor(x)]) continue;
      B.pts.add.push({ x, y: 0.6 + rnd() * 2.2, z, kind: 1, ph: rnd(), size: 0.07, prm: 0.5 + rnd() * 0.5, col: lin(0xffd0a0, 1.1) });
    }
  }
  // ── Castle: brick wall blocks (tall N/E/W, low caps on the camera side), pillars, banners, rose window ──
  KIND.wallT = { mat: 'brick', shadow: 'near', geo() { const k = new Kit(); k.add(G.box(), 0xf2eefa, [0, 1.3, 0], 0, [1, 2.6, 1]); k.add(G.box(), 0xffffff, [0, 2.68, 0], 0, [1.04, 0.16, 1.04]); return k.build(); } };
  KIND.wallTM = { mat: 'brick', shadow: 'near', geo() { const k = new Kit(); k.add(G.box(), 0xf2eefa, [0, 1.3, 0], 0, [1, 2.6, 1]); k.add(G.box(), 0xffffff, [0, 2.68, 0], 0, [1.04, 0.16, 1.04]); k.add(G.box(), 0xf6f2ff, [0, 3.0, 0], 0, [0.52, 0.5, 0.52]); return k.build(); } };
  KIND.wallL = { mat: 'brick', shadow: 'near', geo() { const k = new Kit(); k.add(G.box(), 0xf2eefa, [0, 0.26, 0], 0, [1, 0.52, 1]); k.add(G.box(), 0xffffff, [0, 0.58, 0], 0, [1.05, 0.12, 1.05]); return k.build(); } };
  KIND.pillar = { mat: 'pillar', shadow: true, geo() {
    const k = new Kit(), c = 0xece6fa, g = 0xfff4d8;
    k.add(G.box(), c, [0, 0.13, 0], 0, [0.96, 0.26, 0.96]);
    k.add(G.cyl(1, 1, 20), c, [0, 0.33, 0], 0, [0.44, 0.14, 0.44]);
    k.add(G.torus(TAU, 0.3, 20), c, [0, 0.42, 0], [Math.PI / 2, 0, 0], [0.37, 0.37, 0.37]);
    k.add(G.cyl(1, 1, 20), c, [0, 1.62, 0], 0, [0.31, 2.4, 0.31]);
    k.add(G.torus(TAU, 0.25, 20), g, [0, 2.82, 0], [Math.PI / 2, 0, 0], [0.34, 0.34, 0.34]);
    k.add(G.cyl(1.5, 1, 20), c, [0, 2.98, 0], 0, [0.31, 0.26, 0.31]);
    k.add(G.box(), c, [0, 3.2, 0], 0, [0.98, 0.2, 0.98]);
    return k.build();
  } };
  function makePillarMat() {   // triplanar stone that dithers away when it stands between the camera and the hero
    const m = makeTriMat('rock', { aoH: 0.8, ao: 0.55, key: 'pillar', m: 2.2 });
    const U = m.userData.u;
    U.uHero = R.heroU;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.uHero = R.heroU;
      sh.vertexShader = sh.vertexShader.replace('varying vec3 vLvW;', 'varying vec3 vLvW; varying vec2 vLvC;')
        .replace('lvWp = modelMatrix * lvWp;', `lvWp = modelMatrix * lvWp;
          #ifdef USE_INSTANCING
            vLvC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          #else
            vLvC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          #endif
          `);
      sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vLvW;', 'varying vec3 vLvW; varying vec2 vLvC; uniform vec3 uHero;')
        .replace('vec3 lvN0 = normalize(vLvN);', `{ float dz = vLvC.y - uHero.z, dx = abs(vLvC.x - uHero.x);
            float fd = smoothstep(0.1, 0.8, dz) * smoothstep(4.2, 3.0, dz) * smoothstep(1.7, 1.0, dx) * smoothstep(0.35, 1.0, vLvW.y);
            if (fd > 0.0 && fd * 0.85 > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard; }
          vec3 lvN0 = normalize(vLvN);`);
    };
    m.userData.pkey = 'lv-pillar';
    return m;
  }
  function makeBannerMat(hue) {
    const m = new THREE.MeshStandardMaterial({ map: bannerTex(hue), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    if (texOK()) { m.normalMap = surf('fabric').normalMap; m.normalScale = new THREE.Vector2(0.6, 0.6); }
    lvShade(m, {
      key: 'banner', uniforms: { uTime: TIME.u }, vDecl: 'uniform float uTime;',
      vBegin: `{ vec3 lvIp = vec3(0.0);
        #ifdef USE_INSTANCING
          lvIp = instanceMatrix[3].xyz;
        #endif
        float k = 1.0 - uv.y; transformed.z += (sin(uTime * 1.6 + lvIp.x * 0.8 + uv.y * 3.0) * 0.05 + 0.03) * k * k; }`,
    });
    return keep(m);
  }
  // The dragon's treasure: loose coins (a darker rim around a bright raised face) and coin stacks on a low heap, a crown,
  // a few gems — all plain PBR, nothing emissive, so single coins read instead of a glowing blob
  function coinProto() {
    return R.geo.coinP || (R.geo.coinP = keep(mergeParts([{ geo: G.cyl(1, 1, 10), color: WHITE, m: new THREE.Matrix4() },
      { geo: R.geo.coinFace || (R.geo.coinFace = keep(new THREE.CircleGeometry(0.7, 10).rotateX(-Math.PI / 2))), color: WHITE, m: new THREE.Matrix4().makeTranslation(0, 0.53, 0) }])));
  }
  const COIN_FACE = [0xffd96a, 0xffe07a, 0xf6c850].map(c => new THREE.Color(c)), COIN_RIM = new THREE.Color(0xc98a22);
  function addCoin(k, x, y, z, rot, r, h, fi) {   // rim / face coloured by distance from the coin's own centre
    const face = COIN_FACE[fi % 3], lim = r * 0.8;
    k.add(coinProto(), (px, py, pz) => (hyp(px - x, pz - z) + Math.abs(py - y) * 0.2 > lim ? COIN_RIM : face), [x, y, z], rot, [r, h, r]);
  }
  function hoardGeo(v) {
    const key = 'hoard' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), g = new Kit(), rnd = mulberry32(1700 + v), mound = lumpy(1, 0.1, 1800 + v, { flat: -0.05 });
    const hgt = r => Math.max(0.03, 0.4 * (1 - (r / 1.3) ** 2));
    k.add(mound, 0x8a5c18, [0, -0.2, 0], 0, [1.28, 0.6, 1.08]);   // the heap under the coins (darker, so single coins read)
    for (let i = 0; i < 64; i++) {   // loose coins, tilted with the slope of the heap
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.28, h = hgt(r), tl = 0.2 + r * 0.3;
      addCoin(k, Math.cos(a) * r, h + 0.01, Math.sin(a) * r * 0.85, [Math.sin(a) * tl + (rnd() - 0.5) * 0.5, rnd() * 3, -Math.cos(a) * tl + (rnd() - 0.5) * 0.5], 0.085, 0.018, i);
    }
    for (let st = 0; st < 6; st++) {   // coin stacks around the heap
      const a = st * 1.05 + rnd() * 0.5, r = 0.7 + rnd() * 0.55, n = 4 + Math.floor(rnd() * 6), x = Math.cos(a) * r, z = Math.sin(a) * r * 0.85, y0 = hgt(r) * 0.55;
      for (let c = 0; c < n; c++) addCoin(k, x + (rnd() - 0.5) * 0.02, y0 + c * 0.032 + 0.016, z + (rnd() - 0.5) * 0.02, [0, rnd() * 3, 0], 0.09, 0.03, st + c);
    }
    k.add(G.torus(TAU, 0.12, 16), 0xffc94a, [0.1, 0.44, 0.1], [Math.PI / 2 - 0.3, 0, 0.2], [0.14, 0.14, 0.14]);   // a little crown on top
    for (let i = 0; i < 5; i++) k.add(G.cone(4), 0xffc94a, [0.1 + Math.cos(i * 1.26) * 0.14, 0.51, 0.1 + Math.sin(i * 1.26) * 0.12], [-0.3, 0, 0.2], [0.03, 0.08, 0.03]);
    const gems = [0xff7ad8, 0x5ef0ff, 0x7aff9a, 0xb07aff, 0xff5a5a];
    for (let i = 0; i < 7; i++) { const a = rnd() * TAU, r = Math.sqrt(rnd()) * 1.1; g.add(G.octa(), gems[i % 5], [Math.cos(a) * r, hgt(r) + 0.05, Math.sin(a) * r * 0.85], [rnd(), rnd(), rnd()], [0.07, 0.1, 0.07]); }
    return (R.geo[key] = { coins: keep(k.build()), gems: keep(g.build()) });
  }
  // Castle furniture
  function candelabraGeo() {   // gold stand (metal) + three wax candles; the flames are billboards added separately
    if (R.geo.candel) return R.geo.candel;
    const m = new Kit(), w = new Kit(), gd = 0xffc94a;
    m.add(MK(G.cyl(0.55, 1, 12)), gd, [0, 0.07, 0], 0, [0.26, 0.14, 0.26]);
    m.add(MK(G.cyl(1, 1, 10)), gd, [0, 0.74, 0], 0, [0.035, 1.3, 0.035]);
    m.add(MK(G.sphere(10, 8)), gd, [0, 0.52, 0], 0, [0.075, 0.08, 0.075]);
    m.add(MK(G.torus(Math.PI, 0.09, 14)), gd, [0, 1.36, 0], [0, 0, Math.PI], [0.3, 0.3, 0.3]);
    for (const x of [-0.3, 0, 0.3]) {
      const y = x ? 1.37 : 1.43;
      m.add(MK(G.cyl(1.3, 0.8, 10)), gd, [x, y, 0], 0, [0.06, 0.05, 0.06]);
      w.add(G.cyl(1, 1, 8), 0xfff4e2, [x, y + 0.12, 0], 0, [0.028, 0.2, 0.028]);
    }
    return (R.geo.candel = { metal: keep(m.build()), wax: keep(w.build()) });
  }
  function plantGeo(v) {   // glazed pot with a gold rim + a round leafy shrub (foliage material)
    const key = 'plant' + v;
    if (R.geo[key]) return R.geo[key];
    const p = new Kit(), f = new Kit(), pot = [0x5a7ae0, 0xe0845a, 0x4aa88a][v % 3];
    const lathe = R.geo.potLathe || (R.geo.potLathe = keep(new THREE.LatheGeometry([[0.001, 0], [0.19, 0], [0.26, 0.16], [0.29, 0.38], [0.26, 0.48], [0.3, 0.52], [0.29, 0.56], [0.001, 0.52]].map(q => new THREE.Vector2(q[0], q[1])), 16)));
    p.add(lathe, pot);
    p.add(G.torus(TAU, 0.12, 16), 0xffd35a, [0, 0.535, 0], [Math.PI / 2, 0, 0], [0.295, 0.295, 0.295]);
    p.add(G.torus(TAU, 0.08, 16), 0xffd35a, [0, 0.2, 0], [Math.PI / 2, 0, 0], [0.265, 0.265, 0.265]);
    const greens = [0x5fb444, 0x6cc04a, 0x4f9a3a, 0x7acb52];
    [[0, 0.95, 0, 0.36], [0.2, 0.8, 0.08, 0.26], [-0.19, 0.82, -0.06, 0.27], [0.02, 0.8, 0.2, 0.24], [0.04, 1.18, 0.02, 0.22]].forEach((c, i) =>
      f.add(leafBlob1(i % 3), greens[(i + v) % 4], [c[0], c[1], c[2]], [0.4 * i, i, 0], [c[3], c[3] * 0.92, c[3]]));
    if (v === 1) for (let i = 0; i < 7; i++) { const a = i * 0.9, e = 0.3 + (i % 3) * 0.3; f.add(G.sphere(6, 4), i % 2 ? 0xffb3d9 : 0xffffff, [Math.cos(a) * 0.3 * Math.cos(e), 0.95 + 0.3 * Math.sin(e), Math.sin(a) * 0.3 * Math.cos(e)], 0, 0.045); }
    return (R.geo[key] = { pot: keep(p.build()), leaves: keep(f.build()) });
  }
  function shieldGeo(v) {   // round wall shield facing +z: coloured face, gold rim and boss, a bright stripe
    const key = 'shield' + v;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), c = [[0x4a6ad8, 0xfff0c0], [0xd04a5a, 0xffe08a], [0x3aa88a, 0xfff4d0], [0x8a52d8, 0xffe08a]][v % 4];
    k.add(G.cyl(1, 1, 20), c[0], [0, 0, 0.03], [Math.PI / 2, 0, 0], [0.34, 0.05, 0.34]);
    k.add(G.box(), c[1], [0, 0, 0.056], [0, 0, v % 2 ? 0.785 : 0], [0.6, 0.1, 0.012]);
    if (v % 2) k.add(G.box(), c[1], [0, 0, 0.056], [0, 0, -0.785], [0.6, 0.1, 0.012]);
    k.add(G.torus(TAU, 0.09, 20), 0xffd35a, [0, 0, 0.056], 0, [0.335, 0.335, 0.335]);
    k.add(G.sphere(10, 8), 0xffe08a, [0, 0, 0.07], 0, [0.085, 0.085, 0.05]);
    return (R.geo[key] = keep(k.build()));
  }
  function knightGeo() {   // cute smiling toy-knight armour on a pedestal
    if (R.geo.knight) return R.geo.knight;
    const k = new Kit(), st = 0xe0e4ee, dk = 0x6a6e82, gd = 0xffd35a;
    k.add(G.rbox(), 0xd4cce6, [0, 0.15, 0], 0, [0.72, 0.3, 0.62]);
    for (const sx of [-1, 1]) {
      k.add(G.capsule(1, 8), st, [sx * 0.11, 0.6, 0], 0, [0.085, 0.2, 0.085]);
      k.add(G.sphere(10, 8), dk, [sx * 0.11, 0.35, 0.05], 0, [0.09, 0.055, 0.13]);
      k.add(G.sphere(12, 10), st, [sx * 0.24, 1.13, 0], 0, 0.1);
      k.add(G.capsule(1, 8), st, [sx * 0.27, 0.95, 0.02], [0, 0, sx * 0.15], [0.065, 0.15, 0.065]);
    }
    k.add(G.rbox(2), st, [0, 0.99, 0], 0, [0.36, 0.34, 0.25]);
    k.add(G.box(), gd, [0, 0.83, 0], 0, [0.37, 0.05, 0.26]);
    k.add(G.sphere(18, 14), st, [0, 1.37, 0], 0, [0.17, 0.19, 0.17]);
    for (const sx of [-1, 1]) {   // a friendly face on the helmet: dot eyes with a twinkle, rosy cheeks
      k.add(G.sphere(8, 6), 0x2a2034, [sx * 0.058, 1.4, 0.158], 0, [0.024, 0.032, 0.016]);
      k.add(G.sphere(6, 4), 0xffffff, [sx * 0.058 + 0.008, 1.41, 0.171], 0, 0.007);
      k.add(G.sphere(8, 6), 0xff9ab8, [sx * 0.105, 1.35, 0.13], [0, sx * 0.6, 0], [0.03, 0.02, 0.012]);
    }
    k.add(G.torus(Math.PI - 0.9, 0.2, 10), 0x2a2034, [0, 1.365, 0.166], [0, 0, Math.PI + 0.45], 0.042);   // smile
    k.add(G.sphere(10, 8), 0xe8506e, [0, 1.6, -0.04], [0.5, 0, 0], [0.06, 0.13, 0.15]);
    k.add(G.cyl(1, 1, 18), 0x5a7ae0, [0.21, 0.95, 0.17], [Math.PI / 2, 0, 0], [0.16, 0.035, 0.2]);
    k.add(G.torus(TAU, 0.15, 18), gd, [0.21, 0.95, 0.19], 0, [0.16, 0.2, 0.16]);
    k.add(G.octa(), gd, [0.21, 0.95, 0.2], 0, [0.06, 0.08, 0.03]);
    k.seg([-0.3, 0.32, 0.06], [-0.3, 1.95, 0.06], 0.02, 0x9a6a3a);
    k.add(G.cone(6), st, [-0.3, 2.02, 0.06], 0, [0.04, 0.14, 0.04]);
    return (R.geo.knight = keep(k.build()));
  }
  // Castle rooms alternate between the theme's lavender stone + purple rugs (style 1) and warm sandstone + red rugs (style 0):
  // treasure rooms, the boss hall (so the purple dragon stands out) and every other hall. Read by the floor shader.
  const roomStyle = (rm, ri) => (rm.kind === 'side' || rm.kind === 'boss' || (rm.kind === 'main' && ri % 2 === 1) ? 0 : 1);
  function buildCastle(L, B) {
    const rnd = B.rnd, W = L.W, H = L.H, grid = L.grid;
    const dF = L._dF = chamfer(W, H, grid, 1);
    const isPillar = new Set(L.pillars.map(p => p.j * W + p.i));
    // wall mass: tall brick blocks around the halls, low caps wherever a block would hide floor from the camera, and every other
    // non-floor cell of the level under a flat battlement roof (merged row runs), so no dark floor shows between the rooms
    const roofT = lin(0xb2a8cc);
    for (let j = 0; j < H; j++) {
      let run = -1;
      for (let i = 0; i <= W; i++) {
        let roof = false;
        if (i < W) {
          const c = j * W + i;
          if (!grid[c] && !isPillar.has(c)) {
            const d = dF[c], x = i + 0.5, z = j + 0.5;
            if (hides(L, x, z, 0.45, 0, 2.8, 0.05)) inst(B, 'wallL', mat4(x, 0, z));
            else if (d <= 2.3) inst(B, d > 1.5 && (i + j) % 2 === 0 ? 'wallTM' : 'wallT', mat4(x, 0, z));
            else roof = true;
          }
        }
        if (run >= 0 && (!roof || i % CHUNK === 0)) { dec(B, 'roofC', G.box(), mat4((run + i) / 2, 1.36, j + 0.5, 0, i - run, 2.72, 1), roofT); run = -1; }
        if (roof && run < 0) run = i;
      }
    }
    for (const p of L.pillars) inst(B, 'pillar', mat4(p.x, 0, p.z, 0));
    // north walls: a stained-glass window in the middle of each hall, bookshelves in the side rooms, banners between the torches
    const wallOK = (i, jw, half) => { for (let a = -half; a <= half; a++) if (grid[jw * W + i + a] || !grid[(jw + 1) * W + i + a]) return false; return true; };
    const used = [];
    const nearUsed = (x, z, d) => used.some(u => hyp(u[0] - x, u[1] - z) < d) || L.torches.some(t => hyp(t.x - x, t.z - z) < d);
    const last = L.rooms[L.Z.rooms - 1];
    if (L.crystalSpot) for (const ox of [-1.2, 0, 1.2]) used.push([L.crystalSpot.x + ox, last.z - last.hh]);   // rose window
    L.rooms.forEach((rm, ri) => {
      rm.style = roomStyle(rm, ri);
      if (rm.kind === 'boss') return;
      const jw = rm.z - rm.hh - 1, z = jw + 1;
      if (rm.kind === 'side') {
        const i = Math.floor(rm.x);
        if (!wallOK(i, jw, 1) || nearUsed(i + 0.5, z, 1.3) || L.chests.some(c => hyp(c.x - i - 0.5, c.z - z) < 2) || L.breakables.some(b => hyp(b.x - i - 0.5, b.z - z) < 1.5)) return;
        const sh = { x: i + 0.5, z: z + 0.27 };
        B.shelves.push(sh);
        used.push([i + 0.5, z]);
        for (const sd of [-0.45, 0.45]) propSolid(L, i + 0.5 + sd, z + 0.3, 0.42, 'shelf', [{ arr: B.shelves, item: sh }]);
        return;
      }
      let best = null;
      for (let x = rm.x - rm.hw + 2; x <= rm.x + rm.hw - 2; x++) {
        const i = Math.floor(x);
        if (!wallOK(i, jw, 1) || nearUsed(i + 0.5, z, 1.4)) continue;
        if (!best || Math.abs(i + 0.5 - rm.x) < Math.abs(best - rm.x)) best = i + 0.5;
      }
      if (best === null) return;
      const v = ri % 3;
      B.windows.push({ x: best, z, v });
      used.push([best, z]);
      for (const [n, sd] of [[0, -1], [1, 1]]) glowAt(B, best + sd * 0.3, z + 2.2, 2.3, GLASS_LIGHT[v][n], 0.7, 0.6, 1.3);
    });
    for (const rm of L.rooms) {
      const jw = rm.z - rm.hh - 1;
      for (let x = rm.x - rm.hw + 5; x < rm.x + rm.hw - 2; x += 5) {
        const i = Math.floor(x);
        if (!wallOK(i, jw, 1) || nearUsed(i + 0.5, jw + 1, 1.5)) continue;
        B.banners.push({ x: i + 0.5, z: jw + 1.07, hue: (i + jw) % 2, big: rm.kind === 'boss' });
      }
    }
    // toy-knight statues in the northern corners of the halls
    for (const rm of L.rooms) {
      if (rm.kind === 'boss' || rm.kind === 'start' || rm.hw < 6) continue;
      for (const sx of [-1, 1]) {
        const x = rm.x + sx * (rm.hw - 1.0), z = rm.z - rm.hh + 1.0, i = sx < 0 ? rm.x - rm.hw : rm.x + rm.hw - 1, j = rm.z - rm.hh;   // (i, j): corner floor cell
        if (!grid[j * W + i] || grid[(j - 1) * W + i] || grid[j * W + i + sx] || L.dWall[j * W + i] > 1.5) continue;
        if (L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + 1.3) || L.spawns.some(q => hyp(q.x - x, q.z - z) < 1.6) || L.torches.some(q => hyp(q.x - x, q.z - z) < 1.2)) continue;
        propSolid(L, x, z, 0.42, 'statue', [dec(B, 'shiny', knightGeo(), mat4(x, 0, z, sx > 0 ? -0.5 : 0.5), null)]);
      }
    }
    // furniture: candelabras (warm light pools) and potted plants against the north walls, shields on the side walls
    const warm = 0xffb060;
    const busy = (x, z, rr) => L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + rr) || L.spawns.some(q => hyp(q.x - x, q.z - z) < 1.6) ||
      L.torches.some(t => hyp(t.x - x, t.z - z) < 0.9) || B.banners.some(b => Math.abs(b.x - x) < 0.8 && Math.abs(b.z - z) < 1.2) ||
      used.some(u => hyp(u[0] - x, u[1] - z) < 1.3) || L.chests.some(c => hyp(c.x - x, c.z - z) < 1.8) || L.checkpoints.some(c => hyp(c.x - x, c.z - z) < 2.2) ||
      L.breakables.some(b => hyp(b.x - x, b.z - z) < 1.1) || linkDist(L, x, z) < 2.2;
    L.rooms.forEach((rm, ri) => {
      if (rm.kind === 'boss') return;
      const jw = rm.z - rm.hh - 1, zz = jw + 1 + 0.42, slots = [];
      for (let i = rm.x - rm.hw; i < rm.x + rm.hw; i++) if (wallOK(i, jw, 0) && !busy(i + 0.5, zz, 0.9)) slots.push(i + 0.5);
      slots.sort((a, b) => Math.abs(Math.abs(a - rm.x) - rm.hw * 0.5) - Math.abs(Math.abs(b - rm.x) - rm.hw * 0.5));
      const want = rm.kind === 'side' ? 1 : rm.hw >= 8 ? 3 : 2, put = [];
      for (const x of slots) {
        if (put.length >= want) break;
        if (put.some(q => Math.abs(q - x) < 2.4)) continue;
        put.push(x);
        const candle = rm.kind !== 'side' && put.length % 2 === 1;
        if (candle) {
          const g = candelabraGeo(), m = mat4(x, 0, zz, 0);
          propSolid(L, x, zz, 0.3, 'deco', [dec(B, 'prop', g.metal, m, null), dec(B, 'decor', g.wax, m, null)]);
          for (const ox of [-0.3, 0, 0.3]) addFlame(B, x + ox, (ox ? 1.37 : 1.43) + 0.23, zz, 0.3, 0);
          B.lights.push({ x, y: 1.75, z: zz + 0.35, col: new THREE.Color(warm), int: 2.4, dist: 5.5, fl: 0.25, ph: rnd() * 9 });
          glowAt(B, x, zz + 0.5, 2.6, warm, 0.42);
        } else {
          const g = plantGeo(Math.floor(rnd() * 3)), m = mat4(x, 0, zz, rnd() * TAU);
          propSolid(L, x, zz, 0.34, 'deco', [dec(B, 'shiny', g.pot, m, null), dec(B, 'foliage', g.leaves, m, null)]);
        }
      }
      if (rm.hh < 4) return;
      for (const sx of [-1, 1]) {   // shields on the east / west walls (the camera sees those faces at an angle)
        const iw = sx < 0 ? rm.x - rm.hw - 1 : rm.x + rm.hw, face = sx < 0 ? iw + 1 : iw;
        for (let z = rm.z - rm.hh + 2.5; z <= rm.z + rm.hh - 1.5; z += 3.3) {
          const j = Math.floor(z);
          let ok = true;
          for (let b = -1; b <= 1 && ok; b++) if (grid[(j + b) * W + iw] || !grid[(j + b) * W + iw - sx]) ok = false;
          if (!ok) continue;
          dec(B, 'shiny', shieldGeo((ri + j) % 4), mat4(face - sx * 0.03, 1.6, j + 0.5, -sx * Math.PI / 2), null);
        }
      }
    });
    // boss hall: a gold star emblem on the round rug where the dragon waits
    if (L.boss) {
      const m = R.mat.emblem || (R.mat.emblem = keep(new THREE.MeshStandardMaterial({ map: emblemTex(), transparent: true, depthWrite: false, roughness: 0.35, metalness: 0.6,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
      const e = new THREE.Mesh(R.geo.emblem || (R.geo.emblem = keep(new THREE.PlaneGeometry(6.2, 6.2).rotateX(-Math.PI / 2))), m);
      e.position.set(L.boss.x, 0.012, L.boss.z + 3.2); e.receiveShadow = true; e.renderOrder = 1; e.name = 'emblem';
      B.g.add(e);
    }
    // boss hall: rose window on the north wall face + a flat inlaid dais (Feza stands on it at the end, so no height)
    if (L.crystalSpot) {
      const cs = L.crystalSpot, jw = last.z - last.hh;
      const rose = new THREE.Mesh(R.geo.rose2 || (R.geo.rose2 = keep(new THREE.CircleGeometry(1.0, 40))),
        R.mat.rose || (R.mat.rose = keep(new THREE.MeshBasicMaterial({ map: roseTex(), color: new THREE.Color(1.7, 1.6, 1.8) }))));
      rose.position.set(cs.x, 1.55, jw + 0.02); rose.name = 'rose'; B.g.add(rose);
      const ring = new THREE.Mesh(R.geo.roseRing2 || (R.geo.roseRing2 = keep(new THREE.TorusGeometry(1.03, 0.075, 8, 48))), R.mat.gold); ring.position.copy(rose.position); ring.position.z += 0.02; B.g.add(ring);
      dec(B, 'stone', G.box(), mat4(cs.x, 0.4, jw + 0.1, 0, 1.9, 0.12, 0.2), lin(0xf6f0ff));   // sill
      glowAt(B, cs.x, jw + 1.8, 2.2, 0xff9ae0, 0.4, 1, 1.2);
      const th = [0.02, 0.035, 0.05], rr = [3.0, 2.3, 1.6];
      for (let k = 0; k < 3; k++) dec(B, 'stone', G.cyl(1, 1, 40), mat4(cs.x, th[k] / 2, cs.z, 0, rr[k], th[k], rr[k]), lin(k === 2 ? 0xf8f0ff : k ? 0xe4dcf4 : 0xd0c8e6));
      for (let k = 0; k < 2; k++) dec(B, 'gold', G.torus(TAU, 0.012, 64), mat4(cs.x, th[k + 1] + 0.004, cs.z, 0, rr[k + 1] + 0.01, rr[k + 1] + 0.01, rr[k + 1] + 0.01, Math.PI / 2), null);
      dec(B, 'glow', G.torus(TAU, 0.02, 64), mat4(cs.x, 0.058, cs.z, 0, 1.2, 1.2, 1.2, Math.PI / 2), lin(0xff8fd8, 1.2));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4, x = cs.x + Math.cos(a) * 2.35, z = cs.z + Math.sin(a) * 2.35;
        propSolid(L, x, z, 0.25, 'post', [dec(B, 'stone', G.cyl(0.8, 1, 8), mat4(x, 0.45, z, 0, 0.18, 0.9, 0.18), lin(0xe8e0f8)),
          dec(B, 'glow', crystalGeo(2), mat4(x, 0.88, z, a, 0.45), null)]);
      }
      B.pts.add.push(...Array.from({ length: 16 }, () => ({ x: cs.x + (rnd() - 0.5) * 3, y: 0.4 + rnd(), z: cs.z + (rnd() - 0.5) * 3, kind: 2, ph: rnd(), size: 0.2, prm: 0.25 + rnd() * 0.2, col: lin(0xff9ae0, 2.2) })));
      B.lights.push({ x: cs.x, y: 1.4, z: cs.z, col: new THREE.Color(0xff8fd8), int: 4, dist: 8, fl: 0, ph: 0 });
      glowAt(B, cs.x, cs.z + 0.5, 5, 0xff8fd8, 0.45);
    }
    // the dragon's hoard in the boss hall corners, clear of the pillars
    const bossRm = L.rooms.find(r => r.kind === 'boss');
    let nChest = 0;
    if (bossRm) [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], hi) => {
      let x = 0, z = 0, ok = false;
      for (const d of [1.6, 1.9, 2.2, 2.5, 2.9]) {
        x = bossRm.x + sx * (bossRm.hw - d); z = bossRm.z + sz * (bossRm.hh - d);
        ok = !!L.grid[Math.floor(z) * W + Math.floor(x)] && !L.pillars.some(p => hyp(p.x - x, p.z - z) < 2.4) && !L.solids.some(q => hyp(q.x - x, q.z - z) < q.r + 1.8) &&
          !L.spawns.some(q => hyp(q.x - x, q.z - z) < 2) && !(L.crystalSpot && hyp(L.crystalSpot.x - x, L.crystalSpot.z - z) < 5);
        if (ok) break;
      }
      if (!ok) return;
      const hg = hoardGeo(hi), sc = 0.88 + rnd() * 0.12, m = mat4(x, 0, z, rnd() * TAU, sc);
      const vis = [dec(B, 'coin', hg.coins, m, null), dec(B, 'shiny', hg.gems, m, null)];
      if (nChest++ < 2) {   // a small open treasure chest spilling coins, on the side facing the hall
        const cg = chestGeo(false), cm = mat4(x - sx * 0.9, 0, z - sz * 0.55, sz < 0 ? -sx * 0.6 : Math.PI + sx * 0.6, 0.7);
        const lm = new THREE.Matrix4().multiplyMatrices(cm, mat4(0, 0.54, -0.31, 0, 1, 1, 1, -1.9));
        vis.push(dec(B, 'prop', cg.body, cm, null), dec(B, 'prop', cg.lid, lm, null));
        const ck = new Kit();
        for (let n = 0; n < 7; n++) addCoin(ck, (n % 4 - 1.5) * 0.18, 0.565 + (n > 3 ? 0.03 : 0), ((n / 4 | 0) - 0.5) * 0.2, [0.2 * (n % 3), n, 0.1], 0.085, 0.02, n);
        vis.push(dec(B, 'coin', R.geo.chestCoins || (R.geo.chestCoins = keep(ck.build())), cm, null));
      }
      propSolid(L, x, z, 1.2, 'hoard', vis);
      glowAt(B, x, z, 2.6, 0xffc84a, 0.22);
      for (let n = 0; n < 5; n++) B.pts.add.push({ x: x + (rnd() - 0.5) * 2.2, y: 0.25 + rnd() * 0.5, z: z + (rnd() - 0.5) * 1.8, kind: 2, ph: rnd(), size: 0.16, prm: 0.3 + rnd() * 0.3, col: lin(0xffe07a, 1.8) });
    });
    // gold dust motes
    for (let n = 0; n < 60; n++) {
      const x = rnd() * W, z = rnd() * H;
      if (!grid[Math.floor(z) * W + Math.floor(x)]) continue;
      B.pts.add.push({ x, y: 0.6 + rnd() * 2.4, z, kind: 1, ph: rnd(), size: 0.07, prm: 0.5 + rnd() * 0.5, col: lin(0xffe0a8, 1.1) });
    }
  }
  function finishBanners(B) {
    if (!B.banners.length) return;
    const geo = R.geo.banner || (R.geo.banner = keep((() => { const g = new THREE.PlaneGeometry(0.9, 2.0, 1, 8); g.translate(0, -1.0, 0); return g; })()));
    for (const hue of [0, 1]) {
      const list = B.banners.filter(b => b.hue === hue);
      if (!list.length) continue;
      const mk = 'banner' + hue, m = R.mat[mk] || (R.mat[mk] = makeBannerMat(hue));
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((b, i) => { const s = b.big ? 1.35 : 1; im.setMatrixAt(i, mat4(b.x, b.big ? 3.0 : 2.5, b.z, 0, s)); });
      im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.name = 'banners';
      B.g.add(im);
      for (const b of list) dec(B, 'prop', marked(G.cyl(1, 1, 8), 10), mat4(b.x, (b.big ? 3.0 : 2.5) + 0.03, b.z + 0.03, 0, 0.035, b.big ? 1.4 : 1.05, 0.035, 0, Math.PI / 2), lin(0xffc94a));
    }
  }

  function bookshelfGeo() {   // wood frame (prop material) + colourful books (decor material)
    if (R.geo.shelf) return R.geo.shelf;
    const f = new Kit(), b = new Kit(), rnd = mulberry32(4242), wd = 0xe0b890, Wd = 1.7, Hh = 2.15, D = 0.46;
    f.add(G.box(), wd, [0, Hh / 2, -D / 2 + 0.03], 0, [Wd, Hh, 0.06]);
    for (const sx of [-1, 1]) f.add(G.box(), wd, [sx * (Wd / 2 - 0.04), Hh / 2, 0], 0, [0.08, Hh, D]);
    for (let n = 0; n < 5; n++) f.add(G.box(), wd, [0, 0.06 + n * 0.5, 0], 0, [Wd, 0.06, D]);
    f.add(G.box(), 0xc89868, [0, Hh + 0.05, 0.02], 0, [Wd + 0.12, 0.1, D + 0.08]);
    const cols = [0xe8505a, 0x5a8ae8, 0x4ac080, 0xffc84a, 0xb07ae0, 0xff8fb8, 0x4ac0d0, 0xf0f0e0];
    for (let n = 0; n < 4; n++) {
      let x = -Wd / 2 + 0.1;
      while (x < Wd / 2 - 0.14) {
        const bw = 0.05 + rnd() * 0.05, bh = 0.26 + rnd() * 0.15, y0 = 0.09 + n * 0.5;
        if (rnd() < 0.08) { x += 0.12; continue; }
        const tilt = rnd() < 0.1 ? 0.25 : 0;
        b.add(G.box(), cols[Math.floor(rnd() * cols.length)], [x + bw / 2 + tilt * 0.1, y0 + bh / 2, 0.02], [0, 0, -tilt], [bw, bh, D - 0.12 - rnd() * 0.06]);
        if (rnd() < 0.5) b.add(G.box(), 0xffe08a, [x + bw / 2 + tilt * 0.1, y0 + bh * 0.72, 0.02 + (D - 0.12) / 2 - 0.02], [0, 0, -tilt], [bw + 0.004, 0.02, 0.01]);
        x += bw + 0.008;
      }
    }
    return (R.geo.shelf = { frame: keep(f.build()), books: keep(b.build()) });
  }
  function finishWindows(B) {
    for (const s of B.shelves) {
      const g = bookshelfGeo(), m = mat4(s.x, 0, s.z, 0);
      dec(B, 'prop', g.frame, m, null); dec(B, 'decor', g.books, m, null);
    }
    if (!B.windows.length) return;
    const geo = R.geo.glass || (R.geo.glass = keep(new THREE.PlaneGeometry(1.1, 2.2)));
    for (let v = 0; v < 3; v++) {
      const list = B.windows.filter(w => w.v === v);
      if (!list.length) continue;
      const mk = 'glass' + v, m = R.mat[mk] || (R.mat[mk] = keep(new THREE.MeshBasicMaterial({ map: glassTex(v), color: new THREE.Color(1.45, 1.4, 1.5), alphaTest: 0.5 })));
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach((w, i) => im.setMatrixAt(i, mat4(w.x, 1.45, w.z + 0.015, 0)));
      im.computeBoundingSphere(); im.name = 'windows'; B.g.add(im);
      for (const w of list) {   // stone frame + sill
        for (const sx of [-1, 1]) dec(B, 'stone', G.box(), mat4(w.x + sx * 0.6, 1.18, w.z + 0.05, 0, 0.14, 1.66, 0.12), lin(0xf0eaf8));
        dec(B, 'stone', G.torus(Math.PI, 0.13, 16), mat4(w.x, 2.0, w.z + 0.05, 0, 0.56, 0.56, 0.56), lin(0xf0eaf8));
        dec(B, 'stone', G.box(), mat4(w.x, 0.32, w.z + 0.09, 0, 1.45, 0.12, 0.22), lin(0xf6f0ff));
        for (let n = 0; n < 6; n++) B.pts.add.push({ x: w.x + (B.rnd() - 0.5) * 1.4, y: 0.6 + B.rnd() * 1.6, z: w.z + 0.5 + B.rnd() * 2.2, kind: 1, ph: B.rnd(), size: 0.07, prm: 0.3 + B.rnd() * 0.3, col: lin(GLASS_LIGHT[w.v][n & 1], 1.3) });
      }
    }
  }

  // ── Interactive props: chests, breakables, checkpoint crystals, portal, torches, owl ──
  const halfCyl = () => R.geo.halfCyl || (R.geo.halfCyl = keep(new THREE.CylinderGeometry(1, 1, 1, 18, 1, false, 0, Math.PI)));
  const MK = g => marked(g, 10);   // plain metal part of a prop
  const GOLD = 0xffc94a;
  function chestGeo(big) {
    const key = 'chest' + (big ? 'B' : 'S');
    if (R.geo[key]) return R.geo[key];
    const wood = big ? 0xa99af0 : 0xffffff, dark = 0x3a2616, Wd = 0.9, D = 0.62, Hh = 0.5;
    const b = new Kit();
    b.add(G.box(), wood, [0, Hh / 2 + 0.04, 0], 0, [Wd, Hh, D]);
    b.add(G.box(), 0x2a1a0e, [0, Hh + 0.035, 0], 0, [Wd - 0.08, 0.02, D - 0.08]);
    for (const x of big ? [-0.3, 0, 0.3] : [-0.28, 0.28]) b.add(MK(G.box()), GOLD, [x, Hh / 2 + 0.04, 0], 0, [0.075, Hh + 0.02, D + 0.03]);
    b.add(MK(G.box()), GOLD, [0, 0.06, 0], 0, [Wd + 0.03, 0.06, D + 0.03]);
    b.add(MK(G.box()), GOLD, [0, Hh * 0.78, D / 2 + 0.02], 0, [0.17, 0.2, 0.035]);
    b.add(MK(G.box()), dark, [0, Hh * 0.74, D / 2 + 0.04], 0, [0.035, 0.07, 0.01]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(MK(G.sphere(8, 6)), GOLD, [sx * Wd / 2, 0.05, sz * D / 2], 0, 0.05);
    const l = new Kit(), dh = 0.24;
    l.add(halfCyl(), wood, [0, 0, D / 2], [0, 0, Math.PI / 2], [dh, Wd, D / 2]);
    l.add(G.box(), 0x4a3220, [0, 0.012, D / 2], 0, [Wd - 0.02, 0.024, D - 0.02]);
    for (const x of big ? [-0.3, 0, 0.3] : [-0.28, 0.28]) l.add(MK(halfCyl()), GOLD, [x, 0, D / 2], [0, 0, Math.PI / 2], [dh + 0.018, 0.08, D / 2 + 0.018]);
    l.add(MK(G.box()), GOLD, [0, 0.03, D + 0.012], 0, [0.12, 0.1, 0.03]);
    if (big) l.add(MK(G.octa()), 0xff7ad8, [0, dh + 0.02, D / 2], 0, [0.07, 0.09, 0.07]);
    return (R.geo[key] = { body: keep(b.build()), lid: keep(l.build()) });
  }
  function makeChests(L, B) {
    const innerMat = R.mat.chestGlow || (R.mat.chestGlow = keep(glowMat(0xffc84a, 2.4, { transparent: true, opacity: 0.9, depthWrite: false })));
    L.chestObjs = L.chests.map((c, n) => {
      const g = new THREE.Group(), s = c.big ? 1.3 : 1, geo = chestGeo(c.big);
      g.position.set(c.x, 0, c.z); g.scale.setScalar(s);
      const body = new THREE.Mesh(geo.body, R.mat.prop), pivot = new THREE.Group(), lid = new THREE.Mesh(geo.lid, R.mat.prop);
      pivot.position.set(0, 0.54, -0.31); pivot.add(lid);
      const glow = new THREE.Mesh(R.geo.glowPlane || (R.geo.glowPlane = keep(new THREE.PlaneGeometry(0.8, 0.52).rotateX(-Math.PI / 2))), innerMat);
      glow.position.y = 0.535; glow.visible = false;
      g.add(body, pivot, glow); shadows(g, true, true); glow.castShadow = false;
      B.g.add(g);
      const grp = B.grpN < 15 ? ++B.grpN : 0;
      for (let k = 0; k < (c.big ? 8 : 5); k++) B.pts.add.push({ x: c.x + (B.rnd() - 0.5) * 1.1 * s, y: 0.3 + B.rnd() * 0.8, z: c.z + (B.rnd() - 0.5) * 0.9 * s, kind: 2, ph: B.rnd(), size: 0.2, prm: 0.35 + B.rnd() * 0.3, col: lin(0xffe07a, 2.4), grp });
      const o = { x: c.x, z: c.z, big: c.big, opened: false, t: -1, grp, obj: g,
        open() {
          if (this.t >= 0) return;
          this.opened = true; this.t = 0; glow.visible = true;
          if (grp && B.ptOn) B.ptOn.value[grp] = 0;
          if (typeof FX !== 'undefined' && FX.burst) { FX.burst('sparkle', c.x, 0.9, c.z, { count: 16, color: '#ffe27a' }); FX.burst('coin', c.x, 0.8, c.z, { count: 8 }); }
          B.lights.push({ x: c.x, y: 1.2, z: c.z + 0.3, col: new THREE.Color(0xffc84a), int: 6, dist: 7, fl: 0, ph: 0, life: 1.6 });
        } };
      B.anim.push(dt => {
        if (o.t < 0) return;
        o.t += dt;
        const k = Math.min(1, o.t / 0.5), back = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
        pivot.rotation.x = -1.95 * back;
        glow.scale.setScalar(Math.min(1, o.t * 2.5));
        innerMat.opacity = 0.9;
      });
      return o;
    });
  }
  // Breakables: one InstancedMesh per kind; breaking hides the instance and frees its solid
  KIND.vase = { mat: 'shiny', shadow: true, geo() {
    const pts = [[0, 0], [0.15, 0], [0.17, 0.03], [0.22, 0.12], [0.29, 0.27], [0.3, 0.37], [0.26, 0.5], [0.15, 0.6], [0.12, 0.66], [0.16, 0.72], [0.15, 0.75], [0.1, 0.74]].map(p => new THREE.Vector2(p[0], p[1]));
    const lg = new THREE.LatheGeometry(pts, 20), k = new Kit();
    k.add(lg, (x, y) => { const b = y > 0.3 && y < 0.42 ? 1.25 : (Math.abs(y - 0.28) < 0.015 || Math.abs(y - 0.44) < 0.015) ? 0.55 : y > 0.6 ? 0.85 : 0.95; return new THREE.Color(b, b, b); });
    for (const s of [-1, 1]) k.add(G.torus(Math.PI, 0.22, 10), 0xdddddd, [s * 0.2, 0.6, 0], [0, 0, s > 0 ? -1.2 : Math.PI + 1.2], [0.1, 0.1, 0.1]);
    return k.build();
  } };
  KIND.barrel = { mat: 'prop', shadow: true, geo() {
    const pts = [[0.001, 0], [0.29, 0], [0.32, 0.08], [0.35, 0.38], [0.32, 0.68], [0.29, 0.76], [0.001, 0.76]].map(p => new THREE.Vector2(p[0], p[1]));
    const lg = new THREE.LatheGeometry(pts, 14), uv = lg.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * 0.9, u * 2.2); }
    const k = new Kit();
    k.add(lg, 0xf2e2d0);
    const hoop = R.geo.hoop || (R.geo.hoop = keep(markUV(new THREE.TorusGeometry(1, 0.06, 5, 16), 10)));
    for (const y of [0.13, 0.63]) k.add(hoop, 0x5a5560, [0, y, 0], [Math.PI / 2, 0, 0], [0.345, 0.345, 0.345]);
    k.add(hoop, 0x5a5560, [0, 0.38, 0], [Math.PI / 2, 0, 0], [0.36, 0.36, 0.36]);
    return k.build();
  } };
  KIND.crate = { mat: 'prop', shadow: true, geo() {
    const k = new Kit(), s = 0.78, e = 0.075, dk = 0xb8906a;
    k.add(G.box(), 0xffe8cc, [0, s / 2, 0], 0, [s - 0.02, s - 0.02, s - 0.02]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      k.add(G.box(), dk, [a * (s / 2 - e / 2), s / 2, b * (s / 2 - e / 2)], 0, [e, s, e]);
      k.add(G.box(), dk, [0, s / 2 + a * (s / 2 - e / 2), b * (s / 2 - e / 2)], 0, [s, e, e]);
      k.add(G.box(), dk, [a * (s / 2 - e / 2), s / 2 + b * (s / 2 - e / 2), 0], 0, [e, e, s]);
    }
    for (const z of [-1, 1]) k.add(G.box(), dk, [0, s / 2, z * (s / 2 + 0.005)], [0, 0, 0.785], [e * 0.9, s * 1.25, e * 0.4]);
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [0, 1]) k.add(MK(G.box()), 0x6a6470, [a * s / 2, c * s, b * s / 2], 0, [0.1, 0.1, 0.1]);
    return k.build();
  } };
  const VASE_COL = { forest: [0xe0875a, 0xd89a6a, 0x6ab8c8], cave: [0x8a9ae0, 0xb08ae0, 0x6ab8c8], volcano: [0xe0875a, 0x6ab8c8, 0xf0b060, 0xd07aa0], castle: [0x5a7ae0, 0xb08ae0, 0xe07a9a, 0x6ab8c8] };
  function makeBreakables(L, B) {
    const byKind = {};
    L.breakables.forEach((b, i) => (byKind[b.kind] || (byKind[b.kind] = [])).push(i));
    const objs = new Array(L.breakables.length);
    for (const kind in byKind) {
      const ids = byKind[kind], K = KIND[kind];
      const im = new THREE.InstancedMesh(kgeo(kind), R.mat[K.mat], ids.length);
      const pal = VASE_COL[L.theme] || VASE_COL.forest;
      ids.forEach((bi, n) => {
        const b = L.breakables[bi], ry = B.rnd() * TAU, sc = kind === 'vase' ? 0.95 + B.rnd() * 0.3 : 0.95 + B.rnd() * 0.12;
        const m = mat4(b.x, 0, b.z, ry, sc);
        im.setMatrixAt(n, m);
        const vc = kind === 'vase' ? pal[Math.floor(B.rnd() * pal.length)] : 0;
        im.setColorAt(n, kind === 'vase' ? lin(vc) : lin(0xffffff, 0.92 + B.rnd() * 0.12));
        const debris = kind === 'vase' ? '#' + vc.toString(16).padStart(6, '0') : kind === 'barrel' ? '#b07a48' : '#c8965a';
        objs[bi] = { x: b.x, z: b.z, r: b.solid ? b.solid.r : 0.42, kind, broken: false,
          break() {
            if (this.brokenDone) return;
            this.brokenDone = true; this.broken = true;
            if (b.solid) b.solid.alive = false;
            im.setMatrixAt(n, _m.makeScale(0, 0, 0)); im.instanceMatrix.needsUpdate = true;
            if (typeof FX !== 'undefined' && FX.burst) { FX.burst('debris', b.x, 0.45, b.z, { color: debris, count: 12 }); FX.burst('dust', b.x, 0.2, b.z, {}); }
          } };
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); im.name = 'break-' + kind;
      B.g.add(im);
    }
    L.breakObjs = objs.filter(Boolean);
  }
  // "Neşe Taşı" checkpoint: floating pink crystal over a carved pedestal; glows up when activated
  function pedestalGeo() {
    if (R.geo.pedestal) return R.geo.pedestal;
    const k = new Kit();
    k.add(G.cyl(1, 1, 8), 0xe8e0f0, [0, 0.12, 0], [0, Math.PI / 8, 0], [0.78, 0.24, 0.78]);
    k.add(G.cyl(0.85, 1, 8), 0xf4eefa, [0, 0.39, 0], [0, Math.PI / 8, 0], [0.6, 0.3, 0.6]);
    k.add(G.cyl(1, 0.9, 8), 0xffffff, [0, 0.6, 0], [0, Math.PI / 8, 0], [0.5, 0.12, 0.5]);
    return (R.geo.pedestal = keep(k.build()));
  }
  function crystalMesh(mat) {
    const g = R.geo.cpCrystal || (R.geo.cpCrystal = keep((() => {
      const k = new Kit();
      k.add(G.cone(6), 0xffffff, [0, 0.33, 0], 0, [0.26, 0.66, 0.26]);
      k.add(G.cone(6), 0xffffff, [0, -0.16, 0], [Math.PI, 0, 0], [0.26, 0.32, 0.26]);
      return k.build();
    })()));
    return new THREE.Mesh(g, mat);
  }
  function makeCheckpoints(L, B) {
    L.cpObjs = L.checkpoints.map(c => {
      const g = new THREE.Group(); g.position.set(c.x, 0, c.z); B.g.add(g);
      const ped = new THREE.Mesh(pedestalGeo(), R.mat.stone); ped.castShadow = ped.receiveShadow = true; g.add(ped);
      const pi = L.cpObjsN = (L.cpObjsN || 0) + 1, pool = R.cpPool[pi] || (R.cpPool[pi] = {
        cm: keep(new THREE.MeshStandardMaterial({ color: 0xff9ad8, emissive: 0xff5ac0, emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.05, flatShading: true })),
        rm: keep(new THREE.MeshBasicMaterial({ color: lin(0xff8fd8, 0.6) })) });
      const cm = pool.cm, rm = pool.rm;
      cm.emissiveIntensity = 0.35; rm.color.copy(lin(0xff8fd8, 0.6));
      const ring = new THREE.Mesh(R.geo.cpRing || (R.geo.cpRing = keep(new THREE.TorusGeometry(0.61, 0.025, 6, 40))), rm);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.45; g.add(ring);
      const rune = new THREE.Mesh(R.geo.cpRune || (R.geo.cpRune = keep(new THREE.TorusGeometry(0.36, 0.014, 4, 40))), rm);   // thin rune ring on the top
      rune.rotation.x = Math.PI / 2; rune.position.y = 0.667; g.add(rune);
      const cr = crystalMesh(cm); cr.position.y = 1.25; cr.castShadow = true; g.add(cr);
      const orb = new THREE.Group(); orb.position.y = 1.2; orb.visible = false; g.add(orb);
      for (let k = 0; k < 3; k++) { const s = crystalMesh(cm); s.scale.setScalar(0.3); s.position.set(Math.cos(k * TAU / 3) * 0.55, 0, Math.sin(k * TAU / 3) * 0.55); orb.add(s); }
      const grp = B.grpN < 15 ? ++B.grpN : 0;
      for (let k = 0; k < 10; k++) B.pts.add.push({ x: c.x + (B.rnd() - 0.5) * 1.2, y: 0.6 + B.rnd() * 1.2, z: c.z + (B.rnd() - 0.5) * 1.2, kind: 2, ph: B.rnd(), size: 0.22, prm: 0.3 + B.rnd() * 0.3, col: lin(0xff9ae0, 2.4), grp });
      if (grp && B.ptOn) B.ptOn.value[grp] = 0.25;
      const light = { x: c.x, y: 2.3, z: c.z + 0.2, col: new THREE.Color(0xff8fd8), int: 1.2, dist: 7, fl: 0, ph: 0 };   // high + soft: the stone stays stone
      glowAt(B, c.x, c.z, 2.3, 0xff8fd8, 0.28);
      B.lights.push(light);
      const o = { x: c.x, z: c.z, active: false, k: 0, obj: g,
        activate() {
          if (this.k > 0) return;
          this.active = true; this.k = 0.001; orb.visible = true;
          if (typeof FX !== 'undefined' && FX.burst) { FX.burst('magic', c.x, 1.3, c.z, { count: 24, color: '#ff9ae0' }); FX.burst('sparkle', c.x, 1.4, c.z, { count: 14, color: '#ffd6f2' }); }
          B.lights.push({ x: c.x, y: 2.4, z: c.z + 0.3, col: new THREE.Color(0xffb0e8), int: 7, dist: 9, fl: 0, ph: 0, life: 1.3 });   // a light burst that fades
        } };
      B.anim.push((dt) => {
        const t = TIME.t;
        if (o.k > 0 && o.k < 1) o.k = Math.min(1, o.k + dt * 1.5);
        const a = o.active ? o.k : 0;
        cr.position.y = 1.25 + Math.sin(t * 1.8) * 0.08; cr.rotation.y += dt * (0.6 + a * 1.4);
        orb.rotation.y -= dt * 1.2; orb.position.y = cr.position.y - 0.05;
        cm.emissiveIntensity = 0.35 + a * (1.3 + 0.3 * Math.sin(t * 3));   // ≤ 2: only the crystal and the rune rings glow
        rm.color.setHex(0xff8fd8).multiplyScalar(0.6 + a * 1.2);
        light.int = 1.2 + a * 2.3;
        if (grp && B.ptOn) B.ptOn.value[grp] = 0.25 + a * 0.75;
      });
      return o;
    });
  }
  // Magic portal: stone arch + swirling disk + ground glow + rising sparkles
  const PORTAL_FS = `uniform float uTime, uOn; varying vec2 vP;
    ${GLSL_NOISE}
    void main() {
      vec2 c = vP - vec2(0.0, 1.8);
      float r = length(c * vec2(1.0, 0.78)), a = atan(c.y, c.x);
      float edge = vP.y < 2.3 ? min(1.25 - abs(vP.x), vP.y) : 1.25 - length(vec2(vP.x, vP.y - 2.3));
      float t = uTime;
      float sw = 0.5 + 0.5 * sin(a * 3.0 - r * 7.0 + t * 2.4), sw2 = 0.5 + 0.5 * sin(a * 5.0 + r * 11.0 - t * 3.1);
      float n = lvVN(vec2(a * 2.0 + t * 0.7, r * 4.0 - t * 1.3));
      vec3 deep = vec3(0.08, 0.03, 0.25), mid = vec3(0.5, 0.2, 1.15), hot = vec3(1.7, 0.7, 2.3), cyan = vec3(0.45, 1.5, 2.2);
      vec3 col = mix(deep, mid, smoothstep(0.05, 1.3, r) * (0.45 + 0.55 * sw) * (0.7 + 0.6 * n));
      col += hot * pow(sw * sw2, 3.0) * smoothstep(0.15, 1.0, r);
      col = mix(col, cyan, smoothstep(0.32, 0.0, edge) * 0.85);
      vec2 gp = vP * 8.0 + vec2(0.0, -t * 0.6); float h = lvH21(floor(gp));
      col += vec3(2.2, 2.0, 2.6) * step(0.92, h) * smoothstep(0.3, 0.0, length(fract(gp) - 0.5)) * (0.5 + 0.5 * sin(t * 3.0 + h * 40.0));
      col *= mix(0.3, 1.0, uOn);
      gl_FragColor = vec4(col, smoothstep(0.0, 0.05, edge) * mix(0.35, 0.96, uOn));
      #include <colorspace_fragment>
    }`;
  function makePortal(L, B) {
    if (!L.exit) return;
    const ex = L.exit, g = new THREE.Group(); g.position.set(ex.x, 0, ex.z); B.g.add(g);
    const rnd = mulberry32(L.seed + 77), k = new Kit(), tint = L.theme === 'cave' ? [0x9aa2c4, 0x8f98bc] : L.theme === 'volcano' ? [0x9a8a86, 0x8c7e7c] : [0xd4ccbc, 0xc4bcae];
    const st = () => lin(tint[Math.floor(rnd() * 2)], 0.9 + rnd() * 0.2);
    for (const sx of [-1, 1]) {
      let y = 0;
      for (let n = 0; n < 3; n++) { const h = 0.72 + rnd() * 0.12; k.add(G.rbox(), st(), [sx * 1.58 + (rnd() - 0.5) * 0.06, y + h / 2, 0], [0, (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.06], [0.66 - n * 0.03, h, 0.72]); y += h + 0.02; }
    }
    const nv = 9;
    for (let n = 0; n < nv; n++) {
      const a = n / (nv - 1) * Math.PI, key = n === (nv - 1) / 2;
      k.add(G.rbox(), key ? lin(tint[0], 1.1) : st(), [Math.cos(a) * 1.6, 2.3 + Math.sin(a) * 1.6, 0], [0, 0, a - Math.PI / 2], key ? [0.46, 0.8, 0.8] : [0.5, 0.66, 0.72]);
    }
    k.add(G.rbox(), st(), [0, 0.07, 0.45], 0, [3.9, 0.14, 1.3]);
    k.add(G.rbox(), st(), [0, 0.05, 1.25], 0, [3.2, 0.1, 0.7]);
    const arch = new THREE.Mesh(k.build(), R.mat.rock); arch.castShadow = arch.receiveShadow = true; g.add(arch);
    B.dispose.push(arch.geometry);
    const rune = new Kit();
    rune.add(G.torus(TAU, 0.12, 20), 0x9af0ff, [0, 3.9, 0.41], 0, [0.16, 0.16, 0.16]);
    rune.add(G.octa(), 0xffffff, [0, 3.9, 0.42], 0, [0.07, 0.1, 0.03]);
    for (const sx of [-1, 1]) rune.add(G.octa(), 0xc8a0ff, [sx * 1.58, 1.9, 0.37], 0, [0.09, 0.14, 0.03]);
    const rm = new THREE.Mesh(rune.build(), R.mat.glow); g.add(rm); B.dispose.push(rm.geometry);
    const sh = new THREE.Shape();
    sh.moveTo(-1.25, 0); sh.lineTo(1.25, 0); sh.lineTo(1.25, 2.3); sh.absarc(0, 2.3, 1.25, 0, Math.PI, false); sh.lineTo(-1.25, 0);
    const dg = R.geo.portalDisk || (R.geo.portalDisk = keep(new THREE.ShapeGeometry(sh, 28)));
    const uOn = R.portalOn;
    const dm = R.mat.portalDisk || (R.mat.portalDisk = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: TIME.u, uOn }, vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: PORTAL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })));
    const disk = new THREE.Mesh(dg, dm); disk.position.z = 0.02; disk.renderOrder = 3; g.add(disk);
    const gg = R.geo.portalGlow || (R.geo.portalGlow = keep(new THREE.PlaneGeometry(4.6, 4.6).rotateX(-Math.PI / 2)));
    const gm = R.mat.portalGlow || (R.mat.portalGlow = keep(new THREE.ShaderMaterial({ uniforms: { uTime: TIME.u, uOn }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime, uOn; varying vec2 vU; void main(){ vec2 c = (vU - 0.5) * 2.0; float d = length(c * vec2(1.0, 1.4));
        float k = smoothstep(1.0, 0.0, d) * (0.55 + 0.1 * sin(uTime * 2.0 + d * 6.0)); gl_FragColor = vec4(vec3(0.55, 0.3, 1.2) * k * k * uOn, 1.0);
        #include <colorspace_fragment>
      }` })));
    const glow = new THREE.Mesh(gg, gm); glow.position.set(0, 0.03, 0.7); glow.renderOrder = 2; g.add(glow);
    const grp = B.grpN < 15 ? ++B.grpN : 0;
    for (let n = 0; n < 34; n++) B.pts.add.push({ x: ex.x, y: 0.1, z: ex.z + 0.1, kind: 3, ph: n / 34 + rnd() * 0.02, size: 0.16 + rnd() * 0.08, prm: 0.6 + rnd() * 0.7, col: lin(n % 3 ? 0xb89aff : 0x8af0ff, 2.6), grp });
    const light = { x: ex.x, y: 1.8, z: ex.z + 0.8, col: new THREE.Color(0xa070ff), int: 6, dist: 9, fl: 0, ph: 0 };
    B.lights.push(light);
    L.portalObj = { x: ex.x, z: ex.z, active: true, obj: g,
      setActive(v) { this.active = !!v; uOn.value = v ? 1 : 0; light.int = v ? 6 : 0; if (grp && B.ptOn) B.ptOn.value[grp] = v ? 1 : 0; } };
    if (L.boss) L.portalObj.setActive(false);   // asleep until the boss is cheered up (GAME calls setActive(true))
  }
  // Torch holders (flames are added to the shared flame billboard)
  function torchGeo(kind) {
    const key = 'torch' + kind;
    if (R.geo[key]) return R.geo[key];
    const k = new Kit(), iron = 0x4a4550, wood = 0xc49a6a;
    if (kind === 'wall') {
      k.add(MK(G.box()), iron, [0, -0.05, 0.02], 0, [0.16, 0.3, 0.04]);
      k.seg([0, -0.14, 0.04], [0, -0.02, 0.26], 0.025, iron, 0.025, 6);
      k.add(G.cyl(0.8, 1, 8), wood, [0, 0.02, 0.28], 0, [0.04, 0.34, 0.04]);
      k.add(MK(G.cyl(1.3, 0.8, 10)), iron, [0, 0.19, 0.28], 0, [0.075, 0.08, 0.075]);
    } else if (kind === 'stand') {
      k.add(G.cyl(0.7, 1, 8), wood, [0, 0.72, 0], 0, [0.055, 1.44, 0.055]);
      for (const y of [0.35, 1.2]) k.add(MK(G.torus(TAU, 0.3, 12)), iron, [0, y, 0], [Math.PI / 2, 0, 0], [0.06, 0.06, 0.06]);
      k.add(MK(G.cyl(1.4, 0.8, 10)), iron, [0, 1.47, 0], 0, [0.09, 0.1, 0.09]);
      for (let n = 0; n < 4; n++) { const a = n * TAU / 4 + 0.4; k.add(G.sphere(8, 6), 0x7a7e90, [Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14], 0, [0.09, 0.07, 0.08]); }
    } else {
      for (let n = 0; n < 3; n++) { const a = n * TAU / 3; k.seg([Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38], [Math.cos(a) * 0.12, 0.85, Math.sin(a) * 0.12], 0.04, iron, 0.035, 6); }
      const pts = [[0.001, 0], [0.18, 0], [0.42, 0.18], [0.5, 0.3], [0.46, 0.31], [0.001, 0.2]].map(p => new THREE.Vector2(p[0], p[1]));
      k.add(MK(new THREE.LatheGeometry(pts, 16)), 0x6a5a48, [0, 0.8, 0]);
      k.add(MK(G.torus(TAU, 0.08, 20)), GOLD, [0, 1.1, 0], [Math.PI / 2, 0, 0], [0.48, 0.48, 0.48]);
    }
    return (R.geo[key] = keep(k.build()));
  }
  function makeTorches(L, B) {
    for (const t of L.torches) {
      const warm = 0xff9a48;
      if (t.brazier) { dec(B, 'prop', torchGeo('brazier'), mat4(t.x, 0, t.z), null); addFlame(B, t.x, 1.08, t.z, 1.9, 7); glowAt(B, t.x, t.z, 4.4, warm, 0.62); continue; }
      if (L.theme === 'castle') { dec(B, 'prop', torchGeo('wall'), mat4(t.x, t.y - 0.25, t.z - 0.05), null); addFlame(B, t.x, t.y + 0.02, t.z + 0.23, 1, 5.5); glowAt(B, t.x, t.z + 0.9, 3.4, warm, 0.5, 1.15, 1); }
      else { dec(B, 'prop', torchGeo('stand'), mat4(t.x, 0, t.z), null); addFlame(B, t.x, 1.55, t.z, 1, 9); glowAt(B, t.x, t.z + 0.3, 3.8, warm, 0.55); }
    }
  }
  // Placeholder owl (used only when EMODEL.owl is not there yet)
  function placeholderOwl() {
    const k = new Kit(), br = 0x9a6a44, be = 0xf2dcb4;
    k.add(G.sphere(20), br, [0, 0.36, 0], 0, [0.3, 0.36, 0.28]);
    k.add(G.sphere(16), be, [0, 0.3, 0.12], 0, [0.2, 0.24, 0.18]);
    k.add(G.sphere(20), br, [0, 0.74, 0], 0, [0.27, 0.23, 0.25]);
    for (const s of [-1, 1]) {
      k.add(G.sphere(16), 0xffffff, [s * 0.11, 0.77, 0.19], 0, [0.1, 0.1, 0.06]);
      k.add(G.sphere(12), 0x2a1a10, [s * 0.1, 0.77, 0.24], 0, [0.055, 0.06, 0.03]);
      k.add(G.sphere(8), 0xffffff, [s * 0.1 + 0.02, 0.8, 0.26], 0, 0.015);
      k.add(G.cone(8), br, [s * 0.17, 0.97, 0], [0, 0, -s * 0.4], [0.05, 0.14, 0.05]);
      k.add(G.sphere(12), 0x7a5234, [s * 0.28, 0.38, -0.02], [0, 0, s * 0.25], [0.08, 0.24, 0.16]);
      k.add(G.sphere(8), 0xf0a040, [s * 0.07, 0.02, 0.12], 0, [0.05, 0.03, 0.07]);
    }
    k.add(G.cone(8), 0xf0a040, [0, 0.69, 0.25], [Math.PI / 2, 0, 0], [0.04, 0.09, 0.04]);
    const mesh = new THREE.Mesh(R.geo.owl || (R.geo.owl = keep(k.build())), R.mat.owl || (R.mat.owl = keep(rimify(vcMat({ roughness: 0.7 }), 0xfff0d0, 0.25))));
    mesh.castShadow = true;
    const root = new THREE.Group(); root.add(mesh);
    let t = 0;
    return { root, placeholder: true, anim(dt, talking) { t += dt; mesh.position.y = Math.sin(t * 2) * 0.015 + (talking ? Math.abs(Math.sin(t * 9)) * 0.03 : 0); mesh.rotation.z = Math.sin(t * 0.9) * 0.06; } };
  }
  function makeNpc(L, B) {
    if (!L.npc) return;
    const n = L.npc;
    let model = null;
    if (typeof EMODEL !== 'undefined' && EMODEL && typeof EMODEL.owl === 'function') { try { model = EMODEL.owl(); } catch (e) { console.warn('LEVEL: EMODEL.owl failed', e); model = null; } }
    if (!model || !model.root) model = placeholderOwl();
    // EMODEL.owl may already include its own stump: if the model is tall, stand it on the ground instead
    const bb = new THREE.Box3().setFromObject(model.root), tall = bb.max.y - bb.min.y > 1.1;
    if (!tall) inst(B, 'stump', mat4(n.x, 0, n.z, 0.6, 1.05));
    model.root.position.set(n.x, tall ? 0 : 0.58, n.z);
    model.root.rotation.y = model.root.rotation.y || 0;
    B.g.add(model.root);
    L.npcObj = { x: n.x, z: n.z, model };
  }
  function buildProps(L, B) {
    makeChests(L, B); makeBreakables(L, B); makeCheckpoints(L, B); makePortal(L, B); makeTorches(L, B); makeNpc(L, B);
  }

  // ── Zone 0 village edge: cute timber houses (north of the plaza), well, lamps, fences, flower beds, sign ──
  const PLASTER = [0xffffff, 0xffe9e2, 0xfff3d6, 0xeafff0];
  const DOORS = [0x9a6038, 0x5a88d0, 0x4aa87a, 0xd05a5a];
  const ROOFT = [0xffffff, 0xffd8c0, 0xe8d0ff];
  function gableGeo(w, h) {   // triangle in the XY plane facing +z (and its back face), UVs inside the plaster frame
    const g = new THREE.BufferGeometry(), x = w / 2;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-x, 0, 0, x, 0, 0, 0, h, 0, x, 0, 0, -x, 0, 0, 0, h, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0.02, 0.04, 0.98, 0.04, 0.5, 0.9, 0.98, 0.04, 0.02, 0.04, 0.5, 0.9], 2));
    return g;
  }
  function wellRingGeo() {
    if (R.geo.wellRing) return R.geo.wellRing;
    const pts = [[0.92, 0], [0.92, 0.76], [0.88, 0.84], [0.66, 0.84], [0.62, 0.78], [0.62, 0.3]].map(p => new THREE.Vector2(p[0], p[1]));
    return (R.geo.wellRing = keep(new THREE.LatheGeometry(pts, 22)));
  }
  function buildVillage(L, B) {
    const V = L.village, rnd = mulberry32(L.seed + 555), tmp = B.tmpGeo;
    const put = (M, mk, geo, m, col) => dec(B, mk, geo, M ? new THREE.Matrix4().multiplyMatrices(M, m) : m, col);
    for (const h of V.houses) {
      const M = mat4(h.x, 0, h.z, h.yaw), w = h.w, d = h.d, wh = h.h, base = 0.3, top = base + wh;
      const pl = lin(PLASTER[h.seed % 4]), door = lin(DOORS[(h.seed >> 3) % 4]), rt = lin(ROOFT[h.roof % 3]);
      put(M, 'stone', G.rbox(), mat4(0, base / 2, 0, 0, w + 0.3, base, d + 0.3), lin(0xd6cec2));
      put(M, 'plaster', G.box(), mat4(0, base + wh / 2, 0, 0, w, wh, d), pl);
      // roof (ridge along x, or along z = gable toward the plaza)
      const along = h.gable ? 'z' : 'x', span = along === 'x' ? d : w, len = along === 'x' ? w : d, oh = 0.4, hs = span / 2 + oh, rh = 1.55 + span * 0.08;
      const yr = top + (span / 2) * (rh / hs), th = Math.atan2(rh, hs), sl = Math.hypot(hs, rh);
      const slab = boxUV(len + 0.7, 0.16, sl, 2); tmp.push(slab);
      for (const sd of [-1, 1]) {
        const c = hs / 2, yc = yr - rh / 2 + 0.06;
        if (along === 'x') put(M, 'roof', slab, mat4(0, yc, sd * c, 0, 1, 1, 1, sd * th, 0), rt);
        else put(M, 'roof', slab, mat4(sd * c, yc, 0, Math.PI / 2, 1, 1, 1, sd * th, 0), rt);
      }
      put(M, 'prop', G.box(), along === 'x' ? mat4(0, yr + 0.06, 0, 0, len + 0.75, 0.14, 0.2) : mat4(0, yr + 0.06, 0, 0, 0.2, 0.14, len + 0.75), lin(0x8a5a3a));
      const gg = gableGeo(span, yr - top); tmp.push(gg);
      for (const sd of [-1, 1]) {
        if (along === 'x') put(M, 'plaster', gg, mat4(sd * w / 2, top, 0, sd * Math.PI / 2), pl);
        else put(M, 'plaster', gg, mat4(0, top, sd * d / 2, sd > 0 ? 0 : Math.PI), pl);
      }
      // chimney + smoke
      const cx = along === 'x' ? w * 0.28 : -w * 0.22, cz = along === 'x' ? -hs * 0.4 : d * 0.22;
      put(M, 'stone', G.rbox(), mat4(cx, yr - 0.1, cz, 0, 0.55, 1.5, 0.55), lin(0xcfc3b4));
      put(M, 'stone', G.rbox(), mat4(cx, yr + 0.7, cz, 0, 0.68, 0.14, 0.68), lin(0xbfb2a4));
      const cw = new THREE.Vector3(cx, yr + 0.8, cz).applyMatrix4(M);
      for (let n = 0; n < 6; n++) B.pts.norm.push({ x: cw.x, y: cw.y, z: cw.z, kind: 7, ph: n / 6 + rnd() * 0.05, size: 0.55, prm: 0.16, col: lin(0xf4f2f6, 0.95) });
      // front: door with round top, step, lantern
      const fz = d / 2, dx = h.door;
      put(M, 'prop', G.box(), mat4(dx, base + 0.78, fz + 0.03, 0, 0.9, 1.56, 0.08), door);
      put(M, 'prop', halfCyl(), mat4(dx, base + 1.56, fz + 0.03, Math.PI / 2, 0.45, 0.08, 0.45, 0, Math.PI / 2), door);
      put(M, 'stone', G.box(), mat4(dx, base + 0.95, fz + 0.02, 0, 1.12, 1.9, 0.06), lin(0xcabfae));
      put(M, 'stone', G.rbox(), mat4(dx, 0.1, fz + 0.45, 0, 1.3, 0.2, 0.6), lin(0xd6cec2));
      put(M, 'prop', MK(G.sphere(8, 6)), mat4(dx + 0.3, base + 0.8, fz + 0.09, 0, 0.05), lin(GOLD));
      put(M, 'window', G.sphere(10, 8), mat4(dx + 0.7, base + 1.75, fz + 0.14, 0, 0.1, 0.13, 0.1), lin(0xffffff));
      put(M, 'prop', MK(G.cone(6)), mat4(dx + 0.7, base + 1.93, fz + 0.14, 0, 0.12, 0.1, 0.12), lin(0x3a3438));
      // windows (front + sides) with frames, shutters and flower boxes
      const win = (px, py, pz, ry, big) => {
        const Wm = new THREE.Matrix4().multiplyMatrices(M, mat4(px, py, pz, ry)), s = big ? 1 : 0.85;
        put(Wm, 'window', G.box(), mat4(0, 0, 0.02, 0, 0.62 * s, 0.66 * s, 0.03), lin(0xffffff));
        for (const [ox, oy, sx, sy] of [[0, 0.35, 0.74, 0.07], [0, -0.35, 0.8, 0.08], [0.34, 0, 0.07, 0.72], [-0.34, 0, 0.07, 0.72], [0, 0, 0.62, 0.04], [0, 0, 0.04, 0.66]])
          put(Wm, 'prop', G.box(), mat4(ox * s, oy * s, 0.05, 0, sx * s, sy * s, 0.05), lin(0x8a5a3a));
        const sc = lin(DOORS[(h.seed >> 5) % 4], 1.05);
        for (const sd of [-1, 1]) put(Wm, 'prop', G.box(), mat4(sd * 0.5 * s, 0, 0.06, sd * 0.35, 0.3 * s, 0.7 * s, 0.035), sc);
        put(Wm, 'prop', G.box(), mat4(0, -0.47 * s, 0.13, 0, 0.78 * s, 0.14, 0.2), lin(0xb07a4a));
        for (let f = 0; f < 5; f++) put(Wm, 'decor', flowerGeo(Math.floor(rnd() * FLOWER_COL.length)), mat4((f - 2) * 0.15 * s, -0.47 * s + 0.02, 0.13, rnd() * TAU, 0.55), null);
      };
      const wx = w / 2 - 0.85;
      if (dx < w * 0.1) win(wx, base + 1.5, fz, 0, true); if (dx > -w * 0.1) win(-wx, base + 1.5, fz, 0, true);
      win(w / 2, base + 1.5, 0, Math.PI / 2, false); win(-w / 2, base + 1.5, 0, -Math.PI / 2, false);
      if (along === 'z') put(M, 'window', G.cyl(1, 1, 16), mat4(0, top + (yr - top) * 0.42, fz + 0.03, 0, 0.26, 0.04, 0.26, Math.PI / 2), lin(0xffffff));
      // a couple of bushes hugging the house corners
      for (const sd of [-1, 1]) {
        const p = new THREE.Vector3(sd * (w / 2 + 0.35), 0, fz - 0.2).applyMatrix4(M);
        addBush(B, mat4(p.x, 0, p.z, rnd() * TAU, 0.7 + rnd() * 0.25), lin(PAL.green[Math.floor(rnd() * 5)]), rnd() < 0.5);
      }
      const lw = new THREE.Vector3(dx + 0.7, base + 1.75, fz + 0.4).applyMatrix4(M);
      B.lights.push({ x: lw.x, y: lw.y, z: lw.z, col: new THREE.Color(0xffc070), int: 2.2, dist: 5.5, fl: 0.3, ph: rnd() * 9 });
      glowAt(B, lw.x, lw.z, 2.2, 0xffc070, 0.22);
    }
    // well
    if (V.well) {
      const M = mat4(V.well.x, 0, V.well.z, (rnd() - 0.5) * 0.5);   // roof ridge east-west: its shadow on the view stays short
      put(M, 'stone', wellRingGeo(), new THREE.Matrix4(), lin(0xd8d0c4));
      put(M, 'shiny', G.cyl(1, 1, 22), mat4(0, 0.42, 0, 0, 0.63, 0.02, 0.63), lin(0x2a5f8f, 0.55));
      if (V.well.low) put(M, 'prop', kgeo('barrel'), mat4(0.62, 0.84, 0.3, 0.4, 0.36, 0.36, 0.36), lin(0xffffff));   // roofless: bucket on the rim
      else {
        for (const sd of [-1, 1]) put(M, 'prop', G.box(), mat4(sd * 0.8, 1.2, 0, 0, 0.12, 2.1, 0.12), lin(0xc49a6a));
        put(M, 'prop', G.cyl(1, 1, 10), mat4(0, 1.75, 0, 0, 0.05, 1.72, 0.05, 0, Math.PI / 2), lin(0xa87a4a));
        const rs = boxUV(1.95, 0.08, 0.7, 2); tmp.push(rs);
        for (const sd of [-1, 1]) put(M, 'roof', rs, mat4(0, 2.42, sd * 0.28, 0, 1, 1, 1, sd * 0.75, 0), lin(0xffffff));
        put(M, 'decor', G.cyl(1, 1, 5), mat4(0.1, 1.42, 0, 0, 0.012, 0.64, 0.012), lin(0x6a5a40));
        put(M, 'prop', kgeo('barrel'), mat4(0.1, 0.98, 0, 0, 0.36, 0.36, 0.36), lin(0xffffff));
      }
    }
    // lamp posts
    for (const p of V.lamps) {
      const M = mat4(p.x, 0, p.z, 0), iron = lin(0x2c3a36);
      put(M, 'prop', MK(G.cyl(1, 1.3, 10)), mat4(0, 0.15, 0, 0, 0.16, 0.3, 0.16), iron);
      put(M, 'prop', MK(G.cyl(0.8, 1, 10)), mat4(0, 1.2, 0, 0, 0.06, 2.2, 0.06), iron);
      put(M, 'window', G.box(), mat4(0, 2.52, 0, 0, 0.24, 0.3, 0.24), lin(0xffffff));
      for (const [ox, oz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) put(M, 'prop', MK(G.box()), mat4(ox * 0.13, 2.52, oz * 0.13, 0, 0.035, 0.34, 0.035), iron);
      put(M, 'prop', MK(G.cone(4)), mat4(0, 2.8, 0, Math.PI / 4, 0.26, 0.22, 0.26), iron);
      put(M, 'prop', MK(G.box()), mat4(0, 2.34, 0, 0, 0.3, 0.05, 0.3), iron);
      B.lights.push({ x: p.x, y: 2.5, z: p.z, col: new THREE.Color(0xffc878), int: 3, dist: 7, fl: 0.2, ph: rnd() * 9 });
      glowAt(B, p.x, p.z, 3.2, 0xffc070, 0.3);
      for (let n = 0; n < 3; n++) B.pts.add.push({ x: p.x, y: 2.55, z: p.z, kind: 1, ph: rnd(), size: 0.05, prm: 0.3, col: lin(0xffe0a0, 1.5) });
    }
    // fences along the southern rim of the plaza (low: never hides the hero)
    const F = V.fences;
    for (let i = 0; i < F.length; i++) {
      const p = F[i];
      put(null, 'prop', G.box(), mat4(p.x, 0.36, p.z, rnd() * 0.2, 0.11, 0.72, 0.11), lin(0xe6ceb0));
      put(null, 'prop', G.cone(4), mat4(p.x, 0.78, p.z, Math.PI / 4, 0.09, 0.12, 0.09), lin(0xe6ceb0));
      const q = F[i + 1];
      if (q && hyp(q.x - p.x, q.z - p.z) < 2.3) {
        const l = hyp(q.x - p.x, q.z - p.z), a = Math.atan2(q.x - p.x, q.z - p.z);
        for (const y of [0.3, 0.58]) put(null, 'prop', G.box(), mat4((p.x + q.x) / 2, y, (p.z + q.z) / 2, a, 0.05, 0.09, l), lin(0xd8bc98));
      }
    }
    // flower beds in front of the houses
    for (const b of V.beds) {
      const M = mat4(b.x, 0, b.z, b.yaw);
      for (const [ox, oz, sx, sz] of [[0, 0.42, 1.7, 0.1], [0, -0.42, 1.7, 0.1], [0.8, 0, 0.1, 0.8], [-0.8, 0, 0.1, 0.8]]) put(M, 'prop', G.box(), mat4(ox, 0.12, oz, 0, sx, 0.24, sz), lin(0xd0a878));
      put(M, 'decor', G.box(), mat4(0, 0.1, 0, 0, 1.55, 0.18, 0.75), lin(0x5a3a26));
      for (let f = 0; f < 11; f++) put(M, 'decor', flowerGeo(Math.floor(rnd() * FLOWER_COL.length)), mat4((rnd() - 0.5) * 1.4, 0.18, (rnd() - 0.5) * 0.6, rnd() * TAU, 0.9 + rnd() * 0.4), null);
    }
    // benches and hay bales just outside the plaza rim, facing it
    const S = L.rooms[0];
    for (const a0 of [-1.75, 1.65, -2.5, 2.45]) {
      let rr = S.r * 0.6;
      const dx = Math.sin(a0), dz = -Math.cos(a0);
      while (rr < S.r + 5 && L.grid[Math.floor(S.z + dz * rr) * L.W + Math.floor(S.x + dx * rr)]) rr += 0.25;
      const x = S.x + dx * (rr + 0.55), z = S.z + dz * (rr + 0.55);
      if (B.noTree.some(o => hyp(o.x - x, o.z - z) < o.r + 0.6) || L.solids.some(o => hyp(o.x - x, o.z - z) < o.r + 1)) continue;
      const M = mat4(x, 0, z, Math.atan2(-dx, -dz));
      if (Math.abs(a0) < 2) {
        put(M, 'prop', G.box(), mat4(0, 0.45, 0, 0, 1.4, 0.07, 0.42), lin(0xe8c8a0));
        put(M, 'prop', G.box(), mat4(0, 0.78, -0.2, 0, 1.4, 0.3, 0.06, -0.15), lin(0xe8c8a0));
        for (const sx of [-0.6, 0.6]) { put(M, 'prop', G.box(), mat4(sx, 0.22, 0.12, 0, 0.08, 0.44, 0.08), lin(0x8a5a3a)); put(M, 'prop', G.box(), mat4(sx, 0.45, -0.18, 0, 0.08, 0.9, 0.08), lin(0x8a5a3a)); }
      } else {
        for (const [ox, oz, oy] of [[-0.45, 0, 0.36], [0.45, 0.1, 0.36], [0, 0.05, 0.98]]) {
          put(M, 'decor', G.cyl(1, 1, 16), mat4(ox, oy, oz, 0, 0.36, 0.95, 0.36, 0, Math.PI / 2), lin(0xe8c860));
          for (const b of [-0.25, 0.25]) put(M, 'decor', G.torus(TAU, 0.06, 16), mat4(ox + b, oy, oz, Math.PI / 2, 0.37, 0.37, 0.37), lin(0xb08a3a));
        }
      }
      B.noTree.push({ x, z, r: 1.2 });
    }
    // sign post pointing toward the forest path
    if (V.sign) {
      const s = V.sign, M = mat4(s.x, 0, s.z, s.dir - Math.PI / 2);
      put(M, 'prop', G.box(), mat4(0, 0.75, 0, 0, 0.12, 1.5, 0.12), lin(0xc49a6a));
      put(M, 'prop', G.box(), mat4(0.12, 1.3, 0, 0, 0.9, 0.3, 0.06), lin(0xf0d8a8));
      put(M, 'prop', G.cone(3), mat4(0.66, 1.3, 0, 0, 0.2, 0.36, 0.06, 0, -Math.PI / 2), lin(0xf0d8a8));
      put(M, 'decor', G.box(), mat4(0.18, 1.3, 0.035, 0, 0.62, 0.06, 0.01), lin(0x6a4a2a));
    }
  }

  // ── LEVEL.build ──
  function build(L) {
    if (!L) return L;
    if (L.group) dispose(L);
    const t0 = performance.now();
    if (texOK() && TEX.ensure) { try { TEX.ensure(L.theme); } catch (e) { console.warn('LEVEL: TEX.ensure', e); } }   // no-op when the UI already did it under the fade
    ensureRes();
    const g = L.group = new THREE.Group(); g.name = 'level'; scene.add(g);
    if (L.solids.some(s => s.built)) { L.solids = L.solids.filter(s => !s.built); L._sh = null; }   // rebuilding the same L
    const th = THEME[L.theme] || THEME.forest;
    setLighting(th); POST.saturation = th.sat;
    const ru = R.mat.rock.userData.u, mc = lin(th.moss[0]);
    ru.uMoss.value.set(mc.r, mc.g, mc.b, th.moss[1]);
    const rc = lin(th.rim[0]); ru.uRim.value.set(rc.r, rc.g, rc.b, th.rim[1]);
    R.mat.stone.userData.u.uMoss.value.set(mc.r, mc.g, mc.b, th.moss[1] * 0.6);
    for (const l of LIGHTS.torches) l.intensity = 0;
    R.ptOn.value.fill(1); R.portalOn.value = 1;
    const B = L._b = { L, g, rnd: mulberry32((L.seed ^ 0x9e3779b9) >>> 0), inst: {}, dec: {}, lights: [], pts: { add: [], norm: [] }, flames: [], slime: [], banners: [], windows: [], shelves: [], falls: [],
      anim: [], dispose: [], tmpGeo: [], glows: [], far: [], noTree: [], noDec: new Uint8Array(L.W * L.H), prox: {}, grpN: 0, ptOn: R.ptOn, ptScale: R.ptScale, slots: LIGHTS.torches.map(() => ({ c: null, k: 0 })) };
    const V = L.village;
    if (V) {
      for (const h of V.houses) B.noTree.push({ x: h.x, z: h.z, r: Math.max(h.w, h.d) * 0.5 + 1.3 });
      for (const b of V.beds) B.noTree.push({ x: b.x, z: b.z, r: 1.1 });
      for (const f of V.fences) B.noTree.push({ x: f.x, z: f.z, r: 0.55 });
      if (V.sign) B.noTree.push({ x: V.sign.x, z: V.sign.z, r: 0.9 });
      for (const h of V.houses) {   // no grass tufts / flowers poking through the houses
        const cs = Math.cos(h.yaw), sn = Math.sin(h.yaw), R = Math.hypot(h.w, h.d) / 2 + 1;
        for (let j = Math.floor(h.z - R); j <= h.z + R; j++) for (let i = Math.floor(h.x - R); i <= h.x + R; i++) {
          if (i < 0 || j < 0 || i >= L.W || j >= L.H) continue;
          const dx = i + 0.5 - h.x, dz = j + 0.5 - h.z;
          if (Math.abs(dx * cs - dz * sn) < h.w / 2 + 0.5 && Math.abs(dx * sn + dz * cs) < h.d / 2 + 0.5) B.noDec[j * L.W + i] = 1;
        }
      }
      for (const b of V.beds) B.noDec[Math.floor(b.z) * L.W + Math.floor(b.x)] = 1;
      if (V.well) B.noDec[Math.floor(V.well.z) * L.W + Math.floor(V.well.x)] = 1;
    }
    if (L.exit) B.noTree.push({ x: L.exit.x, z: L.exit.z - 0.5, r: 2.4 });
    L._volc = L.theme === 'volcano' ? volcanoField(L) : null;   // lava + bridges first: the floor mask needs them
    buildFloor(L, B);
    if (L.theme === 'forest') buildForest(L, B); else if (L.theme === 'cave') buildCave(L, B); else if (L.theme === 'volcano') buildVolcano(L, B); else buildCastle(L, B);
    if (V) buildVillage(L, B);
    L.fixedProps = fixReach(L, unProp, dropUnreachable);   // build-time rocks / props must not cut off a room, chest or checkpoint
    buildProps(L, B);
    finishBanners(B); finishSlime(B); finishWindows(B); finishLavafalls(B);
    finishInst(L, B); finishDecor(L, B); finishPoints(L, B); finishFlames(L, B); buildGlowTex(L, B);
    for (const t of B.tmpGeo) t.dispose();
    B.tmpGeo.length = 0;
    buildMapCanvas(L);
    L.buildMs = Math.round(performance.now() - t0);
    return L;
  }

  // ── LEVEL.update: props animation + the 4 pooled torch lights follow the hero ──
  const DECOR_FAR = 28;
  function update(dt, L, fx, fz) {
    const B = L && L._b;
    if (!B) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    if (fx === undefined || fz === undefined) { fx = CAM.target.x; fz = CAM.target.z; }
    R.heroU.value.set(fx, 0, fz);
    B.ptScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (let i = 0; i < B.anim.length; i++) B.anim[i](dt, fx, fz);
    for (let i = 0; i < B.far.length; i++) {   // small ground decor (flowers, tufts, pebbles) far from the view centre: not drawn
      const f = B.far[i], dx = f.x - fx, dz = f.z - fz, d = DECOR_FAR + f.r;
      f.o.visible = dx * dx + dz * dz < d * d;
    }
    assignLights(B, fx, fz, dt);
  }
  const LT_BEST = [];   // reused every frame (no garbage): the nearest candidate lights, best first
  function assignLights(B, fx, fz, dt) {
    const Ls = B.lights, slots = B.slots, ns = slots.length, best = LT_BEST;
    best.length = 0;
    for (let i = Ls.length - 1; i >= 0; i--) {
      const c = Ls[i];
      if (c.life !== undefined) { c.life -= dt; if (c.life <= 0) { Ls.splice(i, 1); continue; } }
      if (c.int <= 0.01) continue;
      const d = (c.x - fx) * (c.x - fx) + (c.z - fz) * (c.z - fz);
      if (d > 17 * 17) continue;
      c._d = d / (0.6 + c.int * 0.1);
      let k = best.length < ns ? best.length : ns - 1;   // insertion into a list capped at ns entries
      if (k === ns - 1 && best.length === ns && best[k]._d <= c._d) continue;
      if (best.length < ns) best.push(c);
      while (k > 0 && best[k - 1]._d > c._d) { best[k] = best[k - 1]; k--; }
      best[k] = c;
    }
    for (let i = 0; i < ns; i++) {
      const s = slots[i];
      if (!s.c) continue;
      let keepIt = false;
      for (let b = 0; b < best.length; b++) if (best[b] === s.c) { keepIt = true; break; }
      if (!keepIt) { s.k -= dt * 3; if (s.k <= 0) { s.k = 0; s.c = null; } }
    }
    for (let b = 0; b < best.length; b++) {
      const c = best[b];
      let s = null;
      for (let i = 0; i < ns; i++) if (slots[i].c === c) { s = slots[i]; break; }
      if (!s) { for (let i = 0; i < ns; i++) if (!slots[i].c) { s = slots[i]; break; } if (!s) continue; s.c = c; s.k = 0; }
      s.k = Math.min(1, s.k + dt * 3);
    }
    const t = TIME.t;
    for (let i = 0; i < ns; i++) {
      const s = slots[i], l = LIGHTS.torches[i];
      if (!s.c) { l.intensity = 0; continue; }
      const c = s.c, f = c.fl ? 1 - c.fl * (0.12 + 0.1 * Math.sin(t * 9.3 + c.ph) + 0.06 * Math.sin(t * 23.1 + c.ph * 2)) : 1;
      l.position.set(c.x, c.y, c.z); l.color.copy(c.col); l.distance = c.dist; l.decay = 1.6;
      l.intensity = c.int * s.k * f * (c.life !== undefined ? Math.min(1, c.life) : 1);
    }
  }

  function dispose(L) {
    if (!L) return;
    const B = L._b;
    if (L.group) {
      if (L.npcObj && L.npcObj.model && L.npcObj.model.root && !L.npcObj.model.placeholder) {   // EMODEL owns the owl's resources
        L.group.remove(L.npcObj.model.root);
        if (typeof L.npcObj.model.dispose === 'function') { try { L.npcObj.model.dispose(); } catch (e) { /* ignore */ } }
      }
      L.group.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      disposeTree(L.group);
    }
    if (B) for (const d of B.dispose) { try { d.dispose(); } catch (e) { /* already gone */ } }
    for (const l of LIGHTS.torches) l.intensity = 0;
    L.group = null; L._b = null; L._flow = null; L._blk = null;
  }

  return {
    generate, build, update, dispose, isFloor, circleFree, move, los, flowTo, flowDir, randomFloorNear,
    satCount: (L, x0, z0, x1, z1) => satCount(L, x0, z0, x1, z1),
  };
})();
