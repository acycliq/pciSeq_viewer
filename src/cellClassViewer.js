// Import dependencies
import { state } from './stateManager.js';

// === CELL CLASS VIEWER ===
function openCellClassViewer() {
    if (!state.cellDataMap || state.cellDataMap.size === 0) {
        alert('Cell data is not loaded yet. Please wait for the data to load and try again.');
        return;
    }
    
    const config = window.config();
    const midPlane = Math.floor((config.totalPlanes - 1) / 2);
    const selectedClasses = [];
    
    // Open the separate HTML file with configuration parameters
    const url = `cellClassViewer.html?midPlane=${midPlane}`;
    const cellClassViewerWindow = window.open(url, 'cellClassViewer', 'width=1200,height=800');
    
    setupCellClassViewerCommunication(cellClassViewerWindow, selectedClasses, midPlane);
}

function setupCellClassViewerCommunication(cellClassViewerWindow, selectedClasses, midPlane) {
    // Listen for messages from the cell class viewer
    const messageHandler = (event) => {
        if (event.source !== cellClassViewerWindow) return;
        
        if (event.data.type === 'requestCellData') {
            const cellData = getCellClassViewerData(event.data.selectedClasses);
            cellClassViewerWindow.postMessage({
                type: 'cellDataResponse',
                data: cellData
            }, '*');
        }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Clean up when window is closed
    const checkClosed = setInterval(() => {
        if (cellClassViewerWindow.closed) {
            window.removeEventListener('message', messageHandler);
            clearInterval(checkClosed);
        }
    }, 1000);
}

function getCellClassViewerData(selectedClasses) {
    if (!selectedClasses || selectedClasses.length === 0) {
        return [];
    }
    
    const cellClassData = [];
    
    // Iterate through all cells and find those matching selected classes
    state.cellDataMap.forEach((cell, cellNum) => {
        // Check if this cell's primary class is in the selected classes
        if (cell.ClassName && cell.ClassName.length > 0) {
            const primaryClass = cell.ClassName[0]; // First class is primary
            if (selectedClasses.includes(primaryClass)) {
                cellClassData.push({
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
    
    return cellClassData;
}

// Expose functions globally for event handlers
window.openCellClassViewer = openCellClassViewer;
window.getCellClassViewerData = getCellClassViewerData;

export {
    openCellClassViewer,
    setupCellClassViewerCommunication,
    getCellClassViewerData
};