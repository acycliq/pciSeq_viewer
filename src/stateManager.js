// Import configuration constants
import { DEFAULT_STATE } from '../config/constants.js';

// Application state
const state = {
    currentPlane: DEFAULT_STATE.currentPlane,
    deckglInstance: null,
    isLoading: false,
    
    // Layer visibility
    showTiles: DEFAULT_STATE.showTiles,
    showPolygons: DEFAULT_STATE.showPolygons,
    showGenes: DEFAULT_STATE.showGenes,
    showZProjectionOverlay: false,
    zProjectionOpacity: 0.3,
    
    // Data caches
    tileCache: new Map(),
    polygonCache: new Map(),
    geneDataMap: new Map(),
    cellDataMap: new Map(),
    
    // Lightning-fast lookup indexes
    cellToSpotsIndex: new Map(), // cellLabel -> array of spots (O(1) lookup)
    spotToParentsIndex: new Map(), // spotId -> parent info (O(1) lookup)
    cellBoundaryIndex: new Map(), // cellId -> [planeId1, planeId2, ...] (O(1) lookup)
    
    // Layer persistence for better performance
    tileLayers: new Map(), // Cache tile layer instances
    
    // Performance tracking
    polygonLoadTimes: new Map(),
    lastCleanupTime: Date.now(),
    
    // Cell class data for coloring (no filtering, just colors)
    cellClassColors: new Map(),
    allCellClasses: new Set(),
    selectedCellClasses: new Set(), // For filtering visibility
    
    // Gene data
    selectedGenes: new Set(),
    geneIconAtlas: null,
    geneIconMapping: null,
    geneSizeScale: DEFAULT_STATE.geneSizeScale,
    
    // Polygon opacity
    polygonOpacity: DEFAULT_STATE.polygonOpacity,
    
    // Score filtering
    scoreThreshold: 0.0,  // Default: show all spots (minimum score)
    scoreRange: [0, 1.0], // Normalized score range [min, max]
    hasScores: false,     // Whether dataset contains valid OMP scores
    
    // Sizing behavior
    uniformMarkerSize: false, // When true, ignore plane distance for marker size
    
    // Interactions
    polygonHighlighter: null,
    genePanelWin: null
    ,
    // Cache of last IconLayers to avoid blocking destruction when switching to pointcloud
    lastIconLayers: [],
    iconCleanupPending: false,
    // Transition timing
    zoomTransition: { inProgress: false, from: null, to: null, start: 0 },
    deferredCleanupStart: 0,
    iconCleanupRemaining: 0
};

// Expose state globally for cell lookup module
window.appState = state;

// === DEBUG/CONSOLE ACCESS ===
// Expose data for console access and debugging
window.debugData = {
    // Raw data access
    geneData: () => state.geneDataMap,
    cellData: () => state.cellDataMap,
    boundaries: () => state.polygonCache,
    
    // Helper functions for common queries
    getGeneSpots: (geneName) => state.geneDataMap.get(geneName),
    getCell: (cellNum) => state.cellDataMap.get(cellNum),
    getBoundaries: (planeNum) => state.polygonCache.get(planeNum),
    
    // ⚡ LIGHTNING-FAST LOOKUPS ⚡
    // Get all spots for a specific parent cell (O(1) lookup)
    getSpotsForCell: (cellLabel) => {
        return state.cellToSpotsIndex.get(cellLabel) || [];
    },
    
    // Get parent info for a specific spot (O(1) lookup)
    getParentsForSpot: (spot_id) => {
        return state.spotToParentsIndex.get(spot_id) || null;
    },
    
    // Get all plane IDs where a cell has boundaries (O(1) lookup)
    getCellBoundaryPlanes: (cellId) => {
        return state.cellBoundaryIndex.get(cellId) || [];
    },
    
    // Summary functions
    listGenes: () => Array.from(state.geneDataMap.keys()),
    listCells: () => Array.from(state.cellDataMap.keys()),
    listPlanes: () => Array.from(state.polygonCache.keys()),
    
    // Statistics
    geneCount: () => state.geneDataMap.size,
    cellCount: () => state.cellDataMap.size,
    planesLoaded: () => state.polygonCache.size,
    indexStats: () => ({
        cellsIndexed: state.cellToSpotsIndex.size,
        spotsIndexed: state.spotToParentsIndex.size,
        cellBoundariesIndexed: state.cellBoundaryIndex.size
    }),
    
    // Current state
    currentPlane: () => state.currentPlane,
    appState: () => state
};

export { state };
