# V3 PRDs

Complexity: 10 -> HIGH mode

V3 uses [docs/ROADMAP.md](../../ROADMAP.md) as the controlling scope. The goal is
not broad production hardening; it is proving that the V2 foundation can bundle,
validate, render, and verify one dense first-person environment scene:

```txt
environment asset pack
  -> deterministic scene composition
  -> validated portable bundle
  -> performant Three.js first-person preview
  -> Bevy native load smoke
  -> visual and performance verification artifacts
```

## V3 Scope Decisions

- V3 proof scene: the stylized forest path represented by
  `assets-source/environment/Preview_2.jpg`.
- Source art: `assets-source/environment` is sufficient for V3 content proof;
  missing work is engine, pipeline, composition, performance, and verification.
- Web performance is the strict gate. The Three.js runtime must measure and
  enforce budgets for draw calls, instances, triangles, texture memory, bundle
  size, load time, and frame pacing before the scene is accepted.
- Bevy remains a native runtime adapter that loads the same bundle. V3 should
  not expose Bevy-specific authoring APIs.
- Instancing or batching is required for repeated vegetation, rocks, mushrooms,
  flowers, pebbles, and grass clusters when raw entity placement would exceed
  web budgets.
- Terrain/path support should be just enough for the winding forest path and
  walkable surface; a general terrain editor is out of scope.
- First-person support means keyboard movement, pointer-lock mouse look on web,
  native mouse capture, camera height/speed configuration, camera bookmarks, and
  collision/walkability for the scene.
- Rendering atmosphere is scoped to directional sun, ambient fill, fog or haze,
  sky color, shadows, and color management needed by the forest scene.
- Visual verification is a hard V3 gate. It compares bookmarked camera views
  against useful scene properties and the `Preview_2.jpg` target, with the goal
  of making the bundled scene as close as practical to the reference image. The
  gate uses automated composition checks plus recorded manual visual review; it
  is not a pixel-perfect image-diff requirement.
- Excluded from V3: mobile app-store packaging, MCP control plane, general
  visual editor, multiplayer, arbitrary terrain editor, skeletal animation state
  machines, broad Drei/R3F compatibility, custom shaders, postprocessing chains,
  advanced material graphs, and general production template catalogs.

## Ticket Order

| Order | Ticket | Depends On | Outcome |
| --- | --- | --- | --- |
| 0 | [V3-00 Roadmap and Contract Alignment](./V3-00-roadmap-and-contract-alignment.md) | V2 complete | V3 docs, schemas, exclusions, and gates agree on the first-person forest scene proof. |
| 1 | [V3-01 Scene Asset Bundling and Budgets](./V3-01-scene-asset-bundling-and-budgets.md) | V3-00 | Environment glTF, `.bin`, and textures package into a deterministic, validated bundle with web-first budgets. |
| 2 | [V3-02 Three.js Performance and Instancing](./V3-02-threejs-performance-and-instancing.md) | V3-01 | Repeated scene props render through Three.js instancing or batching with measured frame/load artifacts. |
| 3 | [V3-03 Environment Scene Authoring](./V3-03-environment-scene-authoring.md) | V3-01, V3-02 | Terrain/path, hero placements, and deterministic scatter data can describe the forest composition. |
| 4 | [V3-04 Rendering Atmosphere Parity](./V3-04-rendering-atmosphere-parity.md) | V3-01, V3-03 | Sun, ambient fill, fog/haze, sky color, shadows, and color management map to web and Bevy. |
| 5 | [V3-05 First-Person Camera and Controls](./V3-05-first-person-camera-and-controls.md) | V2 input/time, V3-03 | Web pointer-lock and native mouse capture drive a portable first-person camera. |
| 6 | [V3-06 Walkability and Scene Collision](./V3-06-walkability-and-scene-collision.md) | V2 physics, V3-03, V3-05 | The player camera stays on the walkable path and collides with blocking scene props. |
| 7 | [V3-07 Scene Visual Verification](./V3-07-scene-visual-verification.md) | V3-02 through V3-06 | Automated screenshots and performance measurements verify bookmarked forest views. |
| 8 | [V3-08 Environment Demo Template](./V3-08-environment-demo-template.md) | V3-01 through V3-07 | A maintained V3 example/template builds the full first-person forest scene. |
| 9 | [V3-09 Release Gate and Docs Consistency](./V3-09-release-gate-and-docs-consistency.md) | All V3 tickets | `verify:v3`, docs checks, bundle validation, web performance, visual checks, and native smoke gate V3. |
| 10 | [V3-10 Preview_2 Visual Fidelity and Runtime Parity](./V3-10-preview2-visual-fidelity-and-runtime-parity.md) | V3-09 | Close remaining Preview_2 visual fidelity, path metadata, and Three.js/Bevy rendering parity gaps before calling V3 complete. |

## V3 Acceptance Criteria

- The V3 example builds one portable bundle from `assets-source/environment` and
  deterministic scene composition data.
- The scene visibly matches `Preview_2.jpg` at the product level: dense stylized
  woodland, central path, layered foreground/background vegetation, rocks,
  mushrooms, flowers, warm sunlight, and atmospheric depth.
- The Three.js web preview remains performant under the V3 budget and reports
  load/frame timing, draw-call counts, instance counts, and asset sizes.
- The same bundle loads in the Bevy runtime and reaches a first-person camera
  view without target-specific authoring code.
- The validator catches missing assets, unsupported formats, unsupported target
  capabilities, and over-budget content before runtime where practical.
- Visual verification artifacts prove nonblank output, bookmarked camera
  framing, representative asset presence, close-as-practical target
  composition, recorded manual review, and web performance measurements.
- Unsupported V3-adjacent APIs fail with explicit diagnostics.

## Release Gate

Run the V3 candidate gate before treating V3 as complete:

```bash
pnpm verify:v3
pnpm verify:conformance
pnpm check:docs:v3
```

`pnpm verify:v3` should build the environment demo, validate every emitted IR and
asset manifest, run web visual and performance checks, run a native Bevy load
smoke, save screenshots and measurements, and fail on missing assets,
unsupported target capabilities, over-budget web output, absent manual visual
review, or a scene that does not bundle into a close practical match for
`Preview_2.jpg`.

## Checkpoint Protocol

After each implementation phase in every V3 ticket, spawn the automated PRD
reviewer:

```txt
subagent_type: prd-work-reviewer
prompt: Review checkpoint for phase N of PRD at docs/PRDs/v3/<ticket>.md
```

Continue only when the reviewer reports PASS, or update the PRD with the
accepted scope change before proceeding.
