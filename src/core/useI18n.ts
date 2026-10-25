import { useAppStore } from '../store/appStore'
import { translate } from './i18n'
import type { Language } from './types'

export function useI18n() {
  const language = useAppStore((state) => state.settings.language) as Language
  return {
    language,
    t: (key: string, values?: Record<string, string | number>) => translate(language, key, values),
  }
}
