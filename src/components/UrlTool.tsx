import { Fragment, useEffect, useMemo, useState } from 'react'
import { Braces, Copy, Link, Link2, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { copyText, errorMessage } from '../core/ipc'
import {
  SAMPLE_URL,
  buildUrl,
  jsonParamInfo,
  makeParam,
  parseUrlInput,
} from '../core/urlTools'
import type { Tab } from '../core/types'
import type { UrlParam } from '../core/urlTools'
import { useAppStore } from '../store/appStore'

const MAX_URL_DEPTH = 3

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function NestedUrlParams({ value, depth }: { value: string; depth: number }) {
  const parsed = useMemo(() => parseUrlInput(value), [value])
  if (!parsed.valid) return null
  return (
    <div className={`url-nested-block depth-${depth}`}>
      <div className="url-nested-head">
        <Link2 size={12} strokeWidth={1.8} />
        <strong>嵌套 URL · 第 {depth} 层</strong>
        <span className="url-nested-host">
          {parsed.host}
          {parsed.pathname}
        </span>
        <span className="url-nested-count">{parsed.params.length} 个参数</span>
      </div>
      {parsed.params.length ? (
        <div className="url-nested-list">
          {parsed.params.map((param, index) => (
            <Fragment key={`${depth}-${index}-${param.key}`}>
              <div className="url-nested-row">
                <span className="url-nested-key">{param.key || '（空键名）'}</span>
                <span className="url-nested-value">{param.value || '—'}</span>
              </div>
              {isHttpUrl(param.value) && depth < MAX_URL_DEPTH ? (
                <NestedUrlParams value={param.value} depth={depth + 1} />
              ) : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="url-nested-empty">该 URL 没有查询参数</div>
      )}
    </div>
  )
}

interface UrlToolProps {
  tab: Tab
}

export function UrlTool({ tab }: UrlToolProps) {
  const setUrlTool = useAppStore((state) => state.setUrlTool)
  const showToast = useAppStore((state) => state.showToast)
  const state = tab.urlTool ?? { input: '', decode: true }
  const parsed = useMemo(() => parseUrlInput(state.input), [state.input])
  const [selectedJson, setSelectedJson] = useState<number | null>(null)
  const [editingJson, setEditingJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [urlUpdated, setUrlUpdated] = useState(false)
  const [urlTick, setUrlTick] = useState(0)

  useEffect(() => {
    if (selectedJson != null && selectedJson >= parsed.params.length) {
      setSelectedJson(null)
      setEditingJson(false)
    }
  }, [parsed.params.length, selectedJson])

  const update = (patch: Partial<typeof state>) => {
    if (patch.input !== undefined && patch.input !== state.input) {
      setUrlUpdated(true)
      setUrlTick((value) => value + 1)
    }
    setUrlTool(tab.id, { ...state, ...patch })
  }

  useEffect(() => {
    if (!urlUpdated) return
    const timer = window.setTimeout(() => setUrlUpdated(false), 1800)
    return () => window.clearTimeout(timer)
  }, [urlTick, urlUpdated])

  const commitParams = (params: UrlParam[]) => {
    update({ input: buildUrl(parsed.base, parsed.hash, params) })
  }

  const updateParam = (index: number, field: 'key' | 'value', nextValue: string) => {
    const param = parsed.params[index]
    if (!param) return
    const params = parsed.params.slice()
    if (state.decode) {
      const key = field === 'key' ? nextValue : param.key
      const value = field === 'value' ? nextValue : param.value
      params[index] = makeParam(key, value, true)
    } else {
      const rawKey = field === 'key' ? nextValue : param.rawKey
      const rawValue = field === 'value' ? nextValue : param.rawValue
      params[index] = {
        rawKey,
        rawValue,
        key: rawKey,
        value: rawValue,
      }
    }
    commitParams(params)
  }

  const addParam = () => {
    let index = 1
    const keys = new Set(parsed.params.map((param) => param.key))
    while (keys.has(`param${index}`)) index += 1
    commitParams([...parsed.params, makeParam(`param${index}`, '', state.decode)])
  }

  const removeParam = (index: number) => {
    commitParams(parsed.params.filter((_, position) => position !== index))
    setSelectedJson(null)
  }

  const copy = async (text: string, label: string) => {
    try {
      await copyText(text)
      showToast(`已复制${label}`)
    } catch (error) {
      showToast(errorMessage(error))
    }
  }

  const selectedParam = selectedJson != null ? parsed.params[selectedJson] : null
  const selectedJsonInfo = selectedParam ? jsonParamInfo(selectedParam.value) : null

  const openJsonEditor = () => {
    if (!selectedJsonInfo) return
    setJsonDraft(selectedJsonInfo.pretty)
    setEditingJson(true)
  }

  const saveJson = () => {
    if (selectedJson == null) return
    try {
      const value = JSON.stringify(JSON.parse(jsonDraft))
      updateParam(selectedJson, 'value', value)
      setEditingJson(false)
      showToast('已更新 JSON 参数')
    } catch {
      showToast('JSON 语法错误，未应用')
    }
  }

  return (
    <div className="small-tool url-tool">
      <header className="small-tool-head">
        <Link size={15} strokeWidth={1.8} color="#2563eb" />
        <strong>URL 解析</strong>
        <span className="small-tool-sub">结构拆解 · 参数编辑 · JSON 探测</span>
        <span className="small-tool-hint">编辑参数实时重组 URL</span>
      </header>

      <div className="url-input-bar">
        <span className="url-input-label">URL</span>
        <input
          className="url-input"
          value={state.input}
          spellCheck={false}
          autoComplete="off"
          placeholder="https://example.com/path?name=value#hash"
          onChange={(event) => {
            setSelectedJson(null)
            update({ input: event.target.value })
          }}
        />
        <span className={`url-updated ${urlUpdated ? 'show' : ''}`} aria-live="polite">URL 已更新</span>
        <button className="btn ghost" onClick={() => void copy(state.input, ' URL')} disabled={!state.input}>
          <Copy size={13} strokeWidth={1.8} />
        </button>
        <button className="btn" onClick={() => update({ input: SAMPLE_URL })}>
          <Sparkles size={13} strokeWidth={1.8} />
          示例
        </button>
        <button
          className={`btn ${state.decode ? 'active' : ''}`}
          onClick={() => update({ decode: !state.decode })}
          title="切换参数值的显示方式，不修改输入"
        >
          URL 解码
        </button>
        <button className="btn ghost" onClick={() => update({ input: '' })} disabled={!state.input}>
          清空
        </button>
      </div>

      <div className="url-body">
        {!state.input.trim() ? (
          <div className="small-placeholder">
            <Link size={20} strokeWidth={1.5} />
            <strong>粘贴 URL 开始拆解</strong>
            <span>支持查询参数编辑、增删、JSON 参数识别和实时重组。</span>
            <button className="btn" onClick={() => update({ input: SAMPLE_URL })}>
              载入示例
            </button>
          </div>
        ) : !parsed.valid ? (
          <div className="m4-error">
            <strong>URL 无法解析</strong>
            <span>{parsed.error}</span>
          </div>
        ) : (
          <>
            <div className="url-structure">
              <span className="url-seg protocol">{parsed.protocol}://</span>
              <span className="url-seg host">{parsed.host}</span>
              <span className="url-seg path">{parsed.pathname}</span>
              <span className="url-seg query">
                {parsed.params.length ? `?${parsed.params.length} 个参数` : '无查询参数'}
              </span>
              {parsed.hash ? <span className="url-seg hash">{parsed.hash}</span> : null}
              <span className="url-struct-meta">
                {parsed.port ? `端口 ${parsed.port}` : '端口默认'} ·{' '}
                {parsed.hash ? '含 Fragment' : '无 Fragment'}
              </span>
            </div>

            <div className="url-params-head">
              <span>
                查询参数 · {parsed.params.length} 个 ·{' '}
                {state.decode ? '值已自动 URL 解码' : '显示原始编码'}
              </span>
              <span>{parsed.params.filter((param) => jsonParamInfo(param.value)).length} 个 JSON</span>
            </div>

            <div className="url-param-list">
              {parsed.params.map((param, index) => {
                const info = jsonParamInfo(param.value)
                return (
                  <Fragment key={index}>
                  <div className="url-param-row">
                    <input
                      className="url-param-input key"
                      value={state.decode ? param.key : param.rawKey}
                      spellCheck={false}
                      aria-label={`参数 ${index + 1} 名称`}
                      onChange={(event) => updateParam(index, 'key', event.target.value)}
                    />
                    <input
                      className="url-param-input value"
                      value={state.decode ? param.value : param.rawValue}
                      spellCheck={false}
                      aria-label={`参数 ${index + 1} 值`}
                      onChange={(event) => updateParam(index, 'value', event.target.value)}
                    />
                    {info ? (
                      <button
                        className={`url-json-badge ${selectedJson === index ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedJson(index)
                          setEditingJson(false)
                        }}
                      >
                        <Braces size={11} strokeWidth={1.8} />
                        JSON · {info.count} {info.kind === 'array' ? '项' : '键'}
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      className="btn ghost url-param-copy"
                      onClick={() => void copy(param.value, `参数 ${param.key}`)}
                      title="复制参数值"
                    >
                      <Copy size={12} strokeWidth={1.8} />
                    </button>
                    <button
                      className="btn ghost url-param-delete"
                      onClick={() => removeParam(index)}
                      title="删除参数"
                    >
                      <Trash2 size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                  {isHttpUrl(param.value) ? (
                    <NestedUrlParams key={`${index}-${param.value}`} value={param.value} depth={1} />
                  ) : null}
                </Fragment>
              )})}
              <button className="url-add-param" onClick={addParam}>
                <Plus size={13} strokeWidth={1.8} />
                添加参数
              </button>
            </div>

            {selectedParam && selectedJsonInfo ? (
              <div className="url-json-preview">
                <div className="url-json-preview-head">
                  <strong>{selectedParam.key}</strong>
                  <span>推断为 JSON · {selectedJsonInfo.count} {selectedJsonInfo.kind === 'array' ? '项' : '键'}</span>
                  <span className="small-tool-hint">仅展示，应用后才会改参数</span>
                  <button className="btn ghost" onClick={openJsonEditor}>
                    JSON 编辑
                  </button>
                  <button className="btn ghost" onClick={() => void copy(selectedJsonInfo.pretty, ' JSON')}>
                    <Copy size={12} strokeWidth={1.8} />
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      setSelectedJson(null)
                      setEditingJson(false)
                    }}
                    aria-label="关闭 JSON 预览"
                  >
                    <X size={13} strokeWidth={1.8} />
                  </button>
                </div>
                {editingJson ? (
                  <>
                    <textarea
                      className="url-json-editor"
                      value={jsonDraft}
                      spellCheck={false}
                      onChange={(event) => setJsonDraft(event.target.value)}
                    />
                    <div className="url-json-editor-foot">
                      <button className="btn" onClick={() => setEditingJson(false)}>
                        取消
                      </button>
                      <button className="btn primary" onClick={saveJson}>
                        应用
                      </button>
                    </div>
                  </>
                ) : (
                  <pre>{selectedJsonInfo.pretty}</pre>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <footer className="small-tool-foot">
        <span>
          {parsed.valid
            ? `${parsed.params.length} 个参数 · ${parsed.params.filter((param) => jsonParamInfo(param.value)).length} 个 JSON · ${state.decode ? '解码显示' : '原始编码'}`
            : '等待有效 URL'}
        </span>
        <span className="small-tool-foot-note">参数编辑会实时重组 URL</span>
      </footer>
    </div>
  )
}
