import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import * as fs from 'fs'
import * as https from 'https'
import * as http from 'http'
import * as os from 'os'
import { join } from 'path'
import * as path from 'path'

// ── App data directory ────────────────────────────────────────────────────
const APP_DIR = join(os.homedir(), '.bible-app')

function ensureDir(): void {
  if (!fs.existsSync(APP_DIR)) fs.mkdirSync(APP_DIR, { recursive: true })
}

// ── Settings ──────────────────────────────────────────────────────────────
interface AppSettings {
  ollamaBase: string
  openRouterKey: string
  openRouterModel: string
  theme: 'dark' | 'light' | 'system'
}

const SETTINGS_FILE = join(APP_DIR, 'settings.json')

function defaultSettings(): AppSettings {
  return {
    ollamaBase: 'http://localhost:11434',
    openRouterKey: '',
    openRouterModel: 'qwen/qwen3-coder:free',
    theme: 'system',
  }
}

function readSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
      return { ...defaultSettings(), ...raw }
    }
  } catch {}
  return defaultSettings()
}

function writeSettings(s: AppSettings): void {
  ensureDir()
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2))
}

// ── Bible Marks types ─────────────────────────────────────────────────────
interface BibleMarks {
  highlights: Record<string, string>
  saved: { ref: string; ts: number }[]
  notes: Record<string, string>
  lastRead: { book: string; chapter: number } | null
}

interface BibleStudyData {
  verses: Record<string, any>
  lessons: Record<string, any>
  streak: { days: string[]; best: number }
  badges: string[]
  plans: Record<string, any>
}

const EMPTY_BIBLE_MARKS = (): BibleMarks => ({ highlights: {}, saved: [], notes: {}, lastRead: null })
const EMPTY_BIBLE_STUDY = (): BibleStudyData => ({
  verses: {}, lessons: {}, streak: { days: [], best: 0 }, badges: [], plans: {},
})

// ── Bible Marks storage ───────────────────────────────────────────────────
const BIBLE_MARKS_FILE = join(APP_DIR, 'bible-marks.json')
const BIBLE_MARKS_BAK = `${BIBLE_MARKS_FILE}.bak`

function normaliseMarks(stored: any): BibleMarks | null {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return null
  return {
    highlights: stored.highlights ?? {},
    saved: Array.isArray(stored.saved) ? stored.saved : [],
    notes: stored.notes ?? {},
    lastRead: stored.lastRead ?? null,
  }
}

function marksHaveContent(m: BibleMarks): boolean {
  return Object.keys(m.highlights).length > 0 || m.saved.length > 0 || Object.keys(m.notes).length > 0
}

function writeBibleMarks(next: BibleMarks): void {
  ensureDir()
  if (fs.existsSync(BIBLE_MARKS_FILE)) {
    try { fs.copyFileSync(BIBLE_MARKS_FILE, BIBLE_MARKS_BAK) } catch {}
  }
  const tmp = `${BIBLE_MARKS_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
  fs.renameSync(tmp, BIBLE_MARKS_FILE)
}

ipcMain.handle('bible:getMarks', (): BibleMarks & { status: 'ok' | 'empty' | 'unreadable' } => {
  const readFile = (f: string): BibleMarks | null => {
    try { return normaliseMarks(JSON.parse(fs.readFileSync(f, 'utf-8'))) } catch { return null }
  }
  const primaryExists = fs.existsSync(BIBLE_MARKS_FILE)
  if (!primaryExists && !fs.existsSync(BIBLE_MARKS_BAK)) {
    return { ...EMPTY_BIBLE_MARKS(), status: 'empty' }
  }
  const primary = primaryExists ? readFile(BIBLE_MARKS_FILE) : null
  if (primary) return { ...primary, status: 'ok' }
  const backup = readFile(BIBLE_MARKS_BAK)
  if (backup) {
    try { fs.copyFileSync(BIBLE_MARKS_BAK, BIBLE_MARKS_FILE) } catch {}
    return { ...backup, status: 'ok' }
  }
  return { ...EMPTY_BIBLE_MARKS(), status: 'unreadable' }
})

ipcMain.handle('bible:setMarks', (_e: any, marks: BibleMarks, opts?: { allowEmpty?: boolean }) => {
  const next = normaliseMarks(marks)
  if (!next) return { ok: false, error: 'bad-shape' }
  if (!opts?.allowEmpty && !marksHaveContent(next)) {
    const current = (() => {
      try { return normaliseMarks(JSON.parse(fs.readFileSync(BIBLE_MARKS_FILE, 'utf-8'))) } catch { return null }
    })()
    if (current && marksHaveContent(current)) {
      return { ok: false, error: 'refused-empty' }
    }
  }
  try { writeBibleMarks(next) } catch (e: any) { return { ok: false, error: e?.message || 'write-failed' } }
  return { ok: true }
})

// ── Bible Study storage ───────────────────────────────────────────────────
const BIBLE_STUDY_FILE = join(APP_DIR, 'bible-study.json')
const BIBLE_STUDY_BAK = `${BIBLE_STUDY_FILE}.bak`

function normaliseStudy(stored: any): BibleStudyData | null {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return null
  const streak = stored.streak && typeof stored.streak === 'object' ? stored.streak : {}
  return {
    verses: stored.verses && typeof stored.verses === 'object' ? stored.verses : {},
    lessons: stored.lessons && typeof stored.lessons === 'object' ? stored.lessons : {},
    streak: {
      days: Array.isArray(streak.days) ? streak.days.filter((d: any) => typeof d === 'string') : [],
      best: Number(streak.best) || 0,
    },
    badges: Array.isArray(stored.badges) ? stored.badges.filter((b: any) => typeof b === 'string') : [],
    plans: stored.plans && typeof stored.plans === 'object' ? stored.plans : {},
  }
}

function studyHasContent(s: BibleStudyData): boolean {
  return Object.keys(s.verses).length > 0 || Object.keys(s.lessons).length > 0 || s.badges.length > 0
}

function writeBibleStudy(next: BibleStudyData): void {
  ensureDir()
  if (fs.existsSync(BIBLE_STUDY_FILE)) {
    try { fs.copyFileSync(BIBLE_STUDY_FILE, BIBLE_STUDY_BAK) } catch {}
  }
  const tmp = `${BIBLE_STUDY_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2))
  fs.renameSync(tmp, BIBLE_STUDY_FILE)
}

ipcMain.handle('bible:getStudy', (): BibleStudyData & { status: 'ok' | 'empty' | 'unreadable' } => {
  const readFile = (f: string): BibleStudyData | null => {
    try { return normaliseStudy(JSON.parse(fs.readFileSync(f, 'utf-8'))) } catch { return null }
  }
  const primaryExists = fs.existsSync(BIBLE_STUDY_FILE)
  if (!primaryExists && !fs.existsSync(BIBLE_STUDY_BAK)) {
    return { ...EMPTY_BIBLE_STUDY(), status: 'empty' }
  }
  const primary = primaryExists ? readFile(BIBLE_STUDY_FILE) : null
  if (primary) return { ...primary, status: 'ok' }
  const backup = readFile(BIBLE_STUDY_BAK)
  if (backup) {
    try { fs.copyFileSync(BIBLE_STUDY_BAK, BIBLE_STUDY_FILE) } catch {}
    return { ...backup, status: 'ok' }
  }
  return { ...EMPTY_BIBLE_STUDY(), status: 'unreadable' }
})

ipcMain.handle('bible:setStudy', (_e: any, study: BibleStudyData, opts?: { allowEmpty?: boolean }) => {
  const next = normaliseStudy(study)
  if (!next) return { ok: false, error: 'bad-shape' }
  if (!opts?.allowEmpty && !studyHasContent(next)) {
    const current = (() => {
      try { return normaliseStudy(JSON.parse(fs.readFileSync(BIBLE_STUDY_FILE, 'utf-8'))) } catch { return null }
    })()
    if (current && studyHasContent(current)) {
      return { ok: false, error: 'refused-empty' }
    }
  }
  try { writeBibleStudy(next) } catch (e: any) { return { ok: false, error: e?.message || 'write-failed' } }
  return { ok: true }
})

// ── Settings IPC ──────────────────────────────────────────────────────────
ipcMain.handle('settings:get', () => readSettings())
ipcMain.handle('settings:set', (_e: any, patch: Partial<AppSettings>) => {
  const current = readSettings()
  writeSettings({ ...current, ...patch })
  return { ok: true }
})

// ── App version ───────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion())

// ── HTTP helper ───────────────────────────────────────────────────────────
function httpGet(url: string, timeoutMs = 10000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = (mod as any).get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    }, (res: any) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 200, body }))
    })
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

// ── Gospel Room IPC ───────────────────────────────────────────────────────
interface YouTubeVideo { id: string; title: string; channel: string; thumbnail: string; duration: string }

const GOSPEL_QUERIES = [
  'gospel music worship 2024',
  'christian worship songs',
  'praise and worship music',
  'gospel choir live',
  'contemporary christian music',
]

function searchUrl(q: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%3D%3D`
}

function parseSearchResults(html: string, max: number): YouTubeVideo[] {
  const videos: YouTubeVideo[] = []
  try {
    const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s)
    if (!match) return videos
    const data = JSON.parse(match[1])
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents ?? []
    for (const item of contents) {
      const vr = item?.videoRenderer
      if (!vr?.videoId) continue
      const title = vr.title?.runs?.[0]?.text ?? ''
      const channel = vr.ownerText?.runs?.[0]?.text ?? vr.shortBylineText?.runs?.[0]?.text ?? ''
      const thumbnail = `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`
      const duration = vr.lengthText?.simpleText ?? ''
      videos.push({ id: vr.videoId, title, channel, thumbnail, duration })
      if (videos.length >= max) break
    }
  } catch {}
  return videos
}

const gospelCache = new Map<string, { at: number; videos: YouTubeVideo[] }>()
const GOSPEL_TTL_MS = 15 * 60 * 1000

ipcMain.handle('gospel:search', async (_e: any, query?: string) => {
  const q = (typeof query === 'string' && query.trim())
    ? query.trim()
    : GOSPEL_QUERIES[Math.floor(Math.random() * GOSPEL_QUERIES.length)]
  const cached = gospelCache.get(q)
  if (cached && Date.now() - cached.at < GOSPEL_TTL_MS) {
    return { ok: true, query: q, videos: cached.videos, cached: true }
  }
  try {
    const { status, body } = await httpGet(searchUrl(q), 12000)
    if (status !== 200) return { ok: false, query: q, videos: [], error: `HTTP ${status}` }
    const videos = parseSearchResults(body, 40)
    if (!videos.length) return { ok: false, query: q, videos: [], error: 'no-results' }
    gospelCache.set(q, { at: Date.now(), videos })
    return { ok: true, query: q, videos, cached: false }
  } catch (e: any) {
    return { ok: false, query: q, videos: [], error: e?.message || 'network' }
  }
})

// ── AI Chat IPC ───────────────────────────────────────────────────────────
function postJson(url: string, body: any, headers: Record<string, string>, timeoutMs = 30000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const data = JSON.stringify(body)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = (mod as any).request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res: any) => {
      let out = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { out += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 200, body: out }))
    })
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('AI request timeout')) })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

ipcMain.handle('ai:chat', async (_e: any, messages: any[], _model?: string, _opts?: any) => {
  const settings = readSettings()

  // Try Ollama first
  if (settings.ollamaBase) {
    try {
      const payload = {
        model: 'llama3.2:3b',
        messages,
        stream: false,
        options: { num_predict: 1200 },
      }
      const { status, body } = await postJson(
        `${settings.ollamaBase}/api/chat`,
        payload,
        {},
        25000
      )
      if (status === 200) {
        const data = JSON.parse(body)
        const content = data?.message?.content || data?.response || ''
        if (content) return { ok: true, provider: 'ollama', model: payload.model, content }
      }
    } catch {}
  }

  // Fall back to OpenRouter
  if (settings.openRouterKey) {
    try {
      const { status, body } = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: settings.openRouterModel, messages, max_tokens: 1200 },
        {
          Authorization: `Bearer ${settings.openRouterKey}`,
          'HTTP-Referer': 'https://bible.app',
          'X-Title': 'Bible App',
        },
        30000
      )
      if (status === 200) {
        const data = JSON.parse(body)
        const content = data?.choices?.[0]?.message?.content || ''
        if (content) return { ok: true, provider: 'openrouter', model: settings.openRouterModel, content }
      }
    } catch {}
  }

  return {
    ok: false,
    provider: 'none' as const,
    model: '',
    content: "The AI companion isn't available. Open Settings to configure Ollama (local) or add an OpenRouter API key.",
  }
})

ipcMain.handle('ai:models', async () => {
  const settings = readSettings()
  const models: { id: string; name: string; provider: string }[] = []

  if (settings.ollamaBase) {
    try {
      const { status, body } = await httpGet(`${settings.ollamaBase}/api/tags`, 5000)
      if (status === 200) {
        const data = JSON.parse(body)
        for (const m of (data?.models ?? [])) {
          models.push({ id: m.name, name: m.name, provider: 'ollama' })
        }
      }
    } catch {}
  }

  return { models }
})

// ── Window creation ───────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#17182B',
    titleBarStyle: 'hiddenInset',
    frame: false,
    icon: path.join(__dirname, '../../resources/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximizeChange', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizeChange', false))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ── Window control IPC (for frameless window) ─────────────────────────────
ipcMain.on('window:minimize',         () => mainWindow?.minimize())
ipcMain.on('window:maximize',         () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close',            () => mainWindow?.close())
ipcMain.handle('window:isMaximized',  () => mainWindow?.isMaximized() ?? false)

// ── Auto updater ─────────────────────────────────────────────────────────
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('updater:update-available')
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('updater:update-downloaded')
  })
  autoUpdater.on('error', (err) => {
    console.error('[bible-app] updater error:', err)
  })

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }
}

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall()
})

// ── App lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  ensureDir()
  createWindow()
  setupAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
