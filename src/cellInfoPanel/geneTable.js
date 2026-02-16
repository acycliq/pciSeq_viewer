/**
 * Gene Table Module
 *
 * Renders the gene counts table (left column of the cell info panel).
 * Expects cellData with Genenames[] and CellGeneCount[].
 */

/**
 * Truncate a number to two decimal places (no rounding).
 * @param {number|string} v - The value to format
 * @returns {string} Formatted string with 2 decimal places
 */
function formatCount(v) {
    const n = Number(v);
    if (!isFinite(n)) return '';
    const truncated = Math.trunc(n * 100) / 100;
    return truncated.toFixed(2);
}

/**
 * Render the gene expression counts table.
 * @param {Object} cellData - Cell data with Genenames[] and CellGeneCount[]
 */
export function renderGeneTable(cellData) {
    const tableEl = document.getElementById('geneCountsTable');
    if (!tableEl) return;

    const names = Array.isArray(cellData.Genenames) ? cellData.Genenames : [];
    const counts = Array.isArray(cellData.CellGeneCount) ? cellData.CellGeneCount : [];
    const N = Math.max(names.length, counts.length);

    // Build rows sorted by count descending
    const rows = [];
    for (let i = 0; i < N; i++) {
        rows.push({ gene: names[i] || '', count: Number(counts[i]) || 0 });
    }
    rows.sort((a, b) => b.count - a.count);

    // Build HTML table
    let html = '';
    html += '<thead><tr><th>Gene</th><th style="text-align:right; padding-left: 40px;">Counts</th></tr></thead>';
    html += '<tbody>';
    for (let j = 0; j < rows.length; j++) {
        const r = rows[j];
        html += '<tr>' +
                '<td>' + r.gene + '</td>' +
                '<td style="text-align:right; white-space:nowrap; padding-left: 40px;">' + formatCount(r.count) + '</td>' +
                '</tr>';
    }
    html += '</tbody>';

    tableEl.innerHTML = html;
}
