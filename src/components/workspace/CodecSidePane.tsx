import { useMemo } from 'react'
import { ArrowLeftRight, Copy, Check, ClipboardPaste } from 'lucide-react'
import { CODEC_PROTOCOLS, convertCodec } from '../../core/codecTools'
import { copyText, errorMessage } from '../../core/ipc'
import type { CodecDirection, CodecProtocol, Doc, Tab } from '../../core/types'
import { useAppStore } from '../../store/appStore'

export function CodecSidePane({ tab, doc }: { tab: Tab; doc: Doc }) {
  const setCodecTool = useAppStore((state) => state.setCodecTool)
  const setText = useAppStore((state) => state.setText)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.codecTool ?? {
    direction: 'encode' as CodecDirection,
    protocol: 'base64' as CodecProtocol,
    urlSafe: true,
    input: '',
  }
  const result = useMemo(
    () => convertCodec(doc.text, state.protocol, state.direction, state.urlSafe),
    [doc.text, state.direction, state.protocol, state.urlSafe],
  )
  const update = (patch: Partial<typeof state>) => setCodecTool(tab.id, { ...state, ...patch, input: doc.text })

  const copy = async () => {
    if (!result.output) return
    try {
      await copyText(result.output)
      showToast('已复制编码结果')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  return (
    <div className="side-codec">
      <div className="side-tool-controls">
        <div className="codec-modes" role="tablist" aria-label="编码方向">
          <button
            className={state.direction === 'encode' ? 'active' : ''}
            onClick={() => update({ direction: 'encode' })}
          >
            编码
          </button>
          <button
            className={state.direction === 'decode' ? 'active' : ''}
            onClick={() => update({ direction: 'decode' })}
          >
            解码
          </button>
        </div>
        <button
          className="btn ghost"
          onClick={() => update({ direction: state.direction === 'encode' ? 'decode' : 'encode' })}
          title="交换编码方向"
        >
          <ArrowLeftRight size={13} strokeWidth={1.8} />
        </button>
        <label className="side-tool-select">
          <span>协议</span>
          <select value={state.protocol} onChange={(event) => update({ protocol: event.target.value as CodecProtocol })}>
            {CODEC_PROTOCOLS.map((protocol) => (
              <option key={protocol.id} value={protocol.id}>
                {protocol.label}
              </option>
            ))}
          </select>
        </label>
        {state.protocol === 'base64' ? (
          <label className="diff-check">
            <input
              type="checkbox"
              checked={state.urlSafe}
              onChange={(event) => update({ urlSafe: event.target.checked })}
            />
            URL 安全（-_ 无填充）
          </label>
        ) : null}
        <span className="side-tool-source">来源：左侧编辑器 · {doc.text.length} 字符</span>
      </div>

      <div className="side-codec-result">
        <header>
          <span>{result.error ? '转换失败' : `${state.direction === 'encode' ? '编码' : '解码'}结果 · ${result.output.length} 字符`}</span>
          <div>
            <button className="btn ghost" onClick={() => void copy()} disabled={!result.output}>
              <Copy size={12} strokeWidth={1.8} />
              复制
            </button>
            <button
              className="btn"
              onClick={() => {
                setText(doc.id, result.output)
                showToast('已写回左侧编辑器')
              }}
              disabled={!result.output}
            >
              <ClipboardPaste size={12} strokeWidth={1.8} />
              写回左侧
            </button>
          </div>
        </header>
        {result.error ? (
          <div className="m4-error codec-error">
            <strong>转换失败</strong>
            <span>{result.error}</span>
          </div>
        ) : (
          <pre className="side-codec-output">{result.output || '（空）'}</pre>
        )}
      </div>
      <div className="side-tool-note">
        <Check size={12} strokeWidth={1.8} />
        编码/解码直接使用左侧编辑器内容；写回后编辑器会同步更新。
      </div>
    </div>
  )
}
