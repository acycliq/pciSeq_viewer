/**
 * Data Loading Module
 * 
 * This module handles loading and processing of gene expression data and polygon
 * boundary data from various sources (TSV files, remote APIs, etc.)
 */

import { 
    GENE_DATA_URL,
    CELL_DATA_URL,
    IMG_DIMENSIONS, 
    POLYGON_ALIAS_THRESHOLDS,
    POLYGON_COLOR_PALETTE,
    getPolygonFileUrl,
    USE_ARROW,
    ARROW_MANIFESTS
} from '../config/constants.js';
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
// Note: classColorsCodes is loaded globally from color scheme files

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
        if (USE_ARROW) {
            const { initArrow, loadSpots } = await import('../arrow-loader/lib/arrow-loaders.js');
            initArrow({
                spotsManifest: ARROW_MANIFESTS.spotsManifest,
                cellsManifest: ARROW_MANIFESTS.cellsManifest,
                boundariesManifest: ARROW_MANIFESTS.boundariesManifest,
                spotsGeneDict: ARROW_MANIFESTS.spotsGeneDict
            });
            const { shards, geneDict } = await loadSpots();
            // Expose raw Arrow shards and gene dictionary for binary PointCloud rendering
            try {
                if (window && window.appState) {
                    window.appState.arrowSpotShards = shards;
                    window.appState.arrowGeneDict = geneDict || {};
                }
            } catch {}
            // Build gene map: gene name -> array of spot objects
            geneDataMap.clear();
            selectedGenes.clear();
            const idToName = geneDict || {};
            let spotTotal = 0;
            for (const sh of shards) {
                const { x, y, z, plane_id, gene_id, spot_id, neighbour_array, neighbour_prob, omp_score, omp_intensity } = sh;
                const n = x.length;
                for (let i = 0; i < n; i++) {
                    const gid = gene_id[i];
                    const name = idToName[gid];
                    if (!geneDataMap.has(name)) { geneDataMap.set(name, []); selectedGenes.add(name); }
                    // Neighbour info (optional)
                    const nArr = Array.isArray(neighbour_array) ? neighbour_array[i] : null;
                    const pArr = Array.isArray(neighbour_prob) ? neighbour_prob[i] : null;
                    const primaryNeighbour = (nArr && nArr.length > 0) ? nArr[0] : null;
                    const primaryProb = (pArr && pArr.length > 0) ? Number(pArr[0]) : null;
                    geneDataMap.get(name).push({
                        spot_id: spot_id[i], // Use actual spot_id from Arrow files
                        x: x[i],
                        y: y[i],
                        z: z[i],
                        plane_id: plane_id[i],
                        gene: name,
                        neighbour: primaryNeighbour,
                        neighbour_array: nArr || null,
                        prob: primaryProb,
                        prob_array: pArr || null,
                        score: omp_score[i],
                        intensity: omp_intensity[i]
                    });
                    spotTotal++;
                }
            }
            if (window?.advancedConfig?.().performance?.showPerformanceStats) {
                console.log(`Arrow spots: genes=${geneDataMap.size}, spots=${spotTotal}`);
            }
            // Prebuild scatter (binary) cache in worker to eliminate main-thread freeze on first render
            try {
                const { buildSpotsScatterCache } = await import('../arrow-loader/lib/arrow-loaders.js');
                const cfg = window.config();
                const settings = glyphSettings();
                const colorByGene = new Map(settings.map(s => [s.gene, s.color]));
                const hexToRgb = (hex) => {
                    const color = d3.rgb(hex);
                    return [color.r, color.g, color.b];
                };
                const geneIdColors = {};
                for (const [gidStr, name] of Object.entries(idToName)) {
                    const col = colorByGene.get(name);
                    if (!col) {
                        console.warn(`Gene '${name}' missing color config, using white fallback`);
                        geneIdColors[gidStr] = hexToRgb('#ffffff');
                    } else {
                        geneIdColors[gidStr] = hexToRgb(col);
                    }
                }
                const manifestUrl = new URL(ARROW_MANIFESTS.spotsManifest, window.location.href).href;
                const img = { width: cfg.imageWidth, height: cfg.imageHeight, tileSize: 256 };
                const { positions, colors, planes, geneIds, scores, scoreMin } = await buildSpotsScatterCache({ manifestUrl, img, geneIdColors });
                window.appState.arrowScatterCache = { positions, colors, planes, geneIds, scores, length: (positions?.length||0)/3 };
                // Update score range with dataset min (UI min = min(0, scoreMin), max remains 1.0)
                try {
                    const rawMin = Number.isFinite(scoreMin) ? scoreMin : 0;
                    const uiMin = Math.min(0, rawMin);
                    window.appState.scoreRange = [uiMin, 1.0];
                    // Adjust slider bounds and default value to show all by default
                    const slider = document.getElementById('scoreFilterSlider');
                    const valueEl = document.getElementById('scoreFilterValue');
                    if (slider) {
                        slider.min = String(uiMin);
                        slider.max = '1.0';
                        if (window.appState.scoreThreshold === 0) {
                            // If user hasn't changed it yet, set to min to include negatives
                            slider.value = String(uiMin);
                            window.appState.scoreThreshold = uiMin;
                            if (valueEl) valueEl.textContent = Number(uiMin).toFixed(2);
                        }
                    }
                } catch {}
                if (window?.advancedConfig?.().performance?.showPerformanceStats) {
                    console.log(`✅ Prebuilt scatter cache in worker: points=${window.appState.arrowScatterCache.length}`);
                }
            } catch (e) {
                console.warn('Failed to prebuild scatter cache in worker:', e);
            }
            
            // For Arrow data, assume scores are available (can be refined later if needed)
            window.appState.hasScores = true;
            console.log('Arrow dataset: assuming scores are available');
        } else {
            // Use Web Worker for non-blocking data loading (TSV)
            const workerResult = await loadGeneDataWithWorker();
            const { geneData, hasScores } = workerResult;
            
            // Store hasScores flag in state
            window.appState.hasScores = hasScores;
            console.log(`Dataset has valid OMP scores: ${hasScores}`);
            
            geneDataMap.clear();
            selectedGenes.clear();
            geneData.forEach(({ gene, spots }) => {
                geneDataMap.set(gene, spots);
                selectedGenes.add(gene);
            });
        }
        
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
        if (USE_ARROW) {
            const { initArrow, loadCells } = await import('../arrow-loader/lib/arrow-loaders.js');
            initArrow({
                spotsManifest: ARROW_MANIFESTS.spotsManifest,
                cellsManifest: ARROW_MANIFESTS.cellsManifest,
                boundariesManifest: ARROW_MANIFESTS.boundariesManifest,
                spotsGeneDict: ARROW_MANIFESTS.spotsGeneDict
            });
            const { columns } = await loadCells(); // No classDict needed anymore
            const X = columns.X, Y = columns.Y, Z = columns.Z, cell_id = columns.cell_id;
            const className = columns.class_name || [];
            const prob = columns.prob || [];
            const n = cell_id?.length || 0;
            cellDataMap.clear();
            
            for (let i = 0; i < n; i++) {
                const cid = cell_id[i];
                // class_name and prob are now native arrays from Arrow
                let classNames = className[i]; // Already an array
                let probs = prob[i]; // Already an array
                let cname = null;
                if (classNames && probs && probs.length === classNames.length) {
                    let best = -Infinity, idx = -1;
                    for (let k = 0; k < probs.length; k++) {
                        const v = probs[k];
                        if (!Number.isNaN(v) && v > best) { best = v; idx = k; }
                    }
                    if (idx >= 0) cname = String(classNames[idx]).trim();
                }
                // No fallback needed - class names are directly in the data
                if (!cname) {
                    console.warn(`Cell ${cid} has no valid classification, using 'Unknown' fallback. ClassNames:`, classNames, 'Probs:', probs);
                    cname = 'Unknown';
                }
                const cell = {
                    cellNum: cid,
                    position: {x: X[i],y: Y[i],z: Z[i]},
                    geneExpression: { geneNames: [], geneCounts: [] },
                    classification: {
                        className: classNames && classNames.length ? classNames.map(s => String(s).trim()) : [cname],
                        probability: Array.isArray(probs) && probs.length ? probs : [1]
                    },
                    totalGeneCount: 0,
                    uniqueGenes: 0,
                    primaryClass: cname,
                    primaryProb: (Array.isArray(probs) && probs.length) ? Math.max(...probs) : undefined
                };
                cellDataMap.set(cid, cell);
            }
            console.log(`Cell data (Arrow) loaded: ${cellDataMap.size} cells`);
            if (cellDataMap.size === 0) {
                console.error('DEBUG: Cell data loading failed - no cells in cellDataMap');
                console.log('DEBUG: columns.cell_id length:', cell_id?.length);
                console.log('DEBUG: className length:', className?.length);
                console.log('DEBUG: prob length:', prob?.length);
            } else {
                const firstFewKeys = Array.from(cellDataMap.keys()).slice(0, 5);
                console.log('DEBUG: First few cell IDs in cellDataMap:', firstFewKeys);
                const sampleCellId = 15357;
                console.log(`DEBUG: cellDataMap.has(${sampleCellId}):`, cellDataMap.has(sampleCellId));
                console.log(`DEBUG: cellDataMap.get(${sampleCellId}):`, cellDataMap.get(sampleCellId));
            }
            return true;
        } else {
            const cellData = await loadCellDataWithWorker();
            cellDataMap.clear();
            cellData.forEach(cell => { cellDataMap.set(cell.cellNum, cell); });
            console.log(`✅ Cell data loaded: ${cellDataMap.size} cells`);
            return true;
        }

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
    return loadDataWithUnifiedWorker('loadCellData', CELL_DATA_URL);
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
    const defaultConfig = {glyphName: 'circle', color: '#ffffff'};

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size * genes.length;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const mapping = {};

    genes.forEach((gene, i) => {
        const cfg = configMap.get(gene);
        if (!cfg) {
            console.warn(`Gene '${gene}' missing glyph config, using circle fallback`);
        }
        const finalConfig = cfg || defaultConfig;
        const p = {x: i * size + size/2, y: size/2};
        const r = size * 0.4;
        
        ctx.save();
        ctx.strokeStyle = finalConfig.color;
        ctx.lineWidth = 4;
        ctxPath(finalConfig.glyphName, ctx, p, r);
        ctx.stroke();
        ctx.restore();
        
        mapping[gene] = {x: i * size, y: 0, width: size, height: size};
    });

    return {atlas: canvas, mapping};
}

/**
 * Build lightning-fast lookup indexes for gene spot data
 * @param {Map} geneDataMap - Map of gene data by gene name
 * @param {Map} cellToSpotsIndex - Index to populate: cellLabel -> spots
 * @param {Map} spotToParentsIndex - Index to populate: spotId -> parent info
 */
export function buildGeneSpotIndexes(geneDataMap, cellToSpotsIndex, spotToParentsIndex) {
    console.log('Building gene spot indexes for lightning-fast lookups...');
    
    // Clear existing indexes
    cellToSpotsIndex.clear();
    spotToParentsIndex.clear();
    
    let totalSpots = 0;
    
    let globalSpotIndex = 0; // Track global position in geneData.tsv
    
    geneDataMap.forEach((spots, geneName) => {
        spots.forEach((spot, spotIndex) => {
            const spot_id = globalSpotIndex; // Use global position as spot_id
            globalSpotIndex++;
            totalSpots++;
            
            // Index 1: Cell parent -> spots (for "show me spots for this cell")
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
                    // Complete neighbour/probability info from geneData.tsv
                    neighbour: spot.neighbour,
                    neighbour_array: spot.neighbour_array,
                    prob: spot.prob,
                    prob_array: spot.prob_array,
                    // Include measurement fields for weighted counts
                    intensity: spot.intensity,
                    score: spot.score
                });
            }
            
            // Index 2: Spot -> all parent candidates (for "show me parents for this spot")
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
    
    console.log(`✅ Built indexes: ${cellToSpotsIndex.size} cells, ${spotToParentsIndex.size} spots (${totalSpots} total)`);
}

/**
 * Get the most probable cell class from cellData
 * @param {string|number} cellNum - Cell number
 * @param {Map} cellDataMap - Map containing cell data
 * @returns {string} Most probable cell class
 */
function getMostProbableCellClass(cellNum, cellDataMap) {
    const cellData = cellDataMap.get(parseInt(cellNum));
    if (!cellData) {
        console.error(`No cell data found for cell ${cellNum}`);
        return 'Unknown';
    }
    let names = cellData?.classification?.className;
    let probs = cellData?.classification?.probability;
    if (!names) {
        console.error(`Cell ${cellNum} missing classification.className`, cellData);
        return 'Unknown';
    }
    if (!Array.isArray(names) && typeof names === 'string') {
        try { const parsed = JSON.parse(names.replace(/'/g, '"')); if (Array.isArray(parsed)) names = parsed; } catch {}
    }
    if (!Array.isArray(names)) {
        console.error(`Cell ${cellNum} className is not an array`, names);
        return 'Unknown';
    }
    if (!Array.isArray(probs) || probs.length !== names.length) {
        console.error(`Cell ${cellNum} probabilities invalid or length mismatch`, { names, probs });
        return 'Unknown';
    }
    let maxProbIndex = -1; let maxProb = -Infinity;
    for (let i = 0; i < probs.length; i++) { if (typeof probs[i] === 'number' && probs[i] > maxProb) { maxProb = probs[i]; maxProbIndex = i; } }
    if (maxProbIndex < 0 || maxProbIndex >= names.length) {
        console.error(`Cell ${cellNum} could not select a class from`, { names, probs });
        return 'Unknown';
    }
    const result = String(names[maxProbIndex]).trim();
    if (!result) {
        console.warn(`Cell ${cellNum} selected class name is empty, using 'Unknown' fallback. Selected:`, names[maxProbIndex]);
        return 'Unknown';
    }
    return result;
}

/**
 * Get color for a cell class using classConfig
 * @param {string} className - Cell class name
 * @returns {Array} RGB color array
 */
function getCellClassColor(className) {
    if (Array.isArray(className)) {
        console.error('getCellClassColor expected string, received array', className);
        return [192,192,192];
    }
    const key = String(className || '').trim();
    // Use the global classColorsCodes function
    if (typeof classColorsCodes === 'function') {
        const colorConfig = classColorsCodes();
        const classEntry = colorConfig.find(entry => entry.className === key);
        if (classEntry && classEntry.color) {
            // Convert hex color to RGB array
            const hex = classEntry.color.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return [r, g, b];
        } else {
            console.log(`No color found for ${key}, using fallback gray`);
        }
    } else {
        console.log('classColorsCodes function not available, using fallback gray');
    }
    // Fallback to generic gray color (do not invent colors; exposes mapping errors)
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
 * @param {Set} allCellClasses - Set to track all cell classes
 * @param {Map} cellDataMap - Map containing cell data
 * @param {Map} cellBoundaryIndex - Optional index to update for fast cell boundary lookup
 * @returns {Promise<Object>} GeoJSON FeatureCollection
 */
export async function loadPolygonData(planeNum, polygonCache, allCellClasses, cellDataMap = null, cellBoundaryIndex = null) {
    // Arrow path: build per-plane GeoJSON from Arrow buffers and cache it
    if (USE_ARROW) {
        if (polygonCache.has(planeNum)) {
            const cached = polygonCache.get(planeNum);
            console.log(`Using cached polygon data (Arrow) for plane ${planeNum}, features: ${cached?.features?.length || 0}`);
            return cached;
        }
        try {
            const { initArrow, loadBoundariesPlane } = await import('../arrow-loader/lib/arrow-loaders.js');
            initArrow({
                spotsManifest: ARROW_MANIFESTS.spotsManifest,
                cellsManifest: ARROW_MANIFESTS.cellsManifest,
                boundariesManifest: ARROW_MANIFESTS.boundariesManifest,
                spotsGeneDict: ARROW_MANIFESTS.spotsGeneDict
            });
            const { buffers } = await loadBoundariesPlane(planeNum);
            // Transform to tile coords and build GeoJSON
            const { positions, startIndices, length, labels } = buffers;
            const features = [];
            for (let pi = 0; pi < length; pi++) {
                const start = startIndices[pi];
                const end = startIndices[pi + 1];
                if (end - start < 3) continue;
                const ring = [];
                for (let i = start; i < end; i++) {
                    const [tx, ty] = transformToTileCoordinates(positions[2*i], positions[2*i+1], IMG_DIMENSIONS);
                    ring.push([tx, ty]);
                }
                const label = labels ? labels[pi] : -1;
                const cellClass = getMostProbableCellClass(label, cellDataMap || window.appState?.cellDataMap || new Map());
                if (cellClass === 'Unknown') {
                    console.warn(`Polygon processing: Cell ${label} not found in cellDataMap, adding 'Unknown' to allCellClasses`);
                }
                if (cellClass && allCellClasses) allCellClasses.add(cellClass);
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [ring] },
                    properties: { plane_id: planeNum, label, cellClass }
                });
            }
            const geojson = { type: 'FeatureCollection', features };
            polygonCache.set(planeNum, geojson);
            console.log(`Loaded ${features.length} polygons for plane ${planeNum} (Arrow)`);
            if (cellBoundaryIndex) updateCellBoundaryIndex(planeNum, geojson, cellBoundaryIndex);
            return geojson;
        } catch (err) {
            console.error(`Failed to load Arrow polygon data for plane ${planeNum}:`, err);
            return { type: 'FeatureCollection', features: [] };
        }
    }
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
        
        // Process cell classes for coloring
        console.log(`Processing ${geojson.features.length} features for plane ${planeNum}`);
        console.log('cellDataMap size:', cellDataMap ? cellDataMap.size : 'null');
        
        // Debug: Check first few features before processing
        if (geojson.features.length > 0) {
            // console.log('Sample feature before processing:', geojson.features[0]);
            // console.log('Sample feature properties:', geojson.features[0].properties);
        }
        
        if (cellDataMap && cellDataMap.size > 0) {
            let processedCount = 0;
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.label) {
                    // console.log(`Processing feature ${processedCount + 1}: label=${feature.properties.label}`);
                    const cellClass = getMostProbableCellClass(feature.properties.label, cellDataMap);
                    // console.log(`Got cellClass: ${cellClass}`);
                    feature.properties.cellClass = cellClass;
                    allCellClasses.add(cellClass);
                    processedCount++;
                    if (processedCount <= 5) {
                        // console.log(`Feature ${processedCount}: label=${feature.properties.label}, cellClass=${cellClass}`);
                        // console.log('Feature after assignment:', feature.properties);
                    }
                }
            });
            // console.log(`Processed ${processedCount} features, allCellClasses:`, Array.from(allCellClasses));
        } else {
            // Fallback: extract existing cell classes
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.cellClass) {
                    allCellClasses.add(feature.properties.cellClass);
                }
            });
            console.log('Using fallback cell classes:', Array.from(allCellClasses));
        }
        
        // console.log(`Loaded ${geojson.features.length} polygons for plane ${planeNum}`);
        
        // Cache the result for future use
        polygonCache.set(planeNum, geojson);
        
        // Update cell boundary index if provided
        if (cellBoundaryIndex) {
            updateCellBoundaryIndex(planeNum, geojson, cellBoundaryIndex);
        }

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
 * Build cell boundary index for fast lookup
 * @param {Map} polygonCache - Cache containing polygon data by plane
 * @param {Map} cellBoundaryIndex - Index to populate: cellId -> [planeId1, planeId2, ...]
 */
export function buildCellBoundaryIndex(polygonCache, cellBoundaryIndex) {
    console.log('Building cell boundary index for fast lookup...');
    
    // Clear existing index
    cellBoundaryIndex.clear();
    
    let totalBoundaries = 0;
    
    // Iterate through all planes in polygon cache
    polygonCache.forEach((geojson, planeId) => {
        if (geojson && geojson.features) {
            geojson.features.forEach(feature => {
                if (feature.properties && feature.properties.label) {
                    const cellId = parseInt(feature.properties.label);
                    
                    // Add plane to this cell's plane list
                    if (!cellBoundaryIndex.has(cellId)) {
                        cellBoundaryIndex.set(cellId, []);
                    }
                    cellBoundaryIndex.get(cellId).push(planeId);
                    totalBoundaries++;
                }
            });
        }
    });
    
    console.log(`✅ Built cell boundary index: ${cellBoundaryIndex.size} cells across ${polygonCache.size} planes (${totalBoundaries} total boundaries)`);
}

/**
 * Update cell boundary index when new polygon data is loaded
 * @param {number} planeId - Plane ID that was just loaded
 * @param {Object} geojson - GeoJSON data for the plane
 * @param {Map} cellBoundaryIndex - Index to update
 */
export function updateCellBoundaryIndex(planeId, geojson, cellBoundaryIndex) {
    if (!geojson || !geojson.features) return;
    
    geojson.features.forEach(feature => {
        if (feature.properties && feature.properties.label) {
            const cellId = parseInt(feature.properties.label);
            
            // Add plane to this cell's plane list
            if (!cellBoundaryIndex.has(cellId)) {
                cellBoundaryIndex.set(cellId, []);
            }
            
            // Only add if not already present
            const planes = cellBoundaryIndex.get(cellId);
            if (!planes.includes(planeId)) {
                planes.push(planeId);
            }
        }
    });
}

/**
 * Get all plane IDs where a cell has boundaries
 * @param {number} cellId - Cell ID to lookup
 * @param {Map} cellBoundaryIndex - Cell boundary index
 * @returns {number[]} Array of plane IDs where this cell has boundaries
 */
export function getCellBoundaryPlanes(cellId, cellBoundaryIndex) {
    return cellBoundaryIndex.get(cellId) || [];
}

/**
 * Assign colors to cell classes for consistent visualization
 * @param {Set} allCellClasses - All discovered cell classes
 * @param {Map} cellClassColors - Map to store cell class colors
 */
export function assignColorsToCellClasses(allCellClasses, cellClassColors) {
    const classes = Array.from(allCellClasses);
    console.log(`Assigning colors for ${classes.length} cell classes:`, classes);
    
    classes.forEach((cellClass) => {
        if (!cellClassColors.has(cellClass)) {
            const color = getCellClassColor(cellClass);
            cellClassColors.set(cellClass, color);
            // console.log(`Assigned color to ${cellClass}:`, color);
        }
    });
    
    console.log('Final color map:', Array.from(cellClassColors.entries()));
}
