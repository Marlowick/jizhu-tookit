import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Copy, GitCompare, Info, Pencil, Play, X } from 'lucide-react'
import { DEFAULT_DIFF_OPTIONS, DIFF_MODE_LABELS, defaultDiffState } from '../core/diff'
import { unifiedPatch, urlDiffTable } from '../core/diffPatch'
import { copyText, diffJson, diffText, diffUrl, errorMessage, isTauri } from '../core/ipc'
import { TOOL_LABEL } from '../core/tools'
import type {
  DiffMode,
  DiffOptions,
  DiffResult,
  DiffSide,
  DiffState,
  Tab,
  UrlDiffResult,
} from '../core/types'
import { useAppStore } from '../store/appStore'
import { LineDiffView } from './diff/LineDiffView'
import { UrlDiffView } from './diff/UrlDiffView'

interface DiffToolProps {
  tab: Tab
}

type Output =
  | { kind: 'line'; data: DiffResult }
  | { kind: 'url'; data: UrlDiffResult }

const MODES: DiffMode[] = ['json', 'text', 'url']

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

export function DiffTool({ tab }: DiffToolProps) {
  const docs = useAppStore((state) => state.docs)
  const tabs = useAppStore((state) => state.tabs)
  const setDiffState = useAppStore((state) => state.setDiffState)
  const setText = useAppStore((state) => state.setText)
  const showToast = useAppStore((state) => state.showToast)

  const diff: DiffState = tab.diff
    ? { ...tab.diff, options: { ...DEFAULT_DIFF_OPTIONS, ...tab.diff.options } }
    : defaultDiffState()
  const [result, setResult] = useState<Output | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<'a' | 'b' | null>(null)
  const [editText, setEditText] = useState('')
  const [overwriteArmed, setOverwriteArmed] = useState(false)
  const requestId = useRef(0)

  const textFor = (side: DiffSide): string => {
    if (side.kind === 'tab' && side.docId) return docs[side.docId]?.text ?? ''
    return side.text ?? ''
  }

  const aText = textFor(diff.a)
  const bText = textFor(diff.b)
  const optionsKey = JSON.stringify(diff.options)

  const docOptions = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{ id: string; label: string }> = []
    for (const item of tabs) {
      if (!item.docId || seen.has(item.docId) || !docs[item.docId]) continue
      seen.add(item.docId)
      list.push({
        id: item.docId,
        label: `${TOOL_LABEL[item.tool]} · ${docs[item.docId].title}`,
      })
    }
    return list
  }, [tabs, docs])

  const update = (patch: Partial<DiffState>) => {
    setDiffState(tab.id, { ...diff, ...patch })
  }

  const updateOptions = (patch: Partial<DiffOptions>) => {
    update({ options: { ...diff.options, ...patch } })
  }

  const chooseSide = (key: 'a' | 'b', value: string) => {
    const side: DiffSide =
      value === 'manual'
        ? { kind: 'manual', text: textFor(diff[key]) }
        : { kind: 'tab', docId: value.slice(4) }
    update({ [key]: side } as Partial<DiffState>)
  }

  const sideLabel = (side: DiffSide): string => {
    if (side.kind === 'tab' && side.docId) return docs[side.docId]?.title ?? '已关闭的文档'
    return '手动输入'
  }

  const sourceValue = (side: DiffSide): string =>
    side.kind === 'tab' && side.docId ? `tab:${side.docId}` : 'manual'

  const run = async (state: DiffState = diff) => {
    if (!isTauri) {
      setError('浏览器预览不支持 diff，请使用桌面端打开')
      return
    }
    const left = textFor(state.a)
    const right = textFor(state.b)
    if (!left.trim() || !right.trim()) {
      setError(null)
      setResult(null)
      return
    }
    const id = ++requestId.current
    setRunning(true)
    setError(null)
    try {
      if (state.mode === 'url') {
        const data = await diffUrl(left, right, state.options)
        if (id !== requestId.current) return
        setResult({ kind: 'url', data })
      } else {
        const data =
          state.mode === 'json'
            ? await diffJson(left, right, state.options)
            : await diffText(left, right, state.options)
        if (id !== requestId.current) return
        setResult({ kind: 'line', data })
      }
    } catch (caught) {
      if (id !== requestId.current) return
      setError(errorMessage(caught))
      setResult(null)
    } finally {
      if (id === requestId.current) setRunning(false)
    }
  }

  useEffect(() => {
    if (!isTauri) return
    if (!aText.trim() || !bText.trim()) {
      requestId.current += 1
      setRunning(false)
      setResult(null)
      setError(null)
      return
    }
    const timer = window.setTimeout(() => {
      void run(diff)
    }, 280)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aText, bText, diff.mode, optionsKey])

  useEffect(() => {
    if (!editing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  const openEditor = (side: 'a' | 'b') => {
    setEditText(textFor(diff[side]))
    setEditing(side)
  }

  const saveEditor = () => {
    if (!editing) return
    const next = {
      ...diff,
      [editing]: { kind: 'manual', text: editText },
    } as DiffState
    setDiffState(tab.id, next)
    setEditing(null)
  }

  const stats = result?.data.stats
  const lineMode: 'json' | 'text' = diff.mode === 'json' ? 'json' : 'text'
  const canCompare = Boolean(aText.trim() && bText.trim())
  const canApply = Boolean(result && canCompare && diff.mode !== 'url')

  useEffect(() => {
    setOverwriteArmed(false)
  }, [result, diff.mode])

  useEffect(() => {
    if (!overwriteArmed) return
    const timer = window.setTimeout(() => setOverwriteArmed(false), 4_000)
    return () => window.clearTimeout(timer)
  }, [overwriteArmed])

  const applyBToA = () => {
    if (!canApply) return
    if (!overwriteArmed) {
      setOverwriteArmed(true)
      return
    }
    if (diff.a.kind === 'tab' && diff.a.docId && docs[diff.a.docId]) {
      setText(diff.a.docId, bText)
      showToast('已用 B 覆盖 A 文档')
    } else if (diff.a.kind === 'tab') {
      showToast('A 侧文档已关闭，无法回填')
    } else {
      setDiffState(tab.id, { ...diff, a: { kind: 'manual', text: bText } })
      showToast('已用 B 覆盖 A 输入')
    }
    setOverwriteArmed(false)
  }

  const copyResult = async () => {
    if (!result) return
    const text =
      result.kind === 'url'
        ? urlDiffTable(result.data, sideLabel(diff.a), sideLabel(diff.b))
        : unifiedPatch(result.data, sideLabel(diff.a), sideLabel(diff.b))
    if (!text.trim()) {
      showToast('没有可复制的差异')
      return
    }
    try {
      await copyText(text)
      showToast(result.kind === 'url' ? '已复制差异表格' : '已复制 unified patch')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  return (
    <div className="diff-tool">
      <header className="diff-head">
        <GitCompare size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>Diff 对比</strong>
        <span className="diff-sub">文本 / JSON / URL · 双栏对齐</span>
        <span className="diff-head-hint">差异只在本地计算</span>
      </header>

      <div className="diff-source-bar">
        <div className="diff-source">
          <span className="diff-side a">A</span>
          <select
            aria-label="A 侧来源"
            value={sourceValue(diff.a)}
            onChange={(event) => chooseSide('a', event.target.value)}
          >
            <option value="manual">手动输入</option>
            {docOptions.map((option) => (
              <option key={option.id} value={`tab:${option.id}`}>
                {option.label}
              </option>
            ))}
          </select>
          {diff.a.kind === 'manual' ? (
            <button className="btn ghost" onClick={() => openEditor('a')}>
              <Pencil size={13} strokeWidth={1.8} />
              编辑
            </button>
          ) : null}
        </div>

        <button
          className="btn ghost diff-swap"
          title="交换 A / B"
          aria-label="交换 A / B"
          onClick={() => update({ a: diff.b, b: diff.a })}
        >
          <ArrowLeftRight size={14} strokeWidth={1.8} />
        </button>

        <div className="diff-source">
          <span className="diff-side b">B</span>
          <select
            aria-label="B 侧来源"
            value={sourceValue(diff.b)}
            onChange={(event) => chooseSide('b', event.target.value)}
          >
            <option value="manual">手动输入</option>
            {docOptions.map((option) => (
              <option key={option.id} value={`tab:${option.id}`}>
                {option.label}
              </option>
            ))}
          </select>
          {diff.b.kind === 'manual' ? (
            <button className="btn ghost" onClick={() => openEditor('b')}>
              <Pencil size={13} strokeWidth={1.8} />
              编辑
            </button>
          ) : null}
        </div>
      </div>

      <div className="diff-options-bar">
        <div className="diff-modes" role="tablist" aria-label="Diff 模式">
          {MODES.map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={diff.mode === mode}
              className={diff.mode === mode ? 'active' : ''}
              onClick={() => update({ mode })}
            >
              {DIFF_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="diff-options">
          {diff.mode === 'text' ? (
            <>
              <Check
                label="忽略空白"
                checked={diff.options.ignoreWhitespace}
                onChange={(checked) => updateOptions({ ignoreWhitespace: checked })}
              />
              <Check
                label="忽略大小写"
                checked={diff.options.ignoreCase}
                onChange={(checked) => updateOptions({ ignoreCase: checked })}
              />
              <Check
                label="忽略行尾差异"
                checked={diff.options.ignoreTrailing}
                onChange={(checked) => updateOptions({ ignoreTrailing: checked })}
              />
            </>
          ) : null}

          {diff.mode === 'json' ? (
            <>
              <Check
                label="sortKeys"
                checked={diff.options.sortKeys}
                onChange={(checked) => updateOptions({ sortKeys: checked })}
              />
              <Check
                label="ensure_ascii"
                checked={diff.options.ensureAscii}
                onChange={(checked) => updateOptions({ ensureAscii: checked })}
              />
              <label className="diff-check">
                <span>缩进</span>
                <select
                  className="diff-indent"
                  value={diff.options.indent}
                  onChange={(event) => updateOptions({ indent: Number(event.target.value) })}
                >
                  <option value={2}>2 空格</option>
                  <option value={4}>4 空格</option>
                  <option value={0}>Tab</option>
                </select>
              </label>
              <span className="diff-option-note">
                <Info size={12} strokeWidth={1.8} />
                先解析 JSON，再按 key/数组对齐；解析失败会在结果区报错
              </span>
            </>
          ) : null}

          {diff.mode === 'url' ? (
            <>
              <Check
                label="解码参数值"
                checked={diff.options.decodeParams}
                onChange={(checked) => updateOptions({ decodeParams: checked })}
              />
              <Check
                label="解析 JSON 参数"
                checked={diff.options.parseJsonParams}
                onChange={(checked) => updateOptions({ parseJsonParams: checked })}
              />
              <Check
                label="参数排序"
                checked={diff.options.sortParams}
                onChange={(checked) => updateOptions({ sortParams: checked })}
              />
              <Check
                label="忽略默认端口"
                checked={diff.options.ignoreDefaultPort}
                onChange={(checked) => updateOptions({ ignoreDefaultPort: checked })}
              />
              <span className="diff-option-note" title="参数值为 JSON 对象/数组时，会解析并展开为子行">
                <Info size={12} strokeWidth={1.8} />
                {diff.options.parseJsonParams
                  ? 'JSON 参数会展开为子行'
                  : 'JSON 参数按字符串比较'}
              </span>
            </>
          ) : null}
        </div>

        <button
          className="btn primary diff-run"
          onClick={() => void run()}
          disabled={running || !canCompare || !isTauri}
        >
          <Play size={13} strokeWidth={1.8} />
          {running ? '对比中…' : '开始对比'}
        </button>
      </div>

      <div className="diff-result-area">
        {!isTauri ? (
          <div className="diff-placeholder">
            <GitCompare size={20} strokeWidth={1.5} />
            <strong>浏览器预览不支持 diff</strong>
            <span>请使用桌面端；算法与沙箱在后端执行。</span>
          </div>
        ) : !canCompare ? (
          <div className="diff-placeholder">
            <GitCompare size={20} strokeWidth={1.5} />
            <strong>选择或编辑 A / B 两侧</strong>
            <span>可以选择已打开的 Tab，也可以手动粘贴文本、JSON 或 URL。</span>
            <button className="btn" onClick={() => openEditor(!aText.trim() ? 'a' : 'b')}>
              <Pencil size={13} strokeWidth={1.8} />
              编辑{!aText.trim() ? ' A' : ' B'} 侧
            </button>
          </div>
        ) : error ? (
          <div className="diff-error">
            <AlertTriangle size={15} strokeWidth={1.8} />
            <pre>{error}</pre>
          </div>
        ) : result?.kind === 'url' ? (
          <UrlDiffView result={result.data} aLabel={sideLabel(diff.a)} bLabel={sideLabel(diff.b)} />
        ) : result?.kind === 'line' ? (
          <LineDiffView
            result={result.data}
            mode={lineMode}
            aLabel={sideLabel(diff.a)}
            bLabel={sideLabel(diff.b)}
          />
        ) : (
          <div className="diff-placeholder">
            <GitCompare size={20} strokeWidth={1.5} />
            <strong>{running ? '正在对比…' : '准备对比'}</strong>
            <span>{running ? '正在计算差异' : '点击「开始对比」或修改选项。'}</span>
          </div>
        )}
      </div>

      <footer className="diff-footer">
        {stats ? (
          <>
            <span className="diff-minus">−{stats.removed}</span>
            <span className="diff-plus">+{stats.added}</span>
            <span>· {stats.differences} 处差异</span>
          </>
        ) : (
          <span>等待对比</span>
        )}
        <span className="diff-spacer" />
        {result ? (
          <button className="btn ghost diff-copy" onClick={() => void copyResult()}>
            <Copy size={12} strokeWidth={1.8} />
            复制 {result.kind === 'url' ? '表格' : 'patch'}
          </button>
        ) : null}
        {canApply ? (
          <button
            className={`btn ghost diff-copy ${overwriteArmed ? 'diff-armed' : ''}`}
            onClick={applyBToA}
            title="用 B 侧内容整体覆盖 A 侧；不是逐 hunk 合并"
          >
            {overwriteArmed ? '确认覆盖 A' : '以 B 覆盖 A'}
          </button>
        ) : null}
        {running ? <span className="diff-running">对比中…</span> : null}
        <span>{DIFF_MODE_LABELS[diff.mode]}</span>
      </footer>

      {editing ? (
        <div
          className="diff-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null)
          }}
        >
          <div className="diff-modal" role="dialog" aria-modal="true" aria-label="编辑手动输入">
            <header className="diff-modal-head">
              <strong>编辑 {editing.toUpperCase()} 侧输入</strong>
              <button className="btn ghost" onClick={() => setEditing(null)} aria-label="关闭">
                <X size={14} strokeWidth={1.8} />
              </button>
            </header>
            <textarea
              className="diff-modal-input"
              autoFocus
              spellCheck={false}
              value={editText}
              placeholder="粘贴 JSON、普通文本或 URL…"
              onChange={(event) => setEditText(event.target.value)}
            />
            <footer className="diff-modal-foot">
              <span>内容仅保留在当前会话</span>
              <button className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn primary" onClick={saveEditor}>
                应用
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
