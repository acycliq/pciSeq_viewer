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
    depth: userConfig.totalPlanes,
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
    currentPlane: userConfig.startingPlane,
    showTiles: advancedUserConfig.display.showBackgroundImages,
    showPolygons: advancedUserConfig.display.showCellBoundaries,
    showGenes: advancedUserConfig.display.showGeneMarkers,
    geneSizeScale: advancedUserConfig.display.geneMarkerSize,
    polygonOpacity: advancedUserConfig.display.polygonOpacity
};

// Feature flags removed: Arrow-only runtime

// Arrow manifests and related paths (optional)
export const ARROW_MANIFESTS = {
    spotsManifest: userConfig.arrowSpotsManifest || './data/arrow_spots/manifest.json',
    cellsManifest: userConfig.arrowCellsManifest || './data/arrow_cells/manifest.json',
    boundariesManifest: userConfig.arrowBoundariesManifest || './data/arrow_boundaries/manifest.json',
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
    genePanelBtn: 'genePanelBtn',
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
export function getTileUrlPattern() {
    return userConfig.backgroundTiles;
}
