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
  `tn scene ... --json`, `tn ui ... --json`, `tn material ... --json`,
  `tn authoring validate --json`.
- Edit JSON directly only when no CLI operation covers the change.
- Preserve schema/version fields and stable IDs unless asked to rename.
- Add behavior in `src/scripts/**/*.ts`, then reference module/exports from
  structured source.
- For repeated portable helper code in `src/scripts/**/*.ts`, use named imports
  from `@threenative/script-stdlib`:
  `NumberEx`, `Vec3`, `Quat`, and `TransformMath`.
- Do not copy local mini-standard libraries for clamp/round/vector/quaternion,
  use namespace/default/aliased stdlib imports, or import arbitrary npm,
  relative helper modules, DOM, Node, timer, filesystem, network, Three.js, or
  Bevy APIs from portable scripts.

## Default Game Quality

- Treat the game as a small polished vertical slice, not a blockout. Do not
  accept primitive-only placeholder scenes as finished games. Add a cohesive
  visual baseline by default: custom meshes or imported model assets, shaped
  hero/enemy/reward silhouettes, authored materials, lighting, ground detail,
  environment context, set dressing, and visual landmarks that make the
  objective readable.
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
  designed objects, not placeholders.
- For game art, first check the repo's open-source 3D asset kit workflow and
  use a coherent pack when suitable. If no curated pack fits, look for a
  compatible GitHub/open-source pack, then author custom meshes, and use
  primitives only as the last fallback.
- Input-driven movement must feel continuous. Avoid one-frame `setPosition`
  snaps for player movement unless the game mechanic explicitly depends on
  grid steps; even grid games should tween or ease between cells over fixed
  time.
- Gameplay scripts referenced from structured source are bundled per exported
  function body. Keep helper logic inside the exported system or use supported
  named imports from `@threenative/script-stdlib`; do not rely on module-level
  local helpers being available in the generated script bundle.
- Before calling a game done, produce evidence for all of: build, runtime
  readiness, nonblank screenshot, visible frame motion, and input playtest.
  `tn game score --project . --json` should not report
  `TN_GAME_MOTION_FEEL_UNPROVEN` or `TN_GAME_VISUAL_BASELINE_PLACEHOLDER`.
  Also inspect the screenshot/proof and fix obvious cheapness: empty horizons,
  untextured gray shapes, missing shadows, incoherent scale, unclear objectives,
  floating objects, bland floors, or scenes that look like debug geometry.

## Verify

```bash
pnpm run validate:authoring
pnpm run build
pnpm run verify
pnpm run playtest
pnpm run game:score
tn scene validate arena --json
tn scene inspect arena --json
tn scene proof arena --project . --json
```

On diagnostics, keep code/path in notes and fix the owning source document or
script.
