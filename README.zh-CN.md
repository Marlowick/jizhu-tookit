# 机杼工具箱 · jizhu

[English](README.md) · **简体中文**

> 把开发日常里的数据，织成你要的样子。

本地优先、键盘优先的开发者数据加工台。不联网、不登录、不上传，所有处理都在本机完成。

> **公开版本：0.1.0 · 内部里程碑 M6 · source-only（不提供签名二进制）**
> macOS 优先。外壳、标签页、命令面板与 9 个工具均已可用：JSON、jq、Diff、URL、时间、编解码、正则、二维码、管道。

## 发布形态

当前 GitHub 仓库是 **source-only**：

- 只发布源代码，不附带 `.app`、`.dmg` 或自动更新；
- 本机 debug `.app` 仅用于开发验证，未签名、未公证；
- macOS 用户从源码构建时可能遇到 Gatekeeper 提示。

正式二进制发布前还需要：Developer ID 签名、公证/stapling、SHA256、SBOM、更新器签名。

## 已实现

- **窗口外壳**：自定义标题栏（macOS Overlay + 红绿灯）、标签栏、工具头、24px 状态栏，尺寸按 UI 稿还原。
- **标签即文档**：欢迎页固定标签；点「+」先选择工具再创建，不再默认 JSON；标签过多自动压缩宽度；`⇧⌘W` 关闭所有标签。
- **命令面板**：`⌘K` 搜索命令，`↑↓` 选择且自动滚动到可视区、`↵` 执行、`esc` 关闭；动作和工具按作用域分组。
- **JSON 编辑器**
  - 左侧树形预览（展开/折叠、节点统计、类型着色、点击选中）
  - 右侧 CodeMirror 6 编辑器（行号、折叠、撤销栈、GitHub 风格高亮）
  - `⌘F` 打开编辑器内查找/替换面板（区分大小写、正则、全词）
  - 新建 JSON 文档自动命名 `Untitled-1.json`、`Untitled-2.json`，不再使用 config-x
  - 校验 / 格式化 / 压缩 / 排序键（Rust core 实现）
  - 语法错误时保留上一次有效解析，错误行高亮，状态栏显示行号
  - **编辑器 ↔ 树同步**：光标移动高亮对应节点并自动展开祖先；点击树节点把光标定位到对应位置
  - **树节点右键**：复制 jq 路径、JSON Pointer、键名，或在编辑器中定位
  - **大文件友好**：树使用虚拟列表（只渲染视口行）；超过 100 万字符降频并把树限制在 2.5 万节点；超过 500 万字符暂停实时分析，可手动生成快照
  - 导入 / 导出文件（原生对话框，Rust 侧完成读写）
  - 19 位大整数保真（`serde_json/arbitrary_precision`）
- **数据处理面板（原 jq 面板）**
  - `⌘J` / 工具头按钮打开；固定作用于当前 Tab 的文档，无需选择源
  - 面板高度、左右分栏宽度可拖拽调整（双击复位），按 Tab 记忆
  - 系统 jq 优先、内置 jaq 兜底；面板显示实际引擎与版本，可手动切换
  - 结果美化、复制、单值结果替换文档
  - 子进程沙箱：环境清空、`-L` 空模块目录、6s 超时、64MB 输出上限、512MB 内存上限
- **独立 jq 工具**
  - 欢迎页 / 命令面板直接打开，不依赖 JSON 编辑器
  - 手动输入 **JSON 或 JSON Lines**，表达式、引擎、示例、清空、复制结果
  - 与 jq 面板共用同一套 Rust 执行边界（系统 jq / jaq worker）
  - jq 工具内置语法速查
- **Diff 对比**
  - 双栏对齐、行号、行内差异高亮、虚拟列表
  - 相同行折叠、⌥↑/⌥↓ 差异跳转、复制 unified patch（URL 模式复制差异表）
  - 覆盖式回填：二次确认后以 B 整体覆盖 A（不是逐 hunk 合并）
  - **JSON 结构化**：对象按 key 路径对齐、数组按 LCS 对齐、保留源文件行号；sortKeys / ensure_ascii / 缩进
  - **文本对比**：忽略空白、大小写、行尾差异
  - **URL 结构化**：协议/认证/域名/端口/路径/Fragment + 参数行；解码参数、参数排序、忽略默认端口；参数值里的 JSON 对象/数组会展开为嵌套行，可用「解析 JSON 参数」开关关闭
  - A/B 来源可以是任意打开的 Tab 或手动输入；命令面板打开时会自动把当前 Tab 作为 A
  - 限制：数组 LCS 对超过约 500×500 的数组退化为按索引配对；JSON 的“复制 patch”是结构差异展示，不保证可直接 `git apply`
- **URL 解析**
  - 结构条展示协议 / 域名 / 路径 / 查询 / Fragment
  - 参数行内编辑、增删、复制；编辑参数实时重组 URL
  - JSON 参数探测（对象/数组）、预览、编辑后写回参数
  - URL 解码 / 原始编码切换；未修改输入不做重建，避免零漂移
- **时间转换**
  - 时间戳 → 时间、时间 → 时间戳双向
  - 秒 / 毫秒自动识别，可手动指定；`现在` 一键填入
  - 本地时间、UTC ISO 8601、RFC 2822 三张卡片
  - 毫秒时间戳、相对时间、一年中的第几天/周，均可复制
- **编码 / 解码**
  - Base64 / URL / HTML 实体 / Unicode 转义 / Hex
  - 编码/解码方向、Base64 URL 安全（-_ 无填充）；中间箭头可点击交换
  - 输入即转换；中间箭头可交换；非法输入行内报错，不覆盖原文
- **正则匹配**
  - `fancy-regex` 在独立 worker 中执行，300ms 硬超时，ReDoS 自动终止
  - **不再自动匹配**：编辑文本/表达式后按 `⌘F` 手动触发搜索
  - g / i / m 选项、原文高亮、原文/聚合两种结果视图；同类匹配可全部高亮
  - 分组捕获展示、点击结果在原文定位、复制匹配；内置语法速查
  - 替换预览跟随浅色/深色主题
  - 替换预览：`$1–$9` / `$&` / `$$` 模板，可复制结果或应用到原文
  - 4MB 输入、1 万条匹配上限；worker 带 CPU/内存/输出限制
- **二维码生成**
  - 文本实时生成二维码，纠错级别 L/M/Q/H，尺寸 240/320/400
  - 本地 Canvas 渲染，内容不上传；2953 字节容量提示
  - 导出 PNG / SVG（原生文件对话框），复制图片/内容；支持 720px 放大预览
- **管道处理**
  - 4 类步骤：jq 提取、编码/解码、正则匹配、计数排序
  - 串行执行；失败即停、后续步骤标记跳过；保留最后成功步骤快照
  - 输入区独占第一行；第二行左侧为上下步骤编辑区、右侧为结果区
  - 支持拖拽/上下移动、删除；点击卡片打开配置面板
  - jq 步骤可输出原始字符串（-r），避免 Base64 步骤收到 JSON 引号
  - 输入 4MB、最多 20 步；工作流导入/导出使用文本 JSON，不读写本地文件
  - 左侧步骤区/右侧结果区支持拖动分隔条调宽；顶部不再显示工作流文件名
  - 失败提示带行号与修复建议
  - jq / 正则步骤仍走各自沙箱，编解码与计数在本地
  - 数据处理面板可直接串联 jq 与后续步骤，不再需要结果区「后续处理」按钮
- **设置**
  - `⌘,` / 状态栏齿轮打开；通用 / 编辑器 / 快捷键 / 关于
  - 浅色 / 深色 / 跟随系统主题；深色覆盖外壳、编辑器、设置与结果区
  - 编辑器字号、自动换行、JSON 格式化缩进即时生效并本地持久化
  - 简体中文 / English 界面；当前覆盖外壳、欢迎、设置、状态栏与命令面板；工具内部待迁移
  - 快捷键总览；零遥测与应用数据说明
- **会话恢复**：标签、文档内容、分栏比例写入本地会话，重启后恢复。
- **安全基线**：严格 CSP、`withGlobalTauri: false`、不启用 fs/shell 插件、文件读写走自有命令。

## 快速开始

### 依赖

- macOS 13+，Xcode Command Line Tools
- Rust stable（`rustup` 安装）
- Node.js >= 22.12 + npm

### 运行

```bash
npm install
npm run tauri dev
```

首次运行会下载 Rust 依赖并编译 Tauri，约 3–5 分钟（视网络）。

打包本地 `.app`（未签名，仅供本机验证）：

```bash
npm run tauri build -- --debug --bundles app
open target/debug/bundle/macos/jizhu.app
```

### 只跑前端（浏览器预览）

```bash
npm run dev
```

浏览器模式下 IPC 会回退到本地 JS 实现（仅用于预览，不能替代桌面端）。

### 检查

```bash
npm run typecheck                 # TypeScript
npm run build                     # 前端生产构建
cargo test -p jizhu-core          # Rust 核心单测（52 个）
cargo test -p jizhu               # Tauri 侧单元 + jq/regex worker（9 + 4 + 3 个）
node scripts/mvp-check.mjs        # UI 交互检查，需先 npm run dev
node scripts/jq-ui-check.mjs      # 数据处理面板 / 步骤 / 语法（mock IPC）
node scripts/jq-tool-check.mjs    # 独立 jq 工具 + JSON Lines（mock IPC）
node scripts/diff-ui-check.mjs    # Diff 三种模式 + 虚拟列表（mock IPC）
node scripts/m4-ui-check.mjs      # URL / 时间 / 编解码
node scripts/regex-ui-check.mjs   # 正则匹配 + 高亮/聚合（mock IPC）
node scripts/qr-ui-check.mjs      # 二维码预览 / 级别 / 容量
node scripts/pipeline-ui-check.mjs # 管道 4 步 / 失败跳过 / 快照
node scripts/settings-ui-check.mjs # 设置持久化 / 字号 / 换行 / 缩进
node scripts/theme-ui-check.mjs    # 深色 / 跟随系统 / 持久化
node scripts/i18n-ui-check.mjs     # 中英切换 / 持久化
cargo run --release -p jizhu-core --example diff_bench  # 5k 行/项基准
```

`scripts/mvp-check.mjs` 使用本机 Chrome + `playwright-core`，覆盖：欢迎页、打开示例、命令面板、错误恢复、格式化、新建/关闭标签、会话恢复。

## 项目结构

```text
jizhu-toolkit/
├── src/                     # React 19 + TypeScript 前端
│   ├── components/          # 外壳、标签、状态栏、命令面板、JSON 树/编辑器
│   ├── core/                # 类型、IPC 封装、工具注册表、快捷键、浏览器回退
│   ├── store/               # zustand 状态与会话持久化
│   └── styles/              # 设计 token 与全局样式
├── crates/jizhu-core/       # 纯 Rust 逻辑：JSON 解析/格式化/树、jq、diff
├── src-tauri/               # Tauri 壳：窗口、菜单、对话框、剪贴板、命令
├── scripts/                 # UI 检查、依赖审计
└── deny.toml                # 供应链基线
```

## 隐私

- 零遥测、无网络请求；未内置自动更新。
- 文件读写只在用户通过原生对话框授权后进行。
- 会话存储在本地应用数据目录，可清除。

## 许可证

MIT。见 [LICENSE](LICENSE)。

---

机杼（jī zhù）：织机的核心部件。《木兰诗》"不闻机杼声"；"自出机杼"意为自成格局。
