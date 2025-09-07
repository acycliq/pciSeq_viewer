/**
 * Gene Distribution Chart Module
 * 
 * Creates interactive bar charts showing gene spot distribution across planes
 */

import { state } from './stateManager.js';
import { elements } from './domElements.js';

// Chart widget elements
let chartElements = null;

// Initialize chart elements
function initChartElements() {
    if (chartElements) return chartElements;
    
    chartElements = {
        widget: document.getElementById('geneDistributionWidget'),
        backdrop: document.getElementById('geneDistributionWidgetBackdrop'),
        select: document.getElementById('geneDistributionSelect'),
        chart: document.getElementById('geneDistributionChart'),
        closeBtn: document.getElementById('geneDistributionWidgetClose'),
        undockBtn: document.getElementById('geneDistributionWidgetUndock')
    };
    
    return chartElements;
}

/**
 * Calculate spot counts per plane for a given gene
 * @param {string} geneName - Name of the gene to analyze
 * @returns {Array} Array of {plane, count} objects
 */
function calculateGeneDistribution(geneName) {
    if (!state.geneDataMap.has(geneName)) {
        return [];
    }
    
    const geneSpots = state.geneDataMap.get(geneName);
    const planeCounts = new Map();
    
    // Count spots per plane
    geneSpots.forEach(spot => {
        const planeId = spot.plane_id || 0;
        planeCounts.set(planeId, (planeCounts.get(planeId) || 0) + 1);
    });
    
    // Convert to array and sort by plane number
    const distribution = Array.from(planeCounts.entries())
        .map(([plane, count]) => ({ plane: +plane, count }))
        .sort((a, b) => a.plane - b.plane);
    
    return distribution;
}

/**
 * Create D3 bar chart
 * @param {Array} data - Distribution data [{plane, count}, ...]
 * @param {string} geneName - Gene name for chart title
 */
function createBarChart(data, geneName) {
    const els = initChartElements();
    const container = els.chart;
    
    // Clear previous chart
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">No data available for selected gene</div>';
        return;
    }
    
    const margin = { top: 20, right: 30, bottom: 40, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom);
    
    const g = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    // Scales
    const xScale = d3.scaleBand()
        .domain(data.map(d => d.plane))
        .range([0, width])
        .padding(0.1);
    
    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([height, 0]);
    
    // Color scale
    const colorScale = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, d3.max(data, d => d.count)]);
    
    // Create bars
    g.selectAll('.bar')
        .data(data)
        .enter().append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.plane))
        .attr('width', xScale.bandwidth())
        .attr('y', d => yScale(d.count))
        .attr('height', d => height - yScale(d.count))
        .attr('fill', d => colorScale(d.count))
        .attr('stroke', '#333')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            // Tooltip
            const tooltip = d3.select('body').append('div')
                .attr('class', 'chart-tooltip')
                .style('position', 'absolute')
                .style('background', 'rgba(0, 0, 0, 0.8)')
                .style('color', 'white')
                .style('padding', '8px')
                .style('border-radius', '4px')
                .style('font-size', '12px')
                .style('pointer-events', 'none')
                .style('z-index', '10000')
                .style('opacity', 0);
            
            tooltip.html(`<strong>Plane ${d.plane}</strong><br/>Spots: ${d.count}`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px')
                .transition()
                .duration(200)
                .style('opacity', 1);
            
            // Highlight bar
            d3.select(this)
                .attr('stroke-width', 2)
                .attr('stroke', '#ff6b35');
        })
        .on('mouseout', function() {
            d3.selectAll('.chart-tooltip').remove();
            d3.select(this)
                .attr('stroke-width', 1)
                .attr('stroke', '#333');
        })
        .on('click', function(event, d) {
            // Navigate to clicked plane
            if (window.navigateToPlane) {
                window.navigateToPlane(d.plane);
            }
        });
    
    // X axis with filtered tick labels
    const xAxis = d3.axisBottom(xScale)
        .tickValues(data.filter((d, i) => i % 5 === 0).map(d => d.plane));
    
    g.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis)
        .append('text')
        .attr('x', width / 2)
        .attr('y', 35)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Plane');
    
    // Y axis
    g.append('g')
        .call(d3.axisLeft(yScale))
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -35)
        .attr('x', -height / 2)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Spot Count');
    
    // Chart title
    g.append('text')
        .attr('x', width / 2)
        .attr('y', -5)
        .attr('fill', '#e8e8f0')
        .style('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(`${geneName} - Distribution Across Planes`);
    
    // Add stats text
    const totalSpots = data.reduce((sum, d) => sum + d.count, 0);
    const planeRange = data.length > 0 ? `${d3.min(data, d => d.plane)} - ${d3.max(data, d => d.plane)}` : '0';
    
    g.append('text')
        .attr('x', width - 5)
        .attr('y', 15)
        .attr('fill', '#888')
        .style('text-anchor', 'end')
        .style('font-size', '10px')
        .text(`Total: ${totalSpots} spots | Planes: ${planeRange}`);
}

/**
 * Populate gene dropdown with available genes
 */
function populateGeneSelect() {
    const els = initChartElements();
    const select = els.select;
    
    // Clear existing options (except first)
    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }
    
    // Add gene options
    const genes = Array.from(state.geneDataMap.keys()).sort();
    genes.forEach(gene => {
        const option = document.createElement('option');
        option.value = gene;
        option.textContent = gene;
        select.appendChild(option);
    });
}


/**
 * Show gene distribution widget
 */
export function showGeneDistributionWidget() {
    const els = initChartElements();
    
    populateGeneSelect();
    
    els.widget.classList.remove('hidden');
    els.backdrop.classList.remove('hidden');
    
    // Add backdrop click handler
    els.backdrop.onclick = hideGeneDistributionWidget;
}

/**
 * Hide gene distribution widget
 */
export function hideGeneDistributionWidget() {
    const els = initChartElements();
    
    els.widget.classList.add('hidden');
    els.backdrop.classList.add('hidden');
    els.backdrop.onclick = null;
}

/**
 * Initialize gene distribution chart functionality
 */
export function initGeneDistributionChart() {
    const els = initChartElements();
    
    // Close button handler
    els.closeBtn.onclick = hideGeneDistributionWidget;
    
    // Gene selection handler
    els.select.onchange = function() {
        const selectedGene = this.value;
        if (selectedGene) {
            const distribution = calculateGeneDistribution(selectedGene);
            createBarChart(distribution, selectedGene);
        } else {
            els.chart.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">Select a gene to view distribution</div>';
        }
    };
    
    
    // Undock button handler (placeholder)
    els.undockBtn.onclick = function() {
        console.log('Undock functionality not implemented yet');
    };
    
    // Initial state
    els.chart.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #888;">Select a gene to view distribution</div>';
}

// Global functions for button handlers
window.showGeneDistributionWidget = showGeneDistributionWidget;
window.hideGeneDistributionWidget = hideGeneDistributionWidget;