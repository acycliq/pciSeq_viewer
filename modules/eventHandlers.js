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

    // Z-Projection overlay toggle
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
}
