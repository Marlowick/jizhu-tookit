import { useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleSlash,
  Copy,
  FileInput,
  FileOutput,
  LoaderCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { StepFields } from './pipeline/StepFields'
import { copyText, errorMessage } from '../core/ipc'
import {
  defaultPipelineState,
  executePipelineStep,
  newStep,
  parseWorkflow,
  serializeWorkflow,
} from '../core/pipeline'
import type { PipelineState, PipelineStep, PipelineStepType, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface PipelineToolProps {
  tab: Tab
  embedded?: boolean
  source?: string
}

type StepStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped'

interface StepRun {
  status: StepStatus
  output?: string
  durationMs?: number
  error?: string
}

function idleRuns(steps: PipelineStep[]): Record<string, StepRun> {
  return Object.fromEntries(steps.map((step) => [step.id, { status: 'idle' as StepStatus }])) as Record<
    string,
    StepRun
  >
}

function statusIcon(status: StepStatus) {
  if (status === 'running') return <LoaderCircle size={11} className="spin" />
  if (status === 'success') return <CheckCircle2 size={11} />
  if (status === 'failed') return <AlertCircle size={11} />
  if (status === 'skipped') return <CircleSlash size={11} />
  return <span className="pipeline-status-dot" />
}

const CODEC_LABELS: Record<string, string> = {
  base64: 'Base64',
  url: 'URL',
  html: 'HTML',
  unicode: 'Unicode',
  hex: 'Hex',
}

function pipelineRowTitle(step: PipelineStep): string {
  if (step.type === 'jq') return 'JQ'
  if (step.type === 'regex') return '正则匹配'
  if (step.type === 'count') return '计数排序'
  return `${CODEC_LABELS[step.protocol ?? 'base64'] ?? 'Base64'} 编/解码`
}

function pipelineRowSummary(step: PipelineStep): string {
  if (step.type === 'jq') {
    const raw = step.raw !== false ? '-r ' : ''
    return `jq -S ${raw}"${step.expr ?? '.'}"`
  }
  if (step.type === 'codec') {
    const protocol = CODEC_LABELS[step.protocol ?? 'base64'] ?? 'Base64'
    const direction = step.direction === 'decode' ? '解码' : '编码'
    return `${protocol} ${direction}${step.urlSafe ? ' · URL safe' : ''}${step.linewise ? ' · 按行' : ''}`
  }
  if (step.type === 'regex') {
    const flags = [
      step.flags?.global ? 'g' : '',
      step.flags?.ignoreCase ? 'i(忽略大小写)' : '',
      step.flags?.multiLine ? 'm(匹配多行)' : '',
    ].filter(Boolean)
    return `/${step.pattern ?? ''}/ ${flags.length ? flags.join(' & ') : '无选项'}`
  }
  return step.sort === 'asc'
    ? '按整行统计次数 · 次数从低到高'
    : '按整行统计次数 · 次数从高到低'
}

export function PipelineTool({ tab, embedded = false, source }: PipelineToolProps) {
  const setPipeline = useAppStore((state) => state.setPipeline)
  const showToast = useAppStore((state) => state.showToast)
  const fallback = useRef<PipelineState | null>(null)
  if (fallback.current == null) fallback.current = defaultPipelineState()
  const state: PipelineState = tab.pipeline ?? fallback.current
  const inputText = embedded && source !== undefined ? source : state.input

  const [runs, setRuns] = useState<Record<string, StepRun>>(() => idleRuns(state.steps))
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [lastSuccess, setLastSuccess] = useState<number | null>(null)
  const [failedIndex, setFailedIndex] = useState<number | null>(null)
  const [runningIndex, setRunningIndex] = useState(-1)
  const [running, setRunning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [totalMs, setTotalMs] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ioMode, setIoMode] = useState<'import' | 'export' | null>(null)
  const [ioText, setIoText] = useState('')
  const [ioError, setIoError] = useState<string | null>(null)
  const runToken = useRef(0)
  const runStarted = useRef(0)

  const resetRun = (steps: PipelineStep[] = state.steps) => {
    runToken.current += 1
    setRuns(idleRuns(steps))
    setSnapshots([])
    setLastSuccess(null)
    setFailedIndex(null)
    setRunningIndex(-1)
    setRunning(false)
    setCancelled(false)
    setTotalMs(0)
  }

  const updateState = (next: PipelineState, reset = true) => {
    setPipeline(tab.id, next)
    if (reset) resetRun(next.steps)
  }

  const updateStep = (id: string, patch: Partial<PipelineStep>) => {
    updateState({
      ...state,
      steps: state.steps.map((step) => (step.id === id ? ({ ...step, ...patch } as PipelineStep) : step)),
    })
  }

  const addStep = (type: PipelineStepType) => {
    if (state.steps.length >= 20) {
      showToast('单个工作流最多 20 个步骤')
      return
    }
    const step = newStep(type)
    updateState({ ...state, steps: [...state.steps, step] })
    setSelectedId(step.id)
  }

  const removeStep = (id: string) => {
    if (selectedId === id) setSelectedId(null)
    updateState({ ...state, steps: state.steps.filter((step) => step.id !== id) })
  }

  const moveStep = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= state.steps.length || to >= state.steps.length) return
    const steps = state.steps.slice()
    const [moved] = steps.splice(from, 1)
    steps.splice(to, 0, moved)
    updateState({ ...state, steps })
  }

  const run = async () => {
    if (running) return
    if (!inputText.trim()) {
      showToast('左侧编辑器没有可处理的输入')
      return
    }
    if (new TextEncoder().encode(inputText).length > 4 * 1024 * 1024) {
      showToast('管道输入超过 4MB 上限')
      return
    }
    if (!state.steps.length) {
      showToast('请先添加至少一个步骤')
      return
    }
    const token = ++runToken.current
    setRunning(true)
    setCancelled(false)
    setFailedIndex(null)
    setLastSuccess(null)
    setSnapshots([])
    setTotalMs(0)
    setRunningIndex(-1)
    setRuns(idleRuns(state.steps))
    runStarted.current = performance.now()
    let previous = inputText

    for (let index = 0; index < state.steps.length; index += 1) {
      if (token !== runToken.current) return
      const step = state.steps[index]
      const started = performance.now()
      setRunningIndex(index)
      setRuns((previousRuns) => ({ ...previousRuns, [step.id]: { status: 'running' } }))
      try {
        const outcome = await executePipelineStep(step, previous)
        if (token !== runToken.current) return
        previous = outcome.output
        setRuns((previousRuns) => ({
          ...previousRuns,
          [step.id]: { status: 'success', output: outcome.output, durationMs: outcome.durationMs },
        }))
        setSnapshots((previousSnapshots) => {
          const next = previousSnapshots.slice()
          next[index] = outcome.output
          return next
        })
        setLastSuccess(index)
      } catch (caught) {
        if (token !== runToken.current) return
        const message = errorMessage(caught)
        const durationMs = performance.now() - started
        setRuns((previousRuns) => {
          const next = { ...previousRuns }
          next[step.id] = { status: 'failed', error: message, durationMs }
          for (let rest = index + 1; rest < state.steps.length; rest += 1) {
            next[state.steps[rest].id] = { status: 'skipped' }
          }
          return next
        })
        setFailedIndex(index)
        break
      }
    }

    if (token !== runToken.current) return
    setTotalMs(performance.now() - runStarted.current)
    setRunning(false)
    setRunningIndex(-1)
  }

  const cancel = () => {
    runToken.current += 1
    setRunning(false)
    setCancelled(true)
    setRunningIndex(-1)
    setTotalMs(performance.now() - runStarted.current)
    setRuns((previousRuns) => {
      const next = { ...previousRuns }
      for (const step of state.steps) {
        if (next[step.id]?.status === 'running' || next[step.id]?.status === 'idle') {
          next[step.id] = { status: 'skipped' }
        }
      }
      return next
    })
  }

  const openImport = () => {
    setIoMode('import')
    setIoText('')
    setIoError(null)
  }

  const openExport = () => {
    setIoMode('export')
    setIoText(serializeWorkflow({ ...state, input: inputText }))
    setIoError(null)
  }

  const applyImport = () => {
    try {
      const parsed = parseWorkflow(ioText)
      setSelectedId(null)
      updateState({ ...parsed, input: inputText })
      setIoMode(null)
      setIoError(null)
      showToast(`已导入工作流：${parsed.name}`)
    } catch (caught) {
      setIoError(errorMessage(caught))
    }
  }

  const copyWorkflow = async () => {
    try {
      await copyText(ioText)
      showToast('已复制工作流 JSON')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const copyOutput = async () => {
    const output = lastSuccess != null ? snapshots[lastSuccess] ?? '' : ''
    if (!output) return
    try {
      await copyText(output)
      showToast('已复制管道输出')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const selectedStep = selectedId ? state.steps.find((step) => step.id === selectedId) ?? null : null
  const output = lastSuccess != null ? snapshots[lastSuccess] ?? '' : ''
  const resultLabel = lastSuccess != null && state.steps[lastSuccess] ? pipelineRowTitle(state.steps[lastSuccess]) : ''
  const successCount = Object.values(runs).filter((stepRun) => stepRun.status === 'success').length
  const failedRun = failedIndex != null ? runs[state.steps[failedIndex]?.id ?? ''] : null
  const inputLines = inputText ? inputText.split('\n').length : 0

  const footer = running
    ? `运行中 · 步骤 ${runningIndex + 1}/${state.steps.length}`
    : cancelled
      ? `已取消 · 已完成 ${successCount}/${state.steps.length}${lastSuccess != null ? ` · 保留步骤 ${lastSuccess + 1} 的快照` : ''}`
      : failedIndex != null
        ? `第 ${failedIndex + 1} 步中断 · 已完成 ${successCount}/${state.steps.length} · ${Math.round(totalMs)}ms`
        : lastSuccess != null
          ? `已完成 ${state.steps.length}/${state.steps.length} · ${Math.round(totalMs)}ms`
          : `${inputLines} 行 · ${inputText.length} 字符 · ${state.steps.length} 步`

  return (
    <div className="pipeline-side pipeline-layout">
      <div className="pipeline-topline">
        <span className="pipeline-topline-help">
          说明<span>左侧编辑器作为输入 · 步骤按顺序执行</span>
        </span>
        <div className="pipeline-io-actions">
          <button className="btn ghost" onClick={openImport} disabled={running}>
            <FileInput size={12} strokeWidth={1.8} />
            导入工作流
          </button>
          <button className="btn ghost" onClick={openExport} disabled={running}>
            <FileOutput size={12} strokeWidth={1.8} />
            导出工作流
          </button>
        </div>
      </div>

      <div className="pipeline-rule" />

      <div className="pipeline-actionline">
        <select
          className="pipeline-add"
          value=""
          disabled={running}
          aria-label="添加步骤"
          onChange={(event) => {
            if (event.target.value) addStep(event.target.value as PipelineStepType)
          }}
        >
          <option value="">+ 添加步骤</option>
          <option value="jq">jq 提取</option>
          <option value="codec">编码 / 解码</option>
          <option value="regex">正则匹配</option>
          <option value="count">计数排序</option>
        </select>
        <span className="pipeline-action-meta">{state.steps.length} 步 · {inputLines} 行输入</span>
        <span className="pipeline-side-spacer" />
        <button
          className={`btn ${running ? '' : 'primary'}`}
          onClick={() => (running ? cancel() : void run())}
          disabled={!state.steps.length && !running}
        >
          {running ? <CircleSlash size={13} strokeWidth={1.8} /> : <Play size={13} strokeWidth={1.8} />}
          {running ? '取消' : '运行'}
        </button>
      </div>

      <div className="pipeline-step-rows">
        {state.steps.map((step, index) => {
          const stepRun = runs[step.id] ?? { status: 'idle' as StepStatus }
          const summary = pipelineRowSummary(step)
          return (
            <div className="pipeline-row-wrap" key={step.id}>
              <div className={`pipeline-row ${stepRun.status} ${selectedId === step.id ? 'active' : ''}`}>
                <span className="pipeline-row-title">
                  <span className="pipeline-row-index">{index + 1}.</span>
                  {pipelineRowTitle(step)}
                </span>
                <code className="pipeline-row-summary" title={summary}>{summary}</code>
                <span className={`pipeline-row-status ${stepRun.status}`} title={stepRun.status}>
                  {statusIcon(stepRun.status)}
                </span>
                <div className="pipeline-row-actions">
                  <button className="btn ghost" onClick={() => moveStep(index, index - 1)} disabled={running || index <= 0} title="上移" aria-label="上移步骤">
                    <ArrowUp size={12} strokeWidth={1.8} />
                  </button>
                  <button className="btn ghost" onClick={() => moveStep(index, index + 1)} disabled={running || index >= state.steps.length - 1} title="下移" aria-label="下移步骤">
                    <ArrowDown size={12} strokeWidth={1.8} />
                  </button>
                  <button
                    className={`btn ghost ${selectedId === step.id ? 'active' : ''}`}
                    onClick={() => setSelectedId(selectedId === step.id ? null : step.id)}
                    title="编辑"
                    aria-label="编辑步骤"
                    disabled={running}
                  >
                    <Pencil size={12} strokeWidth={1.8} />
                  </button>
                  <button className="btn ghost" onClick={() => removeStep(step.id)} disabled={running} title="删除" aria-label="删除步骤">
                    <Trash2 size={12} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              {selectedStep?.id === step.id ? (
                <div className="pipeline-row-config">
                  <StepFields
                    step={step}
                    running={running}
                    onChange={(patch) => updateStep(step.id, patch)}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
        {!state.steps.length ? (
          <div className="pipeline-empty-steps">
            <Plus size={14} strokeWidth={1.6} />
            从「添加步骤」开始
          </div>
        ) : null}
      </div>

      <div className="pipeline-rule" />

      <section className="pipeline-side-result">
        <div className="pipeline-result-head">
          <span>结果展示区域</span>
          <span className="pipeline-result-state">{footer}</span>
          <span className="pipeline-side-spacer" />
          <button className="btn ghost" onClick={() => void copyOutput()} disabled={!output}>
            <Copy size={12} strokeWidth={1.8} />
            复制
          </button>
        </div>
        {failedIndex != null && failedRun?.error ? (
          <div className="pipeline-error-card">
            <AlertCircle size={13} strokeWidth={1.8} />
            <div>
              <strong>步骤 {failedIndex + 1} 失败</strong>
              <span>{failedRun.error}</span>
            </div>
          </div>
        ) : null}
        {output ? (
          <pre className="pipeline-result-pre">{output}</pre>
        ) : (
          <div className="pipeline-result-empty">
            {running ? '运行中…' : lastSuccess != null ? '步骤已执行，输出为空' : '运行后在这里显示最后一个成功步骤的输出'}
          </div>
        )}
      </section>

      {ioMode ? (
        <div
          className="pipeline-io-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIoMode(null)
          }}
        >
          <div className="pipeline-io-dialog" role="dialog" aria-modal="true" aria-label="工作流 JSON">
            <header>
              <strong>{ioMode === 'import' ? '导入工作流' : '导出工作流'}</strong>
              <span>{ioMode === 'import' ? '粘贴 .pipeline.json 内容' : '复制下方 JSON 即可导出'}</span>
              <button className="btn ghost" onClick={() => setIoMode(null)} aria-label="关闭工作流文本">
                <X size={14} strokeWidth={1.8} />
              </button>
            </header>
            <textarea
              className="pipeline-io-text"
              value={ioText}
              spellCheck={false}
              readOnly={ioMode === 'export'}
              autoFocus
              onChange={(event) => {
                setIoText(event.target.value)
                setIoError(null)
              }}
            />
            {ioError ? <div className="pipeline-io-error">{ioError}</div> : null}
            <footer>
              <span>导入不执行脚本；输入始终取左侧编辑器</span>
              <button className="btn" onClick={() => setIoMode(null)}>关闭</button>
              {ioMode === 'import' ? (
                <button className="btn primary" onClick={applyImport} disabled={!ioText.trim()}>
                  应用
                </button>
              ) : (
                <button className="btn primary" onClick={() => void copyWorkflow()}>
                  复制 JSON
                </button>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
