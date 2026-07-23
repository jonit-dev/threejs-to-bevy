# PRD: Battle-of-Pacific Visual Parity — Groundwork (Light Track)

`Complexity: 5 → MEDIUM mode`

**Executor profile:** a lighter/junior model. Every phase is deliberately
mechanical and fully specified. If a phase's root cause turns out to be
engine-architecture work, STOP that phase, document findings in
`artifacts/visual-parity/handoff.md`, and move on — the companion PRD
(`visual-parity-pacific-mastery-2026-07-23.md`) reviews and finishes anything
left here.

## 1. Context

**Problem:** The game should visually match the reference render
`examples/battle-of-pacific/docs/reference/target-visual.png`; today it is
roughly 20% of the way there, runs at ~16 FPS in the browser (target 60), and
generated audio does not play.

**Files analyzed:** `examples/battle-of-pacific/content/**`,
`packages/runtime-web-three/src/worldMapping/stylizedNature.ts` (OceanWater),
`packages/runtime-web-three/src/devServer.ts`, `src/scripts/flight.ts`,
`content/audio/pacific-audio.audio.json`, `SESSION-LEARNINGS.md` (repo root —
READ IT FIRST; it contains the fix recipes and the staleness traps).

**Current behavior:**
- Ocean uses patched three-examples `Water` (rf0 0.05, haze, cloud-shadow
  overlay) — good base, ~20% of target look.
- ~16 FPS on a 1080p+ browser window; cinematic profile + MSAA4 + full-DPR.
- ElevenLabs sounds exist under `assets/generated/audio/` and are declared in
  `content/audio/pacific-audio.audio.json`; the script calls
  `context.audio.play(...)`; nothing is audible in the browser.
- Sky environment (`pacific-sky`) is milky compared to the reference's vivid
  cumulus.

**The core loop (applies to every visual phase):**

```bash
# 1. capture the current state (dev server must be freshly started —
#    see SESSION-LEARNINGS: runtime dist changes REQUIRE a tn dev restart)
node bin/tn screenshot --project . --url http://127.0.0.1:5173 \
  --out artifacts/visual-parity/current.png --wait-ready --json
# 2. compare with the reference
node bin/tn compare-images artifacts/visual-parity/current.png \
  docs/reference/target-visual.png --json
# 3. record the score, tweak ONE thing, repeat.
```

All commands run from `examples/battle-of-pacific/`.

## 2. Solution

**Approach:**
- Build a tiny repeatable parity harness first so every later change has a
  number attached.
- Fix audio (diagnose in a fixed order; escalate engine-level causes).
- Take the cheap, well-understood performance wins.
- Swap the sky environment texture — the single biggest visual delta that
  needs no shader work.
- Keep `tn iterate` green after every phase; never edit `dist/**`.

**Key decisions:**
- Reuse `tn screenshot`, `tn compare-images`, `tn performance proof` — no new
  tooling.
- Sky sourcing: Poly Haven CC0 equirect (same provenance pattern as the
  existing `pacific-sky` asset — see `content/assets/pacific-sky.assets.json`
  and `docs/asset-provenance.md`).

**Data changes:** None (content JSON + one texture asset only).

## 3. Execution Phases

#### Phase 1: Parity harness — one command produces a comparison score

**Files (max 5):**
- `examples/battle-of-pacific/scripts/visual-parity.mjs` (new) — node script:
  captures screenshot via `tn screenshot`, runs `tn compare-images`, appends
  `{timestamp, similarity, screenshotPath}` to
  `artifacts/visual-parity/history.json`, prints the score.
- `examples/battle-of-pacific/package.json` — add `"parity": "node
  scripts/visual-parity.mjs"` script.

**Implementation:**
- [ ] Script asserts the dev server is serving a fresh bundle: fetch
  `http://127.0.0.1:5173/__threenative/dev-state.json` and compare
  `bundleHash` with a sha256 of `dist/battle-of-pacific.bundle/manifest.json`;
  refuse to run (exit 1, clear message) on mismatch. This kills the stale-build
  trap from SESSION-LEARNINGS.
- [ ] Capture + compare + append history as above.

**Verification plan:**
- Run `pnpm run parity` twice; `artifacts/visual-parity/history.json` gains
  two entries with a numeric similarity; tamper the bundle (touch a content
  file without rebuild) and confirm the stale-build refusal fires.

**User verification:** `pnpm run parity` prints a similarity score.

#### Phase 2: Audio actually plays

**Files (max 5):**
- `src/scripts/flight.ts` — only if fix is script-side.
- `overlay/flight-deck/src/App.tsx` — "click/press to enable sound" affordance
  if autoplay-block is the cause.
- `artifacts/visual-parity/handoff.md` — findings if engine-level.

**Implementation (diagnose IN THIS ORDER, stop at first root cause):**
- [ ] 1. Browser autoplay policy: browsers block AudioContext until a user
  gesture. Check `packages/runtime-web-three/src/audio.ts` for a
  resume-on-gesture path. If missing, the *fix* is engine-side → document in
  handoff and add the overlay "press any key for sound" hint only.
- [ ] 2. Service wiring: run the web playtest
  (`node bin/tn playtest --scenario playtests/acceptance-objective-progress.playtest.json --json`)
  and inspect `artifacts/playtest/**/console.json` + `effect-log.json` for
  `audio.play` service entries or errors. If the service is rejected/absent,
  document exact diagnostics in handoff.
- [ ] 3. Asset delivery: confirm the mp3s are in the built bundle
  (`dist/battle-of-pacific.bundle/`) and served (fetch one via
  `curl -sI http://127.0.0.1:5173/bundle/<path>` → 200 + audio content-type;
  note `.mp3` is MISSING from `contentTypeForBundleFile` in
  `packages/runtime-web-three/src/devServer.ts` — if so, add the mp3 case
  there; that is an allowed one-line engine fix).
- [ ] 4. Doc shape: compare `content/audio/pacific-audio.audio.json` against
  the `sound-cue` cookbook entry (`node bin/tn cookbook show sound-cue --json`).

**Verification plan:**
- Manual: open the game, press a key, hear engine+music; press Space, hear
  guns. Record findings + fix in handoff.md regardless of outcome.

#### Phase 3: Performance — measured, cheap wins (16 → as close to 60 as these get)

**Files (max 5):**
- `content/runtime/default.runtime.json` — A/B render settings.
- `packages/runtime-web-three/src/worldMapping/stylizedNature.ts` — water
  reflection target size only (512 → 256 constant).
- `artifacts/visual-parity/perf.md` (new) — the measurement table.

**Implementation:**
- [ ] Baseline: `node bin/tn performance proof --project . --target web
  --frames 120 --json` → record fps/frameMs.
- [ ] A/B each change INDIVIDUALLY, re-measuring after each (record every row
  in perf.md): (a) `antialias` msaa4 → msaa2; (b) `renderLook.profile`
  cinematic → standard (record the visual cost with a parity score too);
  (c) water `textureWidth/Height` 512 → 256.
- [ ] Keep the combination with the best fps-per-visual-cost; note rejected
  combos. Restart `tn dev` after every runtime-package change
  (SESSION-LEARNINGS staleness rule).
- [ ] If still far from 60: document the devicePixelRatio clamp idea
  (`renderer.maxPixelRatio` — engine schema change) in handoff for the mastery
  PRD. Do NOT attempt the schema change here.

**Verification plan:** perf.md has a table with ≥4 measured rows; final
config committed; `pnpm run parity` score did not regress by more than 0.02.

#### Phase 4: Vivid cumulus sky

**Files (max 5):**
- `assets/imported/polyhaven/<new-sky>/environment.png` (new, CC0 download —
  pick a vivid blue-sky-with-cumulus equirect from Poly Haven, e.g. a
  "partly cloudy sky" HDRI exported as PNG, matching how pacific-sky was
  brought in).
- `content/assets/pacific-sky.assets.json` — point at the new file (keep the
  asset id `pacific-sky`; update attribution/license/source fields).
- `docs/asset-provenance.md` — provenance row.

**Implementation:**
- [ ] Source and place the texture; keep resolution ≤ 4k to protect FPS.
- [ ] `node bin/tn iterate --project . --json` must stay green.
- [ ] `pnpm run parity` — expect a meaningful score jump (sky is ~40% of the
  reference frame).

**User verification:** screenshot shows vivid blue sky with defined cumulus
instead of the milky backdrop.

#### Phase 5: Consistency knobs + handoff report

**Files (max 5):**
- `content/scenes/arena.scene.json` — align `light.sun` direction with
  `OceanWater.sunDirection` (single sun story: light position, water sun, and
  glitter path must agree; currently they were tuned independently).
- `artifacts/visual-parity/handoff.md` — final: everything discovered,
  every deferred item, final parity score + FPS.

**Implementation:**
- [ ] Compute `light.sun` position from the same direction vector used by
  `OceanWater.sunDirection` (scale by ~300) so model lighting and water
  glitter agree.
- [ ] Final `tn iterate` + `pnpm run parity` + `tn performance proof` runs;
  record all three in handoff.md.

## 4. Checkpoints

After EACH phase: run `node bin/tn iterate --project . --json` (must stay
`TN_ITERATE_OK`, 7/7 scenarios) and `pnpm run parity`, then spawn
`prd-work-reviewer` with this PRD's path and the phase number. Continue only
on PASS.

## 5. Acceptance Criteria

- [ ] `pnpm run parity` exists, guards against stale builds, and logs history.
- [ ] Audio audible in browser OR a precise engine-level root cause documented
      in handoff.md.
- [ ] Measured perf table exists; best cheap configuration applied; FPS
      strictly improved from the 16 FPS baseline.
- [ ] New sky in place with provenance; parity score improved and recorded.
- [ ] Sun direction unified across scene light and water.
- [ ] `tn iterate` green (7/7) at every checkpoint; no `dist/**` edits; no
      changes outside the listed files except via handoff escalation.
