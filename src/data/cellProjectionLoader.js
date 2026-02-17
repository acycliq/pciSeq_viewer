/**
 * Cell Projection Loader Module
 * Handles loading and processing cell boundaries for projection mode
 */

/**
 * Load ALL planes for Cell Projection mode
 * @param {Object} state - Application state object
 * @param {Function} updateLayersCallback - Function to update layers after loading
 */
export async function loadAllPlanesForProjection(state, updateLayersCallback) {
    const totalPlanes = window.appState.totalPlanes;

    console.log(`Loading ALL ${totalPlanes} planes for Cell Projection mode (Arrow-only)...`);

    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        const textEl = document.getElementById('loadingText') || loadingIndicator;
        textEl.textContent = 'Loading all planes...';
    }

    // Load Arrow boundaries for all planes
    const { loadBoundariesPlane } = await import('../../arrow-loader/lib/arrow-loaders.js');
    const { arrowBoundaryCache, arrowGeojsonCache } = await import('../layers/boundaryCache.js');
    const { transformToTileCoordinates } = await import('../../utils/coordinateTransform.js');
    const { IMG_DIMENSIONS } = await import('../../config/constants.js');

    for (let plane = 0; plane < totalPlanes; plane++) {
        try {
            // Update loading indicator
            if (loadingIndicator) {
                const textEl = document.getElementById('loadingText') || loadingIndicator;
                textEl.textContent = `Loading plane ${plane + 1}/${totalPlanes}...`;
            }

            // Load boundaries into cache
            if (!arrowBoundaryCache.has(plane)) {
                const { buffers } = await loadBoundariesPlane(plane);
                arrowBoundaryCache.set(plane, buffers);
            }

            // Build GeoJSON cache for this plane
            if (!arrowGeojsonCache.has(plane)) {
                const buffers = arrowBoundaryCache.get(plane);
                if (buffers) {
                    buildGeoJsonCacheForPlane(plane, buffers, state, arrowGeojsonCache, transformToTileCoordinates, IMG_DIMENSIONS);
                }
            }
        } catch (error) {
            console.error(`Failed to load plane ${plane}:`, error);
        }
    }

    // Hide loading indicator
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    console.log(`Finished loading all ${totalPlanes} planes. arrowGeojsonCache has ${arrowGeojsonCache.size} planes cached.`);

    // Build flattened features array
    buildFlattenedProjectionFeatures(state, arrowGeojsonCache);

    // Update layers
    updateLayersCallback();
}

/**
 * Build GeoJSON cache for a single plane
 */
export function buildGeoJsonCacheForPlane(plane, buffers, state, arrowGeojsonCache, transformToTileCoordinates, IMG_DIMENSIONS) {
    // Transform coordinates to tile space if needed
    if (!buffers._tileTransformed) {
        const src = buffers.positions;
        const dst = new Float32Array(src.length);
        for (let i = 0; i < src.length; i += 2) {
            const x = src[i];
            const y = src[i + 1];
            const [tx, ty] = transformToTileCoordinates(x, y, IMG_DIMENSIONS);
            dst[i] = tx;
            dst[i + 1] = ty;
        }
        buffers.positions = dst;
        buffers._tileTransformed = true;
    }

    // Build GeoJSON features
    const { positions, startIndices, length, labels } = buffers;
    const features = [];

    for (let pi = 0; pi < length; pi++) {
        const start = startIndices[pi];
        const end = startIndices[pi + 1];
        if (end - start < 3) continue;

        const ring = [];
        for (let i = start; i < end; i++) {
            ring.push([positions[2 * i], positions[2 * i + 1]]);
        }

        const label = labels ? labels[pi] : -1;
        const cellProps = extractCellProperties(label, state);

        features.push({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: {
                plane_id: plane,
                label,
                cellClass: cellProps.cellClass,
                totalGeneCount: cellProps.totalGeneCount,
                colorRGB: cellProps.colorRGB
            }
        });
    }

    arrowGeojsonCache.set(plane, { type: 'FeatureCollection', features });
    console.log(`Built GeoJSON cache for plane ${plane}: ${features.length} features`);
}

/**
 * Extract cell properties from cellDataMap
 */
export function extractCellProperties(label, state) {
    let cellClass = 'Generic';
    let totalGeneCount = 0;
    let colorRGB = [192, 192, 192];

    if (state.cellDataMap && label >= 0) {
        const cell = state.cellDataMap.get(Number(label));
        if (cell) {
            // Extract cell class
            if (cell.classification) {
                const names = cell.classification.className;
                const probs = cell.classification.probability;
                if (Array.isArray(names) && Array.isArray(probs) && probs.length > 0) {
                    let bestIdx = 0;
                    let bestProb = probs[0];
                    for (let j = 1; j < probs.length; j++) {
                        if (probs[j] > bestProb) {
                            bestProb = probs[j];
                            bestIdx = j;
                        }
                    }
                    cellClass = names[bestIdx] || 'Unknown';
                }
            }

            // Extract totalGeneCount for GPU filtering
            totalGeneCount = cell.totalGeneCount || 0;

            // Precompute RGB color for this class
            if (state.cellClassColors && state.cellClassColors.has(cellClass)) {
                colorRGB = state.cellClassColors.get(cellClass);
            }
        }
    }

    return { cellClass, totalGeneCount, colorRGB };
}

/**
 * Build flattened projection features array from cache
 */
export function buildFlattenedProjectionFeatures(state, arrowGeojsonCache) {
    try {
        const flat = [];
        for (const fc of arrowGeojsonCache.values()) {
            if (fc && Array.isArray(fc.features)) flat.push(...fc.features);
        }
        state.cellProjectionFeatures = flat;
        window.appState && (window.appState.cellProjectionFeatures = flat);
        console.log(`Cell Projection features prepared (Arrow): ${flat.length}`);
    } catch (e) {
        console.warn('Failed to prepare flattened projection features:', e);
    }
}

/**
 * Prepare flattened feature array from existing caches
 */
export async function prepareProjectionFromCaches(state) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        const textEl = document.getElementById('loadingText') || loadingIndicator;
        textEl.textContent = 'Preparing projection...';
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    try {
        const { arrowGeojsonCache } = await import('../layers/boundaryCache.js');
        const flat = [];
        for (const fc of arrowGeojsonCache.values()) {
            if (fc && Array.isArray(fc.features)) flat.push(...fc.features);
        }
        state.cellProjectionFeatures = flat;
        window.appState && (window.appState.cellProjectionFeatures = flat);
        console.log(`Cell Projection features prepared from cache (Arrow): ${flat.length}`);
    } finally {
        if (loadingIndicator) loadingIndicator.style.display = 'none';
    }
}
