import { useEffect } from 'react'
import { BookOpen, X } from 'lucide-react'

interface JqSyntaxHelpProps {
  onClose: () => void
}

export function JqSyntaxHelp({ onClose }: JqSyntaxHelpProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      className="syntax-help-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="syntax-help-dialog" role="dialog" aria-modal="true" aria-label="jq 语法速查">
        <header>
          <BookOpen size={15} strokeWidth={1.8} color="#2563eb" />
          <strong>jq 语法速查</strong>
          <span>系统 jq / 内置 jaq · 表达式在 worker 副本中执行</span>
          <button className="btn ghost" onClick={onClose} aria-label="关闭 jq 语法">
            <X size={14} strokeWidth={1.8} />
          </button>
        </header>
        <div className="syntax-help-scroll">
          <table className="syntax-table">
            <thead>
              <tr>
                <th>语法</th>
                <th>说明</th>
                <th>示例</th>
              </tr>
            </thead>
            <tbody>
              <tr className="syntax-section"><th colSpan={3}>基础取值</th></tr>
              <tr><td><code>.</code></td><td>当前输入</td><td><code>.</code></td></tr>
              <tr><td><code>.foo</code></td><td>对象字段</td><td><code>.users</code></td></tr>
              <tr><td><code>.[0]</code></td><td>数组下标</td><td><code>.users[0]</code></td></tr>
              <tr><td><code>.[]</code></td><td>展开数组/对象值流</td><td><code>.users[]</code></td></tr>
              <tr><td><code>?</code></td><td>忽略 null / 类型错误</td><td><code>.users[]?.name</code></td></tr>
              <tr className="syntax-section"><th colSpan={3}>筛选与函数</th></tr>
              <tr><td><code>select()</code></td><td>保留满足条件的值</td><td><code>select(.age &gt;= 18)</code></td></tr>
              <tr><td><code>map()</code></td><td>对每个元素求值</td><td><code>map(.name)</code></td></tr>
              <tr><td><code>map_values()</code></td><td>对对象值求值</td><td><code>map_values(tostring)</code></td></tr>
              <tr><td><code>sort_by()</code> / <code>group_by()</code></td><td>排序 / 分组</td><td><code>sort_by(.age)</code></td></tr>
              <tr><td><code>unique_by()</code> / <code>keys</code></td><td>去重 / 键列表</td><td><code>unique_by(.name)</code></td></tr>
              <tr><td><code>length</code> / <code>add</code></td><td>长度 / 求和</td><td><code>[.scores[]] | add</code></td></tr>
              <tr><td><code>to_entries</code> / <code>from_entries</code></td><td>对象 ↔ 键值数组</td><td><code>to_entries</code></td></tr>
              <tr><td><code>del()</code></td><td>删除字段</td><td><code>del(.password)</code></td></tr>
              <tr className="syntax-section"><th colSpan={3}>组合与运算</th></tr>
              <tr><td><code>|</code></td><td>管道：左边输出作为右边输入</td><td><code>.users[] | .name</code></td></tr>
              <tr><td><code>,</code></td><td>同一输入产生多个输出</td><td><code>.a, .b</code></td></tr>
              <tr><td><code>//</code></td><td>默认值（左侧 null/false 时取右）</td><td><code>.name // "匿名"</code></td></tr>
              <tr><td><code>if then else end</code></td><td>条件表达式</td><td><code>if .ok then 1 else 0 end</code></td></tr>
              <tr><td><code>as $x |</code></td><td>绑定变量</td><td><code>.user as $u | $u.name</code></td></tr>
              <tr><td><code>{'{a: .b}'}</code></td><td>构造对象</td><td><code>{'{name: .user, score: .score}'}</code></td></tr>
              <tr><td><code>[ ... ]</code></td><td>构造数组</td><td><code>[.users[].name]</code></td></tr>
              <tr><td><code>+ - * / %</code> / <code>==</code></td><td>算术 / 比较</td><td><code>.a + .b</code></td></tr>
              <tr className="syntax-section"><th colSpan={3}>字符串与编码</th></tr>
              <tr><td><code>"\\(...)"</code></td><td>字符串插值</td><td><code>"\\(.name): \\(.score)"</code></td></tr>
              <tr><td><code>@csv</code> / <code>@tsv</code></td><td>CSV / TSV 转义</td><td><code>[.a,.b] | @csv</code></td></tr>
              <tr><td><code>@base64</code> / <code>@uri</code></td><td>Base64 / URL 编码</td><td><code>.payload | @base64d</code></td></tr>
              <tr><td><code>tojson</code> / <code>fromjson</code></td><td>JSON 字符串互转</td><td><code>.data | fromjson</code></td></tr>
              <tr className="syntax-section"><th colSpan={3}>常用选项</th></tr>
              <tr><td><code>-r</code></td><td>字符串输出不带 JSON 引号</td><td>管道 jq 步骤可勾选</td></tr>
              <tr><td><code>-c</code></td><td>紧凑 JSON 输出</td><td>面板默认紧凑行</td></tr>
              <tr><td><code>-s</code></td><td>把全部输入合成数组</td><td><code>jq -s '.'</code></td></tr>
              <tr><td><code>--arg</code> / <code>--argjson</code></td><td>传入字符串 / JSON 变量</td><td><code>--arg name Ada</code></td></tr>
            </tbody>
          </table>
        </div>
        <footer>当前面板使用紧凑输出；需要原始字符串时在管道 jq 步骤勾选 -r。</footer>
      </div>
    </div>
  )
}
