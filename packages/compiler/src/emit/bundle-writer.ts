import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { IR_DOCUMENTS } from "@threenative/ir";

import { AUTHORING_PROVENANCE_FILE } from "../authoring/provenance.js";
import { copyExtraAssetFiles } from "./asset-copy.js";
import type { IBundlePlan } from "./bundle.js";
import { stableJson } from "./stable-json.js";

const SCRIPTS_MANIFEST_FILE = "scripts.manifest.json";

export async function writeBundlePlan(plan: IBundlePlan, projectPath: string, outDir: string): Promise<string> {
  const stagingDir = await createEmitStagingDir(outDir);
  try {
    await writeBundleOutput(projectPath, stagingDir, plan);
    await replaceOutputDirectory(stagingDir, outDir);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    throw error;
  }

  return outDir;
}

async function writeBundleOutput(projectPath: string, targetDir: string, plan: IBundlePlan): Promise<void> {
  const documents = plan.documents;
  await mkdir(targetDir, { recursive: true });
  await mkdir(resolve(targetDir, "schemas"), { recursive: true });
  await writeGeneratedMeshPayloads(targetDir, plan.generatedMeshPayloads);
  await writeFile(resolve(targetDir, IR_DOCUMENTS.manifest.fileName), stableJson(plan.manifest));
  await copyExtraAssetFiles(projectPath, targetDir, [...plan.assetFiles, ...plan.extraAssetFiles]);
  await writeFile(resolve(targetDir, IR_DOCUMENTS.world.fileName), stableJson(documents.world));
  await writeFile(resolve(targetDir, IR_DOCUMENTS.materials.fileName), stableJson(documents.materials));
  await writeFile(resolve(targetDir, IR_DOCUMENTS.assets.fileName), stableJson(documents.assetsManifest));
  if (documents.distribution !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.distribution.fileName), stableJson(documents.distribution));
  }
  await writeFile(resolve(targetDir, IR_DOCUMENTS.targetProfile.fileName), stableJson(documents.targetProfile));
  if (documents.authoringProvenance !== undefined) {
    await writeFile(resolve(targetDir, AUTHORING_PROVENANCE_FILE), stableJson(documents.authoringProvenance));
  }
  if (documents.environmentScene !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.environmentScene.fileName), stableJson(documents.environmentScene));
  }
  if (documents.ui !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.ui.fileName), stableJson(documents.ui));
  }
  if (documents.overlays !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.overlays.fileName), stableJson(documents.overlays));
  }
  if (documents.audio !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.audio.fileName), stableJson(documents.audio));
  }
  if (documents.localData !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.localData.fileName), stableJson(documents.localData));
  }
  if (documents.gameFlow !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.gameFlow.fileName), stableJson(documents.gameFlow));
  }
  if (documents.interactions !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.interactions.fileName), stableJson(documents.interactions));
  }
  if (documents.scenes !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.scenes.fileName), stableJson(documents.scenes));
  }
  if (documents.sequences !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.sequences.fileName), stableJson(documents.sequences));
  }
  if (documents.animations !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.animations.fileName), stableJson(documents.animations));
  }
  if (documents.gltfScene !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.gltfScene.fileName), stableJson(documents.gltfScene));
  }
  if (documents.input !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.input.fileName), stableJson(documents.input));
  }
  if (documents.componentSchemas !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.componentSchemas.fileName), stableJson(documents.componentSchemas));
  }
  if (documents.resourceSchemas !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.resourceSchemas.fileName), stableJson(documents.resourceSchemas));
  }
  if (documents.eventSchemas !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.eventSchemas.fileName), stableJson(documents.eventSchemas));
  }
  if (documents.systems !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.systems.fileName), stableJson(documents.systems));
  }
  if (documents.scriptBundle !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.scripts.fileName), documents.scriptBundle);
  }
  if (documents.scriptManifest !== undefined) {
    await writeFile(resolve(targetDir, SCRIPTS_MANIFEST_FILE), stableJson(documents.scriptManifest));
  }
  if (documents.runtimeConfig !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.runtimeConfig.fileName), stableJson(documents.runtimeConfig));
  }
  if (documents.prefabs !== undefined) {
    await writeFile(resolve(targetDir, IR_DOCUMENTS.prefabs.fileName), stableJson(documents.prefabs));
  }
}

async function createEmitStagingDir(outDir: string): Promise<string> {
  const parent = dirname(outDir);
  await mkdir(parent, { recursive: true });
  return mkdtemp(resolve(parent, ".tn-emit-"));
}

async function replaceOutputDirectory(stagingDir: string, outDir: string): Promise<void> {
  const backupDir = `${outDir}.previous-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let backedUp = false;
  try {
    await rename(outDir, backupDir);
    backedUp = true;
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  try {
    await rename(stagingDir, outDir);
  } catch (error) {
    if (backedUp) {
      await rename(backupDir, outDir);
    }
    throw error;
  }

  if (backedUp) {
    await rm(backupDir, { force: true, recursive: true });
  }
}

async function writeGeneratedMeshPayloads(outDir: string, payloads: readonly { bytes: Buffer; path: string }[]): Promise<void> {
  for (const payload of payloads) {
    const path = resolve(outDir, payload.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, payload.bytes);
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}
