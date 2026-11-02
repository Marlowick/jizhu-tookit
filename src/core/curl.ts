export interface CurlRequest {
  method: string
  url: string
  headers: Record<string, string>
  body?: string
  followRedirects: boolean
  insecure: boolean
}

export interface CurlResponse {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
  durationMs: number
  size: number
  truncated: boolean
}

interface ParsedCurl {
  request?: CurlRequest
  error?: string
}

function shellSplit(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null
  let tokenStarted = false
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote == null && char === '\\' && input[index + 1] === '\n') {
      index += 1
      continue
    }
    if (quote == null && /\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current)
        current = ''
        tokenStarted = false
      }
      continue
    }
    if (quote == null && (char === "'" || char === '"')) {
      quote = char
      tokenStarted = true
      continue
    }
    if (quote === char) {
      quote = null
      continue
    }
    if (quote == null && char === '\\' && index + 1 < input.length) {
      current += input[index + 1]
      index += 1
      tokenStarted = true
      continue
    }
    current += char
    tokenStarted = true
  }
  if (quote) throw new Error('引号未闭合')
  if (tokenStarted) tokens.push(current)
  return tokens
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function withHeader(headers: Record<string, string>, name: string, value: string) {
  headers[name] = value
}

export function parseCurl(input: string): ParsedCurl {
  try {
    const tokens = shellSplit(input.trim())
    if (!tokens.length) return { error: '请输入 curl 命令' }
    if (tokens[0] !== 'curl' && tokens[0] !== '/usr/bin/curl') {
      return { error: '命令需要以 curl 开头' }
    }

    let method: string | undefined
    let url: string | undefined
    let body: string | undefined
    let followRedirects = false
    let insecure = false
    const headers: Record<string, string> = {}
    const positional: string[] = []

    for (let index = 1; index < tokens.length; index += 1) {
      const token = tokens[index]
      const next = () => {
        index += 1
        if (index >= tokens.length) throw new Error(`${token} 缺少参数`)
        return tokens[index]
      }

      if (token === '-X' || token === '--request') {
        method = next().toUpperCase()
      } else if (token === '-H' || token === '--header') {
        const header = next()
        const colon = header.indexOf(':')
        if (colon <= 0) throw new Error(`无效 header：${header}`)
        withHeader(headers, header.slice(0, colon).trim(), header.slice(colon + 1).trim())
      } else if (token.startsWith('--header=')) {
        const header = token.slice('--header='.length)
        const colon = header.indexOf(':')
        if (colon <= 0) throw new Error(`无效 header：${header}`)
        withHeader(headers, header.slice(0, colon).trim(), header.slice(colon + 1).trim())
      } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary' || token === '--data-ascii') {
        const value = next()
        if (value.startsWith('@')) throw new Error('暂不支持 @file 作为请求体')
        body = body == null ? value : `${body}&${value}`
      } else if (token === '--json') {
        const value = next()
        body = value
        withHeader(headers, 'Content-Type', 'application/json')
      } else if (token === '--url') {
        url = next()
      } else if (token === '-L' || token === '--location') {
        followRedirects = true
      } else if (token === '-k' || token === '--insecure') {
        insecure = true
      } else if (token === '-I' || token === '--head') {
        method = 'HEAD'
      } else if (token === '-A' || token === '--user-agent') {
        withHeader(headers, 'User-Agent', next())
      } else if (token === '-b' || token === '--cookie') {
        withHeader(headers, 'Cookie', next())
      } else if (token === '-e' || token === '--referer') {
        withHeader(headers, 'Referer', next())
      } else if (token === '-u' || token === '--user') {
        withHeader(headers, 'Authorization', `Basic ${base64Utf8(next())}`)
      } else if (token === '-s' || token === '--silent' || token === '-S' || token === '--show-error' || token === '--compressed' || token === '-#' || token === '--progress-bar') {
        // UI-only curl flags.
      } else if (token === '-F' || token === '--form' || token === '--form-string') {
        throw new Error('暂不支持 multipart/form-data')
      } else if (/^-[sSkL]+$/.test(token)) {
        for (const flag of token.slice(1)) {
          if (flag === 'L') followRedirects = true
          if (flag === 'k') insecure = true
        }
      } else if (/^-[XH]/.test(token) && token.length > 2) {
        const flag = token[1]
        const value = token.slice(2)
        if (flag === 'X') method = value.toUpperCase()
        else {
          const colon = value.indexOf(':')
          if (colon <= 0) throw new Error(`无效 header：${value}`)
          withHeader(headers, value.slice(0, colon).trim(), value.slice(colon + 1).trim())
        }
      } else if (token.startsWith('--request=')) {
        method = token.slice('--request='.length).toUpperCase()
      } else if (token.startsWith('--url=')) {
        url = token.slice('--url='.length)
      } else if (token.startsWith('--data-raw=') || token.startsWith('--data=') || token.startsWith('--data-binary=')) {
        const value = token.slice(token.indexOf('=') + 1)
        if (value.startsWith('@')) throw new Error('暂不支持 @file 作为请求体')
        body = body == null ? value : `${body}&${value}`
      } else if (token.startsWith('-')) {
        throw new Error(`暂不支持 curl 参数 ${token}`)
      } else {
        positional.push(token)
      }
    }

    if (!url && positional.length) url = positional.shift()
    if (positional.length) throw new Error('一次只支持一个 URL')
    if (!url) throw new Error('缺少 URL')
    if (!/^https?:\/\//i.test(url)) throw new Error('URL 只支持 http:// 或 https://')
    if (body != null && !method) method = 'POST'

    return {
      request: {
        method: method ?? 'GET',
        url,
        headers,
        body,
        followRedirects,
        insecure,
      },
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

export function prettyCurlBody(response: CurlResponse): string {
  const contentType = response.headers.find(([name]) => name.toLowerCase() === 'content-type')?.[1] ?? ''
  if (!response.body.trim()) return response.body
  if (!/json/i.test(contentType) && !/^\s*[\[{]/.test(response.body)) return response.body
  try {
    return JSON.stringify(JSON.parse(response.body), null, 2)
  } catch {
    return response.body
  }
}

export function normalizeCurlExchange(raw: string, response: CurlResponse): string {
  const headers = [...response.headers].sort((left, right) =>
    left[0].toLowerCase().localeCompare(right[0].toLowerCase()),
  )
  const body = prettyCurlBody(response)
  return [
    '# request',
    raw.trim(),
    '# response',
    `HTTP ${response.status} ${response.statusText}`.trim(),
    '# headers',
    ...headers.map(([name, value]) => `${name}: ${value}`),
    '# body',
    body || '(empty)',
    response.truncated ? '# truncated' : '',
  ]
    .filter((line, index, lines) => line !== '' || index === lines.length - 1)
    .join('\n')
}
