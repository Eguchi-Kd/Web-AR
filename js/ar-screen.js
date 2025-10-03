// js/ar-screen.js
// Non-AR preview screen: creates its own renderer, camera, OrbitControls, grid, axes.
// Usage: import { startPreview } from './ar-screen.js'; await startPreview(preloaded);

export async function startPreview(preloaded = null) {
  // Clear #three-wrap of previous canvases / children to avoid duplicates
  const container = document.getElementById('three-wrap');
  if (!container) throw new Error('No #three-wrap container found');

  // remove existing children (title screen may have appended a canvas)
  while (container.firstChild) container.removeChild(container.firstChild);

  // create renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // camera
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.1, 3);

  // scene
  const scene = new THREE.Scene();

  // lights (soft)
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const directional = new THREE.DirectionalLight(0xffffff, 0.4);
  directional.position.set(1, 1, 1).normalize();
  scene.add(directional);

  // grid & axes
  const gridHelper = new THREE.GridHelper(10, 10);
  scene.add(gridHelper);
  gridHelper.visible = true;
  const axesHelper = new THREE.AxesHelper(0.5);
  scene.add(axesHelper);

  // OrbitControls (UMD must be loaded in index.html so THREE.OrbitControls exists)
  if (!THREE.OrbitControls) {
    // sometimes the control is at THREE.OrbitControls / window.OrbitControls
    if (window.OrbitControls) {
      THREE.OrbitControls = window.OrbitControls;
    } else {
      console.warn('OrbitControls not found. Controls will be unavailable.');
    }
  }
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.85, 0);
  controls.screenSpacePanning = true;
  controls.update();

  // Add preloaded model if available
  if (preloaded && preloaded.vrm) {
    try {
      const vrm = preloaded.vrm;
      // in case the vrm is already in another scene, clone? We'll add directly (user preloaded instance).
      scene.add(vrm.scene);
    } catch (e) {
      console.warn('Failed to add preloaded VRM to preview:', e);
    }
  } else if (preloaded && preloaded.gltf && preloaded.gltf.scene) {
    scene.add(preloaded.gltf.scene);
  } else {
    // fallback placeholder
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9b8cff, metalness: 0.2, roughness: 0.6 });
    const cyl = new THREE.Mesh(geo, mat);
    cyl.position.set(0, 0.6, 0);
    scene.add(cyl);
  }

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

  // return handles and a stop function
  return {
    renderer, scene, camera, controls,
    stop() {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      // remove canvas
      try { renderer.domElement.remove(); } catch (e) {}
      // dispose renderer
      try { renderer.dispose(); } catch (e) {}
    }
  };
}