/**
 * Advanced Application Configuration
 * 
 * This file contains detailed settings for developers and advanced users.
 * Most users should only need to modify config.js
 * 
 * These settings control performance, UI behavior, debugging, and advanced features.
 */

function advancedConfig() {
    return {
        // === PERFORMANCE SETTINGS ===
        
        performance: {
            // How many planes to preload ahead/behind current plane
            preloadRadius: 3,
            
            // Maximum number of tiles to keep in memory
            maxTileCache: 1000,
            
            // Debouncing for slider interactions (milliseconds)
            sliderDebounce: 100,
            
            // Loading timeout (milliseconds)
            loadingTimeout: 2000,
            
            // Memory management
            cacheCleanupThreshold: 0.25, // clean 25% when cache is full
            
            // Enable/disable features for performance
            enableTooltips: true,
            enableHighlighting: true,
            enablePreloading: true
        },
        
        // === VISUALIZATION SETTINGS ===
        
        visualization: {
            // Camera controls
            initialZoom: 4,
            minZoom: 0,
            maxZoom: 8,
            enablePan: true,
            enableZoom: true,
            enableRotation: false,
            
            // Tile settings
            tileSize: 256,
            tileOpacity: 1.0,
            
            // Gene marker settings
            geneBaseSize: 20,
            geneMinScale: 0.5,
            geneMaxScale: 3.0,
            geneScaleStep: 0.1,
            geneDepthAttenuation: true,
            
            // Polygon settings
            polygonFilled: true,
            polygonStroked: false,
            polygonFillOpacity: 120, // 0-255
            polygonStrokeWidth: 1
        },
        
        // === COLOR SCHEMES ===
        
        colors: {
            // Polygon group colors (RGB values)
            polygonPalette: [
                [255, 99, 132],   // Red
                [54, 162, 235],   // Blue  
                [255, 205, 86],   // Yellow
                [75, 192, 192],   // Teal
                [153, 102, 255],  // Purple
                [255, 159, 64],   // Orange
                [201, 203, 207],  // Grey
                [255, 99, 255],   // Pink
                [99, 255, 132],   // Green
                [132, 99, 255]    // Indigo
            ],
            
            // Polygon grouping thresholds (based on label values)
            polygonGroupThresholds: [2000, 4000, 6000],
            polygonGroupNames: ["group_A", "group_B", "group_C", "group_D"],
            
            // Gene marker default color
            geneDefault: [255, 255, 255], // White
            
            // UI colors
            background: "#000000",
            text: "#ffffff",
            panelBackground: "rgba(255, 255, 255, 0.95)"
        },
        
        // === USER INTERFACE SETTINGS ===
        
        ui: {
            // Panel visibility on startup
            showLayerControls: true,
            showGenePanel: false,
            
            // Control panel position
            controlsPosition: "top-right", // top-right, top-left, bottom-right, bottom-left
            
            // Enable/disable UI features
            enableKeyboardShortcuts: true,
            enableMouseTooltips: true,
            enableSliderPreview: true,
            
            // Tooltip settings
            tooltipDelay: 0, // milliseconds
            tooltipOffset: { x: 20, y: -60 },
            
            // Keyboard shortcuts
            shortcuts: {
                toggleTiles: 't',
                togglePolygons: 'p', 
                toggleGenes: 'g',
                nextPlane: 'ArrowRight',
                prevPlane: 'ArrowLeft',
                jumpForward: 'PageDown',
                jumpBackward: 'PageUp',
                firstPlane: 'Home',
                lastPlane: 'End'
            }
        },
        
        // === DEBUGGING AND DEVELOPMENT ===
        
        debug: {
            enabled: false, // set to true for development
            logLevel: "warn", // error, warn, info, debug
            showLoadingStats: false,
            showMemoryUsage: false,
            enablePerformanceMonitoring: false,
            showFPS: false,
            logDataLoading: true,
            logLayerUpdates: false
        },
        
        // === DATA FORMAT SETTINGS ===
        
        dataFormat: {
            // Gene data expected columns
            geneColumns: {
                x: "x",
                y: "y", 
                plane: "plane_id",
                gene: "gene_name"
            },
            
            // Polygon data expected columns
            polygonColumns: {
                plane: "plane_id",
                label: "label",
                coordinates: "coords" // should contain JSON array
            },
            
            // Data parsing options
            coordinateOrigin: "top-left", // top-left, bottom-left
            coordinateUnits: "pixels"
        },
        
        // === FEATURE FLAGS ===
        
        features: {
            // Current features
            enableAnimation: false,
            enableExport: false,
            enableAnnotations: false,
            enableMeasurement: false,
            
            // Experimental features (use with caution)
            experimentalGPUAcceleration: false,
            experimentalWebWorkers: false,
            experimentalStreamingData: false
        },
        
        // === NETWORK AND SECURITY ===
        
        network: {
            // CORS settings
            crossOrigin: "anonymous",
            
            // Request timeouts
            dataRequestTimeout: 30000, // 30 seconds
            tileRequestTimeout: 10000,  // 10 seconds
            
            // Retry settings
            maxRetries: 3,
            retryDelay: 1000, // milliseconds
            
            // Cache headers
            enableCaching: true,
            cacheMaxAge: 3600 // 1 hour
        },
        
        // === APPLICATION METADATA ===
        
        app: {
            name: "pciSeq viewer",
            version: "0.0.0",
            description: "Interactive visualization of gene expression data and cell boundaries",
            author: "DN",
            
            // Build information (can be set by build process)
            buildDate: null,
            gitCommit: null,
            environment: "production" // development, staging, production
        }
    };
}

// Preset configurations for different scenarios
const ADVANCED_PRESETS = {
    // High performance preset (reduced features for better performance)
    highPerformance: {
        performance: {
            preloadRadius: 1,
            maxTileCache: 500,
            enableTooltips: false,
            enableHighlighting: false,
            enablePreloading: false
        },
        ui: {
            enableMouseTooltips: false
        }
    },
    
    // Development preset (debug features enabled)
    development: {
        debug: {
            enabled: true,
            logLevel: "debug",
            showLoadingStats: true,
            showMemoryUsage: true,
            enablePerformanceMonitoring: true,
            logDataLoading: true,
            logLayerUpdates: true
        },
        app: {
            environment: "development"
        }
    },
    
    // Large dataset preset (optimized for many planes)
    largeDataset: {
        performance: {
            preloadRadius: 5,
            maxTileCache: 2000,
            cacheCleanupThreshold: 0.2
        }
    },
    
    // Mobile preset (optimized for mobile devices)
    mobile: {
        performance: {
            preloadRadius: 1,
            maxTileCache: 300,
            enablePreloading: false
        },
        visualization: {
            geneBaseSize: 24, // larger touch targets
            initialZoom: 3
        },
        ui: {
            enableKeyboardShortcuts: false,
            tooltipDelay: 300 // longer delay for touch
        }
    }
};

/**
 * Get advanced configuration with optional preset
 * @param {string} presetName - Name of preset to apply
 * @returns {Object} Advanced configuration object
 */
function getAdvancedConfig(presetName = null) {
    const baseConfig = advancedConfig();
    
    if (presetName && ADVANCED_PRESETS[presetName]) {
        return deepMerge(baseConfig, ADVANCED_PRESETS[presetName]);
    }
    
    return baseConfig;
}

/**
 * Deep merge two objects
 * @param {Object} target 
 * @param {Object} source 
 * @returns {Object}
 */
function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

// Make available globally
window.advancedConfig = advancedConfig;
window.getAdvancedConfig = getAdvancedConfig;
window.ADVANCED_PRESETS = ADVANCED_PRESETS;