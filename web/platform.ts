// Browser equivalents of the desktop bridge. No Node or Electron code is bundled.
const PREFIX = 'bible-web:'
export const emptyMarks = () => ({ highlights: {}, saved: [], notes: {}, lastRead: null })
export const emptyStudy = () => ({ verses: {}, lessons: {}, streak: { days: [], best: 0 }, badges: [], plans: {} })
const record = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value)
export const validMarks = (v: any) => record(v) && record(v.highlights) && Array.isArray(v.saved) &&
  v.saved.every((s: any) => typeof s?.ref === 'string' && Number.isFinite(s?.ts)) &&
  record(v.notes) && Object.values(v.notes).every(n => typeof n === 'string') &&
  (v.lastRead === null || (typeof v.lastRead?.book === 'string' && Number.isInteger(v.lastRead?.chapter) && v.lastRead.chapter > 0))
export const validStudy = (v: any) => record(v) && record(v.verses) && record(v.lessons) &&
  record(v.streak) && Array.isArray(v.streak.days) && Number.isFinite(v.streak.best) &&
  Array.isArray(v.badges) && v.badges.every((b: any) => typeof b === 'string') && record(v.plans)

export function createWebApi(storage: Pick<Storage, 'getItem' | 'setItem'>, request = fetch) {
  function read(key: string, fallback: () => any, validate: (v: any) => boolean = record) {
    const raw = storage.getItem(PREFIX + key)
    if (raw === null) return fallback()
    const value = JSON.parse(raw)
    if (!validate(value)) throw new Error(`Unreadable ${key}. Import a backup to recover your data.`)
    return value
  }
  function write(key: string, value: any, validate: (v: any) => boolean = record) {
    if (!validate(value)) throw new Error(`Invalid ${key}`)
    storage.setItem(PREFIX + key, JSON.stringify(value))
  }
  const settings = () => read('settings', () => ({ ollamaBase: 'http://localhost:11434', ollamaModel: '', aiEnabled: false }))
  const base = () => {
    const url = new URL(settings().ollamaBase || 'http://localhost:11434')
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Use an Ollama address on localhost or 127.0.0.1.')
    }
    return url.origin
  }
  async function models() {
    if (!settings().aiEnabled) throw new Error('Enable the local AI companion in Web settings first.')
    const res = await request(`${base()}/api/tags`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
    const data = await res.json()
    return (data.models || []).filter((m: any) => typeof m.name === 'string' && !/embed|bert/i.test(m.name))
  }
  return {
    bible: {
      getMarks: async () => read('marks', emptyMarks, validMarks),
      setMarks: async (value: any) => write('marks', value, validMarks),
      getStudy: async () => read('study', emptyStudy, validStudy),
      setStudy: async (value: any) => write('study', value, validStudy),
    },
    settings: {
      get: async () => settings(),
      set: async (patch: any) => { write('settings', { ...settings(), ...patch }) },
    },
    ai: {
      models,
      chat: async (messages: any[], preferred?: string) => {
        const installed = await models()
        const model = preferred || settings().ollamaModel || installed[0]?.name
        if (!model) throw new Error('Install an Ollama chat model first, for example llama3.2.')
        const res = await request(`${base()}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: false, options: { num_predict: 1200 } }),
          signal: AbortSignal.timeout(180000),
        })
        if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
        const data = await res.json()
        if (!data.message?.content) throw new Error('Ollama returned an empty answer.')
        return { ok: true, content: data.message.content, provider: 'ollama', model }
      },
    },
    gospel: { search: async (query?: string) => ({
      ok: false, query, videos: [],
      error: 'Open YouTube to find worship music. Direct YouTube search is unavailable in this browser app.',
    }) },
    app: { version: async () => '1.2.2-web' },
    onAiChunk: () => () => {},
    openExternal: (url: string) => {
      if (/^https?:\/\//i.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}

const LOCAL_KEYS = ['aihub-bible-settings', 'aihub-bible-custom-courses', 'aihub-custom-themes', 'aihub-custom-window-styles', 'aihub-custom-exts']
export function installBrowserPlatform() {
  const api = createWebApi(localStorage)
  // Existing stores catch rejected writes. Report storage failures visibly as well.
  for (const method of ['setMarks', 'setStudy'] as const) {
    const save = api.bible[method]
    api.bible[method] = async value => {
      try { await save(value) }
      catch (error) {
        window.dispatchEvent(new CustomEvent('bible-web-save-error'))
        throw error
      }
    }
  }
  let pending: any = null
  const summary = (marks: any) => ({ verses: marks.saved.length, highlights: Object.keys(marks.highlights).length, bookmarks: 0 })
  const backup = {
    export: async () => {
      try {
        const marks = await api.bible.getMarks(), study = await api.bible.getStudy()
        const local = Object.fromEntries(LOCAL_KEYS.map(k => [k, localStorage.getItem(k)]).filter(([, v]) => v !== null))
        const data = { format: 'bible-web', version: 1, device: 'Web browser', createdAt: new Date().toISOString(), marks, study, local }
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url; link.download = `bible-backup-${new Date().toISOString().slice(0, 10)}.json`
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
        return { ok: true, summary: summary(marks) }
      } catch (error) { return { ok: false, error: String(error) } }
    },
    preview: async (): Promise<any> => new Promise(resolve => {
      pending = null
      const input = document.createElement('input')
      input.type = 'file'; input.accept = '.json,application/json'
      input.oncancel = () => resolve({ cancelled: true })
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve({ cancelled: true }); return }
        try {
          if (file.size > 10 * 1024 * 1024) throw new Error('Backup is larger than 10 MB.')
          const data = JSON.parse(await file.text())
          if (data.format !== 'bible-web' || data.version !== 1 || !validMarks(data.marks) || !validStudy(data.study) || !record(data.local)) {
            throw new Error('Choose a valid Bible web backup file.')
          }
          for (const key of Object.keys(data.local)) {
            if (!LOCAL_KEYS.includes(key) || typeof data.local[key] !== 'string') throw new Error('Invalid backup preferences.')
            JSON.parse(data.local[key])
          }
          pending = data
          resolve({ ok: true, device: 'Web browser', summary: summary(data.marks) })
        } catch (error) { resolve({ ok: false, error: String(error) }) }
      }
      input.click()
    }),
    apply: async () => {
      if (!pending) return { ok: false, error: 'Choose a backup file first.' }
      const data = pending; pending = null
      // Preserve current records; merge imported references without dropping local work.
      const before = new Map<string, string | null>()
      try {
        const marks = await api.bible.getMarks(), study = await api.bible.getStudy()
        const nextMarks = { ...data.marks, ...marks,
          highlights: { ...data.marks.highlights, ...marks.highlights },
          notes: { ...data.marks.notes, ...marks.notes },
          saved: [...new Map([...data.marks.saved, ...marks.saved].map((s: any) => [s.ref, s])).values()],
          lastRead: marks.lastRead || data.marks.lastRead,
        }
        const nextStudy = { ...study,
          verses: { ...data.study.verses, ...study.verses }, lessons: { ...data.study.lessons, ...study.lessons },
          plans: { ...data.study.plans, ...study.plans }, badges: [...new Set([...study.badges, ...data.study.badges])],
          streak: { days: [...new Set([...data.study.streak.days, ...study.streak.days])].sort(), best: Math.max(study.streak.best, data.study.streak.best) },
        }
        const changes: Record<string, string> = {
          [PREFIX + 'marks']: JSON.stringify(nextMarks), [PREFIX + 'study']: JSON.stringify(nextStudy),
        }
        for (const key of LOCAL_KEYS) {
          if (data.local[key] && localStorage.getItem(key) === null) changes[key] = data.local[key]
        }
        for (const key of Object.keys(changes)) before.set(key, localStorage.getItem(key))
        for (const [key, value] of Object.entries(changes)) localStorage.setItem(key, value)
        return { ok: true, summary: summary(nextMarks), local: {} }
      } catch (error) {
        for (const [key, value] of before) {
          try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch {}
        }
        return { ok: false, error: String(error) }
      }
    },
  }
  ;(window as any).electronAPI = { ...api, backup }
}
