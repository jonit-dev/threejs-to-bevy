# Firefly Grove Keeper

A low-poly moonlit garden game built from structured source. Guide the firefly
with WASD or arrow keys, gather pollen sparks, light three lantern flowers, and
return to the hollow stump before dawn while avoiding drifting moth shadows.

## Proof Commands

```bash
node ../../packages/cli/dist/index.js authoring validate --project . --json
node ../../packages/cli/dist/index.js build --project . --json
node ../../packages/cli/dist/index.js validate --project . --json
node ../../packages/cli/dist/index.js verify --project . --frames 3 --expect-motion --json
node ../../packages/cli/dist/index.js playtest --project . --entity player --press KeyD --frames 30 --expect-moved --expect-axis x --json
```
