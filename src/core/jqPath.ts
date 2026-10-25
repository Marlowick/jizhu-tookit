import type { TreeNode } from './types'

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 把 JSON Pointer 路径转换成 jq 路径，例如 /users/0/name -> .users[0].name */
export function jqPathFor(nodes: TreeNode[], node: TreeNode): string {
  const segments: TreeNode[] = []
  let current: TreeNode | undefined = node
  while (current && current.parent != null) {
    segments.unshift(current)
    current = nodes[current.parent]
  }
  if (segments.length === 0) return '.'

  let path = ''
  for (const segment of segments) {
    const parent = segment.parent != null ? nodes[segment.parent] : null
    if (parent?.kind === 'array') {
      path += path ? `[${segment.key}]` : `.[${segment.key}]`
    } else if (SAFE_KEY.test(segment.key)) {
      path += `.${segment.key}`
    } else {
      const literal = JSON.stringify(segment.key)
      path += path ? `[${literal}]` : `.[${literal}]`
    }
  }
  return path || '.'
}
