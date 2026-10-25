export interface Token {
  text: string
  className?: string
}

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])/g

export function tokenizeJson(line: string): Token[] {
  const tokens: Token[] = []
  let last = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > last) tokens.push({ text: line.slice(last, match.index) })
    const [, stringToken, colon, numberToken, boolToken, punct] = match
    if (stringToken) {
      tokens.push({ text: stringToken, className: colon ? 'tok-key' : 'tok-string' })
      if (colon) tokens.push({ text: colon, className: 'tok-punct' })
    } else if (numberToken) {
      tokens.push({ text: numberToken, className: 'tok-number' })
    } else if (boolToken) {
      tokens.push({ text: boolToken, className: 'tok-bool' })
    } else if (punct) {
      tokens.push({ text: punct, className: 'tok-punct' })
    }
    last = match.index + match[0].length
  }
  if (last < line.length) tokens.push({ text: line.slice(last) })
  return tokens
}

export interface InlineRanges {
  a: [number, number] | null
  b: [number, number] | null
}

export function inlineRanges(a: string, b: string): InlineRanges {
  if (a === b) return { a: null, b: null }
  if (a.length > 500 || b.length > 500) {
    return { a: [0, a.length], b: [0, b.length] }
  }
  const limit = Math.min(a.length, b.length)
  let prefix = 0
  while (prefix < limit && a[prefix] === b[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < limit - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const aStart = prefix
  const bStart = prefix
  const aEnd = a.length - suffix
  const bEnd = b.length - suffix
  if (aStart >= aEnd && bStart >= bEnd) return { a: null, b: null }
  return {
    a: aStart < aEnd ? [aStart, aEnd] : null,
    b: bStart < bEnd ? [bStart, bEnd] : null,
  }
}
