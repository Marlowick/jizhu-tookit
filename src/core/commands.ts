import type { LucideIcon } from 'lucide-react'

export interface CommandItem {
  id: string
  title: string
  group: string
  hint?: string
  icon?: LucideIcon
  run: () => void
}
