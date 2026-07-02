# Bowling Lane Production Plan

## Playable Loop

- Aim the ball left or right from the approach.
- Press roll to send it down a glossy wooden lane.
- Ball contact drives pin knockdown; the deterministic fallback tips nearby
  pins when runtime solver contact is unavailable.
- Score counts fallen pins and updates the HUD.
- Press reset to re-rack the pins and return the ball.

## Controls

- `A`/`ArrowLeft`: aim left before release.
- `D`/`ArrowRight`: aim right before release.
- `Space`/`Enter`: roll.
- `R`: reset.

## Objective And Progression

- Primary objective: knock down all ten pins in one roll.
- Progression is a single polished vertical slice with a strike celebration
  state and a reset path.
- Fail/retry path: missing the rack leaves the ball in the pit; reset restores
  all authored home transforms.

## Asset Sourcing

- Player/hero: bowling ball.
- Obstacle/enemy: ten bowling pins.
- Reward/interactable: strike lane target and score HUD.
- World/environment: lane, gutters, foul line, arrows, pin deck, pit, rails,
  backstop, overhead lamps, and simple spectator-side set dressing.
- UI/HUD: roll state, score, aim meter.
- Audio-feedback: procedural evidence records roll, impact, strike, and reset
  cue intent until retained audio source documents are added.

Catalog search evidence:

- `node packages/cli/dist/index.js asset source search --game-category sports --format glb --direct-only --json`
- Result: `TN_ASSET_SOURCE_CATALOG_FAILED`; SQLite reported
  `database is locked (5)`.
- Sequential retry returned the same diagnostic.

Fallback:

- Because the required SQLite source path is unavailable, this slice uses
  authored primitive/custom-mesh silhouettes. The pin silhouette uses a cylinder
  mesh with a capsule collider and red stripe marker; the ball uses a sphere
  mesh with a sphere collider. Lane set dressing uses intentionally scaled box
  and plane surfaces with wood, rubber, painted, and emissive materials.

## Authored Physics

- `prefab.ball`: dynamic `RigidBody`, sphere `Collider`, bowling ball state.
- `prefab.pin`: dynamic `RigidBody`, capsule `Collider`, standing state.
- Pin reset homes are derived from compact rack instance transforms on the
  first gameplay tick and stored in `BowlingState.pinHomes`.
- Static colliders: lane floor, gutters, rails, pin deck, and backstop.
- Script fallback updates transforms and score while preserving portable
  physics metadata in durable source.

## Source Ownership

- Scene: `content/scenes/lane.scene.json`.
- Prefab defaults: `content/prefabs/*.prefab.json`.
- Compact instances: `content/scenes/lane.scene.json` owns ball, lane blocker,
  and ten-pin rack placement.
- Materials: `content/materials/lane.materials.json`.
- Meshes: `content/meshes/lane.meshes.json`.
- Input: `content/input/lane.input.json`.
- Systems: `content/systems/lane.systems.json`.
- UI: `content/ui/hud.ui.json`.
- Script: `src/scripts/bowling.ts`, export `bowlingLaneSystem`.
- State: scene resource `BowlingState`; entity components `BowlingBall` and
  `Pin`.

## Polish Checklist

- Silhouettes: ball, pins, gutters, rails, backstop, lane arrows, and foul line.
- Materials: polished wood, rubber ball, white pins, red stripes, dark gutters,
  metal rails, emissive lamps.
- Lighting: warm overhead lane lamps plus ambient fill.
- Camera: fixed perspective down-lane framing with pin deck visible.
- Environment context: approach, gutters, pit, back wall, lane markings, side
  bumpers.
- Feedback: HUD state, pin tipping, ball motion, strike banner state.
- Mobile fit: HUD centered with wide safe top spacing; core lane remains visible
  in portrait crop.
- Performance: primitive/custom meshes and 30 expanded world entities from 18
  compact prefab instances, no heavy GLB.

## Proof Checklist

- `tn scene validate lane --project . --json`
- `tn scene inspect lane --project . --json`
- `tn build --project . --json`
- `tn verify --project . --frames 4 --expect-motion --json`
- `tn playtest --project . --entity bowling.ball --press keyboard.Space --frames 90 --expect-moved --json`
- `tn game score --project . --json`
