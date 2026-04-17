import { createFocusContextLayout, attachBrushY } from '../../ui/brushChart.js';
import { showTooltip, moveTooltip, hideTooltip } from '../../ui/chartTooltip.js';

const MARGIN     = { top: 30, right: 0, bottom: 30, left: 110 };
const C_ASSIGNED = '#4a9eff';
const C_MISREAD  = '#e05252';
const INIT_WINDOW = 30;

export function renderStackedBar(container, data) {
    container.innerHTML = '';

    if (!data.length) {
        container.innerHTML = '<div class="glass-loader">No spot data available.</div>';
        return;
    }

    const { gFocus, focusClipped, gContext, dims } = createFocusContextLayout(container, MARGIN);

    const yAxisGrp = gFocus.append('g');
    const xAxisGrp = gFocus.append('g').attr('transform', `translate(0,${dims.focusH})`);

    drawLegend(gFocus, dims.focusW);
    drawContextBars(gContext, data, dims);

    const updateFocus = (start, end) => {
        drawFocusBars(focusClipped, yAxisGrp, xAxisGrp, data.slice(start, end), dims);
    };

    const { brush, brushGroup } = attachBrushY(gContext, dims, data.length, updateFocus);

    const initEnd = Math.min(data.length, INIT_WINDOW);
    brushGroup.call(brush.move, [0, dims.focusH * initEnd / data.length]);
}

// --- private helpers ---

function drawContextBars(gContext, data, { focusH, contextW }) {
    const maxTotal = d3.max(data, d => d.assigned + d.misread);
    const xCtx = d3.scaleLinear().domain([0, maxTotal]).range([0, contextW]);
    const barH  = Math.max(1, focusH / data.length);

    const stacked = d3.stack().keys(['misread', 'assigned'])(data);

    stacked.forEach((layer, li) => {
        gContext.selectAll(`.ctx-${li}`).data(layer).enter().append('rect')
            .attr('class', `ctx-${li}`)
            .attr('x',      d => xCtx(d[0]))
            .attr('y',      (_, i) => i * barH)
            .attr('width',  d => xCtx(d[1]) - xCtx(d[0]))
            .attr('height', Math.max(1, barH - 0.3))
            .attr('fill',   li === 0 ? C_MISREAD : C_ASSIGNED)
            .attr('opacity', 0.35);
    });
}

function drawFocusBars(group, yAxisGrp, xAxisGrp, visible, { focusW, focusH }) {
    if (!visible.length) return;

    const yScale = d3.scaleBand()
        .domain(visible.map(d => d.gene))
        .range([0, focusH])
        .padding(0.15);

    const maxTotal = d3.max(visible, d => d.assigned + d.misread);
    const xScale = d3.scaleLinear().domain([0, maxTotal * 1.05]).range([0, focusW]);

    const stacked = d3.stack().keys(['misread', 'assigned'])(visible);
    const colors  = [C_MISREAD, C_ASSIGNED];

    group.selectAll('.stack-layer').remove();

    stacked.forEach((layer, li) => {
        group.append('g').attr('class', 'stack-layer')
            .selectAll('rect').data(layer, d => d.data.gene).enter().append('rect')
            .attr('y',      d => yScale(d.data.gene))
            .attr('height', yScale.bandwidth())
            .attr('x',      d => xScale(d[0]))
            .attr('width',  d => xScale(d[1]) - xScale(d[0]))
            .attr('fill',   colors[li])
            .attr('opacity', 0.85)
            .on('mouseenter', (e, d) => {
                const pct = ((d.data.misread / (d.data.assigned + d.data.misread)) * 100).toFixed(1);
                showTooltip(
                    `<strong>${d.data.gene}</strong><br/>` +
                    `Assigned: ${d.data.assigned}<br/>` +
                    `Misread: ${d.data.misread}<br/>` +
                    `Misread %: ${pct}%`,
                    e.pageX, e.pageY);
            })
            .on('mousemove',  (e)  => moveTooltip(e.pageX, e.pageY))
            .on('mouseleave', ()   => hideTooltip());
    });

    yAxisGrp.call(d3.axisLeft(yScale).tickSize(0).tickPadding(6));
    xAxisGrp.call(d3.axisBottom(xScale).ticks(5));

    styleAxis(yAxisGrp);
    styleAxis(xAxisGrp);
}

function drawLegend(gFocus, focusW) {
    // Centred in the top margin, well above the first bar
    const legend = gFocus.append('g').attr('transform', `translate(${focusW / 2 - 75}, -22)`);
    [['Misread', C_MISREAD], ['Assigned', C_ASSIGNED]].forEach(([label, color], i) => {
        const g = legend.append('g').attr('transform', `translate(${i * 90}, 0)`);
        g.append('rect').attr('width', 10).attr('height', 10).attr('fill', color).attr('opacity', 0.85);
        g.append('text').attr('x', 14).attr('y', 9)
            .attr('fill', 'rgba(255,255,255,0.6)').style('font-size', '10px').text(label);
    });
}

function styleAxis(grp) {
    grp.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
    grp.selectAll('.tick text')
        .attr('fill', 'rgba(255,255,255,0.6)')
        .style('font-size', '10px');
}