/**
 * Event Handlers Module
 *
 * This module contains all UI event handling logic for the application,
 * including slider controls, navigation buttons, layer toggles, and keyboard shortcuts
 */

import {
    toggleAllGenes,
    updateGeneSize,
    handleGenePanelMessage,
    openGenePanel,
    toggleLayerControls
} from './uiHelpers.js';

/**
 * Setup all event handlers for the application
 * Configures UI interactions, keyboard shortcuts, and cross-window communication
 * @param {Object} elements - DOM elements object
 * @param {Object} state - Application state object
 * @param {Function} updatePlaneCallback - Function to update current plane
 * @param {Function} updateLayersCallback - Function to update all layers
 */
export function setupEventHandlers(elements, state, updatePlaneCallback, updateLayersCallback) {

    // === PLANE NAVIGATION CONTROLS ===

    // Optimized slider handling for maximum responsiveness
    let sliderTimeout;
    elements.slider.addEventListener('input', (e) => {
        const newPlane = parseInt(e.target.value);

        // Immediate visual update (no debouncing for UI responsiveness)
        updatePlaneCallback(newPlane);

        // Optional: Still debounce any expensive operations if needed
        // clearTimeout(sliderTimeout);
        // sliderTimeout = setTimeout(() => {
        //     // Could trigger additional background operations here
        // }, TIMING.SLIDER_DEBOUNCE);
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
            e.preventDefault(); // Prevent page scrolling
            e.stopPropagation(); // Stop deck.gl from getting this event
            updatePlaneCallback(state.currentPlane - 1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation(); // Stop deck.gl from getting this event
            updatePlaneCallback(state.currentPlane + 1);
        }
    }, true); // Use capture phase (true) to intercept before deck.gl

    // === LAYER VISIBILITY TOGGLES ===

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

    // === GENE EXPRESSION CONTROLS ===

    // Gene size slider
    elements.geneSizeSlider.addEventListener('input', (e) => {
        updateGeneSize(
            parseFloat(e.target.value),
            state,
            elements.geneSizeValue, // Display element for value
            updateLayersCallback
        );
    });

    // Score filter slider (rAF-throttled to one update per frame)
    let scoreRafId = null;
    elements.scoreFilterSlider.addEventListener('input', (e) => {
        const threshold = parseFloat(e.target.value);
        state.scoreThreshold = threshold;
        elements.scoreFilterValue.textContent = threshold.toFixed(2);
        if (scoreRafId == null) {
            scoreRafId = requestAnimationFrame(() => {
                scoreRafId = null;
                updateLayersCallback();
            });
        }
    });

    // Uniform marker size toggle
    if (elements.uniformSizeToggle) {
        elements.uniformSizeToggle.addEventListener('change', (e) => {
            state.uniformMarkerSize = Boolean(e.target.checked);
            updateLayersCallback();
        });
    }

    // === GENE WIDGET MANAGEMENT ===

    // Open gene widget
    elements.genePanelBtn.addEventListener('click', () => {
        window.showGeneWidget();
    });

    // Open gene distribution chart widget
    const geneDistributionBtn = document.getElementById('geneDistributionBtn');
    if (geneDistributionBtn) {
        geneDistributionBtn.addEventListener('click', () => {
            window.showGeneDistributionWidget();
        });
    }

    // Open cell class distribution chart widget (new top-right button)
    const classesByZBtn = document.getElementById('classesByZBtn');
    if (classesByZBtn) {
        classesByZBtn.addEventListener('click', () => {
            window.showCellClassDistributionWidget();
        });
    }

    // Open cell class percentage chart widget (new top-right button)
    const classPercentageBtn = document.getElementById('classPercentageBtn');
    if (classPercentageBtn) {
        classPercentageBtn.addEventListener('click', () => {
            window.showCellClassPercentageWidget();
        });
    }

    // Close gene widget
    elements.geneWidgetClose.addEventListener('click', () => {
        window.hideGeneWidget();
    });

    // Undock gene widget
    elements.geneWidgetUndock.addEventListener('click', () => {
        window.undockGeneWidget();
    });

    // Close widget on backdrop click
    elements.geneWidgetBackdrop.addEventListener('click', () => {
        window.hideGeneWidget();
    });

    // Gene search functionality
    elements.geneSearch.addEventListener('input', (e) => {
        window.filterGenes(e.target.value);
    });

    // Toggle all genes button
    elements.toggleAllGenes.addEventListener('click', () => {
        window.toggleAllGenes();
    });

    // === CELL CLASS WIDGET MANAGEMENT ===

    // Open cell class widget
    elements.cellClassPanelBtn.addEventListener('click', () => {
        window.showCellClassWidget();
    });

    // Close cell class widget
    elements.cellClassWidgetClose.addEventListener('click', () => {
        window.hideCellClassWidget();
    });

    // Undock cell class widget
    elements.cellClassWidgetUndock.addEventListener('click', () => {
        window.undockCellClassWidget();
    });

    // Close widget on backdrop click
    elements.cellClassWidgetBackdrop.addEventListener('click', () => {
        window.hideCellClassWidget();
    });

    // Cell class search functionality
    elements.cellClassSearch.addEventListener('input', (e) => {
        window.filterCellClasses(e.target.value);
    });

    // Toggle all cell classes button
    elements.toggleAllCellClasses.addEventListener('click', () => {
        window.toggleAllCellClasses();
    });

    // Cell class viewer button
    elements.cellClassViewerBtn.addEventListener('click', () => {
        window.openCellClassViewer();
    });

    // Z-Projection overlay toggle (ghost boundaries from all planes)
    const zProjectionToggle = document.getElementById('zProjectionToggle');
    const zProjectionControls = document.getElementById('zProjectionControls');
    const zProjectionOpacity = document.getElementById('zProjectionOpacity');
    const zProjectionOpacityValue = document.getElementById('zProjectionOpacityValue');

    if (zProjectionToggle) {
        zProjectionToggle.addEventListener('change', async () => {
            if (zProjectionToggle.checked) {
                const { isZProjectionReady } = await import('../modules/zProjectionOverlay.js');

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

    // Cell Projection Mode toggle (show all cells from all planes colored by class)
    const cellProjectionToggle = document.getElementById('cellProjectionToggle');
    const cellProjectionControls = document.getElementById('cellProjectionControls');
    const geneCountSlider = document.getElementById('geneCountSlider');
    const geneCountValue = document.getElementById('geneCountValue');

    if (cellProjectionToggle) {
        cellProjectionToggle.addEventListener('change', async () => {
            state.zProjectionCellMode = cellProjectionToggle.checked;

            // Show/hide gene count slider controls
            if (cellProjectionControls) {
                cellProjectionControls.style.display = cellProjectionToggle.checked ? 'block' : 'none';
            }

            if (cellProjectionToggle.checked) {
                // If features are already prepared, reuse them (butter-fast re-enable)
                const hasStable = Array.isArray(state.cellProjectionFeatures) && state.cellProjectionFeatures.length > 0;
                if (hasStable) {
                    updateLayersCallback();
                    return;
                }

                // If caches are already full, skip plane load and only prepare/flatten features with a short indicator
                try {
                    const { USE_ARROW } = await import('../config/constants.js');
                    const userConfig = window.config();
                    const totalPlanes = userConfig.totalPlanes;
                    if (USE_ARROW) {
                        const { arrowGeojsonCache } = await import('./layerCreators.js');
                        if (arrowGeojsonCache && arrowGeojsonCache.size >= totalPlanes) {
                            await prepareProjectionFromCaches(state);
                            updateLayersCallback();
                            return;
                        }
                    } else {
                        if (state.polygonCache && state.polygonCache.size >= totalPlanes) {
                            await prepareProjectionFromCaches(state);
                            updateLayersCallback();
                            return;
                        }
                    }
                } catch {}

                // Otherwise, load ALL planes and prepare features
                await loadAllPlanesForProjection(state, updateLayersCallback);
            } else {
                // Toggle OFF: clear stable features reference to free memory
                state.cellProjectionFeatures = null;
                if (window.appState) window.appState.cellProjectionFeatures = null;
                updateLayersCallback();
            }
        });
    }

    // Helper to prepare flattened feature array from existing caches with a brief indicator
    async function prepareProjectionFromCaches(state) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        if (loadingIndicator) {
            loadingIndicator.style.display = 'block';
            loadingIndicator.textContent = 'Preparing projection…';
            // Yield to the browser so the indicator can paint before heavy work
            await new Promise(resolve => requestAnimationFrame(resolve));
        }

        try {
            const { USE_ARROW } = await import('../config/constants.js');
            if (USE_ARROW) {
                const { arrowGeojsonCache } = await import('./layerCreators.js');
                const flat = [];
                for (const fc of arrowGeojsonCache.values()) {
                    if (fc && Array.isArray(fc.features)) flat.push(...fc.features);
                }
                state.cellProjectionFeatures = flat;
                window.appState && (window.appState.cellProjectionFeatures = flat);
                console.log(`Cell Projection features prepared from cache (Arrow): ${flat.length}`);
            } else {
                const flat = [];
                for (const fc of state.polygonCache.values()) {
                    if (!fc || !Array.isArray(fc.features)) continue;
                    for (const f of fc.features) {
                        const props = f.properties || (f.properties = {});
                        if (props) {
                            if (props.label != null) {
                                if (props.totalGeneCount == null && state.cellDataMap) {
                                    const cell = state.cellDataMap.get(Number(props.label));
                                    if (cell && cell.totalGeneCount != null) props.totalGeneCount = cell.totalGeneCount;
                                }
                                if (props.totalGeneCount == null) props.totalGeneCount = 0;
                            }
                            if (!props.colorRGB && props.cellClass && state.cellClassColors && state.cellClassColors.has(props.cellClass)) {
                                props.colorRGB = state.cellClassColors.get(props.cellClass);
                            }
                        }
                        flat.push(f);
                    }
                }
                state.cellProjectionFeatures = flat;
                window.appState && (window.appState.cellProjectionFeatures = flat);
                console.log(`Cell Projection features prepared from cache (TSV): ${flat.length}`);
            }
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    // Gene count slider for filtering cells in Cell Projection mode (rAF-throttled)
    let geneCountRafId = null;
    if (geneCountSlider) {
        geneCountSlider.addEventListener('input', (e) => {
            const threshold = parseInt(e.target.value);
            state.geneCountThreshold = threshold;
            if (geneCountValue) {
                geneCountValue.textContent = threshold.toString();
            }
            // Throttle updates to one per frame
            if (state.zProjectionCellMode && geneCountRafId == null) {
                geneCountRafId = requestAnimationFrame(() => {
                    geneCountRafId = null;
                    updateLayersCallback();
                });
            }
        });
    }


    // Escape key to close widgets
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.geneWidget.classList.contains('hidden')) {
                window.hideGeneWidget();
            }
            if (!elements.cellClassWidget.classList.contains('hidden')) {
                window.hideCellClassWidget();
            }
        }
    });

    // Handle messages from undocked gene panel
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
}

/**
 * Create debounced version of a function
 * Useful for preventing excessive calls during rapid user input
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Load ALL planes for Cell Projection mode
 * This ensures that all cell boundaries are available for Z-projection
 * @param {Object} state - Application state object
 * @param {Function} updateLayersCallback - Function to update layers after loading
 */
async function loadAllPlanesForProjection(state, updateLayersCallback) {
    const userConfig = window.config();
    const totalPlanes = userConfig.totalPlanes;

    // Import USE_ARROW from constants module
    const { USE_ARROW } = await import('../config/constants.js');

    console.log(`Loading ALL ${totalPlanes} planes for Cell Projection mode (Arrow: ${USE_ARROW})...`);

    // Show loading indicator
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Loading all planes...';
    }

    if (USE_ARROW) {
        // Arrow mode: Load boundary data for all planes AND build GeoJSON cache
        const { loadBoundariesPlane } = await import('../arrow-loader/lib/arrow-loaders.js');
        const { arrowBoundaryCache, arrowGeojsonCache } = await import('./layerCreators.js');
        const { transformToTileCoordinates } = await import('../utils/coordinateTransform.js');
        const { IMG_DIMENSIONS } = await import('../config/constants.js');

        for (let plane = 0; plane < totalPlanes; plane++) {
            try {
                // Update loading indicator
                if (loadingIndicator) {
                    loadingIndicator.textContent = `Loading plane ${plane + 1}/${totalPlanes}...`;
                }

                // Load boundaries into cache
                if (!arrowBoundaryCache.has(plane)) {
                    console.log(`Loading Arrow boundaries for plane ${plane}...`);
                    const { buffers } = await loadBoundariesPlane(plane);
                    arrowBoundaryCache.set(plane, buffers);
                }

                // Build GeoJSON cache for this plane (needed for Z-projection)
                if (!arrowGeojsonCache.has(plane)) {
                    const buffers = arrowBoundaryCache.get(plane);
                    if (buffers) {
                        console.log(`Building GeoJSON cache for plane ${plane}...`);

                        // Transform coordinates to tile space if needed
                        if (!buffers._tileTransformed) {
                            const src = buffers.positions;
                            const dst = new Float32Array(src.length);
                            for (let i = 0; i < src.length; i += 2) {
                                const x = src[i];
                                const y = src[i + 1];
                                const [tx, ty] = transformToTileCoordinates(x, y, IMG_DIMENSIONS);
                                dst[i] = tx;
                                dst[i + 1] = ty;
                            }
                            buffers.positions = dst;
                            buffers._tileTransformed = true;
                        }

                        // Build GeoJSON features
                        const { positions, startIndices, length, labels } = buffers;
                        const features = [];

                        for (let pi = 0; pi < length; pi++) {
                            const start = startIndices[pi];
                            const end = startIndices[pi + 1];
                            if (end - start < 3) continue;

                            const ring = [];
                            for (let i = start; i < end; i++) {
                                const x = positions[2 * i];
                                const y = positions[2 * i + 1];
                                ring.push([x, y]);
                            }

                            const label = labels ? labels[pi] : -1;

                            // Get cell class, totalGeneCount, and colorRGB from cellDataMap
                            let cellClass = 'Generic';
                            let totalGeneCount = 0;
                            let colorRGB = [192, 192, 192]; // Default gray
                            if (state.cellDataMap && label >= 0) {
                                const cell = state.cellDataMap.get(Number(label));
                                if (cell) {
                                    // Extract cell class
                                    if (cell.classification) {
                                        const names = cell.classification.className;
                                        const probs = cell.classification.probability;
                                        if (Array.isArray(names) && Array.isArray(probs) && probs.length > 0) {
                                            let bestIdx = 0;
                                            let bestProb = probs[0];
                                            for (let j = 1; j < probs.length; j++) {
                                                if (probs[j] > bestProb) {
                                                    bestProb = probs[j];
                                                    bestIdx = j;
                                                }
                                            }
                                            cellClass = names[bestIdx] || 'Unknown';
                                        }
                                    }
                                    // Extract totalGeneCount for GPU filtering
                                    totalGeneCount = cell.totalGeneCount || 0;

                                    // Precompute RGB color for this class (avoid hot path lookups)
                                    if (state.cellClassColors && state.cellClassColors.has(cellClass)) {
                                        colorRGB = state.cellClassColors.get(cellClass);
                                    }
                                }
                            }

                            features.push({
                                type: 'Feature',
                                geometry: { type: 'Polygon', coordinates: [ring] },
                                properties: { plane_id: plane, label, cellClass, totalGeneCount, colorRGB }
                            });
                        }

                        arrowGeojsonCache.set(plane, { type: 'FeatureCollection', features });
                        console.log(`Built GeoJSON cache for plane ${plane}: ${features.length} features`);
                    }
                }
            } catch (error) {
                console.error(`Failed to load plane ${plane}:`, error);
            }
        }
    } else {
        // TSV mode: Load polygon data for all planes
        const { loadPolygonData } = await import('./dataLoaders.js');

        for (let plane = 0; plane < totalPlanes; plane++) {
            try {
                // Update loading indicator
                if (loadingIndicator) {
                    loadingIndicator.textContent = `Loading plane ${plane + 1}/${totalPlanes}...`;
                }

                // Load polygons if not already cached
                if (!state.polygonCache.has(plane)) {
                    console.log(`Loading TSV polygons for plane ${plane}...`);
                    await loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap);
                }
            } catch (error) {
                console.error(`Failed to load plane ${plane}:`, error);
            }
        }
    }

    // Hide loading indicator
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    if (USE_ARROW) {
        const { arrowGeojsonCache } = await import('./layerCreators.js');
        console.log(`Finished loading all ${totalPlanes} planes for Cell Projection. arrowGeojsonCache has ${arrowGeojsonCache.size} planes cached.`);

        // Build flattened, stable features array for projection (reuse across updates)
        try {
            const flat = [];
            for (const fc of arrowGeojsonCache.values()) {
                if (fc && Array.isArray(fc.features)) flat.push(...fc.features);
            }
            state.cellProjectionFeatures = flat;
            window.appState && (window.appState.cellProjectionFeatures = flat);
            console.log(`Cell Projection features prepared (Arrow): ${flat.length}`);
        } catch (e) {
            console.warn('Failed to prepare flattened projection features (Arrow):', e);
        }
    } else {
        console.log(`Finished loading all ${totalPlanes} planes for Cell Projection. polygonCache has ${state.polygonCache.size} planes cached.`);

        // Enrich TSV features with totalGeneCount and precomputed color, then flatten
        try {
            const flat = [];
            for (const fc of state.polygonCache.values()) {
                if (!fc || !Array.isArray(fc.features)) continue;
                for (const f of fc.features) {
                    const props = f.properties || (f.properties = {});
                    if (props) {
                        // totalGeneCount from state.cellDataMap
                        if (props.label != null) {
                            if (props.totalGeneCount == null && state.cellDataMap) {
                                const cell = state.cellDataMap.get(Number(props.label));
                                if (cell && cell.totalGeneCount != null) {
                                    props.totalGeneCount = cell.totalGeneCount;
                                }
                            }
                            if (props.totalGeneCount == null) props.totalGeneCount = 0; // ensure numeric for GPU filter
                        }
                        // colorRGB from state.cellClassColors
                        if (!props.colorRGB && props.cellClass && state.cellClassColors && state.cellClassColors.has(props.cellClass)) {
                            props.colorRGB = state.cellClassColors.get(props.cellClass);
                        }
                    }
                    flat.push(f);
                }
            }
            state.cellProjectionFeatures = flat;
            window.appState && (window.appState.cellProjectionFeatures = flat);
            console.log(`Cell Projection features prepared (TSV): ${flat.length}`);
        } catch (e) {
            console.warn('Failed to prepare flattened projection features (TSV):', e);
        }
    }

    // Update layers to show the projection using stable data
    updateLayersCallback();
}

/**
 * Setup keyboard shortcuts for advanced users
 * Additional keyboard controls beyond basic arrow navigation
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
                updatePlaneCallback(0); // Go to first plane
                break;

            case 'End':
                e.preventDefault();
                updatePlaneCallback(99); // Go to last plane
                break;

            case 'PageUp':
                e.preventDefault();
                updatePlaneCallback(state.currentPlane - 10); // Jump backward 10 planes
                break;

            case 'PageDown':
                e.preventDefault();
                updatePlaneCallback(state.currentPlane + 10); // Jump forward 10 planes
                break;

            case 't':
            case 'T':
                // Toggle tiles
                state.showTiles = !state.showTiles;
                document.getElementById('showTiles').checked = state.showTiles;
                updateLayersCallback();
                break;

            case 'p':
            case 'P':
                // Toggle polygons
                state.showPolygons = !state.showPolygons;
                document.getElementById('showPolygons').checked = state.showPolygons;
                updateLayersCallback();
                break;

            // Gene toggle removed - genes are always visible
        }
    });
    // === TOP TOOLBAR + DRAWER ===
    const toolbarSettings = document.getElementById('toolbarSettings');
    const toolbarShowTiles = document.getElementById('toolbarShowTiles');
    const toolbarShowPolygons = document.getElementById('toolbarShowPolygons');
    const toolbarShowGenes = document.getElementById('toolbarShowGenes');
    const toolbarCellProjection = document.getElementById('toolbarCellProjection');
    const rightDrawer = document.getElementById('rightDrawer');
    const drawerClose = document.getElementById('drawerClose');

    if (toolbarSettings && rightDrawer) {
        toolbarSettings.addEventListener('click', () => {
            rightDrawer.style.display = 'block';
        });
    }
    if (drawerClose && rightDrawer) {
        drawerClose.addEventListener('click', () => {
            rightDrawer.style.display = 'none';
        });
    }
    const tilesCheckbox = document.getElementById('showTiles');
    if (toolbarShowTiles && tilesCheckbox) {
        toolbarShowTiles.addEventListener('click', () => {
            tilesCheckbox.checked = !tilesCheckbox.checked;
            tilesCheckbox.dispatchEvent(new Event('change'));
        });
    }
    const polygonsCheckbox = document.getElementById('showPolygons');
    if (toolbarShowPolygons && polygonsCheckbox) {
        toolbarShowPolygons.addEventListener('click', () => {
            polygonsCheckbox.checked = !polygonsCheckbox.checked;
            polygonsCheckbox.dispatchEvent(new Event('change'));
        });
    }
    if (toolbarShowGenes) {
        toolbarShowGenes.addEventListener('click', () => {
            state.showGenes = !state.showGenes;
            updateLayersCallback();
        });
    }
    if (toolbarCellProjection) {
        toolbarCellProjection.addEventListener('click', () => {
            const toggle = document.getElementById('cellProjectionToggle');
            if (toggle) {
                toggle.checked = !toggle.checked;
                toggle.dispatchEvent(new Event('change'));
            }
        });
    }
}
