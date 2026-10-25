import { useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { TOOLS } from '../core/tools'
import { toolDescription, toolTitle } from '../core/i18n'
import { useI18n } from '../core/useI18n'
import { useAppStore } from '../store/appStore'

interface NewTabPickerProps {
  onClose: () => void
}

export function NewTabPicker({ onClose }: NewTabPickerProps) {
  const openTool = useAppStore((state) => state.openTool)
  const { language, t } = useI18n()
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="newtab-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="newtab-dialog" role="dialog" aria-modal="true" aria-label={t('newtab.title')}>
        <header className="newtab-head">
          <Plus size={15} strokeWidth={1.8} color="#2563eb" />
          <strong>{t('newtab.title')}</strong>
          <span>{t('newtab.subtitle')}</span>
          <button className="btn ghost" onClick={onClose} aria-label={t('common.close')}>
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <div className="newtab-grid">
          {TOOLS.map((tool, index) => {
            const Icon = tool.icon
            return (
              <button
                key={tool.id}
                ref={index === 0 ? firstRef : undefined}
                className="newtab-item"
                onClick={() => {
                  openTool(tool.id)
                  onClose()
                }}
              >
                <span className="newtab-icon">
                  <Icon size={17} strokeWidth={1.6} />
                </span>
                <span className="newtab-copy">
                  <strong>{toolTitle(tool.id, language)}</strong>
                  <span>{toolDescription(tool.id, language)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
