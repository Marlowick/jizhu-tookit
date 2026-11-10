import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { TOOL_LABEL } from '../core/tools'
import { APP_VERSION } from '../core/version'
import type { WorkspaceMode } from '../core/types'
import { selectActiveDoc, selectActiveTab, useAppStore } from '../store/appStore'

const MODE_LABEL: Record<WorkspaceMode, string> = {
  plain: '普通文本',
  json: 'JSON',
  calc: 'Calc',
}

export function StatusBar() {
  const tab = useAppStore(selectActiveTab)
  const doc = useAppStore(selectActiveDoc)
  const summary = useAppStore((state) => state.summary)
  const cursor = useAppStore((state) => state.cursor)
  const selectionText = useAppStore((state) => state.selectionText)
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode)
  const [languageOpen, setLanguageOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const mode = tab?.workspace?.mode ?? 'plain'
  const panelCount = tab?.workspace?.panels.length ?? 0
  const sideTool = tab?.workspace?.sideTool
  const isJson = mode === 'json' && doc
  const hasText = Boolean(doc?.text.trim())
  const error = isJson && summary && !summary.valid && hasText ? summary.issue : null
  const charCount = doc?.text.length ?? 0
  const lineCount = doc?.text ? doc.text.split(/\r?\n/).length : 0

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

  return (
    <footer className="statusbar tiling-statusbar">
      <div className="status-left">
        <div className="status-language" ref={menuRef}>
          <button
            className={`seg status-mode ${mode === 'plain' ? 'is-plain' : 'is-recognized'}`}
            onClick={() => setLanguageOpen((open) => !open)}
            aria-haspopup="listbox"
            aria-expanded={languageOpen}
            title="选择编辑器语言"
          >
            <span className="status-mode-dot" />
            {MODE_LABEL[mode]}
            <ChevronDown size={8} strokeWidth={2} />
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
        <span className="seg status-tool">
          {panelCount ? `${panelCount} 个面板` : sideTool ? `工具：${TOOL_LABEL[sideTool]}` : '未打开工具'}
        </span>
      </div>

      <div className="status-center">
        <span className="seg status-position">行 {cursor.line}，列 {cursor.col}</span>
        <span className="seg">选区 {selectionText.length}</span>
        <span className="seg">{charCount} 字符{lineCount ? `，${lineCount} 行` : ''}</span>
      </div>

      <div className="right">
        {isJson && hasText ? (
          error ? (
            <span className="seg error" title={error.message}>
              <X size={10} strokeWidth={2} />
              语法错误{error.line ? ` · 行 ${error.line}` : ''}
            </span>
          ) : (
            <span className="seg status-valid">
              <Check size={10} strokeWidth={2} />
              有效 JSON
            </span>
          )
        ) : (
          <span className="seg status-idle"><span className="status-mode-dot" />空闲</span>
        )}
        <span className="seg status-version">v{APP_VERSION}</span>
      </div>
    </footer>
  )
}
