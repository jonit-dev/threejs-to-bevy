---
id: flight-diagnostic-probes
goal: Generate exact-tick flight duration, control-sign, and aerodynamic trace proofs from an explicit game plan.
category: physics
surfaces:
  - physics
  - scripts
  - verification
keywords:
  - flight
  - aerodynamics
  - pitch
  - roll
  - duration
  - force
---

State one objective duration in the plan goal. The planner converts that
duration to fixed ticks and refuses to guess when it is missing or conflicting:

```bash
tn game plan --goal "fly an aircraft and remain airborne for 30 seconds" --project . --json
tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json
```

The source scene must expose one entity with `AerodynamicBody`, a flight
observation resource containing `phase` plus altitude or speed, and positive
`pitch` and `roll` keyboard-axis bindings. The observation resource must also
expose a boolean `stall` field. When retry is required, expose a numeric retry
counter plus `retryProof` metadata with `failurePosition`, `failedPhase`, and
`restoredPhase`. Generated scenarios use the project's real IDs and bindings:

- hands-off cruise for the full objective duration;
- positive and negative pitch/roll probes that discover the bound control
  surfaces and assert opposing downstream torque, both surface-input signs,
  finite aerodynamic force telemetry, and `stall: false`;
- a stepped baseline/pitch/roll/rest force trace.
- a retry probe that begins in the declared failure state and proves recovery.

Run the same deterministic scenarios on both adapters. Keep focused DOM input
as the additional web-overlay lane:

```bash
tn playtest --project . --scenario playtests/acceptance-flight-cruise-duration.playtest.json --target web --json
tn playtest --project . --scenario playtests/acceptance-flight-cruise-duration.playtest.json --target desktop --json
```

## commands
```bash
tn authoring validate --project . --json
```

## source-delta
```json
{}
```

## script
```ts

```

## proof
```bash
tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json
```
