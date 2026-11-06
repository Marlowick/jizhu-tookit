import { lazy, Suspense, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { Doc, SideToolType, Tab } from '../../core/types'
import { PlainEditor } from './PlainEditor'

const JsonTool = lazy(() => import('../JsonTool').then((module) => ({ default: module.JsonTool })))
const PipelineTool = lazy(() => import('../PipelineTool').then((module) => ({ default: module.PipelineTool })))
const JqTool = lazy(() => import('../JqTool').then((module) => ({ default: module.JqTool })))
const RegexTool = lazy(() => import('../RegexTool').then((module) => ({ default: module.RegexTool })))
const UrlTool = lazy(() => import('../UrlTool').then((module) => ({ default: module.UrlTool })))
const CurlSidePane = lazy(() => import('./CurlSidePane').then((module) => ({ default: module.CurlSidePane })))
const DataConvertPane = lazy(() => import('./DataConvertPane').then((module) => ({ default: module.DataConvertPane })))
const CodecSidePane = lazy(() => import('./CodecSidePane').then((module) => ({ default: module.CodecSidePane })))
const QrPreviewPane = lazy(() => import('./QrPreviewPane').then((module) => ({ default: module.QrPreviewPane })))
const TimeSidePane = lazy(() => import('./TimeSidePane').then((module) => ({ default: module.TimeSidePane })))
const WorkspacePanels = lazy(() => import('./WorkspacePanels').then((module) => ({ default: module.WorkspacePanels })))

interface WorkspaceViewProps {
  tab: Tab
  doc: Doc
}

const SIDE_TITLES: Record<SideToolType, string> = {
  qr: '二维码预览',
  url: 'URL 解析',
  codec: '编码 / 解码',
  time: '时间转换',
  jq: 'jq 查询',
  regex: '正则匹配',
  pipeline: 'Pipeline 批处理',
  data: '格式转换',
  curl: 'cURL 请求',
}

function EditorPane({ tab, doc }: WorkspaceViewProps) {
  const setText = useAppStore((state) => state.setText)
  const setCursor = useAppStore((state) => state.setCursor)
  const setSelectionText = useAppStore((state) => state.setSelectionText)
  const wordWrap = useAppStore((state) => state.settings.wordWrap)
  const editorHighlights = useAppStore((state) => state.editorHighlights)
  const mode = tab.workspace?.mode ?? 'plain'

  if (mode === 'json') {
    return (
      <div className="workspace-editor">
        <Suspense fallback={<div className="pane-loading">加载 JSON 编辑器…</div>}>
          <JsonTool tab={tab} doc={doc} highlights={editorHighlights} />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="workspace-editor plain-workspace">
      <PlainEditor
        text={doc.text}
        docId={doc.id}
        calc={mode === 'calc'}
        highlights={editorHighlights}
        wordWrap={wordWrap}
        onChange={(value) => setText(doc.id, value)}
        onCursor={setCursor}
        onSelection={setSelectionText}
      />
    </div>
  )
}

function SideToolShell({ title, onClose, syncText = '来自左侧编辑器 · 实时更新', children }: { title: string; onClose: () => void; syncText?: string; children: ReactNode }) {
  return (
    <div className="side-tool-shell">
      <header className="side-tool-shell-head">
        <strong>{title}</strong>
        <span className="side-tool-shell-sync">{syncText}</span>
        <button className="btn ghost workspace-panel-icon" onClick={onClose} title={`关闭${title}`} aria-label={`关闭${title}`}>
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>
      <div className="side-tool-shell-body">{children}</div>
    </div>
  )
}

export function WorkspaceView({ tab, doc }: WorkspaceViewProps) {
  const closePanel = useAppStore((state) => state.closeWorkspacePanel)
  const closeSideTool = useAppStore((state) => state.closeSideTool)
  const setSideSplit = useAppStore((state) => state.setSideSplit)
  const setText = useAppStore((state) => state.setText)
  const splitRef = useRef<HTMLDivElement>(null)
  const workspace = tab.workspace ?? {
    mode: 'plain' as const,
    panels: [],
    activePanelId: null,
    maximizedPanelId: null,
  }
  const sideTool = workspace.sideTool

  if (sideTool) {
    const ratio = Math.min(0.72, Math.max(0.28, workspace.sideSplit ?? workspace.qrSplit ?? 0.54))
    const setRatio = (next: number) => setSideSplit(tab.id, Math.min(0.72, Math.max(0.28, next)))
    const close = () => closeSideTool(tab.id)
    const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      const rect = splitRef.current?.getBoundingClientRect()
      if (!rect) return
      let last = ratio
      // 拖动过程直接改 grid 样式，避免每条 pointermove 都写入 store / 持久化。
      const move = (moveEvent: PointerEvent) => {
        const next = Math.min(0.72, Math.max(0.28, (moveEvent.clientX - rect.left) / rect.width))
        last = next
        if (splitRef.current) {
          splitRef.current.style.gridTemplateColumns = `${next * 100}% 7px minmax(0, 1fr)`
        }
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setSideSplit(tab.id, last)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      setRatio(ratio + (event.key === 'ArrowLeft' ? -0.03 : 0.03))
    }
    return (
      <div
        className="workspace-qr-split side-tool-split"
        ref={splitRef}
        style={{ gridTemplateColumns: `${ratio * 100}% 7px minmax(0, 1fr)` }}
      >
        <div className="workspace-qr-editor">
          <EditorPane tab={tab} doc={doc} />
        </div>
        <div
          className="qr-split-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整编辑器和工具面板的宽度"
          aria-valuemin={28}
          aria-valuemax={72}
          aria-valuenow={Math.round(ratio * 100)}
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={onKeyDown}
          onDoubleClick={() => setRatio(0.54)}
          title="拖动调整宽度，双击复位"
        />
        <div className="workspace-qr-preview">
          <Suspense fallback={<div className="pane-loading">加载工具…</div>}>
          {sideTool === 'qr' ? (
            <QrPreviewPane tab={tab} doc={doc} onClose={close} />
          ) : (
            <SideToolShell
              title={SIDE_TITLES[sideTool]}
              onClose={close}
              syncText={['url', 'codec', 'time', 'data'].includes(sideTool) ? '来自左侧编辑器 · 实时更新' : '来自左侧编辑器 · 手动运行'}
            >
              {sideTool === 'url' ? (
                <UrlTool
                  tab={tab}
                  embedded
                  source={doc.text}
                  onSourceChange={(text) => setText(doc.id, text)}
                />
              ) : sideTool === 'codec' ? (
                <CodecSidePane tab={tab} doc={doc} />
              ) : sideTool === 'time' ? (
                <TimeSidePane tab={tab} doc={doc} />
              ) : sideTool === 'jq' ? (
                <JqTool tab={tab} embedded source={doc.text} onSourceChange={(text) => setText(doc.id, text)} />
              ) : sideTool === 'regex' ? (
                <RegexTool tab={tab} docId={doc.id} embedded source={doc.text} onSourceChange={(text) => setText(doc.id, text)} />
              ) : sideTool === 'pipeline' ? (
                <PipelineTool tab={tab} embedded source={doc.text} />
              ) : sideTool === 'data' ? (
                <DataConvertPane tab={tab} doc={doc} />
              ) : (
                <CurlSidePane tab={tab} doc={doc} />
              )}
            </SideToolShell>
          )}
          </Suspense>
        </div>
      </div>
    )
  }

  if (workspace.panels.length) {
    return (
      <Suspense fallback={<div className="pane-loading">加载面板…</div>}>
        <WorkspacePanels tab={tab} doc={doc} />
      </Suspense>
    )
  }

  return <EditorPane tab={tab} doc={doc} />
}
