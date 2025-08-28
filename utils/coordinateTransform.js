/**
 * Coordinate Transformation Utilities
 * 
 * This module provides functions for transforming coordinates between different
 * coordinate systems used in the deck.gl viewer application.
 */

/**
 * Clamps a value between a minimum and maximum range
 * @param {number} value - The value to clamp
 * @param {number} min - The minimum allowed value
 * @param {number} max - The maximum allowed value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Transform coordinates from original image space to tile coordinate space (256x256)
 * 
 * This function handles any aspect ratio by scaling coordinates to fit the tile system
 * while maintaining proper proportions. It uses adjustment factors based on the
 * larger dimension to ensure correct aspect ratio preservation.
 * 
 * @param {number} x - X coordinate in original image space
 * @param {number} y - Y coordinate in original image space
 * @param {Object} imageDimensions - Image dimensions object
 * @param {number} imageDimensions.width - Original image width
 * @param {number} imageDimensions.height - Original image height
 * @param {number} imageDimensions.tileSize - Target tile size (usually 256)
 * @returns {Array<number>} [transformedX, transformedY] in tile coordinate space
 * 
 * @example
 * // Transform gene coordinates to tile space
 * const genePos = transformToTileCoordinates(3205, 2206, IMG_DIMENSIONS);
 * // Returns [~128, ~116] for a 6411x4412 image scaled to 256x256 tiles
 */
export function transformToTileCoordinates(x, y, imageDimensions) {
    const {width, height, tileSize} = imageDimensions;
    const maxDimension = Math.max(width, height);
    
    // Adjustment factors to handle aspect ratio
    const xAdjustment = width / maxDimension;
    const yAdjustment = height / maxDimension;
    
    return [
        x * (tileSize / width) * xAdjustment,
        y * (tileSize / height) * yAdjustment
    ];
}

/**
 * Transform coordinates from tile space back to original image space
 * 
 * This is the inverse of transformToTileCoordinates, useful for converting
 * tile coordinates back to original image coordinates.
 * 
 * @param {number} x - X coordinate in tile space
 * @param {number} y - Y coordinate in tile space
 * @param {Object} imageDimensions - Image dimensions object
 * @param {number} imageDimensions.width - Original image width
 * @param {number} imageDimensions.height - Original image height
 * @param {number} imageDimensions.tileSize - Tile size (usually 256)
 * @returns {Array<number>} [originalX, originalY] in original image coordinate space
 */
export function transformFromTileCoordinates(x, y, imageDimensions) {
    const {width, height, tileSize} = imageDimensions;
    const maxDimension = Math.max(width, height);
    
    // Inverse adjustment factors
    const xAdjustment = width / maxDimension;
    const yAdjustment = height / maxDimension;
    
    return [
        x / ((tileSize / width) * xAdjustment),
        y / ((tileSize / height) * yAdjustment)
    ];
}

// Note: getTileUrl function moved to config-driven approach
// Tile URLs are now generated using the pattern from config.js

/**
 * Calculate zoom level to fit entire image in viewport
 * 
 * @param {Object} imageDimensions - Image dimensions
 * @param {number} viewportWidth - Viewport width in pixels
 * @param {number} viewportHeight - Viewport height in pixels
 * @returns {number} Optimal zoom level
 */
export function calculateFitZoom(imageDimensions, viewportWidth, viewportHeight) {
    const {width, height} = imageDimensions;
    return Math.log2(Math.min(viewportWidth / width, viewportHeight / height));
}

/**
 * Get the center point of an image in tile coordinates
 * 
 * @param {Object} imageDimensions - Image dimensions object
 * @returns {Array<number>} [centerX, centerY] in tile coordinate space
 */
export function getImageCenter(imageDimensions) {
    const {width, height} = imageDimensions;
    const centerX = width / 2;
    const centerY = height / 2;
    return transformToTileCoordinates(centerX, centerY, imageDimensions);
}