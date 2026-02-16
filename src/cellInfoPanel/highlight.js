/**
 * Highlight Module
 *
 * Cross-highlight functions shared between donut chart slices and legend rows.
 * Hovering a donut slice highlights the corresponding legend row and vice versa.
 */

/**
 * Highlight a specific cell class across donut and legend.
 * Dims all other slices/rows.
 * @param {string} className - The cell class to highlight
 */
export function highlightClass(className) {
    d3.select('#cellInfoChart').selectAll('path.slice')
        .classed('dimmed', function(d) { return d.data.label !== className; })
        .classed('highlight', function(d) { return d.data.label === className; });
    const legendRows = document.querySelectorAll('#classLegend .legend-row');
    legendRows.forEach(function(row) {
        row.classList.toggle('highlight', row.dataset.class === className);
    });
}

/**
 * Clear all cross-highlight state from donut and legend.
 */
export function clearHighlight() {
    d3.select('#cellInfoChart').selectAll('path.slice')
        .classed('dimmed', false)
        .classed('highlight', false);
    const legendRows = document.querySelectorAll('#classLegend .legend-row');
    legendRows.forEach(function(row) { row.classList.remove('highlight'); });
}
