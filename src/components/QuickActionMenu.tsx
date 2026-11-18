import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, CornerDownLeft, FileJson2, FileText, FlaskConical, Minimize2, SlidersHorizontal } from 'lucide-react'
import { modKey } from '../core/keyboard'
import type { WorkspaceMode } from '../core/types'

interface QuickActionMenuProps {
  mode: WorkspaceMode
  formatDisabledReason?: string
  onFormat: () => void
  onMode: (mode: WorkspaceMode) => void
  onClose: () => void
}

type MenuPage = 'root' | 'mode'

const MODE_OPTIONS: Array<{ key: string; mode: WorkspaceMode; label: string; hint: string; icon: typeof FileText }> = [
  { key: 'j', mode: 'json', label: 'JSON', hint: 'JSON 编辑器', icon: FileJson2 },
  { key: 'p', mode: 'plain', label: 'Plain', hint: '普通文本编辑', icon: FileText },
  { key: 'c', mode: 'calc', label: '计算模式', hint: 'Calc 表达式', icon: FlaskConical },
]

export function QuickActionMenu({ mode, formatDisabledReason, onFormat, onMode, onClose }: QuickActionMenuProps) {
  const [page, setPage] = useState<MenuPage>('root')
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    panelRef.current?.focus()
  }, [])

  const runFormat = () => {
    if (formatDisabledReason) return
    onFormat()
  }

  const chooseMode = (next: WorkspaceMode) => {
    onMode(next)
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const key = event.key.toLowerCase()

    if (page === 'root') {
      if (key === 'f') {
        event.preventDefault()
        runFormat()
        return
      }
      if (key === 'm') {
        event.preventDefault()
        setPage('mode')
        return
      }
      return
    }

    const option = MODE_OPTIONS.find((item) => item.key === key)
    if (option) {
      event.preventDefault()
      chooseMode(option.mode)
    }
  }

  return (
    <div
      className="quick-actions-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="quick-actions-menu"
        role="dialog"
        aria-modal="true"
        aria-label="快捷命令"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="quick-actions-head">
          <span className="quick-actions-leader">{modKey('L')}</span>
          <div>
            <strong>{page === 'root' ? '快捷命令' : '切换模式'}</strong>
            <span>{page === 'root' ? '按首字母执行' : '选择编辑器模式'}</span>
          </div>
          <kbd>Esc</kbd>
        </header>

        {page === 'root' ? (
          <div className="quick-actions-list">
            <button
              className={`quick-actions-option ${formatDisabledReason ? 'disabled' : ''}`}
              onClick={runFormat}
              aria-disabled={Boolean(formatDisabledReason)}
              title={formatDisabledReason || '格式化当前 JSON'}
            >
              <kbd className="quick-actions-key">f</kbd>
              <span className="quick-actions-icon"><Minimize2 size={14} strokeWidth={1.8} /></span>
              <span className="quick-actions-copy">
                <strong>格式化 JSON</strong>
                <small>{formatDisabledReason || '按当前缩进设置格式化文档'}</small>
              </span>
              <span className="quick-actions-action">执行 <CornerDownLeft size={11} strokeWidth={1.8} /></span>
            </button>
            <button className="quick-actions-option" onClick={() => setPage('mode')}>
              <kbd className="quick-actions-key">m</kbd>
              <span className="quick-actions-icon"><SlidersHorizontal size={14} strokeWidth={1.8} /></span>
              <span className="quick-actions-copy">
                <strong>切换模式</strong>
                <small>JSON / Plain / 计算模式</small>
              </span>
              <span className="quick-actions-action">继续 <CornerDownLeft size={11} strokeWidth={1.8} /></span>
            </button>
          </div>
        ) : (
          <div className="quick-actions-list">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon
              const current = mode === option.mode
              return (
                <button
                  key={option.mode}
                  className={`quick-actions-option ${current ? 'current' : ''}`}
                  onClick={() => chooseMode(option.mode)}
                >
                  <kbd className="quick-actions-key">{option.key}</kbd>
                  <span className="quick-actions-icon"><Icon size={14} strokeWidth={1.8} /></span>
                  <span className="quick-actions-copy">
                    <strong>{option.label}</strong>
                    <small>{option.hint}</small>
                  </span>
                  {current ? <Check className="quick-actions-current" size={14} strokeWidth={2} /> : null}
                </button>
              )
            })}
          </div>
        )}

        <footer className="quick-actions-foot">
          <span>{page === 'root' ? 'f 格式化 · m 切换模式' : 'j JSON · p Plain · c 计算模式'}</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </footer>
      </div>
    </div>
  )
}
