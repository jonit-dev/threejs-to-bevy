# Battle of the Pacific Flight Slice

## Goal and scope

- Project: `examples/battle-of-pacific`
- Plan date: 2026-07-23
- Planner result: `TN_GAME_PLAN_OFF_RECIPE`
- Authoring mode: custom structured source on the starter
- Playable loop: keep one Douglas SBD-3 in controlled powered flight over the
  Pacific for 45 seconds.
- Controls: W/S pitch, A/D roll, Q/E rudder, Shift/Control throttle, F flaps,
  R retry.
- Objective: sustain flight without stalling or ditching.
- Progression: `FlightState.progress` advances to `1`.
- Fail/retry: altitude loss produces `DITCHED`; R or the React button restores
  the cruise pose, velocity, control state, and animation.

## Source ownership

| Surface | Durable owner | Proof |
| --- | --- | --- |
| Flight physics and controls | `src/scripts/flight.ts`, `content/scenes/arena.scene.json` | acceptance input/objective playtests |
| Aircraft animation | `content/generators/aircraft.douglas-sbd3.recipe.json`, aircraft asset manifest | animation assertion and per-step screenshots |
| Aircraft provenance | `content/generators/*.json`, `content/assets/*.json`, `assets/imported/` | asset inspect and model test |
| Ocean, wind, lighting, camera | `content/scenes/arena.scene.json`, materials/meshes/runtime docs | iterate screenshot and scale proof |
| React flight deck | `overlay/flight-deck/src/*`, `content/overlays/webview.overlays.json` | overlay build, screenshot, event-backed resource proof |
| Retry and progress | `src/scripts/flight.ts`, `FlightState` | acceptance fail/retry and objective playtests |

## Animation and scale

- Source model bounds: 2.0 x 0.619 x 1.583 units.
- Visual scale: 6.325, yielding a 12.65 m span and about 10.0 m length.
- Physics mass: 4,200 kg; main wing area: 30.2 m².
- Active powered clips: `flight.cruise`, `flight.pitch`, `flight.rudder`,
  `flight.flaps`, `flight.flaps-down`, and `flight.flaps-retract`.
- The propeller remains active in every powered composite clip. Cruise uses a
  high playback rate so the blades are only intermittently legible, matching a
  running radial engine better than a slowly readable prop.

## Polish and proof checklist

- [x] Recognizable imported hero aircraft with source materials.
- [x] Ocean, sky, seeded gusts, lighting, chase camera, and collision surface.
- [x] Portable lift, drag, stall/recovery, thrust, control surfaces, and
      rotational airframe damping.
- [x] Live React instruments, objective feedback, stall warning, and retry.
- [x] Prompt-specific input, progression, and fail/retry scenarios.
- [x] Rerun final web iterate after the last animation/damping adjustment.
- [x] Run scale proof and desktop target playtest (both `TN_..._OK`; desktop
      playtest proves movement, FlightState, and flight.cruise animation).
- [x] Run production score/QA and record any scope-based release blockers
      (score/QA/release all pass; out-of-scope audio, reward, loading,
      settings, and touch-control surfaces are recorded in
      `artifacts/game-production/scope-blockers.json`).

## Live-play fixes (2026-07-23)

- Keyboard now reaches the game while the fullscreen flight-deck overlay is
  focused (engine fix: pointer-mode web overlay frames forward keyboard).
- Control surfaces deflect with stick direction via directional hold clips
  (`flight.pitch-up/down`, `flight.rudder-left/right`) instead of looping
  oscillation clips.
- Ocean uses a seamless procedural wave normal map
  (`assets/generated/ocean-wave-normal.png`, tiled 420x) with specular water
  tuning. An engine-level animated water material preset remains a recorded
  follow-up; the portable shader IR has no operator grammar yet.

## Flight-model fixes (2026-07-23, second pass)

- Engine: the aerodynamic angle-of-attack sign was inverted on both adapters,
  making lift feedback destabilizing (any sink reduced lift). Fixed with
  regression tests; the paired aero parity gate passes.
- Scene retune: rigid-body damping 0.035 -> 0.004 (aero drag already models
  it), thruster maxForce 15.5 kN -> 21 kN, stowed-flap parasitic drag
  0.11 -> 0.02 and stowed-flap lift zeroed (its baseline lift trimmed the
  aircraft 7.5 degrees nose-down), wing CL0 0.58, wider stall envelope
  (0.42/0.34), elevator deflection 0.16.
- Script: elevator sign corrected (W climbs), A/D fly coordinated banked
  turns (yaw torque + velocity rotated by the actual yaw rate each tick, with
  cosmetic visual bank); the physics body never rolls, so knife-edge crashes
  are impossible. Q/E remains rudder with the same coordinated turn support.
- Regression scenarios kept in `playtests/`: `probe-long-cruise` (30 s
  hands-off cruise), `probe-pitch-hold` (W-hold climbs), `probe-roll`
  (full-stick sustained turn keeps altitude).
