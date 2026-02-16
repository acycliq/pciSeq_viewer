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
import { show as pinShow, hide as pinHide, forceHide as pinForceHide } from './pinController.js';

/**
 * Initialize the cell info panel.
 * Binds the close button and initializes the color scheme.
 * The Ctrl key listener is auto-registered by pinController on import.
 */
export function init() {
    const closeBtn = document.getElementById('cellInfoClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            forceHide();
        });
    }

    // Initialize color scheme for donut/legend
    initColorScheme();
}

/**
 * Update the cell info panel with data for a specific cell.
 * @param {Object} cellProperties - Cell properties from hover/click event
 */
export function update(cellProperties) {
    try {
        // Create compatible data structure for donut chart and data tables
        const cellData = {
            cell_id: cellProperties.cell_id || cellProperties.Cell_Num,
            centroid: cellProperties.centroid || [cellProperties.x || 0, cellProperties.y || 0],
            ClassName: cellProperties.ClassName || [],
            Prob: cellProperties.Prob || [],
            Genenames: cellProperties.Genenames || [],
            CellGeneCount: cellProperties.CellGeneCount || []
        };

        console.log('Updating cell info with data:', cellData);

        // Check if gene expression data is missing from Arrow files
        if (!cellData.Genenames || cellData.Genenames.length === 0 || !cellData.CellGeneCount || cellData.CellGeneCount.length === 0) {
            console.error('CRITICAL: Cell ' + (cellData.cell_id || cellProperties.id) + ' has NO gene expression data. Arrow files missing gene_names/gene_counts columns.');
            console.error('REQUIRED: Regenerate ALL Arrow files with updated Python converter (python_converters/).');
        }

        // Update donut first; isolate failures
        try {
            if (cellData.ClassName && cellData.Prob) {
                renderDonut(cellData);
            }
        } catch (e) {
            console.warn('Donut update failed:', e);
        }

        // Update gene counts table (left of donut); isolate failures
        try {
            renderGeneTable(cellData);
        } catch (e) {
            console.warn('Gene table update failed:', e);
        }

        // Update class legend (right of donut); isolate failures
        try {
            renderClassLegend(cellData);
        } catch (e) {
            console.warn('Class legend update failed:', e);
        }

        // Ensure panel is visible
        pinShow();

        // Update header with Cell Num, total counts, and coordinates
        updateCellInfoHeader(cellData, cellProperties);

    } catch (error) {
        console.error('Error updating cell info:', error);
    }
}

/**
 * Show the cell info panel (respects pin state).
 */
export function show() {
    pinShow();
}

/**
 * Hide the cell info panel (blocked when pinned).
 */
export function hide() {
    pinHide();
}

/**
 * Always hides the panel, clears pin state.
 */
export function forceHide() {
    pinForceHide();
}

/**
 * Update the cell info panel header.
 * @param {Object} cellData - Formatted cell data
 * @param {Object} cellProperties - Original cell properties
 */
function updateCellInfoHeader(cellData, cellProperties) {
    try {
        const titleElement = document.getElementById('cellInfoTitle');
        if (titleElement) {
            const cellNum = cellData.cell_id || cellData.Cell_Num || cellProperties.id || 'Unknown';
            const xVal = (cellData.X != null) ? cellData.X : (Array.isArray(cellData.centroid) ? cellData.centroid[0] : cellData.x);
            const yVal = (cellData.Y != null) ? cellData.Y : (Array.isArray(cellData.centroid) ? cellData.centroid[1] : cellData.y);
            const x = Number(xVal || 0).toFixed(0);
            const y = Number(yVal || 0).toFixed(0);
            let total = 0;
            if (Array.isArray(cellData.CellGeneCount)) {
                total = cellData.CellGeneCount.reduce((acc, v) => acc + (Number(v) || 0), 0);
            } else if (cellData.agg && typeof cellData.agg.GeneCountTotal === 'number') {
                total = Number(cellData.agg.GeneCountTotal) || 0;
            }
            // Truncate total to two decimals without rounding
            const totalTrunc = (Math.trunc(total * 100) / 100).toFixed(2);
            const str = '<b><strong>Cell Num: </strong>' + cellNum + ', <strong>Gene Counts: </strong>' + totalTrunc + ',  (<strong>x, y</strong>): (' + x + ', ' + y + ')</b>';
            titleElement.innerHTML = str;
        }
    } catch (e) {
        console.warn('Failed to update cell info header:', e);
    }
}
