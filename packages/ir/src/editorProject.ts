import type { IIrDiagnostic } from "./validate.js";

export interface IEditorProjectSnapshot {
  schema: "threenative.editor-project";
  version: "0.1.0";
  name: string;
  documents: Record<string, unknown>;
  inspector?: IEditorInspectorSnapshot;
  metadata?: Record<string, unknown>;
}

export interface IEditorInspectorNode {
  children: IEditorInspectorNode[];
  components: string[];
  id: string;
  label: string;
  path: string;
}

export interface IEditorEditableProperty {
  document: string;
  kind: "array" | "boolean" | "number" | "object" | "string";
  label: string;
  path: string;
}

export interface IEditorHotReloadPolicy {
  invalidationReasons: string[];
  policy: "reloadAssetsOnly" | "reloadFull" | "reloadRejected" | "statePreservingUnavailable";
}

export interface IEditorInspectorSnapshot {
  assetRefs: string[];
  diagnostics: IIrDiagnostic[];
  editableProperties: IEditorEditableProperty[];
  hierarchy: IEditorInspectorNode[];
  hotReload: IEditorHotReloadPolicy[];
}

export type EditorProjectDiffOperation =
  | { after: unknown; op: "add"; path: string }
  | { before: unknown; op: "remove"; path: string }
  | { after: unknown; before: unknown; op: "replace"; path: string };

export function validateEditorProjectSnapshot(snapshot: unknown, path = "editor.project.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(snapshot)) {
    return [
      {
        code: "TN_IR_EDITOR_PROJECT_INVALID",
        message: "Editor project snapshot must be a JSON object.",
        path,
        severity: "error",
      },
    ];
  }

  if (snapshot.schema !== "threenative.editor-project") {
    diagnostics.push({
      code: "TN_IR_EDITOR_PROJECT_SCHEMA_INVALID",
      message: "Editor project snapshot schema must be 'threenative.editor-project'.",
      path: `${path}/schema`,
      severity: "error",
    });
  }
  if (snapshot.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_EDITOR_PROJECT_VERSION_UNSUPPORTED",
      message: "Editor project snapshot version must be '0.1.0'.",
      path: `${path}/version`,
      severity: "error",
    });
  }
  if (typeof snapshot.name !== "string" || snapshot.name.trim() === "") {
    diagnostics.push({
      code: "TN_IR_EDITOR_PROJECT_NAME_INVALID",
      message: "Editor project snapshot name must be a non-empty string.",
      path: `${path}/name`,
      severity: "error",
    });
  }
  if (!isRecord(snapshot.documents)) {
    diagnostics.push({
      code: "TN_IR_EDITOR_PROJECT_DOCUMENTS_INVALID",
      message: "Editor project snapshot documents must be an object keyed by bundle-relative JSON path.",
      path: `${path}/documents`,
      severity: "error",
    });
  } else {
    for (const [documentPath, document] of Object.entries(snapshot.documents)) {
      if (!isBundleRelativeJsonPath(documentPath)) {
        diagnostics.push({
          code: "TN_IR_EDITOR_PROJECT_DOCUMENT_PATH_INVALID",
          message: `Editor document '${documentPath}' must be a bundle-relative JSON path.`,
          path: `${path}/documents/${escapePointer(documentPath)}`,
          severity: "error",
        });
      }
      if (!isStructuredJson(document)) {
        diagnostics.push({
          code: "TN_IR_EDITOR_PROJECT_DOCUMENT_INVALID",
          message: `Editor document '${documentPath}' must contain structured JSON data.`,
          path: `${path}/documents/${escapePointer(documentPath)}`,
          severity: "error",
        });
      }
    }
  }
  if (snapshot.metadata !== undefined && !isRecord(snapshot.metadata)) {
    diagnostics.push({
      code: "TN_IR_EDITOR_PROJECT_METADATA_INVALID",
      message: "Editor project snapshot metadata must be an object when present.",
      path: `${path}/metadata`,
      severity: "error",
    });
  }
  if (snapshot.inspector !== undefined) {
    diagnostics.push(...validateEditorInspectorSnapshot(snapshot.inspector, `${path}/inspector`));
  }

  return diagnostics;
}

export function buildEditorInspectorSnapshot(documents: Record<string, unknown>): IEditorInspectorSnapshot {
  return {
    assetRefs: collectAssetRefs(documents),
    diagnostics: [],
    editableProperties: collectEditableProperties(documents),
    hierarchy: collectHierarchy(documents["world.ir.json"]),
    hotReload: [
      { invalidationReasons: ["Structured JSON edit changes runtime world state."], policy: "reloadFull" },
      { invalidationReasons: ["Bundle-local asset metadata changed without system/schema changes."], policy: "reloadAssetsOnly" },
      { invalidationReasons: ["Runtime-only handles cannot be edited through portable snapshots."], policy: "reloadRejected" },
      { invalidationReasons: ["State-preserving hot reload requires runtime state capture not present in this bundle."], policy: "statePreservingUnavailable" },
    ],
  };
}

export function validateEditorPropertyEdit(path: string): IIrDiagnostic[] {
  if (!path.startsWith("/documents/")) {
    return [{
      code: "TN_IR_EDITOR_PROPERTY_PATH_INVALID",
      message: "Editor property path must target /documents.",
      path,
      severity: "error",
      suggestion: "Use a JSON pointer path emitted by the editor inspector editableProperties list.",
    }];
  }
  if (/(^|\/)(runtimeHandle|nativeHandle|rendererObject|platformPath|runtimeOnly|threeObject|bevyEntity)(\/|$)/.test(path)) {
    return [{
      code: "TN_IR_EDITOR_PROPERTY_RUNTIME_ONLY",
      message: "Editor property edits must not target runtime-only data.",
      path,
      severity: "error",
      suggestion: "Edit portable SDK/IR data and let runtime adapters rebuild target-specific state.",
    }];
  }
  return [];
}

function validateEditorInspectorSnapshot(value: unknown, path: string): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(value)) {
    return [{ code: "TN_IR_EDITOR_INSPECTOR_INVALID", message: "Editor inspector snapshot must be an object.", path, severity: "error" }];
  }
  if (!Array.isArray(value.hierarchy)) {
    diagnostics.push({ code: "TN_IR_EDITOR_INSPECTOR_HIERARCHY_INVALID", message: "Editor inspector hierarchy must be an array.", path: `${path}/hierarchy`, severity: "error" });
  }
  if (!Array.isArray(value.editableProperties)) {
    diagnostics.push({ code: "TN_IR_EDITOR_INSPECTOR_PROPERTIES_INVALID", message: "Editor editableProperties must be an array.", path: `${path}/editableProperties`, severity: "error" });
  } else {
    for (const [index, property] of value.editableProperties.entries()) {
      if (!isRecord(property) || typeof property.path !== "string" || validateEditorPropertyEdit(property.path).length > 0) {
        diagnostics.push({ code: "TN_IR_EDITOR_PROPERTY_INVALID", message: "Editor property descriptors must target portable /documents paths.", path: `${path}/editableProperties/${index}`, severity: "error" });
      }
    }
  }
  if (!Array.isArray(value.hotReload)) {
    diagnostics.push({ code: "TN_IR_EDITOR_HOT_RELOAD_INVALID", message: "Editor hotReload policies must be an array.", path: `${path}/hotReload`, severity: "error" });
  }
  return diagnostics;
}

function collectHierarchy(world: unknown): IEditorInspectorNode[] {
  if (!isRecord(world) || !Array.isArray(world.entities)) {
    return [];
  }
  return world.entities
    .filter(isRecord)
    .map((entity, index) => ({
      children: [],
      components: isRecord(entity.components) ? Object.keys(entity.components).sort() : [],
      id: typeof entity.id === "string" ? entity.id : `entity-${index}`,
      label: typeof entity.id === "string" ? entity.id : `Entity ${index}`,
      path: `/documents/world.ir.json/entities/${index}`,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function collectAssetRefs(documents: Record<string, unknown>): string[] {
  const assets = documents["assets.manifest.json"];
  if (!isRecord(assets) || !Array.isArray(assets.assets)) {
    return [];
  }
  return assets.assets
    .filter(isRecord)
    .map((asset) => asset.id)
    .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    .sort((left, right) => left.localeCompare(right));
}

function collectEditableProperties(documents: Record<string, unknown>): IEditorEditableProperty[] {
  const properties: IEditorEditableProperty[] = [];
  for (const [document, value] of Object.entries(documents).sort(([left], [right]) => left.localeCompare(right))) {
    collectEditableValue(document, value, `/documents/${escapePointer(document)}`, properties);
  }
  return properties.filter((property) => validateEditorPropertyEdit(property.path).length === 0);
}

function collectEditableValue(document: string, value: unknown, path: string, properties: IEditorEditableProperty[]): void {
  if (value === null) {
    return;
  }
  if (["boolean", "number", "string"].includes(typeof value)) {
    properties.push({ document, kind: typeof value as "boolean" | "number" | "string", label: path.split("/").at(-1) ?? path, path });
    return;
  }
  if (Array.isArray(value)) {
    properties.push({ document, kind: "array", label: path.split("/").at(-1) ?? path, path });
    value.forEach((item, index) => collectEditableValue(document, item, `${path}/${index}`, properties));
    return;
  }
  if (isRecord(value)) {
    properties.push({ document, kind: "object", label: path.split("/").at(-1) ?? path, path });
    for (const key of Object.keys(value).sort()) {
      collectEditableValue(document, value[key], `${path}/${escapePointer(key)}`, properties);
    }
  }
}

export function diffEditorProjectSnapshots(
  before: IEditorProjectSnapshot,
  after: IEditorProjectSnapshot,
): EditorProjectDiffOperation[] {
  const operations: EditorProjectDiffOperation[] = [];
  diffValue(before.documents, after.documents, "/documents", operations);
  return operations;
}

function diffValue(before: unknown, after: unknown, path: string, operations: EditorProjectDiffOperation[]): void {
  if (deepEqual(before, after)) {
    return;
  }
  if (before === undefined) {
    operations.push({ after: normalizeForDiff(after), op: "add", path });
    return;
  }
  if (after === undefined) {
    operations.push({ before: normalizeForDiff(before), op: "remove", path });
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before.length, after.length);
    for (let index = 0; index < maxLength; index += 1) {
      diffValue(before[index], after[index], `${path}/${index}`, operations);
    }
    return;
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      diffValue(before[key], after[key], `${path}/${escapePointer(key)}`, operations);
    }
    return;
  }
  operations.push({ after: normalizeForDiff(after), before: normalizeForDiff(before), op: "replace", path });
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeForDiff(left)) === JSON.stringify(normalizeForDiff(right));
}

function normalizeForDiff(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForDiff);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeForDiff(value[key])]));
  }
  return value;
}

function isStructuredJson(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (["boolean", "number", "string"].includes(typeof value)) {
    return Number.isFinite(value) || typeof value !== "number";
  }
  if (Array.isArray(value)) {
    return value.every(isStructuredJson);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isStructuredJson);
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isBundleRelativeJsonPath(value: string): boolean {
  return (
    value.endsWith(".json") &&
    !value.startsWith("/") &&
    !value.startsWith("\\") &&
    !value.includes("\\") &&
    !value.split("/").includes("..") &&
    !value.split("/").includes("")
  );
}
