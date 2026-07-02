# Game Production Workflow Report Contract

`tn game score`, `tn game qa`, `tn game release`, and
`pnpm verify:game-production` use the same report contract:
`threenative.game-quality-report` version `0.1.0`.

Reports are evidence ledgers. They do not mutate source and they do not imply
web/Bevy parity unless native evidence is explicitly recorded.

Top-level report fields include:

- `phaseLedgers`: status, score, diagnostics, and evidence per production
  phase.
- `scorecard`: the fixed visual rubric.
- `uiStates`: retained UI state coverage.
- `assetAudioLedger`: source/provenance status per high-value asset or audio
  surface.
- `productionCommands`: reproducible commands and artifact status for debug,
  build, playtest, screenshot, record, mobile proof, and release summary work.
- `providerProbes`: redacted local-tooling provider status for optional model,
  image, and audio generation.
- `release`: build proof, budget status, static-hosting notes, native parity
  scope, and release risks.

Generated-game aggregate proof treats persisted QA/release report quality
sections as release evidence: visual scorecard categories must be max-scored,
all phase ledgers must pass with full score, and every required retained UI
state must be present. Stale evidence paths in nested phase, scorecard,
UI-state, and asset/audio rows fail the aggregate gate. Production command
rows must also be `available` and backed by existing artifact paths; `tn game
qa --run-proof` persists doctor output to
`artifacts/game-production/doctor.json`, and build command rows use the
discovered emitted bundle manifest path. Every asset/audio ledger surface must
include durable structured-source or provenance evidence; runtime artifacts
alone are not enough provenance for a generated-game surface. Generated-game
aggregate proof also requires a durable gameplay system declaration in
`content/systems/*.json` or `content/scenes/*.json` that points at a
`src/scripts/**/*.ts` module/export, declares `GameState` writes, and records
component or resource access; the referenced script module and named export
must exist. It also requires retained `content/ui/*.ui.json` HUD source with
multiple text/status nodes, `GameState` bindings targeting those nodes, and
source affordances for gameplay, pause, settings, loading, fail/retry,
win/milestone, and touch-control states, so a generated game cannot satisfy UI
coverage with screenshots or report rows alone. Authored
`content/materials/*.json` source must also retain a varied material set with
multiple colors and roughness values for main gameplay/world surfaces, so a
single flat placeholder material cannot satisfy generated-game visual proof.

`tn game plan --goal <text> --json` is the required planning entry point before
source mutation for generated games. It emits a non-mutating
`threenative.game-plan` artifact with design loop, controls, objective,
progression, fail/retry, feedback, source-shape guidance for scene, input,
systems, UI, materials, and assets documents, script, polish, and proof command
sections. Generated-game proof keeps this output at
`artifacts/game-production/plan.json`. The plan must also retain
`acceptanceCriteria` entries that cover the objective/input playable loop,
asset provenance, script/source wiring, authored visual baseline, and proof
loop. Its asset plan must route GLB/glTF model selection through the shipped
SQLite asset-source library first:
`tn asset source search --game-category <category> --format glb --direct-only --json`.
Selected records must be expanded with
`tn asset source get <asset-source-id> --json` so the plan or implementation
notes preserve catalog id, source/provenance URLs, origin, license evidence,
review status, and fallback decisions.
The plan's proof commands must cover the full local production loop:
`tn authoring validate`, `tn build`, input-driven `tn playtest`,
`tn screenshot`, `tn game score`, `tn game qa --run-proof`, and
`tn game release`.

`tn game improve --apply-plan <file> --json` applies only bounded structured
recipe steps from a complete, valid, non-mutating game plan. The command
rejects incomplete generated-game evidence before mutating source or writing
canonical plan evidence. When application succeeds, it persists the exact
applied plan to
`artifacts/game-production/plan.json`, so the generated-game aggregate gate can
verify the planning evidence without relying on a separate manual copy step.
`pnpm verify:generated-games` is included in the release focused-gate profile
so aggregate generated-game proof remains part of release evidence. Its
aggregate `verification-report.json` includes a `summary` object with the gate
mode, project counts, audited project paths, and counts for each required proof
class so the artifact is self-describing without parsing every step row. The
gate also scans `examples/*/artifacts/game-production/plan.json` and fails with
`TN_VERIFY_GENERATED_GAME_INVENTORY_DRIFT` when a production-artifact candidate
is not enrolled in the aggregate generated-game inventory. When visual-quality
sidecars exist, the same summary records min/max color-bucket and local-contrast
ranges plus minimum nonblank and visible-bounds ratios, making visual-quality
ratchet candidates visible in release artifacts before thresholds are raised.

Maintained game starters must scaffold the same loop rather than leaving it to
agent memory: package scripts should include `game:plan`, `game:improve`,
`game:score`, proof-running `game:qa`, and `game:release`; project production
metadata should name playable loop, controls, objective, retry path, and proof
commands. `pnpm verify:template-production` checks maintained starters directly
and is included in the release focused-gate profile so this scaffolding cannot
drift out of newly created projects.

`tn game qa --run-proof --json` executes the available proof steps and embeds a
`proofRun` object beside the report. Required proof failures preserve the
original tool diagnostic code and attach the owning phase, so a failed
`tn playtest` remains identifiable as gameplay evidence and a failed
`tn screenshot` remains visual evidence. Artifact-only checks cover mobile
viewport, UI fit, and performance snapshots until those proof tools have
dedicated capture commands.

Required phase ids:

- `gameplay`
- `assets`
- `visuals`
- `ui`
- `debug`
- `qa`
- `release`

Required visual scorecard category ids:

- `art-direction`
- `hero-player`
- `obstacles-enemies`
- `rewards-interactables`
- `world-environment`
- `materials-textures`
- `lighting-render`
- `vfx-motion`
- `ui-hud`
- `performance`

Required UI state ids:

- `gameplay`
- `pause`
- `settings`
- `loading`
- `fail-retry`
- `win-milestone`
- `touch-controls`

Required asset/audio surfaces:

- `player-hero`
- `obstacle-enemy`
- `reward-interactable`
- `world-environment`
- `ui-hud`
- `audio-feedback`

Diagnostics must preserve `code`, `severity`, `path`, `message`, and a
suggested fix where the workflow can name one. Missing playable-loop proof,
screenshot evidence, UI states, asset provenance, mobile proof, and release
build proof are blockers until matching source or artifact evidence exists.

Optional external providers are represented only through local tooling
provenance or blocker evidence. Provider credentials must never appear in the
report, source documents, emitted bundles, generated `dist/**`, or browser
runtime code. `tn game providers --json` and `providerProbes` may expose
provider ids, purpose, credential variable names, and status, but never the
credential values.
