/**
 * Cell Indexes Module
 * Handles index-building and color-mapping for cells and gene spots
 */

/**
 * Build gene spot indexes for lightning-fast lookups
 * @param {Map} geneDataMap - Map of gene data by gene name
 * @param {Map} cellToSpotsIndex - Index to populate: cellId -> spots
 * @param {Map} spotToParentsIndex - Index to populate: spotId -> parents
 */
export function buildGeneSpotIndexes(geneDataMap, cellToSpotsIndex, spotToParentsIndex) {
    console.log('Building gene spot indexes for lightning-fast lookups...');

    // Clear existing indexes
    cellToSpotsIndex.clear();
    spotToParentsIndex.clear();

    let totalSpots = 0;
    let globalSpotIndex = 0;

    geneDataMap.forEach((spots, geneName) => {
        spots.forEach((spot, spotIndex) => {
            const spot_id = globalSpotIndex;
            globalSpotIndex++;
            totalSpots++;

            // Index 1: Cell parent -> spots
            const primaryParent = spot.neighbour;
            if (primaryParent) {
                if (!cellToSpotsIndex.has(primaryParent)) {
                    cellToSpotsIndex.set(primaryParent, []);
                }
                cellToSpotsIndex.get(primaryParent).push({
                    spot_id: spot_id,
                    gene: geneName,
                    x: spot.x,
                    y: spot.y,
                    z: spot.z,
                    plane_id: spot.plane_id,
                    neighbour: spot.neighbour,
                    neighbour_array: spot.neighbour_array,
                    prob: spot.prob,
                    prob_array: spot.prob_array,
                    intensity: spot.intensity,
                    score: spot.score
                });
            }

            // Index 2: Spot -> all parent candidates
            if (spot.neighbour_array && spot.prob_array) {
                spotToParentsIndex.set(spot_id, {
                    parents: spot.neighbour_array,
                    probabilities: spot.prob_array,
                    gene: geneName,
                    coordinates: {
                        x: spot.x,
                        y: spot.y,
                        z: spot.z,
                        plane_id: spot.plane_id
                    }
                });
            }
        });
    });

    console.log(` Built indexes: ${cellToSpotsIndex.size} cells, ${spotToParentsIndex.size} spots (${totalSpots} total)`);
}

/**
 * Get the most probable cell class from cellData
 */
export function getMostProbableCellClass(cellNum, cellDataMap) {
    const cellData = cellDataMap.get(parseInt(cellNum));
    if (!cellData) {
        return 'Unknown';
    }
    let names = cellData?.classification?.className;
    let probs = cellData?.classification?.probability;
    if (!names) return 'Unknown';
    
    if (!Array.isArray(names) && typeof names === 'string') {
        try { const parsed = JSON.parse(names.replace(/'/g, '"')); if (Array.isArray(parsed)) names = parsed; } catch {}
    }
    if (!Array.isArray(names) || !Array.isArray(probs) || probs.length !== names.length) {
        return 'Unknown';
    }
    
    let maxProbIndex = -1; let maxProb = -Infinity;
    for (let i = 0; i < probs.length; i++) {
        if (typeof probs[i] === 'number' && probs[i] > maxProb) {
            maxProb = probs[i];
            maxProbIndex = i;
        }
    }
    
    if (maxProbIndex < 0 || maxProbIndex >= names.length) return 'Unknown';
    const result = String(names[maxProbIndex]).trim();
    return result || 'Unknown';
}

/**
 * Get color for a cell class using global classColorsCodes
 */
export function getCellClassColor(className) {
    if (Array.isArray(className)) return [192, 192, 192];
    const key = String(className || '').trim();
    
    if (typeof classColorsCodes === 'function') {
        const colorConfig = classColorsCodes();
        const classEntry = colorConfig.find(entry => entry.className === key);
        if (classEntry && classEntry.color) {
            const hex = classEntry.color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return [r, g, b];
        }
    }
    return [192, 192, 192];
}

/**
 * Build cell boundary index for fast lookup
 */
export function buildCellBoundaryIndex(polygonCache, cellBoundaryIndex) {
    console.log('Building cell boundary index for fast lookup...');
    cellBoundaryIndex.clear();
    let totalBoundaries = 0;

    polygonCache.forEach((geojson, planeId) => {
        if (geojson && geojson.features) {
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.label) {
                    const cellId = parseInt(feature.properties.label);
                    if (!cellBoundaryIndex.has(cellId)) {
                        cellBoundaryIndex.set(cellId, []);
                    }
                    cellBoundaryIndex.get(cellId).push(planeId);
                    totalBoundaries++;
                }
            });
        }
    });
    console.log(` Built cell boundary index: ${cellBoundaryIndex.size} cells across ${polygonCache.size} planes (${totalBoundaries} total boundaries)`);
}

/**
 * Update cell boundary index when new polygon data is loaded
 */
export function updateCellBoundaryIndex(planeId, geojson, cellBoundaryIndex) {
    if (!geojson || !geojson.features) return;

    geojson.features.forEach(feature => {
        if (feature.properties && feature.properties.label) {
            const cellId = parseInt(feature.properties.label);
            if (!cellBoundaryIndex.has(cellId)) {
                cellBoundaryIndex.set(cellId, []);
            }
            const planes = cellBoundaryIndex.get(cellId);
            if (!planes.includes(planeId)) {
                planes.push(planeId);
            }
        }
    });
}

/**
 * Get all plane IDs where a cell has boundaries
 */
export function getCellBoundaryPlanes(cellId, cellBoundaryIndex) {
    return cellBoundaryIndex.get(cellId) || [];
}

/**
 * Assign colors to cell classes for consistent visualization
 */
export function assignColorsToCellClasses(allCellClasses, cellClassColors) {
    const classes = Array.from(allCellClasses);
    classes.forEach((cellClass) => {
        if (!cellClassColors.has(cellClass)) {
            cellClassColors.set(cellClass, getCellClassColor(cellClass));
        }
    });
}
