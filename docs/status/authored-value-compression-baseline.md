# Authored-Value Compression Baseline

Date: 2026-07-12

This snapshot records the pre-implementation baseline for
`authored-value-compression-placement-interactions.md`. Counts come from a
structured walk of `examples/*/content/**/*.json` and
`examples/*/src/scripts/**/*.ts` before PlacementSet or Interaction existed.

## Repository baseline

| Measure | Value |
| --- | ---: |
| Durable JSON files | 112 |
| Durable JSON bytes | 283,143 |
| Durable JSON physical lines | 12,786 |
| Gameplay TypeScript files | 13 |
| Gameplay TypeScript physical lines | 1,339 |
| Top-level authored entity declarations | 503 |
| Top-level authored system declarations | 18 |
| Top-level authored resource declarations | 14 |
| Runnable examples (`examples/*/package.json`) | 9 |

Entity, system, and resource counts are source declarations, not deduplicated
runtime entities. They include declarations in every durable structured-source
document matched by the walk.

## Migration targets

| Example | JSON files | JSON bytes | JSON lines | Entity declarations |
| --- | ---: | ---: | ---: | ---: |
| Dense World Benchmark | 11 | 66,746 | 3,952 | 227 |
| Chess | 25 | 68,975 | 3,487 | 84 |
| Orb Reactor | 17 | 21,001 | 1,165 | 10 |
| Metro Surfer Heist | 7 | 22,000 | 267 | 49 |
| Coin Patrol | 13 | 15,938 | 901 | 13 |

The dominant individual scene sources are:

- Dense World Benchmark arena: 61,894 bytes, 3,702 lines, 226 entities.
- Chess scene: 57,594 bytes, 2,880 lines, 84 entities.
- Orb Reactor arena: 10,683 bytes, 614 lines, 9 entities.
- Metro Surfer Heist arena: 14,241 bytes, 136 lines, 49 entities.

For the PRD's whole-scene Dense reduction, the 60% target is at most 24,757
bytes while retaining 226 expanded entities. Chess's 30% requirement applies
to selected placement groups, so the migration report must record the exact
covered-group byte denominator rather than claiming a reduction from the whole
scene. The aggregate 50% repeated-placement target must likewise use an
explicit list of covered groups and files.

## Collision inventory

No PlacementSet source contract, shared Interaction IR, or required
`TN_PLACEMENT_*` / `TN_INTERACTION_*` diagnostics existed at baseline.
Existing controllers, rigs, queries, countdowns, GameFlow, Sequence,
archetypes, recipes, UI bindings, and feedback presets are adoption targets;
they are not contracts to replace. Chess rules, Metro lane/height recycling,
bespoke AI, procedural behavior, and complex physics remain local domain
logic.

Known adoption debt includes Coin Patrol's hard-coded collectible and drone ID
arrays and copied intro/flow documents across canonical examples.

## Benchmark evidence gap

Existing agent and session-cost reports do not exercise equal-proof
PlacementSet or Interaction authoring prompts. They therefore cannot prove the
required 30% TypeScript, 50% JSON, or 30% authoring/repair-operation deltas.
Before making those claims, run matched baseline and migrated prompts for:

- Dense, Chess, Orb, and Metro repeated placement;
- Orb Reactor and Coin Patrol objective loops.

Each run must record source hashes, covered groups, operations, repair
operations, failed commands, raw tokens, uncached tokens, and tool-output
bytes. The current session-cost report is not a substitute: it contains a
failing typed-spec collector path and unrelated prompt shapes.
