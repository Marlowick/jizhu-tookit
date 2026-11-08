# Security Policy

## Supported versions

This repository currently publishes **source code only** for `jizhu 1.1.x` on macOS. There is no signed or notarized binary release yet.

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
- jaq and regex worker sandboxing, timeouts, output caps
- pipeline execution and workflow import validation
- QR/export paths and clipboard behavior
- build, dependency and release configuration

Out of scope:

- vulnerabilities in third-party browsers/WebKit themselves
- issues requiring a already-compromised local account
- denial of service from intentionally enormous inputs beyond documented limits

## Security model

- No telemetry, no account. The application does not initiate network requests on its own; only explicit cURL request/diff actions contact their target URLs.
- No filesystem access from the webview; no fs/shell/http plugins. cURL uses a fixed system binary with argument arrays, not a shell.
- jaq and regex run in limited worker subprocesses; jq no longer invokes a system binary.
- Tauri capabilities are minimal (`core:default` + window drag).
- `freezePrototype` remains `false`: enabling it breaks Mermaid because the renderer assigns to `Object.prototype` (`Cannot assign to read only property 'valueOf'`). Mermaid is instead constrained by `securityLevel: "strict"`, `htmlLabels: false`, SVG script/event sanitization, and a CSP with no remote scripts or connections. Revisit if Mermaid rendering is isolated in a separate realm.
- Remote font imports were removed; the UI uses local system fonts only.
- See the source, tests and release notes for implementation details.

## Safe harbor

Good-faith research that follows this policy will not be pursued or reported. Do not access other users’ data, degrade services, or publish details before a fix is available.
