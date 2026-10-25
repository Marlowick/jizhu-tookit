import type { DiffResult, UrlDiffResult } from './types'

const CONTEXT = 3

/**
 * 根据已对齐的 DiffRow 生成统一 diff 文本。
 * JSON 模式的行号对应规范化后的展示文本，不一定等于源文件行号。
 */
export function unifiedPatch(result: DiffResult, aLabel: string, bLabel: string): string {
  const rows = result.rows
  const changes = rows
    .map((row, index) => (row.kind === 'equal' ? -1 : index))
    .filter((index) => index >= 0)

  const header = `--- ${aLabel || 'A'}\n+++ ${bLabel || 'B'}\n`
  if (!changes.length) return header

  const ranges: Array<[number, number]> = []
  let start = Math.max(0, changes[0] - CONTEXT)
  let end = Math.min(rows.length - 1, changes[0] + CONTEXT)
  for (const index of changes.slice(1)) {
    const nextStart = Math.max(0, index - CONTEXT)
    const nextEnd = Math.min(rows.length - 1, index + CONTEXT)
    if (nextStart <= end + 1) {
      end = Math.max(end, nextEnd)
    } else {
      ranges.push([start, end])
      start = nextStart
      end = nextEnd
    }
  }
  ranges.push([start, end])

  let output = header
  for (const [from, to] of ranges) {
    let aStart = 0
    let aCount = 0
    let bStart = 0
    let bCount = 0
    for (let index = from; index <= to; index += 1) {
      const row = rows[index]
      if (row.a) {
        if (aCount === 0) aStart = row.a.number
        aCount += 1
      }
      if (row.b) {
        if (bCount === 0) bStart = row.b.number
        bCount += 1
      }
    }
    output += `@@ -${aStart},${aCount} +${bStart},${bCount} @@\n`
    for (let index = from; index <= to; index += 1) {
      const row = rows[index]
      if (row.kind === 'equal') {
        output += ` ${row.a?.text ?? ''}\n`
      } else if (row.kind === 'change') {
        output += `-${row.a?.text ?? ''}\n+${row.b?.text ?? ''}\n`
      } else if (row.kind === 'remove') {
        output += `-${row.a?.text ?? ''}\n`
      } else {
        output += `+${row.b?.text ?? ''}\n`
      }
    }
  }
  return output
}

export function urlDiffTable(
  result: UrlDiffResult,
  aLabel: string,
  bLabel: string,
): string {
  const clean = (value: string) => value.replace(/\t/g, '\\t')
  const lines = [`部分\t参数\tA (${aLabel})\tB (${bLabel})`]
  for (const row of result.rows) {
    if (row.kind === 'equal') continue
    lines.push(
      [clean(row.section), clean(row.name), clean(row.a), clean(row.b)].join('\t'),
    )
  }
  return lines.join('\n')
}
