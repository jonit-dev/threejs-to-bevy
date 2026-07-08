import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { WORLD_BIOMES, WORLD_BIOME_IDS, isWorldBiomeId, type IWorldBiomeDefinition, type WorldBiomeId } from "@threenative/authoring";

import { searchAssetSources, type IAssetSourceRecord } from "../assetSourceCatalog/catalog.js";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { normalizeArgv, readFlag, resolveProjectPath } from "./sourceCommandUtils.js";

type JsonRecord = Record<string, unknown>;

interface IWorldGenerateResult {
  assetsPath: string;
  biome: WorldBiomeId;
  code: "TN_WORLD_GENERATE_OK";
  environmentPath: string;
  heightmapPath: string;
  message: string;
  proofCommand: string;
  provenance: Array<{ id: string; purpose: string; sourceUrl: string }>;
  seed: number;
}

interface IWorldProofResult extends JsonRecord {
  diagnostics: JsonRecord[];
}

export async function worldCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const json = normalizedArgv.includes("--json");
  const positionals = normalizedArgv.filter((arg, index) => !arg.startsWith("-") && !worldFlagsWithValues.has(normalizedArgv[index - 1] ?? ""));
  const subcommand = positionals[0];
  const projectPath = resolveProjectPath(normalizedArgv);

  if (subcommand === "generate") {
    const biomeArg = readFlag(normalizedArgv, "--biome");
    const seed = readIntegerFlag(normalizedArgv, "--seed", 1);
    const size = readIntegerFlag(normalizedArgv, "--size", 64);
    const flattenRadius = readNumberFlag(normalizedArgv, "--flatten-radius");
    if (biomeArg === undefined || !isWorldBiomeId(biomeArg)) {
      return diagnosticResult({ code: "TN_WORLD_BIOME_INVALID", message: `Usage: tn world generate --biome <${WORLD_BIOME_IDS.join("|")}> --seed <n> [--size <n>] [--project <path>] [--json].` }, { exitCode: 2, json, stderr: !json });
    }
    if (seed.diagnostic !== undefined || size.diagnostic !== undefined || flattenRadius.diagnostic !== undefined) {
      return diagnosticResult({ code: "TN_WORLD_NUMERIC_FLAG_INVALID", message: "World size, seed, and flatten radius must be finite numbers." }, { exitCode: 2, json, stderr: !json });
    }
    const result = await generateWorld({
      biome: biomeArg,
      flattenRadius: flattenRadius.value,
      projectPath,
      seed: seed.value,
      size: size.value,
    });
    return { exitCode: 0, stdout: json ? `${JSON.stringify(result, null, 2)}\n` : `${result.message}\n${result.proofCommand}\n` };
  }

  if (subcommand === "proof") {
    const result = await proofWorld(projectPath);
    const ok = result.diagnostics.length === 0;
    return {
      exitCode: ok ? 0 : 1,
      stdout: json ? `${JSON.stringify(result, null, 2)}\n` : `${result.message}\n`,
    };
  }

  return diagnosticResult({ code: "TN_WORLD_COMMAND_UNKNOWN", message: "Usage: tn world generate --biome <name> --seed <n> [--size <n>] [--project <path>] [--json] or tn world proof [--project <path>] [--json]." }, { exitCode: 2, json, stderr: !json });
}

async function generateWorld(options: {
  biome: WorldBiomeId;
  flattenRadius?: number;
  projectPath: string;
  seed: number;
  size: number;
}): Promise<IWorldGenerateResult> {
  const biome = WORLD_BIOMES[options.biome];
  const size = Math.max(9, Math.min(257, options.size));
  const samplesPerAxis = size % 2 === 0 ? size + 1 : size;
  const cellSize = 1;
  const worldHalf = ((samplesPerAxis - 1) * cellSize) / 2;
  const flattenRadius = options.flattenRadius ?? biome.flattenRadius;
  const heightmapId = `heightmap.world.${biome.id}`;
  const heightmapPath = `assets/terrain/world-${biome.id}.heightmap.json`;
  const terrainId = `terrain.world.${biome.id}`;
  const records = await selectBiomeCatalogRecords(biome);
  const provenance = records.map((entry) => ({
    id: entry.record.id,
    purpose: entry.purpose,
    sourceUrl: entry.record.sourceUrl,
  }));
  const heightSamples = generateHeightSamples(samplesPerAxis, biome, options.seed, flattenRadius);
  const projectHeightmapPath = resolve(options.projectPath, heightmapPath);
  await mkdir(resolve(options.projectPath, "assets/terrain"), { recursive: true });
  await writeStableJson(projectHeightmapPath, { samples: heightSamples });

  const assetsPath = "content/assets/world.assets.json";
  const environmentPath = "content/environment/world.environment.json";
  await writeStableJson(resolve(options.projectPath, assetsPath), {
    assets: [
      {
        encoding: "float32",
        format: "json",
        height: samplesPerAxis,
        heightRange: biome.heightRange,
        id: heightmapId,
        path: heightmapPath,
        type: "heightmap",
        width: samplesPerAxis,
      },
      ...records.map((entry) => catalogAssetRow(entry.record, entry.purpose)),
    ],
    id: "world",
    provenance: {
      biome: biome.id,
      catalogRecords: provenance,
      generatedBy: "tn world generate",
      seed: options.seed,
    },
    schema: "threenative.assets",
    version: "0.1.0",
  });
  await writeStableJson(resolve(options.projectPath, environmentPath), {
    atmosphere: {
      fog: { color: biome.atmosphere.fogColor, density: biome.atmosphere.fogDensity, mode: "exponential" },
      sky: { color: biome.atmosphere.skyColor, mode: "color" },
    },
    id: "world",
    instances: [],
    path: { id: "path.world.main", points: [[-flattenRadius, 0, 0], [flattenRadius, 0, 0]], width: 2 },
    provenance: {
      biome: biome.id,
      boundaryStyle: biome.boundaryStyle,
      catalogRecords: provenance,
      generatedBy: "tn world generate",
      seed: options.seed,
    },
    scatter: biome.scatter.map((layer, index) => ({
      assetIds: [`env.${layer.category}.${index}`],
      bounds: { min: [-worldHalf, 0, -worldHalf], max: [worldHalf, 0, worldHalf] },
      density: layer.density,
      exclusionZoneIds: ["playable-flat"],
      id: `scatter.${biome.id}.${layer.category}.${index}`,
      maxScale: layer.maxScale,
      maxSlope: layer.maxSlope,
      minScale: layer.minScale,
      seed: options.seed + index + 11,
    })),
    schema: "threenative.environment-scene",
    sourceAssets: biome.scatter.map((layer, index) => ({
      asset: `model.world.${layer.category}.${index}`,
      category: layer.category,
      id: `env.${layer.category}.${index}`,
    })),
    terrain: {
      bounds: { min: [-worldHalf, biome.heightRange.min, -worldHalf], max: [worldHalf, biome.heightRange.max, worldHalf] },
      heightMode: "heightmap",
      heightmap: { asset: heightmapId, cellSize, heightScale: 1, origin: [-worldHalf, 0, -worldHalf] },
      id: terrainId,
      splatLayers: records.filter((entry) => entry.purpose.startsWith("splat")).slice(0, 4).map((entry, index) => ({
        channel: index,
        texture: `texture.world.splat.${index}`,
        weight: round(1 / Math.max(1, Math.min(4, biome.splatQueries.length))),
      })),
    },
    version: "0.1.0",
    walkability: { terrain: { height: 0, maxSlope: 35, surface: terrainId } },
  });
  return {
    assetsPath,
    biome: biome.id,
    code: "TN_WORLD_GENERATE_OK",
    environmentPath,
    heightmapPath,
    message: `Generated ${biome.id} world source.`,
    proofCommand: "tn world proof --project . --json",
    provenance,
    seed: options.seed,
  };
}

async function proofWorld(projectPath: string): Promise<IWorldProofResult> {
  const environmentPath = resolve(projectPath, "content/environment/world.environment.json");
  const assetsPath = resolve(projectPath, "content/assets/world.assets.json");
  const diagnostics: JsonRecord[] = [];
  const environment = await readJson(environmentPath);
  const assets = await readJson(assetsPath);
  const terrain = isRecord(environment?.terrain) ? environment.terrain : undefined;
  const scatter = Array.isArray(environment?.scatter) ? environment.scatter : [];
  const heightmapAsset = Array.isArray(assets?.assets)
    ? assets.assets.find((asset) => isRecord(asset) && asset.type === "heightmap")
    : undefined;
  if (terrain === undefined) {
    diagnostics.push({ code: "TN_WORLD_PROOF_TERRAIN_MISSING", message: "World environment source is missing terrain.", severity: "error" });
  }
  if (heightmapAsset === undefined) {
    diagnostics.push({ code: "TN_WORLD_PROOF_HEIGHTMAP_MISSING", message: "World assets source is missing a heightmap asset.", severity: "error" });
  }
  if (scatter.length === 0) {
    diagnostics.push({ code: "TN_WORLD_PROOF_SCATTER_MISSING", message: "World environment source has no scatter layers.", severity: "error" });
  }
  const proof = {
    code: diagnostics.length === 0 ? "TN_WORLD_PROOF_OK" : "TN_WORLD_PROOF_FAILED",
    diagnostics,
    environmentPath: "content/environment/world.environment.json",
    flatPlaneRisk: terrain === undefined || scatter.length === 0,
    heightmap: isRecord(heightmapAsset)
      ? { height: heightmapAsset.height, id: heightmapAsset.id, width: heightmapAsset.width }
      : undefined,
    message: diagnostics.length === 0 ? "World proof passed." : "World proof failed.",
    schema: "threenative.world-proof",
    scatterLayers: scatter.length,
    terrain: terrain === undefined ? undefined : { id: terrain.id, heightMode: terrain.heightMode },
    version: "0.1.0",
  };
  await mkdir(resolve(projectPath, "artifacts/world"), { recursive: true });
  await writeStableJson(resolve(projectPath, "artifacts/world/world-proof.json"), proof);
  return proof;
}

async function selectBiomeCatalogRecords(biome: IWorldBiomeDefinition): Promise<Array<{ purpose: string; record: IAssetSourceRecord }>> {
  const splatRecords = await Promise.all(biome.splatQueries.slice(0, 4).map(async (query, index) => ({
    purpose: `splat.${index}.${query}`,
    record: (await searchAssetSources({ fileRole: "texture", gameCategory: "nature-terrain", limit: 1, query }))[0],
  })));
  const scatterRecords = await Promise.all(biome.scatter.map(async (layer, index) => ({
    purpose: `scatter.${index}.${layer.category}`,
    record: (await searchAssetSources({ directOnly: true, format: "glb", gameCategory: "nature-terrain", limit: 1, query: layer.assetQuery }))[0],
  })));
  return [...splatRecords, ...scatterRecords].filter((entry): entry is { purpose: string; record: IAssetSourceRecord } => entry.record !== undefined);
}

function catalogAssetRow(record: IAssetSourceRecord, purpose: string): JsonRecord {
  const type = purpose.startsWith("splat") ? "texture" : "model";
  const extension = type === "texture" ? "jpg" : "glb";
  const prefix = purpose.startsWith("splat") ? "texture.world.splat" : "model.world";
  const id = purpose.startsWith("splat")
    ? `${prefix}.${purpose.split(".")[1] ?? "0"}`
    : `${prefix}.${purpose.split(".")[2] ?? "prop"}.${purpose.split(".")[1] ?? "0"}`;
  return {
    id,
    path: `assets/catalog/${record.id}.${extension}`,
    type,
  };
}

function generateHeightSamples(size: number, biome: IWorldBiomeDefinition, seed: number, flattenRadius: number): number[] {
  const random = mulberry32(seed);
  const samples: number[] = [];
  const half = (size - 1) / 2;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const wx = x - half;
      const wz = z - half;
      const distance = Math.hypot(wx, wz);
      const plateau = Math.max(0, Math.min(1, (distance - flattenRadius) / Math.max(1, half - flattenRadius)));
      const wave = Math.sin((wx + seed) * 0.17) * 0.45 + Math.cos((wz - seed) * 0.13) * 0.35;
      const noise = (random() - 0.5) * 0.35;
      const height = (wave + noise) * plateau;
      samples.push(round(Math.max(biome.heightRange.min, Math.min(biome.heightRange.max, height))));
    }
  }
  return samples;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function readIntegerFlag(argv: readonly string[], flag: string, fallback: number): { diagnostic?: string; value: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return { value: fallback };
  }
  const value = Number(raw);
  return Number.isInteger(value) ? { value } : { diagnostic: "TN_WORLD_INTEGER_FLAG_INVALID", value: fallback };
}

function readNumberFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return {};
  }
  const value = Number(raw);
  return Number.isFinite(value) ? { value } : { diagnostic: "TN_WORLD_NUMBER_FLAG_INVALID" };
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function writeStableJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(sortJson(value), null, 2)}\n`);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

const worldFlagsWithValues = new Set(["--biome", "--flatten-radius", "--project", "--seed", "--size"]);
