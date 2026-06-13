import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
  type IBundleManifest,
  type IMaterialsIr,
  type ITargetProfile,
  type IWorldIr,
} from "./types.js";

export interface IIrDiagnostic {
  code: string;
  message: string;
  path: string;
}

export interface IBundleValidationResult {
  diagnostics: IIrDiagnostic[];
  ok: boolean;
}

export async function validateBundle(bundlePath: string): Promise<IBundleValidationResult> {
  const diagnostics: IIrDiagnostic[] = [];
  const manifest = await readJson<IBundleManifest>(resolve(bundlePath, "manifest.json"), diagnostics);

  if (manifest === undefined) {
    return { diagnostics, ok: false };
  }

  validateManifest(manifest, "manifest.json", diagnostics);

  const world = await readJson<IWorldIr>(resolve(bundlePath, manifest.entry.world), diagnostics);
  const materials = await readJson<IMaterialsIr>(resolve(bundlePath, manifest.files.materials), diagnostics);
  const assets = await readJson<IAssetsManifest>(resolve(bundlePath, manifest.files.assets), diagnostics);
  const targetProfile = await readJson<ITargetProfile>(resolve(bundlePath, manifest.files.targetProfile), diagnostics);

  if (world !== undefined) {
    validateWorld(world, manifest.entry.world, diagnostics);
  }
  if (materials !== undefined) {
    validateUniqueIds(materials.materials, `${manifest.files.materials}/materials`, "TN_IR_DUPLICATE_MATERIAL_ID", diagnostics);
  }
  if (assets !== undefined) {
    validateUniqueIds(assets.assets, `${manifest.files.assets}/assets`, "TN_IR_DUPLICATE_ASSET_ID", diagnostics);
  }
  if (targetProfile !== undefined && targetProfile.targets.length === 0) {
    diagnostics.push({
      code: "TN_IR_TARGETS_EMPTY",
      message: "Target profile must include at least one target.",
      path: `${manifest.files.targetProfile}/targets`,
    });
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

function validateManifest(manifest: IBundleManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (manifest.schema !== "threenative.bundle" || manifest.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: "Manifest must use threenative.bundle version 0.1.0.",
      path,
    });
  }

  if (manifest.entry.world !== "world.ir.json") {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: "V1 manifest entry.world must be world.ir.json.",
      path: "manifest.json/entry/world",
    });
  }
}

function validateWorld(world: IWorldIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (world.schema !== "threenative.world" || world.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_WORLD_VERSION_UNSUPPORTED",
      message: "World IR must use threenative.world version 0.1.0.",
      path,
    });
  }

  validateUniqueIds(world.entities, `${path}/entities`, "TN_IR_DUPLICATE_ENTITY_ID", diagnostics);
}

function validateUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      diagnostics.push({
        code,
        message: `Duplicate id '${item.id}'.`,
        path: `${path}/${index}/id`,
      });
    }
    seen.add(item.id);
  });
}

async function readJson<T>(path: string, diagnostics: IIrDiagnostic[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    diagnostics.push({
      code: "TN_IR_FILE_INVALID",
      message: `Missing or invalid JSON file '${path}'.`,
      path,
    });
    return undefined;
  }
}
