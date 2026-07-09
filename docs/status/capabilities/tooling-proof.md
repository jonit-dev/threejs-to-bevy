# Tooling And Proof Status

Verification tools own release gates, smoke gates, docs checks, proof manifests,
and aggregate artifacts.

Current support:

- `tn iterate` for inner-loop validate/build/screenshot/playtest reports. By
  default it runs every `playtests/*.playtest.json` scenario in stable order
  and prints compact per-scenario assertion observations.
- `pnpm verify:agent-io` for documented agent command stdout budgets; deep
  playtest logs remain in artifact files while stdout stays compact.
- `pnpm verify:session-cost` replays scaffold-first paths in CI without LLM
  agents and enforces tool steps <= 12, failed commands == 0, and compact
  `tn iterate --json` output <= 2 KB. It also reports
  `maxConsecutiveSameDiagnostic` and `identicalAssertionRepeatCount`, failing
  when same-diagnostic retries exceed one or identical failed assertions repeat.
  The typed-spec collector replay records an explicit scaffold/apply/build/
  playtest acceptance proof with zero manual edits and zero authored scenarios.
  The current deterministic replay set covers all archetype scaffolds plus the
  `top-down-collector` and `lane-runner` `tn game plan --apply` paths that are
  supported today.
- `pnpm verify:webview-package` packages the
  `ui-persistence-settings-facades` conformance bundle through the desktop-web
  path and records raw package, size, startup, input, settings, and save-slot
  evidence under `tools/verify/artifacts/webview-package/`.
- `tools/verify/src/gateDescriptors.ts` owns the first descriptor-backed proof
  gate slice for `pnpm verify:agent-io`, `pnpm verify:session-cost`, and
  `pnpm verify:webview-package`. Focused dispatch, release artifact enrollment,
  owner/protected-surface metadata, timing categories, and artifact paths derive
  from those descriptors, while still-inline focused gates are listed as
  reviewed migration gaps with drift tests.
- Performance proof sidecars now have a versioned verifier contract at
  `docs/contracts/performance-proof.md`, a verify-tools validator, and
  `tn performance proof` for web runtime frame-time percentiles, draw
  calls/groups, visible instances, active LOD bands, loaded texture bytes,
  texture variant bytes, and entity counts. `tn performance proof --target
  desktop` writes the same sidecar shape with measured static bundle counters
  and stable unsupported diagnostics for Bevy counters that are not promoted
  yet. `pnpm verify:efficient-scale`
  builds `examples/dense-world-benchmark`, captures a web performance-proof
  sidecar, validates target-profile budgets, and enforces dense-scene entity
  and visible-instance floors plus selected texture-variant package/load
  bytes. `tn game qa --run-proof` also writes
  `artifacts/game-production/performance-proof.json` using the shared
  performance-proof schema with measured bundle counters and explicit
  unsupported diagnostics for runtime-only counters.
- `pnpm verify:template-production` derives maintained starter checks from
  `templates/*/threenative.template.json`, including generated files,
  package scripts, proof command ids, iterate-first guidance, compact-report
  guidance, and generated API-card parity.
- `pnpm verify:generated-games` reads generated-game release enrollment and
  proof requirements from project-local `production.releaseProof` config plus
  lifecycle classification from `examples/manifest.json`, reports explicit
  proof exemptions, fails unknown requirement keys, and drift-checks release
  enrollment/build-only policy against the owning manifest fields.
- Generated-game visual-quality proof validation now requires the compact
  `game-quality` metric bundle emitted by `tn game qa --run-proof`, validates
  bundle pass/threshold shape, and reports stale bundle values separately from
  screenshot metric threshold failures.
- `tools/verify/src/adapterSurfaceDrift.test.ts` compares authoring operation
  registry names against CLI, MCP, editor, and editor-smoke surfaces with
  explicit gap allowlists that fail when the owning registry entry disappears.
  `pnpm verify:editor-required-operations` remains the executable smoke gate
  for the required editor operation path.
- The top-level `tn` command surface now has an incremental typed command
  registry for help, lookup, migrated dispatch handlers, and the explicit
  unmigrated compatibility list. Shared argv helpers cover migrated simple and
  subcommand-family paths while larger command families continue migrating.
- Authoring operation descriptors now include executable CLI adapter metadata
  for migrated scene/material/runtime/UI operations. MCP argv construction and
  selected source-document CLI usage are derived from the descriptor, and
  registry-backed MCP tools without adapter metadata fail closed instead of
  guessing flags.
- The editor required-operations smoke now covers composite recipe execution,
  including default scene creation and flat terrain creation through the editor
  operation API.
- Rejected boundary fixtures under
  `packages/ir/fixtures/rejected/v10-boundaries/catalog.json` are audited by
  verify-tools so cloud/account storage, raw Three.js, direct Bevy authoring,
  online services, backend-only claims, custom audio decoders, streaming or
  network audio, platform APIs, and 2D-only workflows stay explicit
  diagnostic boundaries.
- Agent benchmark reports are version 2 token-cost artifacts with raw, cached,
  uncached, output, cost-weighted, iteration, failed-command, and tool-output
  medians plus dialect-confusion failure counts. Round-5 aggregation now gates
  only equal-proof runs with prompt assertions, three repeats per condition,
  continuity `<= 1.5x` tokens, beyond-one-shot `<= 1.0x` tokens, and
  failed-command/retry-chain budgets. The benchmark scorer also accepts a
  `typed-spec` condition, imports `TN_PLAYTEST_*` diagnostics from candidate
  playtest `summary.json` artifacts, infers collector equal-proof assertions
  from committed playtest summaries, and emits a separate typed-spec verdict
  comparing typed source against direct ThreeNative without changing the
  vanilla comparison gate. Aggregate reports also emit per-run churn budget
  diagnostics for engine-source searches, standalone verify commands, artifact
  forensics, missing iterate use, and missing discovery.
- Guided Round-5 collector preparation tells ThreeNative agents to use the
  scaffold-first `tn game plan --apply` plus `xvfb-run -a tn iterate` path and
  stop after a passing iterate instead of running standalone proof loops. The
  scorer imports generated `artifacts/iterate/latest/playtest/**/summary.json`
  proof-family scenarios and combines movement, pickup/progress, win-state,
  and retry assertions across summaries. Fresh equal-proof evidence under
  `tools/verify/artifacts/agent-benchmark/round-5-collector-guided-2026-07-08/`
  has status/matrix/audit green and proves collector token medians of 20,950
  direct ThreeNative vs 46,192 vanilla (0.454x raw; `withinHalfX: true`).
- Round-5B preparation generates the lane-runner, checkpoint-race, and
  physics-knockdown matrix only from a green next-steps audit; the addendum is
  `tools/agent-benchmark/ROUND-5B-PROTOCOL-2026-07-08.md`.
- The 2026-07-07 off-recipe benchmark keeps raw transcripts, sessions, scorer
  output, aggregate report, and agent behavior learnings under
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/`.
- Playtest reports attach compact web/native runtime resource observations and
  emit `TN_RESOURCE_DECLARED_NOT_OBSERVED` or
  `TN_PLAYTEST_REPEATED_ASSERTION` when failing assertions would otherwise
  repeat without new diagnostic information. Rich resource assertions now emit
  `TN_PLAYTEST_RESOURCE_STATE_STAGNATED` when a scenario moves the subject but
  an asserted resource path stays unchanged, including owning-system evidence
  from `effect-log.json` when available. Movement assertions also support
  `minAxisDelta` for secondary signed-axis proof, such as requiring positive Y
  gain while the primary route asserts forward motion.
- `pnpm test:gameplay` runs the focused gameplay parity smoke profile through
  verify-tools. The current enforced manifest pairs web and desktop playtests
  for the humanoid course forward-movement scenario, checks source-backed
  model/animation, texture-repeat, and material-texture resource probes for
  both targets, and requires scene coverage for player, camera, soldier
  animation clips, floor texture/material, gameplay state, update system, HUD,
  and colliders. Gameplay parity reports classify each entry as `enforced`,
  `calibrating`, `quarantined`, or `report-only`, record per-case timing
  samples, fail over-budget enforced smoke entries with
  `TN_GAMEPLAY_PARITY_SMOKE_BUDGET_EXCEEDED`, and keep non-enforced entries
  out of pass claims. `tn playtest` writes per-target
  `runtime-observations.json` sidecars for cheap asset/texture/material facts
  when the runtime exposes them, and runtime probe rows label
  `runtime-observation` sidecars before falling back to `source-manifest`.
  Coverage summaries distinguish enforced smoke/full coverage from
  source-inventory debt. The
  full `pnpm verify:gameplay-parity` profile is enrolled in
  `pnpm verify:release`; ball-push is a promoted full-profile row backed by
  latest humanoid-course summary artifacts, while ramp, stairs, and hazard
  remain non-passing with explicit promotion/blocker metadata.
- `pnpm check:docs` for docs consistency and STATUS index budget.
- `pnpm verify:smoke`, `pnpm verify:pre-push`, and `pnpm verify:release` for
  escalating proof levels.
- Aggregate reports belong under `tools/verify/artifacts/<gate>/`; example
  evidence belongs under `examples/<name>/artifacts/<gate>/`.

Verification:

- `pnpm verify:agent-io`
- `pnpm verify:session-cost`
- `pnpm --filter @threenative/verify-tools test`
- `pnpm --filter @threenative/verify-tools test -- --run performance`
- `node --test tools/verify/dist/gameProductionGate.test.js`
- `node --test tools/verify/dist/adapterSurfaceDrift.test.js`
- `pnpm verify:editor-required-operations`
- `pnpm --filter @threenative/cli test -- --run performance`
- `pnpm --filter @threenative/cli test`
- `pnpm --filter @threenative/verify-tools test -- --run "efficient scale"`
- `pnpm verify:efficient-scale`
- `pnpm verify:webview-package`
- `pnpm test:gameplay`
- `pnpm verify:gameplay-parity`
- descriptor-backed gate metadata and migration gap coverage in
  `pnpm --filter @threenative/verify-tools test`
- `pnpm --filter @threenative/verify-tools test -- --run boundary`
- `pnpm check:docs`
- `pnpm verify:smoke`
- `pnpm verify:release`
- `pnpm --filter @threenative/agent-benchmark test`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
