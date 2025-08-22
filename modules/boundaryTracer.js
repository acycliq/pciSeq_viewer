/**
 * Boundary Tracer Module
 * 
 * Implements Bresenham's line algorithm to trace all pixels between consecutive
 * vertices of a polygon boundary. This is used to convert sparse vertex data
 * into a complete pixel-perfect boundary representation.
 * 
 * Usage:
 * - traceBoundaryPixels(vertices) - returns all boundary pixels
 * - processClippedBoundaries(cells) - processes cell data with clippedBoundary arrays
 */

/**
 * Bresenham's line algorithm to get all pixels between two points
 * @param {number} x0 - Start x coordinate
 * @param {number} y0 - Start y coordinate  
 * @param {number} x1 - End x coordinate
 * @param {number} y1 - End y coordinate
 * @returns {Array} Array of [x, y] pixel coordinates
 */
function getLinePixels(x0, y0, x1, y1) {
    const pixels = [];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let x = x0;
    let y = y0;

    while (true) {
        pixels.push([x, y]);
        
        if (x === x1 && y === y1) break;
        
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
    
    return pixels;
}

/**
 * Convert decimal coordinates to integer pixels using floor
 * @param {Array} vertices - Array of [x, y] coordinate pairs
 * @returns {Array} Array of integer coordinate pairs
 */
function convertToIntegers(vertices) {
    return vertices.map(vertex => [Math.floor(vertex[0]), Math.floor(vertex[1])]);
}

/**
 * Trace all boundary pixels from polygon vertices
 * @param {Array} vertices - Array of [x, y] vertex coordinates
 * @returns {Array} Array of [x, y] boundary pixel coordinates
 */
export function traceBoundaryPixels(vertices) {
    if (!vertices || vertices.length < 2) {
        return [];
    }
    
    const intVertices = convertToIntegers(vertices);
    const boundaryPixels = new Set();
    
    // Trace lines between consecutive vertices
    for (let i = 0; i < intVertices.length - 1; i++) {
        const [x0, y0] = intVertices[i];
        const [x1, y1] = intVertices[i + 1];
        
        const linePixels = getLinePixels(x0, y0, x1, y1);
        linePixels.forEach(pixel => {
            boundaryPixels.add(`${pixel[0]},${pixel[1]}`);
        });
    }
    
    // If polygon is not already closed, close it
    if (intVertices.length > 2) {
        const firstVertex = intVertices[0];
        const lastVertex = intVertices[intVertices.length - 1];
        
        if (firstVertex[0] !== lastVertex[0] || firstVertex[1] !== lastVertex[1]) {
            const closingPixels = getLinePixels(lastVertex[0], lastVertex[1], firstVertex[0], firstVertex[1]);
            closingPixels.forEach(pixel => {
                boundaryPixels.add(`${pixel[0]},${pixel[1]}`);
            });
        }
    }
    
    // Convert back to array of coordinates
    return Array.from(boundaryPixels).map(coord => {
        const [x, y] = coord.split(',').map(Number);
        return [x, y];
    });
}

/**
 * Process cell data to add traced boundary pixels
 * @param {Array} cells - Array of cell objects with clippedBoundary property
 * @returns {Array} Array of cell objects with added tracedBoundary property
 */
export function processClippedBoundaries(cells) {
    return cells.map(cell => {
        if (cell.clippedBoundary && Array.isArray(cell.clippedBoundary)) {
            return {
                ...cell,
                tracedBoundary: traceBoundaryPixels(cell.clippedBoundary)
            };
        }
        return cell;
    });
}

/**
 * Process a single cell's boundary data
 * @param {Object} cell - Cell object with clippedBoundary property
 * @returns {Object} Cell object with added tracedBoundary property
 */
export function processCell(cell) {
    if (cell.clippedBoundary && Array.isArray(cell.clippedBoundary)) {
        return {
            ...cell,
            tracedBoundary: traceBoundaryPixels(cell.clippedBoundary)
        };
    }
    return cell;
}

/**
 * Get boundary statistics for debugging/analysis
 * @param {Array} vertices - Array of [x, y] vertex coordinates
 * @returns {Object} Statistics about the boundary
 */
export function getBoundaryStats(vertices) {
    if (!vertices || vertices.length === 0) {
        return { vertexCount: 0, boundaryPixelCount: 0, boundingBox: null };
    }
    
    const boundaryPixels = traceBoundaryPixels(vertices);
    const xs = boundaryPixels.map(p => p[0]);
    const ys = boundaryPixels.map(p => p[1]);
    
    return {
        vertexCount: vertices.length,
        boundaryPixelCount: boundaryPixels.length,
        boundingBox: {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
            width: Math.max(...xs) - Math.min(...xs) + 1,
            height: Math.max(...ys) - Math.min(...ys) + 1
        }
    };
}