import type { UrlDiffResult } from '../../core/types'

interface UrlDiffViewProps {
  result: UrlDiffResult
  aLabel: string
  bLabel: string
}

export function UrlDiffView({ result, aLabel, bLabel }: UrlDiffViewProps) {
  return (
    <div className="diff-view">
      <div className="url-diff-head">
        <span>部分</span>
        <span>参数</span>
        <span>A — {aLabel}</span>
        <span>B — {bLabel}</span>
      </div>
      <div className="url-diff-scroll">
        {result.rows.map((row, index) => (
          <div key={`${row.section}-${row.name}-${index}`} className={`url-diff-row ${row.kind}`}>
            <span className="url-section">{row.section}</span>
            <span
              className="url-name"
              style={{ paddingLeft: 10 + (row.depth ?? 0) * 14 }}
              title={row.name}
            >
              {row.name}
            </span>
            <span className={`url-value a ${row.kind}`}>{row.a}</span>
            <span className={`url-value b ${row.kind}`}>{row.b}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
