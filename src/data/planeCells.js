/**
 * Keeps the cell outlines of the planes in memory (state.polygonCache), so that stepping
 * through the stack finds them ready. One job: load a plane, load its neighbours ahead,
 * and say which loaded plane is nearest to a given one. Drawing them is
 * layers/polygonLayerCreator.js's job.
 */
import { state } from '../state/stateManager.js';
import { loadPolygonData } from './dataLoaders.js';
import { MAX_PRELOAD } from '../../config/constants.js';

// plane -> promise, so a plane asked for twice while it loads is loaded once
const loading = new Map();

/**
 * Load a plane's cell outlines, unless they are in memory already
 */
export function loadPlane(plane) {
    if (state.polygonCache.has(plane)) return Promise.resolve();
    if (!loading.has(plane)) {
        loading.set(plane, loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap)
            .finally(() => loading.delete(plane)));
    }
    return loading.get(plane);
}

/**
 * Load the neighbours of a plane ahead, nearest first. One at a time, so the loading
 * does not make the stepping itself stutter, and given up as soon as the user has
 * moved to another plane (that step starts its own).
 */
export async function preloadAround(plane) {
    const last = window.appState.totalPlanes - 1;
    for (let d = 1; d <= MAX_PRELOAD; d++) {
        for (const neighbour of [plane + d, plane - d]) {
            if (state.currentPlane !== plane) return;
            if (neighbour >= 0 && neighbour <= last) await loadPlane(neighbour);
        }
    }
}

/**
 * The loaded plane nearest to this one: the plane itself once it is in memory, and
 * until then the closest one that is. null when nothing is loaded yet.
 */
export function nearestLoadedPlane(plane) {
    let nearest = null;
    for (const loaded of state.polygonCache.keys()) {
        if (nearest === null || Math.abs(loaded - plane) < Math.abs(nearest - plane)) nearest = loaded;
    }
    return nearest;
}
