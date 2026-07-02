# Lantern Orchard

Lantern Orchard is a structured-source vertical slice: move through a dusk
orchard, collect eight glowing lantern fruit, avoid drifting shadows, and press
Space to replay after a win or failure.

- Durable scene, UI, input, material, system, and prefab data lives in
  `content/**/*.json`.
- Gameplay behavior lives in `src/scripts/lanternOrchard.ts`.
- `dist/**`, emitted IR JSON, and `scripts.bundle.js` are generated output.
- Asset sourcing first queried the SQLite catalog for direct GLB character,
  collectible, environment, and arcade records. Those searches returned no
  matches, so the finished fallback is a cohesive authored low-poly mesh set
  with orchard set dressing rather than unrelated placeholder primitives.

Useful commands:

```bash
pnpm run validate:authoring
pnpm run build
pnpm run playtest
pnpm run verify
pnpm run game:score
pnpm run game:qa
pnpm run game:release
```
