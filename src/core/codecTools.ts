export type CodecDirection = 'encode' | 'decode'
export type CodecProtocol = 'base64' | 'url' | 'html' | 'unicode' | 'hex'

export const CODEC_PROTOCOLS: Array<{ id: CodecProtocol; label: string }> = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL 编码' },
  { id: 'html', label: 'HTML 实体' },
  { id: 'unicode', label: 'Unicode 转义' },
  { id: 'hex', label: 'Hex' },
]

const HTML_ENCODE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const HTML_DECODE: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function toBase64(input: string, urlSafe: boolean): string {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  let encoded = btoa(binary)
  if (urlSafe) {
    encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  }
  return encoded
}

function fromBase64(input: string, urlSafe: boolean): string {
  let normalized = input.replace(/\s+/g, '')
  if (urlSafe) normalized = normalized.replace(/-/g, '+').replace(/_/g, '/')
  normalized = normalized.replace(/=+$/g, '')
  const padding = normalized.length % 4
  if (padding === 1) throw new Error('Base64 长度非法')
  if (padding > 0) normalized += '='.repeat(4 - padding)
  const binary = atob(normalized)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

function encodeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => HTML_ENCODE[char] ?? char)
}

function decodeHtml(input: string): string {
  return input.replace(/&(?:amp|lt|gt|quot|#39|apos);|&#x?[0-9a-fA-F]+;/g, (entity) => {
    if (HTML_DECODE[entity]) return HTML_DECODE[entity]
    const match = /^&#(x?)([0-9a-fA-F]+);$/.exec(entity)
    if (!match) return entity
    const code = match[1] ? Number.parseInt(match[2], 16) : Number.parseInt(match[2], 10)
    try {
      return String.fromCodePoint(code)
    } catch {
      return entity
    }
  })
}

function encodeUnicode(input: string): string {
  let output = ''
  for (let index = 0; index < input.length; index += 1) {
    output += `\\u${input.charCodeAt(index).toString(16).padStart(4, '0')}`
  }
  return output
}

function decodeUnicode(input: string): string {
  let output = ''
  for (let index = 0; index < input.length; index += 1) {
    if (input[index] === '\\' && input[index + 1] === 'u') {
      const hex = input.slice(index + 2, index + 6)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        output += String.fromCharCode(Number.parseInt(hex, 16))
        index += 5
        continue
      }
    }
    output += input[index]
  }
  return output
}

function encodeHex(input: string): string {
  return Array.from(new TextEncoder().encode(input))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function decodeHex(input: string): string {
  const cleaned = input.replace(/\s+/g, '')
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) throw new Error('Hex 只能包含 0-9 / a-f')
  if (cleaned.length % 2 !== 0) throw new Error('Hex 长度必须为偶数')
  const bytes = new Uint8Array(cleaned.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleaned.slice(index * 2, index * 2 + 2), 16)
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

export interface CodecResult {
  output: string
  error: string | null
}

export function convertCodec(
  input: string,
  protocol: CodecProtocol,
  direction: CodecDirection,
  urlSafe: boolean,
): CodecResult {
  try {
    if (direction === 'encode') {
      if (protocol === 'base64') return { output: toBase64(input, urlSafe), error: null }
      if (protocol === 'url') return { output: encodeURIComponent(input), error: null }
      if (protocol === 'html') return { output: encodeHtml(input), error: null }
      if (protocol === 'unicode') return { output: encodeUnicode(input), error: null }
      return { output: encodeHex(input), error: null }
    }
    if (protocol === 'base64') return { output: fromBase64(input, urlSafe), error: null }
    if (protocol === 'url') {
      try {
        return { output: decodeURIComponent(input), error: null }
      } catch {
        return { output: '', error: 'URL 编码不完整，无法解码' }
      }
    }
    if (protocol === 'html') return { output: decodeHtml(input), error: null }
    if (protocol === 'unicode') return { output: decodeUnicode(input), error: null }
    return { output: decodeHex(input), error: null }
  } catch (error) {
    return {
      output: '',
      error: error instanceof Error ? error.message : '转换失败',
    }
  }
}
