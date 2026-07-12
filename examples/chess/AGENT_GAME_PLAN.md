# Agent Game Plan

## Goal

- User request: Create a chess game example with strong board interaction.
- Project: `examples/chess`
- Category: tabletop / board game
- Plan evidence: `artifacts/game-production/plan.json`

The required non-mutating `tn game plan` ran before chess source changes. The
catalog search found the reviewed CC0 `polyhaven-model-chess-set` record, but it
has no direct bundle-ready download and cannot preserve independently movable
pieces. Direct catalog floor and carpet candidates were inspected and rejected
after screenshot proof exposed material artifacts. The six independently
movable piece models instead come from the user-provided CC BY 2.5 Viliami
3D-Chess source, are reproducibly converted from Collada to GLB, and retain
primitive geometry only as the runtime fallback.

## Playable Loop

- Choose White or Black from the opening UI; the camera faces the board from
  that side and the deterministic opponent controls the other color.
- Select a piece by click, drag start, or keyboard cursor plus Enter.
- Show only destinations that obey movement, occupancy, and king-safety rules.
- Commit by clicking a highlighted square, dropping on it, or pressing Enter.
- Alternate human and AI turns through capture, castling, en passant, and
  promotion.
- Finish on checkmate or stalemate; press R for a complete retry.

## Source Ownership

| Surface | Owner |
| --- | --- |
| Board, pieces, markers, camera, lights, HUD resources | `content/scenes/chess.scene.json` |
| Pointer and keyboard controls | `content/input/chess.input.json` |
| Material intent | `content/materials/chess.materials.json` |
| Deterministic board generation | `scripts/generate-board.mjs` |
| Chess rules, interaction, animation, HUD mutations | `src/scripts/chess.ts#chessGame` |
| Opening-move proof | `playtests/chess-opening.playtest.json` |
| Audio declarations and routing | `content/audio/chess-audio.audio.json` |
| Generated audio files | `assets/audio/*.mp3` |

## Interaction and Feedback

- Pointer hover does not tint squares; selection and legal moves remain clear.
- Click-click and press-drag-release share the same legal-move path.
- Selection, legal destinations, hover, last move, and check have distinct
  markers.
- Invalid destinations retain selection and explain the failure in the HUD.
- A legal move uses a short eased lift arc; turn and notation update together.
- Side selection starts restrained ambience; legal moves, captures, and checks
  use distinct ElevenLabs-generated local cues.
- Keyboard fallback covers native and accessible play.
- Side selection accepts retained-UI buttons or W/B keyboard shortcuts, and
  board input stays locked during the AI turn.

## Rules Coverage

- Pawn single/double advance, diagonal capture, en passant, and selected
  promotion to queen/rook/bishop/knight.
- Sliding obstruction for bishop, rook, and queen.
- Knight jumps and king adjacency.
- King-safety filtering, check display, legal castling path checks, checkmate,
  and stalemate.
- Captures, turn ownership, invalid move rejection, cancel, and full restart.

## Proof

```bash
node bin/tn iterate --project . --json
node bin/tn playtest --project . --scenario playtests/chess-opening.playtest.json --stable-artifacts --json
node bin/tn playtest --project . --scenario playtests/chess-opening.playtest.json --target desktop --json
```

Web iterate and opening proof pass with visible motion, ChessGame/HUD mutation,
clean console/network/runtime diagnostics, and nonblank screenshots. Desktop
startup is currently blocked only because the headless host exposes neither
`DISPLAY` nor `WAYLAND_DISPLAY`.
