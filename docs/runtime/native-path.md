# Native Path Decision

## Status

Accepted on 2026-07-07.

## Decision

Freeze new Bevy/native parity promotions until a shipped-game need requires
them. The default desktop path for near-term distribution is:

1. Keep authoring in TypeScript and structured source.
2. Emit the validated IR bundle.
3. Use web Three.js for exact current rendering behavior.
4. Package desktop demos with `tn package --runtime webview` when native Bevy
   parity is not required by the game.

The Bevy adapter remains supported for already-promoted portable behavior and
for explicit native proof work. New Bevy work must be justified by a shipped
game or release-blocking proof gap, not by checklist completion alone.

## Evidence

- Native parity status:
  [docs/status/capabilities/native-parity.md](../status/capabilities/native-parity.md).
- Desktop-web package contract:
  [docs/runtime/desktop-packaging.md](desktop-packaging.md).
- Webview package measurement gate:
  `pnpm verify:webview-package`.
- Raw report path:
  `tools/verify/artifacts/webview-package/verification-report.json`.

The webview package gate records the package command output, package report,
webview inspection file, package size, app size, archive size, launcher startup
time, startup checks, retained UI input metadata, settings metadata, and
save-slot metadata for the `ui-persistence-settings-facades` conformance
bundle.

## Consequences

- Agents should not open native runtime implementation work unless the request
  names a shipped-game need, a failing native proof, or a focused parity gate.
- Desktop-web packaging is a valid fallback for demos and prototypes, but it
  does not claim embedded Wry/Tauri behavior or signed installer support.
- Bevy remains adapter-private. Users still author SDK/structured-source content
  and scripts; they do not author Bevy/Rust gameplay.
- Future Bevy promotion PRDs must update the capability doc, `docs/STATUS.md`,
  parity evidence, and a focused gate before claiming support.
