/**
 * Polygon Layer Creator
 * Handles cell boundary visualization and Z-projection cell mode
 */

import { IMG_DIMENSIONS } from '../../config/constants.js';
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import { handleCellHover } from '../ui/cellHoverHandler.js';
import { ensureArrowInitialized } from './arrowInit.js';
import { arrowBoundaryCache, arrowGeojsonCache } from './boundaryCache.js';

const { COORDINATE_SYSTEM, GeoJsonLayer, DataFilterExtension } = deck;

// Reusable DataFilterExtension instance for polygon gene count filtering
const CELL_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });

/**
 * Create polygon layers for cell boundary visualization
 */
export function createPolygonLayers(planeNum, polygonCache, showPolygons, cellClassColors, polygonOpacity = 0.5, selectedCellClasses = null, cellDataMap = null, zProjectionCellMode = false, geneCountThreshold = 0) {
    const layers = [];

    if (!showPolygons) return layers;

    if (zProjectionCellMode) {
        return createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold);
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
    return [createFilledGeoJsonLayer(planeNum, geojsonFromArrow, cellClassColors, polygonOpacity, selectedCellClasses)];
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

function createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses) {
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

    return new GeoJsonLayer({
        id: `polygons-${planeNum}`,
        data: filteredData,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        onHover: handleCellHover,
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
}

function createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold) {
    const features = (window.appState && window.appState.cellProjectionFeatures) || [];
    const selectedKey = selectedCellClasses ? Array.from(selectedCellClasses).sort().join('|') : '';

    return [new GeoJsonLayer({
        id: 'polygons-z-projection',
        data: features,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extensions: [CELL_FILTER_EXTENSION],
        getFilterValue: f => f.properties.totalGeneCount || 0,
        filterRange: [geneCountThreshold, 1e9],
        filterEnabled: true,
        onHover: handleCellHover,
        getFillColor: d => {
            const rgb = d.properties.colorRGB || [192, 192, 192];
            const alpha = Math.round(polygonOpacity * 255);
            const cls = d.properties.cellClass;
            const visible = (!selectedCellClasses) || (selectedCellClasses.size > 0 && cls && selectedCellClasses.has(cls));
            return visible ? [rgb[0], rgb[1], rgb[2], alpha] : [0, 0, 0, 0];
        },
        updateTriggers: {
            getFillColor: [polygonOpacity, selectedKey]
        }
    })];
}
