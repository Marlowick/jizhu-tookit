import type { Analysis, TreeNode } from './types'

/** 找到包含指定 UTF-16 偏移的最深节点。 */
function rangeStart(node: TreeNode): number {
  return node.keyEnd > node.keyStart ? node.keyStart : node.start
}

function contains(node: TreeNode, pos: number): boolean {
  return pos >= rangeStart(node) && pos < node.end
}

export function nodeAtPosition(analysis: Analysis, pos: number): TreeNode | null {
  if (analysis.root == null) return null
  let current = analysis.nodes[analysis.root]
  if (!current || !contains(current, pos)) return null

  while (current.children.length > 0) {
    const children = current.children
      .map((id) => analysis.nodes[id])
      .filter((node): node is TreeNode => Boolean(node))
    let low = 0
    let high = children.length - 1
    let candidate: TreeNode | null = null
    while (low <= high) {
      const mid = (low + high) >> 1
      if (rangeStart(children[mid]) <= pos) {
        candidate = children[mid]
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    if (!candidate || !contains(candidate, pos)) break
    current = candidate
  }
  return current
}

/** 从根到该节点的祖先（不含自身）。 */
export function ancestorNodes(nodes: TreeNode[], node: TreeNode): TreeNode[] {
  const chain: TreeNode[] = []
  let current: TreeNode | undefined = node
  while (current && current.parent != null) {
    current = nodes[current.parent]
    if (!current) break
    chain.unshift(current)
  }
  return chain
}
