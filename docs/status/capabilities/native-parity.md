# Native Parity Status

Bevy is adapter-private and consumes emitted IR bundles. Native support is
claimed only when web/native semantics are both proved.

Current support:

- Native proof harness readiness reports, desktop playtests, screenshots,
  frame samples, and conformance fixtures.
- Closed parity rows are protected by focused gates; remaining gaps stay in
  runtime/proof-loop PRDs.

Verification:

- `pnpm verify:conformance`
- `pnpm verify:parity:smoke`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
