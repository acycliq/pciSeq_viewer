/**
 * check_cell Bridge Module
 *
 * Provides cell type comparison diagnostics using pre-computed binary data.
 * No Python server required - data is read directly from binary files.
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
        disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    const btn = document.getElementById('checkCellConnectBtn');
    const icon = document.getElementById('checkCellConnectIcon');

    // Load binary data via Electron IPC
    if (window.electronAPI && window.electronAPI.loadCheckCellData) {
        const result = await window.electronAPI.loadCheckCellData();
        if (!result.success) {
            showNotification(result.error || 'Failed to load check_cell data', 'error');
            console.warn('check_cell load failed:', result.error);
            return;
        }

        state.checkCellConnected = true;
        state.checkCellClasses = result.classes || [];

        if (icon) icon.textContent = '\u25CF'; // filled circle
        if (btn) btn.classList.add('check-cell-connected');

        showNotification('Connected (' + state.checkCellClasses.length + ' classes)', 'success');
        console.log('check_cell data loaded. Classes:', state.checkCellClasses.length);
    } else {
        showNotification('check_cell requires Electron app', 'error');
    }
}

function disconnect() {
    state.checkCellConnected = false;
    state.checkCellClasses = [];

    const btn = document.getElementById('checkCellConnectBtn');
    const icon = document.getElementById('checkCellConnectIcon');
    if (icon) icon.textContent = '\u25CB'; // hollow circle
    if (btn) btn.classList.remove('check-cell-connected');

    console.log('check_cell disconnected');
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
        // Query via Electron IPC (binary file read + computation)
        const result = await window.electronAPI.checkCellQuery({
            cellId: Number(cellLabel),
            userClass: userClass,
            topN: 10
        });

        if (!result.success) {
            throw new Error(result.error || 'Query failed');
        }

        renderResults(result);

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

function renderResults(data) {
    // Summary line
    const summary = document.getElementById('checkCellSummary');
    if (summary) {
        summary.textContent = 'pciSeq assigned: ' + (data.assignedClass || '?') +
            ' | Comparing against: ' + (data.userClass || '?');
    }

    // Render bar charts on canvas
    const plotContainer = document.getElementById('checkCellPlot');
    if (plotContainer) {
        // Replace img with canvas if needed
        if (plotContainer.tagName === 'IMG') {
            const canvas = document.createElement('canvas');
            canvas.id = 'checkCellPlot';
            canvas.width = 700;
            canvas.height = 300;
            canvas.style.maxWidth = '100%';
            plotContainer.replaceWith(canvas);
            renderBarCharts(canvas, data);
        } else {
            renderBarCharts(plotContainer, data);
        }
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

function renderBarCharts(canvas, data) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    const padding = { top: 40, bottom: 60, left: 60, right: 20 };
    const chartWidth = (width - padding.left - padding.right - 40) / 2;
    const chartHeight = height - padding.top - padding.bottom;

    // Left chart: Top genes (favoring assigned class)
    drawBarChart(ctx, {
        x: padding.left,
        y: padding.top,
        width: chartWidth,
        height: chartHeight,
        data: data.topData,
        color: '#7dd3fc', // skyblue
        title: `Top ${data.topN} for ${data.assignedClass} (Sum: ${data.topSum.toFixed(2)})`
    });

    // Right chart: Bottom genes (favoring user class)
    drawBarChart(ctx, {
        x: padding.left + chartWidth + 40,
        y: padding.top,
        width: chartWidth,
        height: chartHeight,
        data: data.bottomData,
        color: '#fca5a5', // lightcoral
        title: `Top ${data.topN} for ${data.userClass} (Sum: ${data.bottomSum.toFixed(2)})`
    });
}

function drawBarChart(ctx, opts) {
    const { x, y, width, height, data, color, title } = opts;

    // Find max absolute value for scaling
    const maxVal = Math.max(...data.map(d => Math.abs(d.diff)), 0.001);
    const barWidth = width / data.length - 4;

    // Title
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + width / 2, y - 10);

    // Y-axis
    ctx.strokeStyle = '#4b5563';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + height);
    ctx.stroke();

    // X-axis (at y=0 if we have negative values, otherwise at bottom)
    const hasNegative = data.some(d => d.diff < 0);
    const zeroY = hasNegative ? y + height / 2 : y + height;

    ctx.beginPath();
    ctx.moveTo(x, zeroY);
    ctx.lineTo(x + width, zeroY);
    ctx.stroke();

    // Bars
    ctx.fillStyle = color;
    data.forEach((d, i) => {
        const barX = x + i * (barWidth + 4) + 2;
        const barHeight = (Math.abs(d.diff) / maxVal) * (height / 2 - 10);
        const barY = d.diff >= 0 ? zeroY - barHeight : zeroY;

        ctx.fillRect(barX, barY, barWidth, barHeight);

        // Gene label (rotated)
        ctx.save();
        ctx.fillStyle = '#9ca3af';
        ctx.font = '9px Arial';
        ctx.translate(barX + barWidth / 2, y + height + 8);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillText(d.gene.substring(0, 8), 0, 0);
        ctx.restore();
    });

    // Y-axis labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(maxVal.toFixed(1), x - 5, y + 10);
    if (hasNegative) {
        ctx.fillText('0', x - 5, zeroY + 3);
        ctx.fillText((-maxVal).toFixed(1), x - 5, y + height);
    } else {
        ctx.fillText('0', x - 5, y + height);
    }
}

function buildExpressionTable(data) {
    const allGenes = [...data.topData, ...data.bottomData];

    let html = '<table><thead><tr>';
    html += '<th>Gene</th>';
    html += '<th>Mean (' + escapeHtml(data.assignedClass) + ')</th>';
    html += '<th>Mean (' + escapeHtml(data.userClass) + ')</th>';
    html += '<th>This Cell</th>';
    html += '</tr></thead><tbody>';

    allGenes.forEach(g => {
        html += '<tr>';
        html += '<td>' + escapeHtml(g.gene) + '</td>';
        html += '<td>' + g.meanAssigned.toFixed(3) + '</td>';
        html += '<td>' + g.meanUser.toFixed(3) + '</td>';
        html += '<td>' + g.geneCount.toFixed(3) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
}

function buildContributionTable(data) {
    const allGenes = [...data.topData, ...data.bottomData];

    let html = '<table><thead><tr>';
    html += '<th>Gene</th>';
    html += '<th>Log-Likelihood Diff</th>';
    html += '</tr></thead><tbody>';

    allGenes.forEach(g => {
        html += '<tr>';
        html += '<td>' + escapeHtml(g.gene) + '</td>';
        html += '<td>' + g.diff.toFixed(3) + '</td>';
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
