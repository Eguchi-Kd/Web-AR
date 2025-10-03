// js/main.js
import { startTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { initThree, createPlaceholder } from './three-vrm-loader.js';

let globalState = {
  preloaded: null,
  selectedMode: null
};

async function init() {
  // Start title screen (shows model preview)
  await startTitle();

  // Hook start button
  document.getElementById('btnStart').addEventListener('click', async () => {
    // hide title UI and show loading
    document.getElementById('ui').style.display = 'none';
    const loading = document.getElementById('loading-screen');
    loading.style.display = 'flex';
    loading.setAttribute('aria-hidden', 'false');

    const logEl = document.getElementById('load-log');
    const errEl = document.getElementById('load-errors');
    function pushLog(m) {
      const d = document.createElement('div');
      d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
      logEl.prepend(d);
    }

    // call prepareARFlow with callback
    const result = await prepareARFlow({
      vrmPath: './assets/Aorin.vrm',
      glbPath: './assets/Aorin.glb',
      usdzPath: './assets/Aorin.usdz',
      logCallback: (m) => { pushLog(m); }
    });

    // show errors if any
    if (result.errors && result.errors.length > 0) {
      errEl.textContent = result.errors.join('\\n');
    } else {
      errEl.textContent = '';
    }

    // store preloaded
    globalState.preloaded = result.preloaded;
    globalState.selectedMode = result.mode;

    pushLog('Final decision: mode=' + result.mode + ', success=' + result.success);

    // hide loading and go to AR screen
    loading.style.display = 'none';
    loading.setAttribute('aria-hidden', 'true');
    showARScreen(result.mode, result.preloaded);
  });
}

async function showARScreen(mode, preloaded) {
  // Display AR screen UI (non-AR preview)
  const arScreen = document.getElementById('ar-screen');
  arScreen.style.display = 'block';
  arScreen.setAttribute('aria-hidden', 'false');

  const status = document.getElementById('ar-status');
  const arLog = document.getElementById('ar-log');

  function aLog(m){
    const d = document.createElement('div');
    d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
    arLog.prepend(d);
  }

  aLog('Selected AR mode: ' + mode);

  // Ensure three.js scene exists (re-init if necessary)
  const th = await initThree('three-wrap');
  // If preload provided a VRM scene or gltf, add it for preview
  if (preloaded && preloaded.vrmScene) {
    try {
      const scene = th.scene;
      scene.add(preloaded.vrmScene);
      aLog('Added preloaded VRM to preview');
    } catch (e) {
      aLog('Failed to add preloaded VRM: ' + e);
    }
  } else if (preloaded && preloaded.gltf && preloaded.gltf.scene) {
    try {
      th.scene.add(preloaded.gltf.scene);
      aLog('Added preloaded GLTF to preview');
    } catch (e) {
      aLog('Failed to add preloaded GLTF: ' + e);
    }
  } else {
    // nothing preloaded -> placeholder
    try {
      const ph = createPlaceholder();
      th.scene.add(ph);
      aLog('Preview placeholder shown.');
    } catch (e) { aLog('Placeholder creation failed: ' + e); }
  }

  // update status text depending on mode
  if (mode === 'ios-quicklook') {
    status.textContent = 'iOS Quick Look 準備完了';
  } else if (mode === 'android-webxr') {
    status.textContent = 'Android WebXR 準備完了（Enter AR を押してください）';
  } else if (mode === 'scene-viewer') {
    status.textContent = 'Scene Viewer 準備完了（Enter AR を押してください）';
  } else {
    status.textContent = 'プレビュー準備完了（ARは制限される可能性があります）';
  }

  // Bind AR button
  document.getElementById('btnEnterAR').addEventListener('click', async () => {
    aLog('Enter AR clicked. Mode=' + mode);
    try {
      if (mode === 'ios-quicklook') {
        // use model-viewer programmatic activate - create a hidden element and set ios-src if usdz exists
        const mv = document.createElement('model-viewer');
        mv.setAttribute('style','display:none;');
        mv.setAttribute('src','./assets/Aorin.glb'); // may be absent but model-viewer can still attempt
        mv.setAttribute('ios-src','./assets/Aorin.usdz');
        mv.setAttribute('ar', '');
        mv.setAttribute('ar-modes','webxr scene-viewer quick-look');
        document.body.appendChild(mv);
        try {
          await mv.activateAR();
          aLog('model-viewer.activateAR() called for Quick Look');
        } catch (e) {
          aLog('activateAR() error: ' + e);
        }
      } else if (mode === 'android-webxr') {
        // request WebXR session - user gesture required and we are in click handler so ok
        if (navigator.xr && navigator.xr.isSessionSupported) {
          const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false);
          if (supported) {
            aLog('Requesting WebXR immersive-ar session...');
            try {
              const options = { requiredFeatures:['hit-test'], optionalFeatures:['dom-overlay'], domOverlay:{ root: document.getElementById('three-wrap') } };
              const session = await navigator.xr.requestSession('immersive-ar', options);
              aLog('WebXR session started.');
              // at this point, your AR rendering loop should be started (not fully implemented in this snippet)
              // You would pass session to renderer.xr.setSession(session) with a three.js renderer.
              // For safety, here we simply notify user.
              status.textContent = 'ARセッション開始';
            } catch (e) {
              aLog('Failed to start WebXR session: ' + e);
            }
          } else {
            aLog('WebXR not supported on this device.');
          }
        } else {
          aLog('navigator.xr not available.');
        }
      } else if (mode === 'scene-viewer' || mode === 'model-viewer-fallback') {
        // Use model-viewer activateAR (scene-viewer on Android if available)
        const mv = document.createElement('model-viewer');
        mv.setAttribute('style','display:none;');
        if (preloaded && preloaded.gltf && preloaded.gltf.scene) {
          mv.setAttribute('src','./assets/Aorin.glb');
        } else {
          mv.setAttribute('src','./assets/Aorin.glb');
        }
        if (preloaded && preloaded.usdz) mv.setAttribute('ios-src','./assets/Aorin.usdz');
        mv.setAttribute('ar','');
        mv.setAttribute('ar-modes','webxr scene-viewer quick-look');
        document.body.appendChild(mv);
        try {
          await mv.activateAR();
          aLog('model-viewer.activateAR() called (fallback).');
        } catch (e) {
          aLog('activateAR fallback error: ' + e);
        }
      } else {
        aLog('Unknown AR mode: ' + mode);
      }
    } catch (e) {
      aLog('Enter AR error: ' + e);
    }
  });

  // Back to title
  document.getElementById('btnBackToTitle').addEventListener('click', () => {
    arScreen.style.display = 'none';
    document.getElementById('ui').style.display = 'block';
  });
}

window.addEventListener('load', init);
