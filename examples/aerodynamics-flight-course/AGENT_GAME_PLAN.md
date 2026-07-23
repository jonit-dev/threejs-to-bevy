# Aerodynamics Flight Course Production Plan

Status: implemented and proof-complete on 2026-07-23.

Timing note: the initial implementation was created while this file was still a
blank starter. The retained `artifacts/game-production/plan.json` is a
post-implementation reconstruction. The planner correctly emitted
`TN_GAME_PLAN_OFF_RECIPE`; `tn authoring inspect` confirmed that the custom
flight loop belongs to existing structured source and
`src/scripts/flight.ts`, so no unrelated lane-runner recipe was applied.

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
