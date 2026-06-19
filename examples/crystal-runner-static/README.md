# Crystal Runner Static

Frozen Crystal Runner layout for cross-runtime visual parity checks. The scene,
camera, lights, and HUD are authored once with no gameplay systems, so web and
Bevy captures stay frame-stable.

```bash
pnpm tn -- build --project examples/crystal-runner-static
pnpm tn -- validate --project examples/crystal-runner-static
pnpm tn -- dev --target web --project examples/crystal-runner-static
pnpm tn -- dev --target desktop --project examples/crystal-runner-static
```

Used by `pnpm verify:baseline:visual-parity`.
