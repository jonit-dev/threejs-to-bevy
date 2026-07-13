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
    transform: { position: [0, -10, 0], scale: [0.88, 0.018, 0.88] },
    components: { LegalMarker: { index }, MeshRenderer: { mesh: "mesh.highlight.box", material: "mat.highlight.legal", castShadow: false, receiveShadow: false } },
  });
}

for (let index = 0; index < 6; index += 1) {
  entities.push({
    id: `marker.arc.${String(index).padStart(2, "0")}`,
    transform: { position: [0, -10, 0], rotation: [0, 0, 0], scale: [0.4, 0.025, 0.07] },
    components: { MoveArcMarker: { index }, MeshRenderer: { mesh: "mesh.highlight.box", material: "mat.highlight.path", castShadow: false, receiveShadow: false } },
  });
}

for (let index = 0; index < 4; index += 1) {
  entities.push({
    id: `marker.selected.edge.${String(index).padStart(2, "0")}`,
    transform: { position: [0, -10, 0], scale: index < 2 ? [0.46, 0.025, 0.025] : [0.025, 0.025, 0.46] },
    components: { SelectedEdgeMarker: { index }, MeshRenderer: { mesh: "mesh.highlight.box", material: "mat.highlight.selected.edge", castShadow: false, receiveShadow: false } },
  });
}

entities.push(
  renderMarker("marker.selected", "SelectedMarker", [0.94, 0.012, 0.94], "mat.highlight.selected"),
  marker("marker.hover", "prefab.marker.hover", "HoverMarker", [0.92, 0.03, 0.92]),
  marker("marker.last.from", "prefab.marker.last", "LastMoveMarker", [0.82, 0.025, 0.82]),
  marker("marker.last.to", "prefab.marker.last", "LastMoveMarker", [0.82, 0.025, 0.82]),
  marker("marker.check", "prefab.marker.check", "CheckMarker", [0.9, 0.05, 0.9]),
  { id: "table.surface", transform: { position: [0, -0.34, 0], rotation: [-1.570796, 0, 0], scale: [22, 16, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.table", receiveShadow: true } } },
  { id: "library.backdrop", transform: { position: [0, 4.5, -8.2], scale: [30, 16, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.library", castShadow: false, receiveShadow: false } } },
  { id: "board.surface", transform: { position: [0, 0, 0], rotation: [-1.570796, 0, 0], scale: [9.35, 9.35, 1] }, components: { MeshRenderer: { mesh: "mesh.surface", material: "mat.board", receiveShadow: true } } },
  { id: "board.base", prefab: "prefab.plinth", transform: { position: [0, -0.23, 0], scale: [9.5, 0.24, 9.5] } },
  { id: "light.ambient", components: { Light: { kind: "ambient", color: "#f5e8d6", intensity: 0.62 } } },
  { id: "light.key", transform: { position: [-5.5, 9.5, 6.5], rotation: [-0.78, -0.42, 0] }, components: { Light: { kind: "directional", color: "#ffe4bd", intensity: 2.35, shadowBias: -0.0003 } } },
  { id: "light.fill", transform: { position: [5.5, 4.5, -3.5] }, components: { Light: { kind: "point", color: "#d9e8f5", intensity: 0.88, range: 19 } } },
  { id: "light.rim", transform: { position: [-4.8, 5.8, -5.4] }, components: { Light: { kind: "point", color: "#ffb65c", intensity: 0.72, range: 15 } } },
  {
    id: "camera.main",
    transform: { position: [0.45, 7.45, 10.35], rotation: [-0.61, 0.035, 0] },
    components: { camera: { mode: "perspective", fovY: 37, near: 0.1, far: 50 } },
  },
);

const prefabs = [
  { id: "prefab.plinth", primitive: "box", color: "#2a1309" },
  { id: "prefab.marker.legal", primitive: "box", color: "#d8a33a" },
  { id: "prefab.marker.hover", primitive: "box", color: "#84c7ff" },
  { id: "prefab.marker.selected", primitive: "box", color: "#37df68" },
  { id: "prefab.marker.selected.edge", primitive: "box", color: "#37df68" },
  { id: "prefab.marker.last", primitive: "box", color: "#a86f2a" },
  { id: "prefab.marker.check", primitive: "box", color: "#e14d5b" },
  { id: "prefab.marker.arc", primitive: "box", color: "#f2b94b" },
];
for (const color of ["white", "black"]) {
  for (const kind of ["pawn", "rook", "knight", "bishop", "queen", "king"]) {
    prefabs.push({
      color: color === "white" ? "#f0dfbd" : "#241a13",
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
    { id: "ChessGame", value: { blackChoiceText: "PLAY BLACK", moveHistoryText: "No moves yet", opponentCapturedText: "—", opponentClockText: "TIME 14:57", opponentNameText: "ARTEMIS", opponentRatingText: "RATING 1592", opponentSideText: "", playerCapturedText: "—", playerClockText: "TIME 14:32", playerNameText: "YOU", playerRatingText: "RATING 1654", playerSideText: "", turnSubText: "MOVE 1", turnText: "READY", statusText: "Choose a side to begin", helpText: "Choose with the buttons or press W / B", moveText: "New game", promotionText: "Promotion: QUEEN", promptText: "WHICH SIDE DO YOU WANT TO PLAY?", whiteChoiceText: "PLAY WHITE" } },
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
    { id: "mat.ivory", color: "#f0dfbd", roughness: 0.18, metalness: 0.04, clearcoat: 0.42, clearcoatRoughness: 0.2 },
    { id: "mat.ebony", color: "#241a13", roughness: 0.16, metalness: 0.08, clearcoat: 0.58, clearcoatRoughness: 0.16 },
    { id: "mat.board.light", color: "#c49a68", roughness: 0.48, metalness: 0 },
    { id: "mat.board.dark", color: "#4a2b18", roughness: 0.44, metalness: 0 },
    { id: "mat.board", color: "#ffffff", baseColorTexture: "tex.chess.board", roughness: 0.5, metalness: 0 },
    { id: "mat.table", color: "#ffffff", baseColorTexture: "tex.chess.table", roughness: 0.62, metalness: 0 },
    { id: "mat.library", kind: "standard", color: "#ffffff", baseColorTexture: "tex.chess.library", roughness: 1, metalness: 0 },
    { id: "mat.brass", color: "#9b642d", roughness: 0.32, metalness: 0.48 },
    { id: "mat.highlight.legal", kind: "standard", alphaMode: "blend", color: "#b88422", emissive: "#d89b28", emissiveIntensity: 0.42, opacity: 0.34, roughness: 0.4, metalness: 0 },
    { id: "mat.highlight.path", kind: "standard", alphaMode: "blend", color: "#e4a92f", emissive: "#f0ad25", emissiveIntensity: 0.78, opacity: 0.58, roughness: 0.35, metalness: 0 },
    { id: "mat.highlight.selected", kind: "standard", alphaMode: "blend", color: "#166b32", emissive: "#24b94e", emissiveIntensity: 0.3, opacity: 0.13, roughness: 0.4, metalness: 0 },
    { id: "mat.highlight.selected.edge", kind: "standard", alphaMode: "blend", color: "#38dd61", emissive: "#35e965", emissiveIntensity: 1.25, opacity: 0.82, roughness: 0.3, metalness: 0 },
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
    { id: "mesh.highlight.box", kind: "primitive", primitive: "box", size: [1, 1, 1] },
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

function renderMarker(id, component, scale, material) {
  return { id, transform: { position: [0, -10, 0], scale }, components: { [component]: {}, MeshRenderer: { mesh: "mesh.highlight.box", material, castShadow: false, receiveShadow: false } } };
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
  const panel = {
    backgroundColor: "#090b0de8",
    borderColor: "#c69a5066",
    borderRadius: 8,
    borderWidth: 1,
    shadow: { blur: 26, color: "#000000a8", offsetY: 12, spread: 0 },
  };
  const heading = { color: "#f1eadf", fontSize: 16, fontWeight: "bold" };
  const muted = { color: "#9d968c", fontSize: 12 };
  const avatar = { backgroundColor: "#1d2d36", borderColor: "#d8a33a99", borderRadius: 5, borderWidth: 1, color: "#dce9ed", fontSize: 38, fontWeight: "bold", textAlign: "center" };
  const button = { backgroundColor: "#191a18e8", borderColor: "#c69a5066", borderRadius: 6, borderWidth: 1, color: "#eee5d8", fontSize: 13, fontWeight: "bold", textAlign: "center" };
  return {
    nodes: [
      { id: "opponent-card", type: "column", layout: { height: 170, inset: { left: 24, top: 34 }, position: "absolute", width: 252 }, style: panel },
      { id: "opponent-avatar", type: "text", text: "A", layout: { align: "center", height: 62, inset: { left: 38, top: 49 }, justify: "center", position: "absolute", width: 62 }, style: avatar },
      { id: "opponent-name", type: "text", text: "ARTEMIS", layout: { inset: { left: 114, top: 51 }, position: "absolute", width: 148 }, style: heading },
      { id: "opponent-side", type: "text", text: "BLACK", layout: { inset: { left: 114, top: 78 }, position: "absolute", width: 148 }, style: muted },
      { id: "opponent-rating", type: "text", text: "RATING 1592", layout: { inset: { left: 114, top: 98 }, position: "absolute", width: 148 }, style: muted },
      { id: "opponent-clock", type: "text", text: "TIME 14:57", layout: { inset: { left: 38, top: 133 }, position: "absolute", width: 210 }, style: { ...muted, color: "#e9e0d2", fontSize: 13 } },
      { id: "player-card", type: "column", layout: { height: 132, inset: { bottom: 156, left: 24 }, position: "absolute", width: 252 }, style: panel },
      { id: "player-avatar", type: "text", text: "Y", layout: { align: "center", height: 62, inset: { bottom: 168, left: 38 }, justify: "center", position: "absolute", width: 62 }, style: { ...avatar, backgroundColor: "#24282b" } },
      { id: "player-name", type: "text", text: "YOU", layout: { bottom: 234, inset: { left: 114 }, position: "absolute", width: 148 }, style: heading },
      { id: "player-side", type: "text", text: "WHITE", layout: { bottom: 211, inset: { left: 114 }, position: "absolute", width: 148 }, style: muted },
      { id: "player-rating", type: "text", text: "RATING 1654", layout: { bottom: 191, inset: { left: 114 }, position: "absolute", width: 148 }, style: muted },
      { id: "player-clock", type: "text", text: "TIME 14:32", layout: { bottom: 171, inset: { left: 114 }, position: "absolute", width: 148 }, style: { ...muted, color: "#e9e0d2", fontSize: 13 } },
      { id: "turn-card", type: "column", layout: { height: 96, inset: { right: 24, top: 34 }, position: "absolute", width: 248 }, style: panel },
      { id: "turn-dot", type: "text", text: "●", layout: { inset: { right: 220, top: 51 }, position: "absolute", width: 28 }, style: { color: "#7cdb43", fontSize: 26 } },
      { id: "turn", type: "text", text: "YOUR TURN", layout: { inset: { right: 40, top: 51 }, position: "absolute", width: 170 }, style: { ...heading, fontSize: 20 } },
      { id: "turn-sub", type: "text", text: "MOVE 1", layout: { inset: { right: 40, top: 79 }, position: "absolute", width: 170 }, style: { ...muted, fontSize: 14 } },
      { id: "move-history-card", type: "column", layout: { height: 300, inset: { right: 24, top: 146 }, position: "absolute", width: 248 }, style: panel },
      { id: "move-history-label", type: "text", text: "MOVES", layout: { inset: { right: 40, top: 162 }, position: "absolute", width: 216 }, style: muted },
      { id: "move-history", type: "text", text: "No moves yet", layout: { inset: { right: 40, top: 190 }, position: "absolute", width: 216 }, style: { ...heading, fontSize: 14, wrap: "word" } },
      { id: "status", type: "text", text: "Your move", layout: { align: "center", inset: { left: 300, right: 300, top: 24 }, justify: "center", position: "absolute" }, style: { ...heading, color: "#f0d38f", fontSize: 14, textAlign: "center" } },
      { id: "promotion", type: "text", text: "Promotion: QUEEN", layout: { bottom: 24, right: 330, position: "absolute", width: 180 }, style: muted },
      { id: "help", type: "text", text: "Click piece + destination  |  Drag + drop  |  Arrows + Enter  |  R restart", layout: { align: "center", bottom: 20, inset: { left: 0, right: 0 }, justify: "center", position: "absolute" }, style: { ...muted, fontSize: 11, textAlign: "center" } },
    ],
    bindings: [
      { node: "opponent-name", resource: "ChessGame.opponentNameText" },
      { node: "opponent-side", resource: "ChessGame.opponentSideText" },
      { node: "opponent-rating", resource: "ChessGame.opponentRatingText" },
      { node: "opponent-clock", resource: "ChessGame.opponentClockText" },
      { node: "player-name", resource: "ChessGame.playerNameText" },
      { node: "player-side", resource: "ChessGame.playerSideText" },
      { node: "player-rating", resource: "ChessGame.playerRatingText" },
      { node: "player-clock", resource: "ChessGame.playerClockText" },
      { node: "turn", resource: "ChessGame.turnText" },
      { node: "turn-sub", resource: "ChessGame.turnSubText" },
      { node: "status", resource: "ChessGame.statusText" },
      { node: "move-history", resource: "ChessGame.moveHistoryText" },
      { node: "promotion", resource: "ChessGame.promotionText" },
      { node: "help", resource: "ChessGame.helpText" },
    ],
  };
}

async function writeJson(relative, value) {
  const path = resolve(root, relative);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
