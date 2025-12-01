/**
 * Application Constants (Generated from User Configuration)
 *
 * This file transforms the user-friendly config.js into the structured constants
 * that the application modules expect. Users should modify config.js, not this file.
 */

// Get the user configuration
const userConfig = window.config ? window.config() : null;
const advancedUserConfig = window.advancedConfig ? window.advancedConfig() : null;

if (!userConfig) {
    throw new Error('Configuration not found. Make sure config.js is loaded before this file.');
}

if (!advancedUserConfig) {
    throw new Error('Advanced configuration not found. Make sure advanced-config.js is loaded before this file.');
}

// Transform user config into application constants (Arrow-only runtime)

export const IMG_DIMENSIONS = {
    width: userConfig.imageWidth,
    height: userConfig.imageHeight,
    // Depth (number of planes) is derived from Arrow manifests at runtime
    depth: 0,
    tileSize: 256
};

export const INITIAL_VIEW_STATE = {
    target: [256 * 0.5, 256 * 0.5 * userConfig.imageHeight / userConfig.imageWidth, 0],
    zoom: 4,
    minZoom: 0,
    maxZoom: 8
};

export const MAX_PRELOAD = advancedUserConfig.performance.preloadRadius;
export const MAX_TILE_CACHE = advancedUserConfig.performance.maxTileCache;

export const DEFAULT_STATE = {
    // Starting plane is set during app init to mid-plane based on manifest
    currentPlane: 0,
    showTiles: advancedUserConfig.display.showBackgroundImages,
    showPolygons: advancedUserConfig.display.showCellBoundaries,
    showGenes: advancedUserConfig.display.showGeneMarkers,
    geneSizeScale: advancedUserConfig.display.geneMarkerSize,
    polygonOpacity: advancedUserConfig.display.polygonOpacity
};

// Helper to get total planes after app init
export function getTotalPlanes() {
    return (window.appState && typeof window.appState.totalPlanes === 'number')
        ? window.appState.totalPlanes
        : 0;
}

// Feature flags removed: Arrow-only runtime

// Arrow manifests and related paths (optional)
export const ARROW_MANIFESTS = {
    spotsManifest: userConfig.arrowSpotsManifest || './data/arrow_spots/manifest.json',
    cellsManifest: userConfig.arrowCellsManifest || './data/arrow_cells/manifest.json',
    boundariesManifest: userConfig.arrowBoundariesManifest,
    cellsClassDict: userConfig.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
    spotsGeneDict: userConfig.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
};

// Color palette for different polygon aliases
// Removed TSV-era polygon alias palette/thresholds (not used in Arrow-only runtime)

// UI Element IDs (for consistency and easier refactoring)
export const UI_ELEMENTS = {
    map: 'map',
    tooltip: 'tooltip',
    planeSlider: 'planeSlider',
    planeLabel: 'planeLabel',
    prevBtn: 'prevBtn',
    nextBtn: 'nextBtn',
    loadingIndicator: 'loadingIndicator',
    // genePanelBtn removed
    showTiles: 'showTiles',
    showPolygons: 'showPolygons',
    showGenes: 'showGenes',
    geneSizeSlider: 'geneSizeSlider',
    geneSizeValue: 'geneSizeValue',
    polygonOpacitySlider: 'polygonOpacitySlider',
    polygonOpacityValue: 'polygonOpacityValue',
    toggleAllGenes: 'toggleAllGenes',
    layerControls: 'layerControls',
    minimizeBtn: 'minimizeBtn'
};

// Gene Size Configuration
export const GENE_SIZE_CONFIG = {
    BASE_SIZE: advancedUserConfig.visualization.geneBaseSize,
    MIN_SCALE: advancedUserConfig.visualization.geneMinScale,
    MAX_SCALE: advancedUserConfig.visualization.geneMaxScale,
    SCALE_STEP: advancedUserConfig.visualization.geneScaleStep,
    DEFAULT_SCALE: advancedUserConfig.display.geneMarkerSize
};


// Helper function to get polygon file URL for a specific plane
// Removed TSV polygon file URL helper (Arrow-only)

// Helper function to get tile URL pattern
// Background sources: support multiple backgrounds while preserving legacy single string
export const BACKGROUNDS = (Array.isArray(userConfig.backgrounds) && userConfig.backgrounds.length)
    ? userConfig.backgrounds
    : [{ id: 'default', name: 'Default', urlPattern: userConfig.backgroundTiles }];

const DEFAULT_BACKGROUND_ID = userConfig.defaultBackgroundId || (BACKGROUNDS[0] && BACKGROUNDS[0].id) || 'default';

// Resolve active background id from app state or URL/default
function resolveActiveBackgroundId() {
    try {
        // Prefer runtime app state if already set (enables dynamic switching)
        if (window.appState && window.appState.activeBackgroundId) return window.appState.activeBackgroundId;
        // Fallback to URL param at load time
        const params = new URLSearchParams(window.location.search);
        const q = params.get('bg');
        return q || DEFAULT_BACKGROUND_ID;
    } catch {
        return DEFAULT_BACKGROUND_ID;
    }
}

export function getActiveBackground() {
    const activeId = resolveActiveBackgroundId();
    return BACKGROUNDS.find(b => b.id === activeId) || BACKGROUNDS[0];
}

export function getTileUrlPattern() {
    const bg = getActiveBackground();
    return (bg && bg.urlPattern) ? bg.urlPattern : (userConfig.backgroundTiles || '');
}
