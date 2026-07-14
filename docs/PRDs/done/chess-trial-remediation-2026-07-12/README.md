# Chess Trial Remediation (2026-07-12)

Status: complete. Deferred boundaries remain tracked by the completed child
PRDs and current capability documentation.

Fix bundle derived from the Codex-driven chess authoring trial. Trial
evidence and finding numbering (C1-C10) live in
[AUTHORING-TRIAL-CHESS-CODEX-2026-07-12.md](AUTHORING-TRIAL-CHESS-CODEX-2026-07-12.md).

- [PRD-001: Authoring Friction Fixes](../PRD-001-authoring-friction-fixes.md):
  GLB subtree picking, custom-component queryability and typings, render
  profile surfacing, add-time asset validation, `tn asset import`/`repair`,
  catalog relevance and compact output, schema vocabulary aliases and fix
  snippets, `unlit` material kind plus script material patches, game-plan
  path and off-recipe honesty, minimal starter template, camera inspect
  summary. Findings C1, C3-C7, C9, C10.
- [PRD-002: Playtest Loop Trust And Visual Proof](../other/chess-trial-playtest-loop-trust-and-visual-proof.md):
  split visual/gameplay iterate verdicts with `--visual-only`, honest
  artifact summaries, bundle-grounded discovery, game-aware scenario
  suggestions, pixel-level visual assertions, headless desktop proof.
  Finding C8 plus the playtest-adjacent smaller items.

Explicitly deferred (tracked in PRD-001 section 4): scene backdrop/skybox
image node, the generator-owned content contract (C2, overlaps the
editor-ready modular authoring PRD), and Bevy-side unlit/material-patch
parity (freeze-gated by the native path decision).
