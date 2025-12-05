// Class Colour Scheme Import Helpers
// Applies user-provided JSON mapping { className: "#RRGGBB", ... } to state.cellClassColors

import { state } from './stateManager.js';

function hexToRgb(hex) {
    try {
        // d3 is available globally from index.html
        const c = d3.rgb(hex);
        return [c.r | 0, c.g | 0, c.b | 0];
    } catch (e) {
        return null;
    }
}

// Apply a colour scheme object directly
// Returns { appliedCount, notFoundClasses, pending }
export function applyClassColorScheme(scheme, replaceMode = false) {
    if (!scheme || typeof scheme !== 'object' || Array.isArray(scheme)) {
        throw new Error('Invalid JSON format. Expected an object mapping class names to hex colours.');
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

    for (const [name, hex] of Object.entries(scheme)) {
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

