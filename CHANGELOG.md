# Changelog

## 1.0.0 — Tiling workspace · 2026-11-05

### Added

- Numbered tiling workspaces with plain/JSON/Calc editor modes.
- Diff is the only normal tiled panel; jq, QR, Pipeline, URL, Time, Regex, Codec, Data format and cURL use singleton side splits.
- QR / URL / Encode-decode / Time / jq / Regex / Pipeline / Data format / cURL open as editor-left/tool-right splits; they read the editor content directly and have no separate input/source field.
- jq now always uses the built-in jaq worker; system `jq` binary detection and invocation were removed.
- Regex now uses Python-style syntax/help, virtualized match and aggregate lists, editor-wide match highlighting with current-match emphasis, and an on-demand replacement tab.
- Regex aggregate rows show result/count/percentage and support sorting by result or count in both directions.
- Regex match lists and aggregate lists use virtual scrolling; the side divider redraws without persisting on every pointer move.
- Status bar is interactive: language menu (PLAIN/JSON/CALC), editor search, and command palette.
- JSON formatting inlines objects whose spaced single-line dump is under 79 characters and expands larger objects one key per line.
- Pipeline workflow export now contains only version/name/steps and never editor input.
- Shortcuts: added ⌘1–⌘9 tab switching; ⌘W asks before closing the current tool/panel or a tab with content, and the confirmation names the target. Removed ⌘, ⌘⇧F, Ctrl+Alt+←/→, Alt+1–4 and the global Esc tool-close shortcut.
- Command palette commands now expose English aliases; mode changes use a Plain/JSON/Calc picker.
- Interface zoom: ⌘= / ⌘- in 10% steps, ⌘0 resets to 100%, persisted in settings.
- Tabs now share the 40px top window strip; the separate title row was removed.
- Added a neutral Light theme as a selectable theme.
- Blank-editor paste now auto-detects JSON without requiring a prior clear.
- JSON editor performance: debounced local persistence, deferred analysis/tree updates, and cheaper external-text synchronization.
- Command palette now opens as a Helix-style single-key quick list with no focused input (IME-safe); press `/` for the searchable palette.
- Production bundle is code-split: tools/panels load lazily, with separate React, CodeMirror, data-format, QR and icon chunks; the >500 kB warning is gone.
- Sublime-inspired flat UI: square tabs and controls, 1px separators, flat command palette/modals, compact 32px tool headers, active-line/tree accents, and thinner scrollbars.
- Fixed low-contrast text selection in light themes by forcing the CodeMirror selection layer to the active `--cm-selection` token.
- Added Ghostty Dark, Solarized Light and Solarized Dark themes.
- JSON editor now has a fold gutter, fold placeholders and CodeMirror fold keybindings.
- Clearing a document and pasting JSON auto-switches to JSON; pasting non-JSON switches to Plain.
- Calc adds `datetime(timestamp)` / `timestamp(timestamp)` readable local-time results.
- Added YAML / TOML ↔ JSON data conversion.
- Added cURL request tool (system curl, argument arrays, explicit send).
- Added cURL response diff mode with original command, sorted response headers, and JSON-formatted body.
- UI dark theme now uses Ghostty's default dark palette with Tomorrow Night ANSI colors and matching syntax highlighting.
- Pipeline is now a side split: left editor input, numbered step rows on top, inline step config, and results below.
- Added MVP Calc editor mode: debounced arithmetic that keeps existing answers stable while typing, with precedence/parentheses, inline per-line results, variable substitution (`2 * 8 = 16`), bare-variable values, built-in math functions/constants, a Calc examples card, and basic inline errors.
- The QR split divider is draggable (28–72%) and double-click resets it to the default ratio.
- QR preview has no card background and scales to 75% of the available pane size.
- Command palette `⌘⇧P` with panel, editor and settings commands.
- Only Diff keeps a per-panel input source selector: selection, current tab, or manual input. Side tools read the left editor directly.
- Opening Diff captures the current editor selection as its default source; otherwise the current tab is used.
- `Ctrl+Z` / palette undo, `⌘F` find/replace.
- Word wrap is enabled by default; the command palette can toggle it.
- Dark-only workspace; UTF-8 / LF status.
- JSON mode opens the tree by default, with a 150px minimum tree width and hide/show control.
- JSON indent defaults to 2 spaces everywhere: editor, formatting, Diff and JSON previews.
- URL query key/value fields are equal width.
- URL-valued query parameters are recursively parsed and displayed up to three levels.

### Changed

- Brand remains jizhu / 机杼工具箱; no DevBox rename.
- File open/save is intentionally disabled in this milestone.
- Documentation and UI checks updated for the Tiling layout.
- Calc results now converge to 10 significant digits (`10 / 3` → `3.333333333` instead of a 12-digit tail).
- jq result count now reflects output JSON values, not pretty-printed lines.
- Diff counters use distinct units: the view bar counts difference groups (组), the footer counts changed lines (行).
- Closing a tool/panel now asks first and names the target; tool state stays on the tab and is restored on reopen. Empty tabs close directly.

### Removed

- Welcome tool grid, tool-per-tab navigation and old shortcuts (`⌘K`, `⌘T`, etc.).
- Light/system theme switch.
- `⌘⇧F` maximize/restore and `Esc` tool-close behavior.
