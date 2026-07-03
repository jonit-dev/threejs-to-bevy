import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { authoringDiagnostic, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { type AuthoringDocumentKind, type IAuthoringDocument } from "./documents.js";
import { type IAuthoringProject, loadAuthoringProject } from "./project.js";
import {
  type IAssetDocument,
  type IInputDocument,
  type IMaterialDocument,
  type IPrefabDocument,
  type ISceneDocument,
  type ISceneScriptLifecycle,
  type ISceneSystem,
  type ISystemsDocument,
  type IUiDocument,
  isRecord,
} from "./schemas.js";

export const GAME_AGENT_INVENTORY_SCHEMA = "threenative.game-agent-inventory";
export const GAME_AGENT_INVENTORY_VERSION = "0.1.0";

export type GameAgentProjectKind = "asset-kit" | "environment-component" | "generated-game" | "physics-lab" | "unknown";

export interface IGameAgentSourceFamily {
  count: number;
  files: string[];
  ids: string[];
  kind: AuthoringDocumentKind;
}

export interface IGameAgentSceneSummary {
  cameraIds: string[];
  entityCount: number;
  entityIds: string[];
  file: string;
  id: string;
  instanceCount: number;
  prefabCount: number;
  resourceIds: string[];
  systemIds: string[];
  uiNodeCount: number;
}

export interface IGameAgentScriptReference {
  exportName: string;
  module: string;
}

export interface IGameAgentScriptSystem {
  document: string;
  id: string;
  reads: string[];
  resourceReads: string[];
  resourceWrites: string[];
  schedule?: string;
  script?: IGameAgentScriptReference;
  writes: string[];
}

export interface IGameAgentInputSummary {
  actions: Array<{ bindings: string[]; id: string; source: string }>;
  axes: Array<{ id: string; negative: string[]; positive: string[]; source: string; value?: string }>;
  documents: string[];
}

export interface IGameAgentUiSummary {
  bindings: Array<{ node: string; resource: string; source: string }>;
  documents: string[];
  nodes: Array<{ id: string; source: string; text?: string; type?: string }>;
}

export interface IGameAgentAssetSummary {
  assets: Array<{ id: string; path?: string; source: string; type?: string }>;
  documents: string[];
}

export interface IGameAgentMaterialSummary {
  documents: string[];
  materials: Array<{ color?: string; id: string; source: string }>;
}

export interface IGameAgentHighValueSurface {
  id: string;
  source: "production.assetPlan" | "source";
  sourcePath?: string;
  status: "declared" | "missing";
  summary?: string;
}

export interface IGameAgentProductionSummary {
  assetPlan?: Record<string, string>;
  controls: string[];
  failRetry?: string;
  feedbackMoments: string[];
  objective?: string;
  playableLoop?: string;
  progression?: string;
  proofCommands: string[];
  scriptModules: Array<{ exportName: string; module: string; ownsState: string[]; referencedBy: string[] }>;
}

export interface IGameAgentInventory {
  assets: IGameAgentAssetSummary;
  diagnostics: IAuthoringDiagnostic[];
  entry?: string;
  highValueSurfaces: IGameAgentHighValueSurface[];
  input: IGameAgentInputSummary;
  materials: IGameAgentMaterialSummary;
  outDir?: string;
  primaryScene?: IGameAgentSceneSummary;
  production: IGameAgentProductionSummary;
  projectKind: GameAgentProjectKind;
  projectPath: string;
  proofCommands: string[];
  recommendedOperations: string[];
  schema: typeof GAME_AGENT_INVENTORY_SCHEMA;
  scriptSystems: IGameAgentScriptSystem[];
  scripts: IGameAgentScriptReference[];
  sourceFamilies: IGameAgentSourceFamily[];
  ui: IGameAgentUiSummary;
  version: typeof GAME_AGENT_INVENTORY_VERSION;
}

export interface ICreateGameAgentInventoryOptions {
  projectPath: string;
}

const sourceFamilyKinds: AuthoringDocumentKind[] = [
  "asset",
  "audio",
  "environment",
  "generator",
  "input",
  "material",
  "mesh",
  "prefab",
  "project",
  "resources",
  "runtime",
  "scene",
  "schema",
  "systems",
  "target",
  "ui",
];

const requiredGeneratedGameFamilies: AuthoringDocumentKind[] = ["asset", "input", "material", "mesh", "prefab", "scene", "systems", "ui"];
const requiredSurfaces = ["playerHero", "obstacleEnemy", "rewardInteractable", "worldEnvironment", "uiHud", "audioFeedback"];

export async function createGameAgentInventory(options: ICreateGameAgentInventoryOptions): Promise<IGameAgentInventory> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const config = await readOptionalJson(resolve(project.projectPath, "threenative.config.json"), "threenative.config.json");
  const packageJson = await readOptionalJson(resolve(project.projectPath, "package.json"), "package.json");
  const production = readProduction(config.data);
  const projectKind = classifyGameAgentProject(project, config.data, packageJson.data);
  const sourceFamilies = buildSourceFamilies(project.documents);
  const primaryScene = selectPrimaryScene(project.documents, config.data);
  const scriptSystems = collectScriptSystems(project.documents);
  const scripts = collectScripts(scriptSystems, production);
  const proofCommands = collectProofCommands(production, packageJson.data);
  const highValueSurfaces = collectHighValueSurfaces(production, project.documents);
  const diagnostics = [
    ...project.diagnostics,
    ...config.diagnostics,
    ...packageJson.diagnostics,
    ...diagnosticsForProject(projectKind, sourceFamilies, primaryScene, scripts, proofCommands, highValueSurfaces),
  ];

  return {
    assets: collectAssets(project.documents),
    diagnostics: sortAuthoringDiagnostics(diagnostics),
    entry: readStringField(config.data, "entry"),
    highValueSurfaces,
    input: collectInput(project.documents),
    materials: collectMaterials(project.documents),
    outDir: readStringField(config.data, "outDir"),
    primaryScene,
    production,
    projectKind,
    projectPath: project.projectPath,
    proofCommands,
    recommendedOperations: recommendedOperations(projectKind, sourceFamilies, primaryScene, scripts, proofCommands, highValueSurfaces),
    schema: GAME_AGENT_INVENTORY_SCHEMA,
    scriptSystems,
    scripts,
    sourceFamilies,
    ui: collectUi(project.documents),
    version: GAME_AGENT_INVENTORY_VERSION,
  };
}

function buildSourceFamilies(documents: readonly IAuthoringDocument[]): IGameAgentSourceFamily[] {
  return sourceFamilyKinds.map((kind) => {
    const matching = documents.filter((document) => document.kind === kind);
    return {
      count: matching.length,
      files: matching.map((document) => document.projectRelativePath).sort(),
      ids: matching.map((document) => readDocumentId(document.data)).filter((id): id is string => id !== undefined).sort(),
      kind,
    };
  });
}

function selectPrimaryScene(documents: readonly IAuthoringDocument[], config: unknown): IGameAgentSceneSummary | undefined {
  const entry = readStringField(config, "entry");
  const sceneDocuments = documents.filter((document) => document.kind === "scene");
  const selected = sceneDocuments.find((document) => document.projectRelativePath === entry)
    ?? sceneDocuments.find((document) => isSceneDocument(document.data) && document.data.initial === true)
    ?? sceneDocuments[0];
  if (selected === undefined || !isSceneDocument(selected.data)) {
    return undefined;
  }
  const scene = selected.data;
  const entities = scene.entities ?? [];
  const systems = scene.systems ?? [];
  return {
    cameraIds: entities.filter((entity) => isRecord(entity.components) && isRecord(entity.components.camera)).map((entity) => entity.id).sort(),
    entityCount: entities.length,
    entityIds: entities.map((entity) => entity.id).sort(),
    file: selected.projectRelativePath,
    id: scene.id,
    instanceCount: scene.instances?.length ?? 0,
    prefabCount: (scene.prefabs?.length ?? 0) + countPrefabDocuments(documents),
    resourceIds: (scene.resources ?? []).map((resource) => resource.id).sort(),
    systemIds: systems.map((system) => system.id).sort(),
    uiNodeCount: scene.ui?.nodes?.length ?? 0,
  };
}

function collectScriptSystems(documents: readonly IAuthoringDocument[]): IGameAgentScriptSystem[] {
  const rows: IGameAgentScriptSystem[] = [];
  for (const document of documents) {
    if (document.kind === "scene" && isSceneDocument(document.data)) {
      rows.push(...scriptSystemsFromRows(document.projectRelativePath, document.data.systems ?? []));
      rows.push(...scriptLifecyclesFromRows(document.projectRelativePath, document.data.scriptLifecycles ?? []));
    }
    if (document.kind === "systems" && isSystemsDocument(document.data)) {
      rows.push(...scriptSystemsFromRows(document.projectRelativePath, document.data.systems ?? []));
      rows.push(...scriptLifecyclesFromRows(document.projectRelativePath, document.data.scriptLifecycles ?? []));
    }
  }
  return rows.sort((left, right) => left.document.localeCompare(right.document) || left.id.localeCompare(right.id));
}

function scriptSystemsFromRows(document: string, systems: readonly ISceneSystem[]): IGameAgentScriptSystem[] {
  return systems.map((system) => ({
    document,
    id: system.id,
    reads: [...(system.reads ?? [])].sort(),
    resourceReads: [...(system.resourceReads ?? [])].sort(),
    resourceWrites: [...(system.resourceWrites ?? [])].sort(),
    schedule: system.schedule,
    script: system.script === undefined ? undefined : { exportName: system.script.export, module: system.script.module },
    writes: [...(system.writes ?? [])].sort(),
  }));
}

function scriptLifecyclesFromRows(document: string, lifecycles: readonly ISceneScriptLifecycle[]): IGameAgentScriptSystem[] {
  return lifecycles.map((lifecycle) => ({
    document,
    id: lifecycle.id,
    reads: [...(lifecycle.reads ?? [])].sort(),
    resourceReads: [...(lifecycle.resourceReads ?? [])].sort(),
    resourceWrites: [...(lifecycle.resourceWrites ?? [])].sort(),
    script: {
      exportName: lifecycle.update ?? lifecycle.fixedUpdate ?? lifecycle.awake ?? lifecycle.lateUpdate ?? lifecycle.onEnter ?? lifecycle.onExit ?? "unknown",
      module: lifecycle.module,
    },
    writes: [...(lifecycle.writes ?? [])].sort(),
  }));
}

function collectScripts(scriptSystems: readonly IGameAgentScriptSystem[], production: IGameAgentProductionSummary): IGameAgentScriptReference[] {
  const map = new Map<string, IGameAgentScriptReference>();
  for (const system of scriptSystems) {
    if (system.script !== undefined) {
      map.set(`${system.script.module}#${system.script.exportName}`, system.script);
    }
  }
  for (const script of production.scriptModules) {
    map.set(`${script.module}#${script.exportName}`, { exportName: script.exportName, module: script.module });
  }
  return [...map.values()].sort((left, right) => left.module.localeCompare(right.module) || left.exportName.localeCompare(right.exportName));
}

function collectInput(documents: readonly IAuthoringDocument[]): IGameAgentInputSummary {
  const inputDocuments = documents.filter((document) => document.kind === "input" && isInputDocument(document.data));
  return {
    actions: inputDocuments.flatMap((document) => (document.data as IInputDocument).actions?.map((action) => ({
      bindings: [...(action.bindings ?? [])].sort(),
      id: action.id,
      source: document.projectRelativePath,
    })) ?? []).sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id)),
    axes: inputDocuments.flatMap((document) => (document.data as IInputDocument).axes?.map((axis) => ({
      id: axis.id,
      negative: [...(axis.negative ?? [])].sort(),
      positive: [...(axis.positive ?? [])].sort(),
      source: document.projectRelativePath,
      ...(axis.value === undefined ? {} : { value: axis.value }),
    })) ?? []).sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id)),
    documents: inputDocuments.map((document) => document.projectRelativePath).sort(),
  };
}

function collectUi(documents: readonly IAuthoringDocument[]): IGameAgentUiSummary {
  const rows: IGameAgentUiSummary = { bindings: [], documents: [], nodes: [] };
  for (const document of documents) {
    if (document.kind === "ui" && isUiDocument(document.data)) {
      rows.documents.push(document.projectRelativePath);
      rows.nodes.push(...(document.data.nodes ?? []).map((node) => ({ id: node.id, source: document.projectRelativePath, ...(node.text === undefined ? {} : { text: node.text }), ...(node.type === undefined ? {} : { type: node.type }) })));
      rows.bindings.push(...(document.data.bindings ?? []).map((binding) => ({ node: binding.node, resource: binding.resource, source: document.projectRelativePath })));
    }
    if (document.kind === "scene" && isSceneDocument(document.data) && document.data.ui !== undefined) {
      rows.nodes.push(...(document.data.ui.nodes ?? []).map((node) => ({ id: node.id, source: document.projectRelativePath, ...(node.text === undefined ? {} : { text: node.text }), ...(node.type === undefined ? {} : { type: node.type }) })));
      rows.bindings.push(...(document.data.ui.bindings ?? []).map((binding) => ({ node: binding.node, resource: binding.resource, source: document.projectRelativePath })));
    }
  }
  rows.documents.sort();
  rows.nodes.sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id));
  rows.bindings.sort((left, right) => left.source.localeCompare(right.source) || left.node.localeCompare(right.node));
  return rows;
}

function collectAssets(documents: readonly IAuthoringDocument[]): IGameAgentAssetSummary {
  const assetDocuments = documents.filter((document) => document.kind === "asset" && isAssetDocument(document.data));
  return {
    assets: assetDocuments.flatMap((document) => (document.data as IAssetDocument).assets?.map((asset) => ({
      id: asset.id,
      ...(asset.path === undefined ? {} : { path: asset.path }),
      source: document.projectRelativePath,
      ...(asset.type === undefined ? {} : { type: asset.type }),
    })) ?? []).sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id)),
    documents: assetDocuments.map((document) => document.projectRelativePath).sort(),
  };
}

function collectMaterials(documents: readonly IAuthoringDocument[]): IGameAgentMaterialSummary {
  const materialDocuments = documents.filter((document) => document.kind === "material" && isMaterialDocument(document.data));
  return {
    documents: materialDocuments.map((document) => document.projectRelativePath).sort(),
    materials: materialDocuments.flatMap((document) => (document.data as IMaterialDocument).materials?.map((material) => ({
      ...(material.color === undefined ? {} : { color: material.color }),
      id: material.id,
      source: document.projectRelativePath,
    })) ?? []).sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id)),
  };
}

function collectHighValueSurfaces(production: IGameAgentProductionSummary, documents: readonly IAuthoringDocument[]): IGameAgentHighValueSurface[] {
  const surfaces = new Map<string, IGameAgentHighValueSurface>();
  const productionAssetPlan = productionAssetPlanObject(production);
  for (const surface of requiredSurfaces) {
    const summary = readStringField(productionAssetPlan, surface);
    surfaces.set(surface, {
      id: surface,
      source: "production.assetPlan",
      status: summary === undefined ? "missing" : "declared",
      ...(summary === undefined ? {} : { summary }),
    });
  }
  for (const document of documents) {
    if (document.kind !== "asset" || !isAssetDocument(document.data)) {
      continue;
    }
    for (const asset of document.data.assets ?? []) {
      if (!surfaces.has(asset.id) && requiredSurfaces.includes(asset.id)) {
        surfaces.set(asset.id, {
          id: asset.id,
          source: "source",
          sourcePath: document.projectRelativePath,
          status: "declared",
          summary: asset.path ?? asset.type,
        });
      }
    }
  }
  return [...surfaces.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function readProduction(config: unknown): IGameAgentProductionSummary {
  const production = isRecord(config) && isRecord(config.production) ? config.production : {};
  const assetPlan = isRecord(production.assetPlan)
    ? Object.fromEntries(Object.entries(production.assetPlan).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""))
    : undefined;
  const scriptModules = Array.isArray(production.scriptModules)
    ? production.scriptModules.filter(isRecord).map((entry) => ({
        exportName: readStringField(entry, "export") ?? readStringField(entry, "exportName") ?? "unknown",
        module: readStringField(entry, "module") ?? "unknown",
        ownsState: readStringArray(entry.ownsState),
        referencedBy: readStringArray(entry.referencedBy),
      }))
    : [];
  return {
    ...(assetPlan === undefined ? {} : { assetPlan }),
    controls: readStringArray(production.controls),
    failRetry: readStringField(production, "failRetry"),
    feedbackMoments: readStringArray(production.feedbackMoments),
    objective: readStringField(production, "objective"),
    playableLoop: readStringField(production, "playableLoop"),
    progression: readStringField(production, "progression"),
    proofCommands: readStringArray(production.proofCommands),
    scriptModules,
  };
}

function productionAssetPlanObject(production: IGameAgentProductionSummary): unknown {
  return production.assetPlan;
}

function collectProofCommands(production: IGameAgentProductionSummary, packageJson: unknown): string[] {
  const commands = new Set(production.proofCommands);
  const scripts = isRecord(packageJson) && isRecord(packageJson.scripts) ? packageJson.scripts : {};
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command === "string" && (name === "playtest" || name === "verify" || name.startsWith("game:"))) {
      commands.add(`pnpm run ${name}`);
    }
  }
  return [...commands].sort();
}

function classifyGameAgentProject(project: IAuthoringProject, config: unknown, packageJson: unknown): GameAgentProjectKind {
  const name = readStringField(packageJson, "name") ?? basename(project.projectPath);
  const families = new Set(project.documents.map((document) => document.kind));
  const template = readStringField(config, "template");
  if (name.includes("physics-") || template === "physics-lab") {
    return "physics-lab";
  }
  if (name.includes("racing-kit") || template === "racing-kit-rally-starter") {
    return "asset-kit";
  }
  if (families.has("environment") && !families.has("input") && !families.has("systems")) {
    return "environment-component";
  }
  if (families.has("scene") && (families.has("systems") || families.has("input") || readProduction(config).playableLoop !== undefined)) {
    return "generated-game";
  }
  return "unknown";
}

function diagnosticsForProject(
  projectKind: GameAgentProjectKind,
  sourceFamilies: readonly IGameAgentSourceFamily[],
  primaryScene: IGameAgentSceneSummary | undefined,
  scripts: readonly IGameAgentScriptReference[],
  proofCommands: readonly string[],
  surfaces: readonly IGameAgentHighValueSurface[],
): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  const familyCounts = new Map(sourceFamilies.map((family) => [family.kind, family.count]));
  if (primaryScene === undefined && projectKind !== "physics-lab") {
    diagnostics.push(warning("TN_GAME_AGENT_PRIMARY_SCENE_MISSING", "Game agent inventory could not identify a primary scene source document.", "content/scenes", "Create or point threenative.config.json entry at a structured scene document."));
  }
  if (projectKind === "generated-game") {
    for (const family of requiredGeneratedGameFamilies) {
      if ((familyCounts.get(family) ?? 0) === 0) {
        diagnostics.push(warning("TN_GAME_AGENT_SOURCE_FAMILY_MISSING", `Generated game is missing content source family '${family}'.`, `content/${family}`, "Add the source document or record why this maintained example is not a generated game."));
      }
    }
    if (scripts.length === 0) {
      diagnostics.push(warning("TN_GAME_AGENT_SCRIPT_OWNER_MISSING", "Generated game inventory could not find a script module/export owner.", "content/systems", "Declare script.module and script.export in content/systems or production.scriptModules."));
    }
    if (proofCommands.length === 0) {
      diagnostics.push(warning("TN_GAME_AGENT_PROOF_COMMANDS_MISSING", "Generated game inventory could not find production proof commands.", "threenative.config.json#/production/proofCommands", "Add proof commands or package game:* scripts."));
    }
    for (const surface of surfaces.filter((surface) => surface.status === "missing")) {
      diagnostics.push(warning("TN_GAME_AGENT_HIGH_VALUE_SURFACE_MISSING", `Generated game production metadata is missing high-value surface '${surface.id}'.`, "threenative.config.json#/production/assetPlan", "Declare player/world/reward/UI/audio surface intent in production metadata."));
    }
  }
  if (projectKind === "physics-lab" && primaryScene === undefined) {
    diagnostics.push(warning("TN_GAME_AGENT_PHYSICS_LAB_CONTENT_OPTIONAL", "Physics lab has no structured content tree; game-only source ownership gaps are informational.", "content", "Keep physics fixtures documented in manifests or add structured source when the lab becomes a playable generated game."));
  }
  return diagnostics;
}

function recommendedOperations(
  projectKind: GameAgentProjectKind,
  sourceFamilies: readonly IGameAgentSourceFamily[],
  primaryScene: IGameAgentSceneSummary | undefined,
  scripts: readonly IGameAgentScriptReference[],
  proofCommands: readonly string[],
  surfaces: readonly IGameAgentHighValueSurface[],
): string[] {
  const familyCounts = new Map(sourceFamilies.map((family) => [family.kind, family.count]));
  const operations: string[] = [];
  if (primaryScene === undefined && projectKind !== "physics-lab") {
    operations.push("tn scene create --id arena --json");
  }
  if ((familyCounts.get("input") ?? 0) === 0 && projectKind === "generated-game") {
    operations.push("tn input ... --json");
  }
  if (scripts.length === 0 && projectKind === "generated-game") {
    operations.push("tn scene system attach --module src/scripts/player.ts --export updatePlayer --json");
  }
  if (surfaces.some((surface) => surface.status === "missing") && projectKind === "generated-game") {
    operations.push("Update threenative.config.json production.assetPlan with high-value surface owners.");
  }
  if (proofCommands.length === 0 && projectKind !== "unknown") {
    operations.push("Add production.proofCommands or package game:* scripts.");
  }
  if (operations.length === 0) {
    operations.push("Run tn game plan --goal <game idea> --project . --json for the next bounded slice.");
  }
  return operations;
}

async function readOptionalJson(path: string, projectRelativePath: string): Promise<{ data?: unknown; diagnostics: IAuthoringDiagnostic[] }> {
  try {
    return { data: JSON.parse(await readFile(path, "utf8")) as unknown, diagnostics: [] };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return { diagnostics: [] };
    }
    return {
      diagnostics: [
        authoringDiagnostic({
          code: "TN_GAME_AGENT_METADATA_READ_FAILED",
          file: projectRelativePath,
          message: `Could not read game agent metadata from '${projectRelativePath}'.`,
          severity: "warning",
          value: error instanceof Error ? error.message : String(error),
          suggestion: "Ensure the file contains valid JSON.",
        }),
      ],
    };
  }
}

function countPrefabDocuments(documents: readonly IAuthoringDocument[]): number {
  return documents.reduce((count, document) => count + (document.kind === "prefab" && isPrefabDocument(document.data) ? document.data.entities?.length ?? 0 : 0), 0);
}

function readDocumentId(data: unknown): string | undefined {
  return readStringField(data, "id");
}

function readStringField(value: unknown, key: string): string | undefined {
  return isRecord(value) && typeof value[key] === "string" && value[key].trim() !== "" ? value[key] : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "").sort() : [];
}

function warning(code: string, message: string, path: string, suggestion: string): IAuthoringDiagnostic {
  return authoringDiagnostic({ code, message, path, severity: "warning", suggestion });
}

function isSceneDocument(data: unknown): data is ISceneDocument {
  return isRecord(data) && data.schema === "threenative.scene" && typeof data.id === "string";
}

function isSystemsDocument(data: unknown): data is ISystemsDocument {
  return isRecord(data) && data.schema === "threenative.systems" && typeof data.id === "string";
}

function isInputDocument(data: unknown): data is IInputDocument {
  return isRecord(data) && data.schema === "threenative.input" && typeof data.id === "string";
}

function isUiDocument(data: unknown): data is IUiDocument {
  return isRecord(data) && data.schema === "threenative.ui" && typeof data.id === "string";
}

function isAssetDocument(data: unknown): data is IAssetDocument {
  return isRecord(data) && data.schema === "threenative.assets" && typeof data.id === "string";
}

function isMaterialDocument(data: unknown): data is IMaterialDocument {
  return isRecord(data) && data.schema === "threenative.materials" && typeof data.id === "string";
}

function isPrefabDocument(data: unknown): data is IPrefabDocument {
  return isRecord(data) && data.schema === "threenative.prefab" && typeof data.id === "string";
}
