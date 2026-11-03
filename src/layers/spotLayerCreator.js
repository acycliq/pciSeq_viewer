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
import { geneStyle } from '../glyphs/geneStyle.js';

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
 * The gene table the point layer looks up: an RGBA entry per gene id, colour
 * from the gene style, alpha 255 for a selected gene and 0 for a hidden one.
 * A few hundred entries, rebuilt on every redraw.
 */
function buildGeneTable(geneDict, selectedGenes) {
    const geneCount = Math.max(...Object.keys(geneDict).map(Number)) + 1;
    const table = new Uint8Array(geneCount * 4);
    for (const [id, name] of Object.entries(geneDict)) {
        const [r, g, b] = geneStyle(name).rgb;
        table.set([r, g, b, selectedGenes.has(name) ? 255 : 0], Number(id) * 4);
    }
    return table;
}

// deck.gl uploads an attribute to the GPU whenever it is handed a new descriptor
// object; it never compares the array inside. So each array keeps one descriptor
// until the cache has grown, and after the load nothing is uploaded again.
const descriptors = new WeakMap();
function attributeOf(array, size, length) {
    const kept = descriptors.get(array);
    if (kept && kept.length === length) return kept.descriptor;
    const descriptor = { value: array, size };
    descriptors.set(array, { length, descriptor });
    return descriptor;
}

/**
 * The point cloud of every spot below the icon zoom: one GPU point per spot,
 * coloured and shown or hidden through the gene table, sized by distance from
 * the current plane in the shader, filtered by score and intensity on the GPU.
 */
export function createArrowPointCloudLayer(currentPlane, geneSizeScale = 1.0, selectedGenes, layerOpacity = 1.0, scoreThreshold = 0, hasScores = false, uniformMarkerSize = false, intensityThreshold = 0, hasIntensity = false, greyOutMisreads = false, hideMisreads = false) {
    const cache = getArrowSpotBinaryCache();
    if (!cache || cache.length === 0) return null;

    const { positions, planes, geneIds, scores, intensities, filterPairs, misreadFlags, length } = cache;
    const baseScale = (GENE_SIZE_CONFIG?.BASE_SIZE || 12) / 10;

    const canFilterScore = Boolean(scores) && hasScores;
    const canFilterIntensity = Boolean(intensities) && hasIntensity;
    const use2D = canFilterScore && canFilterIntensity && Boolean(filterPairs);

    const attributes = {
        getPosition: attributeOf(positions, 3, length),
        getGeneId: attributeOf(geneIds, 1, length),
        getPlane: attributeOf(planes, 1, length),
        getMisread: attributeOf(misreadFlags, 1, length)
    };
    if (use2D) {
        attributes.getFilterValue = attributeOf(filterPairs, 2, length);
    } else if (canFilterScore) {
        attributes.getFilterValue = attributeOf(scores, 1, length);
    } else if (canFilterIntensity) {
        attributes.getFilterValue = attributeOf(intensities, 1, length);
    }
    const data = { length, attributes };

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
        geneTable: buildGeneTable(window.appState.arrowGeneDict, selectedGenes),
        greyOutMisreads,
        hideMisreads,
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
