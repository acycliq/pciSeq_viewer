/**
 * Data Loading Module
 * 
 * This module handles loading and processing of gene expression data and polygon
 * boundary data from various sources (TSV files, remote APIs, etc.)
 */

import { 
    GENE_DATA_URL, 
    IMG_DIMENSIONS, 
    POLYGON_ALIAS_THRESHOLDS,
    POLYGON_COLOR_PALETTE,
    getPolygonFileUrl 
} from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

// Note: classColorsCodes function is loaded globally from classConfig.js

/**
 * Load image with promise wrapper for error handling
 * @param {string} url - Image URL to load
 * @param {boolean} suppressErrors - Whether to suppress error logging
 * @returns {Promise<HTMLImageElement>} Loaded image element
 */
export async function loadImage(url, suppressErrors = false) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => {
            const error = new Error(`Failed to load image: ${url}`);
            error.suppressLogging = suppressErrors;
            reject(error);
        };
        img.src = url;
    });
}

/**
 * Load and parse gene expression data from TSV file using Web Worker
 * Populates the gene data map and builds icon atlas
 * @param {Map} geneDataMap - Map to store gene data by gene name
 * @param {Set} selectedGenes - Set to track visible genes
 * @returns {Object} Icon atlas and mapping for gene visualization
 */
export async function loadGeneData(geneDataMap, selectedGenes) {
    if (geneDataMap.size > 0) return { atlas: null, mapping: null };

    try {
        // Use Web Worker for non-blocking data loading
        const geneData = await loadGeneDataWithWorker();
        
        // Clear existing data
        geneDataMap.clear();
        selectedGenes.clear();
        
        // Populate gene data map (same format as before)
        geneData.forEach(({ gene, spots }) => {
            geneDataMap.set(gene, spots);
            selectedGenes.add(gene);
        });

        // Build icon atlas for gene visualization
        const genes = Array.from(geneDataMap.keys());
        const {atlas, mapping} = buildGeneIconAtlas(genes);
        
        return { atlas, mapping };

    } catch (err) {
        console.error('Failed to load gene data:', err);
        return { atlas: null, mapping: null };
    }
}

/**
 * Load and parse cell metadata from TSV file using Web Worker
 * Populates the cell data map
 * @param {Map} cellDataMap - Map to store cell data by cell number
 * @returns {Promise<boolean>} Success status
 */
export async function loadCellData(cellDataMap) {
    if (cellDataMap.size > 0) {
        console.log('Cell data already loaded');
        return true;
    }

    try {
        // Use Web Worker for non-blocking data loading
        const cellData = await loadCellDataWithWorker();
        
        // Clear existing data
        cellDataMap.clear();
        
        // Populate cell data map
        cellData.forEach(cell => {
            cellDataMap.set(cell.cellNum, cell);
        });
        
        console.log(`✅ Cell data loaded: ${cellDataMap.size} cells`);
        return true;

    } catch (err) {
        console.error('Failed to load cell data:', err);
        return false;
    }
}

/**
 * Load data using unified Web Worker
 * @param {string} dataType - Type of data to load (loadGeneData, loadCellData, loadBoundaryData)
 * @param {string} url - URL to load data from
 * @param {number} [planeId] - Plane ID for boundary data
 * @returns {Promise<any>} Processed data
 */
async function loadDataWithUnifiedWorker(dataType, url, planeId = null) {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./unifiedWorker.js');
        
        worker.onmessage = function(event) {
            const { type, data, error, planeId: returnedPlaneId } = event.data;
            
            if (type === 'success') {
                // For boundary data, check planeId matches
                if (dataType === 'loadBoundaryData' && returnedPlaneId !== planeId) {
                    return; // Ignore responses for different planes
                }
                worker.terminate();
                resolve(data);
            } else if (type === 'error') {
                // For boundary data, check planeId matches
                if (dataType === 'loadBoundaryData' && returnedPlaneId !== planeId) {
                    return; // Ignore errors for different planes
                }
                worker.terminate();
                reject(new Error(error));
            }
        };
        
        worker.onerror = function(error) {
            worker.terminate();
            reject(error);
        };
        
        // Send request to unified worker
        const absoluteUrl = new URL(url, window.location.href).href;
        const message = {
            type: dataType,
            url: absoluteUrl
        };
        
        if (planeId !== null) {
            message.planeId = planeId;
        }
        
        worker.postMessage(message);
    });
}

/**
 * Load cell data using unified Web Worker
 * @returns {Promise<Array>} Processed cell data
 */
async function loadCellDataWithWorker() {
    const cellDataUrl = './data/cellData.tsv';
    return loadDataWithUnifiedWorker('loadCellData', cellDataUrl);
}

/**
 * Load gene data using unified Web Worker
 * @returns {Promise<Array>} Processed gene data
 */
async function loadGeneDataWithWorker() {
    return loadDataWithUnifiedWorker('loadGeneData', GENE_DATA_URL);
}

/**
 * Build icon atlas canvas for gene visualization
 * Creates a single canvas with all gene symbols for efficient rendering
 * @param {string[]} genes - Array of gene names
 * @returns {Object} Canvas atlas and coordinate mapping
 */
function buildGeneIconAtlas(genes) {
    const settings = glyphSettings();
    const configMap = new Map(settings.map(s => [s.gene, {glyphName: s.glyphName, color: s.color}]));
    const defaultConfig = configMap.get('Generic') || {glyphName: 'circle', color: '#ffffff'};

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size * genes.length;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const mapping = {};

    genes.forEach((gene, i) => {
        const cfg = configMap.get(gene) || defaultConfig;
        const p = {x: i * size + size/2, y: size/2};
        const r = size * 0.4;
        
        ctx.save();
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 4;
        ctxPath(cfg.glyphName, ctx, p, r);
        ctx.stroke();
        ctx.restore();
        
        mapping[gene] = {x: i * size, y: 0, width: size, height: size};
    });

    return {atlas: canvas, mapping};
}

/**
 * Get the most probable cell class from cellData
 * @param {string|number} cellNum - Cell number
 * @param {Map} cellDataMap - Map containing cell data
 * @returns {string} Most probable cell class
 */
function getMostProbableCellClass(cellNum, cellDataMap) {
    const cellData = cellDataMap.get(parseInt(cellNum));
    if (!cellData || !cellData.classification || !cellData.classification.className || !cellData.classification.probability) {
        return 'Generic'; // Fallback class
    }
    
    // Find the class with highest probability
    let maxProbIndex = 0;
    let maxProb = 0;
    
    cellData.classification.probability.forEach((prob, index) => {
        if (prob > maxProb) {
            maxProb = prob;
            maxProbIndex = index;
        }
    });
    
    return cellData.classification.className[maxProbIndex] || 'Generic';
}

/**
 * Get color for a cell class using classConfig
 * @param {string} className - Cell class name
 * @returns {Array} RGB color array
 */
function getCellClassColor(className) {
    // Import and use the classColorsCodes function from classConfig
    if (typeof classColorsCodes === 'function') {
        const colorConfig = classColorsCodes();
        const classEntry = colorConfig.find(entry => entry.className === className);
        if (classEntry && classEntry.color) {
            // Convert hex color to RGB array
            const hex = classEntry.color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return [r, g, b];
        }
    }
    
    // Fallback to generic gray color
    return [192, 192, 192]; // #C0C0C0
}

/**
 * Convert TSV polygon data to GeoJSON format
 * Transforms coordinates to tile space and assigns aliases
 * @param {Object[]} tsvData - Raw TSV data rows
 * @param {number} planeId - Current plane ID
 * @param {Set} allPolygonAliases - Set to track all discovered aliases
 * @returns {Object} GeoJSON FeatureCollection
 */
function tsvToGeoJSON(tsvData, planeId, allCellClasses, cellDataMap) {
    const features = tsvData.flatMap(row => {
        if (!row || !row.coords) return [];

        try {
            const parsedCoords = JSON.parse(row.coords);
            if (!Array.isArray(parsedCoords) || parsedCoords.length < 3) return [];

            // Transform coordinates from image space to tile space (256x256)
            // This ensures polygons align with gene markers and background tiles
            const scaledCoords = parsedCoords.map(([x, y]) => 
                transformToTileCoordinates(x, y, IMG_DIMENSIONS)
            );

            // Get most probable cell class instead of alias
            const cellClass = getMostProbableCellClass(row.label, cellDataMap);
            allCellClasses.add(cellClass);

            return [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [scaledCoords]
                },
                properties: {
                    plane_id: planeId,
                    label: row.label,
                    cellClass: cellClass // Use cellClass instead of alias
                }
            }];
        } catch (e) {
            console.error(`Skipping polygon feature due to JSON parsing error`, e);
            return [];
        }
    });

    return { type: 'FeatureCollection', features: features };
}

/**
 * Load polygon boundary data for a specific plane using Web Worker
 * Handles caching, coordinate transformation, and alias generation
 * @param {number} planeNum - Plane number to load
 * @param {Map} polygonCache - Cache for polygon data
 * @param {Set} allPolygonAliases - Set to track all polygon aliases
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function loadPolygonData(planeNum, polygonCache, allCellClasses, cellDataMap = null) {
    // Return cached data if available
    if (polygonCache.has(planeNum)) {
        const cachedData = polygonCache.get(planeNum);
        console.log(`Using cached polygon data for plane ${planeNum}, features: ${cachedData?.features?.length || 0}`);
        return cachedData;
    }

    try {
        console.log(`Loading polygon data for plane ${planeNum} with Web Worker`);
        
        // Use Web Worker for non-blocking data loading
        const rawGeojson = await loadPolygonDataWithWorker(planeNum);
        
        // Transform coordinates from image space to tile space (same as original)
        const geojson = {
            type: 'FeatureCollection',
            features: rawGeojson.features.map(feature => ({
                ...feature,
                geometry: {
                    ...feature.geometry,
                    coordinates: [
                        feature.geometry.coordinates[0].map(([x, y]) => 
                            transformToTileCoordinates(x, y, IMG_DIMENSIONS)
                        )
                    ]
                }
            }))
        };
        
        // Extract cell classes from the loaded data and update with cellData if available
        if (cellDataMap && cellDataMap.size > 0) {
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.label) {
                    const cellClass = getMostProbableCellClass(feature.properties.label, cellDataMap);
                    feature.properties.cellClass = cellClass;
                    allCellClasses.add(cellClass);
                }
            });
        } else {
            // Fallback: extract existing cell classes
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.cellClass) {
                    allCellClasses.add(feature.properties.cellClass);
                }
            });
        }
        
        console.log(`Loaded ${geojson.features.length} polygons for plane ${planeNum}`);
        
        // Cache the result for future use
        polygonCache.set(planeNum, geojson);

        return geojson;
    } catch (err) {
        console.error(`Failed to load polygon data for plane ${planeNum}:`, err);
        console.error('Error details:', err.message, err.stack);
        
        // Return empty collection on error (don't cache failures)
        return { type: 'FeatureCollection', features: [] };
    }
}

/**
 * Load polygon data using unified Web Worker
 * @param {number} planeNum - Plane number to load
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
async function loadPolygonDataWithWorker(planeNum) {
    const polygonUrl = getPolygonFileUrl(planeNum);
    return loadDataWithUnifiedWorker('loadBoundaryData', polygonUrl, planeNum);
}

/**
 * Assign colors to polygon aliases for consistent visualization
 * @param {Set} allPolygonAliases - All discovered aliases
 * @param {Map} polygonAliasColors - Map to store alias colors
 * @param {Map} polygonAliasVisibility - Map to store alias visibility
 */
export function assignColorsToCellClasses(allCellClasses, cellClassColors, cellClassVisibility) {
    const classes = Array.from(allCellClasses);
    classes.forEach((cellClass) => {
        if (!cellClassColors.has(cellClass)) {
            const color = getCellClassColor(cellClass);
            cellClassColors.set(cellClass, color);
        }
        if (!cellClassVisibility.has(cellClass)) {
            cellClassVisibility.set(cellClass, true);
        }
    });
}