# V10 Visual Calibration Evidence

This folder indexes the cross-runtime visual calibration gate introduced by
`docs/PRDs/v10/V10-03-cross-runtime-visual-calibration.md`.

## Command

```bash
pnpm verify:v10:visual-calibration -- --group color,materials
pnpm verify:v10:visual-calibration -- --group color,materials --analyze-only
```

Use `--manifest-only` to validate the versioned fixture manifest without
capturing screenshots. Use `--analyze-only` to re-run region analysis against
existing web/native screenshots without rebuilding or recapturing. Use `--list` to inspect registered fixtures and whether
each one is implemented.

## Artifact Layout

- `artifacts/v10/visual-calibration/manifest-report.json` - manifest validation
- `artifacts/v10/visual-calibration/verification-report.json` - aggregate gate
- `artifacts/v10/visual-calibration/color/v10-color/` - color/camera fixture evidence
- `artifacts/v10/visual-calibration/materials/v10-materials/` - material fixture evidence

Each fixture directory should contain:

- `web.png` and `bevy.png` - captured screenshots
- `diff.png` and `contact-sheet.png` - comparison artifacts
- `fixture-report.json` - per-region metrics and diagnostics

## Interpretation

- Color fixture failures usually indicate sRGB/linear conversion, tone mapping,
  exposure, background alpha, or framing drift.
- Material fixture failures usually indicate PBR slot mapping, texture sampling,
  UV transforms, alpha modes, or emissive response drift.
- `TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT` names the fixture region, metric,
  observed value, and threshold.
- Report-only regions (for example advanced post probes) may warn without failing
  the promoted gate.

## Threshold Policy

Thresholds live in `scripts/visual-calibration/manifest.mjs` and are documented in
`docs/visual-parity-policy.md`. Do not loosen them without artifact evidence and
PRD/status notes.
