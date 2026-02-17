/**
 * Data Loading Module
 *
 * This module handles loading and processing of gene expression data and polygon
 * boundary data from various sources (TSV files, remote APIs, etc.)
 */

import {
    IMG_DIMENSIONS,
    ARROW_MANIFESTS
} from '../../config/constants.js';
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import {
    getMostProbableCellClass,
    updateCellBoundaryIndex
} from './cellIndexes.js';
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
        {
            const { initArrow, loadSpots } = await import('../../arrow-loader/lib/arrow-loaders.js');
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
            let hasIntensityFlag = false;
            try {
                const { buildSpotsScatterCache } = await import('../../arrow-loader/lib/arrow-loaders.js');
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
                const { positions, colors, planes, geneIds, scores, intensities, filterPairs, scoreMin, scoreMax, intensityMin, intensityMax, hasIntensity } = await buildSpotsScatterCache({ manifestUrl, img, geneIdColors });
                window.appState.arrowScatterCache = { positions, colors, planes, geneIds, scores, intensities, filterPairs, length: (positions?.length||0)/3 };
                hasIntensityFlag = Boolean(hasIntensity);
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
                // Update intensity range only when intensities exist (UI min = min(0, intensityMin), max = intensityMax)
                try {
                    if (!hasIntensityFlag) throw new Error('No intensity present');
                    const rawMinI = Number.isFinite(intensityMin) ? intensityMin : 0;
                    const rawMaxI = Number.isFinite(intensityMax) ? intensityMax : 1;
                    const uiMinI = Math.min(0, rawMinI);
                    const uiMaxI = rawMaxI;
                    window.appState.intensityRange = [uiMinI, uiMaxI];
                    const sliderI = document.getElementById('intensityFilterSlider');
                    const valueI = document.getElementById('intensityFilterValue');
                    if (sliderI) {
                        sliderI.min = String(uiMinI);
                        sliderI.max = String(uiMaxI);
                        // Set an adaptive step for better control across ranges
                        try {
                            const range = (uiMaxI - uiMinI);
                            let step = 0.01;
                            if (range > 0 && range < 1) {
                                // choose roughly 100 steps across the range
                                step = Math.max(range / 100, 0.0001);
                            } else if (range >= 1) {
                                step = range / 100;
                            }
                            sliderI.step = String(step);
                        } catch {}
                        if (window.appState.intensityThreshold === 0) {
                            sliderI.value = String(uiMinI);
                            window.appState.intensityThreshold = uiMinI;
                            if (valueI) valueI.textContent = Number(uiMinI).toFixed(2);
                        }
                    }
                } catch {}
                if (window?.advancedConfig?.().performance?.showPerformanceStats) {
                    console.log(` Prebuilt scatter cache in worker: points=${window.appState.arrowScatterCache.length}`);
                }
            } catch (e) {
                console.warn('Failed to prebuild scatter cache in worker:', e);
            }

            // For Arrow data, assume scores are available (can be refined later if needed)
            window.appState.hasScores = true;
            window.appState.hasIntensity = hasIntensityFlag;
            console.log('Arrow dataset: assuming scores are available');
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
        {
            const { initArrow, loadCells } = await import('../../arrow-loader/lib/arrow-loaders.js');
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
            const geneNames = columns.gene_names || [];
            const geneCounts = columns.gene_counts || [];
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

                // Get gene expression data from Arrow columns
                const cellGeneNames = geneNames[i] || [];
                const cellGeneCounts = geneCounts[i] || [];
                const totalCount = Array.isArray(cellGeneCounts) ? cellGeneCounts.reduce((sum, c) => sum + (Number(c) || 0), 0) : 0;

                const cell = {
                    cellNum: cid,
                    position: {x: X[i],y: Y[i],z: Z[i]},
                    geneExpression: {
                        geneNames: cellGeneNames,
                        geneCounts: cellGeneCounts
                    },
                    classification: {
                        className: classNames && classNames.length ? classNames.map(s => String(s).trim()) : [cname],
                        probability: Array.isArray(probs) && probs.length ? probs : [1]
                    },
                    totalGeneCount: totalCount,
                    uniqueGenes: cellGeneNames.length,
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
// TSV/unified worker path removed: Arrow is now required

/**
 * Build icon atlas canvas for gene visualization
 * Creates a single canvas with all gene symbols for efficient rendering
 * @param {string[]} genes - Array of gene names
 * @returns {Object} Canvas atlas and coordinate mapping
 */
export function buildGeneIconAtlas(genes) {
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
    // Arrow-only path: build per-plane GeoJSON from Arrow buffers and cache it
    if (polygonCache.has(planeNum)) {
        const cached = polygonCache.get(planeNum);
        console.log(`Using cached polygon data (Arrow) for plane ${planeNum}, features: ${cached?.features?.length || 0}`);
        return cached;
    }
    try {
        const { initArrow, loadBoundariesPlane } = await import('../../arrow-loader/lib/arrow-loaders.js');
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
