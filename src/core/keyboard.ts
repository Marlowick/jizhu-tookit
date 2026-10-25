import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform.toLowerCase().includes('mac') || /Mac OS X/.test(navigator.userAgent))

export const MOD = isMac ? '⌘' : 'Ctrl'

export function modKey(key: string): string {
  return isMac ? `${MOD}${key}` : `${MOD}+${key}`
}

export function isModPressed(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey
}
