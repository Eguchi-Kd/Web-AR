// js/main.js
import { startTitle, stopTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { startPreview } from './ar-screen.js';

let globalState = { preloaded: null, selectedMode: null, arPreviewHandle: null, assetPaths: null };

async function init() {
  await startTitle();

  // ensure elements hidden initially
  document.getElementById('side-ui').classList.add('initial-hidden');
  document.getElementById('top-log').classList.add('initial-hidden');
  document.getElementById('load-log').classList.add('initial-hidden');
  document.getElementById('load-errors').classList.add('initial-hidden');
  document.getElementById('ar-log').classList.add('initial-hidden');
  document.getElementById('ar-status').classList.add('initial-hidden');
  document.getElementById('debug').classList.add('initial-hidden');

  const assetPaths = { vrmPath: './assets/Aorin.vrm', glbPath: './assets/Aorin.glb', usdzPath: './assets/Aorin.usdz' };
  globalState.assetPaths = assetPaths;

  document.getElementById('btnStart').addEventListener('click', async () => {
    document.getElementById('ui').style.display = 'none';
    const loading = document.getElementById('loading-screen');
    loading.style.display = 'flex';
    loading.setAttribute('aria-hidden', 'false');

    const logEl = document.getElementById('load-log');
    const topLog = document.getElementById('top-log');
    const errEl = document.getElementById('load-errors');

    function pushLog(m) {
      const d = document.createElement('div');
      d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`;
      logEl.prepend(d);
      const t = document.createElement('div');
      t.textContent = m;
      topLog.prepend(t);
      setTimeout(() => { try { t.remove(); } catch (e) {} }, 7000);
    }

    // reveal side-ui and logs after Start
    document.getElementById('side-ui').classList.remove('initial-hidden');
    document.getElementById('side-ui-hidable').classList.remove('initial-hidden');
    document.getElementById('top-log').classList.remove('initial-hidden');
    document.getElementById('load-log').classList.remove('initial-hidden');
    document.getElementById('load-errors').classList.remove('initial-hidden');
    document.getElementById('debug').classList.remove('initial-hidden');

    // prepare AR flow and preload models (uses load-screen.js)
    const result = await prepareARFlow({
      vrmPath: assetPaths.vrmPath,
      glbPath: assetPaths.glbPath,
      usdzPath: assetPaths.usdzPath,
      logCallback: (m) => { pushLog(m); }
    });

    if (result.errors && result.errors.length) errEl.textContent = result.errors.join('\n'); else errEl.textContent = '';

    globalState.preloaded = result.preloaded;
    globalState.selectedMode = result.mode;
    pushLog('Final decision: mode=' + result.mode + ', success=' + result.success);

    // hide loading overlay
    loading.style.display = 'none';
    loading.setAttribute('aria-hidden', 'true');

    // stop title renderer if any
    try { stopTitle(); } catch (e) { console.warn('stopTitle error', e); }

    // start non-AR preview
    try {
      const preview = await startPreview(result.preloaded);
      globalState.arPreviewHandle = preview;
    } catch (e) {
      console.error('Failed to start preview:', e);
      document.getElementById('ar-status').textContent = 'プレビュー開始失敗: ' + e;
      document.getElementById('ar-status').classList.remove('initial-hidden');
      return;
    }

    // show ar-screen and logs
    document.getElementById('ar-screen').style.display = 'block';
    document.getElementById('ar-screen').setAttribute('aria-hidden', 'false');
    document.getElementById('ar-status').classList.remove('initial-hidden');
    document.getElementById('ar-log').classList.remove('initial-hidden');

    // show back button
    document.getElementById('btnBackToTitle').classList.remove('initial-hidden');

    // bind UI buttons
    document.getElementById('btnToggleUI').onclick = () => document.documentElement.classList.toggle('ui-hidden');

    document.getElementById('btnScreenshot').onclick = async () => {
      const arLog = document.getElementById('ar-log');
      function aLog(m) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`; arLog.prepend(d); }
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.captureScreenshot === 'function') {
        aLog('スクリーンショット開始...');
        try {
          await globalState.arPreviewHandle.captureScreenshot('screenshot.png');
          aLog('スクリーンショット完了');
        } catch (e) {
          aLog('スクリーンショット失敗: ' + e);
        }
      } else {
        aLog('スクリーンショット: プレビュー未起動');
      }
    };

    document.getElementById('btnBackToTitle').onclick = () => {
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.stop === 'function') {
        try { globalState.arPreviewHandle.stop(); } catch (e) { console.warn('stop failed', e); }
      }
      document.getElementById('ar-screen').style.display = 'none';
      document.getElementById('ui').style.display = 'block';
      document.getElementById('side-ui').classList.add('initial-hidden');
      document.getElementById('side-ui-hidable').classList.add('initial-hidden');
      startTitle().catch(() => {});
    };

    // bind AR Mode button (enable it now)
    const btnAR = document.getElementById('btnARMode');
    btnAR.disabled = false;
    btnAR.onclick = async () => {
      const arLog = document.getElementById('ar-log');
      function aLog(m) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`; arLog.prepend(d); }
      aLog('ARモード起動を開始します...');
      if (!globalState.arPreviewHandle || typeof globalState.arPreviewHandle.startARSession !== 'function') {
        aLog('ARセッション開始機能が未準備です');
        return;
      }
      try {
        // pass asset URLs
        const res = await globalState.arPreviewHandle.startARSession({
          vrmUrl: assetPaths.vrmPath,
          glbUrl: assetPaths.glbPath,
          usdzUrl: assetPaths.usdzPath
        });
        aLog('AR start result: ' + JSON.stringify(res));
      } catch (e) {
        aLog('AR start exception: ' + e);
      }
    };
  });

  // Toggle available pre-start as well (persistant button remains)
  const toggleBtn = document.getElementById('btnToggleUI');
  if (toggleBtn) toggleBtn.onclick = () => document.documentElement.classList.toggle('ui-hidden');
}

window.addEventListener('load', init);
