// Import dependencies
import { state } from './stateManager.js';

// === AGGREGATED CLASSES VIEW ===
function openAggregatedClassesView() {
    const startTime = performance.now();
    console.log(`[${startTime.toFixed(2)}ms] START: openAggregatedClassesView`);
    
    // Check if cell data is loaded
    if (!state.cellDataMap || state.cellDataMap.size === 0) {
        alert('Cell data is not loaded yet. Please wait for the data to load and try again.');
        return;
    }
    
    const windowOpenTime = performance.now();
    // Create new window for aggregated view
    const aggregatedWindow = window.open('', 'aggregatedClassesView', 'width=1200,height=800');
    console.log(`[${performance.now().toFixed(2)}ms] Window opened (took ${(performance.now() - windowOpenTime).toFixed(2)}ms)`);
    
    const configTime = performance.now();
    // Calculate mid-plane for background
    const config = window.config();
    const maxPlane = config.totalPlanes - 1;
    const midPlane = Math.floor(maxPlane / 2);
    console.log(`[${performance.now().toFixed(2)}ms] Config processed (took ${(performance.now() - configTime).toFixed(2)}ms)`);
    
    // Start with empty cell data - user will select classes in the new window
    const selectedClasses = [];
    
    const htmlGenTime = performance.now();
    // Generate and write the HTML content
    const windowContent = generateAggregatedViewHTML(selectedClasses, midPlane);
    console.log(`[${performance.now().toFixed(2)}ms] HTML generated (took ${(performance.now() - htmlGenTime).toFixed(2)}ms)`);
    
    const writeTime = performance.now();
    aggregatedWindow.document.write(windowContent);
    aggregatedWindow.document.close();
    console.log(`[${performance.now().toFixed(2)}ms] HTML written (took ${(performance.now() - writeTime).toFixed(2)}ms)`);
    
    const commTime = performance.now();
    // Set up communication with the new window
    setupAggregatedViewCommunication(aggregatedWindow, selectedClasses, midPlane);
    console.log(`[${performance.now().toFixed(2)}ms] Communication setup (took ${(performance.now() - commTime).toFixed(2)}ms)`);
    
    const totalTime = performance.now() - startTime;
    console.log(`[${performance.now().toFixed(2)}ms] TOTAL openAggregatedClassesView TIME: ${totalTime.toFixed(2)}ms`);
}

function generateAggregatedViewHTML(selectedClasses, midPlane) {
    const classNames = selectedClasses.join(', ');
    const config = window.config();
    const maxPlane = config.totalPlanes - 1;
    
    return `<!DOCTYPE html>
<html>
<head>
    <title>Aggregated Cell Classes - ${classNames}</title>
    <link rel="stylesheet" href="styles.css">
    <script src="config.js"></script>
    <script src="advanced-config.js"></script>
    <style>
        body { margin: 0; padding: 0; background: #000000; color: white; font-family: Arial, sans-serif; }
        #aggregated-map { width: 100vw; height: 100vh; }
        .aggregated-controls {
            position: absolute;
            top: 15px;
            left: 15px;
            background: rgba(0, 0, 0, 0.7);
            padding: 12px 16px;
            border-radius: 4px;
            backdrop-filter: blur(10px);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 12px;
            font-size: 13px;
            color: white;
        }
        .control-item {
            display: flex;
            align-items: center;
            gap: 6px;
            white-space: nowrap;
        }
        .control-item label {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.9);
        }
        .control-item input[type="range"] {
            width: 60px;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            appearance: none;
            outline: none;
        }
        .control-item input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 12px;
            height: 12px;
            background: #007bff;
            border-radius: 50%;
            cursor: pointer;
        }
        .control-item .value-display {
            font-size: 10px;
            color: rgba(255, 255, 255, 0.8);
            min-width: 24px;
            text-align: center;
            font-family: monospace;
        }
        .class-selection-widget {
            position: absolute;
            top: 15px;
            right: 15px;
            background: rgba(0, 0, 0, 0.8);
            padding: 15px;
            border-radius: 8px;
            z-index: 1000;
            max-width: 300px;
            max-height: 400px;
            overflow-y: auto;
            color: white;
        }
        .class-selection-widget h3 {
            margin: 0 0 10px 0;
            color: #28a745;
            font-size: 14px;
        }
        .class-item {
            display: flex; align-items: center; gap: 8px; margin-bottom: 8px;
            padding: 4px; border-radius: 4px;
        }
        .class-item:hover {
            background: rgba(255, 255, 255, 0.1);
        }
        .color-swatch {
            width: 16px; height: 16px; border-radius: 3px; border: 1px solid #ccc;
        }
        .class-name {
            flex: 1; font-size: 12px;
        }
        .class-opacity-slider {
            width: 60px;
            height: 4px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 2px;
            appearance: none;
            outline: none;
        }
        .class-opacity-slider::-webkit-slider-thumb {
            appearance: none;
            width: 12px;
            height: 12px;
            background: #007bff;
            border-radius: 50%;
            cursor: pointer;
        }
    </style>
</head>
<body>
    <div id="aggregated-map"></div>
    <!-- Global Controls Panel (Top-Left) -->
    <div class="aggregated-controls">
        <div class="control-item">
            <label for="cellOpacity">Opacity:</label>
            <input type="range" id="cellOpacity" min="0" max="1" step="0.05" value="0.6">
            <span id="cellOpacityValue" class="value-display">0.6</span>
        </div>
        <div class="control-item">
            <label for="cellSize">Size:</label>
            <input type="range" id="cellSize" min="0" max="5" step="0.1" value="1.0">
            <span id="cellSizeValue" class="value-display">1.0</span>
        </div>
    </div>

    <!-- Cell Class Selection Widget (Top-Right) -->
    <div class="class-selection-widget">
        <h3>🔬 Cell Classes</h3>
        <div id="class-list">
            <!-- This will be populated dynamically with JavaScript -->
        </div>
    </div>
    <script>
        // Get deck.gl from the opener window to avoid CORS issues
        const deck = window.opener.deck;
        const {DeckGL, OrthographicView, COORDINATE_SYSTEM} = deck;
        
        // Transform coordinates using the exact same function as gene spots for perfect alignment
        const transformCoords = (x, y, imageDims) => {
            const {width, height, tileSize} = imageDims;
            const maxDimension = Math.max(width, height);
            const xAdjustment = width / maxDimension;
            const yAdjustment = height / maxDimension;
            return [
                x * (tileSize / width) * xAdjustment,
                y * (tileSize / height) * yAdjustment
            ];
        };
        
        // Global state for the aggregated view following user specification
        const aggregatedViewState = {
            cellSize: 1.0,                    // Global cell size
            cellOpacity: 1.0,                 // Global cell opacity
            selectedClasses: new Set(),       // Which cell types are visible
            classOpacityMap: new Map(),       // Individual opacity per cell type
            aggregatedCells: [],              // Processed cell data
            deckInstance: null,               // deck.gl instance
            currentPlane: ${midPlane},        // Current plane for background
            cellClassColors: new Map()        // Cell class color mapping
        };
        
        function initializeAggregatedDeck() {
            const startTime = performance.now();
            console.log('[' + startTime.toFixed(2) + 'ms] START: Initializing aggregated deck...');
            
            // Wait for the container to be available
            const containerCheckTime = performance.now();
            const container = document.getElementById('aggregated-map');
            if (!container) {
                console.error('[' + containerCheckTime.toFixed(2) + 'ms] Container element not found, retrying...');
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            console.log('[' + performance.now().toFixed(2) + 'ms] Container found:', container);
            
            // Check if deck is available
            const deckCheckTime = performance.now();
            if (typeof deck === 'undefined') {
                console.error('[' + deckCheckTime.toFixed(2) + 'ms] deck.gl not available, retrying...');
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            console.log('[' + performance.now().toFixed(2) + 'ms] deck.gl available');
            
            const configCheckTime = performance.now();
            const config = window.config();
            if (!config) {
                console.error('[' + configCheckTime.toFixed(2) + 'ms] Config not available, retrying...');
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            console.log('[' + performance.now().toFixed(2) + 'ms] Config loaded');
            
            try {
                const deckCreateTime = performance.now();
                console.log('[' + deckCreateTime.toFixed(2) + 'ms] Creating DeckGL instance...');
                aggregatedViewState.deckInstance = new DeckGL({
                    container: container,
                    views: [new OrthographicView({id: 'ortho'})],
                    initialViewState: {
                        target: [256 * 0.5, 256 * 0.5 * config.imageHeight / config.imageWidth, 0],
                        zoom: 2,
                        minZoom: 0,
                        maxZoom: 8
                    },
                    controller: {
                        minZoom: 0,
                        maxZoom: 8,
                        scrollZoom: true,
                        doubleClickZoom: true,
                        touchZoom: true,
                        keyboard: false
                    },
                    getTooltip: ({object}) => {
                        if (object && object.cellNum) {
                            return {
                                html: '<div style="background: rgba(0,0,0,0.8); color: white; padding: 8px; border-radius: 4px;">' +
                                      '<strong>Cell ' + object.cellNum + '</strong><br/>' +
                                      'Type: ' + object.className + '<br/>' +
                                      'Confidence: ' + (object.probability * 100).toFixed(1) + '%<br/>' +
                                      'Plane: ' + object.originalZ +
                                      '</div>'
                            };
                        }
                    },
                    layers: []
                });
                
                const deckCreatedTime = performance.now();
                console.log('[' + deckCreatedTime.toFixed(2) + 'ms] DeckGL instance created successfully (took ' + (deckCreatedTime - deckCreateTime).toFixed(2) + 'ms)');
                
                const initTime = performance.now();
                // Initialize following user specification pattern
                initializeClassSelection();
                createAggregatedCellData();
                populateClassList();
                setupGlobalControls();
                updateCellsDisplay(); // Initial visualization
                console.log('[' + performance.now().toFixed(2) + 'ms] Full initialization complete (took ' + (performance.now() - initTime).toFixed(2) + 'ms)');
                
                const totalTime = performance.now() - startTime;
                console.log('[' + performance.now().toFixed(2) + 'ms] TOTAL INITIALIZATION TIME: ' + totalTime.toFixed(2) + 'ms');
                
            } catch (error) {
                console.error('[' + performance.now().toFixed(2) + 'ms] Failed to create DeckGL instance:', error);
                setTimeout(initializeAggregatedDeck, 500);
            }
        }
        
        // Initialize with EMPTY selection - user must actively check boxes to see cells
        function initializeClassSelection() {
            // selectedClasses starts EMPTY - no cells visible initially
            aggregatedViewState.selectedClasses = new Set();  // Empty set
            
            // classOpacityMap starts empty too - will be populated when classes are selected
            aggregatedViewState.classOpacityMap = new Map();
        }

        function createAggregatedCellData() {
            const parentState = window.opener.appState;
            if (parentState && parentState.cellDataMap && parentState.cellClassColors) {
                // Copy cell class colors
                aggregatedViewState.cellClassColors = new Map(parentState.cellClassColors);
                
                // Create aggregated cell data from all cells
                aggregatedViewState.aggregatedCells = [];
                
                parentState.cellDataMap.forEach((cell, cellId) => {
                    if (cell && cell.position && cell.position.x !== undefined && cell.position.y !== undefined) {
                        const primaryClassName = cell.primaryClass || 'Unknown';
                        const color = aggregatedViewState.cellClassColors.get(primaryClassName) || [128, 128, 128];
                        
                        aggregatedViewState.aggregatedCells.push({
                            cellNum: cell.cellNum || cellId,
                            x: cell.position.x,
                            y: cell.position.y,
                            originalZ: cell.position.z,
                            className: primaryClassName,
                            probability: cell.primaryProb || 0,
                            color: color
                        });
                    }
                });
                
                console.log('Loaded ' + aggregatedViewState.aggregatedCells.length + ' cells for aggregated view');
            }
        }
        
        // Set up global control event handlers
        function setupGlobalControls() {
            // Global opacity control
            const opacitySlider = document.getElementById('cellOpacity');
            const opacityValue = document.getElementById('cellOpacityValue');

            if (opacitySlider && opacityValue) {
                // Initialize slider to match state value
                opacitySlider.value = aggregatedViewState.cellOpacity;
                opacityValue.textContent = aggregatedViewState.cellOpacity.toFixed(2);
                
                opacitySlider.addEventListener('input', (e) => {
                    const opacity = parseFloat(e.target.value);
                    opacityValue.textContent = opacity.toFixed(2);
                    aggregatedViewState.cellOpacity = opacity;
                    updateCellsDisplay(); // Refresh the visualization
                });
            }

            // Global size control
            const sizeSlider = document.getElementById('cellSize');
            const sizeValue = document.getElementById('cellSizeValue');

            if (sizeSlider && sizeValue) {
                // Initialize slider to match state value
                sizeSlider.value = aggregatedViewState.cellSize;
                sizeValue.textContent = aggregatedViewState.cellSize.toFixed(1);
                
                sizeSlider.addEventListener('input', (e) => {
                    const size = parseFloat(e.target.value);
                    sizeValue.textContent = size.toFixed(1);
                    aggregatedViewState.cellSize = size;
                    updateCellsDisplay(); // Refresh the visualization
                });
            }
        }
        
        // Create dynamic per-class controls
        function populateClassList() {
            const classList = document.getElementById('class-list');
            classList.innerHTML = ''; // Clear existing content

            // Get all unique cell classes from the data
            const allClasses = new Set();
            aggregatedViewState.aggregatedCells.forEach(cell => {
                allClasses.add(cell.className);
            });

            // Create controls for each cell class - SORTED ALPHABETICALLY
            Array.from(allClasses).sort().forEach(className => {
                const classItem = document.createElement('div');
                classItem.className = 'class-item';

                // Checkbox for show/hide - starts UNCHECKED
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = false; // Start UNCHECKED - no cells visible initially
                checkbox.addEventListener('change', (e) => {
                    console.log('Checkbox changed for class:', className, 'checked:', e.target.checked);
                    if (e.target.checked) {
                        // User CHECKED the box - add this class and initialize its opacity
                        aggregatedViewState.selectedClasses.add(className);
                        // Initialize opacity for this class when first selected
                        if (!aggregatedViewState.classOpacityMap.has(className)) {
                            aggregatedViewState.classOpacityMap.set(className, 1.0);
                        }
                        console.log('Added class to selectedClasses:', className);
                        console.log('selectedClasses now:', Array.from(aggregatedViewState.selectedClasses));
                    } else {
                        // User UNCHECKED the box - remove this class
                        aggregatedViewState.selectedClasses.delete(className);
                        console.log('Removed class from selectedClasses:', className);
                    }
                    console.log('Calling updateCellsDisplay...');
                    updateCellsDisplay(); // Refresh the visualization
                });

                // Color swatch
                const colorSwatch = document.createElement('div');
                colorSwatch.className = 'color-swatch';
                const [r, g, b] = aggregatedViewState.cellClassColors.get(className) || [128, 128, 128];
                colorSwatch.style.backgroundColor = 'rgb(' + r + ', ' + g + ', ' + b + ')';

                // Class name label
                const nameLabel = document.createElement('span');
                nameLabel.className = 'class-name';
                nameLabel.textContent = className;

                // Individual opacity slider
                const opacitySlider = document.createElement('input');
                opacitySlider.type = 'range';
                opacitySlider.min = '0';
                opacitySlider.max = '1';
                opacitySlider.step = '0.1';
                opacitySlider.value = '1.0';
                opacitySlider.className = 'class-opacity-slider';

                // Opacity value display
                const opacityValue = document.createElement('span');
                opacityValue.textContent = '1.0';
                opacityValue.style.fontSize = '10px';
                opacityValue.style.minWidth = '25px';

                // Opacity slider event handler
                opacitySlider.addEventListener('input', (e) => {
                    const opacity = parseFloat(e.target.value);
                    opacityValue.textContent = opacity.toFixed(1);
                    aggregatedViewState.classOpacityMap.set(className, opacity);
                    updateCellsDisplay(); // Refresh the visualization
                });

                // Assemble the class item
                classItem.appendChild(checkbox);
                classItem.appendChild(colorSwatch);
                classItem.appendChild(nameLabel);
                classItem.appendChild(opacitySlider);
                classItem.appendChild(opacityValue);

                classList.appendChild(classItem);
            });
        }
        
        // Create the ScatterplotLayer update function
        function updateCellsDisplay() {
            console.log('updateCellsDisplay called');
            console.log('deckInstance exists:', !!aggregatedViewState.deckInstance);
            console.log('selectedClasses:', Array.from(aggregatedViewState.selectedClasses));
            console.log('total aggregatedCells:', aggregatedViewState.aggregatedCells.length);
            
            if (!aggregatedViewState.deckInstance) {
                console.log('No deckInstance, returning early');
                return;
            }

            const layers = [];
            const cfg = window.config();
            
            // Add background tile layer
            const backgroundLayer = new deck.TileLayer({
                id: 'background-tiles',
                tileSize: 256,
                minZoom: 0,
                maxZoom: 8,
                extent: [0, 0, 256, 256],
                coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,
                getTileData: async ({index}) => {
                    const {x, y, z} = index;
                    const tileUrl = cfg.backgroundTiles
                        .replace('{plane}', aggregatedViewState.currentPlane.toString().padStart(2, '0'))
                        .replace('{z}', z)
                        .replace('{y}', y)
                        .replace('{x}', x);
                    return tileUrl;
                },
                renderSubLayers: (props) => {
                    if (!props.data) return null;
                    const {tile} = props;
                    const {left, bottom, right, top} = tile.bbox;
                    return new deck.BitmapLayer({
                        id: props.id + '-bitmap',
                        image: props.data,
                        bounds: [left, bottom, right, top]
                    });
                }
            });
            layers.push(backgroundLayer);

            // Filter cells based on selected classes
            let visibleCells = [];
            if (aggregatedViewState.selectedClasses.size === 0) {
                // If nothing selected, show empty (initial state)
                visibleCells = [];
                console.log('No classes selected, showing empty');
            } else {
                // Filter to show only selected classes
                visibleCells = aggregatedViewState.aggregatedCells.filter(cell =>
                    aggregatedViewState.selectedClasses.has(cell.className)
                );
                console.log('Filtering completed. visibleCells:', visibleCells.length);
                if (visibleCells.length > 0) {
                    console.log('Sample visible cell:', visibleCells[0]);
                } else {
                    console.log('No cells match selected classes!');
                    console.log('Available cell classes in data:', [...new Set(aggregatedViewState.aggregatedCells.map(c => c.className))]);
                }
            }

            // Create the ScatterplotLayer with current settings
            if (visibleCells.length > 0) {
                console.log('Creating ScatterplotLayer with', visibleCells.length, 'cells');
                
                // Debug: Check first cell properties
                const firstCell = visibleCells[0];
                const config = window.config();
                const imageDims = {
                    width: config.imageWidth,
                    height: config.imageHeight,
                    tileSize: 256
                };
                const [transformedX, transformedY] = transformCoords(firstCell.x, firstCell.y, imageDims);
                
                console.log('First cell original position:', [firstCell.x, firstCell.y]);
                console.log('First cell TRANSFORMED position:', [transformedX, transformedY]);
                console.log('Image dimensions:', imageDims.width, 'x', imageDims.height);
                console.log('First cell color:', firstCell.color);
                console.log('Current cell size:', aggregatedViewState.cellSize);
                console.log('Current cell opacity:', aggregatedViewState.cellOpacity);
                
                const cellLayer = new deck.ScatterplotLayer({
                    id: 'aggregated-cells',
                    data: visibleCells,

                    // Position from cell coordinates - transform to tile coordinates
                    getPosition: d => {
                        const config = window.config();
                        const imageDims = {
                            width: config.imageWidth,
                            height: config.imageHeight,
                            tileSize: 256
                        };
                        return transformCoords(d.x, d.y, imageDims);
                    },

                    // Color with combined opacity (global + per-class)
                    getFillColor: d => {
                        const [r, g, b] = d.color;
                        const classOpacity = aggregatedViewState.classOpacityMap.has(d.className) ? aggregatedViewState.classOpacityMap.get(d.className) : 1.0;
                        const finalOpacity = aggregatedViewState.cellOpacity * classOpacity;
                        const color = [r, g, b, Math.round(finalOpacity * 255)];
                        return color;
                    },

                    // Size from global setting
                    getRadius: aggregatedViewState.cellSize,

                    // Visual properties
                    filled: true,
                    stroked: false,
                    pickable: true,
                    coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,

                    // Performance optimization - tell deck.gl when to recalculate
                    updateTriggers: {
                        getFillColor: [
                            aggregatedViewState.cellOpacity,
                            Array.from(aggregatedViewState.classOpacityMap.entries())
                        ],
                        getRadius: [aggregatedViewState.cellSize]
                    }
                });

                layers.push(cellLayer);
            }

            // Update the deck.gl instance
            console.log('Setting layers on deck instance. Total layers:', layers.length);
            layers.forEach((layer, i) => console.log('Layer', i, ':', layer.id));
            aggregatedViewState.deckInstance.setProps({
                layers: layers
            });
            console.log('Deck layers updated');
        }
        
        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeAggregatedDeck);
        } else {
            // DOM is already loaded
            setTimeout(initializeAggregatedDeck, 100);
        }
    </script>
</body>
</html>`;
}

function setupAggregatedViewCommunication(aggregatedWindow, selectedClasses, midPlane) {
    // Skip sending data for initial empty view - data will be sent when classes are selected
    // aggregatedWindow.postMessage({
    //     type: 'initializeAggregatedView', 
    //     data: {
    //         selectedClasses: selectedClasses,
    //         midPlane: midPlane,
    //         cellData: getAggregatedCellData(selectedClasses),
    //         geneData: state.geneDataMap,
    //         cellClassColors: state.cellClassColors
    //     }
    // }, '*');
    
    // Listen for messages from the aggregated view
    const messageHandler = (event) => {
        if (event.source !== aggregatedWindow) return;
        
        if (event.data.type === 'requestCellData') {
            const cellData = getAggregatedCellData(event.data.selectedClasses);
            aggregatedWindow.postMessage({
                type: 'cellDataResponse',
                data: cellData
            }, '*');
        }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Clean up when window is closed
    const checkClosed = setInterval(() => {
        if (aggregatedWindow.closed) {
            window.removeEventListener('message', messageHandler);
            clearInterval(checkClosed);
        }
    }, 1000);
}

function getAggregatedCellData(selectedClasses) {
    if (!selectedClasses || selectedClasses.length === 0) {
        return [];
    }
    
    const aggregatedData = [];
    
    // Iterate through all cells and find those matching selected classes
    state.cellDataMap.forEach((cell, cellNum) => {
        // Check if this cell's primary class is in the selected classes
        if (cell.ClassName && cell.ClassName.length > 0) {
            const primaryClass = cell.ClassName[0]; // First class is primary
            if (selectedClasses.includes(primaryClass)) {
                aggregatedData.push({
                    Cell_Num: cellNum,
                    X: cell.X,
                    Y: cell.Y,
                    Z: cell.Z,
                    ClassName: cell.ClassName,
                    Prob: cell.Prob,
                    gaussian_contour: cell.gaussian_contour,
                    sphere_scale: cell.sphere_scale,
                    sphere_rotation: cell.sphere_rotation
                });
            }
        }
    });
    
    return aggregatedData;
}

// Expose functions globally for event handlers
window.openAggregatedClassesView = openAggregatedClassesView;
window.getAggregatedCellData = getAggregatedCellData;

export {
    openAggregatedClassesView,
    setupAggregatedViewCommunication,
    getAggregatedCellData
};