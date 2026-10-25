# jizhu · 机杼工具箱

[**English**](README.md) · [简体中文](README.zh-CN.md)

> A local-first, keyboard-first data workbench for developers.

No account, no telemetry, no uploads. Everything runs on your machine.

> **Public version 0.1.0 · internal milestone M6 · source-only**
> macOS-first. Nine tools are available: JSON, jq, Diff, URL, Time, Codec, Regex, QR, Pipeline.

## Source-only release

This GitHub repository is **source-only**:

- No `.app`, `.dmg`, notarized binary, or auto-updater is published.
- The locally built debug `.app` is for development only; it is unsigned and not notarized.
- macOS users building from source may see Gatekeeper warnings.

A future binary release still needs Developer ID signing, notarization/stapling, SHA256 checksums, SBOM, updater signing, and dependency advisory automation.

## Features

- **Desktop shell**: custom title bar (macOS Overlay + native traffic lights), draggable title/tab-bar space, tabs, 24px status bar.
- **Tabs as documents**
  - `+` asks which tool to open instead of defaulting to JSON.
  - Tabs shrink to fit when there are many; no horizontal scrolling.
  - `⇧⌘W` / command palette closes all tabs.
  - New tool tabs and same-name documents get unique names.
- **Command palette**: `⌘K`, arrow-key navigation with automatic scroll into view, `↵` run, `esc` close.
- **JSON editor**
  - Tree preview + CodeMirror 6 text editor, cursor/tree sync, right-click jq path/JSON Pointer.
  - `⌘F` opens the editor find/replace panel (case, regexp, whole word).
  - New JSON documents are named `Untitled-1.json`, `Untitled-2.json`.
  - Validate / format / minify / sort keys; 19-digit integer fidelity.
  - Virtualized tree and large-document degradation.
  - Native import/export dialogs.
- **Data processing panel** (formerly jq panel)
  - Opens against the current document with **step 1 = jq**.
  - Add codec / regex / count steps, edit/delete them, run the whole chain.
  - System jq first, built-in jaq fallback; engine/version visible.
  - jq syntax cheat sheet; concise output; copy / single-result replace.
  - Sandboxed worker: cleared env, empty module path, 6s timeout, 64MB output limit, 512MB memory limit.
- **Standalone jq tool**
  - Manual JSON or JSON Lines input, engine selection, samples.
  - Same Rust execution boundary as the panel; built-in jq syntax cheat sheet.
- **Diff**
  - Text / JSON structure / URL structure.
  - Virtualized rows, inline highlighting, collapsed equal runs.
  - Prev/next difference arrows scroll to and flash the target row.
  - Independent tab names (`Diff 对比`, `Diff 对比 2`).
  - Manual input uses one 「应用」 action; dark mode covers the result area and collapsed rows.
- **URL inspector**
  - Protocol/host/path/query/fragment breakdown; edit, add, delete parameters.
  - Stable parameter input keys keep focus while typing.
  - JSON parameter detection, `JSON 编辑` → `应用`.
  - URL update indicator after edits.
- **Time converter**: timestamp ↔ local/UTC ISO/RFC 2822; seconds/milliseconds auto-detection.
- **Encode / decode**: Base64 (URL-safe), URL, HTML entities, Unicode escapes, Hex; clickable center swap arrow.
- **Regex**
  - `fancy-regex` worker, 300ms hard timeout, ReDoS/backtracking protection.
  - No automatic matching: edit inputs, then press `⌘F` to search manually.
  - g/i/m, source highlight, match list, aggregate view.
  - Clicking an aggregate result highlights all occurrences of that text.
  - Replacement preview with `$1–$9`, `$&`, `$$`.
  - Table-style syntax cheat sheet; dark replacement area.
- **QR code**
  - Runtime Canvas generation, L/M/Q/H, 240/320/400px, 2953-byte capacity check.
  - 720px zoom preview for dense codes; PNG/SVG export.
- **Pipeline**
  - Row 1: input. Row 2: vertical steps on the left, result on the right.
  - Draggable splitter between steps and result.
  - jq raw-string (`-r`) option, friendly line-aware errors.
  - Text-only workflow import/export (no local workflow files).
  - Sandboxed jq/regex; local codec/count.
- **Settings**
  - `⌘,`: general / editor / shortcuts / about.
  - Light / dark / system theme; font size, word wrap, JSON indent.
  - zh-CN / en-US shell, welcome, settings, status bar and command palette.
- **Session restore**: tabs, documents and tool state persist locally.

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

cargo test -p jizhu-core        # 52 tests
cargo test -p jizhu             # 9 + 4 worker + 3 regex worker

# UI checks: start `npm run dev` first
JIZHU_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node scripts/mvp-check.mjs
node scripts/jq-ui-check.mjs
node scripts/jq-tool-check.mjs
node scripts/diff-ui-check.mjs
node scripts/m4-ui-check.mjs
node scripts/regex-ui-check.mjs
node scripts/qr-ui-check.mjs
node scripts/pipeline-ui-check.mjs
node scripts/settings-ui-check.mjs
node scripts/theme-ui-check.mjs
node scripts/i18n-ui-check.mjs
node scripts/large-doc-check.mjs
```

CI runs typecheck/build, Rust tests, formatting and dependency checks; UI checks need Chrome and are documented above.

## Project layout

```text
src/                 React 19 + TypeScript UI
crates/jizhu-core/   Pure Rust: JSON, jq/jaq, diff, regex
src-tauri/           Tauri shell, commands, workers, capabilities
scripts/             UI and dependency checks
```

## Privacy and security

- No network requests in the application; no telemetry.
- File access is only through native open/save dialogs; no fs/shell/http plugins.
- Strict CSP, `withGlobalTauri: false`, minimal Tauri capabilities.
- jq and regex run in limited worker subprocesses.
- Report vulnerabilities privately via [SECURITY.md](SECURITY.md), not a public issue.

## Known limitations

- macOS only; no signed/notarized binary in this repository.
- Tool-internal i18n is still Chinese-first; shell/settings/status are bilingual.
- Some dark-theme corners may still use light hard-coded colors.
- URL parser uses the browser `URL` implementation; time zones are local/UTC only.
- JSON structural Diff 'patch' is a readable structure diff, not guaranteed `git apply` input.
- No automatic updater.

## License

MIT. See [LICENSE](LICENSE).

---

*机杼 (jī zhù)*: the core component of a loom. “自出机杼” means to develop one’s own style.
