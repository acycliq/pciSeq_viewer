const { app, BrowserWindow, protocol, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const Database = require('better-sqlite3'); // Disk-based SQLite

// Initialize persistent storage for user paths
const store = new Store();

let mainWindow;
let mbtilesDb = null;  // Active Database instance

// Register custom protocols as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      secure: true,
      bypassCSP: false
    }
  },
  {
    scheme: 'mbtiles',
    privileges: {
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      secure: true,
      bypassCSP: false
    }
  }
]);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    webPreferences: {
      nodeIntegration: false,        // Security: no Node.js in renderer
      contextIsolation: true,         // Security: separate contexts
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    title: 'pciSeq Viewer',
    icon: path.join(__dirname, '..', 'icon.png')
  });

  // Load the index.html using app:// protocol
  mainWindow.loadURL('app://index.html');

  // Open DevTools in development (uncomment for debugging)
  // mainWindow.webContents.openDevTools();

  // Log any loading errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', validatedURL);
    console.error('Error code:', errorCode);
    console.error('Error description:', errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Open MBTiles database using better-sqlite3
function openDatabase(mbtilesPath) {
  if (mbtilesDb) {
    try { mbtilesDb.close(); } catch (e) {}
    mbtilesDb = null;
  }

  try {
    // Open in read-only mode, verbose logging if needed
    mbtilesDb = new Database(mbtilesPath, { readonly: true, fileMustExist: true });
    console.log('Opened MBTiles database (disk-based):', mbtilesPath);
    return true;
  } catch (e) {
    console.error('Failed to open MBTiles database:', e);
    return false;
  }
}

// Get tile from MBTiles database
function getTileFromMBTiles(planeId, z, x, y) {
  if (!mbtilesDb) {
    // Attempt to lazy-load if path is stored
    const storedPath = store.get('mbtilesPath', '');
    if (storedPath && fs.existsSync(storedPath)) {
        if (!openDatabase(storedPath)) return null;
    } else {
        return null;
    }
  }

  try {
    // Standard MBTiles uses (zoom_level, tile_column, tile_row)
    // Our schema adds plane_id
    const stmt = mbtilesDb.prepare(
      'SELECT tile_data FROM tiles WHERE plane_id = ? AND zoom_level = ? AND tile_column = ? AND tile_row = ?'
    );
    
    const row = stmt.get(planeId, z, x, y);
    return row ? row.tile_data : null;
  } catch (e) {
    console.error('Error fetching tile from MBTiles:', e);
    return null;
  }
}

// MBTiles protocol handler
function registerMBTilesProtocol() {
  protocol.registerBufferProtocol('mbtiles', (request, callback) => {
    // URL format: mbtiles://tiles/{plane}/{z}/{y}/{x}.jpg
    // The "tiles" is a dummy hostname to avoid URL parsing issues with plane numbers
    const url = request.url.replace('mbtiles://', '');
    const parts = url.split('/');

    // Expected parts: ["tiles", plane, z, y, "x.jpg"]
    if (parts.length < 5) {
      console.error('Invalid mbtiles URL format:', request.url);
      callback({ error: -6 }); // FILE_NOT_FOUND
      return;
    }

    // Skip parts[0] which is the dummy hostname "tiles"
    const planeId = parseInt(parts[1]);
    const z = parseInt(parts[2]);
    const y = parseInt(parts[3]);
    const x = parseInt(parts[4].replace(/\.(jpg|jpeg|png)$/i, ''));

    // console.log(`Fetch tile: plane=${planeId}, z=${z}, x=${x}, y=${y}`);

    const tileData = getTileFromMBTiles(planeId, z, x, y);

    if (tileData) {
      callback({
        mimeType: 'image/jpeg',
        data: Buffer.from(tileData)
      });
    } else {
    //   console.warn(`Tile not found in DB: plane=${planeId}, z=${z}, x=${x}, y=${y}`);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
}

// Custom protocol handler
function registerCustomProtocol() {
  protocol.registerFileProtocol('app', (request, callback) => {
    let url = request.url.replace('app://', '');

    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // Fix: Browser treats index.html as a directory for relative URLs
    // Remove the index.html/ prefix if present
    if (url.startsWith('index.html/')) {
      url = url.replace('index.html/', '');
    }

    // Remove query parameters if any
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      url = url.substring(0, queryIndex);
    }

    console.log('Protocol handler - requested URL:', url);

    const dataPath = store.get('dataPath', '');
    const tilesPath = store.get('tilesPath', '');

    let filePath;

    // Route Arrow data files to user-selected data folder
    // Handles: arrow_spots/, arrow_cells/, arrow_boundaries/
    if (url.startsWith('arrow_spots/') || url.startsWith('arrow_cells/') || url.startsWith('arrow_boundaries/')) {
      if (!dataPath) {
        console.error('Data path not configured');
        callback({ error: -6 }); // FILE_NOT_FOUND
        return;
      }
      filePath = path.join(dataPath, url);
    }
    // Route tile requests (Unified handler for Loose Files and MBTiles)
    else if (url.startsWith('tiles/')) {
      // Strategy 1: MBTiles (Priority if loaded)
      // Note: Protocol 'mbtiles://' is preferred, but this handles 'app://tiles/' fallback
      // which shouldn't happen with correct config.js, but good for safety.
      // We'll skip complex logic here and assume mbtiles protocol handles the DB.
      
      if (tilesPath) {
         const cleanUrl = url.replace('tiles/', '');
         // Try "tiles_{plane}" convention
         const parts = cleanUrl.split('/');
         if (parts.length >= 4) {
             const plane = parts[0];
             const rest = parts.slice(1).join(path.sep);
             const standardPath = path.join(tilesPath, `tiles_${plane}`, rest);
             if (fs.existsSync(standardPath)) {
                 filePath = standardPath;
             } else {
                 filePath = path.join(tilesPath, cleanUrl);
             }
         } else {
             filePath = path.join(tilesPath, cleanUrl);
         }
      } else {
          callback({ error: -6 });
          return;
      }
    }
    // Route app files to bundled application directory
    else {
      filePath = path.join(__dirname, '..', url);
    }

    // Set appropriate MIME type for JavaScript modules
    const mimeTypes = {
      '.js': 'text/javascript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.feather': 'application/octet-stream'
    };

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = mimeTypes[ext];

    console.log('Serving file:', filePath, 'with MIME type:', mimeType);

    callback({
      path: filePath,
      mimeType: mimeType
    });
  });
}

// IPC Handlers for folder selection
ipcMain.handle('select-data-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Data Folder',
    message: 'Choose the folder containing arrow_spots, arrow_cells, and arrow_boundaries subdirectories'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const selectedPath = result.filePaths[0];

    // Validate that the folder has the expected structure
    const fs = require('fs');
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
    const fs = require('fs');
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

// IPC Handler for saving voxel size to electron-store
ipcMain.handle('set-voxel-size', (event, voxelSize) => {
  if (Array.isArray(voxelSize) && voxelSize.length === 3) {
    store.set('voxelSize', voxelSize);
    console.log('Voxel size saved:', voxelSize);
    return { success: true };
  }
  return { success: false, error: 'Invalid voxel size format. Expected [x, y, z] array.' };
});

// IPC Handler for getting stored voxel size
ipcMain.handle('get-voxel-size', () => {
  const voxelSize = store.get('voxelSize', null);
  return { success: voxelSize !== null, voxelSize };
});

// IPC Handler for selecting MBTiles file
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

// IPC Handler for getting MBTiles metadata
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

// IPC Handler for reading metadata.json from data folder
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

// IPC Handler for getting dataset metadata from MBTiles (no fallback)
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
      if (row.name === 'voxel_size') {
        // Parse comma-separated voxel size: "0.28,0.28,0.7"
        const parts = row.value.split(',').map(parseFloat);
        if (parts.length === 3) result.voxelSize = parts;
      }
    });

    result.source = 'mbtiles';
  } catch (e) {
    return {
      success: false,
      ...result,
      error: `Failed to read MBTiles metadata: ${e.message}`
    };
  }

  // If voxelSize not in MBTiles, use stored voxel size from electron-store
  if (!result.voxelSize) {
    const storedVoxelSize = store.get('voxelSize', null);
    if (storedVoxelSize && Array.isArray(storedVoxelSize) && storedVoxelSize.length === 3) {
      result.voxelSize = storedVoxelSize;
      result.source = 'mbtiles+store';
      console.log('Using stored voxel size:', storedVoxelSize);
    }
  }

  // Check required fields - all four are now required
  const hasRequired = result.imageWidth && result.imageHeight && result.planeCount && result.voxelSize;
  return {
    success: hasRequired,
    ...result,
    error: hasRequired ? null : 'Missing required metadata: width, height, plane_count (from MBTiles), and voxel_size (from MBTiles or user input) are required'
  };
});

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Dataset...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Select Data Folder',
              message: 'Choose the folder containing arrow_spots, arrow_cells, and arrow_boundaries subdirectories'
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const selectedPath = result.filePaths[0];
              // ... validation (same as ipcMain logic) ...
               // Validate that the folder has the expected structure
              const fs = require('fs');
              const expectedSubdirs = ['arrow_spots', 'arrow_cells', 'arrow_boundaries'];
              const hasValidStructure = expectedSubdirs.some(subdir =>
                fs.existsSync(path.join(selectedPath, subdir))
              );

              if (!hasValidStructure) {
                dialog.showErrorBox(
                  'Invalid Data Folder',
                  'The selected folder does not contain the expected subdirectories (arrow_spots, arrow_cells, or arrow_boundaries).'
                );
                return;
              }

              store.set('dataPath', selectedPath);
              console.log('Data path set to:', selectedPath);
              
              // Auto-discovery logic (duplicate logic, simplified for menu)
              try {
                  const files = fs.readdirSync(selectedPath);
                  const mbtilesFiles = files.filter(f => f.endsWith('.mbtiles'));
                  if (mbtilesFiles.length > 0) {
                    const autoMbtilesPath = path.join(selectedPath, mbtilesFiles[0]);
                    if (openDatabase(autoMbtilesPath)) {
                        store.set('mbtilesPath', autoMbtilesPath);
                        // Silent load
                    }
                  }
              } catch(e) {}

              // Reload the window to use new data
              if (mainWindow) {
                mainWindow.reload();
              }
            }
          }
        },
        {
          label: 'Close Dataset',
          click: () => {
            store.delete('dataPath');
            store.delete('tilesPath');
            store.delete('mbtilesPath');
            if (mbtilesDb) {
                try { mbtilesDb.close(); } catch(e) {}
                mbtilesDb = null;
            }
            console.log('Dataset closed, paths cleared.');
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Open Background Tiles...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
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

              try {
                // Validate using better-sqlite3
                const testDb = new Database(selectedPath, { readonly: true, fileMustExist: true });
                const stmt = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name='tiles' OR name='map')");
                const hasTable = stmt.get();
                testDb.close();

                if (!hasTable) {
                  dialog.showErrorBox(
                    'Invalid MBTiles File',
                    'The selected file does not appear to be a valid MBTiles database (missing tiles table).'
                  );
                  return;
                }

                store.set('mbtilesPath', selectedPath);
                openDatabase(selectedPath);

                // Reload the window to use new tiles
                if (mainWindow) {
                  mainWindow.reload();
                }
              } catch (e) {
                dialog.showErrorBox(
                  'Invalid MBTiles File',
                  `Failed to open file: ${e.message}`
                );
              }
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About pciSeq Viewer',
          click: () => {
            const packageJson = require('../package.json');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About pciSeq Viewer',
              message: `pciSeq Viewer v${packageJson.version}`,
              detail: 'Desktop transcriptomics viewer for visualizing spatial gene expression data.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle
app.whenReady().then(async () => {
  // Clear stored paths to ensure we start on the welcome screen
  store.delete('dataPath');
  store.delete('tilesPath');
  store.delete('mbtilesPath');

  registerCustomProtocol();
  registerMBTilesProtocol();

  // Pre-load MBTiles database if configured
  const mbtilesPath = store.get('mbtilesPath', '');
  if (mbtilesPath && fs.existsSync(mbtilesPath)) {
    openDatabase(mbtilesPath);
  }

  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Log startup info
console.log('pciSeq Viewer starting...');
console.log('App path:', app.getAppPath());
console.log('User data:', app.getPath('userData'));
console.log('Stored data path:', store.get('dataPath', 'not set'));
console.log('Stored tiles path:', store.get('tilesPath', 'not set'));
console.log('Stored mbtiles path:', store.get('mbtilesPath', 'not set'));
