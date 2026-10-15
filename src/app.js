/**
 * Main Application Entry Point (Electron Desktop App)
 *
 * This module orchestrates the initialization and runtime of the pciSeq viewer.
 * It imports specialized modules for different concerns and coordinates their interaction.
 */

// === CONFIGURATION IMPORTS ===
import { INITIAL_VIEW_STATE, MAX_PRELOAD, IMG_DIMENSIONS, SPOT_PICKABLE_MIN_ZOOM, setChannelTints } from '../config/constants.js';

// === STATE AND DOM IMPORTS ===
import { state } from './state/stateManager.js';
import { elements } from './domElements.js';

// === UTILITY IMPORTS ===
import { transformToTileCoordinates, clamp } from '../utils/coordinateTransform.js';
import { updateScaleBar } from '../utils/scaleBar.js';
import { updateCoordinateDisplay } from '../utils/coordinateDisplay.js';
import { planeOf } from '../utils/planes.js';
import { debounce } from '../utils/common.js';
import Perf from '../utils/runtimePerf.js';

// === UI IMPORTS ===
import { showLoading, hideLoading, showLoadStatus, hideLoadStatus, showTooltip, showScreen } from './ui/uiHelpers.js';
import { showMetadataError } from './ui/metadataError.js';
import { initChannelSwitcher } from './ui/channelSwitcher.js';
import { initTooltips } from './ui/tooltip.js';
import { initChatPanel } from './chatPanel.js';
import { initTour } from './tour.js';
import { initChatImageComposer } from './chatImageComposer.js';
import { initCellClassDrawer, populateCellClassDrawer } from './cellClassDrawer.js';
import { sendLegend } from './legendSync.js';
import { openChunkAroundCell } from './cellChunk.js';
import { showNotification } from './ui/notification.js';
import { initGeneDrawer, populateGeneDrawer } from './geneDrawer.js';
import { init as initCellInfoPanel } from './cellInfoPanel/index.js';
import { applyPendingClassColorSchemeIfAny, applyClassColorScheme } from './classColorImport.js';
import { applyGeneScheme } from './geneColorImport.js';

// === INITIALIZATION IMPORTS ===
import {
    initializeDeckGL,
    initializePlaneSlider,
    initializeGeneData,
    initializePolygonHighlighter,
    initializeRectangularSelector,
    initializeRegionDrawer,
    initializeCellData,
    selectAllCellClasses,
    finalizeInitialization,
    removeCurtain
} from './init/appInitializer.js';

// === LAYER IMPORTS ===
import {
    buildTileLayers,
    buildPolygonLayers,
    buildCellSpotLineLayer,
    buildSpotLayers,
    buildRegionLayers,
    buildZProjectionLayer,
    logZoomTransitionMetrics
} from './layers/layerBuilder.js';
import { buildGlobalZProjection } from './layers/zProjectionOverlay.js';

// === DATA IMPORTS ===
import {
    loadGeneData,
    loadCellData,
} from './data/dataLoaders.js';
import { streamSpotsIntoScatterCache } from './data/spotStreamLoader.js';
import { buildGeneSpotIndexes, assignColorsToCellClasses } from './data/cellIndexes.js';

// === EVENT HANDLING IMPORTS ===
import { setupEventHandlers, setupAdvancedKeyboardShortcuts, setCellProjection, runPerClassExport } from './events/eventHandlers.js';
import { setupCheckCellBridge, openCheckCellModal, openCheckCellCompare } from './checkCellBridge.js';
import { setupCheckSpotBridge, openCheckSpotModal } from './checkSpotBridge.js';

// === MISREADS IMPORTS ===
import { showRhoBarWidget }     from './misreads/rhoBar/RhoBarWidget.js';
import { openChart } from './chatCharts.js';
import './ui/chartLaunchers.js';
import { showStackedBarWidget } from './misreads/stackedBar/StackedBarWidget.js';
import { showPerPlaneWidget }   from './misreads/perPlane/PerPlaneWidget.js';

// === UI INTERACTION IMPORTS ===
import { startSpatialIndexing } from './ui/spatialIndexing.js';
import { loadPlane, preloadAround, nearestLoadedPlane } from './data/planeCells.js';

// === WIDGET IMPORTS ===
import {
    showCellClassWidget,
    hideCellClassWidget,
    filterCellClasses,
    toggleAllCellClasses,
    undockCellClassWidget,
    populateCellClassWidget,
    updateToggleAllCellClassesButton
} from './cellClassWidget.js';

import {
    initGeneDistributionChart,
    showGeneDistributionWidget,
    hideGeneDistributionWidget
} from './geneDistributionChart.js';
import {
    initCellClassDistributionChart,
    showCellClassDistributionWidget,
    hideCellClassDistributionWidget
} from './cellClassDistributionChart.js';
import {
    initCellClassPercentageChart,
    showCellClassPercentageWidget,
    hideCellClassPercentageWidget
} from './cellClassPercentageChart.js';
import {
    showExpressionHistogramWidget,
    hideExpressionHistogramWidget
} from './expressionHistogramChart.js';
import {
    showControlsPanel,
    hideControlsPanel,
    toggleControlsPanel,
    updateScaleBarOffset
} from './controlsPanel.js';
import {
    deleteRegion,
    toggleRegionVisibility,
    takeOldStoredRegions,
    renderRegionsList,
    syncAnnotationsToMain,
    addCellAnnotation,
    addAllenRegions,
    saveAnnotations,
    openAnnotations,
    getRegionBoundaries,
    getVisibleRegions
} from './regionsManager.js';

// === GLOBAL EXPORTS FOR WIDGETS ===
// Cell class widget functions
window.showCellClassWidget = showCellClassWidget;
window.hideCellClassWidget = hideCellClassWidget;
window.filterCellClasses = filterCellClasses;
window.toggleAllCellClasses = toggleAllCellClasses;
window.undockCellClassWidget = undockCellClassWidget;


// Gene distribution chart functions
window.showGeneDistributionWidget = showGeneDistributionWidget;
window.hideGeneDistributionWidget = hideGeneDistributionWidget;

// Cell class distribution chart functions
window.showCellClassDistributionWidget = showCellClassDistributionWidget;
window.hideCellClassDistributionWidget = hideCellClassDistributionWidget;

// Cell class percentage chart functions
window.showCellClassPercentageWidget = showCellClassPercentageWidget;
window.hideCellClassPercentageWidget = hideCellClassPercentageWidget;

// Expression histogram chart functions
window.showExpressionHistogramWidget = showExpressionHistogramWidget;

// Misread chart functions
window.showRhoBarWidget     = showRhoBarWidget;
window.showStackedBarWidget = showStackedBarWidget;
window.showPerPlaneWidget   = showPerPlaneWidget;
window.hideExpressionHistogramWidget = hideExpressionHistogramWidget;

// Controls panel (drawer) functions
window.showControlsPanel = showControlsPanel;
window.hideControlsPanel = hideControlsPanel;
window.toggleControlsPanel = toggleControlsPanel;

// Region management functions
window.saveAnnotations = saveAnnotations;
window.openAnnotations = openAnnotations;
window.deleteRegion = deleteRegion;
window.toggleRegionVisibility = toggleRegionVisibility;
window.getRegionBoundaries = getRegionBoundaries;
window.getVisibleRegions = getVisibleRegions;

// check_cell bridge
window.openCheckCellModal = openCheckCellModal;
// check_spot bridge
window.openCheckSpotModal = openCheckSpotModal;

// Coordinate transformation for child windows
window.transformToTileCoordinates = transformToTileCoordinates;


// Expose lightweight cell metadata lookup for child windows (voxel viewer)
// Returns { className, totalGeneCount, position, plane_id, probability } or null if not available
window.getCellMeta = (cellId) => {
    try {
        if (!state || !state.cellDataMap) return null;
        const cell = state.cellDataMap.get(Number(cellId));
        if (!cell) return null;

        const classArr = cell?.classification?.className;
        const className = Array.isArray(classArr) && classArr.length > 0
            ? String(classArr[0])
            : 'Unknown';

        const total = (typeof cell.totalGeneCount === 'number') ? cell.totalGeneCount : 0;

        // Extract probability for the top class
        let probability = undefined;
        if (cell?.classification?.probability && Array.isArray(cell?.classification?.probability)) {
            probability = cell.classification.probability[0];
        }

        // Derive plane_id from position.z using voxel size ratio
        let plane_id = undefined;
        if (cell.position && cell.position.z !== undefined) {
            const cfg = window.config ? window.config() : null;
            if (cfg && Array.isArray(cfg.voxelSize)) {
                // floor, not round, see utils/planes.js for why
                plane_id = planeOf(cell.position.z, cfg.voxelSize);
            } else {
                plane_id = planeOf(cell.position.z, [1, 1, 1]);
            }
        }

        return {
            className,
            totalGeneCount: total,
            position: cell.position, // {x, y, z}
            plane_id,
            probability: probability
        };
    } catch {
        return null;
    }
};

// === ZOOM MODE TRACKING ===
let __lastZoomMode = null; // 'pc' or 'icon'
let __lastDragging = false; // track pan-drag state
let __lastInteracting = false; // track drag/zoom interaction state
let __lastViewZoom = null; // track zoom value for overlay refresh fallback
let __lineOverlayZoomRefreshTimer = null; // debounce timer for Ctrl+L overlay refresh on zoom

function scheduleLineOverlayZoomRefresh() {
    if (__lineOverlayZoomRefreshTimer) {
        clearTimeout(__lineOverlayZoomRefreshTimer);
    }
    __lineOverlayZoomRefreshTimer = setTimeout(() => {
        __lineOverlayZoomRefreshTimer = null;
        if (state.showCellSpotLines) {
            updateAllLayers();
        }
    }, 120);
}

// === VIEWPORT BOUNDS ===
/**
 * Compute current viewport bounds in tile (deck) coordinates
 * @returns {Object|null} Bounds object with minX, minY, maxX, maxY or null
 */
// what the map shows now, for the viewer_state tool. Coordinates are image
// pixels, the same as the cells and spots; the map works in tile units, 256 across
// the longer side of the image.
function viewerSnapshot() {
    const cfg = (window.config && window.config()) || {};
    const longer = Math.max(cfg.imageWidth || 0, cfg.imageHeight || 0) || 256;
    const px = v => Math.round(v * longer / 256);
    const listed = (shown, all) => {
        const on = all.filter(n => shown.has(n));
        const out = { shown: on.length, of: all.length };
        if (on.length === all.length) out.which = 'all';
        else if (on.length === 0) out.which = 'none';
        else if (on.length <= 25) out.which = on;
        else if (all.length - on.length <= 25) out.hidden = all.filter(n => !shown.has(n));
        return out;
    };
    const b = getCurrentViewportTileBounds();
    let zoom = null;
    try { zoom = state.deckglInstance.viewManager.getViewState('ortho').zoom; } catch {}
    const misreads = state.hideMisreads ? 'hidden' : state.greyOutMisreads ? 'greyed out' : 'shown';
    const genes = Array.from(state.geneDataMap.keys());
    const classes = Array.from(state.allCellClasses);
    return {
        plane: state.currentPlane,
        planes: cfg.planeCount ?? null,
        zoom: zoom == null ? null : Math.round(zoom * 100) / 100,
        // the screen can show more than the image when zoomed out: cut to the image
        in_view: b ? {
            x_from: Math.max(0, px(b.minX)), x_to: Math.min(cfg.imageWidth || Infinity, px(b.maxX)),
            y_from: Math.max(0, px(b.minY)), y_to: Math.min(cfg.imageHeight || Infinity, px(b.maxY)),
        } : null,
        in_view_is: 'the part of the image on screen, in image pixels, the same as the cell and spot coordinates',
        image: { width: cfg.imageWidth ?? null, height: cfg.imageHeight ?? null },
        genes: listed(state.selectedGenes, genes),
        // the classes that have cells in this run, as listed in the drawer
        classes: listed(state.selectedCellClasses, classes),
        spots: {
            drawn: !!state.showGenes,
            size: state.geneSizeScale,
            uniform_size: !!state.uniformMarkerSize,
            score_filter: state.hasScores ? +Number(state.scoreThreshold).toPrecision(4) : 'not available, this run has no scores',
            score_range: state.hasScores ? (state.scoreRange || []).map(v => +Number(v).toPrecision(4)) : null,
            intensity_filter: state.hasIntensity ? +Number(state.intensityThreshold).toPrecision(4) : 'not available, this run has no intensities',
            intensity_range: state.hasIntensity ? (state.intensityRange || []).map(v => +Number(v).toPrecision(4)) : null,
            misreads,
        },
        layers: {
            background: !!state.showTiles,
            // the name the channel radio shows, the same as map_layers gives
            background_channel: (() => {
                const r = [...document.querySelectorAll('input[name="background-channel"]')].find(x => x.value === state.currentChannel);
                return (r && r.parentElement?.textContent?.trim()) || state.currentChannel || null;
            })(),
            cells: !!state.showPolygons,
            cell_opacity: state.polygonOpacity,
            cells_from_all_planes: !!state.zProjectionCellMode,
            gene_count_range: state.zProjectionCellMode
                ? [state.geneCountThreshold, Number.isFinite(state.geneCountMaxThreshold) ? state.geneCountMaxThreshold : null]
                : null,
            all_planes_overlay: !!state.showZProjectionOverlay,
            spot_to_cell_lines: !!state.showCellSpotLines,
        },
    };
}

function getCurrentViewportTileBounds() {
    try {
        const vps = state.deckglInstance && state.deckglInstance.getViewports && state.deckglInstance.getViewports();
        const vp = vps && vps[0];
        if (!vp) return null;
        const w = vp.width || 0, h = vp.height || 0;
        const p0 = vp.unproject([0, h]);     // bottom-left screen -> world
        const p1 = vp.unproject([w, 0]);     // top-right screen -> world
        const minX = Math.min(p0[0], p1[0]);
        const maxX = Math.max(p0[0], p1[0]);
        const minY = Math.min(p0[1], p1[1]);
        const maxY = Math.max(p0[1], p1[1]);
        return { minX, minY, maxX, maxY };
    } catch (e) {
        console.warn('Failed to compute viewport bounds:', e);
        return null;
    }
}

// === MAIN UPDATE FUNCTION ===
/**
 * Update all deck.gl layers
 * Orchestrates the layer stack construction from specialized builder functions
 */
function updateAllLayers() {
    if (!state.deckglInstance) return;

    const layers = [];

    // Build tile layers (background images)
    layers.push(...buildTileLayers(state, elements));

    // Build polygon layers (cell boundaries)
    layers.push(...buildPolygonLayers(state));

    // Build current-plane cell-to-spot line overlay (viewport-only)
    layers.push(...buildCellSpotLineLayer(state, getCurrentViewportTileBounds));

    // Build spot layers (genes - PointCloud or IconLayers based on zoom)
    layers.push(...buildSpotLayers(state, elements, getCurrentViewportTileBounds));

    // Build region overlay layers (user-imported boundaries)
    layers.push(...buildRegionLayers(state, elements));

    // Preserve pinned line layers from polygon highlighter
    if (state.polygonHighlighter && state.polygonHighlighter.pinnedLineLayer) {
        layers.push(state.polygonHighlighter.pinnedLineLayer);
    }

    // Build Z-projection overlay layer if enabled
    layers.push(...buildZProjectionLayer(state));

    // Update deck.gl with new layer stack
    state.deckglInstance.setProps({ layers: layers });

    // Log zoom transition metrics if profiling enabled
    logZoomTransitionMetrics(state, layers);
}

// Expose updateAllLayers globally for widget modules
window.updateAllLayers = updateAllLayers;

// settles once the spots are in and the gene list is built (init step 9). The
// chat's show_genes waits on it, since before that the spot stream resets the
// selection to every gene and the gene list is still empty
let resolveSpotsReady;
const spotsReady = new Promise(r => { resolveSpotsReady = r; });

// === PLANE UPDATE WRAPPER ===
/**
 * Wrapper function for plane updates that passes required dependencies
 * @param {number} newPlane - Target plane number
 */
function updatePlane(newPlane) {
    newPlane = clamp(newPlane, 0, window.appState.totalPlanes - 1);
    if (newPlane === state.currentPlane) return;

    state.currentPlane = newPlane;
    elements.slider.value = newPlane;
    elements.label.textContent = `Plane: ${newPlane}`;

    // The background and the spots change at once. The cells are those of the loaded
    // plane nearest to this one (layerBuilder), so the map is never without cells; when
    // this plane's own cells arrive they take over, unless the user has moved on to a
    // plane that something nearer is loaded for.
    updateAllLayers();
    if (!state.polygonCache.has(newPlane)) {
        loadPlane(newPlane).then(() => {
            if (nearestLoadedPlane(state.currentPlane) === newPlane) updateAllLayers();
        });
    }
    preloadAround(newPlane);
}

// Expose updatePlane globally for cell lookup module
window.updatePlane = updatePlane;

// === VIEW STATE CHANGE HANDLER ===
/**
 * Handle deck.gl view state changes
 * Updates scale bar, manages zoom transitions, and triggers layer updates
 * @param {Object} params - View state change parameters
 * @returns {Object} Updated view state
 */
function handleViewStateChange({ viewState, interactionState }) {
    // Update scale bar when view changes
    updateScaleBar(viewState);

    try {
        state.currentZoom = viewState.zoom;
        // Also stamp on window.appState so modules that read globals can gate
        // behavior by zoom level without importing `state`.
        if (window.appState) window.appState.currentZoom = viewState.zoom;
    } catch {}
    const zoomChanged = (__lastViewZoom !== null) && (Math.abs((viewState.zoom ?? 0) - __lastViewZoom) > 1e-6);
    __lastViewZoom = viewState.zoom ?? __lastViewZoom;

    // Update layers based on zoom mode transitions
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : { performance: { showPerformanceStats: false } };
        const mode = (viewState.zoom < SPOT_PICKABLE_MIN_ZOOM) ? 'pc' : 'icon';
        const dragging = Boolean(interactionState && interactionState.isDragging);
        const interacting = Boolean(interactionState && (interactionState.isDragging || interactionState.isZooming));

        if (mode !== __lastZoomMode) {
            // Zoom mode changed - trigger transition
            if (adv.performance.showPerformanceStats) {
                state.zoomTransition = { inProgress: true, from: __lastZoomMode, to: mode, start: performance.now() };
                console.log(`[TRANSITION] Start: ${state.zoomTransition.from || 'none'} -> ${mode} at zoom ${viewState.zoom.toFixed(2)}`);
                performance.mark('zoom-transition-start');
            }

            __lastZoomMode = mode;
            __lastDragging = dragging;
            __lastInteracting = interacting;

            // Measure and update layers
            if (adv.performance.showPerformanceStats) {
                const beforeUpdate = performance.now();
                updateAllLayers();
                const afterUpdate = performance.now();
                console.log(`[TRANSITION] updateAllLayers() JS time: ${(afterUpdate - beforeUpdate).toFixed(2)}ms`);

                // Measure when the browser actually paints
                requestAnimationFrame(() => {
                    performance.mark('zoom-transition-frame1');
                    requestAnimationFrame(() => {
                        performance.mark('zoom-transition-complete');
                        const totalTime = performance.now() - beforeUpdate;
                        console.log(`[TRANSITION] TOTAL time to screen (including GPU): ${totalTime.toFixed(2)}ms`);
                    });
                });
            } else {
                updateAllLayers();
            }
        } else if (mode === 'icon') {
            // At deep zoom: rebuild on pan-end, and rebuild viewport-cropped line overlay on interaction-end
            const iconPanEnded = __lastDragging && !dragging;
            const lineInteractionEnded = state.showCellSpotLines && __lastInteracting && !interacting;
            if (iconPanEnded || lineInteractionEnded) {
                updateAllLayers();
            }
            __lastDragging = dragging;
            __lastInteracting = interacting;
        } else {
            // In pointcloud mode, refresh viewport-cropped line overlay only when interaction ends
            if (state.showCellSpotLines && __lastInteracting && !interacting) {
                updateAllLayers();
            }
            __lastDragging = dragging;
            __lastInteracting = interacting;
        }

        // Fallback: interactionState zoom flags are not always reliable on wheel zoom.
        // Debounce a refresh so Ctrl+L overlay updates for newly visible cells after zoom stops.
        if (state.showCellSpotLines && zoomChanged) {
            scheduleLineOverlayZoomRefresh();
        }
    } catch {}

    return viewState;
}

// === HOVER HANDLER ===
/**
 * Handle deck.gl hover events
 * Updates coordinate display and shows tooltips
 * @param {Object} info - Hover info from deck.gl
 */
function handleHover(info) {
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : null;
        if (adv && adv.performance && adv.performance.showPerformanceStats) {
            console.log('Main deck.gl onHover called:', info.layer?.id, info.picked);
        }
    } catch {}

    updateCoordinateDisplay(info);
    showTooltip(info, elements.tooltip);
}

/**
 * Show the empty state welcome screen
 */
function showEmptyState() {
    showScreen('emptyState');

    const emptyStateBtn = document.getElementById('emptyStateBtn');
    if (emptyStateBtn) {
        emptyStateBtn.onclick = async () => {
            const result = await window.electronAPI.selectDataFolder();
            if (result.success) {
                window.location.reload();
            }
        };
    }
    setupSampleRun();
    console.warn('Data folder not configured. Waiting for user selection.');
}

// The sample link in the welcome footer: opens the copy on disk, or downloads
// and unpacks it first, the link itself serving as the progress readout while
// the door above waits dimmed
function setupSampleRun() {
    const btn = document.getElementById('sampleRunBtn');
    const openBtn = document.getElementById('emptyStateBtn');
    const bar = document.getElementById('sampleRunBar');
    const track = document.getElementById('sampleRunProgress');
    const count = document.getElementById('sampleRunCount');
    const where = document.getElementById('sampleRunWhere');
    const kbd = document.getElementById('openRunKbd');
    const keyRow = document.getElementById('sampleKeyRow');
    const keyInput = document.getElementById('sampleKey');
    if (kbd && window.electronAPI && window.electronAPI.platform === 'darwin') kbd.textContent = '\u2318 O';
    if (!btn || !window.electronAPI || !window.electronAPI.openSample) return;
    const mb = n => Math.round(n / 1e6);
    let ready = false;
    let folder = '';
    // the path line under the footer, said the moment a download starts so nobody
    // wonders where 1.4 GB went; Help, Remove Demo Data deletes it again
    const showWhere = (verb, note) => {
        if (!where || !folder) return;
        where.textContent = '';
        // dry, one word: the same line whether it is still to come or already here
        where.append('Location: ');
        const c = document.createElement('code');
        c.textContent = folder;
        where.append(c);
        if (note) where.append(note);
        where.classList.remove('hidden');
    };
    // at rest, before the first download, the size is said next to the link, so
    // nobody starts 600 MB by accident; once it is on disk there is nothing to say
    const sizeHint = () => { count.textContent = ready ? '' : '(600 MB)'; };
    const busy = on => {
        track.classList.remove('shimmer');
        if (on) { btn.classList.remove('fail'); btn.title = ''; }
        btn.disabled = on;
        if (openBtn) openBtn.disabled = on;
        track.classList.toggle('hidden', !on);
        if (!on) sizeHint();
    };
    // a download already running (started by --sample, or this page reloaded
    // halfway through one) shows its progress here too, not only one begun by a click
    window.electronAPI.sampleStatus().then(st => {
        ready = !!st.ready;
        folder = st.folder || '';
        sizeHint();
        if (st.busy) { busy(true); btn.textContent = 'Downloading demo'; showWhere('goes to'); }
        else if (ready) { btn.textContent = 'Open the demo data'; showWhere('is kept in'); }
    }).catch(() => {});
    // resumable: the part already downloaded is kept, so the next click goes on
    // from there; false when it had to be deleted (a damaged download)
    const failed = (msg, resumable = true) => {
        busy(false);
        btn.classList.add('fail');
        // the reason, on hover: retrying will not help a full disk or no internet,
        // and the user should be able to see which it was
        btn.title = (msg ? 'Reason: ' + msg + '.' : '') +
            (!ready && resumable ? ' The next try goes on where this one stopped.' : '');
        if (msg) console.warn('Sample run:', msg);
        if (ready) {
            btn.textContent = 'Could not open, try again';
            showWhere('is kept in');
        } else {
            btn.textContent = 'Download failed, try again';
            // the path line stays one line, so the column does not move; that the
            // download resumes is said in the hover text with the reason
            showWhere('goes to');
        }
    };
    window.electronAPI.onSampleProgress(s => {
        if (s.phase === 'error') {
            // a wrong keyword is answered by the click that sent it, with the field again
            if (s.code !== 'WRONG_KEYWORD') failed(s.error, s.resumable);
            return;
        }
        if (!btn.disabled) { busy(true); showWhere('goes to'); }
        if (s.phase === 'download') {
            bar.style.width = (100 * s.done / s.total).toFixed(1) + '%';
            btn.textContent = 'Downloading demo';
            count.textContent = `${mb(s.done)} / ${mb(s.total)} MB`;
        } else if (s.phase === 'check') {
            track.classList.add('shimmer');
            btn.textContent = 'Checking the download';
            count.textContent = '';
        } else if (s.phase === 'unpack') {
            track.classList.add('shimmer');
            btn.textContent = 'Unpacking, a minute or so';
            count.textContent = '';
        } else if (s.phase === 'done') {
            btn.textContent = 'Opening';
            count.textContent = '';
        }
    });
    // the keyword: asked in place of the link the first time, never stored; the
    // demo data once on this computer opens without it
    const askKeyword = (wrong = false) => {
        btn.classList.add('hidden');
        count.classList.add('hidden');
        keyRow.classList.remove('hidden');
        keyRow.classList.toggle('wrong', wrong);
        keyInput.value = '';
        keyInput.placeholder = wrong ? 'Wrong keyword, try again' : 'Keyword, then Enter';
        keyInput.focus();
    };
    const closeKeyword = () => {
        keyRow.classList.add('hidden');
        keyRow.classList.remove('wrong');
        btn.classList.remove('hidden');
        count.classList.remove('hidden');
    };
    const start = async keyword => {
        busy(true);
        showWhere('goes to');
        bar.style.width = '0';
        btn.textContent = 'Starting';
        count.textContent = '';
        // on success the main process reloads the window itself
        const res = await window.electronAPI.openSample(keyword);
        if (res && res.success) return;
        if (res && res.code === 'WRONG_KEYWORD') { busy(false); askKeyword(true); return; }
        failed(res && res.error, !res || res.resumable !== false);
    };
    btn.onclick = () => (ready ? start('') : askKeyword());
    keyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && keyInput.value) {
            const k = keyInput.value;
            keyInput.value = '';
            closeKeyword();
            start(k);
        } else if (e.key === 'Escape') {
            e.stopPropagation();
            closeKeyword();
        }
    });
}

function showImageDimsPrompt() {
    showScreen('imageDimsState');

    // Two different situations end up here: no .mbtiles in the folder, and an
    // .mbtiles that was there but would not open (a stale native build of
    // better-sqlite3 after an npm install is the usual reason). Say which.
    window.electronAPI.getTileChannels().then(info => {
        const failed = (info && info.failed) || [];
        if (!failed.length) return;
        const title = document.getElementById('imageDimsTitle');
        const text = document.getElementById('imageDimsText');
        if (title) title.textContent = 'Background tiles could not be opened';
        if (text) {
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
            text.innerHTML = failed.map(f => `<code>${esc(f.file)}</code> is in the folder but failed to open:<br><code>${esc(f.error)}</code>`).join('<br>') +
                '<br>If this follows an <code>npm install</code>, the native module needs rebuilding for Electron: ' +
                '<code>npx electron-rebuild -f -w better-sqlite3</code>.<br>' +
                'You can still enter the image dimensions manually to continue without tiles.';
        }
    }).catch(() => {});

    const submitBtn = document.getElementById('imageDimsSubmitBtn');
    const closeBtn = document.getElementById('imageDimsCloseBtn');
    const errorMsg = document.getElementById('imageDimsError');

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const width = parseInt(document.getElementById('imageDimsWidth')?.value);
            const height = parseInt(document.getElementById('imageDimsHeight')?.value);
            const planeCount = parseInt(document.getElementById('imageDimsPlanes')?.value);

            if (!width || !height || !planeCount || width < 1 || height < 1 || planeCount < 1) {
                if (errorMsg) errorMsg.classList.remove('hidden');
                return;
            }
            if (errorMsg) errorMsg.classList.add('hidden');

            await window.electronAPI.setImageDimensions({ width, height, planeCount });
            window.location.reload();
        };
    }

    if (closeBtn) {
        closeBtn.onclick = () => window.location.reload();
    }
}

/**
 * Ask for the voxel size, for a folder whose run does not record it (no
 * diagnostics.db). The value is kept for this folder only.
 */
function showVoxelSizePrompt() {
    showScreen('voxelSizeState');
    const errorMsg = document.getElementById('voxelSizeError');
    document.getElementById('voxelSizeSubmitBtn').onclick = async () => {
        const v = ['voxelSizeX', 'voxelSizeY', 'voxelSizeZ']
            .map(id => parseFloat(document.getElementById(id)?.value));
        const res = await window.electronAPI.setVoxelSize(v);
        if (!res.success) {
            errorMsg.classList.remove('hidden');
            return;
        }
        window.location.reload();
    };
    document.getElementById('voxelSizeCloseBtn').onclick = () => window.location.reload();
}

// === MAIN INITIALIZATION (Electron-specific) ===
async function init() {
    showLoading(state, elements.loadingIndicator);
    try {
        await runInit();
    } catch (err) {
        // A failure anywhere in the pipeline must still drop the curtain and
        // surface an error, otherwise the app hangs on the loading overlay.
        console.error('Initialization failed:', err);
        try { hideLoading(state, elements.loadingIndicator); } catch {}
        try { removeCurtain(); } catch {}
        try { showMetadataError(null, err?.message || String(err)); } catch {}
    }
}

async function runInit() {
    // 1. Check for data path (Electron empty-state)
    const paths = await window.electronAPI.getPaths();
    if (!paths.dataPath) { 
        showEmptyState(); 
        return; 
    }

    // Update window title for awareness
    try {
        document.title = `pciSeq Viewer - ${paths.dataPath}`;
    } catch (e) {
        console.warn('Failed to update window title:', e);
    }

    // 2. Load metadata and config
    const metadataResult = await window.loadDatasetMetadata();

    // If MBTiles is missing and we don't have image dimensions yet, prompt the user
    if (metadataResult && !metadataResult.hasMbtiles && (!metadataResult.imageWidth || !metadataResult.imageHeight || !metadataResult.planeCount)) {
        showImageDimsPrompt();
        return;
    }

    // The run records its voxel size; ask only when this folder has none
    if (metadataResult && !metadataResult.voxelSize) {
        showVoxelSizePrompt();
        return;
    }

    let userConfig;
    try {
        userConfig = window.config();
    } catch (err) {
        showMetadataError(metadataResult, err.message);
        return;
    }

    // 2b. Discover background channels (DAPI, GCaMP, ...) and pick the default.
    // currentChannel and channelOpacity must be set before the first layer build.
    // Every channel starts mounted (kept warm) - the default at full opacity, the
    // rest at 0 so they load invisibly and are ready to cross-fade in on switch.
    const channelInfo = await window.electronAPI.getTileChannels();
    if (channelInfo && channelInfo.channels && channelInfo.channels.length > 0) {
        const defaultId = channelInfo.defaultChannelId;
        state.currentChannel = defaultId;
        state.channelOpacity = {};
        channelInfo.channels.forEach(channel => {
            state.channelOpacity[channel.id] = channel.id === defaultId ? 1 : 0;
        });
        // each channel's tint comes from its own mbtiles 'tint' metadata; no tint -> grayscale
        setChannelTints(channelInfo.channels);
    }

    state.polygonCache.clear();

    // 3. Initialize deck.gl
    state.deckglInstance = initializeDeckGL(handleViewStateChange, handleHover);
    window.appState.deckglInstance = state.deckglInstance;

    // 4. Setup event handlers
    setupEventHandlers(elements, state, updatePlane, updateAllLayers);
    setupAdvancedKeyboardShortcuts(state, updatePlane, updateAllLayers);
    setupCheckCellBridge();
    setupCheckSpotBridge();

    // 5. Plane count comes from metadata (mbtiles or user input)
    const totalPlanes = userConfig.planeCount;
    const startingPlane = Math.floor(totalPlanes / 2);
    initializePlaneSlider(totalPlanes, startingPlane);

    // 6. Cell data + colors, then boundaries for the current plane. Cells are
    //    one small file, so tiles and coloured polygons can show before spots.
    await initializeCellData();
    selectAllCellClasses();
    await loadPlane(state.currentPlane);
    initChannelSwitcher(channelInfo, state, updateAllLayers);

    // 7. Initialize interactions (index maps are filled in place later)
    initializePolygonHighlighter();
    initializeRectangularSelector();
    initializeRegionDrawer();
    // The spatial index the 3D view and the selection tool need. It used to be started
    // by an event the cell drawing sent as a side effect, and when that listener was set
    // up too late the 3D view fell back to one plane (since 3606560). Started outright.
    startSpatialIndexing(updateAllLayers, state);

    // 8. Spots. Progressive: drop the curtain now and draw shards as they land,
    //    plane 0 upwards, with a corner pill counting them. Otherwise the
    //    curtain stays until everything is in.
    const progressiveSpots = Boolean(window.advancedConfig?.().performance?.progressiveSpots);
    if (progressiveSpots) {
        updateAllLayers();
        hideLoading(state, elements.loadingIndicator);
        removeCurtain();
        await streamSpotsIntoScatterCache(state.selectedGenes, (loadedRows, totalRows) => {
            showLoadStatus(`Spots ${loadedRows.toLocaleString()} / ${totalRows.toLocaleString()}`);
            updateAllLayers();
        });
        showLoadStatus('Indexing genes...');
    }

    // 9. Per-gene spot objects + indexes (gene drawer, cell info panel, icon layers)
    await initializeGeneData(progressiveSpots);
    buildGeneSpotIndexes(state.geneDataMap, state.cellToSpotsIndex, state.spotToParentsIndex);
    resolveSpotsReady();

    // 10. Finalize UI + layers
    finalizeInitialization(updateAllLayers);
    preloadAround(state.currentPlane);

    // 11. Background tasks
    buildGlobalZProjection(state).catch(err => console.warn('Z-projection failed:', err));

    hideLoadStatus();
    hideLoading(state, elements.loadingIndicator);
    removeCurtain();
}

// === DOM CONTENT LOADED HANDLER ===
document.addEventListener('DOMContentLoaded', () => {
    // Styled tooltip bubble shared across the app (replaces native title boxes)
    initTooltips();
    initChatPanel();
    initTour();
    initChatImageComposer();

    // Initialize cell info panel (close button + color scheme)
    initCellInfoPanel();

    // Initialize D3 components when DOM is ready
    if (typeof d3 !== 'undefined') {
        initGeneDistributionChart();
        initCellClassDistributionChart();
        initCellClassPercentageChart();
    }

    // Initialize drawers
    initCellClassDrawer();
    initGeneDrawer();

    // Controls drawer state (collapsed by default)
    const controlsPanel = document.getElementById('controlsPanel');
    if (controlsPanel) {
        controlsPanel.classList.add('collapsed');
        try { updateScaleBarOffset(); } catch {}
    }

    // Setup debounced cell class search
    const cellClassSearchInput = document.getElementById('cellClassSearch');
    if (cellClassSearchInput) {
        const debouncedCellClassSearch = debounce((searchTerm) => {
            if (typeof window.filterCellClasses === 'function') {
                window.filterCellClasses(searchTerm);
            }
        }, 200);

        cellClassSearchInput.addEventListener('input', (e) => {
            debouncedCellClassSearch(e.target.value);
        });
    }

    // Setup IPC listeners for menu-based import (Electron only)
    if (window.electronAPI) {
        // Gene colours import from menu
        window.electronAPI.onImportGeneColors(async (data) => {
            try {
                const { appliedCount } = await applyGeneScheme(data, false);
                sendLegend();
                console.log('Imported ' + appliedCount + ' gene colour styles via menu');
            } catch (e) {
                console.error('Failed to import gene colours:', e);
            }
        });

        // Cell class colours import from menu
        window.electronAPI.onImportClassColors((data) => {
            try {
                const { appliedCount, notFoundClasses } = applyClassColorScheme(data, false);
                if (appliedCount > 0) {
                    populateCellClassDrawer();
                    renderRegionsList();   // cell annotation swatches follow their class colour
                    sendLegend();
                    if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
                }
                console.log('Imported ' + appliedCount + ' cell class colours via menu');
                if (notFoundClasses.length > 0) {
                    console.log('Classes not found:', notFoundClasses.join(', '));
                }
            } catch (e) {
                console.error('Failed to import cell class colours:', e);
            }
        });
    }
});

// === WINDOW LOAD HANDLER ===
window.addEventListener('load', async () => {
    try { Perf.start('viewer'); } catch {}

    // regions an older version kept by itself, offered once for saving to a file;
    // and the main process starts from what this page has, after a reload too
    takeOldStoredRegions();
    syncAnnotationsToMain();
    // the outline_cells tool adds a cell annotation
    window.electronAPI?.onChatAddCellAnnotation?.((p) => addCellAnnotation(p));
    // and open_chart opens one of the drawer's charts
    window.electronAPI?.onChatOpenChart?.((p) => openChart(p));
    // and fit_allen_regions brings the Allen atlas regions
    window.electronAPI?.onChatAddAllenRegions?.((p) => addAllenRegions(p));

    // Initialize cell lookup UI
    // the chat panel's fly_to_cell tool lands here: same search-and-navigate the
    // cell lookup box uses, so the outline flashes the same way. The answer goes
    // back to the tool, so a cell the run does not have reaches the model as an
    // error rather than a map that quietly stayed put
    if (window.electronAPI?.onChatFlyToCell) {
        window.electronAPI.onChatFlyToCell(async ({ id, label }) => {
            try {
                if (!window.cellLookup) throw new Error('the map is not ready yet');
                await window.cellLookup.search(label);
                window.electronAPI.chatFlyToCellDone({ id });
            } catch (e) {
                window.electronAPI.chatFlyToCellDone({ id, error: e.message });
            }
        });
    }
    // and open_cell_diagnostics: the same panel Ctrl+Click opens, compare already run
    if (window.electronAPI?.onChatOpenCellDiagnostics) {
        window.electronAPI.onChatOpenCellDiagnostics(({ label, vs_class }) => {
            openCheckCellCompare(label, vs_class);
        });
    }
    // and open_spot_diagnostics: the same panel Ctrl+Click on a spot opens
    if (window.electronAPI?.onChatOpenSpotDiagnostics) {
        window.electronAPI.onChatOpenSpotDiagnostics(({ spot_id }) => {
            openCheckSpotModal(spot_id);
        });
    }
    // and open_3d_view: the 3D viewer around a cell, as if the user drew the rectangle
    if (window.electronAPI?.onChatOpen3dView) {
        window.electronAPI.onChatOpen3dView(({ label }) => {
            openChunkAroundCell(label).catch(e => showNotification('3D view: ' + e.message, 'error'));
        });
    }
    // and show_classes / show_genes: change the set of shown classes or genes, then
    // rebuild the drawer and the widget from it, the way the colour import does, so
    // the eyes and checkboxes match the map
    if (window.electronAPI?.onChatShowVisibility) {
        window.electronAPI.onChatShowVisibility(async ({ kind, mode, names }) => {
            const classes = kind === 'classes';
            // the spot stream starts by selecting every gene, so a request that lands
            // before it has run would be undone; wait for the spots, then apply
            if (!classes) await spotsReady;
            const shown = classes ? state.selectedCellClasses : state.selectedGenes;
            const all = classes ? Array.from(state.allCellClasses) : Array.from(state.geneDataMap.keys());
            const have = new Set(all);
            const these = names.filter(n => have.has(n));
            if (mode === 'all') all.forEach(n => shown.add(n));
            if (mode === 'none' || mode === 'only') shown.clear();
            if (mode === 'only' || mode === 'add') these.forEach(n => shown.add(n));
            if (mode === 'hide') these.forEach(n => shown.delete(n));
            if (classes) {
                populateCellClassDrawer();
                populateCellClassWidget();
                updateToggleAllCellClassesButton();
            } else {
                populateGeneDrawer();
            }
            if (typeof window.updateAllLayers === 'function') window.updateAllLayers();
        });
    }
    // the uniform_spot_size tool flips the Uniform Size switch, through its own
    // change handler, so the drawer and the map stay in step
    if (window.electronAPI?.onChatUniformSize) {
        window.electronAPI.onChatUniformSize(({ on }) => {
            const t = document.getElementById('uniformSizeToggle');
            if (!t || t.checked === Boolean(on)) return;
            t.checked = Boolean(on);
            t.dispatchEvent(new Event('change'));
        });
    }
    // the viewer_state tool: a snapshot of what the map shows, read from state, the
    // object the drawer writes into and the map is drawn from, so it cannot disagree
    // with the screen. Lists longer than 25 come back as counts.
    if (window.electronAPI?.onChatViewerState) {
        window.electronAPI.onChatViewerState(({ id }) => {
            try {
                window.electronAPI.chatViewerStateDone({ id, ...viewerSnapshot() });
            } catch (e) {
                window.electronAPI.chatViewerStateDone({ id, error: e.message });
            }
        });
    }
    // the spot_filters tool: each value goes through its slider, so the drawer, the
    // map and viewer_state agree; then the spots still drawn are counted, over the
    // genes on the map, with the misread setting applied as the map applies it
    if (window.electronAPI?.onChatSpotFilters) {
        window.electronAPI.onChatSpotFilters(({ id, score, intensity, size }) => {
            try {
                // each slider's own range, set from the run's values; a value outside
                // it is refused, not clamped, so the agent never reports a filter it
                // did not get
                const sliders = { score: 'scoreFilterSlider', intensity: 'intensityFilterSlider', size: 'geneSizeSlider' };
                const asked = { score, intensity, size };
                for (const [k, elId] of Object.entries(sliders)) {
                    const el = document.getElementById(elId);
                    const v = asked[k];
                    if (!el || v == null) continue;
                    const lo = Number(el.min), hi = Number(el.max);
                    if (v < lo || v > hi) {
                        window.electronAPI.chatSpotFiltersDone({ id, error: `${k} must be between ${lo} and ${+hi.toPrecision(4)} for this run, nothing changed` });
                        return;
                    }
                }
                const move = (elId, v) => {
                    const el = document.getElementById(elId);
                    if (!el || v == null) return;
                    el.value = String(v);
                    el.dispatchEvent(new Event('input'));
                };
                const notes = [];
                if (score != null && !state.hasScores) notes.push('this run has no scores, the score filter does nothing');
                if (intensity != null && !state.hasIntensity) notes.push('this run has no intensities, the intensity filter does nothing');
                move('scoreFilterSlider', score);
                move('intensityFilterSlider', intensity);
                move('geneSizeSlider', size);
                const s = state.hasScores ? state.scoreThreshold : 0;
                const it = state.hasIntensity ? state.intensityThreshold : 0;
                const perGene = {};
                let drawn = 0, total = 0;
                for (const [g, spots] of state.geneDataMap) {
                    if (!state.selectedGenes.has(g)) continue;
                    let n = 0;
                    for (const d of spots) {
                        if (state.hideMisreads && d.is_hard_misread) continue;
                        if (s > 0 && !(d.score != null && Number(d.score) >= s)) continue;
                        if (it > 0 && !(d.intensity != null && Number(d.intensity) >= it)) continue;
                        n++;
                    }
                    drawn += n;
                    total += spots.length;
                    perGene[g] = { drawn: n, of: spots.length };
                }
                const genes = Object.keys(perGene);
                window.electronAPI.chatSpotFiltersDone({
                    id,
                    score_filter: state.hasScores ? +Number(state.scoreThreshold).toPrecision(4) : null,
                    intensity_filter: state.hasIntensity ? +Number(state.intensityThreshold).toPrecision(4) : null,
                    size: state.geneSizeScale,
                    applied_is: 'the values the sliders took, snapped to their step',
                    spots_drawn: drawn,
                    spots_of_genes_on_map: total,
                    genes_on_map: genes.length,
                    ...(genes.length <= 25 ? { per_gene: perGene } : {}),
                    counted_as: 'the spots of the genes on the map, every plane, that pass the filters' +
                        (state.hideMisreads ? ' and are not hidden misreads' : ''),
                    ...(notes.length ? { notes } : {}),
                });
            } catch (e) {
                window.electronAPI.chatSpotFiltersDone({ id, error: e.message });
            }
        });
    }
    // misread_display: tick the two misread boxes the way a user would, so the
    // drawer and the map agree, then count the misreads of the genes on the map
    if (window.electronAPI?.onChatMisreadDisplay) {
        window.electronAPI.onChatMisreadDisplay(({ id, mode }) => {
            try {
                const tick = (elId, on) => {
                    const el = document.getElementById(elId);
                    if (!el || el.checked === on) return;
                    el.checked = on;
                    el.dispatchEvent(new Event('change'));
                };
                if (mode) {
                    tick('greyOutMisreadsToggle', mode === 'greyed');
                    tick('hideMisreadsToggle', mode === 'hidden');
                }
                const perGene = {};
                let misreads = 0, total = 0;
                for (const [g, spots] of state.geneDataMap) {
                    if (!state.selectedGenes.has(g)) continue;
                    let n = 0;
                    for (const d of spots) if (d.is_hard_misread) n++;
                    misreads += n;
                    total += spots.length;
                    perGene[g] = { misreads: n, of: spots.length };
                }
                const genes = Object.keys(perGene);
                window.electronAPI.chatMisreadDisplayDone({
                    id,
                    misreads: state.hideMisreads ? 'hidden' : state.greyOutMisreads ? 'greyed out' : 'shown',
                    misread_spots: misreads,
                    spots_of_genes_on_map: total,
                    genes_on_map: genes.length,
                    ...(genes.length <= 25 ? { per_gene: perGene } : {}),
                    counted_as: 'the spots of the genes on the map, every plane, whose most likely source is the background; the score and intensity filters are not applied',
                });
            } catch (e) {
                window.electronAPI.chatMisreadDisplayDone({ id, error: e.message });
            }
        });
    }
    // map_layers: the Map Layers boxes, the channel radios and the opacity slider,
    // all moved the way a user would so the drawer and the map agree
    if (window.electronAPI?.onChatMapLayers) {
        window.electronAPI.onChatMapLayers(({ id, background, channel, cells, cell_opacity }) => {
            try {
                // the channel names: the radios when there are two or more, else
                // the one channel the run has
                const radios = [...document.querySelectorAll('input[name="background-channel"]')];
                const channels = radios.length
                    ? radios.map(r => ({ id: r.value, name: r.parentElement?.textContent?.trim() || r.value }))
                    : Object.keys(state.channelOpacity || {}).map(c => ({ id: c, name: c }));
                let radio = null;
                if (channel != null) {
                    const want = channel.trim().toLowerCase();
                    const hit = channels.find(c => c.id.toLowerCase() === want || c.name.toLowerCase() === want);
                    if (!hit) {
                        window.electronAPI.chatMapLayersDone({ id, error: `no channel ${channel}, this run has ${channels.map(c => c.name).join(', ') || 'no background'}` });
                        return;
                    }
                    radio = radios.find(r => r.value === hit.id) || null;
                }
                const tick = (elId, on) => {
                    const el = document.getElementById(elId);
                    if (!el || on == null || el.checked === on) return;
                    el.checked = on;
                    el.dispatchEvent(new Event('change'));
                };
                tick('showTiles', background);
                tick('showPolygons', cells);
                if (radio && !radio.checked) {
                    radio.checked = true;
                    radio.dispatchEvent(new Event('change'));
                }
                if (cell_opacity != null) {
                    const el = document.getElementById('polygonOpacitySlider');
                    el.value = String(cell_opacity);
                    el.dispatchEvent(new Event('input'));
                }
                const cur = channels.find(c => c.id === state.currentChannel);
                window.electronAPI.chatMapLayersDone({
                    id,
                    background: !!state.showTiles,
                    channel: cur ? cur.name : (state.currentChannel || null),
                    channels: channels.map(c => c.name),
                    cells: !!state.showPolygons,
                    cell_opacity: +Number(state.polygonOpacity).toFixed(2),
                });
            } catch (e) {
                window.electronAPI.chatMapLayersDone({ id, error: e.message });
            }
        });
    }
    // and show_all_planes: the Cells from all planes switch. The answer waits for
    // every plane to load, so the tool does not come back to a map still loading
    if (window.electronAPI?.onChatAllPlanes) {
        window.electronAPI.onChatAllPlanes(async ({ id, on }) => {
            try {
                await setCellProjection(!!on, state, updateAllLayers);
                window.electronAPI.chatAllPlanesDone({ id, on: !!state.zProjectionCellMode });
            } catch (e) {
                window.electronAPI.chatAllPlanesDone({ id, error: e.message });
            }
        });
    }
    // and export_per_class_pngs: the drawer's export, hands off. Cells from all
    // planes goes on first if it is off, the region is what the tool asked for or
    // the whole view, and every PNG is written to the folder the tool chose through
    // the main process, no zip and no save dialog
    if (window.electronAPI?.onChatExportPerClass) {
        window.electronAPI.onChatExportPerClass(async ({ id, region, dir }) => {
            try {
                if (!state.zProjectionCellMode) await setCellProjection(true, state, updateAllLayers);
                const sink = async (name, blob) => {
                    const bytes = await blob.arrayBuffer();
                    await window.electronAPI.savePng({ dir, name, bytes });
                };
                const r = await runPerClassExport(state, updateAllLayers,
                                                  { region: region || null, wholeView: !region, sink });
                window.electronAPI.chatExportPerClassDone({ id, bounds: r.bounds, files: r.files });
            } catch (e) {
                window.electronAPI.chatExportPerClassDone({ id, error: e.message });
            }
        });
    }
    if (window.cellLookup) {
        window.cellLookup.setupUI();
    }

    // Start main initialization
    init().catch(err => console.error('init() failed:', err));
});
