/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 */

function config() {
    return {

        // How many planes/slices does your dataset have?
        totalPlanes: 102,
        
        // Which plane should the app start on? (0 to totalPlanes-1)
        startingPlane: 50,
        
        // What are the dimensions of your images? (in pixels)
        imageWidth: 6411,
        imageHeight: 4412,
        
        // Size of a cubic pixel in microns (x, y, z)
        voxelSize: [0.28, 0.28, 0.7],

        geneDataFile: "./data/newSpots_newSegmentation/geneData.tsv",
        cellDataFile: "./data/newSpots_newSegmentation/cellData.tsv",

        // Use {plane} as placeholder - it will be replaced with the actual plane number
        cellBoundaryFiles: "./data/cellBoundaries/new_segmentation/plane_{plane}.tsv",

        // Background image: use {plane}, {z}, {y}, {x} as placeholders
        backgroundTiles: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg",

        // Optional: Arrow manifests (used when advanced performance.useArrow=true)
        arrowSpotsManifest: "https://storage.googleapis.com/arrow_files/spots150_inef2.0_rSpot0.5/data/arrow/arrow_spots/manifest.json",
        arrowCellsManifest: "https://storage.googleapis.com/arrow_files/spots150_inef2.0_rSpot0.5/data/arrow/arrow_cells/manifest.json",
        arrowBoundariesManifest: "https://storage.googleapis.com/arrow_files/spots150_inef2.0_rSpot0.5/data/arrow/arrow_boundaries/manifest.json",
        // arrowCellsClassDict: "./data/arrow_cells/class_dict.json",
        arrowSpotsGeneDict: "https://storage.googleapis.com/arrow_files/spots150_inef2.0_rSpot0.5/data/arrow/arrow_spots/gene_dict.json"
    };
}

// Make it available globally
window.config = config;
