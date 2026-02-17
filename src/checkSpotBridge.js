/**
 * check_spot Bridge Module
 * Reads spot diagnostics via Electron IPC and renders charts.
 */

import { state } from './state/stateManager.js';
import { showNotification } from './ui/notification.js';
import {
    renderTable,
    renderScores,
    renderProbs
} from './charts/checkSpotCharts.js';

export async function setupCheckSpotBridge() {
  const closeBtn = document.getElementById('checkSpotClose');
  if (closeBtn) closeBtn.addEventListener('click', () => closeModal());

  if (window.electronAPI?.onCheckSpotState) {
    window.electronAPI.onCheckSpotState((st) => {
      state.checkSpotConnected = !!st.enabled;
    });
  }

  if (window.electronAPI?.getCheckSpotState) {
    try {
      const st = await window.electronAPI.getCheckSpotState();
      state.checkSpotConnected = !!st.enabled;
    } catch {}
  }
}

export function openCheckSpotModal(spotId) {
  const panel = document.getElementById('checkSpotPanel');
  if (!panel) return;
  panel.dataset.spotId = String(spotId);
  document.getElementById('checkSpotInfo').textContent = '';
  document.getElementById('checkSpotScores').innerHTML = '';
  document.getElementById('checkSpotProbs').innerHTML = '';
  document.getElementById('checkSpotTable').innerHTML = '';
  document.getElementById('checkSpotLoading').style.display = 'block';
  
  // Slide in
  panel.classList.remove('collapsed');
  
  queryAndRender(Number(spotId));
}

function closeModal() {
  const panel = document.getElementById('checkSpotPanel');
  if (panel) panel.classList.add('collapsed');
}

async function queryAndRender(spotId) {
  try {
    const res = await window.electronAPI.checkSpotQuery(spotId);
    const loading = document.getElementById('checkSpotLoading');
    if (loading) loading.style.display = 'none';
    if (!res.success) {
      showNotification('check_spot error: ' + (res.error || 'failed'), 'error');
      return;
    }
    const title = document.getElementById('checkSpotTitle');
    if (title) title.textContent = `check_spot - Spot ${res.spotId}`;
    const info = document.getElementById('checkSpotInfo');
    if (info) {
      info.textContent = `Gene ${res.geneName} at (x=${res.x}, y=${res.y}, z=${res.z})`;
    }
    renderScores(document.getElementById('checkSpotScores'), res);
    renderProbs(document.getElementById('checkSpotProbs'), res);
    renderTable(document.getElementById('checkSpotTable'), res);
  } catch (e) {
    const loading = document.getElementById('checkSpotLoading');
    if (loading) loading.style.display = 'none';
    showNotification('check_spot error: ' + e.message, 'error');
  }
}




