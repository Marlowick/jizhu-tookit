import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowRight, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { jqPathFor } from '../core/jqPath'
import type { Analysis, TreeNode } from '../core/types'

interface JsonTreeProps {
  analysis: Analysis | null
  expanded: string[]
  activePath: string | null
  onSelect: (node: TreeNode) => void
  onLocate: (node: TreeNode) => void
  onCopy: (text: string, label: string) => void
}

interface MenuState {
  x: number
  y: number
  node: TreeNode
}

const ROW_HEIGHT = 28

export function JsonTree({ analysis, expanded, activePath, onSelect, onLocate, onCopy }: JsonTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    if (!analysis?.nodes.length || analysis.root == null) return []
    const open = new Set(expanded)
    const output: TreeNode[] = []
    const visit = (id: number) => {
      const node = analysis.nodes[id]
      if (!node) return
      output.push(node)
      if (node.children.length && open.has(node.path)) {
        for (const child of node.children) visit(child)
      }
    }
    visit(analysis.root)
    return output
  }, [analysis, expanded])

  const indexByPath = useMemo(() => {
    const index = new Map<string, number>()
    rows.forEach((row, position) => index.set(row.path, position))
    return index
  }, [rows])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const activeIndex = activePath ? indexByPath.get(activePath) : undefined

  useEffect(() => {
    if (activeIndex == null) return
    rowVirtualizer.scrollToIndex(activeIndex, { align: 'auto' })
    // rowVirtualizer 实例在挂载后保持稳定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, rows.length])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!analysis || !analysis.nodes.length) {
    return <div className="tree-empty">输入或粘贴 JSON 后，这里会显示树形结构</div>
  }

  const menuPath = menu ? jqPathFor(analysis.nodes, menu.node) : ''
  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <>
      <div className="tree-wrap" ref={scrollRef} role="tree" aria-label="JSON 树">
        <div
          style={{
            height: rowVirtualizer.getTotalSize() + 16,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualItems.map((item) => {
            const node = rows[item.index]
            if (!node) return null
            const open = expanded.includes(node.path)
            const hasChildren = node.children.length > 0
            const active = activePath === node.path
            return (
              <div
                key={node.id}
                className={`tree-row ${active ? 'active' : ''}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: item.size,
                  transform: `translateY(${item.start + 8}px)`,
                  paddingLeft: 12 + node.depth * 14,
                }}
                role="treeitem"
                aria-expanded={hasChildren ? open : undefined}
                aria-level={node.depth + 1}
                aria-selected={active}
                onClick={() => onSelect(node)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setMenu({
                    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 280)),
                    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 190)),
                    node,
                  })
                }}
              >
                <span className="twisty">
                  {hasChildren ? (
                    open ? (
                      <ChevronDown size={12} strokeWidth={1.8} />
                    ) : (
                      <ChevronRight size={12} strokeWidth={1.8} />
                    )
                  ) : null}
                </span>
                <span className={`tree-key ${node.depth === 0 ? 'root' : ''}`}>{node.key}</span>
                <span className="tree-colon">:</span>
                <span className={`tree-preview ${node.kind}`}>{node.preview}</span>
              </div>
            )
          })}
        </div>
      </div>

      {menu ? (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="context-path" title={menuPath}>
            {menuPath}
          </div>
          <button
            className="context-item"
            role="menuitem"
            onClick={() => {
              onCopy(menuPath, 'jq 路径')
              setMenu(null)
            }}
          >
            <Copy size={13} strokeWidth={1.8} />
            复制 jq 路径
          </button>
          {menu.node.path ? (
            <button
              className="context-item"
              role="menuitem"
              onClick={() => {
                onCopy(menu.node.path, 'JSON Pointer')
                setMenu(null)
              }}
            >
              <Copy size={13} strokeWidth={1.8} />
              复制 JSON Pointer
            </button>
          ) : null}
          <button
            className="context-item"
            role="menuitem"
            disabled={menu.node.depth === 0}
            onClick={() => {
              onCopy(menu.node.key, '键名')
              setMenu(null)
            }}
          >
            <Copy size={13} strokeWidth={1.8} />
            复制键名
          </button>
          <div className="context-sep" />
          <button
            className="context-item"
            role="menuitem"
            onClick={() => {
              onLocate(menu.node)
              setMenu(null)
            }}
          >
            <ArrowRight size={13} strokeWidth={1.8} />
            在编辑器中定位
          </button>
        </div>
      ) : null}
    </>
  )
}
