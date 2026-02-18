/**
 * Main Application Entry Point (Electron Desktop App)
 *
 * This module orchestrates the initialization and runtime of the pciSeq viewer.
 * It imports specialized modules for different concerns and coordinates their interaction.
 */

// === CONFIGURATION IMPORTS ===
import { INITIAL_VIEW_STATE, MAX_PRELOAD, IMG_DIMENSIONS } from '../config/constants.js';

// === STATE AND DOM IMPORTS ===
import { state } from './state/stateManager.js';
import { elements } from './domElements.js';

// === UTILITY IMPORTS ===
import { transformToTileCoordinates, clamp } from '../utils/coordinateTransform.js';
import { updateScaleBar } from '../utils/scaleBar.js';
import { updateCoordinateDisplay } from '../utils/coordinateDisplay.js';
import { debounce } from '../utils/common.js';
import Perf from '../utils/runtimePerf.js';

// === UI IMPORTS ===
import { showLoading, hideLoading, showTooltip } from './ui/uiHelpers.js';
import { showMetadataError } from './ui/metadataError.js';
import { initCellClassDrawer, populateCellClassDrawer } from './cellClassDrawer.js';
import { initGeneDrawer, populateGeneDrawer } from './geneDrawer.js';
import { init as initCellInfoPanel } from './cellInfoPanel/index.js';
import { applyPendingClassColorSchemeIfAny, applyClassColorScheme } from './classColorImport.js';
import { applyGeneScheme } from './geneColorImport.js';

// === INITIALIZATION IMPORTS ===
import {
    initializeDeckGL,
    derivePlanesFromManifest,
    initializePlaneSlider,
    initializeGeneData,
    initializePolygonHighlighter,
    initializeRectangularSelector,
    initializeCellData,
    finalizeInitialization,
    preloadAdjacentPlanesInitial,
    removeCurtain
} from './init/appInitializer.js';

// === LAYER IMPORTS ===
import {
    buildTileLayers,
    buildPolygonLayers,
    buildSpotLayers,
    buildRegionLayers,
    buildZProjectionLayer,
    logZoomTransitionMetrics
} from './layers/layerBuilder.js';
import { buildGlobalZProjection } from './layers/zProjectionOverlay.js';

// === DATA IMPORTS ===
import {
    loadGeneData,
    loadPolygonData,
    loadCellData,
} from './data/dataLoaders.js';
import { buildGeneSpotIndexes, assignColorsToCellClasses } from './data/cellIndexes.js';

// === EVENT HANDLING IMPORTS ===
import { setupEventHandlers, setupAdvancedKeyboardShortcuts } from './events/eventHandlers.js';
import { setupCheckCellBridge, openCheckCellModal } from './checkCellBridge.js';
import { setupCheckSpotBridge, openCheckSpotModal } from './checkSpotBridge.js';

// === UI INTERACTION IMPORTS ===
import { setupBoundariesReadyListener } from './ui/spatialIndexing.js';

// === WIDGET IMPORTS ===
import {
    showCellClassWidget,
    hideCellClassWidget,
    filterCellClasses,
    toggleAllCellClasses,
    undockCellClassWidget
} from './cellClassWidget.js';

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
    showExpressionHistogramWidget,
    hideExpressionHistogramWidget
} from './expressionHistogramChart.js';
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


// Gene distribution chart functions
window.showGeneDistributionWidget = showGeneDistributionWidget;
window.hideGeneDistributionWidget = hideGeneDistributionWidget;

// Cell class distribution chart functions
window.showCellClassDistributionWidget = showCellClassDistributionWidget;
window.hideCellClassDistributionWidget = hideCellClassDistributionWidget;

// Cell class percentage chart functions
window.showCellClassPercentageWidget = showCellClassPercentageWidget;
window.hideCellClassPercentageWidget = hideCellClassPercentageWidget;

// Expression histogram chart functions
window.showExpressionHistogramWidget = showExpressionHistogramWidget;
window.hideExpressionHistogramWidget = hideExpressionHistogramWidget;

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

// check_cell bridge
window.openCheckCellModal = openCheckCellModal;
// check_spot bridge
window.openCheckSpotModal = openCheckSpotModal;

// Coordinate transformation for child windows
window.transformToTileCoordinates = transformToTileCoordinates;


// Expose lightweight cell metadata lookup for child windows (voxel viewer)
// Returns { className, totalGeneCount, position, plane_id, probability } or null if not available
window.getCellMeta = (cellId) => {
    try {
        if (!state || !state.cellDataMap) return null;
        const cell = state.cellDataMap.get(Number(cellId));
        if (!cell) return null;

        const classArr = cell?.classification?.className;
        const className = Array.isArray(classArr) && classArr.length > 0
            ? String(classArr[0])
            : 'Unknown';

        const total = (typeof cell.totalGeneCount === 'number') ? cell.totalGeneCount : 0;

        // Extract probability for the top class
        let probability = undefined;
        if (cell?.classification?.probability && Array.isArray(cell?.classification?.probability)) {
            probability = cell.classification.probability[0];
        }

        // Derive plane_id from position.z using voxel size ratio
        let plane_id = undefined;
        if (cell.position && cell.position.z !== undefined) {
            const cfg = window.config ? window.config() : null;
            if (cfg && Array.isArray(cfg.voxelSize)) {
                const [xVoxel, , zVoxel] = cfg.voxelSize;
                plane_id = Math.floor(cell.position.z * xVoxel / zVoxel);
            } else {
                plane_id = Math.floor(cell.position.z);
            }
        }

        return {
            className,
            totalGeneCount: total,
            position: cell.position, // {x, y, z}
            plane_id,
            probability: probability
        };
    } catch {
        return null;
    }
};

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
function updatePlane(newPlane) {
    const { showLoading: showLoadingFn, hideLoading: hideLoadingFn } = { showLoading, hideLoading };

    newPlane = clamp(newPlane, 0, window.appState.totalPlanes - 1);
    if (newPlane === state.currentPlane) return;

    state.currentPlane = newPlane;
    elements.slider.value = newPlane;
    elements.label.textContent = `Plane: ${newPlane}`;

    // Load polygon data if not cached
    if (!state.polygonCache.has(newPlane)) {
        showLoadingFn(state, elements.loadingIndicator);
        loadPolygonData(newPlane, state.polygonCache, state.allCellClasses, state.cellDataMap)
            .then(() => {
                hideLoadingFn(state, elements.loadingIndicator);
                updateAllLayers();
            })
            .catch(err => {
                console.error('Failed to load polygon data:', err);
                hideLoadingFn(state, elements.loadingIndicator);
            });
    } else {
        updateAllLayers();
    }
}

// Expose updatePlane globally for cell lookup module
window.updatePlane = updatePlane;

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

/**
 * Show the empty state welcome screen
 */
function showEmptyState() {
    const curtain = document.getElementById('appCurtain');
    if (curtain) {
        curtain.classList.add('hidden');
    }
    
    if (elements.loadingIndicator) {
        elements.loadingIndicator.style.display = 'none';
    }

    const emptyState = document.getElementById('emptyState');
    const emptyStateBtn = document.getElementById('emptyStateBtn');
    
    if (emptyState) {
        emptyState.classList.remove('hidden');

        if (emptyStateBtn) {
            emptyStateBtn.onclick = async () => {
                const voxelX = parseFloat(document.getElementById('voxelSizeX')?.value) || 0.28;
                const voxelY = parseFloat(document.getElementById('voxelSizeY')?.value) || 0.28;
                const voxelZ = parseFloat(document.getElementById('voxelSizeZ')?.value) || 0.70;

                await window.electronAPI.setVoxelSize([voxelX, voxelY, voxelZ]);
                const result = await window.electronAPI.selectDataFolder();
                if (result.success) {
                    window.location.reload();
                }
            };
        }
    }
    console.warn('Data folder not configured. Waiting for user selection.');
}

// === MAIN INITIALIZATION (Electron-specific) ===
async function init() {
    showLoading(state, elements.loadingIndicator);

    // 1. Check for data path (Electron empty-state)
    const paths = await window.electronAPI.getPaths();
    if (!paths.dataPath) { 
        showEmptyState(); 
        return; 
    }

    // 2. Load metadata and config
    const metadataResult = await window.loadDatasetMetadata();
    let userConfig;
    try { 
        userConfig = window.config(); 
    } catch (err) { 
        showMetadataError(metadataResult, err.message); 
        return; 
    }

    state.polygonCache.clear();

    // 3. Initialize deck.gl
    state.deckglInstance = initializeDeckGL(handleViewStateChange, handleHover);
    window.appState.deckglInstance = state.deckglInstance;

    // 4. Setup event handlers
    setupEventHandlers(elements, state, updatePlane, updateAllLayers);
    setupAdvancedKeyboardShortcuts(state, updatePlane, updateAllLayers);
    setupCheckCellBridge();
    setupCheckSpotBridge();

    // 5. Derive planes from manifest
    const { totalPlanes, startingPlane } = await derivePlanesFromManifest();
    initializePlaneSlider(totalPlanes, startingPlane);

    // 6. Load gene data + indexes
    await initializeGeneData();
    buildGeneSpotIndexes(state.geneDataMap, state.cellToSpotsIndex, state.spotToParentsIndex);

    // 7. Initialize interactions
    initializePolygonHighlighter();
    initializeRectangularSelector();

    // 8. Load cell data + colors
    await initializeCellData();

    // 9. Load polygon data for current plane
    await loadPolygonData(state.currentPlane, state.polygonCache, state.allCellClasses, state.cellDataMap);

    // 10. Finalize UI + layers
    finalizeInitialization(updateAllLayers);
    preloadAdjacentPlanesInitial();

    // 11. Background tasks
    buildGlobalZProjection(state).catch(err => console.warn('Z-projection failed:', err));
    try { setupBoundariesReadyListener(updateAllLayers, state); } catch {}

    hideLoading(state, elements.loadingIndicator);
    removeCurtain();
}

// === DOM CONTENT LOADED HANDLER ===
document.addEventListener('DOMContentLoaded', () => {
    // Initialize cell info panel (close button + color scheme)
    initCellInfoPanel();

    // Initialize D3 components when DOM is ready
    if (typeof d3 !== 'undefined') {
        initGeneDistributionChart();
        initCellClassDistributionChart();
        initCellClassPercentageChart();
    }

    // Initialize drawers
    initCellClassDrawer();
    initGeneDrawer();

    // Controls drawer state (collapsed by default)
    const controlsPanel = document.getElementById('controlsPanel');
    if (controlsPanel) {
        controlsPanel.classList.add('collapsed');
        try { updateScaleBarOffset(); } catch {}
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

    // Setup IPC listeners for menu-based import (Electron only)
    if (window.electronAPI) {
        // Gene colours import from menu
        window.electronAPI.onImportGeneColors(async (data) => {
            try {
                const { appliedCount } = await applyGeneScheme(data, false);
                console.log('Imported ' + appliedCount + ' gene colour styles via menu');
            } catch (e) {
                console.error('Failed to import gene colours:', e);
            }
        });

        // Cell count mode setting from menu
        window.electronAPI.onSetCellCountMode((mode) => {
            state.cellCountMode = mode;
            populateCellClassDrawer();
            console.log('Cell count mode set to: ' + mode);
        });

        // Cell class colours import from menu
        window.electronAPI.onImportClassColors((data) => {
            try {
                const { appliedCount, notFoundClasses } = applyClassColorScheme(data, false);
                if (appliedCount > 0) {
                    populateCellClassDrawer();
                    if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
                }
                console.log('Imported ' + appliedCount + ' cell class colours via menu');
                if (notFoundClasses.length > 0) {
                    console.log('Classes not found:', notFoundClasses.join(', '));
                }
            } catch (e) {
                console.error('Failed to import cell class colours:', e);
            }
        });
    }
});

// === WINDOW LOAD HANDLER ===
window.addEventListener('load', async () => {
    try { Perf.start('viewer'); } catch {}

    // Load saved regions from localStorage
    loadRegionsFromStorage();

    // Initialize cell lookup UI
    if (window.cellLookup) {
        window.cellLookup.setupUI();
    }

    // Start main initialization
    init();
});
