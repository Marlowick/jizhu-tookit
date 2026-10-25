import { FileJson, Plus, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { toolMeta } from '../core/tools'
import { toolTitle } from '../core/i18n'
import { useI18n } from '../core/useI18n'

interface TabBarProps {
  onNewTab: () => void
}

export function TabBar({ onNewTab }: TabBarProps) {
  const tabs = useAppStore((state) => state.tabs)
  const docs = useAppStore((state) => state.docs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activate = useAppStore((state) => state.activate)
  const closeTab = useAppStore((state) => state.closeTab)
  const { language, t } = useI18n()

  return (
    <nav className="tabbar" aria-label={t('tab.welcome')} data-tauri-drag-region>
      {tabs.map((tab) => {
        const doc = tab.docId ? docs[tab.docId] : null
        const baseLabel = tab.tool === 'welcome' ? t('tab.welcome') : toolTitle(tab.tool, language)
        const label =
          tab.tool !== 'json' && tab.instance && tab.instance > 1
            ? `${baseLabel} ${tab.instance}`
            : baseLabel
        const Icon =
          tab.tool === 'welcome' ? null : tab.tool === 'json' ? FileJson : toolMeta(tab.tool).icon
        return (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => activate(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1 && tab.tool !== 'welcome') closeTab(tab.id)
            }}
            role="tab"
            aria-selected={tab.id === activeTabId}
            tabIndex={-1}
          >
            {Icon ? <Icon size={13} strokeWidth={1.6} color="#2563eb" /> : null}
            <span className="tab-label">
              {tab.tool === 'welcome' ? label : doc ? `${label} · ${doc.title}` : label}
            </span>
            {doc?.dirty ? <span className="tab-dot" aria-label={t('status.unsaved')} /> : null}
            {tab.tool !== 'welcome' && (
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
            )}
          </div>
        )
      })}
      <button className="tab-new" onClick={onNewTab} title={t('tab.new')} aria-label={t('tab.new')}>
        <Plus size={15} strokeWidth={1.8} />
      </button>
    </nav>
  )
}
