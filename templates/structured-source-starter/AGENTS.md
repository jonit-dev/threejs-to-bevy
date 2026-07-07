# AGENTS.md

Rules for this generated ThreeNative project.

## Source Boundary

- Durable data: `content/**/*.json`.
- Durable behavior: `src/scripts/**/*.ts`.
- Generated output: `dist/**`, emitted bundle JSON, `scripts.bundle.js`.
  Do not edit them as the fix.
- Do not author raw Three.js scenes or Bevy/Rust gameplay.

## Editing

- Prefer deterministic CLI edits and diagnostics:
  `tn scene ... --json`, `tn ui ... --json`,
  `tn prefab set-material ... --json`, `tn material ... --json`, and
  `tn add <mechanic-block> ... --json`.
- Before opening a full scene JSON file to inspect one object, use targeted
  scene inspection:
  `tn scene inspect arena --node <entity-or-resource-or-ui-id> --project . --json`.
- Edit JSON directly only when no CLI operation covers the change. If you must
  open a `content/**` file, first check `docs/API-CARD.md` for the matching
  command shape.
- Preserve schema/version fields and stable IDs unless asked to rename.
- Add behavior in `src/scripts/**/*.ts`, then reference module/exports from
  structured source.
- For repeated portable helper code in `src/scripts/**/*.ts`, use named imports
  from `@threenative/script-stdlib`:
  `NumberEx`, `Vec3`, `Quat`, and `TransformMath`.
- For the local script/source contract, read `docs/API-CARD.md` before opening
  package source. It is generated from the supported `ScriptContext` surface and
  common structured source shapes.
- Do not copy local mini-standard libraries for clamp/round/vector/quaternion,
  use namespace/default/aliased stdlib imports, or import arbitrary npm,
  relative helper modules, DOM, Node, timer, filesystem, network, Three.js, or
  Bevy APIs from portable scripts.
- Write scripts against the convention-first context surface documented in the
  repo contract: read movement with `context.input.getAxis("MoveX")`, read and
  assign `entity.transform().position`, and use `context.time.fixedDelta` as a
  readonly number. Do not put axis button mappings, fixed-step clamps, or proof
  rounding in user scripts.

## Default Game Quality

- Worked examples first: before inventing a new gameplay, camera, UI,
  physics, asset, or polish pattern, inspect the executable cookbook. Use
  `tn cookbook list --json` to see available patterns and
  `tn cookbook show <id> --json` to load one complete goal -> commands ->
  source delta -> script -> proof example. Good starting ids:
  `player-move-wasd`, `follow-camera`, `hud-score-binding`,
  `collectible-respawn`, `trigger-zone-win`, `fail-retry-reset`,
  `kinematic-hazard`, `physics-knockdown`, `glb-hero-animation`,
  `catalog-asset-provenance`, `materials-pass`, `mobile-hud-fit`,
  `pause-ui-state`, `sound-cue`, `scale-check`, `lane-runner-spawn`,
  `checkpoint-race-progress`, and `top-down-collector-recipe`.
- In the ThreeNative repo, if you change a reusable authoring pattern or CLI
  mutation surface, update the matching cookbook entry or add a new one, then
  run `pnpm verify:cookbook`.
- Before creating or substantially changing the game, open
  `AGENT_GAME_PLAN.md` when it exists, then run
  `tn game plan --goal "<game idea>" --project . --apply --json` for supported
  collector/lane-runner scaffolds, or omit `--apply` to keep planning
  non-mutating. When the worksheet is absent, treat the generated
  `artifacts/game-production/plan.json` as the planning checklist instead.
- The plan must cover game design, assets, scripts, polish, and proof: playable
  loop, controls, objective, progression, fail/retry, feedback cues,
  player/hero asset, obstacle/enemy asset, reward/interactable asset,
  world/environment asset, UI/HUD, audio-feedback, script modules/exports,
  owned state, source-document references, silhouettes, materials, lighting,
  camera framing, set dressing, UI states, mobile fit, performance, screenshot
  proof, motion proof, and input playtest proof.
- After gameplay, controls, script, source, or visual changes, verify with
  `tn iterate --project . --json` only. Do not run validate, build, screenshot,
  or playtest separately unless the compact iterate diagnostic explicitly asks
  for deeper proof. `tn iterate` already runs authoring validation, build,
  screenshot capture, and the first committed playtest scenario, writes the
  full report under `artifacts/iterate/latest/report.json`, and prints a compact
  pass/fail summary for agents. Inspect the referenced screenshot/report, fix
  the owning durable source/script, and rerun `tn iterate --project . --json`.
  When scaffold-first `tn game plan --apply` is followed by `TN_ITERATE_OK`
  and the prompt's playable loop is already represented by the scaffold
  outputs, stop and report the artifact paths instead of auditing source files
  or running `git status`/`git diff`.
  Use `tn playtest report --latest --scenario <name> --json` only after iterate
  points at a playtest failure. Use `tn playtest --discover --json` or
  `--suggest-scenario <name>` only when you need a new scenario. Before release
  claims rerun the scenario with `--target desktop` so the native runtime is
  proved, not only web.
- Apply gameplay recipes only as bounded steps from a complete plan, for example
  `tn recipe apply top-down-collector --scene <scene> --player <entity> --camera <camera> --json`.
  Keep recipe output in `content/**/*.json` and `src/scripts/**/*.ts`.
- The first playable pass must already use recognizable custom/imported art for
  high-value surfaces. A local GLB made from plain boxes, capsules, spheres, or
  cylinders still counts as placeholder art unless it has a clearly authored,
  domain-specific silhouette and material treatment.
- For GLB/glTF model choices, start with the SQLite-backed asset source library
  through the CLI:
  `tn asset source search --game-category <category> --format glb --direct-only --json`.
  Use `tn asset source get <asset-source-id> --json` for selected records and
  preserve the catalog ID, source/provenance URLs, origin, license evidence,
  review status, and fallback notes. Do not jump straight to web search or
  primitive geometry.
- If the planned asset source or runtime capability is unavailable, record the
  fallback and keep the game visually coherent. Do not silently collapse the
  plan into unrelated primitive placeholders. Continue through the documented
  fallback order: curated/open-source pack, compatible GitHub/open-source
  pack, generated/local custom GLB or mesh assets, then primitive fallback
  only for prototype or runtime fallback fields.
- Treat the game as a small polished vertical slice, not a blockout. Do not
  accept primitive-only placeholder scenes as finished games. Add a cohesive
  visual baseline by default: custom meshes or imported model assets, shaped
  hero/enemy/reward silhouettes, authored materials, lighting, ground detail,
  environment context, set dressing, and visual landmarks that make the
  objective readable.
- For humanoid, creature, vehicle, or otherwise living/active hero assets,
  inspect available model animation clips and wire the appropriate
  idle/run/action clips in structured source. A rigged GLB is not complete if
  its clips are not declared, played, and verified in motion.
- Preserve believable relative scale between the hero, vehicles, large
  obstacles, landmarks, and environment pieces. Do not fix readability by making
  one asset physically incoherent; adjust camera, animation speed, lighting, or
  surrounding scale instead.
- For hero/player, primary obstacle/enemy/vehicle, reward/interactable, and the
  dominant environment landmark, use imported/catalog assets or authored custom
  meshes by default. If any of those surfaces remains primitive or
  primitive-looking, record the blocker and keep iterating instead of calling
  the game done.
- Use real surface treatment. Materials should communicate what objects are
  made of through color, roughness/metalness, normal or texture detail where
  available, emissive accents when useful, and consistent UV/scale choices.
  Avoid flat random colors on bare boxes unless explicitly prototyping.
- Build a believable play space around the mechanic. Racing games need track
  edges, barriers, terrain, landmarks, and sky/background treatment; room-based
  games need walls, floors, props, entrances, scale cues, and purposeful
  lighting; arena games need boundaries, cover or hazards, spawn/readability
  markers, and background detail.
- When primitives are unavoidable, combine and dress them so they read as
  designed objects, not placeholders. If a custom asset can be generated or
  authored locally, prefer committing that local asset and referencing it from
  structured source with `prefab.asset`, keeping primitives only as explicit
  fallback geometry. Exporting primitive assemblies to GLB is not enough by
  itself; primitive-derived models must still pass visual inspection as
  intentional custom assets.
- For game art, first query the SQLite-backed CLI asset library and use proper
  direct GLB/glTF records when suitable. If no direct record fits, check the
  repo's open-source 3D asset kit workflow and use a coherent pack when
  suitable. If no curated pack fits, look for a compatible GitHub/open-source
  pack, then author custom meshes, and use primitives only as the last fallback.
- Input-driven movement must feel continuous. Avoid one-frame `setPosition`
  snaps for player movement unless the game mechanic explicitly depends on
  grid steps; even grid games should tween or ease between cells over fixed
  time.
- Gameplay scripts referenced from structured source are bundled per exported
  function body. Keep helper logic inside the exported system or use supported
  named imports from `@threenative/script-stdlib`; do not rely on module-level
  local helpers being available in the generated script bundle.
- Before calling a game done, produce evidence for all of: build, runtime
  readiness, nonblank screenshot, visible frame motion, active character/vehicle
  animation where clips exist, runtime relative-scale proof with
  `tn game scale --project . --json` for character/vehicle scenes, and input
  playtest.
  `tn game score --project . --json` should not report
  `TN_GAME_MOTION_FEEL_UNPROVEN` or `TN_GAME_VISUAL_BASELINE_PLACEHOLDER`.
  Also inspect the screenshot/proof and fix obvious cheapness: empty horizons,
  untextured gray shapes, missing shadows, incoherent scale, unclear objectives,
  floating objects, bland floors, primitive-looking hero/vehicle silhouettes, or
  scenes that look like debug geometry. Runtime asset counts or "GLB is present"
  are not sufficient proof; the visible screenshot must show the intended
  custom/imported assets.

## Verify

Self-verify in this order: narrowest structural check, then focused gameplay
proof, then the production gates. Do not skip from an edit straight to a
release claim.

```bash
# 1. Default inner loop after gameplay/input/script/source changes
tn iterate --project . --json

# 2. Focused follow-up only when iterate names a playtest/scenario issue
tn playtest report --latest --scenario <name> --json

# 3. Scene and runtime proof (add --native for the native runtime)
tn scene proof arena --project . --json

# 4. Production gates before calling work done
pnpm run game:plan
pnpm run game:improve
pnpm run verify
pnpm run game:score
pnpm run game:qa
pnpm run game:release
```

On diagnostics, keep code/path in notes and fix the owning source document or
script.
`tn iterate` artifacts are fast repair-loop evidence only; they do not replace
`game:qa`, `game:release`, or desktop playtest evidence before completion
claims.
