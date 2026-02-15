// Render a simple Excel-like gene counts table (left of donut)
// Expects cellData with Genenames[] and CellGeneCount[]
(function(){
    function formatCount(v) {
        var n = Number(v);
        if (!isFinite(n)) return '';
        // Truncate to two decimals (no rounding)
        var t = Math.trunc(n * 100) / 100;
        return t.toFixed(2);
    }

    function renderGeneTable(cellData) {
        try {
            var tableEl = document.getElementById('geneCountsTable');
            if (!tableEl) return;

            var rows = [];
            var names = Array.isArray(cellData.Genenames) ? cellData.Genenames : [];
            var counts = Array.isArray(cellData.CellGeneCount) ? cellData.CellGeneCount : [];
            var N = Math.max(names.length, counts.length);
            for (var i = 0; i < N; i++) {
                rows.push({ gene: names[i] || '', count: Number(counts[i]) || 0 });
            }
            rows.sort(function(a, b){ return b.count - a.count; });

            // Build HTML table
            var html = '';
            html += '<thead><tr><th>Gene</th><th style="text-align:right; padding-left: 40px;">Counts</th></tr></thead>';
            html += '<tbody>';
            for (var j = 0; j < rows.length; j++) {
                var r = rows[j];
                html += '<tr>' +
                        '<td>' + r.gene + '</td>' +
                        '<td style="text-align:right; white-space:nowrap; padding-left: 40px;">' + formatCount(r.count) + '</td>' +
                        '</tr>';
            }
            html += '</tbody>';

            tableEl.innerHTML = html;
        } catch (e) {
            console.warn('renderGeneTable failed:', e);
        }
    }

    function renderClassLegend(cellData) {
        try {
            var container = document.getElementById('classLegend');
            if (!container) return;

            var names = Array.isArray(cellData.ClassName) ? cellData.ClassName : [];
            var probs = Array.isArray(cellData.Prob) ? cellData.Prob : [];
            var rows = [];
            for (var i = 0; i < names.length; i++) {
                rows.push({ name: names[i] || '', prob: Number(probs[i]) || 0 });
            }
            rows.sort(function(a, b) { return b.prob - a.prob; });

            var html = '';
            for (var j = 0; j < rows.length; j++) {
                var r = rows[j];
                var color = (typeof window.getClassColor === 'function')
                    ? window.getClassColor(r.name)
                    : '#C0C0C0';
                var pct = (r.prob * 100).toFixed(1) + '%';
                html += '<div class="legend-row" data-class="' + r.name + '">'
                      + '<span class="legend-dot" style="background:' + color + '"></span>'
                      + '<span class="legend-name" title="' + r.name + '">' + r.name + '</span>'
                      + '<span class="legend-prob">' + pct + '</span>'
                      + '</div>';
            }
            container.innerHTML = html;

            // Attach hover events for cross-highlighting
            var legendRows = container.querySelectorAll('.legend-row');
            legendRows.forEach(function(row) {
                row.addEventListener('mouseenter', function() {
                    if (typeof window.highlightClass === 'function') {
                        window.highlightClass(this.dataset.class);
                    }
                });
                row.addEventListener('mouseleave', function() {
                    if (typeof window.clearHighlight === 'function') {
                        window.clearHighlight();
                    }
                });
            });
        } catch (e) {
            console.warn('renderClassLegend failed:', e);
        }
    }

    // Expose globally
    window.renderGeneTable = renderGeneTable;
    window.renderClassLegend = renderClassLegend;
})();