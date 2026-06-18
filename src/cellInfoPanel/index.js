/**
 * Cell Info Panel Module
 *
 * Self-contained ES module for the cell information panel (bottom-right).
 * The panel is ALWAYS present: either a minimized strip (header only) or the
 * full control (donut chart, gene table, class legend).
 *
 * Two independent state axes (owned by panelState.js):
 *   - minimized : strip vs. full control
 *   - frozen    : content locked against hover (click-to-freeze)
 *
 * Public API:
 *   init()                 - wire toggle button, Esc-free; init color scheme
 *   update(cellData)       - live update from hover (respects minimized/last cell)
 *   freezeOnCell(cellData) - update + auto-maximize + freeze (click-to-freeze)
 *   unfreeze()             - resume hover updates (Esc / empty-map click)
 */

import { initColorScheme } from './colorResolver.js';
import { renderDonut } from './donutChart.js';
import { renderClassLegend } from './classLegend.js';
import { renderGeneTable } from './geneTable.js';
import { getFormattedCellCoordinates } from '../../utils/cellFormatting.js';
import {
    init as initPanelState,
    minimize,
    maximize,
    freeze,
    unfreeze as unfreezeState,
    isMinimized,
    setLastCell,
    getLastCell
} from './panelState.js';

// Re-export so map handlers (Esc, empty-map click) can resume hover updates.
export { unfreezeState as unfreeze };

/**
 * Initialize the cell info panel.
 * Wires the minimize/maximize toggle, initializes panel state and colors.
 */
export function init() {
    const toggleBtn = document.getElementById('cellInfoToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const last = getLastCell();
            if (isMinimized()) {
                maximize();
                // Re-render the cached cell now that the body is visible again.
                if (last) renderBody(last);
            } else {
                minimize();
            }
            // Header switches between full and compact form with the state.
            if (last) updateCellInfoHeader(last, last);
        });
    }

    initPanelState();
    initColorScheme();
}

/**
 * Normalize raw cell properties into the panel's data shape.
 * @param {Object} cellProperties - Cell properties from hover/click
 * @returns {Object} Normalized cell data
 */
function normalize(cellProperties) {
    return {
        cell_id: cellProperties.cell_id || cellProperties.Cell_Num,
        id: cellProperties.id,
        centroid: cellProperties.centroid || [cellProperties.x || 0, cellProperties.y || 0],
        ClassName: cellProperties.ClassName || [],
        Prob: cellProperties.Prob || [],
        Genenames: cellProperties.Genenames || [],
        CellGeneCount: cellProperties.CellGeneCount || []
    };
}

/**
 * Live update from hover. Always caches the cell and refreshes the header
 * strip; only does the heavy donut/table/legend render when maximized.
 * @param {Object} cellProperties - Cell properties from hover/click event
 */
export function update(cellProperties) {
    const cellData = normalize(cellProperties);
    setLastCell(cellData);

    if (!cellData.Genenames || cellData.Genenames.length === 0 ||
        !cellData.CellGeneCount || cellData.CellGeneCount.length === 0) {
        console.error('CRITICAL: Cell ' + (cellData.cell_id || cellProperties.id) +
            ' has NO gene expression data. Arrow files missing gene_names/gene_counts columns.');
    }

    // Header (the strip) is cheap and always kept current.
    updateCellInfoHeader(cellData, cellProperties);

    // Skip the expensive renders while collapsed — they run on maximize.
    if (isMinimized()) return;
    renderBody(cellData);
}

/**
 * Update + auto-maximize + freeze. Triggered by clicking a cell so the user
 * can move onto the panel and inspect the table/donut without it changing.
 * @param {Object} cellProperties - Cell properties from the click event
 */
export function freezeOnCell(cellProperties) {
    const cellData = normalize(cellProperties);
    setLastCell(cellData);
    maximize();
    renderBody(cellData);
    updateCellInfoHeader(cellData, cellProperties);
    freeze();
}

/**
 * Render the heavy panel body (donut + gene table + class legend).
 * @param {Object} cellData - Normalized cell data
 */
function renderBody(cellData) {
    renderDonut(cellData);
    renderGeneTable(cellData);
    renderClassLegend(cellData);
}

/**
 * Update the cell info panel header with cell number, gene counts total, and coordinates.
 * @param {Object} cellData - Formatted cell data
 * @param {Object} cellProperties - Original cell properties
 */
function updateCellInfoHeader(cellData, cellProperties) {
    const titleElement = document.getElementById('cellInfoTitle');
    if (!titleElement) return;

    const cellNum = cellData.cell_id || (cellProperties && cellProperties.id) || 'Unknown';
    let total = 0;
    if (Array.isArray(cellData.CellGeneCount)) {
        total = cellData.CellGeneCount.reduce((acc, v) => acc + (Number(v) || 0), 0);
    }
    // Truncate total to two decimals without rounding
    const totalTrunc = (Math.trunc(total * 100) / 100).toFixed(2);

    // Minimized strip: compact form — just cell number and gene counts.
    if (isMinimized()) {
        titleElement.innerHTML =
            '<b><strong>Cell: </strong>' + cellNum +
            ', <strong>Counts: </strong>' + totalTrunc + '</b>';
        return;
    }

    const appState = window.appState || window.state || null;
    const cellMap = appState && appState.cellDataMap ? appState.cellDataMap : null;
    const cellObj = cellMap ? cellMap.get(Number(cellNum)) : null;

    let coordsStr = '';
    if (cellObj) {
        coordsStr = ',  ' + getFormattedCellCoordinates(cellObj, false);
    } else {
        const x = Number(Array.isArray(cellData.centroid) ? cellData.centroid[0] : 0).toFixed(0);
        const y = Number(Array.isArray(cellData.centroid) ? cellData.centroid[1] : 0).toFixed(0);
        coordsStr = ',  (x: ' + x + ', y: ' + y + ')';
    }

    titleElement.innerHTML =
        '<b><strong>Cell: </strong>' + cellNum +
        ', <strong>Gene Counts: </strong>' + totalTrunc +
        coordsStr + '</b>';
}