/* Bilbo — sculpted Labrador, articulated skeleton, shared portrait and distance-driven gait. */
const BILBO = (() => {
  'use strict';
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const smooth = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const furMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.83 });
  const wetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36 });
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16 });
  const shineMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const sphere = new THREE.SphereGeometry(1, 28, 20);
  const detail = new THREE.SphereGeometry(1, 18, 12);
  const COAT = 0x67432f, EAR = 0x573929, MUZZLE = 0x704c36;

  // Continuous sculpted surfaces. Sections: z, horizontal radius, vertical radius, centre y.
  function loft(sections, rows = 40, sides = 32) {
    const pos = [], uv = [], idx = [];
    const sample = (t, k) => {
      const u = t * (sections.length - 1), i = Math.min(sections.length - 2, Math.floor(u)), f = u - i;
      const a = sections[Math.max(0, i - 1)][k], b = sections[i][k], c = sections[i + 1][k], d = sections[Math.min(sections.length - 1, i + 2)][k];
      return 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    };
    for (let i = 0; i <= rows; i++) {
      const t = i / rows, z = sample(t, 0), rx = Math.max(0.001, sample(t, 1)), ry = Math.max(0.001, sample(t, 2)), cy = sample(t, 3);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        pos.push(Math.cos(a) * rx, cy + Math.sin(a) * ry, z); uv.push(j / sides, t);
        if (i < rows && j < sides) { const n = i * (sides + 1) + j; idx.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const trunkGeo = loft([[-0.91, .001, .001, .72], [-.77, .23, .26, .73], [-.52, .32, .33, .75],
    [-.16, .32, .31, .77], [.18, .35, .37, .78], [.42, .33, .38, .83], [.59, .19, .27, .88], [.66, .001, .001, .89]]);
  const headGeo = loft([[-.29, .001, .001, .02], [-.23, .23, .24, .045], [-.08, .315, .29, .07],
    [.10, .31, .27, .07], [.25, .24, .20, .015], [.40, .235, .155, -.055], [.54, .215, .14, -.068], [.63, .13, .08, -.06], [.65, .001, .001, -.05]], 46, 40);
  { const p = headGeo.attributes.position; for (let i=0;i<p.count;i++) if(p.getY(i)>.20) p.setY(i,.20+(p.getY(i)-.20)*.55); headGeo.computeVertexNormals(); }
  function earGeo(side) {
    // A closed, rounded fold attached inside the skull; broad near the cheek, tucked-in at the tip.
    const g = loft([[0, .001, .001, 0], [.035, .064, .034, .012], [.12, .123, .046, .035],
      [.24, .125, .039, .075], [.35, .089, .030, .105], [.43, .039, .018, .11], [.46, .001, .001, .10]], 36, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getZ(i), u = clamp01(t / .46);
      p.setXYZ(i, p.getX(i) + side * (.045 * Math.sin(u * Math.PI) - .014 * u), -t, p.getY(i));
    }
    g.computeVertexNormals(); return g;
  }
  const earL = earGeo(-1), earR = earGeo(1);
  const foreGeo = loft([[-.07,.065,.08,0],[.04,.127,.15,0],[.17,.118,.125,0],[.30,.099,.103,0],[.44,.085,.087,.015],[.60,.078,.08,.035],[.67,.068,.064,.04]],32,24);
  const hindGeo = loft([[-.09,.065,.09,0],[.02,.18,.21,0],[.15,.17,.185,0],[.29,.12,.13,-.035],[.43,.089,.095,-.02],[.59,.075,.08,.03],[.67,.068,.064,.04]],32,24);
  const tailGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .03, -.22), new THREE.Vector3(0, .14, -.47), new THREE.Vector3(0, .20, -.73)
  ]), 24, .08, 12, false);
  { const p = tailGeo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 13) / 24, k = 1 - .86 * t;
      const c = tailGeo.parameters.path.getPointAt(t);
      p.setXYZ(i, p.getX(i) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k); }
    tailGeo.computeVertexNormals(); }

  function create() {
    const root = new THREE.Group(); root.name = 'Bilbo';
    const bones = [], parts = [], owned = [];
    function joint(parent, name, x = 0, y = 0, z = 0) {
      const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); parent.add(b); bones.push(b); return b;
    }
    function part(bone, geo, color, pos = [0, 0, 0], scale = [1, 1, 1], mat = furMat, rot = [0, 0, 0]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale));
      const p = { bone, geo, color: new THREE.Color(color), m, mat }; parts.push(p); return p;
    }
    const ell = (b, col, p, s, mat = furMat, rot) => part(b, sphere, col, p, s, mat, rot);
    const small = (b, col, p, s, mat = wetMat) => part(b, detail, col, p, s, mat);
    function curve(b, pts, radius, color, mat = wetMat) {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), 20, radius, 6, false);
      owned.push(g); part(b, g, color, undefined, undefined, mat);
    }
    const body = joint(root, 'body'); part(body, trunkGeo, COAT);
    const neck = joint(body, 'neck', 0, .91, .38);
    ell(neck, COAT, [0, .06, .08], [.29, .32, .30], furMat, [-.25, 0, 0]);
    const head = joint(neck, 'head', 0, .18, .13);
    part(head, headGeo, COAT).muzzle = true;
    small(head, 0x563831, [0, -.022, .635], [.137, .073, .070]);
    curve(head, [[0,-.09,.645],[0,-.15,.622],[0,-.174,.598]], .006, 0x402b23);
    for (const side of [-1, 1]) {
      small(head, 0x241b19, [side * .066, -.017, .702], [.032, .023, .015]);
      curve(head, [[0,-.174,.598],[side*.11,-.193,.552],[side*.19,-.150,.43]], .006, 0x402b23);
      ell(head, 0x3b2a21, [side * .202, .131, .260], [.069, .052, .039]);
      const eye = joint(head, 'eye' + side, side * .202, .135, .292);
      small(eye, 0xb88a40, [0, 0, 0], [.052, .043, .018], eyeMat);
      small(eye, 0x171311, [0, .002, .015], [.033, .035, .010], eyeMat);
      small(eye, 0xffffff, [-.012, .017, .025], [.011, .010, .005], shineMat);
      small(eye, 0xffe5bc, [.014, -.014, .024], [.004, .004, .003], shineMat);
      ell(head, COAT, [side * .19, .16, .174], [.094, .043, .087]);
    }
    const eyes = bones.filter(b => b.name.startsWith('eye'));
    const ears = [-1, 1].map(side => {
      const b = joint(head, 'ear' + side, side * .268, .235, .015); part(b, side < 0 ? earL : earR, EAR); return { b, side };
    });
    const jaw = joint(head, 'jaw', 0, -.12, .26);
    ell(jaw, 0x34211e, [0, -.065, .20], [.178, .032, .17], wetMat);
    ell(jaw, MUZZLE, [0, -.093, .19], [.195, .055, .177]);
    const tongue = joint(jaw, 'tongue', 0, -.062, .30);
    small(tongue, 0xc8757b, [0, 0, 0], [.064, .022, .075]);
    const legs = [];
    for (const front of [true, false]) for (const side of [-1, 1]) {
      const b = joint(body, (front ? 'fore' : 'hind') + side, side * .25, .75, front ? .33 : -.56);
      const shin = joint(b, 'shin', 0, -.30, front ? 0 : -.035);
      const limb = part(b, front ? foreGeo : hindGeo, COAT, [0,0,0], [1,1,1], furMat, [Math.PI/2,0,0]);
      limb.skin = z => { let w = clamp01((z-.20)/.20); w = w*w*(3-2*w); return { bone: shin, w }; };
      const foot = joint(shin, 'paw', 0, -.34, .035);
      ell(foot, COAT, [0, -.02, .075], [.135, .090, .204]);
      for (const x of [-.045, .045]) curve(foot, [[x, .025, .228], [x, .047, .17], [x, .055, .11]], .0035, 0x493023, furMat);
      legs.push({ b, shin, foot, front, side });
    }
    const tail = joint(body, 'tail', 0, .83, -.79); part(tail, tailGeo, COAT);
    root.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones), meshes = [];
    // All fur shares one skinned surface; the whole dog uses only four material draws.
    for (const mat of new Set(parts.map(p => p.mat))) {
      const list = parts.filter(p => p.mat === mat), positions = [], normals = [], colors = [], uvs = [], skinI = [], skinW = [], indices = [];
      const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
      const muzzleColor = new THREE.Color(MUZZLE), painted = new THREE.Color();
      let base = 0;
      for (const p of list) {
        const m = p.bone.matrixWorld.clone().multiply(p.m), a = p.geo.attributes, bi = bones.indexOf(p.bone);
        nm.getNormalMatrix(m);
        for (let i = 0; i < a.position.count; i++) {
          v.fromBufferAttribute(a.position, i).applyMatrix4(m); positions.push(v.x, v.y, v.z);
          n.fromBufferAttribute(a.normal, i).applyMatrix3(nm).normalize(); normals.push(n.x, n.y, n.z);
          const shade = mat === furMat ? .91 + .09 * clamp01(n.y * .5 + .5) : 1;
          painted.copy(p.color);
          if (p.muzzle) painted.lerp(muzzleColor, clamp01((a.position.getZ(i)-.20)/.32) * clamp01((.20-a.position.getY(i))/.20));
          colors.push(painted.r * shade, painted.g * shade, painted.b * shade);
          uvs.push(a.uv ? a.uv.getX(i) : 0, a.uv ? a.uv.getY(i) : 0);
          const skin = p.skin ? p.skin(a.position.getZ(i)) : null;
          skinI.push(bi, skin ? bones.indexOf(skin.bone) : 0, 0, 0); skinW.push(skin ? 1-skin.w : 1, skin ? skin.w : 0, 0, 0);
        }
        const index = p.geo.index;
        for (let i = 0; i < (index ? index.count : a.position.count); i++) indices.push(base + (index ? index.getX(i) : i));
        base += a.position.count;
      }
      const g = new THREE.BufferGeometry();
      for (const [key, data, size] of [['position', positions, 3], ['normal', normals, 3], ['color', colors, 3], ['uv', uvs, 2], ['skinWeight', skinW, 4]]) g.setAttribute(key, new THREE.Float32BufferAttribute(data, size));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4)); g.setIndex(indices); g.computeBoundingSphere();
      const mesh = new THREE.SkinnedMesh(g, mat); mesh.name = 'Bilbo surface'; mesh.castShadow = mat !== shineMat; mesh.receiveShadow = false;
      mesh.frustumCulled = false; root.add(mesh); mesh.bind(skel); meshes.push(mesh);
    }
    owned.forEach(g => g.dispose());
    let t = 0, stride = 0, run = 0, rest = 0, sit = 0, blinkAt = 2.8, blink = 0, fetch = null, chew = 0;
    const snacks = [], snackGeo = new THREE.SphereGeometry(1, 10, 8);
    const snackMat = new THREE.MeshStandardMaterial({ color: 0xe5a17d, roughness: .8 });
    const boneGeo = new THREE.CylinderGeometry(.045, .045, .38, 10);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xfff2d4, roughness: .65 });
    function mouthWorld() { return root.localToWorld(new THREE.Vector3(0, 1.03, 1.10)); }
    function removeSnack(s) { if (s.mesh.parent) s.mesh.parent.remove(s.mesh); }
    function fetchBone(hero, targets = [], onHit) {
      if (fetch || !root.parent || !hero) return false;
      const bone = new THREE.Group();
      const shaft = new THREE.Mesh(boneGeo, boneMat); shaft.rotation.z = Math.PI / 2; bone.add(shaft);
      for (const side of [-1, 1]) for (const up of [-1, 1]) {
        const knob = new THREE.Mesh(snackGeo, boneMat); knob.scale.set(.072, .067, .058); knob.position.set(side * .19, up * .045, 0); bone.add(knob);
      }
      root.parent.add(bone);
      fetch = { age: 0, bone, from: new THREE.Vector3(hero.x, (hero.y || 0) + 1.1, hero.z), targets: targets.slice(0, 5), onHit };
      return true;
    }
    function updateSnacks(dt) {
      chew = Math.max(0, chew - dt);
      if (fetch) {
        const f = fetch; f.age += dt;
        const u = Math.min(1, f.age / .48), to = mouthWorld();
        f.bone.position.lerpVectors(f.from, to, u); f.bone.position.y += Math.sin(Math.PI * u) * .85;
        f.bone.rotation.set(f.age * 5, f.age * 7, f.age * 9);
        if (u >= 1) {
          f.bone.parent.remove(f.bone); chew = .65;
          const origin = mouthWorld();
          for (let i = 0; i < Math.max(3, f.targets.length); i++) {
            const target = f.targets[i], angle = root.rotation.y + (i - 1) * .22;
            const mesh = new THREE.Mesh(snackGeo, snackMat); mesh.scale.set(.09, .066, .11); root.parent.add(mesh);
            const end = target ? new THREE.Vector3(target.x, (target.y || 0) + Math.max(.4, (target.height || 1) * .5), target.z) : origin.clone().add(new THREE.Vector3(Math.sin(angle) * 3, -.6, Math.cos(angle) * 3));
            snacks.push({ mesh, from: origin.clone(), end, target, onHit: f.onHit, age: -i * .055, duration: .32 + origin.distanceTo(end) * .035 });
          }
          fetch = null;
        }
      }
      for (let i = snacks.length - 1; i >= 0; i--) {
        const s = snacks[i]; s.age += dt; s.mesh.visible = s.age >= 0;
        if (s.target && !s.target.dead) s.end.set(s.target.x, (s.target.y || 0) + Math.max(.4, (s.target.height || 1) * .5), s.target.z);
        const u = clamp01(s.age / s.duration); s.mesh.position.lerpVectors(s.from, s.end, u); s.mesh.position.y += Math.sin(Math.PI * u) * .3;
        s.mesh.rotation.set(s.age * 7, s.age * 4, s.age * 8);
        if (u >= 1) { removeSnack(s); snacks.splice(i, 1); if (s.target && !s.target.dead && s.onHit) s.onHit(s.target); }
      }
    }
    function clearActions() {
      if (fetch) { if (fetch.bone.parent) fetch.bone.parent.remove(fetch.bone); fetch = null; }
      snacks.forEach(removeSnack); snacks.length = 0; chew = 0;
    }
    function update(dt, state = {}) {
      dt = Math.min(Math.max(dt || 0, 0), .1); t += dt;
      updateSnacks(dt);
      const speed = Math.max(0, state.speed || 0), moving = speed > .10;
      run = smooth(run, clamp01(speed / 5.2), 10, dt);
      stride += speed * dt * 3.8;
      rest = moving || state.bark > 0 || state.pounce > 0 || fetch || chew > 0 ? 0 : rest + dt;
      sit = smooth(sit, state.sit || rest > 7 ? 1 : 0, 4, dt);
      const age = 1.30 - (state.bark || 0);
      const bark = state.bark > 0 ? Math.exp(-Math.pow((age - .13) / .11, 2)) + Math.exp(-Math.pow((age - .85) / .12, 2)) : 0;
      body.position.y = run * .018 * Math.cos(stride * 2) + .004 * Math.sin(t * 2.2) - sit * .13;
      body.rotation.set(-.09 * sit + .02 * run * Math.cos(stride), 0, .014 * run * Math.sin(stride));
      for (const { b, shin, foot, front, side } of legs) {
        const phase = stride + (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0), s = Math.sin(phase);
        b.position.y = .75 + (front ? .08 * sit : 0);
        b.rotation.x = .48 * run * s + (front ? -.10 : 1.03) * sit;
        shin.rotation.x = .60 * run * Math.max(0, -Math.cos(phase)) - (front ? 0 : 1.35) * sit;
        foot.rotation.x = -b.rotation.x * .30 - shin.rotation.x * .55;
      }
      neck.rotation.x = -.035 * run + .025 * bark;
      head.rotation.x = -.02 + .028 * (1 - run) * Math.sin(t * 1.4) - .11 * bark;
      head.rotation.y = state.portrait ? -.035 : .045 * (1 - run) * Math.sin(t * .63);
      head.rotation.z = state.portrait ? -.10 : .02 * (1 - run) * Math.sin(t * .7);
      ears.forEach(({ b, side }) => { b.rotation.z = smooth(b.rotation.z, side * (.04 + .10 * run * Math.sin(stride - .6) + .10 * bark), 12, dt); });
      tail.rotation.y = (.18 + .25 * run) * Math.sin(t * 5.4);
      tail.rotation.x = -.10 + .07 * Math.sin(t * 2.7) - sit * .18;
      jaw.rotation.x = (state.portrait ? .105 : .012) + .55 * bark;
      tongue.scale.setScalar(state.portrait ? .72 : bark > .1 ? .8 : .1);
      blinkAt -= dt;
      if (blinkAt <= 0) { blink = .18; blinkAt = 2.7 + Math.random() * 2.4; }
      blink = Math.max(0, blink - dt);
      const lid = state.portrait ? 1 : 1 - .92 * Math.sin(Math.PI * clamp01(blink / .18));
      eyes.forEach(b => { b.scale.y = lid; });
      // Anticipation, tucked paws, floppy ears and a soft landing make the playful leap readable.
      const leap = clamp01(state.pounce || 0), nibble = chew > 0 ? Math.sin(t * 25) * .07 + .12 : 0;
      body.rotation.x -= .16 * leap;
      for (const { b, shin, foot, front } of legs) {
        b.rotation.x += (front ? -.9 : .55) * leap;
        shin.rotation.x += (front ? .8 : -.6) * leap; foot.rotation.x -= .22 * leap;
      }
      ears.forEach(({ b, side }) => { b.rotation.x = -.22 * leap + .035 * run * Math.sin(stride + side); });
      head.rotation.x += (fetch ? -.15 : 0) + .09 * nibble - .10 * leap;
      head.rotation.z += .055 * (1 - run) * Math.sin(t * .91) + .02 * nibble;
      jaw.rotation.x += nibble + (run > .45 ? .065 + .025 * Math.sin(t * 8) : 0);
      tongue.scale.setScalar(Math.max(state.portrait ? .72 : .1, run * .55, nibble > 0 ? .6 : 0, bark > .1 ? .8 : 0));
      tail.rotation.y += (fetch || chew > 0 ? .18 * Math.sin(t * 13) : 0);
    }
    update(0);
    function dispose() { clearActions(); meshes.forEach(m => m.geometry.dispose()); snackGeo.dispose(); snackMat.dispose(); boneGeo.dispose(); boneMat.dispose(); skel.dispose(); }
    return { root, update, dispose, bones, meshes, fetchBone, clearActions, isFetching: () => !!fetch || snacks.length > 0 };
  }

  let portraitUrl = null;
  function portrait() {
    if (portraitUrl) return portraitUrl;
    if (typeof renderer === 'undefined') return null;
    const N = 192, sc = new THREE.Scene(), m = create(); m.update(0, { portrait: true }); sc.add(m.root);
    sc.add(new THREE.HemisphereLight(0xfff3dd, 0x5f4b3d, 1.5));
    const key = new THREE.DirectionalLight(0xffe5c4, 3.1); key.position.set(-3, 4, 5); sc.add(key);
    const fill = new THREE.DirectionalLight(0xc5defb, 1.5); fill.position.set(3, 2, -1); sc.add(fill);
    const cam = new THREE.OrthographicCamera(-.54, .54, .54, -.54, .1, 10);
    cam.position.set(.10, 1.28, 4); cam.lookAt(0, 1.15, .55); cam.updateMatrixWorld();
    const rt = new THREE.WebGLRenderTarget(N, N, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const oldRT = renderer.getRenderTarget(), oldC = renderer.getClearColor(new THREE.Color()), oldA = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(rt); renderer.setClearColor(0, 0); renderer.clear(); renderer.render(sc, cam);
      const pixels = new Uint8Array(N * N * 4); renderer.readRenderTargetPixels(rt, 0, 0, N, N, pixels);
      const c = document.createElement('canvas'); c.width = c.height = N;
      const ctx = c.getContext('2d'), out = ctx.createImageData(N, N);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = ((N - 1 - y) * N + x) * 4, b = (y * N + x) * 4, alpha = pixels[a + 3], k = alpha > 0 ? 255 / alpha : 0;
        for (let j = 0; j < 3; j++) out.data[b + j] = Math.min(255, pixels[a + j] * k);
        out.data[b + 3] = alpha;
      }
      ctx.putImageData(out, 0, 0); portraitUrl = c.toDataURL('image/png'); return portraitUrl;
    } finally { renderer.setRenderTarget(oldRT); renderer.setClearColor(oldC, oldA); rt.dispose(); m.dispose(); }
  }
  return { create, portrait };
})();
