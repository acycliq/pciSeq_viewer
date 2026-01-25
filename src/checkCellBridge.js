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
            '<span style="color:#c65d57;font-weight:600;">' + escapeHtml(data.userClass) + '</span>';
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

/**
 * Render two side-by-side bar charts using D3.js
 * Left chart: Top genes favoring assigned class
 * Right chart: Top genes favoring user class
 */
function renderDivergingChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444;">D3.js not loaded</div>';
        return;
    }

    // Clear previous content
    container.innerHTML = '';

    // Create tooltip (reuse if exists)
    let tooltip = d3.select('#checkCellTooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('id', 'checkCellTooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(17, 24, 39, 0.95)')
            .style('border', '1px solid #374151')
            .style('border-radius', '6px')
            .style('padding', '10px 14px')
            .style('font-size', '12px')
            .style('color', '#e5e7eb')
            .style('pointer-events', 'none')
            .style('z-index', '10002')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.4)')
            .style('opacity', 0);
    }

    // Container for two charts side by side
    const wrapper = d3.select(container)
        .append('div')
        .style('display', 'flex')
        .style('gap', '20px')
        .style('width', '100%');

    // Left chart: genes favoring assigned class (positive diff)
    const leftDiv = wrapper.append('div').style('flex', '1');
    renderSingleBarChart(leftDiv, {
        data: data.topData,
        title: 'Top ' + data.topN + ' contr for class: ' + data.assignedClass,
        subtitle: '(Sum: ' + data.topSum.toFixed(2) + ')',
        color: '#87CEEB',  // skyblue
        tooltip: tooltip,
        fullData: data
    });

    // Right chart: genes favoring user class (negative diff)
    const rightDiv = wrapper.append('div').style('flex', '1');
    renderSingleBarChart(rightDiv, {
        data: data.bottomData,
        title: 'Top ' + data.topN + ' contr for class: ' + data.userClass,
        subtitle: '(Sum: ' + data.bottomSum.toFixed(2) + ')',
        color: '#c65d57',  // Moderate red
        tooltip: tooltip,
        fullData: data
    });
}

function renderSingleBarChart(container, opts) {
    const { data, title, subtitle, color, tooltip, fullData } = opts;
    const d3 = window.d3;

    const margin = { top: 50, right: 20, bottom: 70, left: 60 };
    const width = 340;
    const height = 300;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);

    // Title
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .style('fill', '#e5e7eb')
        .style('font-size', '11px')
        .style('font-weight', '500')
        .text(truncate(title, 50));

    // Subtitle (sum)
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 32)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '10px')
        .text(subtitle);

    const g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // Scales - handle both positive and negative values
    const minVal = d3.min(data, d => d.diff) || 0;
    const maxVal = d3.max(data, d => d.diff) || 0;
    const yMin = Math.min(0, minVal * 1.1);
    const yMax = Math.max(0, maxVal * 1.1);

    const x = d3.scaleBand()
        .domain(data.map(d => d.gene))
        .range([0, chartWidth])
        .padding(0.15);

    const y = d3.scaleLinear()
        .domain([yMin, yMax])
        .range([chartHeight, 0]);

    // Y-axis with gridlines
    const yAxis = d3.axisLeft(y).ticks(5);
    g.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '9px');

    g.selectAll('.y-axis line').attr('stroke', '#4b5563');
    g.selectAll('.y-axis path').attr('stroke', '#4b5563');

    // Gridlines
    g.append('g')
        .selectAll('line')
        .data(y.ticks(5))
        .enter()
        .append('line')
        .attr('x1', 0)
        .attr('x2', chartWidth)
        .attr('y1', d => y(d))
        .attr('y2', d => y(d))
        .attr('stroke', '#374151')
        .attr('stroke-dasharray', '2,2');

    // Zero line if we have both positive and negative values
    if (yMin < 0 && yMax > 0) {
        g.append('line')
            .attr('x1', 0)
            .attr('x2', chartWidth)
            .attr('y1', y(0))
            .attr('y2', y(0))
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1);
    }

    // Bars - handle positive (up from zero) and negative (down from zero)
    g.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.gene))
        .attr('y', d => d.diff >= 0 ? y(d.diff) : y(0))
        .attr('width', x.bandwidth())
        .attr('height', d => Math.abs(y(d.diff) - y(0)))
        .attr('fill', color)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('fill-opacity', 0.7);
            tooltip.html(
                '<div style="font-weight:600;">' + escapeHtml(d.gene) + '</div>' +
                '<div>' + d.diff.toFixed(3) + '</div>'
            )
            .style('left', (event.pageX + 12) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .style('opacity', 1);
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', (event.pageX + 12) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('fill-opacity', 1);
            tooltip.style('opacity', 0);
        });

    // Gene labels (rotated)
    g.selectAll('.gene-label')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'gene-label')
        .attr('x', d => x(d.gene) + x.bandwidth() / 2)
        .attr('y', chartHeight + 8)
        .attr('text-anchor', 'end')
        .attr('transform', d => 'rotate(-45,' + (x(d.gene) + x.bandwidth() / 2) + ',' + (chartHeight + 8) + ')')
        .style('fill', '#d1d5db')
        .style('font-size', '9px')
        .text(d => d.gene);

    // Y-axis label
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + chartHeight / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '10px')
        .text('Log-Likelihood Difference');
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max - 2) + '...' : str;
}

function buildExpressionTable(data) {
    // Use allData (all genes sorted by diff) if available, otherwise fall back to top+bottom
    const allGenes = data.allData || [...data.topData, ...data.bottomData];
    const tableId = 'exprTable_' + Date.now();

    let html = '<table id="' + tableId + '" class="sortable-table"><thead><tr>';
    html += '<th data-sort="string">Gene</th>';
    html += '<th data-sort="number">Mean counts<br><small>across all cells that pciSeq typed as<br>' + escapeHtml(data.assignedClass) + '</small></th>';
    html += '<th data-sort="number">Mean counts<br><small>across all cells that pciSeq typed as<br>' + escapeHtml(data.userClass) + '</small></th>';
    html += '<th data-sort="number">This Cell</th>';
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

    // Initialize sorting after a brief delay to ensure DOM is ready
    setTimeout(() => initSortableTable(tableId), 10);

    return html;
}

function buildContributionTable(data) {
    // Use allData (all genes sorted by diff) if available, otherwise fall back to top+bottom
    const allGenes = data.allData || [...data.topData, ...data.bottomData];
    const tableId = 'contrTable_' + Date.now();

    let html = '<table id="' + tableId + '" class="sortable-table"><thead><tr>';
    html += '<th data-sort="string">Gene</th>';
    html += '<th data-sort="number">Log-lik<br><small>' + escapeHtml(data.assignedClass) + '</small></th>';
    html += '<th data-sort="number">Log-lik<br><small>' + escapeHtml(data.userClass) + '</small></th>';
    html += '<th data-sort="number">Diff</th>';
    html += '</tr></thead><tbody>';

    allGenes.forEach(g => {
        const contrAssigned = g.contrAssigned !== undefined ? g.contrAssigned.toFixed(3) : '-';
        const contrUser = g.contrUser !== undefined ? g.contrUser.toFixed(3) : '-';
        html += '<tr>';
        html += '<td>' + escapeHtml(g.gene) + '</td>';
        html += '<td>' + contrAssigned + '</td>';
        html += '<td>' + contrUser + '</td>';
        html += '<td>' + g.diff.toFixed(3) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';

    // Initialize sorting after a brief delay to ensure DOM is ready
    setTimeout(() => initSortableTable(tableId), 10);

    return html;
}

function initSortableTable(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const headers = table.querySelectorAll('th[data-sort]');
    headers.forEach((header, colIndex) => {
        header.style.cursor = 'pointer';
        header.title = 'Click to sort';
        header.addEventListener('click', () => {
            sortTable(table, colIndex, header.dataset.sort);
        });
    });
}

function sortTable(table, colIndex, sortType) {
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const header = table.querySelectorAll('th')[colIndex];

    // Determine sort direction
    const currentDir = header.dataset.sortDir || 'none';
    const newDir = currentDir === 'asc' ? 'desc' : 'asc';

    // Clear other headers' sort indicators
    table.querySelectorAll('th').forEach(th => {
        th.dataset.sortDir = 'none';
        th.classList.remove('sort-asc', 'sort-desc');
    });

    header.dataset.sortDir = newDir;
    header.classList.add(newDir === 'asc' ? 'sort-asc' : 'sort-desc');

    rows.sort((a, b) => {
        const aVal = a.cells[colIndex].textContent.trim();
        const bVal = b.cells[colIndex].textContent.trim();

        let comparison;
        if (sortType === 'number') {
            const aNum = parseFloat(aVal) || 0;
            const bNum = parseFloat(bVal) || 0;
            comparison = aNum - bNum;
        } else {
            comparison = aVal.localeCompare(bVal);
        }

        return newDir === 'asc' ? comparison : -comparison;
    });

    rows.forEach(row => tbody.appendChild(row));
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
