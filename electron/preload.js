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

  // Dataset metadata (combined MBTiles + metadata.json)
  getDatasetMetadata: () => ipcRenderer.invoke('get-dataset-metadata'),
  getMetadataJson: () => ipcRenderer.invoke('get-metadata-json'),

  // Voxel size
  setVoxelSize: (voxelSize) => ipcRenderer.invoke('set-voxel-size', voxelSize),
  getVoxelSize: () => ipcRenderer.invoke('get-voxel-size'),

  // Get currently configured paths
  getPaths: () => ipcRenderer.invoke('get-paths'),
  getProfileName: () => ipcRenderer.invoke('get-profile-name'),

  // check_cell (SQLite data, no Python required)
  getCheckCellState: () => ipcRenderer.invoke('check-cell-get-state'),
  checkCellQuery: (params) => ipcRenderer.invoke('check-cell-binary-query', params),
  onCheckCellState: (handler) => ipcRenderer.on('check-cell-state', (_e, state) => handler(state)),

  // check_spot (SQLite data, no Python required)
  getCheckSpotState: () => ipcRenderer.invoke('check-spot-get-state'),
  checkSpotQuery: (spotId) => ipcRenderer.invoke('check-spot-binary-query', { spotId }),
  onCheckSpotState: (handler) => ipcRenderer.on('check-spot-state', (_e, state) => handler(state)),

  // Import colour schemes from menu
  onImportGeneColors: (handler) => ipcRenderer.on('import-gene-colors', (_e, data) => handler(data)),
  onImportClassColors: (handler) => ipcRenderer.on('import-class-colors', (_e, data) => handler(data)),

  // Keyboard shortcuts overlay
  onShowShortcuts: (handler) => ipcRenderer.on('show-shortcuts', handler)
});

console.log('Preload script loaded - electronAPI exposed to renderer');
