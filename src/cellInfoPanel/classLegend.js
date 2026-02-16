/**
 * Class Legend Module
 *
 * Renders the scrollable class legend (right column of the cell info panel).
 * Each row shows a color dot, class name, and probability percentage.
 */

import { getClassColor } from './colorResolver.js';
import { highlightClass, clearHighlight } from './highlight.js';

/**
 * Render the class legend for a cell.
 * @param {Object} cellData - Cell data with ClassName[] and Prob[]
 */
export function renderClassLegend(cellData) {
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
            var color = getClassColor(r.name);
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
                highlightClass(this.dataset.class);
            });
            row.addEventListener('mouseleave', function() {
                clearHighlight();
            });
        });
    } catch (e) {
        console.warn('renderClassLegend failed:', e);
    }
}
