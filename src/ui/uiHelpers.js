/**
 * UI Helper Functions Module
 *
 * This module contains utility functions for managing UI state, tooltips,
 * loading indicators, and polygon alias controls
 */

/**
 * Hide the startup curtain and loading indicator, then reveal a screen by id.
 * Shared by the welcome screen, image-dims prompt and metadata-error screen.
 */
export function showScreen(screenId) {
    const curtain = document.getElementById('appCurtain');
    if (curtain) curtain.classList.add('hidden');
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.style.display = 'none';

    const screen = document.getElementById(screenId);
    if (screen) screen.classList.remove('hidden');
    return screen;
}

/**
 * Show loading indicator
 * @param {Object} state - Application state object
 * @param {HTMLElement} loadingElement - Loading indicator DOM element
 */
export function showLoading(state, loadingElement) {
    state.isLoading = true;
    loadingElement.style.display = 'block';

    try {
        // Avoid restarting if already ticking
        if (!state._loadingTimerId) {
            const timerEl = document.getElementById('loadingTimer');
            state._loadingStart = performance.now();
            if (timerEl) {
                timerEl.textContent = ' 0.0s';
            }
            state._loadingTimerId = setInterval(() => {
                if (!state.isLoading) return; // safeguard
                const secs = (performance.now() - (state._loadingStart || performance.now())) / 1000;
                if (timerEl) timerEl.textContent = ` ${secs.toFixed(1)}s`;
            }, 100);
        }
    } catch {}
}

/**
 * Hide loading indicator
 * @param {Object} state - Application state object
 * @param {HTMLElement} loadingElement - Loading indicator DOM element
 */
export function hideLoading(state, loadingElement) {
    state.isLoading = false;
    loadingElement.style.display = 'none';

    try {
        if (state._loadingTimerId) {
            clearInterval(state._loadingTimerId);
            state._loadingTimerId = null;
        }
        const timerEl = document.getElementById('loadingTimer');
        if (timerEl) timerEl.textContent = '';
    } catch {}
}

/**
 * Build tooltip HTML for a cell polygon
 * @param {Object} properties - Polygon feature properties
 * @returns {string} HTML content or empty string
 */
function buildCellTooltip(properties) {
    const cellLabel = properties.label;
    let cellClass = properties.cellClass || 'Unknown';
    if (Array.isArray(cellClass)) cellClass = cellClass[0] || 'Unknown';
    // If class came as a stringified list, parse and pick first
    if (typeof cellClass === 'string' && cellClass.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(cellClass.replace(/'/g, '"'));
            if (Array.isArray(parsed) && parsed.length > 0) cellClass = parsed[0];
        } catch {}
    }
    cellClass = String(cellClass).trim();
    const planeId = properties.plane_id;

    let cellCoords = '';
    let centroidPlane = '';
    let classProb = '';
    let totalGeneCount = '';
    let colorHex = '';

    if (window.debugData && window.debugData.getCell) {
        const cellData = window.debugData.getCell(parseInt(cellLabel));
        if (cellData) {
            if (cellData.position) {
                const coords = cellData.position;
                cellCoords = `<strong>Cell Coords:</strong> (${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}, ${coords.z.toFixed(2)})<br>`;

                if (coords.z !== undefined) {
                    const cfg = window.config ? window.config() : null;
                    if (cfg && Array.isArray(cfg.voxelSize)) {
                        const [xVoxel, , zVoxel] = cfg.voxelSize;
                        centroidPlane = `<strong>Centroid Plane:</strong> ${Math.floor(coords.z * xVoxel / zVoxel)}<br>`;
                    } else {
                        centroidPlane = `<strong>Centroid Plane:</strong> ${Math.floor(coords.z)}<br>`;
                    }
                }
            }

            if (cellData.classification && cellData.classification.className && cellData.classification.probability) {
                const classIndex = cellData.classification.className.indexOf(cellClass);
                if (classIndex >= 0) {
                    const prob = cellData.classification.probability[classIndex];
                    classProb = `<strong>Class Probability:</strong> ${(prob * 100).toFixed(1)}%<br>`;
                }
            }

            if (typeof cellData.totalGeneCount === 'number') {
                totalGeneCount = `<strong>Total Gene Counts:</strong> ${cellData.totalGeneCount.toFixed(2)}<br>`;
            }
        }
    }

    try {
        if (typeof classColorsCodes === 'function') {
            const scheme = classColorsCodes();
            const entry = scheme.find(e => e.className === cellClass);
            if (entry && entry.color) {
                colorHex = `<strong>Color:</strong> ${entry.color}<br>`;
            }
        }
    } catch {}

    let internalLabel = '';
    const labelMap = window.appState && window.appState.labelMap;
    if (labelMap) {
        const internal = labelMap[String(cellLabel)];
        if (internal !== undefined) {
            internalLabel = `<strong>Internal Index:</strong> ${internal}<br>`;
        }
    }

    let thetaInfo = '';
    const thetaMap = window.appState?.cellThetaMap;
    if (thetaMap) {
        const theta = thetaMap.get(Number(cellLabel));
        if (theta !== undefined) {
            thetaInfo = `<strong>Theta:</strong> ${theta.toFixed(3)}<br>`;
        }
    }

    return `<strong>Cell Label:</strong> ${cellLabel}<br>
            ${cellCoords}
            ${centroidPlane}
            <strong>Polygon Plane:</strong> ${planeId}<br>
            <strong>Cell Class:</strong> ${cellClass}<br>
            ${classProb}
            ${totalGeneCount}
            ${colorHex}
            ${internalLabel}
            ${thetaInfo}`;
}

/**
 * Build tooltip HTML for a gene spot
 * @param {Object} spot - Spot data object
 * @returns {string} HTML content
 */
function buildSpotTooltip(spot) {
    const gene = spot.gene;
    const coords = `(${spot.x.toFixed(2)}, ${spot.y.toFixed(2)}, ${spot.z.toFixed(2)})`;
    const planeId = spot.plane_id;

    let spotInfo = '';
    if (spot.spot_id !== undefined) {
        spotInfo = `<strong>Spot ID:</strong> ${spot.spot_id}<br>`;
    }

    let colorInfo = '';
    if (typeof glyphSettings === 'function') {
        const settings = glyphSettings();
        const geneSetting = settings.find(s => s.gene === gene);
        if (geneSetting && geneSetting.color) {
            colorInfo = `<strong>Color:</strong> ${geneSetting.color}<br>`;
        }
    }

    let parentInfo = '';
    const neighbour = spot.neighbour === 0 ? 'Background' : spot.neighbour;
    if (neighbour && spot.prob !== undefined) {
        parentInfo = `<strong>Parent Cell:</strong> ${neighbour}<br>
                     <strong>Parent Probability:</strong> ${(spot.prob * 100).toFixed(1)}%<br>`;
    }

    let qualityInfo = '';
    if (spot.score !== undefined && spot.score !== null) {
        qualityInfo += `<strong>Score:</strong> ${spot.score.toFixed(3)}<br>`;
    }
    if (spot.intensity !== undefined && spot.intensity !== null) {
        qualityInfo += `<strong>Intensity:</strong> ${spot.intensity.toFixed(3)}<br>`;
    }

    const gMap = window.appState?.gammaMap;
    const rDict = window.appState?.reverseGeneDict;
    if (gMap && rDict && spot.neighbour != null) {
        const gid = rDict[gene];
        const cellGamma = gMap.get(Number(spot.neighbour));
        if (cellGamma && gid >= 0 && gid < cellGamma.length) {
            qualityInfo += `<strong>Gamma:</strong> ${cellGamma[gid].toFixed(3)}<br>`;
        }
    }

    return `${spotInfo}<strong>Gene:</strong> ${gene}<br>
            ${colorInfo}<strong>Coords:</strong> ${coords}<br>
            <strong>Plane:</strong> ${planeId}<br>
            ${parentInfo}${qualityInfo}`;
}

/**
 * Show tooltip with polygon, gene spot, or region information
 * @param {Object} info - Hover info from deck.gl
 * @param {HTMLElement} tooltipElement - Tooltip DOM element
 */
export function showTooltip(info, tooltipElement) {
    if (!info.picked || !info.object) {
        tooltipElement.style.display = 'none';
        return;
    }

    let content = '';

    if (info.layer?.id?.startsWith('polygons-') && info.object.properties) {
        content = buildCellTooltip(info.object.properties);
    } else if (info.object.gene) {
        content = buildSpotTooltip(info.object);
    } else if (info.object.name) {
        content = `<strong>Region:</strong> ${info.object.name}`;
    }

    if (content) {
        tooltipElement.innerHTML = content;
        tooltipElement.style.display = 'block';
        tooltipElement.style.left = info.x + 20 + 'px';
        tooltipElement.style.top = info.y - 60 + 'px';
    } else {
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
