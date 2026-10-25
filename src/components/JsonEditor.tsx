import { useEffect, useRef } from 'react'
import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type DecorationSet,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Cursor } from '../core/types'

const setErrorLine = StateEffect.define<number | null>()

const errorLineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLine)) continue
      const line = effect.value
      if (!line || line < 1 || line > transaction.state.doc.lines) {
        next = Decoration.none
        continue
      }
      const info = transaction.state.doc.line(line)
      next = Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(info.from)])
    }
    return next
  },
  provide: (field) => EditorView.decorations.from(field),
})

const jizhuTheme = EditorView.theme(
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
      padding: '12px 0 48px',
      caretColor: '#1f2328',
    },
    '.cm-line': {
      padding: '0 16px 0 4px',
    },
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
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '&.cm-focused': {
      outline: 'none',
    },
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
  { dark: false },
)

const jizhuHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--syntax-key)' },
  { tag: tags.string, color: 'var(--syntax-string)' },
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.bool, color: 'var(--syntax-bool)' },
  { tag: tags.null, color: 'var(--syntax-bool)' },
  { tag: tags.punctuation, color: 'var(--syntax-punct)' },
  { tag: tags.brace, color: 'var(--syntax-punct)' },
  { tag: tags.squareBracket, color: 'var(--syntax-punct)' },
])

interface JsonEditorProps {
  text: string
  errorLine: number | null
  reveal: { pos: number; seq: number } | null
  wordWrap: boolean
  onChange: (text: string) => void
  onCursor: (cursor: Cursor) => void
}

export function JsonEditor({ text, errorLine, reveal, wordWrap, onChange, onCursor }: JsonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)

  onChangeRef.current = onChange
  onCursorRef.current = onCursor

  useEffect(() => {
    if (!hostRef.current) return
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
      json(),
      syntaxHighlighting(jizhuHighlight),
      jizhuTheme,
      errorLineField,
      search({ top: true }),
      EditorState.phrases.of({
        Find: '查找',
        Replace: '替换',
        next: '下一个',
        previous: '上一个',
        all: '全部',
        'match case': '区分大小写',
        regexp: '正则',
        'by word': '全词匹配',
        replace: '替换',
        'replace all': '全部替换',
        close: '关闭',
        'Go to line': '跳转到行',
        'current match': '当前匹配',
        go: '跳转',
        'on line': '行',
      }),
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      EditorState.tabSize.of(2),
      placeholder('在这里输入或粘贴 JSON…'),
      EditorView.contentAttributes.of({ 'aria-label': 'JSON 文本编辑器' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          onCursorRef.current({ line: line.number, col: head - line.from + 1, pos: head })
        }
      }),
      keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
    ]
    const state = EditorState.create({ doc: text, extensions })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    requestAnimationFrame(() => view.focus())
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 只在挂载时创建；切换文档由父组件 key 控制重新挂载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === text) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } })
  }, [text])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setErrorLine.of(errorLine ?? null) })
  }, [errorLine])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    })
  }, [wordWrap, wrapCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !reveal) return
    const pos = Math.max(0, Math.min(reveal.pos, view.state.doc.length))
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'center' }),
    })
    view.focus()
    // reveal.seq 变化时才跳转，避免同一位置重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.seq])

  return <div className="editor-host" ref={hostRef} />
}
