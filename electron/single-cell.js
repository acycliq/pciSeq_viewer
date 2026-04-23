// Single cell data module — handles raw_single_cell_data.db and the viewer window.
//
// TODO: Temporary split from diagnostics.db. Single cell data is run-independent
//       (same atlas across hyperparameter sweeps), so this file is generated once
//       and reused without regenerating diagnostics.db. Merge into diagnostics.db
//       in a future version and remove this module.

const { ipcMain, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let scDb = null;
let scMeta = null;
let setupWindow = null;
let viewWindow = null;

let mainWindow = null;
let store = null;

function init(mw, st) {
  mainWindow = mw;
  store = st;

  // 1. Try the explicitly saved path first
  const savedPath = store.get('scDataPath', '');
  if (savedPath && fs.existsSync(savedPath)) {
    try { openDatabase(savedPath); return; } catch (e) {
      console.warn('Failed to auto-load single cell DB from saved path:', e.message);
    }
  }

  // 2. Fall back to looking next to diagnostics.db (covers first-launch case
  //    where the user never went through Setup but the file is already there)
  const diagnosticsDir = store.get('diagnosticsPath', store.get('checkCellPath', ''));
  if (diagnosticsDir) {
    const candidate = path.join(diagnosticsDir, 'raw_single_cell_data.db');
    if (fs.existsSync(candidate)) {
      try {
        openDatabase(candidate);
        store.set('scDataPath', candidate);
        console.log('Auto-loaded single cell DB from diagnostics folder:', candidate);
      } catch (e) {
        console.warn('Failed to auto-load single cell DB from diagnostics folder:', e.message);
      }
    }
  }
}

function parseMetaValue(value) {
  try { return JSON.parse(value); } catch {
    const n = Number(value);
    return isNaN(n) ? value : n;
  }
}

function openDatabase(dbPath) {
  if (scDb) { try { scDb.close(); } catch {} }
  scDb = new Database(dbPath, { readonly: true, fileMustExist: true });
  const rows = scDb.prepare('SELECT key, value FROM metadata').all();
  scMeta = {};
  for (const row of rows) scMeta[row.key] = parseMetaValue(row.value);
  console.log('Single cell DB loaded: %d genes, %d classes',
    scMeta.gene_panel?.length, scMeta.class_names?.length);
  return scMeta;
}

function closeDatabase() {
  if (scDb) { try { scDb.close(); } catch {} scDb = null; }
  scMeta = null;
}

function openSetupWindow() {
  if (setupWindow) { setupWindow.focus(); return; }
  setupWindow = new BrowserWindow({
    width: 480,
    height: 200,
    parent: mainWindow,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'single-cell-preload.js')
    },
    title: 'Single Cell Data — Setup',
    autoHideMenuBar: true
  });
  setupWindow.loadFile(path.join(__dirname, 'single-cell-setup.html'));
  setupWindow.on('closed', () => { setupWindow = null; });
}

function openViewWindow() {
  if (viewWindow) { viewWindow.focus(); return; }
  viewWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    // parent: mainWindow,  // omitted — setting a parent prevents maximising on double-click
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

// === IPC Handlers ===

ipcMain.handle('sc-get-config', () => ({
  path: store.get('scDataPath', ''),
  loaded: !!(scDb && scMeta)
}));

ipcMain.handle('sc-save-config', (event, config) => {
  if (!config.path) return { success: false, error: 'Path is required' };
  if (!fs.existsSync(config.path)) return { success: false, error: 'File not found' };
  try {
    openDatabase(config.path);
    store.set('scDataPath', config.path);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Failed to open database: ' + e.message };
  }
});

ipcMain.handle('sc-browse-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    title: 'Select raw_single_cell_data.db',
    filters: [
      { name: 'SQLite Database', extensions: ['db'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return (!result.canceled && result.filePaths.length > 0) ? result.filePaths[0] : null;
});

ipcMain.handle('sc-close-setup', () => {
  if (setupWindow) setupWindow.close();
});

// Returns sc_mean_expression from raw_single_cell_data.db
ipcMain.handle('sc-get-reference-data', () => {
  if (!scMeta) return { success: false, error: 'Single cell data not loaded. Use Single Cell Data → Setup... to select raw_single_cell_data.db.' };
  return {
    success: true,
    gene_panel: scMeta.gene_panel,
    class_names: scMeta.class_names,
    data: scMeta.sc_mean_expression
  };
});

// Returns mean_gene_reads_per_class from diagnostics.db
ipcMain.handle('sc-get-implied-data', () => {
  const diagnostics = require('./diagnostics');
  const meta = diagnostics.getMeta();
  if (!meta) return { success: false, error: 'Diagnostics data not loaded. Use Diagnostics → Setup... to load diagnostics.db.' };
  return {
    success: true,
    gene_panel: meta.gene_panel,
    class_names: meta.class_names,
    data: meta.mean_gene_reads_per_class
  };
});

module.exports = { init, openDatabase, closeDatabase, openSetupWindow, openViewWindow };