import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = "abcdefgh";
const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const entities = [];

for (let rank = 0; rank < 8; rank += 1) {
  for (let file = 0; file < 8; file += 1) {
    entities.push({
      id: `square.${files[file]}${rank + 1}`,
      prefab: (file + rank) % 2 === 0 ? "prefab.square.light" : "prefab.square.dark",
      transform: { position: [file - 3.5, 0, 3.5 - rank], scale: [0.98, 0.12, 0.98] },
      components: { BoardSquare: { file, rank } },
    });
  }
}

for (const color of ["white", "black"]) {
  const pawnRank = color === "white" ? 1 : 6;
  const homeRank = color === "white" ? 0 : 7;
  for (let file = 0; file < 8; file += 1) {
    addPiece(color, "pawn", file, pawnRank, `pawn.${files[file]}${pawnRank + 1}`);
    addPiece(color, backRank[file], file, homeRank, `${backRank[file]}.${files[file]}${homeRank + 1}`);
  }
}

for (let index = 0; index < 28; index += 1) {
  entities.push({
    id: `marker.legal.${String(index).padStart(2, "0")}`,
    prefab: "prefab.marker.legal",
    transform: { position: [0, -10, 0], scale: [0.34, 0.035, 0.34] },
    components: { LegalMarker: { index } },
  });
}

entities.push(
  marker("marker.hover", "prefab.marker.hover", "HoverMarker", [0.92, 0.03, 0.92]),
  marker("marker.selected", "prefab.marker.selected", "SelectedMarker", [0.88, 0.04, 0.88]),
  marker("marker.last.from", "prefab.marker.last", "LastMoveMarker", [0.82, 0.025, 0.82]),
  marker("marker.last.to", "prefab.marker.last", "LastMoveMarker", [0.82, 0.025, 0.82]),
  marker("marker.check", "prefab.marker.check", "CheckMarker", [0.9, 0.05, 0.9]),
  { id: "table.plinth", prefab: "prefab.plinth", transform: { position: [0, -0.28, 0], scale: [9.1, 0.42, 9.1] } },
  { id: "table.trim.n", prefab: "prefab.trim", transform: { position: [0, -0.02, -4.25], scale: [9.1, 0.28, 0.42] } },
  { id: "table.trim.s", prefab: "prefab.trim", transform: { position: [0, -0.02, 4.25], scale: [9.1, 0.28, 0.42] } },
  { id: "table.trim.e", prefab: "prefab.trim", transform: { position: [4.25, -0.02, 0], scale: [0.42, 0.28, 9.1] } },
  { id: "table.trim.w", prefab: "prefab.trim", transform: { position: [-4.25, -0.02, 0], scale: [0.42, 0.28, 9.1] } },
  { id: "light.ambient", components: { Light: { kind: "ambient", color: "#d9e7ff", intensity: 1.3 } } },
  { id: "light.key", transform: { position: [-4, 8, 5], rotation: [-0.8, -0.35, 0] }, components: { Light: { kind: "directional", color: "#fff0d2", intensity: 2.2 } } },
  { id: "light.fill", transform: { position: [4, 5, -4] }, components: { Light: { kind: "point", color: "#78bfff", intensity: 1.4, range: 18 } } },
  {
    id: "camera.main",
    transform: { position: [0, 8.5, 11.5], rotation: [-0.622303, 0, 0] },
    components: { camera: { mode: "perspective", fovY: 42, near: 0.1, far: 40 } },
  },
);

const prefabs = [
  { id: "prefab.square.light", primitive: "box", color: "#d8c7a3" },
  { id: "prefab.square.dark", primitive: "box", color: "#315d56" },
  { id: "prefab.plinth", primitive: "box", color: "#161d26" },
  { id: "prefab.trim", primitive: "box", color: "#b78745" },
  { id: "prefab.marker.legal", primitive: "cylinder", color: "#60d394" },
  { id: "prefab.marker.hover", primitive: "box", color: "#84c7ff" },
  { id: "prefab.marker.selected", primitive: "box", color: "#ffd166" },
  { id: "prefab.marker.last", primitive: "box", color: "#f4a261" },
  { id: "prefab.marker.check", primitive: "box", color: "#ef476f" },
];
for (const color of ["white", "black"]) {
  for (const kind of ["pawn", "rook", "knight", "bishop", "queen", "king"]) {
    prefabs.push({
      id: `prefab.${color}.${kind}`,
      asset: `assets/models/chess/${color}-${kind}.glb`,
      primitive: primitiveFor(kind),
      color: color === "white" ? "#f4ead7" : "#27344a",
    });
  }
}

const scene = {
  schema: "threenative.scene",
  version: "0.1.0",
  id: "chess",
  entities,
  prefabs,
  resources: [
    { id: "ActiveCamera", value: { entity: "camera.main" } },
    { id: "ChessGame", value: { turnText: "WHITE TO MOVE", statusText: "Click or drag a piece", helpText: "Click piece + destination | Drag + drop | Arrows + Enter | P promotion | R restart", moveText: "New game", promotionText: "Promotion: QUEEN" } },
  ],
  systems: [{ id: "chess-game", source: "behavior-metadata", script: { module: "src/scripts/chess.ts", export: "chessGame" } }],
  ui: hud(),
};

await writeJson("content/scenes/chess.scene.json", scene);
await writeJson("content/input/chess.input.json", {
  schema: "threenative.input", version: "0.1.0", id: "chess-input",
  actions: [
    { id: "pointer-select", bindings: ["pointer.0"] },
    { id: "select", bindings: ["keyboard.Enter", "keyboard.Space"] },
    { id: "cursor-left", bindings: ["keyboard.ArrowLeft", "keyboard.KeyA"] },
    { id: "cursor-right", bindings: ["keyboard.ArrowRight", "keyboard.KeyD"] },
    { id: "cursor-up", bindings: ["keyboard.ArrowUp", "keyboard.KeyW"] },
    { id: "cursor-down", bindings: ["keyboard.ArrowDown", "keyboard.KeyS"] },
    { id: "restart", bindings: ["keyboard.KeyR"] },
    { id: "promotion", bindings: ["keyboard.KeyP"] },
    { id: "cancel", bindings: ["keyboard.Escape"] },
  ],
  axes: [
    { id: "pointer-x", negative: [], positive: [], value: "pointer.x" },
    { id: "pointer-y", negative: [], positive: [], value: "pointer.y" },
  ],
});
await writeJson("content/materials/chess.materials.json", {
  schema: "threenative.materials", version: "0.1.0", id: "chess-materials", materials: [
    { id: "mat.ivory", color: "#f4ead7", roughness: 0.28, metalness: 0.08 },
    { id: "mat.slate", color: "#27344a", roughness: 0.32, metalness: 0.16 },
    { id: "mat.board.light", color: "#d8c7a3", roughness: 0.55, metalness: 0.02 },
    { id: "mat.board.dark", color: "#315d56", roughness: 0.5, metalness: 0.04 },
    { id: "mat.brass", color: "#b78745", roughness: 0.3, metalness: 0.65 },
  ],
});
await writeJson("content/meshes/chess.meshes.json", {
  schema: "threenative.meshes", version: "0.1.0", id: "chess-meshes", meshes: [
    { id: "mesh.square", kind: "primitive", primitive: "box", size: [1, 0.12, 1] },
    { id: "mesh.marker", kind: "primitive", primitive: "cylinder", size: [0.34, 0.04] },
  ],
});

function addPiece(color, kind, file, rank, suffix) {
  const scale = scaleFor(kind);
  entities.push({
    id: `piece.${color}.${suffix}`,
    prefab: `prefab.${color}.${kind}`,
    transform: { position: [file - 3.5, heightFor(kind), 3.5 - rank], scale },
    components: { ChessPiece: { color, kind, initialKind: kind, file, rank, initialFile: file, initialRank: rank, moved: false, alive: true } },
  });
}

function marker(id, prefab, component, scale) {
  return { id, prefab, transform: { position: [0, -10, 0], scale }, components: { [component]: {} } };
}

function primitiveFor(kind) {
  return ({ pawn: "sphere", rook: "box", knight: "cone", bishop: "cone", queen: "capsule", king: "cylinder" })[kind];
}

function scaleFor(kind) {
  return [9, 9, 9];
}

function heightFor(kind) {
  return 0.07;
}

function hud() {
  return {
    nodes: [
      { id: "turn", type: "text", text: "WHITE TO MOVE", layout: { left: 24, top: 22, width: 380 } },
      { id: "status", type: "text", text: "Click or drag a piece", layout: { justify: "center", align: "center", top: 22, width: 1280 } },
      { id: "promotion", type: "text", text: "Promotion: QUEEN", layout: { right: 24, top: 22, width: 280 } },
      { id: "move", type: "text", text: "New game", layout: { left: 24, bottom: 54, width: 500 } },
      { id: "help", type: "text", text: "Click piece + destination | Drag + drop | Arrows + Enter | P promotion | R restart", layout: { justify: "center", align: "center", bottom: 20, width: 1280 } },
    ],
    bindings: [
      { node: "turn", resource: "ChessGame.turnText" },
      { node: "status", resource: "ChessGame.statusText" },
      { node: "promotion", resource: "ChessGame.promotionText" },
      { node: "move", resource: "ChessGame.moveText" },
      { node: "help", resource: "ChessGame.helpText" },
    ],
  };
}

async function writeJson(relative, value) {
  const path = resolve(root, relative);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
