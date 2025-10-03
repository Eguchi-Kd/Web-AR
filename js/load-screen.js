// js/load-screen.js
import { preloadVRM } from './three-vrm-loader.js';

/**
 * prepareARFlow(options)
 * - Preloads assets and determines best AR mode for current device.
 * - Returns an object: { success: boolean, mode: string|null, logs: [], errors: [] }
 *   mode is one of: 'ios-quicklook', 'android-webxr', 'scene-viewer', 'model-viewer-fallback'
 */
export async function prepareARFlow({ vrmPath = './assets/Aorin.vrm', glbPath = './assets/Aorin.glb', usdzPath = './assets/Aorin.usdz', logCallback = null } = {}) {
  const logs = [];
  const errors = [];
  function log(m) { logs.push(String(m)); if (logCallback) logCallback(String(m)); }
  function err(m) { errors.push(String(m)); if (logCallback) logCallback(String(m)); }

  // resolve platform
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  log(`Platform check: isIOS=${isIOS}, isAndroid=${isAndroid}`);

  // check existence via HEAD (fallback to GET range if needed)
  async function exists(url) {
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return true;
      if (r.status === 405 || r.status === 403) {
        const r2 = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }});
        return r2.ok;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // Check assets
  log('Checking assets...');
  const vrmExists = await exists(vrmPath);
  const glbExists = await exists(glbPath);
  const usdzExists = await exists(usdzPath);
  log(`Asset exist: vrm=${vrmExists}, glb=${glbExists}, usdz=${usdzExists}`);

  // Preload VRM if available (useful for preview + AR placement)
  let preloaded = { vrm: null, gltf: null };
  if (vrmExists) {
    log('Preloading VRM...');
    try {
      const res = await preloadVRM(vrmPath);
      preloaded.vrm = res.vrm;
      preloaded.vrmScene = res.scene;
      log('VRM preloaded (instance available)');
    } catch (e) {
      err('VRM preload failed: ' + e);
    }
  } else {
    log('No VRM to preload.');
  }

  // Preload GLB (parse into gltf) if present (for scene-viewer fallback / android scene viewer)
  if (glbExists) {
    log('Preloading GLB...');
    try {
      const r = await fetch(glbPath);
      if (!r.ok) throw new Error('GLB fetch HTTP '+r.status);
      const ab = await r.arrayBuffer();
      // parse via GLTFLoader.parse - using global THREE.GLTFLoader
      const gltf = await new Promise((resolve, reject) => {
        try {
          const loader = new THREE.GLTFLoader();
          loader.parse(ab, '', (g) => resolve(g), (err) => reject(err));
        } catch (e) {
          reject(e);
        }
      });
      preloaded.gltf = gltf;
      log('GLB parsed.');
    } catch (e) {
      err('GLB preload failed: ' + e);
    }
  } else {
    log('No GLB to preload.');
  }

  // Decide best mode
  let mode = null;
  try {
    if (isIOS && usdzExists) {
      mode = 'ios-quicklook';
      log('Selecting mode: iOS Quick Look (usdZ)');
    } else if (isAndroid) {
      // check WebXR support
      if (navigator.xr && navigator.xr.isSessionSupported) {
        try {
          const supported = await navigator.xr.isSessionSupported('immersive-ar');
          if (supported) {
            mode = 'android-webxr';
            log('Android: WebXR immersive-ar supported -> android-webxr');
          } else {
            // fallback to scene-viewer if glb present
            if (glbExists) {
              mode = 'scene-viewer';
              log('Android: WebXR not supported -> scene-viewer (glb) fallback');
            } else {
              mode = 'model-viewer-fallback';
              log('Android: WebXR not supported and no glb -> model-viewer fallback');
            }
          }
        } catch (e) {
          err('isSessionSupported check failed: ' + e);
          if (glbExists) { mode = 'scene-viewer'; log('Fallback: scene-viewer'); } else { mode = 'model-viewer-fallback'; }
        }
      } else {
        if (glbExists) { mode = 'scene-viewer'; log('Android: navigator.xr not available -> scene-viewer fallback'); }
        else { mode = 'model-viewer-fallback'; log('Android: navigator.xr not available -> model-viewer fallback'); }
      }
    } else {
      // other platform: if glb exists, model-viewer can show on-page or scene-viewer may be used
      if (glbExists) { mode = 'model-viewer-fallback'; log('Other platform: using model-viewer with glb'); }
      else if (usdzExists) { mode = 'ios-quicklook'; log('Other platform but usdz exists: Quick Look'); }
      else { mode = 'model-viewer-fallback'; log('Other platform: model-viewer fallback (preview only)'); }
    }
  } catch (e) {
    err('Error determining mode: ' + e);
    mode = 'model-viewer-fallback';
  }

  return { success: errors.length === 0, mode, logs, errors, preloaded };
}
