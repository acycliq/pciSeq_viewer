function donut(){

    var cornerRadius = 3, // sets how rounded the corners are on each slice
        padAngle = 0.015; // effectively dictates the gap between slices

    var width = +d3.select("#cellInfoChart").select("svg").attr("width"),
        height = +d3.select("#cellInfoChart").select("svg").attr("height")

    var radius = Math.min(width, height) / 2;

    var svg = d3.select("#cellInfoChart")
        .select("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")"); // Moving the center point

    svg.append("defs").append("pattern")
        .attr('id','myPattern')
        .attr("width", 4)
        .attr("height", 4)
        .attr('patternUnits',"userSpaceOnUse")
        .append('path')
        .attr('fill','none')
        .attr('stroke','#335553')
        .attr('stroke-width','1')
        .attr('d','M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2' );

    svg.append("g")
        .attr("class", "slices");

    var pie = d3.pie()
        .sort(null)
        .value(function(d) {
            return d.value;
        });

    var arc = d3.arc()
        .outerRadius(radius * 0.8)
        .innerRadius(radius * 0.4)
        .cornerRadius(cornerRadius)
        .padAngle(padAngle);

    var key = function(d){ return d.data.label; };

    // Use the color schemes from your project
    var colorMap = new Map();
    try {
        let merged = [];
        // 1) Prefer explicitly set currentColorScheme
        if (window.currentColorScheme && Array.isArray(window.currentColorScheme.cellClasses)) {
            merged = merged.concat(window.currentColorScheme.cellClasses);
        }
        // 2) Add selected scheme from config/colorSchemes.js
        if (typeof window.classColorsCodes === 'function') {
            const base = window.classColorsCodes();
            if (Array.isArray(base)) merged = merged.concat(base);
        }
        // 3) Merge any additional known schemes if present (for cross-dataset labels)
        if (typeof window.classColorsCodes_hippocampus === 'function') {
            const hip = window.classColorsCodes_hippocampus();
            if (Array.isArray(hip)) merged = merged.concat(hip);
        }
        if (typeof window.classColorsCodes_zeisel === 'function') {
            const zei = window.classColorsCodes_zeisel();
            if (Array.isArray(zei)) merged = merged.concat(zei);
        }
        if (typeof window.classColorsCodes_allen === 'function') {
            const aln = window.classColorsCodes_allen();
            if (Array.isArray(aln)) merged = merged.concat(aln);
        }
        // Build map (later entries can overwrite earlier ones if duplicate)
        merged.forEach(cellClass => {
            if (cellClass && cellClass.className) colorMap.set(cellClass.className, cellClass);
        });
        if (!colorMap.has('Other')) colorMap.set('Other', { className: 'Other', color: '#C0C0C0' });
        if (!colorMap.has('Generic')) colorMap.set('Generic', { className: 'Generic', color: '#C0C0C0' });
    } catch {}

    // Create a single tooltip container
    var div = d3.select("body").append("div")
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

    var donutData = {};
    donutData.radius = radius;
    donutData.pie = pie;
    donutData.arc = arc;
    donutData.key = key;
    donutData.colorMap = colorMap;
    donutData.div = div;
    donutData.svg = svg;

    return donutData;
}

// Shared color resolver — used by donut and legend
window.getClassColor = function(className) {
    if (typeof donutData !== 'undefined' && donutData && donutData.colorMap) {
        var entry = donutData.colorMap.get(className);
        if (entry && entry.color) return entry.color;
    }
    try {
        var map = window.appState && window.appState.cellClassColors;
        if (map && map.has && map.has(className)) {
            var rgb = map.get(className);
            if (Array.isArray(rgb) && rgb.length >= 3) {
                var toHex = function(v) { return ('0' + Math.max(0, Math.min(255, v|0)).toString(16)).slice(-2); };
                return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
            }
        }
    } catch(e) {}
    return '#C0C0C0';
};

// Cross-highlight functions — shared between donut slices and legend rows
window.highlightClass = function(className) {
    d3.select('#cellInfoChart').selectAll('path.slice')
        .classed('dimmed', function(d) { return d.data.label !== className; })
        .classed('highlight', function(d) { return d.data.label === className; });
    var legendRows = document.querySelectorAll('#classLegend .legend-row');
    legendRows.forEach(function(row) {
        row.classList.toggle('highlight', row.dataset.class === className);
    });
};

window.clearHighlight = function() {
    d3.select('#cellInfoChart').selectAll('path.slice')
        .classed('dimmed', false)
        .classed('highlight', false);
    var legendRows = document.querySelectorAll('#classLegend .legend-row');
    legendRows.forEach(function(row) { row.classList.remove('highlight'); });
};

function donutchart(dataset) {
    console.log('donutchart called with dataset:', dataset);

    const percentFormat = d3.format('.2%');

    if (!dataset || !dataset.ClassName || !dataset.Prob) {
        console.warn('Missing ClassName or Prob data:', dataset);
        return;
    }

    // Build data array — show ALL classes, no bucketing
    let data = [];
    for (let i = 0; i < dataset.ClassName.length; i++) {
        data.push({ value: dataset.Prob[i], label: dataset.ClassName[i] });
    }

    // Sort descending
    data.sort((a, b) => d3.ascending(b.value, a.value));

    const svg = d3.select('#cellInfoChart').select('svg');
    if (svg.select('.slices').empty()) {
        donutData = donut();
    }

    function class_color(class_label) {
        return window.getClassColor(class_label);
    }

    /* ------- PIE SLICES -------*/
    const slice = svg.select('.slices').selectAll('path.slice')
        .data(donutData.pie(data), donutData.key);

    slice.enter()
        .insert('path')
        .attr('class', 'slice')
        .attr('data-class', function(d) { return d.data.label; })
        .on('mouseenter', function(event, d) {
            window.highlightClass(d.data.label);
        })
        .on('mousemove', function(event) { mousemoveHandler.call(this, event); })
        .on('mouseleave', function() {
            window.clearHighlight();
            donutData.div.style('display', 'none');
        })
        .merge(slice)
        .attr('data-class', function(d) { return d.data.label; })
        .style('fill', function(d) { return class_color(d.data.label); })
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

    function mousemoveHandler(event) {
        donutData.div.style('left', (event.pageX + 10) + 'px');
        donutData.div.style('top', (event.pageY - 25) + 'px');
        donutData.div.style('display', 'inline-block');
        donutData.div.style('opacity', 0.8);
        donutData.div.html((this.__data__.data.label) + '<br>' + percentFormat(this.__data__.data.value));
    }

    return svg;
}