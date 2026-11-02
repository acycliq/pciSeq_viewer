import { state } from '../../state/stateManager.js';

// Returns [{plane, misread, assigned}] sorted by plane ascending for the given gene.
// is_hard_misread comes from the Arrow column (feature/gene_indexed_rho and later)
// or, for older files, is derived from the probabilities in the Arrow worker.
export function preparePerPlaneData(geneName) {
    const spots = state.spotTable.spotsOfGene(geneName);
    const planeMap = {};
    for (const spot of spots) {
        const p = spot.plane_id;
        if (!planeMap[p]) planeMap[p] = { misread: 0, total: 0 };
        planeMap[p].total++;
        if (spot.is_hard_misread) planeMap[p].misread++;
    }
    return Object.entries(planeMap)
        .map(([p, { misread, total }]) => ({ plane: +p, misread, assigned: total - misread }))
        .sort((a, b) => a.plane - b.plane);
}
