# Security Policy

## Supported versions

This repository currently publishes **source code only** for `jizhu 0.1.x` on macOS. There is no signed or notarized binary release yet.

## Reporting a vulnerability

Please **do not open a public issue**.

Use GitHub’s **private vulnerability reporting**:

1. Open the repository’s **Security** tab.
2. Choose **Report a vulnerability**.
3. Include affected version/commit, macOS version, reproduction steps, impact, and any suggested fix.

We aim to acknowledge reports within **72 hours** and provide a remediation plan within **7 days**. This is a best-effort, volunteer-run project.

## Scope

In scope:

- Tauri shell, capabilities, CSP, command boundary
- JSON/tree/editor behavior and paste/session handling
- jq/jaq and regex worker sandboxing, timeouts, output caps
- pipeline execution and workflow import validation
- QR/export paths and clipboard behavior
- build, dependency and release configuration

Out of scope:

- vulnerabilities in third-party browsers/WebKit themselves
- issues requiring a already-compromised local account
- denial of service from intentionally enormous inputs beyond documented limits

## Security model

- No telemetry, no account, no network requests in the application.
- No filesystem access from the webview; no fs/shell/http plugins.
- jq and regex run in limited worker subprocesses.
- Tauri capabilities are minimal (`core:default` + window drag).
- See the source, tests and release notes for implementation details.

## Safe harbor

Good-faith research that follows this policy will not be pursued or reported. Do not access other users’ data, degrade services, or publish details before a fix is available.
