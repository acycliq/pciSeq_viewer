/**
 * UI Helper Functions Module
 * 
 * This module contains utility functions for managing UI state, tooltips,
 * loading indicators, and polygon alias controls
 */

import { POLYGON_COLOR_PALETTE } from '../config/constants.js';

/**
 * Show loading indicator
 * @param {Object} state - Application state object
 * @param {HTMLElement} loadingElement - Loading indicator DOM element
 */
export function showLoading(state, loadingElement) {
    state.isLoading = true;
    loadingElement.style.display = 'block';
}

/**
 * Hide loading indicator
 * @param {Object} state - Application state object
 * @param {HTMLElement} loadingElement - Loading indicator DOM element
 */
export function hideLoading(state, loadingElement) {
    state.isLoading = false;
    loadingElement.style.display = 'none';
}

/**
 * Show tooltip with polygon or gene information
 * Displays contextual information when hovering over interactive elements
 * @param {Object} info - Hover info from deck.gl
 * @param {HTMLElement} tooltipElement - Tooltip DOM element
 */
export function showTooltip(info, tooltipElement) {
    if (info.picked && info.object) {
        let content = '';
        
        // Check if this is a polygon layer
        if (info.layer?.id?.startsWith('polygons-')) {
            // Polygon tooltip - show enhanced cell information
            if (info.object.properties) {
                const cellLabel = info.object.properties.label;
                let cellClass = info.object.properties.cellClass || 'Unknown';
                if (Array.isArray(cellClass)) cellClass = cellClass[0] || 'Unknown';
                // If class came as a stringified list, parse and pick first
                if (typeof cellClass === 'string' && cellClass.trim().startsWith('[')) {
                    try {
                        const parsed = JSON.parse(cellClass.replace(/'/g, '"'));
                        if (Array.isArray(parsed) && parsed.length > 0) cellClass = parsed[0];
                    } catch {}
                }
                cellClass = String(cellClass).trim();
                const planeId = info.object.properties.plane_id;
                
                // Get cell coordinates and probability from cellData
                let cellCoords = '';
                let classProb = '';
                let colorHex = '';
                if (window.debugData && window.debugData.getCell) {
                    const cellData = window.debugData.getCell(parseInt(cellLabel));
                    if (cellData && cellData.position) {
                        const coords = cellData.position;
                        cellCoords = `<strong>Cell Coords:</strong> (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}, ${coords.z.toFixed(2)})<br>`;
                        
                        // Get cell class probability if available
                        if (cellData.classification && cellData.classification.className && cellData.classification.probability) {
                            const classIndex = cellData.classification.className.indexOf(cellClass);
                            if (classIndex >= 0) {
                                const prob = cellData.classification.probability[classIndex];
                                classProb = `<strong>Class Probability:</strong> ${(prob * 100).toFixed(1)}%<br>`;
                            }
                        }
                    }
                }
                // Color hex (from class color schemes if available)
                try {
                    if (typeof classColorsCodes === 'function') {
                        const scheme = classColorsCodes();
                        const entry = scheme.find(e => e.className === cellClass);
                        if (entry && entry.color) {
                            colorHex = `<strong>Color:</strong> ${entry.color}<br>`;
                        }
                    }
                } catch {}
                
                content =  `<strong>Cell Label:</strong> ${cellLabel}<br>
                            ${cellCoords}
                            <strong>Plane:</strong>${planeId}<br>
                            <strong>Cell Class:</strong> ${cellClass}<br>
                            ${colorHex}
                            ${classProb}`;
            }
        } else if (info.object.gene) {
            // Gene tooltip - show enhanced gene spot information
            const gene = info.object.gene;
            const coords = `(${info.object.x.toFixed(2)}, ${info.object.y.toFixed(2)}, ${info.object.z.toFixed(2)})`;
            const planeId = info.object.plane_id;
            
            // Get spot_id and parent information
            let spotInfo = '';
            if (info.object.spot_id !== undefined) {
                spotInfo = `<strong>Spot ID:</strong> ${info.object.spot_id}<br>`;
            }
            
            // Get color information
            let colorInfo = '';
            if (typeof glyphSettings === 'function') {
                const settings = glyphSettings();
                const geneSetting = settings.find(s => s.gene === gene);
                if (geneSetting && geneSetting.color) {
                    colorInfo = `<strong>Color:</strong> ${geneSetting.color}<br>`;
                }
            }
            
            // Get parent cell information
            let parentInfo = '';
            let label = info.object.neighbour;
            let neighbour;
            label === 0? neighbour = 'Background' : neighbour = label;
            if (neighbour && info.object.prob !== undefined) {
                parentInfo = `<strong>Parent Cell:</strong> ${neighbour}<br>
                             <strong>Parent Probability:</strong> ${(info.object.prob * 100).toFixed(1)}%<br>`;
            }
            
            // Get score and intensity information
            let qualityInfo = '';
            if (info.object.score !== undefined && info.object.score !== null) {
                qualityInfo += `<strong>Score:</strong> ${info.object.score.toFixed(3)}<br>`;
            }
            if (info.object.intensity !== undefined && info.object.intensity !== null) {
                qualityInfo += `<strong>Intensity:</strong> ${info.object.intensity.toFixed(3)}<br>`;
            }
            
            content = `${spotInfo}<strong>Gene:</strong> ${gene}<br>
                      ${colorInfo}<strong>Coords:</strong> ${coords}<br>
                      <strong>Plane:</strong> ${planeId}<br>
                      ${parentInfo}${qualityInfo}`;
        }
        
        if (content) {
            tooltipElement.innerHTML = content;
            tooltipElement.style.display = 'block';
            tooltipElement.style.left = info.x + 20 + 'px';
            tooltipElement.style.top = info.y - 60 + 'px';
        } else {
            tooltipElement.style.display = 'none';
        }
    } else {
        // Hide tooltip when not hovering over anything
        tooltipElement.style.display = 'none';
    }
}

/**
 * Update polygon alias controls in the UI
 * Creates checkboxes and color indicators for each polygon group
 * @param {Set} allPolygonAliases - All discovered polygon aliases
 * @param {Map} polygonAliasVisibility - Visibility state for each alias
 * @param {Map} polygonAliasColors - Color mapping for each alias
 * @param {HTMLElement} controlsContainer - Container element for controls
 * @param {Function} updateLayersCallback - Callback to update layers when visibility changes
 */
export function updatePolygonAliasControls(allPolygonAliases, polygonAliasVisibility, polygonAliasColors, controlsContainer, updateLayersCallback) {
    // Clear existing controls
    controlsContainer.innerHTML = '';

    // Create controls for each alias, sorted alphabetically
    Array.from(allPolygonAliases).sort().forEach(alias => {
        const controlDiv = document.createElement('div');
        controlDiv.className = 'alias-control';

        // Visibility checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `alias-${alias}`;
        checkbox.checked = polygonAliasVisibility.get(alias);
        checkbox.addEventListener('change', () => {
            polygonAliasVisibility.set(alias, checkbox.checked);
            updateLayersCallback();
        });

        // Alias name label
        const label = document.createElement('label');
        label.htmlFor = `alias-${alias}`;
        label.textContent = alias;

        // Color indicator
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'color-indicator';
        const color = polygonAliasColors.get(alias);
        colorIndicator.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

        // Assemble control
        controlDiv.appendChild(checkbox);
        controlDiv.appendChild(label);
        controlDiv.appendChild(colorIndicator);
        controlsContainer.appendChild(controlDiv);
    });
}

/**
 * Toggle all polygon alias visibility
 * @param {Map} polygonAliasVisibility - Visibility state map
 * @param {HTMLElement} controlsContainer - Container with alias controls
 * @param {Function} updateLayersCallback - Callback to update layers
 */
export function toggleAllPolygonAliases(polygonAliasVisibility, controlsContainer, updateLayersCallback) {
    // Determine if all are currently visible
    const allVisible = Array.from(polygonAliasVisibility.values()).every(visible => visible);
    const newState = !allVisible;

    // Update visibility state
    polygonAliasVisibility.forEach((_, alias) => {
        polygonAliasVisibility.set(alias, newState);
    });

    // Update UI checkboxes
    controlsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = newState;
    });

    updateLayersCallback();
}

/**
 * Toggle all gene visibility
 * @param {Set} selectedGenes - Set of visible genes
 * @param {Map} geneDataMap - Map of all available genes
 * @param {Function} updateLayersCallback - Callback to update layers
 */
export function toggleAllGenes(selectedGenes, geneDataMap, updateLayersCallback) {
    const allVisible = selectedGenes.size === geneDataMap.size;
    
    if (allVisible) {
        // Hide all genes
        selectedGenes.clear();
    } else {
        // Show all genes
        geneDataMap.forEach((_, gene) => {
            selectedGenes.add(gene);
        });
    }
    
    updateLayersCallback();
}

/**
 * Update gene size scale and UI display
 * @param {number} newScale - New size scale value
 * @param {Object} state - Application state object
 * @param {HTMLElement} displayElement - Element showing current scale value
 * @param {Function} updateLayersCallback - Callback to update layers
 */
export function updateGeneSize(newScale, state, displayElement, updateLayersCallback) {
    state.geneSizeScale = newScale;
    if (displayElement) {
        displayElement.textContent = newScale.toFixed(1);
    }
    updateLayersCallback();
}

/**
 * Handle gene panel communication
 * Manages communication with the separate gene panel window
 * @param {MessageEvent} event - Message event from gene panel
 * @param {Object} state - Application state object
 * @param {Function} updateLayersCallback - Callback to update layers
 */
export function handleGenePanelMessage(event, state, updateLayersCallback) {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
        case 'genePanelReady':
            // Send initial gene list to panel
            if (state.genePanelWin) {
                state.genePanelWin.postMessage({
                    type: 'geneList',
                    genes: Array.from(state.geneDataMap.keys()),
                    chosen: Array.from(state.selectedGenes)
                }, '*');
            }
            break;

        case 'geneVisibilityUpdate':
            // Update gene visibility based on panel selection
            state.selectedGenes.clear();
            msg.chosen.forEach(g => state.selectedGenes.add(g));
            updateLayersCallback();
            break;
    }
}

/**
 * Open or focus gene panel window
 * @param {Object} state - Application state object
 */
export function openGenePanel(state) {
    if (!state.genePanelWin || state.genePanelWin.closed) {
        state.genePanelWin = window.open('genes_datatable.html', 'GenePanel');
    } else {
        state.genePanelWin.focus();
    }
}

/**
 * Toggle layer controls panel minimized state
 * @param {HTMLElement} layerControls - Layer controls container
 * @param {HTMLElement} minimizeBtn - Minimize button
 */
export function toggleLayerControls(layerControls, minimizeBtn) {
    layerControls.classList.toggle('minimized');
    minimizeBtn.textContent = layerControls.classList.contains('minimized') ? '+' : '−';
}
