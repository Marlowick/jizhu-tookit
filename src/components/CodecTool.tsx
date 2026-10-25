import { useMemo } from 'react'
import { ArrowDownUp, Binary, Copy, Trash2 } from 'lucide-react'
import { CODEC_PROTOCOLS, convertCodec } from '../core/codecTools'
import { copyText, errorMessage } from '../core/ipc'
import type { CodecDirection, CodecProtocol, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface CodecToolProps {
  tab: Tab
}

export function CodecTool({ tab }: CodecToolProps) {
  const setCodecTool = useAppStore((state) => state.setCodecTool)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.codecTool ?? {
    direction: 'encode' as CodecDirection,
    protocol: 'base64' as CodecProtocol,
    urlSafe: true,
    input: '你好，机杼工具箱。一段需要编码的文本。',
  }

  const update = (patch: Partial<typeof state>) => setCodecTool(tab.id, { ...state, ...patch })
  const result = useMemo(
    () => convertCodec(state.input, state.protocol, state.direction, state.urlSafe),
    [state.direction, state.input, state.protocol, state.urlSafe],
  )

  const protocolLabel = CODEC_PROTOCOLS.find((item) => item.id === state.protocol)?.label ?? 'Base64'
  const urlSafeVisible = state.protocol === 'base64'

  const copy = async (text: string) => {
    if (!text) return
    try {
      await copyText(text)
      showToast(`已复制${protocolLabel}结果`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const swap = () => {
    if (result.error || !result.output) return
    update({
      direction: state.direction === 'encode' ? 'decode' : 'encode',
      input: result.output,
    })
  }

  return (
    <div className="small-tool codec-tool">
      <header className="small-tool-head">
        <Binary size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>编码 / 解码</strong>
        <span className="small-tool-sub">Base64 / URL / HTML / Unicode / Hex</span>
        <span className="small-tool-hint">输入即转换</span>
      </header>

      <div className="codec-toolbar">
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

        <label className="codec-protocol">
          <span>协议</span>
          <select
            value={state.protocol}
            onChange={(event) => update({ protocol: event.target.value as CodecProtocol })}
          >
            {CODEC_PROTOCOLS.map((protocol) => (
              <option key={protocol.id} value={protocol.id}>
                {protocol.label}
              </option>
            ))}
          </select>
        </label>

        {urlSafeVisible ? (
          <label className="diff-check codec-safe">
            <input
              type="checkbox"
              checked={state.urlSafe}
              onChange={(event) => update({ urlSafe: event.target.checked })}
            />
            <span>URL 安全（-_ 无填充）</span>
          </label>
        ) : null}
      </div>

      <div className="codec-body">
        <section className="codec-pane">
          <div className="codec-pane-head">
            <span>输入 · {state.direction === 'encode' ? '原文' : '编码结果'}</span>
            <span>{state.input.length} 字符 · UTF-8</span>
            <button className="btn ghost" onClick={() => update({ input: '' })} disabled={!state.input}>
              <Trash2 size={12} strokeWidth={1.8} />
            </button>
          </div>
          <textarea
            className="codec-input"
            value={state.input}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => update({ input: event.target.value })}
            placeholder={state.direction === 'encode' ? '输入要编码的文本…' : '输入要解码的内容…'}
          />
        </section>

        <button
          className="codec-arrow"
          onClick={swap}
          disabled={Boolean(result.error) || !result.output}
          title="交换输入与输出"
          aria-label="交换输入与输出"
        >
          <ArrowDownUp size={15} strokeWidth={1.8} />
        </button>

        <section className="codec-pane">
          <div className="codec-pane-head">
            <span>
              输出 · {protocolLabel}
              {urlSafeVisible && state.urlSafe ? '（URL 安全）' : ''}
            </span>
            <span>{result.output.length} 字符</span>
            <button className="btn ghost" onClick={() => void copy(result.output)} disabled={!result.output}>
              <Copy size={12} strokeWidth={1.8} />
              复制
            </button>
          </div>
          {result.error ? (
            <div className="m4-error codec-error">
              <strong>转换失败</strong>
              <span>{result.error}</span>
            </div>
          ) : (
            <pre className="codec-output">{result.output || '（空）'}</pre>
          )}
        </section>
      </div>

      <footer className="small-tool-foot">
        <span>
          {state.direction === 'encode' ? '编码' : '解码'} · {protocolLabel}
          {urlSafeVisible && state.urlSafe ? ' · URL 安全' : ''}
        </span>
        <span className="small-tool-foot-note">
          {state.direction === 'encode' ? '原文 → 编码' : '编码 → 原文'}
        </span>
      </footer>
    </div>
  )
}
