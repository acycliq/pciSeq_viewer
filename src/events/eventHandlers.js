/**
 * Event Handlers Module
 *
 * This module contains all UI event handling logic for the application,
 * including slider controls, navigation buttons, layer toggles, and keyboard shortcuts.
 *
 * The main setupEventHandlers() function delegates to focused sub-functions
 * for better maintainability.
 */

import {
    toggleAllGenes,
    updateGeneSize,
    handleGenePanelMessage,
    openGenePanel,
    toggleLayerControls
} from '../ui/uiHelpers.js';
import { setupResizableList } from '../../utils/resizableList.js';
import { debounce } from '../../utils/common.js';
import {
    loadAllPlanesForProjection,
    prepareProjectionFromCaches
} from '../data/cellProjectionLoader.js';

// === MAIN SETUP FUNCTION ===

/**
 * Setup all event handlers for the application
 * Configures UI interactions, keyboard shortcuts, and cross-window communication
 * @param {Object} elements - DOM elements object
 * @param {Object} state - Application state object
 * @param {Function} updatePlaneCallback - Function to update current plane
 * @param {Function} updateLayersCallback - Function to update all layers
 */
export function setupEventHandlers(elements, state, updatePlaneCallback, updateLayersCallback) {
    // Delegate to focused setup functions
    setupPlaneNavigation(elements, state, updatePlaneCallback);
    setupLayerToggles(elements, state, updateLayersCallback);
    setupGeneControls(elements, state, updateLayersCallback);
    setupWidgetControls(elements);
    setupControlsDrawer(elements);
    setupRegionImport(elements);
    setupZProjectionToggle(state, updateLayersCallback);
    setupCellProjectionToggle(state, updateLayersCallback);
    setupEscapeKeyHandler(elements);
    setupCrossWindowMessaging(state, updateLayersCallback);
}

// === PLANE NAVIGATION ===

/**
 * Setup plane navigation controls (slider, prev/next buttons, arrow keys)
 */
function setupPlaneNavigation(elements, state, updatePlaneCallback) {
    // Slider input - immediate visual update
    elements.slider.addEventListener('input', (e) => {
        const newPlane = parseInt(e.target.value);
        updatePlaneCallback(newPlane);
    });

    // Previous/Next navigation buttons
    elements.prevBtn.addEventListener('click', () => {
        updatePlaneCallback(state.currentPlane - 1);
    });

    elements.nextBtn.addEventListener('click', () => {
        updatePlaneCallback(state.currentPlane + 1);
    });

    // Keyboard navigation (arrow keys) - use capture phase to intercept before deck.gl
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            updatePlaneCallback(state.currentPlane - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            updatePlaneCallback(state.currentPlane + 1);
        }
    }, true); // Use capture phase
}

// === LAYER VISIBILITY ===

/**
 * Setup layer visibility toggles (tiles, polygons, opacity)
 */
function setupLayerToggles(elements, state, updateLayersCallback) {
    // Background tiles toggle
    elements.showTiles.addEventListener('change', (e) => {
        state.showTiles = e.target.checked;
        updateLayersCallback();
    });

    // Cell boundary polygons toggle
    elements.showPolygons.addEventListener('change', (e) => {
        state.showPolygons = e.target.checked;
        updateLayersCallback();
    });

    // Polygon opacity slider
    elements.polygonOpacitySlider.addEventListener('input', (e) => {
        const newOpacity = parseFloat(e.target.value);
        state.polygonOpacity = newOpacity;
        elements.polygonOpacityValue.textContent = newOpacity.toFixed(1);
        updateLayersCallback();
    });
}

// === GENE EXPRESSION CONTROLS ===

/**
 * Setup gene expression controls (size, score filter, intensity filter, uniform size)
 */
function setupGeneControls(elements, state, updateLayersCallback) {
    // Gene size slider
    elements.geneSizeSlider.addEventListener('input', (e) => {
        updateGeneSize(
            parseFloat(e.target.value),
            state,
            elements.geneSizeValue,
            updateLayersCallback
        );
    });

    // Score filter slider (rAF-throttled)
    let scoreRafId = null;
    elements.scoreFilterSlider.addEventListener('input', (e) => {
        const threshold = parseFloat(e.target.value);
        state.scoreThreshold = threshold;
        state.filterMode = 'score';
        elements.scoreFilterValue.textContent = threshold.toFixed(2);
        if (scoreRafId == null) {
            scoreRafId = requestAnimationFrame(() => {
                scoreRafId = null;
                updateLayersCallback();
            });
        }
    });

    // Intensity filter slider (rAF-throttled)
    let intensityRafId = null;
    if (elements.intensityFilterSlider) {
        elements.intensityFilterSlider.addEventListener('input', (e) => {
            const threshold = parseFloat(e.target.value);
            state.intensityThreshold = threshold;
            state.filterMode = 'intensity';
            if (elements.intensityFilterValue) {
                elements.intensityFilterValue.textContent = threshold.toFixed(2);
            }
            if (intensityRafId == null) {
                intensityRafId = requestAnimationFrame(() => {
                    intensityRafId = null;
                    updateLayersCallback();
                });
            }
        });
    }

    // Uniform marker size toggle
    if (elements.uniformSizeToggle) {
        elements.uniformSizeToggle.addEventListener('change', (e) => {
            state.uniformMarkerSize = Boolean(e.target.checked);
            updateLayersCallback();
        });
    }
}

// === WIDGET CONTROLS ===

/**
 * Setup widget controls (gene distribution, cell class charts, cell class widget)
 */
function setupWidgetControls(elements) {
    // Gene distribution chart button
    const geneDistributionBtn = document.getElementById('geneDistributionBtn');
    if (geneDistributionBtn) {
        geneDistributionBtn.addEventListener('click', () => {
            window.showGeneDistributionWidget();
        });
    }

    // Cell class distribution chart button
    const classesByZBtn = document.getElementById('classesByZBtn');
    if (classesByZBtn) {
        classesByZBtn.addEventListener('click', () => {
            window.showCellClassDistributionWidget();
        });
    }

    // Cell class percentage chart button
    const classPercentageBtn = document.getElementById('classPercentageBtn');
    if (classPercentageBtn) {
        classPercentageBtn.addEventListener('click', () => {
            window.showCellClassPercentageWidget();
        });
    }

    // Expression histogram chart button
    const expressionHistogramBtn = document.getElementById('expressionHistogramBtn');
    if (expressionHistogramBtn) {
        expressionHistogramBtn.addEventListener('click', () => {
            window.showExpressionHistogramWidget();
        });
    }

    // Cell class widget controls
    elements.cellClassWidgetClose.addEventListener('click', () => {
        window.hideCellClassWidget();
    });

    elements.cellClassWidgetUndock.addEventListener('click', () => {
        window.undockCellClassWidget();
    });

    elements.cellClassWidgetBackdrop.addEventListener('click', () => {
        window.hideCellClassWidget();
    });

    elements.cellClassSearch.addEventListener('input', (e) => {
        window.filterCellClasses(e.target.value);
    });

    elements.toggleAllCellClasses.addEventListener('click', () => {
        window.toggleAllCellClasses();
    });


}

// === CONTROLS DRAWER ===

/**
 * Setup controls drawer toggle
 */
function setupControlsDrawer(elements) {
    if (elements.controlsRail) {
        elements.controlsRail.addEventListener('click', () => {
            window.toggleControlsPanel();
        });
    }
}

// === REGION IMPORT ===

/**
 * Setup region import functionality
 */
function setupRegionImport(elements) {
    // Import button opens file dialog
    elements.importRegionsBtn.addEventListener('click', () => {
        elements.regionFileInput.click();
    });

    // Handle file selection
    elements.regionFileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        try {
            const result = await window.importRegions(files);

            if (result.imported.length > 0) {
                console.log(`Imported ${result.imported.length} regions:`, result.imported);
            }

            if (result.errors.length > 0) {
                console.error('Import errors:', result.errors);
            }
        } catch (error) {
            console.error('Failed to import regions:', error);
        }

        // Clear the file input so the same files can be re-imported
        e.target.value = '';
    });

    // Setup resizable regions list
    setupResizableList({
        listId: 'regionsList',
        handleId: 'regionsResizeHandle',
        storageKey: 'regionsListHeight'
    });
}

// === Z-PROJECTION TOGGLE ===

/**
 * Setup Z-Projection overlay toggle
 */
function setupZProjectionToggle(state, updateLayersCallback) {
    const zProjectionToggle = document.getElementById('zProjectionToggle');
    const zProjectionControls = document.getElementById('zProjectionControls');
    const zProjectionOpacity = document.getElementById('zProjectionOpacity');
    const zProjectionOpacityValue = document.getElementById('zProjectionOpacityValue');

    if (zProjectionToggle) {
        zProjectionToggle.addEventListener('change', async () => {
            if (zProjectionToggle.checked) {
                const { isZProjectionReady } = await import('../layers/zProjectionOverlay.js');

                if (!isZProjectionReady()) {
                    alert('Z-projection overlay is still building. Please wait...');
                    zProjectionToggle.checked = false;
                    return;
                }
            }

            state.showZProjectionOverlay = zProjectionToggle.checked;
            // Keep opacity controls hidden for now
            zProjectionControls.style.display = 'none';
            updateLayersCallback();
        });
    }

    if (zProjectionOpacity) {
        zProjectionOpacity.addEventListener('input', () => {
            const opacity = parseFloat(zProjectionOpacity.value);
            state.zProjectionOpacity = opacity;
            zProjectionOpacityValue.textContent = Math.round(opacity * 100) + '%';
            if (state.showZProjectionOverlay) {
                updateLayersCallback();
            }
        });
    }
}

// === CELL PROJECTION TOGGLE ===

/**
 * Setup Cell Projection mode toggle (show all cells from all planes)
 */
function setupCellProjectionToggle(state, updateLayersCallback) {
    const cellProjectionToggle = document.getElementById('cellProjectionToggle');
    const cellProjectionControls = document.getElementById('cellProjectionControls');
    const geneCountSlider = document.getElementById('geneCountSlider');
    const geneCountValue = document.getElementById('geneCountValue');
    const geneCountMaxSlider = document.getElementById('geneCountMaxSlider');
    const geneCountMaxValue = document.getElementById('geneCountMaxValue');

    if (cellProjectionToggle) {
        cellProjectionToggle.addEventListener('change', async () => {
            state.zProjectionCellMode = cellProjectionToggle.checked;

            // Show/hide gene count slider controls
            if (cellProjectionControls) {
                cellProjectionControls.style.display = cellProjectionToggle.checked ? 'block' : 'none';
            }

            if (cellProjectionToggle.checked) {
                await handleCellProjectionEnable(state, updateLayersCallback);
            } else {
                handleCellProjectionDisable(state, updateLayersCallback);
            }
        });
    }

    // Gene count sliders (rAF-throttled)
    let geneCountRafId = null;
    const scheduleUpdate = () => {
        if (state.zProjectionCellMode && geneCountRafId == null) {
            geneCountRafId = requestAnimationFrame(() => {
                geneCountRafId = null;
                updateLayersCallback();
            });
        }
    };

    if (geneCountSlider) {
        geneCountSlider.addEventListener('input', (e) => {
            const threshold = parseInt(e.target.value);
            state.geneCountThreshold = threshold;
            if (geneCountValue) {
                geneCountValue.textContent = threshold.toString();
            }
            scheduleUpdate();
        });
    }

    if (geneCountMaxSlider) {
        geneCountMaxSlider.addEventListener('input', (e) => {
            const threshold = parseInt(e.target.value);
            state.geneCountMaxThreshold = threshold;
            if (geneCountMaxValue) {
                geneCountMaxValue.textContent = threshold.toString();
            }
            scheduleUpdate();
        });
    }
}

/**
 * Handle enabling Cell Projection mode
 */
async function handleCellProjectionEnable(state, updateLayersCallback) {
    // Ensure slider max reflects dataset max gene count (ceiled to integer)
    const max = Math.ceil(Number(state.maxTotalGeneCount || 0));

    const slider = document.getElementById('geneCountSlider');
    const valueEl = document.getElementById('geneCountValue');
    if (slider) {
        if (Number(slider.max) !== max) slider.max = String(max);
        if (Number(slider.value) > max) {
            slider.value = '0';
            state.geneCountThreshold = 0;
            if (valueEl) valueEl.textContent = '0';
        }
    }

    const maxSlider = document.getElementById('geneCountMaxSlider');
    const maxValueEl = document.getElementById('geneCountMaxValue');
    if (maxSlider) {
        if (Number(maxSlider.max) !== max) maxSlider.max = String(max);
        maxSlider.value = String(max);
        state.geneCountMaxThreshold = max;
        if (maxValueEl) maxValueEl.textContent = String(max);
    }

    // If features are already prepared, reuse them
    const hasStable = Array.isArray(state.cellProjectionFeatures) && state.cellProjectionFeatures.length > 0;
    if (hasStable) {
        updateLayersCallback();
        return;
    }

    // If caches are already full, skip plane load and only prepare/flatten features
    try {
        const totalPlanes = window.appState.totalPlanes;
        const { arrowGeojsonCache } = await import('../layers/boundaryCache.js');
        if (arrowGeojsonCache && arrowGeojsonCache.size >= totalPlanes) {
            await prepareProjectionFromCaches(state);
            updateLayersCallback();
            return;
        }
    } catch {}

    // Otherwise, load ALL planes and prepare features
    await loadAllPlanesForProjection(state, updateLayersCallback);
}

/**
 * Handle disabling Cell Projection mode
 */
function handleCellProjectionDisable(state, updateLayersCallback) {
    // Clear stable features reference to free memory
    state.cellProjectionFeatures = null;
    if (window.appState) window.appState.cellProjectionFeatures = null;
    updateLayersCallback();
}

// === ESCAPE KEY HANDLER ===

/**
 * Setup Escape key to close widgets and controls panel
 */
function setupEscapeKeyHandler(elements) {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.cellClassWidget.classList.contains('hidden')) {
                window.hideCellClassWidget();
            }
            if (!elements.controlsPanel.classList.contains('collapsed')) {
                window.hideControlsPanel();
            }
        }
    });
}

// === CROSS-WINDOW MESSAGING ===

/**
 * Setup cross-window messaging for undocked gene panel
 */
function setupCrossWindowMessaging(state, updateLayersCallback) {
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;

        switch (msg.type) {
            case 'genePanelReady':
                // Send gene list to undocked panel
                if (state.genePanelWin) {
                    const genes = Array.from(state.geneDataMap.keys());
                    const chosen = Array.from(state.selectedGenes);
                    state.genePanelWin.postMessage({
                        type: 'geneList',
                        genes: genes,
                        chosen: chosen
                    }, '*');
                }
                break;

            case 'geneVisibilityUpdate':
                // Update gene visibility from undocked panel
                state.selectedGenes.clear();
                msg.chosen.forEach(g => state.selectedGenes.add(g));
                updateLayersCallback();
                break;
        }
    });

    // Setup regions list resize handle
    setupRegionsListResize();
}

/**
 * Setup resize handle for regions list (like genes/cell classes drawers)
 */
function setupRegionsListResize() {
    const handle = document.getElementById('regionsResizeHandle');
    const listEl = document.getElementById('regionsList');
    if (!handle || !listEl) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = listEl.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dy = e.clientY - startY;
        const newHeight = Math.max(50, Math.min(startHeight + dy, 400));
        listEl.style.height = newHeight + 'px';
        listEl.style.maxHeight = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        try {
            window.localStorage && window.localStorage.setItem('regionsListHeight', String(listEl.offsetHeight));
        } catch {}
    });

    // Restore height from localStorage
    try {
        const savedHeight = window.localStorage && window.localStorage.getItem('regionsListHeight');
        if (savedHeight) {
            const h = parseInt(savedHeight, 10);
            if (h > 0) {
                listEl.style.height = h + 'px';
                listEl.style.maxHeight = h + 'px';
            }
        }
    } catch {}
}

/**
 * Setup keyboard shortcuts for advanced users
 * @param {Object} state - Application state object
 * @param {Function} updatePlaneCallback - Function to update current plane
 * @param {Function} updateLayersCallback - Function to update layers
 */
export function setupAdvancedKeyboardShortcuts(state, updatePlaneCallback, updateLayersCallback) {
    document.addEventListener('keydown', (e) => {
        // Prevent shortcuts when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key) {
            case 'Home':
                e.preventDefault();
                updatePlaneCallback(0);
                break;

            case 'End':
                e.preventDefault();
                updatePlaneCallback(99);
                break;

            case 'PageUp':
                e.preventDefault();
                updatePlaneCallback(state.currentPlane - 10);
                break;

            case 'PageDown':
                e.preventDefault();
                updatePlaneCallback(state.currentPlane + 10);
                break;

            case 't':
            case 'T':
                state.showTiles = !state.showTiles;
                document.getElementById('showTiles').checked = state.showTiles;
                updateLayersCallback();
                break;

            case 'p':
            case 'P':
                state.showPolygons = !state.showPolygons;
                document.getElementById('showPolygons').checked = state.showPolygons;
                updateLayersCallback();
                break;
        }
    });
}
