const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendExecuteMessage: (queryParams) => {
      ipcRenderer.send('execute-method', queryParams)
    }
});
    