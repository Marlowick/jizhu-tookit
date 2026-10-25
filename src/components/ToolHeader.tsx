import { AlignJustify, Download, FolderOpen, Minimize2, Zap } from 'lucide-react'
import type { AnalysisSummary, Doc } from '../core/types'
import { modKey } from '../core/keyboard'

interface ToolHeaderProps {
  doc: Doc
  summary: AnalysisSummary | null
  jqOpen: boolean
  onImport: () => void
  onExport: () => void
  onFormat: () => void
  onMinify: () => void
  onToggleJq: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function ToolHeader({ doc, summary, jqOpen, onImport, onExport, onFormat, onMinify, onToggleJq }: ToolHeaderProps) {
  const hasText = Boolean(doc.text.trim())
  const invalid = hasText && summary && !summary.valid
  const status = !hasText ? '空文档' : invalid ? '语法错误' : doc.dirty ? '未保存' : '已格式化'
  const bytes = new TextEncoder().encode(doc.text).length

  return (
    <div className="tool-header">
      <div className="file-meta">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7 3.5h7L19 8.5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z"
            stroke="#6b7280"
            strokeWidth="1.4"
          />
          <path d="M14 3.5v5h5" stroke="#6b7280" strokeWidth="1.4" />
          <path d="M9 13h6M9 16h4" stroke="#2563eb" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span className="name">{doc.title}</span>
        <span className="sep">·</span>
        <span className="meta">{formatBytes(bytes)}</span>
        <span className="sep">·</span>
        <span className={`meta ${invalid ? 'bad' : 'ok'}`}>{status}</span>
      </div>

      <div className="tool-actions">
        <button className="btn" onClick={onImport} title={`导入文件（${modKey('O')}）`}>
          <FolderOpen size={14} strokeWidth={1.6} />
          导入
        </button>
        <button className="btn" onClick={onExport} title={`导出文件（${modKey('S')}）`}>
          <Download size={14} strokeWidth={1.6} />
          导出
        </button>
        <button className="btn" onClick={onFormat} title={`格式化（${modKey('⇧F')}）`}>
          <AlignJustify size={14} strokeWidth={1.6} />
          格式化
        </button>
        <button className="btn" onClick={onMinify} title="压缩为单行">
          <Minimize2 size={14} strokeWidth={1.6} />
          压缩
        </button>
        <button
          className={`btn ${jqOpen ? 'active' : ''}`}
          onClick={onToggleJq}
          title={`jq 面板（${modKey('J')}）`}
        >
          <Zap size={14} strokeWidth={1.6} />
          jq 面板
        </button>
      </div>
    </div>
  )
}
