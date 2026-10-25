import type { LucideIcon } from 'lucide-react'
import { Asterisk, Binary, Braces, Clock, GitCompare, Link, QrCode, Workflow, Zap } from 'lucide-react'
import type { TabTool, ToolId } from './types'

export interface ToolMeta {
  id: ToolId
  title: string
  desc: string
  icon: LucideIcon
  ready: boolean
}

export const TOOLS: ToolMeta[] = [
  {
    id: 'json',
    title: 'JSON 编辑器',
    desc: '树形预览 + 文本编辑，⌘K 调起命令面板',
    icon: Braces,
    ready: true,
  },
  {
    id: 'jq',
    title: 'jq 查询',
    desc: '手输 JSONL，运行 jq 表达式',
    icon: Zap,
    ready: true,
  },
  {
    id: 'regex',
    title: '正则匹配',
    desc: '实时高亮匹配结果，支持分组与聚合',
    icon: Asterisk,
    ready: true,
  },
  {
    id: 'qr',
    title: '二维码生成',
    desc: '输入文本即时生成，支持导出 PNG / SVG',
    icon: QrCode,
    ready: true,
  },
  {
    id: 'diff',
    title: 'Diff 对比',
    desc: '双路对比，支持 JSON 结构化与原文模式',
    icon: GitCompare,
    ready: true,
  },
  {
    id: 'url',
    title: 'URL 解析',
    desc: '拆解 URL 结构，参数可编辑重组',
    icon: Link,
    ready: true,
  },
  {
    id: 'time',
    title: '时间转换',
    desc: '时间戳互转，秒 / 毫秒自动识别',
    icon: Clock,
    ready: true,
  },
  {
    id: 'codec',
    title: '编码 / 解码',
    desc: 'Base64 / URL / HTML 等协议互转',
    icon: Binary,
    ready: true,
  },
  {
    id: 'pipeline',
    title: '管道处理',
    desc: '串联 jq、解码、正则等处理步骤',
    icon: Workflow,
    ready: true,
  },
]

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
}

export function toolMeta(id: ToolId): ToolMeta {
  return TOOLS.find((tool) => tool.id === id) ?? TOOLS[0]
}
