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
})