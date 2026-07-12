import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = "abcdefgh";
const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
const boardSquareSize = 1.036;
const entities = [];

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
  { id: "table.surface", transform: { position: [0, -0.34, 0], rotation: [-1.570796, 0, 0], scale: [22, 16, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.table", receiveShadow: true } } },
  { id: "library.backdrop", transform: { position: [0, 4.5, -8.2], scale: [30, 16, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.library", castShadow: false, receiveShadow: false } } },
  { id: "board.surface", transform: { position: [0, 0, 0], rotation: [-1.570796, 0, 0], scale: [9.35, 9.35, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.board", receiveShadow: true } } },
  { id: "board.base", prefab: "prefab.plinth", transform: { position: [0, -0.23, 0], scale: [9.5, 0.24, 9.5] } },
  { id: "light.ambient", components: { Light: { kind: "ambient", color: "#f2e9de", intensity: 0.4 } } },
  { id: "light.key", transform: { position: [-5.5, 9.5, 6.5], rotation: [-0.78, -0.42, 0] }, components: { Light: { kind: "directional", color: "#fff0dd", intensity: 2.05 } } },
  { id: "light.fill", transform: { position: [5.5, 4.5, -3.5] }, components: { Light: { kind: "point", color: "#dce8f3", intensity: 0.52, range: 19 } } },
  {
    id: "camera.main",
    transform: { position: [0.45, 7.45, 10.35], rotation: [-0.61, 0.035, 0] },
    components: { camera: { mode: "perspective", fovY: 37, near: 0.1, far: 50 } },
  },
);

const prefabs = [
  { id: "prefab.plinth", primitive: "box", color: "#2a1309" },
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
    { id: "ChessGame", value: { blackChoiceText: "PLAY BLACK", turnText: "WHITE TO MOVE", statusText: "Choose a side to begin", helpText: "Choose with the buttons or press W / B", moveText: "New game", promotionText: "Promotion: QUEEN", promptText: "WHICH SIDE DO YOU WANT TO PLAY?", whiteChoiceText: "PLAY WHITE" } },
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
    { id: "choose-white", bindings: ["keyboard.KeyW"] },
    { id: "choose-black", bindings: ["keyboard.KeyB"] },
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
    { id: "mat.ivory", color: "#ead8b8", roughness: 0.22, metalness: 0.05 },
    { id: "mat.ebony", color: "#100d0a", roughness: 0.18, metalness: 0.14 },
    { id: "mat.board.light", color: "#c49a68", roughness: 0.48, metalness: 0 },
    { id: "mat.board.dark", color: "#4a2b18", roughness: 0.44, metalness: 0 },
    { id: "mat.board", color: "#ffffff", baseColorTexture: "tex.chess.board", roughness: 0.5, metalness: 0 },
    { id: "mat.table", color: "#ffffff", baseColorTexture: "tex.chess.table", roughness: 0.62, metalness: 0 },
    { id: "mat.library", kind: "standard", color: "#ffffff", baseColorTexture: "tex.chess.library", roughness: 1, metalness: 0 },
    { id: "mat.brass", color: "#9b642d", roughness: 0.32, metalness: 0.48 },
  ],
});
await writeJson("content/assets/chess-surfaces.assets.json", {
  schema: "threenative.assets", version: "0.1.0", id: "chess-surfaces", assets: [
    { id: "tex.chess.board", type: "texture", path: "assets/board.png", wrapS: "clampToEdge", wrapT: "clampToEdge" },
    { id: "tex.chess.table", type: "texture", path: "assets/table-texture.png", wrapS: "repeat", wrapT: "repeat", repeat: [1.4, 1] },
    { id: "tex.chess.library", type: "texture", path: "assets/library-bkg.png", wrapS: "clampToEdge", wrapT: "clampToEdge", repeat: [1, -1], offset: [0, 1] },
  ],
});
await writeJson("content/meshes/chess.meshes.json", {
  schema: "threenative.meshes", version: "0.1.0", id: "chess-meshes", meshes: [
    { id: "mesh.marker", kind: "primitive", primitive: "cylinder", size: [0.34, 0.04] },
    { id: "mesh.surface", kind: "primitive", primitive: "plane" },
  ],
});

function addPiece(color, kind, file, rank, suffix) {
  const scale = scaleFor(kind);
  entities.push({
    id: `piece.${color}.${suffix}`,
    prefab: `prefab.${color}.${kind}`,
    transform: { position: [(file - 3.5) * boardSquareSize, heightFor(kind), (3.5 - rank) * boardSquareSize], scale },
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
  return [10.5, 10.5, 10.5];
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
