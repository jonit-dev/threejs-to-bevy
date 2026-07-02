# Tidepool Crab Courier

A low-poly tidepool courier game built from structured source. Guide the hermit
crab with WASD or arrow keys, collect shell tokens, charge three beacon shells,
avoid sweeping foam bands and gull shadows, then return to the driftwood hut
before the tide peaks.

## Proof Commands

```bash
node ../../packages/cli/dist/index.js authoring validate --project . --json
node ../../packages/cli/dist/index.js build --project . --json
node ../../packages/cli/dist/index.js verify --project . --frames 3 --expect-motion --json
node ../../packages/cli/dist/index.js playtest --project . --entity player --press KeyD --frames 30 --expect-moved --expect-axis x --json
```
