import { useMemo } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { copyText, errorMessage } from '../../core/ipc'
import {
  dayOfYear,
  localTimeParts,
  nowFor,
  parseDateInput,
  parseTimestamp,
  relativeTime,
  rfc2822,
  utcIso,
} from '../../core/timeTools'
import type { Doc, Tab, TimeMode, TimeUnit } from '../../core/types'
import { useAppStore } from '../../store/appStore'

function offsetLabel(ms: number): string {
  const offset = -new Date(ms).getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
}

export function TimeSidePane({ tab, doc }: { tab: Tab; doc: Doc }) {
  const setTimeTool = useAppStore((state) => state.setTimeTool)
  const setText = useAppStore((state) => state.setText)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.timeTool ?? { mode: 'toTime' as TimeMode, input: '', unit: 'auto' as TimeUnit }
  const update = (patch: Partial<typeof state>) => setTimeTool(tab.id, { ...state, ...patch, input: doc.text })
  const result = useMemo(() => {
    if (state.mode === 'toTime') {
      const parsed = parseTimestamp(doc.text, state.unit)
      return parsed ? { ms: parsed.ms, error: null } : { ms: null, error: '左侧内容不是有效时间戳' }
    }
    const ms = parseDateInput(doc.text)
    return ms != null ? { ms, error: null } : { ms: null, error: '左侧内容不是可识别的时间' }
  }, [doc.text, state.mode, state.unit])
  const ms = result.ms
  const local = ms != null ? localTimeParts(ms) : null
  const info = ms != null ? dayOfYear(ms) : null
  const cards =
    ms == null
      ? []
      : state.mode === 'toTime'
        ? [
            { title: `本地时间 · ${offsetLabel(ms)}`, value: local?.main ?? '', detail: `${local?.weekday} · ${local?.timezone}` },
            { title: 'UTC · ISO 8601', value: utcIso(ms), detail: `${local?.weekday} · UTC` },
            { title: 'RFC 2822', value: rfc2822(ms), detail: '常用于 HTTP / 邮件头部' },
          ]
        : [
            { title: '秒级时间戳', value: String(Math.floor(ms / 1000)), detail: 'Unix seconds' },
            { title: '毫秒时间戳', value: String(ms), detail: 'Unix milliseconds' },
            { title: 'UTC · ISO 8601', value: utcIso(ms), detail: `${local?.weekday} · UTC` },
          ]

  const copy = async (value: string) => {
    try {
      await copyText(value)
      showToast('已复制')
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  return (
    <div className="side-time">
      <div className="side-tool-controls">
        <div className="time-modes">
          <button className={state.mode === 'toTime' ? 'active' : ''} onClick={() => update({ mode: 'toTime' })}>
            时间戳 → 时间
          </button>
          <button className={state.mode === 'toStamp' ? 'active' : ''} onClick={() => update({ mode: 'toStamp' })}>
            时间 → 时间戳
          </button>
        </div>
        <label className="side-tool-select">
          <span>单位</span>
          <select value={state.unit} onChange={(event) => update({ unit: event.target.value as TimeUnit })}>
            <option value="auto">自动</option>
            <option value="s">秒</option>
            <option value="ms">毫秒</option>
          </select>
        </label>
        <button
          className="btn"
          onClick={() => {
            setText(doc.id, nowFor(state.mode, state.unit))
            showToast('已把当前时间写入左侧编辑器')
          }}
        >
          <RefreshCw size={13} strokeWidth={1.8} />
          现在
        </button>
        <span className="side-tool-source">来源：左侧编辑器 · {doc.text.length} 字符</span>
      </div>

      {result.error ? (
        <div className="m4-error side-time-error">
          <strong>{result.error}</strong>
          <span>{state.mode === 'toTime' ? '示例：1718092800 或 1718092800000' : '示例：2025-06-11T16:00:00'}</span>
        </div>
      ) : (
        <>
          <div className="side-time-cards">
            {cards.map((card) => (
              <div className="time-card" key={card.title}>
                <div className="time-card-head">
                  <span>{card.title}</span>
                  <button className="btn ghost" onClick={() => void copy(card.value)} aria-label={`复制${card.title}`}>
                    <Copy size={12} strokeWidth={1.8} />
                  </button>
                </div>
                <div className="time-card-value" title={card.value}>{card.value}</div>
                <div className="time-card-detail">{card.detail}</div>
              </div>
            ))}
          </div>
          {ms != null && info ? (
            <div className="side-time-more">
              <div><span>相对时间</span><strong>{relativeTime(ms)}</strong></div>
              <div><span>一年中的第几天</span><strong>第 {info.day} 天 · 第 {info.week} 周</strong></div>
              <div><span>毫秒时间戳</span><strong>{ms}</strong></div>
            </div>
          ) : null}
        </>
      )}
      <div className="side-tool-note">转换直接使用左侧编辑器内容，不再单独提供输入框。</div>
    </div>
  )
}
