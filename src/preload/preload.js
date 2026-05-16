const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  platform: process.platform,

  timer: {
    start:  () => ipcRenderer.invoke('timer:start'),
    stop:   () => ipcRenderer.invoke('timer:stop'),
    status: () => ipcRenderer.invoke('timer:status'),
  },

  tg: {
    fetchChannel: (token, username) => ipcRenderer.invoke('tg:fetchChannel', { token, username }),
  },

  docs: {
    save:   (fileName, buffer, uid) => ipcRenderer.invoke('docs:save',   { fileName, buffer, uid }),
    open:   (localPath)             => ipcRenderer.invoke('docs:open',   { localPath }),
    show:   (localPath)             => ipcRenderer.invoke('docs:show',   { localPath }),
    delete: (localPath)             => ipcRenderer.invoke('docs:delete', { localPath }),
  },

  pdf: {
    generate: (html, filename) => ipcRenderer.invoke('pdf:generate', { html, filename }),
  },
})