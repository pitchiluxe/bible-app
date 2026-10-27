import React, { useEffect, useState } from 'react'

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.electronAPI.window.isMaximized().then(setMaximized)
    const unsub = window.electronAPI.window.onMaximizeChange(setMaximized)
    return unsub
  }, [])

  return (
    <div
      className="drag-region"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 32,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        // Transparent so the page content shows through
        background: 'transparent',
      }}
    >
      {/* Window control buttons — no-drag so clicks register */}
      <div className="no-drag" style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <WinBtn
          title="Minimize"
          onClick={() => window.electronAPI.window.minimize()}
          hoverColor="rgba(255,255,255,0.12)"
        >
          {/* Minimize line */}
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
            <rect width="10" height="1" fill="currentColor" />
          </svg>
        </WinBtn>

        <WinBtn
          title={maximized ? 'Restore' : 'Maximize'}
          onClick={() => window.electronAPI.window.maximize()}
          hoverColor="rgba(255,255,255,0.12)"
        >
          {maximized ? (
            /* Restore icon — two overlapping squares */
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="2" y="0" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="0" y="2" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          ) : (
            /* Maximize icon — single square */
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          )}
        </WinBtn>

        <WinBtn
          title="Close"
          onClick={() => window.electronAPI.window.close()}
          hoverColor="rgba(196,43,28,0.85)"
          style={{ width: 46 }}
        >
          {/* X icon */}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="10" y1="0" x2="0"  y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({
  children,
  onClick,
  title,
  hoverColor,
  style,
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  hoverColor: string
  style?: React.CSSProperties
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 40,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hover ? hoverColor : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'rgba(255,255,255,0.75)',
        transition: 'background 0.12s',
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  )
}
