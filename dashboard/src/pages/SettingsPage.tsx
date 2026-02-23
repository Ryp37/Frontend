import { SettingsPanel } from '../components/SettingsPanel'

export function SettingsPage() {
  return (
    <div className="page-container">
      <div className="flex items-center justify-between">
        <h2 className="page-label">Configuration</h2>
        <span className="text-[11px] text-ink-muted">Environment variable reference</span>
      </div>

      <SettingsPanel />
    </div>
  )
}
