import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { installBrowserPlatform } from './platform'
import App from '../src/renderer/src/App'
import './web.css'

installBrowserPlatform()

function WebApp() {
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [model, setModel] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    window.electronAPI.settings.get().then(s => { setEnabled(!!s.aiEnabled); setModel(s.ollamaModel || '') }).catch(() => {})
    const online = () => setOffline(!navigator.onLine)
    const failure = () => setError('Your latest changes could not be saved. Browser storage may be full or blocked. Export a backup before closing this page.')
    window.addEventListener('online', online); window.addEventListener('offline', online)
    window.addEventListener('bible-web-save-error', failure)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then(async registration => {
        const markReady = () => setReady(true)
        if (registration.active) markReady()
        registration.installing?.addEventListener('statechange', () => {
          if (registration.installing?.state === 'activated' || registration.active) markReady()
        })
        await navigator.serviceWorker.ready
        markReady()
      }).catch(() => setMessage('Offline download did not finish. Keep an internet connection and reload to retry.'))
    }
    return () => {
      window.removeEventListener('online', online); window.removeEventListener('offline', online)
      window.removeEventListener('bible-web-save-error', failure)
    }
  }, [])
  return <div className="web-shell">
    <header className="web-bar">
      <span><strong>Bible</strong><span className="web-subtitle"> · Read. Study. Remember.</span></span>
      <div className="web-bar-actions"><span role="status">{offline ? 'Offline' : ready ? 'Ready offline' : 'Web edition'}</span><button onClick={() => setOpen(true)}>Web settings</button></div>
    </header>
    {error && <div className="web-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
    <main className="web-content"><App /></main>
    {open && <div className="web-modal-backdrop" onClick={() => setOpen(false)}>
      <section className="web-modal" role="dialog" aria-modal="true" aria-labelledby="web-settings-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
        <div className="web-modal-title"><h2 id="web-settings-title">Your Bible on the web</h2><button autoFocus aria-label="Close settings" onClick={() => setOpen(false)}>×</button></div>
        <p>Verses, notes, and study progress are saved in this browser. Export a backup from Saved verses to move your study to another browser. Clearing site data removes your saved study.</p>
        <h3>Read aloud</h3><p>Listen uses the voices available in your browser. Voice availability and offline playback depend on your device.</p>
        <h3>Local AI companion</h3><p>Optional: connect to Ollama running on this computer. Allow this website’s origin in Ollama’s OLLAMA_ORIGINS setting, install a chat model, and allow local network access if your browser requests it. Some browsers block local AI from an HTTPS website.</p>
        <label className="web-checkbox"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable local AI</label>
        <label>Model name (leave blank to use an installed model)<input value={model} onChange={e => setModel(e.target.value)} placeholder="llama3.2" /></label>
        <button className="web-primary" onClick={async () => {
          try {
            await window.electronAPI.settings.set({ aiEnabled: enabled, ollamaModel: model.trim() })
            if (enabled) {
              setMessage('Checking Ollama…')
              const models = await window.electronAPI.ai.models()
              setMessage(models.length ? `Connected · ${models.length} chat model(s) available.` : 'Ollama is running. Install a chat model to continue.')
            } else setMessage('Saved. Local AI is disabled.')
          } catch { setMessage('Could not connect. Start Ollama on localhost:11434 and check its allowed origins and browser permissions.') }
        }}>Save settings{enabled ? ' & test AI' : ''}</button>
        <p role="status">{message}</p>
        <p className="web-footnote">Reading and guided study work without AI. {ready ? 'The app and bundled Scripture are downloaded for offline reading.' : 'Offline reading becomes available after the initial download completes.'}</p>
      </section>
    </div>}
  </div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<WebApp />)
