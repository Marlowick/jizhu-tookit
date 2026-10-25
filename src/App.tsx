import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlignJustify,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Minimize2,
  Settings,
  X,
  Zap,
} from 'lucide-react'
import { CommandPalette } from './components/CommandPalette'
import { ComingSoon } from './components/ComingSoon'
import { JsonTool } from './components/JsonTool'
import { CodecTool } from './components/CodecTool'
import { DiffTool } from './components/DiffTool'
import { JqTool } from './components/JqTool'
import { PipelineTool } from './components/PipelineTool'
import { QrTool } from './components/QrTool'
import { RegexTool } from './components/RegexTool'
import { TimeTool } from './components/TimeTool'
import { UrlTool } from './components/UrlTool'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { NewTabPicker } from './components/NewTabPicker'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { ToolHeader } from './components/ToolHeader'
import { WelcomeView } from './components/WelcomeView'
import type { CommandItem } from './core/commands'
import {
  copyText,
  errorMessage,
  formatJson,
  isTauri,
  minifyJson,
  notifyUiReady,
  openTextFile,
  saveTextFile,
} from './core/ipc'
import { isModPressed, modKey } from './core/keyboard'
import { TOOLS, toolMeta } from './core/tools'
import { toolTitle } from './core/i18n'
import { useI18n } from './core/useI18n'
import type { ToolId } from './core/types'
import {
  selectActiveDoc,
  selectActiveTab,
  useAppStore,
} from './store/appStore'

export default function App() {
  const activeTab = useAppStore(selectActiveTab)
  const activeDoc = useAppStore(selectActiveDoc)
  const summary = useAppStore((state) => state.summary)
  const paletteOpen = useAppStore((state) => state.paletteOpen)
  const toast = useAppStore((state) => state.toast)
  const settings = useAppStore((state) => state.settings)
  const settingsOpen = useAppStore((state) => state.settingsOpen)
  const [systemDark, setSystemDark] = useState(false)
  const [newTabOpen, setNewTabOpen] = useState(false)
  const { language, t } = useI18n()

  const openTool = useAppStore((state) => state.openTool)
  const openFile = useAppStore((state) => state.openFile)
  const saveDoc = useAppStore((state) => state.saveDoc)
  const closeTab = useAppStore((state) => state.closeTab)
  const closeAllTabs = useAppStore((state) => state.closeAllTabs)
  const activate = useAppStore((state) => state.activate)
  const setText = useAppStore((state) => state.setText)
  const setPaletteOpen = useAppStore((state) => state.setPaletteOpen)
  const toggleJq = useAppStore((state) => state.toggleJq)
  const showToast = useAppStore((state) => state.showToast)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const handleFormat = useCallback(async () => {
    if (!activeDoc) return
    try {
      const output = await formatJson(activeDoc.text, settings.formatIndent, false)
      setText(activeDoc.id, output)
      showToast('已格式化')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, setText, showToast, settings.formatIndent])

  const handleMinify = useCallback(async () => {
    if (!activeDoc) return
    try {
      const output = await minifyJson(activeDoc.text)
      setText(activeDoc.id, output)
      showToast('已压缩')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, setText, showToast])

  const handleCopy = useCallback(async () => {
    if (!activeDoc) return
    try {
      await copyText(activeDoc.text)
      showToast('已复制到剪贴板')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, showToast])

  const handleImport = useCallback(async () => {
    try {
      const file = await openTextFile()
      if (!file) return
      openFile(file.name, file.content)
      showToast(`已导入 ${file.name}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [openFile, showToast])

  const handleSave = useCallback(async () => {
    if (!activeDoc) return
    try {
      const name = await saveTextFile(activeDoc.title, activeDoc.text)
      if (!name) return
      saveDoc(activeDoc.id, name)
      showToast(`已导出 ${name}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }, [activeDoc, saveDoc, showToast])

  const handleCloseActive = useCallback(() => {
    if (!activeTab || activeTab.tool === 'welcome') return
    closeTab(activeTab.id)
  }, [activeTab, closeTab])

  const handleOpenFromWelcome = useCallback(
    (tool: ToolId) => {
      openTool(tool, tool === 'json' ? { sample: true } : undefined)
    },
    [openTool],
  )

  useEffect(() => {
    void notifyUiReady()
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(media.matches)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const resolved = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
    document.documentElement.lang = settings.language
    document.documentElement.style.setProperty('--editor-font-size', `${settings.editorFontSize}px`)
  }, [settings.editorFontSize, settings.language, settings.theme, systemDark])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!paletteOpen && activeTab?.tool === 'json' && activeTab.jqOpen) {
          event.preventDefault()
          toggleJq(activeTab.id)
        }
        return
      }
      if (!isModPressed(event)) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setPaletteOpen(!paletteOpen)
        return
      }
      if (key === 'w') {
        event.preventDefault()
        if (event.shiftKey) closeAllTabs()
        else handleCloseActive()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        void handleImport()
        return
      }
      if (key === 's') {
        event.preventDefault()
        void handleSave()
        return
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        void handleFormat()
        return
      }
      if (key === 'j' && activeTab?.tool === 'json') {
        event.preventDefault()
        toggleJq(activeTab.id)
        return
      }
      if (key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    paletteOpen,
    setPaletteOpen,
    openTool,
    handleCloseActive,
    closeAllTabs,
    handleImport,
    handleSave,
    handleFormat,
    activeTab,
    toggleJq,
    setSettingsOpen,
    language,
  ])

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    if (activeDoc) {
      items.push(
        {
          id: 'format',
          title: t('command.format'),
          group: t('group.actions'),
          hint: modKey('⇧F'),
          icon: AlignJustify,
          run: () => void handleFormat(),
        },
        {
          id: 'minify',
          title: t('command.minify'),
          group: t('group.actions'),
          hint: t('command.singleLine'),
          icon: Minimize2,
          run: () => void handleMinify(),
        },
        {
          id: 'copy',
          title: t('command.copy'),
          group: t('group.actions'),
          hint: t('command.clipboard'),
          icon: Copy,
          run: () => void handleCopy(),
        },
      )
    }

    items.push(
      {
        id: 'settings',
        title: t('command.settings'),
        group: t('group.global'),
        hint: modKey(','),
        icon: Settings,
        run: () => setSettingsOpen(true),
      },
      {
        id: 'import',
        title: t('command.import'),
        group: t('group.document'),
        hint: modKey('O'),
        icon: FolderOpen,
        run: () => void handleImport(),
      },
      {
        id: 'export',
        title: t('command.export'),
        group: t('group.document'),
        hint: modKey('S'),
        icon: Download,
        run: () => void handleSave(),
      },
    )

    if (activeTab?.tool === 'json') {
      items.push({
        id: 'jq-panel',
        title: t('command.jq'),
        group: t('group.actions'),
        hint: modKey('J'),
        icon: Zap,
        run: () => {
          if (!activeTab.jqOpen) toggleJq(activeTab.id)
        },
      })
    }

    if (activeTab && activeTab.tool !== 'welcome') {
      items.push(
        {
          id: 'close-tab',
          title: t('command.closeTab'),
          group: t('group.document'),
          hint: modKey('W'),
          icon: X,
          run: handleCloseActive,
        },
        {
          id: 'close-all-tabs',
          title: t('command.closeAll'),
          group: t('group.document'),
          hint: `⇧${modKey('W')}`,
          icon: X,
          run: closeAllTabs,
        },
      )
    }

    items.push({
      id: 'open-json',
      title: t('command.newJson'),
      group: t('group.openTool'),
      icon: FileJson,
      run: () => openTool('json'),
    })

    for (const tool of TOOLS) {
      if (tool.id === 'json') continue
      items.push({
        id: `open-${tool.id}`,
        title: toolTitle(tool.id, language),
        group: t('group.openTool'),
        hint: t('command.newTab'),
        icon: tool.icon,
        run: () =>
          openTool(
            tool.id,
            tool.id === 'diff' && activeDoc ? { fromDocId: activeDoc.id } : undefined,
          ),
      })
    }

    return items
  }, [
    activeDoc,
    activeTab,
    handleFormat,
    handleMinify,
    handleCopy,
    handleImport,
    handleSave,
    handleCloseActive,
    closeAllTabs,
    openTool,
    toggleJq,
    setSettingsOpen,
    language,
  ])

  const meta = activeTab && activeTab.tool !== 'welcome' ? toolMeta(activeTab.tool) : null

  return (
    <div className="app">
      <TitleBar showMockTraffic={!isTauri} />
      <TabBar onNewTab={() => setNewTabOpen(true)} />

      {activeTab?.tool === 'json' && activeDoc ? (
        <ToolHeader
          doc={activeDoc}
          summary={summary}
          jqOpen={Boolean(activeTab.jqOpen)}
          onImport={() => void handleImport()}
          onExport={() => void handleSave()}
          onFormat={() => void handleFormat()}
          onMinify={() => void handleMinify()}
          onToggleJq={() => toggleJq(activeTab.id)}
        />
      ) : null}

      <main className="workspace">
        {!activeTab || activeTab.tool === 'welcome' ? (
          <WelcomeView onOpen={handleOpenFromWelcome} />
        ) : activeTab.tool === 'json' && activeDoc ? (
          <JsonTool key={activeTab.id} tab={activeTab} doc={activeDoc} />
        ) : activeTab.tool === 'jq' ? (
          <JqTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'diff' ? (
          <DiffTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'url' ? (
          <UrlTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'time' ? (
          <TimeTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'codec' ? (
          <CodecTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'regex' ? (
          <RegexTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'qr' ? (
          <QrTool key={activeTab.id} tab={activeTab} />
        ) : activeTab.tool === 'pipeline' ? (
          <PipelineTool key={activeTab.id} tab={activeTab} />
        ) : meta ? (
          <ComingSoon
            title={meta.title}
            description={meta.desc}
            icon={meta.icon}
            onBack={() => activate('welcome')}
          />
        ) : null}
      </main>

      <StatusBar />

      {settingsOpen ? <SettingsDialog /> : null}
      {newTabOpen ? <NewTabPicker onClose={() => setNewTabOpen(false)} /> : null}
      {paletteOpen ? (
        <CommandPalette items={commands} onClose={() => setPaletteOpen(false)} />
      ) : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
