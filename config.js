/**
 * Configuration for pciSeq Viewer (Electron Desktop App)
 *
 * Metadata (width, height, plane_count) comes from MBTiles or user input.
 * Voxel size is always provided by the user in the welcome screen.
 * Data files are served via custom protocols:
 *   - mbtiles:// for background tiles
 *   - app:// for Arrow data files
 */

window._datasetMetadataCache = null;

/**
 * Load dataset metadata (from MBTiles or user-provided values).
 * Populates the cache on success; returns partial result on failure
 * so the caller can inspect hasMbtiles and decide what to show.
 * @returns {Promise<object|null>}
 */
async function loadDatasetMetadata() {
    try {
        const result = await window.electronAPI.getDatasetMetadata();
        const meta = {
            imageWidth: result.imageWidth,
            imageHeight: result.imageHeight,
            voxelSize: result.voxelSize,
            planeCount: result.planeCount,
            source: result.source,
            hasMbtiles: result.hasMbtiles
        };

        if (result.success) {
            window._datasetMetadataCache = meta;
            console.log('Dataset metadata loaded from', result.source + ':', meta);
        } else {
            console.warn('Failed to load dataset metadata:', result.error);
        }
        return meta;
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
            throw new Error('Missing required metadata: width and height must be provided (from MBTiles or entered manually)');
        }
        if (!meta.planeCount || meta.planeCount < 1) {
            throw new Error('Missing required metadata: plane_count must be provided (from MBTiles or entered manually)');
        }
        if (!meta.voxelSize || !Array.isArray(meta.voxelSize) || meta.voxelSize.length !== 3) {
            throw new Error('Missing required metadata: voxel_size must be entered in the welcome screen as [x, y, z] microns per pixel');
        }
    }

    return {
        imageWidth: meta?.imageWidth,
        imageHeight: meta?.imageHeight,
        planeCount: meta?.planeCount,
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
