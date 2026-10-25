import type { Analysis, JsonKind, JsonStats, TreeNode } from './types'

const DEFAULT_MAX_NODES = 200_000
const MIN_MAX_NODES = 1_000
const PREVIEW_LIMIT = 64

function kindOf(value: unknown): JsonKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      return 'string'
  }
}

function truncate(text: string, limit = PREVIEW_LIMIT): string {
  const chars = Array.from(text)
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : text
}

function pointerEscape(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** 浏览器预览用的带 span 解析器（索引为 UTF-16 code unit，与 JS 字符串一致）。 */
class SpanBuilder {
  private text: string
  private pos = 0
  private nodes: TreeNode[] = []
  private stats: JsonStats
  private truncated = false
  private maxNodes: number

  constructor(text: string, maxNodes = DEFAULT_MAX_NODES) {
    this.text = text
    this.maxNodes = Math.max(MIN_MAX_NODES, maxNodes)
    this.stats = {
      bytes: new TextEncoder().encode(text).length,
      nodes: 0,
      depth: 0,
      objects: 0,
      arrays: 0,
    }
  }

  parse(): Analysis {
    try {
      const root = this.value('root', '', null, 0)
      this.skipWs()
      if (this.pos !== this.text.length) throw new Error('trailing')
      return this.finish(root)
    } catch (error) {
      if (error instanceof TruncatedError) {
        return this.finish(this.nodes.length ? 0 : null, true)
      }
      throw error
    }
  }

  private finish(root: number | null, truncated = false): Analysis {
    return {
      valid: true,
      issue: null,
      stats: this.stats,
      nodes: this.nodes,
      root,
      truncated: truncated || this.truncated,
    }
  }

  private peek(): string | undefined {
    return this.text[this.pos]
  }

  private bump(): void {
    this.pos += 1
  }

  private skipWs(): void {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r' || this.peek() === '\n') {
      this.bump()
    }
  }

  private expect(char: string): void {
    this.skipWs()
    if (this.peek() !== char) throw new Error(`expected ${char}`)
    this.bump()
  }

  private push(
    key: string,
    path: string,
    parent: number | null,
    depth: number,
    kind: JsonKind,
    start: number,
    preview: string,
  ): number {
    if (this.nodes.length >= this.maxNodes) {
      this.truncated = true
      throw new TruncatedError()
    }
    const id = this.nodes.length
    this.nodes.push({ id, parent, depth, key, path, kind, preview, children: [], start, end: start, keyStart: 0, keyEnd: 0 })
    this.stats.nodes += 1
    this.stats.depth = Math.max(this.stats.depth, depth)
    if (kind === 'object') this.stats.objects += 1
    if (kind === 'array') this.stats.arrays += 1
    return id
  }

  private value(key: string, path: string, parent: number | null, depth: number): number {
    this.skipWs()
    const start = this.pos
    const char = this.peek()
    if (char === '{') return this.object(key, path, parent, depth, start)
    if (char === '[') return this.array(key, path, parent, depth, start)
    if (char === '"') {
      const { decoded } = this.string()
      const preview = truncate(JSON.stringify(decoded))
      const id = this.push(key, path, parent, depth, 'string', start, preview)
      this.nodes[id].end = this.pos
      return id
    }
    if (this.text.startsWith('true', this.pos)) return this.literal('true', 'boolean', key, path, parent, depth, start)
    if (this.text.startsWith('false', this.pos)) return this.literal('false', 'boolean', key, path, parent, depth, start)
    if (this.text.startsWith('null', this.pos)) return this.literal('null', 'null', key, path, parent, depth, start)
    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) {
      const byteStart = this.pos
      while (/[-+0-9.eE]/.test(this.text[this.pos] ?? '')) this.bump()
      const raw = this.text.slice(byteStart, this.pos)
      const id = this.push(key, path, parent, depth, 'number', start, truncate(raw))
      this.nodes[id].end = this.pos
      return id
    }
    throw new Error('unexpected token')
  }

  private literal(
    literal: string,
    kind: JsonKind,
    key: string,
    path: string,
    parent: number | null,
    depth: number,
    start: number,
  ): number {
    this.pos += literal.length
    const id = this.push(key, path, parent, depth, kind, start, literal)
    this.nodes[id].end = this.pos
    return id
  }

  private string(): { decoded: string; start: number; end: number } {
    this.skipWs()
    const start = this.pos
    if (this.peek() !== '"') throw new Error('expected string')
    this.bump()
    for (;;) {
      const char = this.peek()
      if (char === undefined) throw new Error('eof in string')
      if (char === '"') {
        this.bump()
        break
      }
      if (char === '\\') {
        this.bump()
        const next = this.peek()
        if (next === 'u') {
          this.pos += 5
        } else {
          this.bump()
        }
        continue
      }
      if (char.charCodeAt(0) < 0x20) throw new Error('control character')
      this.bump()
    }
    const raw = this.text.slice(start, this.pos)
    return { decoded: JSON.parse(raw) as string, start, end: this.pos }
  }

  private object(
    key: string,
    path: string,
    parent: number | null,
    depth: number,
    start: number,
  ): number {
    this.bump() // {
    const id = this.push(key, path, parent, depth, 'object', start, '')
    let count = 0
    this.skipWs()
    if (this.peek() === '}') {
      this.bump()
    } else {
      for (;;) {
        this.skipWs()
        const { decoded, start: keyStart, end: keyEnd } = this.string()
        this.skipWs()
        this.expect(':')
        const childPath = `${path}/${pointerEscape(decoded)}`
        const child = this.value(decoded, childPath, id, depth + 1)
        this.nodes[child].keyStart = keyStart
        this.nodes[child].keyEnd = keyEnd
        this.nodes[id].children.push(child)
        count += 1
        this.skipWs()
        const next = this.peek()
        if (next === ',') {
          this.bump()
          continue
        }
        if (next === '}') {
          this.bump()
          break
        }
        throw new Error('expected , or }')
      }
    }
    this.nodes[id].preview = `object · ${count} keys`
    this.nodes[id].end = this.pos
    return id
  }

  private array(
    key: string,
    path: string,
    parent: number | null,
    depth: number,
    start: number,
  ): number {
    this.bump() // [
    const id = this.push(key, path, parent, depth, 'array', start, '')
    let count = 0
    this.skipWs()
    if (this.peek() === ']') {
      this.bump()
    } else {
      for (;;) {
        const childPath = `${path}/${count}`
        const child = this.value(String(count), childPath, id, depth + 1)
        this.nodes[id].children.push(child)
        count += 1
        this.skipWs()
        const next = this.peek()
        if (next === ',') {
          this.bump()
          continue
        }
        if (next === ']') {
          this.bump()
          break
        }
        throw new Error('expected , or ]')
      }
    }
    this.nodes[id].preview = `array · ${count} items`
    this.nodes[id].end = this.pos
    return id
  }
}

class TruncatedError extends Error {}

function buildFromValue(value: unknown, bytes: number, maxNodes: number): Analysis {
  const nodes: TreeNode[] = []
  const stats: JsonStats = { bytes, nodes: 0, depth: 0, objects: 0, arrays: 0 }
  const state = { truncated: false }

  const walk = (
    current: unknown,
    key: string,
    path: string,
    parent: number | null,
    depth: number,
  ): number | null => {
    if (nodes.length >= Math.max(MIN_MAX_NODES, maxNodes)) {
      state.truncated = true
      return null
    }
    const kind = kindOf(current)
    const id = nodes.length
    nodes.push({
      id,
      parent,
      depth,
      key,
      path,
      kind,
      preview:
        kind === 'object'
          ? `object · ${Object.keys(current as object).length} keys`
          : kind === 'array'
            ? `array · ${(current as unknown[]).length} items`
            : kind === 'string'
              ? truncate(JSON.stringify(current))
              : String(current),
      children: [],
      start: 0,
      end: 0,
      keyStart: 0,
      keyEnd: 0,
    })
    stats.nodes += 1
    stats.depth = Math.max(stats.depth, depth)
    if (kind === 'object') {
      stats.objects += 1
      for (const [childKey, child] of Object.entries(current as Record<string, unknown>)) {
        const childId = walk(child, childKey, `${path}/${pointerEscape(childKey)}`, id, depth + 1)
        if (childId != null) nodes[id].children.push(childId)
      }
    } else if (kind === 'array') {
      stats.arrays += 1
      ;(current as unknown[]).forEach((child, index) => {
        const childId = walk(child, String(index), `${path}/${index}`, id, depth + 1)
        if (childId != null) nodes[id].children.push(childId)
      })
    }
    return id
  }

  const root = walk(value, 'root', '', null, 0)
  return { valid: true, issue: null, stats, nodes, root, truncated: state.truncated }
}

function humanize(raw: string): string {
  const base = raw
    .replace(/\s*in JSON at position.*$/i, '')
    .replace(/\s*at line \d+ column \d+.*$/i, '')
    .trim()
  const map: Array<[RegExp, string]> = [
    [/unexpected end of json input/i, '内容意外结束，可能缺少 } 或 ]'],
    [/expected ':'/i, "缺少冒号 ':'"],
    [/expected property name/i, "期望属性名或 '}'"],
    [/expected ',' or '}'/i, "期望 ',' 或 '}'"],
    [/expected ',' or ']'/i, "期望 ',' 或 ']'"],
    [/unexpected token/i, '无法识别的字符'],
    [/unexpected non-whitespace/i, '多余字符'],
  ]
  for (const [regex, text] of map) if (regex.test(base)) return text
  return base || '语法错误'
}

function locate(text: string, error: unknown): { message: string; line: number; column: number } {
  const raw = error instanceof Error ? error.message : String(error)
  const withLine = raw.match(/line (\d+) column (\d+)/i)
  let line = 1
  let column = 1
  if (withLine) {
    line = Number(withLine[1])
    column = Number(withLine[2])
  } else {
    const position = raw.match(/position (\d+)/i)
    if (position) {
      const pos = Math.min(Number(position[1]), text.length)
      const before = text.slice(0, pos).split('\n')
      line = before.length
      column = (before[before.length - 1]?.length ?? 0) + 1
    }
  }
  return { message: humanize(raw), line, column }
}

export function analyzeLocally(text: string, maxNodes = DEFAULT_MAX_NODES): Analysis {
  const bytes = new TextEncoder().encode(text).length
  const emptyStats: JsonStats = { bytes, nodes: 0, depth: 0, objects: 0, arrays: 0 }
  if (!text.trim()) {
    return { valid: false, issue: null, stats: emptyStats, nodes: [], root: null, truncated: false }
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    const { message, line, column } = locate(text, error)
    return {
      valid: false,
      issue: { message, line, column },
      stats: emptyStats,
      nodes: [],
      root: null,
      truncated: false,
    }
  }

  try {
    return new SpanBuilder(text, maxNodes).parse()
  } catch {
    return buildFromValue(value, bytes, maxNodes)
  }
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key])
    return sorted
  }
  return value
}

export function formatLocally(text: string, indent: number, sortKeys: boolean): string {
  const parsed = JSON.parse(text)
  const value = sortKeys ? sortValue(parsed) : parsed
  const space = indent === 0 ? '\t' : indent
  return JSON.stringify(value, null, space as string | number)
}

export function minifyLocally(text: string): string {
  return JSON.stringify(JSON.parse(text))
}
