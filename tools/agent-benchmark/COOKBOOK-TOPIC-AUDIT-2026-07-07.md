# Cookbook Topic Audit - 2026-07-07

PRD-006 asked for compact few-shot pattern pairs because agents were grepping
engine internals when API-card coverage ran out. The repository already has the
main cookbook surface from the earlier agent-ergonomics cookbook PRD:

- 18 validated entries under `docs/cookbook/*.md`.
- Entry contract in `docs/cookbook/FORMAT.md`.
- `tn cookbook list/show --json`.
- Generated starter `AGENTS.md` guidance.
- `pnpm verify:cookbook`.

Observed needs from benchmark and audit artifacts map to existing entries:

| Observed Need | Existing Entry |
| --- | --- |
| WASD/arrow player movement | `player-move-wasd` |
| HUD score/status binding | `hud-score-binding` |
| Follow camera | `follow-camera` |
| Collectible placement/respawn | `collectible-respawn` |
| Trigger zone / win objective | `trigger-zone-win` |
| Physics knockdown target | `physics-knockdown` |
| Kinematic hazard | `kinematic-hazard` |
| Fail/retry state | `fail-retry-reset` |
| Lane runner scaffold | `lane-runner-spawn` |
| Checkpoint race progress | `checkpoint-race-progress` |
| Material pass | `materials-pass` |
| Catalog asset provenance | `catalog-asset-provenance` |

Gap closed in this PRD slice:

- `tn cookbook <id> --json` now works as a direct shorthand for
  `tn cookbook show <id> --json`, matching the PRD user flow and reducing
  command tokens.

Deferred:

- Benchmark transcript ratchet for engine-internal greps. Existing evidence is
  qualitative; a robust check should classify `rg` targets and covered topics
  in the benchmark analyzer.
