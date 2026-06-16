/**
 * Application Constants (Generated from User Configuration)
 *
 * This file transforms the user-friendly config.js into the structured constants
 * that the application modules expect. Users should modify config.js, not this file.
 */

// Get advanced config (always available - static defaults)
const advancedUserConfig = window.advancedConfig ? window.advancedConfig() : null;

if (!advancedUserConfig) {
    throw new Error('Advanced configuration not found. Make sure advanced-config.js is loaded before this file.');
}

// IMG_DIMENSIONS is computed lazily because imageWidth/imageHeight
// may not be available until metadata is loaded in Electron mode
let _imgDimensions = null;
export const IMG_DIMENSIONS = {
    get width() {
        if (_imgDimensions === null) {
            const cfg = window.config ? window.config() : null;
            _imgDimensions = {
                width: cfg?.imageWidth || 6411,
                height: cfg?.imageHeight || 4412
            };
        }
        return _imgDimensions.width;
    },
    get height() {
        if (_imgDimensions === null) {
            const cfg = window.config ? window.config() : null;
            _imgDimensions = {
                width: cfg?.imageWidth || 6411,
                height: cfg?.imageHeight || 4412
            };
        }
        return _imgDimensions.height;
    },
    // Depth (number of planes) is derived from Arrow manifests at runtime
    depth: 0,
    tileSize: 256
};

// INITIAL_VIEW_STATE is also computed lazily
let _initialViewState = null;
export const INITIAL_VIEW_STATE = {
    get target() {
        if (_initialViewState === null) {
            const cfg = window.config ? window.config() : null;
            const w = cfg?.imageWidth || 6411;
            const h = cfg?.imageHeight || 4412;
            _initialViewState = {
                target: [256 * 0.5, 256 * 0.5 * h / w, 0]
            };
        }
        return _initialViewState.target;
    },
    zoom: 2.0,
    minZoom: 0,
    maxZoom: 8
};

export const MAX_PRELOAD = advancedUserConfig.performance.preloadRadius;
export const MAX_TILE_CACHE = advancedUserConfig.performance.maxTileCache;

// Below this zoom spots render as a non-pickable PointCloud. At or above it
// they switch to a pickable IconLayer, which is also when the user is zoomed
// in enough for the cell-hover theta chain log to be useful.
export const SPOT_PICKABLE_MIN_ZOOM = 7;

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

// Arrow manifests and related paths (optional) - computed lazily
let _arrowManifests = null;
export const ARROW_MANIFESTS = {
    get spotsManifest() {
        if (_arrowManifests === null) {
            const cfg = window.config ? window.config() : null;
            _arrowManifests = {
                spotsManifest: cfg?.arrowSpotsManifest || './data/arrow_spots/manifest.json',
                cellsManifest: cfg?.arrowCellsManifest || './data/arrow_cells/manifest.json',
                boundariesManifest: cfg?.arrowBoundariesManifest,
                cellsClassDict: cfg?.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
                spotsGeneDict: cfg?.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
            };
        }
        return _arrowManifests.spotsManifest;
    },
    get cellsManifest() {
        if (_arrowManifests === null) {
            const cfg = window.config ? window.config() : null;
            _arrowManifests = {
                spotsManifest: cfg?.arrowSpotsManifest || './data/arrow_spots/manifest.json',
                cellsManifest: cfg?.arrowCellsManifest || './data/arrow_cells/manifest.json',
                boundariesManifest: cfg?.arrowBoundariesManifest,
                cellsClassDict: cfg?.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
                spotsGeneDict: cfg?.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
            };
        }
        return _arrowManifests.cellsManifest;
    },
    get boundariesManifest() {
        if (_arrowManifests === null) {
            const cfg = window.config ? window.config() : null;
            _arrowManifests = {
                spotsManifest: cfg?.arrowSpotsManifest || './data/arrow_spots/manifest.json',
                cellsManifest: cfg?.arrowCellsManifest || './data/arrow_cells/manifest.json',
                boundariesManifest: cfg?.arrowBoundariesManifest,
                cellsClassDict: cfg?.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
                spotsGeneDict: cfg?.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
            };
        }
        return _arrowManifests.boundariesManifest;
    },
    get cellsClassDict() {
        if (_arrowManifests === null) {
            const cfg = window.config ? window.config() : null;
            _arrowManifests = {
                spotsManifest: cfg?.arrowSpotsManifest || './data/arrow_spots/manifest.json',
                cellsManifest: cfg?.arrowCellsManifest || './data/arrow_cells/manifest.json',
                boundariesManifest: cfg?.arrowBoundariesManifest,
                cellsClassDict: cfg?.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
                spotsGeneDict: cfg?.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
            };
        }
        return _arrowManifests.cellsClassDict;
    },
    get spotsGeneDict() {
        if (_arrowManifests === null) {
            const cfg = window.config ? window.config() : null;
            _arrowManifests = {
                spotsManifest: cfg?.arrowSpotsManifest || './data/arrow_spots/manifest.json',
                cellsManifest: cfg?.arrowCellsManifest || './data/arrow_cells/manifest.json',
                boundariesManifest: cfg?.arrowBoundariesManifest,
                cellsClassDict: cfg?.arrowCellsClassDict || './data/arrow_cells/class_dict.json',
                spotsGeneDict: cfg?.arrowSpotsGeneDict || './data/arrow_spots/gene_dict.json'
            };
        }
        return _arrowManifests.spotsGeneDict;
    }
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
export function getTileUrlPattern() {
    const cfg = window.config ? window.config() : null;
    return cfg?.backgroundTiles;
}

// Per-channel tint colours for the grayscale background tiles. The colour
// multiplies the tile, so white leaves it grayscale and e.g. green makes a
// green-on-luminance image. Channels with no tint stay grayscale.
//
// The tint is no longer hardcoded: each channel declares its own colour in its
// mbtiles 'tint' metadata (written by pciSeq.stage_image), so N files give N
// colours. setChannelTints() is called once after the channels are discovered.
const NO_TINT = [255, 255, 255];

// '#RRGGBB' -> [r, g, b], or null if it is not a valid hex colour.
function hexToRgb(hex) {
    if (typeof hex !== 'string') return null;
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// channel id -> [r, g, b], populated from the mbtiles metadata at load time.
let _channelTints = {};

// Populate the tint map from the channel descriptors returned by
// getTileChannels() (each is { id, label, tint }). Channels without a valid
// tint are left out, so getChannelTintColor falls back to grayscale for them.
export function setChannelTints(channels) {
    _channelTints = {};
    (channels || []).forEach(ch => {
        const rgb = hexToRgb(ch && ch.tint);
        if (rgb) _channelTints[ch.id] = rgb;
    });
}

export function getChannelTintColor(channelId) {
    return _channelTints[channelId] || NO_TINT;
}
