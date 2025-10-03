// js/load-screen.js
// Robust prepareARFlow with base-resolved URLs

export async function prepareARFlow({ vrmPath = './assets/Aorin.vrm', glbPath = './assets/Aorin.glb', usdzPath = './assets/Aorin.usdz', logCallback = null } = {}) {
  const logs = [];
  const errors = [];
  function log(m) { const s = String(m); logs.push(s); if (logCallback) logCallback(s); }
  function err(m) { const s = String(m); errors.push(s); if (logCallback) logCallback(s); }

  // platform detection
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  log(`Platform: isIOS=${isIOS}, isAndroid=${isAndroid}`);

  // compute base (directory of this page) to resolve relative asset paths robustly
  const base = (function() {
    try {
      const href = location.href;
      const idx = href.lastIndexOf('/');
      if (idx >= 0) return href.substring(0, idx + 1);
      return href;
    } catch (e) { return location.href; }
  })();

  function resolveAssetUrl(pathOrUrl) {
    try {
      return new URL(pathOrUrl, base).href;
    } catch (e) {
      // fallback
      if (pathOrUrl.startsWith('/')) return location.origin + pathOrUrl;
      return base + pathOrUrl;
    }
  }

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
      // fallback try GET
      try {
        const r = await fetch(url, { method: 'GET' });
        return r.ok;
      } catch (e2) {
        return false;
      }
    }
  }

  log('Resolving asset URLs...');
  const vrmUrl = resolveAssetUrl(vrmPath);
  const glbUrl = resolveAssetUrl(glbPath);
  const usdzUrl = resolveAssetUrl(usdzPath);
  log(`Resolved: vrm=${vrmUrl}, glb=${glbUrl}, usdz=${usdzUrl}`);

  const vrmExists = await exists(vrmPath);
  const glbExists = await exists(glbPath);
  const usdzExists = await exists(usdzPath);
  log(`Asset existence: vrm=${vrmExists}, glb=${glbExists}, usdz=${usdzExists}`);

  const preloaded = { vrm: null, vrmScene: null, gltf: null, usdz: !!usdzExists };

  // preload VRM (if exists)
  if (vrmExists) {
    log('Preloading VRM (fetch & parse)...');
    try {
      const resp = await fetch(vrmUrl);
      if (!resp.ok) throw new Error('VRM fetch HTTP ' + resp.status);
      const ab = await resp.arrayBuffer();
      if (!ab || ab.byteLength < 20) throw new Error('VRM data too small: ' + (ab ? ab.byteLength : 0));
      const gltf = await new Promise((resolve, reject) => {
        try {
          const loader = new THREE.GLTFLoader();
          loader.parse(ab, '', (g) => resolve(g), (err) => reject(err));
        } catch (e) { reject(e); }
      });
      const vrm = await THREE.VRM.from(gltf);
      preloaded.vrm = vrm;
      preloaded.vrmScene = vrm.scene;
      log('VRM parsed and instance created');
    } catch (e) {
      err('VRM preload failed: ' + e);
    }
  } else {
    log('No VRM present; skipping VRM preload.');
  }

  // preload GLB
  if (glbExists) {
    log('Preloading GLB (fetch & parse)...');
    try {
      const resp = await fetch(glbUrl);
      if (!resp.ok) throw new Error('GLB fetch HTTP ' + resp.status);
      const ab = await resp.arrayBuffer();
      const gltf = await new Promise((resolve, reject) => {
        try {
          const loader = new THREE.GLTFLoader();
          loader.parse(ab, '', (g) => resolve(g), (err) => reject(err));
        } catch (e) { reject(e); }
      });
      preloaded.gltf = gltf;
      log('GLB parsed.');
    } catch (e) {
      err('GLB preload failed: ' + e);
    }
  } else {
    log('No GLB present.');
  }

  // decide mode
  let mode = null;
  try {
    if (isIOS && usdzExists) {
      mode = 'ios-quicklook';
      log('Mode -> ios-quicklook');
    } else if (isAndroid) {
      if (navigator.xr && navigator.xr.isSessionSupported) {
        try {
          const supported = await navigator.xr.isSessionSupported('immersive-ar');
          if (supported) { mode = 'android-webxr'; log('Mode -> android-webxr'); }
          else { mode = glbExists ? 'scene-viewer' : 'model-viewer-fallback'; log('Fallback android mode: ' + mode); }
        } catch (e) { err('isSessionSupported error: ' + e); mode = glbExists ? 'scene-viewer' : 'model-viewer-fallback'; }
      } else { mode = glbExists ? 'scene-viewer' : 'model-viewer-fallback'; log('navigator.xr not available; mode=' + mode); }
    } else {
      mode = glbExists ? 'model-viewer-fallback' : (usdzExists ? 'ios-quicklook' : 'model-viewer-fallback');
      log('Other platform mode: ' + mode);
    }
  } catch (e) {
    err('Mode decision error: ' + e);
    mode = 'model-viewer-fallback';
  }

  return { success: errors.length === 0, mode, logs, errors, preloaded, resolved: { vrmUrl, glbUrl, usdzUrl } };
}
