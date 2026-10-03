/**
 * The chat's open_chart tool: open one of the viewer's own charts, the same ones
 * the buttons in the drawer open, with a region or a gene already picked in its
 * dropdown, as if the user had picked it.
 */
import { showCellClassDistributionWidget } from './cellClassDistributionChart.js';
import { showCellClassPercentageWidget } from './cellClassPercentageChart.js';
import { showExpressionHistogramWidget } from './expressionHistogramChart.js';
import { showGeneDistributionWidget } from './geneDistributionChart.js';
import { showRhoBarWidget } from './misreads/rhoBar/RhoBarWidget.js';
import { showStackedBarWidget } from './misreads/stackedBar/StackedBarWidget.js';
import { showPerPlaneWidget } from './misreads/perPlane/PerPlaneWidget.js';

// chart name (as in electron/tools.js) -> how to open it
const CHARTS = {
    classes_by_z: showCellClassDistributionWidget,
    class_distribution: showCellClassPercentageWidget,
    class_gene_counts: showExpressionHistogramWidget,
    gene_distribution: showGeneDistributionWidget,
    misread_rho: showRhoBarWidget,
    assigned_vs_misread: showStackedBarWidget,
    misread_per_plane: showPerPlaneWidget,
};

// set a dropdown and tell the chart, the way a user's pick does
function pick(select, value) {
    if (!select || value == null) return;
    select.value = value;
    select.dispatchEvent(new Event('change'));
}

export function openChart({ chart, region = null, gene = null }) {
    const open = CHARTS[chart];
    if (!open) throw new Error(`no chart called ${chart}`);
    const widget = open();
    pick(widget?.regionSelect, region);
    pick(widget?.geneSelect, gene);
}
