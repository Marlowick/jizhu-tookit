import { useEffect, useMemo, useState } from 'react'
import { Copy, Play, Terminal } from 'lucide-react'
import { curlRequest, copyText, errorMessage } from '../../core/ipc'
import { parseCurl, prettyCurlBody, type CurlResponse } from '../../core/curl'
import type { Doc, Tab } from '../../core/types'
import { useAppStore } from '../../store/appStore'

interface CurlSidePaneProps {
  tab: Tab
  doc: Doc
}

export function CurlSidePane({ tab, doc }: CurlSidePaneProps) {
  const showToast = useAppStore((state) => state.showToast)
  const parsed = useMemo(() => parseCurl(doc.text), [doc.text])
  const [response, setResponse] = useState<CurlResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [view, setView] = useState<'headers' | 'body'>('body')

  useEffect(() => {
    setResponse(null)
    setError(null)
    setRunning(false)
  }, [doc.text])

  const send = async () => {
    if (!parsed.request) {
      setError(parsed.error ?? '无法解析 curl 命令')
      return
    }
    setRunning(true)
    setError(null)
    try {
      const result = await curlRequest(parsed.request)
      setResponse(result)
      setView('body')
    } catch (caught) {
      setError(errorMessage(caught))
      setResponse(null)
    } finally {
      setRunning(false)
    }
  }

  const copyBody = async () => {
    if (!response) return
    try {
      await copyText(prettyCurlBody(response))
      showToast('已复制响应体')
    } catch (caught) {
      showToast(errorMessage(caught))
    }
  }

  const body = response ? prettyCurlBody(response) : ''

  return (
    <div className="curl-side" data-tab={tab.id}>
      <div className="side-tool-controls curl-toolbar">
        <Terminal size={13} strokeWidth={1.8} className="curl-toolbar-icon" />
        {parsed.request ? (
          <>
            <span className="curl-method">{parsed.request.method}</span>
            <code className="curl-url" title={parsed.request.url}>{parsed.request.url}</code>
          </>
        ) : (
          <span className="curl-parse-error">{parsed.error}</span>
        )}
        <span className="side-tool-source">{doc.text.length} 字符</span>
        <button className="btn primary" onClick={() => void send()} disabled={!parsed.request || running}>
          <Play size={12} strokeWidth={1.8} />
          {running ? '请求中…' : '发送'}
        </button>
      </div>

      {error ? (
        <div className="m4-error curl-error">
          <strong>请求失败</strong>
          <span>{error}</span>
        </div>
      ) : response ? (
        <>
          <div className="curl-status">
            <span className={`curl-status-code ${response.status >= 400 ? 'error' : response.status >= 300 ? 'warn' : 'ok'}`}>
              {response.status} {response.statusText}
            </span>
            <span>{Math.round(response.durationMs)} ms</span>
            <span>{response.size.toLocaleString()} B</span>
            {response.truncated ? <span>已截断</span> : null}
            <span className="pipeline-side-spacer" />
            <button className="btn ghost" onClick={() => void copyBody()}>
              <Copy size={12} strokeWidth={1.8} />
              复制 body
            </button>
          </div>
          <div className="pipeline-result-tabs curl-tabs">
            <div className="regex-view-toggle" role="tablist" aria-label="cURL 响应视图">
              <button className={view === 'body' ? 'active' : ''} onClick={() => setView('body')}>Body</button>
              <button className={view === 'headers' ? 'active' : ''} onClick={() => setView('headers')}>Headers · {response.headers.length}</button>
            </div>
          </div>
          {view === 'body' ? (
            <pre className="curl-body">{body || '(empty body)'}</pre>
          ) : (
            <div className="curl-headers">
              <div className="curl-header-row"><span>Status</span><code>{response.status} {response.statusText}</code></div>
              {response.headers.map(([name, value], index) => (
                <div className="curl-header-row" key={`${name}-${index}`}><span>{name}</span><code>{value}</code></div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="curl-empty">
          <span>左侧输入 curl 命令，点击「发送」查看响应 headers 与 body。</span>
        </div>
      )}
    </div>
  )
}
