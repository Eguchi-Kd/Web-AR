// js/ar-screen.js
// Non-AR preview screen with touch rotate/pinch zoom, UI toggle, screenshot support.

export async function startPreview(preloaded = null) {
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  // clear previous children
  while (container.firstChild) container.removeChild(container.firstChild);

  // renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  // ensure touch events are delivered properly
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  // camera
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.1, 3);

  // scene
  const scene = new THREE.Scene();

  // lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.4);
  directional.position.set(1, 1, 1).normalize();
  scene.add(directional);

  // grid + axes
  const gridHelper = new THREE.GridHelper(10, 10);
  scene.add(gridHelper);
  const axesHelper = new THREE.AxesHelper(0.5);
  scene.add(axesHelper);

  // OrbitControls – UMD OrbitControls should have set THREE.OrbitControls
  if (!THREE.OrbitControls && window.OrbitControls) {
    THREE.OrbitControls = window.OrbitControls;
  }
  if (!THREE.OrbitControls) {
    console.warn('OrbitControls not found; preview will not have orbit controls.');
  }
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.85, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.enablePan = false;
  controls.enableZoom = true; // allow pinch zoom
  controls.minDistance = 0.6;
  controls.maxDistance = 6;
  controls.update();

  // add preloaded model or placeholder
  let addedModel = null;
  try {
    if (preloaded && preloaded.vrm) {
      // note: adding VRM instance's scene directly; if it was attached elsewhere this may be problematic
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
    console.warn('Failed to add preloaded model to preview:', e);
  }

  // Set the three-wrap background to light blue for preview
  const prevBg = document.getElementById('three-wrap').style.background || '';
  document.getElementById('three-wrap').style.background = '#bfefff';

  // animation loop
  let rafId = null;
  function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // handle resize
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // UI toggle and screenshot handlers (exposed functions)
  async function captureScreenshot(options = { downloadName: 'screenshot.png' }) {
    // hide UI
    document.documentElement.classList.add('ui-hidden');
    await new Promise(resolve => setTimeout(resolve, 80)); // allow paint

    let dataUrl;
    try {
      dataUrl = renderer.domElement.toDataURL('image/png');
    } catch (e) {
      console.warn('toDataURL failed:', e);
      document.documentElement.classList.remove('ui-hidden');
      throw e;
    }

    // restore UI
    document.documentElement.classList.remove('ui-hidden');

    // attempt to download via anchor (works on many platforms)
    try {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = options.downloadName || 'screenshot.png';
      // iOS Safari ignores download — fallback will open
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Some browsers won't download but opening is still helpful
      return { success: true, dataUrl };
    } catch (e) {
      // fallback: open in new tab (user can long-press save on iOS)
      try {
        window.open(dataUrl, '_blank');
        return { success: true, dataUrl, openedNewTab: true };
      } catch (e2) {
        console.warn('Failed to open screenshot in new tab:', e2);
        return { success: false, error: e2 };
      }
    }
  }

  // expose stop to cleanup
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    try { renderer.domElement.remove(); } catch(e){}
    try { renderer.dispose(); } catch(e){}
    // restore background
    document.getElementById('three-wrap').style.background = prevBg;
  }

  return {
    renderer, scene, camera, controls, addedModel,
    captureScreenshot,
    stop
  };
}
