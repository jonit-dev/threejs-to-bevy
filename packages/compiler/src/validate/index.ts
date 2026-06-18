import { validateBundle as validateIrBundle } from "@threenative/ir";

import { type ICompilerDiagnostic, type IValidationReport } from "../diagnostics.js";

export async function validateBundle(bundlePath: string): Promise<IValidationReport> {
  const base = await validateIrBundle(bundlePath);
  const diagnostics: ICompilerDiagnostic[] = base.diagnostics.map((diagnostic) => ({
    code: compilerCodeForIrDiagnostic(diagnostic.code),
    file: diagnostic.path.includes("/") ? diagnostic.path.split("/")[0] : diagnostic.path,
    limit: diagnostic.limit,
    message: diagnostic.message,
    path: diagnostic.path,
    severity: diagnostic.severity ?? "error",
    suggestion: diagnostic.suggestion ?? suggestionForIrDiagnostic(diagnostic.code),
    value: diagnostic.value,
  }));

  return { diagnostics, ok: diagnostics.length === 0 };
}

function suggestionForIrDiagnostic(code: string): string {
  const suggestions: Record<string, string> = {
    TN_IR_ASSET_PATH_INVALID: "Move the asset into the emitted bundle and reference it with a bundle-relative path.",
    TN_IR_ASSET_PATH_MISSING: "Copy the referenced asset into the bundle or update assets.manifest.json.",
    TN_IR_DUPLICATE_ASSET_ID: "Rename or remove the duplicate asset id in assets.manifest.json.",
    TN_IR_DUPLICATE_ENTITY_ID: "Rename or remove the duplicate entity id in world.ir.json.",
    TN_IR_DUPLICATE_MATERIAL_ID: "Rename or remove the duplicate material id in materials.ir.json.",
    TN_IR_FILE_INVALID: "Regenerate the bundle or fix the manifest entry so it points at valid JSON.",
    TN_IR_MESH_RENDERER_MATERIAL_MISSING: "Add the material to materials.ir.json or update the MeshRenderer material reference.",
    TN_IR_MESH_RENDERER_MESH_MISSING: "Add the mesh to assets.manifest.json or update the MeshRenderer mesh reference.",
    TN_IR_TRANSFORM_VALUE_INVALID: "Use only finite numeric transform values.",
    TN_IR_MATERIAL_TEXTURE_ASSET_MISSING: "Add the missing texture asset to assets.manifest.json or remove the material texture slot reference.",
    TN_IR_RENDER_VISIBILITY_INVALID: "Set visibility fields to true or false, or omit optional visibility fields.",
  };
  return suggestions[code] ?? "Inspect the referenced bundle file and regenerate the bundle after fixing the source data.";
}

function compilerCodeForIrDiagnostic(code: string): string {
  const compatibilityCodes: Record<string, string> = {
    TN_IR_MESH_RENDERER_MATERIAL_MISSING: "TN-IR-2104",
    TN_IR_MESH_RENDERER_MESH_MISSING: "TN-IR-2105",
    TN_IR_TRANSFORM_VALUE_INVALID: "TN-IR-2201",
  };
  return compatibilityCodes[code] ?? code;
}
