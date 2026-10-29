import { useCallback, useEffect, useMemo } from 'react'
import {
  AlignJustify,
  Asterisk,
  Binary,
  Clock3,
  Copy,
  GitCompare,
  Link2,
  Minimize2,
  Plus,
  QrCode,
  Settings,
  Undo2,
  Workflow,
  Zap,
} from 'lucide-react'
import { CommandPalette } from './components/CommandPalette'
import { SettingsDialog } from './components/SettingsDialog'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { TitleBar } from './components/TitleBar'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import type { CommandItem } from './core/commands'
import { requestEditorUndo } from './core/editorActions'
import {
  copyText,
  errorMessage,
  formatJson,
  isTauri,
  minifyJson,
} from './core/ipc'
import { isModPressed } from './core/keyboard'
import type { WorkspacePanelType } from './core/types'
import {
  selectActiveDoc,
  selectActiveTab,
  useAppStore,
} from './store/appStore'

const PANELS: Array<{
  type: WorkspacePanelType
  title: string
  description: string
  icon: typeof Zap
}> = [
  { type: 'jq', title: 'jq 查询', description: '打开查询面板；表达式在沙箱执行', icon: Zap },
  { type: 'diff', title: 'Diff 对比', description: '以当前标签为源，比较文本/JSON/URL', icon: GitCompare },
  { type: 'qr', title: '二维码', description: '把选中行或当前文本生成 QR', icon: QrCode },
  { type: 'pipeline', title: 'Pipeline 批处理', description: 'jq / 编码 / 正则 / 计数步骤链', icon: Workflow },
  { type: 'url', title: 'URL 解析', description: '拆解并编辑当前 URL 参数', icon: Link2 },
  { type: 'time', title: '时间转换', description: '时间戳与日期互转', icon: Clock3 },
  { type: 'regex', title: '正则匹配', description: '手动 ⌘F 搜索，支持替换预览', icon: Asterisk },
  { type: 'codec', title: '编码 / 解码', description: 'Base64 / URL / HTML / Unicode / Hex', icon: Binary },
]

export default function App() {
  const activeTab = useAppStore(selectActiveTab)
  const activeDoc = useAppStore(selectActiveDoc)
  const settings = useAppStore((state) => state.settings)
  const paletteOpen = useAppStore((state) => state.paletteOpen)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const toast = useAppStore((state) => state.toast)

  const activate = useAppStore((state) => state.activate)
  const closeTab = useAppStore((state) => state.closeTab)
  const setText = useAppStore((state) => state.setText)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const showToast = useAppStore((state) => state.showToast)
  const newWorkspace = useAppStore((state) => state.newWorkspace)
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode)
  const openWorkspacePanel = useAppStore((state) => state.openWorkspacePanel)
  const closeWorkspacePanel = useAppStore((state) => state.closeWorkspacePanel)
  const toggleWorkspacePanelMaximize = useAppStore((state) => state.toggleWorkspacePanelMaximize)
  const focusWorkspacePanel = useAppStore((state) => state.focusWorkspacePanel)

  const workspace = activeTab?.workspace

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.style.colorScheme = 'dark'
    document.documentElement.lang = settings.language
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`)
  }, [settings.editorFontSize, settings.language])

  const handleFormat = useCallback(async () => {
    if (!activeDoc) return
    try {
      setText(activeDoc.id, await formatJson(activeDoc.text, settings.formatIndent, false))
      showToast('已格式化')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, setText, settings.formatIndent, showToast])

  const handleMinify = useCallback(async () => {
    if (!activeDoc) return
    try {
      setText(activeDoc.id, await minifyJson(activeDoc.text))
      showToast('已压缩')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, setText, showToast])

  const handleCopy = useCallback(async () => {
    if (!activeDoc) return
    try {
      await copyText(activeDoc.text)
      showToast('已复制')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, showToast])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeTab) return
      const mod = isModPressed(event)
      if (mod && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'f') {
        if (!workspace?.activePanelId) return
        event.preventDefault()
        toggleWorkspacePanelMaximize(activeTab.id)
        return
      }
      if (
        event.ctrlKey &&
        event.altKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
        workspace?.panels.length
      ) {
        event.preventDefault()
        const panels = workspace.panels
        const at = panels.findIndex((panel) => panel.id === workspace.activePanelId)
        const next = event.key === 'ArrowRight' ? (at + 1 + panels.length) % panels.length : (at - 1 + panels.length) % panels.length
        focusWorkspacePanel(activeTab.id, panels[next].id)
        return
      }
      if (event.altKey && !mod && !event.shiftKey) {
        const digit = /^Digit([1-4])$/.exec(event.code)?.[1] ?? (/^[1-4]$/.test(event.key) ? event.key : null)
        if (digit) {
          const target = useAppStore.getState().tabs[Number(digit) - 1]
          if (target) {
            event.preventDefault()
            activate(target.id)
          }
          return
        }
      }
      if (event.key === 'Escape' && !paletteOpen && !settingsOpen && workspace?.activePanelId) {
        event.preventDefault()
        closeWorkspacePanel(activeTab.id, workspace.activePanelId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activeTab,
    activate,
    closeWorkspacePanel,
    focusWorkspacePanel,
    paletteOpen,
    setPaletteOpen,
    settingsOpen,
    toggleWorkspacePanelMaximize,
    workspace,
  ])

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []
    if (!activeTab || !workspace) return items

    for (const panel of PANELS) {
      items.push({
        id: `panel-${panel.type}`,
        title: panel.title,
        description: panel.description,
        group: '面板 · 弹窗',
        hint: '平铺',
        icon: panel.icon,
        run: () => openWorkspacePanel(activeTab.id, panel.type),
      })
    }

    items.push(
      {
        id: 'undo',
        title: '撤销',
        description: '撤销当前编辑器的上一步操作',
        group: '编辑',
        hint: '⌘Z',
        icon: Undo2,
        run: requestEditorUndo,
      },
      {
        id: 'toggle-mode',
        title: workspace.mode === 'json' ? '切换到 plain 模式' : '切换到 JSON 模式',
        description: '切换当前工作区的编辑器模式',
        group: '编辑',
        hint: '模式',
        icon: AlignJustify,
        run: () => setWorkspaceMode(activeTab.id, workspace.mode === 'json' ? 'plain' : 'json'),
      },
      {
        id: 'settings',
        title: '设置',
        description: '编辑器字号、自动换行、快捷键与关于',
        group: '全局',
        hint: '⌘,',
        icon: Settings,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'new-workspace',
        title: '新建工作区',
        description: '创建一个新的空白编辑工作区',
        group: '全局',
        hint: '+',
        icon: Plus,
        run: newWorkspace,
      },
    )

    if (workspace.mode === 'json' && activeDoc) {
      items.push(
        {
          id: 'format-json',
          title: '格式化 JSON',
          description: '按设置中的缩进格式化当前文档',
          group: '编辑',
          hint: 'JSON',
          icon: AlignJustify,
          run: () => void handleFormat(),
        },
        {
          id: 'minify-json',
          title: '压缩 JSON',
          description: '压缩为单行 JSON',
          group: '编辑',
          hint: 'JSON',
          icon: Minimize2,
          run: () => void handleMinify(),
        },
        {
          id: 'copy-doc',
          title: '复制当前文本',
          description: '把编辑器内容复制到剪贴板',
          group: '编辑',
          hint: '剪贴板',
          icon: Copy,
          run: () => void handleCopy(),
        },
      )
    }

    return items
  }, [
    activeDoc,
    activeTab,
    handleCopy,
    handleFormat,
    handleMinify,
    newWorkspace,
    openWorkspacePanel,
    setSettingsOpen,
    setWorkspaceMode,
    workspace,
  ])

  if (!activeTab || !activeDoc || !workspace) return null

  return (
    <div className="app tiling-app">
      <TitleBar showMockTraffic={!isTauri} />
      <TabBar onNewTab={newWorkspace} />
      <main className="workspace tiling-workspace">
        <WorkspaceView tab={activeTab} doc={activeDoc} />
      </main>
      <StatusBar />
      {paletteOpen ? (
        <CommandPalette items={commands} onClose={() => setPaletteOpen(false)} />
      ) : null}
      {settingsOpen ? <SettingsDialog /> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
