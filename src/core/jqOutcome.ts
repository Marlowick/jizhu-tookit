import type { JqOutcome } from './types'

export function failedJqOutcome(message: string): JqOutcome {
  return {
    engine: 'jaq',
    engineLabel: '',
    version: '',
    output: '',
    count: 0,
    durationMs: 0,
    error: { message, kind: 'ipc' },
    truncated: false,
  }
}
