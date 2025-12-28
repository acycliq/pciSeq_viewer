/**
 * Cell Info Panel Module
 *
 * Handles the cell information panel that displays when hovering over cells.
 * Shows cell metadata, gene expression, and classification data.
 */

/**
 * Update the cell info panel with data for a specific cell
 * @param {Object} cellProperties - Cell properties from hover/click event
 */
export function updateCellInfo(cellProperties) {
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
            console.error(`CRITICAL: Cell ${cellData.cell_id || cellProperties.id} has NO gene expression data. Arrow files missing gene_names/gene_counts columns.`);
            console.error('REQUIRED: Regenerate ALL Arrow files with updated Python converter (python_converters/).');
        }

        // Update donut first; isolate failures
        updateDonutChart(cellData);

        // Update gene counts table (left of donut); isolate failures
        updateGeneTable(cellData);

        // Ensure panel is visible
        const panel = document.getElementById('cellInfoPanel');
        if (panel) panel.style.display = 'block';

        // Update header with Cell Num, total counts, and coordinates
        updateCellInfoHeader(cellData, cellProperties);

    } catch (error) {
        console.error('Error updating cell info:', error);
    }
}

/**
 * Update the donut chart with cell classification data
 * @param {Object} cellData - Formatted cell data
 */
function updateDonutChart(cellData) {
    try {
        const fn = (typeof window !== 'undefined') ? window.donutchart : (typeof donutchart !== 'undefined' ? donutchart : null);
        if (cellData.ClassName && cellData.Prob && typeof fn === 'function') {
            fn(cellData);
        }
    } catch (e) {
        console.warn('Donut update failed:', e);
    }
}

/**
 * Update the gene expression table
 * @param {Object} cellData - Formatted cell data
 */
function updateGeneTable(cellData) {
    try {
        const geneTableFn = (typeof window !== 'undefined') ? window.renderGeneTable : (typeof renderGeneTable !== 'undefined' ? renderGeneTable : null);
        if (typeof geneTableFn === 'function') {
            geneTableFn(cellData);
        }
    } catch (e) {
        console.warn('Gene table update failed:', e);
    }
}

/**
 * Update the cell info panel header
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
            const str = `<b><strong>Cell Num: </strong>${cellNum}, <strong>Gene Counts: </strong>${totalTrunc},  (<strong>x, y</strong>): (${x}, ${y})</b>`;
            titleElement.innerHTML = str;
        }
    } catch (e) {
        console.warn('Failed to update cell info header:', e);
    }
}

/**
 * Setup the cell info panel close button and other UI elements
 */
export function setupCellInfoPanel() {
    const closeBtn = document.getElementById('cellInfoClose');
    const panel = document.getElementById('cellInfoPanel');

    if (closeBtn && panel) {
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
}

/**
 * Initialize the color scheme mapping for cell info panel
 */
export function initCellInfoColorScheme() {
    try {
        let cellClasses = null;
        if (typeof window.classColorsCodes === 'function') {
            cellClasses = window.classColorsCodes();
        } else if (typeof window.getColorScheme === 'function') {
            const cs = window.getColorScheme();
            cellClasses = cs && cs.cellClasses ? cs.cellClasses : null;
        }
        if (Array.isArray(cellClasses)) {
            window.currentColorScheme = { cellClasses };
        } else {
            console.warn('Color scheme not available; donut will use fallback gray');
            window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
        }
    } catch (error) {
        console.warn('Could not load color scheme for cell info panel:', error);
        window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
    }
}

/**
 * Hide the cell info panel
 */
export function hideCellInfoPanel() {
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.style.display = 'none';
    }
}

/**
 * Show the cell info panel
 */
export function showCellInfoPanel() {
    const panel = document.getElementById('cellInfoPanel');
    if (panel) {
        panel.style.display = 'block';
    }
}