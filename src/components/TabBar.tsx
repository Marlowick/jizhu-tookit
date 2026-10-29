import { Plus, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useI18n } from '../core/useI18n'

interface TabBarProps {
  onNewTab: () => void
}

export function TabBar({ onNewTab }: TabBarProps) {
  const tabs = useAppStore((state) => state.tabs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activate = useAppStore((state) => state.activate)
  const closeTab = useAppStore((state) => state.closeTab)
  const { t } = useI18n()

  return (
    <nav className="tabbar tiling-tabbar" aria-label="工作区标签" data-tauri-drag-region>
      {tabs.map((tab, index) => {
        return (
          <div
            key={tab.id}
            className={`tab tiling-tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => activate(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) closeTab(tab.id)
            }}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={-1}
            title={`工作区 ${index + 1}`}
          >
            <span className="tab-label">{index + 1}</span>
            <button
              className="tab-close"
              aria-label={t('tab.close')}
              title={t('tab.close')}
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X size={11} strokeWidth={2} />
            </button>
          </div>
        )
      })}
      <button className="tab-new" onClick={onNewTab} title={t('tab.new')} aria-label={t('tab.new')}>
        <Plus size={15} strokeWidth={1.8} />
      </button>
    </nav>
  )
}
