import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Image, Maximize2, QrCode, X } from 'lucide-react'
import { copyText, errorMessage } from '../../core/ipc'
import type { Doc, QrLevel, QrToolState, Tab } from '../../core/types'
import { useAppStore } from '../../store/appStore'

const LEVELS: QrLevel[] = ['L', 'M', 'Q', 'H']
const LEVEL_HINTS: Record<QrLevel, string> = {
  L: '约 7% 纠错',
  M: '约 15% 纠错',
  Q: '约 25% 纠错',
  H: '约 30% 纠错',
}
const DEFAULT_QR: QrToolState = { text: '', level: 'M', size: 320 }

interface QrPreviewPaneProps {
  tab: Tab
  doc: Doc
  onClose: () => void
}

export function QrPreviewPane({ tab, doc, onClose }: QrPreviewPaneProps) {
  const setQrTool = useAppStore((state) => state.setQrTool)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.qrTool ?? DEFAULT_QR
  const text = doc.text
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [renderSize, setRenderSize] = useState(320)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomSrc, setZoomSrc] = useState('')

  const update = (patch: Partial<QrToolState>) =>
    setQrTool(tab.id, { ...state, ...patch, text })

  useEffect(() => {
    if (!zoomOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setZoomOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zoomOpen])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const update = () => {
      const rect = stage.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      // 预览区只占可用空间的 3/4，避免二维码在分屏中显得过大
      const next = Math.floor(Math.min(rect.width - 32, rect.height - 32) * 0.75)
      const clamped = Math.max(160, Math.min(900, next))
      setRenderSize((current) => (Math.abs(current - clamped) < 1 ? current : clamped))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const clear = () => {
        const context = canvas.getContext('2d')
        context?.clearRect(0, 0, canvas.width, canvas.height)
      }
      if (!text.trim()) {
        clear()
        setError(null)
        setRendering(false)
        return
      }
      const bytes = new TextEncoder().encode(text).length
      if (bytes > 2953) {
        clear()
        setError(`内容 ${bytes} 字节，超过 QR 最大容量 2953 字节（EC=L）`)
        setRendering(false)
        return
      }
      setRendering(true)
      QRCode.toCanvas(canvas, text, {
        errorCorrectionLevel: state.level,
        width: renderSize,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      })
        .then(() => {
          if (cancelled) return
          setError(null)
          setRendering(false)
        })
        .catch((caught: unknown) => {
          if (cancelled) return
          clear()
          setError(caught instanceof Error ? caught.message : '二维码生成失败')
          setRendering(false)
        })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [text, state.level, renderSize])

  const bytes = new TextEncoder().encode(text).length
  const canUse = Boolean(text.trim() && !error)

  const canvasBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) return resolve(null)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })

  const openZoom = async () => {
    if (!canUse) return
    try {
      const src = await QRCode.toDataURL(text, {
        errorCorrectionLevel: state.level,
        width: 720,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      })
      setZoomSrc(src)
      setZoomOpen(true)
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const copyImage = async () => {
    try {
      const blob = await canvasBlob()
      if (!blob) return
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('当前环境不支持复制图片')
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('已复制二维码图片')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const copyContent = async () => {
    try {
      await copyText(text)
      showToast('已复制二维码内容')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  return (
    <div className="qr-preview-only">
      <header className="qr-preview-only-head">
        <QrCode className="side-tool-header-icon" size={14} strokeWidth={1.8} />
        <strong>二维码预览</strong>
        <span className="side-tool-source-badge">输入：当前文档</span>
        <span className="qr-preview-only-meta">
          {bytes} 字节 · {state.level} 级 · {renderSize}px
        </span>
        <span className="qr-preview-only-sync">来自左侧编辑器 · 实时更新</span>
        <button className="btn ghost workspace-panel-icon" onClick={onClose} title="关闭二维码预览" aria-label="关闭二维码预览">
          <X size={14} strokeWidth={1.8} />
        </button>
      </header>

      <div className="qr-preview-only-stage" ref={stageRef}>
        <div className="qr-preview-card qr-preview-only-card">
          <canvas
            ref={canvasRef}
            className={`qr-canvas ${!text.trim() || error ? 'is-hidden' : ''}`}
            aria-label="二维码预览"
            onClick={() => void openZoom()}
          />
          <button
            className="qr-zoom-btn"
            onClick={() => void openZoom()}
            disabled={!canUse || rendering}
            title="放大预览"
          >
            <Maximize2 size={12} strokeWidth={1.8} />
            放大
          </button>
          {error ? (
            <div className="m4-error qr-error">
              <strong>无法生成二维码</strong>
              <span>{error}</span>
            </div>
          ) : !text.trim() ? (
            <div className="qr-empty">在左侧编辑器输入内容后实时生成</div>
          ) : null}
        </div>
      </div>

      <div className="qr-preview-only-controls">
        <label>
          <span>纠错级别</span>
          <select value={state.level} onChange={(event) => update({ level: event.target.value as QrLevel })}>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level} · {LEVEL_HINTS[level]}
              </option>
            ))}
          </select>
        </label>
        <span className="qr-preview-only-hint">修改左侧文本会立即刷新</span>
        <button className="btn" onClick={() => void copyImage()} disabled={!canUse || rendering}>
          <Image size={13} strokeWidth={1.8} />
          复制图片
        </button>
        <button className="btn ghost" onClick={() => void copyContent()} disabled={!text.trim()}>
          <Copy size={13} strokeWidth={1.8} />
          复制内容
        </button>
      </div>

      {zoomOpen ? (
        <div
          className="qr-zoom-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoomOpen(false)
          }}
        >
          <div className="qr-zoom-dialog" role="dialog" aria-modal="true" aria-label="二维码放大预览">
            <header>
              <strong>二维码放大预览</strong>
              <span>{state.level} 级 · 720px 导出图</span>
              <button className="btn ghost" onClick={() => setZoomOpen(false)} aria-label="关闭放大预览">
                <X size={14} strokeWidth={1.8} />
              </button>
            </header>
            <img src={zoomSrc} alt="放大的二维码" />
            <footer>点击空白处或 Esc 关闭 · 可直接用手机扫描</footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
