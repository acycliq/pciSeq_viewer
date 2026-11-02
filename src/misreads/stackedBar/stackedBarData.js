import { state } from '../../state/stateManager.js';

// Returns [{gene, assigned, misread}] unsorted (caller applies sortData).
// is_hard_misread comes from the Arrow column (feature/gene_indexed_rho and later)
// or, for older files, is derived from the probabilities in the Arrow worker.
export function prepareStackedData() {
    const table = state.spotTable;
    const misreadOfGene = new Uint32Array(table.geneCount);
    for (let row = 0; row < table.length; row++) {
        if (table.isHardMisread[row]) misreadOfGene[table.geneId[row]]++;
    }
    return table.genes.map(gene => {
        const misread = misreadOfGene[table.idOfGene(gene)];
        return { gene, misread, assigned: table.countOfGene(gene) - misread };
    });
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
