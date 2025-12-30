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
import { initCellClassDrawer, populateCellClassDrawer } from './cellClassDrawer.js';
import { initGeneDrawer, populateGeneDrawer } from './geneDrawer.js';
import { updateCellInfo, setupCellInfoPanel, initCellInfoColorScheme } from './cellInfoPanel.js';
import { applyPendingClassColorSchemeIfAny } from './classColorImport.js';

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
    assignColorsToCellClasses,
    buildGeneSpotIndexes
} from './data/dataLoaders.js';

// === EVENT HANDLING IMPORTS ===
import { setupEventHandlers, setupAdvancedKeyboardShortcuts } from './events/eventHandlers.js';

// === UI INTERACTION IMPORTS ===
import { PolygonBoundaryHighlighter } from './ui/polygonInteractions.js';
import { RectangularSelector } from './ui/rectangularSelector.js';
import { setupBoundariesReadyListener } from './ui/spatialIndexing.js';

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

// === METADATA ERROR DISPLAY (Electron-specific) ===
function showMetadataError(metadataResult, errorMessage) {
    // Hide loading curtain
    const curtain = document.getElementById('appCurtain');
    if (curtain) {
        curtain.classList.add('hidden');
    }

    // Hide loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    // Show metadata error screen
    const errorScreen = document.getElementById('metadataErrorState');
    const errorDetails = document.getElementById('metadataErrorDetails');

    if (errorScreen) {
        errorScreen.classList.remove('hidden');

        // Build details table showing which fields are present/missing
        if (errorDetails) {
            const fields = [
                { name: 'width', label: 'Image Width', value: metadataResult?.imageWidth },
                { name: 'height', label: 'Image Height', value: metadataResult?.imageHeight },
                { name: 'plane_count', label: 'Plane Count', value: metadataResult?.planeCount },
                { name: 'voxel_size', label: 'Voxel Size', value: metadataResult?.voxelSize ? JSON.stringify(metadataResult.voxelSize) : null }
            ];

            let html = '';
            fields.forEach(field => {
                const isOk = field.value !== null && field.value !== undefined;
                const statusClass = isOk ? 'ok' : 'missing';
                const statusIcon = isOk ? 'OK' : 'X';
                const valueDisplay = isOk ? field.value : 'missing';

                html += `
                    <div class="error-field">
                        <span class="field-status ${statusClass}">${statusIcon}</span>
                        <span class="field-name">${field.label}</span>
                        <span class="field-value">${valueDisplay}</span>
                    </div>
                `;
            });

            errorDetails.innerHTML = html;
        }

        // Setup button handlers
        const openBtn = document.getElementById('metadataErrorOpenBtn');
        const closeBtn = document.getElementById('metadataErrorCloseBtn');

        if (openBtn) {
            openBtn.addEventListener('click', async () => {
                const result = await window.electronAPI.selectDataFolder();
                if (result.success) {
                    window.location.reload();
                }
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', async () => {
                // Close the dataset and reload to welcome screen
                window.location.reload();
            });
        }
    }

    console.error('Metadata error displayed:', errorMessage);
}

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

// === DECKGL INITIALIZATION ===
function initializeDeckGL() {
    const { DeckGL, OrthographicView, COORDINATE_SYSTEM } = deck;

    const advancedConfig = window.advancedConfig();
    const tileSize = advancedConfig.visualization.tileSize;

    state.deckglInstance = new DeckGL({
        container: 'map',
        views: new OrthographicView({
            id: 'ortho',
            flipY: false,
            controller: true
        }),
        initialViewState: INITIAL_VIEW_STATE,
        controller: {
            scrollZoom: { speed: 0.01, smooth: true },
            doubleClickZoom: true,
            touchZoom: true,
            touchRotate: false,
            keyboard: true,
            dragPan: true
        },
        onViewStateChange: handleViewStateChange,
        onHover: handleHover,
        getTooltip: null,
        parameters: {
            depthTest: false,
            blend: true,
            blendFunc: [770, 771]
        },
        getCursor: ({isHovering}) => {
            try {
                const active = window.appState?.rectangularSelector?.isActive;
                if (active) return 'crosshair';
            } catch {}
            return isHovering ? 'pointer' : 'default';
        },
        layers: []
    });

    window.appState.deckglInstance = state.deckglInstance;
}

// === MAIN INITIALIZATION (Electron-specific) ===
async function init() {
    showLoading(state, elements.loadingIndicator);

    // Check if data path is configured first (Electron-specific)
    const paths = await window.electronAPI.getPaths();
    if (!paths.dataPath) {
        // Hide loading curtain and show empty state
        const curtain = document.getElementById('appCurtain');
        if (curtain) {
            curtain.classList.add('hidden');
        }
        const loadingIndicator = elements.loadingIndicator;
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }

        // Show empty state screen
        const emptyState = document.getElementById('emptyState');
        const emptyStateBtn = document.getElementById('emptyStateBtn');
        if (emptyState) {
            emptyState.classList.remove('hidden');

            if (emptyStateBtn) {
                emptyStateBtn.addEventListener('click', async () => {
                    // Read voxel size from input fields before opening folder
                    const voxelX = parseFloat(document.getElementById('voxelSizeX')?.value) || 0.28;
                    const voxelY = parseFloat(document.getElementById('voxelSizeY')?.value) || 0.28;
                    const voxelZ = parseFloat(document.getElementById('voxelSizeZ')?.value) || 0.70;

                    // Save voxel size to electron-store
                    await window.electronAPI.setVoxelSize([voxelX, voxelY, voxelZ]);
                    console.log('Voxel size saved:', [voxelX, voxelY, voxelZ]);

                    const result = await window.electronAPI.selectDataFolder();
                    if (result.success) {
                        // Reload to apply new data path
                        window.location.reload();
                    }
                });
            }
        }

        console.warn('Data folder not configured. Waiting for user selection.');
        // Don't proceed with initialization
        return;
    }

    // Load dataset metadata from MBTiles before config()
    const metadataResult = await window.loadDatasetMetadata();

    // Try to get config - catch errors for missing metadata
    let userConfig;
    try {
        userConfig = window.config();
    } catch (error) {
        console.error('Configuration error:', error.message);
        showMetadataError(metadataResult, error.message);
        return;
    }

    const advancedConfig = window.advancedConfig();

    // Performance optimization info
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
    initializeDeckGL();

    // Setup all UI event listeners
    setupEventHandlers(elements, state, updatePlane, updateAllLayers);
    setupAdvancedKeyboardShortcuts(state, updatePlane, updateAllLayers);

    // Derive totalPlanes and startingPlane from Arrow boundaries manifest
    try {
        if (!userConfig.arrowBoundariesManifest) {
            throw new Error('arrowBoundariesManifest is not configured');
        }
        const manifestUrl = new URL(userConfig.arrowBoundariesManifest, window.location.href).href;
        const manifest = await fetch(manifestUrl).then(r => r.json());
        let totalPlanes = 0;
        if (manifest && Array.isArray(manifest.shards)) {
            const planes = manifest.shards.map(s => Number(s.plane)).filter(n => Number.isFinite(n));
            totalPlanes = planes.length > 0 ? (Math.max(...planes) + 1) : manifest.shards.length;
        }
        if (!Number.isFinite(totalPlanes) || totalPlanes <= 0) {
            throw new Error('Invalid totalPlanes derived from manifest');
        }
        const startingPlane = Math.floor(totalPlanes / 2);
        window.appState.totalPlanes = totalPlanes;
        console.log(`The image has ${totalPlanes} planes`);
        state.currentPlane = startingPlane;
        elements.slider.min = 0;
        elements.slider.max = totalPlanes - 1;
        elements.slider.value = state.currentPlane;
        elements.label.textContent = `Plane: ${state.currentPlane}`;
    } catch (e) {
        console.error('Failed to derive totalPlanes from manifest.', e);
        throw e;
    }

    // Load gene data
    const {atlas, mapping} = await loadGeneData(state.geneDataMap, state.selectedGenes);
    state.geneIconAtlas = atlas;
    state.geneIconMapping = mapping;

    // Sync dataset capability flags
    try {
        state.hasScores = Boolean(window.appState && window.appState.hasScores);
        state.hasIntensity = Boolean(window.appState && window.appState.hasIntensity);
    } catch {}

    // Show/hide filter sliders based on dataset fields
    const scoreFilterContainer = document.querySelector('.score-filter-item');
    if (scoreFilterContainer) {
        scoreFilterContainer.style.display = state.hasScores ? 'flex' : 'none';
    }
    const intensityFilterContainer = document.querySelector('.intensity-filter-item');
    if (intensityFilterContainer) {
        intensityFilterContainer.style.display = state.hasIntensity ? 'flex' : 'none';
    }

    // Build lookup indexes
    buildGeneSpotIndexes(state.geneDataMap, state.cellToSpotsIndex, state.spotToParentsIndex);

    // Initialize polygon highlighter
    state.polygonHighlighter = new PolygonBoundaryHighlighter(
        state.deckglInstance,
        deck.COORDINATE_SYSTEM.CARTESIAN,
        state.cellToSpotsIndex,
        state.geneToId,
        state.cellDataMap
    );
    state.polygonHighlighter.initialize();

    // Initialize rectangular selector
    state.rectangularSelector = new RectangularSelector(state.deckglInstance, state);
    window.appState.rectangularSelector = state.rectangularSelector;

    const selectionToolBtn = document.getElementById('selectionToolBtn');
    if (selectionToolBtn) {
        selectionToolBtn.addEventListener('click', () => {
            state.rectangularSelector.toggle();
        });
    }

    // Load cell data
    await loadCellData(state.cellDataMap);

    // Compute max total gene count
    try {
        let maxCount = 0;
        state.cellDataMap.forEach(cell => {
            const v = cell && typeof cell.totalGeneCount === 'number' ? cell.totalGeneCount : 0;
            if (v > maxCount) maxCount = v;
        });
        state.maxTotalGeneCount = Math.max(0, maxCount) || 100;
        const slider = document.getElementById('geneCountSlider');
        if (slider) {
            slider.max = String(state.maxTotalGeneCount);
        }
    } catch (e) {
        console.warn('Failed to compute max total gene count:', e);
    }

    // Initialize class colors
    state.allCellClasses.clear();
    state.cellDataMap.forEach((cell, cellId) => {
        const names = cell?.classification?.className;
        if (Array.isArray(names) && names.length > 0) {
            state.allCellClasses.add(names[0]);
        }
    });
    assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);
    if (state.selectedCellClasses.size === 0) {
        state.allCellClasses.forEach(c => state.selectedCellClasses.add(c));
    }

    // Populate UI
    populateCellClassDrawer();
    applyPendingClassColorSchemeIfAny();
    populateGeneDrawer();

    // Preload adjacent planes
    const totalPlanes = window.appState.totalPlanes;
    const adjacentPlanes = [
        Math.max(0, state.currentPlane - 1),
        Math.min(totalPlanes - 1, state.currentPlane + 1)
    ];
    adjacentPlanes.forEach(async (plane) => {
        if (plane !== state.currentPlane && !state.polygonCache.has(plane)) {
            loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap).catch(() => {});
        }
    });

    // Update layers
    updateAllLayers();

    // Setup boundaries ready listener
    try {
        setupBoundariesReadyListener(updateAllLayers, state);
    } catch {}

    hideLoading(state, elements.loadingIndicator);

    // Remove curtain
    try {
        const curtain = document.getElementById('appCurtain');
        if (curtain) {
            curtain.classList.add('hidden');
            setTimeout(() => { curtain.style.display = 'none'; }, 350);
        }
    } catch {}

    if (advancedConfig.performance.showPerformanceStats) {
        console.log('Initialization complete.');
    }
}

// === DOM CONTENT LOADED HANDLER ===
document.addEventListener('DOMContentLoaded', () => {
    // Setup cell info panel close button
    setupCellInfoPanel();

    // Initialize D3 components when DOM is ready
    if (typeof d3 !== 'undefined') {
        initCellInfoColorScheme();
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