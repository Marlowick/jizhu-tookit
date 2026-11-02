import { useEffect, useRef, useState } from 'react'
import { BookOpen, Sparkles, X } from 'lucide-react'
import {
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  type Extension,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  WidgetType,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
} from '@codemirror/commands'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EDITOR_SEARCH_EVENT, EDITOR_UNDO_EVENT } from '../../core/editorActions'
import { evaluateCalcLines, formatCalcNumber, type CalcLineResult } from '../../core/calc'
import { editorPhrases } from '../../core/i18n'
import { modKey } from '../../core/keyboard'
import { useI18n } from '../../core/useI18n'
import type { Cursor, EditorHighlights } from '../../core/types'

const plainTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'transparent',
      color: 'var(--text)',
      fontSize: 'var(--editor-font-size, 13px)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '22px',
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '14px 0 48px',
      caretColor: 'var(--text)',
    },
    '.cm-line': { padding: '0 18px' },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-faint)',
      border: 'none',
      paddingLeft: '8px',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '38px',
      padding: '0 12px 0 8px',
      fontFamily: 'var(--font-mono)',
      fontSize: '11.5px',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
    },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '&.cm-focused': { outline: 'none' },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--text)',
      borderLeftWidth: '1.5px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--cm-selection)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--cm-search)',
      outline: '1px solid var(--cm-search-border)',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-panel)',
      borderColor: 'var(--border)',
      fontFamily: 'var(--font-ui)',
    },
  },
  { dark: true },
)

function highlightDecorations(docId: string, highlights: EditorHighlights | null | undefined): DecorationSet {
  if (!highlights || highlights.docId !== docId || !highlights.ranges.length) return Decoration.none
  return Decoration.set(
    highlights.ranges
      .filter((range) => range.to > range.from)
      .map((range, index) =>
        Decoration.mark({ class: index === highlights.current ? 'cm-regex-current' : 'cm-regex-hit' }).range(range.from, range.to),
      ),
    true,
  )
}

const CALC_SAMPLE = `1 + 2 * 3
(1 + 2) * 3
price = 2
count = 8
price * count
sqrt(16)
round(1.234, 2)
min(2, 8)`

class CalcResultWidget extends WidgetType {
  constructor(readonly result: CalcLineResult) {
    super()
  }

  eq(other: CalcResultWidget): boolean {
    return (
      other.result.value === this.result.value &&
      other.result.error === this.result.error &&
      other.result.substituted === this.result.substituted
    )
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = this.result.error ? 'calc-result error' : 'calc-result'
    if (this.result.error) {
      node.textContent = `! ${this.result.error}`
    } else {
      const value = formatCalcNumber(this.result.value ?? 0)
      node.textContent = this.result.substituted ? `${this.result.substituted} = ${value}` : `= ${value}`
    }
    node.title = this.result.error ?? '计算结果'
    node.setAttribute('aria-hidden', 'true')
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

function sameCalcResults(left: CalcLineResult[], right: CalcLineResult[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      item.line === other.line &&
      item.to === other.to &&
      Object.is(item.value, other.value) &&
      item.error === other.error &&
      item.substituted === other.substituted &&
      item.assignment === other.assignment
    )
  })
}

function calcDecorations(results: CalcLineResult[]): DecorationSet {
  const widgets = results.map((result) =>
    Decoration.widget({ widget: new CalcResultWidget(result), side: 1 }).range(result.to),
  )
  return Decoration.set(widgets, true)
}

const setCalcDecorations = StateEffect.define<DecorationSet>()

const calcDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    let next = value.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (effect.is(setCalcDecorations)) next = effect.value
    }
    return next
  },
})

interface PlainEditorProps {
  text: string
  docId: string
  calc?: boolean
  highlights?: EditorHighlights | null
  wordWrap: boolean
  onChange: (text: string) => void
  onCursor: (cursor: Cursor) => void
  onSelection: (text: string) => void
}

export function PlainEditor({ text, docId, calc = false, highlights, wordWrap, onChange, onCursor, onSelection }: PlainEditorProps) {
  const { t, language } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapCompartment = useRef(new Compartment()).current
  const highlightCompartment = useRef(new Compartment()).current
  const placeholderCompartment = useRef(new Compartment()).current
  const [calcResults, setCalcResults] = useState<CalcLineResult[]>([])
  const [helpOpen, setHelpOpen] = useState(false)
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  const onSelectionRef = useRef(onSelection)

  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  onSelectionRef.current = onSelection

  const placeholderText = calc
    ? (language === 'en-US' ? 'Type an expression, e.g. 1 + 2 * 3' : '输入算式，例如 1 + 2 * 3')
    : `${t('editor.placeholder.plain')}\n${t('editor.hint', { mod: modKey('⇧P') })}`

  useEffect(() => {
    if (!hostRef.current) return
    const phrases = editorPhrases(language)
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      search({ top: true }),
      ...(phrases ? [EditorState.phrases.of(phrases)] : []),
      plainTheme,
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      highlightCompartment.of(EditorView.decorations.of(highlightDecorations(docId, highlights))),
      calcDecorationField,
      EditorView.decorations.from(calcDecorationField),
      EditorState.tabSize.of(2),
      placeholderCompartment.of(placeholder(placeholderText)),
      EditorView.contentAttributes.of({ 'aria-label': calc ? '计算编辑器' : '文本编辑器' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          onCursorRef.current({ line: line.number, col: head - line.from + 1, pos: head })
          const range = update.state.selection.main
          onSelectionRef.current(range.empty ? '' : update.state.sliceDoc(range.from, range.to))
        }
      }),
      keymap.of([
        { key: 'Ctrl-z', run: undo, preventDefault: true },
        ...searchKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
    ]
    const state = EditorState.create({ doc: text, extensions })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    requestAnimationFrame(() => view.focus())
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 只在挂载时创建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === text) return
    // 外部整体替换（示例/格式化/清空）前先移除旧的行内 widget，
    // 避免旧位置超出新的 changeset 范围。
    view.dispatch({ effects: setCalcDecorations.of(Decoration.none) })
    setCalcResults([])
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } })
  }, [text])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    })
  }, [wordWrap, wrapCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightCompartment.reconfigure(
        EditorView.decorations.of(highlightDecorations(docId, highlights)),
      ),
    })
  }, [docId, highlights, highlightCompartment])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: placeholderCompartment.reconfigure(placeholder(placeholderText)),
    })
  }, [calc, language, placeholderCompartment, t])

  useEffect(() => {
    setCalcResults([])
  }, [docId])

  useEffect(() => {
    if (!calc) {
      setHelpOpen(false)
      return
    }
    if (!text.trim()) setHelpOpen(true)
    // 只在进入 Calc 时决定是否展示新手示例，不因用户关闭而反复弹出
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calc])

  useEffect(() => {
    if (!calc || !text.trim()) {
      setCalcResults((previous) => (previous.length ? [] : previous))
      return
    }
    // 输入期间保留旧答案，避免隐藏/重新出现；停顿后仅在结果真正变化时更新。
    const timer = window.setTimeout(() => {
      const next = evaluateCalcLines(text)
      setCalcResults((previous) => (sameCalcResults(previous, next) ? previous : next))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [calc, text])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setCalcDecorations.of(calc ? calcDecorations(calcResults) : Decoration.none),
    })
  }, [calc, calcResults])

  useEffect(() => {
    if (!highlights || highlights.current == null) return
    const view = viewRef.current
    const range = highlights.ranges[highlights.current]
    if (!view || !range) return
    view.dispatch({
      selection: { anchor: range.from, head: range.to },
      effects: EditorView.scrollIntoView(range.from, { y: 'center' }),
    })
  }, [highlights?.seq])

  useEffect(() => {
    const onUndo = () => {
      const view = viewRef.current
      if (!view) return
      view.focus()
      undo(view)
    }
    window.addEventListener(EDITOR_UNDO_EVENT, onUndo)
    return () => window.removeEventListener(EDITOR_UNDO_EVENT, onUndo)
  }, [])

  useEffect(() => {
    const onSearch = () => {
      const view = viewRef.current
      if (!view) return
      view.focus()
      openSearchPanel(view)
    }
    window.addEventListener(EDITOR_SEARCH_EVENT, onSearch)
    return () => window.removeEventListener(EDITOR_SEARCH_EVENT, onSearch)
  }, [])

  const fillSample = () => {
    onChange(CALC_SAMPLE)
    setHelpOpen(false)
    window.requestAnimationFrame(() => viewRef.current?.focus())
  }

  return (
    <div className={`editor-host plain-editor ${calc ? 'calc-editor' : ''}`}>
      <div className="plain-editor-cm" ref={hostRef} />
      {calc ? (
        <div className="calc-help">
          <button
            className={`calc-help-toggle ${helpOpen ? 'active' : ''}`}
            onClick={() => setHelpOpen((open) => !open)}
            aria-expanded={helpOpen}
            title="Calc 使用示例"
          >
            <BookOpen size={12} strokeWidth={1.8} />
            示例
          </button>
          {helpOpen ? (
            <section className="calc-help-panel" aria-label="Calc 使用示例">
              <header>
                <strong>Calc 怎么用</strong>
                <button className="btn ghost" onClick={() => setHelpOpen(false)} aria-label="关闭 Calc 示例">
                  <X size={13} strokeWidth={1.8} />
                </button>
              </header>
              <p>每行独立计算；赋值后，后续行可以直接引用变量。结果会显示在行末。</p>
              <pre>{`1 + 2 * 3        → 7
price = 2
count = 8
price * count    → 2 * 8 = 16
sqrt(16)         → 4
round(1.234, 2)  → 1.23
log(100)         → 2`}</pre>
              <div className="calc-help-functions">
                <span>内置函数</span>
                <code>abs</code><code>sqrt</code><code>round</code><code>floor</code>
                <code>ceil</code><code>min</code><code>max</code><code>pow</code><code>mod</code>
                <code>log</code><code>ln</code><code>exp</code><code>sin</code><code>cos</code><code>tan</code><code>sum</code>
                <code>pi</code><code>e</code>
              </div>
              <p className="calc-help-note">输入停顿约 400ms 后更新；变量替换会显示在答案前，例如 <code>2 * 8 = 16</code>。</p>
              {!text.trim() ? (
                <button className="btn primary calc-help-fill" onClick={fillSample}>
                  <Sparkles size={12} strokeWidth={1.8} />
                  填入示例
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
