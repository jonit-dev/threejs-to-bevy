---
id: advanced-physics-destruction
goal: Bake and attach a bounded portable fracture manifest to a destructible prop.
category: physics
scriptPath: src/scripts/destruction.ts
surfaces:
  - destruction
  - fracture
  - physics
keywords:
  - breakable
  - debris
  - damage
---

## commands
```bash
tn physics fracture generate wall.main --recipe '{"kind":"primitive","cells":[2,2,1],"dimensions":[4,2,0.5],"bondHealth":100,"impulseThreshold":40}' --seed 7 --max-active-pieces 4 --overflow-policy sleep-oldest --out content/fractures/wall.main.json --project . --json
tn physics fracture inspect content/fractures/wall.main.json --project . --json
tn physics fracture validate content/fractures/wall.main.json --project . --json
tn scene add-entity arena wall --project . --json
tn scene set-component arena wall Destructible --value '{"fractureManifest":"fractures/wall.main.json","activationBudget":4,"maxDepth":2,"cleanupPolicy":"sleep","impactFilter":{"minImpulse":5,"layers":["projectile"]}}' --project . --json
```

## source-delta
```json
{"content/fractures/wall.main.json":"Compiler-owned seeded fracture manifest with stable pieces, adjacency bonds, mass fractions, and budgets.","content/scenes/arena.scene.json":"wall references the bundle-relative fracture manifest through Destructible."}
```

## script
```ts
import type { ScriptContext } from "@threenative/script-stdlib";

export function observeDestruction(_context: ScriptContext): void {
  // Phase 6 contact and explicit-damage wiring owns mutation at fixed-tick runtime boundaries.
  void _context;
}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```

The generated JSON is durable source under `content/fractures`; `tn build`
validates it and copies it to the referenced bundle path. Piece and bond IDs are
stable for the same source and seed. Runtime activation remains bounded by both
the manifest and `Destructible` overrides, and overflow is always event-visible.
