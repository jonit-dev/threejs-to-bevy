# Asset Provenance

## Production Plan

Playable loop: move the wind-up mouse courier, collect five glowing gear
tokens, spend gears to repair three bay rings, dodge rolling marbles, return to
the finished-toy crate, and retry with Space after a fail or win state.

Controls: WASD or arrow keys for movement, Space for retry.

Objective: repair all three bays and deliver the finished toy before the clock
timer reaches zero.

Progression: rolling marbles sweep across the workbench while the clock counts
down.

Feedback moments: mouse body bobs, ears/key/tail follow the player, gears float
and spin, repaired bays pulse, marbles roll, HUD updates gear/bay/clock state,
and win/fail states change the status line.

## Catalog Searches

- `tn asset source search --game-category arcade --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category toys --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.
- `tn asset source search --game-category mechanical --format glb --direct-only --json`
  returned `TN_ASSET_SOURCE_NO_MATCH`.

## Curated Sources Considered

- `docs/workflows/open-source-3d-asset-kits.md` lists Kenney Factory Kit,
  KayKit Mini-Game Variety Pack, KayKit Board Game Bits, and Chilly Durango
  retro machinery as related sources for toy, tabletop, and mechanical props.
- The SQLite direct search path did not provide a coherent direct GLB kit for a
  top-down wind-up mouse, glowing gears, repair bays, rolling marbles,
  workbench boundaries, and finished-toy crate.

## Selected Fallback

This example uses a custom-authored low-poly primitive kit in durable
structured source. The kit is composed from spheres, cylinders, boxes, torus
rings, and planes with authored materials, lighting, transforms, set dressing,
and scripted motion.

High-value surfaces:

- Player-hero: wind-up mouse body, nose, ears, key, and tail.
- Obstacle-enemy: rolling marbles crossing the workbench lanes.
- Reward-interactable: glowing gear tokens and three repair bay rings.
- World-environment: workbench field, inlay lane, rails, clock, toy crate,
  thread spools, blocks, and warm workshop lighting.
- UI-HUD: gear, bay, clock, and status text with mobile screenshot proof.
- Audio-feedback: local generated PCM WAV cue `assets/gear-chime.wav` (mono
  44.1 kHz, short sine-envelope chime) for deterministic local runtime
  packaging.
