import { DEFAULT_JSON_INDENT } from './jsonIndent'
import type { DiffMode, DiffOptions, DiffState } from './types'

export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignoreWhitespace: false,
  ignoreCase: false,
  ignoreTrailing: false,
  sortKeys: true,
  ensureAscii: false,
  indent: DEFAULT_JSON_INDENT,
  decodeParams: true,
  parseJsonParams: true,
  sortParams: false,
  ignoreDefaultPort: true,
}

export const DIFF_MODE_LABELS: Record<DiffMode, string> = {
  json: 'JSON 结构化',
  text: '文本对比',
  url: 'URL 结构化',
}

export function defaultDiffState(fromDocId?: string): DiffState {
  return {
    mode: 'json',
    a: fromDocId ? { kind: 'tab', docId: fromDocId } : { kind: 'manual', text: '' },
    b: { kind: 'manual', text: '' },
    options: { ...DEFAULT_DIFF_OPTIONS },
  }
}
