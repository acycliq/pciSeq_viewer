import { state } from '../../state/stateManager.js';

// Returns [{plane, misread, assigned}] sorted by plane ascending for the given gene.
// Computes misread counts from spot.is_hard_misread, which is either read from the Arrow feather
// column (feature/gene_indexed_rho and later) or computed on-the-fly from prob_array as a fallback.
// See src/misreads/misreadUtils.js and src/data/dataLoaders.js for the fallback.
// Ask Dimitri if you want to delete this fallback.
export function preparePerPlaneData(geneName) {
    const spots = state.geneDataMap.get(geneName) || [];
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
