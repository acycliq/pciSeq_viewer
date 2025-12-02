const { app, BrowserWindow, protocol, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const Store = require('electron-store');

// Initialize persistent storage for user paths
const store = new Store();

let mainWindow;

// Register custom protocol as privileged before app is ready
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

  // Open DevTools in development
  mainWindow.webContents.openDevTools();

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
    tilesPath: store.get('tilesPath', '')
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

              // Reload the window to use new data
              if (mainWindow) {
                mainWindow.reload();
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
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About pciSeq Viewer',
              message: 'pciSeq Viewer v0.0.1',
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
app.whenReady().then(() => {
  registerCustomProtocol();
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
