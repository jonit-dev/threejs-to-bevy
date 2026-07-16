# AGENTS.md

Rules for Racing Kit Rally starter projects. Shared workflow detail lives in
the agent skills under `.claude/skills/` and `.codex/skills/` (identical
copies). When equivalent operator workflow is already in context, follow it
directly; otherwise load `threenative-workflow`. Read another skill only when
the plan or a diagnostic makes that work relevant.

- Keep Kenney Racing Kit assets local to `assets/` and reference them from structured source.
- Gameplay belongs in `src/scripts/racing.ts`; scene composition belongs in `content/**/*.json`.
- For additional game art, follow the repo open-source 3D asset kit workflow:
  use a coherent curated pack first, then a compatible GitHub/open-source pack,
  then custom meshes, and primitives only as the last fallback.
- Repeated script math helpers belong in named
  `@threenative/script-stdlib` imports (`Mathf`, `Vector2`, `Vector3`, `Quat`,
  `TransformMath`, `Bounds2`, `Bounds3`, `Ease`, `RandomEx`, `ColorEx`,
  `TextEx`, `InputEx`, `MotionEx`, `TimerEx`, `ArrayEx`, `CameraMath`), not
  copied into `src/scripts/racing.ts`.
- For the local script/source contract, read `docs/API-CARD.md` before opening
  package source. It is generated from the supported `ScriptContext` surface and
  common structured source shapes.
- Do not use namespace/default/import-renamed stdlib imports or arbitrary npm,
  relative helper, DOM, Node, timer, filesystem, network, Three.js, or Bevy
  imports from portable gameplay scripts.
- Do not edit generated `dist/` output.
- Extend the owning source document, script, manifest, or shared contract; do
  not copy registry data, helpers, fallbacks, or proof logic into a second
  surface. Do not weaken assertions, disable scenarios, or make unsupported
  behavior look supported. Fix the durable owner and rerun the proof.
- If a temporary bridge is unavoidable, record its owner, removal condition,
  and verification in the plan or issue. Report missing capability explicitly
  instead of adding a local workaround.
- Prefer `tn ... --json` commands for scene, asset, and proof mutations.
- For custom sound effects, probe with `tn game providers --project . --json`.
  When ElevenLabs is available, prefer one bounded
  `tn audio generate-sfx <asset-id> --prompt "<description>" --project . --json`
  call. Project-local `.env` is for local `tn` tooling only. Use local,
  catalog, or procedural audio as the offline fallback.
- Before creating or substantially changing the game, run
  `tn game plan --goal "<game idea>" --project . --json` (package alias:
  `pnpm run game:plan -- --goal "<game idea>"`) and keep `artifacts/game-production/plan.json` with the
  work. Open `AGENT_GAME_PLAN.md` only if planning fails or omits a required
  field. If the plan reports `TN_GAME_PLAN_OFF_RECIPE` or does not cover the
  core verbs and acceptance criteria, run `nextInspectionCommand` first and
  custom-author on the starter; otherwise
  use `pnpm run game:improve` only for reviewed bounded recipe steps.
- After source, script, gameplay, or visual changes, run
  `tn iterate --project . --json` (package alias: `pnpm run iterate`) as
  the default repair loop. It writes fast-loop artifacts under
  `artifacts/iterate/latest/`; keep `game:qa` and desktop/native playtests for
  completion evidence.
- In the ThreeNative repo, if you change a reusable authoring, racing,
  asset, proof, or CLI workflow, update the matching cookbook entry or add a
  new one, then run `pnpm verify:cookbook`.
- Keep `threenative.config.json` production metadata current: playable loop,
  canonical controls, checkpoint objective, retry path, and proof commands.
- Keep generated games visually polished and responsive by default. A finished
  racing slice should read as a dressed track, not a blockout: use coherent
  car/track assets or authored meshes, finished materials, road surface detail,
  barriers, terrain, landmarks, sky/background treatment, lighting, and scale
  cues. Avoid primitive-only placeholder scenes, flat random colors on bare
  boxes, empty horizons, and one-frame player movement snaps. Verify build,
  nonblank screenshot, visible motion, and input playtest before calling the
  game done.
- Iterate with `tn playtest` after controls, vehicle handling, camera follow,
  checkpoint, HUD, or retry changes. Run `tn playtest --discover --json` or
  `--suggest-scenario <name>` to find provable entities first. Use a committed
  `playtests/*.playtest.json` scenario with `--stable-artifacts` for multi-step
  behavior (add `--watch --pass-once` while iterating); inspect the compact
  playtest stdout or `tn playtest report --latest --scenario <name> --json`,
  fix the owning source/script, and rerun before `tn game qa`. Open deep logs
  such as `effect-log.json`, `observations.json`, or `runtime-trace.json` only
  when a compact diagnostic points to them. Before release claims, rerun the
  scenario with `--target desktop` so the native runtime is proved, not only
  web.

## Verify

Self-verify in this order: structural checks, focused playtest proof, then
production gates.

```bash
pnpm run validate:authoring
pnpm run build
pnpm run iterate
tn playtest --project . --scenario playtests/<name>.playtest.json --stable-artifacts --json
pnpm run playtest
pnpm run game:score
pnpm run game:qa
pnpm run game:release
pnpm run verify
```
