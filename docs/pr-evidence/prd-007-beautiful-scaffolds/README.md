# PRD-007 Beautiful Scaffolds Evidence

This directory preserves committed visual evidence for the beautiful scaffold
slice. The canonical generated raw report remains:

- `tools/verify/artifacts/render-look/verification-report.json`
- `tools/verify/artifacts/render-look/contact-sheet.svg`
- `tools/verify/artifacts/render-look/screenshots/*.png`

Generated `tools/verify/artifacts/**` outputs are ignored by git, so this
directory keeps the representative screenshots that status docs can link.

## Captures

- [contact-sheet.svg](contact-sheet.svg)
- [screenshots/parity.png](screenshots/parity.png)
- [screenshots/balanced.png](screenshots/balanced.png)
- [screenshots/parity-bevy.png](screenshots/parity-bevy.png)
- [screenshots/balanced-bevy.png](screenshots/balanced-bevy.png)

## Metrics

Captured from `tools/verify/artifacts/render-look/verification-report.json`:

| Profile | Runtime | Nonblank area | Luminance | Saturation | Contrast |
| --- | --- | ---: | ---: | ---: | ---: |
| `parity` | web | 0.999976 | 0.103098 | 0.293230 | 0.091930 |
| `balanced` | web | 0.788637 | 0.362054 | 0.780629 | 0.188000 |
| `parity` | Bevy | 1.000000 | recorded in raw report | recorded in raw report | recorded in raw report |
| `balanced` | Bevy | 1.000000 | recorded in raw report | recorded in raw report | recorded in raw report |

The balanced scaffold evidence shows higher luminance, saturation, and contrast
than the neutral parity capture while staying on the promoted `balanced`
render-look contract.

## Verification

```bash
pnpm --filter @threenative/cli test -- --run "look|add all compositional"
pnpm --filter @threenative/runtime-web-three test -- --run "balanced sky|balanced render look"
(cd runtime-bevy && cargo test -p threenative_runtime rendering_should_map_balanced_render_look_to_native)
(cd runtime-bevy && cargo test -p threenative_runtime rendering_should_preserve_parity_render_look_without_native_bloom)
pnpm --filter @threenative/verify-tools test -- --run "render-look|render look"
pnpm verify:render-look
pnpm check:docs
```
