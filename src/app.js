// Import configuration constants
import {
    INITIAL_VIEW_STATE,
    MAX_PRELOAD,
    DEFAULT_STATE,
    UI_ELEMENTS
} from '../config/constants.js';

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
    createGeneLayers
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

// Import simple selection
import { SimpleSelection } from '../modules/simpleSelection.js';

// Import background indexing
import { startBackgroundIndexing } from '../modules/backgroundIndexLoader.js';

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

// Extract deck.gl components
const {DeckGL, OrthographicView, COORDINATE_SYSTEM} = deck;

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
    console.log(`Scale bar: ${formatDistance(distance)} = ${pixels.toFixed(1)}px at zoom ${viewState.zoom.toFixed(1)}`);
}

// === COORDINATE DISPLAY FUNCTIONS ===
function updateCoordinateDisplay(info) {
    const coordDisplay = document.getElementById('coordinateDisplay');
    if (!coordDisplay) return;
    
    if (info.coordinate) {
        const config = window.config();
        const [deckX, deckY] = info.coordinate;
        
        // Convert deck.gl coordinates to image pixels
        // deck.gl (256, 256) should map to image (6411, 6411) if image is 6411x4412 for example
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
        document.getElementById('deckglCoords').textContent = 
            `${deckX.toFixed(2)}, ${deckY.toFixed(2)}`;
            
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

    // Add polygon layers for current plane ONLY if cached
    if (state.polygonCache.has(state.currentPlane)) {
        layers.push(...createPolygonLayers(
            state.currentPlane, 
            state.polygonCache, 
            state.showPolygons, 
            state.cellClassColors, 
            state.polygonOpacity,
            state.selectedCellClasses
        ));
    }

    // Add gene layers
    layers.push(...createGeneLayers(state.geneDataMap, state.showGenes, state.selectedGenes, state.geneIconAtlas, state.geneIconMapping, state.currentPlane, state.geneSizeScale, (info) => showTooltip(info, elements.tooltip)));

    // Preserve pinned line layers before updating
    if (state.polygonHighlighter && state.polygonHighlighter.pinnedLineLayer) {
        layers.push(state.polygonHighlighter.pinnedLineLayer);
    }

    // Add debug dots for coordinate sanity checking
    // layers.push(createDebugDots());

    state.deckglInstance.setProps({ layers: layers });
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
    
    // Step 2: Load polygon data for current plane + adjacent planes immediately
    const userConfig = window.config();
    const planesToLoad = [
        Math.max(0, state.currentPlane - 1),           // Previous plane
        state.currentPlane,                            // Current plane
        Math.min(userConfig.totalPlanes - 1, state.currentPlane + 1)  // Next plane
    ];
    
    // Start loading all planes in parallel
    planesToLoad.forEach(plane => {
        if (!state.polygonCache.has(plane)) {
            updatePlanePolygonsAsync(plane);
        }
    });
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
        onViewStateChange: ({viewState}) => {
            // Update scale bar when view changes
            updateScaleBar(viewState);
            return viewState;
        },
        onHover: (info) => {
            console.log('Main deck.gl onHover called:', info.layer?.id, info.picked);
            updateCoordinateDisplay(info);
            showTooltip(info, elements.tooltip);
        },
        getCursor: ({isHovering}) => (isHovering ? 'pointer' : 'default'),
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
    
    // Initialize simple selection tool
    state.simpleSelection = new SimpleSelection(state.deckglInstance, state);
    
    // Setup selection tool button
    const selectionToolBtn = document.getElementById('selectionToolBtn');
    if (selectionToolBtn) {
        selectionToolBtn.addEventListener('click', () => {
            state.simpleSelection.toggle();
        });
    }
    
    console.log('Simple selection ready - Click selection tool icon to toggle');
    
    // Load cell data - this is also shared across all planes
    console.log('Loading cell data...');
    await loadCellData(state.cellDataMap);
    
    // Start background cell boundary index building (non-blocking)
    console.log('🚀 Starting background cell boundary indexing...');
    window.cellBoundaryIndexPromise = startBackgroundIndexing(state);
    
    // CRITICAL FIX: Load polygon data for current plane + adjacent planes during initialization
    // This prevents flickering on the very first slider movement
    console.log(`Init: Loading polygon data for plane ${state.currentPlane} + adjacent planes`);
    
    // Load current plane first (blocking)
    const polygonResult = await loadPolygonData(state.currentPlane, state.polygonCache, state.allCellClasses, state.cellDataMap);
    console.log(`Init: Current plane polygon data loaded:`, polygonResult);
    
    // Assign colors to cell classes after loading polygon data
    assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);
    
    // Initialize cell class widget with all classes selected by default
    if (state.selectedCellClasses.size === 0) {
        state.allCellClasses.forEach(cellClass => state.selectedCellClasses.add(cellClass));
    }
    
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
    
    hideLoading(state, elements.loadingIndicator);
    
    if (advancedConfig.performance.showPerformanceStats) {
        console.log('✅ Initialization complete. Slider should now be very responsive!');
    }
}

// Export coordinate transformation function for child windows
window.transformToTileCoordinates = transformToTileCoordinates;

// Initialize cell lookup UI immediately when page loads (before data loading)
window.addEventListener('load', () => {
    // Initialize cell lookup UI first - this sets up the Ctrl+F event listener
    if (window.cellLookup) {
        window.cellLookup.setupUI();
        console.log('🔍 Cell lookup UI ready immediately (data will load on first search)');
    }
    
    // Then start the main application initialization
    init();
});
