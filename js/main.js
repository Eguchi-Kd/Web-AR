// js/main.js
import { startTitle, stopTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { startPreview } from './ar-screen.js';

let globalState = { preloaded: null, selectedMode: null, arPreviewHandle: null };

async function init() {
  await startTitle();

  // ensure side-ui and logs hidden at start
  document.getElementById('side-ui').classList.add('initial-hidden');
  document.getElementById('top-log').classList.add('initial-hidden');
  document.getElementById('load-log').classList.add('initial-hidden');
  document.getElementById('load-errors').classList.add('initial-hidden');
  document.getElementById('ar-log').classList.add('initial-hidden');
  document.getElementById('ar-status').classList.add('initial-hidden');
  document.getElementById('debug').classList.add('initial-hidden');

  document.getElementById('btnStart').addEventListener('click', async () => {
    // Show loading
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

    // ensure logs/UI elements become visible now (after Start pressed)
    document.getElementById('side-ui').classList.remove('initial-hidden');
    document.getElementById('top-log').classList.remove('initial-hidden');
    document.getElementById('load-log').classList.remove('initial-hidden');
    document.getElementById('load-errors').classList.remove('initial-hidden');
    document.getElementById('debug').classList.remove('initial-hidden');

    // prepare AR flow
    const result = await prepareARFlow({
      vrmPath: './assets/Aorin.vrm',
      glbPath: './assets/Aorin.glb',
      usdzPath: './assets/Aorin.usdz',
      logCallback: (m) => { pushLog(m); }
    });

    if (result.errors && result.errors.length) errEl.textContent = result.errors.join('\n'); else errEl.textContent = '';

    globalState.preloaded = result.preloaded;
    globalState.selectedMode = result.mode;
    pushLog('Final decision: mode=' + result.mode + ', success=' + result.success);

    // hide loading overlay
    loading.style.display = 'none';
    loading.setAttribute('aria-hidden', 'true');

    // stop title renderer
    try { stopTitle(); } catch (e) { console.warn('stopTitle error', e); }

    // start preview
    try {
      const preview = await startPreview(result.preloaded);
      globalState.arPreviewHandle = preview;
    } catch (e) {
      console.error('Failed to start preview:', e);
      document.getElementById('ar-status').textContent = 'プレビュー開始失敗: ' + e;
      document.getElementById('ar-status').classList.remove('initial-hidden');
      return;
    }

    // reveal AR-panel and make back button visible
    document.getElementById('ar-screen').style.display = 'block';
    document.getElementById('ar-screen').setAttribute('aria-hidden', 'false');
    document.getElementById('ar-status').classList.remove('initial-hidden');
    document.getElementById('ar-log').classList.remove('initial-hidden');

    // make back button visible (it is hidable but shown now)
    document.getElementById('btnBackToTitle').classList.remove('initial-hidden');

    // bind side-ui buttons (toggle always available)
    document.getElementById('btnToggleUI').onclick = () => {
      document.documentElement.classList.toggle('ui-hidden');
    };

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

    // back
    document.getElementById('btnBackToTitle').onclick = () => {
      // cleanup preview
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.stop === 'function') {
        try { globalState.arPreviewHandle.stop(); } catch (e) { console.warn('stop failed', e); }
      }
      // hide ar screen
      document.getElementById('ar-screen').style.display = 'none';
      // hide back button again
      document.getElementById('btnBackToTitle').classList.add('initial-hidden');
      // show title UI
      document.getElementById('ui').style.display = 'block';
      // restart title animation
      startTitle().catch(() => {});
    };
  });

  // Always-available small bindings (toggle)
  document.getElementById('btnToggleUI').onclick = () => document.documentElement.classList.toggle('ui-hidden');
}

window.addEventListener('load', init);
