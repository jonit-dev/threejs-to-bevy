import { relative } from "node:path";
import type { IAuthoringDocument } from "@threenative/authoring";

import type {
  AuthoringDeclarationKind,
  AuthoringEmittedArtifactKind,
  IAuthoringEmittedPointer,
  IAuthoringGraph,
  IAuthoringOwnershipEntry,
  IAuthoringProvenance,
  IAuthoringStructuredSourcePointer,
} from "./graph.js";
import type { ICompilerDiagnostic } from "../diagnostics.js";

export const AUTHORING_PROVENANCE_FILE = "authoring.provenance.json" as const;
const generatedBundleArtifactFiles = new Set([
  "world.ir.json",
  "ui.ir.json",
  "systems.ir.json",
  "scripts.bundle.js",
  "materials.ir.json",
  "assets.manifest.json",
  "prefabs.ir.json",
  "manifest.json",
]);

export interface IAuthoringEmittedDocument {
  data?: unknown;
  kind: AuthoringEmittedArtifactKind;
  path: string;
}

export interface IAuthoringProvenanceDocument {
  declarations: IAuthoringGraph["declarations"];
  diagnostics: IAuthoringGraph["diagnostics"];
  entryPath: string;
  ownership: IAuthoringOwnershipEntry[];
  modules: IAuthoringGraph["modules"];
  schema: "threenative.authoring-provenance";
  version: "0.1.0";
}

export interface IBuildAuthoringProvenanceOptions {
  documents: readonly IAuthoringDocument[];
  emitted: readonly IAuthoringEmittedDocument[];
}

export function relativeModulePath(projectRoot: string, filePath: string): string {
  return normalizePath(relative(projectRoot, filePath));
}

export function compatibilityProvenance(
  projectRoot: string,
  entryPath: string,
  kind: AuthoringDeclarationKind,
  declarationId: string,
  ownerScene?: string,
): IAuthoringProvenance {
  return {
    declarationId,
    kind,
    ...(ownerScene === undefined ? {} : { ownerScene }),
    source: { modulePath: relativeModulePath(projectRoot, entryPath) },
  };
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function authoringProvenanceDocument(graph: IAuthoringGraph): IAuthoringProvenanceDocument {
  return {
    declarations: graph.declarations,
    diagnostics: graph.diagnostics,
    entryPath: graph.entryPath,
    ownership: [],
    modules: graph.modules,
    schema: "threenative.authoring-provenance",
    version: "0.1.0",
  };
}

export function buildAuthoringProvenanceDocument(
  graph: IAuthoringGraph,
  options: IBuildAuthoringProvenanceOptions,
): IAuthoringProvenanceDocument {
  const ownership = stableOwnershipEntries([
    ...sourceOwnershipEntries(options.documents),
    ...generatedArtifactOwnershipEntries(options.emitted),
  ]);
  return {
    ...authoringProvenanceDocument(graph),
    diagnostics: [...graph.diagnostics, ...diagnoseDuplicateOwnership(ownership)].sort(sortDiagnostics),
    ownership,
  };
}

function sourceOwnershipEntries(documents: readonly IAuthoringDocument[]): IAuthoringOwnershipEntry[] {
  const materialSources = materialSourceIndex(documents);
  const entries: IAuthoringOwnershipEntry[] = [];

  for (const document of documents) {
    const data = readRecord(document.data);
    if (data === undefined) {
      continue;
    }
    if (document.kind === "scene") {
      entries.push(...sceneOwnershipEntries(document, data, materialSources));
    } else if (document.kind === "material") {
      entries.push(...collectionOwnershipEntries(document, data.materials, "material", "materials.ir.json"));
    } else if (document.kind === "ui") {
      entries.push(...collectionOwnershipEntries(document, data.nodes, "ui", "ui.ir.json"));
    } else if (document.kind === "prefab") {
      entries.push(...prefabOwnershipEntries(document, data));
    } else if (document.kind === "systems") {
      entries.push(...systemOwnershipEntries(document, data.systems));
    }
  }

  return entries;
}

function sceneOwnershipEntries(
  document: IAuthoringDocument,
  data: Record<string, unknown>,
  materialSources: ReadonlyMap<string, IAuthoringStructuredSourcePointer>,
): IAuthoringOwnershipEntry[] {
  const entries: IAuthoringOwnershipEntry[] = [];
  const sceneId = readString(data.id);
  if (sceneId !== undefined) {
    entries.push(sourceEntry(document, "/id", "scene", { artifactKind: "scene", id: sceneId, path: "scenes.ir.json", pointer: `/scenes/${escapePointer(sceneId)}` }));
  }

  for (const [index, entity] of readArray(data.entities).entries()) {
    const entityRecord = readRecord(entity);
    const entityId = readString(entityRecord?.id);
    if (entityId === undefined) {
      continue;
    }
    const entityPointer = `/entities/${index}`;
    entries.push(sourceEntry(document, entityPointer, "entity", { artifactKind: "entity", id: entityId, path: "world.ir.json", pointer: `/entities/${escapePointer(entityId)}` }));

    const components = readRecord(entityRecord?.components);
    for (const componentKind of Object.keys(components ?? {}).sort()) {
      entries.push(sourceEntry(document, `${entityPointer}/components/${escapePointer(componentKind)}`, "component", {
        artifactKind: "component",
        id: `${entityId}.${componentKind}`,
        path: "world.ir.json",
        pointer: `/entities/${escapePointer(entityId)}/components/${escapePointer(componentKind)}`,
      }));
    }

    const meshRenderer = readRecord(components?.MeshRenderer);
    const materialId = readString(meshRenderer?.material);
    const materialSource = materialId === undefined ? undefined : materialSources.get(materialId);
    if (materialSource !== undefined) {
      entries.push({
        emitted: {
          artifactKind: "mesh-renderer-material-ref",
          id: `${entityId}.MeshRenderer.material`,
          path: "world.ir.json",
          pointer: `/entities/${escapePointer(entityId)}/components/MeshRenderer/material`,
        },
        ownership: "source-persistable",
        source: materialSource,
      });
    }
  }

  entries.push(...systemOwnershipEntries(document, data.systems));
  const sceneUi = readRecord(data.ui);
  if (sceneUi !== undefined) {
    entries.push(...collectionOwnershipEntries(document, sceneUi.nodes, "ui", "ui.ir.json", "/ui/nodes"));
  }

  return entries;
}

function collectionOwnershipEntries(
  document: IAuthoringDocument,
  collection: unknown,
  kind: "material" | "ui",
  emittedPath: string,
  sourceBasePointer?: string,
): IAuthoringOwnershipEntry[] {
  return readArray(collection).flatMap((item, index) => {
    const id = readString(readRecord(item)?.id);
    if (id === undefined) {
      return [];
    }
    const sourcePointer = sourceBasePointer ?? `/${kind === "material" ? "materials" : "nodes"}`;
    return [
      sourceEntry(document, `${sourcePointer}/${index}`, kind, {
        artifactKind: kind,
        id,
        path: emittedPath,
        pointer: `/${kind === "material" ? "materials" : "nodes"}/${escapePointer(id)}`,
      }),
    ];
  });
}

function prefabOwnershipEntries(document: IAuthoringDocument, data: Record<string, unknown>): IAuthoringOwnershipEntry[] {
  const entries: IAuthoringOwnershipEntry[] = [];
  const prefabId = readString(data.id);
  if (prefabId === undefined) {
    return entries;
  }
  entries.push(sourceEntry(document, "/id", "prefab", {
    artifactKind: "prefab",
    id: prefabId,
    path: "prefabs.ir.json",
    pointer: `/prefabs/${escapePointer(prefabId)}`,
  }));
  for (const [index, entity] of readArray(data.entities).entries()) {
    const entityRecord = readRecord(entity);
    const entityId = readString(entityRecord?.id);
    if (entityId === undefined) {
      continue;
    }
    const entityPointer = `/prefabs/${escapePointer(prefabId)}/entities/${escapePointer(entityId)}`;
    entries.push(sourceEntry(document, `/entities/${index}`, "entity", {
      artifactKind: "entity",
      id: `${prefabId}.${entityId}`,
      path: "prefabs.ir.json",
      pointer: entityPointer,
    }));
    const components = readRecord(entityRecord?.components);
    for (const componentKind of Object.keys(components ?? {}).sort()) {
      entries.push(sourceEntry(document, `/entities/${index}/components/${escapePointer(componentKind)}`, "component", {
        artifactKind: "component",
        id: `${prefabId}.${entityId}.${componentKind}`,
        path: "prefabs.ir.json",
        pointer: `${entityPointer}/components/${escapePointer(componentKind)}`,
      }));
    }
  }
  return entries;
}

function systemOwnershipEntries(document: IAuthoringDocument, systems: unknown): IAuthoringOwnershipEntry[] {
  return readArray(systems).flatMap((system, index) => {
    const record = readRecord(system);
    const id = readString(record?.id);
    if (id === undefined) {
      return [];
    }
    const script = readRecord(record?.script);
    const modulePath = readString(script?.module);
    const exportName = readString(script?.export);
    return [
      sourceEntry(document, `/systems/${index}${modulePath === undefined ? "" : "/script"}`, "system", {
        artifactKind: "system",
        id,
        path: "systems.ir.json",
        pointer: `/systems/${escapePointer(id)}`,
      }, modulePath, exportName),
    ];
  });
}

function materialSourceIndex(documents: readonly IAuthoringDocument[]): Map<string, IAuthoringStructuredSourcePointer> {
  const sources = new Map<string, IAuthoringStructuredSourcePointer>();
  for (const document of documents.filter((item) => item.kind === "material")) {
    for (const [index, material] of readArray(readRecord(document.data)?.materials).entries()) {
      const id = readString(readRecord(material)?.id);
      if (id !== undefined && !sources.has(id)) {
        sources.set(id, sourcePointer(document, `/materials/${index}`, "material"));
      }
    }
  }
  return sources;
}

function generatedArtifactOwnershipEntries(emitted: readonly IAuthoringEmittedDocument[]): IAuthoringOwnershipEntry[] {
  return emitted
    .filter((document) => generatedBundleArtifactFiles.has(document.path.split("\\").pop() ?? document.path))
    .map((document) => ({
      emitted: {
        artifactKind: document.kind,
        path: document.path,
      },
      ownership: document.path === "scripts.bundle.js" ? "rejected/not-source" : "full-reload-required",
    }));
}

function diagnoseDuplicateOwnership(entries: readonly IAuthoringOwnershipEntry[]): ICompilerDiagnostic[] {
  const byEmittedTarget = new Map<string, IAuthoringOwnershipEntry[]>();
  for (const entry of entries.filter((item) => item.source !== undefined && item.ownership === "source-persistable")) {
    const key = `${entry.emitted.path}:${entry.emitted.artifactKind}:${entry.emitted.id ?? entry.emitted.pointer ?? ""}`;
    const bucket = byEmittedTarget.get(key);
    if (bucket === undefined) {
      byEmittedTarget.set(key, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  return [...byEmittedTarget.values()]
    .filter((items) => new Set(items.map((item) => `${item.source?.path}:${item.source?.pointer}`)).size > 1)
    .map((items) => {
      const first = items[0]!;
      return {
        code: "TN_AUTHORING_DUPLICATE_EMITTED_OWNER",
        file: first.source?.path,
        limit: items.map((item) => `${item.source?.path}${item.source?.pointer}`).sort(),
        message: `Multiple structured source declarations claim emitted ${first.emitted.artifactKind} '${first.emitted.id ?? first.emitted.pointer ?? first.emitted.path}'.`,
        path: first.emitted.pointer ?? first.emitted.path,
        severity: "error",
        suggestion: "Give each source declaration a unique stable ID before persisting editor patches.",
        target: first.emitted.id,
      } satisfies ICompilerDiagnostic;
    })
    .sort(sortDiagnostics);
}

function sourceEntry(
  document: IAuthoringDocument,
  pointer: string,
  kind: string,
  emitted: IAuthoringEmittedPointer,
  modulePath?: string,
  exportName?: string,
): IAuthoringOwnershipEntry {
  return {
    emitted,
    ownership: "source-persistable",
    source: sourcePointer(document, pointer, kind, modulePath, exportName),
  };
}

function sourcePointer(
  document: IAuthoringDocument,
  pointer: string,
  kind: string,
  modulePath?: string,
  exportName?: string,
): IAuthoringStructuredSourcePointer {
  return {
    category: document.kind,
    kind,
    ...(modulePath === undefined ? {} : { modulePath }),
    ...(exportName === undefined ? {} : { exportName }),
    path: document.projectRelativePath,
    pointer,
  };
}

function stableOwnershipEntries(entries: readonly IAuthoringOwnershipEntry[]): IAuthoringOwnershipEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.emitted.path.localeCompare(right.emitted.path) ||
      left.emitted.artifactKind.localeCompare(right.emitted.artifactKind) ||
      (left.emitted.id ?? "").localeCompare(right.emitted.id ?? "") ||
      (left.source?.path ?? "").localeCompare(right.source?.path ?? "") ||
      (left.source?.pointer ?? "").localeCompare(right.source?.pointer ?? ""),
  );
}

function sortDiagnostics(left: ICompilerDiagnostic, right: ICompilerDiagnostic): number {
  return (left.path ?? "").localeCompare(right.path ?? "") || left.code.localeCompare(right.code);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
