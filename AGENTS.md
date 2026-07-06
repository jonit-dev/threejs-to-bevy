# AGENTS.md

Repo-wide instructions for AI coding agents working on ThreeNative.

## Work Rules

- Make small, verifiable changes. If scope is ambiguous, state your
  interpretation or ask before editing.
- Match existing style, package boundaries, names, and test patterns.
- Do not refactor, reformat, delete, revert, or overwrite unrelated work.
- Use structured parsing/serialization for IR and bundle artifacts.
- Keep source ASCII unless the file already has a reason not to.
- Capability/release-gate changes must update `docs/STATUS.md` and
  `docs/bevy-feature-parity.md`.
- Update `docs/cookbook` and rerun `pnpm verify:cookbook` when reusable
  authoring patterns or CLI mutations change.
- Finished PRDs must be moved from active planning folders to
  `docs/PRDs/done`.

## Portable API Conventions

- Follow `docs/contracts/script-context-conventions.md` for portable script
  context naming. Prefer `ctx.input.getAxis("MoveX")`,
  `entity.transform().position`, and readonly `ctx.time.fixedDelta` in new
  source, and keep engine policy in source data, runtime defaults, or proof
  capture code rather than scattered through gameplay scripts.

## Product Boundary

ThreeNative flow:

```txt
TypeScript authoring / structured source / future editor
  -> SDK object model, ECS declarations, structured source docs
  -> compiler extraction and validation
  -> versioned IR bundle
  -> web Three.js or native Bevy runtime adapter
```

- Users author TypeScript and structured source; Bevy is adapter-private.
- IR bundles are the compiler/CLI/runtime contract.
- Durable source is SDK declarations plus `content/**/*.json`; durable behavior
  is `src/scripts/**/*.ts`.
- `dist/**`, emitted bundle JSON, and `scripts.bundle.js` are generated. Do not
  fix bugs by editing them unless a command marks the file source-persistable.
- Three.js/Bevy consume emitted IR; they are not sources of truth and must not
  generate game source.
- Unsupported APIs should fail with explicit diagnostics.
- Visual parity: never tune adapter colors/materials/lights to match a
  screenshot. Preserve authored IR values; fix mapping, color space, assets,
  shaders/materials, camera, lighting, or test setup. Art-direction transforms
  must be authored data or a documented shared contract.

## Structured Source

Default generated projects use `structured-source-starter`.

- Generated starters must include `AGENTS.md` and `CLAUDE.md`.
- Prefer deterministic source edits through bounded CLI commands:
  `tn scene ... --json`, `tn ui ... --json`, `tn material ... --json`,
  `tn authoring validate --json`, and other `tn ... --json` surfaces.
- Edit `content/**/*.json` directly only when no CLI operation covers the
  change. Preserve schema/version fields and stable IDs unless asked to rename.
- Add/change gameplay in `src/scripts/**/*.ts`, then reference the module/export
  from structured source.
- Do not author raw Three.js scenes, raw Bevy/Rust gameplay, DOM APIs,
  filesystem access, workers, timers, renderer plugin handles, or native runtime
  handles unless a package capability exposes them.
- On diagnostics, preserve code/path/severity/message in notes and repair the
  durable source document or script that owns the problem.

## Game Planning

For generated games and playable examples, start with an explicit production
plan before mutating source:

- Run `tn game plan --goal "<game idea>" --project . --json` or write an
  equivalent plan in notes when the CLI is unavailable.
- The plan must name the playable loop, controls, objective, progression,
  fail/retry path, and feedback moments. Do not begin by placing random objects
  and discovering the game afterward.
- The plan must inventory every high-value surface: player/hero,
  obstacle/enemy, reward/interactable, world/environment, UI/HUD, and
  audio-feedback. For each one, decide whether to use catalog assets, a
  cohesive open-source pack, generated/local tooling output, authored custom
  meshes, or a documented fallback.
- The first playable pass must already use recognizable custom/imported art for
  high-value surfaces. A local GLB assembled from plain boxes, capsules,
  spheres, or cylinders is still placeholder art unless it has a clearly
  authored, domain-specific silhouette and material treatment.
- For 3D model surfaces, the first sourcing action must be the CLI search over
  the shipped SQLite asset-source library
  (`packages/cli/data/asset-sources.sqlite`), not a web search or hand-made
  primitive:
  `tn asset source search --game-category <category> --format glb --direct-only --json`.
  Use the returned catalog records to choose proper GLB/glTF models and record
  why selected assets fit the game style, silhouette, license, and runtime
  constraints. Then run `tn asset source get <asset-source-id> --json` for
  selected records and preserve the SQLite catalog ID and provenance metadata.
- The plan must name script modules/exports under `src/scripts/**/*.ts`, the
  state they own, the source documents that reference them, and how their
  behavior will be proved.
- The plan must name the first `tn playtest` proof to run while implementing.
  Use `tn playtest --discover --json` or `--suggest-scenario <name>` to find
  provable entities and a starting scenario. Prefer a committed scenario under
  `playtests/*.playtest.json` when the gameplay needs more than one input or
  assertion; otherwise name the one-shot command with `--entity`, `--press`,
  `--frames`, and expected movement/axis. Use `--stable-artifacts` or `--out`
  during iteration so each run has a clear `summary.json`, screenshots, effect
  log, diagnostics, and reproduction command.
- The plan must include a polish pass for silhouettes, materials, lighting,
  camera framing, environment context, set dressing, motion/VFX/audio feedback,
  UI states, mobile fit, and performance budget.
- For humanoid, creature, vehicle, or otherwise living/active hero assets, the
  plan must inventory available model animation clips and declare the intended
  idle/run/action clips in structured source. A rigged GLB is not complete if
  its clips are not wired, played, and verified in motion.
- The plan must include a relative-scale check for the hero, vehicles, large
  obstacles, rewards, landmarks, and environment pieces. Do not fix readability
  by making one asset physically incoherent; adjust camera, animation speed,
  pose, lighting, or surrounding scale instead.
- Treat the plan as a checklist while implementing. If asset sourcing or a
  runtime capability fails, update the plan with the fallback and evidence
  instead of silently downgrading to dull placeholder geometry.
- Iterate with `tn playtest` before claiming the game works: after each
  gameplay or input change, run the narrowest playtest (`--watch --pass-once`
  helps while iterating), inspect failing diagnostics/artifacts, repair the
  durable source or script that owns the failure, and rerun until the proof
  passes. Before release claims, rerun the scenario with `--target desktop`
  so the native runtime is proved, not only web. A screenshot or build alone
  is not gameplay proof.

## Game Asset Sourcing

For generated games and playable examples, aim for a finished, art-directed
scene before falling back to primitives:

1. Query the shipped SQLite asset source catalog first:
   `tn asset source search --game-category <category> --format glb --direct-only --json`.
   Prefer direct GLB/glTF entries with `isDirectDownload`, `downloadUrl`,
   compatible `licenseId`/`licensePosture`, matching category or tags, and
   clear `sourceUrl`, `provenanceUrl`, `origin`, and `sourceMetadata`.
2. If no direct result fits, inspect pack-page and typed source records from
   `tn asset source search --game-category <category> --json` or
   `tn asset source search --file-role <role> --json`.
3. Check `docs/workflows/open-source-3d-asset-kits.md` for policy, cautions,
   and broader human sourcing guidance. Prefer a consistent pack from that
   curated list when suitable, and preserve its license/provenance record.
4. If the catalog and curated list have no fit, research GitHub/open-source sources for a
   compatible pack with a consistent style and clear redistribution terms.
5. If no usable pack exists, author a coherent set of custom meshes.
6. Use primitive geometry only as the last fallback or prototype state. Finished
   defaults should not look like unrelated placeholders. Do not mark a game
   finished because primitives were exported to GLB; primitive-derived models
   must be visually judged like primitives unless their silhouette, proportions,
   materials, and context read as intentional custom art.

When selecting SQLite catalog assets, run
`tn asset source get <asset-source-id> --json`, then report and preserve the
catalog ID, direct URL when present, source URL, provenance URL, origin name,
origin URL, license evidence, review status, downloaded date, and conversion
notes next to committed assets. Run `tn asset inspect` and `tn model-test`
after downloading or referencing a selected model.

## Game Visual Quality

- Treat "game complete" as a small polished vertical slice, not a blockout.
  A finished default should have a cohesive visual style, readable gameplay
  silhouettes, camera framing, set dressing, lighting, and environment context.
- Use real surface treatment. Materials should communicate what objects are
  made of through color, roughness/metalness, normal or texture detail where
  available, emissive accents when useful, and consistent UV/scale choices.
  Avoid flat random colors on bare boxes unless explicitly prototyping.
- Build a believable play space around the mechanic. Racing games need track
  edges, barriers, terrain, landmarks, and sky/background treatment; room-based
  games need walls, floors, props, entrances, scale cues, and purposeful
  lighting; arena games need boundaries, cover or hazards, spawn/readability
  markers, and background detail.
- Animate active characters and vehicles when suitable clips exist. For
  imported GLB/glTF actors, inspect embedded clips, declare them on the model
  asset, select a gameplay-appropriate source clip, and capture proof that the
  clip visibly advances at runtime.
- Preserve believable relative scale. A player should not read as tall as a
  train, truck, building, or other known large object. Before calling a vehicle
  or character scene visually done, run `tn game scale --project <path> --json`
  or equivalent runtime-bounds proof and resolve scale diagnostics.
- Prefer cohesive asset kits, modular environment pieces, authored meshes, or
  generated meshes with intentional proportions and materials. When primitives
  are unavoidable, combine and dress them so they read as designed objects, not
  placeholders.
- For hero/player, primary obstacle/enemy/vehicle, reward/interactable, and the
  dominant environment landmark, use imported/catalog assets or authored custom
  meshes by default. If any of those surfaces remains primitive or
  primitive-looking, record the blocker and keep iterating instead of calling
  the game done.
- Before calling visual work done, inspect a screenshot or browser/native proof
  and fix obvious cheapness: empty horizons, untextured gray shapes, missing
  shadows, incoherent scale, unclear objectives, floating objects, bland floors,
  primitive-looking hero/vehicle silhouettes, or scenes that look like debug
  geometry. Runtime asset counts or "GLB is present" are not sufficient proof;
  the visible screenshot must show the intended custom/imported assets.

## Gameplay Physics

- For games where physical interaction is core to the mechanic, such as
  bowling, billiards, racing collisions, platforming, throwing, stacking, or
  projectile impacts, authored physics is required up front. Use the portable
  physics components and runtime services first; do not implement the core
  mechanic as purely visual/scripted motion unless a focused probe proves the
  current runtime cannot express the required behavior.
- If a game idea obviously involves physical contact, gravity, momentum,
  collision response, rolling, bouncing, sliding, throwing, stacking, or
  projectile impact, add `RigidBody`, `Collider`, and appropriate physics
  material/trigger metadata to the durable structured source before writing the
  gameplay loop. Scripts may apply input impulses, reset state, score events, or
  provide deterministic fallback behavior, but they must not replace the
  authored physics contract for the primary mechanic.
- Prefer the portable physics contract exposed by the SDK/IR: `RigidBody`,
  `Collider`, physics materials, triggers/sensors, contact filtering, CCD, and
  supported runtime physics services. If the current runtime cannot express the
  required mechanic, document the limitation and use a deterministic
  approximation that is clearly backed by authored physics components and
  explicit gameplay state.
- Do not claim realistic physics unless build artifacts and playtest evidence
  prove the relevant contact, collision, gravity, friction, restitution, and
  motion behavior. For shared contracts, preserve web/Bevy semantics and add
  or update focused verification.

Useful loop:

```bash
tn scene validate arena --json
tn scene inspect arena --json
tn scene proof arena --project . --json
tn playtest --project . --discover --json
tn playtest --project . --scenario playtests/<name>.playtest.json --stable-artifacts --json
pnpm run validate:authoring
pnpm run build
pnpm run verify
```

## Repo Map

- `packages/sdk`: public authoring APIs.
- `packages/ir`: schemas, types, validation, conformance.
- `packages/compiler`: extraction, validation, diagnostics, bundle emit.
- `packages/cli`: `tn` commands and orchestration.
- `packages/runtime-web-three`: web runtime adapter.
- `runtime-bevy`: native runtime adapter.
- `examples`: runnable examples with local runtime assets.
- `templates`: CLI project templates.
- `docs`: architecture, contracts, workflows, status, PRDs.
- `scripts`: compatibility wrappers and repo maintenance.
- `tools/verify/src`: active verification-gate implementation.

Nested `AGENTS.md` files may add local rules.

## Artifacts And Docs

- One-example evidence: `examples/<name>/artifacts/<gate>/`.
- Aggregate reports: `tools/verify/artifacts/<gate>/`.
- Shared IR fixtures: `packages/ir/fixtures/*`.
- Bevy-only evidence: `runtime-bevy/artifacts/<gate>/`.
- Active docs: `docs/architecture/`, `docs/contracts/`, `docs/runtime/`,
  `docs/workflows/`, `docs/status/`, `docs/PRDs/`.
- Open-source 3D asset kit reference:
  `docs/workflows/open-source-3d-asset-kits.md`.
- Gate implementation belongs in `tools/verify/src`; use `scripts/` only for
  wrappers, shims, or maintenance.

## Tooling

- Package manager: `pnpm@10.25.0`.
- TypeScript: ESM, `NodeNext`, `ES2023`, strict.
- Rust: 2024 edition; Bevy and `bevy_ecs` pinned to `=0.14.2`.

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm verify
pnpm verify:conformance
```

Use the narrowest relevant verification first. For shared runtime contracts,
include `pnpm verify:conformance`. If verification is not run, say why.

Contributor gates include `pnpm check:names`, `pnpm check:docs`, and
`pnpm verify:release`. Use `pnpm verify:smoke` for cheap local drift checks and
`pnpm verify:pre-push` before push. Do not put visual screenshot gates such as
`pnpm verify:parity:smoke` in pre-commit hooks.

## Testing

- Bug fix: add/update a reproducing test.
- Validation change: cover accepted and rejected inputs when practical.
- Compiler/IR change: test emitted bundle shape and schema behavior.
- Runtime mapping change: test the affected runtime and preserve web/Bevy
  semantics for shared contracts.
- CLI change: test output, exit codes, and generated artifacts.

Diagnostics should be stable and actionable: code, severity, path, message, and
suggested fix where supported.
