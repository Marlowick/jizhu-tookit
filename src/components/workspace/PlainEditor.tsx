import { useEffect, useRef } from 'react'
import {
  Compartment,
  EditorState,
  type Extension,
} from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  undo,
} from '@codemirror/commands'
import { search, searchKeymap } from '@codemirror/search'
import { EDITOR_UNDO_EVENT } from '../../core/editorActions'
import type { Cursor } from '../../core/types'

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

interface PlainEditorProps {
  text: string
  wordWrap: boolean
  onChange: (text: string) => void
  onCursor: (cursor: Cursor) => void
  onSelection: (text: string) => void
}

export function PlainEditor({ text, wordWrap, onChange, onCursor, onSelection }: PlainEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const wrapCompartment = useRef(new Compartment()).current
  const onChangeRef = useRef(onChange)
  const onCursorRef = useRef(onCursor)
  const onSelectionRef = useRef(onSelection)

  onChangeRef.current = onChange
  onCursorRef.current = onCursor
  onSelectionRef.current = onSelection

  useEffect(() => {
    if (!hostRef.current) return
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      history(),
      drawSelection(),
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
      }),
      plainTheme,
      wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      EditorState.tabSize.of(2),
      placeholder('输入或粘贴文本…'),
      EditorView.contentAttributes.of({ 'aria-label': '文本编辑器' }),
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
    view.dispatch({ changes: { from: 0, to: current.length, insert: text } })
  }, [text])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    })
  }, [wordWrap, wrapCompartment])

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

  return <div className="editor-host plain-editor" ref={hostRef} />
}
