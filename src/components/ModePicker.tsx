import { useEffect, useState } from 'react'
import { AlignLeft, Braces, Calculator, X } from 'lucide-react'
import type { WorkspaceMode } from '../core/types'

interface ModePickerProps {
  current: WorkspaceMode
  onChoose: (mode: WorkspaceMode) => void
  onClose: () => void
}

const MODES: Array<{
  value: WorkspaceMode
  label: string
  english: string
  description: string
  icon: typeof AlignLeft
}> = [
  { value: 'plain', label: '纯文本', english: 'Plain', description: '普通文本编辑', icon: AlignLeft },
  { value: 'json', label: 'JSON', english: 'JSON', description: '树形结构 / 格式化', icon: Braces },
  { value: 'calc', label: '计算', english: 'Calc', description: '实时四则运算 / 变量', icon: Calculator },
]

export function ModePicker({ current, onChoose, onClose }: ModePickerProps) {
  const [active, setActive] = useState(() => Math.max(0, MODES.findIndex((mode) => mode.value === current)))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        event.stopPropagation()
        setActive((index) => (index + 1) % MODES.length)
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        event.stopPropagation()
        setActive((index) => (index - 1 + MODES.length) % MODES.length)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        onChoose(MODES[active].value)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, onChoose, onClose])

  return (
    <div
      className="mode-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="mode-picker" role="dialog" aria-modal="true" aria-label="选择编辑器模式">
        <header>
          <div>
            <strong>选择编辑器模式</strong>
            <span>Mode</span>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="关闭模式选择">
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <div className="mode-picker-options" role="listbox" aria-label="编辑器模式">
          {MODES.map((mode, index) => {
            const Icon = mode.icon
            return (
              <button
                key={mode.value}
                className={`mode-picker-option ${current === mode.value ? 'current' : ''} ${active === index ? 'active' : ''}`}
                onClick={() => onChoose(mode.value)}
                onMouseMove={() => setActive(index)}
                role="option"
                aria-selected={current === mode.value}
                aria-current={current === mode.value}
              >
                <Icon size={16} strokeWidth={1.7} />
                <span className="mode-picker-copy">
                  <span>
                    {mode.label}
                    {mode.label !== mode.english ? <em>{mode.english}</em> : null}
                  </span>
                  <small>{mode.description}</small>
                </span>
                {current === mode.value ? <span className="mode-picker-current">当前</span> : null}
              </button>
            )
          })}
        </div>
        <footer>↑↓ 选择 · Enter 确认 · Esc 取消</footer>
      </div>
    </div>
  )
}
