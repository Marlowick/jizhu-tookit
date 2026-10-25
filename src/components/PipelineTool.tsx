import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleSlash,
  Copy,
  FileInput,
  FileOutput,
  GripVertical,
  LoaderCircle,
  Play,
  Plus,
  Settings2,
  Trash2,
  Workflow,
  X,
} from 'lucide-react'
import { configSummary, StepFields } from './pipeline/StepFields'
import { copyText, errorMessage } from '../core/ipc'
import {
  defaultPipelineState,
  executePipelineStep,
  newStep,
  parseWorkflow,
  serializeWorkflow,
  stepSummary,
  stepTitle,
} from '../core/pipeline'
import type {
  CodecDirection,
  CodecProtocol,
  PipelineState,
  PipelineStep,
  PipelineStepType,
  Tab,
} from '../core/types'
import { useAppStore } from '../store/appStore'

interface PipelineToolProps {
  tab: Tab
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
  if (status === 'running') return <LoaderCircle size={12} className="spin" />
  if (status === 'success') return <CheckCircle2 size={12} />
  if (status === 'failed') return <AlertCircle size={12} />
  if (status === 'skipped') return <CircleSlash size={12} />
  return <span className="pipeline-status-dot" />
}

export function PipelineTool({ tab }: PipelineToolProps) {
  const setPipeline = useAppStore((state) => state.setPipeline)
  const showToast = useAppStore((state) => state.showToast)
  const fallback = useRef<PipelineState | null>(null)
  if (fallback.current == null) fallback.current = defaultPipelineState()
  const state: PipelineState = tab.pipeline ?? fallback.current

  const [runs, setRuns] = useState<Record<string, StepRun>>(() => idleRuns(state.steps))
  const [snapshots, setSnapshots] = useState<string[]>([])
  const [lastSuccess, setLastSuccess] = useState<number | null>(null)
  const [failedIndex, setFailedIndex] = useState<number | null>(null)
  const [runningIndex, setRunningIndex] = useState(-1)
  const [running, setRunning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [totalMs, setTotalMs] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [ioMode, setIoMode] = useState<'import' | 'export' | null>(null)
  const [ioText, setIoText] = useState('')
  const [ioError, setIoError] = useState<string | null>(null)
  const [split, setSplit] = useState(() => Math.min(0.75, Math.max(0.35, state.split ?? 0.58)))
  const splitRef = useRef(split)
  const mainRef = useRef<HTMLDivElement>(null)
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

  const moveStepTo = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= state.steps.length || to >= state.steps.length) return
    const steps = state.steps.slice()
    const [moved] = steps.splice(from, 1)
    steps.splice(to, 0, moved)
    updateState({ ...state, steps })
  }

  const run = async () => {
    if (running) return
    if (!state.input.trim()) {
      showToast('请先输入原始数据')
      return
    }
    if (new TextEncoder().encode(state.input).length > 4 * 1024 * 1024) {
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
    let previous = state.input

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
    setIoText(serializeWorkflow(state))
    setIoError(null)
  }

  const applyImport = () => {
    try {
      const parsed = parseWorkflow(ioText)
      setSelectedId(null)
      updateState(parsed)
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

  useEffect(() => {
    const next = Math.min(0.75, Math.max(0.35, state.split ?? 0.58))
    splitRef.current = next
    setSplit(next)
  }, [state.split, tab.id])

  const startSplitDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const main = mainRef.current
    if (!main) return
    const rect = main.getBoundingClientRect()
    const onMove = (moveEvent: PointerEvent) => {
      const ratio = Math.min(0.75, Math.max(0.35, (moveEvent.clientX - rect.left) / rect.width))
      splitRef.current = ratio
      setSplit(ratio)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('pipeline-resizing')
      setPipeline(tab.id, { ...state, split: splitRef.current })
    }
    document.body.classList.add('pipeline-resizing')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  const selectedStep = selectedId ? state.steps.find((step) => step.id === selectedId) ?? null : null
  const selectedIndex = selectedStep ? state.steps.indexOf(selectedStep) : -1
  const output = lastSuccess != null ? snapshots[lastSuccess] ?? '' : ''
  const resultLabel =
    lastSuccess != null && state.steps[lastSuccess] ? stepTitle(state.steps[lastSuccess]) : ''
  const successCount = Object.values(runs).filter((stepRun) => stepRun.status === 'success').length
  const failedRun = failedIndex != null ? runs[state.steps[failedIndex]?.id ?? ''] : null

  const footer = running
    ? `运行中 · 步骤 ${runningIndex + 1}/${state.steps.length}`
    : cancelled
      ? `已取消 · 已完成 ${successCount}/${state.steps.length}${lastSuccess != null ? ` · 保留步骤 ${lastSuccess + 1} 的快照` : ''}`
      : failedIndex != null
        ? `在第 ${failedIndex + 1} 步中断 · 已完成 ${successCount}/${state.steps.length} · 共 ${Math.round(totalMs)}ms`
        : lastSuccess != null
          ? `已完成 ${state.steps.length}/${state.steps.length} · 共 ${Math.round(totalMs)}ms`
          : `${state.steps.length} 步 · 等待运行`

  return (
    <div className="small-tool pipeline-tool">
      <header className="small-tool-head">
        <Workflow size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>管道处理</strong>
        <span className="small-tool-sub">步骤串联 · 失败即停 · 快照保留</span>
        <span className="small-tool-hint">jq / 编解码 / 正则 / 计数</span>
      </header>

      <div className="pipeline-toolbar">
        <span className="pipeline-toolbar-spacer" />
        <button className="btn" onClick={openImport} disabled={running}>
          <FileInput size={13} strokeWidth={1.8} />
          导入工作流
        </button>
        <button className="btn" onClick={openExport} disabled={running}>
          <FileOutput size={13} strokeWidth={1.8} />
          导出
        </button>
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
        <button
          className={`btn ${running ? '' : 'primary'} pipeline-run`}
          onClick={() => (running ? cancel() : void run())}
          disabled={!state.steps.length && !running}
        >
          {running ? <CircleSlash size={13} strokeWidth={1.8} /> : <Play size={13} strokeWidth={1.8} />}
          {running ? '取消' : '运行'}
        </button>
      </div>

      <section className="pipeline-input-section">
        <div className="pipeline-section-head">
          <span>输入 · 原始数据</span>
          <span>
            {state.input ? state.input.split('\n').length : 0} 行 · {state.input.length} 字符
          </span>
        </div>
        <textarea
          className="pipeline-input"
          value={state.input}
          spellCheck={false}
          disabled={running}
          placeholder="粘贴 JSON Lines、文本或 Base64 内容…"
          onChange={(event) => updateState({ ...state, input: event.target.value })}
        />
      </section>

      <div className="pipeline-main" ref={mainRef}>
        <section className="pipeline-steps-section" style={{ width: `${split * 100}%` }}>
        <div className="pipeline-section-head">
          <span>处理步骤 · {state.steps.length} 步</span>
          <span>拖动把手排序，或使用上下按钮；点击卡片配置</span>
        </div>
        <div className="pipeline-steps">
          {state.steps.map((step, index) => {
            const stepRun = runs[step.id] ?? { status: 'idle' as StepStatus }
            return (
              <div className="pipeline-step-wrap" key={step.id}>
                <div
                  className={`pipeline-step-card ${stepRun.status} ${draggingIndex === index ? 'dragging' : ''}`}
                  onClick={() => setSelectedId(step.id)}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    const from = Number(event.dataTransfer.getData('text/plain'))
                    setDraggingIndex(null)
                    if (Number.isInteger(from)) moveStepTo(from, index)
                  }}
                >
                  <div className="pipeline-step-head">
                    <span
                      className="pipeline-drag"
                      draggable={!running}
                      title="拖动排序"
                      onDragStart={(event) => {
                        event.stopPropagation()
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('text/plain', String(index))
                        setDraggingIndex(index)
                      }}
                      onDragEnd={() => setDraggingIndex(null)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <GripVertical size={13} strokeWidth={1.8} />
                    </span>
                    <span className="pipeline-step-index">{index + 1}</span>
                    <span className="pipeline-step-title">{stepTitle(step)}</span>
                    <div className="pipeline-step-controls">
                      <button
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelectedId(step.id)
                        }}
                        disabled={running}
                        aria-label="配置步骤"
                      >
                        <Settings2 size={12} strokeWidth={1.8} />
                      </button>
                      <button
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          const steps = state.steps.slice()
                          if (index > 0) {
                            ;[steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]
                            updateState({ ...state, steps })
                          }
                        }}
                        disabled={running || index === 0}
                        aria-label="上移步骤"
                      >
                        <ArrowUp size={12} strokeWidth={1.8} />
                      </button>
                      <button
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          const steps = state.steps.slice()
                          if (index < state.steps.length - 1) {
                            ;[steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]
                            updateState({ ...state, steps })
                          }
                        }}
                        disabled={running || index === state.steps.length - 1}
                        aria-label="下移步骤"
                      >
                        <ArrowDown size={12} strokeWidth={1.8} />
                      </button>
                      <button
                        className="btn ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeStep(step.id)
                        }}
                        disabled={running}
                        aria-label="删除步骤"
                      >
                        <Trash2 size={12} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>

                  <div className="pipeline-step-summary">
                    {configSummary(step).map((row) => (
                      <div className="pipeline-summary-row" key={row.label}>
                        <span>{row.label}</span>
                        <code title={row.value}>{row.value}</code>
                      </div>
                    ))}
                  </div>

                  <div className="pipeline-step-meta">
                    <div className={`pipeline-step-status ${stepRun.status}`}>
                      {statusIcon(stepRun.status)}
                      <span>
                        {stepRun.status === 'idle' && '待运行'}
                        {stepRun.status === 'running' && '运行中…'}
                        {stepRun.status === 'success' && `成功 · ${Math.round(stepRun.durationMs ?? 0)} ms`}
                        {stepRun.status === 'failed' && `失败 · ${Math.round(stepRun.durationMs ?? 0)} ms`}
                        {stepRun.status === 'skipped' && '已跳过'}
                      </span>
                    </div>
                    <div className="pipeline-step-output" title={stepRun.output}>
                      输出：{stepRun.output ? stepSummary(stepRun.output) : '—'}
                    </div>
                  </div>
                </div>
                {index < state.steps.length - 1 ? (
                  <div className="pipeline-arrow">
                    <ArrowDown size={14} strokeWidth={1.6} />
                  </div>
                ) : null}
              </div>
            )
          })}
          {!state.steps.length ? (
            <div className="pipeline-empty-steps">
              <Plus size={16} strokeWidth={1.6} />
              从右上角「添加步骤」开始
            </div>
          ) : null}
        </div>
        </section>

        <div
          className="pipeline-splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整步骤区与结果区宽度"
          title="拖动调整步骤区/结果区宽度"
          onPointerDown={startSplitDrag}
        />

        <section className="pipeline-output-pane">
      {failedIndex != null && failedRun?.error ? (
        <div className="pipeline-error-card">
          <AlertCircle size={14} strokeWidth={1.8} />
          <div>
            <strong>步骤 {failedIndex + 1} 失败</strong>
            <span>{failedRun.error}</span>
          </div>
          <span>后续步骤已跳过</span>
        </div>
      ) : null}

      <section className="pipeline-result">
        <div className="pipeline-section-head">
          <span>
            {failedIndex != null || cancelled ? '最后成功输出' : '最终输出'}
            {lastSuccess != null ? ` · 步骤 ${lastSuccess + 1} ${resultLabel}` : ''}
          </span>
          <button className="btn ghost" onClick={() => void copyOutput()} disabled={!output}>
            <Copy size={12} strokeWidth={1.8} />
            复制
          </button>
        </div>
        {output ? (
          <pre className="pipeline-result-pre">{output}</pre>
        ) : (
          <div className="pipeline-result-empty">
            {running ? '运行中…' : '运行后在这里显示最后一个成功步骤的输出'}
          </div>
        )}
        {failedIndex != null ? (
          <div className="pipeline-result-note">
            管道在第 {failedIndex + 1} 步中断；以上为步骤 {lastSuccess != null ? lastSuccess + 1 : '—'} 的快照，修复后可重新运行。
          </div>
        ) : null}
        </section>
        </section>
      </div>

      <footer className="small-tool-foot">
        <span>{footer}</span>
        <span className="small-tool-foot-note">
          {running ? '取消只会忽略当前结果，已启动的 jq/正则仍会被超时终止' : 'jq/正则走沙箱，编解码与计数在本地'}
        </span>
      </footer>

      {ioMode ? (
        <div className="pipeline-io-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIoMode(null)
        }}>
          <div className="pipeline-io-dialog" role="dialog" aria-modal="true" aria-label="工作流 JSON">
            <header>
              <strong>{ioMode === 'import' ? '导入工作流（文本）' : '导出工作流（文本）'}</strong>
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
              placeholder='{"version":1,"name":"...","input":"...","steps":[...]}'
              onChange={(event) => {
                setIoText(event.target.value)
                setIoError(null)
              }}
            />
            {ioError ? <div className="pipeline-io-error">{ioError}</div> : null}
            <footer>
              <span>{ioMode === 'import' ? '只接受固定步骤类型；不会执行脚本' : '工作流最多 20 步、输入上限 4MB'}</span>
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

      {selectedStep ? (
        <aside className="pipeline-config-panel">
          <header className="pipeline-config-head">
            <Settings2 size={14} strokeWidth={1.8} color="#2563eb" />
            <strong>
              步骤 {selectedIndex + 1} · {stepTitle(selectedStep)}
            </strong>
            <button className="btn ghost" onClick={() => setSelectedId(null)} aria-label="关闭配置">
              <X size={14} strokeWidth={1.8} />
            </button>
          </header>
          <div className="pipeline-config-body">
            <StepFields
              step={selectedStep}
              running={running}
              onChange={(patch) => updateStep(selectedStep.id, patch)}
            />
            <p className="pipeline-config-note">修改配置会清空上次运行结果；运行中不可编辑。</p>
          </div>
          <footer className="pipeline-config-foot">
            <button
              className="btn"
              onClick={() => removeStep(selectedStep.id)}
              disabled={running}
            >
              <Trash2 size={13} strokeWidth={1.8} />
              删除步骤
            </button>
            <button className="btn primary" onClick={() => setSelectedId(null)}>
              完成
            </button>
          </footer>
        </aside>
      ) : null}
    </div>
  )
}
