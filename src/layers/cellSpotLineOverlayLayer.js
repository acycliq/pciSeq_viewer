/**
 * Cell-to-Spot Line Overlay Layer
 *
 * Builds a non-pickable binary LineLayer that connects each visible current-plane
 * cell centroid to its spots from all planes.
 */

import { IMG_DIMENSIONS } from '../../config/constants.js';
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import { arrowGeojsonCache } from './layerCreators.js';

const { LineLayer, COORDINATE_SYSTEM } = deck;

const planeBoundsCache = new Map(); // plane -> { ref, entries }
const spotTileCache = new WeakMap(); // spot object -> [tileX, tileY]
let overlayCache = { key: null, data: null };
let geneLineColorCache = null;

function intersects(bounds, item) {
    return (
        bounds.minX <= item.maxX &&
        bounds.maxX >= item.minX &&
        bounds.minY <= item.maxY &&
        bounds.maxY >= item.minY
    );
}

function getPlaneFeatureCollection(plane, polygonCache) {
    if (polygonCache && polygonCache.has(plane)) return polygonCache.get(plane);
    if (arrowGeojsonCache && arrowGeojsonCache.has(plane)) return arrowGeojsonCache.get(plane);
    return null;
}

function getPlaneBoundsEntries(plane, polygonCache) {
    const fc = getPlaneFeatureCollection(plane, polygonCache);
    if (!fc || !Array.isArray(fc.features)) return [];

    const cached = planeBoundsCache.get(plane);
    if (cached && cached.ref === fc) return cached.entries;

    const entries = [];
    for (const feature of fc.features) {
        const ring = feature?.geometry?.coordinates?.[0];
        if (!Array.isArray(ring) || ring.length < 3) continue;

        const label = Number(feature?.properties?.label);
        if (!Number.isFinite(label)) continue;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const pt of ring) {
            const x = Number(pt?.[0]);
            const y = Number(pt?.[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
            continue;
        }

        entries.push({ label, minX, minY, maxX, maxY });
    }

    planeBoundsCache.set(plane, { ref: fc, entries });
    return entries;
}

function getSpotsForCell(cellToSpotsIndex, label) {
    return (
        cellToSpotsIndex.get(label) ||
        cellToSpotsIndex.get(Number(label)) ||
        cellToSpotsIndex.get(String(label)) ||
        []
    );
}

function getCellCentroidTile(label, cellDataMap) {
    if (!cellDataMap) return null;
    const cell = cellDataMap.get(Number(label));
    if (!cell?.position) return null;
    const x = Number(cell.position.x);
    const y = Number(cell.position.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return transformToTileCoordinates(x, y, IMG_DIMENSIONS);
}

function getSpotTilePosition(spot) {
    const cached = spotTileCache.get(spot);
    if (cached) return cached;
    const pos = transformToTileCoordinates(spot.x, spot.y, IMG_DIMENSIONS);
    spotTileCache.set(spot, pos);
    return pos;
}

function getGeneLineColor(geneName) {
    // Build cache lazily from glyphSettings once
    if (!geneLineColorCache) {
        geneLineColorCache = new Map();
        try {
            if (typeof glyphSettings === 'function') {
                const settings = glyphSettings();
                for (const s of settings || []) {
                    const gene = s?.gene;
                    const hex = s?.color;
                    if (!gene || typeof hex !== 'string') continue;
                    const clean = hex.replace('#', '');
                    if (clean.length !== 6) continue;
                    const r = Number.parseInt(clean.slice(0, 2), 16);
                    const g = Number.parseInt(clean.slice(2, 4), 16);
                    const b = Number.parseInt(clean.slice(4, 6), 16);
                    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
                        // Match hover-line alpha from polygonInteractions.getGeneColor()
                        geneLineColorCache.set(gene, [r, g, b, 200]);
                    }
                }
            }
        } catch {}
    }

    if (geneLineColorCache && geneLineColorCache.has(geneName)) {
        return geneLineColorCache.get(geneName);
    }
    // Match hover-line fallback from polygonInteractions.getGeneColor()
    return [255, 255, 255, 150];
}

function makeViewportKey(viewportBounds) {
    return [
        viewportBounds.minX.toFixed(2),
        viewportBounds.minY.toFixed(2),
        viewportBounds.maxX.toFixed(2),
        viewportBounds.maxY.toFixed(2)
    ].join('|');
}

function createLineLayerFromData(lineData) {
    if (!Array.isArray(lineData) || lineData.length === 0) return null;
    return new LineLayer({
        id: 'cell-spot-lines-overlay',
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        data: lineData,
        pickable: false,
        getSourcePosition: d => d.sourcePosition,
        getTargetPosition: d => d.targetPosition,
        getColor: d => d.color,
        getWidth: 1.5,
        widthUnits: 'pixels',
        parameters: {
            depthTest: false
        }
    });
}

export function createCellSpotLineOverlayLayer(state, viewportBounds) {
    if (!state?.showCellSpotLines) return null;
    if (!viewportBounds) return null;
    if (!state.cellToSpotsIndex || !state.polygonCache) return null;

    const plane = Number(state.currentPlane) || 0;
    const boundsEntries = getPlaneBoundsEntries(plane, state.polygonCache);
    if (boundsEntries.length === 0) {
        const hasStateCache = Boolean(state.polygonCache && state.polygonCache.has(plane));
        const hasArrowCache = Boolean(arrowGeojsonCache && arrowGeojsonCache.has(plane));
        console.warn('[cell-spot-overlay] no polygon entries for current plane', plane, { hasStateCache, hasArrowCache });
        return null;
    }

    let visibleCells = boundsEntries.filter(entry => intersects(viewportBounds, entry));
    if (visibleCells.length === 0) {
        // Fallback for viewport-math edge cases: keep functionality working
        visibleCells = boundsEntries;
    }
    if (visibleCells.length === 0) {
        console.warn('[cell-spot-overlay] no visible cells resolved for viewport');
        return null;
    }

    const cacheKey = `p:${plane}|v:${makeViewportKey(viewportBounds)}|cells:${visibleCells.length}`;
    if (overlayCache.key === cacheKey) {
        return createLineLayerFromData(overlayCache.data);
    }
    const lineData = [];

    for (const cell of visibleCells) {
        const centroid = getCellCentroidTile(cell.label, state.cellDataMap);
        if (!centroid) continue;

        const spots = getSpotsForCell(state.cellToSpotsIndex, cell.label);
        if (!spots || spots.length === 0) continue;

        for (const spot of spots) {
            const [sx, sy] = getSpotTilePosition(spot);
            const c = getGeneLineColor(spot.gene);
            lineData.push({
                sourcePosition: [centroid[0], centroid[1], 0],
                targetPosition: [sx, sy, 0],
                color: c
            });
        }
    }

    if (lineData.length === 0) {
        console.warn('[cell-spot-overlay] visible cells found but no spot links produced');
        overlayCache = { key: cacheKey, data: null };
        return null;
    }
    overlayCache = { key: cacheKey, data: lineData };
    return createLineLayerFromData(lineData);
}
