/**
 * Cell Lookup Module
 * Provides cell search functionality with smooth camera transitions.
 *
 * Wired up from src/app.js which calls window.cellLookup.setupUI() at startup.
 * Depends on:
 *   - window.appState.cellDataMap    Map<cellId, {position, classification, ...}>
 *   - window.appState.deckglInstance  the deck.gl Deck object
 *   - window.appState.polygonCache   Map<planeNum, GeoJSON>  (for pulse highlight)
 *   - window.appState.currentPlane   number                  (for pulse highlight)
 *   - window.config()                returns {imageWidth, imageHeight, voxelSize, totalPlanes, ...}
 *   - window.updatePlane(n)          switches the visible z-plane
 */

// Import the shared coordinate transformation function
import { transformToTileCoordinates } from '../../utils/coordinateTransform.js';

// Global cell data storage
let cellLookupData = new Map(); // cellId -> { x, y, z, bounds }
let isLookupInitialized = false;

/**
 * Initialize cell lookup by loading and indexing cell data
 */
async function initializeCellLookup() {
    if (isLookupInitialized) {
        return;
    }

    console.log('Initializing cell lookup system...');

    try {
        // Load cell data (Arrow-only)
        await loadCellData();
        isLookupInitialized = true;
        console.log('Cell lookup initialized with', cellLookupData.size, 'cells');
    } catch (error) {
        console.error('Failed to initialize cell lookup:', error);
        throw error;
    }
}

/**
 * Load and parse cell data from Arrow based on configuration
 */
async function loadCellData() {
    if (window.appState && window.appState.cellDataMap) {
        return loadFromArrowData();
    }
    throw new Error('Arrow cell data not available.');
}

/**
 * Load cell data from existing Arrow-loaded cellDataMap
 */
function loadFromArrowData() {
    const cellDataMap = window.appState.cellDataMap;

    for (const [cellId, cellData] of cellDataMap) {
        const x = cellData.position.x;
        const y = cellData.position.y;
        const z = cellData.position.z || 0;

        // Default bounds around cell center (Arrow doesn't include gaussian_contour)
        const bounds = { minX: x-50, maxX: x+50, minY: y-50, maxY: y+50 };

        cellLookupData.set(cellId, {
            x: x,
            y: y,
            z: z,
            bounds: bounds
        });
    }
}

/**
 * Search for a cell by ID and navigate to it
 */
async function searchAndNavigateToCell(cellId) {
    // Ensure lookup is initialized
    if (!isLookupInitialized) {
        await initializeCellLookup();
    }

    const cellNum = parseInt(cellId);
    if (isNaN(cellNum)) {
        throw new Error('Please enter a valid cell number');
    }

    const cellData = cellLookupData.get(cellNum);
    if (!cellData) {
        throw new Error(`Cell ${cellNum} not found in dataset`);
    }

    console.log('Navigating to cell', cellNum, 'at position', cellData.x, cellData.y);

    // Get image dimensions for coordinate transformation
    const config = window.config ? window.config() : {};
    const imageDimensions = {
        width: config.imageWidth,
        height: config.imageHeight,
        tileSize: 256
    };

    // CRITICAL: Transform coordinates from original image space to tile coordinate space
    const [transformedX, transformedY] = transformToTileCoordinates(cellData.x, cellData.y, imageDimensions);

    // Calculate plane number from Z coordinate
    const [xVoxelSize, yVoxelSize, zVoxelSize] = config.voxelSize; // [0.28, 0.28, 0.7]
    const planeNumber = Math.floor(cellData.z * xVoxelSize / zVoxelSize);

    // Switch to the calculated plane
    if (window.updatePlane && typeof window.updatePlane === 'function') {
        window.updatePlane(planeNumber);
    } else {
        console.warn('Could not switch plane - updatePlane function not available');
    }

    // CRITICAL: Use high zoom for close-up view of the cell
    const targetZoom = 8; // Maximum zoom for detailed cell view

    // Get current view state from deck.gl instance
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) {
        throw new Error('Deck.GL instance not available');
    }

    // Step 1: Save original controller configuration and disable controller during transition
    const originalController = deckInstance.props.controller;

    deckInstance.setProps({
        controller: false
    });

    // Step 2: Navigate with transition
    const targetViewState = {
        target: [transformedX, transformedY, 0],
        zoom: targetZoom,
        transitionDuration: 1500,
        transitionInterpolator: new deck.LinearInterpolator(['target', 'zoom'])
    };

    deckInstance.setProps({
        viewState: targetViewState
    });

    // Step 3: Re-enable controller with ORIGINAL configuration after transition
    setTimeout(() => {
        deckInstance.setProps({
            controller: originalController,
            viewState: undefined // Let controller take over
        });
    }, 1600);

    return cellData;
}

/**
 * Flash a white outline on the target cell polygon for ~1.2s
 */
function pulseCell(cellId) {
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) return;

    // Find the polygon feature from the current plane's cached GeoJSON
    const currentPlane = window.appState?.currentPlane ?? 0;
    const geojson = window.appState?.polygonCache?.get(currentPlane);
    if (!geojson || !geojson.features) return;

    const feature = geojson.features.find(
        f => f.properties && parseInt(f.properties.label) === cellId
    );
    if (!feature) return;

    const pulseLayerId = 'cell-lookup-pulse';

    const pulseLayer = new deck.GeoJsonLayer({
        id: pulseLayerId,
        data: { type: 'FeatureCollection', features: [feature] },
        stroked: true,
        filled: false,
        getLineColor: [255, 255, 255, 200],
        getLineWidth: 4,
        lineWidthUnits: 'pixels',
        pickable: false,
        parameters: { depthTest: false }
    });

    // Inject pulse layer
    const currentLayers = deckInstance.props.layers || [];
    deckInstance.setProps({ layers: [...currentLayers, pulseLayer] });

    // Remove after 1.2s
    setTimeout(() => {
        const layers = deckInstance.props.layers || [];
        deckInstance.setProps({
            layers: layers.filter(l => l.id !== pulseLayerId)
        });
    }, 1200);
}

/**
 * Setup cell lookup UI event handlers
 */
function setupCellLookupUI() {
    const input = document.getElementById('cellSearchInput');

    function openBar() {
        input.style.display = 'block';
        input.classList.remove('error');
        input.value = '';
        // Force reflow then focus (so display:block takes effect first)
        input.offsetHeight;
        input.focus();
    }

    function closeBar() {
        input.style.display = 'none';
        input.classList.remove('error');
        input.value = '';
    }

    // Ctrl+F opens the bar
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            if (input.style.display === 'block') {
                closeBar();
            } else {
                openBar();
            }
        }
    });

    // Escape closes
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeBar();
        }
    });

    // Enter triggers search
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Blur closes (click elsewhere dismisses)
    input.addEventListener('blur', () => {
        // Small delay so click events on the input itself aren't eaten
        setTimeout(() => {
            if (document.activeElement !== input) {
                closeBar();
            }
        }, 150);
    });

    async function performSearch() {
        const cellId = input.value.trim();
        if (!cellId) return;

        try {
            await searchAndNavigateToCell(cellId);
            closeBar();
            // Pulse the target cell polygon
            pulseCell(parseInt(cellId));
        } catch (error) {
            // Shake + red border
            input.classList.remove('error');
            input.offsetHeight; // reflow to restart animation
            input.classList.add('error');
            input.select();
            console.log('Cell lookup error:', error.message);
        }
    }

    console.log('Cell lookup UI initialized - Press Ctrl+F to search');
}

// Export functions for use in main application
window.cellLookup = {
    initialize: initializeCellLookup,
    search: searchAndNavigateToCell,
    setupUI: setupCellLookupUI
};
