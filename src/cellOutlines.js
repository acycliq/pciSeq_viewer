/**
 * The outlines of some cells on every plane, drawn together the way the All planes
 * switch shows them, for a cell annotation (src/regionsManager.js). Labels are the
 * segmentation labels.
 *
 * The map's own outline cache keeps only the planes near the one on screen, so a
 * plane it does not have is read here into a map of our own and dropped once the
 * outlines we want are copied out.
 */
import { state } from './state/stateManager.js';
import { loadPolygonData } from './data/dataLoaders.js';

async function planeOutlines(p) {
    return state.polygonCache.get(p)
        || await loadPolygonData(p, new Map(), state.allCellClasses, state.cellDataMap);
}

export async function cellOutlines(labels) {
    const want = new Set(labels.map(Number));
    const out = [];
    for (let p = 0; p < window.appState.totalPlanes; p++) {
        for (const f of (await planeOutlines(p))?.features || []) {
            if (want.has(Number(f.properties.label))) out.push(f);
        }
    }
    return out;
}
