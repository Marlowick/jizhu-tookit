import { DEFAULT_JSON_INDENT } from './jsonIndent'

export interface UrlParam {
  rawKey: string
  rawValue: string
  key: string
  value: string
}

export interface ParsedUrl {
  valid: boolean
  error: string | null
  base: string
  hash: string
  protocol: string
  host: string
  port: string
  pathname: string
  params: UrlParam[]
}

export interface JsonParamInfo {
  kind: 'object' | 'array'
  count: number
  pretty: string
}

export function decodeQueryPart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

export function encodeQueryPart(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

export function parseUrlInput(input: string): ParsedUrl {
  const empty: ParsedUrl = {
    valid: false,
    error: null,
    base: input,
    hash: '',
    protocol: '',
    host: '',
    port: '',
    pathname: '',
    params: [],
  }
  if (!input.trim()) return empty

  let url: URL
  try {
    url = new URL(input)
  } catch {
    return { ...empty, error: 'URL 需要包含协议，例如 https://example.com/?a=1' }
  }

  const hashIndex = input.indexOf('#')
  const hash = hashIndex >= 0 ? input.slice(hashIndex) : ''
  const beforeHash = hashIndex >= 0 ? input.slice(0, hashIndex) : input
  const queryIndex = beforeHash.indexOf('?')
  const base = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash
  const rawQuery = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ''
  const params: UrlParam[] = rawQuery
    .split('&')
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const equal = pair.indexOf('=')
      const rawKey = equal >= 0 ? pair.slice(0, equal) : pair
      const rawValue = equal >= 0 ? pair.slice(equal + 1) : ''
      return {
        rawKey,
        rawValue,
        key: decodeQueryPart(rawKey),
        value: decodeQueryPart(rawValue),
      }
    })

  return {
    valid: true,
    error: null,
    base,
    hash,
    protocol: url.protocol.replace(/:$/, ''),
    host: url.host,
    port: url.port,
    pathname: url.pathname,
    params,
  }
}

export function buildUrl(base: string, hash: string, params: UrlParam[]): string {
  if (!params.length) return `${base}${hash}`
  return `${base}?${params.map((param) => `${param.rawKey}=${param.rawValue}`).join('&')}${hash}`
}

export function makeParam(key: string, value: string, decode: boolean): UrlParam {
  const rawKey = decode ? encodeQueryPart(key) : key
  const rawValue = decode ? encodeQueryPart(value) : value
  return { rawKey, rawValue, key, value }
}

export function jsonParamInfo(value: string): JsonParamInfo | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return {
        kind: 'array',
        count: parsed.length,
        pretty: JSON.stringify(parsed, null, DEFAULT_JSON_INDENT),
      }
    }
    if (parsed && typeof parsed === 'object') {
      return {
        kind: 'object',
        count: Object.keys(parsed).length,
        pretty: JSON.stringify(parsed, null, DEFAULT_JSON_INDENT),
      }
    }
  } catch {
    return null
  }
  return null
}

export const SAMPLE_URL =
  'https://api.example.com/v1/search?q=hello+world&page=2&filter=%7B%22active%22%3Atrue%2C%22role%22%3A%22admin%22%7D#results'
