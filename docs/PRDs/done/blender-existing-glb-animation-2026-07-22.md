# PRD: Bounded Existing-GLB Animation

## Objective

Extend the existing `tn asset generate --provider blender` contract so an
author can add transform animation clips to named nodes in one project-local
GLB. The provider must retain its closed, inspectable recipe vocabulary and
produce a separate generated GLB with durable provenance.

The first acceptance asset is `douglas_sbd-3.glb`. The generated result must
contain a looping propeller clip and a flap movement clip without modifying the
source file.

## Commands

```bash
pnpm --filter @threenative/authoring build
pnpm --filter @threenative/cli build
pnpm --dir packages/authoring exec node --test dist/operationRegistry.test.js
pnpm --dir packages/cli exec node --test dist/commands/generator.test.js
pnpm tn asset generate aircraft.douglas-sbd3 --provider blender --recipe content/generators/aircraft.douglas-sbd3.recipe.json --project . --json
pnpm tn asset inspect assets/generated/aircraft.douglas-sbd3.glb --json
pnpm tn model-test assets/generated/aircraft.douglas-sbd3.glb --angles 0,90,180,270 --json
pnpm verify:cookbook
```

## Project Structure

- `packages/authoring/src/schemas.ts`: recipe field ownership.
- `packages/authoring/src/operations/sharedA.ts`: recipe validation.
- `packages/cli/src/blender/runner.py`: bounded Blender import, animation, and
  GLB export.
- `packages/cli/src/blender/runBlenderGenerator.ts`: contained source path,
  hashing, execution, inspection, and provenance.
- `packages/authoring/src/operationRegistry.test.ts` and
  `packages/cli/src/commands/generator.test.ts`: contract and command tests.
- `docs/cookbook`: reusable authoring example.
- `docs/status/capabilities/assets.md` and `docs/STATUS.md`: capability status.

## Contract

An optional recipe field named `source` contains a project-relative GLB path.
When `source` is present:

- `parts`, `materials`, and `operations` are omitted.
- `animations` contains transform tracks targeting exact imported node names.
- the source path must be a contained, non-symlink project-local `.glb`;
- every target must resolve to exactly one imported object;
- imported embedded animation clips are retained;
- new clip names must not collide with retained clips;
- position and rotation keyframes are local offsets from the imported pose,
  while scale keyframes multiply the imported scale;
- an optional source-rotation `pivot` uses authored Y-up model coordinates and
  exports a bounded parent pivot while preserving the target's rest pose;
- no arbitrary Blender code, operators, add-ons, drivers, rigs, remote URLs,
  `.blend` files, or external texture dependencies are accepted.

Recipes without `source` retain their existing generated-primitive behavior.
Rotation values remain degrees and are exported as normal glTF animation.

```json
{
  "schema": "threenative/blender-recipe",
  "version": "0.1.0",
  "id": "aircraft.example",
  "source": "assets/source/aircraft.glb",
  "animations": [{
    "id": "propeller.spin",
    "duration": 1,
    "loop": true,
    "tracks": [{
      "node": "Propeller",
      "property": "rotation",
      "keyframes": [
        { "time": 0, "value": [0, 0, 0], "interpolation": "linear" },
        { "time": 1, "value": [0, 0, 360], "interpolation": "linear" }
      ]
    }]
  }],
  "budgets": {
    "maxPolygons": 200000,
    "maxOutputBytes": 50000000,
    "maxParts": 256,
    "maxMaterials": 256,
    "maxOperations": 1,
    "maxAnimations": 16,
    "maxTracks": 128,
    "maxKeyframes": 1024
  }
}
```

## Testing Strategy

- Validation tests accept a contained GLB source and reject unsupported source
  extensions, remote/traversal paths, source-plus-generated-part mixtures, and
  missing/ambiguous animation targets.
- Generator tests prove that source bytes participate in the input hash and
  that the owned runner receives the resolved source path.
- Existing primitive recipe tests remain green.
- A real managed-Blender run generates the acceptance aircraft.
- `tn asset inspect` proves named clips and clean GLB structure.
- `tn model-test` provides isolated multi-angle visual evidence.

## Boundaries

- Always: preserve the original source, use structured JSON, resolve paths
  within the project, fail with stable actionable diagnostics, and inspect the
  staged output before promotion.
- Ask first: expanding beyond transform animation or allowing external GLTF
  dependency trees.
- Never: execute user Python, accept remote input, import `.blend`, silently
  choose among duplicate node names, or edit generated GLBs by hand.

## Success Criteria

- Existing primitive Blender recipes behave unchanged.
- A source-backed recipe generates a separate GLB through the managed Blender
  executable.
- Missing, ambiguous, or invalid targets fail before output promotion.
- The Douglas SBD-3 output contains independently named propeller and flap
  clips confirmed by `tn asset inspect`.
- The acceptance output additionally contains paired elevator and rudder clips,
  and retained runtime recordings make all four mechanisms reviewable.
- Focused authoring/CLI tests and `pnpm verify:cookbook` pass.

## Completion Evidence

Completed on 2026-07-23.

- Generated `assets/generated/aircraft.douglas-sbd3.glb` without modifying the
  user-provided source.
- Inspection confirmed the independently named `propeller.spin`,
  `flaps.deploy`, `elevator.pitch`, and `rudder.yaw` clips with five total
  channels.
- User review rejected the first wing-flap and propeller proof. Geometry
  inspection showed that the two overlapping flap nodes were material
  components of one rigid assembly, while the propeller object's imported
  origin missed its shaft center. The corrected tracks drive the flap's shared
  parent around one hinge and the propeller around a measured hub pivot.
- Hinge-pivot tracks keep the rigid wing flap, paired elevators, and rudder
  attached to their real control-surface edges; the propeller hub remains fixed
  while its rotation unwraps continuously through 360 degrees.
- The generated output passed a five-angle isolated model test, and all four
  clips passed runtime-ready recordings retained under
  `tools/verify/artifacts/blender-source-animation/`.
- Focused authoring and CLI suites passed with 32 and 65 tests respectively.
- `pnpm verify:cookbook` and `pnpm verify:blender-host` passed.
