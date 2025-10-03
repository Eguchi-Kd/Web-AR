// js/three-vrm-loader.js
// Robust three.js + VRM loader utilities (module)
// Exports:
//  - initThree(containerId)
//  - preloadVRM(url)  -> returns Promise<{ vrm, scene }>
//  - createPlaceholder()

export async function initThree(containerId) {
  const container = document.getElementById(containerId) || document.getElementById('three-wrap');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
  camera.position.set(0, 1.6, 2.5);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 0.25);
  dir.position.set(0.5, 1, 0.3);
  scene.add(dir);

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}

const loader = new THREE.GLTFLoader();

/**
 * preloadVRM(url)
 * - Fetches the URL as arrayBuffer
 * - Performs basic validation (size, magic 'glTF')
 * - Parses via loader.parse and constructs VRM via THREE.VRM.from
 *
 * Returns: Promise<{ vrm, scene }>
 * Throws Error with helpful message on failure.
 */
export async function preloadVRM(url) {
  // fetch with errors surfaced
  let resp;
  try {
    resp = await fetch(url, { method: 'GET' });
  } catch (e) {
    throw new Error(`Failed to fetch VRM from '${url}': ${e}`);
  }
  if (!resp.ok) {
    throw new Error(`Failed to fetch VRM from '${url}': HTTP ${resp.status} ${resp.statusText}`);
  }

  let arrayBuffer;
  try {
    arrayBuffer = await resp.arrayBuffer();
  } catch (e) {
    throw new Error(`Failed to read VRM response as arrayBuffer: ${e}`);
  }

  if (!arrayBuffer || arrayBuffer.byteLength < 20) {
    throw new Error(`VRM file too small or empty (size=${arrayBuffer ? arrayBuffer.byteLength : 0})`);
  }

  // quick magic check for GLB: first four bytes should be 'glTF' (0x67,0x6C,0x54,0x46)
  try {
    const magicBytes = new Uint8Array(arrayBuffer, 0, 4);
    const magic = String.fromCharCode.apply(null, Array.from(magicBytes));
    // Accept 'glTF' (binary glTF) — VRM files are typically GLB
    if (magic !== 'glTF') {
      // Not necessarily fatal: some servers may host .vrm as glTF JSON, but typical VRM is binary.
      // We'll still attempt to parse, but warn first.
      console.warn(`preloadVRM: magic header is '${magic}', expected 'glTF'. Trying to parse anyway.`);
    }
  } catch (e) {
    // in unlikely case of error reading magic, still attempt to parse but warn
    console.warn('preloadVRM: could not read magic header, continuing to parse:', e);
  }

  // Parse using GLTFLoader.parse (safer since we already have ArrayBuffer)
  return new Promise((resolve, reject) => {
    try {
      loader.parse(
        arrayBuffer,
        '', // path — empty since embedded resources should be inlined in GLB
        async (gltf) => {
          try {
            if (THREE.VRMUtils) {
              try { THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene); } catch (e) { /* ignore */ }
            }
            // Convert to VRM
            const vrm = await THREE.VRM.from(gltf).catch((e) => { throw e; });
            resolve({ vrm, scene: vrm.scene });
          } catch (e) {
            reject(new Error(`Failed to construct VRM from GLTF: ${e}`));
          }
        },
        (err) => {
          reject(new Error(`GLTF parse error: ${err}`));
        }
      );
    } catch (e) {
      reject(new Error(`GLTFLoader.parse threw: ${e}`));
    }
  });
}

export function createPlaceholder() {
  const geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32);
  const mat = new THREE.MeshStandardMaterial({ color: 0x9b8cff, metalness: 0.2, roughness: 0.6 });
  const cyl = new THREE.Mesh(geo, mat);
  cyl.position.set(0, 0.6, 0);
  return cyl;
}
