# AGENTS.md

Rules for the native Bevy runtime.

- Bevy is an adapter for emitted ThreeNative IR, not a public authoring API.
- Keep native behavior aligned with shared IR and web runtime semantics.
- Bevy-only evidence goes under `runtime-bevy/artifacts/<gate>/`; evidence from
  example bundles belongs under that example's `artifacts/<gate>/`.
- Rust uses edition 2024. Bevy and `bevy_ecs` are pinned to `=0.14.2`.
- For Rust-only changes, prefer:

```bash
cargo test
```

- To self-verify native behavior against an emitted bundle, use
  `tn scene proof <scene> --project <path> --native` and scenario playtests
  run with `tn playtest ... --target desktop`; keep the evidence under the
  owning `artifacts/<gate>/` folder.
- For changes to shared web/Bevy contracts, also run `pnpm verify:conformance`
  from the repo root.
