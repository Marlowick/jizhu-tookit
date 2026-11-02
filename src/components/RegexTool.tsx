import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp, ArrowUpDown, BookOpen, Copy, LocateFixed, Play } from 'lucide-react'
import { copyText, errorMessage, isTauri, regexRun } from '../core/ipc'
import { isModPressed, modKey } from '../core/keyboard'
import type { EditorHighlights, RegexMatch, RegexOutcome, RegexState, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface RegexToolProps {
  tab: Tab
  docId: string
  embedded?: boolean
  source?: string
  onSourceChange?: (text: string) => void
}

function expandReplacement(template: string, match: RegexMatch): string {
  let output = ''
  for (let index = 0; index < template.length; index += 1) {
    const char = template[index]
    if (char !== '$') {
      output += char
      continue
    }
    const next = template[index + 1]
    if (next === '$') {
      output += '$'
      index += 1
    } else if (next === '&') {
      output += match.text
      index += 1
    } else if (next && /[1-9]/.test(next)) {
      output += match.groups[Number(next) - 1] ?? ''
      index += 1
    } else {
      output += '$'
    }
  }
  return output
}

function buildReplacement(text: string, matches: RegexMatch[], template: string): string {
  let cursor = 0
  let output = ''
  for (const match of matches) {
    const start = Math.max(cursor, Math.min(match.start, text.length))
    const end = Math.max(start, Math.min(match.end, text.length))
    output += text.slice(cursor, start)
    output += expandReplacement(template, match)
    cursor = end
  }
  output += text.slice(cursor)
  return output
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="diff-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function MatchList({
  matches,
  current,
  onFocus,
  onCopy,
}: {
  matches: RegexMatch[]
  current: number | null
  onFocus: (index: number) => void
  onCopy: (text: string) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: matches.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  })

  return (
    <div className="regex-results regex-match-scroll" ref={scrollRef}>
      <div className="regex-virtual-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const match = matches[item.index]
          if (!match) return null
          const active = current === item.index
          return (
            <div
              key={`${match.start}-${item.index}`}
              className={`regex-match-row ${active ? 'current' : ''}`}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: item.size, transform: `translateY(${item.start}px)` }}
            >
              <button className="regex-match-main" onClick={() => onFocus(item.index)} title={match.groups.filter(Boolean).join(' · ')}>
                <span className="regex-match-index">match{item.index + 1}</span>
                <span className="regex-match-range">{match.start}-{match.end}</span>
                <span className="regex-match-text">{match.text || '（空匹配）'}</span>
              </button>
              <button className="btn ghost regex-copy" onClick={() => onCopy(match.text)} title="复制匹配">
                <Copy size={12} strokeWidth={1.8} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type SortKey = 'result' | 'count'
type SortDir = 'asc' | 'desc'

function AggregateList({ matches, onFocus }: { matches: RegexMatch[]; onFocus: (index: number) => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => {
    const map = new Map<string, { count: number; firstIndex: number }>()
    matches.forEach((match, index) => {
      const existing = map.get(match.text)
      if (existing) existing.count += 1
      else map.set(match.text, { count: 1, firstIndex: index })
    })
    const result = [...map.entries()].map(([text, info]) => ({ text, ...info }))
    const direction = sortDir === 'asc' ? 1 : -1
    return result.sort((left, right) => {
      if (sortKey === 'result') return direction * left.text.localeCompare(right.text)
      return direction * (left.count - right.count) || left.text.localeCompare(right.text)
    })
  }, [matches, sortDir, sortKey])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 10,
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'count' ? 'desc' : 'asc')
    }
  }

  const arrow = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown size={11} strokeWidth={1.8} />
    return sortDir === 'asc' ? <ArrowUp size={11} strokeWidth={1.8} /> : <ArrowDown size={11} strokeWidth={1.8} />
  }

  return (
    <div className="regex-aggregate-view">
      <div className="regex-aggregate-head">
        <button onClick={() => toggleSort('result')}>结果 {arrow('result')}</button>
        <button onClick={() => toggleSort('count')}>数量 {arrow('count')}</button>
        <span>占比</span>
      </div>
      <div className="regex-results regex-aggregate-scroll" ref={scrollRef}>
        <div className="regex-virtual-inner" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null
            return (
              <button
                key={row.text}
                className="regex-aggregate-row"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, height: item.size, transform: `translateY(${item.start}px)` }}
                onClick={() => onFocus(row.firstIndex)}
                title={row.text}
              >
                <span className="regex-aggregate-text">{row.text || '（空匹配）'}</span>
                <span className="regex-aggregate-count">{row.count}</span>
                <span className="regex-aggregate-percent">{((row.count / Math.max(1, matches.length)) * 100).toFixed(1)}%</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ReplaceView({
  count,
  template,
  onTemplateChange,
  output,
  onGenerate,
  onApply,
  onCopy,
}: {
  count: number
  template: string
  onTemplateChange: (value: string) => void
  output: string | null
  onGenerate: () => void
  onApply: () => void
  onCopy: () => void
}) {
  return (
    <div className="regex-replace-pane">
      <div className="regex-replace-controls">
        <span>替换为</span>
        <input
          className="regex-replace-input"
          value={template}
          spellCheck={false}
          autoComplete="off"
          placeholder="$1 [at] $2"
          onChange={(event) => onTemplateChange(event.target.value)}
        />
        <span className="regex-replace-hint">$1–$9 · $&amp; · $$</span>
        <button className="btn primary" onClick={onGenerate} disabled={count === 0}>
          <Play size={12} strokeWidth={1.8} />
          生成替换
        </button>
      </div>
      {output == null ? (
        <div className="regex-empty">修改模板后点击“生成替换”；不会自动执行。</div>
      ) : (
        <>
          <div className="regex-replace-actions">
            <span>{count} 处替换 · UTF-8</span>
            <button className="btn ghost" onClick={onCopy}>
              <Copy size={12} strokeWidth={1.8} />
              复制结果
            </button>
            <button className="btn" onClick={onApply} disabled={count === 0}>
              应用到左侧编辑器
            </button>
          </div>
          <pre className="regex-replace-preview">{output}</pre>
        </>
      )}
    </div>
  )
}

export function RegexTool({ tab, docId, embedded = false, source, onSourceChange }: RegexToolProps) {
  const setRegexTool = useAppStore((state) => state.setRegexTool)
  const showToast = useAppStore((state) => state.showToast)
  const setEditorHighlights = useAppStore((state) => state.setEditorHighlights)
  const editorHighlights = useAppStore((state) => state.editorHighlights)
  const state: RegexState = {
    text: '',
    pattern: '',
    global: true,
    ignoreCase: false,
    multiLine: false,
    replace: '$1 [at] $2',
    view: 'matches',
    ...tab.regexTool,
    ...(embedded && source !== undefined ? { text: source } : {}),
  }
  const inputText = embedded && source !== undefined ? source : state.text
  const [result, setResult] = useState<RegexOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [current, setCurrent] = useState<number | null>(null)
  const [replaceOutput, setReplaceOutput] = useState<string | null>(null)
  const requestId = useRef(0)
  const seqRef = useRef(0)

  const update = (patch: Partial<RegexState>) => {
    if (embedded && patch.text !== undefined) {
      onSourceChange?.(patch.text)
      return
    }
    setRegexTool(tab.id, { ...state, ...patch })
  }

  const clearHighlights = () => {
    setCurrent(null)
    if (embedded) setEditorHighlights(null)
  }

  const pushHighlights = (matches: RegexMatch[], currentIndex: number | null) => {
    if (!embedded) return
    seqRef.current += 1
    const next: EditorHighlights = {
      docId,
      ranges: matches.map((match) => ({ from: match.start, to: match.end })),
      current: currentIndex,
      seq: seqRef.current,
    }
    setEditorHighlights(next)
  }

  const run = async () => {
    if (!isTauri) {
      setError('浏览器预览不支持正则 worker，请使用桌面端打开')
      return
    }
    if (!state.pattern.trim()) {
      setResult(null)
      clearHighlights()
      return
    }
    const id = ++requestId.current
    setRunning(true)
    setError(null)
    setReplaceOutput(null)
    setCurrent(null)
    try {
      const outcome = await regexRun(inputText, state.pattern, {
        global: state.global,
        ignoreCase: state.ignoreCase,
        multiLine: state.multiLine,
      })
      if (id !== requestId.current) return
      setResult(outcome)
      clearHighlights()
      if (!outcome.error) pushHighlights(outcome.matches, null)
    } catch (caught) {
      if (id !== requestId.current) return
      setError(errorMessage(caught))
      setResult(null)
      clearHighlights()
    } finally {
      if (id === requestId.current) setRunning(false)
    }
  }

  // 左侧内容或表达式/选项变化后，旧结果与高亮立即失效
  useEffect(() => {
    requestId.current += 1
    setResult(null)
    setError(null)
    setReplaceOutput(null)
    clearHighlights()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, state.pattern, state.global, state.ignoreCase, state.multiLine, embedded])

  useEffect(() => {
    return () => {
      if (embedded) setEditorHighlights(null)
    }
  }, [embedded, setEditorHighlights])

  const focusMatch = (index: number) => {
    setCurrent(index)
    const match = result?.matches[index]
    if (!match) return
    pushHighlights(result?.matches ?? [], index)
  }

  const aggregateCount = result?.unique ?? 0

  const generateReplacement = () => {
    if (!result) return
    setReplaceOutput(buildReplacement(inputText, result.matches, state.replace))
  }

  const applyReplacement = () => {
    if (replaceOutput == null) return
    if (embedded) onSourceChange?.(replaceOutput)
    else update({ text: replaceOutput, view: 'matches' })
    showToast(`已应用 ${result?.matches.length ?? 0} 处替换`)
    setReplaceOutput(null)
    clearHighlights()
  }

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text)
      showToast(`已复制${label}`)
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const flags = `${state.global ? 'g' : ''}${state.ignoreCase ? 'i' : ''}${state.multiLine ? 'm' : ''}`
  const view = state.view
  const total = result?.matches.length ?? 0
  const currentRanges = editorHighlights?.docId === docId ? editorHighlights : null

  return (
    <div className="regex-tool regex-side-tool" onKeyDown={(event: ReactKeyboardEvent) => {
      if (isModPressed(event) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        void run()
      }
    }}>
      <div className="regex-pattern-row">
        <span className="regex-pattern-label">expr</span>
        <input
          className="regex-pattern"
          value={state.pattern}
          spellCheck={false}
          autoComplete="off"
          placeholder="(?P<user>\\w+)@(?P<host>[\\w.-]+)"
          onChange={(event) => update({ pattern: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void run()
            }
          }}
        />
        <button className={`btn ghost ${helpOpen ? 'active' : ''}`} onClick={() => setHelpOpen((open) => !open)}>
          <BookOpen size={13} strokeWidth={1.8} />
          语法
        </button>
        <button className="btn primary" onClick={() => void run()} disabled={running || !isTauri}>
          <Play size={13} strokeWidth={1.8} />
          {running ? '匹配中…' : '执行'}
        </button>
      </div>

      <div className="regex-flags-row">
        <Check label="g 全局" checked={state.global} onChange={(checked) => update({ global: checked })} />
        <Check label="i 忽略大小写" checked={state.ignoreCase} onChange={(checked) => update({ ignoreCase: checked })} />
        <Check label="m 多行" checked={state.multiLine} onChange={(checked) => update({ multiLine: checked })} />
        <span className="regex-flags">{flags || '无选项'}</span>
        <span className="regex-side-hint">{modKey('F')} 执行 · Python 风格 · {inputText.length} 字符</span>
      </div>

      {helpOpen ? (
        <div className="regex-syntax-help regex-side-help">
          <div className="regex-syntax-head">
            <strong>Python 风格正则</strong>
            <span>fancy-regex · 支持环视、反向引用、命名组</span>
          </div>
          <div className="regex-syntax-python">
            <code>(?P&lt;name&gt;...)</code><span>命名捕获组</span>
            <code>(?P=name)</code><span>按名称反向引用</span>
            <code>(?i)</code><span>内联忽略大小写</span>
            <code>\A \Z</code><span>文本开头 / 结尾</span>
            <code>(?=...) (?&lt;=...)</code><span>前瞻 / 后顾断言</span>
            <code>\d \w \s</code><span>数字 / 单词 / 空白</span>
          </div>
        </div>
      ) : null}

      <div className="regex-result-tabs">
        <div className="regex-view-toggle" role="tablist" aria-label="结果视图">
          <button className={view === 'matches' ? 'active' : ''} onClick={() => update({ view: 'matches' })}>
            匹配
          </button>
          <button className={view === 'aggregate' ? 'active' : ''} onClick={() => update({ view: 'aggregate' })}>
            聚合
          </button>
          <button className={view === 'replace' ? 'active' : ''} onClick={() => update({ view: 'replace' })}>
            替换
          </button>
        </div>
        <span className="regex-result-meta">
          {error ? '执行失败' : view === 'aggregate' ? `${aggregateCount} 个唯一结果` : view === 'replace' ? `${total} 处可替换` : `${total} 个匹配`}
          {result?.truncated ? ' · 已截断' : ''}
        </span>
        {current != null ? <span className="regex-current-label">当前 match{current + 1}</span> : null}
      </div>

      {error ? (
        <div className="m4-error regex-error"><strong>匹配失败</strong><span>{error}</span></div>
      ) : !state.pattern.trim() ? (
        <div className="regex-empty">输入 Python 风格表达式后按 {modKey('F')} 或点击执行</div>
      ) : !result ? (
        <div className="regex-empty">{running ? '正在匹配…' : `按 ${modKey('F')} 开始搜索`}</div>
      ) : view === 'replace' ? (
        <ReplaceView
          count={total}
          template={state.replace}
          onTemplateChange={(value) => update({ replace: value })}
          output={replaceOutput}
          onGenerate={generateReplacement}
          onApply={applyReplacement}
          onCopy={() => replaceOutput != null && void copy(replaceOutput, '替换结果')}
        />
      ) : view === 'aggregate' ? (
        <AggregateList matches={result.matches} onFocus={focusMatch} />
      ) : total === 0 ? (
        <div className="regex-empty">没有匹配</div>
      ) : (
        <MatchList
          matches={result.matches}
          current={current ?? currentRanges?.current ?? null}
          onFocus={focusMatch}
          onCopy={(text) => void copy(text, '匹配内容')}
        />
      )}
    </div>
  )
}
