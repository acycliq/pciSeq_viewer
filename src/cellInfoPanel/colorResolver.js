/**
 * Color Resolver Module
 *
 * Manages the color scheme mapping for cell classes used by the donut chart and legend.
 * Builds a colorMap from available color scheme sources and provides lookup via getClassColor().
 */

const colorMap = new Map();

/**
 * Initialize the color scheme by merging all available color sources.
 * Called once during app startup after color schemes are loaded.
 */
export function initColorScheme() {
    let merged = [];

    // 1) Prefer explicitly set currentColorScheme
    if (window.currentColorScheme && Array.isArray(window.currentColorScheme.cellClasses)) {
        merged = merged.concat(window.currentColorScheme.cellClasses);
    }
    // 2) Add selected scheme from config/colorSchemes.js
    if (typeof window.classColorsCodes === 'function') {
        const base = window.classColorsCodes();
        if (Array.isArray(base)) merged = merged.concat(base);
    }
    // 3) Merge any additional known schemes if present (for cross-dataset labels)
    if (typeof window.classColorsCodes_hippocampus === 'function') {
        const hip = window.classColorsCodes_hippocampus();
        if (Array.isArray(hip)) merged = merged.concat(hip);
    }
    if (typeof window.classColorsCodes_zeisel === 'function') {
        const zei = window.classColorsCodes_zeisel();
        if (Array.isArray(zei)) merged = merged.concat(zei);
    }
    if (typeof window.classColorsCodes_allen === 'function') {
        const aln = window.classColorsCodes_allen();
        if (Array.isArray(aln)) merged = merged.concat(aln);
    }

    // Build map (later entries overwrite earlier ones if duplicate className)
    merged.forEach(cellClass => {
        if (cellClass && cellClass.className) colorMap.set(cellClass.className, cellClass);
    });

    // Ensure fallback entries exist
    if (!colorMap.has('Other')) colorMap.set('Other', { className: 'Other', color: '#C0C0C0' });
    if (!colorMap.has('Generic')) colorMap.set('Generic', { className: 'Generic', color: '#C0C0C0' });
}

/**
 * Resolve the display color for a given cell class name.
 * Checks the local colorMap first, then falls back to appState.cellClassColors,
 * and finally returns default gray.
 * @param {string} className - The cell class name
 * @returns {string} Hex color string
 */
export function getClassColor(className) {
    // 1) Check local colorMap (built during initColorScheme)
    const entry = colorMap.get(className);
    if (entry && entry.color) return entry.color;

    // 2) Fallback: check appState.cellClassColors (RGB array -> hex)
    try {
        const map = window.appState && window.appState.cellClassColors;
        if (map && map.has && map.has(className)) {
            const rgb = map.get(className);
            if (Array.isArray(rgb) && rgb.length >= 3) {
                const toHex = (v) => ('0' + Math.max(0, Math.min(255, v | 0)).toString(16)).slice(-2);
                return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
            }
        }
    } catch (e) {}

    // 3) Default gray
    return '#C0C0C0';
}

// --- Gene colors (spot mode) -------------------------------------------- //
// Spot donut slices are colored by gene using the same glyph palette as the
// map markers (glyphSettings), so the donut matches the dots on screen. Built
// lazily and cached; 'Generic' is the fallback entry.
let _geneColorMap = null;

function ensureGeneColorMap() {
    if (_geneColorMap) return _geneColorMap;
    _geneColorMap = new Map();
    try {
        if (typeof glyphSettings === 'function') {
            for (const s of glyphSettings()) {
                if (s && s.gene) _geneColorMap.set(s.gene, s.color);
            }
        }
    } catch (e) {}
    return _geneColorMap;
}

/**
 * Resolve the display color for a gene, matching the map's glyph palette.
 * @param {string} geneName
 * @returns {string} hex color string
 */
export function getGeneColor(geneName) {
    const map = ensureGeneColorMap();
    const c = map.get(geneName);
    if (c) return c;
    return map.get('Generic') || '#C0C0C0';
}
