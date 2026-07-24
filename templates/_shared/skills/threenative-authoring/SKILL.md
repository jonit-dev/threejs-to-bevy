---
name: threenative-authoring
description: CLI-first structured source editing for ThreeNative projects. Use when adding or changing entities, scenes, actors, flows, sequences, UI, materials, prefabs, or gameplay scripts.
---

# ThreeNative Authoring

## CLI before JSON

- Prefer deterministic CLI edits and diagnostics:
  `tn actor ... --json`, `tn scene ... --json`, `tn ui ... --json`,
  `tn prefab set-material ... --json`, `tn material ... --json`, and
  `tn add <mechanic-block> ... --json`.
- Use actor archetypes before hand-editing entity, collider, camera, input,
  UI, or system JSON for high-value surfaces:
  `tn actor list --project . --json`,
  `tn actor add <character|vehicle|pickup|camera-boom|prop-static> --id <id> --project . --json`,
  and `tn actor update <id> --set key=value --project . --json`.
- Before opening a full scene JSON file to inspect one object, use targeted
  scene inspection:
  `tn scene inspect <scene-id> --node <entity-or-resource-or-ui-id> --project . --json`.
- Use a bounded CLI operation when one covers the change. Otherwise, editing
  durable `content/**/*.json` directly is supported: preserve its
  schema/version fields and stable IDs, then run
  `tn authoring validate --project . --json`. `docs/API-CARD.md` is the
  generated local capability and script boundary; do not infer a missing CLI
  operation from undocumented repo internals.
- Preserve schema/version fields and stable IDs unless asked to rename.

## Data-first game state

- Macro game state, waves/spawns, and cutscene or feedback beats are
  data-first: use `tn flow ... --json`, `tn sequence ... --json`, and
  `tn scene set-spawner ... --json` before adding script-owned state flags,
  timers, or cutscene code.

## Scripts

- For a custom-on-starter plan, use this bounded sequence before opening broad
  source or engine files:
  `tn authoring inspect --project . --plan artifacts/game-production/plan.json --json`,
  then run its `nextAuthoringCommand` when present. Use
  `tn authoring script scaffold --project . --json` only when inspection has no
  executable prototype command, then
  `tn authoring script check --project . --json`. After the script and source
  validate, immediately run
  `tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json`
  and `tn iterate --project . --json`; inspect broader source or verification
  guidance only if that first proof reports an actionable failure.
- Add behavior in `src/scripts/**/*.ts`, then reference module/exports from
  structured source.
- For new script systems, prefer `defineBehavior(metadata, fn)` from
  `@threenative/script-stdlib` so schedule/access metadata lives next to the
  behavior. Keep `content/systems/*.systems.json` as script attachments with
  `{ "module": "src/scripts/player.ts", "export": "updatePlayer", "source": "behavior-metadata" }`
  unless plain-function compatibility is required; do not hand-write access
  lists when `defineBehavior` can own them.
- Use the generated `ProjectContext` type from
  `.threenative/types/project-context.d.ts` for script entrypoints. Regenerate
  it with `tn types generate --project . --json` after adding scenes, input,
  resources, schemas, UI, or prefabs; `tn build` and `tn dev --watch` do this
  automatically.
- For repeated portable helper code, use named imports from
  `@threenative/script-stdlib`: `Mathf`, `Vector3`, `Quat`, and
  `TransformMath`. Do not copy local mini-standard libraries for
  clamp/round/vector/quaternion math.
- Do not use namespace/default/import-renamed stdlib imports, or import
  arbitrary npm, relative helper modules, DOM, Node, timer, filesystem,
  network, Three.js, or Bevy APIs from portable scripts.
- Write scripts against the convention-first context surface documented in
  `docs/API-CARD.md`: read movement with `context.input.getAxis("MoveX")`,
  read and assign `entity.transform().position`, and use
  `context.time.fixedDelta` as a readonly number. Do not put axis button
  mappings, fixed-step clamps, or proof rounding in user scripts.
- Gameplay scripts referenced from structured source are bundled per exported
  function body. Keep helper logic inside the exported system or use supported
  named imports from `@threenative/script-stdlib`; do not rely on module-level
  local helpers being available in the generated script bundle.
- Portable runtime entity lifecycle is supported through
  `context.commands.spawn(id, components, tags)`,
  `context.commands.instantiate(prefab, prefix)`, and
  `context.commands.despawn(id)`. Declare the matching bounded command metadata
  on `defineBehavior`; use stable IDs and authored prefab/component data.
- These commands expose logical entities only. Scripts do not receive Three.js
  objects, Bevy entities/resources, renderer or GPU handles, or imported-model
  sub-node handles. Address authored entities, clips, assets, materials, and
  components by stable ID.

## Direct-source constraints

- Logical IDs are lowercase and use dots, dashes, or underscores. Put
  placement `transform` on scene entities or prefab instances, not inside a
  prefab declaration. Supported primitive names are `box`, `capsule`, `cone`,
  `cylinder`, `plane`, `sphere`, and `torus`; lights use `kind`.
- Keep systems and UI in their sibling `content/systems` and `content/ui`
  documents. Do not duplicate the same rows inline in the scene.
