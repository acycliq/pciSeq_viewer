/**
 * Cell Class Utilities Module
 *
 * Shared utilities for working with cell class data.
 * Consolidates duplicate functions from layerCreators.js and dataLoaders.js
 */

/**
 * Get the most probable cell class for a cell
 * @param {number|string} cellLabel - Cell label/ID
 * @param {Map} cellDataMap - Map of cell data
 * @returns {string} Most probable class name or 'Generic'/'Unknown'
 */
export function getMostProbableClass(cellLabel, cellDataMap) {
    if (!cellDataMap) return 'Generic';

    const cell = cellDataMap.get(Number(cellLabel));
    if (!cell || !cell.classification) return 'Generic';

    let names = cell.classification.className;
    let probs = cell.classification.probability;

    // Normalize if className came in as a stringified list
    if (!Array.isArray(names) && typeof names === 'string') {
        try {
            const parsed = JSON.parse(names.replace(/'/g, '"'));
            if (Array.isArray(parsed)) names = parsed;
        } catch {}
    }

    if (!Array.isArray(names)) {
        console.error('getMostProbableClass: className is not array', { cellLabel, names, cell });
        return 'Unknown';
    }

    if (!Array.isArray(probs) || probs.length !== names.length) {
        console.error('getMostProbableClass: probabilities invalid/mismatch', { cellLabel, names, probs });
        return 'Unknown';
    }

    // Find the class with highest probability
    let best = -Infinity, idx = -1;
    for (let i = 0; i < probs.length; i++) {
        if (typeof probs[i] === 'number' && probs[i] > best) {
            best = probs[i];
            idx = i;
        }
    }

    if (idx < 0 || idx >= names.length) {
        console.error('getMostProbableClass: no valid index', { cellLabel, names, probs });
        return 'Unknown';
    }

    const raw = names[idx];
    const cls = (typeof raw === 'string') ? raw.trim() : String(raw || 'Unknown');

    if (!raw) {
        console.warn(`getMostProbableClass: Cell ${cellLabel} selected class is empty/null, using 'Unknown' fallback. Raw value:`, raw);
    }

    // Debug logging for specific cells
    try {
        const adv = window.advancedConfig ? window.advancedConfig() : null;
        if (adv?.performance?.showPerformanceStats && Number(cellLabel) === 7113) {
            console.log(`Class resolution for cell ${cellLabel}:`, { names, probs, chosen: cls });
        }
    } catch {}

    return cls;
}

/**
 * Convert hex color to RGB array
 * @param {string} hex - Hex color string (e.g., '#FF0000')
 * @returns {number[]} RGB array [r, g, b]
 */
export function hexToRgb(hex) {
    try {
        const c = d3.rgb(hex);
        if (c) return [c.r, c.g, c.b];
    } catch {}
    console.warn(`Invalid or unsupported color '${hex}', using fallback gray`);
    return [192, 192, 192];
}

/**
 * Ensure colors exist for all cell classes in features
 * @param {Array} features - GeoJSON features
 * @param {Map} cellClassColors - Color mapping to update
 */
export function ensureClassColors(features, cellClassColors) {
    try {
        const seen = new Set();
        const colorFn = (typeof window.classColorsCodes === 'function') ? window.classColorsCodes : null;
        const scheme = colorFn ? colorFn() : [];

        for (const f of features) {
            const cls = f?.properties?.cellClass;
            if (!cls || seen.has(cls) || cellClassColors.has(cls)) continue;
            seen.add(cls);
            const entry = scheme.find(e => e.className === cls);
            if (entry && entry.color) {
                cellClassColors.set(cls, hexToRgb(entry.color));
            }
        }
    } catch {}
}