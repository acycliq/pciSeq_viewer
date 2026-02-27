/**
 * Eagle View Module
 *
 * Provides a tilted perspective mode that stacks spots and cell boundaries
 * from currentPlane ± 2 vertically, giving depth perception.
 * Uses deck.gl OrbitView when active, OrthographicView when inactive.
 */

import { EAGLE_VIEW_CONFIG } from '../config/constants.js';
import { createOrthoView, createOrbitView } from './init/appInitializer.js';

/**
 * Toggle eagle-view mode on/off.
 * Flips state.eagleView, switches the deck.gl view, and refreshes layers.
 * @param {Object} state - Application state
 * @param {Function} updateAllLayers - Layer refresh callback
 */
export function toggleEagleView(state, updateAllLayers) {
    state.eagleView = !state.eagleView;

    const deckgl = state.deckglInstance;
    if (!deckgl) return;

    if (state.eagleView) {
        const currentVS = deckgl.viewManager
            ? deckgl.viewManager.getViewState('ortho') || {}
            : {};
        const orbitVS = orthoToOrbit(currentVS);
        deckgl.setProps({
            views: [createOrbitView()],
            viewState: { eagle: orbitVS }
        });
    } else {
        const currentVS = deckgl.viewManager
            ? deckgl.viewManager.getViewState('eagle') || {}
            : {};
        const orthoVS = orbitToOrtho(currentVS);
        deckgl.setProps({
            views: [createOrthoView()],
            viewState: { ortho: orthoVS }
        });
    }

    updateAllLayers();
}

/**
 * Convert OrthographicView viewState to OrbitView viewState.
 * Preserves target and zoom, adds rotation parameters.
 */
export function orthoToOrbit(viewState) {
    return {
        target: viewState.target || [0, 0, 0],
        zoom: viewState.zoom ?? 4,
        rotationX: EAGLE_VIEW_CONFIG.ROTATION_X,
        rotationOrbit: EAGLE_VIEW_CONFIG.ROTATION_ORBIT,
        orbitAxis: 'Y',
        minZoom: viewState.minZoom ?? 0,
        maxZoom: viewState.maxZoom ?? 8
    };
}

/**
 * Convert OrbitView viewState back to OrthographicView viewState.
 * Strips rotation, keeps target and zoom.
 */
export function orbitToOrtho(viewState) {
    return {
        target: viewState.target || [0, 0, 0],
        zoom: viewState.zoom ?? 4,
        minZoom: viewState.minZoom ?? 0,
        maxZoom: viewState.maxZoom ?? 8
    };
}

/**
 * Compute Z-offset for a given plane relative to the current plane.
 * @param {number} planeNum - The plane number
 * @param {number} currentPlane - The current active plane
 * @returns {number} Z-offset in tile-coordinate units
 */
export function planeZOffset(planeNum, currentPlane) {
    return (planeNum - currentPlane) * EAGLE_VIEW_CONFIG.Z_SPACING;
}
