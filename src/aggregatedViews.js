// Import dependencies
import { state } from './stateManager.js';

// === AGGREGATED CLASSES VIEW ===
function openAggregatedClassesView() {
    if (!state.cellDataMap || state.cellDataMap.size === 0) {
        alert('Cell data is not loaded yet. Please wait for the data to load and try again.');
        return;
    }
    
    const aggregatedWindow = window.open('', 'aggregatedClassesView', 'width=1200,height=800');
    const config = window.config();
    const midPlane = Math.floor((config.totalPlanes - 1) / 2);
    const selectedClasses = [];
    
    const windowContent = generateAggregatedViewHTML(selectedClasses, midPlane);
    aggregatedWindow.document.write(windowContent);
    aggregatedWindow.document.close();
    
    setupAggregatedViewCommunication(aggregatedWindow, selectedClasses, midPlane);
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
        
        // Simple variables (like original implementation)
        let cellSize = 1.0;
        let cellOpacity = 1.0;
        let selectedClasses = new Set();
        let classOpacityMap = new Map();
        let aggregatedCells = [];
        let aggregatedDeck = null;
        let currentPlane = ${midPlane};
        let cellClassColors = new Map();
        
        function initializeAggregatedDeck() {
            const container = document.getElementById('aggregated-map');
            if (!container) {
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            if (typeof deck === 'undefined') {
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            const config = window.config();
            if (!config) {
                setTimeout(initializeAggregatedDeck, 100);
                return;
            }
            
            try {
                aggregatedDeck = new DeckGL({
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
                
                // Initialize simple state
                initializeClassSelection();
                createAggregatedCellData();
                populateClassList();
                setupGlobalControls();
                updateCellsDisplay();
                
            } catch (error) {
                console.error('Failed to create DeckGL instance:', error);
                setTimeout(initializeAggregatedDeck, 500);
            }
        }
        
        function initializeClassSelection() {
            selectedClasses = new Set();
            classOpacityMap = new Map();
        }

        function createAggregatedCellData() {
            const parentState = window.opener.appState;
            if (parentState && parentState.cellDataMap && parentState.cellClassColors) {
                cellClassColors = new Map(parentState.cellClassColors);
                aggregatedCells = [];
                
                parentState.cellDataMap.forEach((cell, cellId) => {
                    if (cell && cell.position && cell.position.x !== undefined && cell.position.y !== undefined) {
                        const primaryClassName = cell.primaryClass || 'Unknown';
                        const color = cellClassColors.get(primaryClassName) || [128, 128, 128];
                        
                        aggregatedCells.push({
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
                
                console.log('Loaded ' + aggregatedCells.length + ' cells for aggregated view');
            }
        }
        
        function setupGlobalControls() {
            const opacitySlider = document.getElementById('cellOpacity');
            const opacityValue = document.getElementById('cellOpacityValue');

            if (opacitySlider && opacityValue) {
                opacitySlider.value = cellOpacity;
                opacityValue.textContent = cellOpacity.toFixed(2);
                
                opacitySlider.addEventListener('input', (e) => {
                    cellOpacity = parseFloat(e.target.value);
                    opacityValue.textContent = cellOpacity.toFixed(2);
                    updateCellsDisplay();
                });
            }

            const sizeSlider = document.getElementById('cellSize');
            const sizeValue = document.getElementById('cellSizeValue');

            if (sizeSlider && sizeValue) {
                sizeSlider.value = cellSize;
                sizeValue.textContent = cellSize.toFixed(1);
                
                sizeSlider.addEventListener('input', (e) => {
                    cellSize = parseFloat(e.target.value);
                    sizeValue.textContent = cellSize.toFixed(1);
                    updateCellsDisplay();
                });
            }
        }
        
        // Create dynamic per-class controls
        function populateClassList() {
            const classList = document.getElementById('class-list');
            classList.innerHTML = ''; // Clear existing content

            // Get all unique cell classes from the data
            const allClasses = new Set();
            aggregatedCells.forEach(cell => {
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
                    if (e.target.checked) {
                        selectedClasses.add(className);
                        if (!classOpacityMap.has(className)) {
                            classOpacityMap.set(className, 1.0);
                        }
                    } else {
                        selectedClasses.delete(className);
                    }
                    updateCellsDisplay();
                });

                // Color swatch
                const colorSwatch = document.createElement('div');
                colorSwatch.className = 'color-swatch';
                const [r, g, b] = cellClassColors.get(className) || [128, 128, 128];
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
                    classOpacityMap.set(className, opacity);
                    updateCellsDisplay();
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
        
        function updateCellsDisplay() {
            if (!aggregatedDeck) {
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
                        .replace('{plane}', currentPlane.toString().padStart(2, '0'))
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
            if (selectedClasses.size === 0) {
                visibleCells = [];
            } else {
                visibleCells = aggregatedCells.filter(cell =>
                    selectedClasses.has(cell.className)
                );
            }

            if (visibleCells.length > 0) {
                
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

                    getFillColor: d => {
                        const [r, g, b] = d.color;
                        const classOpacity = classOpacityMap.has(d.className) ? classOpacityMap.get(d.className) : 1.0;
                        const finalOpacity = cellOpacity * classOpacity;
                        const finalAlpha = Math.round(finalOpacity * 255);
                        return [r, g, b, finalAlpha];
                    },

                    getRadius: cellSize,
                    filled: true,
                    stroked: false,
                    pickable: true,
                    coordinateSystem: deck.COORDINATE_SYSTEM.CARTESIAN,

                    updateTriggers: {
                        getFillColor: [cellOpacity, Array.from(classOpacityMap.entries())],
                        getRadius: [cellSize]
                    }
                });

                layers.push(cellLayer);
            }

            aggregatedDeck.setProps({layers: layers});
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