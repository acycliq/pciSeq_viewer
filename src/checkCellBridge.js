/**
 * check_cell Bridge Module
 *
 * Provides cell type comparison diagnostics using pre-computed SQLite data.
 * No Python server required - data is read via Electron IPC from SQLite.
 */

import { state } from './state/stateManager.js';
import { getClassColor } from './cellInfoPanel/colorResolver.js';
import { showNotification } from './ui/notification.js';
import { getFormattedCellCoordinates } from '../utils/cellFormatting.js';
import { clearTooltipCache } from './data/tooltipDiagnostics.js';
import {
    renderDivergingChart,
    buildExpressionTable,
    buildContributionTable,
    renderComponentsChart,
    renderPosteriorChart,
    escapeHtml
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

    // Tab switching
    const tabs = document.querySelectorAll('.check-cell-tab');
    tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));

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
    const wasConnected = state.checkCellConnected;
    if (stateData.enabled) {
        // Contract with the main process: the enabled payload must carry genePanel,
        // because the spot tooltip needs it to resolve gene name -> index. A missing
        // genePanel here is a main-process bug, not a hover-time recoverable state.
        if (!Array.isArray(stateData.genePanel) || stateData.genePanel.length === 0) {
            throw new Error('check_cell enabled payload missing genePanel');
        }
        state.checkCellConnected = true;
        state.checkCellClasses = stateData.classes || [];
        window.appState.labelMap = stateData.labelMap || null;
        window.appState.genePanel = stateData.genePanel;

        // Spot-hover gamma chain log and cell-hover theta chain log.
        // See notes/spot_hover_chain_spec.md.
        // Older diagnostics.db files may lack some of these; gate each chain on
        // its required fields so the emitters are no-ops for old data.
        window.appState.Inefficiency       = stateData.Inefficiency ?? null;
        window.appState.A_c                = stateData.A_c          ?? null;
        window.appState.eta_bar            = stateData.eta_bar      ?? null;
        window.appState.sc_mean_expression = stateData.sc_mean_expression ?? null;
        window.appState.rSpot              = stateData.rSpot        ?? null;
        window.appState.rTheta             = stateData.rTheta       ?? null;
        window.appState.SpotReg            = stateData.SpotReg      ?? null;
        window.appState.classNames         = stateData.classes      ?? null;
        window.appState.gammaChainAvailable = (
            stateData.Inefficiency != null &&
            Array.isArray(stateData.A_c) &&
            Array.isArray(stateData.eta_bar) &&
            Array.isArray(stateData.sc_mean_expression) &&
            stateData.rSpot != null
        );
        // Theta chain needs everything the gamma chain needs, plus rTheta and
        // SpotReg. Same auto-on behavior, separate silence flag.
        window.appState.thetaChainAvailable = (
            window.appState.gammaChainAvailable &&
            stateData.rTheta != null &&
            stateData.SpotReg != null
        );
        // On by default once each chain feature is available. Power users can
        // silence them from DevTools:
        //   window.appState.debugGammaChain = false
        //   window.appState.debugThetaChain = false
        if (window.appState.debugGammaChain === undefined) {
            window.appState.debugGammaChain = true;
        }
        if (window.appState.debugThetaChain === undefined) {
            window.appState.debugThetaChain = true;
        }

        if (notify) {
            showNotification('check_cell connected (' + state.checkCellClasses.length + ' classes)', 'success');
        }
        console.log('check_cell enabled. Classes:', state.checkCellClasses.length,
                    'gammaChainAvailable=', window.appState.gammaChainAvailable,
                    'thetaChainAvailable=', window.appState.thetaChainAvailable);
    } else {
        state.checkCellConnected = false;
        state.checkCellClasses = [];
        window.appState.labelMap = null;
        window.appState.genePanel = null;
        window.appState.Inefficiency        = null;
        window.appState.A_c                 = null;
        window.appState.eta_bar             = null;
        window.appState.sc_mean_expression  = null;
        window.appState.rSpot               = null;
        window.appState.rTheta              = null;
        window.appState.SpotReg             = null;
        window.appState.classNames          = null;
        window.appState.gammaChainAvailable = false;
        window.appState.thetaChainAvailable = false;
        clearTooltipCache();
        // Only log on the connected -> disconnected transition.
        if (notify && wasConnected) {
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

    // Reset to first tab so UI starts fresh
    activateTab('genes');

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
    const cell = state.cellDataMap ? state.cellDataMap.get(Number(cellLabel)) : null;
    const coordStr = getFormattedCellCoordinates(cell, true);

    if (title) title.innerHTML = 'Cell ' + cellLabel + coordStr;

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
    const colorAssigned = getClassColor(data.assignedClass);
    const colorUser = getClassColor(data.userClass);
    
    // Attach to data object for charts to consume
    data.colorAssigned = colorAssigned;
    data.colorUser = colorUser;

    // Force white text for "Zero" class in the summary header for legibility
    const displayColorAssigned = data.assignedClass === 'Zero' ? '#ffffff' : colorAssigned;
    const displayColorUser = data.userClass === 'Zero' ? '#ffffff' : colorUser;

    const summary = document.getElementById('checkCellSummary');
    if (summary) {
        summary.innerHTML = '<span style="color:' + displayColorAssigned + ';font-weight:600;">' + escapeHtml(data.assignedClass) + '</span>' +
            ' <span style="color:#6b7280;margin:0 8px;">vs</span> ' +
            '<span style="color:' + displayColorUser + ';font-weight:600;">' + escapeHtml(data.userClass) + '</span>';
    }

    // Tab 1 (Genes): D3 diverging bar chart of top gene contributions.
    const plotContainer = document.getElementById('checkCellPlot');
    if (plotContainer) {
        renderDivergingChart(plotContainer, data);
    }

    // Tab 2 (Posterior): log-posterior components + posterior probabilities.
    const componentsContainer = document.getElementById('checkCellComponentsChart');
    if (componentsContainer) {
        renderComponentsChart(componentsContainer, data);
    }
    const posteriorContainer = document.getElementById('checkCellPosteriorChart');
    if (posteriorContainer) {
        renderPosteriorChart(posteriorContainer, data);
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

function activateTab(tabName) {
    document.querySelectorAll('.check-cell-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.check-cell-tab-panel').forEach(panel => {
        const match = panel.dataset.tab === tabName;
        panel.classList.toggle('active', match);
        panel.hidden = !match;
    });
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
