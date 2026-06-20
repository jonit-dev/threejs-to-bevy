# V5 Game Starter Template

This starter demonstrates the V5 game-first authoring path. It uses
`defineGame`, `defineSceneModule`, `defineWorldModule`, and `defineInputModule`
to compose an existing portable scene, world, input map, runtime config, and
systems without introducing a new runtime contract.

Run:

```bash
pnpm install
pnpm run build
pnpm run validate
pnpm run verify
pnpm test
```

The starter stays inside current V5 scope: no editor, networking, raw Three.js
runtime access, public plugin API, custom renderer, or direct Bevy APIs.

`src/game.ts` is only the composition root. Scene assembly lives under
`src/scenes/`, input lives under `src/input/`, and portable behavior lives under
`src/scripts/` as module/export references so generated bundles include script
manifest provenance.
