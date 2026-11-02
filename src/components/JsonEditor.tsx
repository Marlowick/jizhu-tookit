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
import { defaultKeymap, history, historyKeymap, indentWithTab, undo } from '@codemirror/commands'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EDITOR_SEARCH_EVENT, EDITOR_UNDO_EVENT } from '../core/editorActions'
import { editorPhrases } from '../core/i18n'
import { DEFAULT_JSON_INDENT } from '../core/jsonIndent'
import { regexHighlightExtensions } from '../core/editorHighlights'
import { modKey } from '../core/keyboard'
import { useI18n } from '../core/useI18n'
import type { Cursor, EditorHighlights } from '../core/types'

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
      caretColor: 'var(--text)',
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
  { dark: true },
)

const jizhuHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--syntax-key, #81a2be)' },
  { tag: tags.definition(tags.propertyName), color: 'var(--syntax-key, #81a2be)' },
  { tag: tags.string, color: 'var(--syntax-string, #b5bd68)' },
  { tag: tags.number, color: 'var(--syntax-number, #f0c674)' },
  { tag: tags.bool, color: 'var(--syntax-bool, #cc6666)' },
  { tag: tags.null, color: 'var(--syntax-bool, #cc6666)' },
  { tag: tags.atom, color: 'var(--syntax-bool, #cc6666)' },
  { tag: tags.punctuation, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.brace, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.squareBracket, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.separator, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.comment, color: 'var(--text-faint, #8a8f98)' },
  { tag: tags.operator, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.invalid, color: 'var(--danger, #d54e53)' },
])

interface JsonEditorProps {
  text: string
  errorLine: number | null
  reveal: { pos: number; seq: number } | null
  wordWrap: boolean
  indent?: 0 | 2 | 4
  docId: string
  highlights?: EditorHighlights | null
  onChange: (text: string) => void
  onCursor: (cursor: Cursor) => void
  onSelection?: (text: string) => void
}

export function JsonEditor({ text, docId, highlights, errorLine, reveal, wordWrap, indent = DEFAULT_JSON_INDENT, onChange, onCursor, onSelection }: JsonEditorProps) {
  const { t, language } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapCompartment = useRef(new Compartment()).current
  const indentCompartment = useRef(new Compartment()).current
  const highlightCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  const onSelectionRef = useRef(onSelection)

  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  onSelectionRef.current = onSelection

  useEffect(() => {
    if (!hostRef.current) return
    const phrases = editorPhrases(language)
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
      ...(phrases ? [EditorState.phrases.of(phrases)] : []),
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      highlightCompartment.of(EditorView.decorations.of(regexHighlightExtensions(docId, highlights))),
      indentCompartment.of([
        indentUnit.of(indent === 0 ? '\t' : ' '.repeat(indent)),
        EditorState.tabSize.of(indent === 0 ? 4 : indent),
      ]),
      placeholder(`${t('editor.placeholder.json')}\n${t('editor.hint', { mod: modKey('⇧P') })}`),
      EditorView.contentAttributes.of({ 'aria-label': 'JSON 文本编辑器' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          onCursorRef.current({ line: line.number, col: head - line.from + 1, pos: head })
          const range = update.state.selection.main
          onSelectionRef.current?.(range.empty ? '' : update.state.sliceDoc(range.from, range.to))
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
    viewRef.current?.dispatch({
      effects: indentCompartment.reconfigure([
        indentUnit.of(indent === 0 ? '\t' : ' '.repeat(indent)),
        EditorState.tabSize.of(indent === 0 ? 4 : indent),
      ]),
    })
  }, [indent, indentCompartment])

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

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightCompartment.reconfigure(
        EditorView.decorations.of(regexHighlightExtensions(docId, highlights)),
      ),
    })
  }, [docId, highlights, highlightCompartment])

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

  return <div className="editor-host" ref={hostRef} />
}
