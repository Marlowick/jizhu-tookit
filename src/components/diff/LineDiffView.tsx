import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { inlineRanges, tokenizeJson, type Token } from '../../core/diffHighlight'
import type { DiffLine, DiffMode, DiffResult, DiffRow } from '../../core/types'

interface LineDiffViewProps {
  result: DiffResult
  mode: DiffMode
  aLabel: string
  bLabel: string
}

const ROW_HEIGHT = 22
const GAP_HEIGHT = 26
const COLLAPSE_THRESHOLD = 5

type DisplayItem =
  | { type: 'row'; row: DiffRow; rowIndex: number }
  | { type: 'gap'; start: number; count: number }

function renderTokens(tokens: Token[], range: [number, number] | null): ReactNode[] {
  const output: ReactNode[] = []
  let position = 0
  tokens.forEach((token, tokenIndex) => {
    const start = position
    const end = start + token.text.length
    position = end
    if (!range) {
      output.push(
        <span key={`${tokenIndex}-0`} className={token.className}>
          {token.text}
        </span>,
      )
      return
    }
    const [rangeStart, rangeEnd] = range
    const localStart = Math.max(rangeStart, start) - start
    const localEnd = Math.min(rangeEnd, end) - start
    if (end <= rangeStart || start >= rangeEnd || localStart >= localEnd) {
      output.push(
        <span key={`${tokenIndex}-0`} className={token.className}>
          {token.text}
        </span>,
      )
      return
    }
    if (localStart > 0) {
      output.push(
        <span key={`${tokenIndex}-pre`} className={token.className}>
          {token.text.slice(0, localStart)}
        </span>,
      )
    }
    output.push(
      <span key={`${tokenIndex}-hl`} className={`${token.className ?? ''} diff-inline`}>
        {token.text.slice(localStart, localEnd)}
      </span>,
    )
    if (localEnd < token.text.length) {
      output.push(
        <span key={`${tokenIndex}-post`} className={token.className}>
          {token.text.slice(localEnd)}
        </span>,
      )
    }
  })
  return output
}

function Cell({
  side,
  line,
  range,
  mode,
}: {
  side: 'a' | 'b'
  line: DiffLine | null
  range: [number, number] | null
  mode: DiffMode
}) {
  if (!line) {
    return (
      <div className={`diff-cell ${side} empty`}>
        <span className="diff-ln" />
        <span className="diff-code" />
      </div>
    )
  }
  const tokens = mode === 'json' ? tokenizeJson(line.text) : [{ text: line.text }]
  return (
    <div className={`diff-cell ${side}`}>
      <span className="diff-ln">{line.number}</span>
      <span className="diff-code" title={line.text}>
        {renderTokens(tokens, range)}
      </span>
    </div>
  )
}

function Row({ row, mode, focused }: { row: DiffRow; mode: DiffMode; focused: boolean }) {
  const ranges =
    row.kind === 'change' && row.a && row.b ? inlineRanges(row.a.text, row.b.text) : null
  return (
    <div className={`diff-line-row ${row.kind} ${focused ? 'focused' : ''}`}>
      <Cell side="a" line={row.a} range={ranges?.a ?? null} mode={mode} />
      <Cell side="b" line={row.b} range={ranges?.b ?? null} mode={mode} />
    </div>
  )
}

export function LineDiffView({ result, mode, aLabel, bLabel }: LineDiffViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [expandedGaps, setExpandedGaps] = useState<Set<number>>(new Set())
  const [currentHunk, setCurrentHunk] = useState(-1)
  const [focusRow, setFocusRow] = useState<number | null>(null)

  const displayItems = useMemo(() => {
    const rows = result.rows
    const items: DisplayItem[] = []
    let index = 0
    while (index < rows.length) {
      if (rows[index].kind === 'equal') {
        let end = index
        while (end < rows.length && rows[end].kind === 'equal') end += 1
        const count = end - index
        if (count > COLLAPSE_THRESHOLD && !expandedGaps.has(index)) {
          items.push({ type: 'gap', start: index, count })
        } else {
          for (let rowIndex = index; rowIndex < end; rowIndex += 1) {
            items.push({ type: 'row', row: rows[rowIndex], rowIndex })
          }
        }
        index = end
        continue
      }
      items.push({ type: 'row', row: rows[index], rowIndex: index })
      index += 1
    }
    return items
  }, [result.rows, expandedGaps])

  const hunks = useMemo(() => {
    const starts: number[] = []
    result.rows.forEach((row, index) => {
      if (row.kind !== 'equal' && (index === 0 || result.rows[index - 1].kind === 'equal')) {
        starts.push(index)
      }
    })
    return starts
  }, [result.rows])

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (displayItems[index]?.type === 'gap' ? GAP_HEIGHT : ROW_HEIGHT),
    getItemKey: (index) => {
      const item = displayItems[index]
      return item?.type === 'gap' ? `gap-${item.start}` : `row-${item?.rowIndex ?? index}`
    },
    overscan: 24,
  })

  useEffect(() => {
    setExpandedGaps(new Set())
    setCurrentHunk(-1)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [result])

  useEffect(() => {
    if (focusRow == null) return
    const timer = window.setTimeout(() => setFocusRow(null), 1400)
    return () => window.clearTimeout(timer)
  }, [focusRow])

  const jump = useCallback((direction: 1 | -1) => {
    if (!hunks.length) return
    const next =
      currentHunk < 0
        ? direction > 0
          ? 0
          : hunks.length - 1
        : (currentHunk + direction + hunks.length) % hunks.length
    setCurrentHunk(next)
    const targetRow = hunks[next]
    setFocusRow(targetRow)
    const displayIndex = displayItems.findIndex(
      (item) => item.type === 'row' && item.rowIndex === targetRow,
    )
    if (displayIndex >= 0) {
      virtualizer.scrollToIndex(displayIndex, { align: 'center' })
    }
  }, [currentHunk, displayItems, hunks, virtualizer])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey) return
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.closest('input, textarea, select, [contenteditable="true"]') ||
          target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      jump(event.key === 'ArrowDown' ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  return (
    <div className="diff-view">
      <div className="diff-view-bar">
        <span className="diff-hunk-count">
          {hunks.length ? `${hunks.length} 处差异` : '无差异'}
        </span>
        <button
          className="btn ghost diff-nav"
          aria-label="上一处差异"
          aria-keyshortcuts="Alt+ArrowUp"
          title="上一处差异（⌥↑）"
          disabled={!hunks.length}
          onClick={() => jump(-1)}
        >
          <ChevronUp size={13} strokeWidth={1.8} />
        </button>
        <span className="diff-nav-count">
          {hunks.length ? `${currentHunk < 0 ? 0 : currentHunk + 1}/${hunks.length}` : '0/0'}
        </span>
        <span className="diff-key-hint">⌥↑↓</span>
        <button
          className="btn ghost diff-nav"
          aria-label="下一处差异"
          aria-keyshortcuts="Alt+ArrowDown"
          title="下一处差异（⌥↓）"
          disabled={!hunks.length}
          onClick={() => jump(1)}
        >
          <ChevronDown size={13} strokeWidth={1.8} />
        </button>
        <span className="diff-spacer" />
        {expandedGaps.size ? (
          <button className="btn ghost diff-expand" onClick={() => setExpandedGaps(new Set())}>
            折叠相同行
          </button>
        ) : null}
      </div>

      <div className="diff-line-head">
        <div className="diff-line-head-cell">A — {aLabel}</div>
        <div className="diff-line-head-cell">B — {bLabel}</div>
      </div>

      <div className="diff-line-scroll" ref={scrollRef}>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const displayItem = displayItems[item.index]
            if (!displayItem) return null
            const style = {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              width: '100%',
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }
            if (displayItem.type === 'gap') {
              return (
                <div key={item.key} className="diff-gap-row" style={style}>
                  <button
                    className="diff-gap-button"
                    onClick={() =>
                      setExpandedGaps((previous) => {
                        const next = new Set(previous)
                        next.add(displayItem.start)
                        return next
                      })
                    }
                  >
                    ⋯ {displayItem.count} 行未修改 · 展开
                  </button>
                </div>
              )
            }
            return (
              <div key={item.key} style={style}>
                <Row row={displayItem.row} mode={mode} focused={focusRow === displayItem.rowIndex} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
