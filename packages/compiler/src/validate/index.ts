import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateBundle as validateIrBundle } from "@threenative/ir";

import { type ICompilerDiagnostic, type IValidationReport } from "../diagnostics.js";

interface IManifest {
  entry: { world: string };
  files: { assets: string; materials: string; targetProfile: string };
}

interface IWorld {
  entities: Array<{
    components: {
      MeshRenderer?: { material?: string; mesh?: string };
      Transform?: { position?: number[]; rotation?: number[]; scale?: number[] };
    };
    id: string;
  }>;
}

interface IMaterials {
  materials: Array<{ id: string }>;
}

interface IAssets {
  assets: Array<{ id: string }>;
}

export async function validateBundle(bundlePath: string): Promise<IValidationReport> {
  const base = await validateIrBundle(bundlePath);
  const diagnostics: ICompilerDiagnostic[] = base.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    file: diagnostic.path.includes("/") ? diagnostic.path.split("/")[0] : diagnostic.path,
    message: diagnostic.message,
    path: diagnostic.path,
    severity: diagnostic.severity ?? "error",
    suggestion: diagnostic.suggestion ?? suggestionForIrDiagnostic(diagnostic.code),
  }));

  if (!base.ok) {
    return { diagnostics, ok: false };
  }

  const manifest = await readBundleJson<IManifest>(bundlePath, "manifest.json");
  const world = await readBundleJson<IWorld>(bundlePath, manifest.entry.world);
  const materials = await readBundleJson<IMaterials>(bundlePath, manifest.files.materials);
  const assets = await readBundleJson<IAssets>(bundlePath, manifest.files.assets);
  const materialIds = new Set(materials.materials.map((material) => material.id));
  const assetIds = new Set(assets.assets.map((asset) => asset.id));

  world.entities.forEach((entity, entityIndex) => {
    const renderer = entity.components.MeshRenderer;
    if (renderer?.material !== undefined && !materialIds.has(renderer.material)) {
      diagnostics.push({
        code: "TN-IR-2104",
        file: manifest.entry.world,
        message: `Entity '${entity.id}' references missing material '${renderer.material}'.`,
        path: `${manifest.entry.world}/entities/${entityIndex}/components/MeshRenderer/material`,
        severity: "error",
        suggestion: "Add the material to materials.ir.json or update the MeshRenderer material reference.",
        value: renderer.material,
      });
    }

    if (renderer?.mesh !== undefined && !assetIds.has(renderer.mesh)) {
      diagnostics.push({
        code: "TN-IR-2105",
        file: manifest.entry.world,
        message: `Entity '${entity.id}' references missing mesh '${renderer.mesh}'.`,
        path: `${manifest.entry.world}/entities/${entityIndex}/components/MeshRenderer/mesh`,
        severity: "error",
        suggestion: "Add the mesh to assets.manifest.json or update the MeshRenderer mesh reference.",
        value: renderer.mesh,
      });
    }

    const transform = entity.components.Transform;
    for (const key of ["position", "rotation", "scale"] as const) {
      const values = transform?.[key];
      if (values?.some((value) => !Number.isFinite(value)) === true) {
        diagnostics.push({
          code: "TN-IR-2201",
          file: manifest.entry.world,
          message: `Entity '${entity.id}' has a non-finite Transform.${key} value.`,
          path: `${manifest.entry.world}/entities/${entityIndex}/components/Transform/${key}`,
          severity: "error",
          suggestion: "Use only finite numeric transform values.",
        });
      }
    }
  });

  return { diagnostics, ok: diagnostics.length === 0 };
}

async function readBundleJson<T>(bundlePath: string, file: string): Promise<T> {
  return JSON.parse(await readFile(resolve(bundlePath, file), "utf8")) as T;
}

function suggestionForIrDiagnostic(code: string): string {
  const suggestions: Record<string, string> = {
    TN_IR_ASSET_PATH_INVALID: "Move the asset into the emitted bundle and reference it with a bundle-relative path.",
    TN_IR_ASSET_PATH_MISSING: "Copy the referenced asset into the bundle or update assets.manifest.json.",
    TN_IR_DUPLICATE_ASSET_ID: "Rename or remove the duplicate asset id in assets.manifest.json.",
    TN_IR_DUPLICATE_ENTITY_ID: "Rename or remove the duplicate entity id in world.ir.json.",
    TN_IR_DUPLICATE_MATERIAL_ID: "Rename or remove the duplicate material id in materials.ir.json.",
    TN_IR_FILE_INVALID: "Regenerate the bundle or fix the manifest entry so it points at valid JSON.",
    TN_IR_MATERIAL_TEXTURE_ASSET_MISSING: "Add the missing texture asset to assets.manifest.json or remove the material texture slot reference.",
    TN_IR_RENDER_VISIBILITY_INVALID: "Set visibility fields to true or false, or omit optional visibility fields.",
  };
  return suggestions[code] ?? "Inspect the referenced bundle file and regenerate the bundle after fixing the source data.";
}
