/**
 * Donut Chart Module
 *
 * D3-based donut chart showing cell class probabilities.
 * Assumes d3 is available globally (loaded via script tag in index.html).
 */

import { getClassColor } from './colorResolver.js';
import { highlightClass, clearHighlight } from './highlight.js';

// Module-scoped D3 state — holds the pie layout, arc generator, tooltip, and SVG group.
// Initialized lazily on first render.
let donutData = null;

/**
 * Initialize the donut chart SVG structure.
 * Creates the pie layout, arc generator, and tooltip.
 */
function initDonut() {
    const cornerRadius = 3;
    const padAngle = 0.015;

    const width = +d3.select("#cellInfoChart").select("svg").attr("width");
    const height = +d3.select("#cellInfoChart").select("svg").attr("height");
    const radius = Math.min(width, height) / 2;

    const svg = d3.select("#cellInfoChart")
        .select("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

    svg.append("defs").append("pattern")
        .attr('id', 'myPattern')
        .attr("width", 4)
        .attr("height", 4)
        .attr('patternUnits', "userSpaceOnUse")
        .append('path')
        .attr('fill', 'none')
        .attr('stroke', '#335553')
        .attr('stroke-width', '1')
        .attr('d', 'M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2');

    svg.append("g")
        .attr("class", "slices");

    const pie = d3.pie()
        .sort(null)
        .value(function(d) { return d.value; });

    const arc = d3.arc()
        .outerRadius(radius * 0.8)
        .innerRadius(radius * 0.4)
        .cornerRadius(cornerRadius)
        .padAngle(padAngle);

    const key = function(d) { return d.data.label; };

    const tooltip = d3.select("body").append("div")
        .attr("class", "donutTooltip")
        .style('position', 'absolute')
        .style('z-index', '1000')
        .style('display', 'none')
        .style('background', 'rgba(0,0,0,0.8)')
        .style('color', 'white')
        .style('padding', '8px')
        .style('border-radius', '4px')
        .style('font-size', '12px')
        .style('pointer-events', 'none')
        .style('opacity', 0);

    donutData = { radius, pie, arc, key, tooltip, svg };
}

/**
 * Render or update the donut chart with cell classification data.
 * @param {Object} dataset - Cell data with ClassName[] and Prob[]
 */
export function renderDonut(dataset) {
    console.log('donutchart called with dataset:', dataset);

    const percentFormat = d3.format('.2%');

    if (!dataset || !dataset.ClassName || !dataset.Prob) {
        console.warn('Missing ClassName or Prob data:', dataset);
        return;
    }

    // Build data array — one entry per class, sorted descending by probability
    const data = [];
    for (let i = 0; i < dataset.ClassName.length; i++) {
        data.push({ value: dataset.Prob[i], label: dataset.ClassName[i] });
    }
    data.sort((a, b) => b.value - a.value);

    // Lazy init on first call
    const svg = d3.select('#cellInfoChart').select('svg');
    if (!donutData || svg.select('.slices').empty()) {
        initDonut();
    }

    /* ------- PIE SLICES ------- */
    const slice = svg.select('.slices').selectAll('path.slice')
        .data(donutData.pie(data), donutData.key);

    slice.enter()
        .insert('path')
        .attr('class', 'slice')
        .attr('data-class', function(d) { return d.data.label; })
        .on('mouseenter', function(event, d) {
            highlightClass(d.data.label);
        })
        .on('mousemove', function(event, d) {
            donutData.tooltip
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 25) + 'px')
                .style('display', 'inline-block')
                .style('opacity', 0.8)
                .html(d.data.label + '<br>' + percentFormat(d.data.value));
        })
        .on('mouseleave', function() {
            clearHighlight();
            donutData.tooltip.style('display', 'none');
        })
        .merge(slice)
        .attr('data-class', function(d) { return d.data.label; })
        .style('fill', function(d) { return getClassColor(d.data.label); })
        .transition().duration(1000)
        .attrTween('d', function(d) {
            this._current = this._current || d;
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(1);
            return function(t) {
                return donutData.arc(interpolate(t));
            };
        });

    slice.exit().remove();
}
