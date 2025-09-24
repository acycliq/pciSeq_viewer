/**
 * Cell Class Percentage Chart Module
 *
 * Creates interactive bar charts showing overall cell class percentages
 * Translates Python counts_per_class_chart functionality to JavaScript
 */

import { state } from './stateManager.js';

// Chart widget elements
let chartElements = null;
let lastPercentageData = null;
let resizeObserver = null;
let resizeRafId = null;
let dragInitDone = false;
let tooltipEl = null;

// Initialize chart elements
function initChartElements() {
    if (chartElements) return chartElements;

    chartElements = {
        widget: document.getElementById('cellClassPercentageWidget'),
        backdrop: document.getElementById('cellClassPercentageWidgetBackdrop'),
        chart: document.getElementById('cellClassPercentageChart'),
        regionSelect: document.getElementById('classPercentageRegionSelect'),
        closeBtn: document.getElementById('cellClassPercentageWidgetClose'),
        undockBtn: document.getElementById('cellClassPercentageWidgetUndock')
    };

    return chartElements;
}

// Tooltip helpers
function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.background = 'rgba(0, 0, 0, 0.8)';
    tooltipEl.style.color = 'white';
    tooltipEl.style.padding = '8px';
    tooltipEl.style.borderRadius = '4px';
    tooltipEl.style.fontSize = '12px';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.zIndex = '10000';
    tooltipEl.style.opacity = '0';
    tooltipEl.style.transition = 'opacity 0.15s ease';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

function showTooltip(x, y, content) {
    const tooltip = ensureTooltip();
    tooltip.innerHTML = content;
    tooltip.style.left = x + 10 + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.opacity = '1';
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.style.opacity = '0';
}

/**
 * Calculate cell class percentages for a region (translates Python logic)
 * @param {Array} regions - Array of polygon regions
 * @returns {Object} - Cell class percentage data
 */
function calculateCellClassPercentages(regions) {
    if (!state.cellDataMap || state.cellDataMap.size === 0) {
        console.warn('No cell data available');
        return { classData: [], totalCells: 0 };
    }

    // Find cells within regions
    const cellsInRegions = [];

    // Helper: point in polygon (ray casting) - copied from working chart
    function pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function isInsideAnyRegion(x, y) {
        if (!regions || regions.length === 0) return true;
        for (const poly of regions) {
            if (pointInPolygon(x, y, poly)) return true;
        }
        return false;
    }

    for (const [cellId, cell] of state.cellDataMap) {
        if (!cell.position) return;

        const cx = cell.position.x;
        const cy = cell.position.y;
        const cellClass = cell.primaryClass || 'Unknown';

        // Region filter (using same coordinates as working chart)
        if (isInsideAnyRegion(cx, cy)) {
            cellsInRegions.push(cellClass);
        }
    }

    if (cellsInRegions.length === 0) {
        console.warn('No cells found in selected region');
        return { classData: [], totalCells: 0 };
    }

    // Count occurrences of each class (like Python value_counts())
    const classCounts = {};
    cellsInRegions.forEach(className => {
        classCounts[className] = (classCounts[className] || 0) + 1;
    });

    // Convert to array and sort by count descending (like Python sort_values(ascending=False))
    const classData = Object.entries(classCounts)
        .map(([className, count]) => ({
            className,
            count,
            percentage: (count / cellsInRegions.length) * 100
        }))
        .sort((a, b) => b.count - a.count);

    return {
        classData,
        totalCells: cellsInRegions.length
    };
}

/**
 * Create percentage bar chart (translates Plotly Express bar chart)
 */
function createPercentageBarChart(data) {
    const els = initChartElements();
    const container = els.chart;

    // Clear previous chart
    container.innerHTML = '';

    if (!data || !data.classData || data.classData.length === 0) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">No data to display</div>';
        return;
    }

    // Set up dimensions - extra bottom margin for rotated labels
    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const containerRect = container.getBoundingClientRect();
    const width = Math.max(400, containerRect.width - margin.left - margin.right);
    const height = Math.max(300, containerRect.height - margin.top - margin.bottom);

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Set up scales
    const xScale = d3.scaleBand()
        .domain(data.classData.map(d => d.className))
        .range([0, width])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data.classData, d => d.percentage)])
        .range([height, 0]);

    // Color scale - use same system as working chart
    function rgbString(arr) {
        if (!Array.isArray(arr) || arr.length < 3) return null;
        const [r, g, b] = arr;
        return `rgb(${r}, ${g}, ${b})`;
    }

    function getClassColor(cls) {
        // Explicit handling for Zero and Unknown
        if (cls === 'Zero') return '#000000';
        if (state && state.cellClassColors && state.cellClassColors.has(cls)) {
            const c = state.cellClassColors.get(cls);
            const s = rgbString(c);
            if (s) return s;
        }
        // Fallback gray matches other components' fallback
        return 'rgb(192, 192, 192)';
    }

    const colorScale = d3.scaleOrdinal()
        .domain(data.classData.map(d => d.className))
        .range(data.classData.map(d => getClassColor(d.className)));

    // Create bars
    const bars = g.selectAll('.bar')
        .data(data.classData)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.className))
        .attr('width', xScale.bandwidth())
        .attr('y', d => yScale(d.percentage))
        .attr('height', d => height - yScale(d.percentage))
        .attr('fill', d => getClassColor(d.className))
        .attr('stroke', '#888')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer');

    // Add hover effects
    bars.on('mouseover', function(event, d) {
        // Highlight bar with orange outline
        d3.select(this)
            .attr('stroke-width', 2)
            .attr('stroke', '#ff6b35');
        showTooltip(event.pageX, event.pageY,
            `<strong>${d.className}</strong><br/>` +
            `Count: ${d.count}<br/>` +
            `Percentage: ${d.percentage.toFixed(1)}%`
        );
    })
    .on('mouseout', function() {
        // Reset to normal outline
        d3.select(this)
            .attr('stroke-width', 0.5)
            .attr('stroke', '#888');
        hideTooltip();
    });

    // Add X axis
    g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScale))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');

    // Add Y axis
    g.append('g')
        .call(d3.axisLeft(yScale));

    // Add axis labels
    g.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (height / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Percentage (%)');

    g.append('text')
        .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 10})`)
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Cell Class');

    // Add title
    svg.append('text')
        .attr('x', (width + margin.left + margin.right) / 2)
        .attr('y', margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text(`Cell Class Distribution (${data.totalCells} cells)`);
}

/**
 * Show cell class percentage widget
 */
export function showCellClassPercentageWidget() {
    const els = initChartElements();

    els.widget.classList.remove('hidden');
    els.backdrop.classList.remove('hidden');

    // Start with empty state; wait for region selection
    lastPercentageData = null;
    els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">Select a region to generate chart</div>';

    // Add backdrop click handler
    els.backdrop.onclick = hideCellClassPercentageWidget;

    // Ensure widget can be dragged and resized
    setupDragAndResize();
}

/**
 * Hide cell class percentage widget
 */
export function hideCellClassPercentageWidget() {
    const els = initChartElements();

    els.widget.classList.add('hidden');
    els.backdrop.classList.add('hidden');
    els.backdrop.onclick = null;
}

/**
 * Setup drag and resize functionality (copied from cellClassDistributionChart.js)
 */
function setupDragAndResize() {
    if (dragInitDone) return;
    const els = initChartElements();
    const widget = els.widget;
    if (!widget) return;
    // Allow larger heights than generic widget default
    try { widget.style.maxHeight = 'none'; } catch {}

    // Dragging
    const header = widget.querySelector('.gene-widget-header');
    if (header) {
        let isDragging = false;
        let startX = 0, startY = 0;
        let startLeft = 0, startTop = 0;

        function onMouseDown(e) {
            // Ignore clicks on header buttons
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            const rect = widget.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            widget.classList.add('dragging');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            // Constrain to viewport
            newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - widget.offsetWidth));
            newTop = Math.max(0, Math.min(newTop, window.innerHeight - widget.offsetHeight));
            widget.style.left = newLeft + 'px';
            widget.style.top = newTop + 'px';
            widget.style.transform = 'none';
        }
        function onMouseUp() {
            isDragging = false;
            widget.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        header.addEventListener('mousedown', onMouseDown);
    }

    // Resizer
    const resizer = document.createElement('div');
    resizer.style.position = 'absolute';
    resizer.style.right = '4px';
    resizer.style.bottom = '4px';
    resizer.style.width = '12px';
    resizer.style.height = '12px';
    resizer.style.cursor = 'nwse-resize';
    resizer.style.borderRight = '2px solid #94a3b8';
    resizer.style.borderBottom = '2px solid #94a3b8';
    resizer.style.opacity = '0.6';
    resizer.style.zIndex = '1001';
    widget.appendChild(resizer);

    let resizing = false;
    let startW = 0, startH = 0, startRX = 0, startRY = 0;
    function onResizeStart(e) {
        e.stopPropagation();
        resizing = true;
        const rect = widget.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        startRX = e.clientX;
        startRY = e.clientY;
        document.addEventListener('mousemove', onResizing);
        document.addEventListener('mouseup', onResizeEnd);
    }
    function onResizing(e) {
        if (!resizing) return;
        const dx = e.clientX - startRX;
        const dy = e.clientY - startRY;
        const newW = Math.max(360, startW + dx);
        const newH = Math.max(240, startH + dy);
        widget.style.width = newW + 'px';
        widget.style.height = newH + 'px';
        // The ResizeObserver will trigger chart redraw
    }
    function onResizeEnd() {
        resizing = false;
        document.removeEventListener('mousemove', onResizing);
        document.removeEventListener('mouseup', onResizeEnd);
    }
    resizer.addEventListener('mousedown', onResizeStart);

    dragInitDone = true;
}

/**
 * Initialize cell class percentage chart functionality
 */
export function initCellClassPercentageChart() {
    const els = initChartElements();

    // Close button handler
    els.closeBtn.onclick = hideCellClassPercentageWidget;

    // Undock button handler (placeholder)
    els.undockBtn.onclick = function() {
        console.log('Undock functionality not implemented yet');
    };

    // Populate region dropdown and wire selection
    async function populateRegions() {
        try {
            const resp = await fetch('data/region_boundaries/manifest.json');
            if (!resp.ok) throw new Error('manifest missing');
            const names = await resp.json();
            els.regionSelect.innerHTML = '<option value="">Select a region...</option>';
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                els.regionSelect.appendChild(opt);
            });
        } catch (e) {
            console.warn('Region manifest not found or invalid:', e);
        }
    }
    populateRegions();

    els.regionSelect.onchange = async function() {
        const region = this.value;
        if (!region) {
            lastPercentageData = null;
            els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">Select a region to generate chart</div>';
            return;
        }
        try {
            const url = `data/region_boundaries/${region}.csv`;
            const text = await fetch(url).then(r => r.text());
            const rows = d3.csvParse(text);
            const poly = rows.map(r => [Number(r.x), Number(r.y)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
            const regions = [poly];
            lastPercentageData = calculateCellClassPercentages(regions);
            createPercentageBarChart(lastPercentageData);
        } catch (err) {
            console.error('Failed to load region CSV:', err);
            els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f88;">Failed to load region</div>';
        }
    };

    // Initial state
    els.chart.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">Select a region to generate chart</div>';

    // Responsive re-render on container resize
    if (!resizeObserver && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
            if (resizeRafId == null) {
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    if (!els.widget.classList.contains('hidden') && lastPercentageData) {
                        createPercentageBarChart(lastPercentageData);
                    }
                });
            }
        });
        try { resizeObserver.observe(els.chart); } catch {}
    }

    setupDragAndResize();
}