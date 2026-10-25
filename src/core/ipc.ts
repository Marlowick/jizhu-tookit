import { invoke } from '@tauri-apps/api/core'
import { analyzeLocally, formatLocally, minifyLocally } from './fallback'
import type {
  Analysis,
  DiffOptions,
  DiffResult,
  JqEngines,
  JqEngineChoice,
  JqOutcome,
  OpenedFile,
  RegexFlags,
  RegexOutcome,
  UrlDiffResult,
} from './types'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; line?: unknown; column?: unknown }
    if (typeof value.message === 'string') {
      if (typeof value.line === 'number') {
        return `第 ${value.line} 行第 ${value.column ?? 1} 列：${value.message}`
      }
      return value.message
    }
  }
  return String(error)
}

export async function notifyUiReady(): Promise<void> {
  if (!isTauri) return
  try {
    await invoke('ui_ready')
  } catch {
    // 握手失败不应影响使用
  }
}

export async function jqEngines(): Promise<JqEngines> {
  if (isTauri) return invoke<JqEngines>('jq_engines')
  return { system: null, jaq: { version: '3.1' } }
}

export async function jqRun(
  input: string,
  program: string,
  engine: JqEngineChoice,
  raw = false,
): Promise<JqOutcome> {
  if (!isTauri) throw new Error('浏览器预览不支持 jq 执行，请使用桌面端')
  return invoke<JqOutcome>('jq_run', { input, program, engine, raw })
}

function diffUnavailable(): never {
  throw new Error('浏览器预览不支持 diff，请使用桌面端打开')
}

export async function diffText(a: string, b: string, options: DiffOptions): Promise<DiffResult> {
  if (!isTauri) return diffUnavailable()
  return invoke<DiffResult>('diff_text', { a, b, options })
}

export async function diffJson(a: string, b: string, options: DiffOptions): Promise<DiffResult> {
  if (!isTauri) return diffUnavailable()
  return invoke<DiffResult>('diff_json', { a, b, options })
}

export async function diffUrl(a: string, b: string, options: DiffOptions): Promise<UrlDiffResult> {
  if (!isTauri) return diffUnavailable()
  return invoke<UrlDiffResult>('diff_url', { a, b, options })
}

export async function regexRun(
  text: string,
  pattern: string,
  flags: RegexFlags,
): Promise<RegexOutcome> {
  if (!isTauri) throw new Error('浏览器预览不支持正则 worker，请使用桌面端打开')
  return invoke<RegexOutcome>('regex_run', { text, pattern, flags })
}

export async function analyzeJson(text: string, maxNodes?: number): Promise<Analysis> {
  if (isTauri) return invoke<Analysis>('json_analyze', { text, maxNodes })
  return analyzeLocally(text, maxNodes)
}

export async function formatJson(text: string, indent: number, sortKeys: boolean): Promise<string> {
  if (isTauri) return invoke<string>('json_format', { text, indent, sortKeys })
  return formatLocally(text, indent, sortKeys)
}

export async function minifyJson(text: string): Promise<string> {
  if (isTauri) return invoke<string>('json_minify', { text })
  return minifyLocally(text)
}

export async function copyText(text: string): Promise<void> {
  if (isTauri) {
    await invoke('copy_text', { text })
    return
  }
  await navigator.clipboard.writeText(text)
}

export async function openTextFile(): Promise<OpenedFile | null> {
  if (isTauri) return invoke<OpenedFile | null>('open_text_file')
  return pickFileInBrowser()
}

export async function saveBinaryFile(name: string, bytes: Uint8Array): Promise<boolean> {
  if (isTauri) {
    const saved = await invoke<string | null>('save_binary_file', {
      suggestedName: name,
      bytes: Array.from(bytes),
    })
    return Boolean(saved)
  }
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], {
    type: name.endsWith('.svg') ? 'image/svg+xml' : 'image/png',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

export async function saveTextFile(name: string, content: string): Promise<string | null> {
  if (isTauri) return invoke<string | null>('save_text_file', { suggestedName: name, content })
  downloadInBrowser(name, content)
  return name
}

function pickFileInBrowser(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.txt,.log,application/json,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      if (file.size > 100 * 1024 * 1024) {
        reject(new Error('文件超过 100MB，暂不支持'))
        return
      }
      resolve({ name: file.name, content: await file.text(), bytes: file.size })
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

function downloadInBrowser(name: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
