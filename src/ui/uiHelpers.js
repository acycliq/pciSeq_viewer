/**
 * UI Helper Functions Module
 *
 * This module contains utility functions for managing UI state, tooltips,
 * loading indicators, and polygon alias controls
 */

import { getCellInfo } from '../data/tooltipDiagnostics.js';
import { escapeHtml } from '../charts/checkCellCharts.js';
import { SPOT_PICKABLE_MIN_ZOOM } from '../../config/constants.js';

// Note: Arrow-only runtime; no TSV-specific palette usage here

// ----- Hover chain logs (DevTools console only) -----
//
// Two console-only diagnostic logs share the helpers below:
//
//   - Gamma chain: per-(cell, gene), fired on spot hover. Walks the product
//     sc_mean × Inefficiency × A_c × eta_g × theta -> predicted, then prints
//     the closed-form check (rSpot + obs) / (rSpot + pred) and compares with
//     the stored gamma_assigned.
//
//   - Theta chain: per-cell, fired on cell hover. Sums the per-gene baseline
//     across the panel and prints alpha / beta = theta_bar, compared with
//     the stored theta_bar.
//
// See notes/spot_hover_chain_spec.md for the full spec.
const CHAIN_HOVER_LOG_TTL_MS = 500;
const _gammaLogLastSeen = new Map();   // key: `${parentLabel}::${geneIdx}`
const _thetaLogLastSeen = new Map();   // key: parentLabel

// Throttle: returns true if enough time has passed for this key, false otherwise.
function _shouldLog(map, key) {
    const now = Date.now();
    const prev = map.get(key);
    if (prev && now - prev < CHAIN_HOVER_LOG_TTL_MS) return false;
    map.set(key, now);
    return true;
}

// Shared number formatter used in both chains.
const _fmt = (x, d = 4) => x.toFixed(d);

function _resolveInternalCellIdx(externalLabel) {
    const labelMap = window.appState?.labelMap;
    if (labelMap && Object.keys(labelMap).length > 0) {
        const mapped = labelMap[String(externalLabel)];
        return (mapped !== undefined) ? Number(mapped) : null;
    }
    // sequential labels: external == internal
    return Number(externalLabel);
}

// ----- Cell-hover theta chain -----
//
// Prints how theta_bar[c, k*] gets put together for the hovered cell:
//
//   obs        = sum over genes of N_{c, g}
//   alpha      = obs + (rTheta - 1)
//   expected   = sum over genes of  A_c[c] * gamma_bar[c, g, k*] * eta_g[g] * (sc_mean[g, k*] * Inefficiency + SpotReg)
//   beta       = expected + rTheta
//   theta_bar  = alpha / beta
//
// A theta_bar of 1 means the cell's total reads match the class-k* baseline,
// > 1 means it has more, < 1 means it has fewer.
function logThetaChain(parentLabel, info) {
    if (window.appState?.debugThetaChain !== true) return;
    if (window.appState?.thetaChainAvailable !== true) return;
    // Cell polygons are pickable at every zoom, so without this guard the log
    // would fire while the user is just panning the overview.
    if ((window.appState?.currentZoom ?? 0) < SPOT_PICKABLE_MIN_ZOOM) return;
    if (!_shouldLog(_thetaLogLastSeen, parentLabel)) return;

    const cInternal = _resolveInternalCellIdx(parentLabel);
    if (cInternal === null) {
        console.warn('[theta chain] could not resolve internal index for label', parentLabel);
        return;
    }

    const kStar       = info.assignedClassIdx;
    const classProb   = info.classProbHard;
    const thetaStored = info.thetaHard;
    const geneCount   = info.geneCountVec;
    const gammaVec    = info.gammaAssignedVec;

    const inefficiency = window.appState.Inefficiency;
    const aC           = window.appState.A_c[cInternal];
    const etaBar       = window.appState.eta_bar;
    const scMeanExpr   = window.appState.sc_mean_expression;
    const rTheta       = window.appState.rTheta;
    const spotReg      = window.appState.SpotReg;
    const classNames   = window.appState.classNames || [];

    // sc_mean_expression is shipped as a nested array (nG x nK), matching
    // numpy .tolist() of a 2D ndarray. Bail out if the shape is unexpected.
    if (!Array.isArray(scMeanExpr[0])) {
        console.warn('[theta chain] sc_mean_expression shape unexpected');
        return;
    }

    const nG = geneCount.length;

    // alpha: total observed reads in the cell, plus the prior shape offset.
    let obs = 0;
    for (let g = 0; g < nG; g++) obs += geneCount[g];
    const alpha = obs + (rTheta - 1);

    // beta: per-gene baseline-at-theta=1 summed across genes, plus the prior rate.
    //   per-gene baseline = A_c * gamma_bar[g] * eta_g[g] * (sc_mean[g, k*] * Inefficiency + SpotReg)
    let expected = 0;
    for (let g = 0; g < nG; g++) {
        const mu_gk = scMeanExpr[g][kStar] * inefficiency + spotReg;
        expected += aC * gammaVec[g] * etaBar[g] * mu_gk;
    }
    const beta = expected + rTheta;

    const thetaCheck = alpha / beta;
    const matches    = Math.abs(thetaCheck - thetaStored)
                       / Math.max(1e-9, Math.abs(thetaStored)) < 1e-3;

    const className = classNames[kStar] ?? `k=${kStar}`;
    const header = `[theta chain] cell ${parentLabel}  k* = ${className} (p = ${classProb.toFixed(3)})`;

    console.groupCollapsed(header);
    console.log(`  obs       =  sum_g  N_{c, g}                                                                 =  ${_fmt(obs, 2)}`);
    console.log(`  alpha     =  obs + (rTheta - 1)                                                              =  ${_fmt(alpha, 2)}`);
    console.log(`  expected  =  sum_g  A_c * gamma_bar * eta_g * (sc_mean[g, k*] * Inefficiency + SpotReg)      =  ${_fmt(expected, 2)}`);
    console.log(`  beta      =  expected + rTheta                                                               =  ${_fmt(beta, 2)}`);
    const checkLine = `  theta_bar  =  alpha / beta  =  ${_fmt(alpha, 2)} / ${_fmt(beta, 2)}  =  ${_fmt(thetaCheck)}`;
    if (matches) {
        console.log(`${checkLine}  (matches stored ${_fmt(thetaStored)})  OK`);
    } else {
        console.warn(`${checkLine}  MISMATCH stored=${_fmt(thetaStored)}`);
    }
    console.groupEnd();
}

// ----- Spot-hover gamma chain -----
//
// Walks the per-(cell, gene) product that the model uses to predict a count,
// then checks (rSpot + obs) / (rSpot + pred) against the stored gamma_assigned.
function logGammaChain(spotId, parentLabel, geneIdx, gene, info) {
    if (window.appState?.debugGammaChain !== true) return;
    if (window.appState?.gammaChainAvailable !== true) return;
    if (!_shouldLog(_gammaLogLastSeen, `${parentLabel}::${geneIdx}`)) return;

    const cInternal = _resolveInternalCellIdx(parentLabel);
    if (cInternal === null) {
        console.warn('[gamma chain] could not resolve internal index for label', parentLabel);
        return;
    }

    const kStar       = info.assignedClassIdx;
    const classProb   = info.classProbHard;
    const thetaHard   = info.thetaHard;
    const observed    = info.geneCountVec[geneIdx];
    const gammaStored = info.gammaAssignedVec[geneIdx];

    const inefficiency = window.appState.Inefficiency;
    const aC           = window.appState.A_c[cInternal];
    const etaG         = window.appState.eta_bar[geneIdx];
    const rSpot        = window.appState.rSpot;
    const scMeanExpr   = window.appState.sc_mean_expression;
    const classNames   = window.appState.classNames || [];

    // sc_mean_expression is shipped as a nested array (nG x nK), matching
    // numpy .tolist() of a 2D ndarray. Access via [g][k].
    const muRef = Array.isArray(scMeanExpr[geneIdx])
        ? scMeanExpr[geneIdx][kStar]
        : null;
    if (muRef == null) {
        console.warn('[gamma chain] sc_mean_expression shape unexpected at gene', geneIdx);
        return;
    }

    // Running products along the chain.
    const muAdj           = muRef * inefficiency;
    const afterAc         = muAdj * aC;
    const baselineAtTheta = afterAc * etaG;
    const predicted       = baselineAtTheta * thetaHard;

    // Independent gamma reconstruction from rSpot + observed + predicted.
    const gammaCheck = (rSpot + observed) / (rSpot + predicted);
    const matches    = Math.abs(gammaCheck - gammaStored)
                       / Math.max(1e-9, Math.abs(gammaStored)) < 1e-3;

    const className = classNames[kStar] ?? `k=${kStar}`;
    const header = `[gamma chain] spot ${spotId}  cell ${parentLabel}  k* = ${className} (p = ${classProb.toFixed(3)})  gene = ${gene}`;

    // Use groupCollapsed so the chain stays folded by default.
    console.groupCollapsed(header);
    console.log(`  sc_mean_expression[g, k*]                =  ${_fmt(muRef)}`);
    console.log(`  × ${_fmt(inefficiency)}  (Inefficiency)                 =   ${_fmt(muAdj)}    mu_adj used internally`);
    console.log(`  × ${_fmt(aC)}  (A_c)                          =   ${_fmt(afterAc)}    inside-cell-bonus normalisation`);
    console.log(`  × ${_fmt(etaG)}  (eta_g)                        =   ${_fmt(baselineAtTheta, 2)}      gene efficiency`);
    console.log(`  × ${_fmt(thetaHard)}  (theta_bar[c, k*])             =   ${_fmt(predicted, 2)}      predicted for this cell`);
    console.log(`  observed N_{c, g}                        =  ${_fmt(observed)}`);
    const checkLine = `  gamma check  (rSpot + obs) / (rSpot + pred)  =  (${rSpot} + ${_fmt(observed, 3)}) / (${rSpot} + ${_fmt(predicted, 3)})  =  ${_fmt(gammaCheck)}`;
    if (matches) {
        console.log(`${checkLine}  OK`);
    } else {
        console.warn(`${checkLine}  MISMATCH stored=${_fmt(gammaStored)}`);
    }
    console.groupEnd();
}

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

// Monotonic counter bumped once per showTooltip call. Comparing the captured
// seq against the latest one stored on the tooltip element ensures only the
// most recent dispatch's async appends survive. Centralising the bump in
// showTooltip means every dispatch (cell, spot, region, or empty space)
// invalidates any in-flight appends from prior dispatches.
let __diagSeq = 0;

/**
 * Append an HTML row to the open tooltip if this orchestration is still the
 * latest. Guards against late async responses and against multiple onHover
 * dispatches for the same picked object.
 */
function appendDiagnosticRow(tooltipElement, seq, html) {
    if (tooltipElement.dataset.diagSeq !== seq) return;
    tooltipElement.insertAdjacentHTML('beforeend', html);
}

function appendDiagnosticErrorRow(tooltipElement, seq, label, reason) {
    appendDiagnosticRow(
        tooltipElement,
        seq,
        `<strong>${escapeHtml(label)}:</strong> <span style="color:#c00">error: ${escapeHtml(reason)}</span>`
    );
}

/**
 * Add the assigned-class theta row to the cell tooltip. Silent when the
 * diagnostics db is not connected. Surfaces every other failure both in
 * DevTools and as a visible red row in the tooltip.
 */
function maybeAppendCellTheta(tooltipElement, seq, cellLabel) {
    if (!window.appState?.checkCellConnected) return;

    getCellInfo(cellLabel)
        .then(info => {
            appendDiagnosticRow(
                tooltipElement,
                seq,
                `<strong>Theta:</strong> ${info.thetaHard.toFixed(3)}`
            );
            // Best-effort console-only diagnostic. Never let it bubble up and
            // affect the tooltip rendering.
            try { logThetaChain(cellLabel, info); }
            catch (e) { console.warn('[theta chain] emitter failed:', e); }
        })
        .catch(e => {
            const reason = e?.message || 'unknown';
            console.warn('tooltip diagnostics:', { kind: 'cell', cellLabel, error: reason });
            appendDiagnosticErrorRow(tooltipElement, seq, 'Theta', reason);
        });
}

/**
 * Add the gamma_assigned row to the spot tooltip. Silent when the diagnostics
 * db is not connected or the parent cell is background. Surfaces every other
 * failure both in DevTools and as a visible red row in the tooltip.
 */
function maybeAppendSpotGamma(tooltipElement, seq, parentLabel, gene, spotId) {
    if (!window.appState?.checkCellConnected) return;
    if (!parentLabel || parentLabel === 0) return;

    const genePanel = window.appState.genePanel;
    if (!genePanel) {
        const reason = 'genePanel missing on appState';
        console.warn('tooltip diagnostics:', { kind: 'spot', spotId, parentLabel, gene, error: reason });
        appendDiagnosticErrorRow(tooltipElement, seq, 'Gamma', reason);
        return;
    }

    const geneIdx = genePanel.indexOf(gene);
    if (geneIdx < 0) {
        const reason = `gene not in panel: ${gene}`;
        console.warn('tooltip diagnostics:', { kind: 'spot', spotId, parentLabel, gene, error: reason });
        appendDiagnosticErrorRow(tooltipElement, seq, 'Gamma', reason);
        return;
    }

    getCellInfo(parentLabel)
        .then(info => {
            appendDiagnosticRow(
                tooltipElement,
                seq,
                `<strong>Gamma:</strong> ${info.gammaAssignedVec[geneIdx].toFixed(3)}`
            );
            // Best-effort console-only diagnostic. Never let it bubble up and
            // affect the tooltip rendering.
            try { logGammaChain(spotId, parentLabel, geneIdx, gene, info); }
            catch (e) { console.warn('[gamma chain] emitter failed:', e); }
        })
        .catch(e => {
            const reason = e?.message || 'unknown';
            console.warn('tooltip diagnostics:', { kind: 'spot', spotId, parentLabel, gene, error: reason });
            appendDiagnosticErrorRow(tooltipElement, seq, 'Gamma', reason);
        });
}

/**
 * Show tooltip with polygon or gene information
 * Displays contextual information when hovering over interactive elements
 * @param {Object} info - Hover info from deck.gl
 * @param {HTMLElement} tooltipElement - Tooltip DOM element
 */
export function showTooltip(info, tooltipElement) {
    // Bump once per dispatch so any in-flight diagnostic appends from prior
    // hovers see a fresh seq and skip themselves.
    const seq = String(++__diagSeq);
    tooltipElement.dataset.diagSeq = seq;

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

                            // Derive centroid plane from z coordinate
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

                        // Get cell class probability if available
                        if (cellData.classification && cellData.classification.className && cellData.classification.probability) {
                            const classIndex = cellData.classification.className.indexOf(cellClass);
                            if (classIndex >= 0) {
                                const prob = cellData.classification.probability[classIndex];
                                classProb = `<strong>Class Probability:</strong> ${(prob * 100).toFixed(1)}%<br>`;
                            }
                        }

                        // Get total gene counts
                        if (typeof cellData.totalGeneCount === 'number') {
                            totalGeneCount = `<strong>Total Gene Counts:</strong> ${cellData.totalGeneCount.toFixed(2)}<br>`;
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

                // Internal index from diagnostics label_map (only when diagnostics are loaded)
                let internalLabel = '';
                const labelMap = window.appState && window.appState.labelMap;
                if (labelMap) {
                    const internal = labelMap[String(cellLabel)];
                    if (internal !== undefined) {
                        internalLabel = `<strong>Internal Index:</strong> ${internal}<br>`;
                    }
                }

                content =  `<strong>Cell Label:</strong> ${cellLabel}<br>
                            ${cellCoords}
                            ${centroidPlane}
                            <strong>Polygon Plane:</strong> ${planeId}<br>
                            <strong>Cell Class:</strong> ${cellClass}<br>
                            ${classProb}
                            ${totalGeneCount}
                            ${colorHex}
                            ${internalLabel}`;

                maybeAppendCellTheta(tooltipElement, seq, cellLabel);
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

            maybeAppendSpotGamma(tooltipElement, seq, info.object.neighbour, gene, info.object.spot_id);
        } else if (info.object.name) {
            // Region tooltip
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
