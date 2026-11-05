/**
 * Calc 模式的最小求值器。
 * 每行独立求值；赋值按行顺序写入环境，后续行可引用。
 */

export interface CalcLineResult {
  line: number
  /** 结果 widget 在整篇文本中的插入位置（行末，去掉尾随空白）。 */
  to: number
  value?: number
  /** Human-readable result for time-like functions (e.g. datetime). */
  display?: string
  error?: string
  assignment?: string
  /** 表达式中的变量已被替换成具体值，例如 price * count -> 2 * 8。 */
  substituted?: string
}

class CalcError extends Error {}

type Token =
  | { kind: 'number'; value: number; start: number; end: number }
  | { kind: 'identifier'; value: string; start: number; end: number }
  | { kind: 'operator'; value: '+' | '-' | '*' | '/'; start: number; end: number }
  | { kind: 'paren'; value: '(' | ')'; start: number; end: number }
  | { kind: 'comma'; start: number; end: number }

function isIdentifierStart(char: string): boolean {
  return /[\p{L}_]/u.test(char)
}

function isIdentifierPart(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char)
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    const start = index
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char, start, end: start + 1 })
      index += 1
      continue
    }
    if (char === ',') {
      tokens.push({ kind: 'comma', start, end: start + 1 })
      index += 1
      continue
    }
    if (char === '+' || char === '-' || char === '*' || char === '/') {
      tokens.push({ kind: 'operator', value: char, start, end: start + 1 })
      index += 1
      continue
    }
    if ((char >= '0' && char <= '9') || (char === '.' && source[index + 1] >= '0' && source[index + 1] <= '9')) {
      const match = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
      if (!match) throw new CalcError('数字格式错误')
      tokens.push({ kind: 'number', value: Number(match[0]), start, end: start + match[0].length })
      index += match[0].length
      continue
    }
    if (isIdentifierStart(char)) {
      let end = index + 1
      while (end < source.length && isIdentifierPart(source[end])) end += 1
      tokens.push({ kind: 'identifier', value: source.slice(index, end), start, end })
      index = end
      continue
    }
    throw new CalcError(`无法识别字符“${char}”`)
  }
  return tokens
}

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

interface CalcFunction {
  minArgs: number
  maxArgs: number
  apply: (args: number[]) => number
}

function invalid(message: string): never {
  throw new CalcError(message)
}

const FUNCTIONS: Record<string, CalcFunction> = {
  abs: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.abs(value) },
  sqrt: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      if (value < 0) invalid('sqrt 参数不能为负数')
      return Math.sqrt(value)
    },
  },
  floor: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.floor(value) },
  ceil: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.ceil(value) },
  round: {
    minArgs: 1,
    maxArgs: 2,
    apply: ([value, digits = 0]) => {
      if (!Number.isInteger(digits)) invalid('round 位数必须是整数')
      if (Math.abs(digits) > 12) invalid('round 位数超出范围')
      const factor = 10 ** digits
      return Math.round((value + Number.EPSILON) * factor) / factor
    },
  },
  min: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    apply: (args) => Math.min(...args),
  },
  max: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    apply: (args) => Math.max(...args),
  },
  pow: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([base, exponent]) => base ** exponent,
  },
  mod: {
    minArgs: 2,
    maxArgs: 2,
    apply: ([value, divisor]) => {
      if (divisor === 0) invalid('mod 除数不能为零')
      return value % divisor
    },
  },
  log: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      if (value <= 0) invalid('log 参数必须大于 0')
      return Math.log10(value)
    },
  },
  ln: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      if (value <= 0) invalid('ln 参数必须大于 0')
      return Math.log(value)
    },
  },
  exp: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.exp(value) },
  sin: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.sin(value) },
  cos: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.cos(value) },
  tan: { minArgs: 1, maxArgs: 1, apply: ([value]) => Math.tan(value) },
  datetime: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      timestampMs(value)
      return value
    },
  },
  timestamp: {
    minArgs: 1,
    maxArgs: 1,
    apply: ([value]) => {
      timestampMs(value)
      return value
    },
  },
  sum: {
    minArgs: 1,
    maxArgs: Number.POSITIVE_INFINITY,
    apply: (args) => args.reduce((total, value) => total + value, 0),
  },
}

function callFunction(name: string, args: number[]): number {
  const fn = FUNCTIONS[name.toLowerCase()]
  if (!fn) invalid(`未知函数 ${name}`)
  if (args.length < fn.minArgs || args.length > fn.maxArgs) {
    const expected = fn.minArgs === fn.maxArgs ? `${fn.minArgs}` : `${fn.minArgs}–${fn.maxArgs === Number.POSITIVE_INFINITY ? 'n' : fn.maxArgs}`
    invalid(`${name} 需要 ${expected} 个参数，实际 ${args.length} 个`)
  }
  const value = fn.apply(args)
  if (!Number.isFinite(value)) invalid(`${name} 计算结果无效`)
  return value
}

class Parser {
  private index = 0
  private readonly tokens: Token[]
  private readonly variables: Map<string, number>

  constructor(tokens: Token[], variables: Map<string, number>) {
    this.tokens = tokens
    this.variables = variables
  }

  parse(): number {
    if (!this.tokens.length) throw new CalcError('缺少表达式')
    const value = this.expression()
    if (this.index < this.tokens.length) throw new CalcError('表达式后有多余内容')
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private take(): Token {
    const token = this.tokens[this.index]
    if (!token) throw new CalcError('表达式不完整')
    this.index += 1
    return token
  }

  private expression(): number {
    let value = this.term()
    let token = this.peek()
    while (token?.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      this.take()
      const right = this.term()
      value = token.value === '+' ? value + right : value - right
      token = this.peek()
    }
    return value
  }

  private term(): number {
    let value = this.unary()
    let token = this.peek()
    while (token?.kind === 'operator' && (token.value === '*' || token.value === '/')) {
      this.take()
      const right = this.unary()
      if (token.value === '*') {
        value *= right
      } else {
        if (right === 0) throw new CalcError('除以零')
        value /= right
      }
      token = this.peek()
    }
    return value
  }

  private unary(): number {
    const token = this.peek()
    if (token?.kind === 'operator' && (token.value === '+' || token.value === '-')) {
      this.take()
      const value = this.unary()
      return token.value === '-' ? -value : value
    }
    return this.primary()
  }

  private functionCall(name: string): number {
    this.take()
    const args: number[] = []
    if (this.peek()?.kind === 'paren' && (this.peek() as { value: string }).value === ')') {
      this.take()
      return callFunction(name, args)
    }
    while (true) {
      args.push(this.expression())
      const token = this.peek()
      if (token?.kind === 'comma') {
        this.take()
        continue
      }
      if (token?.kind === 'paren' && token.value === ')') {
        this.take()
        break
      }
      throw new CalcError('函数参数缺少右括号')
    }
    return callFunction(name, args)
  }

  private primary(): number {
    const token = this.take()
    if (token.kind === 'number') return token.value
    if (token.kind === 'identifier') {
      if (this.peek()?.kind === 'paren' && (this.peek() as { value: string }).value === '(') {
        return this.functionCall(token.value)
      }
      const value = this.variables.get(token.value)
      if (value !== undefined) return value
      const constant = CONSTANTS[token.value]
      if (constant !== undefined) return constant
      throw new CalcError(`未定义变量 ${token.value}`)
    }
    if (token.kind === 'paren' && token.value === '(') {
      const value = this.expression()
      const close = this.peek()
      if (close?.kind !== 'paren' || close.value !== ')') throw new CalcError('缺少右括号')
      this.take()
      return value
    }
    throw new CalcError('表达式不完整')
  }
}

function timestampMs(value: number): number {
  const millis = Math.abs(value) >= 1e12 ? value : value * 1000
  if (!Number.isFinite(millis) || Math.abs(millis) > 8.64e15) {
    invalid('时间戳超出范围')
  }
  return millis
}

export function formatReadableTimestamp(value: number): string {
  const date = new Date(timestampMs(value))
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function timestampDisplay(source: string, value: number): string | undefined {
  if (!/^\s*(?:datetime|timestamp)\s*\([^)]*\)\s*$/i.test(source)) return undefined
  try {
    return formatReadableTimestamp(value)
  } catch {
    return undefined
  }
}

export function formatCalcNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const rounded = Number(value.toPrecision(10))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

function substituteVariables(source: string, tokens: Token[], variables: Map<string, number>): string | undefined {
  let cursor = 0
  let output = ''
  let used = false
  for (const token of tokens) {
    if (token.kind !== 'identifier') continue
    const value = variables.get(token.value)
    if (value === undefined) continue
    output += source.slice(cursor, token.start) + formatCalcNumber(value)
    cursor = token.end
    used = true
  }
  return used ? output + source.slice(cursor) : undefined
}

function evaluateExpression(source: string, variables: Map<string, number>): { value: number; substituted?: string } {
  const tokens = tokenize(source)
  const value = new Parser(tokens, variables).parse()
  return { value, substituted: substituteVariables(source, tokens, variables) }
}

function looksLikeExpression(line: string): boolean {
  if (!line || line.startsWith('#') || line.startsWith('//')) return false
  if (!/^[\p{L}\p{N}_\s.,+\-*/()]+$/u.test(line)) return false
  const hasOperator = /[+\-*/()]/.test(line)
  const hasDigit = /\d/.test(line)
  if (!hasOperator && !hasDigit) return false
  // 没有运算符时只接受纯数字，避免把 “I have 2 apples” 当成表达式。
  if (!hasOperator && /[^\d\s.]/.test(line)) return false
  return true
}

export function evaluateCalcLines(text: string): CalcLineResult[] {
  const variables = new Map<string, number>()
  const results: CalcLineResult[] = []
  let offset = 0
  const lines = text.split('\n')

  lines.forEach((raw, line) => {
    const trimmed = raw.trim()
    const to = offset + raw.trimEnd().length
    if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
      const assignment = trimmed.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.*)$/u)
      if (assignment) {
        const [, name, expression] = assignment
        try {
          const { value } = evaluateExpression(expression.trim(), variables)
          variables.set(name, value)
          results.push({ line, to, value, assignment: name, display: timestampDisplay(expression.trim(), value) })
        } catch (error) {
          results.push({
            line,
            to,
            error: error instanceof CalcError ? error.message : '表达式错误',
            assignment: name,
          })
        }
      } else if (/^[\p{L}_][\p{L}\p{N}_]*$/u.test(trimmed)) {
        // 单独一行变量：只在变量已定义时展示值，避免把普通单词当错误。
        const value = variables.get(trimmed)
        if (value !== undefined) results.push({ line, to, value })
      } else if (looksLikeExpression(trimmed)) {
        try {
          const { value, substituted } = evaluateExpression(trimmed, variables)
          results.push({ line, to, value, substituted, display: timestampDisplay(trimmed, value) })
        } catch (error) {
          results.push({ line, to, error: error instanceof CalcError ? error.message : '表达式错误' })
        }
      }
    }
    offset += raw.length + 1
  })

  return results
}
