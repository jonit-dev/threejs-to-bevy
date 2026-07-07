# Game Production Status

Generated games and playable examples are treated as small polished vertical
slices, not blockouts.

Current support:

- Planning, cookbook, recipe, iterate, playtest, QA, score, and release
  workflows exist for structured-source games.
- `verify:generated-games` is being narrowed to representative release
  evidence, while de-enrolled examples remain covered by a cheaper build-only
  sweep.
- Finished examples must prove build, nonblank screenshots, visible motion,
  input playtests, visual quality, and source ownership.
- V2 token-cost benchmark evidence still fails the <=0.5x raw-token target on
  historical pilot data, so scaffold-first game planning remains active until a
  fresh post-fix rerun proves otherwise.

Verification:

- `pnpm verify:generated-games`
- `pnpm verify:example-build-sweep`
- `pnpm verify:smoke`
- `tn iterate --project . --json`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
