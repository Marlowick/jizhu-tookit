import { useEffect } from 'react'
import {
  Asterisk,
  Binary,
  Clock3,
  GitCompare,
  Link2,
  Maximize2,
  Minimize2,
  QrCode,
  Workflow,
  X,
  FileInput,
  Zap,
} from 'lucide-react'
import { defaultDiffState } from '../../core/diff'
import { defaultPipelineState } from '../../core/pipeline'
import type { Doc, InputSource, RegexState, Tab, WorkspacePanel, WorkspacePanelType } from '../../core/types'
import { useAppStore } from '../../store/appStore'
import { CodecTool } from '../CodecTool'
import { DiffTool } from '../DiffTool'
import { JqTool } from '../JqTool'
import { PipelineTool } from '../PipelineTool'
import { QrTool } from '../QrTool'
import { RegexTool } from '../RegexTool'
import { TimeTool } from '../TimeTool'
import { UrlTool } from '../UrlTool'

const PANEL_META: Record<WorkspacePanelType, { title: string; icon: typeof Zap }> = {
  jq: { title: 'jq 查询', icon: Zap },
  diff: { title: 'Diff 对比', icon: GitCompare },
  qr: { title: '二维码', icon: QrCode },
  pipeline: { title: 'Pipeline 批处理', icon: Workflow },
  url: { title: 'URL 解析', icon: Link2 },
  time: { title: '时间转换', icon: Clock3 },
  regex: { title: '正则匹配', icon: Asterisk },
  codec: { title: '编码 / 解码', icon: Binary },
}

const DEFAULT_REGEX: RegexState = {
  text: '',
  pattern: '',
  global: true,
  ignoreCase: false,
  multiLine: false,
  replace: '$1 [at] $2',
  view: 'matches',
}

function applyPanelInput(panel: WorkspacePanel, tab: Tab, doc: Doc) {
  const source = panel.source ?? 'tab'
  const store = useAppStore.getState()
  if (source === 'manual') {
    // Diff 的 A 侧原本可以跟随标签；切到手动后应变成独立副本。
    if (panel.type === 'diff') {
      store.setDiffState(tab.id, {
        ...(tab.diff ?? defaultDiffState(tab.docId)),
        a:
          tab.diff?.a.kind === 'manual'
            ? tab.diff.a
            : { kind: 'manual', text: doc.text },
      })
    }
    return
  }
  const text = source === 'selection' ? panel.selectionText ?? '' : doc.text
  switch (panel.type) {
    case 'jq':
      store.setJqInput(tab.id, text)
      break
    case 'diff':
      store.setDiffState(tab.id, {
        ...(tab.diff ?? defaultDiffState(tab.docId)),
        a: source === 'tab' ? { kind: 'tab', docId: tab.docId } : { kind: 'manual', text },
      })
      break
    case 'pipeline':
      store.setPipeline(tab.id, { ...(tab.pipeline ?? defaultPipelineState()), input: text })
      break
    case 'codec':
      store.setCodecTool(tab.id, {
        ...(tab.codecTool ?? {
          direction: 'encode' as const,
          protocol: 'base64' as const,
          urlSafe: true,
          input: '',
        }),
        input: text,
      })
      break
    case 'url':
      store.setUrlTool(tab.id, { ...(tab.urlTool ?? { input: '', decode: true }), input: text })
      break
    case 'time':
      store.setTimeTool(tab.id, {
        ...(tab.timeTool ?? {
          mode: 'toTime' as const,
          input: '',
          unit: 'auto' as const,
        }),
        input: text,
      })
      break
    case 'regex':
      store.setRegexTool(tab.id, { ...(tab.regexTool ?? DEFAULT_REGEX), text })
      break
    case 'qr':
      store.setQrTool(tab.id, {
        ...(tab.qrTool ?? { text: '', level: 'M' as const, size: 320 }),
        text,
      })
      break
  }
}

interface WorkspacePanelsProps {
  tab: Tab
  doc: Doc
}

function PanelContent({ panel, tab, doc }: { panel: WorkspacePanel; tab: Tab; doc: Doc }) {
  const markPanelSeeded = useAppStore((state) => state.markPanelSeeded)

  useEffect(() => {
    if (panel.seeded) return
    applyPanelInput(panel, tab, doc)
    markPanelSeeded(tab.id, panel.id)
    // 只在面板首次打开或输入源切换时灌入，避免输入过程中被覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, panel.source, panel.selectionText, panel.seeded])

  switch (panel.type) {
    case 'jq':
      return <JqTool tab={tab} />
    case 'diff':
      return <DiffTool tab={tab} />
    case 'qr':
      return <QrTool tab={tab} />
    case 'pipeline':
      return <PipelineTool tab={tab} />
    case 'url':
      return <UrlTool tab={tab} />
    case 'time':
      return <TimeTool tab={tab} />
    case 'regex':
      return <RegexTool tab={tab} />
    case 'codec':
      return <CodecTool tab={tab} />
    default:
      return null
  }
}

export function WorkspacePanels({ tab, doc }: WorkspacePanelsProps) {
  const closePanel = useAppStore((state) => state.closeWorkspacePanel)
  const focusPanel = useAppStore((state) => state.focusWorkspacePanel)
  const toggleMaximize = useAppStore((state) => state.toggleWorkspacePanelMaximize)
  const setJqInput = useAppStore((state) => state.setJqInput)
  const setPanelInputSource = useAppStore((state) => state.setPanelInputSource)
  const workspace = tab.workspace
  if (!workspace || !workspace.panels.length) return null
  const maximized = workspace.maximizedPanelId
  const visible = maximized ? workspace.panels.filter((panel) => panel.id === maximized) : workspace.panels
  const count = maximized ? 1 : visible.length

  return (
    <div className={`workspace-panels count-${count} ${maximized ? 'is-maximized' : ''}`}>
      {visible.map((panel) => {
        const meta = PANEL_META[panel.type]
        const Icon = meta.icon
        const active = workspace.activePanelId === panel.id
        return (
          <section
            key={panel.id}
            className={`workspace-panel ${active ? 'active' : ''}`}
            onMouseDown={() => focusPanel(tab.id, panel.id)}
          >
            <header className="workspace-panel-head">
              <Icon size={13} strokeWidth={1.8} />
              <strong>{meta.title}</strong>
              <label className="workspace-panel-source" title="输入源">
                <span>源</span>
                <select
                  value={panel.source ?? 'tab'}
                  onChange={(event) => setPanelInputSource(tab.id, panel.id, event.target.value as InputSource)}
                  aria-label="输入源"
                >
                  {panel.selectionText ? <option value="selection">选中文本</option> : null}
                  <option value="tab">当前标签</option>
                  <option value="manual">手动输入</option>
                </select>
              </label>
              {panel.type === 'jq' ? (
                <button
                  className="btn ghost workspace-panel-icon"
                  onClick={() => setJqInput(tab.id, doc.text)}
                  title="把当前编辑器内容放入 jq 输入"
                  aria-label="读取当前文本"
                >
                  <FileInput size={13} />
                </button>
              ) : null}
              <button
                className="btn ghost workspace-panel-icon"
                onClick={() => toggleMaximize(tab.id)}
                title={maximized ? '还原平铺（⌘⇧F）' : '最大化（⌘⇧F）'}
                aria-label={maximized ? '还原平铺' : '最大化面板'}
              >
                {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button
                className="btn ghost workspace-panel-icon"
                onClick={() => closePanel(tab.id, panel.id)}
                title="关闭面板（Esc）"
                aria-label="关闭面板"
              >
                <X size={13} />
              </button>
            </header>
            <div className="workspace-panel-body">
              <PanelContent panel={panel} tab={tab} doc={doc} />
            </div>
          </section>
        )
      })}
    </div>
  )
}
