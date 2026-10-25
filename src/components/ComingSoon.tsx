import type { LucideIcon } from 'lucide-react'

interface ComingSoonProps {
  title: string
  description: string
  icon: LucideIcon
  onBack: () => void
}

export function ComingSoon({ title, description, icon: Icon, onBack }: ComingSoonProps) {
  return (
    <div className="soon-view">
      <span className="icon">
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <p style={{ color: 'var(--text-faint)', fontSize: 12 }}>当前 MVP 先交付 JSON 编辑器，该工具在后续里程碑补齐</p>
      <button className="btn" style={{ marginTop: 12 }} onClick={onBack}>
        回到欢迎页
      </button>
    </div>
  )
}
