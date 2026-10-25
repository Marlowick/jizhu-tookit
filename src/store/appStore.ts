import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { defaultDiffState } from '../core/diff'
import { SAMPLE_JSON } from '../core/sample'
import { TOOL_LABEL } from '../core/tools'
import type {
  AnalysisSummary,
  AppSettings,
  CodecToolState,
  Cursor,
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
} from '../core/types'

const uid = () => Math.random().toString(36).slice(2, 10)

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  editorFontSize: 13,
  formatIndent: 2,
  wordWrap: false,
}

const WELCOME_TAB: Tab = { id: 'welcome', tool: 'welcome', docId: '', title: '欢迎', expanded: [] }

function tabTitle(tool: TabTool, doc: Doc | null): string {
  if (tool === 'welcome') return '欢迎'
  const label = TOOL_LABEL[tool]
  return doc ? `${label} · ${doc.title}` : label
}

interface AppState {
  docs: Record<string, Doc>
  tabs: Tab[]
  activeTabId: string
  paletteOpen: boolean
  splitRatio: number
  cursor: Cursor
  summary: AnalysisSummary | null
  settings: AppSettings
  settingsOpen: boolean
  toast: string | null

  openTool: (tool: ToolId, options?: { sample?: boolean; fromDocId?: string; diffState?: DiffState; pipelineState?: PipelineState }) => void
  openFile: (name: string, content: string) => void
  closeTab: (tabId: string) => void
  closeAllTabs: () => void
  activate: (tabId: string) => void
  setText: (docId: string, text: string, dirty?: boolean) => void
  saveDoc: (docId: string, name?: string) => void
  setPaletteOpen: (open: boolean) => void
  setSplitRatio: (ratio: number) => void
  setCursor: (cursor: Cursor) => void
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
      docs: {},
      tabs: [WELCOME_TAB],
      activeTabId: 'welcome',
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
          if (tabId === 'welcome') return state
          const index = state.tabs.findIndex((tab) => tab.id === tabId)
          if (index < 0) return state
          const closing = state.tabs[index]
          const tabs = state.tabs.filter((tab) => tab.id !== tabId)
          const docs = { ...state.docs }
          if (closing.docId && !tabs.some((tab) => tab.docId === closing.docId)) delete docs[closing.docId]
          const activeTabId =
            state.activeTabId === tabId ? (tabs[Math.max(0, index - 1)]?.id ?? 'welcome') : state.activeTabId
          return { tabs, docs, activeTabId, summary: null }
        }),

      activate: (tabId) =>
        set((state) => {
          if (!state.tabs.some((tab) => tab.id === tabId)) return state
          return { activeTabId: tabId, paletteOpen: false, summary: null, cursor: { line: 1, col: 1, pos: 0 } }
        }),

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
      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.72, Math.max(0.28, ratio)) }),
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

      closeAllTabs: () =>
        set({
          tabs: [WELCOME_TAB],
          docs: {},
          activeTabId: 'welcome',
          summary: null,
          cursor: { line: 1, col: 1, pos: 0 },
        }),

      showToast: (message) => {
        set({ toast: message })
        window.setTimeout(() => {
          if (get().toast === message) set({ toast: null })
        }, 2200)
      },
    }),
    {
      name: 'jizhu.session.v1',
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
        const tabs = Array.isArray(saved.tabs) && saved.tabs.length ? saved.tabs : [WELCOME_TAB]
        if (!tabs.some((tab) => tab.id === 'welcome')) tabs.unshift(WELCOME_TAB)
        const activeTabId = tabs.some((tab) => tab.id === saved.activeTabId) ? saved.activeTabId! : tabs[0].id
        return {
          ...current,
          ...saved,
          tabs,
          activeTabId,
          settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
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
