/**
 * Layer Creation Module
 * 
 * This module contains functions that create different types of deck.gl layers
 * for visualizing tiles, polygons, and gene expression data
 */

import { 
    IMG_DIMENSIONS, 
    MAX_TILE_CACHE, 
    GENE_SIZE_CONFIG,
    getTileUrlPattern,
    USE_ARROW,
    ARROW_MANIFESTS
} from '../config/constants.js';
import { 
    clamp, 
    transformToTileCoordinates, 
    transformFromTileCoordinates 
} from '../utils/coordinateTransform.js';
import { loadImage } from './dataLoaders.js';

// Extract deck.gl components for layer creation
const {DeckGL, OrthographicView, COORDINATE_SYSTEM, TileLayer, BitmapLayer, GeoJsonLayer, IconLayer, DataFilterExtension, PolygonLayer, PointCloudLayer, ScatterplotLayer} = deck;

// Arrow boundary buffers cache (per plane) and lazy init for worker facade
let arrowBoundaryCache = new Map();
let arrowGeojsonCache = new Map();
let arrowInitialized = false;
async function ensureArrowInitialized() {
    if (!USE_ARROW || arrowInitialized) return;
    const { initArrow } = await import('../arrow-loader/lib/arrow-loaders.js');
    initArrow({
        spotsManifest: ARROW_MANIFESTS.spotsManifest,
        cellsManifest: ARROW_MANIFESTS.cellsManifest,
        boundariesManifest: ARROW_MANIFESTS.boundariesManifest
    });
    arrowInitialized = true;
}

// === Arrow Spots → Binary PointCloud cache ===
// Use prebuilt scatter cache from worker (populated during Arrow load)
function getArrowSpotBinaryCache() {
    const cache = (typeof window !== 'undefined') ? window.appState?.arrowScatterCache : null;
    if (!cache || !cache.positions) {
        try { console.warn('Arrow scatter cache not available yet'); } catch {}
        return null;
    }
    return cache;
}

export function createArrowPointCloudLayer(currentPlane, geneSizeScale = 1.0, selectedGenes = null, layerOpacity = 1.0, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false) {
    if (!USE_ARROW) return null;
    const cache = getArrowSpotBinaryCache();
    if (!cache || cache.length === 0) return null;

    const { positions, colors, planes, geneIds, scores, length } = cache;
    // ⚡ PERFORMANCE OPTIMIZATION: Radius computation caching
    // PROBLEM: Computing radius for 20M+ spots on every plane change = 80M+ operations = UI lag
    // SOLUTION: Cache radius factors per plane, only recompute when plane actually changes
    // 
    // Strategy: radius = radiusFactors[i] * radiusScale
    // - radiusFactors[i]: Distance-based factor (cached per plane)
    // - radiusScale: Global size multiplier (updated instantly for gene size slider)
    const baseScale = ((GENE_SIZE_CONFIG && GENE_SIZE_CONFIG.BASE_SIZE ? GENE_SIZE_CONFIG.BASE_SIZE : 12)) / 10;
    let radiusFactors = null;
    if (!uniformMarkerSize) {
        try {
            const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
            const cacheObj = app._scatterRadiiCache || (app._scatterRadiiCache = {});
            
            // Check if we need to recompute: plane changed, data changed, or first time
            const needsInit = !cacheObj.factors || cacheObj.length !== length || 
                             cacheObj.planesBuffer !== planes.buffer || cacheObj.plane !== (currentPlane || 0);
            
            if (needsInit) {
                const cur = (currentPlane || 0) | 0;
                const factors = new Float32Array(length);
                for (let i = 0; i < length; i++) {
                    const dz = Math.abs(((planes[i] | 0) - cur));
                    factors[i] = 1 / Math.sqrt(1 + dz); // Distance falloff factor only
                }
                // Cache the computed factors
                cacheObj.factors = factors;
                cacheObj.length = length;
                cacheObj.plane = cur;
                cacheObj.planesBuffer = planes.buffer;
            }
            radiusFactors = cacheObj.factors; // Reuse cached factors
        } catch {
            // Fallback: Compute without caching if cache fails
            radiusFactors = new Float32Array(length);
            const cur = (currentPlane || 0) | 0;
            for (let i = 0; i < length; i++) {
                const dz = Math.abs(((planes[i] | 0) - cur));
                radiusFactors[i] = 1 / Math.sqrt(1 + dz);
            }
        }
    }

    // Apply gene visibility mask via alpha channel (fast, avoids realloc)
    try {
        if (selectedGenes && selectedGenes.size > 0) {
            // If all selected (common case), skip loop
            const app = (typeof window !== 'undefined') ? window.appState : null;
            const geneDict = (app && app.arrowGeneDict) || {};
            const totalGenes = Object.keys(geneDict).length;
            const allSelected = selectedGenes.size >= totalGenes;
            if (!allSelected) {
                // Create a masked copy so deck.gl detects change (new buffer)
                var maskedColors = new Uint8Array(colors); // copy
                for (let i = 0; i < length; i++) {
                    const name = geneDict[geneIds[i]];
                    const visible = name ? selectedGenes.has(name) : false;
                    maskedColors[4*i + 3] = visible ? 255 : 0;
                }
            } else {
                var maskedColors = new Uint8Array(colors); // ensure new reference
                for (let i = 0; i < length; i++) maskedColors[4*i + 3] = 255;
            }
        } else if (selectedGenes && selectedGenes.size === 0) {
            // Show none
            var maskedColors = new Uint8Array(colors);
            for (let i = 0; i < length; i++) maskedColors[4*i + 3] = 0;
        }
    } catch {}

    // ⚡ PERFORMANCE OPTIMIZATION: GPU-based score filtering
    // PROBLEM: CPU loops on 20M+ spots block main thread during slider drags
    // SOLUTION: Use DataFilterExtension for GPU-side filtering (parallel processing)

    const data = {
        length,
        attributes: {
            getPosition: { value: positions, size: 3 },
            getFillColor: { value: (typeof maskedColors !== 'undefined') ? maskedColors : colors, size: 4 },
            getRadius: uniformMarkerSize ? { constant: 1 } : { value: radiusFactors, size: 1 },
            // Only add filter attribute when scores exist (conditional GPU filtering)
            ...(scores ? { getFilterValue: { value: scores, size: 1 } } : {})
        }
    };

    try { const adv = window.advancedConfig ? window.advancedConfig() : null; if (adv?.performance?.showPerformanceStats) console.log(`Arrow binary scatter: points=${length}, baseScale=${baseScale}, geneSizeScale=${geneSizeScale}, uniform=${uniformMarkerSize}`); } catch {}

    return new ScatterplotLayer({
        id: 'spots-scatter-binary',
        data,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        // Accessors provided via data.attributes
        filled: true,
        stroked: false,
        radiusUnits: 'pixels',
        radiusMinPixels: 0.5,
        opacity: layerOpacity,
        // ⚡ PERFORMANCE OPTIMIZATION: Global radius scaling
        // Apply gene size changes via radiusScale (avoids recomputing 20M+ per-point radii)
        radiusScale: baseScale * (geneSizeScale || 1.0),
        
        // ⚡ GPU filtering setup: Always present but conditionally enabled
        extensions: [new DataFilterExtension({ filterSize: 1 })],
        filterEnabled: Boolean(scores), // Only filter when scores exist
        filterRange: [Number(scoreThreshold) || 0, 1.0] // GPU compares score >= threshold
    });
}

/**
 * Create a tile layer for background image display
 * Handles tile loading, caching, and rendering with opacity control
 * @param {number} planeNum - Plane number for tile source
 * @param {number} opacity - Layer opacity (0-1)
 * @param {Map} tileCache - Cache for loaded tiles
 * @param {boolean} showTiles - Whether tiles should be visible
 * @returns {TileLayer} Configured tile layer
 */
export function createTileLayer(planeNum, opacity, tileCache, showTiles) {
    return new TileLayer({
        id: `tiles-${planeNum}`,
        pickable: false, // Tiles don't need mouse interaction
        tileSize: IMG_DIMENSIONS.tileSize,
        minZoom: 0,
        maxZoom: 8,
        opacity: opacity,
        visible: showTiles,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extent: [0, 0, IMG_DIMENSIONS.width, IMG_DIMENSIONS.height],
        
        // Async tile data loading with caching
        getTileData: async ({index}) => {
            const {x, y, z} = index;
            const cacheKey = `${planeNum}-${z}-${y}-${x}`;

            // Return cached tile if available (instant return!)
            if (tileCache.has(cacheKey)) {
                const cachedData = tileCache.get(cacheKey);
                // If it's already resolved data, return immediately
                if (cachedData && typeof cachedData.then !== 'function') {
                    return cachedData;
                }
                // If it's still a promise, await it
                return await cachedData;
            }

            // Load new tile using configured URL pattern
            const urlPattern = getTileUrlPattern();
            const imageUrl = urlPattern
                .replace('{plane}', planeNum)
                .replace('{z}', z)
                .replace('{y}', y)
                .replace('{x}', x);
            
            // Check if we should show tile errors
            const advancedConfig = window.advancedConfig ? window.advancedConfig() : { performance: { showTileErrors: false } };
            const suppressErrors = !advancedConfig.performance.showTileErrors;
            
            const promise = loadImage(imageUrl, suppressErrors)
                .then(imageData => {
                    // Cache the resolved image data, not the promise
                    tileCache.set(cacheKey, imageData);
                    return imageData;
                })
                .catch(error => {
                    // Only log error if not suppressed
                    if (!error.suppressLogging) {
                        console.error('Error loading tile:', error);
                    }
                    // Cache null for failed loads to avoid repeated requests
                    tileCache.set(cacheKey, null);
                    return null;
                });

            // Initially cache the promise while loading
            tileCache.set(cacheKey, promise);

            // Clean cache if it gets too large (LRU-style cleanup)
            if (tileCache.size > MAX_TILE_CACHE) {
                const keys = Array.from(tileCache.keys());
                for (let i = 0; i < Math.floor(MAX_TILE_CACHE / 4); i++) {
                    tileCache.delete(keys[i]);
                }
            }

            return promise;
        },
        
        // Render individual tile as bitmap
        renderSubLayers: (props) => {
            if (!props.data) return null;

            const {left, bottom, right, top} = props.tile.bbox;
            const {width, height} = IMG_DIMENSIONS;

            return new BitmapLayer({
                ...props,
                id: `${props.id}-bitmap`,
                data: null,
                image: props.data,
                bounds: [
                    clamp(left, 0, width),
                    clamp(bottom, 0, height),
                    clamp(right, 0, width),
                    clamp(top, 0, height)
                ]
            });
        }
    });
}

/**
 * Create polygon layers for cell boundary visualization
 * Single layer with all polygons colored by cell class with optional filtering
 * @param {number} planeNum - Current plane number
 * @param {Map} polygonCache - Cache containing polygon data
 * @param {boolean} showPolygons - Whether polygons should be visible
 * @param {Map} cellClassColors - Color mapping for each cell class
 * @param {number} polygonOpacity - Opacity value (0.0 to 1.0)
 * @param {Set} selectedCellClasses - Set of selected cell classes for filtering
 * @returns {GeoJsonLayer[]} Array of polygon layers
 */
export function createPolygonLayers(planeNum, polygonCache, showPolygons, cellClassColors, polygonOpacity = 0.5, selectedCellClasses = null, cellDataMap = null) {
    const layers = [];
    console.log(`createPolygonLayers called for plane ${planeNum}, showPolygons: ${showPolygons}`);
    
    if (!showPolygons) {
        console.log('Polygons disabled in state');
        return layers;
    }

    // Arrow fast-path: use binary PathLayer with buffers from worker
    if (USE_ARROW) {
        // Lazy async loader: we cannot await inside layer factory; kick off fetch and return existing cached layer if any
        (async () => {
            try {
                await ensureArrowInitialized();
                if (!arrowBoundaryCache.has(planeNum)) {
                    const { loadBoundariesPlane } = await import('../arrow-loader/lib/arrow-loaders.js');
                    const { buffers, timings } = await loadBoundariesPlane(planeNum);
                    arrowBoundaryCache.set(planeNum, buffers);
                    try {
                        const adv = window.advancedConfig ? window.advancedConfig() : null;
                        if (adv?.performance?.showPerformanceStats) {
                            const polys = buffers?.length || 0;
                            const pts = Math.floor((buffers?.positions?.length || 0) / 2);
                            console.log(`Arrow: plane ${planeNum} buffers loaded — polys=${polys}, points=${pts}`);
                            if (timings) {
                                const kb = Math.round((timings.fetchedBytes || 0) / 1024);
                                console.log(`Arrow timings (plane ${planeNum}): manifest=${timings.fetchManifestMs.toFixed(1)}ms, fetch=${timings.fetchShardsMs.toFixed(1)}ms, decode=${timings.decodeShardsMs.toFixed(1)}ms, assemble=${timings.assembleBuffersMs.toFixed(1)}ms, bytes=${kb}KB`);
                            }
                        }
                    } catch {}
                    // Notify main app to re-render layers now that buffers are ready
                    if (typeof window !== 'undefined' && window.dispatchEvent) {
                        try { window.dispatchEvent(new CustomEvent('arrow-boundaries-ready', { detail: { plane: planeNum } })); } catch {}
                    }
                }
            } catch (e) {
                console.error('Arrow boundary load error:', e);
            }
        })();

        const buffers = arrowBoundaryCache.get(planeNum);
        if (!buffers) {
            if (window?.advancedConfig?.().performance?.showPerformanceStats) {
                console.log(`Arrow buffers not ready yet for plane ${planeNum}`);
            }
            return layers; // empty for now; event will re-render when ready
        }
        // Ensure coordinates are transformed to tile space once per plane
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
            try {
                const adv = window.advancedConfig ? window.advancedConfig() : null;
                if (adv?.performance?.showPerformanceStats) {
                    const polys = buffers?.length || 0;
                    const pts = Math.floor((buffers?.positions?.length || 0) / 2);
                    console.log(`Arrow: plane ${planeNum} transformed to tile space — polys=${polys}, points=${pts}`);
                }
            } catch {}
        }
        // Build and cache GeoJSON once per plane for full parity (fills, hover, colors)
        if (!arrowGeojsonCache.has(planeNum)) {
            const t0 = performance.now();
            const { positions, startIndices, length, labels } = buffers;
            const features = [];
            for (let pi = 0; pi < length; pi++) {
                const start = startIndices[pi];
                const end = startIndices[pi + 1];
                if (end - start < 3) continue;
                const ring = [];
                for (let i = start; i < end; i++) {
                    const x = positions[2 * i];
                    const y = positions[2 * i + 1];
                    ring.push([x, y]);
                }
                const label = labels ? labels[pi] : -1;
                const cellClass = computeMostProbableClass(label, cellDataMap);
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: [ring] },
                    properties: { plane_id: planeNum, label, cellClass }
                });
            }
            arrowGeojsonCache.set(planeNum, { type: 'FeatureCollection', features });
            const t1 = performance.now();
            if (window?.advancedConfig?.().performance?.showPerformanceStats) {
                console.log(`Arrow: plane ${planeNum} GeoJSON build: ${(t1 - t0).toFixed(1)}ms, features=${features.length}`);
            }
        }
        const geojsonFromArrow = arrowGeojsonCache.get(planeNum);
        // Reuse standard filtering + GeoJsonLayer creation
        return [createFilledGeoJsonLayer(planeNum, geojsonFromArrow, cellClassColors, polygonOpacity, selectedCellClasses)];
    }

    const geojson = polygonCache.get(planeNum);
    if (!geojson) {
        console.log(`No polygon data for plane ${planeNum}`);
        return layers;
    }
    const layer = createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses);
    layers.push(layer);
    return layers;
}

function computeMostProbableClass(label, cellDataMap) {
    if (!cellDataMap) return 'Generic';
    const cell = cellDataMap.get(Number(label));
    if (!cell || !cell.classification) return 'Generic';
    let names = cell.classification.className;
    let probs = cell.classification.probability;
    // Normalize if className came in as a stringified list
    if (!Array.isArray(names) && typeof names === 'string') {
        try {
            const parsed = JSON.parse(names.replace(/'/g, '"'));
            if (Array.isArray(parsed)) names = parsed;
        } catch {}
    }
    if (!Array.isArray(names)) {
        console.error('computeMostProbableClass: className is not array', { label, names, cell });
        return 'Unknown';
    }
    if (!Array.isArray(probs) || probs.length !== names.length) {
        console.error('computeMostProbableClass: probabilities invalid/mismatch', { label, names, probs });
        return 'Unknown';
    }
    let best = -Infinity, idx = -1;
    for (let i = 0; i < probs.length; i++) { if (typeof probs[i] === 'number' && probs[i] > best) { best = probs[i]; idx = i; } }
    if (idx < 0 || idx >= names.length) {
        console.error('computeMostProbableClass: no valid index', { label, names, probs });
        return 'Unknown';
    }
    const raw = names[idx];
    const cls = (typeof raw === 'string') ? raw.trim() : String(raw || 'Unknown');
    if (!raw) {
        console.warn(`computeMostProbableClass: Cell ${label} selected class is empty/null, using 'Unknown' fallback. Raw value:`, raw);
    }
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : null;
        // Targeted debug: verify a specific cell mapping during Arrow path
        if (adv?.performance?.showPerformanceStats && Number(label) === 7113) {
            console.log(`Class resolution for cell ${label}:`, { names, probs, chosen: cls });
        }
    } catch {}
    return cls;
}

function createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses) {
    try { const adv = window.advancedConfig ? window.advancedConfig() : null; if (adv?.performance?.showPerformanceStats) console.log(`Creating polygon layer for plane ${planeNum}, features: ${geojson.features.length}`); } catch {}
    // Filter data based on selected cell classes
    let filteredData = geojson;
    if (selectedCellClasses) {
        if (selectedCellClasses.size === 0) {
            // If no cell classes are selected, show no polygons
            filteredData = {
                ...geojson,
                features: []
            };
        } else {
            // If some cell classes are selected, show only those
            filteredData = {
                ...geojson,
                features: geojson.features.filter(feature => {
                    const cellClass = feature.properties.cellClass;
                    return cellClass && selectedCellClasses.has(cellClass);
                })
            };
        }
    }
    // Ensure colors exist for all classes present (Arrow path may not have prefilled map)
    try {
        const seen = new Set();
        const colorFn = (typeof window.classColorsCodes === 'function') ? window.classColorsCodes : null;
        const scheme = colorFn ? colorFn() : [];
        const toRgb = (hex) => {
            const h = String(hex || '').replace('#','');
            if (h.length !== 6) return [192,192,192];
            return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
        };
        for (const f of filteredData.features) {
            const cls = f?.properties?.cellClass;
            if (!cls || seen.has(cls) || cellClassColors.has(cls)) continue;
            seen.add(cls);
            const entry = scheme.find(e => e.className === cls);
            if (entry && entry.color) {
                cellClassColors.set(cls, toRgb(entry.color));
            }
        }
    } catch {}
    const layer = new GeoJsonLayer({
        id: `polygons-${planeNum}`,
        data: filteredData,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        onHover: (info) => {
            if (info.picked && info.object && info.object.properties) {
                // Get the cell label from the polygon properties
                const cellLabel = info.object.properties.label;
                
                // Look up full cell data from the global state
                let fullCellData = null;
                if (window.appState && window.appState.cellDataMap) {
                    const cellId = parseInt(cellLabel);
                    fullCellData = window.appState.cellDataMap.get(cellId);
                }
                
                if (fullCellData && window.updateCellInfo && typeof window.updateCellInfo === 'function') {
                    // Convert to the format expected by donut chart and data tables
                    const cx = Number(fullCellData.position?.x || 0);
                    const cy = Number(fullCellData.position?.y || 0);
                    const names = Array.isArray(fullCellData.classification?.className) ? fullCellData.classification.className : [];
                    const probs = Array.isArray(fullCellData.classification?.probability) ? fullCellData.classification.probability : [];
                    // Determine top class
                    let topIdx = -1, topVal = -Infinity;
                    for (let i = 0; i < probs.length; i++) { const v = probs[i]; if (typeof v === 'number' && v > topVal) { topVal = v; topIdx = i; } }
                    const topClass = (topIdx >= 0 && names[topIdx]) ? names[topIdx] : (names[0] || 'Unknown');
                    // Sum gene counts
                    const geneCounts = Array.isArray(fullCellData.geneExpression?.geneCounts) ? fullCellData.geneExpression.geneCounts : [];
                    const geneTotal = geneCounts.reduce((a, b) => a + (Number(b) || 0), 0);
                    // Resolve a color for the top class if available
                    let topColor = '#C0C0C0';
                    try {
                        const scheme = (window.currentColorScheme && window.currentColorScheme.cellClasses) ? window.currentColorScheme.cellClasses : [];
                        const entry = scheme.find(e => e.className === topClass);
                        if (entry && entry.color) topColor = entry.color;
                    } catch {}

                    const cellData = {
                        cell_id: fullCellData.cellNum || Number(cellLabel),
                        id: Number(cellLabel),
                        centroid: [cx, cy],
                        X: cx,
                        Y: cy,
                        ClassName: names,
                        Prob: probs,
                        Genenames: Array.isArray(fullCellData.geneExpression?.geneNames) ? fullCellData.geneExpression.geneNames : [],
                        CellGeneCount: geneCounts,
                        topClass: topClass,
                        agg: {
                            X: cx,
                            Y: cy,
                            GeneCountTotal: geneTotal,
                            IdentifiedType: topClass,
                            color: topColor
                        }
                    };
                    
                    console.log('Cell data structure for hover:', {
                        label: cellLabel,
                        fullCellData: fullCellData,
                        convertedData: cellData
                    });
                    
                    window.updateCellInfo(cellData);
                    const panel = document.getElementById('cellInfoPanel');
                    if (panel) {
                        panel.style.display = 'block';
                    }
                } else {
                    console.warn('No full cell data found for cell:', cellLabel);
                }
            } else {
                // Hide cell info panel when not hovering over a cell
                const panel = document.getElementById('cellInfoPanel');
                if (panel) {
                    panel.style.display = 'none';
                }
            }
        },
        getFillColor: d => {
            const cellClass = d.properties.cellClass;
            const alpha = Math.round(polygonOpacity * 255);
            if (cellClass && cellClassColors && cellClassColors.has(cellClass)) {
                const color = cellClassColors.get(cellClass);
                return [...color, alpha];
            }
            return [192, 192, 192, alpha];
        },
        updateTriggers: { getFillColor: [cellClassColors, polygonOpacity], data: [selectedCellClasses] }
    });
    try { const adv = window.advancedConfig ? window.advancedConfig() : null; if (adv?.performance?.showPerformanceStats) console.log(`Created polygon layer: ${layer.id}`); } catch {}
    return layer;
}

/**
 * Create gene expression layers
 * Creates icon layers for each gene with dynamic sizing based on plane distance
 * @param {Map} geneDataMap - Map of gene data by gene name
 * @param {boolean} showGenes - Whether genes should be visible
 * @param {Set} selectedGenes - Set of currently visible genes
 * @param {HTMLCanvasElement} geneIconAtlas - Icon atlas canvas
 * @param {Object} geneIconMapping - Icon coordinate mapping
 * @param {number} currentPlane - Current plane number for depth sizing
 * @param {number} geneSizeScale - Global size multiplier
 * @param {Function} showTooltip - Tooltip callback function
 * @returns {IconLayer[]} Array of gene icon layers
 */
export function createGeneLayers(geneDataMap, showGenes, selectedGenes, geneIconAtlas, geneIconMapping, currentPlane, geneSizeScale, showTooltip, viewportBounds = null, combineIntoSingleLayer = false, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false) {
    const layers = [];
    if (!showGenes || !geneIconAtlas) return layers;

    // combine all visible genes into a single IconLayer to reduce layer churn
    // I think also it reduces all the pickable gene layers down to just 1 pickable layer,
    // staying well under the 255 limit while maintaining picking functionality.
    if (combineIntoSingleLayer) {
        if (!viewportBounds) {
            // TSV mode: no viewport culling, include all spots
            console.log('TSV mode: building combined IconLayer without viewport culling');
        }
        const combined = [];
        let ix0, iy0, ix1, iy1;
        
        if (viewportBounds) {
            // Arrow mode: apply viewport culling
            const { minX, minY, maxX, maxY } = viewportBounds;
            const minImg = transformFromTileCoordinates(minX, minY, IMG_DIMENSIONS);
            const maxImg = transformFromTileCoordinates(maxX, maxY, IMG_DIMENSIONS);
            ix0 = Math.min(minImg[0], maxImg[0]);
            iy0 = Math.min(minImg[1], maxImg[1]);
            ix1 = Math.max(minImg[0], maxImg[0]);
            iy1 = Math.max(minImg[1], maxImg[1]);
        } else {
            // TSV mode: no culling, use infinite bounds
            ix0 = -Infinity;
            iy0 = -Infinity;
            ix1 = Infinity;
            iy1 = Infinity;
        }
        // Respect selection strictly: if empty set, show nothing. If null, show all genes.
        const genes = selectedGenes ? Array.from(selectedGenes) : Array.from(geneDataMap.keys());
        let count = 0;
        for (const gene of genes) {
            const arr = geneDataMap.get(gene);
            if (!arr || !arr.length) continue;
            for (let i = 0; i < arr.length; i++) {
                const d = arr[i];
                // Cull in image space to avoid per-point coordinate transforms
                if (d.x < ix0 || d.x > ix1 || d.y < iy0 || d.y > iy1) continue;
                combined.push(d);
                count++;
            }
            // no cap
        }
        if (combined.length) {
            // Apply OMP score filtering when threshold > 0 AND dataset has scores
            let filteredData = combined;
            if (hasScores && scoreThreshold > 0) {
                filteredData = combined.filter(d => {
                    const score = d.score;
                    return (score !== null && score !== undefined && !isNaN(score) && Number(score) >= scoreThreshold);
                });
            }
            
            const iconLayer = new IconLayer({
                id: `genes-combined`,
                data: filteredData,
                visible: true,
                pickable: true,
                onHover: showTooltip,
                coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
                iconAtlas: geneIconAtlas,
                iconMapping: geneIconMapping,
                getPosition: d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS),
                getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
                getIcon: d => d.gene,
                getColor: [255, 255, 255],
                sizeUnits: 'pixels',
                sizeScale: geneSizeScale,
                
                updateTriggers: { 
                    getSize: [currentPlane, uniformMarkerSize]
                    // data prop changes are automatically detected by deck.gl
                }
            });
            
            layers.push(iconLayer);
        }
        return layers;
    }

    // Create a separate layer for each gene for individual visibility control
    for (const gene of geneDataMap.keys()) {
        let data = geneDataMap.get(gene);
        if (viewportBounds) {
            // Filter to current viewport to avoid heavy loads on threshold switch
            const { minX, minY, maxX, maxY } = viewportBounds;
            let count = 0;
            const filtered = [];
            for (let i = 0; i < data.length; i++) {
                const d = data[i];
                const xy = transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS);
                if (xy[0] >= minX && xy[0] <= maxX && xy[1] >= minY && xy[1] <= maxY) {
                    filtered.push(d);
                    count++;
                    // Soft cap to avoid massive layers on first switch; break early if too many
                    if (count > 50000) break;
                }
            }
            data = filtered;
            if (data.length === 0) continue; // Skip empty layers
        }
        // Apply OMP score filtering to individual gene data
        let filteredGeneData = data;
        if (hasScores && scoreThreshold > 0) {
            filteredGeneData = data.filter(d => {
                const score = d.score;
                return (score !== null && score !== undefined && !isNaN(score) && Number(score) >= scoreThreshold);
            });
        }
        
        const layer = new IconLayer({
            id: `genes-${gene}`,
            data: filteredGeneData,
            visible: selectedGenes.has(gene),
            pickable: true, // Enable gene picking
            onHover: showTooltip, // Gene hover handler
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            iconAtlas: geneIconAtlas,
            iconMapping: geneIconMapping,
            
            // Transform gene coordinates to match tile coordinate system
            getPosition: d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS),
            
            // Dynamic sizing based on distance from current plane (depth effect)
            getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
            
            getIcon: d => d.gene,
            getColor: [255, 255, 255], // White color for gene markers
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            
            
            // Trigger layer update when plane changes (for size recalculation)
            updateTriggers: {
                getSize: [currentPlane, uniformMarkerSize]
                // data prop changes are automatically detected by deck.gl
            }
        });

        layers.push(layer);
    }

    return layers;
}
