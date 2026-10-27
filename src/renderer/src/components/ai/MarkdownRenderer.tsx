import React, { useMemo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, ExternalLink } from 'lucide-react'

interface Props {
  content: string
  onNavigate: (url: string) => void
  accent?: string
  streaming?: boolean
  renderLink?: (href: string, children: React.ReactNode) => React.ReactNode | null
}

export default function MarkdownRenderer({ content, onNavigate, accent, renderLink }: Props) {
  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => (href && renderLink?.(href, children)) ?? (
      <button
        onClick={() => href && onNavigate(href)}
        title={href}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'rgb(var(--ds-accent-soft))', textDecoration: 'underline',
          textUnderlineOffset: 2, fontSize: 'inherit', fontWeight: 500,
          display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'baseline',
          wordBreak: 'break-word', textAlign: 'left',
        }}
      >
        {children}
        <ExternalLink size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
      </button>
    ),
    table: ({ ...rest }) => (
      <div style={{ overflowX: 'auto' }}><table {...rest} /></div>
    ),
    code: (props: any) => {
      const { inline, className, children } = props
      const text = String(children ?? '').replace(/\n$/, '')
      const isBlock = inline === false || /language-/.test(className || '') || text.includes('\n')
      if (!isBlock) return <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontSize: '0.88em' }}>{text}</code>
      const lang = (className || '').replace('language-', '')
      return <CodeBlock text={text} lang={lang} />
    },
    pre: ({ children }) => <>{children}</>,
    input: ({ checked, ...rest }) => <input {...rest} type="checkbox" checked={!!checked} readOnly />,
  }), [onNavigate, renderLink])

  return (
    <div className="aihub-md" style={accent ? { ['--md-accent' as string]: accent } : undefined}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function CodeBlock({ text, lang }: { text: string; lang: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }).catch(() => {})
  }

  return (
    <div style={{
      margin: '10px 0', borderRadius: 10, overflow: 'hidden',
      border: '1px solid rgb(var(--ds-accent) / 0.15)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: 'rgba(255,255,255,0.04)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgb(var(--ds-text-3))', textTransform: 'lowercase' }}>
          {lang || 'code'}
        </span>
        <button onClick={copy} title="Copy code" style={{
          display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
          cursor: 'pointer', color: copied ? '#34d399' : 'rgb(var(--ds-text-4))', fontSize: 10,
          padding: '3px 6px', borderRadius: 6,
        }}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: '10px 12px', overflowX: 'auto',
        background: 'rgba(0,0,0,0.25)',
        fontSize: 11.5, lineHeight: 1.6,
        fontFamily: 'ui-monospace, "Cascadia Code", SFMono-Regular, Consolas, monospace',
        color: 'rgb(var(--ds-text-2))', userSelect: 'text',
      }}>
        <code>{text}</code>
      </pre>
    </div>
  )
}
