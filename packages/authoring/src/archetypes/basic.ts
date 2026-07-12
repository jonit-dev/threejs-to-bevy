import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { writeAuthoringJsonDocument, type IAuthoringDocument } from "../documents.js";
import { authoringOperationResult } from "../operations/shared.js";
import { loadAuthoringProject } from "../project.js";
import { isRecord, sceneDocumentSchema, schemaDocumentSchema, type ISceneDocument, type ISceneEntity, type IScenePrefab, type ISceneSystem } from "../schemas.js";
import type { IAuthoringOperationResult } from "../operations.js";
import type { ActorArchetypeId } from "../archetypes.js";

export interface IApplyBasicActorArchetypeOptions {
  actorId: string;
  archetype: Exclude<ActorArchetypeId, "character">;
  asset?: string;
  projectPath: string;
  sceneId?: string;
  shared?: boolean;
  speed?: number;
}

export async function applyBasicActorArchetype(options: IApplyBasicActorArchetypeOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const sceneDocument = selectSceneDocument(project.documents, options.sceneId);
  const scene = sceneDocument?.data as ISceneDocument | undefined ?? defaultScene(options.sceneId ?? "main");
  const sceneProjectRelativePath = sceneDocument?.projectRelativePath ?? `content/scenes/${scene.id}.scene.json`;
  const sceneAbsolutePath = sceneDocument?.file ?? resolve(projectPath, sceneProjectRelativePath);
  const filesWritten = new Set<string>([sceneProjectRelativePath]);

  applySceneMutation(scene, options);
  const uiDocument = options.archetype === "pickup" ? project.documents.find((document) => document.kind === "ui") : undefined;
  if (uiDocument !== undefined && isRecord(uiDocument.data)) {
    migratePickupUi(scene, uiDocument.data);
    await writeJson(uiDocument.projectRelativePath, uiDocument.file, "ui", uiDocument.data);
    filesWritten.add(uiDocument.projectRelativePath);
  }
  await writeJson(sceneProjectRelativePath, sceneAbsolutePath, "scene", scene);

  if (options.archetype === "vehicle" || options.archetype === "pickup" || options.archetype === "camera-boom") {
    const sharedPickup = options.archetype === "pickup" && options.shared === true;
    const scriptPath = sharedPickup ? "src/scripts/pickups.ts" : `src/scripts/${options.actorId}.${scriptSuffix(options.archetype)}.ts`;
    const systemsPath = sharedPickup ? "content/systems/pickups.systems.json" : `content/systems/${options.actorId}.${scriptSuffix(options.archetype)}.systems.json`;
    const cameraStateId = `tn.cameraRig.${options.archetype === "vehicle" ? `${options.actorId}.camera` : options.actorId}`;
    const systemId = sharedPickup ? "pickups.shared" : `${options.actorId}.${scriptSuffix(options.archetype)}`;
    const systems = sharedPickup
      ? await readSharedSystems(resolve(projectPath, systemsPath), systemId, scriptPath)
      : {
          id: systemId,
          schema: "threenative.systems",
          systems: [{ id: systemId, script: { export: `update${pascalCase(options.actorId)}${pascalCase(options.archetype)}`, module: scriptPath } } satisfies ISceneSystem],
          version: "0.1.0",
        };
    await writeJson(systemsPath, resolve(projectPath, systemsPath), "systems", systems);
    await writeScript(resolve(projectPath, scriptPath), behaviorScript(options, sharedPickup));
    filesWritten.add(systemsPath);
    filesWritten.add(scriptPath);
    if (options.archetype !== "pickup") {
      const schemaPath = `content/schemas/${options.actorId}.${scriptSuffix(options.archetype)}.schema.json`;
      await writeJson(schemaPath, resolve(projectPath, schemaPath), "schema", {
        id: `${options.actorId}.${scriptSuffix(options.archetype)}-resources`,
        kind: "resource",
        schema: schemaDocumentSchema,
        schemas: [{
          fields: {
            followX: { kind: "number" },
            followY: { kind: "number" },
            followZ: { kind: "number" },
            yaw: { kind: "number" },
          },
          id: cameraStateId,
        }],
        version: "0.1.0",
      });
      filesWritten.add(schemaPath);
    }
  }

  return authoringOperationResult({ changed: true, diagnostics: project.diagnostics, filesWritten: [...filesWritten], projectPath });
}

function applySceneMutation(scene: ISceneDocument, options: IApplyBasicActorArchetypeOptions): void {
  scene.schema = sceneDocumentSchema;
  scene.version ??= "0.1.0";
  scene.entities ??= [];
  scene.prefabs ??= [];
  scene.resources ??= [];
  const existingCamera = scene.entities.find((entity) => entity.components?.camera !== undefined || entity.components?.Camera !== undefined);
  if (existingCamera !== undefined && (options.archetype === "camera-boom" || options.archetype === "vehicle")) {
    upsertById(scene.resources, { id: "ActiveCamera", value: { entity: existingCamera.id } });
  }
  const prefabId = `${options.actorId}.model`;
  upsertById<IScenePrefab>(scene.prefabs, {
    ...(options.asset === undefined ? { color: "#ffd166", primitive: "sphere" } : { asset: options.asset }),
    id: prefabId,
  });

  if (options.archetype === "vehicle") {
    upsertById(scene.resources, { id: `tn.cameraRig.${options.actorId}.camera`, value: { followX: 0, followY: 0, followZ: 0, yaw: 0 } });
    upsertById<ISceneEntity>(scene.entities, {
      archetype: provenance(options, { speed: options.speed ?? 12 }),
      prefab: prefabId,
      components: {
        Collider: { kind: "box", size: [1.8, 0.8, 3.2] },
        RigidBody: { damping: 0.4, kind: "dynamic", mass: 850 },
      },
      id: options.actorId,
      transform: { position: [0, 0.6, 0] },
    });
    upsertById<ISceneEntity>(scene.entities, {
      components: { camera: { far: 1200, fovY: 65, mode: "third-person-follow", near: 0.1, target: options.actorId } },
      id: `${options.actorId}.camera`,
      transform: { position: [0, 4, -8] },
    });
    return;
  }

  if (options.archetype === "pickup") {
    upsertById<ISceneEntity>(scene.entities, {
      archetype: provenance(options, { resource: "PickupState.collected" }),
      prefab: prefabId,
      components: {
        Collider: { kind: "sphere", radius: 0.55, trigger: true },
        KinematicMover: { axis: "y", mode: "sine", radius: 0.18, speed: 1.4 },
        RigidBody: { kind: "static" },
      },
      id: options.actorId,
      transform: { position: [0, 0.8, 0] },
    });
    upsertById(scene.resources, { id: "PickupState", value: { collected: 0 } });
    scene.ui ??= { bindings: [], nodes: [] };
    scene.ui.nodes ??= [];
    scene.ui.bindings ??= [];
    upsertById(scene.ui.nodes, { id: "hud.pickups", text: "Pickups 0", type: "text" });
    upsertUiBinding(scene.ui.bindings, { fields: ["collected"], node: "hud.pickups", resource: "PickupState" });
    return;
  }

  if (options.archetype === "camera-boom") {
    upsertById(scene.resources, { id: `tn.cameraRig.${options.actorId}`, value: { followX: 0, followY: 0, followZ: 0, yaw: 0 } });
    upsertById<ISceneEntity>(scene.entities, {
      archetype: provenance({ ...options, archetype: "prop-static" }, { role: "camera-target" }),
      id: `${options.actorId}.target`,
      transform: { position: [0, 1.5, 0] },
    });
    upsertById<ISceneEntity>(scene.entities, {
      archetype: provenance(options, { fovY: 60, length: 6, target: `${options.actorId}.target` }),
      components: { camera: { far: 1000, fovY: 60, mode: "third-person-follow", near: 0.1, target: `${options.actorId}.target` } },
      id: options.actorId,
      transform: { position: [0, 3.2, -6] },
    });
    return;
  }

  upsertById<ISceneEntity>(scene.entities, {
    archetype: provenance(options, {}),
    ...(options.asset === undefined ? {} : { prefab: prefabId }),
    components: {
      Collider: { kind: "box", size: [1, 1, 1] },
      RigidBody: { kind: "static" },
    },
    id: options.actorId,
    transform: { position: [0, 0.5, 0] },
  });
}

function behaviorScript(options: IApplyBasicActorArchetypeOptions, sharedPickup = false): string {
  const exportName = sharedPickup ? "updatePickups" : `update${pascalCase(options.actorId)}${pascalCase(options.archetype)}`;
  const cameraId = options.archetype === "vehicle" ? `${options.actorId}.camera` : options.actorId;
  const body = options.archetype === "camera-boom" || options.archetype === "vehicle"
    ? `    CameraRig.thirdPerson(context, { cameraId: ${JSON.stringify(cameraId)}, target: ${JSON.stringify(options.archetype === "vehicle" ? options.actorId : `${options.actorId}.target`)} });`
    : options.archetype === "pickup"
      ? "    const state = context.resources.get(\"PickupState\", { collected: 0 });\n    if (context.input.action(\"pickup\")) {\n      context.resources.patch(\"PickupState\", { collected: state.collected + 1 });\n    }"
      : "    context.time.fixedDelta;";
  const imports = options.archetype === "pickup" ? "defineBehavior" : "CameraRig, defineBehavior";
  return `import { ${imports} } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const ${exportName} = defineBehavior(
  ${options.archetype === "camera-boom" || options.archetype === "vehicle" ? `{ resourceReads: [${JSON.stringify(`tn.cameraRig.${cameraId}`)}], resourceWrites: [${JSON.stringify(`tn.cameraRig.${cameraId}`)}] }` : "{}"},
  (context: ProjectContext) => {
${body}
  },
);
`;
}

function migratePickupUi(scene: ISceneDocument, ui: Record<string, unknown>): void {
  const nodes = Array.isArray(ui.nodes) ? ui.nodes.filter((node): node is { id: string; text?: string; type?: string } => isRecord(node) && typeof node.id === "string") : [];
  const bindings = Array.isArray(ui.bindings) ? ui.bindings.filter((binding): binding is { fields?: string[]; node: string; resource: string } => isRecord(binding) && typeof binding.node === "string" && typeof binding.resource === "string") : [];
  upsertById(nodes, { id: "hud.pickups", text: "Pickups 0", type: "text" });
  upsertUiBinding(bindings, { fields: ["collected"], node: "hud.pickups", resource: "PickupState" });
  ui.nodes = nodes;
  ui.bindings = bindings;
  if (scene.ui !== undefined) {
    scene.ui.nodes = (scene.ui.nodes ?? []).filter((node) => node.id !== "hud.pickups");
    scene.ui.bindings = (scene.ui.bindings ?? []).filter((binding) => binding.node !== "hud.pickups");
  }
}

async function readSharedSystems(file: string, systemId: string, scriptPath: string): Promise<{ id: string; schema: string; systems: ISceneSystem[]; version: string }> {
  let source: { id?: string; schema?: string; systems?: ISceneSystem[]; version?: string } = {};
  try {
    source = JSON.parse(await readFile(file, "utf8")) as typeof source;
  } catch {
    // The first shared actor creates the registry.
  }
  const systems = source.systems ?? [];
  if (!systems.some((system) => system.id === systemId)) {
    systems.push({ id: systemId, script: { export: "updatePickups", module: scriptPath } });
  }
  return { id: source.id ?? "pickups", schema: source.schema ?? "threenative.systems", systems, version: source.version ?? "0.1.0" };
}

function provenance(options: IApplyBasicActorArchetypeOptions, params: Record<string, unknown>) {
  return {
    id: options.archetype,
    params: {
      ...(options.asset === undefined ? {} : { asset: options.asset }),
      ...params,
    },
    version: 1,
  };
}

async function writeJson(projectRelativePath: string, file: string, kind: IAuthoringDocument["kind"], data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeAuthoringJsonDocument({ data, file, kind, projectRelativePath });
}

async function writeScript(file: string, source: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
}

function selectSceneDocument(documents: readonly IAuthoringDocument[], sceneId: string | undefined): IAuthoringDocument | undefined {
  const scenes = documents.filter((document) => document.kind === "scene" && isSceneDocument(document.data));
  if (sceneId !== undefined) {
    return scenes.find((document) => (document.data as ISceneDocument).id === sceneId);
  }
  return scenes.find((document) => (document.data as ISceneDocument).initial === true) ?? scenes[0];
}

function defaultScene(sceneId: string): ISceneDocument {
  return {
    entities: [],
    id: sceneId,
    prefabs: [],
    resources: [],
    schema: sceneDocumentSchema,
    version: "0.1.0",
  };
}

function isSceneDocument(data: unknown): data is ISceneDocument {
  return typeof data === "object" && data !== null && (data as ISceneDocument).schema === sceneDocumentSchema;
}

function upsertById<T extends { id: string }>(items: T[], next: T): void {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) {
    items.push(next);
  } else {
    items[index] = next;
  }
  items.sort((left, right) => left.id.localeCompare(right.id));
}

function upsertUiBinding(items: Array<{ node: string }>, next: { fields?: string[]; node: string; resource: string }): void {
  const index = items.findIndex((item) => item.node === next.node);
  if (index === -1) {
    items.push(next);
  } else {
    items[index] = next;
  }
  items.sort((left, right) => left.node.localeCompare(right.node));
}

function scriptSuffix(archetype: string): string {
  return archetype.replace(/-/gu, "");
}

function pascalCase(value: string): string {
  const candidate = value
    .split(/[^A-Za-z0-9]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return candidate.length === 0 ? "Actor" : candidate;
}
