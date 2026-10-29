# Changelog

## Unreleased — Tiling workspace

### Added

- Numbered tiling workspaces with plain/JSON editor modes.
- Up to three equal-width tool panels: jq, Diff, QR, Pipeline, URL, Time, Regex, Codec.
- `⌘⇧F` maximize/restore focused panel; `Esc` close and reflow.
- Command palette `⌘⇧P` with panel, editor and settings commands.
- Per-panel input source selector: selection, current tab, or manual input.
- Opening a tool captures the current editor selection as its default source; otherwise the current tab is used.
- `Ctrl+Z` / palette undo, `⌘F` find/replace, wrap setting.
- Dark-only workspace; UTF-8 / LF status.
- JSON mode opens the tree by default, with a 150px minimum tree width and hide/show control.
- JSON indent defaults to 2 spaces everywhere: editor, formatting, Diff and JSON previews.
- URL query key/value fields are equal width.
- URL-valued query parameters are recursively parsed and displayed up to three levels.

### Changed

- Brand remains jizhu / 机杼工具箱; no DevBox rename.
- File open/save is intentionally disabled in this milestone.
- Documentation and UI checks updated for the Tiling layout.

### Removed

- Welcome tool grid, tool-per-tab navigation and old shortcuts (`⌘K`, `⌘T`, etc.).
- Light/system theme switch.

## 0.1.0

- Initial source-only release.
