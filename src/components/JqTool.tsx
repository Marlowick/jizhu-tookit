import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BookOpen, Copy, Sparkles, Trash2, Zap } from 'lucide-react'
import { copyText, errorMessage, isTauri, jqRun } from '../core/ipc'
import { failedJqOutcome } from '../core/jqOutcome'
import { isModPressed, modKey } from '../core/keyboard'
import { SAMPLE_JQ_EXPR, SAMPLE_JSONL } from '../core/sample'
import { jqEngineLabels, useJqEngines } from '../core/useJqEngines'
import type { JqEngineChoice, JqOutcome, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'
import { JqSyntaxHelp } from './JqSyntaxHelp'

interface JqToolProps {
  tab: Tab
}

export function JqTool({ tab }: JqToolProps) {
  const engines = useJqEngines()
  const { systemVersion, jaqVersion, autoLabel } = jqEngineLabels(engines)

  const setJqInput = useAppStore((state) => state.setJqInput)
  const setJqExpr = useAppStore((state) => state.setJqExpr)
  const setJqEngine = useAppStore((state) => state.setJqEngine)
  const showToast = useAppStore((state) => state.showToast)

  const [result, setResult] = useState<JqOutcome | null>(null)
  const [running, setRunning] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const exprRef = useRef<HTMLInputElement>(null)
  const resultExpr = useRef('')

  const input = tab.jqInput ?? ''
  const expr = tab.jqExpr ?? ''
  const engine = tab.jqEngine ?? 'auto'
  const lineCount = input ? input.split('\n').length : 0

  useEffect(() => {
    if (input.trim()) exprRef.current?.focus()
    else inputRef.current?.focus()
    // 只在挂载时决定初始焦点
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = async () => {
    if (!isTauri) {
      showToast('浏览器预览不支持 jq，请使用桌面端打开')
      return
    }
    if (!input.trim()) {
      inputRef.current?.focus()
      showToast('请输入 JSON 或 JSON Lines')
      return
    }
    if (!expr.trim()) {
      exprRef.current?.focus()
      return
    }
    const program = expr
    setRunning(true)
    try {
      setResult(await jqRun(input, program, engine))
      resultExpr.current = program
    } catch (error) {
      setResult(failedJqOutcome(errorMessage(error)))
      resultExpr.current = program
    } finally {
      setRunning(false)
    }
  }

  const loadSample = () => {
    setJqInput(tab.id, SAMPLE_JSONL)
    setJqExpr(tab.id, SAMPLE_JQ_EXPR)
    setResult(null)
    exprRef.current?.focus()
  }

  const clear = () => {
    setJqInput(tab.id, '')
    setResult(null)
    inputRef.current?.focus()
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

  return (
    <div
      className="jq-tool"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && isModPressed(event)) {
          event.preventDefault()
          void run()
        }
      }}
    >
      <header className="jq-tool-head">
        <Zap size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>jq 查询</strong>
        <span className="jq-sub">手动输入 · JSON / JSON Lines</span>
        <span className="jq-tool-hint">{modKey('↵')} 运行</span>
      </header>

      <div className="jq-tool-bar">
        <label htmlFor="jq-tool-expr">expr</label>
        <input
          id="jq-tool-expr"
          ref={exprRef}
          className="jq-expr"
          value={expr}
          spellCheck={false}
          autoComplete="off"
          placeholder="select(.score > 80) | .user"
          onChange={(event) => {
            setJqExpr(tab.id, event.target.value)
          }}
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
        <select
          className="jq-select jq-engine-select"
          value={engine}
          onChange={(event) => {
            setJqEngine(tab.id, event.target.value as JqEngineChoice)
            setResult(null)
          }}
          aria-label="jq 引擎"
        >
          <option value="auto">{autoLabel}</option>
          <option value="system" disabled={!engines?.system}>
            系统 jq {engines?.system ? systemVersion : '（未检测到）'}
          </option>
          <option value="jaq">内置 jaq {jaqVersion}</option>
        </select>
        <button className="btn primary" onClick={() => void run()} disabled={running || !isTauri}>
          {running ? '运行中…' : '运行'}
        </button>
        <button className="btn" onClick={loadSample} title="载入 JSON Lines 示例">
          <Sparkles size={13} strokeWidth={1.8} />
          示例
        </button>
        <button className="btn ghost" onClick={clear} disabled={!input && !expr} title="清空输入与结果">
          <Trash2 size={13} strokeWidth={1.8} />
          清空
        </button>
        <button className="btn ghost" onClick={() => setHelpOpen(true)} title="jq 语法速查">
          <BookOpen size={13} strokeWidth={1.8} />
          语法
        </button>
      </div>

      <div className="jq-tool-body">
        <section className="jq-tool-pane">
          <div className="jq-tool-pane-head">
            <span>输入 · JSON Lines</span>
            <span className="jq-tool-meta">
              {lineCount} 行 · {input.length} 字符
            </span>
          </div>
          <textarea
            ref={inputRef}
            className="jq-input"
            value={input}
            spellCheck={false}
            autoComplete="off"
            placeholder={'{"user":"ada","score":91}\n{"user":"bob","score":72}\n\n也支持单个 JSON 文档'}
            onChange={(event) => {
              setJqInput(tab.id, event.target.value)
              setResult(null)
            }}
          />
        </section>

        <section className="jq-tool-pane">
          <div className="jq-tool-pane-head">
            <span>结果</span>
            {result && !result.error ? (
              <span className="jq-tool-meta">
                {result.count} 条 · {result.durationMs} ms · {result.engineLabel}
              </span>
            ) : null}
            <span className="jq-spacer" />
            {result?.output ? (
              <button className="btn ghost" onClick={() => void copy()}>
                <Copy size={13} strokeWidth={1.8} />
                复制
              </button>
            ) : null}
          </div>

          {!isTauri ? (
            <div className="jq-empty">浏览器预览不支持 jq，请使用桌面端打开</div>
          ) : result?.error ? (
            <div className="jq-error">
              <AlertTriangle size={14} strokeWidth={1.8} />
              <pre>{result.error.message}</pre>
            </div>
          ) : result ? (
            <pre className="jq-output">{result.output || '（无输出）'}</pre>
          ) : (
            <div className="jq-empty">输入 JSON Lines 和表达式后运行</div>
          )}
        </section>
      </div>

      <footer className="jq-tool-foot">
        每行一个 JSON 值；也支持单个 JSON 文档。表达式只在输入副本上执行，不会修改任何文件。
      </footer>
      {helpOpen ? <JqSyntaxHelp onClose={() => setHelpOpen(false)} /> : null}
    </div>
  )
}
