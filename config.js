/**
 * Simple Application Configuration
 * 
 * This file contains the basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 * 
 * For advanced settings, see: advanced-config.js
 */

function config() {
    return {
        // === YOUR DATASET INFORMATION ===
        
        // How many planes/slices does your dataset have?
        totalPlanes: 100,
        
        // Which plane should the app start on? (0 to totalPlanes-1)
        startingPlane: 50,
        
        // What are the dimensions of your images? (in pixels)
        imageWidth: 6411,
        imageHeight: 4412,
        
        // === YOUR DATA FILE LOCATIONS ===
        
        // Where is your gene expression data file?
        geneDataFile: "./data/geneData.tsv",
        
        // Where are your cell boundary files? 
        // Use {plane} as placeholder - it will be replaced with the actual plane number
        cellBoundaryFiles: "./data/cellBoundaries/plane_{plane}.tsv",
        
        // Where are your background image tiles?
        // Use {plane}, {z}, {y}, {x} as placeholders
        backgroundTiles: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg",
        
        // === BASIC DISPLAY SETTINGS ===
        
        // Should these layers be visible when the app starts?
        showBackgroundImages: true,
        showCellBoundaries: true,
        showGeneMarkers: true,
        
        // How big should gene markers be? (1.0 = normal size)
        geneMarkerSize: 1.0,
        
        // === PERFORMANCE SETTINGS ===
        
        // Enable performance optimizations?
        enablePerformanceMode: true,
        
        // Show performance timing in console?
        showPerformanceStats: true
    };
}

// Make it available globally
window.config = config;