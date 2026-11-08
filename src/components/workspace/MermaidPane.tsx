import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Copy, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { copyText, errorMessage } from '../../core/ipc'
import { MERMAID_EXAMPLES, type MermaidExample } from '../../core/mermaidExamples'
import { useAppStore } from '../../store/appStore'
import type { Doc, Tab } from '../../core/types'

interface MermaidPaneProps {
  tab: Tab
  doc: Doc
}

const MAX_SOURCE = 300_000
const ZOOM_MIN = 0.6
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.15

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function sanitizeSvg(svg: string): string {
  // Mermaid's strict security level already escapes HTML; strip any script
  // or inline event attribute as a second line of defence.
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+=(".*?"|'.*?'|[^\s>]+)/gi, '')
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const compact = message.replace(/\s+/g, ' ').trim()
  return compact.length > 700 ? `${compact.slice(0, 699)}…` : compact
}

function mermaidThemeVariables() {
  const dark = document.documentElement.dataset.theme === 'dark'
  const background = cssVar('--bg-surface', dark ? '#1d1f21' : '#ffffff')
  return {
    background,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif',
    primaryColor: cssVar('--bg-panel', background),
    primaryTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    primaryBorderColor: cssVar('--accent-border', '#5b7085'),
    lineColor: cssVar('--accent', '#81a2be'),
    secondaryColor: cssVar('--accent-soft', '#333d4a'),
    tertiaryColor: cssVar('--bg-subtle', background),
    secondaryTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    tertiaryTextColor: cssVar('--text-muted', '#c5c8c6'),
    textColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    mainBkg: cssVar('--bg-panel', background),
    secondBkg: cssVar('--bg-subtle', background),
    nodeBorder: cssVar('--accent-border', '#5b7085'),
    clusterBkg: cssVar('--bg-subtle', background),
    clusterBorder: cssVar('--border', '#3a3f47'),
    edgeLabelBackground: background,
    nodeTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    noteBkgColor: cssVar('--warning-soft', dark ? '#343024' : '#fff8e1'),
    noteTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    noteBorderColor: cssVar('--warning', '#f0c674'),
    actorBkg: cssVar('--bg-panel', background),
    actorBorder: cssVar('--accent-border', '#5b7085'),
    actorTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    signalColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    signalTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    activationBkgColor: cssVar('--accent-soft', '#333d4a'),
    activationBorderColor: cssVar('--accent', '#81a2be'),
    sequenceNumberColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    labelBoxBkgColor: cssVar('--bg-panel', background),
    labelBoxBorderColor: cssVar('--accent-border', '#5b7085'),
    labelTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    loopTextColor: cssVar('--text', dark ? '#ffffff' : '#0f1115'),
    altBackground: cssVar('--bg-subtle', background),
    errorBkgColor: cssVar('--danger-soft', '#3a2528'),
    errorTextColor: cssVar('--danger', '#d54e53'),
  }
}

export function MermaidPane({ tab, doc }: MermaidPaneProps) {
  const setText = useAppStore((state) => state.setText)
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode)
  const showToast = useAppStore((state) => state.showToast)
  const theme = useAppStore((state) => state.settings.theme)
  const [svg, setSvg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [exampleCategory, setExampleCategory] = useState<'全部' | '基础' | '真实场景'>('全部')
  const exampleGroups = useMemo(() => {
    const groups = new Map<string, typeof MERMAID_EXAMPLES>()
    for (const example of MERMAID_EXAMPLES) {
      const category = example.category ?? '基础'
      const list = groups.get(category) ?? []
      list.push(example)
      groups.set(category, list)
    }
    return [...groups.entries()]
  }, [])
  const requestId = useRef(0)

  useEffect(() => {
    const source = doc.text.trim()
    if (!source) {
      setSvg('')
      setError(null)
      setLoading(false)
      return
    }
    if (source.length > MAX_SOURCE) {
      setSvg('')
      setError(`Mermaid 源码超过 ${MAX_SOURCE.toLocaleString()} 字符，已暂停渲染`)
      setLoading(false)
      return
    }
    setLoading(true)
    const request = ++requestId.current
    const timer = window.setTimeout(async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          htmlLabels: false,
          themeVariables: mermaidThemeVariables(),
        })
        const id = `jizhu-mermaid-${Date.now()}-${request}`
        const result = await mermaid.render(id, source)
        if (request !== requestId.current) return
        setSvg(sanitizeSvg(result.svg))
        setError(null)
      } catch (err) {
        if (request !== requestId.current) return
        setSvg('')
        setError(cleanError(err))
      } finally {
        if (request === requestId.current) setLoading(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [doc.text, theme])

  useEffect(() => {
    setZoom(1)
    setExamplesOpen(false)
  }, [doc.id])

  useEffect(() => {
    if (!examplesOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExamplesOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [examplesOpen])

  const copySvg = async () => {
    if (!svg) return
    try {
      await copyText(svg)
      showToast('已复制 Mermaid SVG')
    } catch (err) {
      showToast(errorMessage(err))
    }
  }

  const chooseExample = (example: MermaidExample) => {
    setText(doc.id, example.code)
    if ((tab.workspace?.mode ?? 'plain') !== 'plain') setWorkspaceMode(tab.id, 'plain')
    setExamplesOpen(false)
    showToast(`已填入「${example.label}」示例`)
  }

  const zoomBy = (delta: number) => {
    setZoom((value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((value + delta) * 100) / 100)))
  }

  return (
    <div className="mermaid-side">
      <div className="mermaid-toolbar">
        <span className="mermaid-status">
          {loading ? '渲染中…' : error ? '渲染失败' : svg ? 'SVG 预览' : '等待输入'}
        </span>
        <span className="mermaid-source-meta">{doc.text.length.toLocaleString()} 字符</span>
        <button className="btn ghost mermaid-icon-btn" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="缩小 Mermaid">
          <Minus size={13} strokeWidth={1.8} />
        </button>
        <span className="mermaid-zoom">{Math.round(zoom * 100)}%</span>
        <button className="btn ghost mermaid-icon-btn" onClick={() => zoomBy(ZOOM_STEP)} aria-label="放大 Mermaid">
          <Plus size={13} strokeWidth={1.8} />
        </button>
        <button className="btn ghost mermaid-icon-btn" onClick={() => setZoom(1)} aria-label="重置 Mermaid 缩放">
          <RotateCcw size={13} strokeWidth={1.8} />
        </button>
        <button className="btn ghost" onClick={() => setExamplesOpen(true)}>
          <BookOpen size={12} strokeWidth={1.8} />
          示例
        </button>
        <button className="btn ghost" onClick={() => void copySvg()} disabled={!svg}>
          <Copy size={12} strokeWidth={1.8} />
          复制 SVG
        </button>
      </div>

      {examplesOpen ? (
        <div
          className="mermaid-examples-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExamplesOpen(false)
          }}
        >
          <div className="mermaid-examples" role="dialog" aria-modal="true" aria-label="Mermaid 示例">
            <header>
              <div>
                <strong>Mermaid 示例</strong>
                <span>{MERMAID_EXAMPLES.length} 种图表</span>
              </div>
              <button className="btn ghost" onClick={() => setExamplesOpen(false)} aria-label="关闭 Mermaid 示例">
                <X size={13} strokeWidth={1.8} />
              </button>
            </header>
            <div className="mermaid-example-tabs" role="tablist" aria-label="示例分类">
              {(['全部', '基础', '真实场景'] as const).map((category) => (
                <button
                  key={category}
                  role="tab"
                  aria-selected={exampleCategory === category}
                  className={exampleCategory === category ? 'active' : ''}
                  onClick={() => setExampleCategory(category)}
                >
                  {category}
                  <span>
                    {category === '全部'
                      ? MERMAID_EXAMPLES.length
                      : MERMAID_EXAMPLES.filter((example) => (example.category ?? '基础') === category).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="mermaid-example-list">
              {exampleGroups.filter(([category]) => exampleCategory === '全部' || category === exampleCategory).map(([category, list]) => (
                <div key={category} className="mermaid-example-group">
                  <div className="mermaid-example-group-title">{category}</div>
                  {list.map((example) => (
                    <button key={example.id} className="mermaid-example-item" onClick={() => chooseExample(example)}>
                      <span className="mermaid-example-copy">
                        <strong>{example.label}</strong>
                        <em>{example.english}</em>
                        <small>{example.description}</small>
                      </span>
                      <span className="mermaid-example-arrow">→</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mermaid-stage mermaid-error-stage">
          <div className="mermaid-error">
            <AlertTriangle size={17} strokeWidth={1.7} />
            <strong>无法渲染 Mermaid</strong>
            <pre>{error}</pre>
          </div>
        </div>
      ) : svg ? (
        <div className="mermaid-stage">
          <div
            className="mermaid-canvas"
            style={{ zoom } as React.CSSProperties}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      ) : (
        <div className="mermaid-stage mermaid-empty-stage">
          <div className="mermaid-empty">
            <span>在左侧输入 Mermaid 代码，右侧实时渲染。</span>
            <button className="btn" onClick={() => setExamplesOpen(true)}>
              <BookOpen size={12} strokeWidth={1.8} />
              浏览示例
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
