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
import { geneStyle, hasGeneStyle } from '../glyphs/geneStyle.js';
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
 * Genes without an entry in the gene styles are drawn with DEFAULT_GENE_STYLE;
 * this is the one place that warns about them, once per gene, at load.
 * @param {Object} idToName - gene id -> gene name (from gene_dict.json)
 */
export function warnGenesWithoutStyle(idToName) {
    for (const name of Object.values(idToName)) {
        if (!hasGeneStyle(name)) {
            console.warn(`Gene '${name}' has no entry in the gene styles, drawn with the default`);
        }
    }
}

/**
 * Publish the dataset score range and widen the score slider to cover it.
 * UI min = min(0, scoreMin), max = max(1, scoreMax).
 */
export function applyScoreRangeToUI(scoreMin, scoreMax) {
    const rawMin = Number.isFinite(scoreMin) ? scoreMin : 0;
    const rawMax = Number.isFinite(scoreMax) ? scoreMax : 1;
    const uiMin = Math.min(0, rawMin);
    const uiMax = Math.max(1, rawMax);
    window.appState.scoreRange = [uiMin, uiMax];
    const slider = document.getElementById('scoreFilterSlider');
    const valueEl = document.getElementById('scoreFilterValue');
    if (!slider) return;
    slider.min = String(uiMin);
    slider.max = String(uiMax);
    // If the user hasn't touched it yet, start at the minimum so negatives show
    if (window.appState.scoreThreshold === 0) {
        slider.value = String(uiMin);
        window.appState.scoreThreshold = uiMin;
        if (valueEl) valueEl.textContent = Number(uiMin).toFixed(2);
    }
}

/**
 * Publish the dataset intensity range and rescale the intensity slider.
 * UI min = min(0, intensityMin), max = intensityMax.
 */
export function applyIntensityRangeToUI(intensityMin, intensityMax) {
    const rawMin = Number.isFinite(intensityMin) ? intensityMin : 0;
    const rawMax = Number.isFinite(intensityMax) ? intensityMax : 1;
    const uiMin = Math.min(0, rawMin);
    const uiMax = rawMax;
    window.appState.intensityRange = [uiMin, uiMax];
    const slider = document.getElementById('intensityFilterSlider');
    const valueEl = document.getElementById('intensityFilterValue');
    if (!slider) return;
    slider.min = String(uiMin);
    slider.max = String(uiMax);
    const range = uiMax - uiMin;
    let step = 0.01;
    if (range > 0 && range < 1) {
        step = Math.max(range / 100, 0.0001);
    } else if (range >= 1) {
        step = range / 100;
    }
    slider.step = String(step);
    if (window.appState.intensityThreshold === 0) {
        slider.value = String(uiMin);
        window.appState.intensityThreshold = uiMin;
        if (valueEl) valueEl.textContent = Number(uiMin).toFixed(2);
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
    const size = 64;

    // Query GPU max texture size to avoid exceeding it on some hardware
    let maxTextureSize = 4096;
    try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (gl) {
            maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        }
    } catch (e) {
        console.warn('Could not query MAX_TEXTURE_SIZE, using default 4096');
    }

    // Each gene gets a normal-color icon + a grey variant for the grey-out misreads toggle
    const greyEntries = genes.map(g => `_grey_${g}`);
    const allEntries = [...genes, ...greyEntries];
    const maxCols = Math.floor(maxTextureSize / size);
    const cols = Math.min(allEntries.length, maxCols);
    const rows = Math.ceil(allEntries.length / cols);

    const canvas = document.createElement('canvas');
    canvas.width = cols * size;
    canvas.height = rows * size;
    console.log(`Icon atlas: ${genes.length} genes in ${cols}x${rows} grid (${canvas.width}x${canvas.height}px, GPU limit: ${maxTextureSize})`);

    const ctx = canvas.getContext('2d');
    const mapping = {};

    allEntries.forEach((entry, i) => {
        const isGrey = entry.startsWith('_grey_');
        const gene = isGrey ? entry.slice(6) : entry;
        const style = geneStyle(gene);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const p = {x: col * size + size / 2, y: row * size + size / 2};
        const r = size * 0.4;

        ctx.save();
        ctx.strokeStyle = isGrey ? 'rgba(160,160,160,0.75)' : style.color;
        ctx.lineWidth = 4;
        ctxPath(style.glyphName, ctx, p, r);
        ctx.stroke();
        ctx.restore();

        mapping[entry] = {x: col * size, y: row * size, width: size, height: size};
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
