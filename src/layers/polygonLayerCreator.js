/**
 * Polygon Layer Creator
 * Handles cell boundary visualization and Z-projection cell mode
 */

import { IMG_DIMENSIONS } from '../../config/constants.js';
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import { handleCellHover, handleCellClick } from '../ui/cellHoverHandler.js';
import { ensureArrowInitialized } from './arrowInit.js';
import { arrowBoundaryCache, arrowGeojsonCache } from './boundaryCache.js';
import { colormap, normalize } from '../../utils/colormap.js';

const { COORDINATE_SYSTEM, GeoJsonLayer, DataFilterExtension } = deck;

// Reusable DataFilterExtension: channel 0 = theta, channel 1 = totalGeneCount
const CELL_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 2 });

/**
 * Create polygon layers for cell boundary visualization
 */
export function createPolygonLayers(planeNum, polygonCache, showPolygons, cellClassColors, polygonOpacity = 0.5, selectedCellClasses = null, cellDataMap = null, zProjectionCellMode = false, geneCountThreshold = 0, geneCountMaxThreshold = Infinity, thetaThreshold = 0) {
    const layers = [];

    if (!showPolygons) return layers;

    if (zProjectionCellMode) {
        return createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold, geneCountMaxThreshold, thetaThreshold);
    }

    // Arrow fast-path: use binary buffers from worker
    (async () => {
        try {
            await ensureArrowInitialized();
            if (!arrowBoundaryCache.has(planeNum)) {
                const { loadBoundariesPlane } = await import('../../arrow-loader/lib/arrow-loaders.js');
                const { buffers, timings } = await loadBoundariesPlane(planeNum);
                arrowBoundaryCache.set(planeNum, buffers);
                
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('arrow-boundaries-ready', { detail: { plane: planeNum } }));
                }
            }
        } catch (e) {
            console.error('Arrow boundary load error:', e);
        }
    })();

    const buffers = arrowBoundaryCache.get(planeNum);
    if (!buffers) return layers;

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
    }

    if (!arrowGeojsonCache.has(planeNum)) {
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
    }

    const geojsonFromArrow = arrowGeojsonCache.get(planeNum);
    const thetaMap = (window.appState && window.appState.cellThetaMap) || null;
    return [createFilledGeoJsonLayer(planeNum, geojsonFromArrow, cellClassColors, polygonOpacity, selectedCellClasses, thetaThreshold, thetaMap)];
}

function computeMostProbableClass(label, cellDataMap) {
    if (!cellDataMap) return 'Generic';
    const cell = cellDataMap.get(Number(label));
    if (!cell || !cell.classification) return 'Generic';
    let names = cell.classification.className;
    let probs = cell.classification.probability;
    
    if (!Array.isArray(names) && typeof names === 'string') {
        try {
            const parsed = JSON.parse(names.replace(/'/g, '"'));
            if (Array.isArray(parsed)) names = parsed;
        } catch {}
    }
    
    if (!Array.isArray(names) || !Array.isArray(probs) || probs.length !== names.length) {
        return 'Unknown';
    }
    
    let best = -Infinity, idx = -1;
    for (let i = 0; i < probs.length; i++) {
        if (typeof probs[i] === 'number' && probs[i] > best) {
            best = probs[i];
            idx = i;
        }
    }
    
    if (idx < 0 || idx >= names.length) return 'Unknown';
    const raw = names[idx];
    return (typeof raw === 'string') ? raw.trim() : String(raw || 'Unknown');
}

function createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses, thetaThreshold = 0, thetaMap = null) {
    let filteredData = geojson;
    if (selectedCellClasses) {
        if (selectedCellClasses.size === 0) {
            filteredData = { ...geojson, features: [] };
        } else {
            filteredData = {
                ...geojson,
                features: geojson.features.filter(feature => {
                    const cellClass = feature.properties.cellClass;
                    return cellClass && selectedCellClasses.has(cellClass);
                })
            };
        }
    }

    // Ensure colors exist for all classes present
    try {
        const seen = new Set();
        const colorFn = (typeof window.classColorsCodes === 'function') ? window.classColorsCodes : null;
        const scheme = colorFn ? colorFn() : [];
        for (const f of filteredData.features) {
            const cls = f?.properties?.cellClass;
            if (!cls || seen.has(cls) || cellClassColors.has(cls)) continue;
            seen.add(cls);
            const entry = scheme.find(e => e.className === cls);
            if (entry && entry.color) {
                const c = d3.rgb(entry.color);
                cellClassColors.set(cls, [c.r, c.g, c.b]);
            }
        }
    } catch {}

    const filterEnabled = thetaThreshold > 0 && thetaMap && thetaMap.size > 0;

    return new GeoJsonLayer({
        id: `polygons-${planeNum}`,
        data: filteredData,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extensions: [CELL_FILTER_EXTENSION],
        getFilterValue: f => {
            const theta = thetaMap ? (thetaMap.get(Number(f.properties.label)) ?? 1e9) : 1e9;
            return [theta, 0];
        },
        filterRange: [[thetaThreshold, 1e9], [0, 1e9]],
        filterEnabled,
        onHover: handleCellHover,
        onClick: handleCellClick,
        getFillColor: d => {
            const alpha = Math.round(polygonOpacity * 255);
            const colorMode = (window.appState && window.appState.cellColorMode) || 'cellClass';

            if (colorMode === 'theta' && thetaMap) {
                const theta = thetaMap.get(Number(d.properties.label));
                if (theta != null) {
                    const maxTheta = (window.appState && window.appState.maxTheta) || 1;
                    return [...colormap(normalize(theta, 0, maxTheta)), alpha];
                }
                return [128, 128, 128, alpha];
            }

            if (colorMode === 'totalGeneCount') {
                const cellDataMap = window.appState && window.appState.cellDataMap;
                const cell = cellDataMap && cellDataMap.get(Number(d.properties.label));
                const count = (cell && typeof cell.totalGeneCount === 'number') ? cell.totalGeneCount : 0;
                const maxCount = (window.appState && window.appState.maxTotalGeneCount) || 1;
                return [...colormap(normalize(count, 0, maxCount)), alpha];
            }

            const cellClass = d.properties.cellClass;
            if (cellClass && cellClassColors && cellClassColors.has(cellClass)) {
                const color = cellClassColors.get(cellClass);
                return [...color, alpha];
            }
            return [192, 192, 192, alpha];
        },
        updateTriggers: { getFillColor: [cellClassColors, polygonOpacity, window.appState?.cellColorMode], getFilterValue: [thetaThreshold, thetaMap], data: [selectedCellClasses] }
    });
}

function createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold, geneCountMaxThreshold, thetaThreshold = 0) {
    const features = (window.appState && window.appState.cellProjectionFeatures) || [];
    const selectedKey = selectedCellClasses ? Array.from(selectedCellClasses).sort().join('|') : '';
    const thetaMap = (window.appState && window.appState.cellThetaMap) || null;
    const geneCountMax = geneCountMaxThreshold === Infinity ? 1e9 : geneCountMaxThreshold;

    return [new GeoJsonLayer({
        id: 'polygons-z-projection',
        data: features,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extensions: [CELL_FILTER_EXTENSION],
        getFilterValue: f => {
            const theta = thetaMap ? (thetaMap.get(Number(f.properties.label)) ?? 1e9) : 1e9;
            return [theta, f.properties.totalGeneCount || 0];
        },
        filterRange: [[thetaThreshold, 1e9], [geneCountThreshold, geneCountMax]],
        filterEnabled: true,
        onHover: handleCellHover,
        onClick: handleCellClick,
        getFillColor: d => {
            const alpha = Math.round(polygonOpacity * 255);
            const cls = d.properties.cellClass;
            const visible = (!selectedCellClasses) || (selectedCellClasses.size > 0 && cls && selectedCellClasses.has(cls));
            if (!visible) return [0, 0, 0, 0];

            const colorMode = (window.appState && window.appState.cellColorMode) || 'cellClass';

            if (colorMode === 'theta' && thetaMap) {
                const theta = thetaMap.get(Number(d.properties.label));
                if (theta != null) {
                    const maxTheta = (window.appState && window.appState.maxTheta) || 1;
                    return [...colormap(normalize(theta, 0, maxTheta)), alpha];
                }
                return [128, 128, 128, alpha];
            }

            if (colorMode === 'totalGeneCount') {
                const count = d.properties.totalGeneCount || 0;
                const maxCount = (window.appState && window.appState.maxTotalGeneCount) || 1;
                return [...colormap(normalize(count, 0, maxCount)), alpha];
            }

            const rgb = d.properties.colorRGB || [192, 192, 192];
            return [rgb[0], rgb[1], rgb[2], alpha];
        },
        updateTriggers: {
            getFillColor: [polygonOpacity, selectedKey, window.appState?.cellColorMode],
            getFilterValue: [thetaThreshold, geneCountThreshold, geneCountMax, thetaMap]
        }
    })];
}
