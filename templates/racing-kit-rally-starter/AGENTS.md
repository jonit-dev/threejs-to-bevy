# AGENTS.md

Rules for Racing Kit Rally starter projects.

- Keep Kenney Racing Kit assets local to `assets/` and reference them from structured source.
- Gameplay belongs in `src/scripts/racing.ts`; scene composition belongs in `content/**/*.json`.
- For additional game art, follow the repo open-source 3D asset kit workflow:
  use a coherent curated pack first, then a compatible GitHub/open-source pack,
  then custom meshes, and primitives only as the last fallback.
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
- Keep generated games visually polished and responsive by default. A finished
  racing slice should read as a dressed track, not a blockout: use coherent
  car/track assets or authored meshes, finished materials, road surface detail,
  barriers, terrain, landmarks, sky/background treatment, lighting, and scale
  cues. Avoid primitive-only placeholder scenes, flat random colors on bare
  boxes, empty horizons, and one-frame player movement snaps. Verify build,
  nonblank screenshot, visible motion, and input playtest before calling the
  game done.
