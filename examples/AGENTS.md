# AGENTS.md

Rules for runnable examples.

- Keep each game example sandboxed under `examples/<name>` with its own config,
  source entry, package metadata, and local runtime assets where practical.
- Source packs such as `assets-source` may be canonical inputs, but emitted
  bundles must copy required assets to deterministic bundle-local paths.
- For new playable examples, check `docs/workflows/open-source-3d-asset-kits.md`
  first and prefer one coherent pack. If no curated pack fits, use a compatible
  GitHub/open-source pack, then custom meshes, and primitives only as the final
  fallback.
- Do not commit generated `dist/` or verification artifacts unless tracked by
  repo policy.
- Example evidence goes under `examples/<name>/artifacts/<gate>/`, not root
  `artifacts/`.
- Shared conformance fixtures live under `packages/ir/fixtures/*`; examples may
  feed them, but fixtures are stable contract inputs.
- Examples prove product workflows and emit portable IR/bundles. They must not
  introduce runtime-specific source of truth.
- For repeated entities, prefer prefab defaults plus compact scene instances.
  Use `tn scene inspect --json` before large scene edits, then validate and
  build the durable source instead of expanding repeated component blocks by
  hand.
- Playable examples must look and feel credible by default: no primitive-only
  placeholder acceptance, no clunky one-frame player snaps unless deliberately
  tweened as a grid mechanic, and no completion claim without build, nonblank
  screenshot, visible motion, and input-playtest evidence.
- Self-verify with the narrowest proof first: `tn playtest --discover --json`
  to find provable entities, a committed `playtests/*.playtest.json` scenario
  with `--stable-artifacts` as the edit loop, `tn scene proof <scene>` for
  scene evidence (`--native` for the Bevy runtime), and `tn game
  score/qa --run-proof/release` before completion claims. Keep the resulting
  evidence under `examples/<name>/artifacts/<gate>/`.
- Audio-feedback assets must be real local audio files when referenced. Do not
  create text placeholders with `.wav` or `.mp3` extensions; generate, source,
  or reuse a valid RIFF/WAVE file with provenance, then let QA/release validate
  it.
