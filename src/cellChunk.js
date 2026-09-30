/**
 * Opens the 3D viewer around one cell, for the chat's open_3d_view. The same as
 * drawing a rectangle with the selection tool, only the box is worked out here: the
 * cell's footprint on the map, padded on every side so its immediate neighbours are
 * in, kept inside the image. All planes, as with the rectangle.
 */
import { IMG_DIMENSIONS } from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

// the cell's footprint over all its planes, in tile coordinates, from the index the
// selection tool uses
async function footprint(label) {
    if (!window.cellBoundaryIndexPromise) throw new Error('the cell outlines are still being indexed, try again in a moment');
    const { spatialIndex } = await window.cellBoundaryIndexPromise;
    const item = spatialIndex.all().find(i => Number(i.cellId) === Number(label));
    if (!item) throw new Error(`no outline for cell ${label}`);
    return { left: item.minX, right: item.maxX, top: item.minY, bottom: item.maxY };
}

// padding on every side, as a fraction of the cell's size: 0.55 makes the box about
// 2.1 cells across, enough for the immediate neighbours
const PADDING = 0.55;

// the box padded on every side, clipped to the image
function padded(box) {
    const pad = PADDING * Math.max(box.right - box.left, box.bottom - box.top);
    const [maxX, maxY] = transformToTileCoordinates(IMG_DIMENSIONS.width, IMG_DIMENSIONS.height, IMG_DIMENSIONS);
    return {
        left: Math.max(0, box.left - pad),
        right: Math.min(maxX, box.right + pad),
        top: Math.max(0, box.top - pad),
        bottom: Math.min(maxY, box.bottom + pad),
    };
}

export async function openChunkAroundCell(label) {
    const box = padded(await footprint(label));
    await window.appState.rectangularSelector.openChunk(box);
}
