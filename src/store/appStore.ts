import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultDiffState } from '../core/diff'
import { SAMPLE_JSON } from '../core/sample'
import { DEFAULT_JSON_INDENT } from '../core/jsonIndent'
import { TOOL_LABEL } from '../core/tools'
import type {
  AnalysisSummary,
  AppSettings,
  CodecToolState,
  Cursor,
  InputSource,
  DiffState,
  Doc,
  JqEngineChoice,
  Tab,
  TabTool,
  PipelineState,
  PipelineStep,
  QrToolState,
  RegexState,
  TimeToolState,
  ToolId,
  UrlToolState,
  WorkspaceMode,
  WorkspacePanelType,
  WorkspaceState,
} from '../core/types'

const uid = () => Math.random().toString(36).slice(2, 10)

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  editorFontSize: 13,
  formatIndent: DEFAULT_JSON_INDENT,
  wordWrap: false,
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
    },
  }
  return { tab, doc }
}

const initialWorkspace = createWorkspace(1)

function tabTitle(tool: TabTool, doc: Doc | null): string {
  if (tool === 'welcome') return '欢迎'
  const label = TOOL_LABEL[tool]
  return doc ? `${label} · ${doc.title}` : label
}

interface AppState {
  docs: Record<string, Doc>
  tabs: Tab[]
  activeTabId: string
  selectionText: string
  paletteOpen: boolean
  splitRatio: number
  cursor: Cursor
  summary: AnalysisSummary | null
  settings: AppSettings
  settingsOpen: boolean
  toast: string | null

  openTool: (tool: ToolId, options?: { sample?: boolean; fromDocId?: string; diffState?: DiffState; pipelineState?: PipelineState }) => void
  newWorkspace: () => void
  setWorkspaceMode: (tabId: string, mode: WorkspaceMode) => void
  setTreeOpen: (tabId: string, open: boolean) => void
  openWorkspacePanel: (tabId: string, type: WorkspacePanelType) => void
  closeWorkspacePanel: (tabId: string, panelId: string) => void
  focusWorkspacePanel: (tabId: string, panelId: string) => void
  toggleWorkspacePanelMaximize: (tabId: string) => void
  setPanelInputSource: (tabId: string, panelId: string, source: InputSource) => void
  markPanelSeeded: (tabId: string, panelId: string) => void
  openFile: (name: string, content: string) => void
  closeTab: (tabId: string) => void
  closeAllTabs: () => void
  activate: (tabId: string) => void
  setText: (docId: string, text: string, dirty?: boolean) => void
  saveDoc: (docId: string, name?: string) => void
  setPaletteOpen: (open: boolean) => void
  setSplitRatio: (ratio: number) => void
  setCursor: (cursor: Cursor) => void
  setSelectionText: (text: string) => void
  setSummary: (summary: AnalysisSummary | null) => void
  toggleExpanded: (tabId: string, path: string) => void
  expandPaths: (tabId: string, paths: string[]) => void
  toggleJq: (tabId: string) => void
  setJqExpr: (tabId: string, expr: string) => void
  setJqEngine: (tabId: string, engine: JqEngineChoice) => void
  setJqInput: (tabId: string, input: string) => void
  setJqHeight: (tabId: string, height: number) => void
  setJqSplit: (tabId: string, split: number) => void
  setJqSteps: (tabId: string, steps: PipelineStep[]) => void
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      docs: { [initialWorkspace.doc.id]: initialWorkspace.doc },
      tabs: [initialWorkspace.tab],
      activeTabId: initialWorkspace.tab.id,
      selectionText: '',
      paletteOpen: false,
      splitRatio: 0.42,
      cursor: { line: 1, col: 1, pos: 0 },
      summary: null,
      settings: DEFAULT_SETTINGS,
      settingsOpen: false,
      toast: null,

      openTool: (tool, options) =>
        set((state) => {
          const tabId = uid()
          const instance = state.tabs.filter((tab) => tab.tool === tool).length + 1
          if (tool === 'json') {
            const docId = uid()
            const sample = options?.sample ?? false
            const jsonCount = state.tabs.filter((tab) => tab.tool === 'json').length + 1
            const doc: Doc = {
              id: docId,
              title: `Untitled-${jsonCount}.json`,
              kind: 'json',
              text: sample ? SAMPLE_JSON : '',
              dirty: false,
              rev: 0,
            }
            const tab: Tab = { id: tabId, tool, docId, title: tabTitle(tool, doc), expanded: sample ? ['', '/users'] : [''] }
            return {
              docs: { ...state.docs, [docId]: doc },
              tabs: [...state.tabs, tab],
              activeTabId: tabId,
              paletteOpen: false,
              summary: null,
              cursor: { line: 1, col: 1, pos: 0 },
            }
          }
          if (tool === 'pipeline') {
            const tab: Tab = {
              id: tabId,
              tool,
              docId: '',
              title: instance > 1 ? `${tabTitle(tool, null)} ${instance}` : tabTitle(tool, null),
              instance,
              expanded: [],
              pipeline: options?.pipelineState,
            }
            return { tabs: [...state.tabs, tab], activeTabId: tabId, paletteOpen: false }
          }
          if (tool === 'diff') {
            const tab: Tab = {
              id: tabId,
              tool,
              docId: '',
              title: instance > 1 ? `${tabTitle(tool, null)} ${instance}` : tabTitle(tool, null),
              instance,
              expanded: [],
              diff: options?.diffState ?? defaultDiffState(options?.fromDocId),
            }
            return { tabs: [...state.tabs, tab], activeTabId: tabId, paletteOpen: false }
          }
          const tab: Tab = {
            id: tabId,
            tool,
            docId: '',
            title: instance > 1 ? `${tabTitle(tool, null)} ${instance}` : tabTitle(tool, null),
            instance,
            expanded: [],
          }
          return { tabs: [...state.tabs, tab], activeTabId: tabId, paletteOpen: false }
        }),

      openFile: (name, content) =>
        set((state) => {
          const docId = uid()
          const tabId = uid()
          const titles = new Set(Object.values(state.docs).map((doc) => doc.title))
          let uniqueName = name
          if (titles.has(uniqueName)) {
            const dot = name.lastIndexOf('.')
            const base = dot > 0 ? name.slice(0, dot) : name
            const ext = dot > 0 ? name.slice(dot) : ''
            let index = 2
            while (titles.has(`${base} (${index})${ext}`)) index += 1
            uniqueName = `${base} (${index})${ext}`
          }
          const doc: Doc = { id: docId, title: uniqueName, kind: 'json', text: content, dirty: false, rev: 0 }
          const tab: Tab = { id: tabId, tool: 'json', docId, title: tabTitle('json', doc), expanded: [''] }
          return {
            docs: { ...state.docs, [docId]: doc },
            tabs: [...state.tabs, tab],
            activeTabId: tabId,
            paletteOpen: false,
            summary: null,
            cursor: { line: 1, col: 1, pos: 0 },
          }
        }),

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
            paletteOpen: false,
            summary: null,
            cursor: { line: 1, col: 1, pos: 0 },
          }
        }),

      setSelectionText: (text) => set({ selectionText: text }),

      setText: (docId, text, dirty = true) =>
        set((state) => {
          const doc = state.docs[docId]
          if (!doc) return state
          return {
            docs: { ...state.docs, [docId]: { ...doc, text, dirty, rev: doc.rev + 1 } },
          }
        }),

      saveDoc: (docId, name) =>
        set((state) => {
          const doc = state.docs[docId]
          if (!doc) return state
          const nextTitle = name ?? doc.title
          const tabs = state.tabs.map((tab) =>
            tab.docId === docId ? { ...tab, title: tabTitle(tab.tool, { ...doc, title: nextTitle }) } : tab,
          )
          return { docs: { ...state.docs, [docId]: { ...doc, title: nextTitle, dirty: false } }, tabs }
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

      toggleJq: (tabId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqOpen: !tab.jqOpen } : tab)),
        })),

      setJqExpr: (tabId, expr) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqExpr: expr } : tab)),
        })),

      setJqEngine: (tabId, engine) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqEngine: engine } : tab)),
        })),

      setJqInput: (tabId, input) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqInput: input } : tab)),
        })),

      setJqHeight: (tabId, height) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqHeight: height } : tab)),
        })),

      setJqSplit: (tabId, split) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqSplit: split } : tab)),
        })),

      setJqSteps: (tabId, steps) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, jqSteps: steps } : tab)),
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

      closeAllTabs: () => {
        const created = createWorkspace(1)
        set({
          tabs: [created.tab],
          docs: { [created.doc.id]: created.doc },
          activeTabId: created.tab.id,
          selectionText: '',
          summary: null,
          cursor: { line: 1, col: 1, pos: 0 },
        })
      },

      newWorkspace: () =>
        set((state) => {
          const created = createWorkspace(state.tabs.length + 1)
          return {
            tabs: [...state.tabs, created.tab],
            docs: { ...state.docs, [created.doc.id]: created.doc },
            activeTabId: created.tab.id,
            selectionText: '',
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

      openWorkspacePanel: (tabId, type) => {
        const state = get()
        const tab = state.tabs.find((item) => item.id === tabId)
        const workspace = tab?.workspace
        if (!tab || !workspace) return
        const existing = workspace.panels.find((panel) => panel.type === type)
        if (existing) {
          set((current) => ({
            tabs: current.tabs.map((item) =>
              item.id === tabId && item.workspace
                ? { ...item, workspace: { ...item.workspace, activePanelId: existing.id, maximizedPanelId: null } }
                : item,
            ),
          }))
          return
        }
        if (workspace.panels.length >= 3) {
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
                    panels: [...item.workspace.panels, panel],
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
      version: 1,
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
                workspace: {
                  ...tab.workspace,
                  panels: tab.workspace.panels.map((panel) => ({
                    ...panel,
                    source: panel.source ?? 'tab',
                    seeded: panel.seeded ?? true,
                  })),
                },
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
          settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}), theme: 'dark' },
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
