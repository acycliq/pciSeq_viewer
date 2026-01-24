/**
 * check_cell Bridge Module
 *
 * Connects the viewer to a local pciSeq check_cell server (localhost:8765).
 * Provides: Connect button toggle, Ctrl+click modal, and results display.
 */

import { state } from './state/stateManager.js';

// --- Connection ---

/**
 * Setup the Connect button and modal event listeners.
 * Call once during app initialization.
 */
export function setupCheckCellBridge() {
    const btn = document.getElementById('checkCellConnectBtn');
    if (!btn) return;

    btn.addEventListener('click', toggleConnection);

    // Modal close button
    const closeBtn = document.getElementById('checkCellClose');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Compare button
    const compareBtn = document.getElementById('checkCellCompareBtn');
    if (compareBtn) compareBtn.addEventListener('click', handleCompare);

    // Click outside modal to close
    const modal = document.getElementById('checkCellModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

async function toggleConnection() {
    if (state.checkCellConnected) {
        await disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    const btn = document.getElementById('checkCellConnectBtn');
    const icon = document.getElementById('checkCellConnectIcon');

    // Start the server via Electron (uses stored Python + pickle paths)
    if (window.electronAPI && window.electronAPI.startCheckCellServer) {
        const result = await window.electronAPI.startCheckCellServer();
        if (!result.success) {
            showNotification(result.error || 'Failed to start server', 'error');
            console.warn('check_cell server failed:', result.error);
            return;
        }
        // Update API URL with the configured port
        if (result.port) {
            state.checkCellApiUrl = 'http://127.0.0.1:' + result.port;
        }
        console.log('check_cell server spawned on port', result.port || 8765, ', polling health...');
    }

    // Poll /health until server is ready
    const connected = await pollHealth(10, 1000);
    if (!connected) {
        showNotification('Server not responding. Check pciSeq > check_cell Setup.', 'error');
        if (window.electronAPI && window.electronAPI.stopCheckCellServer) {
            await window.electronAPI.stopCheckCellServer();
        }
        return;
    }

    if (icon) icon.textContent = '\u25CF'; // filled circle
    if (btn) btn.classList.add('check-cell-connected');

    showNotification('Connected (' + state.checkCellClasses.length + ' classes)', 'success');
    console.log('check_cell bridge connected. Classes:', state.checkCellClasses.length);
}

async function pollHealth(retries, intervalMs) {
    for (let i = 0; i < retries; i++) {
        try {
            const resp = await fetch(state.checkCellApiUrl + '/health');
            if (resp.ok) {
                const data = await resp.json();
                state.checkCellConnected = true;
                state.checkCellClasses = data.classes || [];
                return true;
            }
        } catch (_) {
            // Server not ready yet
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
}

async function disconnect() {
    state.checkCellConnected = false;
    state.checkCellClasses = [];

    if (window.electronAPI && window.electronAPI.stopCheckCellServer) {
        await window.electronAPI.stopCheckCellServer();
    }

    const btn = document.getElementById('checkCellConnectBtn');
    const icon = document.getElementById('checkCellConnectIcon');
    if (icon) icon.textContent = '\u25CB'; // hollow circle
    if (btn) btn.classList.remove('check-cell-connected');

    console.log('check_cell bridge disconnected');
}

// --- Modal ---

/**
 * Open the check_cell modal for a given cell.
 * Called by polygonInteractions.js on Ctrl+click.
 */
export function openCheckCellModal(cellLabel) {
    const modal = document.getElementById('checkCellModal');
    if (!modal) return;

    // Reset phases
    const selectPhase = document.getElementById('checkCellSelectPhase');
    const resultsPhase = document.getElementById('checkCellResultsPhase');
    const loading = document.getElementById('checkCellLoading');
    if (selectPhase) selectPhase.style.display = 'block';
    if (resultsPhase) resultsPhase.style.display = 'none';
    if (loading) loading.style.display = 'none';

    // Store current cell label on the modal
    modal.dataset.cellLabel = cellLabel;

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
    if (title) title.textContent = 'check_cell - Cell ' + cellLabel;

    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('checkCellModal');
    if (modal) modal.style.display = 'none';
}

async function handleCompare() {
    const modal = document.getElementById('checkCellModal');
    if (!modal) return;

    const cellLabel = modal.dataset.cellLabel;
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
        const resp = await fetch(state.checkCellApiUrl + '/check_cell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cell_id: Number(cellLabel), user_class: userClass, top_n: 10 })
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData.error || 'Server returned ' + resp.status);
        }

        const data = await resp.json();
        renderResults(data, userClass);

        if (loading) loading.style.display = 'none';
        if (resultsPhase) resultsPhase.style.display = 'block';
    } catch (err) {
        if (loading) loading.style.display = 'none';
        if (selectPhase) selectPhase.style.display = 'block';
        showNotification('check_cell error: ' + err.message, 'error');
        console.error('check_cell query failed:', err);
    }
}

// --- Results Rendering ---

function renderResults(data, userClass) {
    // Summary line
    const summary = document.getElementById('checkCellSummary');
    if (summary) {
        summary.textContent = 'pciSeq assigned: ' + (data.assigned_class || '?') +
            ' | Comparing against: ' + (userClass || '?');
    }

    // Plot image
    const plotImg = document.getElementById('checkCellPlot');
    if (plotImg && data.plot_base64) {
        plotImg.src = 'data:image/png;base64,' + data.plot_base64;
        plotImg.style.display = 'block';
    } else if (plotImg) {
        plotImg.style.display = 'none';
    }

    // Gene expression table
    const exprWrap = document.getElementById('checkCellExprTable');
    if (exprWrap && data.gene_expression) {
        exprWrap.innerHTML = buildTable(data.gene_expression);
    }

    // Contribution table
    const contrWrap = document.getElementById('checkCellContrTable');
    if (contrWrap && data.contribution) {
        contrWrap.innerHTML = buildTable(data.contribution);
    }
}

function buildTable(df) {
    // df has {columns, index, data} (pandas orient='split' format)
    if (!df || !df.columns || !df.data) return '';

    let html = '<table><thead><tr><th></th>';
    df.columns.forEach(col => { html += '<th>' + escapeHtml(String(col)) + '</th>'; });
    html += '</tr></thead><tbody>';

    df.data.forEach((row, i) => {
        const label = df.index ? df.index[i] : i;
        html += '<tr><td>' + escapeHtml(String(label)) + '</td>';
        row.forEach(val => {
            const display = typeof val === 'number' ? val.toFixed(3) : String(val);
            html += '<td>' + escapeHtml(display) + '</td>';
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
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

function showNotification(message, type) {
    let notification = document.getElementById('check-cell-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'check-cell-notification';
        notification.style.cssText = `
            position: fixed;
            top: 50px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 13px;
            z-index: 10001;
            max-width: 400px;
            transition: opacity 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    const colors = {
        error: 'rgba(220, 53, 69, 0.9)',
        info: 'rgba(59, 130, 246, 0.9)',
        success: 'rgba(34, 139, 34, 0.9)'
    };
    notification.style.background = colors[type] || colors.success;
    notification.style.opacity = '1';

    setTimeout(() => { notification.style.opacity = '0'; }, 4000);
}