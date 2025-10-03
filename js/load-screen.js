// js/load-screen.js
// prepareARFlow: robust asset checking and preload
export async function prepareARFlow({ vrmPath = './assets/Aorin.vrm', glbPath = './assets/Aorin.glb', usdzPath = './assets/Aorin.usdz', logCallback = null } = {}) {
  const logs = [];
  const errors = [];
  function log(m) { logs.push(String(m)); if (logCallback) logCallback && logCallback(String(m)); }
  function err(m) { errors.push(String(m)); if (logCallback) logCallback && logCallback(String(m)); }

  // platform detection
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  log(`Platform: isIOS=${isIOS}, isAndroid=${isAndroid}`);

  // helper to resolve URL robustly based on page location
  function resolveAssetUrl(pathOrUrl) {
    try {
      // if absolute URL, return as-is
      const maybe = new URL(pathOrUrl, location.href);
      return maybe.href;
    } catch (e) {
      // fallback - just return path
      return pathOrUrl;
    }
  }

  // check resource existence (HEAD -> fallback GET range)
  async function exists(path) {
    const url = resolveAssetUrl(path);
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return true;
      if (r.status === 405 || r.status === 403) {
        const r2 = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }});
        return r2.ok;
      }
      return false;
    } catch (e) {
      // try GET as last resort
      try {
        const r = await fetch(url, { method: 'GET' });
        return r.ok;
      } catch (e2) {
        return false;
      }
    }
  }

  log('Checking assets (resolved URLs)...');
  const vrmUrl = resolveAssetUrl(vrmPath);
  const glbUrl = resolveAssetUrl(glbPath);
  const usdzUrl = resolveAssetUrl(usdzPath);
  log(`Resolved: vrm=${vrmUrl}, glb=${glbUrl}, usdz=${usdzUrl}`);

  const vrmExists = await exists(vrmPath);
  const glbExists = await exists(glbPath);
  const usdzExists = await exists(usdzPath);
  log(`Asset existence: vrm=${vrmExists}, glb=${glbExists}, usdz=${usdzExists}`);

  // Preload assets
  const preloaded = { vrm: null, vrmScene: null, gltf: null, usdz: !!usdzExists };

  // preload VRM (we'll try parse as in three-vrm-loader)
  if (vrmExists) {
    log('Preloading VRM...');
    try {
      // reuse GLTFLoader parse approach to avoid loader.load async URL issues
      const resp = await fetch(vrmUrl);
      if (!resp.ok) throw new Error('VRM fetch HTTP ' + resp.status);
      const ab = await resp.arrayBuffer();
      if (!ab || ab.byteLength < 20) throw new Error('VRM data too small: ' + (ab ? ab.byteLength : 0));
      // parse
      const gltf = await new Promise((resolve, reject) => {
        try {
          const loader = new THREE.GLTFLoader();
          loader.parse(ab, '', (g) => resolve(g), (err) => reject(err));
        } catch (e) {
          reject(e);
        }
      });
      // convert to VRM
      const vrm = await THREE.VRM.from(gltf);
      preloaded.vrm = vrm;
      preloaded.vrmScene = vrm.scene;
      log('VRM parsed and VRM instance created');
    } catch (e) {
      err('VRM preload failed: ' + e);
    }
  } else {
    log('No VRM present; skipping VRM preload.');
  }

  // Preload GLB (for scene-viewer / model-viewer fallback)
  if (glbExists) {
    log('Preloading GLB...');
    try {
      const resp = await fetch(glbUrl);
      if (!resp.ok) throw new Error('GLB fetch HTTP ' + resp.status);
      const ab = await resp.arrayBuffer();
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
    log('No GLB present.');
  }

  // Decide mode
  let mode = null;
  try {
    if (isIOS && usdzExists) {
      mode = 'ios-quicklook';
      log('Mode -> ios-quicklook');
    } else if (isAndroid) {
      if (navigator.xr && navigator.xr.isSessionSupported) {
        try {
          const supported = await navigator.xr.isSessionSupported('immersive-ar');
          if (supported) {
            mode = 'android-webxr';
            log('Mode -> android-webxr (WebXR supported)');
          } else {
            if (glbExists) { mode = 'scene-viewer'; log('Mode -> scene-viewer (WebXR unsupported, GLB exists)'); }
            else { mode = 'model-viewer-fallback'; log('Mode -> model-viewer-fallback (WebXR unsupported, no GLB)'); }
          }
        } catch (e) {
          err('isSessionSupported error: ' + e);
          mode = glbExists ? 'scene-viewer' : 'model-viewer-fallback';
        }
      } else {
        mode = glbExists ? 'scene-viewer' : 'model-viewer-fallback';
        log('navigator.xr not available; fallback mode: ' + mode);
      }
    } else {
      // other platforms
      if (glbExists) mode = 'model-viewer-fallback';
      else if (usdzExists) mode = 'ios-quicklook';
      else mode = 'model-viewer-fallback';
      log('Other platform fallback mode: ' + mode);
    }
  } catch (e) {
    err('Mode decision error: ' + e);
    mode = 'model-viewer-fallback';
  }

  return { success: errors.length === 0, mode, logs, errors, preloaded };
}
