# AGENTS.md

Rules for the native Bevy runtime.

- Bevy is an adapter for emitted ThreeNative IR, not a public authoring API.
- Keep native behavior aligned with shared IR and web runtime semantics.
- Bevy-only evidence goes under `runtime-bevy/artifacts/<gate>/`; evidence from
  example bundles belongs under that example's `artifacts/<gate>/`.
- Treat shared IR and web runtime semantics as the source of truth. Do not add
  native-only authored formats, silent fallback mappings, permissive DTO fields,
  or trace-only proof for behavior that should exist in the live ECS world.
- For parity changes, add focused positive and negative coverage and run
  conformance. If native behavior cannot support a shared capability, preserve
  an explicit diagnostic and document the bounded follow-up instead of hiding
  the gap behind a compatibility shim.
- Rust uses edition 2024. Bevy and `bevy_ecs` are pinned to `=0.14.2`.
- For Rust-only changes, run the integration-test target that owns the changed
  behavior. From the repository root, use:

```bash
pnpm test:rust -- <target> [test-name-filter]
```

- For library unit tests, use `pnpm test:rust:lib -- [test-name-filter]`.
- Do not use a bare `cargo test` or `cargo test <filter>` for focused
  verification. Cargo links every integration-test executable before applying
  the filter, and this Bevy workspace has dozens of large static test binaries.
- Use `pnpm test:rust:full` only when the change genuinely requires the complete
  native suite.
- To self-verify native behavior against an emitted bundle, use
  `tn scene proof <scene> --project <path> --native` and scenario playtests
  run with `tn playtest ... --target desktop`; keep the evidence under the
  owning `artifacts/<gate>/` folder.
- For changes to shared web/Bevy contracts, also run `pnpm verify:conformance`
  from the repo root.
