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

`tn game plan --goal <text> --json` is the required planning entry point before
source mutation for generated games. Its asset plan must route GLB/glTF model
selection through the shipped SQLite asset-source library first:
`tn asset source search --game-category <category> --format glb --direct-only --json`.
Selected records must be expanded with
`tn asset source get <asset-source-id> --json` so the plan or implementation
notes preserve catalog id, source/provenance URLs, origin, license evidence,
review status, and fallback decisions.

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
