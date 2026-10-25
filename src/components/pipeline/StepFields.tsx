import { CODEC_PROTOCOLS } from '../../core/codecTools'
import type { CodecDirection, CodecProtocol, PipelineStep } from '../../core/types'

export function configSummary(step: PipelineStep): Array<{ label: string; value: string }> {
  if (step.type === 'jq') {
    return [
      { label: 'EXPR', value: step.expr || '.' },
      { label: '输出', value: step.raw ? '原始字符串 (-r)' : 'JSON' },
    ]
  }
  if (step.type === 'codec') {
    const protocol = CODEC_PROTOCOLS.find((item) => item.id === step.protocol)?.label ?? 'Base64'
    return [
      { label: '协议', value: protocol },
      { label: '方向', value: step.direction === 'encode' ? '编码' : '解码' },
      { label: '模式', value: step.linewise === false ? '整体' : '逐行' },
    ]
  }
  if (step.type === 'regex') {
    const flags = `${step.flags?.global !== false ? 'g' : ''}${step.flags?.ignoreCase ? 'i' : ''}${step.flags?.multiLine ? 'm' : ''}`
    return [
      { label: 'EXPR', value: step.pattern || '' },
      { label: '选项', value: flags || '无' },
    ]
  }
  return [{ label: '排序', value: step.sort === 'asc' ? '按次数升序' : '按次数降序' }]
}

export function StepFields({
  step,
  running,
  onChange,
}: {
  step: PipelineStep
  running: boolean
  onChange: (patch: Partial<PipelineStep>) => void
}) {
  return (
    <div className="pipeline-config-fields">
      {step.type === 'jq' ? (
        <>
          <label className="pipeline-field">
            <span>EXPR</span>
            <input
              value={step.expr ?? '.'}
              disabled={running}
              spellCheck={false}
              onChange={(event) => onChange({ expr: event.target.value })}
            />
          </label>
          <div className="pipeline-flags">
            <label>
              <input
                type="checkbox"
                checked={step.raw !== false}
                disabled={running}
                onChange={(event) => onChange({ raw: event.target.checked })}
              />
              原始字符串（-r，去掉 JSON 引号）
            </label>
          </div>
        </>
      ) : null}

      {step.type === 'codec' ? (
        <>
          <div className="pipeline-field-row">
            <label className="pipeline-field">
              <span>协议</span>
              <select
                value={step.protocol ?? 'base64'}
                disabled={running}
                onChange={(event) => onChange({ protocol: event.target.value as CodecProtocol })}
              >
                {CODEC_PROTOCOLS.map((protocol) => (
                  <option key={protocol.id} value={protocol.id}>
                    {protocol.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="pipeline-field">
              <span>方向</span>
              <select
                value={step.direction ?? 'decode'}
                disabled={running}
                onChange={(event) => onChange({ direction: event.target.value as CodecDirection })}
              >
                <option value="decode">解码</option>
                <option value="encode">编码</option>
              </select>
            </label>
          </div>
          <div className="pipeline-flags">
            <label>
              <input
                type="checkbox"
                checked={step.linewise !== false}
                disabled={running}
                onChange={(event) => onChange({ linewise: event.target.checked })}
              />
              逐行处理
            </label>
            {step.protocol === 'base64' ? (
              <label>
                <input
                  type="checkbox"
                  checked={step.urlSafe !== false}
                  disabled={running}
                  onChange={(event) => onChange({ urlSafe: event.target.checked })}
                />
                URL 安全
              </label>
            ) : null}
          </div>
        </>
      ) : null}

      {step.type === 'regex' ? (
        <>
          <label className="pipeline-field">
            <span>EXPR</span>
            <input
              value={step.pattern ?? ''}
              disabled={running}
              spellCheck={false}
              onChange={(event) => onChange({ pattern: event.target.value })}
            />
          </label>
          <div className="pipeline-flags">
            <label>
              <input
                type="checkbox"
                checked={step.flags?.global !== false}
                disabled={running}
                onChange={(event) =>
                  onChange({
                    flags: {
                      ...(step.flags ?? { global: true, ignoreCase: false, multiLine: false }),
                      global: event.target.checked,
                    },
                  })
                }
              />
              g 全局
            </label>
            <label>
              <input
                type="checkbox"
                checked={step.flags?.ignoreCase === true}
                disabled={running}
                onChange={(event) =>
                  onChange({
                    flags: {
                      ...(step.flags ?? { global: true, ignoreCase: false, multiLine: false }),
                      ignoreCase: event.target.checked,
                    },
                  })
                }
              />
              i 忽略大小写
            </label>
            <label>
              <input
                type="checkbox"
                checked={step.flags?.multiLine === true}
                disabled={running}
                onChange={(event) =>
                  onChange({
                    flags: {
                      ...(step.flags ?? { global: true, ignoreCase: false, multiLine: false }),
                      multiLine: event.target.checked,
                    },
                  })
                }
              />
              m 多行
            </label>
          </div>
        </>
      ) : null}

      {step.type === 'count' ? (
        <label className="pipeline-field">
          <span>排序</span>
          <select
            value={step.sort ?? 'desc'}
            disabled={running}
            onChange={(event) => onChange({ sort: event.target.value as 'asc' | 'desc' })}
          >
            <option value="desc">按次数降序</option>
            <option value="asc">按次数升序</option>
          </select>
        </label>
      ) : null}
    </div>
  )
}

