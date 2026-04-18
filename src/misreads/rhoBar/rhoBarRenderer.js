import { createFocusContextLayout, attachBrushY } from '../../ui/brushChart.js';
import { sciFormat } from '../../ui/sciFormat.js';
import { showTooltip, moveTooltip, hideTooltip } from '../../ui/chartTooltip.js';

const MARGIN      = { top: 20, right: 0, bottom: 30, left: 110 };
const BAR_COLOR   = '#e05252';
const INIT_WINDOW = 30;

export function renderRhoBar(container, data, order = 'desc', isPosterior = true) {
    const sorted = order === 'asc'
        ? [...data].sort((a, b) => a.rho - b.rho)
        : [...data].sort((a, b) => b.rho - a.rho);
    container.innerHTML = '';

    if (!sorted.length) {
        container.innerHTML = '<div class="glass-loader">No misread density data available.</div>';
        return;
    }

    if (!isPosterior) {
        const note = document.createElement('div');
        note.style.cssText = 'font-size:10px;color:rgba(255,200,100,0.8);padding:2px 8px 4px;';
        note.textContent = 'Showing prior (misread_density) — gene-specific rho not available for this dataset.';
        container.appendChild(note);
    }

    const { gFocus, focusClipped, gContext, dims } = createFocusContextLayout(container, MARGIN);

    const yAxisGrp = gFocus.append('g');
    const xAxisGrp = gFocus.append('g').attr('transform', `translate(0,${dims.focusH})`);

    drawContextBars(gContext, sorted, dims);

    const updateFocus = (start, end) => {
        drawFocusBars(focusClipped, yAxisGrp, xAxisGrp, sorted.slice(start, end), dims);
    };

    const { brush, brushGroup } = attachBrushY(gContext, dims, sorted.length, updateFocus);

    const initEnd = Math.min(sorted.length, INIT_WINDOW);
    brushGroup.call(brush.move, [0, dims.focusH * initEnd / sorted.length]);
}

// --- private helpers ---

function drawContextBars(gContext, data, { focusH, contextW }) {
    const xCtx = d3.scaleLinear().domain([0, d3.max(data, d => d.rho)]).range([0, contextW]);
    const barH  = Math.max(1, focusH / data.length);

    gContext.selectAll('.ctx-bar').data(data).enter().append('rect')
        .attr('class', 'ctx-bar')
        .attr('x', 0)
        .attr('y', (_, i) => i * barH)
        .attr('width',  d => xCtx(d.rho))
        .attr('height', Math.max(1, barH - 0.3))
        .attr('fill',    BAR_COLOR)
        .attr('opacity', 0.35);
}

function drawFocusBars(group, yAxisGrp, xAxisGrp, visible, { focusW, focusH }) {
    if (!visible.length) return;

    const yScale = d3.scaleBand()
        .domain(visible.map(d => d.gene))
        .range([0, focusH])
        .padding(0.15);

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(visible, d => d.rho) * 1.05])
        .range([0, focusW]);

    const bars = group.selectAll('.bar').data(visible, d => d.gene);
    bars.exit().remove();
    bars.enter().append('rect').attr('class', 'bar')
        .merge(bars)
        .attr('y',      d => yScale(d.gene))
        .attr('height', yScale.bandwidth())
        .attr('x', 0)
        .attr('width',   d => xScale(d.rho))
        .attr('fill',    BAR_COLOR)
        .attr('opacity', 0.8)
        .on('mouseenter', (e, d) => showTooltip(
            `<strong>${d.gene}</strong><br/>rho = ${sciFormat(d.rho)}`, e.pageX, e.pageY))
        .on('mousemove',  (e)    => moveTooltip(e.pageX, e.pageY))
        .on('mouseleave', ()     => hideTooltip());

    yAxisGrp.call(d3.axisLeft(yScale).tickSize(0).tickPadding(6));
    xAxisGrp.call(d3.axisBottom(xScale).ticks(5).tickFormat(sciFormat));

    styleAxis(yAxisGrp);
    styleAxis(xAxisGrp);
}

function styleAxis(grp) {
    grp.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
    grp.selectAll('.tick text')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .style('font-size', '10px');
}