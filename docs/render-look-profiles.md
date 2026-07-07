# Render Look Profiles

Render look profiles are the author-facing switch for default renderer
character. They keep renderer internals private while letting source documents
choose between deterministic parity output and a richer game default.

## When To Use Each Profile

Use `parity` for conformance fixtures, migration checks, regression debugging,
and any proof where stable neutral output matters more than game feel. Runtime
configs without `renderer.renderLook` continue to behave as `parity`.

Use `balanced` for new playable projects. Maintained starters now write a
durable runtime source document with:

```json
{
  "schema": "threenative.runtime-config",
  "version": "0.1.0",
  "id": "default",
  "renderer": {
    "antialias": "msaa4",
    "renderLook": {
      "version": 1,
      "profile": "balanced",
      "overrides": {
        "bloomIntensity": 0.65,
        "contrast": 0.22,
        "environmentIntensity": 1.35,
        "exposure": 1.08,
        "saturation": 1.35,
        "shadowQuality": "medium"
      }
    }
  }
}
```

`cinematic` and `stylized` are reserved names. They are not promoted until both
web and Bevy mappings have screenshot evidence and documented fallback behavior.

## CLI

Create a new balanced project:

```bash
tn create demo --render-profile balanced --json
```

Create a neutral parity project for fixtures:

```bash
tn create demo-parity --render-profile parity --json
```

Update an existing runtime source document:

```bash
tn runtime set-rendering default --render-profile balanced --json
```

Apply a curated scaffold look preset while staying on the promoted portable
`balanced` render-look contract:

```bash
tn look apply arcade-neon --project . --json
```

The look preset command currently exposes `arcade-neon`, `forest-dawn`,
`sunset-racer`, `toybox-pop`, and `noir-metal`. Presets combine bounded
`renderer.renderLook.overrides` with starter material palette edits; they do
not promote reserved `cinematic` or `stylized` render-look profiles.

Optional overrides stay bounded and semantic:

```bash
tn runtime set-rendering default \
  --render-profile balanced \
  --render-look-exposure 1.1 \
  --render-look-saturation 1.15 \
  --render-look-contrast 0.1 \
  --render-look-bloom-intensity 0.35 \
  --json
```

## Verification

Run the focused gate while developing profile mappings:

```bash
pnpm verify:render-look
```

The gate writes:

- `tools/verify/artifacts/render-look/verification-report.json`
- `tools/verify/artifacts/render-look/contact-sheet.svg`
- `tools/verify/artifacts/render-look/screenshots/parity.png`
- `tools/verify/artifacts/render-look/screenshots/balanced.png`
- `tools/verify/artifacts/render-look/screenshots/parity-bevy.png`
- `tools/verify/artifacts/render-look/screenshots/balanced-bevy.png`

The report should use `evidenceMode: "captured-screenshots"` with no
diagnostics. Release-profile promotion still requires keeping the screenshot
capture path deterministic in CI and recording manual contact-sheet inspection
as evidence.
