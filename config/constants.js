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

// Background tile channels (base layers) defined by the user in config.js.
// The first channel is the default selection.
const tileChannels = userConfig.channels || [];

// Find a channel by id. Falls back to the first (default) channel when the id
// is missing or unknown, so callers always get a usable channel.
function findChannel(channelId) {
    return tileChannels.find(channel => channel.id === channelId) || tileChannels[0] || null;
}

// Tile URL pattern (with {plane}/{z}/{y}/{x} placeholders) for a given channel.
export function getTileUrlPattern(channelId) {
    const channel = findChannel(channelId);
    return channel ? channel.tiles : null;
}

// Channel registry for the renderer: the ids and labels to show in the basemap
// switcher, plus which channel is selected first. The channel switcher UI uses
// this to build its radio group.
export function getTileChannels() {
    return {
        channels: tileChannels.map(channel => ({ id: channel.id, label: channel.label })),
        defaultChannelId: tileChannels.length > 0 ? tileChannels[0].id : null
    };
}

// Default tint: white is a no-op when multiplied onto a tile, so channels
// without a tint render exactly as their source image.
const NO_TINT = [255, 255, 255];

// '#RRGGBB' -> [r, g, b], or null when it is not a valid hex colour.
function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!match) return null;
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

// Tint colour [r, g, b] for a channel, multiplied onto its tiles by the
// BitmapLayer (tintColor). Read from the channel's optional "tint" hex string in
// config. Grayscale tiles take the colour (e.g. red GCaMP); RGB tiles with no
// tint are left unchanged.
export function getChannelTint(channelId) {
    const channel = findChannel(channelId);
    return hexToRgb(channel && channel.tint) || NO_TINT;
}
