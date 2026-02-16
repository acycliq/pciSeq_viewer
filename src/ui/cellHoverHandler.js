/**
 * Cell Hover Handler Module
 *
 * Shared hover handler for polygon layers (both single-plane and Z-projection).
 * Extracts cell data and updates the cell info panel.
 */

import { update, show, hide } from '../cellInfoPanel/index.js';
import { getClassColor } from '../cellInfoPanel/colorResolver.js';

/**
 * Handle hover events on cell polygons.
 * Looks up full cell data and updates the cell info panel.
 * @param {Object} info - Hover info from deck.gl
 */
export function handleCellHover(info) {
    if (info.picked && info.object && info.object.properties) {
        const cellLabel = info.object.properties.label;

        // Look up full cell data from the global state
        let fullCellData = null;
        if (window.appState && window.appState.cellDataMap) {
            const cellId = parseInt(cellLabel);
            fullCellData = window.appState.cellDataMap.get(cellId);
        }

        if (fullCellData) {
            const cellData = buildCellInfoData(fullCellData, cellLabel);
            update(cellData);
            show();
        } else {
            console.warn('No full cell data found for cell:', cellLabel);
        }
    } else {
        hide();
    }
}

/**
 * Build cell info data structure from full cell data.
 * @param {Object} fullCellData - Cell data from cellDataMap
 * @param {string|number} cellLabel - Cell label/ID
 * @returns {Object} Formatted cell data for info panel
 */
function buildCellInfoData(fullCellData, cellLabel) {
    const cx = Number(fullCellData.position?.x || 0);
    const cy = Number(fullCellData.position?.y || 0);

    const names = Array.isArray(fullCellData.classification?.className)
        ? fullCellData.classification.className
        : [];
    const probs = Array.isArray(fullCellData.classification?.probability)
        ? fullCellData.classification.probability
        : [];

    // Determine top class (highest probability)
    let topIdx = -1;
    let topVal = -Infinity;
    for (let i = 0; i < probs.length; i++) {
        if (typeof probs[i] === 'number' && probs[i] > topVal) {
            topVal = probs[i];
            topIdx = i;
        }
    }
    const topClass = (topIdx >= 0 && names[topIdx]) ? names[topIdx] : (names[0] || 'Unknown');

    // Sum gene counts
    const geneCounts = Array.isArray(fullCellData.geneExpression?.geneCounts)
        ? fullCellData.geneExpression.geneCounts
        : [];
    const geneTotal = geneCounts.reduce((a, b) => a + (Number(b) || 0), 0);

    return {
        cell_id: fullCellData.cellNum || Number(cellLabel),
        id: Number(cellLabel),
        centroid: [cx, cy],
        X: cx,
        Y: cy,
        ClassName: names,
        Prob: probs,
        Genenames: Array.isArray(fullCellData.geneExpression?.geneNames)
            ? fullCellData.geneExpression.geneNames
            : [],
        CellGeneCount: geneCounts,
        topClass: topClass,
        agg: {
            X: cx,
            Y: cy,
            GeneCountTotal: geneTotal,
            IdentifiedType: topClass,
            color: getClassColor(topClass)
        }
    };
}
