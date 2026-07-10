---
id: physics-knockdown
goal: Add a dynamic target body for knockdown or push mechanics.
category: physics
scriptPath: src/scripts/player.ts
surfaces:
  - target
  - physics
---

## commands
```bash
tn scene add-prefab arena prefab.target --primitive box --color "#f97316" --project . --json
tn scene add-entity arena target.01 --prefab prefab.target --project . --json
tn scene set-transform arena target.01 --position -1,0.4,-1 --project . --json
tn physics add-rigid-body arena target.01 --kind dynamic --mass 1 --project . --json
tn physics add-collider arena target.01 --kind box --size 0.5,0.5,0.5 --project . --json
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

export function physicsKnockdown(): void {}
```

## proof
```bash
tn authoring validate --project . --json
tn build --project . --json
```

## character-push

For a kinematic character that should launch a permitted dynamic body instead
of moving it by pose alone, enable the rig's opt-in velocity handoff and declare
both component writes on the owning system:

```ts
CharacterRig.update(context, player, { applyPushVelocity: true });
```

```json
{
  "writes": ["RigidBody", "Transform"]
}
```

The player's `CharacterController.pushPolicy` still owns allowed layers, mass
limits, and impulse scaling. Keep the rendered sphere radius equal to its
`Collider.radius`; primitive sphere `size[0]` is a radius, not a diameter.

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
