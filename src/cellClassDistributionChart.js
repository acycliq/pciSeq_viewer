/**
 * Cell Class Distribution Chart Module
 *
 * Creates interactive stacked bar charts showing cell class distribution across Z-planes
 * Replicates the Python cell_class_stacked_bar functionality
 */

import { state } from './stateManager.js';

// Chart widget elements
let chartElements = null;
let lastDistributionData = null; // cache for responsive re-render
let resizeObserver = null;
let resizeRafId = null;
let dragInitDone = false;
let tooltipEl = null;

// Initialize chart elements
function initChartElements() {
    if (chartElements) return chartElements;

    chartElements = {
        widget: document.getElementById('cellClassDistributionWidget'),
        backdrop: document.getElementById('cellClassDistributionWidgetBackdrop'),
        chart: document.getElementById('cellClassDistributionChart'),
        regionSelect: document.getElementById('classesByZRegionSelect'),
        closeBtn: document.getElementById('cellClassDistributionWidgetClose'),
        undockBtn: document.getElementById('cellClassDistributionWidgetUndock')
    };

    return chartElements;
}

// Tooltip helpers: reuse a single element
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
function showTooltip(html, x, y) {
    const t = ensureTooltip();
    t.innerHTML = html;
    t.style.left = (x + 10) + 'px';
    t.style.top = (y - 10) + 'px';
    t.style.opacity = '1';
}
function moveTooltip(x, y) {
    if (!tooltipEl) return;
    tooltipEl.style.left = (x + 10) + 'px';
    tooltipEl.style.top = (y - 10) + 'px';
}
function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.style.opacity = '0';
}

// Enable dragging via header and resizing via a bottom-right handle
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
 * Calculate cell class distribution across Z-planes
 * Replicates the Python function logic
 * @returns {Object} Distribution data with z_class_counts and classes_by_total
 */
function calculateCellClassDistribution(regionPolygons = null) {
    if (!state.cellDataMap || state.cellDataMap.size === 0) {
        return { z_class_counts: {}, classes_by_total: [] };
    }

    // Count classes per Z-plane (similar to Python's z_class_counts)
    const z_class_counts = {};
    const all_classes = new Set();

    // Helper: point in polygon (ray casting)
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
        if (!regionPolygons || regionPolygons.length === 0) return true; // no filter
        for (const poly of regionPolygons) {
            if (pointInPolygon(x, y, poly)) return true;
        }
        return false;
    }

    // Get voxel size configuration for Z-coordinate conversion
    const userConfig = window.config();
    const [xVoxelSize, yVoxelSize, zVoxelSize] = userConfig.voxelSize; // [0.28, 0.28, 0.7]

    // Process each cell
    state.cellDataMap.forEach((cell, cellNum) => {
        if (!cell.position || typeof cell.position.z === 'undefined') return;

        // Convert physical Z coordinate to plane ID using voxel size conversion
        // This matches the logic in cellLookup.js:219
        const plane_id = Math.floor(cell.position.z * xVoxelSize / zVoxelSize);
        const cellClass = cell.primaryClass || 'Unknown';
        const cx = cell.position.x;
        const cy = cell.position.y;

        // Region filter (image pixel coordinates)
        if (!isInsideAnyRegion(cx, cy)) return;

        // Initialize plane if not exists
        if (!z_class_counts[plane_id]) {
            z_class_counts[plane_id] = {};
        }

        // Count the cell class
        z_class_counts[plane_id][cellClass] = (z_class_counts[plane_id][cellClass] || 0) + 1;
        all_classes.add(cellClass);
    });

    // Calculate global totals and sort classes by frequency (like Python)
    const global_totals = {};
    Array.from(all_classes).forEach(cls => {
        global_totals[cls] = Object.values(z_class_counts)
            .reduce((sum, plane_counts) => sum + (plane_counts[cls] || 0), 0);
    });

    // Sort classes by total count (descending)
    const classes_by_total = Array.from(all_classes)
        .sort((a, b) => global_totals[b] - global_totals[a]);

    return { z_class_counts, classes_by_total };
}

/**
 * Create stacked bar chart using D3 (replicates Plotly behavior from Python)
 * @param {Object} data - Distribution data
 */
function createStackedBarChart(data) {
    const els = initChartElements();
    const container = els.chart;

    // Clear previous chart
    container.innerHTML = '';

    const { z_class_counts, classes_by_total } = data;
    const z_values = Object.keys(z_class_counts).map(Number).sort((a, b) => a - b);

    if (z_values.length === 0 || classes_by_total.length === 0) {
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">No cell data available</div>';
        return;
    }

    const margin = { top: 30, right: 120, bottom: 50, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Calculate cumulative data for stacking (like Python's cumulative_data)
    const cumulative_data = {};
    z_values.forEach(z => {
        const z_counts = z_class_counts[z] || {};
        // Sort classes by count for this Z value (highest first)
        const sorted_classes = Object.entries(z_counts)
            .sort(([,a], [,b]) => b - a);

        cumulative_data[z] = {};
        let cumulative = 0;
        sorted_classes.forEach(([cls, count]) => {
            cumulative_data[z][cls] = {
                bottom: cumulative,
                height: count
            };
            cumulative += count;
        });
    });

    // Get max total for Y scale
    const maxTotal = Math.max(...z_values.map(z =>
        Object.values(z_class_counts[z] || {}).reduce((sum, count) => sum + count, 0)
    ));

    // Scales
    const xScale = d3.scaleBand()
        .domain(z_values)
        .range([0, width])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, maxTotal])
        .range([height, 0]);

    // Color scale sourced from state.cellClassColors for consistency with polygons
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
        .domain(classes_by_total)
        .range(classes_by_total.map(getClassColor));

    // Create stacked bars for each class (following Python's trace order)
    classes_by_total.forEach(cls => {
        const barData = z_values.map(z => {
            const data = cumulative_data[z][cls];
            return {
                z: z,
                height: data ? data.height : 0,
                bottom: data ? data.bottom : 0,
                class: cls
            };
        }).filter(d => d.height > 0); // Only show bars with data

        if (barData.length === 0) return;

        // Create bars for this class
        g.selectAll(`.bar-${cls.replace(/\s+/g, '-')}`)
            .data(barData)
            .enter().append('rect')
            .attr('class', `bar bar-${cls.replace(/\s+/g, '-')}`)
            .attr('x', d => xScale(d.z))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(d.bottom + d.height))
            .attr('height', d => yScale(d.bottom) - yScale(d.bottom + d.height))
            .attr('fill', colorScale(cls))
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                showTooltip(`<strong>Z-Plane: ${d.z}</strong><br/>Class: ${d.class}<br/>Count: ${d.height}`, event.pageX, event.pageY);
                // Highlight bar
                d3.select(this)
                    .attr('stroke-width', 2)
                    .attr('stroke', '#ff6b35');
            })
            .on('mousemove', function(event) {
                moveTooltip(event.pageX, event.pageY);
            })
            .on('mouseout', function() {
                hideTooltip();
                d3.select(this)
                    .attr('stroke-width', 0.5)
                    .attr('stroke', '#333');
            })
            .on('click', function(event, d) {
                // Navigate to clicked plane
                if (window.navigateToPlane) {
                    window.navigateToPlane(d.z);
                }
            });
    });

    // X axis
    // Adaptive tick density based on width and number of planes
    const desiredTicks = Math.max(2, Math.floor(width / 55));
    const step = Math.max(1, Math.ceil(z_values.length / desiredTicks));
    const xAxis = d3.axisBottom(xScale)
        .tickValues(z_values.filter((_, i) => i % step === 0));

    g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .append('text')
        .attr('x', width / 2)
        .attr('y', 40)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Z-Plane (Integer)');

    // Y axis
    g.append('g')
        .call(d3.axisLeft(yScale))
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -40)
        .attr('x', -height / 2)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Cell Count');

    // Chart title (like Python)
    g.append('text')
        .attr('x', width / 2)
        .attr('y', -10)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Cell Class Distribution by Z-Plane');

    // Legend (HTML, scrollable to handle many classes)
    // Ensure container can host absolutely-positioned legend panel
    container.style.position = 'relative';

    const legendPanel = document.createElement('div');
    legendPanel.setAttribute('id', 'cell-class-legend');
    legendPanel.style.position = 'absolute';
    legendPanel.style.top = (margin.top + 0) + 'px';
    legendPanel.style.right = '8px';
    legendPanel.style.bottom = 'auto';
    legendPanel.style.height = '66%'; // shorten legend by ~1/3 of container height
    legendPanel.style.width = Math.max(110, margin.right - 20) + 'px';
    legendPanel.style.overflowY = 'auto';
    legendPanel.style.padding = '4px';
    legendPanel.style.boxSizing = 'border-box';
    legendPanel.style.background = 'rgba(17, 24, 39, 0.35)'; // subtle dark translucent
    legendPanel.style.backdropFilter = 'blur(2px)';
    legendPanel.style.border = '1px solid #334155';
    legendPanel.style.borderRadius = '6px';
    legendPanel.style.color = '#e8e8f0';
    legendPanel.style.fontSize = '10px';

    // Optional header
    const header = document.createElement('div');
    header.textContent = 'Legend';
    header.style.fontWeight = '600';
    header.style.margin = '0 0 6px 0';
    header.style.fontSize = '11px';
    legendPanel.appendChild(header);

    classes_by_total.forEach(cls => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '6px';
        row.style.margin = '2px 0';

        const swatch = document.createElement('span');
        swatch.style.display = 'inline-block';
        swatch.style.width = '12px';
        swatch.style.height = '12px';
        swatch.style.border = '1px solid #333';
        swatch.style.background = colorScale(cls);

        const label = document.createElement('span');
        label.textContent = cls;
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';

        row.appendChild(swatch);
        row.appendChild(label);
        legendPanel.appendChild(row);
    });

    container.appendChild(legendPanel);

    // Add summary stats
    const totalCells = Object.values(z_class_counts)
        .reduce((sum, plane_counts) => sum + Object.values(plane_counts).reduce((s, c) => s + c, 0), 0);
    const planeRange = z_values.length > 0 ? `${Math.min(...z_values)} - ${Math.max(...z_values)}` : '0';

    g.append('text')
        .attr('x', width - 5)
        .attr('y', height - 5)
        .attr('fill', '#888')
        .style('text-anchor', 'end')
        .style('font-size', '10px')
        .text(`Total: ${totalCells} cells | Planes: ${planeRange}`);
}

/**
 * Show cell class distribution widget
 */
export function showCellClassDistributionWidget() {
    const els = initChartElements();

    els.widget.classList.remove('hidden');
    els.backdrop.classList.remove('hidden');

    // Start with empty state; wait for region selection
    lastDistributionData = null;
    els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">Select a region to generate distribution</div>';

    // Add backdrop click handler
    els.backdrop.onclick = hideCellClassDistributionWidget;

    // Ensure widget can be dragged and resized
    setupDragAndResize();
}

/**
 * Hide cell class distribution widget
 */
export function hideCellClassDistributionWidget() {
    const els = initChartElements();

    els.widget.classList.add('hidden');
    els.backdrop.classList.add('hidden');
    els.backdrop.onclick = null;
}

/**
 * Initialize cell class distribution chart functionality
 */
export function initCellClassDistributionChart() {
    const els = initChartElements();

    // Close button handler
    els.closeBtn.onclick = hideCellClassDistributionWidget;

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
            lastDistributionData = null;
            els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">Select a region to generate distribution</div>';
            return;
        }
        try {
            const url = `data/region_boundaries/${region}.csv`;
            const text = await fetch(url).then(r => r.text());
            const rows = d3.csvParse(text);
            const poly = rows.map(r => [Number(r.x), Number(r.y)]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
            const regions = [poly];
            lastDistributionData = calculateCellClassDistribution(regions);
            createStackedBarChart(lastDistributionData);
        } catch (err) {
            console.error('Failed to load region CSV:', err);
            els.chart.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f88;">Failed to load region</div>';
        }
    };

    // Initial state
    els.chart.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">Select a region to generate distribution</div>';

    // Responsive re-render on container resize (throttled via rAF)
    if (!resizeObserver && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
            if (resizeRafId == null) {
                resizeRafId = requestAnimationFrame(() => {
                    resizeRafId = null;
                    // Only re-render when widget is visible and we have data
                    if (!els.widget.classList.contains('hidden') && lastDistributionData) {
                        createStackedBarChart(lastDistributionData);
                    }
                });
            }
        });
        try { resizeObserver.observe(els.chart); } catch {}
    }

    // Prepare drag/resize once
    setupDragAndResize();
}
