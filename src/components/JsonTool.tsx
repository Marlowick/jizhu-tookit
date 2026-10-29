import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, PanelLeftClose, PanelLeftOpen, Pencil } from 'lucide-react'
import { JsonEditor } from '../components/JsonEditor'
import { JsonTree } from '../components/JsonTree'
import { analyzeJson, copyText, errorMessage } from '../core/ipc'
import { analysisPlan, docModeFor, formatCharCount } from '../core/largeDoc'
import { ancestorNodes, nodeAtPosition } from '../core/tree'
import type { Analysis, Doc, Tab, TreeNode } from '../core/types'
import { useAppStore } from '../store/appStore'

interface JsonToolProps {
  tab: Tab
  doc: Doc
}

export function JsonTool({ tab, doc }: JsonToolProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [lastValid, setLastValid] = useState<Analysis | null>(null)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [reveal, setReveal] = useState<{ pos: number; seq: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const splitRef = useRef<HTMLDivElement>(null)
  const revealSeq = useRef(0)
  const lastActive = useRef<string | null>(null)
  const treeOpen = tab.treeOpen ?? true

  const setText = useAppStore((state) => state.setText)
  const setSummary = useAppStore((state) => state.setSummary)
  const setCursor = useAppStore((state) => state.setCursor)
  const setSelectionText = useAppStore((state) => state.setSelectionText)
  const cursor = useAppStore((state) => state.cursor)
  const splitRatio = useAppStore((state) => state.splitRatio)
  const setSplitRatio = useAppStore((state) => state.setSplitRatio)
  const toggleExpanded = useAppStore((state) => state.toggleExpanded)
  const setTreeOpen = useAppStore((state) => state.setTreeOpen)
  const expandPaths = useAppStore((state) => state.expandPaths)
  const showToast = useAppStore((state) => state.showToast)
  const wordWrap = useAppStore((state) => state.settings.wordWrap)
  const formatIndent = useAppStore((state) => state.settings.formatIndent)

  const mode = docModeFor(doc.text.length)
  const { debounceMs, maxNodes } = analysisPlan(mode)

  useEffect(() => {
    if (!tab.expanded.includes('')) toggleExpanded(tab.id, '')
    // 只在挂载时补齐根节点展开状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setActivePath(null)
    lastActive.current = null
  }, [doc.id])

  useEffect(() => {
    if (mode === 'huge') {
      setAnalysis(null)
      setLastValid(null)
      setSummary(null)
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const result = await analyzeJson(doc.text, maxNodes)
      if (cancelled) return
      setAnalysis(result)
      if (result.valid) setLastValid(result)
      setSummary({
        valid: result.valid,
        issue: result.issue,
        nodes: result.nodes.length,
        bytes: result.stats.bytes,
      })
    }, debounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [doc.text, mode, debounceMs, maxNodes, setSummary])

  const analyzeNow = async () => {
    setAnalyzing(true)
    try {
      const result = await analyzeJson(doc.text, maxNodes)
      setAnalysis(result)
      if (result.valid) setLastValid(result)
      setSummary({
        valid: result.valid,
        issue: result.issue,
        nodes: result.nodes.length,
        bytes: result.stats.bytes,
      })
    } catch (error) {
      showToast(errorMessage(error))
    } finally {
      setAnalyzing(false)
    }
  }

  const hasText = Boolean(doc.text.trim())
  const invalid = Boolean(analysis && !analysis.valid && hasText)
  const tree = lastValid ?? (analysis?.valid ? analysis : null)
  const errorLine = invalid ? (analysis?.issue?.line ?? null) : null
  const lineCount = doc.text ? doc.text.split('\n').length : 0

  // 编辑器光标 → 树：高亮最深包含节点，并展开祖先
  useEffect(() => {
    if (!analysis?.valid || tree?.root == null) return
    const node = nodeAtPosition(tree, cursor.pos)
    if (!node) return
    if (lastActive.current === node.path) return
    lastActive.current = node.path
    setActivePath(node.path)
    const ancestors = ancestorNodes(tree.nodes, node)
    if (ancestors.length > 0) expandPaths(tab.id, ancestors.map((item) => item.path))
  }, [analysis?.valid, tree, cursor.pos, tab.id, expandPaths])

  const selectFromTree = (node: TreeNode) => {
    lastActive.current = node.path
    setActivePath(node.path)
    if (node.end > node.start) {
      setReveal({ pos: node.start, seq: ++revealSeq.current })
    }
    if (node.children.length > 0) toggleExpanded(tab.id, node.path)
  }

  const locateFromTree = (node: TreeNode) => {
    lastActive.current = node.path
    setActivePath(node.path)
    if (node.end > node.start) {
      setReveal({ pos: node.start, seq: ++revealSeq.current })
    }
  }

  const copyFromTree = async (text: string, label: string) => {
    try {
      await copyText(text)
      const preview = text.length > 48 ? `${text.slice(0, 47)}…` : text
      showToast(`已复制${label}：${preview}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const startDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const rect = splitRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragging(true)
    const move = (moveEvent: PointerEvent) => {
      setSplitRatio((moveEvent.clientX - rect.left) / rect.width)
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="json-tool">
      <div className="split" ref={splitRef}>
        {treeOpen ? (
        <section className="pane tree-pane" style={{ width: `${splitRatio * 100}%`, flex: '0 0 auto', minWidth: 150 }}>
          <div className="pane-header">
            <span>树形预览</span>
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
                {lastValid ? '语法错误，展示上次有效解析' : '语法错误'}
              </span>
            ) : mode !== 'normal' ? (
              <span
                className="warn"
                title={
                  mode === 'huge'
                    ? '超大文件已暂停实时树形分析，可手动生成一次快照'
                    : `大文件模式：分析降频，树最多 ${maxNodes?.toLocaleString()} 个节点`
                }
              >
                <AlertTriangle size={12} strokeWidth={1.8} />
                {mode === 'huge' ? '超大文件 · 暂停实时分析' : `大文件模式 · 最多 ${maxNodes?.toLocaleString()} 节点`}
                {tree?.truncated ? ' · 已截断' : ''}
              </span>
            ) : (
              <span className="right">
                {tree
                  ? `${tree.stats.nodes} 个节点 · 深度 ${tree.stats.depth}${tree.truncated ? ' · 已截断' : ''}`
                  : ''}
              </span>
            )}
          </div>
          {mode === 'huge' && !analysis ? (
            <div className="tree-placeholder">
              <AlertTriangle size={18} strokeWidth={1.6} />
              <strong>超大文件</strong>
              <p>
                文档约 {formatCharCount(doc.text.length)}，已暂停实时树形分析，避免卡顿。
              </p>
              <button className="btn primary" onClick={() => void analyzeNow()} disabled={analyzing}>
                {analyzing ? '分析中…' : `分析一次（最多 ${maxNodes?.toLocaleString()} 节点）`}
              </button>
              <span>分析结果是快照；编辑后需要重新分析。</span>
            </div>
          ) : (
            <JsonTree
              analysis={tree}
              expanded={tab.expanded}
              activePath={activePath}
              onSelect={selectFromTree}
              onLocate={locateFromTree}
              onCopy={(text, label) => void copyFromTree(text, label)}
            />
          )}
        </section>
        ) : null}

        {treeOpen ? <div
          className={`resizer ${dragging ? 'dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整树与编辑器的宽度"
          onPointerDown={startDrag}
        /> : null}

        <section className="pane editor-pane" style={{ flex: '1 1 auto' }}>
          <div className="pane-header">
            <Pencil size={12} strokeWidth={1.8} />
            <span>文本编辑</span>
            <button
              className="btn ghost pane-icon"
              onClick={() => setTreeOpen(tab.id, !treeOpen)}
              title={treeOpen ? '隐藏树形区域' : '打开树形区域'}
              aria-label={treeOpen ? '隐藏树形区域' : '打开树形区域'}
            >
              {treeOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
            </button>
            <span className="right">{lineCount} 行 · UTF-8</span>
          </div>
          <JsonEditor
            wordWrap={wordWrap}
            indent={formatIndent}
            text={doc.text}
            errorLine={errorLine}
            reveal={reveal}
            onChange={(value) => setText(doc.id, value)}
            onCursor={setCursor}
            onSelection={setSelectionText}
          />
        </section>
      </div>
    </div>
  )
}
