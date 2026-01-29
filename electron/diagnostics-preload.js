const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diagnosticsSetup', {
    getConfig: () => ipcRenderer.invoke('diagnostics-get-config'),
    saveConfig: (config) => ipcRenderer.invoke('diagnostics-save-config', config),
    setEnabled: (enabled) => ipcRenderer.invoke('diagnostics-set-enabled', enabled),
    browseFolder: () => ipcRenderer.invoke('diagnostics-browse-folder'),
    close: () => ipcRenderer.invoke('diagnostics-close-setup')
});
