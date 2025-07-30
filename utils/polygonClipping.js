/**
 * Polygon Clipping Utilities using Turf.js
 * 
 * Provides functions to clip cell boundary polygons to selection bounding boxes
 */

// No coordinate transformation needed - polygons and bounds are in same system

/**
 * Clips a cell boundary polygon to a rectangular bounding box
 * @param {Object} cellBoundary - GeoJSON Feature with polygon geometry
 * @param {Object} bounds - Bounding box {left, right, top, bottom}
 * @returns {Object|null} - Clipped GeoJSON Feature or null if no intersection
 */
export function clipPolygonToBounds(cellBoundary, bounds) {
    try {
        // Validate cell boundary geometry
        if (!cellBoundary || !cellBoundary.geometry || !cellBoundary.geometry.coordinates) {
            console.warn('Invalid cell boundary geometry:', cellBoundary);
            return null;
        }

        // Check if geometry has valid coordinates
        const coords = cellBoundary.geometry.coordinates;
        if (!Array.isArray(coords) || coords.length === 0) {
            console.warn('Empty coordinates in cell boundary:', cellBoundary);
            return null;
        }

        // For polygon, check if we have at least 3 points in the outer ring
        if (cellBoundary.geometry.type === 'Polygon') {
            const outerRing = coords[0];
            if (!Array.isArray(outerRing) || outerRing.length < 4) { // Polygons need to be closed, so 4 points minimum
                console.warn('Invalid polygon coordinates - need at least 4 points (closed ring):', outerRing);
                return null;
            }
        }

        // Create bounding box polygon using Turf.js
        const bboxPolygon = turf.bboxPolygon([
            bounds.left,   // minX
            bounds.top,    // minY  
            bounds.right,  // maxX
            bounds.bottom  // maxY
        ]);

        // Debug bounding box creation
        if (cellBoundary.properties?.label === 15343) {
            console.log('DEBUG: Bbox creation for cell 15343:', {
                boundsInput: bounds,
                bboxArray: [bounds.left, bounds.top, bounds.right, bounds.bottom],
                bboxPolygon: JSON.stringify(bboxPolygon),
                turfType: typeof turf,
                turfBboxPolygon: typeof turf.bboxPolygon
            });
        }

        // Debug: Check if both geometries are valid before intersection
        if (!bboxPolygon || !bboxPolygon.geometry) {
            console.warn('Invalid bounding box polygon created:', bounds);
            return null;
        }

        // Validate the cell boundary has proper GeoJSON structure
        if (cellBoundary.type !== 'Feature' || !cellBoundary.geometry) {
            console.warn('Cell boundary is not a valid GeoJSON Feature:', cellBoundary);
            return null;
        }

        // Try to clean up the polygon coordinates and validate it
        let cleanedBoundary;
        try {
            cleanedBoundary = turf.cleanCoords(cellBoundary);
            
            // Check if cleaned polygon still has valid geometry
            if (!cleanedBoundary.geometry.coordinates[0] || cleanedBoundary.geometry.coordinates[0].length < 4) {
                console.warn('Polygon became invalid after cleaning:', cellBoundary.properties?.label);
                return null;
            }
        } catch (cleanError) {
            console.warn('Error cleaning polygon coordinates for cell', cellBoundary.properties?.label, ':', cleanError);
            return null;
        }

        // Additional validation before intersection
        if (!cleanedBoundary || !cleanedBoundary.geometry || cleanedBoundary.geometry.type !== 'Polygon') {
            console.warn('Cleaned boundary is not a valid polygon:', cleanedBoundary);
            return null;
        }

        // Use the cleaned boundary directly (no transformation needed)
        const transformedBoundary = cleanedBoundary;

        // Debug problematic polygons before intersection
        if (cellBoundary.properties?.label === 15343) {
            console.log('DEBUG: Cell 15343 before intersection:', {
                transformedBoundary: JSON.stringify(transformedBoundary),
                bboxPolygon: JSON.stringify(bboxPolygon),
                transformedBoundaryType: transformedBoundary?.type,
                bboxPolygonType: bboxPolygon?.type,
                transformedGeom: transformedBoundary?.geometry?.type,
                bboxGeom: bboxPolygon?.geometry?.type
            });
        }

        // Validate both geometries exist before intersection
        if (!transformedBoundary || !bboxPolygon) {
            console.warn('Missing geometry for intersection:', {
                transformedBoundary: !!transformedBoundary,
                bboxPolygon: !!bboxPolygon,
                cellLabel: cellBoundary.properties?.label
            });
            return null;
        }

        // Create a fresh bounding box right before intersection to avoid any mutation issues
        const freshBboxPolygon = turf.bboxPolygon([
            bounds.left,   // minX
            bounds.top,    // minY  
            bounds.right,  // maxX
            bounds.bottom  // maxY
        ]);

        // Perform intersection clipping with fresh bounding box
        const clipped = turf.intersect(transformedBoundary, freshBboxPolygon);
        
        if (!clipped) {
            // No intersection - polygon is completely outside bounds
            return null;
        }

        // Preserve original properties but mark as clipped
        return {
            ...clipped,
            properties: {
                ...cellBoundary.properties,
                clipped: true,
                original_area: turf.area(cellBoundary),
                clipped_area: turf.area(clipped)
            }
        };

    } catch (error) {
        console.warn('Error clipping polygon (cell label:', cellBoundary?.properties?.label, '):', error);
        return null;
    }
}

/**
 * Clips multiple cell boundary polygons to a bounding box
 * @param {Array|Object} cellBoundaries - Array of GeoJSON Features OR GeoJSON FeatureCollection
 * @param {Object} bounds - Bounding box {left, right, top, bottom}
 * @returns {Array} - Array of clipped polygons (excludes null results)
 */
export function clipPolygonsToBounds(cellBoundaries, bounds) {
    const clippedPolygons = [];
    
    // Handle both array of features and GeoJSON FeatureCollection
    const features = Array.isArray(cellBoundaries) ? cellBoundaries : cellBoundaries.features;
    
    if (!features || !Array.isArray(features)) {
        console.warn('Invalid cellBoundaries format:', cellBoundaries);
        return clippedPolygons;
    }
    
    // Debug first few boundaries to understand the structure
    if (features.length > 0) {
        console.log('Sample boundary structure:', {
            type: features[0].type,
            geometry_type: features[0].geometry?.type,
            coords_length: features[0].geometry?.coordinates?.length,
            first_ring_length: features[0].geometry?.coordinates?.[0]?.length,
            sample_coords: features[0].geometry?.coordinates?.[0]?.slice(0, 3)
        });
    }
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const boundary of features) {
        const clipped = clipPolygonToBounds(boundary, bounds);
        if (clipped) {
            clippedPolygons.push(clipped);
            validCount++;
        } else {
            invalidCount++;
        }
    }
    
    console.log(`Polygon clipping: ${features.length} input -> ${clippedPolygons.length} clipped (${validCount} valid, ${invalidCount} invalid/outside)`);
    return clippedPolygons;
}

/**
 * Gets all cell boundaries for planes within the selection area and clips them
 * @param {Object} state - Application state with polygon cache
 * @param {Object} bounds - Selection bounding box
 * @returns {Array} - Array of clipped cell boundaries with plane_id info
 */
export function getClippedBoundariesInSelection(state, bounds) {
    const allClippedBoundaries = [];
    
    // Get all planes that have boundaries loaded
    if (!state.polygonCache) {
        console.warn('No polygon cache available');
        return allClippedBoundaries;
    }
    
    state.polygonCache.forEach((planeBoundaries, planeId) => {
        const clippedForPlane = clipPolygonsToBounds(planeBoundaries, bounds);
        
        // Add plane_id to each clipped boundary for identification
        clippedForPlane.forEach(boundary => {
            boundary.properties.plane_id = planeId;
            allClippedBoundaries.push(boundary);
        });
    });
    
    console.log(`Selection clipping: Found ${allClippedBoundaries.length} clipped boundaries across ${state.polygonCache.size} planes`);
    return allClippedBoundaries;
}