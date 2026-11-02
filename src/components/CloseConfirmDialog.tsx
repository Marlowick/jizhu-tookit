import { useEffect } from 'react'
import { X } from 'lucide-react'

interface CloseConfirmDialogProps {
  label: string
  onCancel: () => void
  onConfirm: () => void
}

export function CloseConfirmDialog({ label, onCancel, onConfirm }: CloseConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div
      className="confirm-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="confirm-dialog close-confirm" role="alertdialog" aria-modal="true" aria-label={`关闭${label}`}>
        <header className="close-confirm-head">
          <strong>{`关闭标签页「${label}」？`}</strong>
          <button className="btn ghost" onClick={onCancel} aria-label="取消关闭">
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <p>{`当前工作区：${label}。标签有未保存的编辑内容，关闭后该工作区会被移除。`}</p>
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel} autoFocus>
            取消
          </button>
          <button className="btn danger" onClick={onConfirm}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
