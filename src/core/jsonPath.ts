import type { Analysis, TreeNode } from './types'

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function pointerUnescape(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function keySegment(key: string): string {
  if (IDENTIFIER.test(key)) return `.${key}`
  const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `.["${escaped}"]`
}

/** Deepest node whose byte range contains `pos`. */
export function nodeAtPosition(analysis: Analysis, pos: number): TreeNode | null {
  let best: TreeNode | null = null
  for (const node of analysis.nodes) {
    const inKey = node.keyStart < node.keyEnd && pos >= node.keyStart && pos <= node.keyEnd
    if (!inKey && (node.start > pos || node.end < pos)) continue
    if (!best || node.depth > best.depth || (node.depth === best.depth && node.start > best.start)) {
      best = node
    }
  }
  if (!best && analysis.root != null) return analysis.nodes[analysis.root] ?? null
  return best
}

/** Build a jq path such as `.users[0].name` for a node. */
export function jqPathFor(nodes: TreeNode[], node: TreeNode): string {
  const segments: string[] = []
  let current: TreeNode | undefined = node
  let guard = 0

  while (current && current.parent != null && guard < 512) {
    guard += 1
    const parent: TreeNode | undefined = nodes[current.parent]
    if (!parent) break
    if (parent.kind === 'array') {
      segments.unshift(`[${current.key}]`)
    } else {
      const rawKey = current.path.split('/').pop() ?? current.key
      segments.unshift(keySegment(pointerUnescape(rawKey)))
    }
    current = parent
  }

  if (!segments.length) return '.'
  const joined = segments.join('')
  return joined.startsWith('[') ? `.${joined}` : joined
}

export function jqPathAt(analysis: Analysis, pos: number): string | null {
  const node = nodeAtPosition(analysis, pos)
  return node ? jqPathFor(analysis.nodes, node) : null
}
