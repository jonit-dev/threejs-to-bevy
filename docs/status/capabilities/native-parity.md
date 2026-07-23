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
- Native readiness samples include per-entity animation playback
  (`animations[]` with clip, sourceClip, playing, and advancing time), and the
  CLI converts advancing samples into effect-log animation evidence, so
  desktop playtest `assert.animation` rows are proved natively instead of
  failing with `TN_PLAYTEST_ANIMATION_NOT_OBSERVED`. The runtime advances
  `NativeAnimationPlayback` time in `Update` for scripted and static bundles.
- Desktop playtests reuse a prebuilt `threenative_runtime` binary when its
  `--capabilities` probe reports the required cargo features; the probe and
  spawn export `LD_LIBRARY_PATH` to the binary's target directory (libcef),
  and the bundled `dist/runtime-bevy` root is probed before the repo root, so
  `cargo run` compilation stays out of the fixed native-harness timeout.
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
- The bounded Interaction fixed-tick contract is promoted on both adapters for
  pickup, hazard, checkpoint, and projectile/event scenarios. Paired artifacts
  under `packages/ir/artifacts/conformance/interactions/` compare normalized
  traces, resource state, and live entity IDs. The pickup pair proves one
  `addResource` plus `despawn`, `Score.value == 1`, removal of `pickup`, and a
  completion trace; hazard proves `Score.value == -1`; checkpoint and
  projectile prove deterministic detector/effect traces. The conformance gate
  also compares all four pairs and the negative controls catch reordered
  traces, double rewards, missed despawns, and unavailable native effects.
  This is behavioral/state parity, not a native visual promotion.

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
- `pnpm --filter @threenative/verify-tools test -- --run "interaction parity"`
- `cargo test -p threenative_runtime --test interactions --manifest-path runtime-bevy/Cargo.toml`
- `pnpm test:gameplay`
- `pnpm verify:gameplay-parity`
- `pnpm verify:parity:smoke`
- `pnpm verify:webview-package`
- `node packages/cli/dist/index.js playtest --project templates/structured-source-starter --target desktop --entity player --press KeyD --frames 30 --expect-moved --native-screenshots --out ../../runtime-bevy/artifacts/native-playtest-p0/structured-source-starter --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
