/**
 * The dataset the web viewer shows.
 *
 * The website has no "Open a run" step: it always loads this one run from a
 * public Google Cloud Storage bucket. To show a different run, upload it and
 * change the values below.
 *
 * The folder at baseUrl must hold the viewer_data of a pciSeq run:
 *
 *   arrow_spots/        as pciSeq writes it
 *   arrow_cells/        as pciSeq writes it
 *   arrow_boundaries/   as pciSeq writes it
 *   tiles/{channel}/{plane}/{z}/{y}/{x}.jpg
 *                       the background, unpacked from the run's .mbtiles
 *                       file with scripts/unpack_mbtiles.py
 *
 * Only the web build reads this file (src/web/webBackend.js). The desktop
 * app takes the same facts from the run folder the user opens.
 */
window.webDataset = {
    // Shown in the browser tab
    name: 'aang',

    // The run's folder in the bucket, without a trailing slash
    baseUrl: 'https://storage.googleapis.com/pciseq_documentation/aang',

    // Image size in pixels and the number of z planes
    imageWidth: 6432,
    imageHeight: 8545,
    planeCount: 69,

    // Size of one voxel in microns: [x, y, z]
    voxelSize: [0.28, 0.28, 0.7],

    // The deepest zoom level of the background tiles ('maxzoom' in the .mbtiles metadata)
    tileMaxZoom: 6,

    // Background channels. The id is the folder name under tiles/. The first
    // channel is the one shown at startup. A tint ('#RRGGBB') colours a
    // grayscale channel; null leaves it as it is.
    channels: [
        { id: 'dapi', label: 'DAPI', tint: null }
    ]
};
