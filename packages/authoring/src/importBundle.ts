import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { normalizeRelativePath, writeAuthoringJsonDocument, type IAuthoringDocument } from "./documents.js";
import {
  assetDocumentSchema,
  audioDocumentSchema,
  inputDocumentSchema,
  isRecord,
  materialDocumentSchema,
  readArray,
  readString,
  runtimeDocumentSchema,
  sceneDocumentSchema,
  systemsDocumentSchema,
  targetProfileDocumentSchema,
  uiDocumentSchema,
  type IAssetDeclaration,
  type IAssetDocument,
  type IAudioDocument,
  type IAudioSoundDeclaration,
  type IInputActionDeclaration,
  type IInputAxisDeclaration,
  type IInputDocument,
  type IMaterialDeclaration,
  type IMaterialDocument,
  type ISceneDocument,
  type ISceneEntity,
  type ISceneResource,
  type ISceneSystem,
  type ISceneUiNode,
  type ISystemsDocument,
  type IUiDocument,
} from "./schemas.js";

export type BundleImportMode = "source";

export interface IImportBundleOptions {
  bundleDir: string;
  dryRun?: boolean;
  mode: BundleImportMode;
  projectPath: string;
}

export interface IImportedBundleArtifact {
  artifact: string;
  file: string;
  kind: string;
  itemCount: number;
}

export interface ISkippedBundleArtifact {
  artifact: string;
  reason: "missing" | "unsupported" | "unrecoverable";
}

export interface IImportBundleResult {
  ok: boolean;
  bundleDir: string;
  projectPath: string;
  mode: BundleImportMode;
  dryRun: boolean;
  filesWritten: string[];
  plannedWrites: string[];
  imported: IImportedBundleArtifact[];
  skipped: ISkippedBundleArtifact[];
  diagnostics: IAuthoringDiagnostic[];
}

interface IPlannedDocument {
  artifact: string;
  document: IAuthoringDocument;
  itemCount: number;
}

const bundleArtifacts = [
  "world.ir.json",
  "materials.ir.json",
  "assets.manifest.json",
  "ui.ir.json",
  "input.ir.json",
  "systems.ir.json",
  "audio.ir.json",
  "runtime.config.json",
  "target.profile.json",
  "scripts.bundle.js",
] as const;

export async function importBundle(options: IImportBundleOptions): Promise<IImportBundleResult> {
  const projectPath = resolve(options.projectPath);
  const bundleDir = resolve(projectPath, options.bundleDir);
  const dryRun = options.dryRun === true;
  const diagnostics: IAuthoringDiagnostic[] = [];
  const skipped: ISkippedBundleArtifact[] = [];
  const planned: IPlannedDocument[] = [];

  if (options.mode !== "source") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_IMPORT_MODE_UNSUPPORTED",
        message: "Only source bundle import mode is supported.",
        value: options.mode,
        suggestion: "Use --mode source.",
      }),
    );
  }

  for (const artifact of bundleArtifacts) {
    const artifactPath = resolve(bundleDir, artifact);
    const exists = await fileExists(artifactPath);
    if (!exists) {
      skipped.push({ artifact, reason: "missing" });
      continue;
    }

    if (artifact === "scripts.bundle.js") {
      skipped.push({ artifact, reason: "unrecoverable" });
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_IMPORT_UNRECOVERABLE_SCRIPT_BODY",
          severity: "warning",
          file: normalizeRelativePath(relative(projectPath, artifactPath)),
          message: "Generated script bundle bodies cannot be persisted as TypeScript source.",
          suggestion: "Keep gameplay source in src/scripts and import only script references when provenance is available.",
        }),
      );
      continue;
    }

    const parsed = await readBundleJson(projectPath, artifactPath, artifact, diagnostics);
    if (parsed === undefined) {
      skipped.push({ artifact, reason: "unsupported" });
      continue;
    }

    const document = documentFromArtifact(projectPath, artifact, parsed);
    planned.push(document);
  }

  const imported = planned.map((item) => ({
    artifact: item.artifact,
    file: item.document.projectRelativePath,
    kind: item.document.kind,
    itemCount: item.itemCount,
  }));
  const plannedWrites = planned.map((item) => item.document.projectRelativePath).sort();
  const filesWritten: string[] = [];

  if (!hasAuthoringErrors(diagnostics) && !dryRun) {
    for (const item of planned) {
      await mkdir(dirname(item.document.file), { recursive: true });
      await writeAuthoringJsonDocument(item.document);
      filesWritten.push(item.document.projectRelativePath);
    }
  }

  const sortedDiagnostics = sortAuthoringDiagnostics(diagnostics);
  return {
    ok: !hasAuthoringErrors(sortedDiagnostics),
    bundleDir: normalizeRelativePath(bundleDir),
    projectPath,
    mode: options.mode,
    dryRun,
    filesWritten: filesWritten.sort(),
    plannedWrites,
    imported,
    skipped,
    diagnostics: sortedDiagnostics,
  };
}

async function readBundleJson(projectPath: string, absoluteFile: string, artifact: string, diagnostics: IAuthoringDiagnostic[]): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(absoluteFile, "utf8")) as unknown;
  } catch (error) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_IMPORT_ARTIFACT_READ_FAILED",
        file: normalizeRelativePath(relative(projectPath, absoluteFile)),
        message: `Could not read bundle artifact '${artifact}'.`,
        value: error instanceof Error ? error.message : String(error),
        suggestion: "Ensure the bundle artifact exists and contains valid JSON.",
      }),
    );
    return undefined;
  }
}

function documentFromArtifact(projectPath: string, artifact: string, data: unknown): IPlannedDocument {
  switch (artifact) {
    case "world.ir.json":
      return plannedDocument(projectPath, artifact, "content/scenes/imported.scene.json", sceneFromWorld(data), "scene");
    case "materials.ir.json":
      return plannedDocument(projectPath, artifact, "content/materials/imported.materials.json", materialsFromBundle(data), "material");
    case "assets.manifest.json":
      return plannedDocument(projectPath, artifact, "content/assets/imported.assets.json", assetsFromBundle(data), "asset");
    case "ui.ir.json":
      return plannedDocument(projectPath, artifact, "content/ui/imported.ui.json", uiFromBundle(data), "ui");
    case "input.ir.json":
      return plannedDocument(projectPath, artifact, "content/input/imported.input.json", inputFromBundle(data), "input");
    case "systems.ir.json":
      return plannedDocument(projectPath, artifact, "content/systems/imported.systems.json", systemsFromBundle(data), "systems");
    case "audio.ir.json":
      return plannedDocument(projectPath, artifact, "content/audio/imported.audio.json", audioFromBundle(data), "audio");
    case "runtime.config.json":
      return plannedDocument(projectPath, artifact, "content/runtime/imported.runtime.json", runtimeFromBundle(data), "runtime");
    case "target.profile.json":
      return plannedDocument(projectPath, artifact, "content/targets/imported.target.json", targetProfileFromBundle(data), "target");
    default:
      throw new Error(`Unsupported bundle artifact '${artifact}'.`);
  }
}

function plannedDocument(projectPath: string, artifact: string, file: string, data: unknown, kind: IAuthoringDocument["kind"]): IPlannedDocument {
  const absoluteFile = resolve(projectPath, file);
  return {
    artifact,
    document: {
      data,
      file: absoluteFile,
      kind,
      projectRelativePath: normalizeRelativePath(relative(projectPath, absoluteFile)),
    },
    itemCount: countDocumentItems(data),
  };
}

function sceneFromWorld(world: unknown): ISceneDocument & { provenance: Record<string, unknown> } {
  const worldRecord = isRecord(world) ? world : {};
  const entities = (readArray(worldRecord.entities) ?? [])
    .filter(isRecord)
    .map((entity): ISceneEntity => ({
      id: readString(entity.id) ?? "invalid-entity-id",
      ...(isRecord(entity.components) ? { components: cloneJson(entity.components) as Record<string, unknown> } : {}),
      ...(isRecord(entity.transform) ? { transform: cloneJson(entity.transform) as ISceneEntity["transform"] } : {}),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const resourcesRecord = isRecord(worldRecord.resources) ? worldRecord.resources : {};
  const resources = Object.entries(resourcesRecord)
    .map(([id, value]): ISceneResource => ({ id, value: cloneJson(value) }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: "scene.imported",
    entities,
    prefabs: [],
    resources,
    systems: [],
    ui: { nodes: [], bindings: [] },
    provenance: importProvenance("world.ir.json"),
  };
}

function materialsFromBundle(data: unknown): IMaterialDocument & { provenance: Record<string, unknown> } {
  const materials = (readArray(isRecord(data) ? data.materials : undefined) ?? [])
    .filter(isRecord)
    .map((material): IMaterialDeclaration => ({
      id: readString(material.id) ?? "invalid-material-id",
      ...optionalNumberField(material, "alphaCutoff"),
      ...optionalAlphaModeField(material, "alphaMode"),
      ...optionalStringField(material, "asset"),
      ...optionalStringField(material, "baseColorTexture"),
      ...optionalNumberField(material, "clearcoat"),
      ...optionalNumberField(material, "clearcoatRoughness"),
      ...optionalStringField(material, "clearcoatRoughnessTexture"),
      ...optionalStringField(material, "clearcoatTexture"),
      ...optionalStringField(material, "color"),
      ...optionalStringField(material, "emissive"),
      ...optionalNumberField(material, "emissiveIntensity"),
      ...optionalStringField(material, "emissiveTexture"),
      ...optionalStringField(material, "metallicRoughnessTexture"),
      ...optionalNumberField(material, "metalness"),
      ...optionalStringField(material, "normalTexture"),
      ...optionalStringField(material, "occlusionTexture"),
      ...optionalNumberField(material, "opacity"),
      ...optionalNumberField(material, "roughness"),
      ...optionalNumberField(material, "transmission"),
      ...optionalStringField(material, "transmissionTexture"),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: materialDocumentSchema,
    version: "0.1.0",
    id: "materials.imported",
    materials,
    provenance: importProvenance("materials.ir.json"),
  };
}

function assetsFromBundle(data: unknown): IAssetDocument & { provenance: Record<string, unknown> } {
  const assets = (readArray(isRecord(data) ? data.assets : undefined) ?? [])
    .filter(isRecord)
    .map((asset): IAssetDeclaration => {
      const type = readString(asset.type) ?? readString(asset.kind);
      return {
        id: readString(asset.id) ?? "invalid-asset-id",
        ...optionalStringField(asset, "path"),
        ...(type === undefined ? {} : { type }),
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: assetDocumentSchema,
    version: "0.1.0",
    id: "assets.imported",
    assets,
    provenance: importProvenance("assets.manifest.json"),
  };
}

function uiFromBundle(data: unknown): IUiDocument & { provenance: Record<string, unknown> } {
  const nodes = collectUiNodes(data);
  return {
    schema: uiDocumentSchema,
    version: "0.1.0",
    id: "ui.imported",
    nodes,
    bindings: [],
    provenance: importProvenance("ui.ir.json"),
  };
}

function inputFromBundle(data: unknown): IInputDocument & { provenance: Record<string, unknown> } {
  const actions = (readArray(isRecord(data) ? data.actions : undefined) ?? [])
    .filter(isRecord)
    .map((action): IInputActionDeclaration => ({
      id: readString(action.id) ?? "invalid-input-id",
      bindings: readArray(action.bindings)?.map(formatInputBinding).sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const axes = (readArray(isRecord(data) ? data.axes : undefined) ?? [])
    .filter(isRecord)
    .map((axis): IInputAxisDeclaration => ({
      id: readString(axis.id) ?? "invalid-input-axis-id",
      negative: readArray(axis.negative)?.map(formatInputBinding).sort() ?? [],
      positive: readArray(axis.positive)?.map(formatInputBinding).sort() ?? [],
      ...(axis.value === undefined ? {} : { value: formatInputBinding(axis.value) }),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: inputDocumentSchema,
    version: "0.1.0",
    id: "input.imported",
    actions,
    axes,
    provenance: importProvenance("input.ir.json"),
  };
}

function systemsFromBundle(data: unknown): ISystemsDocument & { provenance: Record<string, unknown> } {
  const systems = (readArray(isRecord(data) ? data.systems : undefined) ?? [])
    .filter(isRecord)
    .map((system): ISceneSystem => ({
      id: readString(system.id) ?? readString(system.name) ?? "invalid-system-id",
      ...copyStringList(system.after, "after"),
      ...copyStringList(system.before, "before"),
      ...copyRecordArray(system.commands, "commands"),
      ...copyStringList(system.eventReads, "eventReads"),
      ...copyStringList(system.eventWrites, "eventWrites"),
      ...copyRecordArray(system.queries, "queries"),
      ...copyStringList(system.reads, "reads"),
      ...copyStringList(system.resourceReads, "resourceReads"),
      ...copyStringList(system.resourceWrites, "resourceWrites"),
      ...copyStringList(system.services, "services"),
      ...optionalStringField(system, "schedule"),
      ...copyStringList(system.writes, "writes"),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: systemsDocumentSchema,
    version: "0.1.0",
    id: "systems.imported",
    systems,
    provenance: importProvenance("systems.ir.json"),
  };
}

function copyStringList(value: unknown, key: string): Record<string, string[]> {
  const items = readArray(value)?.map(readString).filter(isString).sort() ?? [];
  return items.length === 0 ? {} : { [key]: items };
}

function copyRecordArray(value: unknown, key: string): Record<string, Record<string, unknown>[]> {
  const items = readArray(value)?.filter(isRecord).map((item) => JSON.parse(JSON.stringify(item)) as Record<string, unknown>) ?? [];
  return items.length === 0 ? {} : { [key]: items };
}

function optionalStringField<T extends string>(record: Record<string, unknown>, key: T): Partial<Record<T, string>> {
  const value = readString(record[key]);
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<T, string>>);
}

function optionalNumberField<T extends string>(record: Record<string, unknown>, key: T): Partial<Record<T, number>> {
  const value = readNumber(record[key]);
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<T, number>>);
}

function optionalAlphaModeField(record: Record<string, unknown>, key: "alphaMode"): Pick<IMaterialDeclaration, "alphaMode"> | Record<string, never> {
  const value = readMaterialAlphaMode(record[key]);
  return value === undefined ? {} : { alphaMode: value };
}

function audioFromBundle(data: unknown): IAudioDocument & { provenance: Record<string, unknown> } {
  const sounds = (readArray(isRecord(data) ? data.sounds : undefined) ?? [])
    .filter(isRecord)
    .map((sound): IAudioSoundDeclaration => ({
      id: readString(sound.id) ?? "invalid-audio-id",
      ...optionalStringField(sound, "asset"),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: audioDocumentSchema,
    version: "0.1.0",
    id: "audio.imported",
    sounds,
    provenance: importProvenance("audio.ir.json"),
  };
}

function runtimeFromBundle(data: unknown): Record<string, unknown> {
  const record = isRecord(data) ? data : {};
  return {
    schema: runtimeDocumentSchema,
    version: "0.1.0",
    id: "runtime.imported",
    ...(isRecord(record.renderer) ? { renderer: cloneJson(record.renderer) } : {}),
    time: isRecord(record.time) ? cloneJson(record.time) : { fixedDelta: 1 / 60, paused: false },
    window: isRecord(record.window) ? cloneJson(record.window) : { height: 720, width: 1280 },
    provenance: importProvenance("runtime.config.json"),
  };
}

function targetProfileFromBundle(data: unknown): Record<string, unknown> {
  const record = isRecord(data) ? data : {};
  return {
    schema: targetProfileDocumentSchema,
    version: "0.1.0",
    id: "target.imported",
    targets: readArray(record.targets)?.map(readString).filter(isString) ?? ["web", "desktop"],
    ...(isRecord(record.budgets) ? { budgets: cloneJson(record.budgets) } : {}),
    ...(isRecord(record.performance) ? { performance: cloneJson(record.performance) } : {}),
    provenance: importProvenance("target.profile.json"),
  };
}

function collectUiNodes(data: unknown): ISceneUiNode[] {
  const discovered = new Set<string>();
  const root = isRecord(data) ? data.root : undefined;
  collectUiNodeIds(root, discovered);
  for (const node of readArray(isRecord(data) ? data.nodes : undefined) ?? []) {
    if (isRecord(node)) {
      const id = readString(node.id);
      if (id !== undefined) {
        discovered.add(id);
      }
    }
  }
  return [...discovered].sort().map((id) => ({ id }));
}

function collectUiNodeIds(value: unknown, ids: Set<string>): void {
  if (!isRecord(value)) {
    return;
  }
  const id = readString(value.id);
  if (id !== undefined) {
    ids.add(id);
  }
  for (const child of readArray(value.children) ?? []) {
    collectUiNodeIds(child, ids);
  }
}

function formatInputBinding(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!isRecord(value)) {
    return JSON.stringify(value);
  }
  const device = readString(value.device);
  const code = readString(value.code);
  const control = readString(value.control);
  const axis = readString(value.axis);
  return [device, code ?? control, axis].filter((item): item is string => item !== undefined).join(".");
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function readMaterialAlphaMode(value: unknown): IMaterialDeclaration["alphaMode"] | undefined {
  return value === "blend" || value === "mask" || value === "opaque" ? value : undefined;
}

function countDocumentItems(data: unknown): number {
  if (!isRecord(data)) {
    return 0;
  }
  for (const key of ["entities", "materials", "assets", "nodes", "actions", "systems", "sounds", "targets"]) {
    const value = readArray(data[key]);
    if (value !== undefined) {
      return value.length;
    }
  }
  return data.id === undefined ? 0 : 1;
}

function importProvenance(artifact: string): Record<string, unknown> {
  return {
    importedFromBundleArtifact: artifact,
    importKind: "generated-bundle-recovery",
  };
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
