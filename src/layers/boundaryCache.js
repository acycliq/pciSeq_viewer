/**
 * Boundary Cache Module
 * Shared storage for Arrow boundary buffers and GeoJSON features
 */

export let arrowBoundaryCache = new Map();

// Per-plane GeoJSON for the 2D boundary layer. Features carry { plane_id, label,
// cellClass }.
export let arrowGeojsonCache = new Map();

// Per-plane GeoJSON for the z-projection cell mode. Features carry the richer
// { cellClass, totalGeneCount, colorRGB } schema the projection layer needs.
// Kept separate from arrowGeojsonCache so the two schemas never overwrite each
// other (whichever built a plane first used to win, corrupting the other view).
export let projectionGeojsonCache = new Map();
