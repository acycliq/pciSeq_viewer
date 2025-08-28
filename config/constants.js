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

// Transform user config into application constants
export const GENE_DATA_URL = userConfig.geneDataFile;
export const CELL_DATA_URL = userConfig.cellDataFile;

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

// Feature flags
export const USE_ARROW = Boolean(advancedUserConfig?.performance?.useArrow);

// Arrow manifests and related paths (optional)
export const ARROW_MANIFESTS = {
    spotsManifest: userConfig.arrowSpotsManifest || './data/arrow_spots/manifest.json',
    cellsManifest: userConfig.arrowCellsManifest || './data/arrow_cells/manifest.json',
    boundariesManifest: userConfig.arrowBoundariesManifest || './data/arrow_boundaries/manifest.json',
    cellsClassDict: userConfig.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
    spotsGeneDict: userConfig.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
};

// Color palette for different polygon aliases
export const POLYGON_COLOR_PALETTE = [
    [255, 99, 132],   // Red
    [54, 162, 235],   // Blue
    [255, 205, 86],   // Yellow
    [75, 192, 192],   // Teal
    [153, 102, 255],  // Purple
    [255, 159, 64],   // Orange
    [201, 203, 207],  // Grey
    [255, 99, 255],   // Pink
    [99, 255, 132],   // Green
    [132, 99, 255],   // Indigo
];

// Polygon Alias Generation Thresholds
export const POLYGON_ALIAS_THRESHOLDS = {
    GROUP_A_MAX: 2000,
    GROUP_B_MAX: 4000,
    GROUP_C_MAX: 6000
};

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
export function getPolygonFileUrl(planeNumber) {
    // Zero-pad plane number to match file naming convention (plane_00.tsv, plane_01.tsv, etc.)
    const paddedPlaneNumber = planeNumber.toString().padStart(2, '0');
    return userConfig.cellBoundaryFiles.replace('{plane}', paddedPlaneNumber);
}

// Helper function to get tile URL pattern
export function getTileUrlPattern() {
    return userConfig.backgroundTiles;
}
