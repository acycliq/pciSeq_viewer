/**
 * check_cell Bridge Module
 *
 * Provides cell type comparison diagnostics using pre-computed SQLite data.
 * No Python server required - data is read via Electron IPC from SQLite.
 */

import { state } from './state/stateManager.js';
import { showNotification } from './ui/notification.js';
import {
    renderDivergingChart,
    buildExpressionTable,
    buildContributionTable
} from './charts/checkCellCharts.js';

/**
 * Setup modal event listeners and subscribe to state changes.
 * Call once during app initialization.
 */
export async function setupCheckCellBridge() {
    // Modal close button
    const closeBtn = document.getElementById('checkCellClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Compare button
    const compareBtn = document.getElementById('checkCellCompareBtn');
    if (compareBtn) compareBtn.addEventListener('click', handleCompare);

    // Subscribe to state changes from main process
    if (window.electronAPI?.onCheckCellState) {
        window.electronAPI.onCheckCellState((stateData) => {
            applyCheckCellState(stateData, true);
        });
    }

    // Get initial state on startup (in case DB was already loaded)
    if (window.electronAPI?.getCheckCellState) {
        try {
            const initialState = await window.electronAPI.getCheckCellState();
            applyCheckCellState(initialState, false);
        } catch (e) {
            console.warn('Failed to get initial check_cell state:', e);
        }
    }
}

/**
 * Apply check_cell state to the app.
 * @param {Object} stateData - { enabled, classes, nC, nG, nK }
 * @param {boolean} notify - Whether to show notification
 */
function applyCheckCellState(stateData, notify) {
    if (stateData.enabled) {
        state.checkCellConnected = true;
        state.checkCellClasses = stateData.classes || [];
        window.appState.labelMap = stateData.labelMap || null;
        if (notify) {
            showNotification('check_cell connected (' + state.checkCellClasses.length + ' classes)', 'success');
        }
        console.log('check_cell enabled. Classes:', state.checkCellClasses.length);
    } else {
        state.checkCellConnected = false;
        state.checkCellClasses = [];
        window.appState.labelMap = null;
        if (notify && state.checkCellConnected) {
            // Only notify on disconnect if we were previously connected
            console.log('check_cell disabled');
        }
    }
}

// --- Modal ---

/**
 * Open the check_cell modal for a given cell.
 * Called by polygonInteractions.js on Ctrl+click.
 */
export function openCheckCellModal(cellLabel) {
    const panel = document.getElementById('checkCellPanel');
    if (!panel) return;

    // Reset phases
    const selectPhase = document.getElementById('checkCellSelectPhase');
    const resultsPhase = document.getElementById('checkCellResultsPhase');
    const loading = document.getElementById('checkCellLoading');
    if (selectPhase) selectPhase.style.display = 'block';
    if (resultsPhase) resultsPhase.style.display = 'none';
    if (loading) loading.style.display = 'none';

    // Store current cell label on the panel
    panel.dataset.cellLabel = cellLabel;

    // Show assigned class from cellDataMap
    const assignedEl = document.getElementById('checkCellAssigned');
    const assignedClass = getAssignedClass(cellLabel);
    if (assignedEl) assignedEl.textContent = 'Assigned: ' + (assignedClass || 'Unknown');

    // Populate dropdown
    const select = document.getElementById('checkCellClassSelect');
    if (select) {
        select.innerHTML = '';
        state.checkCellClasses.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            select.appendChild(opt);
        });
    }

    // Update title
    const title = document.getElementById('checkCellTitle');
    if (title) title.textContent = 'Cell ' + cellLabel;

    // Slide in
    panel.classList.remove('collapsed');
}

function closeModal() {
    const panel = document.getElementById('checkCellPanel');
    if (panel) panel.classList.add('collapsed');
}

async function handleCompare() {
    const panel = document.getElementById('checkCellPanel');
    if (!panel) return;

    const cellLabel = panel.dataset.cellLabel;
    const select = document.getElementById('checkCellClassSelect');
    const userClass = select ? select.value : null;
    if (!cellLabel || !userClass) return;

    const selectPhase = document.getElementById('checkCellSelectPhase');
    const resultsPhase = document.getElementById('checkCellResultsPhase');
    const loading = document.getElementById('checkCellLoading');

    // Show loading
    if (selectPhase) selectPhase.style.display = 'none';
    if (loading) loading.style.display = 'block';

    try {
        // Query via Electron IPC (binary file read + computation)
        const result = await window.electronAPI.checkCellQuery({
            cellId: Number(cellLabel),
            userClass: userClass,
            topN: 10
        });

        if (!result.success) {
            throw new Error(result.error || 'Query failed');
        }

        if (loading) loading.style.display = 'none';
        if (resultsPhase) resultsPhase.style.display = 'block';

        // Render after DOM reflow so container has dimensions
        requestAnimationFrame(() => renderResults(result));
    } catch (err) {
        if (loading) loading.style.display = 'none';
        if (selectPhase) selectPhase.style.display = 'block';
        showNotification('check_cell error: ' + err.message, 'error');
        console.error('check_cell query failed:', err);
    }
}

// --- Results Rendering ---

function renderResults(data) {
    // Main title with cell ID
    const summary = document.getElementById('checkCellSummary');
    if (summary) {
        summary.innerHTML = 'Cell ' + data.cellId + ': ' +
            '<span style="color:#87CEEB;font-weight:600;">' + escapeHtml(data.assignedClass) +
            '</span> <span style="color:#6b7280;margin:0 8px;">vs</span> ' +
            '<span style="color:#db5c5c;font-weight:600;">' + escapeHtml(data.userClass) + '</span>';
    }

    // Render D3 diverging bar chart
    const plotContainer = document.getElementById('checkCellPlot');
    if (plotContainer) {
        renderDivergingChart(plotContainer, data);
    }

    // Gene expression table
    const exprWrap = document.getElementById('checkCellExprTable');
    if (exprWrap) {
        exprWrap.innerHTML = buildExpressionTable(data);
    }

    // Contribution table
    const contrWrap = document.getElementById('checkCellContrTable');
    if (contrWrap) {
        contrWrap.innerHTML = buildContributionTable(data);
    }
}

// --- Helpers ---

function getAssignedClass(cellLabel) {
    if (!state.cellDataMap) return null;
    const cell = state.cellDataMap.get(Number(cellLabel));
    if (!cell || !cell.classification) return null;

    const names = cell.classification.className;
    const probs = cell.classification.probability;
    if (!Array.isArray(names) || !Array.isArray(probs) || probs.length === 0) return null;

    let bestIdx = 0;
    for (let i = 1; i < probs.length; i++) {
        if (probs[i] > probs[bestIdx]) bestIdx = i;
    }
    return names[bestIdx] || null;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


