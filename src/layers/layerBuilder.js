/**
 * Layer Builder Module
 *
 * Contains helper functions for building different types of deck.gl layers.
 * Used by updateAllLayers() to construct the layer stack.
 */

import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';
import { IMG_DIMENSIONS, MAX_PRELOAD, INITIAL_VIEW_STATE, SPOT_PICKABLE_MIN_ZOOM } from '../../config/constants.js';
import { showTooltip } from '../ui/uiHelpers.js';
import { createTileLayer } from './tileLayerCreator.js';
import { createPolygonLayers } from './polygonLayerCreator.js';
import { nearestLoadedPlane } from '../data/planeCells.js';
import {
    createGeneLayers,
    createArrowPointCloudLayer
} from './spotLayerCreator.js';
import { createZProjectionLayer, isZProjectionReady } from './zProjectionOverlay.js';
import { createCellSpotLineOverlayLayer } from './cellSpotLineOverlayLayer.js';
import { getVisibleRegions, getRegionColorRgb, isRegion, isAllen } from '../regionsManager.js';

/**
 * Build tile layers for the current plane and preloaded adjacent planes
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @returns {Array} Array of tile layers
 */
export function buildTileLayers(state, elements) {
    const layers = [];

    const direction = elements.slider.value > state.currentPlane ? 1 : -1;
    const preloadAhead = direction === 1 ? MAX_PRELOAD + 1 : MAX_PRELOAD;
    const preloadBehind = direction === -1 ? MAX_PRELOAD + 1 : MAX_PRELOAD;

    const totalPlanes = window.appState.totalPlanes;
    const windowStart = Math.max(0, state.currentPlane - preloadBehind);
    const windowEnd = Math.min(totalPlanes - 1, state.currentPlane + preloadAhead);

    // Which channels to render and at what opacity. All discovered channels stay
    // mounted (kept warm) so a switch can cross-fade between already-loaded layers.
    // Fall back to the selected channel at full opacity before the map is populated.
    let opacities = state.channelOpacity;
    let channelIds = Object.keys(opacities);
    if (channelIds.length === 0) {
        opacities = { [state.currentChannel]: 1 };
        channelIds = Object.keys(opacities);
    }

    for (const channel of channelIds) {
        const channelAlpha = opacities[channel];
        const isCurrent = channel === state.currentChannel;

        // The selected channel preloads neighbouring planes for fast stepping;
        // other channels only keep the current plane warm (one invisible layer).
        const planeStart = isCurrent ? windowStart : state.currentPlane;
        const planeEnd = isCurrent ? windowEnd : state.currentPlane;

        for (let plane = planeStart; plane <= planeEnd; plane++) {
            // Only the current plane is visible; multiply by the channel's fade opacity
            const planeOpacity = (plane === state.currentPlane ? 1 : 0) * channelAlpha;
            const layerId = `tiles-${channel}-${plane}`;

            // Reuse existing layer instance or create new one
            let tileLayer = state.tileLayers.get(layerId);
            if (!tileLayer) {
                tileLayer = createTileLayer(channel, plane, planeOpacity, state.tileCache, state.showTiles);
            } else {
                // Update existing layer's opacity and visibility
                tileLayer = tileLayer.clone({
                    opacity: planeOpacity,
                    visible: state.showTiles
                });
            }
            state.tileLayers.set(layerId, tileLayer);
            layers.push(tileLayer);
        }
    }

    return layers;
}

/**
 * Build polygon layers for cell boundaries
 * @param {Object} state - Application state
 * @returns {Array} Array of polygon layers
 */
export function buildPolygonLayers(state) {
    // the cells of the current plane, or while those still load, of the loaded plane
    // nearest to it: stepping and dragging never leave the map without cells
    const plane = nearestLoadedPlane(state.currentPlane) ?? state.currentPlane;
    return createPolygonLayers(
        plane,
        state.polygonCache,
        state.showPolygons,
        state.cellClassColors,
        state.polygonOpacity,
        state.selectedCellClasses,
        state.cellDataMap,
        state.zProjectionCellMode,
        state.geneCountThreshold,
        state.geneCountMaxThreshold,
        plane === state.currentPlane
    );
}

/**
 * Build spot layers (PointCloud at low zoom, IconLayers at high zoom)
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @param {Function} getCurrentViewportTileBounds - Function to get viewport bounds
 * @returns {Array} Array of spot layers
 */
export function buildSpotLayers(state, elements, getCurrentViewportTileBounds) {
    const layers = [];
    const zoom = (typeof state.currentZoom === 'number') ? state.currentZoom : INITIAL_VIEW_STATE.zoom;

    if (zoom < SPOT_PICKABLE_MIN_ZOOM) {
        try { console.log(`[layers] Using binary Scatterplot for spots at zoom ${zoom.toFixed(1)} (showGenes=${state.showGenes})`); } catch {}
        const pc = createArrowPointCloudLayer(
            state.currentPlane,
            state.geneSizeScale,
            state.selectedGenes,
            1.0,
            state.scoreThreshold,
            state.hasScores,
            state.uniformMarkerSize,
            state.intensityThreshold,
            state.hasIntensity,
            state.greyOutMisreads,
            state.hideMisreads
        );
        if (pc && state.showGenes) layers.push(pc);
        // Simplified: no deferred cleanup needed with single IconLayer approach
        state.lastIconLayers = [];
        state.iconCleanupPending = false;
        state.iconCleanupRemaining = 0;
    } else {
        try { console.log(`[layers] Using IconLayers for spots at zoom ${zoom.toFixed(1)} (showGenes=${state.showGenes})`); } catch {}
        const bounds = getCurrentViewportTileBounds();

        // PERFORMANCE FIX: Never create IconLayer without viewport culling for Arrow data
        if (!bounds) {
            try { console.log(`[layers] Viewport bounds unavailable, skipping IconLayer (would load ${state.geneDataMap?.size || 0} genes unculled)`); } catch {}
            // Fallback to PointCloud for this frame
            const pc = createArrowPointCloudLayer(
                state.currentPlane,
                state.geneSizeScale,
                state.selectedGenes,
                1.0,
                state.scoreThreshold,
                state.hasScores,
                state.uniformMarkerSize,
                state.intensityThreshold,
                state.hasIntensity,
                state.greyOutMisreads,
                state.hideMisreads
            );
            if (pc && state.showGenes) layers.push(pc);
            state.lastIconLayers = [];
        } else {
            const iconLayers = createGeneLayers(
                state.geneDataMap,
                state.showGenes,
                state.selectedGenes,
                state.geneIconAtlas,
                state.geneIconMapping,
                state.currentPlane,
                state.geneSizeScale,
                bounds,
                true, // combine into a single IconLayer at deep zoom
                state.scoreThreshold,
                state.hasScores,
                state.uniformMarkerSize,
                state.intensityThreshold,
                state.hasIntensity,
                state.greyOutMisreads,
                state.hideMisreads
            );
            layers.push(...iconLayers);
            state.lastIconLayers = iconLayers;
        }
        state.iconCleanupPending = false;
        state.iconCleanupRemaining = 0;
    }

    return layers;
}

/**
 * Build current-plane cell-to-spot line overlay for visible viewport cells
 * @param {Object} state - Application state
 * @param {Function} getCurrentViewportTileBounds - Function to get viewport bounds
 * @returns {Array} Array with line overlay layer (or empty)
 */
export function buildCellSpotLineLayer(state, getCurrentViewportTileBounds) {
    if (!state.showCellSpotLines) return [];
    const bounds = getCurrentViewportTileBounds ? getCurrentViewportTileBounds() : null;
    if (!bounds) return [];
    const lineLayer = createCellSpotLineOverlayLayer(state, bounds);
    return lineLayer ? [lineLayer] : [];
}

/**
 * Build region overlay layers for user-imported boundaries
 * @param {Object} state - Application state
 * @param {Object} elements - DOM elements
 * @returns {Array} Array of region layers
 */
// a cell annotation: the cells' own outlines (already in tile space), each in its
// class colour, read live so an imported colour scheme shows here too; a class
// with no colour falls back to the annotation's own
function cellAnnotationLayer(annotation, classColors) {
    let fallback = [34, 197, 94];
    try { fallback = getRegionColorRgb(annotation.name); } catch {}
    const colour = d => (classColors && classColors.get(d.properties.cellClass)) || fallback;
    let colourToken = '';
    for (const [cls, rgb] of (classColors || [])) colourToken += cls + ':' + rgb + ';';
    return new deck.GeoJsonLayer({
        id: `cell-annotation-${annotation.name}`,
        data: annotation.features || [],
        stroked: true,
        filled: true,
        getFillColor: d => [...colour(d), 70],
        getLineColor: d => [...colour(d), 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
        pickable: false,
        updateTriggers: { getFillColor: [colourToken], getLineColor: [colourToken] },
    });
}

export function buildRegionLayers(state, elements) {
    const layers = [];
    const visibleRegions = getVisibleRegions();

    console.log('[Regions] Visible regions:', visibleRegions.length, visibleRegions);

    if (visibleRegions.length === 0) return layers;

    visibleRegions.forEach(region => {
        if (!isRegion(region)) {
            layers.push(cellAnnotationLayer(region, state.cellClassColors));
            return;
        }
        console.log('[Regions] Creating layer for:', region.name, 'boundaries:', region.boundaries.length, 'points');

        // Transform region boundary from image pixels to deck tile space
        let transformedPath = [];
        try {
            const dims = IMG_DIMENSIONS || { width: window.config().imageWidth, height: window.config().imageHeight, tileSize: 256 };
            transformedPath = (region.boundaries || []).map(([x, y]) => transformToTileCoordinates(x, y, dims));
        } catch (e) {
            console.warn('[Regions] Failed to transform region coordinates, drawing raw pixels may not align:', e);
            transformedPath = region.boundaries || [];
        }
        // PathLayer draws an open line, so go back to the first point to close the
        // outline, unless the file already did
        const [first, last] = [transformedPath[0], transformedPath[transformedPath.length - 1]];
        if (first && (first[0] !== last[0] || first[1] !== last[1])) {
            transformedPath = [...transformedPath, first];
        }

        // Color: derived from curated d3.schemeSet2 subset via deterministic mapping
        let color = [34, 197, 94];
        try { color = getRegionColorRgb(region.name); } catch {}

        const regionLayer = new deck.PathLayer({
            id: `region-${region.name}`,
            data: [{ path: transformedPath, name: region.name }],
            getPath: d => d.path,
            // Allen atlas regions thin and see-through, so the user's own stand out
            getColor: [...color, isAllen(region) ? 150 : 230],
            getWidth: isAllen(region) ? 1 : 3,
            widthMinPixels: isAllen(region) ? 1 : 2,
            widthScale: 1,
            widthUnits: 'pixels',
            coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
            pickable: true,
            autoHighlight: true,
            highlightColor: [...color, 255],
            onHover: (info) => {
                showTooltip(info, elements.tooltip);
            }
        });

        layers.push(regionLayer);
        console.log('[Regions] Layer created:', regionLayer.id);
    });

    return layers;
}

/**
 * Build the Z-projection overlay layer if enabled and ready
 * @param {Object} state - Application state
 * @returns {Array} Array with Z-projection layer (or empty)
 */
export function buildZProjectionLayer(state) {
    const layers = [];

    console.log('Checking Z-projection overlay:', {
        showZProjectionOverlay: state.showZProjectionOverlay,
        isReady: isZProjectionReady(),
        opacity: state.zProjectionOpacity
    });

    const zProjectionLayer = createZProjectionLayer(
        state.showZProjectionOverlay && isZProjectionReady(),
        state.zProjectionOpacity || 0.8
    );

    if (zProjectionLayer) {
        console.log('Adding Z-projection layer to layers array');
        layers.push(zProjectionLayer);
    }

    return layers;
}

/**
 * Log zoom transition performance metrics
 * @param {Object} state - Application state
 * @param {Array} layers - Final layer array
 */
export function logZoomTransitionMetrics(state, layers) {
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : { performance: { showPerformanceStats: false } };
        if (adv.performance.showPerformanceStats && state.zoomTransition && state.zoomTransition.inProgress) {
            const elapsed = performance.now() - state.zoomTransition.start;
            const totalLayers = layers.length;
            let iconLayers = 0, iconPoints = 0, hasBinary = false;

            for (const lyr of layers) {
                if (!lyr) continue;
                if (String(lyr.id || '').startsWith('genes-')) {
                    iconLayers++;
                    try {
                        const n = Array.isArray(lyr.props.data) ? lyr.props.data.length : (lyr.props.data?.length || 0);
                        iconPoints += n;
                    } catch {}
                }
                if (lyr.id === 'spots-scatter-binary') hasBinary = true;
            }

            console.log(`Zoom transition end: ${state.zoomTransition.from || 'none'} -> ${state.zoomTransition.to} in ${elapsed.toFixed(1)}ms | layers=${totalLayers}, iconLayers=${iconLayers}, iconPoints${iconPoints}, binary=${hasBinary}`);
            state.zoomTransition.inProgress = false;
        }
    } catch {}
}
