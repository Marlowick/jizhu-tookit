import { useMemo, type ReactNode } from 'react'

const MAX_HIGHLIGHT = 80_000

type TokenKind = 'key' | 'string' | 'number' | 'bool' | 'punct'

interface Token {
  text: string
  kind?: TokenKind
}

function tokenizeJson(text: string): Token[] {
  const tokens: Token[] = []
  let plain = ''
  let index = 0

  const flush = () => {
    if (plain) {
      tokens.push({ text: plain })
      plain = ''
    }
  }

  while (index < text.length) {
    const char = text[index]

    if (char === '"') {
      let end = index + 1
      while (end < text.length) {
        if (text[end] === '\\') {
          end += 2
          continue
        }
        if (text[end] === '"') {
          end += 1
          break
        }
        end += 1
      }
      const raw = text.slice(index, end)
      let lookahead = end
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1
      flush()
      tokens.push({ text: raw, kind: text[lookahead] === ':' ? 'key' : 'string' })
      index = end
      continue
    }

    if (char === '-' || (char >= '0' && char <= '9')) {
      const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index))
      if (match) {
        flush()
        tokens.push({ text: match[0], kind: 'number' })
        index += match[0].length
        continue
      }
    }

    if (text.startsWith('true', index) || text.startsWith('false', index) || text.startsWith('null', index)) {
      const word = text.startsWith('false', index) ? 'false' : text.startsWith('true', index) ? 'true' : 'null'
      const next = text[index + word.length]
      if (!next || !/[A-Za-z0-9_]/.test(next)) {
        flush()
        tokens.push({ text: word, kind: 'bool' })
        index += word.length
        continue
      }
    }

    if ('{}[],:'.includes(char)) {
      flush()
      tokens.push({ text: char, kind: 'punct' })
      index += 1
      continue
    }

    plain += char
    index += 1
  }

  flush()
  return tokens
}

interface JsonHighlightProps {
  text: string
  className?: string
  emptyText?: string
}

// Read-only JSON highlighter sharing the editor's --syntax-* palette.
export function JsonHighlight({ text, className, emptyText }: JsonHighlightProps) {
  const nodes = useMemo<ReactNode[] | null>(() => {
    if (!text || text.length > MAX_HIGHLIGHT) return null
    return tokenizeJson(text).map((token, index) =>
      token.kind ? (
        <span key={index} className={`json-hl-${token.kind}`}>
          {token.text}
        </span>
      ) : (
        token.text
      ),
    )
  }, [text])

  if (!text) return <pre className={className}>{emptyText ?? ''}</pre>
  return <pre className={className}>{nodes ?? text}</pre>
}
