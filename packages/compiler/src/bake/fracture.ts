import { createHash } from "node:crypto";
import {
  MAX_FRACTURE_DEPTH,
  MAX_FRACTURE_PIECES,
  validateFractureManifest,
  type FractureOverflowPolicy,
  type IFractureBond,
  type IFractureManifest,
  type IFracturePiece,
  type Vec3,
} from "@threenative/ir";
import type { IIrDiagnostic } from "@threenative/ir";

export interface IPrimitiveFractureRecipe {
  bondHealth: number;
  cells: [number, number, number];
  dimensions: Vec3;
  energyThreshold?: number;
  impulseThreshold: number;
  kind: "primitive";
  materialResponse?: number;
}

export interface IAuthoredFractureRecipe {
  asset?: string;
  bonds: IFractureBond[];
  kind: "convex" | "imported";
  pieces: IFracturePiece[];
}

export interface IFractureBakeInput {
  cleanup?: IFractureManifest["cleanup"];
  id: string;
  maxActivePieces?: number;
  maxDepth?: number;
  overflowPolicy?: FractureOverflowPolicy;
  recipe: IPrimitiveFractureRecipe | IAuthoredFractureRecipe;
  seed: number;
}

export interface IFractureBakeResult {
  diagnostics: IIrDiagnostic[];
  hash: string;
  json: string;
  manifest: IFractureManifest;
}

export function bakeFractureManifest(input: IFractureBakeInput): IFractureBakeResult {
  const seed = input.seed >>> 0;
  const authored = input.recipe.kind === "primitive" ? bakePrimitive(input.recipe, seed) : {
    bonds: [...input.recipe.bonds].sort(byId),
    pieces: [...input.recipe.pieces].sort(byId),
  };
  const maxDepth = Math.min(MAX_FRACTURE_DEPTH, Math.max(0, Math.trunc(input.maxDepth ?? Math.max(0, ...authored.pieces.map((piece) => piece.activationDepth)))));
  const manifest: IFractureManifest = {
    bonds: authored.bonds,
    budgets: {
      maxActivePieces: Math.min(authored.pieces.length, Math.max(1, Math.trunc(input.maxActivePieces ?? authored.pieces.length))),
      maxDepth,
      overflowPolicy: input.overflowPolicy ?? "reject-new",
    },
    ...(input.cleanup === undefined ? {} : { cleanup: input.cleanup }),
    id: input.id,
    pieces: authored.pieces,
    schema: "threenative.fracture-manifest",
    source: {
      ...(input.recipe.kind === "imported" ? { asset: input.recipe.asset } : {}),
      kind: input.recipe.kind,
      seed,
      sourceHash: `sha256:${"0".repeat(64)}`,
    },
    version: "0.1.0",
  };
  manifest.source.sourceHash = fractureManifestSourceHash(manifest);
  const diagnostics = validateFractureManifest(manifest);
  const json = `${stableJson(manifest)}\n`;
  return { diagnostics, hash: hashBytes(json), json, manifest };
}

export function fractureManifestSourceHash(manifest: IFractureManifest): string {
  const { sourceHash: _sourceHash, ...source } = manifest.source;
  return hashCanonical({ ...manifest, source });
}

function bakePrimitive(recipe: IPrimitiveFractureRecipe, seed: number): { bonds: IFractureBond[]; pieces: IFracturePiece[] } {
  const [nx, ny, nz] = recipe.cells;
  if (![nx, ny, nz].every((value) => Number.isInteger(value) && value > 0) || nx * ny * nz > MAX_FRACTURE_PIECES) throw new Error(`TN_COMPILER_FRACTURE_RECIPE_BUDGET: primitive cells must produce 1-${MAX_FRACTURE_PIECES} pieces.`);
  if (!recipe.dimensions.every((value) => Number.isFinite(value) && value > 0)) throw new Error("TN_COMPILER_FRACTURE_RECIPE_DIMENSIONS: primitive dimensions must be finite and positive.");
  const pieceCount = nx * ny * nz;
  const size: Vec3 = [recipe.dimensions[0] / nx, recipe.dimensions[1] / ny, recipe.dimensions[2] / nz];
  const massFractions = Array.from({ length: pieceCount }, (_, index) => index === pieceCount - 1 ? 1 - (pieceCount - 1) / pieceCount : 1 / pieceCount);
  const pieces: IFracturePiece[] = [];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const linear = indexOf(x, y, z, nx, ny);
    pieces.push({
      activationDepth: Math.min(MAX_FRACTURE_DEPTH, x + y + z),
      collider: { halfExtents: [size[0] / 2, size[1] / 2, size[2] / 2], kind: "box" },
      id: pieceId(linear, pieceCount, seed),
      localPosition: [
        -recipe.dimensions[0] / 2 + size[0] * (x + 0.5),
        -recipe.dimensions[1] / 2 + size[1] * (y + 0.5),
        -recipe.dimensions[2] / 2 + size[2] * (z + 0.5),
      ],
      massFraction: massFractions[linear]!,
    });
  }
  const bonds: IFractureBond[] = [];
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const current = indexOf(x, y, z, nx, ny);
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
      const otherX = x + dx; const otherY = y + dy; const otherZ = z + dz;
      if (otherX >= nx || otherY >= ny || otherZ >= nz) continue;
      const other = indexOf(otherX, otherY, otherZ, nx, ny);
      const endpoints = [pieces[current]!.id, pieces[other]!.id].sort() as [string, string];
      bonds.push({
        ...(recipe.energyThreshold === undefined ? {} : { energyThreshold: recipe.energyThreshold }),
        health: recipe.bondHealth,
        id: `bond.${endpoints[0]}--${endpoints[1]}`,
        impulseThreshold: recipe.impulseThreshold,
        ...(recipe.materialResponse === undefined ? {} : { materialResponse: recipe.materialResponse }),
        pieces: endpoints,
      });
    }
  }
  return { bonds: bonds.sort(byId), pieces: pieces.sort(byId) };
}

function pieceId(index: number, count: number, seed: number): string { const width = Math.max(3, String(count - 1).length); const offset = count === 1 ? 0 : seed % count; return `piece.${String((index + offset) % count).padStart(width, "0")}`; }
function indexOf(x: number, y: number, z: number, nx: number, ny: number): number { return x + nx * (y + ny * z); }
function byId<T extends { id: string }>(left: T, right: T): number { return left.id.localeCompare(right.id); }
function hashBytes(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function hashCanonical(value: unknown): string { return hashBytes(stableJson(value)); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`; }
  return JSON.stringify(value) ?? "null";
}
