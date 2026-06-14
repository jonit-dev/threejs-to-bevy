# V6 Functional

Canonical V6 build-smoke scene for common game-engine parity work. It combines
the promoted V6 authoring contracts in one bundle:

- ECS resources, events, systems, commands, and service declarations.
- startup/update/post-update schedules.
- physics colliders and a portable character controller declaration.
- model animation clip metadata and an `animation.play` service call.
- retained UI bindings and bundle-local audio assets.

Run it through the aggregate V6 gate:

```bash
pnpm verify:v6
```
