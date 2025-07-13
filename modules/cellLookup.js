/**
 * Cell Lookup Module
 * Provides cell search functionality with smooth camera transitions
 */

/**
 * Transform coordinates from original image space to tile coordinate space
 * (copied from utils/coordinateTransform.js)
 */
function transformToTileCoordinates(x, y, imageDimensions) {
    const {width, height, tileSize} = imageDimensions;
    const maxDimension = Math.max(width, height);
    
    // Adjustment factors to handle aspect ratio
    const xAdjustment = width / maxDimension;
    const yAdjustment = height / maxDimension;
    
    return [
        x * (tileSize / width) * xAdjustment,
        y * (tileSize / height) * yAdjustment
    ];
}

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

    console.log('🔍 Initializing cell lookup system...');
    
    try {
        // Load cell data from cellData.tsv
        await loadCellData();
        isLookupInitialized = true;
        console.log('✅ Cell lookup initialized with', cellLookupData.size, 'cells');
    } catch (error) {
        console.error('❌ Failed to initialize cell lookup:', error);
        throw error;
    }
}

/**
 * Load and parse cell data from TSV file
 */
async function loadCellData() {
    const response = await fetch('data/newSpots_newSegmentation/cellData.tsv');
    if (!response.ok) {
        throw new Error(`Failed to load cell data: ${response.status}`);
    }

    const tsvText = await response.text();
    const lines = tsvText.trim().split('\n');
    const headers = lines[0].split('\t');

    // Find column indices
    const columnIndices = {
        Cell_Num: headers.indexOf('Cell_Num'),
        X: headers.indexOf('X'),
        Y: headers.indexOf('Y'),
        Z: headers.indexOf('Z'),
        gaussian_contour: headers.indexOf('gaussian_contour')
    };

    // Validate required columns
    if (columnIndices.Cell_Num === -1 || columnIndices.X === -1 || columnIndices.Y === -1) {
        throw new Error('Required columns (Cell_Num, X, Y) not found in cellData.tsv');
    }

    console.log('📊 Processing', lines.length - 1, 'cell records...');

    // Process cell data
    for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split('\t');
        
        if (columns.length >= headers.length) {
            const cellNum = parseInt(columns[columnIndices.Cell_Num]);
            const x = parseFloat(columns[columnIndices.X]);
            const y = parseFloat(columns[columnIndices.Y]);
            const z = columnIndices.Z !== -1 ? parseFloat(columns[columnIndices.Z]) : 0;

            // Validate data
            if (!isNaN(cellNum) && !isNaN(x) && !isNaN(y)) {
                let bounds = null;
                
                // Parse gaussian contour if available
                if (columnIndices.gaussian_contour !== -1 && columns[columnIndices.gaussian_contour]) {
                    try {
                        const contourStr = columns[columnIndices.gaussian_contour];
                        // Parse the contour coordinates to get bounds
                        bounds = parseContourBounds(contourStr);
                    } catch (e) {
                        // If contour parsing fails, use point location
                        bounds = { minX: x-50, maxX: x+50, minY: y-50, maxY: y+50 };
                    }
                } else {
                    // Default bounds around cell center
                    bounds = { minX: x-50, maxX: x+50, minY: y-50, maxY: y+50 };
                }

                cellLookupData.set(cellNum, {
                    x: x,
                    y: y,
                    z: z || 0,
                    bounds: bounds
                });
            }
        }
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

    console.log(`🎯 Navigating to cell ${cellNum} at position (${cellData.x}, ${cellData.y})`);
    console.log(`📊 Cell bounds:`, cellData.bounds);

    // Get image dimensions for coordinate transformation
    const config = window.config ? window.config() : {};
    const imageDimensions = {
        width: config.imageWidth,
        height: config.imageHeight,
        tileSize: 256
    };
    
    console.log(`🗺️ Image dimensions: ${config.imageWidth}x${config.imageHeight}`);
    
    // CRITICAL: Transform coordinates from original image space to tile coordinate space
    const [transformedX, transformedY] = transformToTileCoordinates(cellData.x, cellData.y, imageDimensions);
    
    console.log(`🔄 Coordinate transformation:`);
    console.log(`   Original: (${cellData.x}, ${cellData.y})`);
    console.log(`   Transformed: (${transformedX}, ${transformedY})`);
    
    // IGNORE Z coordinate - only navigate using X,Y coordinates
    console.log(`🎯 Navigating to cell using X,Y coordinates only (ignoring Z=${cellData.z})`);
    
    // CRITICAL: Use high zoom for close-up view of the cell
    const targetZoom = 6.5; // High zoom for detailed cell view

    // Get current view state from deck.gl instance
    const deckInstance = window.appState?.deckglInstance;
    if (!deckInstance) {
        throw new Error('Deck.GL instance not available');
    }

    // Temporarily disable the controller, do the navigation, then re-enable it with original settings
    console.log('🎯 Navigating to cell at transformed coordinates:', transformedX, transformedY);
    
    // Step 1: Save original controller configuration and disable controller during transition
    const originalController = deckInstance.props.controller;
    console.log('💾 Saved original controller config:', originalController);
    
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
        console.log('🔓 Controller re-enabled with original config (maxZoom: 8)');
    }, 1600);

    console.log(`📍 Started navigation to: (${transformedX}, ${transformedY}) at zoom ${targetZoom}`);

    return cellData;
}

/**
 * Setup cell lookup UI event handlers
 */
function setupCellLookupUI() {
    const lookupBtn = document.getElementById('cellLookupBtn');
    const modal = document.getElementById('cellSearchModal');
    const input = document.getElementById('cellSearchInput');
    const goBtn = document.getElementById('cellSearchGo');
    const cancelBtn = document.getElementById('cellSearchCancel');
    const status = document.getElementById('cellSearchStatus');

    // Open modal when magnifying glass is clicked
    lookupBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
        input.focus();
        input.select();
        status.textContent = '';
        status.className = 'cell-search-status';
    });

    // Close modal when cancel is clicked
    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
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

    console.log('🔍 Cell lookup UI initialized');
}

// Export functions for use in main application
window.cellLookup = {
    initialize: initializeCellLookup,
    search: searchAndNavigateToCell,
    setupUI: setupCellLookupUI
};