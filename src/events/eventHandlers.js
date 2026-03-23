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
import { showNotification } from '../ui/notification.js';
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
    setupDiagnosticsSliders(state, updateLayersCallback);
    setupColorModeControls(state, updateLayersCallback);
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

// === DIAGNOSTICS SLIDERS ===

/**
 * Setup theta (cell inefficiency) and gamma (gene expression) sliders.
 * Sliders are hidden until diagnostics DB is connected.
 * Theta lives in Cell Controls, gamma lives in Gene Controls.
 */
function setupDiagnosticsSliders(state, updateLayersCallback) {
    const thetaSlider = document.getElementById('cellThetaSlider');
    const thetaValue = document.getElementById('cellThetaValue');
    const gammaSlider = document.getElementById('gammaSlider');
    const gammaValue = document.getElementById('gammaValue');
    const thetaItem = document.getElementById('cellThetaSliderItem');
    const gammaItem = document.getElementById('gammaSliderItem');

    // Wire slider: update state property, display value, and trigger layer rebuild (rAF-throttled)
    function wireSlider(slider, valueEl, stateKey) {
        if (!slider) return;
        let rafId = null;
        slider.addEventListener('input', (e) => {
            const threshold = parseFloat(e.target.value);
            state[stateKey] = threshold;
            if (valueEl) valueEl.textContent = threshold.toFixed(2);
            if (rafId == null) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    updateLayersCallback();
                });
            }
        });
    }

    wireSlider(thetaSlider, thetaValue, 'thetaThreshold');
    wireSlider(gammaSlider, gammaValue, 'gammaThreshold');

    function showDiagnosticsSliders() {
        if (thetaItem) thetaItem.style.display = 'flex';
        if (gammaItem) gammaItem.style.display = 'flex';
        loadCellTheta(state);
        loadSpotGammaValues(state);
    }

    function hideDiagnosticsSliders() {
        if (thetaItem) thetaItem.style.display = 'none';
        if (gammaItem) gammaItem.style.display = 'none';
    }

    // Show sliders when diagnostics activates
    if (window.electronAPI?.onCheckCellState) {
        window.electronAPI.onCheckCellState((stateData) => {
            if (stateData.enabled) {
                showDiagnosticsSliders();
            } else {
                hideDiagnosticsSliders();
            }
        });
    }

    // Check if diagnostics is already active on startup
    if (window.electronAPI?.getCheckCellState) {
        window.electronAPI.getCheckCellState().then(stateData => {
            if (stateData && stateData.enabled) showDiagnosticsSliders();
        }).catch(() => {});
    }
}

/**
 * Load cell theta (inefficiency) from diagnostics DB and configure slider bounds.
 */
function loadCellTheta(state) {
    if (state.cellThetaMap) return;
    if (typeof window.electronAPI?.getCellTheta !== 'function') return;

    window.electronAPI.getCellTheta().then(result => {
        if (!result || !result.success || !result.entries) return;

        const map = new Map();
        let maxTheta = 0;
        for (const [label, theta] of result.entries) {
            map.set(Number(label), theta);
            if (theta > maxTheta) maxTheta = theta;
        }
        state.cellThetaMap = map;

        configureSlider('cellThetaSlider', 'cellThetaValue', maxTheta, state, 'maxTheta');

        console.log(`Cell theta loaded: ${map.size} cells, max theta: ${state.maxTheta}`);
    }).catch(e => {
        console.warn('Cell theta not available:', e.message || e);
    });
}

/**
 * Wait for scatter cache, then fetch gamma from diagnostics DB and compute per-spot values.
 * Stores results on window.appState: spotGammaValues, gammaMap, reverseGeneDict.
 */
function loadSpotGammaValues(state) {
    if (window.appState?.spotGammaValues) return;
    if (typeof window.electronAPI?.getGammaAssigned !== 'function') return;

    // Wait for scatter cache (built async by worker)
    const cache = window.appState?.arrowScatterCache;
    if (!cache || !cache.neighbours || !cache.geneIds) {
        let retries = 0;
        const interval = setInterval(() => {
            retries++;
            const c = window.appState?.arrowScatterCache;
            if (c && c.neighbours && c.geneIds) {
                clearInterval(interval);
                loadSpotGammaValues(state);
            } else if (retries >= 60) {
                clearInterval(interval);
                console.warn('Scatter cache not ready after 30s, giving up on gamma');
            }
        }, 500);
        return;
    }

    window.electronAPI.getGammaAssigned().then(result => {
        if (!result || !result.success || !result.entries) return;

        const { spotGamma, gammaMap, maxGamma } = computePerSpotGamma(result.entries, cache);

        window.appState.spotGammaValues = spotGamma;
        window.appState.gammaMap = gammaMap;
        window.appState.reverseGeneDict = buildReverseGeneDict();

        configureSlider('gammaSlider', 'gammaValue', maxGamma, state, 'maxGamma');

        // Build per-spot eta from eta_bar array (indexed by geneId)
        if (result.etaBar) {
            const { spotEta, maxEta } = computePerSpotEta(result.etaBar, cache);
            window.appState.spotEtaValues = spotEta;
            window.appState.maxEta = maxEta;
            console.log(`Spot eta computed: ${cache.length} spots, max=${maxEta.toFixed(3)}`);
        }

        console.log(`Spot gamma computed: ${cache.length} spots, max=${maxGamma.toFixed(3)}`);
    }).catch(e => {
        console.warn('Gamma data not available:', e.message || e);
    });
}

/**
 * Compute per-spot gamma from cell gamma matrix and scatter cache.
 * Each spot gets gamma[cell][gene] where cell = spot's primary neighbour.
 */
function computePerSpotGamma(entries, cache) {
    // Keys must be numbers to match Int32Array neighbours
    const gammaMap = new Map();
    for (const [label, gammaArr] of entries) {
        gammaMap.set(Number(label), gammaArr);
    }

    const { neighbours, geneIds, length } = cache;
    const spotGamma = new Float32Array(length);
    let maxGamma = 0;
    for (let i = 0; i < length; i++) {
        const cellGamma = gammaMap.get(neighbours[i]);
        const geneId = geneIds[i];
        const g = (cellGamma && geneId >= 0 && geneId < cellGamma.length) ? cellGamma[geneId] : 1.0;
        spotGamma[i] = g;
        if (g > maxGamma) maxGamma = g;
    }

    return { spotGamma, gammaMap, maxGamma };
}

/**
 * Compute per-spot eta from eta_bar array.
 * Each spot gets eta_bar[geneId] — the detection efficiency of its gene.
 */
function computePerSpotEta(etaBar, cache) {
    const { geneIds, length } = cache;
    const spotEta = new Float32Array(length);
    let maxEta = 0;
    for (let i = 0; i < length; i++) {
        const geneId = geneIds[i];
        const eta = (geneId >= 0 && geneId < etaBar.length) ? etaBar[geneId] : 1.0;
        spotEta[i] = eta;
        if (eta > maxEta) maxEta = eta;
    }
    return { spotEta, maxEta };
}

/**
 * Build reverse gene dict: gene name → gene id (numeric).
 */
function buildReverseGeneDict() {
    const geneDict = window.appState?.arrowGeneDict || {};
    const reverse = {};
    for (const [id, name] of Object.entries(geneDict)) {
        reverse[name] = Number(id);
    }
    return reverse;
}

/**
 * Configure a slider's max/step from computed data range.
 */
function configureSlider(sliderId, valueId, maxVal, state, stateMaxKey) {
    const rounded = Math.ceil(maxVal * 10) / 10;
    state[stateMaxKey] = rounded;
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    if (slider) {
        slider.max = String(rounded);
        slider.step = String(Math.max(0.01, rounded / 200));
    }
    if (valueEl) valueEl.textContent = '0';
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

        // Ctrl/Cmd + L toggles line overlay (current-plane cells, all-plane spots)
        if ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L')) {
            e.preventDefault();
            state.showCellSpotLines = !state.showCellSpotLines;
            updateLayersCallback();
            showNotification(
                `Cell-to-spot lines ${state.showCellSpotLines ? 'enabled' : 'disabled'} (current-plane cells, all-plane spots)`,
                'info'
            );
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

// === COLOR MODE CONTROLS ===

/**
 * Setup color-by dropdown controls for cells and spots
 */
function setupColorModeControls(state, updateLayersCallback) {
    const cellSelect = document.getElementById('cellColorMode');
    const spotSelect = document.getElementById('spotColorMode');

    if (cellSelect) {
        cellSelect.addEventListener('change', (e) => {
            state.cellColorMode = e.target.value;
            updateLayersCallback();
            refreshColorLegend(state);
        });
    }

    if (spotSelect) {
        spotSelect.addEventListener('change', (e) => {
            state.spotColorMode = e.target.value;
            updateLayersCallback();
            refreshColorLegend(state);
        });
    }

    const bgCheckbox = document.getElementById('backgroundOnlyCheckbox');
    if (bgCheckbox) {
        bgCheckbox.addEventListener('change', (e) => {
            state.showBackgroundOnly = e.target.checked;
            window.appState.showBackgroundOnly = e.target.checked;
            updateLayersCallback();
        });
    }
}

/**
 * Update the color legend bar based on active color mode
 */
function refreshColorLegend(state) {
    import('../../utils/colormap.js').then(({ updateColorLegend }) => {
        const cellMode = state.cellColorMode || 'cellClass';
        const spotMode = state.spotColorMode || 'gene';

        if (cellMode === 'theta') {
            updateColorLegend({ title: 'Theta', min: 0, max: state.maxTheta || 1 });
        } else if (cellMode === 'totalGeneCount') {
            updateColorLegend({ title: 'Gene Count', min: 0, max: state.maxTotalGeneCount || 1 });
        } else if (spotMode === 'gamma') {
            updateColorLegend({ title: 'Gamma', min: 0, max: window.appState?.maxGamma || 1 });
        } else if (spotMode === 'eta') {
            updateColorLegend({ title: 'Eta', min: 0, max: window.appState?.maxEta || 1 });
        } else {
            updateColorLegend(null);
        }
    });
}
