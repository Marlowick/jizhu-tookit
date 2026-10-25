import { useEffect, useState } from 'react'
import { jqEngines } from './ipc'
import type { JqEngines } from './types'

export function useJqEngines(): JqEngines | null {
  const [engines, setEngines] = useState<JqEngines | null>(null)

  useEffect(() => {
    let cancelled = false
    jqEngines()
      .then((info) => {
        if (!cancelled) setEngines(info)
      })
      .catch(() => {
        // 探测失败时交给运行时报错
      })
    return () => {
      cancelled = true
    }
  }, [])

  return engines
}

export function jqEngineLabels(engines: JqEngines | null) {
  const systemVersion = engines?.system?.version.replace(/^jq-/, '') ?? ''
  const jaqVersion = engines?.jaq.version ?? '3.1'
  const autoLabel = engines?.system
    ? `自动（系统 jq ${systemVersion}）`
    : `自动（内置 jaq ${jaqVersion}）`
  return { systemVersion, jaqVersion, autoLabel }
}
