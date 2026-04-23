const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scView', {
  getReferenceData: () => ipcRenderer.invoke('sc-get-reference-data'),
  getImpliedData:   () => ipcRenderer.invoke('sc-get-implied-data')
});