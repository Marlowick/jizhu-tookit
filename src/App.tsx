import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import {
  AlignJustify,
  Asterisk,
  Binary,
  Braces,
  Clock3,
  Copy,
  GitCompare,
  Link2,
  Minimize2,
  Plus,
  QrCode,
  RotateCcw,
  Settings,
  Terminal,
  Undo2,
  Workflow,
  WrapText,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { CloseConfirmDialog } from './components/CloseConfirmDialog'
import { CommandPalette } from './components/CommandPalette'
import { ModePicker } from './components/ModePicker'
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
import { isModPressed, modKey } from './core/keyboard'
import { clampUiScale, UI_SCALE_STEP } from './core/uiScale'
import type { WorkspacePanelType } from './core/types'
import {
  selectActiveDoc,
  selectActiveTab,
  useAppStore,
} from './store/appStore'

const PANELS: Array<{
  type: WorkspacePanelType
  title: string
  english: string
  description: string
  keywords?: string[]
  icon: typeof Zap
}> = [
  { type: 'jq', title: 'jq 查询', english: 'JQ query', description: '打开查询面板；表达式在沙箱执行', keywords: ['jq', 'query'], icon: Zap },
  { type: 'diff', title: 'Diff 对比', english: 'Diff', description: '以当前标签为源，比较文本/JSON/URL', keywords: ['diff', 'compare'], icon: GitCompare },
  { type: 'qr', title: '二维码预览', english: 'QR code', description: '左侧编辑器 / 右侧二维码，单例分屏', keywords: ['qr', 'qrcode'], icon: QrCode },
  { type: 'pipeline', title: 'Pipeline 批处理', english: 'Pipeline', description: 'jq / 编码 / 正则 / 计数步骤链', keywords: ['pipeline', 'batch'], icon: Workflow },
  { type: 'url', title: 'URL 解析', english: 'URL inspector', description: '拆解并编辑当前 URL 参数', keywords: ['url', 'query'], icon: Link2 },
  { type: 'time', title: '时间转换', english: 'Time', description: '时间戳与日期互转', keywords: ['time', 'timestamp'], icon: Clock3 },
  { type: 'regex', title: '正则匹配', english: 'Regex', description: '手动 ⌘F 搜索，支持替换预览', keywords: ['regex', 'regular expression'], icon: Asterisk },
  { type: 'codec', title: '编码 / 解码', english: 'Encode / Decode', description: 'Base64 / URL / HTML / Unicode / Hex', keywords: ['codec', 'base64', 'encode', 'decode'], icon: Binary },
  { type: 'data', title: '格式转换', english: 'Data format', description: 'YAML / TOML ↔ JSON，使用左侧编辑器输入', keywords: ['yaml', 'toml', 'json', 'convert'], icon: Braces },
  { type: 'curl', title: 'cURL 请求', english: 'cURL request', description: '解析左侧 curl 命令，查看响应 headers / body', keywords: ['curl', 'http', 'request', 'api'], icon: Terminal },
]

interface ClosePrompt {
  label: string
}

function isJsonDocument(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export default function App() {
  const activeTab = useAppStore(selectActiveTab)
  const activeDoc = useAppStore(selectActiveDoc)
  const settings = useAppStore((state) => state.settings)
  const paletteOpen = useAppStore((state) => state.paletteOpen)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const toast = useAppStore((state) => state.toast)

  const activate = useAppStore((state) => state.activate)
  const setText = useAppStore((state) => state.setText)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const showToast = useAppStore((state) => state.showToast)
  const newWorkspace = useAppStore((state) => state.newWorkspace)
  const setWorkspaceMode = useAppStore((state) => state.setWorkspaceMode)
  const openWorkspacePanel = useAppStore((state) => state.openWorkspacePanel)
  const closeWorkspacePanel = useAppStore((state) => state.closeWorkspacePanel)
  const closeSideTool = useAppStore((state) => state.closeSideTool)
  const closeTab = useAppStore((state) => state.closeTab)

  const workspace = activeTab?.workspace
  const [modePickerOpen, setModePickerOpen] = useState(false)
  const [closePrompt, setClosePrompt] = useState<ClosePrompt | null>(null)
  const clearedTabs = useRef(new Set<string>())
  const previousDocId = useRef('')
  const previousText = useRef('')

  useEffect(() => {
    const light = settings.theme === 'solarized-light'
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    document.documentElement.dataset.themeVariant = settings.theme
    document.documentElement.style.colorScheme = light ? 'light' : 'dark'
    document.documentElement.lang = settings.language
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`)
  }, [settings.editorFontSize, settings.language, settings.theme])

  useEffect(() => {
    if (!activeDoc || !activeTab) return
    if (previousDocId.current !== activeDoc.id) {
      previousDocId.current = activeDoc.id
      previousText.current = activeDoc.text
      return
    }
    if (activeDoc.text.length === 0 && previousText.current.trim().length > 0) {
      clearedTabs.current.add(activeTab.id)
    }
    if (activeDoc.text.length > 0) clearedTabs.current.delete(activeTab.id)
    previousText.current = activeDoc.text
  }, [activeDoc, activeTab])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const tab = selectActiveTab(useAppStore.getState())
      const doc = selectActiveDoc(useAppStore.getState())
      if (!tab || !doc || doc.text.length > 0 || !clearedTabs.current.has(tab.id)) return
      const target = event.target as HTMLElement | null
      const active = document.activeElement as HTMLElement | null
      if (!target?.closest('.cm-editor') && !active?.closest('.cm-editor')) return
      const pasted = event.clipboardData?.getData('text/plain') ?? ''
      if (!pasted) return
      event.preventDefault()
      const looksJson = isJsonDocument(pasted)
      setText(doc.id, pasted)
      setWorkspaceMode(tab.id, looksJson ? 'json' : 'plain')
      clearedTabs.current.delete(tab.id)
      showToast(looksJson ? '已识别为 JSON，切换到 JSON 模式' : '已切换到纯文本模式')
    }
    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [setText, setWorkspaceMode, showToast])

  useEffect(() => {
    const scale = clampUiScale(settings.uiScale)
    document.documentElement.dataset.uiScale = String(scale)
    let cancelled = false
    const apply = async () => {
      if (isTauri) {
        document.documentElement.style.removeProperty('zoom')
        try {
          await getCurrentWebview().setZoom(scale)
          return
        } catch {
          // Permission or platform fallback: use CSS zoom below.
        }
      }
      if (!cancelled) document.documentElement.style.setProperty('zoom', String(scale))
    }
    void apply()
    return () => {
      cancelled = true
    }
  }, [settings.uiScale])

  const scaleBy = useCallback(
    (delta: number) => {
      const current = useAppStore.getState().settings.uiScale
      const next = clampUiScale(current + delta)
      if (next === current) return
      updateSettings({ uiScale: next })
      showToast(`界面缩放 ${Math.round(next * 100)}%`)
    },
    [showToast, updateSettings],
  )

  const resetUiScale = useCallback(() => {
    updateSettings({ uiScale: 1 })
    showToast('界面缩放已恢复 100%')
  }, [showToast, updateSettings])

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

  const requestClose = useCallback(() => {
    if (!activeTab) return
    // 工具/面板状态保存在标签上，关闭可随时恢复，直接关闭不打扰
    if (workspace?.sideTool) {
      closeSideTool(activeTab.id)
      return
    }
    if (workspace?.activePanelId) {
      closeWorkspacePanel(activeTab.id, workspace.activePanelId)
      return
    }
    // 关闭标签会丢弃文档内容，有内容时需要确认
    if (activeDoc?.text.trim()) {
      const content = activeDoc.text.replace(/\s+/g, ' ').trim()
      const label = content ? `${content.slice(0, 18)}${content.length > 18 ? '…' : ''}` : activeDoc.title
      setClosePrompt({ label })
      return
    }
    closeTab(activeTab.id)
  }, [activeDoc, activeTab, closeSideTool, closeTab, closeWorkspacePanel, workspace])

  const confirmClose = useCallback(() => {
    if (activeTab) closeTab(activeTab.id)
    setClosePrompt(null)
  }, [activeTab, closeTab])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isModPressed(event)
      const key = event.key.toLowerCase()

      if (mod && event.shiftKey && key === 'p') {
        event.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }

      if (mod && !event.altKey && (event.code === 'Equal' || key === '=' || key === '+')) {
        event.preventDefault()
        scaleBy(UI_SCALE_STEP)
        return
      }

      if (mod && !event.altKey && (event.code === 'Minus' || key === '-' || key === '_')) {
        event.preventDefault()
        scaleBy(-UI_SCALE_STEP)
        return
      }

      if (mod && !event.shiftKey && !event.altKey && (event.code === 'Digit0' || key === '0')) {
        event.preventDefault()
        resetUiScale()
        return
      }

      if (mod && !event.shiftKey && !event.altKey && key === 'w') {
        event.preventDefault()
        if (closePrompt || paletteOpen || settingsOpen || modePickerOpen) return
        requestClose()
        return
      }

      if (mod && !event.shiftKey && !event.altKey) {
        const digit = /^Digit([1-9])$/.exec(event.code)?.[1] ?? (/^[1-9]$/.test(event.key) ? event.key : null)
        if (digit) {
          // 无论标签是否存在都阻止默认输入，避免数字落进编辑器。
          event.preventDefault()
          const target = useAppStore.getState().tabs[Number(digit) - 1]
          if (target) activate(target.id)
          return
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    activate,
    closePrompt,
    modePickerOpen,
    paletteOpen,
    requestClose,
    resetUiScale,
    scaleBy,
    setPaletteOpen,
    settingsOpen,
  ])

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []
    if (!activeTab || !workspace) return items

    for (const panel of PANELS) {
      items.push({
        id: `panel-${panel.type}`,
        title: panel.title,
        english: panel.english,
        keywords: panel.keywords,
        description: panel.description,
        group: '面板 · 弹窗',
        hint: ['qr', 'url', 'codec', 'time', 'jq', 'regex', 'pipeline', 'data', 'curl'].includes(panel.type) ? '分屏 · 单例' : '平铺',
        icon: panel.icon,
        run: () => openWorkspacePanel(activeTab.id, panel.type),
      })
    }

    items.push(
      {
        id: 'undo',
        title: '撤销',
        english: 'Undo',
        description: '撤销当前编辑器的上一步操作',
        group: '编辑',
        hint: '⌘Z',
        icon: Undo2,
        run: requestEditorUndo,
      },
      {
        id: 'toggle-wrap',
        title: settings.wordWrap ? '关闭自动换行' : '开启自动换行',
        english: 'Toggle word wrap',
        keywords: ['wrap', 'word wrap'],
        description: '作用于 plain / JSON / Calc 编辑器；默认开启',
        group: '编辑',
        hint: settings.wordWrap ? 'Wrap 开' : 'Wrap 关',
        icon: WrapText,
        run: () => {
          updateSettings({ wordWrap: !settings.wordWrap })
          showToast(settings.wordWrap ? '自动换行已关闭' : '自动换行已开启')
        },
      },
      {
        id: 'mode',
        title: '模式',
        english: 'Mode',
        keywords: ['plain', 'json', 'calc', 'editor', 'language'],
        description: '选择 Plain / JSON / Calc 编辑器模式',
        group: '编辑',
        icon: AlignJustify,
        run: () => setModePickerOpen(true),
      },
      {
        id: 'settings',
        title: '设置',
        english: 'Settings',
        keywords: ['settings', 'preferences', 'options', 'shortcuts'],
        description: '编辑器字号、自动换行、快捷键与关于',
        group: '全局',
        icon: Settings,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'new-workspace',
        title: '新建工作区',
        english: 'New workspace',
        keywords: ['new', 'tab', 'workspace'],
        description: '创建一个新的空白编辑工作区',
        group: '全局',
        hint: '+',
        icon: Plus,
        run: newWorkspace,
      },
      {
        id: 'zoom-in',
        title: '放大界面',
        english: 'Zoom in',
        keywords: ['zoom', 'scale', 'larger', 'interface', 'ui'],
        description: `当前 ${Math.round(settings.uiScale * 100)}%，按 10% 放大`,
        group: '全局',
        hint: modKey('='),
        icon: ZoomIn,
        run: () => scaleBy(UI_SCALE_STEP),
      },
      {
        id: 'zoom-out',
        title: '缩小界面',
        english: 'Zoom out',
        keywords: ['zoom', 'scale', 'smaller', 'interface', 'ui'],
        description: `当前 ${Math.round(settings.uiScale * 100)}%，按 10% 缩小`,
        group: '全局',
        hint: modKey('-'),
        icon: ZoomOut,
        run: () => scaleBy(-UI_SCALE_STEP),
      },
      {
        id: 'zoom-reset',
        title: '恢复界面缩放',
        english: 'Reset zoom',
        keywords: ['zoom', 'reset', 'scale', '100', 'interface', 'ui'],
        description: '恢复到 100%',
        group: '全局',
        hint: modKey('0'),
        icon: RotateCcw,
        run: resetUiScale,
      },
    )

    if (workspace.mode === 'json' && activeDoc) {
      items.push(
        {
          id: 'format-json',
          title: '格式化 JSON',
          english: 'Format JSON',
          keywords: ['format', 'json', 'pretty'],
          description: '按设置中的缩进格式化当前文档',
          group: '编辑',
          hint: 'JSON',
          icon: AlignJustify,
          run: () => void handleFormat(),
        },
        {
          id: 'minify-json',
          title: '压缩 JSON',
          english: 'Minify JSON',
          keywords: ['minify', 'json', 'compact'],
          description: '压缩为单行 JSON',
          group: '编辑',
          hint: 'JSON',
          icon: Minimize2,
          run: () => void handleMinify(),
        },
        {
          id: 'copy-doc',
          title: '复制当前文本',
          english: 'Copy text',
          keywords: ['copy', 'clipboard'],
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
    resetUiScale,
    scaleBy,
    setSettingsOpen,
    setWorkspaceMode,
    settings.uiScale,
    settings.wordWrap,
    showToast,
    updateSettings,
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
      {modePickerOpen ? (
        <ModePicker
          current={workspace.mode}
          onChoose={(mode) => {
            setWorkspaceMode(activeTab.id, mode)
            setModePickerOpen(false)
          }}
          onClose={() => setModePickerOpen(false)}
        />
      ) : null}
      {closePrompt ? (
        <CloseConfirmDialog
          label={closePrompt.label}
          onCancel={() => setClosePrompt(null)}
          onConfirm={confirmClose}
        />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
