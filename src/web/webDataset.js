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
    ],

    // How the page looks when it opens. The desktop app has no such list and
    // opens on the middle plane, all genes shown, both panels closed.
    startup: {
        // The plane shown first
        plane: 45,

        // true shows the section flipped top to bottom, the orientation of
        // the figures in the paper. Only the picture changes: cells and
        // spots keep the coordinates of the run.
        flipTopToBottom: true,

        // false: no spots are drawn until the user ticks a gene or "Show All"
        showGenes: false,

        // The controls drawer on the left
        openControls: true,

        // The cell info panel at the bottom right: true opens it when the
        // mouse first meets a cell. Until then it is a strip, since it has
        // no cell to show.
        openCellInfo: true,

        // Controls left out of the drawer, by the id of their element in
        // index.html: the rho chart needs the run's diagnostics.db, which the
        // website does not read, and annotations cannot be saved from a website.
        // The last two are in the toolbar of the "Gene Counts per Class" chart
        // (src/expressionHistogramChart.js). Without its rounding dropdown the
        // chart stays on its default, Ceiling.
        hiddenControls: [
            'misreadRhoBtn',
            'greyOutMisreadsRow',
            'hideMisreadsRow',
            'annotationsSection',
            'geneCountsRoundingSelect',
            'geneCountsIgnoreZeros'
        ]
    }
};
