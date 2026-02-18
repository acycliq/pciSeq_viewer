/**
 * Class Gene Counts Chart (Glass Widget)
 *
 * Shows the distribution of gene counts per cell class, as computed by pciSeq
 * after cell typing. These are NOT the input scRNAseq reference counts passed
 * to pciSeq.fit() -- they are the posterior gene-count assignments that pciSeq
 * produces during its probabilistic cell-typing run.
 *
 * Each cell contributes to the selected class proportionally to its class
 * probability (soft clustering), mirroring the Python gene_reads_per_class()
 * logic in pciSeq_3d.
 *
 * Data source: state.cellDataMap (totalGeneCount, classification.probability)
 * Built on WidgetBase for a unified "Glass Cockpit" experience.
 */

import { WidgetBase } from './ui/widgetBase.js';
import { state } from './state/stateManager.js';

class ExpressionHistogramWidget extends WidgetBase {
    constructor() {
        super('expressionHistogramWidget', 'Gene Counts per Class', {
            width: 700,
            height: 450,
            minWidth: 400,
            minHeight: 300,
            side: 'right'
        });

        this.lastData = null;
        this.resizeRaf = null;
        this.roundingMode = 'ceil'; // 'ceil' | 'floor' | 'round'

        // Bind methods
        this.updateData = this.updateData.bind(this);
        this.renderChart = this.renderChart.bind(this);
    }

    create() {
        super.create();

        // Toolbar: Class selector
        this.classSelect = document.createElement('select');
        this.classSelect.className = 'glass-select';
        this.classSelect.innerHTML = '<option value="">-- Select Class --</option>';
        this.classSelect.addEventListener('change', () => this.updateData());
        this.addToolbarControl(this.classSelect);

        // Toolbar: Rounding mode selector
        this.roundingSelect = document.createElement('select');
        this.roundingSelect.className = 'glass-select';
        this.roundingSelect.innerHTML = `
            <option value="ceil">Ceiling</option>
            <option value="floor">Floor</option>
            <option value="round">Closest</option>
            <option value="truncate2">2 Decimals</option>
        `;
        this.roundingSelect.addEventListener('change', () => {
            this.roundingMode = this.roundingSelect.value;
            this.updateData();
        });
        this.addToolbarControl(this.roundingSelect);

        // Toolbar: Ignore zeros checkbox
        const ignoreZerosLabel = document.createElement('label');
        ignoreZerosLabel.style.cssText = 'display:flex;align-items:center;gap:4px;color:#ccc;font-size:12px;cursor:pointer;white-space:nowrap;';
        this.ignoreZerosCheckbox = document.createElement('input');
        this.ignoreZerosCheckbox.type = 'checkbox';
        this.ignoreZerosCheckbox.style.cursor = 'pointer';
        this.ignoreZerosCheckbox.addEventListener('change', () => {
            if (this.lastData) this.renderChart(this.lastData);
        });
        ignoreZerosLabel.appendChild(this.ignoreZerosCheckbox);
        ignoreZerosLabel.appendChild(document.createTextNode('Ignore zeros'));
        this.addToolbarControl(ignoreZerosLabel);
    }

    onShow() {
        this.populateClassDropdown();
        this.updateData();
    }

    onResize() {
        if (this.resizeRaf) cancelAnimationFrame(this.resizeRaf);
        this.resizeRaf = requestAnimationFrame(() => {
            if (this.lastData) this.renderChart(this.lastData);
        });
    }

    /**
     * Populate the class dropdown from the current cellDataMap.
     */
    populateClassDropdown() {
        if (!this.classSelect) return;

        const currentVal = this.classSelect.value;
        const classes = new Set();

        if (state.cellDataMap) {
            state.cellDataMap.forEach(cell => {
                if (cell.primaryClass) classes.add(cell.primaryClass);
            });
        }

        const sorted = Array.from(classes).sort();
        this.classSelect.innerHTML = '<option value="">-- Select Class --</option>';
        sorted.forEach(cls => {
            const opt = document.createElement('option');
            opt.value = cls;
            opt.textContent = cls;
            this.classSelect.appendChild(opt);
        });

        // Restore selection if still valid
        if (currentVal && classes.has(currentVal)) {
            this.classSelect.value = currentVal;
        }
    }

    updateData() {
        if (!this.contentContainer) return;

        const selectedClass = this.classSelect.value;
        if (!selectedClass) {
            this.contentContainer.innerHTML = '<div class="glass-loader">Select a cell class to view its expression distribution</div>';
            this.lastData = null;
            return;
        }

        this.lastData = this.calculateHistogram(selectedClass);
        this.renderChart(this.lastData);
    }

    /**
     * Build histogram bins for the selected class using soft clustering.
     *
     * Mirrors the Python gene_reads_per_class() logic: each cell contributes
     * to the selected class proportionally to its class probability (classProb),
     * not via hard primaryClass assignment.
     *
     * For each cell c and selected class k:
     *   - Find classProb[c,k] from classification.probability
     *   - Take totalGeneCount (sum of per-gene reads for that cell)
     *   - Round totalGeneCount to get the bin
     *   - Add classProb[c,k] to that bin's weighted count
     *
     * Returns { bins: [{bin, count}], className, totalWeight }
     */
    calculateHistogram(className) {
        if (!state.cellDataMap || state.cellDataMap.size === 0) {
            return { bins: [], className, totalWeight: 0 };
        }

        const roundFn = this.getRoundingFunction();
        const counts = {};
        let totalWeight = 0;

        state.cellDataMap.forEach(cell => {
            if (!cell.classification) return;

            const classNames = cell.classification.className;
            const probs = cell.classification.probability;
            if (!classNames || !probs) return;

            // Find the probability for the selected class
            const idx = classNames.indexOf(className);
            if (idx < 0) return; // class not in this cell's assignments

            const weight = probs[idx];
            if (weight <= 0) return;

            const raw = cell.totalGeneCount || 0;
            const bin = roundFn(raw);
            counts[bin] = (counts[bin] || 0) + weight;
            totalWeight += weight;
        });

        if (totalWeight === 0) {
            return { bins: [], className, totalWeight: 0 };
        }

        const binKeys = Object.keys(counts).map(Number).sort((a, b) => a - b);

        let bins;
        if (this.roundingMode === 'truncate2') {
            // Decimal bins: only show populated bins (gap-filling would create too many)
            bins = binKeys.map(b => ({ bin: b, count: counts[b] }));
        } else {
            // Integer bins: fill the full range so there are no gaps
            const minBin = binKeys[0];
            const maxBin = binKeys[binKeys.length - 1];
            bins = [];
            for (let b = minBin; b <= maxBin; b++) {
                bins.push({ bin: b, count: counts[b] || 0 });
            }
        }

        return { bins, className, totalWeight };
    }

    getRoundingFunction() {
        switch (this.roundingMode) {
            case 'floor': return Math.floor;
            case 'round': return Math.round;
            case 'truncate2': return (v) => Math.floor(v * 100) / 100;
            case 'ceil':
            default: return Math.ceil;
        }
    }

    renderChart(data) {
        const container = this.contentContainer;
        container.innerHTML = '';

        if (!data || data.bins.length === 0) {
            container.innerHTML = '<div class="glass-loader">No cells found for this class</div>';
            return;
        }

        const { className } = data;

        // Filter out zero bins if checkbox is checked
        const ignoreZeros = this.ignoreZerosCheckbox && this.ignoreZerosCheckbox.checked;
        const bins = ignoreZeros
            ? data.bins.filter(d => d.bin !== 0)
            : data.bins;

        // Recompute displayed weight from visible bins
        const displayedWeight = bins.reduce((sum, d) => sum + d.count, 0);

        if (bins.length === 0) {
            container.innerHTML = '<div class="glass-loader">No non-zero bins for this class</div>';
            return;
        }

        const margin = { top: 40, right: 20, bottom: 50, left: 60 };
        const width = container.clientWidth - margin.left - margin.right;
        const height = container.clientHeight - margin.top - margin.bottom;

        const svg = d3.select(container).append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom);

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales — zero padding so bars fill the full band width
        const xScale = d3.scaleBand()
            .domain(bins.map(d => d.bin))
            .range([0, width])
            .padding(0);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.count)])
            .range([height, 0]);

        // Bar color from cellClassColors
        const barColor = this.getClassColor(className);

        // Tooltip
        let tooltip = document.querySelector('.chart-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'chart-tooltip';
            document.body.appendChild(tooltip);
        }

        // Bars
        g.selectAll('.bar')
            .data(bins)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.bin))
            .attr('width', xScale.bandwidth())
            .attr('y', d => yScale(d.count))
            .attr('height', d => height - yScale(d.count))
            .attr('fill', barColor)
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.8)
            .style('cursor', 'pointer')
            .on('mouseenter', function(e, d) {
                d3.select(this).attr('opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5);
                const pct = displayedWeight > 0 ? ((d.count / displayedWeight) * 100).toFixed(1) : '0.0';
                tooltip.innerHTML = `
                    <div style="font-weight:600;margin-bottom:2px">${className}</div>
                    <div>Gene Reads: ${d.bin}</div>
                    <div>Weighted Count: ${d.count.toFixed(1)}</div>
                    <div style="color:#aaa;font-size:11px;margin-top:2px">${pct}% of class</div>
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

        // Axes
        const xAxis = d3.axisBottom(xScale)
            .tickValues(xScale.domain().filter((d, i) => {
                // Show a manageable number of ticks
                const total = bins.length;
                if (total <= 20) return true;
                return !(i % Math.ceil(total / 20));
            }));
        const yAxis = d3.axisLeft(yScale).ticks(5);

        g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(xAxis);

        g.append('g').call(yAxis);

        // Style axes
        g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
        g.selectAll('.tick text')
            .attr('fill', 'rgba(255,255,255,0.6)')
            .style('font-family', 'inherit')
            .style('font-size', '10px');

        // Labels
        g.append('text')
            .attr('x', width / 2)
            .attr('y', height + 40)
            .attr('fill', 'rgba(255,255,255,0.4)')
            .attr('text-anchor', 'middle')
            .style('font-size', '11px')
            .text('Gene Reads');

        g.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -height / 2)
            .attr('y', -45)
            .attr('dy', '1em')
            .style('text-anchor', 'middle')
            .style('fill', 'rgba(255,255,255,0.4)')
            .style('font-size', '11px')
            .text('Cell Counts');

        // Subtitle: clarify data origin
        g.append('text')
            .attr('x', 0)
            .attr('y', -20)
            .attr('fill', 'rgba(255,255,255,0.35)')
            .style('font-size', '10px')
            .text('Posterior counts from pciSeq cell typing');

        // Summary text (top-right corner)
        g.append('text')
            .attr('x', width)
            .attr('y', -20)
            .attr('fill', 'rgba(255,255,255,0.35)')
            .attr('text-anchor', 'end')
            .style('font-size', '10px')
            .text(`#cells: ${displayedWeight.toFixed(1)}`);
    }

    getClassColor(cls) {
        if (cls === 'Zero') return '#000';
        if (state.cellClassColors && state.cellClassColors.has(cls)) {
            const c = state.cellClassColors.get(cls);
            return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
        }
        return '#888';
    }
}

// Singleton
let instance = null;

export function showExpressionHistogramWidget() {
    if (!instance) instance = new ExpressionHistogramWidget();
    instance.show();
}

export function hideExpressionHistogramWidget() {
    if (instance) instance.hide();
}
