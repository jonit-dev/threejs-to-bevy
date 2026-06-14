# verify:v6

`verify:v6` is not the aggregate V6 release gate yet. Until that command lands,
V6 runtime slices attach their evidence to shared conformance and focused
package tests.

Current V6 trace evidence:

- `pnpm verify:conformance` runs the `v6-resources-events` fixed trace.
- The trace executes the same `scripts.bundle.js` in web JavaScript and native
  QuickJS.
- The ordered schedule is `startup`, `fixedUpdate`, `update`, then
  `postUpdate`.
- Same-stage systems are ordered by system name.
- The trace writes comparable effect-log artifacts under
  `artifacts/conformance/v6-resources-events/`:
  - `web-effects.json`
  - `native-effects.json`
  - `effects-diff.json`

Failures in the V6 fixed trace use
`TN_VERIFY_V6_RESOURCE_EVENT_TRACE_MISMATCH` in the diff artifact and fail
`pnpm verify:conformance`.

This current trace proves startup-before-update ordering, initial event
visibility, declared resource writes, and event/resource effect-log parity for
the V6 resource/event fixture. It does not yet replace the future aggregate
`verify:v6` gate, functional V6 scene proof, or broader schedule/state
coverage.
