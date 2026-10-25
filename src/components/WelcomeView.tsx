import { ArrowRight } from 'lucide-react'
import { Logo } from '../components/Logo'
import { TOOLS } from '../core/tools'
import { modKey } from '../core/keyboard'
import { toolDescription, toolTitle } from '../core/i18n'
import { useI18n } from '../core/useI18n'
import type { ToolId } from '../core/types'

interface WelcomeViewProps {
  onOpen: (tool: ToolId) => void
}

export function WelcomeView({ onOpen }: WelcomeViewProps) {
  const { language, t } = useI18n()
  return (
    <div className="welcome">
      <Logo className="logo-mark" size={58} />
      <h1>机杼工具箱</h1>
      <p className="subtitle">{t('welcome.subtitle')}</p>

      <div className="tool-grid">
        {TOOLS.map((tool) => {
          const Icon = tool.icon
          const title = toolTitle(tool.id, language)
          return (
            <button
              key={tool.id}
              className={`tool-card ${tool.ready ? '' : 'soon'}`}
              onClick={() => onOpen(tool.id)}
              aria-label={`${t('common.open')} ${title}`}
            >
              <span className="icon">
                <Icon size={19} strokeWidth={1.6} />
              </span>
              <h3>{title}</h3>
              <p>{toolDescription(tool.id, language)}</p>
              <span className="open">
                {t('common.open')}
                <ArrowRight size={13} strokeWidth={1.8} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="welcome-footer">
        <span>
          <span className="kbd">{modKey('K')}</span> {t('status.commandPalette')}
        </span>
        <span className="dot-sep" />
        <span>{t('welcome.footerLocal')}</span>
      </div>
    </div>
  )
}
