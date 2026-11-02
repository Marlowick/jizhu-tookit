import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type DataFormat = 'json' | 'yaml' | 'toml'

export const DATA_FORMAT_LABELS: Record<DataFormat, string> = {
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
}

export function convertData(text: string, from: DataFormat, to: DataFormat, indent = 2): string {
  if (!text.trim()) return ''
  let value: unknown
  if (from === 'json') {
    value = JSON.parse(text)
  } else if (from === 'yaml') {
    value = parseYaml(text)
  } else {
    value = parseToml(text)
  }

  if (to === 'json') {
    return JSON.stringify(value, null, indent)
  }
  if (to === 'yaml') {
    return stringifyYaml(value, { indent: 2, lineWidth: 0 })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('TOML 输出要求顶层是对象/table')
  }
  return stringifyToml(value as Record<string, unknown>)
}
