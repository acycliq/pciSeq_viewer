/**
 * Gene Distribution Chart (Glass Widget)
 *
 * A modern, interactive bar chart showing gene spot distribution across planes.
 * Built on WidgetBase for a unified "Glass Cockpit" experience.
 */

import { WidgetBase } from './ui/widgetBase.js';
import { state } from './state/stateManager.js';

class GeneDistributionWidget extends WidgetBase {
    constructor() {
        super('geneDistributionWidget', 'Gene Distribution', {
            width: 600,
            height: 400,
            minWidth: 400,
            minHeight: 300,
            side: 'left'
        });

        this.lastData = null;
        this.selectedGene = '';
        this.resizeRaf = null;

        // Bind methods
        this.updateData = this.updateData.bind(this);
        this.renderChart = this.renderChart.bind(this);
    }

    create() {
        super.create();

        // Toolbar: Gene Selector
        this.geneSelect = document.createElement('select');
        this.geneSelect.className = 'glass-select';
        this.geneSelect.innerHTML = '<option value="">Select Gene...</option>';
        this.geneSelect.addEventListener('change', (e) => {
            this.selectedGene = e.target.value;
            this.updateData();
        });
        this.addToolbarControl(this.geneSelect);

        this.populateGeneSelect();
    }

    onShow() {
        // Ensure dropdown is up to date
        this.populateGeneSelect();
        if (this.selectedGene) this.updateData();
    }

    onResize(width, height) {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.lastData) this.renderChart(this.lastData, this.selectedGene);
        });
    }

    populateGeneSelect() {
        if (!this.geneSelect) return;
        const current = this.geneSelect.value;
        this.geneSelect.innerHTML = '<option value="">Select Gene...</option>';

        const genes = Array.from(state.geneDataMap.keys()).sort();
        genes.forEach(gene => {
            const opt = document.createElement('option');
            opt.value = gene;
            opt.textContent = gene;
            this.geneSelect.appendChild(opt);
        });

        if (current && state.geneDataMap.has(current)) {
            this.geneSelect.value = current;
        }
    }

    updateData() {
        if (!this.selectedGene) {
            this.contentContainer.innerHTML = '<div class="glass-loader">Select a gene to view distribution</div>';
            return;
        }

        const geneSpots = state.geneDataMap.get(this.selectedGene);
        const planeCounts = new Map();

        geneSpots.forEach(spot => {
            const planeId = spot.plane_id || 0;
            planeCounts.set(planeId, (planeCounts.get(planeId) || 0) + 1);
        });

        this.lastData = Array.from(planeCounts.entries())
            .map(([plane, count]) => ({ plane: +plane, count }))
            .sort((a, b) => a.plane - b.plane);

        this.renderChart(this.lastData, this.selectedGene);
    }

    renderChart(data, geneName) {
        const container = this.contentContainer;
        container.innerHTML = '';

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="glass-loader">No data for selected gene</div>';
            return;
        }

        const margin = { top: 20, right: 30, bottom: 40, left: 50 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(container).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleBand()
            .domain(data.map(d => d.plane))
            .range([0, width])
            .padding(0.15);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.count)])
            .range([height, 0]);

        // Color: Original rich fade
        const colorScale = d3.scaleSequential(d3.interpolateBlues)
            .domain([0, d3.max(data, d => d.count)]);

        // Tooltip
        let tooltip = document.querySelector('.chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            document.body.appendChild(tooltip);
        }

        // Bars
        g.selectAll('.bar')
            .data(data)
            .enter().append('rect')
            .attr('x', d => xScale(d.plane))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(d.count))
            .attr('height', d => height - yScale(d.count))
            .attr('fill', d => colorScale(d.count))
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseenter', function(e, d) {
                d3.select(this).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5);
                tooltip.innerHTML = `
                    <div style="font-weight:600;margin-bottom:2px">Plane ${d.plane}</div>
                    <div>Spots: ${d.count.toLocaleString()}</div>
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
                d3.select(this).attr('opacity', 0.8).attr('stroke', 'rgba(255, 255, 255, 0.2)').attr('stroke-width', 0.5);
                tooltip.style.opacity = 0;
            })
            .on('click', (e, d) => {
                if (window.navigateToPlane) window.navigateToPlane(d.plane);
            });

        // Axes (Glass Style)
        const xAxis = d3.axisBottom(xScale)
            .tickValues(xScale.domain().filter((d, i) => !(i % 10))); // Every 10th plane
        
        const yAxis = d3.axisLeft(yScale).ticks(5);

        const gx = g.append('g').attr('transform', `translate(0,${height})`).call(xAxis);
        const gy = g.append('g').call(yAxis);

        // Styling
        g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
        g.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.5)').style('font-family', 'inherit');

        // Labels
        g.append('text').attr('x', width/2).attr('y', height + 35)
            .attr('fill', 'rgba(255,255,255,0.4)').attr('text-anchor', 'middle')
            .style('font-size', '11px').text('Z-Plane');

        g.append('text').attr('transform', 'rotate(-90)').attr('x', -height/2).attr('y', -35)
            .attr('fill', 'rgba(255,255,255,0.4)').attr('text-anchor', 'middle')
            .style('font-size', '11px').text('Spot Count');
    }
}

// Singleton
let instance = null;

export function showGeneDistributionWidget() {
    if (!instance) instance = new GeneDistributionWidget();
    instance.show();
}

export function hideGeneDistributionWidget() {
    if (instance) instance.hide();
}

export function initGeneDistributionChart() {
    // No-op
}

// Global Exports
window.showGeneDistributionWidget = showGeneDistributionWidget;
window.hideGeneDistributionWidget = hideGeneDistributionWidget;
