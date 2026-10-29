import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, Image, Maximize2, QrCode, RefreshCw, X } from 'lucide-react'
import { copyText, errorMessage, saveBinaryFile } from '../core/ipc'
import type { QrLevel, QrToolState, Tab } from '../core/types'
import { useAppStore } from '../store/appStore'

interface QrToolProps {
  tab: Tab
}

const LEVELS: QrLevel[] = ['L', 'M', 'Q', 'H']
const LEVEL_HINTS: Record<QrLevel, string> = {
  L: '约 7% 纠错',
  M: '约 15% 纠错',
  Q: '约 25% 纠错',
  H: '约 30% 纠错',
}
const SAMPLE = 'https://example.com/jizhu'

export function QrTool({ tab }: QrToolProps) {
  const setQrTool = useAppStore((state) => state.setQrTool)
  const showToast = useAppStore((state) => state.showToast)
  const state: QrToolState = tab.qrTool ?? {
    text: SAMPLE,
    level: 'M',
    size: 320,
  }

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomSrc, setZoomSrc] = useState('')

  const update = (patch: Partial<QrToolState>) => setQrTool(tab.id, { ...state, ...patch })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const clear = () => {
      const context = canvas.getContext('2d')
      context?.clearRect(0, 0, canvas.width, canvas.height)
    }
    if (!state.text.trim()) {
      clear()
      setError(null)
      return
    }
    const bytes = new TextEncoder().encode(state.text).length
    if (bytes > 2953) {
      clear()
      setError(`内容 ${bytes} 字节，超过 QR 最大容量 2953 字节（EC=L）`)
      return
    }

    setRendering(true)
    QRCode.toCanvas(canvas, state.text, {
      errorCorrectionLevel: state.level,
      width: state.size,
      margin: 2,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then(() => {
        if (!cancelled) {
          setError(null)
          setRendering(false)
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        clear()
        setError(caught instanceof Error ? caught.message : '二维码生成失败')
        setRendering(false)
      })
    return () => {
      cancelled = true
    }
  }, [state.level, state.size, state.text])

  const bytes = new TextEncoder().encode(state.text).length
  const canExport = Boolean(state.text.trim() && !error)

  const canvasBlob = (): Promise<Blob | null> =>
    new Promise((resolve) => {
      const canvas = canvasRef.current
      if (!canvas) return resolve(null)
      canvas.toBlob((blob) => resolve(blob), 'image/png')
    })

  const downloadPng = async () => {
    const blob = await canvasBlob()
    if (!blob) return
    try {
      const saved = await saveBinaryFile(
        'jizhu-qrcode.png',
        new Uint8Array(await blob.arrayBuffer()),
      )
      if (saved) showToast('已导出 PNG')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const downloadSvg = async () => {
    try {
      const svg = await QRCode.toString(state.text, {
        type: 'svg',
        errorCorrectionLevel: state.level,
        width: state.size,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      })
      const saved = await saveBinaryFile('jizhu-qrcode.svg', new TextEncoder().encode(svg))
      if (saved) showToast('已导出 SVG')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const openZoom = async () => {
    if (!state.text.trim() || error) return
    try {
      const src = await QRCode.toDataURL(state.text, {
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
        throw new Error('当前环境不支持复制图片，请使用导出 PNG')
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('已复制二维码图片')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const copyContent = async () => {
    try {
      await copyText(state.text)
      showToast('已复制二维码内容')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  return (
    <div className="small-tool qr-tool">
      <header className="small-tool-head">
        <QrCode size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>二维码生成</strong>
        <span className="small-tool-sub">文本 → QR · PNG / SVG</span>
        <span className="small-tool-hint">本地生成 · 不上传内容</span>
      </header>

      <div className="qr-body">
        <section className="qr-input-pane">
          <div className="qr-pane-head">
            <span>内容</span>
            <span>
              {bytes} 字节 · UTF-8
            </span>
            <button className="btn ghost" onClick={() => update({ text: SAMPLE })}>
              <RefreshCw size={12} strokeWidth={1.8} />
              示例
            </button>
            <button className="btn ghost" onClick={() => update({ text: '' })} disabled={!state.text}>
              清空
            </button>
          </div>
          <textarea
            className="qr-textarea"
            value={state.text}
            spellCheck={false}
            autoComplete="off"
            placeholder="输入要生成二维码的文本、URL 或短内容…"
            onChange={(event) => update({ text: event.target.value })}
          />
          <div className="qr-settings">
            <label>
              <span>纠错级别</span>
              <select
                value={state.level}
                onChange={(event) => update({ level: event.target.value as QrLevel })}
              >
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level} · {LEVEL_HINTS[level]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>尺寸</span>
              <select
                value={state.size}
                onChange={(event) => update({ size: Number(event.target.value) })}
              >
                <option value={240}>240 px</option>
                <option value={320}>320 px</option>
                <option value={400}>400 px</option>
              </select>
            </label>
            <span className="qr-capacity">
              容量随纠错级别变化；上限 2953 字节（L）
            </span>
          </div>
        </section>

        <section className="qr-preview-pane">
          <div className="qr-pane-head">
            <span>预览</span>
            <span>
              {state.level} 级 · {state.size}px
            </span>
          </div>
          <div className="qr-preview-card">
            <canvas
              ref={canvasRef}
              className={`qr-canvas ${!state.text.trim() || error ? 'is-hidden' : ''}`}
              aria-label="二维码预览"
              onClick={() => void openZoom()}
            />
            <button
              className="qr-zoom-btn"
              onClick={() => void openZoom()}
              disabled={!canExport || rendering}
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
            ) : !state.text.trim() ? (
              <div className="qr-empty">输入内容后实时生成</div>
            ) : null}
          </div>
          <div className="qr-actions">
            <button className="btn" onClick={() => void downloadPng()} disabled={!canExport || rendering}>
              <Download size={13} strokeWidth={1.8} />
              导出 PNG
            </button>
            <button className="btn" onClick={() => void downloadSvg()} disabled={!canExport || rendering}>
              <Download size={13} strokeWidth={1.8} />
              导出 SVG
            </button>
            <button className="btn" onClick={() => void copyImage()} disabled={!canExport || rendering}>
              <Image size={13} strokeWidth={1.8} />
              复制图片
            </button>
            <button className="btn" onClick={() => void copyContent()} disabled={!state.text.trim()}>
              <Copy size={13} strokeWidth={1.8} />
              复制内容
            </button>
          </div>
        </section>
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

      <footer className="small-tool-foot">
        <span>
          {error ? '生成失败' : state.text.trim() ? '二维码已生成' : '等待输入'} · 纠错 {state.level} ·{' '}
          {state.size}px
        </span>
        <span className="small-tool-foot-note">
          图片复制取决于 WebView 能力
        </span>
      </footer>
    </div>
  )
}
