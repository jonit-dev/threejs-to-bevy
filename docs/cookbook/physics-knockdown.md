---
id: physics-knockdown
goal: Add a dynamic target body for knockdown or push mechanics.
category: physics
scriptPath: src/scripts/player.ts
surfaces:
  - target
  - physics
keywords:
  - physics
  - knock
  - knockdown
  - throw
  - projectile
  - target
  - push
---

## commands
```bash
tn add physics-target --count 5 --prefix target --project . --json
```

## source-delta
```json
{"content/scenes/arena.scene.json":"target.01 is a dynamic rigid body with a box collider."}
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

export function physicsKnockdown(context: ScriptContext): void {
  const state = context.state("physics-target", { hit: false, impulse: 0 });
  state.impulse = Math.max(0, state.impulse);
}
```

## proof
```bash
tn iterate --project . --json
```

Use the compact game-plan match as the front door: run `tn game plan`, show
this cookbook entry from its emitted `cookbookId`, apply the bounded target
commands, add the script-owned score/retry behavior plus one committed
scenario, and run `tn iterate` once. Do not open the planning worksheet,
sibling agent skills, or deep artifacts unless the plan/iterate diagnostic
says a required field or repair path is missing.

## character-push

For a kinematic character that should push a permitted dynamic body, author the
character's `pushPolicy` and let the runtime physics solver own the dynamic
body's transform and velocity:

```ts
CharacterRig.update(context, player);
```

```json
{
  "writes": ["Transform"]
}
```

The player's `CharacterController.pushPolicy` still owns allowed layers, mass
limits, and impulse scaling. `CharacterRig` reports the `pushed` observation but
does not pose or accelerate the dynamic body; doing both would apply the same
movement twice around the solver step. Keep the rendered sphere radius equal to
its `Collider.radius`; primitive sphere `size[0]` is a radius, not a diameter.

For a grounded kinematic jump, bind an input action and let the same rig retain
the vertical offset and gravity state:

```ts
CharacterRig.update(context, player, {
  gravity: 14,
  jumpAction: "jump",
  jumpSpeed: 5.2,
});
```

The input document should bind `jump` to `keyboard.Space`. If the model has no
jump clip, keep the physical jump and use the existing locomotion animation
rather than inventing a missing source clip.
