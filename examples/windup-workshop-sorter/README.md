# Windup Workshop Sorter

A cozy top-down toy-workshop sorter built from structured source. Guide the
wind-up mouse with WASD or arrow keys, collect glowing gears, charge three
repair bays, dodge rolling marbles, then return to the finished-toy crate before
the clock runs out.

## Proof Commands

```bash
node ../../packages/cli/dist/index.js authoring validate --project . --json
node ../../packages/cli/dist/index.js build --project . --json
node ../../packages/cli/dist/index.js verify --project . --frames 3 --expect-motion --json
node ../../packages/cli/dist/index.js playtest --project . --entity player --press KeyD --frames 30 --expect-moved --expect-axis x --json
```
