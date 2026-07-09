import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { writeAuthoringJsonDocument, type IAuthoringDocument } from "../documents.js";
import { authoringOperationResult } from "../operations/shared.js";
import { loadAuthoringProject } from "../project.js";
import { sceneDocumentSchema, type ISceneDocument, type ISceneEntity, type IScenePrefab, type ISceneSystem } from "../schemas.js";
import type { IAuthoringOperationResult } from "../operations.js";
import type { ActorArchetypeId } from "../archetypes.js";

export interface IApplyBasicActorArchetypeOptions {
  actorId: string;
  archetype: Exclude<ActorArchetypeId, "character">;
  asset?: string;
  projectPath: string;
  sceneId?: string;
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
  await writeJson(sceneProjectRelativePath, sceneAbsolutePath, "scene", scene);

  if (options.archetype === "vehicle" || options.archetype === "pickup" || options.archetype === "camera-boom") {
    const scriptPath = `src/scripts/${options.actorId}.${scriptSuffix(options.archetype)}.ts`;
    const systemsPath = `content/systems/${options.actorId}.${scriptSuffix(options.archetype)}.systems.json`;
    await writeJson(systemsPath, resolve(projectPath, systemsPath), "systems", {
      id: `${options.actorId}.${scriptSuffix(options.archetype)}`,
      schema: "threenative.systems",
      systems: [
        {
          id: `${options.actorId}.${scriptSuffix(options.archetype)}`,
          script: {
            export: `update${pascalCase(options.actorId)}${pascalCase(options.archetype)}`,
            module: scriptPath,
          },
        } satisfies ISceneSystem,
      ],
      version: "0.1.0",
    });
    await writeScript(resolve(projectPath, scriptPath), behaviorScript(options));
    filesWritten.add(systemsPath);
    filesWritten.add(scriptPath);
  }

  return authoringOperationResult({ changed: true, diagnostics: project.diagnostics, filesWritten: [...filesWritten], projectPath });
}

function applySceneMutation(scene: ISceneDocument, options: IApplyBasicActorArchetypeOptions): void {
  scene.schema = sceneDocumentSchema;
  scene.version ??= "0.1.0";
  scene.entities ??= [];
  scene.prefabs ??= [];
  scene.resources ??= [];
  const prefabId = `${options.actorId}.model`;
  if (options.asset !== undefined) {
    upsertById<IScenePrefab>(scene.prefabs, { asset: options.asset, id: prefabId });
  }

  if (options.archetype === "vehicle") {
    upsertById<ISceneEntity>(scene.entities, {
      archetype: provenance(options, { speed: options.speed ?? 12 }),
      ...(options.asset === undefined ? {} : { prefab: prefabId }),
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
      ...(options.asset === undefined ? {} : { prefab: prefabId }),
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

function behaviorScript(options: IApplyBasicActorArchetypeOptions): string {
  const exportName = `update${pascalCase(options.actorId)}${pascalCase(options.archetype)}`;
  const body = options.archetype === "camera-boom" || options.archetype === "vehicle"
    ? `    CameraRig.thirdPerson(context, { cameraId: ${JSON.stringify(options.archetype === "vehicle" ? `${options.actorId}.camera` : options.actorId)}, target: ${JSON.stringify(options.archetype === "vehicle" ? options.actorId : `${options.actorId}.target`)} });`
    : "    // Add score, audio, and despawn commands here once pickup behavior is game-specific.";
  const imports = options.archetype === "pickup" ? "defineBehavior" : "CameraRig, defineBehavior";
  return `import { ${imports} } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const ${exportName} = defineBehavior(
  {},
  (context: ProjectContext) => {
${body}
  },
);
`;
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
