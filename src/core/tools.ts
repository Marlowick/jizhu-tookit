import type { TabTool } from './types'

export const TOOL_LABEL: Record<TabTool, string> = {
  welcome: '欢迎',
  json: 'JSON',
  jq: 'jq 查询',
  diff: 'Diff 对比',
  url: 'URL 解析',
  time: '时间转换',
  codec: '编码 / 解码',
  regex: '正则匹配',
  qr: '二维码',
  pipeline: '管道处理',
  data: '格式转换',
  curl: 'cURL 请求',
  mermaid: 'Mermaid 预览',
}
