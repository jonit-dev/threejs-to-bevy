# verify:v6

`verify:v6` is now a legacy milestone alias. It resolves through the legacy
alias table to the current release gate, while V6 contract evidence lives in
shared conformance fixtures.

Current command:

```bash
pnpm verify:v6
```

Current V6 evidence:

- `verify:v6` emits a deprecation diagnostic and runs `verify:release`.
- `pnpm verify:conformance` runs the `resources-events` and
  `animation-clips` fixed traces, plus the current aggregate UI evidence
  categories for structural reports, behavioral probes, and visual/style
  contact-sheet proof.
- V6-era runnable `src/game.ts` examples have been removed in favor of
  conformance fixtures and structured-source examples.

V6 trace evidence:
- The trace executes the same `scripts.bundle.js` in web JavaScript and native
  QuickJS.
- The ordered schedule is `startup`, `fixedUpdate`, `update`, then
  `postUpdate`.
- Same-stage systems are ordered by system name.
- The resource/event trace writes comparable effect-log artifacts under
  `packages/ir/artifacts/conformance/resources-events/`:
  - `web-effects.json`
  - `native-effects.json`
  - `effects-diff.json`
- The animation trace writes the same artifact set under
  `packages/ir/artifacts/conformance/animation-clips/`.

Failures in the V6 fixed trace use
`TN_VERIFY_V6_RESOURCE_EVENT_TRACE_MISMATCH` or
`TN_VERIFY_V6_ANIMATION_TRACE_MISMATCH` in the diff artifact and fail `pnpm
verify:conformance`.

This current trace proves startup-before-update ordering, initial event
visibility, declared resource writes, and event/resource effect-log parity for
the V6 resource/event fixture. It also proves matching `animation.play`
service-call logs for the V6 animation fixture. The aggregate gate adds the
functional scene build/validation proof and a nonblank web visual smoke, but
does not yet prove real model animation playback, screenshot parity, native
frame captures, or broader schedule/state coverage.
