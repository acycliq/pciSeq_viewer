// Single Cell Data view.
//
// Opens the "Single Cell Data" window. Two tabs in there:
//   - Reference: sc_mean_expression          (the scRNA-seq atlas, per gene per class)
//   - Implied:   mean_gene_reads_per_class   (what the model thinks the counts should be)
//
// Both come from diagnostics.db. We just read them off the diagnostics module,
// no separate database for single cell stuff anymore.

const { ipcMain, BrowserWindow } = require('electron');
const path = require('path');
const diagnostics = require('./diagnostics');

let mainWindow = null;
let viewWindow = null;

function init(mw) {
  mainWindow = mw;
}

function openViewWindow() {
  if (viewWindow) { viewWindow.focus(); return; }
  viewWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'single-cell-view-preload.js')
    },
    title: 'Single Cell Data',
    autoHideMenuBar: true
  });
  viewWindow.loadFile(path.join(__dirname, 'single-cell-view.html'));
  viewWindow.on('closed', () => { viewWindow = null; });
}

// Same shape for both tabs, only the metadata key changes.
function buildResponse(meta, dataKey) {
  if (!meta) {
    return {
      success: false,
      error: 'Diagnostics data not loaded. Use Diagnostics -> Setup... to load diagnostics.db.'
    };
  }
  return {
    success: true,
    gene_panel:  meta.gene_panel,
    class_names: meta.class_names,
    data:        meta[dataKey]
  };
}

ipcMain.handle('sc-get-reference-data', () =>
  buildResponse(diagnostics.getMeta(), 'sc_mean_expression'));

ipcMain.handle('sc-get-implied-data', () =>
  buildResponse(diagnostics.getMeta(), 'mean_gene_reads_per_class'));

module.exports = { init, openViewWindow };
