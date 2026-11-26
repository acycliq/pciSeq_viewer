/**
 * Web backend: lets the viewer page run as a plain website.
 *
 * In the desktop app the page asks Electron for everything that is not in the
 * page itself, through window.electronAPI (electron/preload.js). A website has
 * no Electron, so this file provides an object with the same name and the same
 * methods, answering from src/web/webDataset.js.
 *
 * Only the calls the page needs to start are here. A feature whose methods are
 * missing (the chat, the Ctrl+click diagnostics, the demo data) stays switched
 * off, because the page checks that the method exists before it uses it.
 *
 * Depends on: window.webDataset (src/web/webDataset.js), loaded just before.
 * Used by:    config.js (dataUrls, getDatasetMetadata) and src/app.js
 *             (getPaths, getTileChannels, getClassColours).
 */
(function () {
    // Inside the desktop app the preload script has already provided the API.
    if (window.electronAPI) return;

    const dataset = window.webDataset;

    window.electronAPI = {
        // Where the data files are. The desktop app's answer is in electron/preload.js.
        dataUrls: {
            backgroundTiles: dataset.baseUrl + '/tiles/{channel}/{plane}/{z}/{y}/{x}.jpg',
            arrowSpotsManifest: dataset.baseUrl + '/arrow_spots/manifest.json',
            arrowCellsManifest: dataset.baseUrl + '/arrow_cells/manifest.json',
            arrowBoundariesManifest: dataset.baseUrl + '/arrow_boundaries/manifest.json',
            arrowSpotsGeneDict: dataset.baseUrl + '/arrow_spots/gene_dict.json'
        },

        // The desktop app answers with the opened folder, and the page shows the
        // welcome screen when there is none. The website always has its dataset.
        getPaths: async () => ({ dataPath: dataset.name }),

        getDatasetMetadata: async () => ({
            success: true,
            source: 'web',
            hasMbtiles: false,
            imageWidth: dataset.imageWidth,
            imageHeight: dataset.imageHeight,
            planeCount: dataset.planeCount,
            voxelSize: dataset.voxelSize,
            tileMaxZoom: dataset.tileMaxZoom
        }),

        getTileChannels: async () => ({
            channels: dataset.channels,
            defaultChannelId: dataset.channels[0].id,
            found: [],
            failed: []
        }),

        // The website's default cell class colours: a map of class name to
        // '#RRGGBB', the same file the desktop app takes through Import, Cell
        // Class Colours. The desktop app has no such method and starts with
        // the built-in scheme (config/colorSchemes.js).
        getClassColours: async () => {
            const response = await fetch('src/web/classColours.json');
            return response.json();
        }
    };
})();
