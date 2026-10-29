import { useMemo } from 'react'
import { Clock, Copy, RefreshCw } from 'lucide-react'
import { copyText, errorMessage } from '../core/ipc'
import {
  dayOfYear,
  localTimeParts,
  nowFor,
  parseDateInput,
  parseTimestamp,
  relativeTime,
  rfc2822,
  utcIso,
} from '../core/timeTools'
import type { Tab, TimeMode, TimeUnit } from '../core/types'
import { useAppStore } from '../store/appStore'

interface TimeToolProps {
  tab: Tab
}

function offsetLabel(ms: number): string {
  const offset = -new Date(ms).getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hours = Math.floor(abs / 60)
  const minutes = abs % 60
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}

export function TimeTool({ tab }: TimeToolProps) {
  const setTimeTool = useAppStore((state) => state.setTimeTool)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.timeTool ?? {
    mode: 'toTime' as TimeMode,
    input: String(Math.floor(Date.now() / 1000)),
    unit: 'auto' as TimeUnit,
  }

  const update = (patch: Partial<typeof state>) => setTimeTool(tab.id, { ...state, ...patch })

  const result = useMemo(() => {
    if (state.mode === 'toTime') {
      const parsed = parseTimestamp(state.input, state.unit)
      if (!parsed) return { error: '请输入有效的时间戳', ms: null, detected: null as 's' | 'ms' | null }
      return { error: null, ms: parsed.ms, detected: parsed.detected }
    }
    const ms = parseDateInput(state.input)
    if (ms == null) return { error: '请输入可识别的时间字符串', ms: null, detected: null }
    return { error: null, ms, detected: null }
  }, [state.input, state.mode, state.unit])

  const ms = result.ms
  const local = ms != null ? localTimeParts(ms) : null
  const yearInfo = ms != null ? dayOfYear(ms) : null

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text)
      showToast(`已复制${label}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const changeMode = (mode: TimeMode) => {
    if (mode === state.mode) return
    // 双向切换时尽量保留用户输入：时间戳可直接被日期解析器接受；
    // 日期切回时间戳时转换为秒级时间戳。
    if (mode === 'toStamp') {
      update({ mode, input: result.ms != null ? state.input : nowFor(mode, state.unit) })
      return
    }
    const next = result.ms != null ? String(Math.floor(result.ms / 1000)) : nowFor(mode, state.unit)
    update({ mode, input: next })
  }

  const cards =
    ms != null
      ? state.mode === 'toTime'
        ? [
            {
              title: `本地时间 · ${offsetLabel(ms)}`,
              value: local?.main ?? '',
              detail: `${local?.weekday ?? ''} · ${local?.timezone ?? ''}`,
              copy: local?.main ?? '',
            },
            {
              title: 'UTC · ISO 8601',
              value: utcIso(ms),
              detail: `${local?.weekday ?? ''} · UTC`,
              copy: utcIso(ms),
            },
            {
              title: 'RFC 2822',
              value: rfc2822(ms),
              detail: '常用于 HTTP / 邮件头部',
              copy: rfc2822(ms),
            },
          ]
        : [
            {
              title: '秒级时间戳',
              value: String(Math.floor(ms / 1000)),
              detail: 'Unix seconds',
              copy: String(Math.floor(ms / 1000)),
            },
            {
              title: '毫秒时间戳',
              value: String(ms),
              detail: 'Unix milliseconds',
              copy: String(ms),
            },
            {
              title: 'UTC · ISO 8601',
              value: utcIso(ms),
              detail: `${local?.weekday ?? ''} · UTC`,
              copy: utcIso(ms),
            },
          ]
      : []

  const more =
    ms != null && state.mode === 'toTime'
      ? [
          { label: '毫秒时间戳', value: String(ms) },
          { label: '相对时间', value: relativeTime(ms) },
          { label: '一年中的第几天', value: `第 ${yearInfo?.day ?? 0} 天 · 第 ${yearInfo?.week ?? 0} 周` },
        ]
      : ms != null
        ? [{ label: '本地时间', value: local?.main ?? '' }]
        : []

  return (
    <div className="small-tool time-tool">
      <header className="small-tool-head">
        <Clock size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>时间转换</strong>
        <span className="small-tool-sub">时间戳 ↔ 可读时间</span>
        <span className="small-tool-hint">本地时区 · 秒 / 毫秒自动识别</span>
      </header>

      <div className="time-toolbar">
        <div className="time-modes">
          <button className={state.mode === 'toTime' ? 'active' : ''} onClick={() => changeMode('toTime')}>
            时间戳 → 时间
          </button>
          <button className={state.mode === 'toStamp' ? 'active' : ''} onClick={() => changeMode('toStamp')}>
            时间 → 时间戳
          </button>
        </div>
        <button className="btn" onClick={() => update({ input: nowFor(state.mode, state.unit) })}>
          <RefreshCw size={13} strokeWidth={1.8} />
          现在
        </button>
      </div>

      <div className="time-input-row">
        <label htmlFor="time-input">输入</label>
        <input
          id="time-input"
          className="time-input"
          value={state.input}
          spellCheck={false}
          autoComplete="off"
          placeholder={state.mode === 'toTime' ? '1718092800 或 1718092800000' : '2025-06-11T16:00:00'}
          onChange={(event) => update({ input: event.target.value })}
        />
        {state.mode === 'toTime' ? (
          <>
            <span className="time-unit-label">单位</span>
            <select
              className="time-unit"
              value={state.unit}
              onChange={(event) => update({ unit: event.target.value as TimeUnit })}
            >
              <option value="auto">自动</option>
              <option value="s">秒</option>
              <option value="ms">毫秒</option>
            </select>
            <span className="time-hint">
              {result.detected ? `检测为${result.detected === 'ms' ? '毫秒' : '秒'}` : '13 位自动识别为毫秒'}
            </span>
          </>
        ) : (
          <span className="time-hint">支持 ISO 8601、日期字符串或时间戳</span>
        )}
      </div>

      <div className="time-body">
        {result.error ? (
          <div className="m4-error">
            <strong>{result.error}</strong>
            <span>示例：{state.mode === 'toTime' ? '1718092800' : '2025-06-11T16:00:00'}</span>
          </div>
        ) : (
          <>
            <div className="time-cards">
              {cards.map((card) => (
                <div className="time-card" key={card.title}>
                  <div className="time-card-head">
                    <span>{card.title}</span>
                    <button className="btn ghost" onClick={() => void copy(card.copy, card.title)}>
                      <Copy size={12} strokeWidth={1.8} />
                    </button>
                  </div>
                  <div className="time-card-value" title={card.value}>{card.value}</div>
                  <div className="time-card-detail">{card.detail}</div>
                </div>
              ))}
            </div>

            <div className="time-more">
              <h3>更多格式</h3>
              {more.map((row) => (
                <div className="time-more-row" key={row.label}>
                  <span>{row.label}</span>
                  <span className="time-more-value">{row.value}</span>
                  <button className="btn ghost" onClick={() => void copy(row.value, row.label)}>
                    <Copy size={12} strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="small-tool-foot">
        <span>
          {state.mode === 'toTime'
            ? `时间戳 → 时间 · ${state.unit === 'auto' ? '自动单位' : state.unit === 's' ? '秒' : '毫秒'}`
            : '时间 → 时间戳'}
        </span>
        <span className="small-tool-foot-note">本地时区：{local?.timezone ?? 'Local'}</span>
      </footer>
    </div>
  )
}
