const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scSetup', {
  getConfig:  ()       => ipcRenderer.invoke('sc-get-config'),
  saveConfig: (config) => ipcRenderer.invoke('sc-save-config', config),
  browseFile: ()       => ipcRenderer.invoke('sc-browse-file'),
  close:      ()       => ipcRenderer.invoke('sc-close-setup')
});