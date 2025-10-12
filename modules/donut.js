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
    svg.append("g")
        .attr("class", "sliceLabels");
    svg.append("g")
        .attr("class", "lines");

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

    var outerArc = d3.arc()
        .innerRadius(radius * 0.85)
        .outerRadius(radius * 0.85);

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
    donutData.outerArc = outerArc;
    donutData.key = key;
    donutData.colorMap = colorMap;
    donutData.div = div;
    donutData.svg = svg;

    return donutData;
}

function donutchart(dataset) {
    console.log('donutchart called with dataset:', dataset);

    const percentFormat = d3.format('.2%');

    if (!dataset || !dataset.ClassName || !dataset.Prob) {
        console.warn('Missing ClassName or Prob data:', dataset);
        return;
    }

    // Build initial array
    let data = [];
    for (let i = 0; i < dataset.ClassName.length; i++) {
        data.push({ value: dataset.Prob[i], label: dataset.ClassName[i] });
    }

    // Bucket small values into 'Other' then sum by label (D3 v7)
    const sdata = [];
    for (let i = 0; i < dataset.Prob.length; i++) {
        const lbl = dataset.Prob[i] < 0.02 ? 'Other' : dataset.ClassName[i];
        sdata.push({ Prob: dataset.Prob[i], labels: lbl });
    }
    data = d3.rollups(
        sdata,
        v => d3.sum(v, d => d.Prob),
        d => d.labels
    ).map(([label, value]) => ({ label, value }));

    // Sort descending
    data.sort((a, b) => d3.ascending(b.value, a.value));

    const svg = d3.select('#cellInfoChart').select('svg');
    if (svg.select('.slices').empty()) {
        donutData = donut();
    }

    function class_color(class_label) {
        // 1) Try explicit color scheme map
        let cellClass = donutData.colorMap.get(class_label);
        if (cellClass && cellClass.color) return cellClass.color;
        // 2) Try app state's polygon colors for consistency
        try {
            const map = window.appState && window.appState.cellClassColors;
            if (map && map.has && map.has(class_label)) {
                const rgb = map.get(class_label);
                if (Array.isArray(rgb) && rgb.length >= 3) {
                    const toHex = (v) => ('0' + Math.max(0, Math.min(255, v|0)).toString(16)).slice(-2);
                    return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
                }
            }
        } catch {}
        // 3) Fallback generics
        const generic = donutData.colorMap.get('Generic') || donutData.colorMap.get('Other');
        return generic ? generic.color : '#C0C0C0';
    }

    /* ------- PIE SLICES -------*/
    const slice = svg.select('.slices').selectAll('path.slice')
        .data(donutData.pie(data), donutData.key);

    slice.enter()
        .insert('path')
        .attr('class', 'slice')
        .on('mousemove', function(event) { mousemoveHandler.call(this, event); })
        .on('mouseout', function() {
            donutData.div.style('display', 'none');
        })
        .merge(slice)
        .style('fill', d => class_color(d.data.label))
        .transition().duration(1000)
        .attrTween('d', function(d) {
            this._current = this._current || d;
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(0);
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

    /* ------- TEXT LABELS -------*/
    const text = svg.select('.sliceLabels').selectAll('text')
        .data(donutData.pie(data), donutData.key);

    function midAngle(d) { return d.startAngle + (d.endAngle - d.startAngle) / 2; }

    text.enter()
        .append('text')
        .attr('dy', '.35em')
        .text(d => `${d.data.label} ${percentFormat(d.data.value)}`)
        .merge(text)
        .transition().duration(1000)
        .attrTween('transform', function(d) {
            this._current = this._current || d;
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(0);
            return function(t) {
                const d2 = interpolate(t);
                const pos = donutData.outerArc.centroid(d2);
                // Pull labels slightly inward so they stay within SVG viewport
                pos[0] = donutData.radius * 0.8 * (midAngle(d2) < Math.PI ? 1 : -1);
                return 'translate(' + pos + ')';
            };
        })
        .styleTween('text-anchor', function(d) {
            this._current = this._current || d;
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(0);
            return function(t) {
                const d2 = interpolate(t);
                return midAngle(d2) < Math.PI ? 'start' : 'end';
            };
        });

    text.exit().remove();

    /* ------- SLICE TO TEXT POLYLINES -------*/
    const polyline = svg.select('.lines').selectAll('polyline')
        .data(donutData.pie(data), donutData.key);

    polyline.enter()
        .append('polyline')
        .merge(polyline)
        .transition().duration(1000)
        .attrTween('points', function(d) {
            this._current = this._current || d;
            const interpolate = d3.interpolate(this._current, d);
            this._current = interpolate(0);
            return function(t) {
                const d2 = interpolate(t);
                const pos = donutData.outerArc.centroid(d2);
                // Keep leader line end near label position
                pos[0] = donutData.radius * 0.8 * (midAngle(d2) < Math.PI ? 1 : -1);
                return [donutData.arc.centroid(d2), donutData.outerArc.centroid(d2), pos];
            };
        });

    polyline.exit().remove();

    return svg;
}
