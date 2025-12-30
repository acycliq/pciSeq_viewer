/**
 * Coordinate Display Module
 *
 * Handles the coordinate display panel that shows mouse position
 * in both pixel and micron coordinates.
 */

/**
 * Update the coordinate display panel based on hover info
 * Converts deck.gl coordinates to image pixels and physical microns
 * @param {Object} info - Hover info from deck.gl containing coordinate data
 */
export function updateCoordinateDisplay(info) {
    const coordDisplay = document.getElementById('coordinateDisplay');
    if (!coordDisplay) return;

    if (info.coordinate) {
        const config = window.config();
        const [deckX, deckY] = info.coordinate;

        // Convert deck.gl coordinates to image pixels
        const longSide = Math.max(config.imageWidth, config.imageHeight);
        const imageX = deckX * longSide / 256;
        const imageY = deckY * longSide / 256;

        // Convert to microns
        const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
        const micronX = imageX * xVoxel;
        const micronY = imageY * yVoxel;

        // Update display elements
        const pixelCoordsEl = document.getElementById('pixelCoords');
        const micronCoordsEl = document.getElementById('micronCoords');

        if (pixelCoordsEl) {
            pixelCoordsEl.textContent = `${Math.round(imageX)}, ${Math.round(imageY)}`;
        }
        if (micronCoordsEl) {
            micronCoordsEl.textContent = `${micronX.toFixed(1)}, ${micronY.toFixed(1)}`;
        }

        coordDisplay.style.display = 'block';
    } else {
        coordDisplay.style.display = 'none';
    }
}