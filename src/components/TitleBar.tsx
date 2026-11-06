import type { ReactNode } from 'react'

interface TitleBarProps {
  showMockTraffic: boolean
  children?: ReactNode
}

export function TitleBar({ showMockTraffic, children }: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
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
    </header>
  )
}
