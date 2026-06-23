/**
 * Scale Bar Module
 *
 * Handles scale bar calculations and rendering for the map view.
 * Converts deck.gl coordinate space to physical units (microns).
 */

/**
 * Calculate the appropriate scale bar length and distance for the current view
 * @param {Object} viewState - Current deck.gl view state with zoom level
 * @returns {Object} Object containing pixel length and distance in microns
 */
export function calculateScaleBar(viewState) {
    const config = window.config();
    const voxelSize = config.voxelSize;
    const resolution = voxelSize[0]; // microns per pixel in original image

    // Deck.gl coordinate system: the image is mapped into a 256-unit tile space
    // along its LONGER side (see transformToTileCoordinates), so the conversion
    // has to use the long side, not the width. For landscape images width is the
    // long side so it looks right, but for portrait images it would be wrong.
    const longSide = Math.max(config.imageWidth, config.imageHeight);

    // So 1 deck.gl unit = longSide/256 image pixels
    const deckglUnitsPerImagePixel = 256 / longSide;

    // Convert from deck.gl coordinates to microns
    // 1 deck.gl unit = (longSide/256) image pixels = (longSide/256) * resolution microns
    const micronsPerDeckglUnit = (longSide / 256) * resolution;

    // Account for zoom level
    const micronsPerPixel = micronsPerDeckglUnit / Math.pow(2, viewState.zoom);
    const pixelsPerMicron = 1 / micronsPerPixel;

    // Choose appropriate scale length
    const scaleOptions = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; // microns
    const targetPixels = 100; // Target scale bar length in pixels

    let bestScale = scaleOptions[0];
    for (const scale of scaleOptions) {
        const pixels = scale / micronsPerPixel;
        if (pixels <= targetPixels && pixels >= 40) { // Min 40px for readability
            bestScale = scale;
        } else if (pixels > targetPixels) {
            break;
        }
    }

    const actualPixels = bestScale / micronsPerPixel;
    return { pixels: actualPixels, distance: bestScale };
}

/**
 * Format distance value with appropriate units
 * @param {number} microns - Distance in microns
 * @returns {string} Formatted distance string with units
 */
export function formatDistance(microns) {
    if (microns < 1) {
        return `${(microns * 1000).toFixed(0)} nm`;
    } else if (microns < 1000) {
        return `${microns} μm`;
    } else {
        return `${(microns / 1000).toFixed(1)} mm`;
    }
}

/**
 * Update the scale bar DOM element based on current view state
 * @param {Object} viewState - Current deck.gl view state
 */
export function updateScaleBar(viewState) {
    const scaleBar = document.getElementById('scaleBar');
    if (!scaleBar) return;

    const scaleLine = scaleBar.querySelector('.scale-bar-line');
    const scaleLabel = scaleBar.querySelector('.scale-bar-label');

    if (!scaleLine || !scaleLabel) return;

    const { pixels, distance } = calculateScaleBar(viewState);

    // Update scale bar appearance
    scaleLine.style.width = pixels + 'px';
    scaleLabel.textContent = formatDistance(distance);
}