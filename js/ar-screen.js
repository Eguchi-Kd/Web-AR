// js/ar-screen.js
// 修正版: AR セッションと renderer のライフサイクル衝突を避ける処理を追加

export async function startPreview(preloaded = null) {
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  console.log('startPreview: window.THREE exists?', !!window.THREE);
  if (window.THREE) {
    try { console.log('THREE.REVISION =', THREE.REVISION); } catch (e) {}
  }

  // cleanup previous children (but do NOT forcibly dispose renderer if XR session may be active)
  while (container.firstChild) container.removeChild(container.firstChild);

  // create renderer with preserveDrawingBuffer for screenshots
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.userSelect = 'none';
  renderer.domElement.style.position = 'fixed';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.zIndex = '5';
  renderer.domElement.style.pointerEvents = 'auto';
  container.appendChild(renderer.domElement);

  // scene / camera
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.1, 3);
  const scene = new THREE.Scene();

  // lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(1, 1, 1).normalize();
  scene.add(dir);

  // placeholders
  const grid = new THREE.GridHelper(10, 10); scene.add(grid);
  const axes = new THREE.AxesHelper(0.5); scene.add(axes);

  const target = new THREE.Vector3(0, 0.85, 0);
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const minPhi = 0.1, maxPhi = Math.PI - 0.1, minRadius = 0.6, maxRadius = 6.0;

  // add preloaded model (scaled 50%)
  let addedModel = null;
  try {
    if (preloaded && preloaded.vrm) {
      const vm = preloaded.vrm;
      const sceneObj = vm.scene ? vm.scene : vm;
      sceneObj.scale.multiplyScalar(0.5);
      scene.add(sceneObj);
      addedModel = sceneObj;
    } else if (preloaded && preloaded.gltf && preloaded.gltf.scene) {
      const sc = preloaded.gltf.scene;
      sc.scale.multiplyScalar(0.5);
      scene.add(sc);
      addedModel = sc;
    } else {
      const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9b8cff, metalness: 0.2, roughness: 0.6 });
      const cyl = new THREE.Mesh(geo, mat);
      cyl.position.set(0, 0.6, 0);
      scene.add(cyl);
      addedModel = cyl;
    }
  } catch (e) {
    console.warn('add model error', e);
  }

  const prevBg = container.style.background || '';
  container.style.background = '#bfefff';

  // render loop via renderer.setAnimationLoop -> safer with XR
  let isAnimating = true;
  function renderLoop(time, frame) {
    // Three.js recommends setAnimationLoop for XR compatibility
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(renderLoop);

  function stopAnimationLoop() {
    // Use setAnimationLoop(null) to stop safely (do NOT call cancelAnimationFrame directly)
    try {
      renderer.setAnimationLoop(null);
    } catch (e) {
      console.warn('renderer.setAnimationLoop(null) failed:', e);
    }
    isAnimating = false;
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // ---------- pointer controls (unchanged) ----------
  const pointers = new Map();
  let interactionState = {
    mode: 'none', startTheta: spherical.theta, startPhi: spherical.phi, startRadius: spherical.radius,
    startX: 0, startY: 0, startDist: 0
  };
  const ROTATE_SPEED = 0.005, WHEEL_ZOOM_SPEED = 0.0015;

  function updateCameraFromSpherical() {
    spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi));
    spherical.radius = Math.max(minRadius, Math.min(maxRadius, spherical.radius));
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    camera.position.copy(newPos);
    camera.lookAt(target);
  }
  function getDistance(p1, p2) { const dx = p2.x - p1.x, dy = p2.y - p1.y; return Math.hypot(dx, dy); }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      interactionState.mode = 'rotate';
      interactionState.startX = p.x; interactionState.startY = p.y;
      interactionState.startTheta = spherical.theta; interactionState.startPhi = spherical.phi;
    } else if (pointers.size === 2) {
      const it = pointers.values(); const pA = it.next().value; const pB = it.next().value;
      interactionState.mode = 'pinch'; interactionState.startDist = getDistance(pA, pB);
      interactionState.startRadius = spherical.radius;
    } else interactionState.mode = 'none';
  }
  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (interactionState.mode === 'rotate' && pointers.size === 1) {
      const p = pointers.values().next().value; const dx = p.x - interactionState.startX, dy = p.y - interactionState.startY;
      spherical.theta = interactionState.startTheta - dx * ROTATE_SPEED;
      spherical.phi = interactionState.startPhi - dy * ROTATE_SPEED;
      updateCameraFromSpherical();
    } else if (interactionState.mode === 'pinch' && pointers.size === 2) {
      const it = pointers.values(); const pA = it.next().value; const pB = it.next().value;
      const curDist = getDistance(pA, pB);
      if (interactionState.startDist > 0) {
        const ratio = interactionState.startDist / curDist;
        spherical.radius = Math.max(minRadius, Math.min(maxRadius, interactionState.startRadius * ratio));
        updateCameraFromSpherical();
      }
    }
  }
  function onPointerUp(e) {
    try { e.target.releasePointerCapture(e.pointerId); } catch (err) {}
    pointers.delete(e.pointerId);
    if (pointers.size === 0) interactionState.mode = 'none';
    else if (pointers.size === 1) {
      const p = pointers.values().next().value;
      interactionState.mode = 'rotate';
      interactionState.startX = p.x; interactionState.startY = p.y;
      interactionState.startTheta = spherical.theta; interactionState.startPhi = spherical.phi;
    }
  }
  function onPointerCancel(e){ pointers.delete(e.pointerId); interactionState.mode = 'none'; }
  function onWheel(e){ e.preventDefault(); spherical.radius += e.deltaY * WHEEL_ZOOM_SPEED; spherical.radius = Math.max(minRadius, Math.min(maxRadius, spherical.radius)); updateCameraFromSpherical(); }

  renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: false });
  renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: false });
  renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: false });
  renderer.domElement.addEventListener('pointercancel', onPointerCancel, { passive: false });
  renderer.domElement.addEventListener('lostpointercapture', (e) => { pointers.delete(e.pointerId); }, { passive: true });
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
  container.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

  // safe screenshot
  async function captureScreenshot(filename = 'screenshot.png') {
    document.documentElement.classList.add('ui-hidden');
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const blob = await new Promise((resolve) => {
      try { renderer.domElement.toBlob((b) => resolve(b), 'image/png'); }
      catch (e) {
        try {
          const dataUrl = renderer.domElement.toDataURL('image/png');
          const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
          for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
          resolve(new Blob([u8arr], { type: mime }));
        } catch (e2) { resolve(null); }
      }
    });
    document.documentElement.classList.remove('ui-hidden');
    if (!blob) throw new Error('Screenshot capture failed');
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { success: true, url };
  }

  // -------- AR start logic (robust) ----------
  // options: { vrmUrl, glbUrl, usdzUrl }
  async function startARSession(options = {}) {
    const { vrmUrl, glbUrl, usdzUrl } = options;
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    const topLog = document.getElementById('ar-log') || document.getElementById('load-log');
    function push(msg) { if (topLog) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; topLog.prepend(d); } else console.log(msg); }

    // iOS Quick Look path
    if (isIOS && usdzUrl) {
      push('iOS + USDZ => model-viewer Quick Look (dynamic import)');
      try {
        await import('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
        const mv = document.createElement('model-viewer');
        mv.style.position = 'fixed'; mv.style.inset = '0'; mv.style.display = 'none'; mv.style.zIndex = '99999';
        mv.setAttribute('ios-src', usdzUrl); mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'quick-look');
        document.body.appendChild(mv);
        try {
          await mv.activateAR();
          push('model-viewer.activateAR() called (Quick Look).');
        } catch (e) { push('model-viewer.activateAR() error: ' + e); }
        setTimeout(()=>{ try{ mv.remove(); }catch(e){} }, 2000);
        return { success: true, mode: 'quick-look' };
      } catch (e) {
        push('model-viewer import failed: ' + e);
        return { success: false, error: e };
      }
    }

    // WebXR path (Android)
    if (navigator.xr && navigator.xr.isSessionSupported && isAndroid) {
      const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false);
      if (!supported) {
        push('WebXR immersive-ar not supported.');
        return { success: false, error: 'WebXR not supported' };
      }

      push('Starting WebXR session...');
      // prepare reticle and controller
      const loader = new THREE.GLTFLoader();
      let hitTestSource = null;
      let localRefSpace = null;

      const reticle = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
      reticle.matrixAutoUpdate = false; reticle.visible = false; scene.add(reticle);

      // onSelect handler to place model
      const controller = renderer.xr.getController(0);
      async function onSelect() {
        if (!reticle.visible) { push('select: reticle not visible'); return; }
        push('placing model...');
        try {
          const modelUrlToLoad = vrmUrl ? vrmUrl : (glbUrl ? glbUrl : null);
          if (!modelUrlToLoad) { push('No model URL available'); return; }
          const gltf = await loader.loadAsync(modelUrlToLoad);
          if (THREE.VRMUtils) THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
          let maybeVrm = null;
          try { maybeVrm = await THREE.VRM.from(gltf).catch(()=>null); } catch(e){}
          const obj = maybeVrm ? maybeVrm.scene : gltf.scene;
          reticle.matrix.decompose(obj.position, obj.quaternion, obj.scale);
          obj.rotation.y = camera.rotation.y + Math.PI;
          if (maybeVrm && maybeVrm.lookAt) maybeVrm.lookAt.target = camera;
          // apply 50% scale reduction
          obj.scale.multiplyScalar(0.5);
          scene.add(obj);
          reticle.visible = false;
          push('model placed in AR scene');
        } catch (e) {
          push('Model load/place failed: ' + e);
        }
      }

      controller.addEventListener('select', onSelect);
      scene.add(controller);

      try {
        // request session safely
        const overlayRoot = document.getElementById('ar-screen') || document.getElementById('overlay') || document.body;
        const options = { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: overlayRoot } };
        const xrSession = await navigator.xr.requestSession('immersive-ar', options);

        // set session on renderer (wrap in try/catch)
        try {
          await renderer.xr.setSession(xrSession);
          renderer.xr.setReferenceSpaceType('local');
        } catch (e) {
          push('renderer.xr.setSession failed: ' + e);
          // cleanup before returning
          try { controller.removeEventListener('select', onSelect); } catch(e) {}
          reticle.remove();
          return { success: false, error: e };
        }

        push('WebXR session active on renderer');

        // create hit test source
        try {
          const viewerSpace = await xrSession.requestReferenceSpace('viewer');
          hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
        } catch (e) {
          push('hit-test source creation failed: ' + e);
        }

        // listen for session end to cleanup (do minimal cleanup now; do NOT dispose renderer here)
        xrSession.addEventListener('end', () => {
          push('XR session ended (event). performing cleanup.');
          try { controller.removeEventListener('select', onSelect); } catch(e) {}
          try { if (hitTestSource) { hitTestSource = null; } } catch(e){}
          // reticle removal is safe here
          try { reticle.remove(); } catch(e){}
          // stop only Three animation loop; do not forcibly dispose renderer here
          try { renderer.setAnimationLoop(null); } catch(e){ console.warn('renderer.setAnimationLoop(null) failed on end event', e); }
        });

        // set Three's XR animation loop which receives frame
        renderer.setAnimationLoop((time, frame) => {
          if (!frame) return;
          const refSpace = renderer.xr.getReferenceSpace();
          if (hitTestSource && refSpace) {
            const hitResults = frame.getHitTestResults(hitTestSource);
            if (hitResults.length) {
              const hit = hitResults[0];
              const pose = hit.getPose(refSpace);
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
            } else {
              reticle.visible = false;
            }
          }
          renderer.render(scene, camera);
        });

        push('WebXR AR started');
        return { success: true, mode: 'webxr', session: xrSession };
      } catch (e) {
        push('Failed to start WebXR session (requestSession failed): ' + e);
        try { controller.removeEventListener('select', onSelect); } catch(e){}
        try { reticle.remove(); } catch(e){}
        // ensure animation loop stopped
        try { renderer.setAnimationLoop(null); } catch(e){}
        return { success: false, error: e };
      }
    } // end WebXR

    // fallback: model-viewer if GLB present
    if (glbUrl) {
      try {
        await import('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
        const mv = document.createElement('model-viewer');
        mv.style.position = 'fixed'; mv.style.inset = '0'; mv.style.display = 'none';
        mv.setAttribute('src', glbUrl);
        if (usdzUrl) mv.setAttribute('ios-src', usdzUrl);
        mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        document.body.appendChild(mv);
        try { await mv.activateAR(); } catch(e){ console.warn('fallback activateAR error', e); }
        setTimeout(()=>{ try{ mv.remove(); } catch(e){} }, 1500);
        return { success: true, mode: 'model-viewer-fallback' };
      } catch (e) {
        return { success: false, error: e };
      }
    }

    push('No AR method available');
    return { success: false, error: 'no-ar' };
  } // end startARSession

  // safe stop function
  function stop() {
    // remove event listeners
    try {
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel);
      renderer.domElement.removeEventListener('lostpointercapture', () => {});
      renderer.domElement.removeEventListener('wheel', onWheel);
      container.removeEventListener('touchstart', () => {});
      container.removeEventListener('touchmove', () => {});
      window.removeEventListener('resize', onResize);
    } catch (e) { /* ignore */ }

    // stop animation loop via Three API (safer than cancelAnimationFrame)
    try { renderer.setAnimationLoop(null); } catch (e) { console.warn('renderer.setAnimationLoop(null) error', e); }

    // remove canvas from DOM and dispose renderer (safe only when XR session not active)
    try {
      const session = renderer.xr.getSession && renderer.xr.getSession();
      if (session) {
        // do not dispose while session active; renderer.xr will be cleared on session end handler
        console.warn('stop(): XR session still active, skipping dispose; will clean up on session end');
      } else {
        try { renderer.domElement.remove(); } catch(e){}
        try { renderer.dispose(); } catch(e){}
      }
    } catch (e) {
      console.warn('Error during stop cleanup:', e);
      try { renderer.domElement.remove(); } catch(e){}
      try { renderer.dispose(); } catch(e){}
    }
    container.style.background = prevBg;
  }

  // initial camera alignment
  updateCameraFromSpherical();

  return { renderer, scene, camera, controls: null, addedModel, captureScreenshot, startARSession, stop };
}
