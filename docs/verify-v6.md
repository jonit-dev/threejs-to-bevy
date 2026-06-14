# verify:v6

`verify:v6` is the initial aggregate V6 release gate. It proves the functional
scene can build and validate against the current V6 contracts, and keeps the
shared conformance suite in the loop while V6 visual/playable evidence is still
being expanded.

Current command:

```bash
pnpm verify:v6
```

Current V6 aggregate checks:

- V6 docs gate: `scripts/check-docs-v6.mjs`.
- V6 gate-script tests: `scripts/check-docs-v6.test.mjs` and
  `scripts/verify-v6.test.mjs`.
- CLI build before consuming the example.
- `examples/v6-functional` build through `tn build`.
- `examples/v6-functional` validation through `tn validate`.
- shared conformance through `scripts/verify-conformance.mjs`.

The aggregate report is written to
`artifacts/v6/verification-report.json` with schema
`threenative.verify.v6`. The report currently carries
`visualEvidenceStatus: "pending"` because V6-09 rendered screenshots,
playable traces, and native observation artifacts are still the next checkpoint.

Current V6 trace evidence:

- `pnpm verify:conformance` runs the `v6-resources-events` and
  `v6-animation-clips` fixed traces.
- The trace executes the same `scripts.bundle.js` in web JavaScript and native
  QuickJS.
- The ordered schedule is `startup`, `fixedUpdate`, `update`, then
  `postUpdate`.
- Same-stage systems are ordered by system name.
- The resource/event trace writes comparable effect-log artifacts under
  `artifacts/conformance/v6-resources-events/`:
  - `web-effects.json`
  - `native-effects.json`
  - `effects-diff.json`
- The animation trace writes the same artifact set under
  `artifacts/conformance/v6-animation-clips/`.

Failures in the V6 fixed trace use
`TN_VERIFY_V6_RESOURCE_EVENT_TRACE_MISMATCH` or
`TN_VERIFY_V6_ANIMATION_TRACE_MISMATCH` in the diff artifact and fail `pnpm
verify:conformance`.

This current trace proves startup-before-update ordering, initial event
visibility, declared resource writes, and event/resource effect-log parity for
the V6 resource/event fixture. It also proves matching `animation.play`
service-call logs for the V6 animation fixture. The aggregate gate adds the
functional scene build/validation proof, but does not yet prove real rendered
animation playback, screenshot parity, playable input traces, native frame
captures, or broader schedule/state coverage.
