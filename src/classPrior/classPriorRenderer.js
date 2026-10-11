// Draws the class prior chart: one horizontal bar per class, as long as its weight.
// The strip on the right shows every class; drag its window to choose the ones
// drawn large. The weights span several orders of magnitude, so the x axis is
// fitted to the classes in the window, or the small ones would have no bar at all.
import { createFocusContextLayout, attachBrushY } from '../ui/brushChart.js';
import { showTooltip, moveTooltip, hideTooltip } from '../ui/chartTooltip.js';
import { state } from '../state/stateManager.js';
import { escapeHtml } from '../../utils/domSafe.js';

const MARGIN       = { top: 20, right: 0, bottom: 30, left: 170 };
const INIT_WINDOW  = 30;
const formatWeight = d3.format('.3~g');

// classes: [{ class, weight }], in the order to draw them, top to bottom
export function renderClassPrior(container, classes) {
    container.innerHTML = '';

    const { gFocus, focusClipped, gContext, dims } = createFocusContextLayout(container, MARGIN);

    const yAxisGrp = gFocus.append('g');
    const xAxisGrp = gFocus.append('g').attr('transform', `translate(0,${dims.focusH})`);

    drawContextBars(gContext, classes, dims);

    const updateFocus = (start, end) => {
        drawFocusBars(focusClipped, yAxisGrp, xAxisGrp, classes.slice(start, end), dims);
    };

    const { brush, brushGroup } = attachBrushY(gContext, dims, classes.length, updateFocus);

    const initEnd = Math.min(classes.length, INIT_WINDOW);
    brushGroup.call(brush.move, [0, dims.focusH * initEnd / classes.length]);
}

// --- private helpers ---

// the colour the class has on the map, as in the other class charts
function classColour(className) {
    if (className === 'Zero') return '#000';
    if (state.cellClassColors && state.cellClassColors.has(className)) {
        const c = state.cellClassColors.get(className);
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
    return '#888';
}

function drawContextBars(gContext, classes, { focusH, contextW }) {
    const xCtx = d3.scaleLinear().domain([0, d3.max(classes, d => d.weight)]).range([0, contextW]);
    const barH = Math.max(1, focusH / classes.length);

    gContext.selectAll('.ctx-bar').data(classes).enter().append('rect')
        .attr('class', 'ctx-bar')
        .attr('x', 0)
        .attr('y', (_, i) => i * barH)
        .attr('width',  d => xCtx(d.weight))
        .attr('height', Math.max(1, barH - 0.3))
        .attr('fill',    'rgba(255,255,255,0.6)')
        .attr('opacity', 0.35);
}

function drawFocusBars(group, yAxisGrp, xAxisGrp, visible, { focusW, focusH }) {
    if (!visible.length) return;

    const yScale = d3.scaleBand()
        .domain(visible.map(d => d.class))
        .range([0, focusH])
        .padding(0.15);

    const xScale = d3.scaleLinear()
        .domain([0, d3.max(visible, d => d.weight) * 1.05])
        .range([0, focusW]);

    const bars = group.selectAll('.bar').data(visible, d => d.class);
    bars.exit().remove();
    bars.enter().append('rect').attr('class', 'bar')
        .merge(bars)
        .attr('y',      d => yScale(d.class))
        .attr('height', yScale.bandwidth())
        .attr('x', 0)
        .attr('width',  d => xScale(d.weight))
        .attr('fill',   d => classColour(d.class))
        .attr('stroke', 'rgba(255, 255, 255, 0.2)')
        .attr('stroke-width', 0.5)
        .attr('opacity', 0.8)
        .on('mouseenter', (e, d) => showTooltip(
            `<strong>${escapeHtml(d.class)}</strong><br/>weight = ${formatWeight(d.weight)}`, e.pageX, e.pageY))
        .on('mousemove',  (e)    => moveTooltip(e.pageX, e.pageY))
        .on('mouseleave', ()     => hideTooltip());

    yAxisGrp.call(d3.axisLeft(yScale).tickSize(0).tickPadding(6));
    xAxisGrp.call(d3.axisBottom(xScale).ticks(5).tickFormat(formatWeight));

    styleAxis(yAxisGrp);
    styleAxis(xAxisGrp);
}

function styleAxis(grp) {
    grp.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
    grp.selectAll('.tick text')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .style('font-size', '10px');
}
