// js/main.js
import { startTitle, stopTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { startPreview } from './ar-screen.js';

let globalState = {
  preloaded: null,
  selectedMode: null,
  arPreviewHandle: null
};

async function init() {
  // Start title screen
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

    // Stop title screen rendering and cleanup canvases
    try {
      stopTitle();
    } catch (e) {
      console.warn('stopTitle error', e);
    }

    // Start non-AR preview (AR screen)
    try {
      const previewHandle = await startPreview(result.preloaded);
      globalState.arPreviewHandle = previewHandle;
    } catch (e) {
      console.error('Failed to start AR preview:', e);
      // show an error in ar-screen area
      const arScreen = document.getElementById('ar-screen');
      arScreen.style.display = 'block';
      document.getElementById('ar-status').textContent = 'プレビュー開始に失敗しました: ' + e;
    }

    // show AR screen UI
    const arScreen = document.getElementById('ar-screen');
    arScreen.style.display = 'block';
    arScreen.setAttribute('aria-hidden', 'false');

    // update status text based on selected mode
    const status = document.getElementById('ar-status');
    if (result.mode === 'ios-quicklook') status.textContent = 'iOS Quick Look 準備完了（プレビュー中）';
    else if (result.mode === 'android-webxr') status.textContent = 'Android WebXR 準備完了（プレビュー中）';
    else if (result.mode === 'scene-viewer') status.textContent = 'Scene Viewer 準備完了（プレビュー中）';
    else status.textContent = 'プレビュー準備完了（AR を開始できます）';

    // Bind AR button actions (existing code from previous implementation)
    document.getElementById('btnEnterAR').onclick = async () => {
      const arLog = document.getElementById('ar-log');
      function aLog(m) {
        const d = document.createElement('div');
        d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
        arLog.prepend(d);
      }
      aLog('Enter AR clicked. Mode=' + result.mode);
      try {
        if (result.mode === 'ios-quicklook') {
          const mv = document.createElement('model-viewer');
          mv.setAttribute('style','display:none;');
          mv.setAttribute('src','./assets/Aorin.glb');
          mv.setAttribute('ios-src','./assets/Aorin.usdz');
          mv.setAttribute('ar', '');
          mv.setAttribute('ar-modes','webxr scene-viewer quick-look');
          document.body.appendChild(mv);
          try { await mv.activateAR(); aLog('model-viewer.activateAR() called for Quick Look'); } catch(e){ aLog('activateAR() error: ' + e); }
        } else if (result.mode === 'android-webxr') {
          if (navigator.xr && navigator.xr.isSessionSupported) {
            const supported = await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false);
            if (supported) {
              aLog('Requesting WebXR immersive-ar session...');
              try {
                const options = { requiredFeatures:['hit-test'], optionalFeatures:['dom-overlay'], domOverlay:{ root: document.getElementById('three-wrap') } };
                const session = await navigator.xr.requestSession('immersive-ar', options);
                aLog('WebXR session started.');
                document.getElementById('ar-status').textContent = 'ARセッション開始';
                // Note: full three.js WebXR integration (renderer.xr.setSession etc.) to be implemented next.
              } catch (e) { aLog('Failed to start WebXR session: ' + e); }
            } else { aLog('WebXR not supported on this device.'); }
          } else { aLog('navigator.xr not available.'); }
        } else {
          // scene-viewer or model-viewer fallback
          const mv = document.createElement('model-viewer');
          mv.setAttribute('style','display:none;');
          mv.setAttribute('src','./assets/Aorin.glb');
          mv.setAttribute('ios-src','./assets/Aorin.usdz');
          mv.setAttribute('ar','');
          mv.setAttribute('ar-modes','webxr scene-viewer quick-look');
          document.body.appendChild(mv);
          try { await mv.activateAR(); aLog('model-viewer.activateAR() called (fallback).'); } catch(e){ aLog('activateAR fallback error: ' + e); }
        }
      } catch (e) { aLog('Enter AR error: ' + e); }
    };

    // Back to title
    document.getElementById('btnBackToTitle').onclick = () => {
      // hide AR screen and show title UI; also stop preview renderer
      const arScreen = document.getElementById('ar-screen');
      arScreen.style.display = 'none';
      document.getElementById('ui').style.display = 'block';
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.stop === 'function') {
        try { globalState.arPreviewHandle.stop(); } catch(e){ console.warn('Failed to stop preview handle', e); }
      }
      // restart title screen (optional)
      startTitle().catch(()=>{});
    };
  });
}

window.addEventListener('load', init);
