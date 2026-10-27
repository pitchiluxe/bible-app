import React, { lazy, Suspense } from 'react'

const MarkdownRenderer = lazy(() => import('./MarkdownRenderer'))

interface Props {
  content: string
  onNavigate: (url: string) => void
  accent?: string
  streaming?: boolean
  renderLink?: (href: string, children: React.ReactNode) => React.ReactNode | null
}

export default function Markdown({ content, onNavigate, accent, streaming, renderLink }: Props) {
  if (!content) return null
  return (
    <Suspense
      fallback={
        <div className="aihub-md" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {content}
        </div>
      }
    >
      <MarkdownRenderer content={content} onNavigate={onNavigate} accent={accent} streaming={streaming} renderLink={renderLink} />
    </Suspense>
  )
}
