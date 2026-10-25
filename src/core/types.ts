export type ToolId = 'json' | 'jq' | 'diff' | 'url' | 'time' | 'codec' | 'regex' | 'qr' | 'pipeline'
export type TabTool = ToolId | 'welcome'
export type JqEngineChoice = 'auto' | 'system' | 'jaq'

export interface JsonIssue {
  message: string
  line: number
  column: number
}

export interface JsonStats {
  bytes: number
  nodes: number
  depth: number
  objects: number
  arrays: number
}

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export interface TreeNode {
  id: number
  parent: number | null
  depth: number
  key: string
  path: string
  kind: JsonKind
  preview: string
  children: number[]
  start: number
  end: number
  keyStart: number
  keyEnd: number
}

export interface Analysis {
  valid: boolean
  issue: JsonIssue | null
  stats: JsonStats
  nodes: TreeNode[]
  root: number | null
  truncated: boolean
}

export interface OpenedFile {
  name: string
  content: string
  bytes: number
}

export interface Doc {
  id: string
  title: string
  kind: 'json' | 'text'
  text: string
  dirty: boolean
  rev: number
}

export interface Tab {
  id: string
  tool: TabTool
  docId: string
  title: string
  instance?: number
  expanded: string[]
  jqOpen?: boolean
  jqExpr?: string
  jqEngine?: JqEngineChoice
  jqInput?: string
  jqHeight?: number
  jqSplit?: number
  jqSteps?: PipelineStep[]
  diff?: DiffState
  urlTool?: UrlToolState
  timeTool?: TimeToolState
  codecTool?: CodecToolState
  regexTool?: RegexState
  qrTool?: QrToolState
  pipeline?: PipelineState
}

export interface Cursor {
  line: number
  col: number
  pos: number
}

export interface AnalysisSummary {
  valid: boolean
  issue: JsonIssue | null
  nodes: number
  bytes: number
}

export interface SystemJqInfo {
  path: string
  version: string
  sha256: string
}

export interface JqEngines {
  system: SystemJqInfo | null
  jaq: { version: string }
}

export interface JqRunError {
  message: string
  kind: string
}

export interface JqOutcome {
  engine: 'system' | 'jaq'
  engineLabel: string
  version: string
  output: string
  count: number
  durationMs: number
  error: JqRunError | null
  truncated: boolean
}

export type DiffMode = 'json' | 'text' | 'url'

export interface DiffSide {
  kind: 'tab' | 'manual'
  docId?: string
  text?: string
}

export interface DiffOptions {
  ignoreWhitespace: boolean
  ignoreCase: boolean
  ignoreTrailing: boolean
  sortKeys: boolean
  ensureAscii: boolean
  indent: number
  decodeParams: boolean
  parseJsonParams: boolean
  sortParams: boolean
  ignoreDefaultPort: boolean
}

export interface DiffState {
  mode: DiffMode
  a: DiffSide
  b: DiffSide
  options: DiffOptions
}

export interface DiffLine {
  number: number
  text: string
}

export interface DiffRow {
  kind: 'equal' | 'change' | 'add' | 'remove'
  a: DiffLine | null
  b: DiffLine | null
}

export interface DiffStats {
  added: number
  removed: number
  changed: number
  differences: number
}

export interface DiffResult {
  rows: DiffRow[]
  stats: DiffStats
}

export interface UrlDiffRow {
  section: string
  name: string
  a: string
  b: string
  kind: 'equal' | 'change' | 'add' | 'remove'
  depth?: number
}

export interface UrlDiffResult {
  rows: UrlDiffRow[]
  stats: DiffStats
}

export interface UrlToolState {
  input: string
  decode: boolean
}

export type TimeMode = 'toTime' | 'toStamp'
export type TimeUnit = 'auto' | 's' | 'ms'

export interface TimeToolState {
  mode: TimeMode
  input: string
  unit: TimeUnit
}

export type CodecDirection = 'encode' | 'decode'
export type CodecProtocol = 'base64' | 'url' | 'html' | 'unicode' | 'hex'

export interface CodecToolState {
  direction: CodecDirection
  protocol: CodecProtocol
  urlSafe: boolean
  input: string
}

export interface RegexState {
  text: string
  pattern: string
  global: boolean
  ignoreCase: boolean
  multiLine: boolean
  replace: string
  view: 'matches' | 'aggregate' | 'replace'
}

export interface RegexFlags {
  global: boolean
  ignoreCase: boolean
  multiLine: boolean
}

export interface RegexMatch {
  start: number
  end: number
  text: string
  groups: Array<string | null>
}

export interface RegexOutcome {
  matches: RegexMatch[]
  count: number
  unique: number
  durationMs: number
  error: { message: string; kind: string } | null
  truncated: boolean
}

export type QrLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrToolState {
  text: string
  level: QrLevel
  size: number
}

export type PipelineStepType = 'jq' | 'codec' | 'regex' | 'count'

export interface PipelineStep {
  id: string
  type: PipelineStepType
  expr?: string
  raw?: boolean
  protocol?: CodecProtocol
  direction?: CodecDirection
  urlSafe?: boolean
  linewise?: boolean
  pattern?: string
  flags?: RegexFlags
  sort?: 'asc' | 'desc'
}

export interface PipelineState {
  name: string
  input: string
  steps: PipelineStep[]
  split?: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type Language = 'zh-CN' | 'en-US'

export interface AppSettings {
  theme: ThemeMode
  language: Language
  editorFontSize: number
  formatIndent: 2 | 4 | 0
  wordWrap: boolean
}

