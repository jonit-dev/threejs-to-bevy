# ThreeNative Chess

A portable, full-rules 3D chess example authored through structured source and
one TypeScript behavior. It supports click-then-click and drag-and-drop moves,
legal destination highlights, hover/selection/last-move/check markers, eased
piece movement, captures, castling, en passant, promotion choice, check,
checkmate, stalemate, and restart.

## Controls

- Click a piece, then click a highlighted square; or drag and drop it.
- Arrow keys or WASD move the board cursor; Enter/Space selects or moves.
- `P` cycles queen, rook, bishop, and knight promotion.
- `Escape` clears selection; `R` restarts the match.

## Run and verify

```bash
pnpm run dev:web
pnpm run iterate
node bin/tn playtest --project . --scenario playtests/chess-opening.playtest.json --stable-artifacts --json
```

Durable board source is generated deterministically by
`scripts/generate-board.mjs`; gameplay lives in `src/scripts/chess.ts`.
Generated `dist/**` and `artifacts/**` are not source.

The optional `chess-side-select` React webview overlay follows the maintained
Tailwind-default scaffold convention. Its editable source lives under
`overlay/chess-side-select/`; Tailwind is compiled at build time and is not a
runtime dependency. Build it independently with:

```bash
pnpm run build:overlay:chess-side-select
```

The generated `overlay/chess-side-select/dist/**` output is bundle input and
must not be edited directly.
