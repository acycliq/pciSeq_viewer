/**
 * Background Cell Boundary Index Loader
 * 
 * Builds a complete cell-to-plane mapping by loading all plane boundary files
 * in the background without blocking the UI.
 */

import { loadPolygonData } from './dataLoaders.js';

// Yield back to the browser to keep UI responsive
function idleYield() {
    return new Promise(resolve => {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => resolve(), { timeout: 50 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

/**
 * Build complete cell boundary index from all plane files
 * @param {Object} appState - Application state object
 * @returns {Promise<Object>} {cellBoundaryIndex, spatialIndex}
 */
async function buildCellBoundaryIndex(appState) {
    const cellBoundaryIndex = new Map();
    const config = window.config();
    const totalPlanes = config.totalPlanes;
    
    console.log(`🔄 Building cell boundary index from ${totalPlanes} planes...`);
    const startTime = performance.now();
    
    // Process planes with limited concurrency to avoid blocking UI/network
    const CONCURRENCY = 3;
    let nextPlane = 0;
    async function worker() {
        while (nextPlane < totalPlanes) {
            const planeId = nextPlane++;
            await loadPlaneForIndex(planeId, cellBoundaryIndex, appState);
            await idleYield();
        }
    }
    const workers = Array.from({ length: Math.min(CONCURRENCY, totalPlanes) }, () => worker());
    await Promise.all(workers);
    
    // Sort plane arrays for each cell
    cellBoundaryIndex.forEach(planes => planes.sort((a, b) => a - b));
    
    const indexTime = performance.now();
    const indexLoadTime = (indexTime - startTime) / 1000;
    
    console.log(`✅ Cell boundary index complete: ${cellBoundaryIndex.size} cells across ${totalPlanes} planes (${indexLoadTime.toFixed(1)}s)`);
    
    // Debug: Show info for cell 7113
    const cell7113Planes = cellBoundaryIndex.get(7113);
    if (cell7113Planes) {
        console.log(`🎯 Cell 7113 found on ${cell7113Planes.length} planes: [${cell7113Planes.join(', ')}]`);
        console.log(`🎯 Cell 7113 range: planes ${Math.min(...cell7113Planes)} to ${Math.max(...cell7113Planes)}`);
    }
    
    // Build spatial index for fast queries
    console.log(`🗺️ Building spatial index for fast cell queries...`);
    const spatialIndex = await buildSpatialIndex(cellBoundaryIndex, appState);
    
    const endTime = performance.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log(`✅ Complete indexing done in ${totalTime.toFixed(1)}s (index: ${indexLoadTime.toFixed(1)}s + spatial: ${(totalTime - indexLoadTime).toFixed(1)}s)`);
    
    return { cellBoundaryIndex, spatialIndex };
}

/**
 * Load polygon data for a single plane and update the index
 * @param {number} planeId - Plane ID to load
 * @param {Map} cellBoundaryIndex - Index to update
 * @param {Object} appState - Application state
 */
async function loadPlaneForIndex(planeId, cellBoundaryIndex, appState) {
    try {
        const geojson = await loadPolygonData(
            planeId, 
            appState.polygonCache, 
            appState.allCellClasses, 
            appState.cellDataMap
        );
        
        if (geojson?.features && geojson.features.length > 0) {
            let cellCount = 0;
            for (let i = 0; i < geojson.features.length; i++) {
                const feature = geojson.features[i];
                const cellId = parseInt(feature.properties.label);
                if (!isNaN(cellId)) {
                    if (!cellBoundaryIndex.has(cellId)) {
                        cellBoundaryIndex.set(cellId, []);
                    }
                    cellBoundaryIndex.get(cellId).push(planeId);
                    cellCount++;
                }
                if (i % 1000 === 0) await idleYield();
            }
            
            // Log progress every 20 planes
            if (planeId % 20 === 0) {
                console.log(`📈 Background index progress: plane ${planeId} loaded (${cellCount} cells)`);
            }
        } else {
            // File exists but is empty or has no features
            console.log(`📄 Plane ${planeId} boundary file is empty, skipping`);
        }
        
    } catch (error) {
        if (error.message && error.message.includes('404')) {
            console.log(`📄 Plane ${planeId} boundary file not found, skipping`);
        } else if (error.message && error.message.includes('empty')) {
            console.log(`📄 Plane ${planeId} boundary file is empty, skipping`);
        } else {
            console.warn(`⚠️ Failed to load plane ${planeId} for background index:`, error.message || error);
        }
    }
}

/**
 * Build spatial index using RBush for fast cell queries
 * @param {Map} cellBoundaryIndex - Cell to planes mapping
 * @param {Object} appState - Application state
 * @returns {Promise<RBush>} RBush spatial index
 */
async function buildSpatialIndex(cellBoundaryIndex, appState) {
    const spatialIndex = new RBush();
    let processedCells = 0;
    const totalCells = cellBoundaryIndex.size;
    const entries = Array.from(cellBoundaryIndex.entries());
    // Calculate bounding boxes for each cell in small batches
    for (let i = 0; i < entries.length; i++) {
        const [cellId, planes] = entries[i];
        const bounds = calculateCellBounds(cellId, planes, appState.polygonCache);
        
        if (bounds) {
            // Insert into RBush spatial index
            spatialIndex.insert({
                minX: bounds.minX,
                minY: bounds.minY, 
                maxX: bounds.maxX,
                maxY: bounds.maxY,
                cellId: cellId,
                planes: planes
            });
        }
        
        processedCells++;
        if (processedCells % 250 === 0) await idleYield();
        if (processedCells % 1000 === 0) console.log(`🗺️ Spatial index progress: ${processedCells}/${totalCells} cells processed`);
    }
    
    console.log(`✅ Spatial index built: ${spatialIndex.all().length} cells indexed`);
    return spatialIndex;
}

/**
 * Calculate maximum bounding box for a cell across all its planes
 * @param {number} cellId - Cell ID
 * @param {number[]} planes - Array of plane IDs where cell exists
 * @param {Map} polygonCache - Polygon cache
 * @returns {Object|null} {minX, minY, maxX, maxY} or null if no bounds found
 */
function calculateCellBounds(cellId, planes, polygonCache) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    let foundBounds = false;
    
    // Look through all planes where this cell exists
    for (const planeId of planes) {
        const geojson = polygonCache.get(planeId);
        if (geojson?.features) {
            const cellFeature = geojson.features.find(feature => 
                parseInt(feature.properties.label) === cellId
            );
            
            if (cellFeature && cellFeature.geometry?.coordinates?.[0]) {
                // Get bounds of this cell on this plane
                const coords = cellFeature.geometry.coordinates[0];
                coords.forEach(([x, y]) => {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                    foundBounds = true;
                });
            }
        }
    }
    
    return foundBounds ? { minX, minY, maxX, maxY } : null;
}

/**
 * Start background cell boundary index loading
 * @param {Object} appState - Application state object
 * @returns {Promise<Object>} Promise that resolves to {cellBoundaryIndex, spatialIndex}
 */
export function startBackgroundIndexing(appState) {
    console.log('🚀 Starting background cell boundary indexing...');
    return buildCellBoundaryIndex(appState);
}
