import { Check, X } from 'lucide-react'
import { modKey } from '../core/keyboard'
import { selectActiveDoc, selectActiveTab, useAppStore } from '../store/appStore'

export function StatusBar() {
  const tab = useAppStore(selectActiveTab)
  const doc = useAppStore(selectActiveDoc)
  const summary = useAppStore((state) => state.summary)
  const cursor = useAppStore((state) => state.cursor)
  const mode = tab?.workspace?.mode ?? 'plain'
  const panelCount = tab?.workspace?.panels.length ?? 0
  const isJson = mode === 'json' && doc
  const hasText = Boolean(doc?.text.trim())
  const error = isJson && summary && !summary.valid && hasText ? summary.issue : null

  return (
    <footer className="statusbar tiling-statusbar">
      <span className="seg status-mode">{mode === 'json' ? 'JSON' : 'PLAIN'}</span>
      {panelCount ? <span className="seg">{panelCount} 个面板</span> : null}
      <span className="seg">
        Ln {cursor.line}, Col {cursor.col}
      </span>
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
        <span className="seg">{modKey('F')} 搜索</span>
        <span className="seg">{modKey('⇧P')} 命令</span>
        <span className="seg">v0.1.0</span>
      </div>
    </footer>
  )
}
