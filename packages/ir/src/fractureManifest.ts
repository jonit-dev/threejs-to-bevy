import type { IIrDiagnostic } from "./validate.js";
import type { Quat, Vec3 } from "./types.js";

export const FRACTURE_MANIFEST_SCHEMA = "threenative.fracture-manifest" as const;
export const FRACTURE_MANIFEST_VERSION = "0.1.0" as const;
export const MAX_FRACTURE_PIECES = 256;
export const MAX_FRACTURE_DEPTH = 8;

export type FractureOverflowPolicy = "despawn-oldest" | "reject-new" | "sleep-oldest";
export type FractureSourceKind = "convex" | "imported" | "primitive";

export type IFracturePieceCollider =
  | { halfExtents: Vec3; kind: "box" }
  | { radius: number; kind: "sphere" }
  | { halfHeight: number; radius: number; kind: "capsule" }
  | { kind: "convexHull"; vertices: Vec3[] };

export interface IFracturePiece {
  activationDepth: number;
  collider: IFracturePieceCollider;
  id: string;
  localPosition: Vec3;
  localRotation?: Quat;
  massFraction: number;
  sourceNode?: string;
}

export interface IFractureBond {
  energyThreshold?: number;
  health: number;
  id: string;
  impulseThreshold: number;
  materialResponse?: number;
  pieces: [string, string];
}

export interface IFractureManifest {
  bonds: IFractureBond[];
  budgets: {
    maxActivePieces: number;
    maxDepth: number;
    overflowPolicy: FractureOverflowPolicy;
  };
  cleanup?: {
    despawnAfterSeconds?: number;
    poolCapacity?: number;
    sleepAfterSeconds?: number;
  };
  id: string;
  pieces: IFracturePiece[];
  schema: typeof FRACTURE_MANIFEST_SCHEMA;
  source: {
    asset?: string;
    kind: FractureSourceKind;
    seed: number;
    sourceHash: string;
  };
  version: typeof FRACTURE_MANIFEST_VERSION;
}

export function validateFractureManifest(manifest: unknown, path = "fracture.manifest.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(manifest)) return [error("TN_IR_FRACTURE_MANIFEST_INVALID", path, "Fracture manifest must be an object.", "Regenerate it with tn physics fracture generate.")];
  if (manifest.schema !== FRACTURE_MANIFEST_SCHEMA || manifest.version !== FRACTURE_MANIFEST_VERSION) {
    diagnostics.push(error("TN_IR_FRACTURE_MANIFEST_SCHEMA", path, "Fracture manifest schema or version is unsupported.", `Use ${FRACTURE_MANIFEST_SCHEMA}@${FRACTURE_MANIFEST_VERSION}.`));
  }
  if (!stableId(manifest.id)) diagnostics.push(error("TN_IR_FRACTURE_ID_INVALID", `${path}/id`, "Fracture manifest id must be a stable non-empty identifier.", "Use an ASCII identifier such as wall.main."));
  validateSource(manifest.source, `${path}/source`, diagnostics);
  const pieces = Array.isArray(manifest.pieces) ? manifest.pieces : [];
  if (!Array.isArray(manifest.pieces) || pieces.length === 0 || pieces.length > MAX_FRACTURE_PIECES) diagnostics.push(error("TN_IR_FRACTURE_PIECE_BUDGET", `${path}/pieces`, `Fracture manifests require 1-${MAX_FRACTURE_PIECES} pieces.`, "Reduce the build-time fracture recipe or imported piece set."));
  const pieceIds = new Set<string>();
  let massFraction = 0;
  pieces.forEach((piece, index) => {
    const piecePath = `${path}/pieces/${index}`;
    if (!isRecord(piece) || !stableId(piece.id)) {
      diagnostics.push(error("TN_IR_FRACTURE_PIECE_INVALID", piecePath, "Fracture piece requires a stable id.", "Assign a unique stable piece id."));
      return;
    }
    if (pieceIds.has(piece.id as string)) diagnostics.push(error("TN_IR_FRACTURE_PIECE_DUPLICATE", `${piecePath}/id`, `Duplicate fracture piece '${piece.id as string}'.`, "Give every piece a unique id."));
    pieceIds.add(piece.id as string);
    if (!positive(piece.massFraction)) diagnostics.push(error("TN_IR_FRACTURE_MASS_INVALID", `${piecePath}/massFraction`, "Piece massFraction must be finite and positive.", "Use positive fractions that sum to 1."));
    else massFraction += piece.massFraction as number;
    if (!vec3(piece.localPosition)) diagnostics.push(error("TN_IR_FRACTURE_POSE_INVALID", `${piecePath}/localPosition`, "Piece localPosition must be a finite vec3.", "Provide [x,y,z] in meters."));
    if (piece.localRotation !== undefined && !quat(piece.localRotation)) diagnostics.push(error("TN_IR_FRACTURE_POSE_INVALID", `${piecePath}/localRotation`, "Piece localRotation must be a finite non-zero quaternion.", "Provide [x,y,z,w], normally [0,0,0,1]."));
    if (!integerIn(piece.activationDepth, 0, MAX_FRACTURE_DEPTH)) diagnostics.push(error("TN_IR_FRACTURE_DEPTH_INVALID", `${piecePath}/activationDepth`, `activationDepth must be an integer from 0 to ${MAX_FRACTURE_DEPTH}.`, "Lower the hierarchy depth."));
    validateCollider(piece.collider, `${piecePath}/collider`, diagnostics);
  });
  if (pieces.length > 0 && Math.abs(massFraction - 1) > 0.000001) diagnostics.push(error("TN_IR_FRACTURE_MASS_SUM", `${path}/pieces`, `Piece mass fractions sum to ${massFraction}, not 1.`, "Normalize all mass fractions so their sum is 1."));
  const bonds = Array.isArray(manifest.bonds) ? manifest.bonds : [];
  if (!Array.isArray(manifest.bonds)) diagnostics.push(error("TN_IR_FRACTURE_BONDS_INVALID", `${path}/bonds`, "Fracture bonds must be an array.", "Bake adjacency bonds between pieces."));
  const bondIds = new Set<string>();
  const connected = new Map<string, Set<string>>([...pieceIds].map((id) => [id, new Set<string>()]));
  bonds.forEach((bond, index) => {
    const bondPath = `${path}/bonds/${index}`;
    if (!isRecord(bond) || !stableId(bond.id) || !Array.isArray(bond.pieces) || bond.pieces.length !== 2 || !bond.pieces.every(stableId)) {
      diagnostics.push(error("TN_IR_FRACTURE_BOND_INVALID", bondPath, "Bond requires a stable id and exactly two piece ids.", "Regenerate adjacency bonds from the fracture source."));
      return;
    }
    const [left, right] = bond.pieces as [string, string];
    if (bondIds.has(bond.id as string)) diagnostics.push(error("TN_IR_FRACTURE_BOND_DUPLICATE", `${bondPath}/id`, `Duplicate fracture bond '${bond.id as string}'.`, "Give every bond a unique stable id."));
    bondIds.add(bond.id as string);
    if (left === right || !pieceIds.has(left) || !pieceIds.has(right)) diagnostics.push(error("TN_IR_FRACTURE_BOND_REFERENCE", `${bondPath}/pieces`, "Bond endpoints must reference two different declared pieces.", "Fix or regenerate the bond endpoints."));
    else { connected.get(left)?.add(right); connected.get(right)?.add(left); }
    for (const key of ["health", "impulseThreshold"] as const) if (!positive(bond[key])) diagnostics.push(error("TN_IR_FRACTURE_BOND_THRESHOLD", `${bondPath}/${key}`, `Bond ${key} must be finite and positive.`, "Use a positive SI threshold."));
    for (const key of ["energyThreshold", "materialResponse"] as const) if (bond[key] !== undefined && !positive(bond[key])) diagnostics.push(error("TN_IR_FRACTURE_BOND_THRESHOLD", `${bondPath}/${key}`, `Bond ${key} must be finite and positive when set.`, "Remove it or use a positive value."));
  });
  if (pieceIds.size > 1 && connectedComponents(connected) !== 1) diagnostics.push(error("TN_IR_FRACTURE_DISCONNECTED", `${path}/bonds`, "Fracture pieces must form one connected bond graph.", "Add adjacency bonds or split disconnected pieces into separate assemblies."));
  validateBudgets(manifest.budgets, pieceIds.size, `${path}/budgets`, diagnostics);
  validateCleanup(manifest.cleanup, `${path}/cleanup`, diagnostics);
  return diagnostics;
}

function validateSource(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value) || !["convex", "imported", "primitive"].includes(value.kind as string) || !integerIn(value.seed, 0, 0xffff_ffff) || typeof value.sourceHash !== "string" || !/^sha256[:-][a-f0-9]{64}$/u.test(value.sourceHash)) diagnostics.push(error("TN_IR_FRACTURE_SOURCE_INVALID", path, "Fracture source requires a supported kind, uint32 seed, and sha256 hash.", "Regenerate the manifest from a bounded source recipe."));
  if (isRecord(value) && value.kind === "imported" && !stableId(value.asset)) diagnostics.push(error("TN_IR_FRACTURE_SOURCE_ASSET_REQUIRED", `${path}/asset`, "Imported fracture source requires an asset id.", "Reference the pre-fractured GLB asset."));
}

function validateBudgets(value: unknown, pieceCount: number, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) { diagnostics.push(error("TN_IR_FRACTURE_BUDGET_INVALID", path, "Fracture budgets are required.", "Declare maxActivePieces, maxDepth, and overflowPolicy.")); return; }
  if (!integerIn(value.maxActivePieces, 1, Math.min(MAX_FRACTURE_PIECES, Math.max(1, pieceCount)))) diagnostics.push(error("TN_IR_FRACTURE_BUDGET_INVALID", `${path}/maxActivePieces`, "maxActivePieces must be within the assembly piece count and portable cap.", "Lower the active-piece budget."));
  if (!integerIn(value.maxDepth, 0, MAX_FRACTURE_DEPTH)) diagnostics.push(error("TN_IR_FRACTURE_BUDGET_INVALID", `${path}/maxDepth`, `maxDepth must be an integer from 0 to ${MAX_FRACTURE_DEPTH}.`, "Lower the activation depth."));
  if (!["despawn-oldest", "reject-new", "sleep-oldest"].includes(value.overflowPolicy as string)) diagnostics.push(error("TN_IR_FRACTURE_BUDGET_INVALID", `${path}/overflowPolicy`, "overflowPolicy must be reject-new, sleep-oldest, or despawn-oldest.", "Choose a portable overflow policy."));
}

function validateCleanup(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) return;
  if (!isRecord(value)) { diagnostics.push(error("TN_IR_FRACTURE_CLEANUP_INVALID", path, "cleanup must be an object.", "Remove cleanup or declare bounded cleanup fields.")); return; }
  for (const key of ["despawnAfterSeconds", "sleepAfterSeconds"] as const) if (value[key] !== undefined && !positive(value[key])) diagnostics.push(error("TN_IR_FRACTURE_CLEANUP_INVALID", `${path}/${key}`, `${key} must be finite and positive.`, "Use a positive duration in seconds."));
  if (value.poolCapacity !== undefined && !integerIn(value.poolCapacity, 0, MAX_FRACTURE_PIECES)) diagnostics.push(error("TN_IR_FRACTURE_CLEANUP_INVALID", `${path}/poolCapacity`, `poolCapacity must be an integer from 0 to ${MAX_FRACTURE_PIECES}.`, "Lower the pool capacity."));
}

function validateCollider(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value) || !["box", "capsule", "convexHull", "sphere"].includes(value.kind as string)) { diagnostics.push(error("TN_IR_FRACTURE_COLLIDER_INVALID", path, "Piece collider must be box, capsule, sphere, or convexHull.", "Bake a bounded primitive or convex collider.")); return; }
  const valid = value.kind === "box" ? vec3(value.halfExtents) && (value.halfExtents as readonly number[]).every(positive) : value.kind === "sphere" ? positive(value.radius) : value.kind === "capsule" ? positive(value.radius) && positive(value.halfHeight) : Array.isArray(value.vertices) && value.vertices.length >= 4 && value.vertices.length <= 64 && value.vertices.every(vec3);
  if (!valid) diagnostics.push(error("TN_IR_FRACTURE_COLLIDER_INVALID", path, "Piece collider dimensions or vertices are outside portable bounds.", "Regenerate a positive primitive collider or a 4-64 vertex convex hull."));
}

function connectedComponents(graph: Map<string, Set<string>>): number { const seen = new Set<string>(); let count = 0; for (const id of graph.keys()) { if (seen.has(id)) continue; count += 1; const queue = [id]; while (queue.length > 0) { const next = queue.pop()!; if (seen.has(next)) continue; seen.add(next); queue.push(...(graph.get(next) ?? [])); } } return count; }
function error(code: string, path: string, message: string, suggestion: string): IIrDiagnostic { return { code, message, path, severity: "error", suggestion }; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function positive(value: unknown): value is number { return finite(value) && value > 0; }
function integerIn(value: unknown, min: number, max: number): value is number { return Number.isInteger(value) && (value as number) >= min && (value as number) <= max; }
function stableId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value); }
function vec3(value: unknown): value is Vec3 { return Array.isArray(value) && value.length === 3 && value.every(finite); }
function quat(value: unknown): value is Quat { return Array.isArray(value) && value.length === 4 && value.every(finite) && Math.hypot(...value) > 0.000001; }
