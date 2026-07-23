---
name: threenative-game-quality
description: Asset sourcing and the visual quality bar for ThreeNative games. Use when choosing models or materials, dressing scenes, wiring animation, judging screenshots, or deciding whether a game looks finished.
---

# ThreeNative Game Quality

Treat the game as a small polished vertical slice, not a blockout. The first
playable pass must already use recognizable custom/imported art for high-value
surfaces.

## Asset sourcing order

1. Query the SQLite-backed asset source library through the CLI first:
   `tn asset source search --game-category <category> --format glb --direct-only --json`.
   Use `tn asset source get <asset-source-id> --json` for selected records and
   preserve the catalog ID, source/provenance URLs, origin, license evidence,
   review status, and fallback notes. Do not jump straight to web search or
   primitive geometry.
2. If no direct record fits, use the repo's open-source 3D asset kit workflow
   and a coherent curated pack.
3. Then a compatible GitHub/open-source pack.
4. Then generated/local custom GLB or mesh assets. For a simple custom GLB,
   use the bounded Blender recipe path when it is a better fit than manual
   modeling:

   ```bash
   tn tool status blender --json
   tn asset generate <asset-id> --provider blender --recipe <path-or-json> --project . --json
   tn asset inspect assets/generated/<asset-id>.glb --json
   ```

   Install Blender only when needed with
   `tn tool install blender --accept-download --json`; it is an
   authoring-only tool, and the recipe contract does not accept arbitrary
   Blender Python, add-ons, or remote recipes.
5. Primitives only as the last fallback, for prototype or runtime fallback
   fields.

If the planned asset source or runtime capability is unavailable, record the
fallback and keep the game visually coherent. Do not silently collapse the
plan into unrelated primitive placeholders.

## Visual baseline

- Do not accept primitive-only placeholder scenes as finished games. Add a
  cohesive visual baseline by default: custom meshes or imported model assets,
  shaped hero/enemy/reward silhouettes, authored materials, lighting, ground
  detail, environment context, set dressing, and visual landmarks that make
  the objective readable.
- For hero/player, primary obstacle/enemy/vehicle, reward/interactable, and
  the dominant environment landmark, use imported/catalog assets or authored
  custom meshes by default. If any of those surfaces remains primitive or
  primitive-looking, record the blocker and keep iterating instead of calling
  the game done.
- A local GLB made from plain boxes, capsules, spheres, or cylinders still
  counts as placeholder art unless it has a clearly authored, domain-specific
  silhouette and material treatment. Exporting primitive assemblies to GLB is
  not enough by itself.
- When primitives are unavoidable, combine and dress them so they read as
  designed objects. Prefer committing a locally authored asset and referencing
  it from structured source with `prefab.asset`, keeping primitives only as
  explicit fallback geometry.

## Materials and environment

- Use real surface treatment. Materials should communicate what objects are
  made of through color, roughness/metalness, normal or texture detail where
  available, emissive accents when useful, and consistent UV/scale choices.
  Avoid flat random colors on bare boxes unless explicitly prototyping.
- Build a believable play space around the mechanic. Racing games need track
  edges, barriers, terrain, landmarks, and sky/background treatment;
  room-based games need walls, floors, props, entrances, scale cues, and
  purposeful lighting; arena games need boundaries, cover or hazards,
  spawn/readability markers, and background detail.

## Animation, scale, and feel

- For humanoid, creature, vehicle, or otherwise living/active hero assets,
  inspect available model animation clips and wire the appropriate
  idle/run/action clips in structured source. A rigged GLB is not complete if
  its clips are not declared, played, and verified in motion.
- Preserve believable relative scale between the hero, vehicles, large
  obstacles, landmarks, and environment pieces. Do not fix readability by
  making one asset physically incoherent; adjust camera, animation speed,
  lighting, or surrounding scale instead.
- Input-driven movement must feel continuous. Avoid one-frame `setPosition`
  snaps for player movement unless the game mechanic explicitly depends on
  grid steps; even grid games should tween or ease between cells over fixed
  time.

## Judging screenshots

Inspect the screenshot/proof and fix obvious cheapness: empty horizons,
untextured gray shapes, missing shadows, incoherent scale, unclear objectives,
floating objects, bland floors, primitive-looking hero/vehicle silhouettes, or
scenes that look like debug geometry. Runtime asset counts or "GLB is present"
are not sufficient proof; the visible screenshot must show the intended
custom/imported assets.
