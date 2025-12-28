/**
 * Debug Layers Module
 *
 * Contains debug visualization layers for development and coordinate sanity checking.
 * These layers help verify alignment between different coordinate systems.
 */

/**
 * Create debug dots at the four corners of the image
 * Used to verify coordinate system alignment between tiles, polygons, and spots
 * @returns {ScatterplotLayer} Debug dots layer showing corner markers
 */
export function createDebugDots() {
    const config = window.config();

    // Define pixel coordinates for the four corners
    const pixelCoords = [
        [0, 0],           // Top-left
        [0, 4412],        // Bottom-left
        [6411, 4412],     // Bottom-right
        [6411, 0]         // Top-right
    ];

    // Convert pixel coordinates to deck.gl coordinates
    const longSide = Math.max(config.imageWidth, config.imageHeight);
    const debugPoints = pixelCoords.map(([x, y], index) => ({
        position: [x * 256 / longSide, y * 256 / longSide],
        color: [255, 0, 0], // Bright red
        radius: 0.5, // 0.5 pixel radius = 1 pixel diameter
        id: index
    }));

    return new deck.ScatterplotLayer({
        id: 'debug-dots',
        data: debugPoints,
        getPosition: d => d.position,
        getRadius: d => d.radius,
        getFillColor: d => d.color,
        radiusUnits: 'pixels',
        pickable: true,
        radiusMinPixels: 0.5,
        radiusMaxPixels: 0.5
    });
}