import type { LucideIcon } from 'lucide-react'

export interface CommandItem {
  id: string
  title: string
  english: string
  keywords?: string[]
  group: string
  hint?: string
  /** Single-key mnemonic used by the quick command list. */
  quickKey?: string
  description?: string
  icon?: LucideIcon
  run: () => void
}
