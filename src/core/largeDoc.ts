/** 文档规模阈值（按 UTF-16 长度近似；中文会略早触发）。 */
export const LARGE_DOC_CHARS = 1_000_000
export const HUGE_DOC_CHARS = 5_000_000

export type DocMode = 'normal' | 'large' | 'huge'

export interface AnalysisPlan {
  mode: DocMode
  debounceMs: number
  maxNodes: number | undefined
}

export function docModeFor(length: number): DocMode {
  if (length >= HUGE_DOC_CHARS) return 'huge'
  if (length >= LARGE_DOC_CHARS) return 'large'
  return 'normal'
}

export function analysisPlan(mode: DocMode): AnalysisPlan {
  switch (mode) {
    case 'huge':
      return { mode, debounceMs: 0, maxNodes: 10_000 }
    case 'large':
      return { mode, debounceMs: 500, maxNodes: 25_000 }
    default:
      return { mode, debounceMs: 120, maxNodes: undefined }
  }
}

export function formatCharCount(length: number): string {
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(1)}M 字符`
  if (length >= 1_000) return `${Math.round(length / 1_000)}K 字符`
  return `${length} 字符`
}
