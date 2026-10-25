import { useEffect, useMemo, useRef, useState } from 'react'
import { Asterisk, BookOpen, Copy, LocateFixed, Play } from 'lucide-react'
import { copyText, errorMessage, isTauri, regexRun } from '../core/ipc'
import { isModPressed } from '../core/keyboard'
import { SAMPLE_REGEX_PATTERN, SAMPLE_REGEX_TEXT } from '../core/sample'
import type { RegexMatch, RegexOutcome, RegexState, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface RegexToolProps {
  tab: Tab
}

interface Segment {
  text: string
  match: number | null
}

function highlightSegments(text: string, matches: RegexMatch[]): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    const start = Math.max(cursor, Math.min(match.start, text.length))
    const end = Math.max(start, Math.min(match.end, text.length))
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: null })
    if (end > start) segments.push({ text: text.slice(start, end), match: index })
    cursor = end
  })
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: null })
  return segments
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

function Check({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="diff-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function RegexTool({ tab }: RegexToolProps) {
  const setRegexTool = useAppStore((state) => state.setRegexTool)
  const showToast = useAppStore((state) => state.showToast)
  const state: RegexState = {
    text: SAMPLE_REGEX_TEXT,
    pattern: SAMPLE_REGEX_PATTERN,
    global: true,
    ignoreCase: false,
    multiLine: false,
    replace: '$1 [at] $2',
    view: 'matches',
    ...tab.regexTool,
  }

  const [result, setResult] = useState<RegexOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [browserError, setBrowserError] = useState<string | null>(null)
  const [activeText, setActiveText] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const requestId = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  const update = (patch: Partial<RegexState>) => setRegexTool(tab.id, { ...state, ...patch })

  useEffect(() => {
    requestId.current += 1
    setRunning(false)
    setResult(null)
    setActiveText(null)
  }, [state.text, state.pattern, state.global, state.ignoreCase, state.multiLine])

  const run = async (next: RegexState = state) => {
    if (!isTauri) {
      setBrowserError('浏览器预览不支持正则 worker，请使用桌面端打开')
      return
    }
    if (!next.pattern.trim()) {
      setResult(null)
      setBrowserError(null)
      return
    }
    const id = ++requestId.current
    setRunning(true)
    setBrowserError(null)
    try {
      const outcome = await regexRun(next.text, next.pattern, {
        global: next.global,
        ignoreCase: next.ignoreCase,
        multiLine: next.multiLine,
      })
      if (id !== requestId.current) return
      setResult(outcome)
    } catch (error) {
      if (id !== requestId.current) return
      setBrowserError(errorMessage(error))
      setResult(null)
    } finally {
      if (id === requestId.current) setRunning(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isModPressed(event)) return
      if (event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      void run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const segments = useMemo(
    () => highlightSegments(state.text, result?.matches ?? []),
    [state.text, result],
  )

  const aggregate = useMemo(() => {
    const map = new Map<string, { count: number; first: RegexMatch }>()
    for (const match of result?.matches ?? []) {
      const existing = map.get(match.text)
      if (existing) existing.count += 1
      else map.set(match.text, { count: 1, first: match })
    }
    return [...map.entries()]
      .map(([text, info]) => ({ text, ...info }))
      .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text))
  }, [result])

  const maxAggregate = Math.max(1, ...aggregate.map((item) => item.count))

  const replacement = useMemo(
    () => ({
      text: buildReplacement(state.text, result?.matches ?? [], state.replace),
      count: result?.matches.length ?? 0,
    }),
    [state.text, state.replace, result],
  )

  const applyReplacement = () => {
    if (!result || !result.matches.length) return
    update({ text: replacement.text, view: 'matches' })
    showToast(`已应用 ${result.matches.length} 处替换`)
  }

  const locate = (match: RegexMatch) => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(match.start, match.end)
  }

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text)
      showToast(`已复制${label}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const flags = `${state.global ? 'g' : ''}${state.ignoreCase ? 'i' : ''}${state.multiLine ? 'm' : ''}`
  const error = result?.error ?? (browserError ? { message: browserError, kind: 'browser' } : null)
  const lineCount = state.text ? state.text.split('\n').length : 0

  return (
    <div className="small-tool regex-tool">
      <header className="small-tool-head">
        <Asterisk size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>正则匹配</strong>
        <span className="small-tool-sub">高亮 · 分组 · 聚合</span>
        <span className="small-tool-hint">⌘F 手动搜索 · worker 300ms 硬超时</span>
      </header>

      <div className="regex-body">
        <section className="regex-source-pane">
          <div className="regex-pane-head">
            <span>原文本</span>
            <span>
              {lineCount} 行 · {state.text.length} 字符
            </span>
            <span className="regex-head-note">
              {activeText
                ? `同类「${activeText}」共 ${result?.matches.filter((match) => match.text === activeText).length ?? 0} 处已高亮`
                : '匹配内容以蓝色高亮'}
            </span>
          </div>
          <div className="regex-source-wrap">
            <pre className="regex-highlight" ref={highlightRef} aria-hidden="true">
              {segments.map((segment, index) =>
                segment.match == null ? (
                  <span key={index}>{segment.text}</span>
                ) : (
                  <mark
                    key={index}
                    className={activeText != null && segment.text === activeText ? 'active' : ''}
                  >
                    {segment.text}
                  </mark>
                ),
              )}
            </pre>
            <textarea
              ref={textareaRef}
              className="regex-source"
              value={state.text}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ text: event.target.value })}
              onScroll={(event) => {
                if (!highlightRef.current) return
                highlightRef.current.scrollTop = event.currentTarget.scrollTop
                highlightRef.current.scrollLeft = event.currentTarget.scrollLeft
              }}
            />
          </div>
        </section>

        <section className="regex-result-pane">
          <div className="regex-pattern-row">
            <span className="regex-pattern-label">expr</span>
            <input
              className="regex-pattern"
              value={state.pattern}
              spellCheck={false}
              autoComplete="off"
              placeholder="(\w+)@([\w.-]+)"
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
            <Check
              label="i 忽略大小写"
              checked={state.ignoreCase}
              onChange={(checked) => update({ ignoreCase: checked })}
            />
            <Check
              label="m 多行"
              checked={state.multiLine}
              onChange={(checked) => update({ multiLine: checked })}
            />
            <span className="regex-flags">{flags || '无选项'}</span>
          </div>

          <div className="regex-replace-row">
            <span>替换为</span>
            <input
              className="regex-replace-input"
              value={state.replace}
              spellCheck={false}
              autoComplete="off"
              placeholder="$1 [at] $2"
              onChange={(event) => update({ replace: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  update({ view: 'replace' })
                }
              }}
            />
            <span className="regex-replace-hint">$1–$9 · $&amp; · $$</span>
            <button
              className={`btn ${state.view === 'replace' ? 'active' : ''}`}
              onClick={() => update({ view: 'replace' })}
              disabled={!result || result.matches.length === 0}
            >
              预览替换
            </button>
          </div>

          {helpOpen ? (
            <div className="regex-syntax-help">
              <div className="regex-syntax-head">
                <strong>正则语法速查</strong>
                <span>fancy-regex · 支持环视与反向引用 · 受 300ms 超时保护</span>
              </div>
              <div className="regex-syntax-scroll">
                <table className="regex-syntax-table">
                  <thead>
                    <tr>
                      <th>语法</th>
                      <th>说明</th>
                      <th>示例</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="syntax-section"><th colSpan={3}>字符与集合</th></tr>
                    <tr><td><code>.</code></td><td>任意字符（默认不含换行）</td><td><code>a.c</code></td></tr>
                    <tr><td><code>\d \w \s</code></td><td>数字 / 单词字符 / 空白</td><td><code>\d+</code></td></tr>
                    <tr><td><code>[abc]</code></td><td>集合内任一字符</td><td><code>[aeiou]</code></td></tr>
                    <tr><td><code>[^abc]</code></td><td>排除集合</td><td><code>[^0-9]</code></td></tr>
                    <tr className="syntax-section"><th colSpan={3}>锚点与量词</th></tr>
                    <tr><td><code>^ $</code></td><td>行首 / 行尾</td><td><code>^INFO</code></td></tr>
                    <tr><td><code>\b</code></td><td>单词边界</td><td><code>\bcat\b</code></td></tr>
                    <tr><td><code>* + ?</code></td><td>0+ / 1+ / 0 或 1 次</td><td><code>a+</code></td></tr>
                    <tr><td><code>{'{n,m}'}</code></td><td>n 到 m 次；加 <code>?</code> 惰性</td><td><code>a{'{2,4}'}</code></td></tr>
                    <tr className="syntax-section"><th colSpan={3}>分组与断言</th></tr>
                    <tr><td><code>(...)</code></td><td>捕获组，替换用 $1–$9</td><td><code>(\w+)@</code></td></tr>
                    <tr><td><code>(?:...)</code></td><td>非捕获组</td><td><code>(?:https?)</code></td></tr>
                    <tr><td><code>(?&lt;name&gt;...)</code></td><td>命名组</td><td><code>(?&lt;user&gt;\w+)</code></td></tr>
                    <tr><td><code>(?=...) (?&lt;=...)</code></td><td>先行 / 后行断言</td><td><code>(?=@)</code></td></tr>
                    <tr className="syntax-section"><th colSpan={3}>替换与选项</th></tr>
                    <tr><td><code>$1 $2</code></td><td>捕获组内容</td><td><code>$1@$2</code></td></tr>
                    <tr><td><code>$&amp;</code></td><td>整个匹配</td><td><code>[$&amp;]</code></td></tr>
                    <tr><td><code>$$</code></td><td>字面量 $</td><td><code>$$5</code></td></tr>
                    <tr><td><code>g i m</code></td><td>全局 / 忽略大小写 / 多行</td><td><code>g</code></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="regex-results-head">
            <span>
              {state.view === 'replace'
                ? `替换预览 · ${replacement.count} 处`
                : `匹配结果 · ${result?.count ?? 0} 个`}
              {result?.truncated ? '（已截断）' : ''}
            </span>
            <div className="regex-view-toggle" role="tablist" aria-label="结果视图">
              <button
                className={state.view === 'matches' ? 'active' : ''}
                onClick={() => update({ view: 'matches' })}
              >
                原文
              </button>
              <button
                className={state.view === 'aggregate' ? 'active' : ''}
                onClick={() => update({ view: 'aggregate' })}
              >
                聚合
              </button>
              <button
                className={state.view === 'replace' ? 'active' : ''}
                onClick={() => update({ view: 'replace' })}
              >
                替换
              </button>
            </div>
          </div>

          <div className="regex-results">
            {error ? (
              <div className="m4-error regex-error">
                <strong>{error.kind === 'timeout' ? '执行超时' : '匹配失败'}</strong>
                <span>{error.message}</span>
              </div>
            ) : !isTauri ? (
              <div className="regex-empty">浏览器预览不支持正则 worker，请使用桌面端打开</div>
            ) : !state.pattern.trim() ? (
              <div className="regex-empty">输入正则表达式后按 ⌘F 或点击执行</div>
            ) : !result ? (
              <div className="regex-empty">{running ? '正在匹配…' : '按 ⌘F 开始搜索'}</div>
            ) : state.view === 'replace' ? (
              <div className="regex-replace-view">
                <div className="regex-replace-actions">
                  <span>{replacement.count} 处替换 · UTF-8</span>
                  <button
                    className="btn ghost"
                    onClick={() => void copy(replacement.text, '替换结果')}
                  >
                    <Copy size={12} strokeWidth={1.8} />
                    复制结果
                  </button>
                  <button
                    className="btn"
                    onClick={applyReplacement}
                    disabled={replacement.count === 0}
                  >
                    应用到原文
                  </button>
                </div>
                <pre className="regex-replace-preview">{replacement.text || '（空）'}</pre>
              </div>
            ) : result.matches.length === 0 ? (
              <div className="regex-empty">没有匹配</div>
            ) : state.view === 'aggregate' ? (
              <div className="regex-aggregate">
                {aggregate.map((item) => (
                  <button
                    key={item.text}
                    className="regex-aggregate-row"
                    onClick={() => {
                      setActiveText(item.text)
                      locate(item.first)
                    }}
                    title={`点击定位；${item.count} 处同类匹配会同时高亮`}
                  >
                    <span className="regex-aggregate-text">{item.text}</span>
                    <span className="regex-bar">
                      <span style={{ width: `${(item.count / maxAggregate) * 100}%` }} />
                    </span>
                    <span className="regex-aggregate-count">{item.count}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="regex-match-list">
                {result.matches.map((match, index) => (
                  <div className="regex-match-row" key={`${match.start}-${index}`}>
                    <button
                      className="regex-match-main"
                      onClick={() => {
                        setActiveText(match.text)
                        locate(match)
                      }}
                    >
                      <span className="regex-match-index">{index + 1}</span>
                      <span className="regex-match-text">{match.text || '（空匹配）'}</span>
                      <span className="regex-match-range">
                        {match.start}–{match.end}
                      </span>
                    </button>
                    {match.groups.some((group) => group != null) ? (
                      <div className="regex-groups">
                        {match.groups.map((group, groupIndex) =>
                          group == null ? null : (
                            <span className="regex-group" key={groupIndex}>
                              ${groupIndex + 1}={group}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                    <button
                      className="btn ghost regex-copy"
                      onClick={() => void copy(match.text, '匹配内容')}
                      title="复制匹配"
                    >
                      <Copy size={12} strokeWidth={1.8} />
                    </button>
                    <button
                      className="btn ghost regex-copy"
                      onClick={() => {
                        setActiveText(match.text)
                        locate(match)
                      }}
                      title="在原文中定位"
                    >
                      <LocateFixed size={12} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="small-tool-foot">
        <span>
          {result?.error
            ? '匹配失败'
            : result
              ? state.view === 'replace'
                ? `${replacement.count} 处替换 · 选项 ${flags || '无'}`
                : `${result.count} 个匹配 · ${result.unique} 个唯一 · ${result.durationMs} ms · 选项 ${flags || '无'}`
              : '等待匹配'}
        </span>
        <span className="small-tool-foot-note">
          {result?.truncated ? '结果已截断到 10000 条' : '点击结果行可在原文中定位'}
        </span>
      </footer>
    </div>
  )
}
