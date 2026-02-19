const { app, BrowserWindow, protocol, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');
const Database = require('better-sqlite3'); // Disk-based SQLite
const diagnostics = require('./diagnostics');
const dataLoader = require('./data-loader');

// GitHub repo for update checks
const GITHUB_REPO = 'acycliq/pciSeq_viewer';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

// --- PROFILE ISOLATION LOGIC ---
// This must run BEFORE the Store is initialized to ensure each profile gets its own config file.
const args = process.argv.slice(2);
const profileArg = args.find(a => a.startsWith('--profile='));
if (profileArg) {
  const profileName = profileArg.split('=')[1];
  const currentPath = app.getPath('userData');
  // Create a sibling directory for the profile to keep things tidy
  const customPath = path.join(path.dirname(currentPath), `pciSeq-profile-${profileName}`);
  app.setPath('userData', customPath);
  global.profileName = profileName;
  console.log(`Using isolated profile: ${profileName}`);
  console.log(`Profile data path: ${customPath}`);
} else {
  global.profileName = 'Default';
}
// -------------------------------

// Initialize persistent storage for user paths
const store = new Store();

function checkForUpdates() {
  const packageJson = require('../package.json');
  const currentVersion = packageJson.version;

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${GITHUB_REPO}/releases/latest`,
    headers: { 'User-Agent': 'pciSeq_viewer' }
  };

  https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latestVersion = release.tag_name.replace(/^v/, '');

        if (latestVersion !== currentVersion) {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `Version ${latestVersion} available`,
            detail: `Current version: ${currentVersion}`,
            buttons: ['Download', 'Later']
          }).then(result => {
            if (result.response === 0) {
              shell.openExternal(release.html_url);
            }
          });
        } else {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'No Updates',
            message: 'pciSeq Viewer is up to date.'
          });
        }
      } catch (e) {
        dialog.showErrorBox('Update Check Failed', 'Could not parse update information.');
      }
    });
  }).on('error', (e) => {
    dialog.showErrorBox('Update Check Failed', `Could not connect to GitHub: ${e.message}`);
  });
}

let mainWindow;

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

  // Initialize modules
  diagnostics.init(mainWindow, store);
  dataLoader.init(mainWindow, store, diagnostics);
}

// Get tile from MBTiles database
function getTileFromMBTiles(planeId, z, x, y) {
  let mbtilesDb = dataLoader.getDatabase();
  if (!mbtilesDb) {
    // Attempt to lazy-load if path is stored
    const storedPath = store.get('mbtilesPath', '');
    if (storedPath && fs.existsSync(storedPath)) {
      if (!dataLoader.openDatabase(storedPath)) return null;
      mbtilesDb = dataLoader.getDatabase();
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
                    if (dataLoader.openDatabase(autoMbtilesPath)) {
                        store.set('mbtilesPath', autoMbtilesPath);
                        // Silent load
                    }
                  }
              } catch(e) {}

              // Auto-discover diagnostics database
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
              } catch(e) { console.warn('Failed to auto-discover diagnostics:', e); }

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
            store.delete('checkCellEnabled');
            store.delete('checkCellPath');
            store.delete('checkSpotEnabled');
            store.delete('checkSpotPath');
            dataLoader.closeDatabase();
            diagnostics.closeDiagnosticsDatabase();
            diagnostics.broadcastDiagnosticsState(false);
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
                dataLoader.openDatabase(selectedPath);

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
      label: 'Import',
      submenu: [
        {
          label: 'Gene Colours...',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              title: 'Import Gene Colours',
              message: 'Select a JSON file with gene colour definitions',
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              try {
                const content = fs.readFileSync(result.filePaths[0], 'utf-8');
                const data = JSON.parse(content);
                mainWindow.webContents.send('import-gene-colors', data);
              } catch (e) {
                dialog.showErrorBox('Import Error', `Failed to read or parse file: ${e.message}`);
              }
            }
          }
        },
        {
          label: 'Cell Class Colours...',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              title: 'Import Cell Class Colours',
              message: 'Select a JSON file with cell class colour definitions',
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              try {
                const content = fs.readFileSync(result.filePaths[0], 'utf-8');
                const data = JSON.parse(content);
                mainWindow.webContents.send('import-class-colors', data);
              } catch (e) {
                dialog.showErrorBox('Import Error', `Failed to read or parse file: ${e.message}`);
              }
            }
          }
        }
      ]
    },
    {
      label: 'Diagnostics',
      submenu: [
        {
          label: 'Setup...',
          click: () => {
            diagnostics.openDiagnosticsSetup();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts...',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('show-shortcuts');
          }
        },
        { type: 'separator' },
        {
          label: 'Check for Updates...',
          click: () => {
            checkForUpdates();
          }
        },
        { type: 'separator' },
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
    dataLoader.openDatabase(mbtilesPath);
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
