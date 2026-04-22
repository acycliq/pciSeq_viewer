/**
 * Check Cell Charts Module
 * Handles D3.js rendering and table generation for the Cell Inspector
 */

// --- Shared helpers ---

export function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max - 2) + '...' : str;
}

// Lazily create one tooltip shared across all charts, so any chart can render
// first without an ordering dependency on another.
function getOrCreateTooltip() {
    const d3 = window.d3;
    let tooltip = d3.select('#checkCellTooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('id', 'checkCellTooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(17, 24, 39, 0.75)')
            .style('backdrop-filter', 'blur(8px)')
            .style('-webkit-backdrop-filter', 'blur(8px)')
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
    return tooltip;
}

function renderMessage(container, color, text) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:' + color + ';">' + text + '</div>';
}

function drawGridlines(g, y, chartWidth) {
    g.append('g')
        .selectAll('line')
        .data(y.ticks(5))
        .enter()
        .append('line')
        .attr('x1', 0).attr('x2', chartWidth)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', '#374151')
        .attr('stroke-dasharray', '2,2')
        .attr('opacity', 0.4);
}

function drawZeroLine(g, y, yMin, yMax, chartWidth) {
    if (yMin < 0 && yMax > 0) {
        g.append('line')
            .attr('x1', 0).attr('x2', chartWidth)
            .attr('y1', y(0)).attr('y2', y(0))
            .attr('stroke', '#6b7280').attr('stroke-width', 1);
    }
}

function drawYAxisLabel(svg, text, margin, chartHeight) {
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + chartHeight / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '12px')
        .text(text);
}

// Wire up standard hover interactions on a bar selection: fade + show tooltip
// on mouseover, follow pointer on mousemove, restore on mouseout.
function attachBarHover(selection, tooltip, htmlFn) {
    const d3 = window.d3;
    selection
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).transition().duration(150).attr('fill-opacity', 0.8);
            tooltip.html(htmlFn(d))
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
            d3.select(this).transition().duration(150).attr('fill-opacity', 1);
            tooltip.style('opacity', 0);
        });
}

// --- Charts ---

/**
 * Render two stacked bar charts (top/bottom gene contributions) using D3.js.
 */
export function renderDivergingChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        renderMessage(container, '#fb7185', 'D3.js not loaded');
        return;
    }

    container.innerHTML = '';
    const tooltip = getOrCreateTooltip();

    const wrapper = d3.select(container)
        .append('div')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('gap', '20px')
        .style('width', '100%');

    const topDiv = wrapper.append('div').style('width', '100%');
    renderSingleBarChart(topDiv, {
        data: data.topData,
        title: 'Top ' + data.topN + ' contr for class: ' + data.assignedClass,
        subtitle: '(Sum: ' + data.topSum.toFixed(2) + ')',
        color: data.colorAssigned || '#38bdf8',
        tooltip: tooltip
    });

    const bottomDiv = wrapper.append('div').style('width', '100%');
    renderSingleBarChart(bottomDiv, {
        data: data.bottomData,
        title: 'Top ' + data.topN + ' contr for class: ' + data.userClass,
        subtitle: '(Sum: ' + data.bottomSum.toFixed(2) + ')',
        color: data.colorUser || '#fb7185',
        tooltip: tooltip
    });
}

function renderSingleBarChart(container, opts) {
    const { data, title, subtitle, color, tooltip } = opts;
    const d3 = window.d3;

    const containerNode = container.node();
    const width = Math.max(containerNode.clientWidth || 0, 400);
    const height = 300;
    const margin = { top: 50, right: 20, bottom: 70, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 16)
        .attr('text-anchor', 'middle')
        .style('fill', '#e5e7eb')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .text(truncate(title, 50));

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 32)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '13px')
        .text(subtitle);

    const g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

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

    const yAxis = d3.axisLeft(y).ticks(5);
    g.append('g')
        .attr('class', 'y-axis')
        .call(yAxis)
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '11px');

    g.selectAll('.y-axis line').attr('stroke', '#4b5563');
    g.selectAll('.y-axis path').attr('stroke', 'none');

    drawGridlines(g, y, chartWidth);
    drawZeroLine(g, y, yMin, yMax, chartWidth);

    const bars = g.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('rx', 2)
        .attr('class', 'bar')
        .attr('x', d => x(d.gene))
        .attr('y', d => d.diff >= 0 ? y(d.diff) : y(0))
        .attr('width', x.bandwidth())
        .attr('height', d => Math.abs(y(d.diff) - y(0)))
        .attr('fill', color)
        .attr('stroke', 'rgba(255,255,255,0.4)')
        .attr('stroke-width', 1);

    attachBarHover(bars, tooltip, d =>
        '<div style="font-weight:600;">' + escapeHtml(d.gene) + '</div>' +
        '<div>' + d.diff.toFixed(3) + '</div>'
    );

    g.selectAll('.gene-label')
        .data(data)
        .enter()
        .append('text')
        .attr('class', 'gene-label')
        .attr('x', d => x(d.gene) + x.bandwidth() / 2)
        .attr('y', chartHeight + 10)
        .attr('text-anchor', 'end')
        .attr('transform', d => 'rotate(-45,' + (x(d.gene) + x.bandwidth() / 2) + ',' + (chartHeight + 10) + ')')
        .style('fill', '#d1d5db')
        .style('font-size', '12px')
        .text(d => d.gene);

    drawYAxisLabel(svg, 'Log-Likelihood Difference', margin, chartHeight);
}

export function buildExpressionTable(data) {
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
    setTimeout(() => initSortableTable(tableId), 10);
    return html;
}

export function buildContributionTable(data) {
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

    const currentDir = header.dataset.sortDir || 'none';
    const newDir = currentDir === 'asc' ? 'desc' : 'asc';

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

/**
 * Grouped bar chart of the three log-posterior components
 * (Gene LogLik / Log Prior / MRF) for the two classes.
 */
export function renderComponentsChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        renderMessage(container, '#fb7185', 'D3.js not loaded');
        return;
    }
    container.innerHTML = '';

    const c = data.components || {};
    const anyMissing = [c.geneLoglikAssigned, c.geneLoglikUser, c.logPriorAssigned, c.logPriorUser, c.mrfAssigned, c.mrfUser]
        .some(v => v === null || v === undefined || Number.isNaN(v));
    if (anyMissing) {
        renderMessage(container, '#9ca3af', 'Log-posterior components unavailable. Regenerate diagnostics.db with an updated pciSeq run to enable this view.');
        return;
    }

    const groups = [
        { label: 'Gene LogLik', assigned: c.geneLoglikAssigned, user: c.geneLoglikUser },
        { label: 'Log Prior',   assigned: c.logPriorAssigned,   user: c.logPriorUser },
        { label: 'MRF',         assigned: c.mrfAssigned,        user: c.mrfUser }
    ];

    const containerNode = container.node ? container.node() : container;
    const width = Math.max(containerNode.clientWidth || 0, 400);
    const height = 300;
    const margin = { top: 50, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const x0 = d3.scaleBand()
        .domain(groups.map(d => d.label))
        .range([0, chartWidth])
        .padding(0.25);

    const x1 = d3.scaleBand()
        .domain(['assigned', 'user'])
        .range([0, x0.bandwidth()])
        .padding(0.1);

    const allVals = groups.flatMap(d => [d.assigned, d.user]);
    const vMin = d3.min(allVals);
    const vMax = d3.max(allVals);
    const yMin = Math.min(0, vMin * 1.1);
    const yMax = Math.max(0, vMax * 1.1);

    const y = d3.scaleLinear()
        .domain([yMin, yMax])
        .nice()
        .range([chartHeight, 0]);

    drawGridlines(g, y, chartWidth);

    const yAxis = d3.axisLeft(y).ticks(5);
    g.append('g').call(yAxis)
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '11px');
    g.selectAll('.domain').attr('stroke', 'none');
    g.selectAll('.tick line').attr('stroke', '#374151').attr('opacity', 0.4);

    drawZeroLine(g, y, yMin, yMax, chartWidth);

    const tooltip = getOrCreateTooltip();
    const colorAssigned = data.colorAssigned || '#38bdf8';
    const colorUser = data.colorUser || '#fb7185';

    const series = [
        { key: 'assigned', color: colorAssigned, label: data.assignedClass },
        { key: 'user',     color: colorUser,     label: data.userClass }
    ];

    series.forEach(s => {
        const bars = g.selectAll('.bar-' + s.key)
            .data(groups)
            .enter()
            .append('rect')
            .attr('rx', 2)
            .attr('x', d => x0(d.label) + x1(s.key))
            .attr('y', d => d[s.key] >= 0 ? y(d[s.key]) : y(0))
            .attr('width', x1.bandwidth())
            .attr('height', d => Math.abs(y(d[s.key]) - y(0)))
            .attr('class', 'bar-' + s.key)
            .attr('fill', s.color)
            .attr('stroke', 'rgba(255,255,255,0.3)')
            .attr('stroke-width', 1);

        attachBarHover(bars, tooltip, d =>
            '<div style="font-weight:600;">' + escapeHtml(d.label) + ' (' + escapeHtml(s.label) + ')</div>' +
            '<div>' + d[s.key].toFixed(3) + '</div>'
        );
    });

    g.append('g')
        .attr('transform', 'translate(0,' + chartHeight + ')')
        .call(d3.axisBottom(x0))
        .selectAll('text')
        .style('fill', '#d1d5db')
        .style('font-size', '12px');
    g.selectAll('.domain').attr('stroke', 'none');
    g.selectAll('.tick line').attr('stroke', '#374151').attr('opacity', 0.4);

    drawYAxisLabel(svg, 'Log-scale value', margin, chartHeight);
}

/**
 * Two-bar chart of full posterior probabilities for the two classes of interest.
 * Matches the bottom-right panel of the Python check_cell figure.
 */
export function renderPosteriorChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        renderMessage(container, '#fb7185', 'D3.js not loaded');
        return;
    }
    container.innerHTML = '';

    if (data.posteriorAssigned === null || data.posteriorUser === null
        || data.posteriorAssigned === undefined || data.posteriorUser === undefined) {
        renderMessage(container, '#9ca3af', 'Posterior probabilities unavailable. Regenerate diagnostics.db with an updated pciSeq run to enable this view.');
        return;
    }

    const tooltip = getOrCreateTooltip();

    const rows = [
        { label: data.assignedClass, value: data.posteriorAssigned * 100, color: data.colorAssigned || '#38bdf8' },
        { label: data.userClass,     value: data.posteriorUser * 100,     color: data.colorUser || '#fb7185' }
    ];

    const containerNode = container.node ? container.node() : container;
    const width = Math.max(containerNode.clientWidth || 0, 400);
    const height = 280;
    const margin = { top: 50, right: 20, bottom: 70, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    const g = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const maxVal = Math.max(d3.max(rows, d => d.value) || 0, 1);
    const yMax = Math.min(100, Math.ceil(maxVal * 1.15));

    const x = d3.scaleBand()
        .domain(rows.map(d => d.label))
        .range([0, chartWidth])
        .padding(0.3);

    const y = d3.scaleLinear()
        .domain([0, yMax])
        .range([chartHeight, 0]);

    drawGridlines(g, y, chartWidth);

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(v => v + '%'))
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '11px');
    g.selectAll('.domain').attr('stroke', 'none');
    g.selectAll('.tick line').attr('stroke', '#374151').attr('opacity', 0.4);

    const bars = g.selectAll('.bar')
        .data(rows)
        .enter()
        .append('rect')
        .attr('rx', 2)
        .attr('x', d => x(d.label))
        .attr('y', d => y(d.value))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.value))
        .attr('class', 'bar')
        .attr('fill', d => d.color)
        .attr('stroke', 'rgba(255,255,255,0.3)')
        .attr('stroke-width', 1);

    attachBarHover(bars, tooltip, d =>
        '<div style="font-weight:600;">' + escapeHtml(d.label) + '</div>' +
        '<div>' + d.value.toFixed(1) + '%</div>'
    );

    g.selectAll('.value-label')
        .data(rows)
        .enter()
        .append('text')
        .attr('x', d => x(d.label) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 6)
        .attr('text-anchor', 'middle')
        .style('fill', '#e5e7eb')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .text(d => d.value.toFixed(1) + '%');

    g.selectAll('.cat-label')
        .data(rows)
        .enter()
        .append('text')
        .attr('x', d => x(d.label) + x.bandwidth() / 2)
        .attr('y', chartHeight + 18)
        .attr('text-anchor', 'middle')
        .style('fill', '#d1d5db')
        .style('font-size', '12px')
        .text(d => truncate(d.label, 22));

    drawYAxisLabel(svg, 'Posterior Probability (%)', margin, chartHeight);
}