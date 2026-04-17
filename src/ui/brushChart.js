// Reusable focus + context + brushY layout for vertical item lists (e.g. genes on Y-axis).
// Returns the SVG groups and dimensions; callers handle their own scales and bar drawing.

const CONTEXT_W = 40;
const GAP       = 12;

export function createFocusContextLayout(container, margin) {
    const totalW = container.clientWidth;
    const totalH = container.clientHeight;

    const focusW = totalW - margin.left - margin.right - CONTEXT_W - GAP;
    const focusH = totalH - margin.top  - margin.bottom;

    const svg = d3.select(container).append('svg')
        .attr('width',  totalW)
        .attr('height', totalH);

    const clipId = `fc-clip-${Math.random().toString(36).slice(2, 8)}`;
    svg.append('defs').append('clipPath').attr('id', clipId)
        .append('rect').attr('width', focusW).attr('height', focusH);

    const gFocus = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const focusClipped = gFocus.append('g')
        .attr('clip-path', `url(#${clipId})`);

    const contextLeft = margin.left + focusW + GAP;
    const gContext = svg.append('g')
        .attr('transform', `translate(${contextLeft},${margin.top})`);

    return {
        svg,
        gFocus,
        focusClipped,
        gContext,
        dims: { focusW, focusH, contextW: CONTEXT_W, totalW, totalH },
    };
}

export function attachBrushY(gContext, dims, itemCount, onBrush) {
    const { contextW, focusH } = dims;
    const scale = d3.scaleLinear().domain([0, itemCount]).range([0, focusH]);

    const brush = d3.brushY()
        .extent([[0, 0], [contextW, focusH]])
        .on('brush end', event => {
            if (!event.selection) { onBrush(0, itemCount); return; }
            const [v0, v1] = event.selection;
            const start = Math.max(0, Math.floor(scale.invert(v0)));
            const end   = Math.min(itemCount, Math.ceil(scale.invert(v1)));
            if (end > start) onBrush(start, end);
        });

    const brushGroup = gContext.append('g').attr('class', 'brush').call(brush);

    brushGroup.selectAll('.selection')
        .attr('fill',   'rgba(255,255,255,0.15)')
        .attr('stroke', 'rgba(255,255,255,0.4)');

    return { brush, brushGroup, scale };
}
