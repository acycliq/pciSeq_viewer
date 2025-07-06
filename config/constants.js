/**
 * Configuration constants for the Combined Gene Expression and Cell Boundary Viewer
 */

// Application URLs and Data Sources
export const TILE_BASE_URL = 'https://storage.googleapis.com/christina_silver_hc/tiles_hc';
export const GENE_DATA_URL = 'data/geneData.tsv';

// Image and Tile Configuration
export const IMG_DIMENSIONS = {
    width: 6411,
    height: 4412,
    depth: 99,
    tileSize: 256
};

// View Configuration
export const INITIAL_VIEW_STATE = {
    target: [256 * 0.5, 256 * 0.5 * 4412 / 6411, 0],
    zoom: 4,
    minZoom: 0,
    maxZoom: 8
};

// Performance Configuration
export const MAX_PRELOAD = 3;
export const MAX_TILE_CACHE = 1000;

// Default Application State
export const DEFAULT_STATE = {
    currentPlane: 50,
    showTiles: true,
    showPolygons: true,
    showGenes: true,
    geneSizeScale: 1.0
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
    toggleAllPolygons: 'toggleAllPolygons',
    polygonAliasControls: 'polygonAliasControls',
    geneSizeSlider: 'geneSizeSlider',
    geneSizeValue: 'geneSizeValue',
    toggleAllGenes: 'toggleAllGenes',
    layerControls: 'layerControls',
    minimizeBtn: 'minimizeBtn'
};

// Gene Size Configuration
export const GENE_SIZE_CONFIG = {
    BASE_SIZE: 20,
    MIN_SCALE: 0.5,
    MAX_SCALE: 3.0,
    SCALE_STEP: 0.1,
    DEFAULT_SCALE: 1.0
};

// Timing Configuration
export const TIMING = {
    SLIDER_DEBOUNCE: 100, // ms
    LOADING_TIMEOUT: 2000 // ms
};