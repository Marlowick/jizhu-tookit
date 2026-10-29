# jizhu · 机杼工具箱

[**English**](README.md) · [简体中文](README.zh-CN.md)

> A local-first, keyboard-first data workbench for developers.

No account, no telemetry, no uploads. Everything runs on your machine.

> **Public version 0.1.0 · Tiling workspace · source-only**
> macOS-first. The app is a dark tiling workspace with plain/JSON editors and tool panels.

## Source-only release

This repository is **source-only**:

- No `.app`, `.dmg`, notarized binary, or auto-updater is published.
- The locally built debug `.app` is for development only; it is unsigned and not notarized.
- A future binary release still needs Developer ID signing, notarization, checksums, SBOM and updater signing.

## Tiling workspace

- One tab is a **numbered workspace**, not a single tool page.
- A workspace is a plain or JSON editor with up to **three tiled panels**.
- Panels open from the command palette and auto-split 1 / 2 / 3 columns.
- `⌘⇧F` maximizes the focused panel; `Esc` closes it and reflows the others.
- `Ctrl+Alt+←/→` moves panel focus; `Alt+1..4` switches workspaces.
- The interface is **dark-only**.

## Features

- **Editor**
  - Plain text and JSON modes; switching to JSON opens the synchronized tree by default (hide/show supported).
  - Tree min width is 150px; JSON indent is configurable, default 2 spaces.
  - CodeMirror 6: line numbers, search, undo/redo, selection, large-document handling.
  - `⌘F` find/replace; `Ctrl+Z` or the command palette undoes.
  - UTF-8 and LF displayed in the status bar; word wrap is a setting.
  - No file open/save in this milestone — content is typed/pasted and restored locally.
- **Command palette** (`⌘⇧P`)
  - Open tool panels, switch JSON/plain, undo, format/minify, copy, open settings.
  - Commands carry descriptions and are grouped.
- **Input sources**
  - Every tool panel has a source selector: selected text, current workspace tab, or manual input.
  - Opening a tool snapshots the editor selection when present; otherwise it defaults to the current tab.
- **Panels**
  - jq query, Diff, QR, Pipeline, URL inspector, Time, Regex, Encode/decode.
  - Diff supports text / JSON structure / URL structure; JSON indent defaults to 2 spaces.
  - URL inspector keeps key/value fields equal width and recursively displays URL-valued query parameters up to 3 levels.
  - Pipeline keeps jq, codec, regex and count steps; text-only workflow import/export.
  - QR supports copy; file export is intentionally not exposed in this milestone.
- **Settings**: dark theme fixed, editor font size, word wrap, JSON indent, language, shortcuts, about.
- **Security**: strict CSP, `withGlobalTauri: false`, no fs/shell/http plugins, jq/regex sandboxed in worker subprocesses.
- **Session restore**: workspace tabs, documents, panel layout and tool state persist locally.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘⇧P` | Command palette |
| `⌘F` | Find / replace in editor |
| `Ctrl+Z` / `⌘Z` | Undo |
| `⌘⇧F` | Maximize / restore focused panel |
| `Esc` | Close focused panel / palette / dialog |
| `Ctrl+Alt+←/→` | Move panel focus |
| `Alt+1..4` | Switch workspace |

## Requirements

- macOS 13+
- Xcode Command Line Tools
- Rust 1.93.1 (see `rust-toolchain.toml`)
- Node.js >= 22.12 and npm

## Run from source

```bash
npm install
npm run tauri dev
```

Build a local debug app (unsigned, for development only):

```bash
npm run tauri build -- --debug --bundles app
open target/debug/bundle/macos/jizhu.app
```

## Checks

```bash
npm run typecheck
npm run build
node scripts/tiling-ui-check.mjs   # shell, panels, tree, sources
node scripts/feature-check.mjs     # all tool panels with mocked IPC
```

Older `scripts/*-ui-check.mjs` target the previous single-tool layout and are kept for reference only.

## Project layout

```text
src/                 React 19 + TypeScript UI
src/components/workspace/  Tiling shell, panels, plain editor
crates/jizhu-core/   Pure Rust: JSON, jq/jaq, diff, regex
src-tauri/           Tauri shell, commands, workers, capabilities
scripts/             UI and dependency checks
```

## Privacy and security

- No network requests in the application; no telemetry.
- No filesystem access from the webview; no fs/shell/http plugins.
- jq and regex run in limited worker subprocesses.
- Report vulnerabilities privately via [SECURITY.md](SECURITY.md), not a public issue.

## Known limitations

- Tiling panels are equal-width and capped at three; no nested splits.
- No file open/save; use paste and local session restore.
- Regex replacement remains available inside the regex panel.
- The older UI checks are not part of CI.

## License

[MIT](LICENSE)
