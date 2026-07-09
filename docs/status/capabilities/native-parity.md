# Native Parity Status

Bevy is adapter-private and consumes emitted IR bundles. Native support is
claimed only when web/native semantics are both proved.

Current support:

- Native proof harness readiness reports, desktop playtests, screenshots,
  frame samples, and conformance fixtures.
- The 2026-07-07 native P0 closure proof runs the structured-source starter
  through `tn playtest --target desktop` with native screenshots. Raw evidence:
  `runtime-bevy/artifacts/native-playtest-p0/structured-source-starter/summary.json`
  (`TN_PLAYTEST_OK`, `KeyD`, movement distance `1.200024`) plus
  `before.png`, `after.png`, `native-frame-samples.json`, and `manifest.json`
  in the same directory.
- Closed parity rows are protected by focused gates; remaining gaps stay in
  runtime/proof-loop PRDs.
- UI rows with only native metadata components, trace observations, structural
  conformance, or diagnostics are not native promotions. Current UI promotion
  wording is bounded in [ui.md](ui.md) and
  [bevy-feature-parity.md](../../bevy-feature-parity.md).

Promotion policy:

- Native parity is under a parity freeze. Do not promote new Bevy/native
  behavior only because the backlog has a matching unchecked row.
- A new native promotion needs a shipped-game need, a web proof, a native proof
  harness or desktop playtest artifact, and a focused gate that can fail in CI.
- Desktop-web packaging is the preferred practical fallback when the goal is
  demo/prototype distribution with exact Three.js rendering. The current path
  decision is [native-path.md](../../runtime/native-path.md).

Verification:

- `pnpm verify:conformance`
- `pnpm verify:parity:smoke`
- `pnpm verify:webview-package`
- `node packages/cli/dist/index.js playtest --project templates/structured-source-starter --target desktop --entity player --press KeyD --frames 30 --expect-moved --native-screenshots --out ../../runtime-bevy/artifacts/native-playtest-p0/structured-source-starter --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
