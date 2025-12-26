/**
 * Configuration for pciSeq Viewer (Electron Desktop App)
 *
 * Metadata is loaded dynamically from MBTiles file.
 * Data files are served via custom protocols:
 *   - mbtiles:// for background tiles
 *   - app:// for Arrow data files
 */

// Cache for dataset metadata loaded from MBTiles
window._datasetMetadataCache = null;

/**
 * Load dataset metadata from MBTiles
 * Call this before using config() to populate the cache
 * @returns {Promise<object>} The metadata object
 */
async function loadDatasetMetadata() {
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

window.loadDatasetMetadata = loadDatasetMetadata;

/**
 * Returns the configuration object for the viewer
 * Metadata must be loaded via loadDatasetMetadata() before calling this
 */
function config() {
    const meta = window._datasetMetadataCache;

    // Validate metadata if data path is configured (meta will be null on welcome screen)
    if (meta !== null) {
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
        // Image dimensions (from MBTiles metadata)
        imageWidth: meta?.imageWidth,
        imageHeight: meta?.imageHeight,

        // Number of z-planes (from MBTiles metadata)
        planeCount: meta?.planeCount,

        // Voxel size in microns [x, y, z] (from MBTiles metadata)
        voxelSize: meta?.voxelSize,

        // Background tiles via mbtiles:// protocol
        backgroundTiles: "mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg",

        // Arrow data files via app:// protocol
        arrowSpotsManifest: "app://arrow_spots/manifest.json",
        arrowCellsManifest: "app://arrow_cells/manifest.json",
        arrowBoundariesManifest: "app://arrow_boundaries/manifest.json",
        arrowSpotsGeneDict: "app://arrow_spots/gene_dict.json"
    };
}

window.config = config;