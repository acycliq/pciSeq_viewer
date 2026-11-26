/**
 * The datasets the web viewer shows.
 *
 * The website has no "Open a run" step: it loads one run from a public Google
 * Cloud Storage bucket. The link says which one:
 *
 *   .../web_viewer/                   opens aang
 *   .../web_viewer/?dataset=katara    opens katara
 *
 * To add a run, upload it and add a row to SECTIONS below.
 *
 * Each run has a folder of its own in the bucket, named after it, holding the
 * viewer_data of the pciSeq run:
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
(function () {
    const BUCKET = 'https://storage.googleapis.com/pciseq_documentation';

    // The dataset a link without a name opens
    const DEFAULT_SECTION = 'aang';

    // What differs from one run to the next: the image size in pixels, the
    // number of z planes, the plane shown first, and whether the section is
    // shown flipped top to bottom (true puts the cortex above the hippocampus,
    // as in the figures of the paper).
    const SECTIONS = {
        aang:   { imageWidth: 6432, imageHeight: 8545, planeCount: 69, startPlane: 45, flipTopToBottom: true },
        katara: { imageWidth: 6423, imageHeight: 8554, planeCount: 78, startPlane: 39, flipTopToBottom: true },
        sokka:  { imageWidth: 6425, imageHeight: 8535, planeCount: 75, startPlane: 37, flipTopToBottom: true },
        toph:   { imageWidth: 6427, imageHeight: 8552, planeCount: 81, startPlane: 40, flipTopToBottom: true }
    };

    const requested = new URLSearchParams(window.location.search).get('dataset');
    const name = requested || DEFAULT_SECTION;
    const section = SECTIONS[name];

    // A link with a name that is not in the list: say so on the page. Nothing
    // else can load, because every later script needs the dataset.
    if (!section) {
        document.addEventListener('DOMContentLoaded', () => {
            document.body.textContent = 'There is no dataset named "' + name + '". ' +
                'The datasets are: ' + Object.keys(SECTIONS).join(', ') + '.';
        });
        return;
    }

    window.webDataset = {
        // Shown in the browser tab
        name: name,

        // The run's folder in the bucket, without a trailing slash
        baseUrl: BUCKET + '/' + name,

        // Image size in pixels and the number of z planes
        imageWidth: section.imageWidth,
        imageHeight: section.imageHeight,
        planeCount: section.planeCount,

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
            plane: section.startPlane,

            // true shows the section flipped top to bottom. Only the picture
            // changes: cells and spots keep the coordinates of the run.
            flipTopToBottom: section.flipTopToBottom,

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
})();
