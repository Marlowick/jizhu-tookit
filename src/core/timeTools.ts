export type TimeMode = 'toTime' | 'toStamp'
export type TimeUnit = 'auto' | 's' | 'ms'

export interface ParsedTimestamp {
  ms: number
  detected: 's' | 'ms'
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

export function timezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'
}

export function parseTimestamp(input: string, unit: TimeUnit): ParsedTimestamp | null {
  const text = input.trim()
  if (!/^-?\d+$/.test(text)) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return null
  const detected: 's' | 'ms' =
    unit === 'auto' ? (text.replace('-', '').length >= 13 ? 'ms' : 's') : unit
  const ms = detected === 's' ? parsed * 1000 : parsed
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null
  return { ms, detected }
}

export function parseDateInput(input: string): number | null {
  const text = input.trim()
  if (!text) return null
  if (/^-?\d+$/.test(text)) {
    const parsed = parseTimestamp(text, 'auto')
    return parsed?.ms ?? null
  }
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

export function localTimeParts(ms: number) {
  const date = new Date(ms)
  return {
    main: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    weekday: WEEKDAYS[date.getDay()],
    timezone: timezoneName(),
  }
}

export function utcIso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function rfc2822(ms: number): string {
  const date = new Date(ms)
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${WEEKDAYS_EN[date.getDay()]}, ${pad(date.getDate())} ${MONTHS_EN[date.getMonth()]} ${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
}

export function relativeTime(ms: number, now = Date.now()): string {
  const diff = now - ms
  const future = diff < 0
  const seconds = Math.floor(Math.abs(diff) / 1000)
  let text: string
  if (seconds < 10) return future ? '刚刚' : '刚刚'
  if (seconds < 60) text = `${seconds} 秒`
  else if (seconds < 3600) text = `${Math.floor(seconds / 60)} 分钟`
  else if (seconds < 86400) text = `${Math.floor(seconds / 3600)} 小时`
  else if (seconds < 86400 * 30) text = `${Math.floor(seconds / 86400)} 天`
  else if (seconds < 86400 * 365) text = `${Math.floor(seconds / (86400 * 30))} 个月`
  else text = `${Math.floor(seconds / (86400 * 365))} 年`
  return future ? `${text}后` : `${text}前`
}

export function dayOfYear(ms: number): { day: number; week: number } {
  const date = new Date(ms)
  const start = Date.UTC(date.getFullYear(), 0, 1)
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const day = Math.floor((current - start) / 86_400_000) + 1
  const iso = new Date(current)
  const dayNumber = iso.getUTCDay() || 7
  iso.setUTCDate(iso.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(iso.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((iso.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { day, week }
}

export function nowFor(mode: TimeMode, unit: TimeUnit): string {
  if (mode === 'toStamp') {
    const date = new Date()
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  }
  const seconds = Math.floor(Date.now() / 1000)
  return unit === 'ms' ? String(seconds * 1000) : String(seconds)
}
