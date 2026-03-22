/**
 * Spot Layer Creator
 * Handles high-performance visualization of gene expression spots
 * using PointCloud/Scatterplot layers and Icon layers
 */

import {
    IMG_DIMENSIONS,
    GENE_SIZE_CONFIG
} from '../../config/constants.js';
import {
    transformToTileCoordinates,
    transformFromTileCoordinates
} from '../../utils/coordinateTransform.js';
import { colormap, normalize } from '../../utils/colormap.js';

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
 * Returns a filter function for gamma threshold (used by IconLayer CPU filtering).
 * Returns a no-op (always true) when gamma filtering is inactive.
 */
function buildGammaFilter() {
    const app = window.appState || {};
    const gammaMap = app.gammaMap;
    const reverseGeneDict = app.reverseGeneDict;
    const threshold = app.gammaThreshold || 0;
    if (!gammaMap || !reverseGeneDict || threshold <= 0) return () => true;

    return (d) => {
        const gid = reverseGeneDict[d.gene];
        const cellGamma = (d.neighbour != null) ? gammaMap.get(d.neighbour) : null;
        const g = (cellGamma && gid >= 0 && gid < cellGamma.length) ? cellGamma[gid] : 1.0;
        return g >= threshold;
    };
}

/**
 * Create a high-performance ScatterplotLayer for Arrow-loaded spots
 */
export function createArrowPointCloudLayer(currentPlane, geneSizeScale = 1.0, selectedGenes = null, layerOpacity = 1.0, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false) {
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
        const geneDict = app.arrowGeneDict || {};
        const totalGenes = Object.keys(geneDict).length;
        const selectedKey = selectedGenes ? Array.from(selectedGenes).sort().join('|') : '';
        const spotColorMode = app.spotColorMode || 'gene';
        const gammaValues = app.spotGammaValues;

        // Gamma color mode: colormap from per-spot gamma values
        if (spotColorMode === 'gamma' && gammaValues && gammaValues.length === length) {
            const gammaCache = app._gammaMaskCache || (app._gammaMaskCache = {});
            const maxGamma = app.maxGamma || 1;
            const gammaCacheKey = `gamma_${selectedKey}_${length}_${maxGamma}`;

            if (!gammaCache.buffer || gammaCache.cacheKey !== gammaCacheKey || gammaCache.length !== length) {
                maskedColors = new Uint8Array(length * 4);
                const allSelected = !selectedGenes || selectedGenes.size >= totalGenes;
                for (let i = 0; i < length; i++) {
                    const t = normalize(gammaValues[i], 0, maxGamma);
                    const rgb = colormap(t);
                    maskedColors[4*i]     = rgb[0];
                    maskedColors[4*i + 1] = rgb[1];
                    maskedColors[4*i + 2] = rgb[2];
                    if (allSelected) {
                        maskedColors[4*i + 3] = 255;
                    } else if (selectedGenes && selectedGenes.size === 0) {
                        maskedColors[4*i + 3] = 0;
                    } else {
                        const name = geneDict[geneIds[i]];
                        maskedColors[4*i + 3] = (name && selectedGenes.has(name)) ? 255 : 0;
                    }
                }
                gammaCache.buffer = maskedColors;
                gammaCache.cacheKey = gammaCacheKey;
                gammaCache.length = length;
            } else {
                maskedColors = gammaCache.buffer;
            }
        } else {
            // Default gene-color mode
            const maskCache = app._geneMaskCache || (app._geneMaskCache = {});
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
        }
    } catch (e) {
        console.warn('Spot color caching failed:', e);
    }

    // Read intensity upper bound
    const app = window.appState || {};
    let intensityUpper = 1.0;
    try {
        if (Array.isArray(app.intensityRange)) {
            const hi = Number(app.intensityRange[1]);
            if (Number.isFinite(hi)) intensityUpper = hi;
        }
    } catch {}

    // Collect active filter channels
    const channels = [];
    if (Boolean(scores) && hasScores)
        channels.push({ values: scores, range: [Number(scoreThreshold) || 0, 1.0] });
    if (Boolean(intensities) && hasIntensity)
        channels.push({ values: intensities, range: [Number(intensityThreshold) || 0, intensityUpper] });
    const spotGamma = app.spotGammaValues || null;
    const gammaThreshold = app.gammaThreshold || 0;
    if (Boolean(spotGamma) && gammaThreshold > 0)
        channels.push({ values: spotGamma, range: [gammaThreshold, 1e9] });

    // Build interleaved filter attribute from active channels
    const filterSize = Math.max(channels.length, 1);
    const filterEnabled = channels.length > 0;
    let filterAttr = null;
    let filterRange;

    if (channels.length === 0) {
        filterRange = [0, 1.0];
    } else if (channels.length === 1) {
        filterAttr = { value: channels[0].values, size: 1 };
        filterRange = channels[0].range;
    } else {
        const combined = new Float32Array(length * channels.length);
        for (let i = 0; i < length; i++) {
            for (let c = 0; c < channels.length; c++) {
                combined[i * channels.length + c] = channels[c].values[i];
            }
        }
        filterAttr = { value: combined, size: channels.length };
        filterRange = channels.map(ch => ch.range);
    }

    const data = {
        length,
        attributes: {
            getPosition: { value: positions, size: 3 },
            getFillColor: { value: maskedColors || colors, size: 4 },
            getRadius: uniformMarkerSize ? { constant: 1 } : { value: radiusFactors, size: 1 },
            ...(filterAttr ? { getFilterValue: filterAttr } : {})
        }
    };

    return new ScatterplotLayer({
        id: 'spots-scatter-binary',
        data,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        filled: true,
        stroked: false,
        radiusUnits: 'pixels',
        radiusMinPixels: 0.5,
        opacity: layerOpacity,
        radiusScale: baseScale * (geneSizeScale || 1.0),
        extensions: [new DataFilterExtension({ filterSize })],
        filterEnabled,
        filterRange
    });
}

/**
 * Create gene expression layers using IconLayer
 */
export function createGeneLayers(geneDataMap, showGenes, selectedGenes, geneIconAtlas, geneIconMapping, currentPlane, geneSizeScale, showTooltip, viewportBounds = null, combineIntoSingleLayer = false, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false) {
    if (!showGenes || !geneIconAtlas) return [];

    // Gamma filtering for IconLayer path (CPU-side)
    const passGamma = buildGammaFilter();

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
                if (!passScore || !passInten) continue;
                if (!passGamma(d)) continue;
                combined.push(d);
            }
        }

        if (combined.length === 0) return [];

        return [new IconLayer({
            id: 'genes-combined',
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
            getPosition: d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS),
            getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
            getIcon: d => d.gene,
            getColor: [255, 255, 255],
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            updateTriggers: { getSize: [currentPlane, uniformMarkerSize] }
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
            if (!passScore || !passInten) return false;
            return passGamma(d);
        });

        if (filtered.length === 0) continue;

        layers.push(new IconLayer({
            id: `genes-${gene}`,
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
            getPosition: d => transformToTileCoordinates(d.x, d.y, IMG_DIMENSIONS),
            getSize: d => uniformMarkerSize ? GENE_SIZE_CONFIG.BASE_SIZE : (GENE_SIZE_CONFIG.BASE_SIZE / Math.sqrt(1 + Math.abs(d.plane_id - currentPlane))),
            getIcon: d => d.gene,
            getColor: [255, 255, 255],
            sizeUnits: 'pixels',
            sizeScale: geneSizeScale,
            updateTriggers: { getSize: [currentPlane, uniformMarkerSize] }
        }));
    }
    return layers;
}
