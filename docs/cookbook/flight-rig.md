---
id: flight-rig
goal: Share portable aircraft controls and telemetry without copying a game-specific flight script.
category: gameplay
scriptPath: src/scripts/flight.ts
surfaces:
  - flight
  - input
  - physics
keywords:
  - aircraft
  - aerodynamics
  - flight
  - stall
  - throttle
---

## commands
```bash
tn help playtest --json
```

## source-delta
```json
{"content/input/arena.input.json":"Declare project-owned pitch, roll, yaw, throttle, and retry actions.","content/scenes/arena.scene.json":"The aircraft owns Transform, RigidBody, and AerodynamicBody; surface and thruster IDs remain project data.","content/systems/arena.systems.json":"The fixed-update system declares aerodynamic input, torque, velocity, and reset services.","src/scripts/flight.ts":"The project samples its declared inputs and passes values, IDs, and tuning into FlightRig.step."}
```

## script
```ts
import { FlightRig, type ScriptContext } from "@threenative/script-stdlib";

export function updateFlight(context: ScriptContext): void {
  const aircraft = context.entity("aircraft");
  if (aircraft === undefined) return;
  const body = aircraft.get("RigidBody", {
    angularVelocity: [0, 0, 0] as [number, number, number],
    velocity: [0, 0, -60] as [number, number, number]
  });
  const state = context.state("flight-rig", FlightRig.initialState({ initialThrottle: 0.7 }));
  const result = FlightRig.step(
    state,
    {
      pitch: context.input.getAxis("pitch"),
      roll: context.input.getAxis("roll"),
      throttleDown: context.input.getButton("throttle-down"),
      throttleUp: context.input.getButton("throttle-up"),
      yaw: context.input.getAxis("yaw")
    },
    {
      altitude: aircraft.transform().position[1],
      angularVelocity: body.angularVelocity,
      dt: context.time.fixedDelta,
      velocity: body.velocity
    },
    {
      aileronLeft: "aileron.left",
      aileronRight: "aileron.right",
      elevator: "elevator",
      thruster: "main-engine"
    }
  );
  Object.assign(state, result.state);
  context.physics.aerodynamics.setInputs("aircraft", result.controls);
  context.physics.addTorque("aircraft", result.torque);
  context.physics.setLinearVelocity("aircraft", result.velocity);
}
```

## proof
```bash
tn playtest --project . --scenario playtests/acceptance-flight-pitch-sign.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/acceptance-flight-roll-sign.playtest.json --target desktop --stable-artifacts --json
```

`FlightRig` owns deterministic throttle integration, control sign mapping,
coordinated turn velocity, and stall/ditch/retry telemetry. The project still
owns entity and action lookup, aerodynamic IDs, tuning, objectives, combat,
effects, and audio calls. `AudioCueEx`, `PropellerEx`, and `BoresightEx` return
pure intent/value data; none expose renderer, audio-backend, DOM, or native
handles.
