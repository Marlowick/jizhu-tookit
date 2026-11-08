# Releasing (source-only)

This repository publishes **source code**, not binaries. GitHub generates the
source archives when a tag is pushed, so a normal release needs no uploaded
`.app` or `.dmg`.

## Current state

- `v1.0.0` already points to the original 1.0.0 commit. **Do not move or reuse it.**
- The next release is prepared as **v1.1.0** (Mermaid preview, quick commands and
  the light UI refresh).
- The version must match in: `package.json`, `package-lock.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src/core/version.ts`.
  `Cargo.lock` is updated by `cargo check`.

## 1. Prepare

```bash
cd /Users/abraham/code/jizhu-tookit
git status
git diff --check
npm ci
npx tsc --noEmit
```

Clean up the uncommitted worktree before tagging. Never tag a dirty tree.

## 2. Verify

```bash
npm run build
cargo fmt --all --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test -p jizhu-core
cargo test -p jizhu

node scripts/tiling-ui-check.mjs
node scripts/feature-check.mjs
node scripts/calc-ui-check.mjs
node scripts/theme-ui-check.mjs
node scripts/settings-ui-check.mjs
node scripts/design-ui-check.mjs
```

Security and dependency gates:

```bash
npm audit --omit=dev
gitleaks dir . --config .gitleaks.toml --redact --no-banner
cargo-deny check all
```

If Cargo is pointed at the stale local proxy, run the build without it:

```bash
env -u CARGO_HTTP_PROXY -u HTTPS_PROXY -u HTTP_PROXY -u ALL_PROXY \
  npm run tauri build -- --bundles app
```

The local `.app` build is a verification artifact only; do not attach it to a
source-only release unless signing/notarization gates are completed.

## 3. Commit and tag

```bash
git add -A
git commit -m "release: v1.1.0"
git tag -a v1.1.0 -m "v1.1.0"
git push origin main
git push origin v1.1.0
```

Tags must be signed/annotated and must point to a clean `main` commit. Do not
rewrite or force-push the release tag.

## 4. Publish on GitHub

```bash
gh release create v1.1.0 \
  --title "v1.1.0 — Mermaid preview & quick commands" \
  --generate-notes
```

Notes should link `CHANGELOG.md` and call out:

- Mermaid local SVG preview, 28 examples and syntax highlighting
- ⌘K searchable palette / ⌘⇧P IME-safe quick command grid
- Light default UI and local-only fonts
- CSP, capability and secret-scan status

No unsigned binary is attached.

## Optional binary release (not current policy)

Only after signing, notarization, stapling, Gatekeeper verification, SBOM,
SHA256SUMS, updater signing and dependency-advisory automation are in place:

```bash
ditto -c -k --keepParent \
  target/release/bundle/macos/jizhu.app \
  jizhu-1.1.0-macos-arm64.zip
shasum -a 256 jizhu-1.1.0-macos-arm64.zip
```

Attach the zip **and** its checksum only after those gates pass.
