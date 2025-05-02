const { contextBridge, ipcRenderer } = require('electron');

let sharedParams;

contextBridge.exposeInMainWorld('electronAPI', {
    setParams: (params) => {
        sharedParams = params;
    },
    getParams: () => {
        return sharedParams;
    },
    sendMessage: (channel, data) => {
        ipcRenderer.send(channel, data);
    },
    receiveMessage: (channel, callback) => {
        ipcRenderer.on(channel, (event, data) => callback(data));
    }
});