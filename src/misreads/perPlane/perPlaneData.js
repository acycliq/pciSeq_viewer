import { state } from '../../state/stateManager.js';

// Returns [{plane, misread, assigned}] sorted by plane ascending for the given gene.
export function preparePerPlaneData(meta, geneName) {
    const byPlane    = meta.get('hard_misread_by_plane') || {};
    const misreadMap = byPlane[geneName] || {};

    // Count total spots per plane from Arrow data
    const totalMap = {};
    for (const spot of (state.geneDataMap.get(geneName) || [])) {
        const p = spot.plane_id;
        totalMap[p] = (totalMap[p] || 0) + 1;
    }

    // Union of planes from both sources
    const planes = new Set([...Object.keys(misreadMap), ...Object.keys(totalMap)]);
    return Array.from(planes)
        .map(p => {
            const misread  = misreadMap[p]  || 0;
            const total    = totalMap[p]    || 0;
            return { plane: +p, misread, assigned: total - misread };
        })
        .sort((a, b) => a.plane - b.plane);
}