// js/main.js
import { startTitle, stopTitle } from './title-screen.js';
import { prepareARFlow } from './load-screen.js';
import { startPreview } from './ar-screen.js';

let globalState = { preloaded: null, selectedMode: null, arPreviewHandle: null };

async function init() {
  await startTitle();

  // Start button -> load -> preview
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
      // also show short summary on top-log
      const t = document.createElement('div');
      t.textContent = m;
      topLog.prepend(t);
      setTimeout(() => { try { t.remove(); } catch(e){} }, 6000);
    }

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

    loading.style.display = 'none';
    loading.setAttribute('aria-hidden', 'true');

    // stop title rendering
    try { stopTitle(); } catch (e) { console.warn('stopTitle error', e); }

    // start preview
    let preview = null;
    try {
      preview = await startPreview(result.preloaded);
      globalState.arPreviewHandle = preview;
    } catch (e) {
      console.error('Failed to start preview:', e);
      document.getElementById('ar-status').textContent = 'プレビュー開始失敗: ' + e;
      return;
    }

    // show ar-screen
    const arScreen = document.getElementById('ar-screen');
    arScreen.style.display = 'block';
    arScreen.setAttribute('aria-hidden', 'false');

    // show Back button (hidable)
    document.getElementById('btnBackToTitle').classList.remove('hidable');

    // bind side-ui buttons
    document.getElementById('btnToggleUI').onclick = () => {
      document.documentElement.classList.toggle('ui-hidden');
    };

    document.getElementById('btnScreenshot').onclick = async () => {
      const arLog = document.getElementById('ar-log');
      function aLog(m) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`; arLog.prepend(d); }
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.captureScreenshot === 'function') {
        aLog('スクリーンショット開始...');
        try {
          const r = await globalState.arPreviewHandle.captureScreenshot('screenshot.png');
          aLog('スクリーンショット完了');
        } catch (e) {
          aLog('スクリーンショット失敗: ' + e);
        }
      } else {
        aLog('スクリーンショット機能は未使用です');
      }
    };

    // back to title
    document.getElementById('btnBackToTitle').onclick = () => {
      const arScreen = document.getElementById('ar-screen');
      arScreen.style.display = 'none';
      document.getElementById('ui').style.display = 'block';
      if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.stop === 'function') {
        try { globalState.arPreviewHandle.stop(); } catch (e) { console.warn('stop failed', e); }
      }
      // hide back button again
      document.getElementById('btnBackToTitle').classList.add('hidable');
      // restart title screen
      startTitle().catch(() => {});
    };
  });

  // keep Toggle UI and Screenshot buttons bound even before preview
  document.getElementById('btnToggleUI').onclick = () => document.documentElement.classList.toggle('ui-hidden');
  document.getElementById('btnScreenshot').onclick = async () => {
    const arLog = document.getElementById('ar-log');
    function aLog(m) { const d = document.createElement('div'); d.textContent = `[${new Date().toLocaleTimeString()}] ${m}`; arLog.prepend(d); }
    if (globalState.arPreviewHandle && typeof globalState.arPreviewHandle.captureScreenshot === 'function') {
      aLog('スクリーンショット開始...');
      try { await globalState.arPreviewHandle.captureScreenshot('screenshot.png'); aLog('スクリーンショット完了'); } catch (e) { aLog('スクリーンショット失敗: ' + e); }
    } else {
      aLog('スクリーンショット: プレビュー未起動');
    }
  };
}

window.addEventListener('load', init);
