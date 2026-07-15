# CLAUDE.md

Keep this file aligned with `AGENTS.md`. See `docs/STATUS.md` for the current
front door and `docs/status/capabilities/*.md` for detailed capability status.

## Work Rules

- Make small, verifiable changes and match existing style, boundaries, names,
  and tests.
- Do not refactor, reformat, delete, revert, or overwrite unrelated work.
- Use structured parsing/serialization for IR and bundle artifacts.
- Keep source ASCII unless the file already has a reason not to.
- Do not add a second hand-maintained adapter list when a descriptor, registry,
  manifest, or config can own the truth. CLI commands, MCP tools, editor
  operations, generated-game proof enrollment, smoke lists, and release gates
  must be derived from the owning source or guarded by a drift test with an
  explicit allowlist.
- When adding a command, operation, example enrollment, or release requirement,
  update the owning registry/config first, then derive help, dispatch, adapter
  argv, editor payloads, and verification coverage from it. If derivation is
  not practical yet, add the smallest consistency test that fails when one
  surface is missed.
- Before coding, identify the durable owner for the behavior and extend it
  rather than copying data, parsers, helpers, fallbacks, or proof into another
  surface. Prefer complete bounded fixes; do not leave TODOs, disabled tests,
  broad casts, silent fallbacks, weakened assertions, or untracked temporary
  bridges. Record any unavoidable bridge's owner, removal condition, and test.
- Fix durable source and prove behavior at the real boundary. Do not edit
  generated artifacts or make unsupported APIs appear supported. Cross-runtime
  changes need positive/negative tests and conformance evidence; systemic debt
  needs a concise quality-status note and bounded follow-up.
- Capability/release-gate changes must update the relevant
  `docs/status/capabilities/*.md` file plus the one-line index entry in
  `docs/STATUS.md`; update `docs/bevy-feature-parity.md` when Bevy parity
  claims or evidence links change.
- Finished PRDs must be moved from active planning folders to
  `docs/PRDs/done`.

## Source Boundary

- Users author TypeScript and structured source; Bevy is adapter-private.
- Durable data lives in `content/**/*.json`; durable behavior lives in
  `src/scripts/**/*.ts`.
- `dist/**`, emitted bundle JSON, and `scripts.bundle.js` are generated output.
- Prefer `tn ... --json` authoring commands and repair diagnostics before
  direct JSON edits.
- Do not author raw Three.js scenes, raw Bevy/Rust gameplay, DOM APIs,
  filesystem access, workers, timers, renderer plugin handles, or native
  runtime handles unless a package capability exposes them.

## Game Work

Before creating or substantially changing a playable game, create or update the
production plan with:

```bash
tn game plan --goal "<game idea>" --project . --json
```

Use catalog-first asset sourcing, author portable physics metadata for physical
mechanics, keep high-value surfaces visually intentional, and prove gameplay
with `tn playtest`. Before release claims, rerun committed scenarios with
`--target desktop`.

## Verification

Use the narrowest relevant command first:

```bash
pnpm check:docs
pnpm build
pnpm typecheck
pnpm test
pnpm verify:conformance
pnpm verify:smoke
```

If verification is not run, report why.
