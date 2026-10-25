import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Copy, Plus, Trash2, Workflow, X } from 'lucide-react'
import { copyText, errorMessage, isTauri, jqRun } from '../core/ipc'
import { failedJqOutcome } from '../core/jqOutcome'
import { executePipelineStep, newStep, stepTitle } from '../core/pipeline'
import { StepFields } from './pipeline/StepFields'
import { isModPressed, modKey } from '../core/keyboard'
import { jqEngineLabels, useJqEngines } from '../core/useJqEngines'
import type { Doc, JqEngineChoice, JqOutcome, PipelineStep, PipelineStepType, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'
import { JqSyntaxHelp } from './JqSyntaxHelp'

interface JqPanelProps {
  tab: Tab
  doc: Doc
  onClose: () => void
}

const DEFAULT_HEIGHT = 380
const MIN_HEIGHT = 260
const DEFAULT_SPLIT = 0.44
const MIN_SPLIT = 0.26
const MAX_SPLIT = 0.72

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function JqPanel({ tab, doc, onClose }: JqPanelProps) {
  const engines = useJqEngines()
  const { systemVersion, jaqVersion, autoLabel } = jqEngineLabels(engines)

  const setJqExpr = useAppStore((state) => state.setJqExpr)
  const setJqEngine = useAppStore((state) => state.setJqEngine)
  const setJqHeight = useAppStore((state) => state.setJqHeight)
  const setJqSplit = useAppStore((state) => state.setJqSplit)
  const setJqSteps = useAppStore((state) => state.setJqSteps)
  const setText = useAppStore((state) => state.setText)
  const showToast = useAppStore((state) => state.showToast)

  const [result, setResult] = useState<JqOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [selectedStep, setSelectedStep] = useState<number | null>(null)
  const [height, setHeight] = useState(() => clamp(tab.jqHeight ?? DEFAULT_HEIGHT, MIN_HEIGHT, 640))
  const [split, setSplit] = useState(() => clamp(tab.jqSplit ?? DEFAULT_SPLIT, MIN_SPLIT, MAX_SPLIT))
  const panelRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const heightRef = useRef(height)
  const splitRef = useRef(split)
  const resultExpr = useRef('')

  const expr = tab.jqExpr ?? ''
  const steps = tab.jqSteps ?? []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    heightRef.current = height
  }, [height])

  useEffect(() => {
    splitRef.current = split
  }, [split])

  const run = async () => {
    if (!isTauri) {
      showToast('浏览器预览不支持 jq，请使用桌面端打开')
      return
    }
    if (!expr.trim()) {
      inputRef.current?.focus()
      return
    }
    const program = expr
    setRunning(true)
    try {
      const started = performance.now()
      const outcome = await jqRun(doc.text, program, tab.jqEngine ?? 'auto', false)
      resultExpr.current = program
      if (outcome.error) {
        setResult(outcome)
        return
      }
      let previous = outcome.output
      for (const step of steps) {
        const processed = await executePipelineStep(step, previous)
        previous = processed.output
      }
      const count = steps.length
        ? previous.split('\n').filter((line) => line.length > 0).length
        : outcome.count
      setResult({
        ...outcome,
        output: previous,
        count,
        durationMs: Math.round(performance.now() - started),
        engineLabel: steps.length ? `${outcome.engineLabel} · ${steps.length} 步` : outcome.engineLabel,
      })
    } catch (error) {
      setResult(failedJqOutcome(errorMessage(error)))
      resultExpr.current = program
    } finally {
      setRunning(false)
    }
  }

  const addStep = (type: PipelineStepType) => {
    const created = newStep(type)
    const step = type === 'jq' ? { ...created, raw: false } : created
    setJqSteps(tab.id, [...steps, step])
    setSelectedStep(steps.length)
    setResult(null)
  }

  const updateStep = (index: number, patch: Partial<PipelineStep>) => {
    setJqSteps(
      tab.id,
      steps.map((step, position) => (position === index ? ({ ...step, ...patch } as PipelineStep) : step)),
    )
    setResult(null)
  }

  const removeStep = (index: number) => {
    setJqSteps(tab.id, steps.filter((_, position) => position !== index))
    setSelectedStep(null)
    setResult(null)
  }

  const copy = async () => {
    if (!result?.output) return
    try {
      await copyText(result.output)
      showToast('已复制 jq 结果')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const canReplace = Boolean(result && !result.error && result.count === 1)
  const replace = () => {
    if (!result) return
    setText(doc.id, result.output)
    showToast('已用 jq 结果替换当前文档')
  }

  const startHeightDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = heightRef.current
    const parentHeight = panelRef.current?.parentElement?.clientHeight ?? window.innerHeight
    const maxHeight = Math.max(MIN_HEIGHT, parentHeight - 160)

    const move = (moveEvent: PointerEvent) => {
      const next = clamp(startHeight + startY - moveEvent.clientY, MIN_HEIGHT, maxHeight)
      heightRef.current = next
      setHeight(next)
    }
    const up = () => {
      setJqHeight(tab.id, heightRef.current)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const resetHeight = () => {
    const next = clamp(DEFAULT_HEIGHT, MIN_HEIGHT, 640)
    heightRef.current = next
    setHeight(next)
    setJqHeight(tab.id, next)
  }

  const startSplitDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect) return
    const move = (moveEvent: PointerEvent) => {
      const next = clamp((moveEvent.clientX - rect.left) / rect.width, MIN_SPLIT, MAX_SPLIT)
      splitRef.current = next
      setSplit(next)
    }
    const up = () => {
      setJqSplit(tab.id, splitRef.current)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const resetSplit = () => {
    splitRef.current = DEFAULT_SPLIT
    setSplit(DEFAULT_SPLIT)
    setJqSplit(tab.id, DEFAULT_SPLIT)
  }

  return (
    <section
      className="jq-panel"
      ref={panelRef}
      style={{ height, flex: `0 0 ${height}px` }}
      aria-label="jq 面板"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
          return
        }
        if (event.key === 'Enter' && isModPressed(event)) {
          event.preventDefault()
          void run()
        }
      }}
    >
      <div
        className="jq-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整 jq 面板高度"
        title="拖动调整高度，双击复位"
        onPointerDown={startHeightDrag}
        onDoubleClick={resetHeight}
      />

      <header className="jq-header">
        <Workflow size={14} strokeWidth={1.8} color="#2563eb" />
        <span className="jq-title">数据处理</span>
        <span className="jq-sub">— jq 步骤 + 后续处理</span>
        <span className="jq-belong">属于当前 Tab · {modKey('J')} 调起 · esc 关闭</span>
        <button className="btn ghost jq-help-btn" onClick={() => setHelpOpen(true)} title="jq 语法速查">
          <BookOpen size={13} strokeWidth={1.8} />
          语法
        </button>
        <button className="btn ghost jq-close" onClick={onClose} aria-label="关闭 jq 面板">
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>

      <div className="jq-body" ref={bodyRef}>
        <div className="jq-controls" style={{ width: `${split * 100}%` }}>
          <div className="data-step-rail">
            <span className="data-step-label">步骤</span>
            <button
              className={`data-step-chip ${selectedStep == null ? 'active' : ''}`}
              onClick={() => setSelectedStep(null)}
            >
              1 jq
            </button>
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={`data-step-chip ${selectedStep === index ? 'active' : ''}`}
                onClick={() => setSelectedStep(index)}
              >
                {index + 2} {stepTitle(step)}
              </button>
            ))}
            <select
              className="data-step-add"
              value=""
              onChange={(event) => {
                if (event.target.value) addStep(event.target.value as PipelineStepType)
              }}
              aria-label="添加处理步骤"
            >
              <option value="">+ 步骤</option>
              <option value="jq">jq</option>
              <option value="codec">编码 / 解码</option>
              <option value="regex">正则</option>
              <option value="count">计数</option>
            </select>
          </div>

          <div className="jq-row">
            <label htmlFor="jq-expr">expr</label>
            <input
              id="jq-expr"
              ref={inputRef}
              className="jq-expr"
              value={expr}
              spellCheck={false}
              autoComplete="off"
              placeholder=".users[] | select(.age >= 18)"
              onChange={(event) => setJqExpr(tab.id, event.target.value)}
              onBlur={() => {
                // 编辑期间保留旧结果；离开输入框后，如果表达式已改动，再清空过期结果
                if (result && resultExpr.current !== expr) setResult(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !isModPressed(event)) {
                  event.preventDefault()
                  void run()
                }
              }}
            />
            <button className="btn primary" onClick={() => void run()} disabled={running || !isTauri}>
              {running ? '运行中…' : '运行'}
            </button>
          </div>

          <div className="jq-row">
            <label htmlFor="jq-engine">引擎</label>
            <select
              id="jq-engine"
              className="jq-select jq-engine"
              value={tab.jqEngine ?? 'auto'}
              onChange={(event) => setJqEngine(tab.id, event.target.value as JqEngineChoice)}
            >
              <option value="auto">{autoLabel}</option>
              <option value="system" disabled={!engines?.system}>
                系统 jq {engines?.system ? systemVersion : '（未检测到）'}
              </option>
              <option value="jaq">内置 jaq {jaqVersion}</option>
            </select>
            <span className="jq-hint">{modKey('↵')} 运行</span>
          </div>

          <div className="jq-hint jq-note">
            {isTauri
              ? `当前文档：${doc.title} · 步骤链在副本上执行，结果不会自动写入原文`
              : '浏览器预览不支持 jq，请使用桌面端打开'}
          </div>

          {selectedStep != null && steps[selectedStep] ? (
            <div className="data-step-config">
              <div className="data-step-config-head">
                <span>步骤 {selectedStep + 2} · {stepTitle(steps[selectedStep])}</span>
                <button
                  className="btn ghost"
                  onClick={() => removeStep(selectedStep)}
                  title="删除步骤"
                  aria-label="删除处理步骤"
                >
                  <Trash2 size={12} strokeWidth={1.8} />
                </button>
              </div>
              <StepFields
                step={steps[selectedStep]}
                running={running}
                onChange={(patch) => updateStep(selectedStep, patch)}
              />
            </div>
          ) : (
            <div className="data-step-hint">
              <Plus size={12} strokeWidth={1.8} />
              默认步骤是 jq；从上方「+ 步骤」添加后续处理
            </div>
          )}
        </div>

        <div
          className="jq-col-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整控制区与结果区宽度"
          title="拖动调整宽度，双击复位"
          onPointerDown={startSplitDrag}
          onDoubleClick={resetSplit}
        />

        <div className="jq-result">
          <div className="jq-result-head">
            <span>结果</span>
            {result && !result.error ? (
              <span className="jq-meta">
                {result.count} 条 · {result.durationMs} ms · {result.engineLabel}
              </span>
            ) : null}
            {result?.error ? <span className="jq-error-kind">{result.error.kind}</span> : null}
            <span className="jq-spacer" />
            {result?.output ? (
              <>
                <button className="btn ghost" onClick={() => void copy()}>
                  <Copy size={13} strokeWidth={1.8} />
                  复制
                </button>
              </>
            ) : null}
            {canReplace ? (
              <button className="btn ghost" onClick={replace}>
                替换文档
              </button>
            ) : null}
          </div>

          {result?.error ? (
            <div className="jq-error">
              <AlertTriangle size={14} strokeWidth={1.8} />
              <pre>{result.error.message}</pre>
            </div>
          ) : result ? (
            <pre className="jq-output">{result.output || '（无输出）'}</pre>
          ) : (
            <div className="jq-empty">输入表达式后回车运行</div>
          )}
        </div>
      </div>
      {helpOpen ? <JqSyntaxHelp onClose={() => setHelpOpen(false)} /> : null}
    </section>
  )
}
