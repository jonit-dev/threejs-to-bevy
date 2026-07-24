---
id: projectile-mechanic
goal: Add a portable projectile that fires, travels, impacts, respects cooldown, and cleans itself up.
category: gameplay
scriptPath: src/scripts/player.ts
surfaces:
  - projectile
  - input
  - physics
keywords:
  - bullet
  - fire
  - launch
  - shoot
  - cooldown
blocks:
  - projectile.*
---

## commands
```bash
tn add projectile --launcher player --projectile projectile.basic --project . --json
```

## source-delta
```json
{"content/input/arena.input.json":"launch is bound to Space.","content/prefabs/projectile.basic.prefab.json":"The projectile root declares Transform, RigidBody, and Collider.","content/systems/arena.systems.json":"run-projectile owns eight exact instantiate/despawn slots, pose, velocity, raycast impact, and cooldown.","playtests/block-projectile.playtest.json":"The transition proof retains transient raycast evidence and observes impact cleanup.","playtests/block-projectile-cooldown.playtest.json":"The negative control proves a second immediate press is rejected."}
```

## script
```ts
import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    transform.position = Vector3.add(transform.position, [context.input.getAxis("MoveX") * context.time.fixedDelta * 2.4, 0, 0]);
  }
}
```

## proof
```bash
tn playtest --project . --scenario playtests/block-projectile.playtest.json --stable-artifacts --json
tn playtest --project . --scenario playtests/block-projectile-cooldown.playtest.json --stable-artifacts --json
```

The generated prefab and system are the lifecycle owners. Customize speed,
cooldown, lifetime, and launcher through `ProjectileLauncher`; do not create a
second timer or hand-maintained projectile pool. Installation fails before its
first write if any owned ID, path, action, system, or script export already
exists. `tn remove projectile` removes the input action, system, prefab
document, resources, script export, target, and both proof scenarios.
