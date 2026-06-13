# V1 Canonical Example

This example exercises the V1 SDK subset with one scene, a player-like box, a
floor plane, a secondary sphere, a camera, and a directional light.

Run from the repository root:

```bash
pnpm tn -- validate --project examples/v1-canonical
pnpm tn -- build --project examples/v1-canonical
pnpm tn -- dev --target web --project examples/v1-canonical
pnpm tn -- dev --target desktop --project examples/v1-canonical
pnpm tn -- verify --project examples/v1-canonical --frames 2 --json
```

Expected result:

- `validate` exits successfully.
- `build` emits `examples/v1-canonical/dist/game.bundle`.
- `dev --target web` opens a web preview for the generated bundle.
- `dev --target desktop` starts the Bevy runtime with the same bundle.
- `verify` captures web screenshots, checks canvas readiness, detects blank output,
  compares frames, and writes `artifacts/verify/verification-report.json`.
