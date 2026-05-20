/**
 * Cell Projection Exporter Module
 *
 * Batch-exports one PNG per cell class while Cell Projection mode is active,
 * bundled into a single ZIP archive. For each class the exporter isolates it
 * in state.selectedCellClasses, asks the layers to update, waits for deck.gl's
 * next render, then captures the deck.gl canvas as a PNG and stores it in a
 * JSZip instance. After every class has been captured, the ZIP is built and
 * downloaded as one file. The original selection is restored at the end.
 *
 * Bundling to one ZIP avoids Electron firing a save dialog per file, which
 * would otherwise block the renderer process and freeze pan/zoom.
 *
 * External wiring:
 *   - Reads/writes state.selectedCellClasses (Set) and reads state.allCellClasses (Set).
 *   - Calls the provided updateLayers callback (same one used by the rest of the app).
 *   - Uses deck.gl onAfterRender (via state.deckglInstance.setProps) as the
 *     "frame is on screen" signal so canvas.toBlob() captures real pixels
 *     without needing preserveDrawingBuffer on the global WebGL context.
 *   - Refreshes the Cell Classes drawer and floating widget DOM at the end so
 *     their eye-icons / checkboxes match the restored selection.
 *   - Relies on JSZip loaded globally as window.JSZip (see index.html).
 *
 * Target browsers: Chrome / Firefox / Edge on Linux / Windows / macOS.
 */

import { populateCellClassDrawer } from '../cellClassDrawer.js';
import { populateCellClassWidget } from '../cellClassWidget.js';

/**
 * Export one PNG per cell class, bundled into a single ZIP download.
 *
 * Each PNG is the user-selected rectangle of the deck.gl canvas, painted on top
 * of a white background so transparency-derived margins do not appear in slides.
 *
 * @param {Object}      args
 * @param {Object}      args.state           Shared application state.
 * @param {Function}    args.updateLayers    Callback that rebuilds and pushes layers to deck.gl.
 * @param {Object}      args.bounds          {x, y, width, height} in canvas pixel coords.
 * @param {HTMLElement} [args.statusEl]      Optional element to receive progress text.
 */
export async function exportPerClassPNGs({ state, updateLayers, bounds, statusEl }) {
    const deck = state.deckglInstance;
    const canvas = document.querySelector('#map canvas');

    if (!deck || !canvas) {
        console.warn('Cell Projection export aborted: deck.gl canvas not available');
        return;
    }

    if (!window.JSZip) {
        console.warn('Cell Projection export aborted: JSZip not loaded');
        return;
    }

    if (!state.allCellClasses || state.allCellClasses.size === 0) {
        console.warn('Cell Projection export aborted: no cell classes available');
        return;
    }

    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        console.warn('Cell Projection export aborted: no export region selected');
        return;
    }

    const classes = Array.from(state.allCellClasses).sort();
    const originalSelection = new Set(state.selectedCellClasses);
    const zip = new window.JSZip();

    setStatus(statusEl, `Capturing 0 / ${classes.length}`);

    try {
        for (let i = 0; i < classes.length; i++) {
            const className = classes[i];

            state.selectedCellClasses.clear();
            state.selectedCellClasses.add(className);

            updateLayers();
            await waitForNextRender(deck);

            const blob = await canvasRegionToBlob(canvas, bounds);
            if (blob) {
                zip.file(`${sanitiseFilename(className)}.png`, blob);
            } else {
                console.warn(`Cell Projection export: failed to capture frame for class "${className}"`);
            }

            setStatus(statusEl, `Capturing ${i + 1} / ${classes.length}`);
        }

        setStatus(statusEl, 'Building ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, 'cell_projections.zip');
        setStatus(statusEl, 'Done');
    } finally {
        state.selectedCellClasses.clear();
        originalSelection.forEach(c => state.selectedCellClasses.add(c));
        populateCellClassDrawer();
        populateCellClassWidget();
        updateLayers();
    }
}

/**
 * Resolve once deck.gl finishes the next frame.
 *
 * deck.gl v8 invokes this.props.onAfterRender as a function on every frame,
 * so after we resolve we must leave a callable there (a no-op), not null.
 * Setting it to null would make every subsequent render throw and freeze
 * the canvas.
 */
const NOOP_AFTER_RENDER = () => {};

function waitForNextRender(deck) {
    return new Promise(resolve => {
        deck.setProps({
            onAfterRender: () => {
                deck.setProps({ onAfterRender: NOOP_AFTER_RENDER });
                resolve();
            }
        });
    });
}

/**
 * Crop the deck.gl canvas to the user-selected rectangle and return a PNG blob.
 * Pixels deck.gl left transparent stay transparent in the PNG, so the saved
 * image has no border around the tissue and composites cleanly onto any slide
 * background.
 */
function canvasRegionToBlob(sourceCanvas, bounds) {
    const out = document.createElement('canvas');
    out.width = bounds.width;
    out.height = bounds.height;

    out.getContext('2d').drawImage(
        sourceCanvas,
        bounds.x, bounds.y, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
    );

    return new Promise(resolve => out.toBlob(resolve, 'image/png'));
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Strip characters that are unsafe on Windows / macOS / Linux filesystems.
 */
function sanitiseFilename(name) {
    const cleaned = String(name || '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'unknown';
}

function setStatus(el, text) {
    if (el) el.textContent = text;
}