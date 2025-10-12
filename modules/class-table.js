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

    // Expose globally
    window.renderGeneTable = renderGeneTable;
})();
