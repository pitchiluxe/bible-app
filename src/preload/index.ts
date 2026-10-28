import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  bible: {
    getMarks: () => ipcRenderer.invoke('bible:getMarks'),
    setMarks: (marks: any, opts?: { allowEmpty?: boolean }) =>
      ipcRenderer.invoke('bible:setMarks', marks, opts),
    getStudy: () => ipcRenderer.invoke('bible:getStudy'),
    setStudy: (study: any, opts?: { allowEmpty?: boolean }) =>
      ipcRenderer.invoke('bible:setStudy', study, opts),
  },
  // The natural (neural) reading voice. Installed on request; speak() returns
  // { samples: Float32Array, sampleRate } or { error }.
  voice: {
    status:  () => ipcRenderer.invoke('voice:status'),
    install: () => ipcRenderer.invoke('voice:install'),
    remove:  () => ipcRenderer.invoke('voice:remove'),
    speak:   (text: string, voice: string, speed: number) => ipcRenderer.invoke('voice:speak', text, voice, speed),
    onProgress: (cb: (s: any) => void) => {
      const h = (_: any, s: any) => cb(s)
      ipcRenderer.on('voice:progress', h)
      return () => ipcRenderer.removeListener('voice:progress', h)
    },
  },
  ai: {
    chat: (msgs: any[], model?: string, opts?: any) =>
      ipcRenderer.invoke('ai:chat', msgs, model, opts),
    models: (opts?: any) => ipcRenderer.invoke('ai:models', opts),
  },
  gospel: {
    search: (query?: string) => ipcRenderer.invoke('gospel:search', query),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: any) => ipcRenderer.invoke('settings:set', patch),
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
  },
  window: {
    minimize:    () => ipcRenderer.send('window:minimize'),
    maximize:    () => ipcRenderer.send('window:maximize'),
    close:       () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb: (maximized: boolean) => void) => {
      const h = (_: any, v: boolean) => cb(v)
      ipcRenderer.on('window:maximizeChange', h)
      return () => ipcRenderer.removeListener('window:maximizeChange', h)
    },
  },
  onAiChunk: (cb: (chunk: any) => void) => {
    const handler = (_: any, chunk: any) => cb(chunk)
    ipcRenderer.on('ai:chunk', handler)
    return () => ipcRenderer.removeListener('ai:chunk', handler)
  },
})
