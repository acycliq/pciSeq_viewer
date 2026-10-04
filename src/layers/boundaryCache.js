/**
 * Boundary Cache Module
 * Shared storage for Arrow boundary buffers and GeoJSON features
 */

// The raw Arrow buffers, per plane, that the z-projection cell mode builds from.
// (The 2D cells of a plane are in state.polygonCache, kept by data/planeCells.js.)
export let arrowBoundaryCache = new Map();

// Per-plane GeoJSON for the z-projection cell mode. Features carry the richer
// { cellClass, totalGeneCount, colorRGB } schema the projection layer needs, which is
// why it is kept apart from the 2D cells' { plane_id, label, cellClass }.
export let projectionGeojsonCache = new Map();
