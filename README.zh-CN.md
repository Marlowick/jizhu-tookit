# 机杼工具箱 · jizhu

[English](README.md) · **简体中文**

> 把开发日常里的数据，织成你要的样子。

本地优先、键盘优先的开发者数据加工台。不联网、不登录、不上传，所有处理都在本机完成。

> **公开版本：0.1.0 · Tiling 工作区 · source-only（不提供签名二进制）**
> macOS 优先。深色平铺工作区 + plain/JSON 编辑器 + 工具面板。

## 发布形态

当前 GitHub 仓库是 **source-only**：

- 只发布源代码，不附带 `.app`、`.dmg` 或自动更新；
- 本机 debug `.app` 仅用于开发验证，未签名、未公证；
- macOS 用户从源码构建时可能遇到 Gatekeeper 提示。

正式二进制发布前还需要：Developer ID 签名、公证/stapling、SHA256、SBOM、更新器签名。

## Tiling 工作区

- 一个标签是一个**编号工作区**，不再是单个工具页。
- 工作区里是 plain 或 JSON 编辑器，最多同时打开 **3 个平铺面板**。
- 面板通过命令面板打开，自动按 1 / 2 / 3 列等分。
- `⌘⇧F` 最大化当前面板；`Esc` 关闭当前面板，其余自动回填。
- `Ctrl+Alt+←/→` 切换面板焦点；`Alt+1..4` 切换工作区。
- 界面固定为**深色**。

## 已实现

- **编辑器**
  - plain / JSON 两种模式；切换 JSON 默认打开同步树，可隐藏/恢复。
  - 树最小宽度 150px；JSON 缩进可配置，默认 2 空格。
  - CodeMirror 6：行号、搜索、撤销/重做、选区、大文档降级。
  - `⌘F` 查找/替换；`Ctrl+Z` 或命令面板撤销。
  - 状态栏显示 UTF-8 与 LF；自动换行在设置中开关。
  - 本阶段不支持文件打开/保存；内容通过输入/粘贴和本地会话恢复。
- **命令面板**（`⌘⇧P`）
  - 打开工具面板、切换 JSON/plain、撤销、格式化/压缩、复制、打开设置。
  - 命令带描述并按组排列。
- **输入源**
  - 每个工具面板都有输入源选择：选中文本、当前标签、手动输入。
  - 打开工具时若有编辑器选区，默认用选区；否则默认用当前标签全文。
- **面板**
  - jq 查询、Diff、二维码、Pipeline、URL 解析、时间、正则、编码/解码。
  - Diff 支持文本 / JSON 结构 / URL 结构；JSON 缩进默认 2 空格。
  - URL 解析保持参数 key/value 等宽，并递归展示值为 URL 的查询参数，最多 3 层。
  - Pipeline 保留 jq、编码、正则、计数步骤；工作流导入导出为文本。
  - 二维码支持复制；本阶段不暴露文件导出。
- **设置**：固定深色、编辑器字号、自动换行、JSON 缩进、语言、快捷键、关于。
- **安全基线**：严格 CSP、`withGlobalTauri: false`、不启用 fs/shell/http 插件；jq / 正则走独立 worker 沙箱。
- **会话恢复**：工作区标签、文档、面板布局和工具状态写入本地。

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `⌘⇧P` | 命令面板 |
| `⌘F` | 编辑器查找 / 替换 |
| `Ctrl+Z` / `⌘Z` | 撤销 |
| `⌘⇧F` | 最大化 / 还原当前面板 |
| `Esc` | 关闭当前面板 / 面板 / 对话框 |
| `Ctrl+Alt+←/→` | 切换面板焦点 |
| `Alt+1..4` | 切换工作区 |

## 快速开始

### 依赖

- macOS 13+，Xcode Command Line Tools
- Rust 1.93.1（见 `rust-toolchain.toml`）
- Node.js >= 22.12 + npm

### 运行

```bash
npm install
npm run tauri dev
```

构建本地 debug 应用（未签名，仅开发验证）：

```bash
npm run tauri build -- --debug --bundles app
open target/debug/bundle/macos/jizhu.app
```

## 检查

```bash
npm run typecheck
npm run build
node scripts/tiling-ui-check.mjs   # 外壳、面板、树、输入源
node scripts/feature-check.mjs     # 全工具面板（mock IPC）
```

旧的 `scripts/*-ui-check.mjs` 面向上一版单工具布局，仅保留参考。

## 项目结构

```text
src/                 React 19 + TypeScript UI
src/components/workspace/  Tiling 外壳、面板、plain 编辑器
crates/jizhu-core/   纯 Rust：JSON、jq/jaq、diff、regex
src-tauri/           Tauri 外壳、命令、worker、capabilities
scripts/             UI 与依赖检查
```

## 隐私

- 应用不发网络请求、无遥测。
- 本阶段不从 webview 访问文件系统；不启用 fs/shell/http 插件。
- jq / 正则运行在受限 worker 子进程中。
- 漏洞请通过 [SECURITY.md](SECURITY.md) 私下报告，不要开公开 issue。

## 已知限制

- 面板等宽，最多 3 个，不支持嵌套分栏。
- 不支持文件打开/保存；使用粘贴和本地会话恢复。
- 正则替换仍在正则面板内提供。
- 旧 UI 检查脚本不纳入 CI。

## 许可证

[MIT](LICENSE)
