import React, { createContext, lazy, Suspense, useContext, useState } from 'react'
import './styles/globals.css'
import TitleBar from './components/TitleBar'

type Page = 'bible' | 'study'

interface BibleAppNav {
  page: Page
  goToBible: () => void
  goToStudy: () => void
}

const BibleAppNavContext = createContext<BibleAppNav>({
  page: 'bible',
  goToBible: () => {},
  goToStudy: () => {},
})

export function useBibleAppNav(): BibleAppNav {
  return useContext(BibleAppNavContext)
}

const BiblePage = lazy(() => import('./components/pages/BiblePage'))
const BibleStudyPage = lazy(() => import('./components/pages/BibleStudyPage'))

export default function App() {
  const [page, setPage] = useState<Page>('bible')

  const nav: BibleAppNav = {
    page,
    goToBible: () => setPage('bible'),
    goToStudy: () => setPage('study'),
  }

  return (
    <BibleAppNavContext.Provider value={nav}>
      <div className="h-screen w-screen overflow-hidden bg-aihub-bg text-aihub-text">
        <TitleBar />
        {/* 32px top padding keeps content below the titlebar drag region */}
        <div style={{ paddingTop: 32, height: '100%', boxSizing: 'border-box' }}>
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-aihub-accent border-t-transparent" />
            </div>
          }>
            {page === 'bible' && <BiblePage />}
            {page === 'study' && <BibleStudyPage />}
          </Suspense>
        </div>
      </div>
    </BibleAppNavContext.Provider>
  )
}
