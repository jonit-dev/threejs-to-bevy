import { writeAuthoringJsonDocument } from "../documents.js";
import { authoringDiagnostic } from "../diagnostics.js";
import { expandPlacementSet } from "../placementSets.js";
import { loadAuthoringProject } from "../project.js";
import type { ISceneDocument, IScenePlacementSet } from "../schemas.js";
import { authoringOperationResult } from "./shared.js";
import { validationContextForProject } from "./sharedA.js";
import { validateSceneDocument } from "./sharedB.js";
import type { IAuthoringOperationResult } from "./types.js";

export interface IPlacementOperationOptions { projectPath: string; sceneId: string; placementId: string }
export interface IAddPlacementOptions extends IPlacementOperationOptions { placement: IScenePlacementSet }
export interface IInspectPlacementOptions extends IPlacementOperationOptions { expand?: boolean }
export interface IMigratePlacementOptions extends IAddPlacementOptions { apply?: boolean; dryRun?: boolean }

export async function addPlacementSet(options: IAddPlacementOptions): Promise<IAuthoringOperationResult> {
  return mutatePlacementScene(options, (scene) => {
    const sets = scene.placementSets ??= [];
    if (sets.some((set) => set.id === options.placementId)) return [authoringDiagnostic({ code: "TN_PLACEMENT_ID_COLLISION", message: `Placement set '${options.placementId}' already exists.`, path: "/placementSets", value: options.placementId })];
    sets.push({ ...clone(options.placement), id: options.placementId, kind: "placement-set" });
    return [];
  });
}

export async function inspectPlacementSet(options: IInspectPlacementOptions): Promise<IAuthoringOperationResult> {
  const loaded = await placementScene(options);
  if (loaded.result !== undefined) return loaded.result;
  const set = loaded.scene!.placementSets?.find((item) => item.id === options.placementId);
  if (set === undefined) return authoringOperationResult({ diagnostics: [authoringDiagnostic({ code: "TN_PLACEMENT_SET_MISSING", file: loaded.document!.projectRelativePath, message: `Placement set '${options.placementId}' was not found.`, path: "/placementSets", value: options.placementId })], projectPath: options.projectPath });
  const expanded = options.expand === true ? expandPlacementSet(set) : [];
  return { ...authoringOperationResult({ projectPath: options.projectPath }), placement: clone(set), expanded: expanded.map(({ placement, ...instance }) => ({ ...instance, provenance: { generatedId: instance.id, index: placement.index, placementSetId: placement.placementSetId, sourcePath: loaded.document!.projectRelativePath } })) } as IAuthoringOperationResult;
}

export async function migratePlacementSet(options: IMigratePlacementOptions): Promise<IAuthoringOperationResult> {
  const loaded = await placementScene(options);
  if (loaded.result !== undefined) return loaded.result;
  const expanded = expandPlacementSet({ ...options.placement, id: options.placementId, kind: "placement-set" });
  const entities = loaded.scene!.entities ?? [];
  const matchedIds = expanded.filter((candidate) => entities.some((entity) => equivalentEntity(entity, candidate))).map((item) => item.id);
  const exact = matchedIds.length === expanded.length;
  if (options.apply !== true) return { ...authoringOperationResult({ projectPath: options.projectPath }), dryRun: true, exactMatch: exact, matchedIds, generatedIds: expanded.map((item) => item.id) } as IAuthoringOperationResult;
  if (!exact) return authoringOperationResult({ diagnostics: [authoringDiagnostic({ code: "TN_PLACEMENT_MIGRATION_NOT_EXACT", file: loaded.document!.projectRelativePath, message: "Placement migration cannot apply because expanded entities are not an exact semantic match.", path: "/entities", suggestion: "Inspect the dry-run result and keep semantically exceptional entities explicit." })], projectPath: options.projectPath });
  return mutatePlacementScene(options, (scene) => {
    scene.entities = (scene.entities ?? []).filter((entity) => !matchedIds.includes(entity.id));
    (scene.placementSets ??= []).push({ ...clone(options.placement), id: options.placementId, kind: "placement-set" });
    return [];
  });
}

async function mutatePlacementScene(options: IAddPlacementOptions, mutate: (scene: ISceneDocument) => ReturnType<typeof authoringDiagnostic>[]): Promise<IAuthoringOperationResult> {
  const loaded = await placementScene(options);
  if (loaded.result !== undefined) return loaded.result;
  const scene = clone(loaded.scene!); const diagnostics = mutate(scene);
  if (diagnostics.length > 0) return authoringOperationResult({ diagnostics, projectPath: options.projectPath });
  const validation = await validateSceneDocument(options.projectPath, loaded.document!.projectRelativePath, scene, validationContextForProject(loaded.project!));
  if (validation.some((item) => item.severity === "error")) return authoringOperationResult({ diagnostics: validation, projectPath: options.projectPath });
  loaded.document!.data = scene; await writeAuthoringJsonDocument(loaded.document!);
  return authoringOperationResult({ changed: true, diagnostics: validation, filesWritten: [loaded.document!.projectRelativePath], projectPath: options.projectPath });
}

async function placementScene(options: { projectPath: string; sceneId: string }) {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((item) => item.kind === "scene" && typeof (item.data as { id?: unknown })?.id === "string" && (item.data as { id: string }).id === options.sceneId);
  if (document === undefined) return { result: authoringOperationResult({ diagnostics: [authoringDiagnostic({ code: "TN_AUTHORING_SCENE_MISSING", message: `Scene '${options.sceneId}' was not found.`, path: "/sceneId", value: options.sceneId })], projectPath: options.projectPath }) };
  return { document, project, scene: document.data as ISceneDocument };
}
function equivalentEntity(left: unknown, right: unknown): boolean { return stable(left) === stable(Object.fromEntries(Object.entries(right as Record<string, unknown>).filter(([key]) => key !== "placement"))); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; return JSON.stringify(value); }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
