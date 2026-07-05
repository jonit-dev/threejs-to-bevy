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

`tn game inspect --project <path> --json` emits the agent-readable
`threenative.game-agent-inventory` report. The report names the project kind,
source document families and paths, primary scene, script module/export owners,
input, UI, assets, materials, high-value surfaces, proof commands, diagnostics,
and recommended next operations. Agents should use it as the first project map
before opening individual source files.

Projects may provide normalized agent metadata at
`threenative.config.json#/production/agent`. This section is additive to the
human-readable `production` fields and is the preferred machine-readable ledger
for new projects. Stable keys are:

- `sourceShape`: document families mapped to editable source paths such as
  `content/scenes/*.scene.json`, `content/systems/*.systems.json`,
  `content/ui/*.ui.json`, and `src/scripts/**/*.ts`.
- `highValueSurfaces`: rows with `id`, `sourcePath`, `provenanceStatus`, and
  `summary` for `playerHero`, `obstacleEnemy`, `rewardInteractable`,
  `worldEnvironment`, `uiHud`, and `audioFeedback`.
- `scriptModules`: `module`, `export`, `ownsState`, and `referencedBy` rows for
  gameplay systems.
- `uiStates`: expected retained UI states and their owning source paths.
- `assetSourcing`: catalog search, selected asset, or fallback evidence.
- `proofCommands`: reproducible local proof commands.
- `knownBlockers`: explicit limitations that should not be silently downgraded
  into placeholder source.

`content/**/*.json` and `src/scripts/**/*.ts` remain durable source. Generated
`dist/**`, persisted reports, screenshots, and bundle JSON are proof artifacts,
not authoring inputs.

`tn game inspect --json` reports the project classification, durable source
owners, scripts, script systems, UI bindings, input, materials, assets,
high-value surface inventory, production metadata, proof commands, diagnostics,
and recommended bounded authoring operations. For generated-game examples it may
also read the persisted `artifacts/game-production/plan.json` evidence to merge
declared high-value surfaces and proof commands into the inventory without
mutating source.

`tn game plan --goal <text> --json` is the required planning entry point before
source mutation for generated games. It emits a non-mutating
`threenative.game-plan` artifact with the current inventory summary, design
loop, controls, objective, progression, fail/retry, feedback, source-shape
guidance for scene, input, systems, UI, materials, and assets documents, script,
polish, and proof command sections. The plan uses inventory paths and scene
defaults when present, and emits fallback diagnostics when source defaults are
inferred. Generated-game proof keeps this output at
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
The plan also includes read-only `kitCandidates` entries backed by
`threenative.game-kit-manifest` metadata. A candidate names the kit id, version,
recipe id, score, `mutate: false`, `toolingOnly: true`, acceptance criteria,
asset roles, block ids, source owners, and proof commands. These candidates are
planning guidance only; source mutation still requires an explicit bounded
recipe or game-improve command.
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

`tn game next --project <path> --json` derives a read-first
`threenative.game-task-graph` artifact and writes it to
`artifacts/game-production/task-graph.json`. Recommendations include `id`,
`operationId`, concrete command, source owner, expected proof, phase, priority,
summary, and blocking diagnostics. The first task graph implementation covers
common generated-game blockers: missing gameplay script wiring, missing retained
UI source, missing or placeholder high-value asset evidence, missing runtime
screenshot proof, stale screenshot proof after source changes, and missing
relative-scale proof. It does not mutate durable source; it only writes the task
graph artifact.

`tn prove changed --project <path> --json` evaluates durable source
(`content/**/*.json` and `src/scripts/**/*.ts`), local assets, and emitted
bundle files against a previous `threenative.proof-manifest` when one is
provided through `--previous`. It emits stable freshness diagnostics:
`TN_VERIFY_SOURCE_HASH_MISMATCH`, `TN_VERIFY_BUNDLE_HASH_MISMATCH`,
`TN_VERIFY_ASSET_CHANGED`, and `TN_VERIFY_PROOF_STALE`, plus focused proof
recommendations for validation, build, playtest, asset inspection, model test,
and screenshot refresh. The command is read-only by default; pass
`--write-manifest` to write
`artifacts/game-production/proof-manifest.json`. Pass `--run` to execute the
deterministic recommendations currently owned by the proof runner, such as
authoring validation and build; recommendations that still contain placeholders
are skipped with `TN_PROVE_RUN_PLACEHOLDER` instead of guessing entity IDs,
preview URLs, or asset paths. Screenshot, record, playtest, scene-proof, and
game-QA sidecar artifacts include artifact-local `proofMetadata` with source
hash, optional bundle hash, command parameters, and hashed file count.
`tn proof diff --from <manifest> --to <manifest> --json` compares two proof
manifests and reports added, removed, and changed inputs by role.

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
The gate also rejects generated-game README script references that are missing
from the example `package.json`, so copy-pasted local workflow commands stay
executable. Promoted game velocity kits are also release-ratcheted through
`examples/game-velocity-kits/artifacts/game-production/kit-proof.json`; missing
or incomplete reducer package, recipe manifest, asset-role, UI, playtest,
screenshot, scale, or QA evidence fails the generated-game aggregate with
`TN_VERIFY_GAME_KIT_PROOF_MISSING` or `TN_VERIFY_GAME_KIT_PROOF_INVALID`.

Maintained game starters must scaffold the same loop rather than leaving it to
agent memory: package scripts should include `game:plan`, `game:improve`,
`game:score`, proof-running `game:qa`, and `game:release`; project production
metadata should name playable loop, controls, objective, retry path, and proof
commands. New agent-assisted game projects also scaffold
`AGENT_GAME_PLAN.md`. That Markdown file is the local human/agent worksheet for
playable loop, high-value surfaces, native UI versus React webview UI choices,
catalog-first asset sourcing, source owners, polish, scale, and proof.
`artifacts/game-production/plan.json` remains the machine-readable evidence
emitted by `tn game plan` or persisted by `tn game improve --apply-plan`.
`pnpm verify:template-production` checks maintained starters directly and is
included in the release focused-gate profile so this scaffolding cannot drift
out of newly created projects.

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
