import { useMemo, useState } from 'react'
import { ArrowLeftRight, Copy, FileOutput } from 'lucide-react'
import { convertData, DATA_FORMAT_LABELS, type DataFormat } from '../../core/dataFormat'
import { copyText, errorMessage } from '../../core/ipc'
import type { Doc, Tab } from '../../core/types'
import { useAppStore } from '../../store/appStore'

interface DataConvertPaneProps {
  tab: Tab
  doc: Doc
}

const DIRECTIONS: Array<{ from: DataFormat; to: DataFormat }> = [
  { from: 'yaml', to: 'json' },
  { from: 'json', to: 'yaml' },
  { from: 'toml', to: 'json' },
  { from: 'json', to: 'toml' },
]

export function DataConvertPane({ tab, doc }: DataConvertPaneProps) {
  const setText = useAppStore((state) => state.setText)
  const showToast = useAppStore((state) => state.showToast)
  const [from, setFrom] = useState<DataFormat>('yaml')
  const [to, setTo] = useState<DataFormat>('json')

  const converted = useMemo(() => {
    if (!doc.text.trim()) return { output: '', error: null as string | null }
    try {
      return { output: convertData(doc.text, from, to), error: null as string | null }
    } catch (error) {
      return { output: '', error: errorMessage(error) }
    }
  }, [doc.text, from, to])

  const chooseDirection = (value: string) => {
    const [nextFrom, nextTo] = value.split(':') as [DataFormat, DataFormat]
    setFrom(nextFrom)
    setTo(nextTo)
  }

  const copy = async () => {
    if (!converted.output) return
    try {
      await copyText(converted.output)
      showToast('已复制转换结果')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  return (
    <div className="data-convert">
      <div className="side-tool-controls">
        <label className="side-tool-select">
          <span>转换</span>
          <select value={`${from}:${to}`} onChange={(event) => chooseDirection(event.target.value)}>
            {DIRECTIONS.map((direction) => (
              <option key={`${direction.from}:${direction.to}`} value={`${direction.from}:${direction.to}`}>
                {DATA_FORMAT_LABELS[direction.from]} → {DATA_FORMAT_LABELS[direction.to]}
              </option>
            ))}
          </select>
        </label>
        <span className="data-convert-arrow"><ArrowLeftRight size={12} strokeWidth={1.8} /></span>
        <span className="side-tool-source">来源：左侧编辑器 · {doc.text.length} 字符</span>
      </div>

      <section className="data-convert-output">
        <header>
          <span>{DATA_FORMAT_LABELS[from]} → {DATA_FORMAT_LABELS[to]}</span>
          <span>{converted.error ? '转换失败' : `${converted.output.length} 字符`}</span>
          <button className="btn ghost" onClick={() => void copy()} disabled={!converted.output}>
            <Copy size={12} strokeWidth={1.8} />
            复制
          </button>
          <button
            className="btn"
            disabled={!converted.output || Boolean(converted.error)}
            onClick={() => {
              setText(doc.id, converted.output)
              showToast('已写回左侧编辑器')
            }}
          >
            <FileOutput size={12} strokeWidth={1.8} />
            写回左侧
          </button>
        </header>
        {converted.error ? (
          <div className="m4-error data-convert-error">
            <strong>无法转换</strong>
            <span>{converted.error}</span>
          </div>
        ) : converted.output ? (
          <pre className="data-convert-pre">{converted.output}</pre>
        ) : (
          <div className="data-convert-empty">
            在左侧输入 YAML、TOML 或 JSON，右侧会实时显示转换结果。
          </div>
        )}
      </section>
    </div>
  )
}
