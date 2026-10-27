/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    bible: {
      getMarks: () => Promise<any>
      setMarks: (marks: any, opts?: { allowEmpty?: boolean }) => Promise<void>
      getStudy: () => Promise<any>
      setStudy: (study: any, opts?: { allowEmpty?: boolean }) => Promise<void>
    }
    ai: {
      chat: (msgs: any[], model?: string, opts?: any) => Promise<any>
      models: (opts?: any) => Promise<any>
    }
    gospel: {
      search: (query?: string) => Promise<any>
    }
    settings: {
      get: () => Promise<any>
      set: (patch: any) => Promise<void>
    }
    app: {
      version: () => Promise<string>
    }
    window: {
      minimize:         () => void
      maximize:         () => void
      close:            () => void
      isMaximized:      () => Promise<boolean>
      onMaximizeChange: (cb: (maximized: boolean) => void) => () => void
    }
    onAiChunk: (cb: (chunk: any) => void) => () => void
    openExternal?: (url: string) => void
  }
}
