// js/main.js
import { startTitle, stopTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { startPreview } from './ar-screen.js';

let globalState = { preloaded: null, selectedMode: null, arPreviewHandle: null };

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

    // Prepare AR flow
    const result = await prepareARFlow({
      vrmPath: './assets/Aorin.vrm',
      glbPath: './assets/Aorin.glb',
      usdzPath: './assets/Aorin.usdz',
      logCallback: (m) => { pushLog(m); }
    });

    if (result.errors && result.errors.length) {
      errEl.textContent = result.errors.join('\\n');
    } else {
      errEl.textContent = '';
    }

    globalState.preloaded = result.preloaded;
    globalState.selectedMode = result.mode;

    pushLog('Final decision: mode=' + result.mode + ', success=' + result.success);

    // hide loading and go to AR screen
    loading.style.display = 'none';
    loading.setAttribute('aria-hidden', 'true');

    // stop title rendering and cleanup
    try {
      stopTitle();
    } catch (e) {
      console.warn('stopTitle error', e);
    }

    // start non-AR preview
    let previewHandle = null;
    try {
      previewHandle = await startPreview(result.preloaded);
      globalState.arPreviewHandle = previewHandle;
    } catch (e) {
      console.error('Failed to start AR preview:', e);
      const arScreen = document.getElementById('ar-screen');
      arScreen.style.display = 'block';
      document.getElementById('ar-status').textContent = 'プレビュー開始に失敗しました: ' + e;
      return;
    }

    // show AR UI
    const arScreen = document.getElementById('ar-screen');
    arScreen.style.display = 'block';
    arScreen.setAttribute('aria-hidden', 'false');

    // update status
    const status = document.getElementById('ar-status');
    if (result.mode === 'ios-quicklook') status.textContent = 'iOS Quick Look 準備完了（プレビュー中）';
    else if (result.mode === 'android-webxr') status.textContent = 'Android WebXR 準備完了（プレビュー中）';
    else if (result.mode === 'scene-viewer') status.textContent = 'Scene Viewer 準備完了（プレビュー中）';
    else status.textContent = 'プレビュー準備完了（AR を開始できます）';

    // Bind AR button
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
                // full WebXR integration can be implemented next
              } catch (e) { aLog('Failed to start WebXR session: ' + e); }
            } else { aLog('WebXR not supported on this device.'); }
          } else { aLog('navigator.xr not available.'); }
        } else {
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

    // Bind UI toggle
    document.getElementById('btnToggleUI').onclick = () => {
      document.documentElement.classList.toggle('ui-hidden');
    };

    // Bind screenshot button
    document.getElementById('btnScreenshot').onclick = async () => {
      const arLog = document.getElementById('ar-log');
      function aLog(m) {
        const d = document.createElement('div');
        d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
        arLog.prepend(d);
      }
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.captureScreenshot === 'function') {
        aLog('Capturing screenshot...');
        try {
          const r = await globalState.arPreviewHandle.captureScreenshot({ downloadName: 'screenshot.png' });
          aLog('Screenshot result: ' + JSON.stringify({ success: r.success, openedNewTab: r.openedNewTab || false }));
        } catch (e) {
          aLog('Screenshot failed: ' + e);
        }
      } else {
        aLog('Screenshot not available.');
      }
    };

    // Back button
    document.getElementById('btnBackToTitle').onclick = () => {
      const arScreen = document.getElementById('ar-screen');
      arScreen.style.display = 'none';
      document.getElementById('ui').style.display = 'block';
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.stop === 'function') {
        try { globalState.arPreviewHandle.stop(); } catch(e){ console.warn('Failed to stop preview handle', e); }
      }
      // restart title (optional)
      startTitle().catch(()=>{});
    };
  });
}

window.addEventListener('load', init);
