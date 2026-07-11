import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IAssetsManifest, IBakedProbePayloadIr, IEnvironmentSceneIr, IMaterialsIr, IWorldIr } from "@threenative/ir";
import type { ICompilerDiagnostic } from "../diagnostics.js";
import { computeProbeSceneContentHash } from "./probeBaker.js";

interface IBakedProbeContentDocument {
  probes: Array<{ id: string; source: IBakedProbePayloadIr }>;
  sceneContentHash: string;
  sceneId: string;
  schema: "threenative.baked-probes";
  version: "0.1.0";
}

export async function applyBakedProbeContent(projectPath: string, world: IWorldIr, materials: IMaterialsIr, environment: IEnvironmentSceneIr, assets: IAssetsManifest): Promise<{ diagnostics: ICompilerDiagnostic[]; environment: IEnvironmentSceneIr }> {
  const directory = resolve(projectPath, "content/lighting");
  const files = await probeFiles(directory);
  if (files.length === 0) return { diagnostics: [], environment };
  const currentHash = computeProbeSceneContentHash(world, materials, environment, assets);
  const probesById = new Map((environment.lightProbes ?? []).map((probe) => [probe.id, { ...probe }]));
  const diagnostics: ICompilerDiagnostic[] = [];

  for (const file of files) {
    const path = resolve(directory, file);
    const document = parseBakedProbeDocument(JSON.parse(await readFile(path, "utf8")) as unknown, file);
    if (document.sceneContentHash !== currentHash) diagnostics.push({
      code: "TN_IR_LIGHT_PROBE_BAKE_STALE",
      file: `content/lighting/${file}`,
      message: `Baked GI probes for scene '${document.sceneId}' are stale: ${document.sceneContentHash} does not match ${currentHash}.`,
      path: "sceneContentHash",
      severity: "warning",
      suggestion: "Run 'tn bake gi --project . --json' and commit the regenerated probe content.",
    });
    for (const baked of document.probes) {
      const authored = probesById.get(baked.id);
      if (authored === undefined) {
        diagnostics.push({ code: "TN_IR_LIGHT_PROBE_BAKE_PROBE_MISSING", file: `content/lighting/${file}`, message: `Baked probe '${baked.id}' has no authored light probe.`, path: `probes/${baked.id}`, severity: "warning", suggestion: "Remove the stale baked entry or restore the authored probe, then rebake." });
        continue;
      }
      if (baked.source.sceneContentHash !== document.sceneContentHash) {
        diagnostics.push({ code: "TN_IR_LIGHT_PROBE_BAKE_STALE", file: `content/lighting/${file}`, message: `Baked probe '${baked.id}' payload hash ${baked.source.sceneContentHash} does not match its document hash ${document.sceneContentHash}.`, path: `probes/${baked.id}/source/sceneContentHash`, severity: "warning", suggestion: "Run 'tn bake gi --project . --json' and commit the regenerated probe content." });
        continue;
      }
      probesById.set(baked.id, { ...authored, source: baked.source });
    }
  }
  return { diagnostics, environment: { ...environment, lightProbes: [...probesById.values()].sort((left, right) => left.id.localeCompare(right.id)) } };
}

function parseBakedProbeDocument(value: unknown, file: string): IBakedProbeContentDocument {
  if (!isRecord(value) || value.schema !== "threenative.baked-probes" || value.version !== "0.1.0" || typeof value.sceneId !== "string" || typeof value.sceneContentHash !== "string" || !Array.isArray(value.probes)) throw new Error(`Baked probe content '${file}' is not a valid threenative.baked-probes document.`);
  const probes = value.probes.map((probe) => {
    if (!isRecord(probe) || typeof probe.id !== "string" || !isRecord(probe.source)) throw new Error(`Baked probe content '${file}' contains an invalid probe entry.`);
    return { id: probe.id, source: probe.source as unknown as IBakedProbePayloadIr };
  });
  return { probes, sceneContentHash: value.sceneContentHash, sceneId: value.sceneId, schema: value.schema, version: value.version };
}

async function probeFiles(directory: string): Promise<string[]> {
  try { return (await readdir(directory)).filter((file) => file.endsWith(".probes.json")).sort(); }
  catch (error) { if (isRecord(error) && error.code === "ENOENT") return []; throw error; }
}

function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
