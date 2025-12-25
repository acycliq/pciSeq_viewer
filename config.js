/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 */

// Cache for dataset metadata loaded from MBTiles/metadata.json
// This is populated by loadDatasetMetadata() before config() is called
window._datasetMetadataCache = null;

/**
 * Load dataset metadata from MBTiles or metadata.json (Electron only)
 * Call this before using config() to get dynamic values
 * @returns {Promise<object>} The metadata object
 */
async function loadDatasetMetadata() {
    const isElectron = window.electronAPI?.isElectron || false;

    if (!isElectron) {
        // In web mode, use defaults (no dynamic loading)
        return null;
    }

    try {
        const result = await window.electronAPI.getDatasetMetadata();
        if (result.success) {
            window._datasetMetadataCache = {
                imageWidth: result.imageWidth,
                imageHeight: result.imageHeight,
                voxelSize: result.voxelSize,
                planeCount: result.planeCount,
                source: result.source
            };
            console.log('Dataset metadata loaded from', result.source + ':', window._datasetMetadataCache);
            return window._datasetMetadataCache;
        } else {
            console.warn('Failed to load dataset metadata:', result.error);
            return null;
        }
    } catch (e) {
        console.error('Error loading dataset metadata:', e);
        return null;
    }
}

// Make loadDatasetMetadata available globally
window.loadDatasetMetadata = loadDatasetMetadata;

function config() {
    // Detect if running in Electron environment
    const isElectron = window.electronAPI?.isElectron || false;

    // Check if MBTiles is configured (set via electron-store)
    // When using MBTiles, tiles are served via mbtiles:// protocol
    // URL format: mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg (needs dummy host to avoid URL parsing issues)
    const useMBTiles = isElectron; // Will use mbtiles:// protocol in Electron

    // Get cached metadata - REQUIRED in Electron mode
    const meta = window._datasetMetadataCache;

    // In Electron mode, metadata is REQUIRED from MBTiles (no fallback)
    if (isElectron && meta !== null) {
        // Only validate if we have a data path configured (meta will be null on welcome screen)
        if (!meta.imageWidth || !meta.imageHeight) {
            throw new Error('Missing required metadata: width and height must be provided in MBTiles file');
        }
        if (!meta.planeCount || meta.planeCount < 1) {
            throw new Error('Missing required metadata: plane_count must be provided in MBTiles file');
        }
        if (!meta.voxelSize || !Array.isArray(meta.voxelSize) || meta.voxelSize.length !== 3) {
            throw new Error('Missing required metadata: voxel_size must be provided in MBTiles file as [x, y, z] values in microns');
        }
    }

    return {

        // What are the dimensions of your images? (in pixels)
        // In Electron: loaded from MBTiles metadata (REQUIRED)
        imageWidth: meta?.imageWidth,
        imageHeight: meta?.imageHeight,

        // Number of z-planes in the image stack
        // In Electron: loaded from MBTiles metadata (REQUIRED)
        planeCount: meta?.planeCount,

        // Size of a voxel in microns (x, y, z) - to be configured separately
        voxelSize: meta?.voxelSize,

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
