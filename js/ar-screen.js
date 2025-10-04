// js/ar-screen.js
// Non-AR preview with robust custom gesture controls (pointer events)

export async function startPreview(preloaded = null) {
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  // Debug: log THREE presence and identity
  console.log('startPreview: window.THREE exists?', !!window.THREE);
  if (window.THREE) {
    try { console.log('THREE.REVISION =', THREE.REVISION); } catch (e) {}
    try { console.log('THREE obj identity:', THREE); } catch (e) {}
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
  // ensure canvas is on top of background but below UI overlays
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';
  renderer.domElement.style.zIndex = '1';
  renderer.domElement.style.pointerEvents = 'auto';
  container.appendChild(renderer.domElement);

  // camera
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.1, 3);

  // scene
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

  // initial target and spherical state
  const target = new THREE.Vector3(0, 0.85, 0);
  const offset = new THREE.Vector3().subVectors(camera.position, target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  const minPhi = 0.1;
  const maxPhi = Math.PI - 0.1;
  const minRadius = 0.6;
  const maxRadius = 6.0;

  // add model or placeholder
  let addedModel = null;
  try {
    if (preloaded && preloaded.vrm) {
      scene.add(preloaded.vrm.scene);
      addedModel = preloaded.vrm.scene;
    } else if (preloaded && preloaded.gltf && preloaded.gltf.scene) {
      scene.add(preloaded.gltf.scene);
      addedModel = preloaded.gltf.scene;
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

  // set background to light blue
  const prevBg = container.style.background || '';
  container.style.background = '#bfefff';

  // Animation loop
  let rafId = null;
  function renderLoop() {
    rafId = requestAnimationFrame(renderLoop);
    renderer.render(scene, camera);
  }
  renderLoop();

  // responsiveness
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // --------- Custom gesture handling (pointer events) ----------
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
        } catch (e2) {
          resolve(null);
        }
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

  updateCameraFromSpherical();

  return {
    renderer, scene, camera, controls: null, addedModel, captureScreenshot, stop
  };
}
