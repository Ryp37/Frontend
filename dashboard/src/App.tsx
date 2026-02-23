import { useState } from 'react'
import { Sidebar }       from './components/Sidebar'
import { Header }        from './components/Header'
import { DashboardPage } from './pages/DashboardPage'
import { CallsPage }     from './pages/CallsPage'
import { WhitelistPage } from './pages/WhitelistPage'
import { GreylistPage }  from './pages/GreylistPage'
import { SettingsPage }  from './pages/SettingsPage'

export type Page = 'dashboard' | 'calls' | 'whitelist' | 'greylist' | 'settings'

export function App() {
  const [page,      setPage]      = useState<Page>('dashboard')
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar
        page={page}
        onNavigate={setPage}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          page={page}
          onToggleSidebar={() => setCollapsed(c => !c)}
        />

        <main className="flex-1 overflow-y-auto">
          {page === 'dashboard' && <DashboardPage />}
          {page === 'calls'     && <CallsPage />}
          {page === 'whitelist' && <WhitelistPage />}
          {page === 'greylist'  && <GreylistPage />}
          {page === 'settings'  && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}
