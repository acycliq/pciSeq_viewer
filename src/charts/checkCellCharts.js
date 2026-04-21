/**
 * Check Cell Charts Module
 * Handles D3.js rendering and table generation for the Cell Inspector
 */

/**
 * Render two side-by-side bar charts using D3.js
 */
export function renderDivergingChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#db5c5c;">D3.js not loaded</div>';
        return;
    }

    container.innerHTML = '';

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
        color: '#87CEEB',
        tooltip: tooltip,
        fullData: data
    });

    const bottomDiv = wrapper.append('div').style('width', '100%');
    renderSingleBarChart(bottomDiv, {
        data: data.bottomData,
        title: 'Top ' + data.topN + ' contr for class: ' + data.userClass,
        subtitle: '(Sum: ' + data.bottomSum.toFixed(2) + ')',
        color: '#db5c5c',
        tooltip: tooltip,
        fullData: data
    });
}

function renderSingleBarChart(container, opts) {
    const { data, title, subtitle, color, tooltip } = opts;
    const d3 = window.d3;

    const containerNode = container.node();
    const width = containerNode ? containerNode.clientWidth : 400;
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
    g.selectAll('.y-axis path').attr('stroke', '#4b5563');

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

    if (yMin < 0 && yMax > 0) {
        g.append('line')
            .attr('x1', 0)
            .attr('x2', chartWidth)
            .attr('y1', y(0))
            .attr('y2', y(0))
            .attr('stroke', '#6b7280')
            .attr('stroke-width', 1);
    }

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

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + chartHeight / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '12px')
        .text('Log-Likelihood Difference');
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max - 2) + '...' : str;
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

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Grouped bar chart of the three log-posterior components
 * (Gene LogLik / Log Prior / MRF) for the two classes.
 */
export function renderComponentsChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#db5c5c;">D3.js not loaded</div>';
        return;
    }
    container.innerHTML = '';

    const c = data.components || {};
    const anyMissing = [c.geneLoglikAssigned, c.geneLoglikUser, c.logPriorAssigned, c.logPriorUser, c.mrfAssigned, c.mrfUser]
        .some(v => v === null || v === undefined || Number.isNaN(v));
    if (anyMissing) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">Log-posterior components unavailable. Regenerate diagnostics.db with an updated pciSeq run to enable this view.</div>';
        return;
    }

    const groups = [
        { label: 'Gene LogLik', assigned: c.geneLoglikAssigned, user: c.geneLoglikUser },
        { label: 'Log Prior',   assigned: c.logPriorAssigned,   user: c.logPriorUser },
        { label: 'MRF',         assigned: c.mrfAssigned,        user: c.mrfUser }
    ];

    const containerNode = container.node ? container.node() : container;
    const width = containerNode.clientWidth || 400;
    const height = 300;
    const margin = { top: 50, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .style('fill', '#e5e7eb')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .text('Cell: ' + data.cellId + ' - Log-posterior components');

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

    const yAxis = d3.axisLeft(y).ticks(5);
    g.append('g').call(yAxis)
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '11px');
    g.selectAll('.domain, .tick line').attr('stroke', '#4b5563');

    if (yMin < 0 && yMax > 0) {
        g.append('line')
            .attr('x1', 0).attr('x2', chartWidth)
            .attr('y1', y(0)).attr('y2', y(0))
            .attr('stroke', '#6b7280').attr('stroke-width', 1);
    }

    const colorAssigned = '#87CEEB';
    const colorUser = '#db5c5c';

    const series = [
        { key: 'assigned', color: colorAssigned, label: data.assignedClass },
        { key: 'user',     color: colorUser,     label: data.userClass }
    ];

    series.forEach(s => {
        g.selectAll('.bar-' + s.key)
            .data(groups)
            .enter()
            .append('rect')
            .attr('x', d => x0(d.label) + x1(s.key))
            .attr('y', d => d[s.key] >= 0 ? y(d[s.key]) : y(0))
            .attr('width', x1.bandwidth())
            .attr('height', d => Math.abs(y(d[s.key]) - y(0)))
            .attr('fill', s.color);
    });

    g.append('g')
        .attr('transform', 'translate(0,' + chartHeight + ')')
        .call(d3.axisBottom(x0))
        .selectAll('text')
        .style('fill', '#d1d5db')
        .style('font-size', '12px');
    g.selectAll('.domain, .tick line').attr('stroke', '#4b5563');

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + chartHeight / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '12px')
        .text('Log-scale value');
}

/**
 * Two-bar chart of full posterior probabilities for the two classes of interest.
 * Matches the bottom-right panel of the Python check_cell figure.
 */
export function renderPosteriorChart(container, data) {
    const d3 = window.d3;
    if (!d3) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#db5c5c;">D3.js not loaded</div>';
        return;
    }
    container.innerHTML = '';

    if (data.posteriorAssigned === null || data.posteriorUser === null
        || data.posteriorAssigned === undefined || data.posteriorUser === undefined) {
        container.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;">Posterior probabilities unavailable. Regenerate diagnostics.db with an updated pciSeq run to enable this view.</div>';
        return;
    }

    const rows = [
        { label: data.assignedClass, value: data.posteriorAssigned * 100, color: '#87CEEB' },
        { label: data.userClass,     value: data.posteriorUser * 100,     color: '#db5c5c' }
    ];

    const containerNode = container.node ? container.node() : container;
    const width = containerNode.clientWidth || 400;
    const height = 280;
    const margin = { top: 50, right: 20, bottom: 70, left: 60 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width', width)
        .attr('height', height);

    svg.append('text')
        .attr('x', width / 2)
        .attr('y', 20)
        .attr('text-anchor', 'middle')
        .style('fill', '#e5e7eb')
        .style('font-size', '14px')
        .style('font-weight', '500')
        .text('Cell: ' + data.cellId + ' - Posterior probabilities');

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

    g.append('g')
        .selectAll('line')
        .data(y.ticks(5))
        .enter()
        .append('line')
        .attr('x1', 0).attr('x2', chartWidth)
        .attr('y1', d => y(d)).attr('y2', d => y(d))
        .attr('stroke', '#374151').attr('stroke-dasharray', '2,2');

    g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(v => v + '%'))
        .selectAll('text')
        .style('fill', '#9ca3af')
        .style('font-size', '11px');
    g.selectAll('.domain, .tick line').attr('stroke', '#4b5563');

    g.selectAll('.bar')
        .data(rows)
        .enter()
        .append('rect')
        .attr('x', d => x(d.label))
        .attr('y', d => y(d.value))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.value))
        .attr('fill', d => d.color);

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

    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + chartHeight / 2))
        .attr('y', 14)
        .attr('text-anchor', 'middle')
        .style('fill', '#9ca3af')
        .style('font-size', '12px')
        .text('Posterior Probability (%)');
}
