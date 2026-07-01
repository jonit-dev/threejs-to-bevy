# AGENTS.md

Rules for Racing Kit Rally starter projects.

- Keep Kenney Racing Kit assets local to `assets/` and reference them from structured source.
- Gameplay belongs in `src/scripts/racing.ts`; scene composition belongs in `content/**/*.json`.
- Repeated script math helpers belong in named
  `@threenative/script-stdlib` imports (`NumberEx`, `Vec2`, `Vec3`, `Quat`,
  `TransformMath`, `Bounds2`, `Bounds3`, `Ease`, `RandomEx`, `ColorEx`,
  `TextEx`, `InputEx`, `MotionEx`, `TimerEx`, `ArrayEx`, `CameraMath`), not
  copied into `src/scripts/racing.ts`.
- Do not use namespace/default/aliased stdlib imports or arbitrary npm,
  relative helper, DOM, Node, timer, filesystem, network, Three.js, or Bevy
  imports from portable gameplay scripts.
- Do not edit generated `dist/` output.
- Prefer `tn ... --json` commands for scene, asset, and proof mutations.
