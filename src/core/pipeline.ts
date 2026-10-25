import { CODEC_PROTOCOLS, convertCodec } from './codecTools'
import { jqRun, regexRun } from './ipc'
import type {
  CodecDirection,
  CodecProtocol,
  PipelineState,
  PipelineStep,
  PipelineStepType,
  RegexFlags,
} from './types'

let stepCounter = 0

const BASE64_A = 'dXNlcjphZGE7c2NvcmU6OTE='
const BASE64_B = 'dXNlcjpib2I7c2NvcmU6NzI='
const BASE64_C = 'dXNlcjphZGE7c2NvcmU6ODg='

export const SAMPLE_PIPELINE_INPUT = `{"events":[{"payload":"${BASE64_A}"},{"payload":"${BASE64_B}"}]}
{"events":[{"payload":"${BASE64_C}"}]}
`

export function newStep(type: PipelineStepType): PipelineStep {
  stepCounter += 1
  const id = `step-${Date.now().toString(36)}-${stepCounter}`
  if (type === 'jq') return { id, type, expr: '.events[].payload', raw: true }
  if (type === 'codec') {
    return {
      id,
      type,
      protocol: 'base64',
      direction: 'decode',
      urlSafe: true,
      linewise: true,
    }
  }
  if (type === 'regex') {
    return {
      id,
      type,
      pattern: String.raw`user:(\w+)`,
      flags: { global: true, ignoreCase: false, multiLine: false },
    }
  }
  return { id, type, sort: 'desc' }
}

export function defaultPipelineState(): PipelineState {
  return {
    name: 'log-clean',
    input: SAMPLE_PIPELINE_INPUT,
    split: 0.58,
    steps: [newStep('jq'), newStep('codec'), newStep('regex'), newStep('count')],
  }
}

export function stepTitle(step: PipelineStep): string {
  if (step.type === 'jq') return 'jq 提取'
  if (step.type === 'regex') return '正则匹配'
  if (step.type === 'count') return '计数排序'
  const protocol = CODEC_PROTOCOLS.find((item) => item.id === step.protocol)?.label ?? 'Base64'
  return `${protocol} ${step.direction === 'decode' ? '解码' : '编码'}`
}

export function stepSummary(output: string): string {
  const lines = output.split('\n').filter((line) => line.length > 0).length
  return `${lines} 行`
}

export interface PipelineStepOutcome {
  output: string
  durationMs: number
}

async function runCodecStep(step: PipelineStep, input: string): Promise<string> {
  const protocol = (step.protocol ?? 'base64') as CodecProtocol
  const direction = (step.direction ?? 'decode') as CodecDirection
  const urlSafe = step.urlSafe ?? true
  if (!step.linewise) {
    const result = convertCodec(input, protocol, direction, urlSafe)
    if (result.error) throw new Error(result.error)
    return result.output
  }
  return input
    .split('\n')
    .map((line, index) => {
      if (!line) return ''
      const result = convertCodec(line, protocol, direction, urlSafe)
      if (result.error) {
        const quoted = line.startsWith('"') && line.endsWith('"')
        const hint = quoted
          ? '；输出仍带 JSON 引号，请在上一步 jq 勾选「原始字符串 -r」'
          : ''
        throw new Error(`第 ${index + 1} 行「${line.slice(0, 48)}」${result.error}${hint}`)
      }
      return result.output
    })
    .join('\n')
}

export async function executePipelineStep(
  step: PipelineStep,
  input: string,
): Promise<PipelineStepOutcome> {
  const started = performance.now()
  let output = ''
  if (step.type === 'jq') {
    const outcome = await jqRun(input, step.expr ?? '.', 'auto', step.raw !== false)
    if (outcome.error) throw new Error(outcome.error.message)
    output = outcome.output
  } else if (step.type === 'codec') {
    output = await runCodecStep(step, input)
  } else if (step.type === 'regex') {
    const flags: RegexFlags = step.flags ?? {
      global: true,
      ignoreCase: false,
      multiLine: false,
    }
    const outcome = await regexRun(input, step.pattern ?? '', flags)
    if (outcome.error) throw new Error(outcome.error.message)
    output = outcome.matches.map((match) => match.text).join('\n')
  } else {
    const counts = new Map<string, number>()
    for (const line of input.split('\n')) {
      if (!line) continue
      counts.set(line, (counts.get(line) ?? 0) + 1)
    }
    const rows = [...counts.entries()].sort((left, right) => {
      const delta = left[1] - right[1]
      if (delta !== 0) return step.sort === 'asc' ? delta : -delta
      return left[0].localeCompare(right[0])
    })
    output = rows.map(([line, count]) => `${count}\t${line}`).join('\n')
  }
  return { output, durationMs: performance.now() - started }
}

export function serializeWorkflow(state: PipelineState): string {
  return JSON.stringify(
    {
      version: 1,
      name: state.name,
      input: state.input,
      steps: state.steps,
    },
    null,
    2,
  )
}

const STEP_TYPES: PipelineStepType[] = ['jq', 'codec', 'regex', 'count']
const CODEC_TYPES: CodecProtocol[] = ['base64', 'url', 'html', 'unicode', 'hex']

export function parseWorkflow(text: string): PipelineState {
  const parsed = JSON.parse(text) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('工作流必须是 JSON 对象')
  const record = parsed as Record<string, unknown>
  const name = typeof record.name === 'string' && record.name.trim() ? record.name : '未命名工作流'
  const input = typeof record.input === 'string' ? record.input : ''
  if (input.length > 4 * 1024 * 1024) throw new Error('工作流输入超过 4MB')
  const rawSteps = Array.isArray(record.steps) ? record.steps : []
  if (rawSteps.length > 20) throw new Error('单个工作流最多 20 个步骤')
  const steps: PipelineStep[] = rawSteps.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`第 ${index + 1} 个步骤格式错误`)
    const step = raw as Record<string, unknown>
    const type = step.type as PipelineStepType
    if (!STEP_TYPES.includes(type)) throw new Error(`第 ${index + 1} 个步骤类型不受支持`)
    const id = typeof step.id === 'string' ? step.id : `import-${index}-${Date.now().toString(36)}`
    if (type === 'jq') {
      return { id, type, expr: typeof step.expr === 'string' ? step.expr : '.', raw: step.raw !== false }
    }
    if (type === 'codec') {
      const protocol =
        typeof step.protocol === 'string' && CODEC_TYPES.includes(step.protocol as CodecProtocol)
          ? (step.protocol as CodecProtocol)
          : 'base64'
      const direction = step.direction === 'encode' ? 'encode' : 'decode'
      return {
        id,
        type,
        protocol,
        direction,
        urlSafe: step.urlSafe !== false,
        linewise: step.linewise !== false,
      }
    }
    if (type === 'regex') {
      const flags = (step.flags ?? {}) as Partial<RegexFlags>
      return {
        id,
        type,
        pattern: typeof step.pattern === 'string' ? step.pattern : '',
        flags: {
          global: flags.global !== false,
          ignoreCase: flags.ignoreCase === true,
          multiLine: flags.multiLine === true,
        },
      }
    }
    return { id, type, sort: step.sort === 'asc' ? 'asc' : 'desc' }
  })
  return { name, input, steps }
}
