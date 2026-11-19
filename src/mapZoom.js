/**
 * Map Zoom Module
 * Glides the map to a zoom level, a centre, or both. It serves the chat's
 * zoom_map tool, which has no mouse wheel to zoom with.
 *
 * Wired up from src/app.js (the chat-zoom-map handler), which checks the request
 * with mapZoomRequestError and then calls glideMapTo.
 * Depends on:
 *   - state.deckglInstance       the deck.gl Deck object
 *   - IMG_DIMENSIONS             the image size, to turn image pixels into map units
 *   - deck.LinearInterpolator    from the deck.gl bundle loaded in index.html
 */

import { IMG_DIMENSIONS } from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
import { state } from './state/stateManager.js';

// The same limits the mouse wheel has (the controller in src/init/appInitializer.js).
const MIN_ZOOM = 0;
const MAX_ZOOM = 8;

// Long enough to see where the map went, short enough not to wait for.
const GLIDE_MS = 600;
// The glide's last frame is drawn a moment after the glide ends.
const SETTLE_MS = 150;

/**
 * Say what is wrong with a request, or null when it can be carried out.
 * A value out of range is refused, not clamped, so the caller never reports a
 * view it did not get.
 *
 * @param {Object} request
 * @param {number} [request.zoom]    The zoom level asked for.
 * @param {Object} [request.center]  {x, y} in image pixels.
 * @returns {string|null}
 */
export function mapZoomRequestError({ zoom, center }) {
    if (zoom == null && center == null) {
        return 'give a zoom, a center, or both';
    }
    if (zoom != null && (zoom < MIN_ZOOM || zoom > MAX_ZOOM)) {
        return `zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}, nothing changed`;
    }
    if (center != null) {
        const width = IMG_DIMENSIONS.width;
        const height = IMG_DIMENSIONS.height;
        const inside = center.x >= 0 && center.x <= width && center.y >= 0 && center.y <= height;
        if (!inside) {
            return `center must be inside the image, x from 0 to ${width} and y from 0 to ${height}, nothing changed`;
        }
    }
    return null;
}

/**
 * Glide the map to the zoom and centre asked for. Whichever is left out stays
 * as it is. Resolves once the map has arrived and drawn.
 *
 * @param {Object} request
 * @param {number} [request.zoom]    The zoom level to end at.
 * @param {Object} [request.center]  {x, y} in image pixels, to end centred on.
 * @returns {Promise<void>}
 */
export function glideMapTo({ zoom, center }) {
    const deckInstance = state.deckglInstance;
    const from = deckInstance.viewManager.getViewState('ortho');

    let target = from.target;
    if (center != null) {
        const [tileX, tileY] = transformToTileCoordinates(center.x, center.y, IMG_DIMENSIONS);
        target = [tileX, tileY, 0];
    }
    const targetZoom = zoom != null ? zoom : from.zoom;

    // deck.gl runs the view itself here (uncontrolled mode), so a move is started
    // by handing it a new initialViewState that carries the transition. This is
    // the same way the cell lookup moves the map (src/data/cellLookup.js).
    deckInstance.setProps({
        initialViewState: {
            ...from,
            target,
            zoom: targetZoom,
            transitionDuration: GLIDE_MS,
            transitionInterpolator: new deck.LinearInterpolator(['target', 'zoom'])
        }
    });

    return new Promise(resolve => setTimeout(resolve, GLIDE_MS + SETTLE_MS));
}
