const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('checkCellSetup', {
    getConfig: () => ipcRenderer.invoke('check-cell-get-config'),
    saveConfig: (config) => ipcRenderer.invoke('check-cell-save-config', config),
    setEnabled: (enabled) => ipcRenderer.invoke('check-cell-set-enabled', enabled),
    browseFolder: () => ipcRenderer.invoke('check-cell-browse-folder'),
    close: () => ipcRenderer.invoke('check-cell-close-setup')
});