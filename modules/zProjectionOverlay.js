/**
 * Z-Projection Plane Overlay System
 * 
 * Renders ONLY cell boundaries from all planes into a single overlay texture
 * for instant 3D spatial context visualization. This overlay is independent
 * of background DAPI images - it shows purely the cell segmentation data
 * from all Z-planes simultaneously as semi-transparent boundary lines.
 * 
 * Purpose: Allow users to see "ghost boundaries" of cells from other planes
 * without having to manually scrub through 100+ planes to understand
 * the 3D cell architecture and spatial relationships.
 */

// Import BitmapLayer from global deck object (since deck.gl is loaded via CDN)
const { BitmapLayer } = window.deck;
import { USE_ARROW, IMG_DIMENSIONS, getPolygonFileUrl } from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

// Global state - reset cache to force rebuild with new coordinate system
let globalZProjectionTexture = null;
let isBuilding = false;
let buildPromise = null;

/**
 * Build global Z-projection overlay from all cell boundaries
 * @param {Object} appState - Application state containing data
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<ImageBitmap>} The rendered texture
 */
export async function buildGlobalZProjection(appState, progressCallback = null) {
    if (globalZProjectionTexture) {
        console.log('Global Z-projection already built');
        return globalZProjectionTexture;
    }
    
    if (isBuilding) {
        console.log('Global Z-projection build in progress, waiting...');
        return buildPromise;
    }
    
    isBuilding = true;
    const startTime = performance.now();
    
    try {
        console.log('🏗️ Building global Z-projection overlay...');
        console.log('🔍 AppState available:', !!appState);
        console.log('🔍 AppState keys:', appState ? Object.keys(appState) : 'none');
        
        buildPromise = _buildZProjectionTexture(appState, progressCallback);
        globalZProjectionTexture = await buildPromise;
        
        console.log('🔍 Texture created:', !!globalZProjectionTexture);
        
        const buildTime = performance.now() - startTime;
        console.log(`✅ Global Z-projection built in ${(buildTime / 1000).toFixed(1)}s`);
        
        return globalZProjectionTexture;
        
    } catch (error) {
        console.error('❌ Failed to build global Z-projection:', error);
        console.error('❌ Error stack:', error.stack);
        globalZProjectionTexture = null; // Reset on failure
        throw error;
    } finally {
        isBuilding = false;
        buildPromise = null;
    }
}

/**
 * Internal function to build the Z-projection texture
 */
async function _buildZProjectionTexture(appState, progressCallback) {
    const { width: imageWidth, height: imageHeight, tileSize } = IMG_DIMENSIONS;
    
    /*
     * COORDINATE SYSTEM SCALING LOGIC - CRITICAL FOR ALIGNMENT
     * 
     * This Z-projection overlay must use the EXACT SAME coordinate transformation
     * logic as the existing layers (GeoJsonLayer for polygons, IconLayer for spots)
     * to ensure perfect alignment. Here's how the math works:
     * 
     * PROBLEM: 
     * - Raw image dimensions: 6411×4412 pixels (or any arbitrary size)
     * - Deck.gl layers use a normalized coordinate system based on tileSize=256
     * - All existing layers transform coordinates using utils/coordinateTransform.js
     * 
     * SOLUTION:
     * The transformation logic normalizes coordinates to fit within a tile-based system
     * while preserving aspect ratio:
     * 
     * Step 1: Find the maximum dimension (ensures proportional scaling)
     *   maxDimension = max(6411, 4412) = 6411
     * 
     * Step 2: Calculate aspect ratio adjustments
     *   xAdjustment = imageWidth / maxDimension = 6411/6411 = 1.000
     *   yAdjustment = imageHeight / maxDimension = 4412/6411 = 0.688
     * 
     * Step 3: Calculate canvas dimensions in tile coordinate space
     *   canvasWidth = tileSize × xAdjustment = 256 × 1.000 = 256.0
     *   canvasHeight = tileSize × yAdjustment = 256 × 0.688 = 176.2
     * 
     * Step 4: Transform each coordinate using the same formula as transformToTileCoordinates:
     *   x_transformed = x_raw × (tileSize/imageWidth) × xAdjustment
     *   y_transformed = y_raw × (tileSize/imageHeight) × yAdjustment
     * 
     * RESULT: 
     * - Canvas: 256×176 pixels (preserves 6411:4412 aspect ratio)
     * - BitmapLayer bounds: [0, 176.2, 256.0, 0] (Y-flipped for deck.gl)
     * - Perfect alignment with existing polygon and spot layers
     * 
     * CRITICAL: This logic must match utils/coordinateTransform.js exactly!
     * Any deviation will cause misalignment between the overlay and existing layers.
     */
    const maxDimension = Math.max(imageWidth, imageHeight);
    
    // Calculate aspect ratio adjustments (same logic as transformToTileCoordinates)
    const xAdjustment = imageWidth / maxDimension;
    const yAdjustment = imageHeight / maxDimension;
    
    // Create canvas at FULL image resolution for crisp rendering
    // We'll handle coordinate transformation in the BitmapLayer bounds instead
    const canvas = new OffscreenCanvas(imageWidth, imageHeight);
    const ctx = canvas.getContext('2d');
    
    console.log(`Creating Z-projection canvas at full image resolution:`);
    console.log(`- Image: ${imageWidth}x${imageHeight}`);
    console.log(`- Canvas: ${imageWidth}x${imageHeight} (full resolution for crisp rendering)`);
    
    // Set up canvas for CLEAR STROKE-ONLY rendering
    // Canvas starts transparent, we only add stroke outlines
    
    // Ensure canvas is completely transparent
    ctx.clearRect(0, 0, imageWidth, imageHeight);
    
    // Configure for thin boundary outlines only  
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';  // Semi-transparent white for visibility
    ctx.lineWidth = 1.0;  // Thin but visible lines
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'transparent';  // NO FILL - outlines only!
    
    const totalPlanes = window.config().totalPlanes;
    
    let processedPlanes = 0;
    let totalCells = 0;
    
    // Configure uniform stroke style for all boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';  // Change this value to increase visibility
    ctx.lineWidth = 0.5;  // Change this value to make the lines thicker
    
    // Render boundaries from all planes for comprehensive overlay
    const planesToProcess = Array.from({length: totalPlanes}, (_, i) => i);
    
    for (const planeNum of planesToProcess) {
        if (planeNum < 0 || planeNum >= totalPlanes) continue;
        
        try {
            
            const boundaries = await getBoundariesForPlane(planeNum, appState);
            
            if (boundaries && boundaries.features) {
                // Render ALL boundaries from each plane
                boundaries.features.forEach(feature => {
                    if (feature.geometry && feature.geometry.coordinates) {
                        renderFeatureToCanvas(ctx, feature);
                        totalCells++;
                    }
                });
                processedPlanes++;
                
                // Progress callback every 10 planes
                if (progressCallback && processedPlanes % 10 === 0) {
                    progressCallback({
                        planesProcessed: processedPlanes,
                        totalPlanes: totalPlanes,
                        cellsProcessed: totalCells
                    });
                }
            }
            
        } catch (error) {
            console.warn(`Failed to process plane ${planeNum}:`, error);
        }
    }
    
    
    console.log(`✅ Z-projection plane overlay completed: ${totalCells} cells from ${processedPlanes} planes`);
    console.log(`📐 Canvas: ${imageWidth}×${imageHeight} pixels (full resolution)`);
    
    // Convert to ImageBitmap for GPU upload
    try {
        const imageBitmap = canvas.transferToImageBitmap();
        console.log('🔍 ImageBitmap created successfully:', !!imageBitmap);
        console.log('🔍 ImageBitmap dimensions:', imageBitmap.width, 'x', imageBitmap.height);
        return imageBitmap;
    } catch (error) {
        console.error('❌ Failed to create ImageBitmap:', error);
        throw error;
    }
}

/**
 * Get boundary data for a specific plane
 */
async function getBoundariesForPlane(planeNum, appState) {
    // Check if already cached
    if (appState && appState.polygonCache && appState.polygonCache.has(planeNum)) {
        return appState.polygonCache.get(planeNum);
    }
    
    // Load boundary data
    if (USE_ARROW) {
        return await loadArrowBoundaries(planeNum);
    } else {
        return await loadTSVBoundaries(planeNum);
    }
}

/**
 * Load boundaries from Arrow format
 */
async function loadArrowBoundaries(planeNum) {
    try {
        const { loadBoundariesPlane } = await import('../arrow-loader/lib/arrow-loaders.js');
        const { buffers } = await loadBoundariesPlane(planeNum);
        
        if (!buffers || !buffers.positions || !buffers.labels) {
            return null;
        }
        
        // Convert Arrow buffers to GeoJSON format
        return convertArrowToGeoJSON(buffers, planeNum);
        
    } catch (error) {
        console.warn(`Failed to load Arrow boundaries for plane ${planeNum}:`, error);
        return null;
    }
}

/**
 * Load boundaries from TSV format  
 */
async function loadTSVBoundaries(planeNum) {
    try {
        const url = getPolygonFileUrl(planeNum);
        const response = await fetch(url);
        
        if (!response.ok) {
            return null;
        }
        
        const text = await response.text();
        return parseTSVToGeoJSON(text, planeNum);
        
    } catch (error) {
        console.warn(`Failed to load TSV boundaries for plane ${planeNum}:`, error);
        return null;
    }
}

/**
 * Convert Arrow buffers to GeoJSON (matches your actual Arrow data format)
 */
function convertArrowToGeoJSON(buffers, planeNum) {
    if (!buffers) {
        return { type: 'FeatureCollection', features: [] };
    }
    
    // Your actual Arrow data structure uses: positions, startIndices, length, labels
    const { positions, startIndices, length, labels } = buffers;
    
    if (!positions || !startIndices || !length) {
        console.warn(`Plane ${planeNum}: Missing required Arrow data`, { 
            positions: !!positions, 
            startIndices: !!startIndices, 
            length: !!length 
        });
        return { type: 'FeatureCollection', features: [] };
    }
    
    const features = [];
    
    try {
        // Process each polygon using startIndices (matches existing layerCreators.js logic)
        for (let pi = 0; pi < length; pi++) {
            const start = startIndices[pi];
            const end = startIndices[pi + 1];
            
            if (end - start < 3) continue; // Skip degenerate polygons
            
            const coordinates = [];
            for (let i = start; i < end; i++) {
                const x = positions[2 * i];
                const y = positions[2 * i + 1];
                
                // Transform to tile coordinates to match other CARTESIAN layers
                const [tx, ty] = transformToTileCoordinates(x, y, IMG_DIMENSIONS);
                coordinates.push([tx, ty]);
            }
            
            // Debug: Log boundary data to verify it's being processed
            if (pi < 3 && planeNum < 3) {
                console.log(`🔍 Polygon ${pi} on plane ${planeNum}:`, coordinates.length, 'points');
            }
            
            if (coordinates.length > 2) {
                // Close the polygon
                if (coordinates[0][0] !== coordinates[coordinates.length-1][0] || 
                    coordinates[0][1] !== coordinates[coordinates.length-1][1]) {
                    coordinates.push(coordinates[0]);
                }
                
                features.push({
                    type: 'Feature',
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coordinates]
                    },
                    properties: {
                        plane_id: planeNum,
                        label: labels ? labels[pi] : -1
                    }
                });
            }
        }
        
        console.log(`✅ Plane ${planeNum}: Converted ${features.length} polygons`);
        
    } catch (error) {
        console.error(`❌ Error converting plane ${planeNum}:`, error);
    }
    
    return {
        type: 'FeatureCollection',
        features: features
    };
}

/**
 * Parse TSV data to GeoJSON
 */
function parseTSVToGeoJSON(text, planeNum) {
    // Implementation depends on your TSV format
    // This is a placeholder - adapt to your actual TSV structure
    const lines = text.trim().split('\n');
    const headers = lines[0].split('\t');
    const features = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split('\t');
        // Parse TSV row to polygon coordinates
        // ... implementation specific to your format
    }
    
    return {
        type: 'FeatureCollection', 
        features: features
    };
}

// Note: transformToTileCoordinates is now imported from utils/coordinateTransform.js

/**
 * Render a GeoJSON feature to canvas
 */
function renderFeatureToCanvas(ctx, feature) {
    if (feature.geometry.type !== 'Polygon') return;
    
    const coordinates = feature.geometry.coordinates[0]; // Outer ring
    
    if (coordinates.length < 3) return;
    
    // Canvas is at full image resolution, but coordinates are in tile space
    // Need to scale coordinates back up to full canvas resolution
    
    const { width: imageWidth, height: imageHeight, tileSize } = IMG_DIMENSIONS;
    const maxDimension = Math.max(imageWidth, imageHeight);
    
    // Scale factor to convert from tile coordinates back to full canvas coordinates
    const scaleX = imageWidth / (tileSize * imageWidth / maxDimension);
    const scaleY = imageHeight / (tileSize * imageHeight / maxDimension);
    
    ctx.beginPath();
    const firstX = coordinates[0][0] * scaleX;
    const firstY = imageHeight - (coordinates[0][1] * scaleY); // Y-flip for canvas coords
    ctx.moveTo(firstX, firstY);
    
    for (let i = 1; i < coordinates.length; i++) {
        const x = coordinates[i][0] * scaleX;
        const y = imageHeight - (coordinates[i][1] * scaleY); // Y-flip for canvas coords
        ctx.lineTo(x, y);
    }
    
    ctx.closePath();
    ctx.stroke(); // STROKE ONLY - no fill!
}

/**
 * Create Deck.gl layer for the Z-projection overlay
 * @param {boolean} visible - Whether the overlay should be visible
 * @param {number} opacity - Overlay opacity (0-1)
 * @returns {BitmapLayer|null} The overlay layer
 */
export function createZProjectionLayer(visible = false, opacity = 0.3) {
    console.log('createZProjectionLayer called:', { visible, opacity, hasTexture: !!globalZProjectionTexture });
    
    if (!globalZProjectionTexture) {
        console.warn('No Z-projection texture available');
        return null;
    }
    
    const { width: imageWidth, height: imageHeight, tileSize } = IMG_DIMENSIONS;
    
    // Calculate tile coordinate bounds for proper alignment with CARTESIAN layers
    const maxDimension = Math.max(imageWidth, imageHeight);
    const tileWidth = tileSize * (imageWidth / maxDimension);
    const tileHeight = tileSize * (imageHeight / maxDimension);
    
    // Use tile coordinate bounds to align with existing CARTESIAN layers  
    const bounds = [0, 0, tileWidth, tileHeight];
    
    console.log('Z-projection bounds (tile coordinate alignment):');
    console.log(`- Canvas: ${imageWidth}x${imageHeight} (full resolution)`);
    console.log(`- Bounds: [0, 0, ${tileWidth.toFixed(1)}, ${tileHeight.toFixed(1)}] (tile coordinates)`);
    
    const layer = new BitmapLayer({
        id: 'z-projection-overlay',
        image: globalZProjectionTexture,
        bounds: bounds,
        opacity: opacity,
        visible: visible,
        coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
        parameters: {
            blend: true,
            blendFunc: [770, 771], // GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA
            depthTest: false
        }
    });
    
    console.log('Created Z-projection layer:', layer);
    return layer;
}

/**
 * Check if global Z-projection is ready
 * @returns {boolean}
 */
export function isZProjectionReady() {
    return globalZProjectionTexture !== null;
}

/**
 * Clear the global Z-projection (for memory cleanup)
 */
export function clearZProjection() {
    if (globalZProjectionTexture) {
        globalZProjectionTexture.close();
        globalZProjectionTexture = null;
    }
}