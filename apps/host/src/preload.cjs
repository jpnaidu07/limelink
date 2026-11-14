const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('captureHost', {
  list: () => ipcRenderer.invoke('capture:list'),
  arm: (id) => ipcRenderer.invoke('capture:arm', id),
  revoke: () => ipcRenderer.invoke('capture:revoke'),
  diagnostics: () => ipcRenderer.invoke('capture:diagnostics'),
  onInvalidated: (listener) => {
    const notify = (_event, reason) => listener(reason);
    ipcRenderer.on('capture:invalidated', notify);
    return () => ipcRenderer.removeListener('capture:invalidated', notify);
  },
});
