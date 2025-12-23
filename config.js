/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 */

function config() {
    // Detect if running in Electron environment
    const isElectron = window.electronAPI?.isElectron || false;

    // Check if MBTiles is configured (set via electron-store)
    // When using MBTiles, tiles are served via mbtiles:// protocol
    // URL format: mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg (needs dummy host to avoid URL parsing issues)
    const useMBTiles = isElectron; // Will use mbtiles:// protocol in Electron

    return {

        // What are the dimensions of your images? (in pixels)
        imageWidth: 6411,
        imageHeight: 4412,

        // Size of a cubic pixel in microns (x, y, z)
        voxelSize: [0.28, 0.28, 0.7],

        // Background image: use {plane}, {z}, {y}, {x} as placeholders
        // In Electron with MBTiles: uses mbtiles:// protocol to read from SQLite
        // In web mode: uses remote tiles URL
        backgroundTiles: useMBTiles
            ? "mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg"
            : "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg",

        // Arrow manifests
        // In Electron: data from user-selected folder using app:// protocol
        // In web: data from local ./data directory
        arrowSpotsManifest: isElectron
            ? "app://arrow_spots/manifest.json"
            : "./data/pciSeq/arrow_spots/manifest.json",

        arrowCellsManifest: isElectron
            ? "app://arrow_cells/manifest.json"
            : "./data/pciSeq/arrow_cells/manifest.json",

        arrowBoundariesManifest: isElectron
            ? "app://arrow_boundaries/manifest.json"
            : "./data/pciSeq/arrow_boundaries/manifest.json",

        arrowSpotsGeneDict: isElectron
            ? "app://arrow_spots/gene_dict.json"
            : "./data/pciSeq/arrow_spots/gene_dict.json"
    };
}

// Make it available globally
window.config = config;
