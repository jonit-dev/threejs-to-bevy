# Asteroid Mail Runner

A low-poly space courier slice built from structured source. The player pilots a mail ship through torus checkpoint gates, collects data capsules, avoids moving asteroids, and docks at the beacon before fuel runs out.

Controls:

- `A` / `D` or arrow keys: strafe
- `W` / `S` or arrow keys: thrust along the route
- `Space`: retry after win or fail

Proof commands:

```bash
node ../../packages/cli/dist/index.js authoring validate --project . --json
node ../../packages/cli/dist/index.js build --project . --json
node ../../packages/cli/dist/index.js verify --project . --frames 3 --expect-motion --json
node ../../packages/cli/dist/index.js playtest --project . --entity player --press KeyD --frames 30 --expect-moved --expect-axis x --json
```

