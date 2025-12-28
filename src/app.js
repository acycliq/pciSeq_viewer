/**
 * Main Application Entry Point
 *
 * This module orchestrates the initialization and runtime of the pciSeq viewer.
 * It imports specialized modules for different concerns and coordinates their interaction.
 */

// === CONFIGURATION IMPORTS ===
import { INITIAL_VIEW_STATE, MAX_PRELOAD, IMG_DIMENSIONS } from '../config/constants.js';

// === STATE AND DOM IMPORTS ===
import { state } from './stateManager.js';
import { elements } from './domElements.js';

// === UTILITY IMPORTS ===
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
import { updateScaleBar } from '../utils/scaleBar.js';
import { updateCoordinateDisplay } from '../utils/coordinateDisplay.js';
import { debounce } from './utils.js';
import Perf from '../utils/runtimePerf.js';

// === UI IMPORTS ===
import { showLoading, hideLoading, showTooltip } from '../modules/uiHelpers.js';
import { initCellClassDrawer, populateCellClassDrawer } from './cellClassDrawer.js';
import { initGeneDrawer } from './geneDrawer.js';
import { updateCellInfo, setupCellInfoPanel, initCellInfoColorScheme } from './cellInfoPanel.js';

// === LAYER IMPORTS ===
import {
    buildTileLayers,
    buildPolygonLayers,
    buildSpotLayers,
    buildRegionLayers,
    buildZProjectionLayer,
    logZoomTransitionMetrics
} from '../modules/layerBuilder.js';
import { buildGlobalZProjection } from '../modules/zProjectionOverlay.js';

// === DATA IMPORTS ===
import { buildGeneSpotIndexes } from '../modules/dataLoaders.js';

// === EVENT HANDLING IMPORTS ===
import { setupEventHandlers, setupAdvancedKeyboardShortcuts } from '../modules/eventHandlers.js';

// === INITIALIZATION IMPORTS ===
import {
    initializeDeckGL,
    derivePlanesFromManifest,
    initializePlaneSlider,
    initializeGeneData,
    initializePolygonHighlighter,
    initializeRectangularSelector,
    initializeCellData,
    preloadAdjacentPlanesInitial,
    finalizeInitialization,
    removeCurtain
} from './appInitializer.js';

// === PLANE MANAGEMENT IMPORTS ===
import { updatePlane } from '../modules/planeManager.js';

// === SPATIAL INDEXING IMPORTS ===
import { setupBoundariesReadyListener } from '../modules/spatialIndexing.js';

// === WIDGET IMPORTS ===
import {
    showCellClassWidget,
    hideCellClassWidget,
    filterCellClasses,
    toggleAllCellClasses,
    undockCellClassWidget
} from './cellClassWidget.js';
import { openCellClassViewer, getCellClassViewerData } from './cellClassViewer.js';
import {
    initGeneDistributionChart,
    showGeneDistributionWidget,
    hideGeneDistributionWidget
} from './geneDistributionChart.js';
import {
    initCellClassDistributionChart,
    showCellClassDistributionWidget,
    hideCellClassDistributionWidget
} from './cellClassDistributionChart.js';
import {
    initCellClassPercentageChart,
    showCellClassPercentageWidget,
    hideCellClassPercentageWidget
} from './cellClassPercentageChart.js';
import {
    showControlsPanel,
    hideControlsPanel,
    toggleControlsPanel,
    updateScaleBarOffset
} from './controlsPanel.js';
import {
    importRegions,
    deleteRegion,
    toggleRegionVisibility,
    loadRegionsFromStorage,
    getRegionBoundaries,
    getVisibleRegions
} from './regionsManager.js';

// === GLOBAL EXPORTS FOR WIDGETS ===
// Cell class widget functions
window.showCellClassWidget = showCellClassWidget;
window.hideCellClassWidget = hideCellClassWidget;
window.filterCellClasses = filterCellClasses;
window.toggleAllCellClasses = toggleAllCellClasses;
window.undockCellClassWidget = undockCellClassWidget;
window.openCellClassViewer = openCellClassViewer;
window.getCellClassViewerData = getCellClassViewerData;

// Gene distribution chart functions
window.showGeneDistributionWidget = showGeneDistributionWidget;
window.hideGeneDistributionWidget = hideGeneDistributionWidget;

// Cell class distribution chart functions
window.showCellClassDistributionWidget = showCellClassDistributionWidget;
window.hideCellClassDistributionWidget = hideCellClassDistributionWidget;

// Cell class percentage chart functions
window.showCellClassPercentageWidget = showCellClassPercentageWidget;
window.hideCellClassPercentageWidget = hideCellClassPercentageWidget;

// Controls panel (drawer) functions
window.showControlsPanel = showControlsPanel;
window.hideControlsPanel = hideControlsPanel;
window.toggleControlsPanel = toggleControlsPanel;

// Region management functions
window.importRegions = importRegions;
window.deleteRegion = deleteRegion;
window.toggleRegionVisibility = toggleRegionVisibility;
window.getRegionBoundaries = getRegionBoundaries;
window.getVisibleRegions = getVisibleRegions;

// Coordinate transformation for child windows
window.transformToTileCoordinates = transformToTileCoordinates;

// Cell info panel function
window.updateCellInfo = updateCellInfo;

// === ZOOM MODE TRACKING ===
let __lastZoomMode = null; // 'pc' or 'icon'
let __lastDragging = false; // track pan-drag state

// === VIEWPORT BOUNDS ===
/**
 * Compute current viewport bounds in tile (deck) coordinates
 * @returns {Object|null} Bounds object with minX, minY, maxX, maxY or null
 */
function getCurrentViewportTileBounds() {
    try {
        const vps = state.deckglInstance && state.deckglInstance.getViewports && state.deckglInstance.getViewports();
        const vp = vps && vps[0];
        if (!vp) return null;
        const w = vp.width || 0, h = vp.height || 0;
        const p0 = vp.unproject([0, h]);     // bottom-left screen -> world
        const p1 = vp.unproject([w, 0]);     // top-right screen -> world
        const minX = Math.min(p0[0], p1[0]);
        const maxX = Math.max(p0[0], p1[0]);
        const minY = Math.min(p0[1], p1[1]);
        const maxY = Math.max(p0[1], p1[1]);
        return { minX, minY, maxX, maxY };
    } catch (e) {
        console.warn('Failed to compute viewport bounds:', e);
        return null;
    }
}

// === MAIN UPDATE FUNCTION ===
/**
 * Update all deck.gl layers
 * Orchestrates the layer stack construction from specialized builder functions
 */
function updateAllLayers() {
    if (!state.deckglInstance) return;

    const layers = [];

    // Build tile layers (background images)
    layers.push(...buildTileLayers(state, elements));

    // Build polygon layers (cell boundaries)
    layers.push(...buildPolygonLayers(state));

    // Build spot layers (genes - PointCloud or IconLayers based on zoom)
    layers.push(...buildSpotLayers(state, elements, getCurrentViewportTileBounds));

    // Build region overlay layers (user-imported boundaries)
    layers.push(...buildRegionLayers(state, elements));

    // Preserve pinned line layers from polygon highlighter
    if (state.polygonHighlighter && state.polygonHighlighter.pinnedLineLayer) {
        layers.push(state.polygonHighlighter.pinnedLineLayer);
    }

    // Build Z-projection overlay layer if enabled
    layers.push(...buildZProjectionLayer(state));

    // Update deck.gl with new layer stack
    state.deckglInstance.setProps({ layers: layers });

    // Log zoom transition metrics if profiling enabled
    logZoomTransitionMetrics(state, layers);
}

// Expose updateAllLayers globally for widget modules
window.updateAllLayers = updateAllLayers;

// === PLANE UPDATE WRAPPER ===
/**
 * Wrapper function for plane updates that passes required dependencies
 * @param {number} newPlane - Target plane number
 */
function handlePlaneUpdate(newPlane) {
    updatePlane(newPlane, state, elements, updateAllLayers);
}

// Expose updatePlane globally for cell lookup module
window.updatePlane = handlePlaneUpdate;

// === VIEW STATE CHANGE HANDLER ===
/**
 * Handle deck.gl view state changes
 * Updates scale bar, manages zoom transitions, and triggers layer updates
 * @param {Object} params - View state change parameters
 * @returns {Object} Updated view state
 */
function handleViewStateChange({ viewState, interactionState }) {
    // Update scale bar when view changes
    updateScaleBar(viewState);

    try { state.currentZoom = viewState.zoom; } catch {}

    // Update layers based on zoom mode transitions
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : { performance: { showPerformanceStats: false } };
        const mode = (viewState.zoom < 7) ? 'pc' : 'icon';
        const dragging = Boolean(interactionState && interactionState.isDragging);

        if (mode !== __lastZoomMode) {
            // Zoom mode changed - trigger transition
            if (adv.performance.showPerformanceStats) {
                state.zoomTransition = { inProgress: true, from: __lastZoomMode, to: mode, start: performance.now() };
                console.log(`[TRANSITION] Start: ${state.zoomTransition.from || 'none'} -> ${mode} at zoom ${viewState.zoom.toFixed(2)}`);
                performance.mark('zoom-transition-start');
            }

            __lastZoomMode = mode;
            __lastDragging = dragging;

            // Measure and update layers
            if (adv.performance.showPerformanceStats) {
                const beforeUpdate = performance.now();
                updateAllLayers();
                const afterUpdate = performance.now();
                console.log(`[TRANSITION] updateAllLayers() JS time: ${(afterUpdate - beforeUpdate).toFixed(2)}ms`);

                // Measure when the browser actually paints
                requestAnimationFrame(() => {
                    performance.mark('zoom-transition-frame1');
                    requestAnimationFrame(() => {
                        performance.mark('zoom-transition-complete');
                        const totalTime = performance.now() - beforeUpdate;
                        console.log(`[TRANSITION] TOTAL time to screen (including GPU): ${totalTime.toFixed(2)}ms`);
                    });
                });
            } else {
                updateAllLayers();
            }
        } else if (mode === 'icon') {
            // At deep zoom: rebuild IconLayer only when panning ends
            if (__lastDragging && !dragging) {
                updateAllLayers();
            }
            __lastDragging = dragging;
        } else {
            // In pointcloud mode track dragging state but no special work
            __lastDragging = dragging;
        }
    } catch {}

    return viewState;
}

// === HOVER HANDLER ===
/**
 * Handle deck.gl hover events
 * Updates coordinate display and shows tooltips
 * @param {Object} info - Hover info from deck.gl
 */
function handleHover(info) {
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : null;
        if (adv && adv.performance && adv.performance.showPerformanceStats) {
            console.log('Main deck.gl onHover called:', info.layer?.id, info.picked);
        }
    } catch {}

    updateCoordinateDisplay(info);
    showTooltip(info, elements.tooltip);
}

// === Z-PROJECTION BACKGROUND BUILD ===
/**
 * Build global Z-projection overlay in background
 */
async function buildGlobalZProjectionBackground() {
    try {
        console.log('Starting background Z-projection build...');

        await buildGlobalZProjection(state, (progress) => {
            // Progress callback
            if (progress.planesProcessed % 10 === 0) {
                console.log(`Z-projection: ${progress.planesProcessed}/${progress.totalPlanes} planes, ${progress.cellsProcessed} cells`);
            }
        });

        console.log('Z-projection overlay ready! Check viewer controls to enable.');

        // If overlay is already enabled, update layers
        if (state.showZProjectionOverlay) {
            updateAllLayers();
        }

    } catch (error) {
        console.error('Failed to build Z-projection overlay:', error);
    }
}

// === MAIN INITIALIZATION ===
/**
 * Main application initialization function
 */
async function init() {
    showLoading(state, elements.loadingIndicator);

    const advancedConfig = window.advancedConfig();

    // Log performance optimization info
    if (advancedConfig.performance.enablePerformanceMode) {
        console.log('Performance optimizations enabled:');
        console.log('  Two-phase updates (immediate UI + background data)');
        console.log('  Smart caching with automatic cleanup');
        console.log('  Background preloading of adjacent planes');
        console.log('  Reduced slider debouncing for instant response');
        console.log('  Memory management (max 50 planes cached)');
    }

    // Clear polygon cache to ensure fresh load on app restart
    state.polygonCache.clear();

    // Initialize deck.gl instance
    state.deckglInstance = initializeDeckGL(handleViewStateChange, handleHover);

    // Setup all UI event listeners
    setupEventHandlers(elements, state, handlePlaneUpdate, updateAllLayers);
    setupAdvancedKeyboardShortcuts(state, handlePlaneUpdate, updateAllLayers);

    // Derive plane count from Arrow manifest
    try {
        const { totalPlanes, startingPlane } = await derivePlanesFromManifest();
        initializePlaneSlider(totalPlanes, startingPlane);
    } catch (e) {
        console.error('Failed to derive totalPlanes from manifest.', e);
        throw e;
    }

    // Load gene data and build icon atlas
    await initializeGeneData();

    // Build gene spot indexes for fast lookups
    buildGeneSpotIndexes(state.geneDataMap, state.cellToSpotsIndex, state.spotToParentsIndex);

    // Initialize polygon highlighter
    initializePolygonHighlighter();

    // Initialize rectangular selector
    initializeRectangularSelector();

    // Load cell data
    await initializeCellData();

    // Finalize initialization (populate UI, update layers)
    finalizeInitialization(updateAllLayers);

    // Preload adjacent planes in background
    preloadAdjacentPlanesInitial();

    // Setup boundaries ready listener for spatial indexing
    try {
        setupBoundariesReadyListener(updateAllLayers, state);
    } catch {}

    // Hide loading and remove curtain
    hideLoading(state, elements.loadingIndicator);
    removeCurtain();

    if (advancedConfig.performance.showPerformanceStats) {
        console.log('Initialization complete. Slider should now be very responsive!');
    }

    // Start building global Z-projection overlay (background task)
    setTimeout(() => {
        buildGlobalZProjectionBackground();
    }, 2000); // Wait 2 seconds after app ready
}

// === DOM CONTENT LOADED HANDLER ===
document.addEventListener('DOMContentLoaded', () => {
    // Setup cell info panel close button
    setupCellInfoPanel();

    // Initialize D3 components when DOM is ready
    if (typeof d3 !== 'undefined') {
        // Initialize color scheme mapping
        initCellInfoColorScheme();

        // Initialize gene distribution chart
        initGeneDistributionChart();

        // Initialize cell class distribution chart
        initCellClassDistributionChart();

        // Initialize cell class percentage chart
        initCellClassPercentageChart();
    }

    // Initialize cell class drawer
    initCellClassDrawer();

    // Initialize gene drawer
    initGeneDrawer();

    // Controls drawer state (collapsed by default)
    const controlsPanel = document.getElementById('controlsPanel');
    if (controlsPanel) {
        controlsPanel.classList.add('collapsed');
        try { updateScaleBarOffset(); } catch {}
        try {
            const btn = document.getElementById('controlsToggleBtn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        } catch {}
    }

    // Setup debounced cell class search
    const cellClassSearchInput = document.getElementById('cellClassSearch');
    if (cellClassSearchInput) {
        const debouncedCellClassSearch = debounce((searchTerm) => {
            if (typeof window.filterCellClasses === 'function') {
                window.filterCellClasses(searchTerm);
            }
        }, 200);

        cellClassSearchInput.addEventListener('input', (e) => {
            debouncedCellClassSearch(e.target.value);
        });
    }
});

// === WINDOW LOAD HANDLER ===
window.addEventListener('load', async () => {
    // Start end-to-end timing
    try { Perf.start('viewer'); } catch {}

    // Load saved regions from localStorage
    loadRegionsFromStorage();

    // If region "CA1 Bbox" exists, make it visible
    try {
        const target = 'CA1 Bbox';
        if (window.appState && window.appState.regions && window.appState.regions.has(target)) {
            toggleRegionVisibility(target, true);
        }
    } catch {}

    // Initialize cell lookup UI first
    if (window.cellLookup) {
        window.cellLookup.setupUI();
        console.log('Cell lookup UI ready immediately (data will load on first search)');
    }

    // Start main application initialization
    init();
});