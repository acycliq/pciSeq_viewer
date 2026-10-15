const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe API to the renderer process
// This is the ONLY way the renderer can communicate with the main process
contextBridge.exposeInMainWorld('electronAPI', {
  // Folder selection methods
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  platform: process.platform,
  // the sample run on the welcome screen (electron/sample.js)
  sampleStatus: () => ipcRenderer.invoke('sample-status'),
  openSample: (keyword) => ipcRenderer.invoke('sample-open', keyword),
  onSampleProgress: (handler) => ipcRenderer.on('sample-progress', (_e, state) => handler(state)),
  selectTilesFolder: () => ipcRenderer.invoke('select-tiles-folder'),

  // MBTiles file selection
  selectMBTilesFile: () => ipcRenderer.invoke('select-mbtiles-file'),
  getMBTilesMetadata: () => ipcRenderer.invoke('get-mbtiles-metadata'),

  // Background tile channels (e.g. DAPI, GCaMP) discovered in the data folder
  getTileChannels: () => ipcRenderer.invoke('get-tile-channels'),

  // Dataset metadata (combined MBTiles + metadata.json)
  getDatasetMetadata: () => ipcRenderer.invoke('get-dataset-metadata'),
  getMetadataJson: () => ipcRenderer.invoke('get-metadata-json'),

  // Voxel size
  setVoxelSize: (voxelSize) => ipcRenderer.invoke('set-voxel-size', voxelSize),

  // Image dimensions (used when MBTiles is missing)
  setImageDimensions: (dims) => ipcRenderer.invoke('set-image-dimensions', dims),

  // Get currently configured paths
  getPaths: () => ipcRenderer.invoke('get-paths'),
  getProfileName: () => ipcRenderer.invoke('get-profile-name'),

  // misread metadata (gene_panel + misread_density from diagnostics.db)
  getMisreadMeta: () => ipcRenderer.invoke('get-misread-meta'),

  // check_cell (SQLite data, no Python required)
  getCheckCellState: () => ipcRenderer.invoke('check-cell-get-state'),
  checkCellQuery: (params) => ipcRenderer.invoke('check-cell-binary-query', params),
  onCheckCellState: (handler) => ipcRenderer.on('check-cell-state', (_e, state) => handler(state)),

  // Per-cell tooltip data (theta_bar[k*] + gamma_assigned) for hover tooltips
  tooltipGetCellInfo: (cellLabel) => ipcRenderer.invoke('tooltip-get-cell-info', { cellLabel }),

  // check_spot (SQLite data, no Python required)
  getCheckSpotState: () => ipcRenderer.invoke('check-spot-get-state'),
  checkSpotQuery: (spotId) => ipcRenderer.invoke('check-spot-binary-query', { spotId }),
  onCheckSpotState: (handler) => ipcRenderer.on('check-spot-state', (_e, state) => handler(state)),

  // Import colour schemes from menu
  onImportGeneColors: (handler) => ipcRenderer.on('import-gene-colors', (_e, data) => handler(data)),
  onImportClassColors: (handler) => ipcRenderer.on('import-class-colors', (_e, data) => handler(data)),

  // Keyboard shortcuts overlay
  // Chat panel. chatSend runs one turn in the main process (the model call and any
  // tool calls) and resolves with the assistant's final text; the steps along the
  // way arrive as chat-event messages so the panel can show what was looked up.
  chatSend: (messages) => ipcRenderer.invoke('chat-send', messages),
  chatGetSettings: (provider) => ipcRenderer.invoke('chat-get-settings', provider),
  chatSaveSettings: (settings) => ipcRenderer.invoke('chat-save-settings', settings),
  chatListModels: (provider) => ipcRenderer.invoke('chat-list-models', provider),
  // the picture composer: the main process sends a draw list, the renderer draws
  // it on an invisible canvas and hands the png back
  onComposeImage: (handler) => ipcRenderer.on('chat-compose-image', (_e, p) => handler(p)),
  composeImageDone: (payload) => ipcRenderer.send('chat-compose-image-done', payload),
  onChatEvent: (handler) => ipcRenderer.on('chat-event', (_e, ev) => handler(ev)),
  // annotations (electron/annotations.js): tell the main process what changed, and
  // Save / Open through its dialogs
  annotationsChanged: (regions) => ipcRenderer.invoke('annotations-changed', regions),
  saveAnnotations: () => ipcRenderer.invoke('annotations-save'),
  openAnnotations: () => ipcRenderer.invoke('annotations-open'),
  // the outline_cells tool: add a cell annotation
  onChatAddCellAnnotation: (handler) => ipcRenderer.on('chat-add-cell-annotation', (_e, p) => handler(p)),
  // the open_chart tool: open one of the drawer's charts (src/chatCharts.js)
  onChatOpenChart: (handler) => ipcRenderer.on('chat-open-chart', (_e, p) => handler(p)),
  // the class prior chart: the weight of every class (run.js classPrior)
  getClassPrior: () => ipcRenderer.invoke('get-class-prior'),
  // the fit_allen_regions tool: the Allen regions fitted to the section
  onChatAddAllenRegions: (handler) => ipcRenderer.on('chat-add-allen-regions', (_e, p) => handler(p)),
  // what the map legend says, class colours and gene glyphs, for the tools (electron/legend.js)
  setLegend: (legend) => ipcRenderer.send('legend', legend),
  // the fly_to_cell tool: the main process asks the map to move and waits to hear
  // whether the cell was there (electron/compose.js)
  onChatFlyToCell: (handler) => ipcRenderer.on('chat-fly-to-cell', (_e, p) => handler(p)),
  chatFlyToCellDone: (payload) => ipcRenderer.send('chat-fly-to-cell-done', payload),
  // the open_cell_diagnostics tool: open the panel on a cell and run the compare
  onChatOpenCellDiagnostics: (handler) => ipcRenderer.on('chat-open-cell-diagnostics', (_e, p) => handler(p)),
  // and open_spot_diagnostics: open the spot panel on a spot
  onChatOpenSpotDiagnostics: (handler) => ipcRenderer.on('chat-open-spot-diagnostics', (_e, p) => handler(p)),
  // the open_3d_view tool: open the 3D viewer around a cell
  onChatOpen3dView: (handler) => ipcRenderer.on('chat-open-3d-view', (_e, p) => handler(p)),
  // the show_classes and show_genes tools: change which classes or genes are drawn
  onChatShowVisibility: (handler) => ipcRenderer.on('chat-show-visibility', (_e, p) => handler(p)),
  // the uniform_spot_size tool: the Uniform Size switch in Gene Controls
  onChatUniformSize: (handler) => ipcRenderer.on('chat-uniform-size', (_e, p) => handler(p)),
  // the show_all_planes tool: the Cells from all planes switch, answered once the
  // planes are loaded (electron/compose.js)
  onChatAllPlanes: (handler) => ipcRenderer.on('chat-all-planes', (_e, p) => handler(p)),
  // the viewer_state tool: the renderer answers with a snapshot of its state
  onChatViewerState: (handler) => ipcRenderer.on('chat-viewer-state', (_e, p) => handler(p)),
  chatViewerStateDone: (payload) => ipcRenderer.send('chat-viewer-state-done', payload),
  // the spot_filters tool: score, intensity and size, set through the sliders
  onChatSpotFilters: (handler) => ipcRenderer.on('chat-spot-filters', (_e, p) => handler(p)),
  chatSpotFiltersDone: (payload) => ipcRenderer.send('chat-spot-filters-done', payload),
  // the misread_display tool: show, grey out or hide the misreads
  onChatMisreadDisplay: (handler) => ipcRenderer.on('chat-misread-display', (_e, p) => handler(p)),
  chatMisreadDisplayDone: (payload) => ipcRenderer.send('chat-misread-display-done', payload),
  // the map_layers tool: background, its channel, cells and their opacity
  onChatMapLayers: (handler) => ipcRenderer.on('chat-map-layers', (_e, p) => handler(p)),
  chatMapLayersDone: (payload) => ipcRenderer.send('chat-map-layers-done', payload),
  // the go_to_plane tool: the plane slider
  onChatGoToPlane: (handler) => ipcRenderer.on('chat-go-to-plane', (_e, p) => handler(p)),
  chatGoToPlaneDone: (payload) => ipcRenderer.send('chat-go-to-plane-done', payload),
  // the cells_by_gene_count tool: the Min and Max genes sliders
  onChatGeneCountFilter: (handler) => ipcRenderer.on('chat-gene-count-filter', (_e, p) => handler(p)),
  chatGeneCountFilterDone: (payload) => ipcRenderer.send('chat-gene-count-filter-done', payload),
  chatAllPlanesDone: (payload) => ipcRenderer.send('chat-all-planes-done', payload),
  // the export_per_class_pngs tool: the drawer's export, each PNG written by the
  // main process into the folder the tool chose, answered when all are on disk
  onChatExportPerClass: (handler) => ipcRenderer.on('chat-export-per-class', (_e, p) => handler(p)),
  chatExportPerClassDone: (payload) => ipcRenderer.send('chat-export-per-class-done', payload),
  savePng: ({ dir, name, bytes }) => ipcRenderer.invoke('chat-save-png', { dir, name, bytes }),
  onShowShortcuts: (handler) => ipcRenderer.on('show-shortcuts', handler),
  // Help > Take a Tour
  onStartTour: (handler) => ipcRenderer.on('start-tour', handler)
});

console.log('Preload script loaded - electronAPI exposed to renderer');
