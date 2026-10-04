/**
 * Polygon Layer Creator
 * Handles cell boundary visualization and Z-projection cell mode
 */

import { handleCellHover, handleCellClick } from '../ui/cellHoverHandler.js';

const { COORDINATE_SYSTEM, GeoJsonLayer, DataFilterExtension } = deck;

// Reusable DataFilterExtension instance for polygon gene count filtering
const CELL_FILTER_EXTENSION = new DataFilterExtension({ filterSize: 1 });

/**
 * Create polygon layers for cell boundary visualization.
 * planeNum is the plane whose cells are drawn: the current plane, or while that one is
 * still loading, the loaded plane nearest to it (layerBuilder decides). isCurrent says
 * which, and cells of another plane do not react to the pointer.
 */
export function createPolygonLayers(planeNum, polygonCache, showPolygons, cellClassColors, polygonOpacity = 0.5, selectedCellClasses = null, cellDataMap = null, zProjectionCellMode = false, geneCountThreshold = 0, geneCountMaxThreshold = Infinity, isCurrent = true) {
    // Cell Projection: the Cells switch only hides the layer. It holds the outlines of
    // every plane, and building it again from nothing took seconds each time the
    // switch went back on
    if (zProjectionCellMode) {
        return createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold, geneCountMaxThreshold, showPolygons);
    }

    if (!showPolygons) return [];

    // the outlines are loaded by data/planeCells.js; nothing loaded yet, nothing to draw
    const geojson = polygonCache.get(planeNum);
    if (!geojson) return [];

    return [createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses, isCurrent)];
}

// A plane's cells narrowed to the classes switched on. Filtering makes a new list, and
// a new list makes deck.gl build the whole plane again, so the list is remembered per
// plane and reused for as long as the same classes are on.
const visibleCellsOf = new WeakMap();    // a plane's GeoJSON -> { key, data }

function visibleCells(geojson, selectedCellClasses) {
    if (!selectedCellClasses) return geojson;
    const key = [...selectedCellClasses].sort().join('|');
    const kept = visibleCellsOf.get(geojson);
    if (kept && kept.key === key) return kept.data;
    const data = { ...geojson, features: geojson.features.filter(f => selectedCellClasses.has(f.properties.cellClass)) };
    visibleCellsOf.set(geojson, { key, data });
    return data;
}

function createFilledGeoJsonLayer(planeNum, geojson, cellClassColors, polygonOpacity, selectedCellClasses, isCurrent) {
    const filteredData = visibleCells(geojson, selectedCellClasses);

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

    // A Map keeps the same identity when its entries change, so passing the Map
    // itself as an updateTrigger would not re-run getFillColor after a runtime
    // colour import. Derive a token from the contents so the trigger changes
    // whenever a class colour (or the set of coloured classes) does.
    let colorToken = '';
    for (const [cls, rgb] of (cellClassColors || [])) colorToken += cls + ':' + rgb + ';';

    return new GeoJsonLayer({
        id: `polygons-${planeNum}`,
        data: filteredData,
        pickable: isCurrent,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        onHover: handleCellHover,
        onClick: handleCellClick,
        getFillColor: d => {
            const cellClass = d.properties.cellClass;
            const alpha = Math.round(polygonOpacity * 255);
            if (cellClass && cellClassColors && cellClassColors.has(cellClass)) {
                const color = cellClassColors.get(cellClass);
                return [...color, alpha];
            }
            return [192, 192, 192, alpha];
        },
        updateTriggers: { getFillColor: [colorToken, polygonOpacity] }
    });
}

function createZProjectionPolygonLayers(polygonCache, cellClassColors, polygonOpacity, selectedCellClasses, cellDataMap, geneCountThreshold, geneCountMaxThreshold, shown = true) {
    const features = (window.appState && window.appState.cellProjectionFeatures) || [];
    const selectedKey = selectedCellClasses ? Array.from(selectedCellClasses).sort().join('|') : '';

    return [new GeoJsonLayer({
        id: 'polygons-z-projection',
        data: features,
        visible: shown,
        pickable: true,
        stroked: false,
        filled: true,
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        extensions: [CELL_FILTER_EXTENSION],
        getFilterValue: f => f.properties.totalGeneCount || 0,
        filterRange: [geneCountThreshold, geneCountMaxThreshold === Infinity ? 1e9 : geneCountMaxThreshold],
        filterEnabled: true,
        onHover: handleCellHover,
        onClick: handleCellClick,
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
