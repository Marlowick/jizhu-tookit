import type { LucideIcon } from 'lucide-react'

export interface CommandItem {
  id: string
  title: string
  english: string
  keywords?: string[]
  group: string
  hint?: string
  disabled?: boolean
  disabledReason?: string
  description?: string
  icon?: LucideIcon
  run: () => void
}
