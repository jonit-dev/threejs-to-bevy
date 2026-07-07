# Metro Surfer Heist

Metro Surfer Heist is a web-first ThreeNative vertical slice: a three-lane
metro runner where the player switches lanes, jumps red barriers, ducks low
gates, collects coins, avoids trains, and retries quickly after a crash.

## Play

Controls:

| Action | Keys |
| --- | --- |
| Move left | `A`, `ArrowLeft` |
| Move right | `D`, `ArrowRight` |
| Jump | `W`, `ArrowUp`, `Space` |
| Duck | `S`, `ArrowDown` |
| Retry | `R`, `Enter` |

Objective: collect 12 coins and run 260 meters without crashing.

## Source

- Durable data: `content/**/*.json`.
- Durable behavior: `src/scripts/player.ts`.
- Generated output: `dist/**`, emitted bundle JSON, and `scripts.bundle.js`.
- Production metadata: `threenative.config.json`.

## Useful Commands

From the repo root:

```bash
node packages/cli/dist/index.js authoring validate --project examples/metro-surfer-heist --json
node packages/cli/dist/index.js build --project examples/metro-surfer-heist --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/smoke-movement.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/progression.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js playtest --project examples/metro-surfer-heist --scenario playtests/fail-retry.playtest.json --stable-artifacts --json
node packages/cli/dist/index.js game qa --project examples/metro-surfer-heist --run-proof --entity runner --press KeyD --expect-axis x --json
node packages/cli/dist/index.js game release --project examples/metro-surfer-heist --json
```

## Release Evidence

- Production plan: `artifacts/game-production/plan.json`.
- QA report: `artifacts/game-production/qa-report.json`.
- Release report: `artifacts/game-production/release-report.json`.
- Screenshot: `artifacts/game-production/screenshot.png`.
- Motion proof: `artifacts/game-production/motion.webm`.
- Visual-quality sidecar: `artifacts/game-production/visual-quality.json`.
- Release notes: `RELEASE.md`.
- Friction report: `FRICTION.md`.
- Credits and provenance: `CREDITS.md`.

Current limitation: the game is release-ready locally, but there is no external
public hosting URL recorded in this repo. See `FRICTION.md`.
