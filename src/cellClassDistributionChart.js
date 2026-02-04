/**
 * Cell Class Distribution Chart (Zen Widget)
 *
 * A modern, interactive stacked bar chart showing cell class distribution across Z-planes.
 * Built on WidgetBase for a unified "Glass Cockpit" experience.
 */

import { WidgetBase } from './ui/widgetBase.js';
import { state } from './state/stateManager.js';
import { getRegionBoundaries, getVisibleRegions } from './regionsManager.js';

class CellClassDistributionWidget extends WidgetBase {
    constructor() {
        super('cellClassDistributionWidget', 'Classes by Z-Plane', {
            width: 800,
            height: 500,
            minWidth: 400,
            minHeight: 300,
            side: 'left'
        });

        this.lastData = null;
        this.resizeRaf = null;

        // Bind methods
        this.updateData = this.updateData.bind(this);
        this.renderChart = this.renderChart.bind(this);
        this.onRegionUpdate = this.onRegionUpdate.bind(this);
    }

    create() {
        super.create(); // Create the DOM shell

        // Add region selector to toolbar
        this.regionSelect = document.createElement('select');
        this.regionSelect.className = 'glass-select';
        this.regionSelect.innerHTML = '<option value="">All Regions</option>';
        this.regionSelect.addEventListener('change', () => this.updateData());
        this.addToolbarControl(this.regionSelect);

        // Listen for global region changes
        window.addEventListener('regions-updated', this.onRegionUpdate);

        // Populate initial regions
        this.onRegionUpdate();
    }

    onShow() {
        // Refresh data when shown
        this.updateData();
    }

    onResize(width, height) {
        // Debounce chart re-rendering
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.lastData) this.renderChart(this.lastData);
        });
    }

    onRegionUpdate() {
        if (!this.regionSelect) return;
        
        const currentVal = this.regionSelect.value;
        this.regionSelect.innerHTML = '<option value="">All Regions</option>';
        
        // Get regions from global state (via regionsManager helper or direct access)
        if (state.regions) {
            for (const [name] of state.regions) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                this.regionSelect.appendChild(opt);
            }
        }
        
        // Restore selection if valid
        if (currentVal && state.regions.has(currentVal)) {
            this.regionSelect.value = currentVal;
        }
    }

    /**
     * Calculate stats and render
     */
    updateData() {
        if (!this.contentContainer) return; // Not created yet

        // Show loading state if heavy computation expected
        // this.contentContainer.innerHTML = '<div class="glass-loader">Calculating...</div>';

        // 1. Determine region filter
        const regionName = this.regionSelect.value;
        let regions = [];
        if (regionName) {
            const boundary = getRegionBoundaries(regionName);
            if (boundary) regions = [boundary];
        }

        // 2. Calculate distribution (Ported logic)
        this.lastData = this.calculateDistribution(regions);

        // 3. Render
        this.renderChart(this.lastData);
    }

    calculateDistribution(regionPolygons) {
        if (!state.cellDataMap || state.cellDataMap.size === 0) {
            return { z_class_counts: {}, classes_by_total: [] };
        }

        const z_class_counts = {};
        const all_classes = new Set();
        const userConfig = window.config();
        const [xVoxel, , zVoxel] = userConfig.voxelSize;

        // Point-in-polygon helper
        const pointInPolygon = (x, y, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i][0], yi = poly[i][1];
                const xj = poly[j][0], yj = poly[j][1];
                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        };

        const isInsideRegions = (x, y) => {
            if (!regionPolygons || regionPolygons.length === 0) return true;
            return regionPolygons.some(poly => pointInPolygon(x, y, poly));
        };

        // Scan all cells
        state.cellDataMap.forEach((cell) => {
            if (!cell.position || typeof cell.position.z === 'undefined') return;
            
            if (!isInsideRegions(cell.position.x, cell.position.y)) return;

            const planeId = Math.floor(cell.position.z * xVoxel / zVoxel);
            const cls = cell.primaryClass || 'Unknown';

            if (!z_class_counts[planeId]) z_class_counts[planeId] = {};
            z_class_counts[planeId][cls] = (z_class_counts[planeId][cls] || 0) + 1;
            all_classes.add(cls);
        });

        // Totals for sorting
        const global_totals = {};
        const classes = Array.from(all_classes);
        classes.forEach(c => {
            global_totals[c] = Object.values(z_class_counts)
                .reduce((sum, p) => sum + (p[c] || 0), 0);
        });

        const classes_by_total = classes.sort((a, b) => global_totals[b] - global_totals[a]);
        
        return { z_class_counts, classes_by_total };
    }

    renderChart(data) {
        const container = this.contentContainer;
        container.innerHTML = ''; // Clear

        const { z_class_counts, classes_by_total } = data;
        const z_values = Object.keys(z_class_counts).map(Number).sort((a, b) => a - b);

        if (z_values.length === 0) {
            container.innerHTML = '<div class="glass-loader">No cells found in selection</div>';
            return;
        }

        // Layout constants
        const margin = { top: 20, right: 120, bottom: 40, left: 50 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        // D3 Setup
        const svg = d3.select(container).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);
            
        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Prepare Stack Data
        const cumulative_data = {};
        const plane_totals = {}; // Store total cells per plane for % calc
        let maxTotal = 0;

        z_values.forEach(z => {
            const z_counts = z_class_counts[z] || {};
            
            // Calculate total for this plane
            const total = Object.values(z_counts).reduce((a, b) => a + b, 0);
            plane_totals[z] = total;

            // Sort classes for this plane by count desc
            const sorted = Object.entries(z_counts).sort(([,a], [,b]) => b - a);
            
            cumulative_data[z] = {};
            let stackH = 0;
            sorted.forEach(([cls, count]) => {
                cumulative_data[z][cls] = { bottom: stackH, height: count };
                stackH += count;
            });
            if (stackH > maxTotal) maxTotal = stackH;
        });

        // Scales
        const xScale = d3.scaleBand()
            .domain(z_values)
            .range([0, width])
            .padding(0.15); // Slightly more breathing room

        const yScale = d3.scaleLinear()
            .domain([0, maxTotal])
            .range([height, 0]);

        // Color Helper
        const getClassColor = (cls) => {
            if (cls === 'Zero') return '#000';
            if (state.cellClassColors && state.cellClassColors.has(cls)) {
                const c = state.cellClassColors.get(cls);
                return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
            }
            return '#888';
        };

        // --- Render Bars ---
        // Helper to sanitize class names for CSS selection
        const sanitize = (n) => n.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        // Tooltip logic (shared single instance managed by WidgetBase logic implicitly or separate?)
        // We'll create a local tooltip helper or reuse a global one.
        // For Zen feeling, let's create a lightweight internal one if needed, 
        // but styles.css already has .chart-tooltip.
        let tooltip = document.querySelector('.chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            document.body.appendChild(tooltip);
        }

        classes_by_total.forEach(cls => {
            const barData = z_values.map(z => {
                const d = cumulative_data[z][cls];
                return { 
                    z, 
                    cls, 
                    h: d ? d.height : 0, 
                    b: d ? d.bottom : 0,
                    total: plane_totals[z] || 0 
                };
            }).filter(d => d.h > 0);

            g.selectAll(`.bar-${sanitize(cls)}`)
                .data(barData)
                .enter().append('rect')
                .attr('x', d => xScale(d.z))
                .attr('y', d => yScale(d.b + d.h))
                .attr('height', d => yScale(d.b) - yScale(d.b + d.h))
                .attr('width', xScale.bandwidth())
                .attr('fill', getClassColor(cls))
                .attr('stroke', 'rgba(255, 255, 255, 0.2)')
                .attr('stroke-width', 0.5)
                .style('cursor', 'pointer')
                .attr('opacity', 0.9)
                .on('mouseenter', function(e, d) {
                    d3.select(this).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5);
                    
                    const pct = d.total > 0 ? ((d.h / d.total) * 100).toFixed(1) : '0.0';
                    
                    tooltip.innerHTML = `
                        <div style="font-weight:600;margin-bottom:2px">${d.cls}</div>
                        <div style="color:#aaa">Plane ${d.z}</div>
                        <div>Count: ${d.h}</div>
                        <div style="color:#aaa;font-size:11px;margin-top:2px">${pct}% of plane</div>
                    `;
                    tooltip.style.opacity = 1;
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY - 10) + 'px';
                })
                .on('mousemove', function(e) {
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY - 10) + 'px';
                })
                .on('mouseleave', function() {
                    d3.select(this)
                        .attr('opacity', 0.9)
                        .attr('stroke', 'rgba(255, 255, 255, 0.2)')
                        .attr('stroke-width', 0.5);
                    tooltip.style.opacity = 0;
                })
                .on('click', (e, d) => {
                    if (window.navigateToPlane) window.navigateToPlane(d.z);
                });
        });

        // --- Axes (Zen Style: Minimal) ---
        const xAxis = d3.axisBottom(xScale)
            .tickValues(xScale.domain().filter((d, i) => !(i % Math.ceil(z_values.length / 10)))); // Show ~10 ticks
        
        const yAxis = d3.axisLeft(yScale).ticks(5);

        const gx = g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
        const gy = g.append('g').call(yAxis);

        // Style Axes
        g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
        g.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.5)').style('font-family', 'inherit');

        // Labels
        g.append('text').attr('x', width/2).attr('y', height + 35)
            .attr('fill', 'rgba(255,255,255,0.4)').attr('text-anchor', 'middle')
            .style('font-size', '11px').text('Z-Plane');

        g.append('text').attr('transform', 'rotate(-90)').attr('x', -height/2).attr('y', -35)
            .attr('fill', 'rgba(255,255,255,0.4)').attr('text-anchor', 'middle')
            .style('font-size', '11px').text('Cell Count');

        // --- Legend (Custom Zen Scrollable) ---
        // Create HTML overlay for legend to handle scrolling better than SVG
        const legendDiv = document.createElement('div');
        legendDiv.style.cssText = `
            position: absolute;
            top: ${margin.top}px;
            right: 10px;
            width: 100px;
            bottom: ${margin.bottom}px;
            overflow-y: auto;
            font-size: 11px;
            padding-right: 4px;
        `;
        
        // Scrollbar style for legend
        const styleId = 'glass-legend-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .glass-legend-item { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; color: #ccc; cursor: default; }
                .glass-legend-swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
                .glass-legend-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .glass-legend-scroll::-webkit-scrollbar { width: 4px; }
                .glass-legend-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
            `;
            document.head.appendChild(style);
        }
        legendDiv.className = 'glass-legend-scroll';

        classes_by_total.forEach(cls => {
            const row = document.createElement('div');
            row.className = 'glass-legend-item';
            row.innerHTML = `
                <div class="glass-legend-swatch" style="background:${getClassColor(cls)}"></div>
                <div class="glass-legend-name" title="${cls}">${cls}</div>
            `;
            legendDiv.appendChild(row);
        });

        container.appendChild(legendDiv);
    }
}

// Singleton Instance
let instance = null;

export function showCellClassDistributionWidget() {
    if (!instance) instance = new CellClassDistributionWidget();
    instance.show();
}

export function hideCellClassDistributionWidget() {
    if (instance) instance.hide();
}

// For backward compatibility with existing init calls
export function initCellClassDistributionChart() {
    // No-op, lazy initialized on show
}