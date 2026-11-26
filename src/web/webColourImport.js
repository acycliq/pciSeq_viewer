/**
 * Colour import for the website (a temporary solution).
 *
 * The desktop app imports colour schemes from its Import menu. A website has
 * no menu, so this file adds a "Colours" button next to Show All / Hide All in
 * the Cell Classes and the Genes sections of the drawer. A click asks for a
 * .json file and hands its content to the page, which applies it exactly as
 * the desktop menu would.
 *
 * The files are the same ones the desktop app takes:
 *   genes:   [{ "gene": "Pvalb", "colour": "#FF3358", "glyphName": "diamond" }, ...]
 *   classes: { "037 DG Glut": "#CC2400", ... }
 *
 * Depends on: window.electronAPI.colourImportHandlers (src/web/webBackend.js),
 *             filled in by src/app.js when the page starts.
 * Does nothing inside the desktop app, where that object does not exist.
 */
(function () {
    const handlers = window.electronAPI.colourImportHandlers;
    if (!handlers) return;

    // Ask for a .json file and give its parsed content to the handler
    function chooseFileAndImport(kind) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.addEventListener('change', async () => {
            const file = input.files[0];
            if (!file) return;
            const text = await file.text();

            let scheme;
            try {
                scheme = JSON.parse(text);
            } catch (error) {
                window.alert('Could not read ' + file.name + ': it is not valid JSON.');
                return;
            }
            handlers[kind](scheme);
        });
        input.click();
    }

    // Add a Colours button after the Hide All button with the given id
    function addColoursButton(hideAllButtonId, kind, title) {
        const hideAllButton = document.getElementById(hideAllButtonId);
        const button = document.createElement('button');
        button.className = 'show-all-btn';
        button.textContent = 'Colours';
        button.title = title;
        button.addEventListener('click', () => chooseFileAndImport(kind));
        hideAllButton.after(button);
    }

    document.addEventListener('DOMContentLoaded', () => {
        addColoursButton('hideAllCellClassesBtn', 'classes', 'Import a cell class colour scheme (.json)');
        addColoursButton('hideAllGenesBtn', 'genes', 'Import a gene colour scheme (.json)');
    });
})();
