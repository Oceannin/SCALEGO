'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')
contextBridge.exposeInMainWorld('scalego', {
  state: () => ipcRenderer.invoke('scalego:state'),
  engine: () => ipcRenderer.invoke('scalego:engine'),
  import: () => ipcRenderer.invoke('scalego:import'),
  drop: files => ipcRenderer.invoke('scalego:drop', files.map(file => webUtils.getPathForFile(file)).filter(Boolean)),
  remove: id => ipcRenderer.invoke('scalego:remove', id),
  start: (ids, options) => ipcRenderer.invoke('scalego:start', { ids, options }),
  resume: () => ipcRenderer.invoke('scalego:resume'),
  cancel: () => ipcRenderer.invoke('scalego:cancel'),
  exportAll: () => ipcRenderer.invoke('scalego:export-all'),
  export: id => ipcRenderer.invoke('scalego:export', id),
  directory: () => ipcRenderer.invoke('scalego:directory'),
  reveal: () => ipcRenderer.invoke('scalego:reveal'),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('scalego:state', listener); return () => ipcRenderer.removeListener('scalego:state', listener) },
})
