# Agent Learnings - 2026-07-07

This note summarizes the agent behavior observed while working through the
agent-native authoring PRD sequence. It is intentionally tied to raw artifacts
so the conclusions can be rechecked instead of treated as taste.

## Raw Data

- Off-recipe benchmark report:
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/REPORT.md`
- Off-recipe aggregate JSON:
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/aggregate-output.json`
- Off-recipe per-run evidence:
  `tools/verify/artifacts/agent-benchmark/off-recipe-2026-07-07/*/run-report.json`
  and `*/score-output.json`
- Scaffold-first token rerun report:
  `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/REPORT.md`
- Scaffold-first raw event logs:
  `tools/verify/artifacts/agent-benchmark/scaffold-first-token-rerun-2026-07-07b/logs/*.events.jsonl`
- API shape audit:
  `tools/agent-benchmark/API-SHAPE-AUDIT-2026-07-07.md`
- Diagnostic failure audit:
  `tools/agent-benchmark/DIAGNOSTIC-FAILURE-AUDIT-2026-07-07.md`
- Mutation surface audit:
  `tools/agent-benchmark/MUTATION-SURFACE-AUDIT-2026-07-07.md`
- Beautiful scaffold proof:
  `docs/pr-evidence/prd-007-beautiful-scaffolds/README.md`
- Native desktop proof:
  `runtime-bevy/artifacts/native-playtest-p0/structured-source-starter/summary.json`
- Webview package proof:
  `tools/verify/artifacts/webview-package/verification-report.json`
- Metro Surfer Heist release candidate:
  `examples/metro-surfer-heist/RELEASE.md`
- Metro Surfer Heist friction log:
  `examples/metro-surfer-heist/FRICTION.md`
- Metro Surfer Heist local static web verification:
  `examples/metro-surfer-heist/artifacts/verify/verification-report.json`
- Metro Surfer Heist Pages workflow:
  `.github/workflows/metro-surfer-heist-pages.yml`
- Metro Surfer Heist playtest note template:
  `examples/metro-surfer-heist/PLAYTEST-NOTE.md`
- Aggregate generated-game report:
  `tools/verify/artifacts/game-production/verification-report.json`

## What Agents Do Well

- Agents follow bounded CLI mutations better than open-ended source edits.
  Structured commands with `--json` outputs produce source changes that can be
  validated and recovered from.
- Compact, familiar API names reduce dialect drift. The API pruning work
  reinforced `Mathf`, `Vector2`, and `Vector3` because agent outputs otherwise
  mixed Unity, Three.js, and project-specific vocabulary.
- Agents respond well to direct proof loops. When a command prints an artifact
  path, diagnostics, and a reproduction command, the next action is usually
  obvious.
- Visual proof materially improves judgment. Screenshot/contact-sheet evidence
  made scaffold quality issues easier to evaluate than textual descriptions.

## Where Agents Struggle

- Agents over-trust stale generated or compiled artifacts. PRD-011 exposed a
  native playtest failure caused by an old Bevy runtime binary even though the
  current bridge behavior was correct.
- Agents treat "release-ready" and "published" as easy to conflate. PRD-012 is
  locally green, including a Pages-shaped static web smoke test, but still
  lacks an external public URL and a human five-minute playtest note.
- Browser bundles can silently inherit Node-only dynamic imports through shared
  convenience modules. The Metro static proof failed until bundle loading,
  system script loading, and `renderBundle(source, ...)` were split so browser
  entries import only fetch/URL-safe modules.
- Off-recipe work creates hidden integration debt. More complex prompts need
  asset provenance, proof artifacts, UI fit, performance, and release notes;
  agents tend to finish the playable slice before closing those loops.
- Example-local scripts are fragile when `tn` is not linked in that package.
  Repo-root CLI commands worked, while `pnpm run build` inside the Metro
  example failed in this checkout with `tn: command not found`.
- Asset sourcing needs a reliable local database. When the SQLite catalog is
  missing, agents fall back to generated/local assets and lose provenance.

## Improvements To Make

- Add a static deploy workflow for release candidates. PRD-012 cannot close
  honestly until a public URL can be produced and smoke-tested. The local
  Pages-shaped shell and GitHub Pages workflow now exist, so the next gap is a
  successful external workflow run plus public URL smoke evidence.
- Add a browser-bundle regression check that greps emitted static assets for
  Node-only filesystem/path imports and runs a local Pages-shaped
  `tn verify --url` smoke test.
- Make generated example scripts resolve the workspace CLI or print a precise
  repair hint. The no-install fallback should be documented in generated
  READMEs.
- Add a release playtest note template. Automated QA is strong, but a shipped
  game PRD also needs a human five-minute session record.
- Require generated/local asset manifests with creation tool, date, license
  posture, and source path. `CREDITS.md` should not have to infer provenance
  from filenames.
- Add stale-binary detection for native proofs. A native playtest should record
  the runtime build hash or warn when the binary predates relevant source
  changes.
- Keep docs status compact and evidence-linked. `docs/STATUS.md` works best as
  an index; detailed proof belongs in capability docs, PRD notes, and artifact
  directories.
- Keep representative game gates small but real. A short release set catches
  regressions without making every archived/generated example a release
  promise.

## Current PRD State

- PRD-007, PRD-008, PRD-010, and PRD-011 are done and committed.
- PRD-012 is partially proven with Metro Surfer Heist, but remains active
  because public hosting and a human five-minute playtest note are still
  missing.
