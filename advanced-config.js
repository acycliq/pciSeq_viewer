/**
 * Advanced Application Configuration (Arrow-only)
 *
 * TSV handling has been completely removed from the runtime.
 * Data must be loaded from Arrow manifests exclusively.
 * The `useArrow` flag is now mandatory and must remain true.
 */

function advancedConfig() {
    return {
        // Performance settings
        performance: {
            preloadRadius: 3,           // How many planes to preload ahead/behind
            maxTileCache: 1000,         // Maximum number of tiles to keep in memory
            sliderDebounce: 100,        // Debouncing for slider interactions (ms)
            loadingTimeout: 2000,       // Loading timeout (ms)
            showPerformanceStats: true  // Show performance timing in console
        },

        // Display settings
        display: {
            showBackgroundImages: true, // Show background tiles on startup
            showCellBoundaries: true,   // Show cell boundary polygons on startup
            showGeneMarkers: true,      // Show gene markers on startup
            geneMarkerSize: 1.0,        // Default gene marker size (1.0 = normal)
            polygonOpacity: 0.4         // Default polygon opacity (0.0 to 1.0)
        },

        // Visualization settings
        visualization: {
            tileSize: 256,              // Tile size for coordinate system
            geneBaseSize: 20,           // Base size for gene markers
            geneMinScale: 0.5,          // Minimum gene marker scale
            geneMaxScale: 3.0,          // Maximum gene marker scale
            geneScaleStep: 0.1          // Step size for gene marker scaling
        }
    };
}

// Make available globally
window.advancedConfig = advancedConfig;
