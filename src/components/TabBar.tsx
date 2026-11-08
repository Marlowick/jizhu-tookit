import { useState } from 'react'
import { Braces, Calculator, FileText, GitBranch, Plus, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useI18n } from '../core/useI18n'
import type { Doc, Tab } from '../core/types'

const TITLE_LENGTH = 10

// 取文档前 10 个字符作为标题，压缩所有空白（含换行）为单个空格
function contentTitle(doc: Doc | undefined): string {
  if (!doc) return ''
  const collapsed = doc.text.replace(/\s+/g, ' ').trim()
  return collapsed ? collapsed.slice(0, TITLE_LENGTH) : ''
}

function tabLabel(tab: Tab, docs: Record<string, Doc>): string {
  if (tab.docId) {
    const doc = docs[tab.docId]
    const content = contentTitle(doc)
    if (content) return content
    if (doc) return doc.title
  }
  return tab.title
}

function TabModeIcon({ tab }: { tab: Tab }) {
  const mode = tab.workspace?.mode ?? 'plain'
  if (tab.workspace?.sideTool === 'mermaid') return <GitBranch className="tab-mode-icon" size={12} strokeWidth={1.8} />
  if (mode === 'json') return <Braces className="tab-mode-icon" size={12} strokeWidth={1.8} />
  if (mode === 'calc') return <Calculator className="tab-mode-icon" size={12} strokeWidth={1.8} />
  return <FileText className="tab-mode-icon" size={12} strokeWidth={1.8} />
}

interface TabBarProps {
  onNewTab: () => void
}

export function TabBar({ onNewTab }: TabBarProps) {
  const tabs = useAppStore((state) => state.tabs)
  const docs = useAppStore((state) => state.docs)
  const activeTabId = useAppStore((state) => state.activeTabId)
  const activate = useAppStore((state) => state.activate)
  const closeTab = useAppStore((state) => state.closeTab)
  const { t } = useI18n()
  const [confirming, setConfirming] = useState<Tab | null>(null)

  // 有内容的标签关闭前需要确认；空标签直接关闭
  const requestClose = (tab: Tab) => {
    const doc = tab.docId ? docs[tab.docId] : undefined
    if (doc && doc.text.trim()) {
      setConfirming(tab)
      return
    }
    closeTab(tab.id)
  }

  const density = tabs.length <= 6 ? '' : tabs.length <= 10 ? 'tabs-dense' : 'tabs-tight'

  return (
    <>
      <nav className={`tabbar tiling-tabbar ${density}`} aria-label="工作区标签" data-tauri-drag-region>
        <button className="tab-new" onClick={onNewTab} title={t('tab.new')} aria-label={t('tab.new')}>
          <Plus size={12} strokeWidth={1.8} />
        </button>
        {tabs.map((tab, index) => {
          const label = tabLabel(tab, docs)
          const dirty = Boolean(tab.docId && docs[tab.docId]?.dirty)
          return (
            <div
              key={tab.id}
              className={`tab tiling-tab ${tab.id === activeTabId ? 'active' : ''}`}
              onClick={() => activate(tab.id)}
              onAuxClick={(event) => {
                if (event.button === 1) requestClose(tab)
              }}
              role="tab"
              aria-selected={tab.id === activeTabId}
              tabIndex={-1}
              title={`${index + 1} · ${label}`}
            >
              <TabModeIcon tab={tab} />
              <span className="tab-label">{label}</span>
              {dirty ? <span className="tab-dirty-dot" aria-label="未保存" /> : (
                <button
                  className="tab-close"
                  aria-label={t('tab.close')}
                  title={t('tab.close')}
                  onClick={(event) => {
                    event.stopPropagation()
                    requestClose(tab)
                  }}
                >
                  <X size={9} strokeWidth={2} />
                </button>
              )}
            </div>
          )
        })}
      </nav>

      {confirming ? (
        <div
          className="confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirming(null)
          }}
        >
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('tab.confirm.title')}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              setConfirming(null)
            }}
          >
            <strong>{t('tab.confirm.title')}</strong>
            <p>{t('tab.confirm.message')}</p>
            <div className="confirm-actions">
              <button className="btn ghost" onClick={() => setConfirming(null)} autoFocus>
                {t('common.cancel')}
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  closeTab(confirming.id)
                  setConfirming(null)
                }}
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
