import { showTooltip, moveTooltip, hideTooltip } from '../../ui/chartTooltip.js';

const MARGIN     = { top: 36, right: 20, bottom: 40, left: 50 };
const C_MISREAD  = '#e05252';
const C_ASSIGNED = '#4a9eff';

export function renderPerPlane(container, data, geneName) {
    container.innerHTML = '';

    if (!data.length) {
        container.innerHTML = `<div class="glass-loader">No data found for <strong>${geneName}</strong>.</div>`;
        return;
    }

    const totalW = container.clientWidth;
    const totalH = container.clientHeight;
    const w = totalW - MARGIN.left - MARGIN.right;
    const h = totalH - MARGIN.top  - MARGIN.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width',  totalW)
        .attr('height', totalH);

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    const xScale = d3.scaleBand()
        .domain(data.map(d => d.plane))
        .range([0, w])
        .padding(0.1);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.misread + d.assigned)])
        .nice()
        .range([h, 0]);

    const stacked = d3.stack().keys(['misread', 'assigned'])(data);
    const colors  = [C_MISREAD, C_ASSIGNED];

    stacked.forEach((layer, li) => {
        g.selectAll(`.bar-${li}`).data(layer).enter().append('rect')
            .attr('class', `bar-${li}`)
            .attr('x',      d => xScale(d.data.plane))
            .attr('width',  xScale.bandwidth())
            .attr('y',      d => yScale(d[1]))
            .attr('height', d => yScale(d[0]) - yScale(d[1]))
            .attr('fill',   colors[li])
            .attr('opacity', 0.85)
            .on('mouseenter', (e, d) => {
                const total = d.data.misread + d.data.assigned;
                const pct   = total > 0 ? ((d.data.misread / total) * 100).toFixed(1) : '0.0';
                showTooltip(
                    `<strong>Plane ${d.data.plane}</strong><br/>` +
                    `Assigned: ${d.data.assigned}<br/>` +
                    `Misread: ${d.data.misread}<br/>` +
                    `Misread %: ${pct}%`,
                    e.pageX, e.pageY);
            })
            .on('mousemove',  (e) => moveTooltip(e.pageX, e.pageY))
            .on('mouseleave', ()  => hideTooltip());
    });

    drawAxes(g, data, xScale, yScale, w, h, geneName);
    drawLegend(g, w);
}

function drawAxes(g, data, xScale, yScale, w, h, geneName) {
    const tickStep = Math.max(1, Math.ceil(data.length / 20));
    const xAxis = d3.axisBottom(xScale)
        .tickValues(data.filter((_, i) => i % tickStep === 0).map(d => d.plane));

    g.append('g').attr('transform', `translate(0,${h})`).call(xAxis)
        .append('text').attr('x', w / 2).attr('y', 35)
        .attr('fill', 'rgba(255,255,255,0.5)').style('font-size', '11px')
        .attr('text-anchor', 'middle').text('Plane');

    g.append('g').call(d3.axisLeft(yScale).ticks(5))
        .append('text')
        .attr('transform', 'rotate(-90)').attr('x', -h / 2).attr('y', -40)
        .attr('fill', 'rgba(255,255,255,0.5)').style('font-size', '11px')
        .attr('text-anchor', 'middle').text('Spot count');

    g.selectAll('.domain, .tick line').attr('stroke', 'rgba(255,255,255,0.1)');
    g.selectAll('.tick text').attr('fill', 'rgba(255,255,255,0.6)').style('font-size', '10px');

    const total = d3.sum(data, d => d.misread);
    g.append('text').attr('x', w).attr('y', -22)
        .attr('fill', 'rgba(255,255,255,0.35)').style('font-size', '10px')
        .attr('text-anchor', 'end')
        .text(`${geneName} · total misreads: ${total}`);
}

function drawLegend(g, w) {
    const legend = g.append('g').attr('transform', `translate(${w / 2 - 75}, -32)`);
    [['Misread', C_MISREAD], ['Assigned', C_ASSIGNED]].forEach(([label, color], i) => {
        const lg = legend.append('g').attr('transform', `translate(${i * 90}, 0)`);
        lg.append('rect').attr('width', 10).attr('height', 10).attr('fill', color).attr('opacity', 0.85);
        lg.append('text').attr('x', 14).attr('y', 9)
            .attr('fill', 'rgba(255,255,255,0.6)').style('font-size', '10px').text(label);
    });
}