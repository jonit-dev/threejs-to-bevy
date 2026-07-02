# Compact Scene Source

Use compact scene source when a scene has repeated entities, repeated component
blocks, or generated layout data that makes hand review difficult. Durable
source stays in `content/**/*.json`; emitted IR remains the compiler/runtime
contract.

## Pattern Choice

- Use prefab defaults for reusable objects with stable components, physics,
  materials, or script state. Examples: pins, balls, rails, blockers, pickups,
  lamps, spawn markers.
- Use compact scene instances for scene membership, IDs, unique transforms, and
  small per-instance overrides.
- Use layout commands or generators when many instances follow a named rule,
  such as a ten-pin rack, grid, ring, lane, wave, or spawn pattern.
- Use raw scene entities for objects that are genuinely unique to the scene:
  cameras, one-off lights, authored markers, and special set dressing.

## Agent Workflow

1. Inspect first:

   ```bash
   tn scene inspect <scene-id> --project . --json
   ```

   Treat `sourceLineCount`, `instances`, `expandedEntityCount`,
   `repeatedBlocks`, and `suggestedRefactors` as editing signals.

2. Plan a bounded source operation. Prefer CLI operations such as:

   ```bash
   tn prefab set-defaults <prefab-id> --project . --json
   tn scene add-prefab-instance <scene-id> --project . --json
   tn scene layout ten-pin <scene-id> --project . --json
   ```

3. Edit the durable owner only. Put reusable defaults in prefab documents,
   unique placement in scene instances, and behavior in `src/scripts/**/*.ts`.

4. Validate and build:

   ```bash
   tn authoring validate --project . --json
   tn build --project . --json
   tn scene validate <scene-id> --project . --json
   ```

5. Prove the result with the narrowest relevant runtime gate:

   ```bash
   tn scene proof <scene-id> --project . --json
   tn verify --project . --frames 4 --expect-motion --json
   tn game score --project . --json
   ```

## Guardrails

- Do not copy full physics, render, or script component blocks into every
  repeated entity when a prefab default can own them.
- Do not duplicate layout constants in scripts when the source document already
  owns homes, spawn points, or transforms.
- Do not edit emitted bundle JSON to repair compact-source problems.
- When `tn scene inspect` reports repeated blocks, either compact them or record
  why the repetition is intentional before calling the scene agent-friendly.
- Keep generated starter and example `AGENTS.md` files aligned with this source
  ownership model.
