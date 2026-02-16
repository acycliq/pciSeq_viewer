/**
 * Color Resolver Module
 *
 * Manages the color scheme mapping for cell classes used by the donut chart and legend.
 * Builds a colorMap from available color scheme sources and provides lookup.
 */

let colorMap = new Map();

/**
 * Initialize the color scheme by merging all available color sources.
 * Called once during app startup after color schemes are loaded.
 */
export function initColorScheme() {
    try {
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
        // Build map (later entries can overwrite earlier ones if duplicate)
        merged.forEach(cellClass => {
            if (cellClass && cellClass.className) colorMap.set(cellClass.className, cellClass);
        });
        if (!colorMap.has('Other')) colorMap.set('Other', { className: 'Other', color: '#C0C0C0' });
        if (!colorMap.has('Generic')) colorMap.set('Generic', { className: 'Generic', color: '#C0C0C0' });
    } catch (e) {
        console.warn('Failed to init color scheme:', e);
    }

    // Also populate window.currentColorScheme for cellHoverHandler's buildCellInfoData
    try {
        let cellClasses = null;
        if (typeof window.classColorsCodes === 'function') {
            cellClasses = window.classColorsCodes();
        } else if (typeof window.getColorScheme === 'function') {
            const cs = window.getColorScheme();
            cellClasses = cs && cs.cellClasses ? cs.cellClasses : null;
        }
        if (Array.isArray(cellClasses)) {
            window.currentColorScheme = { cellClasses };
        } else {
            window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
        }
    } catch (error) {
        window.currentColorScheme = { cellClasses: [{ className: 'Generic', color: '#C0C0C0' }, { className: 'Other', color: '#C0C0C0' }] };
    }
}

/**
 * Resolve the display color for a given cell class name.
 * Falls back to appState.cellClassColors, then to default gray.
 * @param {string} className - The cell class name
 * @returns {string} Hex color string
 */
export function getClassColor(className) {
    if (colorMap.size > 0) {
        const entry = colorMap.get(className);
        if (entry && entry.color) return entry.color;
    }
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
    return '#C0C0C0';
}

/**
 * Get the internal colorMap (used by donutChart to pass to D3)
 * @returns {Map} The color map
 */
export function getColorMap() {
    return colorMap;
}
