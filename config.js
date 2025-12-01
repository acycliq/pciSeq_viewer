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

        // Background image sources (select via dropdown or ?bg=<id>)
        // Use {plane}, {z}, {y}, {x} as placeholders
        backgrounds: [
            {
                id: 'dapi',
                name: 'DAPI',
                urlPattern: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg"
            },
            // Example/placeholder secondary background (adjust to your tiles)
            {
                id: 'alt',
                name: 'OSM (test only)',
                // Public XYZ tiles (for testing switching only; alignment won't match your image)
                urlPattern: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            }
        ],
        defaultBackgroundId: 'dapi',

        // Legacy single background (kept for backward compatibility)
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
