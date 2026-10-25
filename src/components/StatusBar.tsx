import { Check, Settings, X } from 'lucide-react'
import { modKey } from '../core/keyboard'
import { toolTitle } from '../core/i18n'
import { useI18n } from '../core/useI18n'
import { selectActiveDoc, selectActiveTab, useAppStore } from '../store/appStore'

export function StatusBar() {
  const tab = useAppStore(selectActiveTab)
  const doc = useAppStore(selectActiveDoc)
  const summary = useAppStore((state) => state.summary)
  const cursor = useAppStore((state) => state.cursor)
  const isJson = tab?.tool === 'json' && doc
  const hasText = Boolean(doc?.text.trim())
  const error = isJson && summary && !summary.valid && hasText ? summary.issue : null
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const { language, t } = useI18n()

  return (
    <footer className="statusbar">
      {tab?.tool === 'welcome' ? (
        <span className="seg">{t('status.ready')}</span>
      ) : isJson ? (
        <>
          <span className="seg">{t('status.lineCol', { line: cursor.line, col: cursor.col })}</span>
          <span className="seg">UTF-8</span>
          <span className="seg">JSON</span>
          {doc?.dirty ? (
            <span className="seg">
              <span className="dot" />
              {t('status.unsaved')}
            </span>
          ) : null}
        </>
      ) : (
        <span className="seg">
          {tab && (tab.tool as string) !== 'welcome'
            ? toolTitle(tab.tool, language)
            : tab?.title ?? t('status.ready')}
        </span>
      )}

      <div className="right">
        {isJson && summary && hasText ? (
          error ? (
            <span
              className="seg error"
              title={t('status.errorAt', { line: error.line, column: error.column, message: error.message })}
            >
              <X size={12} strokeWidth={2} />
              {error.line
                ? t('status.errorLine', { line: error.line })
                : t('status.syntaxError')}
            </span>
          ) : (
            <span className="seg">
              <Check size={12} strokeWidth={2} color="#16a34a" />
              {t('status.validJson')}
            </span>
          )
        ) : null}
        <button
          className="statusbar-settings"
          onClick={() => setSettingsOpen(true)}
          title={`${t('status.settings')}（${modKey(',')}）`}
          aria-label={t('status.settings')}
        >
          <Settings size={12} strokeWidth={1.8} />
        </button>
        <span className="seg">{modKey('K')} {t('status.commandPalette')}</span>
        <span className="seg">v0.1.0</span>
      </div>
    </footer>
  )
}
