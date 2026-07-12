# Native Parity Status

Bevy is adapter-private and consumes emitted IR bundles. Native support is
claimed only when web/native semantics are both proved.

Current support:

- Headless desktop playtests fail fast before winit startup with the structured
  warning `TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED` and
  `gate: "waived-headless"`. The CLI auto-selects this path when no display
  environment is available and also exposes `tn playtest --headless` for
  deterministic CI behavior. Bevy 0.14 offscreen screenshot rendering remains
  an explicit capability gap; this waiver is not native visual proof.
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
- Gameplay parity now has a bounded focused gate: `pnpm test:gameplay` runs
  the humanoid course forward-movement playtest against web and desktop targets
  and writes paired target summaries under
  `tools/verify/artifacts/gameplay-parity/`. The full
  `pnpm verify:gameplay-parity` profile additionally promotes humanoid
  ball-push behavior as a bounded full-profile gameplay row with timing samples
  and artifact links, while ramp, stairs, and hazard/resource mutation stay
  calibrating/quarantined. Native playtests write
  `runtime-observations.json` from proof-harness readiness samples; resource
  probes label runtime observation sidecars when present and source-manifest
  fallback otherwise, so source-backed probes do not promote broad native
  runtime resource parity.
- UI rows with only native metadata components, trace observations, structural
  conformance, or diagnostics are not native promotions. Current UI promotion
  wording is bounded in [ui.md](ui.md) and
  [bevy-feature-parity.md](../../bevy-feature-parity.md).
- Native UI gradients, shadows, atlas/nine-slice metadata, context menus,
  safe-area metadata, effect presets, and editable text-input semantics remain
  trace/metadata boundaries unless a focused native pixel or behavior gate is
  named.
- Native retained UI hygiene includes cached binding-target lookup and stable
  fallback-font diagnostics, but absolute-pixel DPI handling remains a
  documented unsupported boundary and does not promote native UI pixel parity.
- UI conformance evidence is categorized in `pnpm verify:conformance` as
  structural, behavioral, and visual/style proof. The current visual/style UI
  proof is an aggregate contact sheet, not a native pixel-rendering promotion.

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
- `pnpm test:gameplay`
- `pnpm verify:gameplay-parity`
- `pnpm verify:parity:smoke`
- `pnpm verify:webview-package`
- `node packages/cli/dist/index.js playtest --project templates/structured-source-starter --target desktop --entity player --press KeyD --frames 30 --expect-moved --native-screenshots --out ../../runtime-bevy/artifacts/native-playtest-p0/structured-source-starter --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
