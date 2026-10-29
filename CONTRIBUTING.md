# Contributing

Thanks for helping improve jizhu.

## Requirements

- macOS 13+
- Xcode Command Line Tools
- Rust 1.93.1 (`rustup` uses `rust-toolchain.toml`)
- Node.js >= 22.12 and npm

## Setup

```bash
npm install
npm run tauri dev
```

## Checks before a PR

```bash
npm run typecheck
npm run build
cargo fmt --all --check
cargo test -p jizhu-core
cargo test -p jizhu
```

UI checks require a running Vite server (`npm run dev`) and Chrome. Set `JIZHU_CHROME` if Chrome is not at the default macOS path:

```bash
JIZHU_CHROME="/path/to/Chrome" node scripts/tiling-ui-check.mjs
JIZHU_CHROME="/path/to/Chrome" node scripts/feature-check.mjs
```

`tiling-ui-check` covers the workspace shell, panels, tree, and input sources. `feature-check` covers all tool panels with a mocked Tauri IPC layer. The older single-tool scripts are kept for reference only.

## Repository rules

- Do not commit `ui/` design sources, PSDs, fonts, secrets, `.env` files, build artifacts, or `src-tauri/gen/`.
- Do not commit generated binaries or signed artifacts.
- Use a focused PR; include tests and screenshots for UI changes.
- Do not include credentials, tokens, private logs, or user data.
- Keep the app offline by default. Any network feature needs a security review and an explicit opt-in.

## Commit style

Prefer conventional, scoped messages:

```text
feat(pipeline): add draggable splitter
fix(regex): highlight every aggregate occurrence
docs(security): update capabilities
```

## License

Contributions are accepted under the MIT License.
