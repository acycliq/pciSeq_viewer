// Import configuration constants
import {
    INITIAL_VIEW_STATE,
    MAX_PRELOAD,
    DEFAULT_STATE,
    UI_ELEMENTS,
    USE_ARROW
} from '../config/constants.js';
import RBush from 'https://cdn.jsdelivr.net/npm/rbush@3.0.1/+esm';
import { buildGlobalZProjection, createZProjectionLayer, isZProjectionReady } from '../modules/zProjectionOverlay.js';

// Import coordinate transformation utilities
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';
import {
    clamp
} from '../utils/coordinateTransform.js';

// Import data loading functions
import {
    loadGeneData,
    loadPolygonData,
    loadCellData,
    assignColorsToCellClasses,
    buildGeneSpotIndexes
} from '../modules/dataLoaders.js';

// Import layer creation functions
import {
    createTileLayer,
    createPolygonLayers,
    createGeneLayers,
    createArrowPointCloudLayer
} from '../modules/layerCreators.js';

// Import UI helper functions
import {
    showLoading,
    hideLoading,
    showTooltip
} from '../modules/uiHelpers.js';

// Import event handling functions
import {
    setupEventHandlers,
    setupAdvancedKeyboardShortcuts
} from '../modules/eventHandlers.js';

// Import polygon interactions
import { PolygonBoundaryHighlighter } from '../modules/polygonInteractions.js';

// Import rectangular selector
import { RectangularSelector } from '../modules/rectangularSelector.js';

// Import background indexing
import { startBackgroundIndexing } from '../modules/backgroundIndexLoader.js';
import Perf from '../utils/runtimePerf.js';

// Import modular components
import { state } from './stateManager.js';
import { elements } from './domElements.js';
import { 
    showGeneWidget,
    hideGeneWidget,
    filterGenes,
    toggleAllGenes,
    undockGeneWidget
} from './geneWidget.js';
import {
    populateCellClassWidget,
    showCellClassWidget,
    hideCellClassWidget,
    filterCellClasses,
    toggleAllCellClasses,
    undockCellClassWidget
} from './cellClassWidget.js';
import {
    openCellClassViewer,
    getCellClassViewerData
} from './cellClassViewer.js';
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

// Extract deck.gl components
const {DeckGL, OrthographicView, COORDINATE_SYSTEM} = deck;

// Track zoom mode switches to toggle spot layer type without spamming updates
let __lastZoomMode = null; // 'pc' or 'icon'
let __lastDragging = false; // track pan-drag state

// Expose gene widget functions globally for event handlers
window.showGeneWidget = showGeneWidget;
window.hideGeneWidget = hideGeneWidget;
window.filterGenes = filterGenes;
window.toggleAllGenes = toggleAllGenes;
window.undockGeneWidget = undockGeneWidget;

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

// === SCALE BAR FUNCTIONS ===
function calculateScaleBar(viewState) {
    const config = window.config();
    const voxelSize = config.voxelSize;
    const resolution = voxelSize[0]; // microns per pixel in original image
    
    // Deck.gl coordinate system: image is mapped to 256x256 coordinate space
    // So 1 deck.gl unit = imageWidth/256 image pixels
    const deckglUnitsPerImagePixel = 256 / config.imageWidth;
    
    // Convert from deck.gl coordinates to microns
    // 1 deck.gl unit = (imageWidth/256) image pixels = (imageWidth/256) * resolution microns
    const micronsPerDeckglUnit = (config.imageWidth / 256) * resolution;
    
    // Account for zoom level
    const micronsPerPixel = micronsPerDeckglUnit / Math.pow(2, viewState.zoom);
    const pixelsPerMicron = 1 / micronsPerPixel;
    
    // Choose appropriate scale length
    const scaleOptions = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; // μm
    const targetPixels = 100; // Target scale bar length in pixels
    
    let bestScale = scaleOptions[0];
    for (const scale of scaleOptions) {
        const pixels = scale / micronsPerPixel;
        if (pixels <= targetPixels && pixels >= 40) { // Min 40px for readability
            bestScale = scale;
        } else if (pixels > targetPixels) {
            break;
        }
    }
    
    const actualPixels = bestScale / micronsPerPixel;
    return { pixels: actualPixels, distance: bestScale };
}

function formatDistance(microns) {
    if (microns < 1) {
        return `${(microns * 1000).toFixed(0)} nm`;
    } else if (microns < 1000) {
        return `${microns} μm`;
    } else {
        return `${(microns / 1000).toFixed(1)} mm`;
    }
}

function updateScaleBar(viewState) {
    const scaleBar = document.getElementById('scaleBar');
    const scaleLine = scaleBar.querySelector('.scale-bar-line');
    const scaleLabel = scaleBar.querySelector('.scale-bar-label');
    
    if (!scaleBar || !scaleLine || !scaleLabel) return;
    
    const { pixels, distance } = calculateScaleBar(viewState);
    
    // Update scale bar appearance
    scaleLine.style.width = pixels + 'px';
    scaleLabel.textContent = formatDistance(distance);
    
    // Add some debug info
    // console.log(`Scale bar: ${formatDistance(distance)} = ${pixels.toFixed(1)}px at zoom ${viewState.zoom.toFixed(1)}`);
}

// === COORDINATE DISPLAY FUNCTIONS ===
function updateCoordinateDisplay(info) {
    const coordDisplay = document.getElementById('coordinateDisplay');
    if (!coordDisplay) return;
    
    if (info.coordinate) {
        const config = window.config();
        const [deckX, deckY] = info.coordinate;
        
        // Convert deck.gl coordinates to image pixels
        const longSide = Math.max(config.imageWidth, config.imageHeight);
        const imageX = deckX * longSide / 256;
        const imageY = deckY * longSide / 256;
        
        // Convert to microns
        const [xVoxel, yVoxel, zVoxel] = config.voxelSize;
        const micronX = imageX * xVoxel;
        const micronY = imageY * yVoxel;
        
        // Update display elements
        document.getElementById('pixelCoords').textContent = 
            `${Math.round(imageX)}, ${Math.round(imageY)}`;
        document.getElementById('micronCoords').textContent = 
            `${micronX.toFixed(1)}, ${micronY.toFixed(1)}`;
            
        coordDisplay.style.display = 'block';
    } else {
        coordDisplay.style.display = 'none';
    }
}

// === DEBUG FUNCTIONS ===
function createDebugDots() {
    const config = window.config();
    
    // Define pixel coordinates for the four corners
    const pixelCoords = [
        [0, 0],           // Top-left
        [0, 4412],        // Bottom-left  
        [6411, 4412],     // Bottom-right
        [6411, 0]         // Top-right
    ];
    
    // Convert pixel coordinates to deck.gl coordinates
    const longSide = Math.max(config.imageWidth, config.imageHeight);
    const debugPoints = pixelCoords.map(([x, y], index) => ({
        position: [x * 256 / longSide, y * 256 / longSide],
        color: [255, 0, 0], // Bright red
        radius: 0.5, // 0.5 pixel radius = 1 pixel diameter
        id: index
    }));
    
    return new deck.ScatterplotLayer({
        id: 'debug-dots',
        data: debugPoints,
        getPosition: d => d.position,
        getRadius: d => d.radius,
        getFillColor: d => d.color,
        radiusUnits: 'pixels',
        pickable: true,
        radiusMinPixels: 0.5,
        radiusMaxPixels: 0.5
    });
}

// === MAIN UPDATE FUNCTION ===
function updateAllLayers() {
    if (!state.deckglInstance) return;

    const t0 = performance.now();
    const layers = [];

    // Add tile layers - keep same instances, only change opacity
    const direction = elements.slider.value > state.currentPlane ? 1 : -1;
    const preloadAhead = direction === 1 ? MAX_PRELOAD + 1 : MAX_PRELOAD;
    const preloadBehind = direction === -1 ? MAX_PRELOAD + 1 : MAX_PRELOAD;

    const userConfig = window.config();
    const start = Math.max(0, state.currentPlane - preloadBehind);
    const end = Math.min(userConfig.totalPlanes - 1, state.currentPlane + preloadAhead);

    for (let plane = start; plane <= end; plane++) {
        const opacity = plane === state.currentPlane ? 1 : 0;
        const layerId = `tiles-${plane}`;
        
        // Reuse existing layer instance or create new one
        let tileLayer = state.tileLayers.get(layerId);
        if (!tileLayer) {
            tileLayer = createTileLayer(plane, opacity, state.tileCache, state.showTiles);
            state.tileLayers.set(layerId, tileLayer);
        } else {
            // Update existing layer's opacity and visibility
            tileLayer = tileLayer.clone({
                opacity: opacity,
                visible: state.showTiles
            });
            state.tileLayers.set(layerId, tileLayer);
        }
        
        layers.push(tileLayer);
    }

    // Add polygon layers (TSV uses cache; Arrow builds per-plane GeoJSON)
    layers.push(...createPolygonLayers(
        state.currentPlane, 
        state.polygonCache, 
        state.showPolygons, 
        state.cellClassColors, 
        state.polygonOpacity,
        state.selectedCellClasses,
        state.cellDataMap
    ));

    // Add gene/spot layers: binary PointCloud at low zoom (Arrow), IconLayers at high zoom
    const zoom = (typeof state.currentZoom === 'number') ? state.currentZoom : INITIAL_VIEW_STATE.zoom;
    if (USE_ARROW && zoom < 7) {
        try { console.log(`[layers] Using binary Scatterplot for spots at zoom ${zoom.toFixed(1)} (showGenes=${state.showGenes})`); } catch {}
        const pc = createArrowPointCloudLayer(state.currentPlane, state.geneSizeScale, state.selectedGenes, 1.0, state.scoreThreshold, state.hasScores, state.uniformMarkerSize);
        if (pc && state.showGenes) layers.push(pc);
        // Simplified: no deferred cleanup needed with single IconLayer approach
        state.lastIconLayers = [];
        state.iconCleanupPending = false;
        state.iconCleanupRemaining = 0;
    } else {
        try { console.log(`[layers] Using IconLayers for spots at zoom ${zoom.toFixed(1)} (showGenes=${state.showGenes})`); } catch {}
        const bounds = getCurrentViewportTileBounds();
        const iconLayers = createGeneLayers(
            state.geneDataMap,
            state.showGenes,
            state.selectedGenes,
            state.geneIconAtlas,
            state.geneIconMapping,
            state.currentPlane,
            state.geneSizeScale,
            (info) => showTooltip(info, elements.tooltip),
            USE_ARROW ? bounds : null, // Only cull viewport when using Arrow data
            true, // combine into a single IconLayer at deep zoom to minimize churn
            state.scoreThreshold, // Score threshold for filtering
            state.hasScores, // Whether dataset has valid scores
            state.uniformMarkerSize // Uniform marker sizing toggle
        );
        layers.push(...iconLayers);
        state.lastIconLayers = iconLayers;
        state.iconCleanupPending = false;
        state.iconCleanupRemaining = 0;
    }

    // Preserve pinned line layers before updating
    if (state.polygonHighlighter && state.polygonHighlighter.pinnedLineLayer) {
        layers.push(state.polygonHighlighter.pinnedLineLayer);
    }

    // Add debug dots for coordinate sanity checking
    // layers.push(createDebugDots());

    // Add Z-projection overlay layer if ready and enabled
    console.log('Checking Z-projection overlay:', { 
        showZProjectionOverlay: state.showZProjectionOverlay, 
        isReady: isZProjectionReady(),
        opacity: state.zProjectionOpacity 
    });
    
    const zProjectionLayer = createZProjectionLayer(
        state.showZProjectionOverlay && isZProjectionReady(),
        state.zProjectionOpacity || 0.8  // Higher opacity for testing
    );
    if (zProjectionLayer) {
        console.log('Adding Z-projection layer to layers array');
        // Add overlay on TOP of all other layers
        layers.push(zProjectionLayer);
    }

    state.deckglInstance.setProps({ layers: layers });

    // Transition timing end
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
                    try { const n = Array.isArray(lyr.props.data) ? lyr.props.data.length : (lyr.props.data?.length || 0); iconPoints += n; } catch {}
                }
                if (lyr.id === 'spots-scatter-binary') hasBinary = true;
            }
            console.log(`⏱️ Zoom transition end: ${state.zoomTransition.from || 'none'} -> ${state.zoomTransition.to} in ${elapsed.toFixed(1)}ms | layers=${totalLayers}, iconLayers=${iconLayers}, iconPoints≈${iconPoints}, binary=${hasBinary}`);
            state.zoomTransition.inProgress = false;
        }
    } catch {}
}

// Expose updateAllLayers globally for widget modules
window.updateAllLayers = updateAllLayers;

// === PERFORMANCE-OPTIMIZED PLANE UPDATE ===

// Fast update for immediate visual feedback (tiles and genes only)
function updatePlaneImmediate(newPlane) {
    const perfStart = performance.now();
    
    const userConfig = window.config();
    const clampedPlane = clamp(newPlane, 0, userConfig.totalPlanes - 1);
    
    // Update UI immediately - no async operations
    state.currentPlane = clampedPlane;
    elements.slider.value = state.currentPlane;
    elements.label.textContent = `Plane: ${state.currentPlane}`;
    
    // Update layers immediately (tiles + genes always work, polygons use cached data if available)
    updateAllLayers();
    
    const perfTime = performance.now() - perfStart;
    const advancedConfig = window.advancedConfig();
    if (advancedConfig.performance.showPerformanceStats) {
        console.log(`⚡ Immediate plane update: ${perfTime.toFixed(1)}ms`);
    }
}

// Background polygon loading - doesn't block UI
async function updatePlanePolygonsAsync(planeNum) {
    const startTime = performance.now();
    
    // Skip if already cached - major performance boost
    if (state.polygonCache.has(planeNum)) {
        console.log(`Plane ${planeNum} polygons already cached - skipping load`);
        return;
    }
    
    try {
        // Show loading only for longer operations
        const loadingTimeout = setTimeout(() => {
            if (state.currentPlane === planeNum) { // Only show if still current
                showLoading(state, elements.loadingIndicator);
            }
        }, 50); // Show loading after 50ms delay
        
        console.log(`Background loading polygon data for plane ${planeNum}`);
        await loadPolygonData(planeNum, state.polygonCache, state.allCellClasses, state.cellDataMap);
        
        clearTimeout(loadingTimeout);
        hideLoading(state, elements.loadingIndicator);
        
        const loadTime = performance.now() - startTime;
        console.log(`Loaded plane ${planeNum} polygons in ${loadTime.toFixed(1)}ms`);
        
        // Only update UI if this is still the current plane (user might have moved on)
        if (state.currentPlane === planeNum) {
            // Assign colors to newly discovered cell classes
            assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);
            
            // Refresh layers to show new polygon data (only if still current plane)
            updateAllLayers();
        }
        
        // Background preloading of adjacent planes
        requestIdleCallback(() => {
            preloadAdjacentPlanes(planeNum);
        }, { timeout: 1000 });
        
    } catch (error) {
        clearTimeout(loadingTimeout);
        hideLoading(state, elements.loadingIndicator);
        console.error(`Failed to load polygon data for plane ${planeNum}:`, error);
    }
}

// Memory management for polygon cache
function cleanupPolygonCache() {
    const now = Date.now();
    const maxCacheSize = 50; // Keep max 50 planes in memory
    const cleanupInterval = 30000; // Clean every 30 seconds
    
    // Skip if cleaned recently
    if (now - state.lastCleanupTime < cleanupInterval) {
        return;
    }
    
    if (state.polygonCache.size > maxCacheSize) {
        console.log(`Polygon cache has ${state.polygonCache.size} entries, cleaning up...`);
        
        // Keep current plane and adjacent planes
        const userConfig = window.config();
        const keepPlanes = new Set([
            Math.max(0, state.currentPlane - 3),
            Math.max(0, state.currentPlane - 2),
            Math.max(0, state.currentPlane - 1),
            state.currentPlane,
            Math.min(userConfig.totalPlanes - 1, state.currentPlane + 1),
            Math.min(userConfig.totalPlanes - 1, state.currentPlane + 2),
            Math.min(userConfig.totalPlanes - 1, state.currentPlane + 3)
        ]);
        
        // Remove distant planes
        let removedCount = 0;
        for (const [plane] of state.polygonCache.entries()) {
            if (!keepPlanes.has(plane)) {
                state.polygonCache.delete(plane);
                state.polygonLoadTimes.delete(plane);
                removedCount++;
            }
        }
        
        console.log(`Removed ${removedCount} planes from cache, ${state.polygonCache.size} remaining`);
        state.lastCleanupTime = now;
    }
}

// Smart preloading of adjacent planes
function preloadAdjacentPlanes(currentPlane) {
    if (USE_ARROW) return; // Do not preload TSV polygons in Arrow mode
    const userConfig = window.config();
    const planesToPreload = [];
    
    // Preload previous plane
    if (currentPlane > 0 && !state.polygonCache.has(currentPlane - 1)) {
        planesToPreload.push(currentPlane - 1);
    }
    
    // Preload next plane
    if (currentPlane < userConfig.totalPlanes - 1 && !state.polygonCache.has(currentPlane + 1)) {
        planesToPreload.push(currentPlane + 1);
    }
    
    // Clean up cache before preloading
    cleanupPolygonCache();
    
    // Load one at a time to avoid overwhelming the browser
    planesToPreload.forEach((plane, index) => {
        setTimeout(() => {
            if (!state.polygonCache.has(plane)) { // Double-check it's still needed
                console.log(`Preloading plane ${plane} in background`);
                loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap).catch(() => {});
            }
        }, index * 200); // Stagger requests by 200ms
    });
}

// Main update function - now lightning fast
function updatePlane(newPlane) {
    // No loading check needed - this is now non-blocking
    
    // Step 1: Immediate visual update (5-20ms)
    updatePlaneImmediate(newPlane);
    
    // Step 2: Load TSV polygons only when Arrow is disabled
    if (!USE_ARROW) {
        const userConfig = window.config();
        const planesToLoad = [
            Math.max(0, state.currentPlane - 1),           // Previous plane
            state.currentPlane,                            // Current plane
            Math.min(userConfig.totalPlanes - 1, state.currentPlane + 1)  // Next plane
        ];
        planesToLoad.forEach(plane => {
            if (!state.polygonCache.has(plane)) {
                updatePlanePolygonsAsync(plane);
            }
        });
    }
}

// Expose updatePlane globally for cell lookup module
window.updatePlane = updatePlane;

// === TOOLTIP FUNCTIONS ===
// Tooltip functions have been moved to modules/uiHelpers.js

// === DECK.GL INITIALIZATION ===
function initializeDeckGL() {
    state.deckglInstance = new DeckGL({
        container: 'map',
        views: [new OrthographicView({id: 'ortho'})],
        initialViewState: INITIAL_VIEW_STATE,
        controller: {
            minZoom: 0,
            maxZoom: 8,
            scrollZoom: true,
            doubleClickZoom: true,
            touchZoom: true,
            keyboard: false  // Disable deck.gl keyboard to prevent conflicts
        },
        onViewStateChange: ({viewState, interactionState}) => {
            // Update scale bar when view changes
            updateScaleBar(viewState);
            try { state.currentZoom = viewState.zoom; } catch {}
            // Update layers: threshold switches; rebuild IconLayers only on pan end
            try {
                const adv = window.advancedConfig ? window.advancedConfig() : { performance: { showPerformanceStats: false } };
                const mode = (USE_ARROW && viewState.zoom < 7) ? 'pc' : 'icon';
                const dragging = Boolean(interactionState && interactionState.isDragging);

                if (mode !== __lastZoomMode) {
                    if (adv.performance.showPerformanceStats) {
                        state.zoomTransition = { inProgress: true, from: __lastZoomMode, to: mode, start: performance.now() };
                        console.log(`⏱️ Zoom transition start: ${state.zoomTransition.from || 'none'} -> ${mode} at zoom ${viewState.zoom.toFixed(2)}`);
                    }
                    __lastZoomMode = mode;
                    __lastDragging = dragging;
                    updateAllLayers();
                } else if (mode === 'icon') {
                    // NOTE (perf-critical): At deep zoom (≥7) we rebuild the combined IconLayer
                    // only when panning ends (dragging -> not dragging). Rebuilding on every
                    // pan frame caused jank/GC spikes with dense data. This "pan-end refresh"
                    // keeps interactions smooth and then repopulates instantly on release.
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
        },
        onHover: (info) => {
            try {
                const adv = window.advancedConfig ? window.advancedConfig() : null;
                if (adv && adv.performance && adv.performance.showPerformanceStats) {
                    console.log('Main deck.gl onHover called:', info.layer?.id, info.picked);
                }
            } catch {}
            updateCoordinateDisplay(info);
            showTooltip(info, elements.tooltip);
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

    // Initialize scale bar with initial view state
    updateScaleBar(INITIAL_VIEW_STATE);

    // Initialize polygon highlighter - will be done after indexes are built
}

// === EVENT HANDLERS ===
// Event handling functions have been moved to modules/eventHandlers.js

// === MAIN INITIALIZATION ===
async function init() {
    showLoading(state, elements.loadingIndicator);
    
    const userConfig = window.config();
    const advancedConfig = window.advancedConfig();
    
    // Performance optimization info
    if (advancedConfig.performance.enablePerformanceMode) {
        console.log('🚀 Performance optimizations enabled:');
        console.log('  • Two-phase updates (immediate UI + background data)');
        console.log('  • Smart caching with automatic cleanup');
        console.log('  • Background preloading of adjacent planes');
        console.log('  • Reduced slider debouncing for instant response');
        console.log('  • Memory management (max 50 planes cached)');
    }
    
    // Clear polygon cache to ensure fresh load on app restart
    state.polygonCache.clear();
    
    // Initialize deck.gl instance and create the map container
    initializeDeckGL();
    
    // Setup all UI event listeners (slider, buttons, toggles, etc.)
    setupEventHandlers(elements, state, updatePlane, updateAllLayers);
    
    // Setup advanced keyboard shortcuts
    setupAdvancedKeyboardShortcuts(state, updatePlane, updateAllLayers);
    
    // Load gene data first - this builds the gene icon atlas and populates geneDataMap
    // Gene data is shared across all planes, so we only need to load it once
    const {atlas, mapping} = await loadGeneData(state.geneDataMap, state.selectedGenes);
    state.geneIconAtlas = atlas;
    state.geneIconMapping = mapping;
    
    // Show/hide score filter slider based on whether dataset has valid scores
    const scoreFilterContainer = document.querySelector('.score-filter-item');
    if (scoreFilterContainer) {
        if (state.hasScores) {
            scoreFilterContainer.style.display = 'flex';
            console.log('Score filter enabled: dataset contains valid OMP scores');
        } else {
            scoreFilterContainer.style.display = 'none';
            console.log('Score filter disabled: dataset has no valid OMP scores');
        }
    }
    
    // Build lightning-fast lookup indexes after gene data is loaded
    buildGeneSpotIndexes(state.geneDataMap, state.cellToSpotsIndex, state.spotToParentsIndex);
    
    // Initialize polygon highlighter with access to cell-to-spot indexes
    state.polygonHighlighter = new PolygonBoundaryHighlighter(
        state.deckglInstance,
        COORDINATE_SYSTEM.CARTESIAN,
        state.cellToSpotsIndex,
        state.geneToId,
        state.cellDataMap
    );
    state.polygonHighlighter.initialize();
    
    // Initialize rectangular selector
    state.rectangularSelector = new RectangularSelector(state.deckglInstance, state);
    
    // Ensure it's accessible via window.appState
    window.appState.rectangularSelector = state.rectangularSelector;
    
    // Setup selection tool button
    const selectionToolBtn = document.getElementById('selectionToolBtn');
    if (selectionToolBtn) {
        selectionToolBtn.addEventListener('click', () => {
            state.rectangularSelector.toggle();
        });
    }
    
    console.log('Rectangular selector ready - Click selection tool icon to toggle');
    
    // Load cell data - this is also shared across all planes
    console.log('Loading cell data...');
    await loadCellData(state.cellDataMap);
    
    // If Arrow path is enabled, initialize class colors and default selection from cell data
    if (USE_ARROW) {
        state.allCellClasses.clear();
        state.cellDataMap.forEach((cell, cellId) => {
            const names = cell?.classification?.className;
            if (Array.isArray(names) && names.length > 0) {
                const className = names[0];
                if (className === 'Unknown') {
                    console.warn(`Found cell ${cellId} with 'Unknown' class name in source data. Full classification:`, names);
                }
                state.allCellClasses.add(className);
            }
        });
        assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);
        if (state.selectedCellClasses.size === 0) {
            state.allCellClasses.forEach(c => state.selectedCellClasses.add(c));
        }
    }
    
    // Defer background boundary indexing until after READY (scheduled below)
    
    // If Arrow is OFF, preload TSV polygons for current + adjacent planes to prevent flicker
    if (!USE_ARROW) {
        console.log(`Init: Loading polygon data for plane ${state.currentPlane} + adjacent planes`);
        const polygonResult = await loadPolygonData(state.currentPlane, state.polygonCache, state.allCellClasses, state.cellDataMap);
        console.log(`Init: Current plane polygon data loaded:`, polygonResult);
        assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);
        try { Perf.markInteractive('tsv', { plane: state.currentPlane }); } catch {}
        // Defer boundary indexing (TSV) to after READY
        const startIndexing = () => {
            console.log('🚀 Starting background cell boundary indexing (deferred)...');
            window.cellBoundaryIndexPromise = startBackgroundIndexing(state);
        };
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(startIndexing, { timeout: 2000 });
        } else {
            setTimeout(startIndexing, 0);
        }
    }

    // Initialize cell class widget with all classes selected by default
    // Always ensure selectedCellClasses contains all available classes (in case new ones were discovered)
    state.allCellClasses.forEach(cellClass => state.selectedCellClasses.add(cellClass));
    
    // Preload adjacent planes (non-blocking)
    const adjacentPlanes = [
        Math.max(0, state.currentPlane - 1),
        Math.min(userConfig.totalPlanes - 1, state.currentPlane + 1)
    ];
    
    adjacentPlanes.forEach(async (plane) => {
        if (plane !== state.currentPlane && !state.polygonCache.has(plane)) {
            console.log(`Init: Preloading polygon data for adjacent plane ${plane}`);
            loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap).catch(() => {
                console.log(`Init: Failed to preload plane ${plane} (non-critical)`);
            });
        }
    });
    
    // Update UI to reflect the current plane state after data loading
    state.currentPlane = DEFAULT_STATE.currentPlane;
    elements.slider.min = 0;
    elements.slider.max = userConfig.totalPlanes - 1;
    elements.slider.value = state.currentPlane;
    elements.label.textContent = `Plane: ${state.currentPlane}`;
    
    // Now safely update all layers - all required data (genes, polygons) is loaded
    // This will render: background tiles + gene markers + cell boundary polygons
    updateAllLayers();

    // If Arrow boundaries are enabled, refresh layers when buffers for a plane are ready
    try {
        // Function to process Arrow boundaries in main thread for spatial indexing
        async function processArrowBoundariesForSpatialIndex(manifestUrl, img) {
            // Import Arrow dynamically
            const { tableFromIPC } = await import('https://cdn.jsdelivr.net/npm/apache-arrow@12.0.1/+esm');
            
            const manifest = await fetch(manifestUrl).then(r => r.json());
            const baseDir = manifestUrl.substring(0, manifestUrl.lastIndexOf('/') + 1);
            const shards = manifest.shards.map(s => ({ 
                url: new URL(s.url, baseDir).href, 
                plane: Number(s.plane ?? -1) 
            }));
            
            const cellMap = new Map();
            
            // Transform to tile space 
            function toTileXY(x, y) {
                const { width, height, tileSize } = img;
                const maxDimension = Math.max(width, height);
                const xAdj = width / maxDimension;
                const yAdj = height / maxDimension;
                return [x * (tileSize / width) * xAdj, y * (tileSize / height) * yAdj];
            }
            
            // Process each shard
            for (const { url, plane } of shards) {
                try {
                    const response = await fetch(url);
                    if (!response.ok) continue;
                    
                    const buffer = await response.arrayBuffer();
                    const table = tableFromIPC(new Uint8Array(buffer));
                    
                    // Extract data from Arrow table
                    const xListsCol = table.getChild('x_list');
                    const yListsCol = table.getChild('y_list');
                    const labelsCol = table.getChild('label');
                    const planeCol = table.getChild('plane_id');
                    
                    if (!xListsCol || !yListsCol || !labelsCol) continue;
                    
                    const n = table.numRows;
                    for (let i = 0; i < n; i++) {
                        const xList = xListsCol.get(i)?.toArray();
                        const yList = yListsCol.get(i)?.toArray();
                        const label = Number(labelsCol.get(i));
                        const planeId = planeCol ? Number(planeCol.get(i)) : (Number.isFinite(plane) ? plane : -1);
                        
                        if (!xList || !yList || xList.length < 2 || label < 0) continue;
                        
                        // Compute bounds in tile space
                        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                        for (let k = 0; k < xList.length; k++) {
                            const [tx, ty] = toTileXY(Number(xList[k]), Number(yList[k]));
                            minX = Math.min(minX, tx);
                            maxX = Math.max(maxX, tx);
                            minY = Math.min(minY, ty);
                            maxY = Math.max(maxY, ty);
                        }
                        
                        if (!cellMap.has(label)) {
                            cellMap.set(label, { minX, minY, maxX, maxY, planes: new Set() });
                        }
                        const acc = cellMap.get(label);
                        acc.minX = Math.min(acc.minX, minX);
                        acc.minY = Math.min(acc.minY, minY);
                        acc.maxX = Math.max(acc.maxX, maxX);
                        acc.maxY = Math.max(acc.maxY, maxY);
                        if (Number.isFinite(planeId) && planeId >= 0) acc.planes.add(planeId);
                    }
                } catch (e) {
                    console.warn('Failed to process shard:', url, e.message);
                }
            }
            
            // Convert to array format for worker
            return Array.from(cellMap.entries()).map(([cellId, bounds]) => ({
                cellId,
                minX: bounds.minX,
                minY: bounds.minY,
                maxX: bounds.maxX,
                maxY: bounds.maxY,
                planes: Array.from(bounds.planes)
            }));
        }

        let markedReady = false;
        window.addEventListener('arrow-boundaries-ready', () => {
            updateAllLayers();
            if (!markedReady) {
                markedReady = true;
                // End-to-end ready mark (Arrow path)
                try { Perf.markInteractive('arrow', { plane: state.currentPlane }); } catch {}
                // Start spatial index worker (Arrow only) after READY
                try {
                    const btn = document.getElementById('selectionToolBtn');
                    if (btn) { btn.disabled = true; btn.textContent = 'Selection (Indexing…)'; }
                    const cfg = window.config();
                    const adv = window.advancedConfig ? window.advancedConfig() : null;
                    const manifest = new URL(
                        cfg.arrowBoundariesManifest || './data/arrow_boundaries/manifest.json',
                        window.location.href
                    ).href;
                    const { imageWidth: width, imageHeight: height } = cfg;
                    const tileSize = (adv && adv.visualization && adv.visualization.tileSize) ? adv.visualization.tileSize : 256;
                    // Use absolute path to ensure correct resolution on GitHub Pages
                    const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
                    const workerUrl = new URL('modules/workers/spatial-index-worker.js', baseUrl);
                    console.log('Starting spatial index worker:', workerUrl.href);
                    console.log('Manifest URL:', manifest);
                    
                    const w = new Worker(workerUrl); // Remove module type for importScripts compatibility
                    
                    // Add onerror handler for worker creation failures
                    w.onerror = (error) => {
                        console.error('Spatial index worker creation error:', error);
                        if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                    };
                    
                    // Add timeout fallback in case worker hangs
                    const workerTimeout = setTimeout(() => {
                        console.error('Spatial index worker timeout - terminating worker');
                        w.terminate();
                        if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                    }, 45000); // 45 second timeout
                    
                    w.onmessage = (ev) => {
                        clearTimeout(workerTimeout); // Clear timeout on any message
                        const { type, rtree, error } = ev.data || {};
                        console.log('Worker message received:', type);
                        
                        if (type === 'indexReady' && rtree) {
                            try {
                                const tree = new RBush();
                                tree.fromJSON(rtree);
                                window.cellBoundaryIndexPromise = Promise.resolve({ spatialIndex: tree });
                                if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                                console.log('✅ Spatial index ready (worker)');
                            } catch (e) {
                                console.error('Failed to rehydrate spatial index:', e);
                                if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                            }
                        } else if (type === 'error') {
                            console.error('Index worker error:', error);
                            if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                        }
                    };
                    // Process Arrow boundaries in main thread, then send to worker for spatial indexing
                    processArrowBoundariesForSpatialIndex(manifest, { width, height, tileSize })
                        .then(cellBounds => {
                            console.log(`Processed ${cellBounds.length} cells for spatial indexing`);
                            w.postMessage({ type: 'buildIndex', payload: { cellBounds } });
                        })
                        .catch(error => {
                            console.error('Failed to process Arrow boundaries:', error);
                            if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                        });
                } catch (e) {
                    console.error('Failed to start spatial index worker:', e);
                    if (btn) { btn.disabled = false; btn.textContent = 'Selection Tool'; }
                }
            }
        });
    } catch {}
    
    hideLoading(state, elements.loadingIndicator);
    
    if (advancedConfig.performance.showPerformanceStats) {
        console.log('✅ Initialization complete. Slider should now be very responsive!');
    }
    
    // Start building global Z-projection overlay (background task)
    setTimeout(() => {
        buildGlobalZProjectionBackground();
    }, 2000); // Wait 2 seconds after app ready
}

// Export coordinate transformation function for child windows
window.transformToTileCoordinates = transformToTileCoordinates;

/**
 * Build global Z-projection overlay in background
 */
async function buildGlobalZProjectionBackground() {
    try {
        console.log('🌟 Starting background Z-projection build...');
        
        await buildGlobalZProjection(state, (progress) => {
            // Progress callback
            if (progress.planesProcessed % 10 === 0) {
                console.log(`Z-projection: ${progress.planesProcessed}/${progress.totalPlanes} planes, ${progress.cellsProcessed} cells`);
            }
        });
        
        console.log('✅ Z-projection overlay ready! Check viewer controls to enable.');
        
        // If overlay is already enabled, update layers
        if (state.showZProjectionOverlay) {
            updateAllLayers();
        }
        
    } catch (error) {
        console.error('Failed to build Z-projection overlay:', error);
    }
}

// Compute current viewport bounds in tile (deck) coordinates
function getCurrentViewportTileBounds() {
    try {
        const vps = state.deckglInstance && state.deckglInstance.getViewports && state.deckglInstance.getViewports();
        const vp = vps && vps[0];
        if (!vp) return null;
        const w = vp.width || 0, h = vp.height || 0;
        const p0 = vp.unproject([0, h]);     // bottom-left screen → world
        const p1 = vp.unproject([w, 0]);     // top-right screen → world
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

// Cell Info Panel functionality
window.updateCellInfo = function(cellProperties) {
    try {
        // Create compatible data structure for donut chart and data tables
        const cellData = {
            cell_id: cellProperties.cell_id || cellProperties.Cell_Num,
            centroid: cellProperties.centroid || [cellProperties.x || 0, cellProperties.y || 0],
            ClassName: cellProperties.ClassName || [],
            Prob: cellProperties.Prob || [],
            Genenames: cellProperties.Genenames || [],
            CellGeneCount: cellProperties.CellGeneCount || []
        };

        console.log('Updating cell info with data:', cellData);

        // If gene counts missing, derive from indexes (cellToSpotsIndex)
        try {
            if ((!cellData.Genenames || cellData.Genenames.length === 0 || !cellData.CellGeneCount || cellData.CellGeneCount.length === 0)
                && window.appState && window.appState.cellToSpotsIndex) {
                const cid = Number(cellData.cell_id || cellProperties.id);
                if (Number.isFinite(cid)) {
                    const spots = window.appState.cellToSpotsIndex.get(cid) || [];
                    const counts = new Map();
                    for (const s of spots) {
                        const g = s && s.gene ? String(s.gene) : '';
                        if (!g) continue;
                        // Prefer numeric intensity if present; otherwise add 1
                        const val = (s && typeof s.intensity === 'number' && isFinite(s.intensity)) ? s.intensity : 1;
                        counts.set(g, (counts.get(g) || 0) + val);
                    }
                    const rows = Array.from(counts.entries()).map(([gene, count]) => ({ gene, count }));
                    rows.sort((a, b) => b.count - a.count);
                    // Truncate to two decimals without rounding for display consistency
                    cellData.Genenames = rows.map(r => r.gene);
                    cellData.CellGeneCount = rows.map(r => Math.trunc(Number(r.count) * 100) / 100);
                }
            }
        } catch (e) {
            console.warn('Failed to derive gene counts from index:', e);
        }

        // Update donut first; isolate failures
        try {
            const fn = (typeof window !== 'undefined') ? window.donutchart : (typeof donutchart !== 'undefined' ? donutchart : null);
            if (cellData.ClassName && cellData.Prob && typeof fn === 'function') {
                fn(cellData);
            }
        } catch (e) {
            console.warn('Donut update failed:', e);
        }

        // Update gene counts table (left of donut); isolate failures
        try {
            const geneTableFn = (typeof window !== 'undefined') ? window.renderGeneTable : (typeof renderGeneTable !== 'undefined' ? renderGeneTable : null);
            if (typeof geneTableFn === 'function') {
                geneTableFn(cellData);
            }
        } catch (e) {
            console.warn('Gene table update failed:', e);
        }

        // Ensure panel is visible
        const panel = document.getElementById('cellInfoPanel');
        if (panel) panel.style.display = 'block';

        // Update header with Cell Num, total counts, and coordinates
        try {
            const titleElement = document.getElementById('cellInfoTitle');
            if (titleElement) {
                const cellNum = cellData.cell_id || cellData.Cell_Num || cellProperties.id || 'Unknown';
                const xVal = (cellData.X != null) ? cellData.X : (Array.isArray(cellData.centroid) ? cellData.centroid[0] : cellData.x);
                const yVal = (cellData.Y != null) ? cellData.Y : (Array.isArray(cellData.centroid) ? cellData.centroid[1] : cellData.y);
                const x = Number(xVal || 0).toFixed(0);
                const y = Number(yVal || 0).toFixed(0);
                let total = 0;
                if (Array.isArray(cellData.CellGeneCount)) {
                    total = cellData.CellGeneCount.reduce((acc, v) => acc + (Number(v) || 0), 0);
                } else if (cellData.agg && typeof cellData.agg.GeneCountTotal === 'number') {
                    total = Number(cellData.agg.GeneCountTotal) || 0;
                }
                // Truncate total to two decimals without rounding
                const totalTrunc = (Math.trunc(total * 100) / 100).toFixed(2);
                const str = `<b><strong>Cell Num: </strong>${cellNum}, <strong>Gene Counts: </strong>${totalTrunc},  (<strong>x, y</strong>): (${x}, ${y})</b>`;
                titleElement.innerHTML = str;
            }
        } catch (e) {
            console.warn('Failed to update cell info header:', e);
        }
    } catch (error) {
        console.error('Error updating cell info:', error);
    }
};

// Setup cell info panel close button
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('cellInfoClose');
    const panel = document.getElementById('cellInfoPanel');
    
    if (closeBtn && panel) {
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }
    
    // Initialize D3 components when DOM is ready
    if (typeof d3 !== 'undefined') {
        // Initialize color scheme mapping
        try {
            let cellClasses = null;
            if (typeof window.classColorsCodes === 'function') {
                cellClasses = window.classColorsCodes();
            } else if (typeof window.getColorScheme === 'function') {
                const cs = window.getColorScheme();
                cellClasses = cs && cs.cellClasses ? cs.cellClasses : null;
            }
            if (Array.isArray(cellClasses)) {
                window.currentColorScheme = { cellClasses };
            } else {
                console.warn('Color scheme not available; donut will use fallback gray');
                window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
            }
        } catch (error) {
            console.warn('Could not load color scheme for cell info panel:', error);
            window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
        }
        
        // Initialize gene distribution chart
        initGeneDistributionChart();

        // Initialize cell class distribution chart
        initCellClassDistributionChart();
    }
});

// Initialize cell lookup UI immediately when page loads (before data loading)
window.addEventListener('load', async () => {
    // Start end-to-end timing
    try { Perf.start('viewer'); } catch {}
    // Initialize cell lookup UI first - this sets up the Ctrl+F event listener
    if (window.cellLookup) {
        window.cellLookup.setupUI();
        console.log('🔍 Cell lookup UI ready immediately (data will load on first search)');
    }
    
    // Then start the main application initialization
    init();
});
