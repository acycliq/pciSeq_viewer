/**
 * Cell Hover Handler Module
 *
 * Shared hover handler for polygon layers (both single-plane and Z-projection).
 * Extracts cell data and updates the cell info panel.
 */

/**
 * Handle hover events on cell polygons
 * Looks up full cell data and updates the cell info panel
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

        if (fullCellData && window.updateCellInfo && typeof window.updateCellInfo === 'function') {
            const cellData = buildCellInfoData(fullCellData, cellLabel);
            window.updateCellInfo(cellData);
            showCellInfoPanel();
        } else {
            console.warn('No full cell data found for cell:', cellLabel);
        }
    } else {
        hideCellInfoPanel();
    }
}

/**
 * Build cell info data structure from full cell data
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

    // Determine top class
    let topIdx = -1, topVal = -Infinity;
    for (let i = 0; i < probs.length; i++) {
        const v = probs[i];
        if (typeof v === 'number' && v > topVal) {
            topVal = v;
            topIdx = i;
        }
    }
    const topClass = (topIdx >= 0 && names[topIdx]) ? names[topIdx] : (names[0] || 'Unknown');

    // Sum gene counts
    const geneCounts = Array.isArray(fullCellData.geneExpression?.geneCounts)
        ? fullCellData.geneExpression.geneCounts
        : [];
    const geneTotal = geneCounts.reduce((a, b) => a + (Number(b) || 0), 0);

    // Resolve a color for the top class if available
    let topColor = '#C0C0C0';
    try {
        const scheme = (window.currentColorScheme && window.currentColorScheme.cellClasses)
            ? window.currentColorScheme.cellClasses
            : [];
        const entry = scheme.find(e => e.className === topClass);
        if (entry && entry.color) topColor = entry.color;
    } catch {}

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
            color: topColor
        }
    };
}

/**
 * Show the cell info panel
 */
function showCellInfoPanel() {
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.style.display = 'block';
    }
}

/**
 * Hide the cell info panel
 */
function hideCellInfoPanel() {
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.style.display = 'none';
    }
}