# Changelog

## 0.1.0 — 2026-10-25

Initial public source release. macOS-first, local-only, no signed binary.

### Included

- Tauri 2 desktop shell with custom title bar, tabs, command palette and status bar.
- JSON tree editor (CodeMirror 6), virtualized tree, large-document degradation.
- Data processing panel with a default jq step plus codec/regex/count steps.
- Standalone jq tool with JSON/JSONL input and syntax reference.
- Text / JSON / URL Diff with virtualized rows and difference navigation.
- URL inspector, time converter, encode/decode, regex matcher/replacer.
- QR generator with zoom preview and PNG/SVG export.
- Two-row pipeline editor with draggable splitter, jq raw output, text workflow import/export.
- Light/dark/system themes and zh-CN/en-US shell.
- Local session restore, zero telemetry, minimal Tauri capabilities.

### Known limitations

- Source-only; no signed/notarized `.app` or auto-updater.
- macOS only.
- Tool-internal i18n is partial (Chinese-first).
- Some dark-theme corners may still have hard-coded light colors.
- Dependency advisory automation and SBOM are not part of this source release.
