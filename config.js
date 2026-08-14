/**
 * Basic settings that users typically need to modify
 * when adapting the viewer to their own dataset.
 */

function config() {
    return {

        // What are the dimensions of your images? (in pixels)
        imageWidth: 2304,
        imageHeight: 2304,

        // Size of a cubic pixel in microns (x, y, z)
        voxelSize: [1, 1, 3.46],

        // Background image channels (base layers).
        // Each channel is one selectable background. The first channel is shown
        // by default. When there is only one channel the basemap switcher stays
        // hidden, so single-channel datasets look exactly as before.
        // In each "tiles" URL use {plane}, {z}, {y}, {x} as placeholders.
        // Optional "tint" ("#RRGGBB") colours a grayscale channel, e.g. red GCaMP;
        // a channel with no tint renders exactly as its source image.
        channels: [
            // {
            //     id: "hc",
            //     label: "HC",
            //     tiles: "https://storage.googleapis.com/christina_silver_hc/tiles_hc/tiles_{plane}/{z}/{y}/{x}.jpg"
            // }
            // Add more channels to enable the basemap switcher, for example:
            {
                id: "dapi",
                label: "DAPI",
                tiles: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/tiles/S10_tile10_dapi/plane_{plane}/{z}/{y}/{x}.jpg"
            },
            {
                id: "gcamp",
                label: "GCaMP",
                tiles: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/tiles/S10_tile10_gcamp/plane_{plane}/{z}/{y}/{x}.jpg",
                tint: "00ff00"
            }
        ],

        // Arrow manifests
        arrowSpotsManifest: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/data/viewer_data/arrow_spots/manifest.json",
        arrowCellsManifest: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/data/viewer_data/arrow_cells/manifest.json",
        arrowBoundariesManifest: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/data/viewer_data/arrow_boundaries/manifest.json",
        arrowSpotsGeneDict: "https://storage.googleapis.com/maxs_data/BZ008_S10_tile10/data/viewer_data/arrow_spots/gene_dict.json"
    };
}

// Make it available globally
window.config = config;