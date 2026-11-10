import type { ReactNode } from 'react'
import { Command, Settings } from 'lucide-react'
import { modKey } from '../core/keyboard'

interface TitleBarProps {
  showMockTraffic: boolean
  onOpenPalette: () => void
  onOpenSettings: () => void
  children?: ReactNode
}

export function TitleBar({ showMockTraffic, onOpenPalette, onOpenSettings, children }: TitleBarProps) {
  return (
    <header className={`titlebar ${showMockTraffic ? '' : 'titlebar-native'}`} data-tauri-drag-region>
      {showMockTraffic && (
        <div className="traffic" aria-hidden="true">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
      )}
      <div className="titlebar-tabs" data-tauri-drag-region>
        {children}
      </div>
      <div className="titlebar-actions">
        <button
          className="titlebar-command"
          onClick={onOpenPalette}
          title={`打开命令面板（${modKey('K')}）`}
          aria-label="打开命令面板"
        >
          <Command size={11} strokeWidth={1.8} />
          <span>命令面板</span>
          <kbd>{modKey('K')}</kbd>
        </button>
        <button className="titlebar-settings" onClick={onOpenSettings} title="设置" aria-label="设置">
          <Settings size={14} strokeWidth={1.7} />
        </button>
      </div>
    </header>
  )
}
