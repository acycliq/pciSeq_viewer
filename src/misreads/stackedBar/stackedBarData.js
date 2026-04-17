import { state } from '../../state/stateManager.js';

// Returns [{gene, assigned, misread}] unsorted (caller applies sortData).
export function prepareStackedData(meta) {
    const genePanel = meta.get('gene_panel') || [];
    const hardCounts = meta.get('hard_misread_counts') || [];

    const result = [];
    for (const [gene, spots] of state.geneDataMap) {
        const geneIdx = genePanel.indexOf(gene);
        const misread = (geneIdx >= 0 && hardCounts[geneIdx] != null) ? hardCounts[geneIdx] : 0;
        result.push({ gene, misread, assigned: spots.length - misread });
    }
    return result;
}

// Sort [{gene, assigned, misread}] by 'name' or 'pct' (misread %), asc or desc.
export function sortData(data, sortBy, order) {
    const sign = order === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
        if (sortBy === 'name')  return sign * a.gene.localeCompare(b.gene);
        if (sortBy === 'count') return sign * (a.misread - b.misread);
        const pctA = (a.assigned + a.misread) > 0 ? a.misread / (a.assigned + a.misread) : 0;
        const pctB = (b.assigned + b.misread) > 0 ? b.misread / (b.assigned + b.misread) : 0;
        return sign * (pctA - pctB);
    });
}