# Look Profile Audit - 2026-07-07

## Scope

PRD-007 was implemented as a bounded scaffold-polish slice:

- Added `tn look list --json`.
- Added `tn look apply <profile> --project . --json`.
- Defined five curated presets: `arcade-neon`, `forest-dawn`,
  `sunset-racer`, `toybox-pop`, and `noir-metal`.
- Kept all presets inside the existing portable contract by writing
  `balanced` `renderer.renderLook.overrides` plus source material mutations.
- Added a pure visual-quality metric for color bucket diversity and local
  contrast.

Reserved runtime profiles `cinematic` and `stylized` remain unpromoted because
the existing render-look contract requires screenshot-backed web and Bevy proof
before accepting them in validation.

## Raw Data References

- Command/profile tests:
  `packages/cli/src/commands/look.test.ts`
- Visual-quality metric tests:
  `packages/cli/src/verify/renderingQuality.test.ts`
- Profile registry:
  `packages/cli/src/lookProfiles/registry.ts`
- Existing promoted render-look screenshot evidence:
  `tools/verify/artifacts/render-look/verification-report.json`
- Existing render-look screenshots:
  `tools/verify/artifacts/render-look/screenshots/`

## Verification Run

```bash
pnpm --filter @threenative/cli build
node --test packages/cli/dist/commands/look.test.js packages/cli/dist/verify/renderingQuality.test.js
```

The focused tests apply every look profile to a fresh starter, validate the
structured source, and assert that flat one-color frames fail the quality
metric while styled fixture frames pass it.

## Follow-Up

Screenshot capture for each named art-direction preset was intentionally not
generated in this slice to avoid producing another large artifact set in the
worktree. The next proof step should run a small deterministic capture matrix
for one starter across the five presets and store only contact sheets plus
metric JSON.
