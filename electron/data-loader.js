// Data loader module - handles data/path management IPC handlers
const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Module state
let mbtilesDb = null;
let mainWindow = null;
let store = null;
let diagnostics = null;

function init(mw, st, diag) {
  mainWindow = mw;
  store = st;
  diagnostics = diag;
}

// Open MBTiles database using better-sqlite3
function openDatabase(mbtilesPath) {
  if (mbtilesDb) {
    try { mbtilesDb.close(); } catch (e) {}
    mbtilesDb = null;
  }

  try {
    // Open in read-only mode
    mbtilesDb = new Database(mbtilesPath, { readonly: true, fileMustExist: true });
    console.log('Opened MBTiles database (disk-based):', mbtilesPath);
    return true;
  } catch (e) {
    console.error('Failed to open MBTiles database:', e);
    return false;
  }
}

function closeDatabase() {
  if (mbtilesDb) {
    try { mbtilesDb.close(); } catch (e) {}
    mbtilesDb = null;
  }
}

function getDatabase() {
  return mbtilesDb;
}

// === IPC Handlers ===

ipcMain.handle('select-data-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Data Folder',
    message: 'Choose the folder containing arrow_spots, arrow_cells, and arrow_boundaries subdirectories'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // Validate that the folder has the expected structure
    const expectedSubdirs = ['arrow_spots', 'arrow_cells', 'arrow_boundaries'];
    const hasValidStructure = expectedSubdirs.some(subdir =>
      fs.existsSync(path.join(selectedPath, subdir))
    );

    if (!hasValidStructure) {
      dialog.showErrorBox(
        'Invalid Data Folder',
        'The selected folder does not contain the expected subdirectories (arrow_spots, arrow_cells, or arrow_boundaries).'
      );
      return { success: false, error: 'Invalid folder structure' };
    }

    store.set('dataPath', selectedPath);

    // Auto-discover MBTiles file in the data folder
    try {
      const files = fs.readdirSync(selectedPath);
      const mbtilesFiles = files.filter(f => f.endsWith('.mbtiles'));

      if (mbtilesFiles.length > 0) {
        const autoMbtilesPath = path.join(selectedPath, mbtilesFiles[0]);
        console.log('Auto-discovered MBTiles file:', autoMbtilesPath);

        if (openDatabase(autoMbtilesPath)) {
          store.set('mbtilesPath', autoMbtilesPath);
          // Silent load - no popup
        }
      }
    } catch (e) {
      console.warn('Failed to auto-discover MBTiles:', e);
    }

    // Auto-discover diagnostics database in diagnostics folder
    try {
      const diagnosticsDir = path.join(selectedPath, 'diagnostics');
      const unifiedDbPath = path.join(diagnosticsDir, 'diagnostics.db');

      if (fs.existsSync(unifiedDbPath)) {
        console.log('Auto-discovered unified diagnostics database:', unifiedDbPath);
        diagnostics.openDiagnosticsDatabase(unifiedDbPath);
        store.set('checkCellPath', diagnosticsDir);
        store.set('checkSpotPath', diagnosticsDir);
        store.set('diagnosticsPath', diagnosticsDir);

        diagnostics.broadcastDiagnosticsState(true);
      }
    } catch (e) {
      console.warn('Failed to auto-discover diagnostics databases:', e);
    }

    return { success: true, path: selectedPath };
  }

  return { success: false };
});

ipcMain.handle('select-tiles-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Tiles Folder',
    message: 'Choose the folder containing tiles_XX subdirectories'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // Validate that the folder contains tile directories
    const contents = fs.readdirSync(selectedPath);
    const hasTileDirs = contents.some(item =>
      item.startsWith('tiles_') && fs.statSync(path.join(selectedPath, item)).isDirectory()
    );

    if (!hasTileDirs) {
      dialog.showErrorBox(
        'Invalid Tiles Folder',
        'The selected folder does not contain any tiles_XX subdirectories.'
      );
      return { success: false, error: 'Invalid folder structure' };
    }

    store.set('tilesPath', selectedPath);
    return { success: true, path: selectedPath };
  }

  return { success: false };
});

ipcMain.handle('get-paths', () => {
  return {
    dataPath: store.get('dataPath', ''),
    tilesPath: store.get('tilesPath', ''),
    mbtilesPath: store.get('mbtilesPath', '')
  };
});

ipcMain.handle('set-voxel-size', (event, voxelSize) => {
  if (Array.isArray(voxelSize) && voxelSize.length === 3) {
    store.set('voxelSize', voxelSize);
    console.log('Voxel size saved:', voxelSize);
    return { success: true };
  }
  return { success: false, error: 'Invalid voxel size format. Expected [x, y, z] array.' };
});

ipcMain.handle('get-voxel-size', () => {
  const voxelSize = store.get('voxelSize', null);
  return { success: voxelSize !== null, voxelSize };
});

ipcMain.handle('select-mbtiles-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Select MBTiles File',
    message: 'Choose the .mbtiles file containing background tiles',
    filters: [
      { name: 'MBTiles', extensions: ['mbtiles'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // Validate using better-sqlite3
    try {
      const testDb = new Database(selectedPath, { readonly: true, fileMustExist: true });

      // Check for tiles table
      const stmt = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name='tiles' OR name='map')");
      const hasTable = stmt.get();
      testDb.close();

      if (!hasTable) {
        dialog.showErrorBox(
          'Invalid MBTiles File',
          'The selected file does not appear to be a valid MBTiles database (missing tiles table).'
        );
        return { success: false, error: 'Invalid MBTiles structure' };
      }

      store.set('mbtilesPath', selectedPath);
      console.log('MBTiles path set to:', selectedPath);

      // Open the database
      openDatabase(selectedPath);

      return { success: true, path: selectedPath };
    } catch (e) {
      dialog.showErrorBox(
        'Invalid MBTiles File',
        `Failed to open file: ${e.message}`
      );
      return { success: false, error: e.message };
    }
  }

  return { success: false };
});

ipcMain.handle('get-mbtiles-metadata', async () => {
  const mbtilesPath = store.get('mbtilesPath', '');
  if (!mbtilesPath) {
    return { success: false, error: 'No MBTiles file configured' };
  }

  try {
    if (!mbtilesDb) {
      if (!openDatabase(mbtilesPath)) {
        return { success: false, error: 'Failed to open database' };
      }
    }

    const stmt = mbtilesDb.prepare('SELECT name, value FROM metadata');
    const rows = stmt.all();

    const metadata = {};
    rows.forEach(row => {
      metadata[row.name] = row.value;
    });

    return { success: true, metadata };
  } catch (e) {
    console.error('Error reading MBTiles metadata:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-metadata-json', async () => {
  const dataPath = store.get('dataPath', '');
  if (!dataPath) {
    return { success: false, error: 'No data path configured' };
  }

  const metadataPath = path.join(dataPath, 'metadata.json');

  try {
    if (!fs.existsSync(metadataPath)) {
      return { success: false, error: 'metadata.json not found' };
    }

    const content = fs.readFileSync(metadataPath, 'utf8');
    const metadata = JSON.parse(content);

    return { success: true, metadata };
  } catch (e) {
    console.error('Error reading metadata.json:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-dataset-metadata', async () => {
  const result = {
    imageWidth: null,
    imageHeight: null,
    voxelSize: null,
    planeCount: null,
    source: null
  };

  // Read from MBTiles ONLY - no fallback
  const mbtilesPath = store.get('mbtilesPath', '');
  if (!mbtilesPath || !mbtilesDb) {
    return {
      success: false,
      ...result,
      error: 'No MBTiles file loaded. Please ensure your dataset includes an MBTiles file with metadata.'
    };
  }

  try {
    const stmt = mbtilesDb.prepare('SELECT name, value FROM metadata');
    const rows = stmt.all();

    rows.forEach(row => {
      if (row.name === 'width') result.imageWidth = parseInt(row.value);
      if (row.name === 'height') result.imageHeight = parseInt(row.value);
      if (row.name === 'plane_count') result.planeCount = parseInt(row.value);
      // NOTE: Do NOT read voxel_size from MBTiles; single source is the welcome screen (stored value)
    });

    result.source = 'mbtiles';
  } catch (e) {
    return {
      success: false,
      ...result,
      error: `Failed to read MBTiles metadata: ${e.message}`
    };
  }

  // Single source for voxel size: user-provided value stored in electron-store
  const storedVoxelSize = store.get('voxelSize', null);
  if (storedVoxelSize && Array.isArray(storedVoxelSize) && storedVoxelSize.length === 3) {
    result.voxelSize = storedVoxelSize;
    if (result.source === 'mbtiles') result.source = 'mbtiles+store';
    console.log('Using stored voxel size:', storedVoxelSize);
  }

  // Check required fields - all four are now required
  const hasRequired = result.imageWidth && result.imageHeight && result.planeCount && result.voxelSize;
  return {
    success: hasRequired,
    ...result,
    error: hasRequired ? null : 'Missing required metadata: width, height, plane_count (from MBTiles) and voxel_size (set in the welcome screen) are required'
  };
});

module.exports = {
  init,
  openDatabase,
  closeDatabase,
  getDatabase
};
