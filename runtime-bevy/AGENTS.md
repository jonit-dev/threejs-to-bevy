# AGENTS.md

Guidance for the native Bevy runtime.

- Bevy is a runtime adapter for emitted ThreeNative IR bundles, not a user-facing
  authoring API.
- Keep native behavior aligned with the shared IR contract and web runtime
  semantics where features overlap.
- Keep Bevy-only evidence under `runtime-bevy/artifacts/<gate>/`. Evidence
  generated from an example bundle should use that example's
  `examples/<name>/artifacts/<gate>/` directory.
- Rust workspace code uses Rust 2024 edition. Bevy and `bevy_ecs` are pinned to
  `=0.14.2`.
- For Rust-only changes, prefer:

```bash
cargo test
```
