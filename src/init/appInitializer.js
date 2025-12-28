/**
 * App Initializer Module
 *
 * Contains initialization phases for the application startup.
 * Breaks down the large init() function into smaller, focused phases.
 */

import { INITIAL_VIEW_STATE, ARROW_MANIFESTS } from '../../config/constants.js';
import { state } from '../state/stateManager.js';
import { elements } from '../domElements.js';
import { updateScaleBar } from '../../utils/scaleBar.js';
import { updateCoordinateDisplay } from '../../utils/coordinateDisplay.js';
import { showLoading, hideLoading, showTooltip } from '../ui/uiHelpers.js';
import {
    loadGeneData,
    loadCellData,
    loadPolygonData,
    assignColorsToCellClasses,
    buildGeneSpotIndexes
} from '../data/dataLoaders.js';
import { PolygonBoundaryHighlighter } from '../ui/polygonInteractions.js';
import { RectangularSelector } from '../ui/rectangularSelector.js';
import { applyPendingClassColorSchemeIfAny } from '../classColorImport.js';
import { populateCellClassDrawer } from '../cellClassDrawer.js';
import { populateGeneDrawer } from '../geneDrawer.js';
import Perf from '../../utils/runtimePerf.js';

// Extract deck.gl components
const { DeckGL, OrthographicView, COORDINATE_SYSTEM } = deck;

/**
 * Initialize the deck.gl instance
 * @param {Function} onViewStateChange - Callback for view state changes
 * @param {Function} onHover - Callback for hover events
 * @returns {DeckGL} The initialized deck.gl instance
 */
export function initializeDeckGL(onViewStateChange, onHover) {
    const deckglInstance = new DeckGL({
        container: 'map',
        views: [new OrthographicView({ id: 'ortho' })],
        initialViewState: INITIAL_VIEW_STATE,
        controller: {
            minZoom: 0,
            maxZoom: 8,
            scrollZoom: true,
            doubleClickZoom: true,
            touchZoom: true,
            keyboard: false  // Disable deck.gl keyboard to prevent conflicts
        },
        onViewStateChange: onViewStateChange,
        onHover: onHover,
        getCursor: ({ isHovering }) => {
            try {
                const active = window.appState?.rectangularSelector?.isActive;
                if (active) return 'crosshair';
            } catch {}
            return isHovering ? 'pointer' : 'default';
        },
        layers: []
    });

    // Initialize scale bar with initial view state
    updateScaleBar(INITIAL_VIEW_STATE);

    return deckglInstance;
}

/**
 * Derive total planes from Arrow boundaries manifest
 * @returns {Promise<{totalPlanes: number, startingPlane: number}>}
 */
export async function derivePlanesFromManifest() {
    const userConfig = window.config();

    if (!userConfig.arrowBoundariesManifest) {
        throw new Error('arrowBoundariesManifest is not configured');
    }

    const manifestUrl = new URL(userConfig.arrowBoundariesManifest, window.location.href).href;
    const manifest = await fetch(manifestUrl).then(r => r.json());

    let totalPlanes = 0;
    if (manifest && Array.isArray(manifest.shards)) {
        const planes = manifest.shards.map(s => Number(s.plane)).filter(n => Number.isFinite(n));
        totalPlanes = planes.length > 0 ? (Math.max(...planes) + 1) : manifest.shards.length;
    }

    if (!Number.isFinite(totalPlanes) || totalPlanes <= 0) {
        throw new Error('Invalid totalPlanes derived from manifest');
    }

    const startingPlane = Math.floor(totalPlanes / 2);

    return { totalPlanes, startingPlane };
}

/**
 * Initialize the plane slider UI
 * @param {number} totalPlanes - Total number of planes
 * @param {number} startingPlane - Initial plane to display
 */
export function initializePlaneSlider(totalPlanes, startingPlane) {
    window.appState.totalPlanes = totalPlanes;
    console.log(`The image has ${totalPlanes} planes`);

    state.currentPlane = startingPlane;
    elements.slider.min = 0;
    elements.slider.max = totalPlanes - 1;
    elements.slider.value = state.currentPlane;
    elements.label.textContent = `Plane: ${state.currentPlane}`;
}

/**
 * Initialize gene data and icon atlas
 * @returns {Promise<void>}
 */
export async function initializeGeneData() {
    const { atlas, mapping } = await loadGeneData(state.geneDataMap, state.selectedGenes);
    state.geneIconAtlas = atlas;
    state.geneIconMapping = mapping;

    // Sync dataset capability flags from worker-populated appState
    try {
        state.hasScores = Boolean(window.appState && window.appState.hasScores);
        state.hasIntensity = Boolean(window.appState && window.appState.hasIntensity);
    } catch {}

    // Show/hide score and intensity filter sliders based on dataset fields
    updateFilterSliderVisibility();
}

/**
 * Update visibility of score and intensity filter sliders
 */
function updateFilterSliderVisibility() {
    const scoreFilterContainer = document.querySelector('.score-filter-item');
    if (scoreFilterContainer) {
        scoreFilterContainer.style.display = state.hasScores ? 'flex' : 'none';
        console.log(state.hasScores ? 'Score filter enabled: dataset contains valid OMP scores' : 'Score filter disabled: dataset has no valid OMP scores');
    }

    const intensityFilterContainer = document.querySelector('.intensity-filter-item');
    if (intensityFilterContainer) {
        intensityFilterContainer.style.display = state.hasIntensity ? 'flex' : 'none';
        console.log(state.hasIntensity ? 'Intensity filter enabled: dataset contains intensities' : 'Intensity filter disabled: dataset has no intensities');
    }
}

/**
 * Initialize polygon highlighter for cell interactions
 */
export function initializePolygonHighlighter() {
    state.polygonHighlighter = new PolygonBoundaryHighlighter(
        state.deckglInstance,
        COORDINATE_SYSTEM.CARTESIAN,
        state.cellToSpotsIndex,
        state.geneToId,
        state.cellDataMap
    );
    state.polygonHighlighter.initialize();
}

/**
 * Initialize rectangular selector for 3D view
 */
export function initializeRectangularSelector() {
    state.rectangularSelector = new RectangularSelector(state.deckglInstance, state);

    // Ensure it's accessible via window.appState
    window.appState.rectangularSelector = state.rectangularSelector;

    // Setup selection tool button
    const selectionToolBtn = document.getElementById('selectionToolBtn');
    if (selectionToolBtn) {
        selectionToolBtn.addEventListener('click', () => {
            state.rectangularSelector.toggle();
        });
    }

    console.log('Rectangular selector ready - Click selection tool icon to toggle');
}

/**
 * Initialize cell data and update related UI
 * @returns {Promise<void>}
 */
export async function initializeCellData() {
    console.log('Loading cell data...');
    await loadCellData(state.cellDataMap);

    // Compute max total gene count once for UI slider bounds
    computeMaxGeneCount();

    // Initialize class colors and default selection from cell data
    initializeCellClassColors();
}

/**
 * Compute max total gene count for slider bounds
 */
function computeMaxGeneCount() {
    try {
        let maxCount = 0;
        state.cellDataMap.forEach(cell => {
            const v = cell && typeof cell.totalGeneCount === 'number' ? cell.totalGeneCount : 0;
            if (v > maxCount) maxCount = v;
        });
        state.maxTotalGeneCount = Math.max(0, maxCount) || 100;

        const slider = document.getElementById('geneCountSlider');
        const valueEl = document.getElementById('geneCountValue');
        if (slider) {
            slider.max = String(state.maxTotalGeneCount);
            if (Number(slider.value) > state.maxTotalGeneCount) {
                slider.value = '0';
                state.geneCountThreshold = 0;
                if (valueEl) valueEl.textContent = '0';
            }
        }
        console.log(`Max total gene count computed: ${state.maxTotalGeneCount}`);
    } catch (e) {
        console.warn('Failed to compute max total gene count for slider bounds:', e);
    }
}

/**
 * Initialize cell class colors from cell data
 */
function initializeCellClassColors() {
    state.allCellClasses.clear();
    state.cellDataMap.forEach((cell, cellId) => {
        const names = cell?.classification?.className;
        if (Array.isArray(names) && names.length > 0) {
            const className = names[0];
            if (className === 'Unknown') {
                console.warn(`Found cell ${cellId} with 'Unknown' class name in source data. Full classification:`, names);
            }
            state.allCellClasses.add(className);
        }
    });

    assignColorsToCellClasses(state.allCellClasses, state.cellClassColors);

    // Apply pending color scheme if any
    try {
        const res = applyPendingClassColorSchemeIfAny();
        if (res && res.appliedCount > 0) {
            console.log(`Applied pending colour scheme: ${res.appliedCount} classes`);
            try { populateCellClassDrawer(); } catch {}
            if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
        }
    } catch {}

    // Ensure all classes are selected by default
    if (state.selectedCellClasses.size === 0) {
        state.allCellClasses.forEach(c => state.selectedCellClasses.add(c));
    }
}

/**
 * Preload adjacent planes in background
 */
export function preloadAdjacentPlanesInitial() {
    const totalPlanes = window.appState.totalPlanes;
    const adjacentPlanes = [
        Math.max(0, state.currentPlane - 1),
        Math.min(totalPlanes - 1, state.currentPlane + 1)
    ];

    adjacentPlanes.forEach(async (plane) => {
        if (plane !== state.currentPlane && !state.polygonCache.has(plane)) {
            console.log(`Init: Preloading polygon data for adjacent plane ${plane}`);
            loadPolygonData(plane, state.polygonCache, state.allCellClasses, state.cellDataMap).catch(() => {
                console.log(`Init: Failed to preload plane ${plane} (non-critical)`);
            });
        }
    });
}

/**
 * Finalize initialization - populate UI and update layers
 * @param {Function} updateAllLayers - Function to update all layers
 */
export function finalizeInitialization(updateAllLayers) {
    // Ensure all cell classes are selected
    state.allCellClasses.forEach(cellClass => state.selectedCellClasses.add(cellClass));

    // Populate the cell class drawer with ranked list
    populateCellClassDrawer();

    // Populate the gene drawer
    populateGeneDrawer();

    // Now safely update all layers
    updateAllLayers();

    // Mark interactive for Arrow path
    try { Perf.markInteractive('arrow', { plane: state.currentPlane }); } catch {}
}

/**
 * Remove the initial loading curtain
 */
export function removeCurtain() {
    try {
        const curtain = document.getElementById('appCurtain');
        if (curtain) {
            curtain.classList.add('hidden');
            setTimeout(() => { curtain.style.display = 'none'; }, 350);
        }
    } catch {}
}