import { useEffect, useState } from 'react'
import { Info, Keyboard, Settings, SlidersHorizontal, X } from 'lucide-react'
import { modKey } from '../core/keyboard'
import { useI18n } from '../core/useI18n'
import { APP_VERSION } from '../core/version'
import { useAppStore } from '../store/appStore'

type SettingsTab = 'general' | 'editor' | 'shortcuts' | 'about'

const TABS: Array<{ id: SettingsTab; icon: typeof Settings }> = [
  { id: 'general', icon: Settings },
  { id: 'editor', icon: SlidersHorizontal },
  { id: 'shortcuts', icon: Keyboard },
  { id: 'about', icon: Info },
]

const SHORTCUTS: Array<[string, string]> = [
  [modKey('⇧P'), 'settings.shortcut.command'],
  [modKey('F'), 'settings.shortcut.search'],
  [modKey('Z'), 'settings.shortcut.undo'],
  [modKey('⇧Z'), 'settings.shortcut.redo'],
  [modKey('1..9'), 'settings.shortcut.workspaces'],
  [modKey('W'), 'settings.shortcut.closeTool'],
  [modKey('='), 'settings.shortcut.zoomIn'],
  [modKey('-'), 'settings.shortcut.zoomOut'],
  [modKey('0'), 'settings.shortcut.zoomReset'],
  ['Tab / ⇧Tab', 'settings.shortcut.indent'],
  ['Esc', 'settings.shortcut.escape'],
]

export function SettingsDialog() {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const { t } = useI18n()
  const [tab, setTab] = useState<SettingsTab>('general')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSettingsOpen])

  const tabLabel = (id: SettingsTab) => t(`settings.tab.${id}`)

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSettingsOpen(false)
      }}
    >
      <div className="settings-dialog" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
        <aside className="settings-side">
          <div className="settings-brand">
            <Settings size={15} strokeWidth={1.8} color="#81a2be" />
            <span>{t('settings.title')}</span>
          </div>
          <nav className="settings-nav">
            {TABS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={tab === item.id ? 'active' : ''}
                  onClick={() => setTab(item.id)}
                >
                  <Icon size={14} strokeWidth={1.8} />
                  {tabLabel(item.id)}
                </button>
              )
            })}
          </nav>
          <div className="settings-side-foot">
            <span>机杼工具箱 v{APP_VERSION}</span>
            <span>{t('settings.side.tagline')}</span>
          </div>
        </aside>

        <section className="settings-main">
          <header className="settings-head">
            <strong>{tabLabel(tab)}</strong>
            <button className="btn ghost" onClick={() => setSettingsOpen(false)} aria-label={t('settings.close')}>
              <X size={14} strokeWidth={1.8} />
            </button>
          </header>

          <div className="settings-body">
            {tab === 'general' ? (
              <>
                <div className="settings-section-title">{t('settings.general.interface')}</div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.theme.label')}</strong>
                    <span>{t('settings.theme.desc')}</span>
                  </div>
                  <select
                    value={settings.theme}
                    onChange={(event) => updateSettings({ theme: event.target.value as typeof settings.theme })}
                  >
                    <option value="ghostty">{t('settings.theme.ghostty')}</option>
                    <option value="solarized-dark">{t('settings.theme.solarizedDark')}</option>
                    <option value="solarized-light">{t('settings.theme.solarizedLight')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.scale.label')}</strong>
                    <span>{t('settings.scale.desc')}</span>
                  </div>
                  <select
                    value={settings.uiScale}
                    onChange={(event) => updateSettings({ uiScale: Number(event.target.value) })}
                  >
                    <option value={0.8}>80%</option>
                    <option value={0.9}>90%</option>
                    <option value={1}>100%</option>
                    <option value={1.1}>110%</option>
                    <option value={1.2}>120%</option>
                    <option value={1.3}>130%</option>
                    <option value={1.4}>140%</option>
                    <option value={1.5}>150%</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.encoding.label')}</strong>
                    <span>{t('settings.encoding.desc')}</span>
                  </div>
                  <span className="settings-pill">UTF-8 · LF</span>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.language.label')}</strong>
                    <span>{t('settings.language.desc')}</span>
                  </div>
                  <select
                    value={settings.language}
                    onChange={(event) => updateSettings({ language: event.target.value as 'zh-CN' | 'en-US' })}
                  >
                    <option value="zh-CN">{t('settings.language.zh')}</option>
                    <option value="en-US">{t('settings.language.en')}</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.session.label')}</strong>
                    <span>{t('settings.session.desc')}</span>
                  </div>
                  <span className="settings-pill">{t('settings.session.always')}</span>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.privacy.label')}</strong>
                    <span>{t('settings.privacy.desc')}</span>
                  </div>
                  <span className="settings-pill ok">{t('settings.privacy.local')}</span>
                </div>
              </>
            ) : null}

            {tab === 'editor' ? (
              <>
                <div className="settings-section-title">{t('settings.editor.section')}</div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.font.label')}</strong>
                    <span>{t('settings.font.desc')}</span>
                  </div>
                  <select
                    value={settings.editorFontSize}
                    onChange={(event) => updateSettings({ editorFontSize: Number(event.target.value) })}
                  >
                    <option value={12}>12 px</option>
                    <option value={13}>13 px</option>
                    <option value={14}>14 px</option>
                    <option value={15}>15 px</option>
                  </select>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.wrap.label')}</strong>
                    <span>{t('settings.wrap.desc')}</span>
                  </div>
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      checked={settings.wordWrap}
                      onChange={(event) => updateSettings({ wordWrap: event.target.checked })}
                    />
                    <span />
                  </label>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>{t('settings.indent.label')}</strong>
                    <span>{t('settings.indent.desc')}</span>
                  </div>
                  <select
                    value={settings.formatIndent}
                    onChange={(event) =>
                      updateSettings({ formatIndent: Number(event.target.value) as 0 | 2 | 4 })
                    }
                  >
                    <option value={2}>{t('settings.indent.2')}</option>
                    <option value={4}>{t('settings.indent.4')}</option>
                    <option value={0}>{t('settings.indent.tab')}</option>
                  </select>
                </div>
                <div className="settings-note">{t('settings.editor.note')}</div>
              </>
            ) : null}

            {tab === 'shortcuts' ? (
              <>
                <div className="settings-section-title">{t('settings.shortcuts.section')}</div>
                <div className="settings-shortcuts">
                  {SHORTCUTS.map(([keys, key]) => (
                    <div className="settings-shortcut-row" key={`${keys}-${key}`}>
                      <span className="settings-kbd">{keys}</span>
                      <span>{t(key)}</span>
                    </div>
                  ))}
                </div>
                <div className="settings-note">{t('settings.shortcuts.note')}</div>
              </>
            ) : null}

            {tab === 'about' ? (
              <>
                <div className="settings-about-logo">
                  <span>机杼工具箱</span>
                  <span>jizhu · v{APP_VERSION}</span>
                </div>
                <div className="settings-about">
                  <p>{t('settings.about.tagline')}</p>
                  <p>{t('settings.about.local')}</p>
                  <p>{t('settings.about.stack')}</p>
                </div>
                <div className="settings-note">{t('settings.about.data')}</div>
              </>
            ) : null}
          </div>

          <footer className="settings-foot">
            <span>
              {modKey('⇧P')} {t('settings.footer.palette')} · {t('settings.footer')}
            </span>
            <button className="btn" onClick={() => setSettingsOpen(false)}>
              {t('common.close')}
            </button>
          </footer>
        </section>
      </div>
    </div>
  )
}
