# Distribution Status

Cross-platform distribution now has a durable, versioned contract and an
evidence-gated target registry.

Current support:

- `content/distribution.json` owns app identity, presentation paths,
  platform/runtime/format declarations, capabilities, channel metadata, and
  opaque signing credential references.
- Authoring operations update the app or one target without replacing sibling
  rows; compiler emission writes deterministic `distribution.ir.json` and the
  bundle manifest reference.
- Raw source is validated before normalization. Secret-shaped fields,
  unsupported signing providers, unsafe paths, symlink escapes, incompatible
  target profiles, and invalid matrix combinations fail with stable
  diagnostics.
- `tn package plan --matrix release|declared --json` derives rows, choices,
  lifecycle, host/tool/credential needs, and proof requirements from the owning
  registry without invoking platform SDKs.
- Web `static`, deterministic `zip`, and offline `pwa` artifacts are
  implemented with relative URLs, inventories, SHA-256 reports, local-path
  rejection, and real packaged-browser readiness/canvas proof.

The web, Linux x86-64 Bevy/webview, and Android x86-64/arm64 webview rows are
`implemented`, not promoted.
Linux arm64 remains unimplemented until an eligible host produces and launches
both artifact formats. The Linux webview AppImage proof starts with a clean
project-local tool cache and records the automated upstream `linuxdeploy`
`strip` compatibility repair in its package report.
Android webview now produces a registry-native x86-64 debug APK and a signed
arm64 AAB through the supported package command. Emulator install, launch,
first-frame, touch, Back, pause/resume, resize, safe-area, cold-relaunch
persistence, and local-asset evidence passes. Promotion remains partial because
audio interruption/resume and physical arm64 execution are unproved. Android
Bevy plus all Windows, macOS, and iOS rows remain
`planned`; no store-ready credential, cross-host, or physical-device support is
claimed yet.

Evidence:

- `tools/verify/artifacts/distribution/shared/registry/phase-1-checkpoint.json`
- `tools/verify/artifacts/distribution/shared/compiler/phase-2-checkpoint.json`
- `examples/chess/artifacts/distribution/web/`
- `examples/chess/artifacts/distribution/desktop-proof-report.json`
- `examples/chess/artifacts/distribution/linux/webview/tauri-appimage-auto-input.png`
- `examples/chess/artifacts/distribution/android/webview/phase-7-partial-proof-report.json`
- `packages/cli/src/distribution/web.test.ts`
- `docs/workflows/release-packaging.md`
