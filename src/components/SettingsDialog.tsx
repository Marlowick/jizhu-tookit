import { useEffect, useState } from 'react'
import { Info, Keyboard, Settings, SlidersHorizontal, X } from 'lucide-react'
import { modKey } from '../core/keyboard'
import { useI18n } from '../core/useI18n'
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
  [`Ctrl+Z / ${modKey('Z')}`, 'settings.shortcut.undo'],
  [modKey('⇧F'), 'settings.shortcut.maximize'],
  ['Esc', 'settings.shortcut.escape'],
  ['Ctrl+Alt+←/→', 'settings.shortcut.panelFocus'],
  ['Alt+1..4', 'settings.shortcut.workspaces'],
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
            <Settings size={15} strokeWidth={1.8} color="#2563eb" />
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
            <span>机杼工具箱 v0.1.0</span>
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
                    <span>当前版本固定使用深色工作台</span>
                  </div>
                  <span className="settings-pill">{t('settings.theme.dark')}</span>
                </div>
                <div className="settings-row">
                  <div>
                    <strong>文本编码 / 换行</strong>
                    <span>编辑与复制始终使用 UTF-8；状态栏显示 LF</span>
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
                  <span>jizhu · v0.1.0</span>
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
