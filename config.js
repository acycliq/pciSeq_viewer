/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 * 
 * For advanced settings, see: advanced-config.js
 */

function config() {
    return {

        // How many planes/slices does your dataset have?
        totalPlanes: 100,
        
        // Which plane should the app start on? (0 to totalPlanes-1)
        startingPlane: 50,
        
        // What are the dimensions of your images? (in pixels)
        imageWidth: 6411,
        imageHeight: 4412,

        geneDataFile: "./data/geneData.tsv",
        cellDataFile: "./data/cellData.tsv",

        // Use {plane} as placeholder - it will be replaced with the actual plane number
        cellBoundaryFiles: "./data/cellBoundaries/plane_{plane}.tsv",

        // Background image: use {plane}, {z}, {y}, {x} as placeholders
        backgroundTiles: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg"
    };
}

// Make it available globally
window.config = config;