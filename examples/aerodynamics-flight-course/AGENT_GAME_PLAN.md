# Aerodynamics Flight Course Production Plan

Status: reimplemented after the recorded plan boundary and proof-complete on
2026-07-23.

Historical timing note: the initial implementation was created while this file
was still a blank starter. That prototype is retained at checkpoint
`3ae94543`; it is not represented as plan-first work.

Reimplementation boundary: on 2026-07-23, after checkpointing the inspected
prototype and before any further implementation mutation, `tn game plan` wrote
`artifacts/game-production/plan.json` with SHA-256
`87f2221c7cbb0fae4aae897d1e9eb076c49f31d22b954f3ed4dd7bad3e8053a1`.
The planner emitted `TN_GAME_PLAN_OFF_RECIPE`, and
`tn authoring inspect --plan artifacts/game-production/plan.json` confirmed
that the custom flight loop belongs to the existing structured source and
`src/scripts/flight.ts`. No unrelated recipe was applied. The final
implementation must re-author these owners after this boundary and obtain
fresh proof.

## Playable Loop

- Controls: throttle and pitch through the authored input document; `KeyR`
  retries.
- Objective: launch, cross the gust volume, enter a recorded stall, recover,
  and land.
- Progression: runway acceleration -> takeoff -> gust/stall -> recovery ->
  settled landing.
- Fail/retry: retry restores the craft and `FlightState` for a fresh maneuver.
- Feedback: textured aircraft, runway/wind landmarks, retained objective state,
  and lift/drag/thrust/wind telemetry.

`playtests/flight-course.playtest.json` is the objective proof and must pass
with exact takeoff, stall, recovery, landing, and retry semantics on web and
desktop.

## Reimplementation Owners

- `src/scripts/flight.ts`: express takeoff, gust, stall, recovery, landing, and
  retry as an explicit plan-driven flight sequence.
- `content/scenes/arena.scene.json` and
  `content/systems/arena.systems.json`: retain portable aerodynamic ownership,
  authored wind, and the catalog aircraft while exposing the objective state.
- `playtests/flight-course.playtest.json`: enroll the complete maneuver loop
  against fresh web and desktop source and bundle hashes.
- `content/assets/arena.assets.json`, `docs/asset-provenance.md`, and this
  plan: retain clip wiring, provenance, inspection, and relative-scale checks.

## High-value Surfaces

| Surface | Durable owner | Production treatment |
| --- | --- | --- |
| Hero aircraft | `content/assets/arena.assets.json`, `content/scenes/arena.scene.json` | Repository-supplied Douglas SBD-3 GLB with 22 meshes, 21 materials, embedded textures, and two authored clips. |
| Flight environment | `content/scenes/arena.scene.json` | Authored runway, gust volume/marker, sunlight, and chase camera. |
| Objective/HUD | `content/ui/hud.ui.json` | Retained `FlightState` feedback for maneuver milestones and retry. |
| Audio | `content/assets/arena.assets.json` | Local goal cue; no untracked external audio dependency. |

Asset provenance and redistribution limits are recorded in
`docs/asset-provenance.md`.

## Source Ownership

| Behavior | Structured-source owner | Script/export |
| --- | --- | --- |
| Throttle, pitch, and retry input | `content/input/arena.input.json` | `src/scripts/flight.ts#updateFlightCourse` |
| Aerodynamic surfaces, thrust, wind | `content/scenes/arena.scene.json` | Runtime `AerodynamicBody`/wind components |
| Objective and retry state | `content/systems/arena.systems.json` | `src/scripts/flight.ts#updateFlightCourse` |
| HUD and camera | `content/ui/hud.ui.json`, scene source | `FlightState` plus portable follow camera |

## Animation, Scale, and Polish

- Active model clips: `propeller.spin` and `flaps.deploy`; scene wiring keeps
  the propeller active and uses the flap clip for the flight-control surface.
- Inspection reports 10,416 triangles, 41 nodes, a centered
  2.0 x 0.619 x 1.583 source bound, and an `ok` gameplay-scale verdict.
- The model test renders all 21 authored material identities with loaded
  embedded textures and no fallback material.
- Runway contrast, gust marker, aircraft silhouette, camera separation, and
  landing pose must remain readable in the manual contact sheet.

## Required Proof

```bash
tn authoring validate --project . --json
tn build --project . --json
tn playtest --project . --scenario playtests/flight-course.playtest.json --target web --json
tn playtest --project . --scenario playtests/flight-course.playtest.json --target desktop --json
```

Completion requires exact `takeoff=true`, `stall=true`, `recovered=true`,
`landed=true`, and `retryCount=1`, matching source/bundle hashes, and bounded
web/desktop movement parity.
