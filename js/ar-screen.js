// js/ar-screen.js
// Non-AR preview with custom gestures, plus AR-mode starter that can trigger Quick Look (iOS) or WebXR (Android).

export async function startPreview(preloaded = null) {
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  console.log('startPreview: window.THREE exists?', !!window.THREE);
  if (window.THREE) {
    try { console.log('THREE.REVISION =', THREE.REVISION); } catch (e) {}
  }

  // cleanup previous children
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

  // camera / scene
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.1, 3);
  const scene = new THREE.Scene();

  // lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(1, 1, 1).normalize();
  scene.add(dir);

  // grid & axes
  const grid = new THREE.GridHelper(10, 10);
  scene.add(grid);
  const axes = new THREE.AxesHelper(0.5);
  scene.add(axes);

  // initial spherical controls state
  const target = new THREE.Vector3(0, 0.85, 0);
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const minPhi = 0.1;
  const maxPhi = Math.PI - 0.1;
  const minRadius = 0.6;
  const maxRadius = 6.0;

  // add preloaded model (if any) to preview - scale to 50% (multiply by 0.5)
  let addedModel = null;
  try {
    if (preloaded && preloaded.vrm) {
      // if preloaded.vrm is VRM object or scene
      const vm = preloaded.vrm;
      const sceneObj = vm.scene ? vm.scene : vm;
      sceneObj.scale.multiplyScalar(0.5); // 50% smaller
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

  // background
  const prevBg = container.style.background || '';
  container.style.background = '#bfefff';

  // render loop
  let rafId = null;
  function renderLoop() {
    rafId = requestAnimationFrame(renderLoop);
    renderer.render(scene, camera);
  }
  renderLoop();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // pointer-based controls (single drag rotate, two-finger pinch zoom)
  const pointers = new Map();
  let interactionState = {
    mode: 'none',
    startTheta: spherical.theta,
    startPhi: spherical.phi,
    startRadius: spherical.radius,
    startX: 0,
    startY: 0,
    startDist: 0
  };

  const ROTATE_SPEED = 0.005;
  const WHEEL_ZOOM_SPEED = 0.0015;

  function updateCameraFromSpherical() {
    spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi));
    spherical.radius = Math.max(minRadius, Math.min(maxRadius, spherical.radius));
    const newPos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    camera.position.copy(newPos);
    camera.lookAt(target);
  }

  function getDistance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.hypot(dx, dy);
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { e.target.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (pointers.size === 1) {
      const p = pointers.values().next().value;
      interactionState.mode = 'rotate';
      interactionState.startX = p.x;
      interactionState.startY = p.y;
      interactionState.startTheta = spherical.theta;
      interactionState.startPhi = spherical.phi;
    } else if (pointers.size === 2) {
      const it = pointers.values();
      const pA = it.next().value;
      const pB = it.next().value;
      interactionState.mode = 'pinch';
      interactionState.startDist = getDistance(pA, pB);
      interactionState.startRadius = spherical.radius;
    } else {
      interactionState.mode = 'none';
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (interactionState.mode === 'rotate' && pointers.size === 1) {
      const p = pointers.values().next().value;
      const dx = p.x - interactionState.startX;
      const dy = p.y - interactionState.startY;
      spherical.theta = interactionState.startTheta - dx * ROTATE_SPEED;
      spherical.phi = interactionState.startPhi - dy * ROTATE_SPEED;
      spherical.phi = Math.max(minPhi, Math.min(maxPhi, spherical.phi));
      updateCameraFromSpherical();
    } else if (interactionState.mode === 'pinch' && pointers.size === 2) {
      const it = pointers.values();
      const pA = it.next().value;
      const pB = it.next().value;
      const curDist = getDistance(pA, pB);
      if (interactionState.startDist > 0) {
        const ratio = interactionState.startDist / curDist;
        let newRadius = interactionState.startRadius * ratio;
        spherical.radius = Math.max(minRadius, Math.min(maxRadius, newRadius));
        updateCameraFromSpherical();
      }
    }
  }

  function onPointerUp(e) {
    try { e.target.releasePointerCapture(e.pointerId); } catch (err) {}
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      interactionState.mode = 'none';
    } else if (pointers.size === 1) {
      const p = pointers.values().next().value;
      interactionState.mode = 'rotate';
      interactionState.startX = p.x;
      interactionState.startY = p.y;
      interactionState.startTheta = spherical.theta;
      interactionState.startPhi = spherical.phi;
    }
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    interactionState.mode = 'none';
  }

  function onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY;
    spherical.radius += delta * WHEEL_ZOOM_SPEED;
    spherical.radius = Math.max(minRadius, Math.min(maxRadius, spherical.radius));
    updateCameraFromSpherical();
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown, { passive: false });
  renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: false });
  renderer.domElement.addEventListener('pointerup', onPointerUp, { passive: false });
  renderer.domElement.addEventListener('pointercancel', onPointerCancel, { passive: false });
  renderer.domElement.addEventListener('lostpointercapture', (e) => { pointers.delete(e.pointerId); }, { passive: true });
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  container.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
  container.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });

  // capture screenshot
  async function captureScreenshot(filename = 'screenshot.png') {
    document.documentElement.classList.add('ui-hidden');
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const blob = await new Promise((resolve) => {
      try {
        renderer.domElement.toBlob((b) => resolve(b), 'image/png');
      } catch (e) {
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { success: true, url };
  }

  // --- AR session starter (attached to returned handle)
  // options: { vrmUrl, glbUrl, usdzUrl }
  async function startARSession(options = {}) {
    const { vrmUrl, glbUrl, usdzUrl } = options;
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);

    // helper to log visible messages to top area (if exists)
    const topLog = document.getElementById('ar-log') || document.getElementById('load-log');
    function push(msg) { if (topLog) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; topLog.prepend(d); } else console.log(msg); }

    // iOS Quick Look path (use model-viewer dynamic import)
    if (isIOS && usdzUrl) {
      push('iOS detected + USDZ available => launching Quick Look via model-viewer');
      try {
        // dynamic import model-viewer; it registers <model-viewer> element
        await import('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
        const mv = document.createElement('model-viewer');
        mv.setAttribute('style', 'position:fixed; inset:0; width:100%; height:100%; display:none; z-index:99999;');
        mv.setAttribute('ios-src', usdzUrl);
        mv.setAttribute('ar', '');
        mv.setAttribute('ar-modes', 'quick-look');
        document.body.appendChild(mv);
        try {
          await mv.activateAR();
          push('model-viewer.activateAR() called (Quick Look).');
        } catch (e) {
          push('model-viewer.activateAR() error: ' + e);
        }
        // cleanup after short delay (Quick Look will have been invoked)
        setTimeout(() => { try { mv.remove(); } catch (e) {} }, 2000);
        return { success: true, mode: 'quick-look' };
      } catch (e) {
        push('model-viewer dynamic import failed: ' + e);
        return { success: false, error: e };
      }
    }

    // WebXR path (Android / supported)
    if (navigator.xr && navigator.xr.isSessionSupported && isAndroid) {
      const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      if (!supported) {
        push('WebXR immersive-ar not supported on this device.');
        return { success: false, error: 'WebXR not supported' };
      }
      // prepare reticle and controller
      push('Starting WebXR AR session...');
      const controller = renderer.xr.getController(0);
      const loader = new THREE.GLTFLoader();
      let hitTestSource = null;
      let localRefSpace = null;

      // reticle
      const reticle = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      // onSelect handler: place model at reticle
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
          // decompose reticle's transform into object
          reticle.matrix.decompose(obj.position, obj.quaternion, obj.scale);
          // rotate to face camera
          obj.rotation.y = camera.rotation.y + Math.PI;
          if (maybeVrm && maybeVrm.lookAt) maybeVrm.lookAt.target = camera;
          // scale down 50%
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

      // request session
      try {
        const overlayRoot = document.getElementById('ar-screen') || document.getElementById('overlay') || document.body;
        const options = {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: overlayRoot }
        };
        const xrSession = await navigator.xr.requestSession('immersive-ar', options);
        await renderer.xr.setSession(xrSession);
        renderer.xr.setReferenceSpaceType('local');
        push('WebXR session set on renderer');

        // create reference space and hitTestSource
        const viewerSpace = await xrSession.requestReferenceSpace('viewer');
        hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });
        xrSession.addEventListener('end', () => {
          push('XR session ended');
          hitTestSource = null;
          try { controller.removeEventListener('select', onSelect); } catch(e){}
          reticle.remove();
        });

        // run render loop
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
        return { success: true, mode: 'webxr' };
      } catch (e) {
        push('Failed to start WebXR session: ' + e);
        return { success: false, error: e };
      }
    }

    // fallback: if GLB exists and model-viewer available, call activateAR; otherwise fail
    if (glbUrl) {
      try {
        await import('https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js');
        const mv = document.createElement('model-viewer');
        mv.style.position = 'fixed';
        mv.style.inset = '0';
        mv.style.display = 'none';
        mv.setAttribute('src', glbUrl);
        if (usdzUrl) mv.setAttribute('ios-src', usdzUrl);
        mv.setAttribute('ar', '');
        mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        document.body.appendChild(mv);
        try {
          await mv.activateAR();
        } catch (e) { console.warn('fallback activateAR error', e); }
        setTimeout(()=>{ try{ mv.remove(); } catch(e){} }, 1500);
        return { success: true, mode: 'model-viewer-fallback' };
      } catch (e) {
        return { success: false, error: e };
      }
    }

    push('No AR method available on this device');
    return { success: false, error: 'no-ar' };
  }

  function stop() {
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

    if (rafId) cancelAnimationFrame(rafId);
    try { renderer.domElement.remove(); } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    container.style.background = prevBg;
  }

  // initial camera alignment
  updateCameraFromSpherical();

  return {
    renderer, scene, camera, controls: null, addedModel, captureScreenshot, startARSession, stop
  };
}
