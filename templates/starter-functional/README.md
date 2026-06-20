# V7 Functional

Self-contained V7 proof scene for release-gate smoke coverage. The authored
scene combines the currently promoted SDK-facing runtime features while V7
deep-parity fixtures cover advanced physics, animation graphs, UI navigation,
spatial audio, renderer/dense content, scripting lifecycle, packaging, and
performance reports.

## Source Layout

`src/game.ts` is only the composition root. Scene-owned code lives under
`src/scenes/`, behavior modules live under `src/scripts/`, and input, UI, audio,
and asset catalogs have their own folders. Keep generated bundle output under
`dist/`; edit the source modules instead.

```bash
pnpm verify:v7
```
