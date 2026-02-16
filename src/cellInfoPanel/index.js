/**
 * Cell Info Panel Module
 *
 * Self-contained ES module for the cell information panel that displays
 * when hovering over cells. Shows cell metadata, gene expression, and
 * classification data via a donut chart, gene table, and class legend.
 *
 * Public API:
 *   init()                    - bind close button, Ctrl listener, init color scheme
 *   update(cellProperties)    - update donut + gene table + legend + header
 *   show()                    - show panel (respects pin state)
 *   hide()                    - hide panel (blocked when pinned)
 *   forceHide()               - always hides, clears pin
 */

import { initColorScheme } from './colorResolver.js';
import { renderDonut } from './donutChart.js';
import { renderClassLegend } from './classLegend.js';
import { renderGeneTable } from './geneTable.js';
import {
    init as initPinController,
    show,
    hide,
    forceHide
} from './pinController.js';

// Re-export show/hide/forceHide directly from pinController (no wrappers)
export { show, hide, forceHide };

/**
 * Initialize the cell info panel.
 * Binds the close button, registers the Ctrl pin listener, and loads colors.
 */
export function init() {
    const closeBtn = document.getElementById('cellInfoClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            forceHide();
        });
    }

    initPinController();
    initColorScheme();
}

/**
 * Update the cell info panel with data for a specific cell.
 * @param {Object} cellProperties - Cell properties from hover/click event
 */
export function update(cellProperties) {
    const cellData = {
        cell_id: cellProperties.cell_id || cellProperties.Cell_Num,
        centroid: cellProperties.centroid || [cellProperties.x || 0, cellProperties.y || 0],
        ClassName: cellProperties.ClassName || [],
        Prob: cellProperties.Prob || [],
        Genenames: cellProperties.Genenames || [],
        CellGeneCount: cellProperties.CellGeneCount || []
    };

    console.log('Updating cell info with data:', cellData);

    if (!cellData.Genenames || cellData.Genenames.length === 0 ||
        !cellData.CellGeneCount || cellData.CellGeneCount.length === 0) {
        console.error('CRITICAL: Cell ' + (cellData.cell_id || cellProperties.id) +
            ' has NO gene expression data. Arrow files missing gene_names/gene_counts columns.');
    }

    renderDonut(cellData);
    renderGeneTable(cellData);
    renderClassLegend(cellData);
    show();
    updateCellInfoHeader(cellData, cellProperties);
}

/**
 * Update the cell info panel header with cell number, gene counts total, and coordinates.
 * @param {Object} cellData - Formatted cell data
 * @param {Object} cellProperties - Original cell properties
 */
function updateCellInfoHeader(cellData, cellProperties) {
    const titleElement = document.getElementById('cellInfoTitle');
    if (!titleElement) return;

    const cellNum = cellData.cell_id || cellProperties.id || 'Unknown';
    const x = Number(Array.isArray(cellData.centroid) ? cellData.centroid[0] : 0).toFixed(0);
    const y = Number(Array.isArray(cellData.centroid) ? cellData.centroid[1] : 0).toFixed(0);

    let total = 0;
    if (Array.isArray(cellData.CellGeneCount)) {
        total = cellData.CellGeneCount.reduce((acc, v) => acc + (Number(v) || 0), 0);
    }
    // Truncate total to two decimals without rounding
    const totalTrunc = (Math.trunc(total * 100) / 100).toFixed(2);

    titleElement.innerHTML =
        '<b><strong>Cell Num: </strong>' + cellNum +
        ', <strong>Gene Counts: </strong>' + totalTrunc +
        ',  (<strong>x, y</strong>): (' + x + ', ' + y + ')</b>';
}
