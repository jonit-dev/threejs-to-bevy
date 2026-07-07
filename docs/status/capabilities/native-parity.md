# Native Parity Status

Bevy is adapter-private and consumes emitted IR bundles. Native support is
claimed only when web/native semantics are both proved.

Current support:

- Native proof harness readiness reports, desktop playtests, screenshots,
  frame samples, and conformance fixtures.
- Closed parity rows are protected by focused gates; remaining gaps stay in
  runtime/proof-loop PRDs.

Promotion policy:

- Native parity is under a parity freeze. Do not promote new Bevy/native
  behavior only because the backlog has a matching unchecked row.
- A new native promotion needs a shipped-game need, a web proof, a native proof
  harness or desktop playtest artifact, and a focused gate that can fail in CI.
- Desktop-web packaging is the preferred practical fallback when the goal is
  demo/prototype distribution with exact Three.js rendering. The current path
  decision is [native-path.md](../../runtime/native-path.md).

Verification:

- `pnpm verify:conformance`
- `pnpm verify:parity:smoke`
- `pnpm verify:webview-package`
- `tn playtest --target desktop ...`

Full prior evidence is preserved in
[full-status-archive.md](full-status-archive.md).
