import { create } from 'zustand'
import { persist, type PersistStorage } from 'zustand/middleware'
import { DEFAULT_JSON_INDENT } from '../core/jsonIndent'
import { TOOL_LABEL } from '../core/tools'
import { clampUiScale } from '../core/uiScale'
import type {
  AnalysisSummary,
  AppSettings,
  CodecToolState,
  Cursor,
  EditorHighlights,
  InputSource,
  DiffState,
  Doc,
  Tab,
  PipelineState,
  QrToolState,
  RegexState,
  TimeToolState,
  UrlToolState,
  WorkspaceMode,
  SideToolType,
  WorkspacePanel,
  WorkspacePanelType,
  WorkspaceState,
} from '../core/types'

const uid = () => Math.random().toString(36).slice(2, 10)

function normalizeTheme(value: unknown): import('../core/types').ThemeMode {
  if (value === 'solarized-dark' || value === 'solarized-light' || value === 'ghostty') return value
  return 'light'
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  language: 'zh-CN',
  editorFontSize: 12.5,
  uiScale: 1,
  formatIndent: DEFAULT_JSON_INDENT,
  wordWrap: true,
}

function createWorkspace(index: number): { tab: Tab; doc: Doc } {
  const docId = uid()
  const tabId = uid()
  const doc: Doc = {
    id: docId,
    title: `untitled-${index}`,
    kind: 'text',
    text: '',
    dirty: false,
    rev: 0,
  }
  const tab: Tab = {
    id: tabId,
    tool: 'json',
    docId,
    title: String(index),
    treeOpen: true,
    expanded: [''],
    workspace: {
      mode: 'plain',
      panels: [],
      activePanelId: null,
      maximizedPanelId: null,
      sideSplit: 0.55,
    },
  }
  return { tab, doc }
}

const initialWorkspace = createWorkspace(1)

type PersistedState = Pick<AppState, 'docs' | 'tabs' | 'activeTabId' | 'splitRatio' | 'settings'>

interface AppState {
  docs: Record<string, Doc>
  tabs: Tab[]
  activeTabId: string
  selectionText: string
  editorHighlights: EditorHighlights | null
  paletteOpen: boolean
  splitRatio: number
  cursor: Cursor
  summary: AnalysisSummary | null
  settings: AppSettings
  settingsOpen: boolean
  toast: string | null

  newWorkspace: () => void
  setWorkspaceMode: (tabId: string, mode: WorkspaceMode) => void
  setTreeOpen: (tabId: string, open: boolean) => void
  setSideSplit: (tabId: string, ratio: number) => void
  openWorkspacePanel: (tabId: string, type: WorkspacePanelType) => void
  closeSideTool: (tabId: string) => void
  closeWorkspacePanel: (tabId: string, panelId: string) => void
  focusWorkspacePanel: (tabId: string, panelId: string) => void
  toggleWorkspacePanelMaximize: (tabId: string) => void
  setPanelInputSource: (tabId: string, panelId: string, source: InputSource) => void
  markPanelSeeded: (tabId: string, panelId: string) => void
  closeTab: (tabId: string) => void
  activate: (tabId: string) => void
  setText: (docId: string, text: string, dirty?: boolean) => void
  setPaletteOpen: (open: boolean) => void
  setSplitRatio: (ratio: number) => void
  setCursor: (cursor: Cursor) => void
  setSelectionText: (text: string) => void
  setEditorHighlights: (highlights: EditorHighlights | null) => void
  setSummary: (summary: AnalysisSummary | null) => void
  toggleExpanded: (tabId: string, path: string) => void
  expandPaths: (tabId: string, paths: string[]) => void
  setJqExpr: (tabId: string, expr: string) => void
  setJqInput: (tabId: string, input: string) => void
  setDiffState: (tabId: string, state: DiffState) => void
  setUrlTool: (tabId: string, state: UrlToolState) => void
  setTimeTool: (tabId: string, state: TimeToolState) => void
  setCodecTool: (tabId: string, state: CodecToolState) => void
  setRegexTool: (tabId: string, state: RegexState) => void
  setQrTool: (tabId: string, state: QrToolState) => void
  setPipeline: (tabId: string, state: PipelineState) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  setSettingsOpen: (open: boolean) => void
  showToast: (message: string) => void
}

const PERSIST_DELAY_MS = 220

const debouncedStorage: PersistStorage<PersistedState> = (() => {
  let timer: number | null = null
  let pending: { name: string; value: { state: PersistedState; version?: number } } | null = null

  const flush = () => {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
    if (!pending) return
    try {
      window.localStorage.setItem(pending.name, JSON.stringify(pending.value))
    } catch {
      // Storage can be unavailable in private/restricted contexts.
    }
    pending = null
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    getItem: (name) => {
      try {
        const raw = window.localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as { state: PersistedState; version?: number }) : null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      pending = { name, value }
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(flush, PERSIST_DELAY_MS)
    },
    removeItem: (name) => {
      pending = null
      if (timer != null) window.clearTimeout(timer)
      window.localStorage.removeItem(name)
    },
  }
})()

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      docs: { [initialWorkspace.doc.id]: initialWorkspace.doc },
      tabs: [initialWorkspace.tab],
      activeTabId: initialWorkspace.tab.id,
      selectionText: '',
      editorHighlights: null,
      paletteOpen: false,
      splitRatio: 0.42,
      cursor: { line: 1, col: 1, pos: 0 },
      summary: null,
      settings: DEFAULT_SETTINGS,
      settingsOpen: false,
      toast: null,

      closeTab: (tabId) =>
        set((state) => {
          const index = state.tabs.findIndex((tab) => tab.id === tabId)
          if (index < 0) return state
          const closing = state.tabs[index]
          const remaining = state.tabs.filter((tab) => tab.id !== tabId)
          if (!remaining.length) {
            const created = createWorkspace(1)
            return {
              tabs: [created.tab],
              docs: { [created.doc.id]: created.doc },
              activeTabId: created.tab.id,
              selectionText: '',
              summary: null,
              cursor: { line: 1, col: 1, pos: 0 },
            }
          }
          const docs = { ...state.docs }
          if (closing.docId && !remaining.some((tab) => tab.docId === closing.docId)) delete docs[closing.docId]
          const activeTabId =
            state.activeTabId === tabId ? remaining[Math.max(0, index - 1)]?.id ?? remaining[0].id : state.activeTabId
          return {
            tabs: remaining,
            docs,
            activeTabId,
            selectionText: state.activeTabId === tabId ? '' : state.selectionText,
            summary: null,
            cursor: state.activeTabId === tabId ? { line: 1, col: 1, pos: 0 } : state.cursor,
          }
        }),

      activate: (tabId) =>
        set((state) => {
          if (!state.tabs.some((tab) => tab.id === tabId)) return state
          return {
            activeTabId: tabId,
            selectionText: '',
            editorHighlights: null,
            paletteOpen: false,
            summary: null,
            cursor: { line: 1, col: 1, pos: 0 },
          }
        }),

      setSelectionText: (text) => set({ selectionText: text }),

      setEditorHighlights: (highlights) => set({ editorHighlights: highlights }),

      setText: (docId, text, dirty = true) =>
        set((state) => {
          const doc = state.docs[docId]
          if (!doc) return state
          return {
            docs: { ...state.docs, [docId]: { ...doc, text, dirty, rev: doc.rev + 1 } },
          }
        }),

      setPaletteOpen: (open) => set({ paletteOpen: open }),
      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.72, Math.max(0.15, ratio)) }),
      setCursor: (cursor) => set({ cursor }),
      setSummary: (summary) => set({ summary }),

      toggleExpanded: (tabId, path) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== tabId) return tab
            const open = tab.expanded.includes(path)
            return { ...tab, expanded: open ? tab.expanded.filter((item) => item !== path) : [...tab.expanded, path] }
          }),
        })),

      expandPaths: (tabId, paths) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== tabId) return tab
            const merged = new Set(tab.expanded)
            for (const path of paths) merged.add(path)
            return { ...tab, expanded: [...merged] }
          }),
        })),

      setJqExpr: (tabId, expr) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqExpr: expr } : tab)),
        })),


      setJqInput: (tabId, input) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqInput: input } : tab)),
        })),

      setDiffState: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, diff: next } : tab)),
        })),

      setUrlTool: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, urlTool: next } : tab)),
        })),

      setTimeTool: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, timeTool: next } : tab)),
        })),

      setCodecTool: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, codecTool: next } : tab)),
        })),

      setRegexTool: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, regexTool: next } : tab)),
        })),

      setQrTool: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, qrTool: next } : tab)),
        })),

      setPipeline: (tabId, next) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, pipeline: next } : tab)),
        })),

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      setSettingsOpen: (open) => set({ settingsOpen: open }),

      newWorkspace: () =>
        set((state) => {
          const created = createWorkspace(state.tabs.length + 1)
          return {
            tabs: [...state.tabs, created.tab],
            docs: { ...state.docs, [created.doc.id]: created.doc },
            activeTabId: created.tab.id,
            selectionText: '',
            editorHighlights: null,
            paletteOpen: false,
            summary: null,
            cursor: { line: 1, col: 1, pos: 0 },
          }
        }),

      setWorkspaceMode: (tabId, mode) =>
        set((state) => ({
          selectionText: '',
          summary: null,
          tabs: state.tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  treeOpen: mode === 'json' ? true : tab.treeOpen,
                  workspace: {
                    ...(tab.workspace ?? { panels: [], activePanelId: null, maximizedPanelId: null }),
                    mode,
                  },
                }
              : tab,
          ),
        })),

      setTreeOpen: (tabId, open) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, treeOpen: open } : tab)),
        })),

      setSideSplit: (tabId, ratio) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.workspace
              ? {
                  ...tab,
                  workspace: {
                    ...tab.workspace,
                    sideSplit: Math.min(0.72, Math.max(0.28, ratio)),
                  },
                }
              : tab,
          ),
        })),

      closeSideTool: (tabId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.workspace
              ? { ...tab, workspace: { ...tab.workspace, sideTool: undefined } }
              : tab,
          ),
        })),

      openWorkspacePanel: (tabId, type) => {
        const state = get()
        const tab = state.tabs.find((item) => item.id === tabId)
        const workspace = tab?.workspace
        if (!tab || !workspace) return
        // 二维码 / URL / 编码 / 时间使用右侧专用分屏，一次只显示一个。
        const sideTypes: WorkspacePanelType[] = ['qr', 'url', 'codec', 'time', 'jq', 'regex', 'pipeline', 'data', 'curl', 'mermaid']
        if (sideTypes.includes(type)) {
          set((current) => ({
            selectionText: '',
            tabs: current.tabs.map((item) =>
              item.id === tabId && item.workspace
                ? {
                    ...item,
                    workspace: {
                      ...item.workspace,
                      sideTool: type as SideToolType,
                      panels: [],
                      activePanelId: null,
                      maximizedPanelId: null,
                    },
                  }
                : item,
            ),
          }))
          return
        }

        const panels = workspace.panels.filter((panel) => !sideTypes.includes(panel.type))
        const existing = panels.find((panel) => panel.type === type)
        if (existing) {
          set((current) => ({
            tabs: current.tabs.map((item) =>
              item.id === tabId && item.workspace
                ? {
                    ...item,
                    workspace: { ...item.workspace, sideTool: undefined, panels, activePanelId: existing.id, maximizedPanelId: null },
                  }
                : item,
            ),
          }))
          return
        }
        if (panels.length >= 3) {
          get().showToast('最多同时打开 3 个面板')
          return
        }
        const selectionText = state.selectionText
        const source: InputSource = selectionText.length ? 'selection' : 'tab'
        const panel = { id: uid(), type, source, selectionText: selectionText || undefined, seeded: false }
        set((current) => ({
          selectionText: '',
          tabs: current.tabs.map((item) =>
            item.id === tabId && item.workspace
              ? {
                  ...item,
                  workspace: {
                    ...item.workspace,
                    sideTool: undefined,
                    panels: [...panels, panel],
                    activePanelId: panel.id,
                    maximizedPanelId: null,
                  },
                }
              : item,
          ),
        }))
      },

      closeWorkspacePanel: (tabId, panelId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== tabId || !tab.workspace) return tab
            const panels = tab.workspace.panels.filter((panel) => panel.id !== panelId)
            const activePanelId =
              tab.workspace.activePanelId === panelId
                ? panels[panels.length - 1]?.id ?? null
                : tab.workspace.activePanelId
            return {
              ...tab,
              workspace: {
                ...tab.workspace,
                panels,
                activePanelId,
                maximizedPanelId: tab.workspace.maximizedPanelId === panelId ? null : tab.workspace.maximizedPanelId,
              },
            }
          }),
          selectionText: state.selectionText,
        })),

      setPanelInputSource: (tabId, panelId, source) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.workspace
              ? {
                  ...tab,
                  workspace: {
                    ...tab.workspace,
                    panels: tab.workspace.panels.map((panel) =>
                      panel.id === panelId ? { ...panel, source, seeded: false } : panel,
                    ),
                  },
                }
              : tab,
          ),
        })),

      markPanelSeeded: (tabId, panelId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.workspace
              ? {
                  ...tab,
                  workspace: {
                    ...tab.workspace,
                    panels: tab.workspace.panels.map((panel) =>
                      panel.id === panelId ? { ...panel, seeded: true } : panel,
                    ),
                  },
                }
              : tab,
          ),
        })),

      focusWorkspacePanel: (tabId, panelId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.workspace
              ? { ...tab, workspace: { ...tab.workspace, activePanelId: panelId } }
              : tab,
          ),
        })),

      toggleWorkspacePanelMaximize: (tabId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== tabId || !tab.workspace) return tab
            return {
              ...tab,
              workspace: {
                ...tab.workspace,
                maximizedPanelId:
                  tab.workspace.maximizedPanelId === tab.workspace.activePanelId
                    ? null
                    : tab.workspace.activePanelId,
              },
            }
          }),
        })),

      showToast: (message) => {
        set({ toast: message })
        window.setTimeout(() => {
          if (get().toast === message) set({ toast: null })
        }, 2200)
      },
    }),
    {
      name: 'jizhu.workspace.v2',
      version: 2,
      storage: debouncedStorage,
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Partial<PersistedState>
        if (version < 2) {
          return {
            ...saved,
            settings: {
              ...DEFAULT_SETTINGS,
              ...(saved.settings ?? {}),
              theme: normalizeTheme(saved.settings?.theme),
              wordWrap: true,
              uiScale: clampUiScale(saved.settings?.uiScale ?? DEFAULT_SETTINGS.uiScale),
            },
          } as PersistedState
        }
        return saved as PersistedState
      },
      partialize: (state) => ({
        docs: state.docs,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        splitRatio: state.splitRatio,
        settings: state.settings,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>
        const savedTabs = Array.isArray(saved.tabs) ? saved.tabs.filter((tab) => tab.workspace) : []
        const tabs = (savedTabs.length ? savedTabs : [initialWorkspace.tab]).map((tab) =>
          tab.workspace
            ? {
                ...tab,
                treeOpen: tab.treeOpen ?? true,
                workspace: (() => {
                  const normalized = tab.workspace.panels.map((panel) => ({
                    ...panel,
                    source: panel.source ?? 'tab',
                    seeded: panel.seeded ?? true,
                  }))
                  const legacySide = normalized.find((panel) => panel.type === 'qr')
                  const sideTool = tab.workspace.sideTool ?? (legacySide ? 'qr' : undefined)
                  return {
                    ...tab.workspace,
                    sideTool,
                    sideSplit: tab.workspace.sideSplit ?? tab.workspace.qrSplit ?? 0.55,
                    panels: sideTool
                      ? []
                      : normalized.filter((panel) => !['qr', 'url', 'codec', 'time', 'jq', 'regex', 'pipeline', 'data', 'curl', 'mermaid'].includes(panel.type)),
                  }
                })(),
              }
            : tab,
        )
        const docs = savedTabs.length
          ? (saved.docs ?? {})
          : { [initialWorkspace.doc.id]: initialWorkspace.doc }
        const activeTabId = tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId! : tabs[0].id
        return {
          ...current,
          ...saved,
          docs,
          tabs,
          activeTabId,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(saved.settings ?? {}),
            theme: normalizeTheme(saved.settings?.theme),
            uiScale: clampUiScale(saved.settings?.uiScale ?? DEFAULT_SETTINGS.uiScale),
          },
          paletteOpen: false,
          settingsOpen: false,
          summary: null,
          toast: null,
        }
      },
    },
  ),
)

export const selectActiveTab = (state: AppState): Tab | undefined =>
  state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]

export const selectActiveDoc = (state: AppState): Doc | null => {
  const tab = selectActiveTab(state)
  return tab ? (state.docs[tab.docId] ?? null) : null
}
