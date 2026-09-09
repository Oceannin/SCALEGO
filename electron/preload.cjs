'use strict'
const { contextBridge, ipcRenderer, webUtils } = require('electron')
const PREFIX = 'SCALEGO_ERROR:'

const invoke = (name, payload) => ipcRenderer.invoke(`scalego:${name}`, payload).catch(error => {
  const marker = String(error?.message || '').lastIndexOf(PREFIX)
  if (marker < 0) throw Object.assign(new Error('UNEXPECTED_ERROR'), { code: 'UNEXPECTED_ERROR', params: {} })
  const encoded = String(error.message).slice(marker + PREFIX.length)
  const separator = encoded.indexOf(':')
  const code = separator < 0 ? encoded : encoded.slice(0, separator)
  let params = {}
  try { params = separator < 0 ? {} : JSON.parse(encoded.slice(separator + 1)) } catch {}
  throw Object.assign(new Error(code), { code, params })
})

contextBridge.exposeInMainWorld('scalego', {
  state: () => invoke('state'),
  engine: () => invoke('engine'),
  import: language => invoke('import', { language }),
  drop: files => invoke('drop', files.map(file => webUtils.getPathForFile(file))),
  remove: id => invoke('remove', id),
  start: (ids, options) => invoke('start', { ids, options }),
  resume: () => invoke('resume'),
  cancel: () => invoke('cancel'),
  exportAll: language => invoke('export-all', { language }),
  exportSelected: (ids, language) => invoke('export-selected', { ids, language }),
  export: (id, language) => invoke('export', { id, language }),
  directory: language => invoke('directory', { language }),
  reveal: () => invoke('reveal'),
  onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('scalego:state', listener); return () => ipcRenderer.removeListener('scalego:state', listener) },
})
