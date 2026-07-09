# PRD-006 Editor UI Preview Evidence

Generated on 2026-07-09 for
`docs/PRDs/other/ui-system-remediation-2026-07-08/PRD-006-editor-runtime-ui-preview.md`.

- `editor-ui-preview.png`: Chromium screenshot of the editor fixture with the
  read-only retained UI preview visible in the viewport.
- `editor-ui-preview.html`: static HTML used for the screenshot capture.

Proof commands:

- `pnpm --filter @threenative/editor typecheck`
- `pnpm --filter @threenative/editor test`
- Chromium screenshot capture with a visible `[aria-label="Read-only UI preview"]`
  assertion and PNG nonblank pixel check.
