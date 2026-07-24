---
id: advanced-physics-aerodynamics
goal: Author a portable aircraft with control surfaces, thrust, wind, and web/native flight proof.
category: physics
scriptPath: src/scripts/flight.ts
surfaces:
  - aircraft
  - aerodynamics
  - wind
keywords:
  - aerodynamics
  - aircraft
  - flight
  - lift
  - stall
  - thruster
  - wind
---

## commands
```bash
tn scene add-entity arena craft --project . --json
tn scene add-component arena craft rigid-body --kind dynamic --mass 80 --project . --json
tn scene add-component arena craft collider --kind box --size 2,1,4 --project . --json
tn physics aerodynamics add arena craft --body '{"dragArea":[1,0.5,2],"maxForce":5000,"surfaces":[{"id":"main-wing","area":2,"aspectRatio":5,"centerOfPressure":[0,0,0.5],"liftCurve":[{"angle":-1,"coefficient":-0.5},{"angle":1,"coefficient":0.5}],"dragCurve":[{"angle":-1,"coefficient":0.1},{"angle":1,"coefficient":0.1}],"stallAngle":0.5,"recoveryAngle":0.3}],"thrusters":[{"id":"main-engine","direction":[0,0,-1],"point":[0,0,1.8],"maxForce":2000,"response":60,"throttle":0,"binding":"Throttle"}]}' --project . --json
tn scene add-entity arena gust --project . --json
tn physics wind add arena gust --volume '{"shape":"box","size":[20,10,20],"velocity":[2,0,0],"airDensity":1.1,"gust":{"amplitude":[1,0,0],"frequency":0.5,"seed":7}}' --project . --json
tn physics aerodynamics inspect arena craft --project . --json
tn physics aerodynamics validate arena craft --project . --json
tn physics wind inspect arena gust --project . --json
tn physics wind validate arena gust --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"craft owns AerodynamicBody and gust owns WindVolume; both payloads are validated by the IR contract."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function fly(context: ScriptContext): void {
  context.physics.aerodynamics.setInputs("craft", {
    surfaces: { elevator: context.input.getAxis("Pitch") },
    thrusters: { "main-engine": context.input.action("Throttle") ? 1 : 0 },
  });
}
```

`AerodynamicBody` is the durable component owner. Its `surfaces` define lift,
drag, stall/recovery angles, and control authority; its `thrusters` define
bounded force and optional fuel hooks. `WindVolume` owns local wind, density,
and deterministic seeded gusts. Keep the craft on a dynamic `RigidBody` with a
matching `Collider`, and declare the flight system's component access in
`systems.ir.json`.

For deterministic script-owned aircraft, boats, or missiles, use
`GuidedFlightEx.step(...)` to calculate bounded yaw, climb, and speed
convergence, then write its returned linear and angular velocity once per
fixed tick. Use `CoordinatedTurnEx.step(...)` when a dynamic player aircraft
keeps the aerodynamic integrator but needs a pinned no-sideslip turn assist.
Keep the gains explicit and cover the chosen constants with a fixed-tick
numeric test or committed turn-radius playtest; do not feed an unnamed body
through two competing flight models.

## proof
```bash
tn playtest --scenario playtests/flight-course.playtest.json --target web --reuse-bundle --out artifacts/playtest/flight-course/web --json
tn playtest --scenario playtests/flight-course.playtest.json --target desktop --reuse-bundle --out artifacts/playtest/flight-course/desktop --json
pnpm verify:focused verify:advanced-physics-aerodynamics
```

The committed maneuver should include ground contact, powered takeoff, a stall,
recovery, wind-volume entry and exit, and a settled landing. Review force-vector
debug output against the motion, and keep both target summaries hash-bound to
the same bundle and structured-source revision.
