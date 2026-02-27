/**
 * Spot Layer Creator
 * Handles high-performance visualization of gene expression spots
 * using PointCloud/Scatterplot layers and Icon layers
 */

import {
    IMG_DIMENSIONS,
    GENE_SIZE_CONFIG,
    EAGLE_VIEW_CONFIG
} from '../../config/constants.js';
import {
    transformToTileCoordinates,
    transformFromTileCoordinates
} from '../../utils/coordinateTransform.js';
import { ensureArrowInitialized } from './arrowInit.js';

const { COORDINATE_SYSTEM, IconLayer, DataFilterExtension, ScatterplotLayer } = deck;

// Track Ctrl/Meta state reliably for spot interactions
let _modifierDown = false;
document.addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey) _modifierDown = true; });
document.addEventListener('keyup', (e) => { if (!e.ctrlKey && !e.metaKey) _modifierDown = false; });
window.addEventListener('blur', () => { _modifierDown = false; });

/**
 * Get the binary scatter cache from window.appState
 */
function getArrowSpotBinaryCache() {
    const cache = (typeof window !== 'undefined') ? window.appState?.arrowScatterCache : null;
    if (!cache || !cache.positions) {
        return null;
    }
    return cache;
}

/**
 * Create a high-performance ScatterplotLayer for Arrow-loaded spots
 */
export function createArrowPointCloudLayer(currentPlane, geneSizeScale = 1.0, selectedGenes = null, layerOpacity = 1.0, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false, eagleView = false) {
    const cache = getArrowSpotBinaryCache();
    if (!cache || cache.length === 0) return null;

    const { positions, colors, planes, geneIds, scores, intensities, filterPairs, length } = cache;
    const baseScale = (GENE_SIZE_CONFIG?.BASE_SIZE || 12) / 10;
    
    let radiusFactors = null;
    if (!uniformMarkerSize) {
        try {
            const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
            const cacheObj = app._scatterRadiiCache || (app._scatterRadiiCache = {});
            const needsInit = !cacheObj.factors || cacheObj.length !== length ||
                             cacheObj.planesBuffer !== planes.buffer || cacheObj.plane !== (currentPlane || 0);

            if (needsInit) {
                const cur = (currentPlane || 0) | 0;
                const factors = new Float32Array(length);
                for (let i = 0; i < length; i++) {
                    const dz = Math.abs(((planes[i] | 0) - cur));
                    factors[i] = 1 / Math.sqrt(1 + dz);
                }
                cacheObj.factors = factors;
                cacheObj.length = length;
                cacheObj.plane = cur;
                cacheObj.planesBuffer = planes.buffer;
            }
            radiusFactors = cacheObj.factors;
        } catch {
            radiusFactors = new Float32Array(length);
            const cur = (currentPlane || 0) | 0;
            for (let i = 0; i < length; i++) {
                const dz = Math.abs(((planes[i] | 0) - cur));
                radiusFactors[i] = 1 / Math.sqrt(1 + dz);
            }
        }
    }

    let maskedColors;
    try {
        const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
        const maskCache = app._geneMaskCache || (app._geneMaskCache = {});
        const geneDict = app.arrowGeneDict || {};
        const totalGenes = Object.keys(geneDict).length;
        const selectedKey = selectedGenes ? Array.from(selectedGenes).sort().join('|') : '';
        const cacheKey = `${selectedKey}_${length}_${colors.buffer}`;

        if (!maskCache.buffer || maskCache.cacheKey !== cacheKey || maskCache.length !== length) {
            if (selectedGenes && selectedGenes.size > 0) {
                const allSelected = selectedGenes.size >= totalGenes;
                maskedColors = new Uint8Array(colors);
                if (!allSelected) {
                    for (let i = 0; i < length; i++) {
                        const name = geneDict[geneIds[i]];
                        maskedColors[4*i + 3] = (name && selectedGenes.has(name)) ? 255 : 0;
                    }
                } else {
                    for (let i = 0; i < length; i++) maskedColors[4*i + 3] = 255;
                }
            } else {
                maskedColors = new Uint8Array(colors);
                const alpha = (selectedGenes && selectedGenes.size === 0) ? 0 : 255;
                for (let i = 0; i < length; i++) maskedColors[4*i + 3] = alpha;
            }
            maskCache.buffer = maskedColors;
            maskCache.cacheKey = cacheKey;
            maskCache.length = length;
        } else {
            maskedColors = maskCache.buffer;
        }
    } catch (e) {
        console.warn('Gene mask caching failed:', e);
    }

    // Eagle-view: create Z-offset positions and hide spots outside plane range
    let eaglePositions = null;
    if (eagleView) {
        try {
            const app = (typeof window !== 'undefined') ? window.appState || (window.appState = {}) : {};
            const ezCache = app._eagleZCache || (app._eagleZCache = {});
            const needsPosInit = !ezCache.positions || ezCache.length !== length ||
                             ezCache.posBuffer !== positions.buffer || ezCache.plane !== (currentPlane || 0);

            if (needsPosInit) {
                const cur = (currentPlane || 0) | 0;
                const spacing = EAGLE_VIEW_CONFIG.Z_SPACING;
                const ezPositions = new Float32Array(length * 3);
                for (let i = 0; i < length; i++) {
                    ezPositions[3 * i]     = positions[3 * i];
                    ezPositions[3 * i + 1] = positions[3 * i + 1];
                    ezPositions[3 * i + 2] = (planes[i] - cur) * spacing;
                }
                ezCache.positions = ezPositions;
                ezCache.length = length;
                ezCache.posBuffer = positions.buffer;
                ezCache.plane = cur;
            }
            eaglePositions = ezCache.positions;

            // Apply eagle alpha masking on a clone (never mutate the gene mask cache).
            // Cache keyed on source buffer identity + plane to avoid re-allocation during panning.
            const eagleMaskCache = app._eagleMaskCache || (app._eagleMaskCache = {});
            const src = maskedColors || colors;
            const cur = (currentPlane || 0) | 0;
            if (eagleMaskCache.srcRef !== src || eagleMaskCache.plane !== cur || eagleMaskCache.length !== length) {
                const eagleMasked = new Uint8Array(src);
                const range = EAGLE_VIEW_CONFIG.PLANE_RANGE;
                for (let i = 0; i < length; i++) {
                    if (Math.abs(planes[i] - cur) > range) {
                        eagleMasked[4 * i + 3] = 0;
                    }
                }
                eagleMaskCache.buffer = eagleMasked;
                eagleMaskCache.srcRef = src;
                eagleMaskCache.plane = cur;
                eagleMaskCache.length = length;
            }
            maskedColors = eagleMaskCache.buffer;
        } catch (e) {
            console.warn('Eagle-view Z-offset cache failed:', e);
        }
    }

    const canFilterScore = Boolean(scores) && hasScores;
    const canFilterIntensity = Boolean(intensities) && hasIntensity;
    const use2D = canFilterScore && canFilterIntensity && Boolean(filterPairs);
    
    const data = {
        length,
        attributes: {
            getPosition: { value: eaglePositions || positions, size: 3 },
            getFillColor: { value: maskedColors || colors, size: 4 },
            getRadius: uniformMarkerSize ? { constant: 1 } : { value: radiusFactors, size: 1 },
            ...(use2D ? { getFilterValue: { value: filterPairs, size: 2 } } : 
               canFilterScore ? { getFilterValue: { value: scores, size: 1 } } :
               canFilterIntensity ? { getFilterValue: { value: intensities, size: 1 } } : {})
        }
    };

    let intensityUpper = 1.0;
    try {
        const app = window.appState;
        if (app && Array.isArray(app.intensityRange)) {
            const hi = Number(app.intensityRange[1]);
            if (Number.isFinite(hi)) intensityUpper = hi;
        }
    } catch {}

    return new ScatterplotLayer({
        id: eagleView ? 'spots-scatter-binary-eagle' : 'spots-scatter-binary',
        data,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        filled: true,
        stroked: false,
        radiusUnits: 'pixels',
        radiusMinPixels: 0.5,
        opacity: layerOpacity,
        radiusScale: baseScale * (geneSizeScale || 1.0),
        extensions: [new DataFilterExtension({ filterSize: use2D ? 2 : 1 })],
        filterEnabled: use2D || canFilterScore || canFilterIntensity,
        filterRange: use2D
            ? [ [Number(scoreThreshold) || 0, 1.0], [Number(intensityThreshold) || 0, intensityUpper] ]
            : canFilterScore ? [Number(scoreThreshold) || 0, 1.0] :
              canFilterIntensity ? [Number(intensityThreshold) || 0, intensityUpper] : [0, 1.0]
    });
}

/**
 * Create gene expression layers using IconLayer
 */
export function createGeneLayers(geneDataMap, showGenes, selectedGenes, geneIconAtlas, geneIconMapping, currentPlane, geneSizeScale, showTooltip, viewportBounds = null, combineIntoSingleLayer = false, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false, eagleView = false) {
    if (!showGenes || !geneIconAtlas) return [];

    if (combineIntoSingleLayer) {
        const combined = [];
        let ix0 = -Infinity, iy0 = -Infinity, ix1 = Infinity, iy1 = Infinity;

        if (viewportBounds) {
            const { minX, minY, maxX, maxY } = viewportBounds;
            const minImg = transformFromTileCoordinates(minX, minY, IMG_DIMENSIONS);
            const maxImg = transformFromTileCoordinates(maxX, maxY, IMG_DIMENSIONS);
            ix0 = Math.min(minImg[0], maxImg[0]);
            iy0 = Math.min(minImg[1], maxImg[1]);
            ix1 = Math.max(minImg[0], maxImg[0]);
            iy1 = Math.max(minImg[1], maxImg[1]);
        }

        const genes = selectedGenes ? Array.from(selectedGenes) : Array.from(geneDataMap.keys());
        for (const gene of genes) {
            const arr = geneDataMap.get(gene);
            if (!arr) continue;
            for (let i = 0; i < arr.length; i++) {
                const d = arr[i];
                if (d.x < ix0 || d.x > ix1 || d.y < iy0 || d.y > iy1) continue;
                
                const passScore = !(hasScores && scoreThreshold > 0) || (d.score != null && Number(d.score) >= scoreThreshold);
                const passInten = !(hasIntensity && intensityThreshold > 0) || (d.intensity != null && Number(d.intensity) >= intensityThreshold);
                const passPlane = !eagleView || Math.abs((d.plane_id || 0) - currentPlane) <= EAGLE_VIEW_CONFIG.PLANE_RANGE;
                if (passScore && passInten && passPlane) combined.push(d);
            }
        }

        if (combined.length === 0) return [];

        const eagleGetPosition = eagleView
            ? d => { const [tx, ty] = transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS); return [tx, ty, ((d.plane_id || 0) - currentPlane) * EAGLE_VIEW_CONFIG.Z_SPACING]; }
            : d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS);

        return [new IconLayer({
            id: eagleView ? 'genes-combined-eagle' : 'genes-combined',
            data: combined,
            pickable: true,
            onHover: showTooltip,
            onClick: (info) => {
                if (!info?.object) return;
                const evt = info.srcEvent || info.sourceEvent;
                const ctrl = evt ? !!(evt.ctrlKey || evt.metaKey) : _modifierDown;
                if (ctrl && window.appState?.checkSpotConnected && typeof window.openCheckSpotModal === 'function') {
                    const spotId = info.object.spot_id ?? info.object.spotId;
                    if (spotId != null) window.openCheckSpotModal(spotId);
                }
            },
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            iconAtlas: geneIconAtlas,
            iconMapping: geneIconMapping,
            getPosition: eagleGetPosition,
            getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
            getIcon: d => d.gene,
            getColor: [255, 255, 255],
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            updateTriggers: { getSize: [currentPlane, uniformMarkerSize], getPosition: [eagleView, currentPlane] }
        })];
    }

    const layers = [];
    for (const gene of geneDataMap.keys()) {
        let data = geneDataMap.get(gene);
        if (viewportBounds) {
            const { minX, minY, maxX, maxY } = viewportBounds;
            data = data.filter(d => {
                const xy = transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS);
                return xy[0] >= minX && xy[0] <= maxX && xy[1] >= minY && xy[1] <= maxY;
            }).slice(0, 50000);
        }

        const filtered = data.filter(d => {
            const passScore = !(hasScores && scoreThreshold > 0) || (d.score != null && Number(d.score) >= scoreThreshold);
            const passInten = !(hasIntensity && intensityThreshold > 0) || (d.intensity != null && Number(d.intensity) >= intensityThreshold);
            const passPlane = !eagleView || Math.abs((d.plane_id || 0) - currentPlane) <= EAGLE_VIEW_CONFIG.PLANE_RANGE;
            return passScore && passInten && passPlane;
        });

        if (filtered.length === 0) continue;

        const perGeneGetPos = eagleView
            ? d => { const [tx, ty] = transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS); return [tx, ty, ((d.plane_id || 0) - currentPlane) * EAGLE_VIEW_CONFIG.Z_SPACING]; }
            : d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS);

        layers.push(new IconLayer({
            id: eagleView ? `genes-${gene}-eagle` : `genes-${gene}`,
            data: filtered,
            visible: selectedGenes.has(gene),
            pickable: true,
            onHover: showTooltip,
            onClick: (info) => {
                if (!info?.object) return;
                const evt = info.srcEvent || info.sourceEvent;
                const ctrl = evt ? !!(evt.ctrlKey || evt.metaKey) : _modifierDown;
                if (ctrl && window.appState?.checkSpotConnected && typeof window.openCheckSpotModal === 'function') {
                    const spotId = info.object.spot_id ?? info.object.spotId;
                    if (spotId != null) window.openCheckSpotModal(spotId);
                }
            },
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            iconAtlas: geneIconAtlas,
            iconMapping: geneIconMapping,
            getPosition: perGeneGetPos,
            getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
            getIcon: d => d.gene,
            getColor: [255, 255, 255],
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            updateTriggers: { getSize: [currentPlane, uniformMarkerSize], getPosition: [eagleView, currentPlane] }
        }));
    }
    return layers;
}
