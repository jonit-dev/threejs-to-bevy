import { defineBehavior, Ease, type ScriptContext } from "@threenative/script-stdlib";

type Color = "white" | "black";
type Kind = "pawn" | "rook" | "knight" | "bishop" | "queen" | "king";
type Piece = {
  alive: boolean;
  color: Color;
  entity: ReturnType<ScriptContext["entity"]>;
  file: number;
  id: string;
  initialFile: number;
  initialKind: Kind;
  initialRank: number;
  kind: Kind;
  moved: boolean;
  rank: number;
};
type Move = { captureId?: string; castle?: "king" | "queen"; enPassant?: boolean; file: number; promotion?: Kind; rank: number };
type ChessContext = ScriptContext & {
  picking: {
    pointerRay(options: { aspect?: number; camera?: string; maxDistance?: number; pointer: [number, number] }): { hit: false } | { direction: [number, number, number]; hit: true; maxDistance: number; origin: [number, number, number] };
  };
};

export const chessGame = defineBehavior(
  {
    id: "chess-game",
    schedule: "update",
    reads: ["BoardSquare", "ChessPiece", "LegalMarker"],
    writes: ["ChessPiece", "Transform"],
    resourceReads: ["ChessGame"],
    resourceWrites: ["ChessGame"],
    services: ["picking.pointerRay"],
  },
  (rawContext: ScriptContext): void => {
    const context = rawContext as ChessContext;
    const state = context.state("chess", {
      animId: "",
      animStart: 0,
      animFromFile: 0,
      animFromRank: 0,
      cursorFile: 4,
      cursorRank: 1,
      dragging: false,
      enPassantFile: -1,
      enPassantPawn: "",
      enPassantRank: -1,
      gameOver: false,
      halfmove: 1,
      hoveredId: "",
      lastFromFile: -1,
      lastFromRank: -1,
      lastToFile: -1,
      lastToRank: -1,
      promotionIndex: 0,
      selectedId: "",
      turn: "white" as Color,
    });
    const promotionKinds: Kind[] = ["queen", "rook", "bishop", "knight"];
    const allEntities = context.query();
    const pieceEntities = allEntities.filter((entity) => entity.id.startsWith("piece."));
    const pieces: Piece[] = [];
    for (const entity of pieceEntities) {
      const value = entity.get("ChessPiece", { alive: false, color: "white", file: 0, initialFile: 0, initialKind: "pawn", initialRank: 0, kind: "pawn", moved: false, rank: 0 });
      pieces.push({ ...value, color: value.color as Color, entity, id: entity.id, initialKind: value.initialKind as Kind, kind: value.kind as Kind });
    }

    const at = (file: number, rank: number, board = pieces): Piece | undefined => board.find((piece) => piece.alive && piece.file === file && piece.rank === rank);
    const enemy = (color: Color): Color => color === "white" ? "black" : "white";
    const inside = (file: number, rank: number): boolean => file >= 0 && file < 8 && rank >= 0 && rank < 8;
    const attacked = (file: number, rank: number, by: Color, board: Piece[]): boolean => {
      for (const piece of board) {
        if (!piece.alive || piece.color !== by) continue;
        const df = file - piece.file;
        const dr = rank - piece.rank;
        if (piece.kind === "pawn" && dr === (by === "white" ? 1 : -1) && Math.abs(df) === 1) return true;
        if (piece.kind === "knight" && ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1))) return true;
        if (piece.kind === "king" && Math.max(Math.abs(df), Math.abs(dr)) === 1) return true;
        const diagonal = Math.abs(df) === Math.abs(dr) && df !== 0;
        const straight = (df === 0) !== (dr === 0);
        if (!((piece.kind === "bishop" && diagonal) || (piece.kind === "rook" && straight) || (piece.kind === "queen" && (diagonal || straight)))) continue;
        const stepFile = Math.sign(df);
        const stepRank = Math.sign(dr);
        let scanFile = piece.file + stepFile;
        let scanRank = piece.rank + stepRank;
        let clear = true;
        while (scanFile !== file || scanRank !== rank) {
          if (at(scanFile, scanRank, board) !== undefined) { clear = false; break; }
          scanFile += stepFile;
          scanRank += stepRank;
        }
        if (clear) return true;
      }
      return false;
    };
    const inCheck = (color: Color, board: Piece[]): boolean => {
      const king = board.find((piece) => piece.alive && piece.color === color && piece.kind === "king");
      return king !== undefined && attacked(king.file, king.rank, enemy(color), board);
    };
    const pseudoMoves = (piece: Piece, board: Piece[]): Move[] => {
      const moves: Move[] = [];
      const add = (file: number, rank: number): boolean => {
        if (!inside(file, rank)) return false;
        const occupant = at(file, rank, board);
        if (occupant?.color === piece.color) return false;
        moves.push({ file, rank, ...(occupant === undefined ? {} : { captureId: occupant.id }) });
        return occupant === undefined;
      };
      if (piece.kind === "pawn") {
        const direction = piece.color === "white" ? 1 : -1;
        const promotionRank = piece.color === "white" ? 7 : 0;
        if (at(piece.file, piece.rank + direction, board) === undefined) {
          moves.push({ file: piece.file, rank: piece.rank + direction, ...(piece.rank + direction === promotionRank ? { promotion: promotionKinds[state.promotionIndex] } : {}) });
          if (!piece.moved && at(piece.file, piece.rank + direction * 2, board) === undefined) moves.push({ file: piece.file, rank: piece.rank + direction * 2 });
        }
        for (const file of [piece.file - 1, piece.file + 1]) {
          const rank = piece.rank + direction;
          const occupant = at(file, rank, board);
          if (occupant !== undefined && occupant.color !== piece.color) moves.push({ file, rank, captureId: occupant.id, ...(rank === promotionRank ? { promotion: promotionKinds[state.promotionIndex] } : {}) });
          else if (file === state.enPassantFile && rank === state.enPassantRank && state.enPassantPawn !== "") moves.push({ file, rank, captureId: state.enPassantPawn, enPassant: true });
        }
      } else if (piece.kind === "knight") {
        for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(piece.file + df, piece.rank + dr);
      } else if (piece.kind === "king") {
        for (let df = -1; df <= 1; df += 1) for (let dr = -1; dr <= 1; dr += 1) if (df !== 0 || dr !== 0) add(piece.file + df, piece.rank + dr);
        if (!piece.moved && !inCheck(piece.color, board)) {
          for (const side of ["king", "queen"] as const) {
            const rookFile = side === "king" ? 7 : 0;
            const step = side === "king" ? 1 : -1;
            const rook = at(rookFile, piece.rank, board);
            if (rook?.kind !== "rook" || rook.color !== piece.color || rook.moved) continue;
            let clear = true;
            for (let file = piece.file + step; file !== rookFile; file += step) if (at(file, piece.rank, board) !== undefined) clear = false;
            if (clear && !attacked(piece.file + step, piece.rank, enemy(piece.color), board) && !attacked(piece.file + step * 2, piece.rank, enemy(piece.color), board)) moves.push({ file: piece.file + step * 2, rank: piece.rank, castle: side });
          }
        }
      } else {
        const directions = piece.kind === "bishop" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : piece.kind === "rook" ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [df, dr] of directions) {
          let distance = 1;
          while (add(piece.file + df * distance, piece.rank + dr * distance)) distance += 1;
        }
      }
      return moves;
    };
    const simulate = (piece: Piece, move: Move): Piece[] => {
      const board = pieces.map((entry) => ({ ...entry }));
      const moving = board.find((entry) => entry.id === piece.id);
      if (moving === undefined) return board;
      moving.file = move.file; moving.rank = move.rank; moving.moved = true;
      if (move.captureId !== undefined) { const captured = board.find((entry) => entry.id === move.captureId); if (captured !== undefined) captured.alive = false; }
      if (move.castle !== undefined) {
        const rook = board.find((entry) => entry.alive && entry.color === piece.color && entry.kind === "rook" && entry.rank === piece.rank && entry.file === (move.castle === "king" ? 7 : 0));
        if (rook !== undefined) { rook.file = move.castle === "king" ? 5 : 3; rook.moved = true; }
      }
      return board;
    };
    const legalMoves = (piece: Piece): Move[] => pseudoMoves(piece, pieces).filter((move) => !inCheck(piece.color, simulate(piece, move)));
    const selected = pieces.find((piece) => piece.id === state.selectedId && piece.alive);
    let legal = selected === undefined ? [] : legalMoves(selected);

    const pointerHit = (): { id: string; square: [number, number] } | undefined => {
      const ray = context.picking.pointerRay({ aspect: 16 / 9, camera: "camera.main", maxDistance: 30, pointer: [context.input.getAxis("pointer-x"), context.input.getAxis("pointer-y")] });
      if (!ray.hit) return undefined;
      if (Math.abs(ray.direction[1]) < 0.000001) return undefined;
      const distance = (0.07 - ray.origin[1]) / ray.direction[1];
      if (distance < 0 || distance > ray.maxDistance) return undefined;
      const x = ray.origin[0] + ray.direction[0] * distance;
      const z = ray.origin[2] + ray.direction[2] * distance;
      const file = Math.floor(x + 4);
      const rank = Math.floor(4 - z);
      if (!inside(file, rank)) return undefined;
      const occupant = at(file, rank);
      return { id: occupant?.id ?? `square.${"abcdefgh"[file]}${rank + 1}`, square: [file, rank] };
    };
    const hit = pointerHit();
    if (hit !== undefined) { state.cursorFile = hit.square[0]; state.cursorRank = hit.square[1]; }
    const hoveredPiece = hit === undefined ? undefined : at(hit.square[0], hit.square[1]);
    const hoveredId = hoveredPiece?.id ?? "";
    if (state.hoveredId !== hoveredId) {
      pieces.find((piece) => piece.id === state.hoveredId)?.entity?.patch("Transform", { scale: [9, 9, 9] });
      hoveredPiece?.entity?.patch("Transform", { scale: [9.8, 9.8, 9.8] });
      state.hoveredId = hoveredId;
    }

    const patchHud = (value: Record<string, unknown>): void => context.resources.patch("ChessGame", value);
    const selectAt = (file: number, rank: number): void => {
      const target = at(file, rank);
      if (target !== undefined && target.color === state.turn) {
        state.selectedId = target.id;
        legal = legalMoves(target);
        patchHud({ statusText: `${target.color.toUpperCase()} ${target.kind.toUpperCase()} selected — ${legal.length} legal moves` });
      }
    };
    const commit = (file: number, rank: number): boolean => {
      const moving = pieces.find((piece) => piece.id === state.selectedId && piece.alive);
      if (moving === undefined || state.gameOver) return false;
      const move = legalMoves(moving).find((candidate) => candidate.file === file && candidate.rank === rank);
      if (move === undefined) { patchHud({ statusText: "Illegal destination — choose a highlighted square" }); return false; }
      const fromFile = moving.file;
      const fromRank = moving.rank;
      moving.entity?.patch("ChessPiece", { file, rank, moved: true, ...(move.promotion === undefined ? {} : { kind: move.promotion }) });
      state.animId = moving.id; state.animStart = context.time.elapsed; state.animFromFile = fromFile; state.animFromRank = fromRank;
      if (move.captureId !== undefined) {
        const captured = pieces.find((piece) => piece.id === move.captureId);
        captured?.entity?.patch("ChessPiece", { alive: false });
        captured?.entity?.transform().setPosition([0, -10, 0]);
      }
      if (move.castle !== undefined) {
        const rook = pieces.find((piece) => piece.alive && piece.color === moving.color && piece.kind === "rook" && piece.rank === fromRank && piece.file === (move.castle === "king" ? 7 : 0));
        const rookFile = move.castle === "king" ? 5 : 3;
        rook?.entity?.patch("ChessPiece", { file: rookFile, moved: true });
        rook?.entity?.transform().setPosition([rookFile - 3.5, rook?.entity?.transform().position[1] ?? 0.42, 3.5 - fromRank]);
      }
      state.enPassantFile = -1; state.enPassantRank = -1; state.enPassantPawn = "";
      if (moving.kind === "pawn" && Math.abs(rank - fromRank) === 2) { state.enPassantFile = file; state.enPassantRank = (rank + fromRank) / 2; state.enPassantPawn = moving.id; }
      state.lastFromFile = fromFile; state.lastFromRank = fromRank; state.lastToFile = file; state.lastToRank = rank;
      state.turn = enemy(state.turn); state.halfmove += 1; state.selectedId = ""; state.dragging = false;
      const nextBoard = simulate(moving, move);
      const checked = inCheck(state.turn, nextBoard);
      const nextPieces = nextBoard.filter((piece) => piece.alive && piece.color === state.turn);
      const hasMove = nextPieces.some((piece) => {
        const originalPieces = pieces.map((entry) => ({ ...entry }));
        const original = originalPieces.find((entry) => entry.id === piece.id);
        return original !== undefined && pseudoMoves(piece, nextBoard).some((candidate) => !inCheck(piece.color, (() => {
          const board = nextBoard.map((entry) => ({ ...entry }));
          const active = board.find((entry) => entry.id === piece.id);
          if (active !== undefined) { active.file = candidate.file; active.rank = candidate.rank; if (candidate.captureId !== undefined) { const capture = board.find((entry) => entry.id === candidate.captureId); if (capture !== undefined) capture.alive = false; } }
          return board;
        })()));
      });
      state.gameOver = !hasMove;
      const notation = `${moving.color === "white" ? "White" : "Black"} ${moving.kind} ${"abcdefgh"[fromFile]}${fromRank + 1}–${"abcdefgh"[file]}${rank + 1}${move.captureId ? " capture" : ""}${move.promotion ? ` = ${move.promotion}` : ""}`;
      patchHud({
        moveText: notation,
        statusText: !hasMove ? (checked ? `CHECKMATE — ${enemy(state.turn).toUpperCase()} WINS · Press R` : "STALEMATE · Press R") : checked ? `${state.turn.toUpperCase()} IS IN CHECK` : "Move accepted",
        turnText: state.gameOver ? "GAME OVER" : `${state.turn.toUpperCase()} TO MOVE`,
      });
      return true;
    };

    if (context.input.getButtonDown("restart")) {
      for (const piece of pieces) {
        piece.entity?.patch("ChessPiece", { alive: true, file: piece.initialFile, kind: piece.initialKind, moved: false, rank: piece.initialRank });
        piece.entity?.transform().setPosition([piece.initialFile - 3.5, piece.entity.transform().position[1] < 0 ? 0.5 : piece.entity.transform().position[1], 3.5 - piece.initialRank]);
      }
      Object.assign(state, { animId: "", cursorFile: 4, cursorRank: 1, dragging: false, enPassantFile: -1, enPassantPawn: "", enPassantRank: -1, gameOver: false, halfmove: 1, hoveredId: "", lastFromFile: -1, lastFromRank: -1, lastToFile: -1, lastToRank: -1, selectedId: "", turn: "white" });
      patchHud({ moveText: "New game", statusText: "Click or drag a piece", turnText: "WHITE TO MOVE" });
    }
    if (context.input.getButtonDown("promotion")) { state.promotionIndex = (state.promotionIndex + 1) % promotionKinds.length; patchHud({ promotionText: `Promotion: ${promotionKinds[state.promotionIndex].toUpperCase()}` }); }
    if (context.input.getButtonDown("cancel")) { state.selectedId = ""; state.dragging = false; patchHud({ statusText: "Selection cleared" }); }
    if (context.input.getButtonDown("cursor-left")) state.cursorFile = Math.max(0, state.cursorFile - 1);
    if (context.input.getButtonDown("cursor-right")) state.cursorFile = Math.min(7, state.cursorFile + 1);
    if (context.input.getButtonDown("cursor-up")) state.cursorRank = Math.min(7, state.cursorRank + 1);
    if (context.input.getButtonDown("cursor-down")) state.cursorRank = Math.max(0, state.cursorRank - 1);
    if (context.input.getButtonDown("select")) { if (!commit(state.cursorFile, state.cursorRank)) selectAt(state.cursorFile, state.cursorRank); }
    if (context.input.getButtonDown("pointer-select") && hit !== undefined) {
      if (!commit(hit.square[0], hit.square[1])) selectAt(hit.square[0], hit.square[1]);
      state.dragging = state.selectedId !== "";
    }
    if (context.input.getButtonUp("pointer-select")) {
      if (hit !== undefined) {
        if (state.dragging) commit(hit.square[0], hit.square[1]);
        else if (!commit(hit.square[0], hit.square[1])) selectAt(hit.square[0], hit.square[1]);
      }
      state.dragging = false;
    }

    const currentSelected = pieces.find((piece) => piece.id === state.selectedId && piece.alive);
    legal = currentSelected === undefined ? [] : legalMoves(currentSelected);
    const legalMarkers = allEntities.filter((entity) => entity.id.startsWith("marker.legal.")).sort((left, right) => left.id.localeCompare(right.id));
    for (let index = 0; index < legalMarkers.length; index += 1) {
      const move = legal[index];
      legalMarkers[index]?.transform().setPosition(move === undefined ? [0, -10, 0] : [move.file - 3.5, 0.13, 3.5 - move.rank]);
    }
    const placeMarker = (id: string, file: number, rank: number, y: number): void => context.entity(id)?.transform().setPosition(file < 0 ? [0, -10, 0] : [file - 3.5, y, 3.5 - rank]);
    placeMarker("marker.hover", -1, -1, 0.08);
    placeMarker("marker.selected", currentSelected?.file ?? -1, currentSelected?.rank ?? -1, 0.1);
    placeMarker("marker.last.from", state.lastFromFile, state.lastFromRank, 0.065);
    placeMarker("marker.last.to", state.lastToFile, state.lastToRank, 0.07);
    const kingInCheck = pieces.find((piece) => piece.alive && piece.color === state.turn && piece.kind === "king" && inCheck(state.turn, pieces));
    placeMarker("marker.check", kingInCheck?.file ?? -1, kingInCheck?.rank ?? -1, 0.11);

    if (state.animId !== "") {
      const animated = pieces.find((piece) => piece.id === state.animId);
      if (animated?.entity !== undefined) {
        const t = Math.min(1, (context.time.elapsed - state.animStart) / 0.18);
        const eased = Ease.outCubic(t);
        animated.entity.transform().setPosition([
          state.animFromFile - 3.5 + (animated.file - state.animFromFile) * eased,
          0.07 + Math.sin(Math.PI * t) * 0.24,
          3.5 - state.animFromRank - (animated.rank - state.animFromRank) * eased,
        ]);
        if (t >= 1) state.animId = "";
      }
    }
  },
);
