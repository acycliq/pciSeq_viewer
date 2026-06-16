// Data loader module - handles data/path management IPC handlers
const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Module state
//
// Background tiles can come from several imaging channels (e.g. DAPI, GCaMP),
// each stored in its own .mbtiles file. We keep one open database handle per
// channel and a small registry describing the available channels.
//
// channels        - registry array of { id, label, path } entries
// channelDbs      - open better-sqlite3 handles keyed by channel id
// defaultChannelId - id of the channel selected first in the viewer
let channels = [];
const channelDbs = new Map();
let defaultChannelId = null;

let mainWindow = null;
let store = null;
let diagnostics = null;

function init(mw, st, diag) {
  mainWindow = mw;
  store = st;
  diagnostics = diag;
}

// Build a channel descriptor from an .mbtiles file path.
// The filename stem is the channel id; the label capitalises it for display.
// Example: /data/dapi.mbtiles -> { id: 'dapi', label: 'Dapi', path: ... }
function deriveChannel(mbtilesPath) {
  const stem = path.basename(mbtilesPath, '.mbtiles');
  const id = stem.toLowerCase();
  const label = stem.charAt(0).toUpperCase() + stem.slice(1);
  return { id, label, path: mbtilesPath };
}

// Close every open channel database and reset the registry.
function closeAllChannels() {
  for (const db of channelDbs.values()) {
    try { db.close(); } catch (e) {}
  }
  channelDbs.clear();
  channels = [];
  defaultChannelId = null;
}

// Open one .mbtiles file and register it as a channel.
// Returns true if the database opened successfully.
function openChannel(mbtilesPath) {
  const channel = deriveChannel(mbtilesPath);
  try {
    const db = new Database(mbtilesPath, { readonly: true, fileMustExist: true });
    channelDbs.set(channel.id, db);
    channels.push(channel);
    console.log('Opened background channel:', channel.id, mbtilesPath);
    return true;
  } catch (e) {
    console.error('Failed to open background channel:', mbtilesPath, e);
    return false;
  }
}

// Discover all .mbtiles files in a folder and open one channel per file.
// The first channel (alphabetically) becomes the default selection.
// Returns the channel registry array.
function discoverChannels(folderPath) {
  closeAllChannels();

  let mbtilesFiles = [];
  try {
    mbtilesFiles = fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.mbtiles'))
      .sort();
  } catch (e) {
    console.error('Failed to read data folder for MBTiles channels:', folderPath, e);
    return channels;
  }

  for (const file of mbtilesFiles) {
    openChannel(path.join(folderPath, file));
  }

  defaultChannelId = channels.length > 0 ? channels[0].id : null;
  return channels;
}

// Open a single .mbtiles file as the only channel (manual override from the menu).
// Returns true on success.
function openDatabase(mbtilesPath) {
  closeAllChannels();

  const opened = openChannel(mbtilesPath);
  defaultChannelId = channels.length > 0 ? channels[0].id : null;
  return opened;
}

function closeDatabase() {
  closeAllChannels();
}

// Return the open database handle for a channel id.
// With no id (or unknown id) the default channel is used.
function getDatabase(channelId) {
  const id = channelId && channelDbs.has(channelId) ? channelId : defaultChannelId;
  if (!id) return null;
  return channelDbs.get(id) || null;
}

// Return the channel registry for the renderer (no file paths exposed).
function getChannels() {
  return {
    channels: channels.map(c => ({ id: c.id, label: c.label })),
    defaultChannelId
  };
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

    // Auto-discover all MBTiles channels in the data folder
    try {
      const discovered = discoverChannels(selectedPath);
      if (discovered.length > 0) {
        // Keep mbtilesPath pointing at the default channel for backward compatibility
        store.set('mbtilesPath', discovered[0].path);
        console.log('Discovered background channels:', discovered.map(c => c.id).join(', '));
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

ipcMain.handle('get-profile-name', () => {
  return global.profileName || 'Default';
});

ipcMain.handle('get-paths', () => {
  return {
    dataPath: store.get('dataPath', ''),
    tilesPath: store.get('tilesPath', ''),
    mbtilesPath: store.get('mbtilesPath', '')
  };
});

// Background tile channels available for the current dataset (e.g. DAPI, GCaMP).
ipcMain.handle('get-tile-channels', () => {
  return getChannels();
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

ipcMain.handle('set-image-dimensions', (event, dims) => {
  if (dims && Number.isFinite(dims.width) && Number.isFinite(dims.height) && Number.isFinite(dims.planeCount)) {
    store.set('imageDimensions', { width: dims.width, height: dims.height, planeCount: dims.planeCount });
    console.log('Image dimensions saved:', dims);
    return { success: true };
  }
  return { success: false, error: 'Invalid dimensions. Expected { width, height, planeCount }.' };
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
  const db = getDatabase();
  if (!db) {
    return { success: false, error: 'No MBTiles file configured' };
  }

  try {
    const stmt = db.prepare('SELECT name, value FROM metadata');
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

  // Prefer MBTiles for image dimensions if available.
  // All channels share the same coordinate space, so the default channel's
  // metadata is representative.
  const db = getDatabase();
  if (db) {
    try {
      const stmt = db.prepare('SELECT name, value FROM metadata');
      const rows = stmt.all();

      rows.forEach(row => {
        if (row.name === 'width') result.imageWidth = parseInt(row.value);
        if (row.name === 'height') result.imageHeight = parseInt(row.value);
        if (row.name === 'plane_count') result.planeCount = parseInt(row.value);
        // NOTE: Do NOT read voxel_size from MBTiles; single source is the welcome screen (stored value)
      });

      result.source = 'mbtiles';
      console.log(`[metadata] Image dims from MBTiles: ${result.imageWidth}x${result.imageHeight}, planes=${result.planeCount}`);
    } catch (e) {
      return {
        success: false,
        ...result,
        error: `Failed to read MBTiles metadata: ${e.message}`
      };
    }
  }

  // If missing dims, try user-provided values from electron-store
  if (!result.imageWidth || !result.imageHeight || !result.planeCount) {
    const storedDims = store.get('imageDimensions', null);
    if (storedDims) {
      if (Number.isFinite(storedDims.width)) result.imageWidth = storedDims.width;
      if (Number.isFinite(storedDims.height)) result.imageHeight = storedDims.height;
      if (Number.isFinite(storedDims.planeCount)) result.planeCount = storedDims.planeCount;
      result.source = result.source ? `${result.source}+user` : 'user';
      console.log(`[metadata] Image dims from user input: ${result.imageWidth}x${result.imageHeight}, planes=${result.planeCount}`);
    }
  }

  // Single source for voxel size: user-provided value stored in electron-store
  const storedVoxelSize = store.get('voxelSize', null);
  if (storedVoxelSize && Array.isArray(storedVoxelSize) && storedVoxelSize.length === 3) {
    result.voxelSize = storedVoxelSize;
    if (result.source === 'mbtiles') result.source = 'mbtiles+store';
    console.log('Using stored voxel size:', storedVoxelSize);
  }

  // Flag whether mbtiles is the source (renderer uses this to decide whether to prompt)
  result.hasMbtiles = !!db;

  // Check required fields - all four are now required
  const hasRequired = result.imageWidth && result.imageHeight && result.planeCount && result.voxelSize;
  return {
    success: hasRequired,
    ...result,
    error: hasRequired ? null : 'Missing required metadata: width, height, plane_count and voxel_size are required'
  };
});

module.exports = {
  init,
  openDatabase,
  discoverChannels,
  closeDatabase,
  getDatabase,
  getChannels
};
