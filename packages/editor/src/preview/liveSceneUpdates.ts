import type { IEditorChatOperationStep } from "../server/chatPlan.js";

export type EditorLiveSceneUpdateKind = "hotPatch" | "previewStale" | "rebuildRequired" | "unsupported";

export interface IEditorLiveSceneUpdate {
  affectedEntities: string[];
  affectedFiles: string[];
  diagnostics: Array<{ code: string; message: string; path?: string; severity: "error" | "info" | "warning"; suggestion?: string }>;
  kind: EditorLiveSceneUpdateKind;
  reason: string;
}

const HOT_PATCH_OPERATIONS = new Set([
  "scene.add_entity",
  "scene.add_prefab",
  "scene.set_transform",
  "scene.set_visibility",
  "scene.set_rigid_body",
  "scene.set_collider",
  "scene.add_tag",
]);

export function classifyLiveSceneUpdate(input: {
  changedFiles: readonly string[];
  operations: readonly Pick<IEditorChatOperationStep, "args" | "name">[];
}): IEditorLiveSceneUpdate {
  const changedFiles = [...new Set(input.changedFiles)].sort();
  const affectedEntities = [...new Set(input.operations.map((operation) => operation.args.entityId).filter((entityId): entityId is string => typeof entityId === "string"))].sort();
  if (changedFiles.some((file) => file.includes("/dist/") || file.endsWith(".ir.json") || file === "world.ir.json" || file === "assets.manifest.json")) {
    return {
      affectedEntities,
      affectedFiles: changedFiles,
      diagnostics: [diagnostic("TN_EDITOR_LIVE_UPDATE_GENERATED_REJECTED", "Generated bundle paths cannot be treated as source live-update inputs.", "/changedFiles")],
      kind: "unsupported",
      reason: "generated output paths are inspectable proof only",
    };
  }
  if (changedFiles.some((file) => file.startsWith("src/scripts/") || file.endsWith(".assets.json"))) {
    return {
      affectedEntities,
      affectedFiles: changedFiles,
      diagnostics: [diagnostic("TN_EDITOR_LIVE_UPDATE_REBUILD_REQUIRED", "Script or asset catalog changes require a preview rebuild.", "/changedFiles", "Run Build Preview to regenerate bundle artifacts.")],
      kind: "rebuildRequired",
      reason: "script or asset catalog source changed",
    };
  }
  if (input.operations.every((operation) => HOT_PATCH_OPERATIONS.has(operation.name))) {
    return {
      affectedEntities,
      affectedFiles: changedFiles,
      diagnostics: [],
      kind: "hotPatch",
      reason: "all changed operations are modeled by the editor scene preview",
    };
  }
  return {
    affectedEntities,
    affectedFiles: changedFiles,
    diagnostics: [diagnostic("TN_EDITOR_LIVE_UPDATE_PREVIEW_STALE", "This source change is valid but cannot be hot-applied by the current editor preview.", "/operations", "Refresh or build the preview to inspect the result.")],
    kind: "previewStale",
    reason: "operation is not hot-patchable",
  };
}

function diagnostic(code: string, message: string, path: string, suggestion?: string) {
  return {
    code,
    message,
    path,
    severity: "info" as const,
    ...(suggestion === undefined ? {} : { suggestion }),
  };
}
