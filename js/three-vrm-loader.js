// three-vrm-loader.js
// Exports: initThree, preloadVRM, createPlaceholder, getRendererDOM
export async function initThree(containerId) {
  // Create renderer, scene, camera, lights and return handles
  const container = document.getElementById(containerId) || document.getElementById('three-wrap');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.6, 2.5);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.25);
  dir.position.set(0.5, 1, 0.3);
  scene.add(dir);

  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', ()=> {
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}

const loader = new THREE.GLTFLoader();

export async function preloadVRM(url) {
  // loads VRM and returns { vrm, scene }
  try {
    const gltf = await loader.loadAsync(url);
    if (THREE.VRMUtils) {
      try { THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene); } catch(e){}
    }
    const vrm = await THREE.VRM.from(gltf).catch((e)=>{ throw e; });
    return { vrm, scene: vrm.scene };
  } catch(e) {
    throw e;
  }
}

export function createPlaceholder() {
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32);
  const mat = new THREE.MeshStandardMaterial({ color:0x9b8cff, metalness:0.2, roughness:0.6 });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.set(0, 0.6, 0);
  return cyl;
}
