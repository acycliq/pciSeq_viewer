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
    const container = document.getElementById('classLegend');
    if (!container) return;

    const names = Array.isArray(cellData.ClassName) ? cellData.ClassName : [];
    const probs = Array.isArray(cellData.Prob) ? cellData.Prob : [];

    // Build rows sorted by probability descending
    const rows = [];
    for (let i = 0; i < names.length; i++) {
        rows.push({ name: names[i] || '', prob: Number(probs[i]) || 0 });
    }
    rows.sort((a, b) => b.prob - a.prob);

    // Build HTML
    let html = '';
    for (let j = 0; j < rows.length; j++) {
        const r = rows[j];
        const color = getClassColor(r.name);
        const pct = (r.prob * 100).toFixed(1) + '%';
        html += '<div class="legend-row" data-class="' + r.name + '">'
              + '<span class="legend-dot" style="background:' + color + '"></span>'
              + '<span class="legend-name" title="' + r.name + '">' + r.name + '</span>'
              + '<span class="legend-prob">' + pct + '</span>'
              + '</div>';
    }
    container.innerHTML = html;

    // Attach hover events for cross-highlighting with donut chart
    const legendRows = container.querySelectorAll('.legend-row');
    legendRows.forEach(function(row) {
        row.addEventListener('mouseenter', function() {
            highlightClass(this.dataset.class);
        });
        row.addEventListener('mouseleave', function() {
            clearHighlight();
        });
    });
}
