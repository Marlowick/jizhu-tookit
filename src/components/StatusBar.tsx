import { useEffect, useRef, useState } from 'react'
import { Check, ChevronUp, X } from 'lucide-react'
import { requestEditorSearch } from '../core/editorActions'
import { modKey } from '../core/keyboard'
import { APP_VERSION } from '../core/version'
import type { WorkspaceMode } from '../core/types'
import { selectActiveDoc, selectActiveTab, useAppStore } from '../store/appStore'

export function StatusBar() {
  const tab = useAppStore(selectActiveTab)
  const doc = useAppStore(selectActiveDoc)
  const summary = useAppStore((state) => state.summary)
  const cursor = useAppStore((state) => state.cursor)
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const showToast = useAppStore((state) => state.showToast)
  const [languageOpen, setLanguageOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mode = tab?.workspace?.mode ?? 'plain'
  const panelCount = tab?.workspace?.panels.length ?? 0
  const isJson = mode === 'json' && doc
  const hasText = Boolean(doc?.text.trim())
  const error = isJson && summary && !summary.valid && hasText ? summary.issue : null

  useEffect(() => {
    if (!languageOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setLanguageOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setLanguageOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [languageOpen])

  const chooseMode = (next: WorkspaceMode) => {
    if (tab) setWorkspaceMode(tab.id, next)
    setLanguageOpen(false)
  }

  const openSearch = () => {
    if (panelCount > 0) {
      showToast('先关闭普通面板，再在编辑器中搜索')
      return
    }
    requestEditorSearch()
  }

  return (
    <footer className="statusbar tiling-statusbar">
      <div className="status-language" ref={menuRef}>
        <button
          className="seg status-mode"
          onClick={() => setLanguageOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={languageOpen}
          title="选择编辑器语言"
        >
          {mode.toUpperCase()}
          <ChevronUp size={10} strokeWidth={2} />
        </button>
        {languageOpen ? (
          <div className="status-language-menu" role="listbox" aria-label="编辑器语言">
            {([
              { value: 'plain' as WorkspaceMode, label: 'PLAIN', hint: '纯文本编辑' },
              { value: 'json' as WorkspaceMode, label: 'JSON', hint: '树形 JSON 编辑' },
              { value: 'calc' as WorkspaceMode, label: 'CALC', hint: '四则运算 / 变量' },
            ]).map(({ value, label, hint }) => (
              <button
                key={value}
                className={mode === value ? 'active' : ''}
                role="option"
                aria-selected={mode === value}
                onClick={() => chooseMode(value)}
              >
                <span>{label}</span>
                <span>{hint}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {panelCount ? <span className="seg">{panelCount} 个面板</span> : null}
      <span className="seg">Ln {cursor.line}, Col {cursor.col}</span>
      <span className="seg">UTF-8</span>
      <span className="seg">LF</span>
      {isJson && hasText ? (
        error ? (
          <span className="seg error" title={error.message}>
            <X size={11} strokeWidth={2} />
            语法错误{error.line ? ` · 行 ${error.line}` : ''}
          </span>
        ) : (
          <span className="seg">
            <Check size={11} strokeWidth={2} color="var(--success)" />
            有效 JSON
          </span>
        )
      ) : null}
      <div className="right">
        <button className="seg status-action" onClick={openSearch} title="打开编辑器查找">
          {modKey('F')} 搜索
        </button>
        <button className="seg status-action" onClick={() => setPaletteOpen(true)} title="打开命令面板">
          {modKey('⇧P')} 命令
        </button>
        <span className="seg">v{APP_VERSION}</span>
      </div>
    </footer>
  )
}
