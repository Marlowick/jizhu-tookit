interface TitleBarProps {
  showMockTraffic: boolean
}

export function TitleBar({ showMockTraffic }: TitleBarProps) {
  return (
    <header className="titlebar" data-tauri-drag-region>
      {showMockTraffic && (
        <div className="traffic" aria-hidden="true">
          <span className="dot dot-red" />
          <span className="dot dot-yellow" />
          <span className="dot dot-green" />
        </div>
      )}
      <span className="titlebar-title" data-tauri-drag-region>
        机杼工具箱
      </span>
    </header>
  )
}
