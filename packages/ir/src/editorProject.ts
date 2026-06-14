import type { IIrDiagnostic } from "./validate.js";

export interface IEditorProjectSnapshot {
  schema: "threenative.editor-project";
  version: "0.1.0";
  name: string;
  documents: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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

  return diagnostics;
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
