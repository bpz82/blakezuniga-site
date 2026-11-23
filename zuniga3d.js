// ---- ZUNIGA floating 3D word (snippet; paste inside the scene module) ----
// Needs in scope: THREE, FontLoader, TextGeometry, scene, G, bc (Vector3), L, STAGE.
// Defines one function: zgWordTick(dt, camera, mode). Everything else lives in zgW.
const zgW = {
  tick: null, // set to the real per-frame function once the font has loaded
  busy() {
    return !!zgW._busy;
  },
};

(function zgWordLoad() {
  // intro-polish: the word is alive (loading / waiting for BOOT.ready) until it emits a phase or fails; harness.js and the amp start guards read this
  window.__zgWordPending = true;
  const warn = (e) => {
    if (zgW.warned) return;
    zgW.warned = true;
    window.__zgWordPending = false;
    console.warn('[zuniga3d] floating word disabled:', e && e.message ? e.message : e);
    try {
      document.body.classList.remove('zg-intro');
      document.body.classList.add('zg-reveal-done');
      document.body.dataset.reveal = 'done';
      document.dispatchEvent(new CustomEvent('zg:reveal', { detail: { phase: 'done', skipped: true, failed: true } }));
    } catch (_) {
      /* ignore */
    }
  };

  const build = (font) => {
    const size = L * 0.16;

    const geo = new TextGeometry('ZUNIGA', {
      font: font,
      size: size,
      depth: size * 0.22,
      curveSegments: 3,
      bevelEnabled: true,
      bevelThickness: size * 0.03,
      bevelSize: size * 0.02,
      bevelSegments: 1,
    });
    geo.computeBoundingBox();
    geo.center();
    geo.computeBoundingBox();
    const width = geo.boundingBox.max.x - geo.boundingBox.min.x;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0,
      emissive: 0x222222,
      transparent: true, // only during the fade-in
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false; // until the first tick has positioned it

    // soft blob shadow texture, drawn once
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 64;
    const cx = cv.getContext('2d');
    cx.translate(128, 32);
    cx.scale(1, 0.25); // circle -> 256x64 ellipse
    const grd = cx.createRadialGradient(0, 0, 0, 0, 0, 128);
    // WEBSITE (integration): the floor behind the guitar is already dark, so a plain black blob barely showed. A dark core
    // inside a faint warm pool (the light the word blocks) makes the shadow read on the dark stage. Still one plane, one texture.
    grd.addColorStop(0, 'rgba(0,0,0,0.92)');
    grd.addColorStop(0.42, 'rgba(0,0,0,0.7)');
    grd.addColorStop(0.62, 'rgba(70,40,30,0.28)');
    grd.addColorStop(0.8, 'rgba(120,70,50,0.12)');
    grd.addColorStop(1, 'rgba(120,70,50,0)');
    cx.fillStyle = grd;
    cx.fillRect(-128, -128, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    // call 3 (SM1): upload the blob-shadow canvas now (word load, before 'in'); it is never flagged needsUpdate again
    try { if (typeof renderer !== 'undefined' && renderer && renderer.initTexture) renderer.initTexture(tex); } catch (_) { /* uploaded lazily instead */ }

    const smat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat);
    shadow.rotation.order = 'YXZ'; // yaw about world Y, then lie flat
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.05;
    shadow.renderOrder = 1;
    shadow.castShadow = false;
    shadow.receiveShadow = false;
    shadow.visible = false;

    const veilMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), veilMat);
    veil.renderOrder = 10;
    veil.frustumCulled = false;
    veil.visible = false;
    mesh.renderOrder = 11;

    // Tagline "Folk Blues": a CHILD of the ZUNIGA mesh so it shares pose, scale, float,
    // and the SAME material (color / roughness / emissive / shine) as 0ed7f1d. Own failure
    // domain: a throw leaves ZUNIGA intact. Slightly larger than the first Folk Blues, plus
    // an unlit drop-shadow only — no separate lit material or bevel, so ZUNIGA's look is unchanged.
    let shadowMat = null;
    try {
      const ssize = size * 0.44;
      const sgeo = new TextGeometry('Folk Blues', {
        font: font,
        size: ssize,
        depth: ssize * 0.2,
        curveSegments: 3,
        bevelEnabled: false,
      });
      sgeo.center();
      const sub = new THREE.Mesh(sgeo, mat);
      sub.name = 'zg-tagline';
      sub.userData.text = 'Folk Blues';
      sub.position.set(0, -size * 0.86, 0);
      sub.castShadow = false;
      sub.receiveShadow = false;
      sub.renderOrder = 11;
      try {
        shadowMat = new THREE.MeshBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const sh = new THREE.Mesh(sgeo, shadowMat);
        sh.name = 'zg-tagline-shadow';
        sh.userData.role = 'tagline-shadow';
        sh.position.set(ssize * 0.06, -ssize * 0.08, -ssize * 0.35);
        sh.renderOrder = 10;
        sh.castShadow = false;
        sh.receiveShadow = false;
        sub.add(sh);
      } catch (e2) {
        console.warn('[zuniga3d] tagline shadow disabled:', e2 && e2.message ? e2.message : e2);
        shadowMat = null;
      }
      mesh.add(sub);
    } catch (e) {
      console.warn('[zuniga3d] tagline disabled:', e && e.message ? e.message : e);
    }

    scene.add(mesh);
    scene.add(shadow);
    scene.add(veil);

    // reused temporaries
    const pos = new THREE.Vector3(); // smoothed anchor (no float)
    const tgt = new THREE.Vector3();
    const d = new THREE.Vector3();
    const look = new THREE.Vector3();
    const center = new THREE.Vector3();
    const downFrom = new THREE.Vector3();
    let yaw = 0;
    let sc = 1;
    let init = false;
    let t = 0;
    let fade = 0;
    let fading = true;
    const TWO_PI = Math.PI * 2;

    // Load-in (Blake t143u): fade/scale at center, hold, float down while the guitar and widgets reveal.
    const IN_S = 0.7;
    const HOLD_S = 0.45;
    const DOWN_S = 1.2;
    const QUICK_S = 0.35;
    let phase = 'pending'; // pending | in | hold | down | done
    let phaseT = 0;
    let phaseAt = 0; // performance.now() when the current phase began (wall-clock)
    let hiddenAt = 0;
    let skipped = false;
    let reducedIntro = false;
    let downStarted = false;
    let introScale = 1;
    const skipHandlers = [];

    const easeOut = (u) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);
    const easeInOut = (u) => {
      u = Math.min(1, Math.max(0, u));
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    };

    function emit(p, extra) {
      window.__zgWordPending = false;
      try {
        if (p === 'in' || p === 'hold') {
          document.body.classList.add('zg-intro');
          document.body.classList.remove('zg-reveal-done');
        }
        if (p === 'down' || p === 'widgets') {
          document.body.classList.add('zg-intro');
        }
        if (p === 'done') {
          document.body.classList.remove('zg-intro');
          document.body.classList.add('zg-reveal-done');
          zgW._busy = false;
        } else {
          zgW._busy = true;
        }
        document.body.dataset.reveal = p === 'widgets' ? 'down' : p;
        document.dispatchEvent(new CustomEvent('zg:reveal', { detail: Object.assign({ phase: p, skipped }, extra || {}) }));
      } catch (_) {
        /* ignore */
      }
    }

    function prefersReduced() {
      try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (_) {
        return false;
      }
    }

    function restOf(camera) {
      const cp = camera.position;
      d.set(bc.x - cp.x, 0, bc.z - cp.z);
      const len = Math.hypot(d.x, d.z);
      if (len < 1e-4) d.set(0, 0, -1);
      else d.multiplyScalar(1 / len);
      const D = Math.max(L * 0.5, Math.hypot(cp.x - bc.x, cp.y - bc.y, cp.z - bc.z));
      const want = Math.min(1.2, Math.max(0.55, D / (L * 2.3)));
      tgt.set(bc.x + d.x * D * 0.2, bc.y + D * 0.17, bc.z + d.z * D * 0.2);
      return { D, want };
    }

    function placeCenter(camera, dist) {
      camera.getWorldDirection(look);
      center.copy(camera.position).addScaledVector(look, dist);
    }

    function fitVeil(camera, dist) {
      const vFov = (camera.fov * Math.PI) / 180;
      const h = 2 * Math.tan(vFov / 2) * dist;
      const w = h * (camera.aspect || 1);
      veil.scale.set(w * 1.2, h * 1.2, 1);
      camera.getWorldDirection(look);
      veil.position.copy(camera.position).addScaledVector(look, dist);
      veil.lookAt(camera.position);
    }

    function syncFade(o) {
      mat.opacity = o;
      if (shadowMat) shadowMat.opacity = 0.45 * o;
    }
    function finishMat() {
      fading = false;
      fade = 1;
      mat.transparent = false;
      mat.opacity = 1;
      mat.needsUpdate = true;
      if (shadowMat) shadowMat.opacity = 0.45;
    }
    const bootReady = () => !!(typeof BOOT !== 'undefined' && BOOT.ready);
    const WAIT_FAILSAFE_MS = 60000;
    zgW.path = window.__zgIntroPath = { start: null, end: null };
    function placeIntroStart(camera) {
      // Short float-down that stays above the guitar, never along the look-ray through the body.
      // No extra world-Y lift here: fitGroupToFrustum keeps the group inside the frame.
      camera.getWorldDirection(look);
      center.copy(tgt);
      center.addScaledVector(look, -L * 0.03);   // call 3: 0.06 -> 0.03 (smaller hold->rest perspective change on short views)
    }
    function recordPath() {
      zgW.path = window.__zgIntroPath = {
        start: { x: downFrom.x, y: downFrom.y, z: downFrom.z },
        end: { x: tgt.x, y: tgt.y, z: tgt.z },
      };
    }
    const _nameTmpBox = new THREE.Box3();
    function ensureNameBox() {
      if (zgW._nameBox) return zgW._nameBox;
      const box = new THREE.Box3();
      geo.computeBoundingBox();
      box.copy(geo.boundingBox);
      const add = (obj) => {
        if (!obj || !obj.isMesh || !obj.geometry) return;
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        _nameTmpBox.copy(obj.geometry.boundingBox);
        obj.updateMatrix();
        _nameTmpBox.applyMatrix4(obj.matrix);
        box.union(_nameTmpBox);
      };
      mesh.children.forEach((ch) => {
        add(ch);
        if (ch.children) ch.children.forEach(add);
      });
      zgW._nameBox = box;
      return box;
    }
    const _fitEul = new THREE.Euler(0, 0, 0, 'XYZ');
    const _fitMat = new THREE.Matrix4();
    const _fitV = new THREE.Vector3();
    const _fitBox = { x: 0, y: 0, right: 0, bottom: 0, n: 0 };
    const _fitProbe = { x: 0, y: 0, right: 0, bottom: 0, n: 0 };
    const _gBox = new THREE.Box3();
    const _fitDest = new THREE.Vector3();
    function projectNameBox(camera, px, py, pz, scale, yaw, out) {
      const lb = ensureNameBox();
      const padY = (L * 0.012) / Math.max(scale, 1e-4);
      _fitEul.set(0, yaw, 0);
      _fitMat.makeRotationFromEuler(_fitEul);
      const W = window.innerWidth || 1, H = window.innerHeight || 1;
      camera.updateMatrixWorld(true);
      const iv = camera.matrixWorldInverse.elements, pj = camera.projectionMatrix.elements;
      let minSX = Infinity, minSY = Infinity, maxSX = -Infinity, maxSY = -Infinity, n = 0;
      for (const lx of [lb.min.x, lb.max.x]) {
        for (const ly of [lb.min.y, lb.max.y + padY]) {
          for (const lz of [lb.min.z, lb.max.z]) {
            _fitV.set(lx * scale, ly * scale, lz * scale).applyMatrix4(_fitMat);
            const x = _fitV.x + px, y = _fitV.y + py, z = _fitV.z + pz;
            const vx = iv[0] * x + iv[4] * y + iv[8] * z + iv[12];
            const vy = iv[1] * x + iv[5] * y + iv[9] * z + iv[13];
            const vz = iv[2] * x + iv[6] * y + iv[10] * z + iv[14];
            const vw = iv[3] * x + iv[7] * y + iv[11] * z + iv[15];
            const cx = pj[0] * vx + pj[4] * vy + pj[8] * vz + pj[12] * vw;
            const cy = pj[1] * vx + pj[5] * vy + pj[9] * vz + pj[13] * vw;
            const cw = pj[3] * vx + pj[7] * vy + pj[11] * vz + pj[15] * vw;
            if (!cw) continue;
            const sx = (cx / cw + 1) / 2 * W, sy = (1 - cy / cw) / 2 * H;
            n++;
            if (sx < minSX) minSX = sx; if (sx > maxSX) maxSX = sx;
            if (sy < minSY) minSY = sy; if (sy > maxSY) maxSY = sy;
          }
        }
      }
      out.x = minSX; out.y = minSY; out.right = maxSX; out.bottom = maxSY; out.n = n;
      return out;
    }
    function guitarScreenTop(camera, x0, x1) {
      let top = Infinity;
      try {
        if (!G) return top;
        G.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const W = window.innerWidth || 1, H = window.innerHeight || 1;
        const iv = camera.matrixWorldInverse.elements, pj = camera.projectionMatrix.elements;
        const e = G.matrixWorld.elements;
        const pad = 8;
        const use = (wx, wy, wz) => {
          const vx = iv[0] * wx + iv[4] * wy + iv[8] * wz + iv[12];
          const vy = iv[1] * wx + iv[5] * wy + iv[9] * wz + iv[13];
          const vz = iv[2] * wx + iv[6] * wy + iv[10] * wz + iv[14];
          const vw = iv[3] * wx + iv[7] * wy + iv[11] * wz + iv[15];
          const cx = pj[0] * vx + pj[4] * vy + pj[8] * vz + pj[12] * vw;
          const cy = pj[1] * vx + pj[5] * vy + pj[9] * vz + pj[13] * vw;
          const cw = pj[3] * vx + pj[7] * vy + pj[11] * vz + pj[15] * vw;
          if (!cw) return;
          const sx = (cx / cw + 1) / 2 * W, sy = (1 - cy / cw) / 2 * H;
          if (sx >= x0 - pad && sx <= x1 + pad && sy < top) top = sy;
        };
        const fp = (typeof GT !== 'undefined' && GT && GT.footprint) ? [].concat(...GT.footprint) : null;
        if (fp && fp.length) {
          const stride = Math.max(1, Math.ceil(fp.length / 80));
          for (let i = 0; i < fp.length; i += stride) {
            const lx = fp[i][0], lz = fp[i][1];
            for (const ly of [0.2, 1.0, 2.0, 2.6]) {
              use(
                e[0] * lx + e[4] * ly + e[8] * lz + e[12],
                e[1] * lx + e[5] * ly + e[9] * lz + e[13],
                e[2] * lx + e[6] * ly + e[10] * lz + e[14]
              );
            }
          }
        } else {
          _gBox.setFromObject(G);
          const b = _gBox;
          for (const gx of [b.min.x, b.max.x]) for (const gy of [b.min.y, b.max.y]) for (const gz of [b.min.z, b.max.z]) use(gx, gy, gz);
        }
      } catch (_) { /* guitar not ready */ }
      return top;
    }
    // Fit the ZUNIGA + Folk Blues group to the camera frustum with a comfortable
    // screen margin, stay clear of the guitar, and scale down on short aspects.
    // Replaces the fixed L*0.05 lift, which pushed the name out of the top of the frame.
    function fitGroupToFrustum(camera, anchor, baseScale, yaw, dest, noScale) {
      const W = Math.max(1, window.innerWidth || 1), H = Math.max(1, window.innerHeight || 1);
      const margin = Math.max(24, Math.round(Math.min(W, H) * 0.05));
      const gap = Math.max(16, Math.round(Math.min(W, H) * 0.03));
      let scale = baseScale;
      const minScale = Math.max(0.28, baseScale * 0.4);
      let y = anchor.y;
      const x = anchor.x, z = anchor.z;
      const box = _fitBox;
      // Only nudge when the natural pose would leave the frame or cover the
      // guitar. Do not pre-lift off the guitar's world AABB — that was the
      // L*0.05 overflow, and it shrank the name during boot before the guitar
      // pose was ready. Leave scale and y alone when already inside the margin.
      for (let i = 0; i < 12; i++) {
        projectNameBox(camera, x, y, z, scale, yaw, box);
        if (!box.n) break;
        const textH = box.bottom - box.y, textW = box.right - box.x;
        const gTop = guitarScreenTop(camera, box.x, box.right);
        const floor = Math.min(H - margin, Number.isFinite(gTop) ? gTop - gap : H - margin);
        const ceil = margin;
        const roomH = floor - ceil, roomW = W - 2 * margin;
        let scaled = false;
        if (!noScale && roomH > 8 && textH > roomH && scale > minScale + 1e-4) {
          scale = Math.max(minScale, scale * (roomH / textH) * 0.96);
          scaled = true;
        }
        if (!noScale && roomW > 8 && textW > roomW && scale > minScale + 1e-4) {
          scale = Math.max(minScale, scale * (roomW / textW) * 0.96);
          scaled = true;
        }
        if (scaled) continue;
        const overflowTop = ceil - box.y;
        const overflowBot = box.bottom - floor;
        if (overflowTop <= 0.75 && overflowBot <= 0.75) break;
        projectNameBox(camera, x, y - 1, z, scale, yaw, _fitProbe);
        const dBoxYdWorldY = (_fitProbe.y - box.y) / -1;
        if (!Number.isFinite(dBoxYdWorldY) || Math.abs(dBoxYdWorldY) < 1e-6) break;
        let desired = box.y;
        if (overflowTop > 0.75) desired = ceil;
        else if (overflowBot > 0.75) desired = noScale ? Math.max(ceil, box.y - overflowBot) : box.y - overflowBot;   // call 3: locked-scale fit keeps the top margin ahead of guitar clearance (no up/down oscillation)
        y += (desired - box.y) / dBoxYdWorldY;
      }
      projectNameBox(camera, x, y, z, scale, yaw, box);
      dest.set(x, y, z);
      zgW._fit = window.__zgNameFit = { scale, margin, box: { x: box.x, y: box.y, right: box.right, bottom: box.bottom }, pos: { x, y, z } };
      return scale;
    }

    // intro-polish: lock the rest-pose fit scale for the visible intro (in/hold/down) so the name never re-zooms mid-fade.
    // lockRatio = fitted rest scale / sc, measured once when 'in' starts (BOOT.ready: the guitar can be measured).
    let lockRatio = 0, lockW = 0, lockH = 0;
    const _lockDest = new THREE.Vector3();
    function computeFitLock(camera) {
      try {
        const cp = camera.position;
        const y0 = Math.atan2(cp.x - tgt.x, cp.z - tgt.z);
        const s = fitGroupToFrustum(camera, tgt, sc, y0, _lockDest);
        lockRatio = sc > 1e-6 ? s / sc : 0;
        lockW = window.innerWidth; lockH = window.innerHeight;
      } catch (_) { lockRatio = 0; }
    }
    // intro-polish: eased entry into the idle float / z-rotation / blob-shadow after 'done' (no pop on the first done frame)
    let doneK = 0;
    const smooth01 = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };

    function setDone(fromSkip) {
      if (phase === 'done') return;
      skipped = skipped || !!fromSkip;
      phase = 'done';
      phaseT = 0;
      doneK = 0;
      veil.visible = false;
      veilMat.opacity = 0;
      try { G.visible = true; } catch (_) {}
      finishMat();
      introScale = 1;
      if (!init) init = true;
      zgW._snapRest = true;
      pos.copy(tgt);
      emit('done');
      while (skipHandlers.length) {
        const h = skipHandlers.pop();
        try {
          document.removeEventListener(h.type, h.fn, h.opt);
        } catch (_) {
          /* ignore */
        }
      }
    }

    // skip() is called from pointer events; compute rest on the next tick if needed
    zgW.skip = function () {
      if (phase === 'done' || phase === 'pending') return;
      skipped = true;
      setDone(true);
    };

    function onSkip(e) {
      if (phase === 'done' || phase === 'pending') return;
      // Don't steal the event; just jump to the end state so the ring/guitar can handle the same gesture.
      zgW.skip();
    }

    function armSkip() {
      const opt = { capture: true };
      document.addEventListener('pointerdown', onSkip, opt);
      skipHandlers.push({ type: 'pointerdown', fn: onSkip, opt });
    }

    function enterPhase(next) {
      phase = next;
      phaseT = 0;
      phaseAt = performance.now();
    }

    // Wall-clock progress so a slow frame (test GPU) cannot stretch the intro.
    function phaseU(durationS) {
      if (document.hidden) {
        if (!hiddenAt) hiddenAt = performance.now();
        return Math.min(1, Math.max(0, (hiddenAt - phaseAt) / (durationS * 1000)));
      }
      if (hiddenAt) {
        phaseAt += performance.now() - hiddenAt;
        hiddenAt = 0;
      }
      return Math.min(1, Math.max(0, (performance.now() - phaseAt) / (durationS * 1000)));
    }

    zgW._busy = true;

    zgW.tick = function (dt, camera, mode) {
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      if (document.hidden && phase !== 'done') dt = 0;
      t += dt;
      const cp = camera.position;

      // follow target (frozen in walk once initialised)
      let wantSc = sc;
      if (mode !== 'walk' || !init || zgW._snapRest) {
        const r = restOf(camera);
        wantSc = r.want;
        if (zgW._snapRest) {
          sc = wantSc;
          pos.copy(tgt);
          zgW._snapRest = false;
        } else {
          sc += (wantSc - sc) * (init ? 1 - Math.exp(-dt * 2.5) : 1);
          if (!init && phase === 'done') {
            pos.copy(tgt);
          } else if (phase === 'done') {
            pos.lerp(tgt, 1 - Math.exp(-dt * 2.5));
          }
        }
      }

      if (phase === 'pending') {
        reducedIntro = prefersReduced();
        const r = restOf(camera);
        sc = r.want;
        placeIntroStart(camera);
        downFrom.copy(reducedIntro ? tgt : center);
        pos.copy(reducedIntro ? tgt : center);
        recordPath();
        const tYaw0 = Math.atan2(cp.x - pos.x, cp.z - pos.z);
        yaw = tYaw0;
        init = true;
        armSkip();
        fading = true;
        fade = 0;
        mat.transparent = true;
        syncFade(0);
        veil.visible = true;
        veilMat.opacity = 1;
        try { G.visible = false; } catch (_) {}
        introScale = reducedIntro ? 1 : 0.84;
        enterPhase('wait');
        // intro-polish: do not emit 'in' until BOOT.ready (or immediately if BOOT is not in this snippet's host)
      } else if (phase === 'wait') {
        restOf(camera);
        placeIntroStart(camera);
        downFrom.copy(reducedIntro ? tgt : center);
        pos.copy(reducedIntro ? tgt : center);
        recordPath();
        syncFade(0);
        veil.visible = true;
        veilMat.opacity = 1;
        introScale = reducedIntro ? 1 : 0.84;
        if (typeof BOOT === 'undefined' || bootReady()) {
          enterPhase('in');
          emit('in');
        }
      } else if (phase !== 'done') {
        restOf(camera);
        if (phase === 'in' || phase === 'hold') {
          placeIntroStart(camera);
          downFrom.copy(reducedIntro ? tgt : center);
          recordPath();
        }

        if (reducedIntro) {
          const u = (typeof BOOT === 'undefined' || bootReady()) ? phaseU(QUICK_S) : (phaseAt = performance.now(), 0);
          fade = Math.min(1, u);
          syncFade(fade);
          introScale = 1;
          pos.copy(tgt);
          veilMat.opacity = 1 - easeOut(u);
          if (u >= 0.15 && !downStarted) {
            downStarted = true;
            try { G.visible = true; } catch (_) {}
            emit('widgets');
          }
          if (u >= 1) {
            setDone(false);
          }
        } else if (phase === 'in') {
          const u = phaseU(IN_S);
          fade = Math.min(1, easeOut(u));
          syncFade(fade);
          introScale = 0.84 + 0.16 * easeOut(u);
          pos.copy(center);
          downFrom.copy(center);
          recordPath();
          veilMat.opacity = 1;
          if (u >= 1) {
            syncFade(1);
            introScale = 1;
            enterPhase('hold');
            emit('hold');
          }
        } else if (phase === 'hold') {
          pos.copy(center);
          downFrom.copy(center);
          recordPath();
          introScale = 1;
          syncFade(1);
          veilMat.opacity = 1;
          if (phaseU(HOLD_S) >= 1) {
            downFrom.copy(pos);
            recordPath();
            downStarted = true;
            try { G.visible = true; } catch (_) {}
            enterPhase('down');
            emit('down');
            emit('widgets');
          }
        } else if (phase === 'down') {
          const u = phaseU(DOWN_S);
          const e = easeInOut(u);
          pos.lerpVectors(downFrom, tgt, e);
          introScale = 1;
          syncFade(1);
          veilMat.opacity = 1 - e;
          if (u >= 1) {
            pos.copy(tgt);
            setDone(false);
          }
        }
      }

      // face the camera around Y only, damped
      const tYaw = Math.atan2(cp.x - pos.x, cp.z - pos.z);
      if (!init) {
        yaw = tYaw;
        init = true;
      } else if (phase === 'done') {
        let a = tYaw - yaw;
        a -= TWO_PI * Math.round(a / TWO_PI);
        yaw += a * (1 - Math.exp(-dt * (mode === 'walk' ? 6 : 3)));
      } else {
        yaw = tYaw;
      }

      // float (only once settled; keep the intro path clean)
      if (phase === 'done') doneK = Math.min(1, doneK + dt / 1.2);
      const dE = phase === 'done' ? smooth01(doneK) : 0;
      const f = Math.sin(t * 0.9) * dE;
      const zRot = Math.sin(t * 0.6) * 0.02 * dE;
      // intro-frame: fit the group to this camera frustum (margin + guitar clearance), then add the idle float.
      let placeSc = sc * introScale;
      _fitDest.copy(pos);
      if (mode !== 'walk') {
        const lockOn = phase !== 'done' && phase !== 'wait' && phase !== 'pending';
        if (lockOn && (!lockRatio || lockW !== window.innerWidth || lockH !== window.innerHeight)) computeFitLock(camera);
        if (lockOn && lockRatio) {
          placeSc = fitGroupToFrustum(camera, pos, sc * lockRatio * introScale, yaw, _fitDest, true);
        } else {
          placeSc = fitGroupToFrustum(camera, pos, placeSc, yaw, _fitDest);
        }
      }
      mesh.position.set(_fitDest.x, _fitDest.y + f * L * 0.012, _fitDest.z);
      mesh.rotation.set(0, yaw, zRot);
      mesh.scale.setScalar(placeSc);
      if (!zgW.path) zgW.path = window.__zgIntroPath = { start: null, end: null };
      const rec = { x: _fitDest.x, y: _fitDest.y, z: _fitDest.z };
      if (phase === 'in' || phase === 'hold' || phase === 'wait') zgW.path.start = rec;
      if (phase === 'down' || phase === 'done') zgW.path.end = rec;
      if (phase === 'in' || phase === 'hold') zgW.path.end = rec;
      window.__zgIntroPath = zgW.path;

      if (phase === 'done' && fading) {
        fade += dt;
        const o = Math.min(1, fade / 0.8);
        syncFade(o);
        if (o >= 1) finishMat();
      }

      const fo = mat.transparent ? mat.opacity : 1;
      const showShadow = phase === 'done' || phase === 'down';

      // blob shadow: higher word -> a bit bigger and lighter
      const h = f * 0.5 + 0.5; // 0..1
      const k = 1 + 0.06 * h;
      shadow.position.x = pos.x;
      shadow.position.z = pos.z;
      shadow.rotation.y = yaw;
      shadow.scale.set(width * 1.5 * k * sc, size * 1.6 * k * sc, 1);
      smat.opacity = showShadow ? (0.95 - 0.2 * h) * fo * (phase === 'down' ? phaseU(DOWN_S) : 1) : 0;

      if (veil.visible) {
        const distRest = Math.max(L * 0.4, cp.distanceTo(tgt));
        fitVeil(camera, distRest * 0.8);
      }

      if (!mesh.visible) {
        mesh.visible = true;
        shadow.visible = true;
      }
    };
  };

  try {
    new FontLoader().load(
      'assets/fonts/zuniga-mission-v3.typeface.json',
      (font) => {
        try {
          build(font);
        } catch (e) {
          warn(e);
        }
      },
      undefined,
      (err) => warn(err)
    );
  } catch (e) {
    warn(e);
  }
})();

function zgWordTick(dt, camera, mode) {
  if (zgW.tick) zgW.tick(dt, camera, mode);
}
// ---- end ZUNIGA snippet ----
