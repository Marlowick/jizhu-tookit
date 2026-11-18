import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Pencil } from 'lucide-react'
import { JsonEditor } from '../components/JsonEditor'
import { analyzeJson, copyText, errorMessage } from '../core/ipc'
import { jqPathAt } from '../core/jsonPath'
import { analysisPlan, docModeFor } from '../core/largeDoc'
import type { Analysis, Doc, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface JsonToolProps {
  tab: Tab
  doc: Doc
  highlights?: import('../core/types').EditorHighlights | null
}

export function JsonTool({ tab, doc, highlights }: JsonToolProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; pos: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPath, setMenuPath] = useState<string | null>(null)

  const setText = useAppStore((state) => state.setText)
  const setSummary = useAppStore((state) => state.setSummary)
  const setCursor = useAppStore((state) => state.setCursor)
  const setSelectionText = useAppStore((state) => state.setSelectionText)
  const wordWrap = useAppStore((state) => state.settings.wordWrap)
  const formatIndent = useAppStore((state) => state.settings.formatIndent)
  const showToast = useAppStore((state) => state.showToast)

  const mode = docModeFor(doc.text.length)
  const { debounceMs, maxNodes } = analysisPlan(mode)

  useEffect(() => {
    if (mode === 'huge') {
      setAnalysis(null)
      setSummary(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const result = await analyzeJson(doc.text, maxNodes)
      if (cancelled) return
      startTransition(() => {
        setAnalysis(result)
        setSummary({
          valid: result.valid,
          issue: result.issue,
          nodes: result.nodes.length,
          bytes: result.stats.bytes,
        })
      })
    }, debounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [doc.text, mode, debounceMs, maxNodes, setSummary])

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setMenu(null)
      }
    }
    const onScroll = () => setMenu(null)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [menu])

  const openContextMenu = (pos: number, clientX: number, clientY: number) => {
    const valid = analysis?.valid ? analysis : null
    setMenuPath(valid ? jqPathAt(valid, pos) : null)
    setMenu({
      pos,
      x: Math.min(clientX, window.innerWidth - 240),
      y: Math.min(clientY, window.innerHeight - 120),
    })
  }

  const copyJqPath = async () => {
    if (!menuPath) return
    try {
      await copyText(menuPath)
      showToast(`已复制 jq 路径：${menuPath}`)
      setMenu(null)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const hasText = useMemo(() => doc.text.trim().length > 0, [doc.text])
  const invalid = Boolean(analysis && !analysis.valid && hasText)
  const errorLine = invalid ? (analysis?.issue?.line ?? null) : null
  const lineCount = useMemo(() => (doc.text ? doc.text.split('\n').length : 0), [doc.text])

  return (
    <div className="json-tool">
      <section className="pane editor-pane json-editor-pane">
        <div className="pane-header">
          <Pencil size={12} strokeWidth={1.8} />
          <span>JSON 编辑</span>
          {invalid ? (
            <span
              className="warn"
              title={
                analysis?.issue
                  ? `第 ${analysis.issue.line} 行第 ${analysis.issue.column} 列：${analysis.issue.message}`
                  : '语法错误'
              }
            >
              <AlertTriangle size={12} strokeWidth={1.8} />
              语法错误
            </span>
          ) : mode !== 'normal' ? (
            <span
              className="warn"
              title={mode === 'huge' ? '超大文件已暂停实时分析' : '大文件分析已降频'}
            >
              <AlertTriangle size={12} strokeWidth={1.8} />
              {mode === 'huge' ? '超大文件 · 暂停实时分析' : '大文件模式'}
            </span>
          ) : null}
          <span className="right">{lineCount} 行 · UTF-8</span>
        </div>
        <JsonEditor
          wordWrap={wordWrap}
          indent={formatIndent}
          docId={doc.id}
          highlights={highlights}
          text={doc.text}
          errorLine={errorLine}
          reveal={null}
          onContextMenu={openContextMenu}
          onChange={(value) => setText(doc.id, value)}
          onCursor={setCursor}
          onSelection={setSelectionText}
        />
      </section>
      {menu ? (
        <div
          ref={menuRef}
          className="json-context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label="JSON 编辑操作"
        >
          <button
            className={`json-context-item ${menuPath ? '' : 'disabled'}`}
            role="menuitem"
            disabled={!menuPath}
            onClick={() => void copyJqPath()}
            title={menuPath ? `复制 ${menuPath}` : '当前光标处不是有效 JSON 节点'}
          >
            <span>复制 jq 路径</span>
            <kbd>{menuPath ?? '不可用'}</kbd>
          </button>
        </div>
      ) : null}
    </div>
  )
}
