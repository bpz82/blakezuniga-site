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
  const warn = (e) => {
    if (zgW.warned) return;
    zgW.warned = true;
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
    const IN_S = 0.55;
    const HOLD_S = 0.8;
    const DOWN_S = 1.5;
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

    function finishMat() {
      fading = false;
      fade = 1;
      mat.transparent = false;
      mat.opacity = 1;
      mat.needsUpdate = true;
    }

    function setDone(fromSkip) {
      if (phase === 'done') return;
      skipped = skipped || !!fromSkip;
      phase = 'done';
      phaseT = 0;
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
        const distRest = Math.max(L * 0.4, cp.distanceTo(tgt));
        placeCenter(camera, distRest * 0.78);
        downFrom.copy(center);
        pos.copy(reducedIntro ? tgt : center);
        const tYaw0 = Math.atan2(cp.x - pos.x, cp.z - pos.z);
        yaw = tYaw0;
        init = true;
        armSkip();
        fading = true;
        fade = 0;
        mat.transparent = true;
        mat.opacity = 0;
        veil.visible = true;
        veilMat.opacity = 1;
        try { G.visible = false; } catch (_) {}
        introScale = reducedIntro ? 1 : 0.84;
        enterPhase('in');
        emit('in');
      } else if (phase !== 'done') {
        const distRest = Math.max(L * 0.4, cp.distanceTo(tgt));
        placeCenter(camera, distRest * 0.78);

        if (reducedIntro) {
          const u = phaseU(QUICK_S);
          fade = Math.min(1, u);
          mat.opacity = fade;
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
          mat.opacity = fade;
          introScale = 0.84 + 0.16 * easeOut(u);
          pos.copy(center);
          downFrom.copy(center);
          veilMat.opacity = 1;
          if (u >= 1) {
            mat.opacity = 1;
            introScale = 1;
            enterPhase('hold');
            emit('hold');
          }
        } else if (phase === 'hold') {
          pos.copy(center);
          downFrom.copy(center);
          introScale = 1;
          mat.opacity = 1;
          veilMat.opacity = 1;
          if (phaseU(HOLD_S) >= 1) {
            downFrom.copy(pos);
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
          mat.opacity = 1;
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
      const f = phase === 'done' ? Math.sin(t * 0.9) : 0;
      const zRot = phase === 'done' ? Math.sin(t * 0.6) * 0.02 : 0;
      mesh.position.set(pos.x, pos.y + f * L * 0.012, pos.z);
      mesh.rotation.set(0, yaw, zRot);
      mesh.scale.setScalar(sc * introScale);

      if (phase === 'done' && fading) {
        fade += dt;
        const o = Math.min(1, fade / 0.8);
        mat.opacity = o;
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
