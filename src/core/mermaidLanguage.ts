import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

const KEYWORDS = new Set([
  'graph', 'flowchart', 'sequencediagram', 'classdiagram', 'statediagram', 'statediagram-v2',
  'erdiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'journey', 'gitgraph', 'quadrantchart',
  'requirementdiagram', 'c4context', 'c4container', 'c4component', 'c4dynamic', 'c4deployment',
  'sankey-beta', 'xychart-beta', 'block-beta', 'packet-beta', 'architecture-beta',
  'subgraph', 'end', 'direction', 'participant', 'actor', 'activate', 'deactivate',
  'loop', 'alt', 'else', 'opt', 'par', 'and', 'critical', 'break', 'rect', 'note',
  'over', 'left', 'right', 'of', 'classdef', 'class', 'style', 'linkstyle', 'click',
  'title', 'section', 'dateformat', 'axisformat', 'excludes', 'todaymarker',
  'commit', 'branch', 'checkout', 'merge', 'cherry-pick', 'state', 'choice',
  'autonumber', 'participant', 'create', 'destroy',
])

const mermaidTokens = {
  keyword: tags.keyword,
  operator: tags.operator,
  string: tags.string,
  comment: tags.comment,
  punctuation: tags.punctuation,
  number: tags.number,
  variableName: tags.variableName,
  label: tags.labelName,
}

const mermaidLanguage = StreamLanguage.define({
  tokenTable: mermaidTokens,
  token(stream) {
    if (stream.match(/^%%[^\n]*/)) return 'comment'
    if (stream.eatSpace()) return null
    if (stream.match(/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)) return 'string'
    if (stream.match(/^(?:<--?>|<-.->|-->>|-.->|-->|->>|==>|--x|--o|---|~~~|--|->|<-|=)/)) return 'operator'
    if (stream.match(/^#[0-9a-fA-F]{3,8}/)) return 'number'
    if (stream.match(/^[0-9]+/)) return 'number'
    if (stream.match(/^[\[\]{}()<>|:;,]+/)) return 'punctuation'
    if (stream.match(/^[\p{L}\p{N}_-]+/u)) {
      const word = stream.current().toLowerCase()
      return KEYWORDS.has(word) ? 'keyword' : 'variableName'
    }
    stream.next()
    return null
  },
})

const mermaidHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--syntax-key, #81a2be)', fontWeight: '600' },
  { tag: tags.operator, color: 'var(--syntax-bool, #cc6666)' },
  { tag: tags.string, color: 'var(--syntax-string, #b5bd68)' },
  { tag: tags.comment, color: 'var(--text-faint, #8a8f98)', fontStyle: 'italic' },
  { tag: tags.punctuation, color: 'var(--syntax-punct, #c5c8c6)' },
  { tag: tags.number, color: 'var(--syntax-number, #f0c674)' },
  { tag: tags.variableName, color: 'var(--text, #ffffff)' },
])

export const mermaidHighlighting = [
  mermaidLanguage,
  syntaxHighlighting(mermaidHighlightStyle),
]
