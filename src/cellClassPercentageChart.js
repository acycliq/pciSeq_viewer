/**
 * Cell Class Percentage Chart (Zen Widget)
 *
 * A modern, interactive bar chart showing overall cell class percentages.
 * Built on WidgetBase for a unified "Glass Cockpit" experience.
 */

import { WidgetBase } from './ui/widgetBase.js';
import { state } from './state/stateManager.js';
import { getRegionBoundaries } from './regionsManager.js';

class CellClassPercentageWidget extends WidgetBase {
    constructor() {
        super('cellClassPercentageWidget', 'Class Distribution', {
            width: 800,
            height: 500,
            minWidth: 400,
            minHeight: 300,
            side: 'right'
        });

        this.lastData = null;
        this.resizeRaf = null;

        // Bind methods
        this.updateData = this.updateData.bind(this);
        this.renderChart = this.renderChart.bind(this);
        this.onRegionUpdate = this.onRegionUpdate.bind(this);
    }

    create() {
        super.create();

        // Toolbar: Region Selector
        this.regionSelect = document.createElement('select');
        this.regionSelect.className = 'glass-select';
        this.regionSelect.innerHTML = '<option value="">All Regions</option>';
        this.regionSelect.addEventListener('change', () => this.updateData());
        this.addToolbarControl(this.regionSelect);

        // Listen for updates
        window.addEventListener('regions-updated', this.onRegionUpdate);
        this.onRegionUpdate(); // Initial populate
    }

    onShow() {
        this.updateData();
    }

    onResize(width, height) {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.lastData) this.renderChart(this.lastData);
        });
    }

    onRegionUpdate() {
        if (!this.regionSelect) return;
        const currentVal = this.regionSelect.value;
        this.regionSelect.innerHTML = '<option value="">All Regions</option>';

        if (state.regions) {
            for (const [name] of state.regions) {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                this.regionSelect.appendChild(opt);
            }
        }

        if (currentVal && state.regions.has(currentVal)) {
            this.regionSelect.value = currentVal;
        }
    }

    updateData() {
        if (!this.contentContainer) return;

        // 1. Get filter
        const regionName = this.regionSelect.value;
        let regions = [];
        if (regionName) {
            const boundary = getRegionBoundaries(regionName);
            if (boundary) regions = [boundary];
        }

        // 2. Calculate
        this.lastData = this.calculatePercentages(regions);

        // 3. Render
        this.renderChart(this.lastData);
    }

    calculatePercentages(regionPolygons) {
        if (!state.cellDataMap || state.cellDataMap.size === 0) {
            return { classData: [], totalCells: 0 };
        }

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

        const counts = {};
        let total = 0;

        state.cellDataMap.forEach((cell) => {
            if (!cell.position) return;
            if (isInsideRegions(cell.position.x, cell.position.y)) {
                const cls = cell.primaryClass || 'Unknown';
                counts[cls] = (counts[cls] || 0) + 1;
                total++;
            }
        });

        const classData = Object.entries(counts)
            .map(([className, count]) => ({
                className,
                count,
                percentage: (count / total) * 100
            }))
            .sort((a, b) => b.count - a.count);

        return { classData, totalCells: total };
    }

    renderChart(data) {
        const container = this.contentContainer;
        container.innerHTML = '';

        if (!data || data.classData.length === 0) {
            container.innerHTML = '<div class="glass-loader">No data available</div>';
            return;
        }

        const margin = { top: 30, right: 20, bottom: 80, left: 60 }; // Bottom for angled labels
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(container).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleBand()
            .domain(data.classData.map(d => d.className))
            .range([0, width])
            .padding(0.2);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data.classData, d => d.percentage)])
            .range([height, 0]);

        // Colors
        const getClassColor = (cls) => {
            if (cls === 'Zero') return '#000';
            if (state.cellClassColors && state.cellClassColors.has(cls)) {
                const c = state.cellClassColors.get(cls);
                return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
            }
            return '#888';
        };

        // Tooltip (using shared DOM element logic)
        let tooltip = document.querySelector('.chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            document.body.appendChild(tooltip);
        }

        // Bars
        g.selectAll('.bar')
            .data(data.classData)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.className))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(d.percentage))
            .attr('height', d => height - yScale(d.percentage))
            .attr('fill', d => getClassColor(d.className))
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseenter', function(e, d) {
                d3.select(this).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5);
                tooltip.innerHTML = `
                    <div style="font-weight:600;margin-bottom:2px">${d.className}</div>
                    <div>Count: ${d.count.toLocaleString()}</div>
                    <div style="color:#aaa">${d.percentage.toFixed(1)}%</div>
                `;
                tooltip.style.opacity = 1;
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY - 10) + 'px';
            })
            .on('mousemove', (e) => {
                tooltip.style.left = (e.pageX + 10) + 'px';
                tooltip.style.top = (e.pageY - 10) + 'px';
            })
            .on('mouseleave', function() {
                d3.select(this)
                    .attr('opacity', 0.8)
                    .attr('stroke', 'rgba(255, 255, 255, 0.2)')
                    .attr('stroke-width', 0.5);
                tooltip.style.opacity = 0;
            });

        // Axes (Zen Style)
        const xAxis = d3.axisBottom(xScale);
        const yAxis = d3.axisLeft(yScale);

        const gx = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis);
        
        const gy = g.append('g').call(yAxis);

        // Style Axes
        g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
        g.selectAll('.tick text')
            .attr('fill', 'rgba(255,255,255,0.6)')
            .style('font-family', 'inherit')
            .style('font-size', '10px');

        // Rotate X labels if too crowded
        gx.selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)');

        // Titles
        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', -45)
            .attr('x', -height / 2)
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('fill', 'rgba(255,255,255,0.4)')
            .style('font-size', '11px')
            .text('Percentage (%)');
    }
}

// Singleton
let instance = null;

export function showCellClassPercentageWidget() {
    if (!instance) instance = new CellClassPercentageWidget();
    instance.show();
}

export function hideCellClassPercentageWidget() {
    if (instance) instance.hide();
}

export function initCellClassPercentageChart() {
    // No-op
}
