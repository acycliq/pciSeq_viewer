import { state } from '../../state/stateManager.js';

// Returns [{gene, assigned, misread}] unsorted (caller applies sortData).
// Computes misread counts from spot.is_hard_misread, which is either read from the Arrow feather
// column (feature/gene_indexed_rho and later) or computed on-the-fly from prob_array as a fallback.
// See src/misreads/misreadUtils.js and src/data/dataLoaders.js for the fallback.
// Ask Dimitri if you want to delete this fallback.
export function prepareStackedData() {
    const result = [];
    for (const [gene, spots] of state.geneDataMap) {
        const misread = spots.reduce((s, sp) => s + (sp.is_hard_misread ? 1 : 0), 0);
        result.push({ gene, misread, assigned: spots.length - misread });
    }
    return result;
}

// Sort [{gene, assigned, misread}] by 'name', 'count', or 'pct', asc or desc.
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
