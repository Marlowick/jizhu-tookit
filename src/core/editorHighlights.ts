import { Decoration, type DecorationSet } from '@codemirror/view'
import type { EditorHighlights } from './types'

export function regexHighlightExtensions(docId: string, highlights: EditorHighlights | null | undefined): DecorationSet {
  if (!highlights || highlights.docId !== docId || !highlights.ranges.length) return Decoration.none
  const marks = highlights.ranges
    .filter((range) => range.to > range.from)
    .map((range, index) =>
      Decoration.mark({
        class: index === highlights.current ? 'cm-regex-current' : 'cm-regex-hit',
      }).range(range.from, range.to),
    )
  return Decoration.set(marks, true)
}
