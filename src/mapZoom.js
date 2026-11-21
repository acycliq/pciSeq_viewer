/**
 * Map Zoom Module
 * Glides the map to a zoom level, a centre, or both, or to the view that fits a
 * box of the image. It serves the chat's zoom_map tool, which has no mouse wheel
 * to zoom with.
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
// A fitted box takes this share of the window, so it does not touch the edges.
const BOX_FILL = 0.9;

/**
 * Say what is wrong with a request, or null when it can be carried out.
 * A value out of range is refused, not clamped, so the caller never reports a
 * view it did not get.
 *
 * @param {Object} request
 * @param {number} [request.zoom]    The zoom level asked for.
 * @param {Object} [request.center]  {x, y} in image pixels.
 * @param {Object} [request.box]     {x_from, x_to, y_from, y_to} in image pixels.
 * @returns {string|null}
 */
export function mapZoomRequestError({ zoom, center, box }) {
    if (box != null) {
        if (zoom != null || center != null) {
            return 'a box sets both the zoom and the centre, so give it alone, nothing changed';
        }
        const width = IMG_DIMENSIONS.width;
        const height = IMG_DIMENSIONS.height;
        if (!(box.x_from < box.x_to) || !(box.y_from < box.y_to)) {
            return 'the box needs x_from below x_to and y_from below y_to, nothing changed';
        }
        if (box.x_to <= 0 || box.x_from >= width || box.y_to <= 0 || box.y_from >= height) {
            return `the box is outside the image, x from 0 to ${width} and y from 0 to ${height}, nothing changed`;
        }
        return null;
    }
    if (zoom == null && center == null) {
        return 'give a zoom, a center, both, or a box';
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
 * The zoom and centre at which a box of the image fits the window. Each zoom
 * level doubles the scale, so the zoom that fits is log2 of how many times the
 * box goes into the window, rounded down so no edge is cut off. A box too small
 * or too big for the zoom limits gets the nearest limit.
 *
 * @param {Object} box  {x_from, x_to, y_from, y_to} in image pixels.
 * @returns {{zoom: number, center: {x: number, y: number}}}
 */
export function viewThatFits(box) {
    const canvas = document.querySelector('#map canvas');
    const [x0, y0] = transformToTileCoordinates(box.x_from, box.y_from, IMG_DIMENSIONS);
    const [x1, y1] = transformToTileCoordinates(box.x_to, box.y_to, IMG_DIMENSIONS);
    const timesAcross = canvas.clientWidth * BOX_FILL / Math.abs(x1 - x0);
    const timesDown = canvas.clientHeight * BOX_FILL / Math.abs(y1 - y0);
    let zoom = Math.floor(Math.log2(Math.min(timesAcross, timesDown)) * 100) / 100;
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    return { zoom, center: { x: (box.x_from + box.x_to) / 2, y: (box.y_from + box.y_to) / 2 } };
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
