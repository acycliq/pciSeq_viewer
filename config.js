/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 */

function config() {
    return {

        // What are the dimensions of your images? (in pixels)
        imageWidth: 6411,
        imageHeight: 4412,

        // Size of a cubic pixel in microns (x, y, z)
        voxelSize: [0.28, 0.28, 0.7],

        // Background image: use {plane}, {z}, {y}, {x} as placeholders
        backgroundTiles: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg",

        // Arrow manifests
        arrowSpotsManifest: "./data/pciSeq/arrow_spots/manifest.json",
        arrowCellsManifest: "./data/pciSeq/arrow_cells/manifest.json",
        arrowBoundariesManifest: "./data/pciSeq/arrow_boundaries/manifest.json",
        arrowSpotsGeneDict: "./data/pciSeq/arrow_spots/gene_dict.json"
    };
}

// Make it available globally
window.config = config;
