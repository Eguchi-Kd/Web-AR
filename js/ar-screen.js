// js/ar-screen.js
// Non-AR preview with touch-controlled OrbitControls, pinch zoom, UI toggle, screenshot support.

export async function startPreview(preloaded = null) {
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  // cleanup
  while (container.firstChild) container.removeChild(container.firstChild);

  // create renderer with preserveDrawingBuffer for reliable screenshots
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.domElement.style.touchAction = 'none';
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

  // OrbitControls (UMD)
  if (!THREE.OrbitControls && window.OrbitControls) THREE.OrbitControls = window.OrbitControls;
  if (!THREE.OrbitControls) console.warn('OrbitControls missing');
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.85, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = true;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = 0.6;
  controls.maxDistance = 6;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 1.0;
  controls.update();

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
  } catch (e) { console.warn('add model error', e); }

  // set background to light blue for preview
  const prevBg = container.style.background || '';
  container.style.background = '#bfefff';

  // animation loop
  let raf = null;
  function animate() {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);

  // screenshot function: hides hidable UI, ensures a frame is rendered, then capture
  async function captureScreenshot(filename = 'screenshot.png') {
    // hide hidable UI
    document.documentElement.classList.add('ui-hidden');
    // wait two animation frames so UI is hidden and next frame renders
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    // capture via toBlob for better memory
    const blob = await new Promise((resolve) => {
      try {
        renderer.domElement.toBlob((b) => resolve(b), 'image/png');
      } catch (e) {
        // as fallback, try toDataURL
        try {
          const dataUrl = renderer.domElement.toDataURL('image/png');
          // convert to blob
          const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
          for (let i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
          resolve(new Blob([u8arr], { type: mime }));
        } catch (e2) {
          resolve(null);
        }
      }
    });

    // restore UI
    document.documentElement.classList.remove('ui-hidden');

    if (!blob) throw new Error('Screenshot capture failed (no blob)');

    // attempt download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke after a bit
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { success: true, url };
  }

  // expose cleanup
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    try { renderer.domElement.remove(); } catch (e) {}
    try { renderer.dispose(); } catch (e) {}
    container.style.background = prevBg;
  }

  return { renderer, scene, camera, controls, addedModel, captureScreenshot, stop };
}
