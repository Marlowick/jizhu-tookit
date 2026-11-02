# Releasing (source-only)

This repository currently publishes source, not binaries.

## Checklist

- [ ] `npm ci && npm run typecheck && npm run build`
- [ ] `cargo fmt --all --check`
- [ ] `cargo clippy --all-targets --all-features -- -D warnings`
- [ ] `cargo test -p jizhu-core`
- [ ] `cargo test -p jizhu`
- [ ] `node scripts/tiling-ui-check.mjs`
- [ ] `node scripts/feature-check.mjs`
- [ ] `node scripts/calc-ui-check.mjs`
- [ ] `gitleaks` / `git-secrets` clean
- [ ] CI green on `main`
- [ ] version is `1.0.0` in package.json, Cargo.toml, tauri.conf.json and About
- [ ] README English/Chinese and screenshots current
- [ ] tag `v1.0.0`
- [ ] GitHub Release notes link CHANGELOG; attach **no unsigned binary**

## Future binary release gates

Signing, notarization, stapling, SHA256SUMS, SBOM, updater signing, Gatekeeper verification and dependency advisory automation are still required. Internal audit notes are intentionally not published in the source-only repository.
