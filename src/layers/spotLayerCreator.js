/**
 * Spot Layer Creator
 * Handles high-performance visualization of gene expression spots
 * using the spot point layer and Icon layers
 */

import {
    IMG_DIMENSIONS,
    GENE_SIZE_CONFIG
} from '../../config/constants.js';
import {
    transformToTileCoordinates,
    transformFromTileCoordinates
} from '../../utils/coordinateTransform.js';
import { ensureArrowInitialized } from './arrowInit.js';
import { SpotPointLayer } from './spotPointLayer.js';

const { COORDINATE_SYSTEM, IconLayer, DataFilterExtension } = deck;

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
 * RGBA buffer with alpha masked by gene selection and misread handling, cached
 * on window.appState. Rebuilt from scratch when the selection or flags change;
 * extended in place when the scatter cache has grown (progressive loading).
 */
function getMaskedColors(colors, geneIds, misreadFlags, length, selectedGenes, greyOutMisreads, hideMisreads) {
    const app = window.appState || (window.appState = {});
    const maskCache = app._geneMaskCache || (app._geneMaskCache = {});
    const geneDict = app.arrowGeneDict || {};
    const totalGenes = Object.keys(geneDict).length;
    const selectedKey = selectedGenes ? Array.from(selectedGenes).sort().join('|') : '';
    const cacheKey = `${selectedKey}_${greyOutMisreads ? 1 : 0}_${hideMisreads ? 1 : 0}`;
    const sameSource = Boolean(maskCache.buffer) && maskCache.sourceBuffer === colors.buffer && maskCache.cacheKey === cacheKey;
    if (sameSource && maskCache.length === length) return maskCache.buffer;

    if (!sameSource) {
        maskCache.buffer = new Uint8Array(colors.length);
        maskCache.sourceBuffer = colors.buffer;
        maskCache.cacheKey = cacheKey;
        maskCache.length = 0;
    }
    const masked = maskCache.buffer;
    const noneSelected = Boolean(selectedGenes) && selectedGenes.size === 0;
    const allSelected = !selectedGenes || selectedGenes.size >= totalGenes;
    for (let i = maskCache.length; i < length; i++) {
        const base = 4 * i;
        masked[base + 0] = colors[base + 0];
        masked[base + 1] = colors[base + 1];
        masked[base + 2] = colors[base + 2];
        const isMisread = misreadFlags && misreadFlags[i];
        if (isMisread && hideMisreads) {
            masked[base + 3] = 0;
            continue;
        }
        if (isMisread && greyOutMisreads) {
            masked[base + 0] = 160;
            masked[base + 1] = 160;
            masked[base + 2] = 160;
        }
        if (noneSelected) {
            masked[base + 3] = 0;
        } else if (allSelected) {
            masked[base + 3] = 255;
        } else {
            const name = geneDict[geneIds[i]];
            masked[base + 3] = (name && selectedGenes.has(name)) ? 255 : 0;
        }
    }
    maskCache.length = length;
    return masked;
}

/**
 * The point cloud of every spot below the icon zoom: one GPU point per spot,
 * coloured by gene, alpha 0 for a hidden gene, sized by distance from the
 * current plane in the shader, filtered by score and intensity on the GPU.
 */
export function createArrowPointCloudLayer(currentPlane, geneSizeScale = 1.0, selectedGenes = null, layerOpacity = 1.0, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false, greyOutMisreads = false, hideMisreads = false) {
    const cache = getArrowSpotBinaryCache();
    if (!cache || cache.length === 0) return null;

    const { positions, colors, planes, geneIds, scores, intensities, filterPairs, misreadFlags, length } = cache;
    const baseScale = (GENE_SIZE_CONFIG?.BASE_SIZE || 12) / 10;
    const maskedColors = getMaskedColors(colors, geneIds, misreadFlags, length, selectedGenes, greyOutMisreads, hideMisreads);

    const canFilterScore = Boolean(scores) && hasScores;
    const canFilterIntensity = Boolean(intensities) && hasIntensity;
    const use2D = canFilterScore && canFilterIntensity && Boolean(filterPairs);

    const data = {
        length,
        attributes: {
            getPosition: { value: positions, size: 3 },
            getColor: { value: maskedColors, size: 4 },
            getPlane: { value: planes, size: 1 },
            ...(use2D ? { getFilterValue: { value: filterPairs, size: 2 } } :
               canFilterScore ? { getFilterValue: { value: scores, size: 1 } } :
               canFilterIntensity ? { getFilterValue: { value: intensities, size: 1 } } : {})
        }
    };

    let intensityUpper = 1.0;
    let scoreUpper = 1.0;
    try {
        const app = window.appState;
        if (app && Array.isArray(app.intensityRange)) {
            const hi = Number(app.intensityRange[1]);
            if (Number.isFinite(hi)) intensityUpper = hi;
        }
        if (app && Array.isArray(app.scoreRange)) {
            const hi = Number(app.scoreRange[1]);
            if (Number.isFinite(hi)) scoreUpper = hi;
        }
    } catch {}

    return new SpotPointLayer({
        id: 'spots-scatter-binary',
        data,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        opacity: layerOpacity,
        radiusPixels: baseScale * (geneSizeScale || 1.0),
        minRadiusPixels: 0.5,
        currentPlane: currentPlane || 0,
        sizeByPlaneDistance: !uniformMarkerSize,
        extensions: [new DataFilterExtension({ filterSize: use2D ? 2 : 1 })],
        filterEnabled: use2D || canFilterScore || canFilterIntensity,
        filterRange: use2D
            ? [ [Number(scoreThreshold) || 0, scoreUpper], [Number(intensityThreshold) || 0, intensityUpper] ]
            : canFilterScore ? [Number(scoreThreshold) || 0, scoreUpper] :
              canFilterIntensity ? [Number(intensityThreshold) || 0, intensityUpper] : [0, 1.0]
    });
}

/**
 * The spots in view at deep zoom as one IconLayer with the gene glyphs.
 * The grid index of the table narrows the search to the viewport, and only
 * the spots inside it become objects; the rest stay columns.
 */
export function createGeneLayers(spotTable, showGenes, selectedGenes, geneIconAtlas, geneIconMapping, currentPlane, geneSizeScale, viewportBounds, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false, greyOutMisreads = false, hideMisreads = false) {
    if (!showGenes || !geneIconAtlas) return [];

    const { minX, minY, maxX, maxY } = viewportBounds;
    const minImg = transformFromTileCoordinates(minX, minY, IMG_DIMENSIONS);
    const maxImg = transformFromTileCoordinates(maxX, maxY, IMG_DIMENSIONS);
    const ix0 = Math.min(minImg[0], maxImg[0]);
    const iy0 = Math.min(minImg[1], maxImg[1]);
    const ix1 = Math.max(minImg[0], maxImg[0]);
    const iy1 = Math.max(minImg[1], maxImg[1]);

    const table = spotTable;
    const shown = table.geneMask(selectedGenes);
    const inView = [];
    const near = table.rowsNearBox(ix0, iy0, ix1, iy1);
    for (let i = 0; i < near.length; i++) {
        const row = near[i];
        if (!shown[table.geneId[row]]) continue;
        const x = table.x[row];
        const y = table.y[row];
        if (x < ix0 || x > ix1 || y < iy0 || y > iy1) continue;
        if (hasScores && scoreThreshold > 0 && !(table.score[row] >= scoreThreshold)) continue;
        if (hasIntensity && intensityThreshold > 0 && !(table.intensity[row] >= intensityThreshold)) continue;
        if (hideMisreads && table.isHardMisread[row]) continue;
        inView.push(table.spot(row));
    }

    if (inView.length === 0) return [];

    return [new IconLayer({
        id: 'genes-combined',
        data: inView,
        pickable: true,
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
        getIcon: d => (greyOutMisreads && d.is_hard_misread) ? `_grey_${d.gene}` : d.gene,
        getColor: [255, 255, 255],
        sizeUnits: 'pixels',
        sizeScale: geneSizeScale,
        updateTriggers: { getSize: [currentPlane, uniformMarkerSize], getIcon: [greyOutMisreads] }
    })];
}
