const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
// This is the ONLY way the renderer can communicate with the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder selection methods
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  selectTilesFolder: () => ipcRenderer.invoke('select-tiles-folder'),

  // MBTiles file selection
  selectMBTilesFile: () => ipcRenderer.invoke('select-mbtiles-file'),
  getMBTilesMetadata: () => ipcRenderer.invoke('get-mbtiles-metadata'),

  // Get currently configured paths
  getPaths: () => ipcRenderer.invoke('get-paths'),

  // Flag to detect Electron environment
  isElectron: true
});

console.log('Preload script loaded - electronAPI exposed to renderer');
