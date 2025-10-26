/**
 * Cell Lookup Module
 * Provides cell search functionality with smooth camera transitions
 */

// Import the shared coordinate transformation function
import { transformToTileCoordinates } from '../utils/coordinateTransform.js';

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

    console.log(' Initializing cell lookup system...');

    try {
        // Load cell data (Arrow-only)
        await loadCellData();
        isLookupInitialized = true;
        console.log(' Cell lookup initialized with', cellLookupData.size, 'cells');
    } catch (error) {
        console.error(' Failed to initialize cell lookup:', error);
        throw error;
    }
}

/**
 * Load and parse cell data from Arrow or TSV based on configuration
 */
async function loadCellData() {
    if (window.appState && window.appState.cellDataMap) {
        console.log(' Using Arrow-loaded cell data from appState.cellDataMap');
        return loadFromArrowData();
    }
    throw new Error('Arrow cell data not available.');
}

/**
 * Load cell data from existing Arrow-loaded cellDataMap
 */
function loadFromArrowData() {
    const cellDataMap = window.appState.cellDataMap;
    console.log(' Processing', cellDataMap.size, 'Arrow-loaded cell records...');

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
 * Parse gaussian contour string to extract bounding box
 */
function parseContourBounds(contourStr) {
    try {
        // Remove brackets and split by space, then parse coordinate pairs
        const coordStr = contourStr.replace(/[\[\]]/g, '');
        const coords = coordStr.split(' ');

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (let i = 0; i < coords.length; i += 2) {
            const x = parseFloat(coords[i]);
            const y = parseFloat(coords[i + 1]);

            if (!isNaN(x) && !isNaN(y)) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }

        return { minX, maxX, minY, maxY };
    } catch (e) {
        return null;
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

    console.log(` Navigating to cell ${cellNum} at position (${cellData.x}, ${cellData.y})`);
    console.log(` Cell bounds:`, cellData.bounds);

    // Get image dimensions for coordinate transformation
    const config = window.config ? window.config() : {};
    const imageDimensions = {
        width: config.imageWidth,
        height: config.imageHeight,
        tileSize: 256
    };

    console.log(` Image dimensions: ${config.imageWidth}x${config.imageHeight}`);

    // CRITICAL: Transform coordinates from original image space to tile coordinate space
    const [transformedX, transformedY] = transformToTileCoordinates(cellData.x, cellData.y, imageDimensions);

    console.log(` Coordinate transformation:`);
    console.log(`   Original: (${cellData.x}, ${cellData.y})`);
    console.log(`   Transformed: (${transformedX}, ${transformedY})`);

    // Calculate plane number from Z coordinate
    const [xVoxelSize, yVoxelSize, zVoxelSize] = config.voxelSize; // [0.28, 0.28, 0.7]
    const planeNumber = Math.floor(cellData.z * xVoxelSize / zVoxelSize);

    console.log(` Cell Z coordinate: ${cellData.z}`);
    console.log(` Voxel sizes: x=${xVoxelSize}, y=${yVoxelSize}, z=${zVoxelSize}`);
    console.log(` Calculation: ${cellData.z} * ${xVoxelSize} / ${zVoxelSize} = ${cellData.z * xVoxelSize / zVoxelSize}`);
    console.log(` Calculated plane number: ${planeNumber} (valid range: 0-${config.totalPlanes - 1})`);

    // Switch to the calculated plane
    if (window.updatePlane && typeof window.updatePlane === 'function') {
        window.updatePlane(planeNumber);
        console.log(` Switched to plane ${planeNumber}`);
    } else {
        console.warn(' Could not switch plane - updatePlane function not available');
    }

    // CRITICAL: Use high zoom for close-up view of the cell
    const targetZoom = 8; // Maximum zoom for detailed cell view

    // Get current view state from deck.gl instance
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) {
        throw new Error('Deck.GL instance not available');
    }

    // Temporarily disable the controller, do the navigation, then re-enable it with original settings
    console.log(' Navigating to cell at transformed coordinates:', transformedX, transformedY);

    // Step 1: Save original controller configuration and disable controller during transition
    const originalController = deckInstance.props.controller;
    console.log(' Saved original controller config:', originalController);

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
            controller: originalController, // Restore original controller with maxZoom: 8, etc.
            viewState: undefined // Let controller take over
        });
        console.log(' Controller re-enabled with original config (maxZoom: 8)');
    }, 1600);

    console.log(` Started navigation to: (${transformedX}, ${transformedY}) at zoom ${targetZoom}`);

    return cellData;
}

/**
 * Setup cell lookup UI event handlers
 */
function setupCellLookupUI() {
    const modal = document.getElementById('cellSearchModal');
    const input = document.getElementById('cellSearchInput');
    const goBtn = document.getElementById('cellSearchGo');
    const cancelBtn = document.getElementById('cellSearchCancel');
    const status = document.getElementById('cellSearchStatus');

    // Open modal when Ctrl+F is pressed
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault(); // Prevent browser's default find dialog
            modal.style.display = 'flex';
            input.focus();
            input.select();
            status.textContent = '';
            status.className = 'cell-search-status';
            console.log(' Cell lookup opened with Ctrl+F');
        }
    });

    // Close modal when cancel is clicked or Escape is pressed
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    // Close modal when Escape key is pressed
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // Close modal when clicking outside dialog
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Handle Enter key in input
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performCellSearch();
        }
    });

    // Handle Go button click
    goBtn.addEventListener('click', performCellSearch);

    // Search function
    async function performCellSearch() {
        const cellId = input.value.trim();

        if (!cellId) {
            showStatus('Please enter a cell ID', 'error');
            return;
        }

        try {
            showStatus('Searching for cell...', '');
            goBtn.disabled = true;

            const cellData = await searchAndNavigateToCell(cellId);

            showStatus(`Found cell ${cellId}! Navigating...`, 'success');

            // Close modal after short delay
            setTimeout(() => {
                modal.style.display = 'none';
                goBtn.disabled = false;
            }, 1500);

        } catch (error) {
            showStatus(error.message, 'error');
            goBtn.disabled = false;
        }
    }

    // Show status message
    function showStatus(message, type) {
        status.textContent = message;
        status.className = `cell-search-status ${type}`;
    }

    console.log(' Cell lookup UI initialized - Press Ctrl+F to search for cells');
}

// Export functions for use in main application
window.cellLookup = {
    initialize: initializeCellLookup,
    search: searchAndNavigateToCell,
    setupUI: setupCellLookupUI
};
