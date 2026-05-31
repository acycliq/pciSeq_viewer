// Class Colour Scheme Import Helpers
// Applies a user-provided colour scheme to state.cellClassColors. The scheme can
// be either an object map { className: "#RRGGBB", ... } or an array of
// { className, color } objects (the same shape as the built-in colour schemes).

import { state } from './state/stateManager.js';

function hexToRgb(hex) {
    try {
        // d3 is available globally from index.html
        const c = d3.rgb(hex);
        return [c.r | 0, c.g | 0, c.b | 0];
    } catch (e) {
        return null;
    }
}

// Normalise an imported scheme into a plain { className: hex } map.
// Accepts an object map { "ClassName": "#RRGGBB", ... } or an array of
// { className, color } objects. The colour field may be spelled "color" or
// "colour". Returns null if the shape is unusable.
function toClassColorMap(scheme) {
    if (Array.isArray(scheme)) {
        const map = {};
        for (const entry of scheme) {
            if (entry && typeof entry === 'object' && entry.className) {
                map[entry.className] = entry.color ?? entry.colour;
            }
        }
        return map;
    }
    if (scheme && typeof scheme === 'object') {
        return scheme;
    }
    return null;
}

// Apply a colour scheme to the cell-class colours.
// Returns { appliedCount, notFoundClasses, pending }
export function applyClassColorScheme(scheme, replaceMode = false) {
    const colorMap = toClassColorMap(scheme);
    if (!colorMap) {
        throw new Error('Invalid JSON format. Expected an object mapping class names to hex colours, or an array of {className, color} objects.');
    }

    // If classes are not discovered yet, stash and apply later
    if (!state.allCellClasses || state.allCellClasses.size === 0) {
        state.pendingClassColorScheme = scheme;
        return { appliedCount: 0, notFoundClasses: [], pending: true };
    }

    const present = state.allCellClasses;
    let applied = 0;
    const notFound = [];

    // In replace mode, clear existing colors first
    if (replaceMode) {
        state.cellClassColors.clear();
    }

    for (const [name, hex] of Object.entries(colorMap)) {
        if (!present.has(name)) {
            notFound.push(name);
            continue;
        }
        const rgb = hexToRgb(hex);
        if (!rgb) continue;
        state.cellClassColors.set(name, rgb);
        applied++;
    }

    return { appliedCount: applied, notFoundClasses: notFound, pending: false };
}

// Apply pending scheme if one was loaded before classes were known
export function applyPendingClassColorSchemeIfAny() {
    if (state.pendingClassColorScheme) {
        const res = applyClassColorScheme(state.pendingClassColorScheme);
        state.pendingClassColorScheme = null;
        return res;
    }
    return { appliedCount: 0, notFoundClasses: [], pending: false };
}