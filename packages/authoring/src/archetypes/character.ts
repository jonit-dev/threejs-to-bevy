import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { writeAuthoringJsonDocument, type IAuthoringDocument } from "../documents.js";
import { authoringDiagnostic } from "../diagnostics.js";
import { authoringOperationResult } from "../operations/shared.js";
import { loadAuthoringProject } from "../project.js";
import {
  inputDocumentSchema,
  sceneDocumentSchema,
  systemsDocumentSchema,
  type IInputDocument,
  type ISceneDocument,
  type ISceneEntity,
  type IScenePrefab,
  type ISceneSystem,
  type ISystemsDocument,
} from "../schemas.js";
import { stableAuthoringJson } from "../format.js";
import type { IAuthoringOperationResult } from "../operations.js";

export interface IApplyCharacterArchetypeOptions {
  actorId: string;
  asset?: string;
  projectPath: string;
  sceneId?: string;
  speed?: number;
  sprintSpeed?: number;
}

export interface IUpdateCharacterArchetypeOptions {
  actorId: string;
  projectPath: string;
  set?: Record<string, unknown>;
}

const CHARACTER_ARCHETYPE_VERSION = 1;
const DEFAULT_WALK_SPEED = 4;
const DEFAULT_SPRINT_SPEED = 6;

export async function applyCharacterArchetype(options: IApplyCharacterArchetypeOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  const actorId = options.actorId.trim();
  if (actorId.length === 0) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_ARCHETYPE_ACTOR_ID_INVALID",
        message: "Actor archetypes require a non-empty actor id.",
        path: "/actorId",
        suggestion: "Pass --id hero or another stable ECS entity id.",
      }),
    );
  }
  const speed = finiteOr(options.speed, DEFAULT_WALK_SPEED);
  const sprintSpeed = finiteOr(options.sprintSpeed, DEFAULT_SPRINT_SPEED);
  if (speed <= 0 || sprintSpeed <= 0) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_ARCHETYPE_SPEED_INVALID",
        message: "Character archetype speeds must be positive numbers.",
        path: "/speed",
        suggestion: "Use positive values such as --speed 4 --sprint-speed 6.",
      }),
    );
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return authoringOperationResult({ diagnostics, projectPath });
  }

  const sceneDocument = selectSceneDocument(project.documents, options.sceneId);
  const scene = sceneDocument?.data as ISceneDocument | undefined ?? defaultScene(options.sceneId ?? "main");
  const sceneProjectRelativePath = sceneDocument?.projectRelativePath ?? `content/scenes/${scene.id}.scene.json`;
  const sceneAbsolutePath = sceneDocument?.file ?? resolve(projectPath, sceneProjectRelativePath);
  upsertCharacterScene(scene, { actorId, asset: options.asset, speed, sprintSpeed });

  const input = inputDocument(actorId);
  const systems = systemsDocument(actorId);
  const scriptProjectRelativePath = `src/scripts/${actorId}.behavior.ts`;
  const scriptAbsolutePath = resolve(projectPath, scriptProjectRelativePath);
  const filesWritten = [
    sceneProjectRelativePath,
    `content/input/${actorId}.input.json`,
    `content/systems/${actorId}.systems.json`,
    scriptProjectRelativePath,
  ];

  await writeJson(sceneProjectRelativePath, sceneAbsolutePath, "scene", scene);
  await writeJson(`content/input/${actorId}.input.json`, resolve(projectPath, `content/input/${actorId}.input.json`), "input", input);
  await writeJson(`content/systems/${actorId}.systems.json`, resolve(projectPath, `content/systems/${actorId}.systems.json`), "systems", systems);
  await mkdir(dirname(scriptAbsolutePath), { recursive: true });
  await writeFile(scriptAbsolutePath, characterBehaviorScript(actorId, speed, sprintSpeed), "utf8");

  return authoringOperationResult({ changed: true, diagnostics, filesWritten, projectPath });
}

export async function updateCharacterArchetype(options: IUpdateCharacterArchetypeOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  const speed = readPositiveNumber(options.set?.speed);
  const sprintSpeed = readPositiveNumber(options.set?.sprintSpeed);
  if (options.set?.speed !== undefined && speed === undefined) {
    diagnostics.push(invalidSetDiagnostic("speed"));
  }
  if (options.set?.sprintSpeed !== undefined && sprintSpeed === undefined) {
    diagnostics.push(invalidSetDiagnostic("sprintSpeed"));
  }
  const sceneDocument = project.documents.find((document) => document.kind === "scene" && sceneHasActor(document.data, options.actorId));
  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_ARCHETYPE_ACTOR_NOT_FOUND",
        message: `Actor '${options.actorId}' was not found in structured scene source.`,
        path: "/actorId",
        suggestion: "Create it first with tn actor add character --id <actor-id>.",
        value: options.actorId,
      }),
    );
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return authoringOperationResult({ diagnostics, projectPath });
  }

  const scene = sceneDocument!.data as ISceneDocument;
  const actor = scene.entities?.find((entity) => entity.id === options.actorId);
  const controller = actor?.components?.CharacterController as Record<string, unknown> | undefined;
  if (speed !== undefined && controller !== undefined) {
    controller.speed = speed;
  }
  const params = actor?.archetype?.params ?? {};
  if (speed !== undefined) {
    params.speed = speed;
  }
  if (sprintSpeed !== undefined) {
    params.sprintSpeed = sprintSpeed;
  }
  if (actor?.archetype !== undefined) {
    actor.archetype.params = params;
  }
  await writeAuthoringJsonDocument(sceneDocument!);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [sceneDocument!.projectRelativePath], projectPath });
}

function upsertCharacterScene(scene: ISceneDocument, options: { actorId: string; asset?: string; speed: number; sprintSpeed: number }): void {
  scene.schema = sceneDocumentSchema;
  scene.version ??= "0.1.0";
  scene.entities ??= [];
  scene.prefabs ??= [];
  const prefabId = `${options.actorId}.model`;
  if (options.asset !== undefined) {
    upsertById<IScenePrefab>(scene.prefabs, {
      asset: options.asset,
      id: prefabId,
    });
  }
  upsertById<ISceneEntity>(scene.entities, {
    archetype: {
      id: "character",
      params: {
        ...(options.asset === undefined ? {} : { asset: options.asset }),
        moveXAxis: "move-x",
        moveZAxis: "move-z",
        speed: options.speed,
        sprintAction: "sprint",
        sprintSpeed: options.sprintSpeed,
      },
      version: CHARACTER_ARCHETYPE_VERSION,
    },
    ...(options.asset === undefined ? {} : { prefab: prefabId }),
    components: {
      CharacterController: {
        blocking: true,
        grounding: "raycast",
        moveXAxis: "move-x",
        moveZAxis: "move-z",
        speed: options.speed,
        stepOffset: 0.35,
      },
      Collider: {
        center: [0, 0.9, 0],
        height: 1.8,
        kind: "capsule",
        radius: 0.35,
      },
      RigidBody: {
        kind: "kinematic",
        mass: 1,
      },
    },
    id: options.actorId,
    transform: { position: [0, 0, 0] },
  });
  upsertById<ISceneEntity>(scene.entities, {
    components: {
      camera: {
        far: 1000,
        fovY: 60,
        mode: "third-person-follow",
        near: 0.1,
        target: options.actorId,
      },
    },
    id: `${options.actorId}.camera`,
    transform: { position: [0, 3.2, -6] },
  });
}

function inputDocument(actorId: string): IInputDocument {
  return {
    actions: [{ bindings: ["ShiftLeft"], id: "sprint" }],
    axes: [
      { id: "move-x", negative: ["KeyA", "ArrowLeft"], positive: ["KeyD", "ArrowRight"] },
      { id: "move-z", negative: ["KeyS", "ArrowDown"], positive: ["KeyW", "ArrowUp"] },
    ],
    id: actorId,
    schema: inputDocumentSchema,
    version: "0.1.0",
  };
}

function systemsDocument(actorId: string): ISystemsDocument {
  return {
    id: actorId,
    schema: systemsDocumentSchema,
    systems: [
      {
        id: `${actorId}.character`,
        script: {
          export: `update${pascalCase(actorId)}Character`,
          module: `src/scripts/${actorId}.behavior.ts`,
        },
      } satisfies ISceneSystem,
    ],
    version: "0.1.0",
  };
}

function characterBehaviorScript(actorId: string, speed: number, sprintSpeed: number): string {
  const exportName = `update${pascalCase(actorId)}Character`;
  return `import { CameraRig, CharacterRig, defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const ${exportName} = defineBehavior(
  {},
  (context: ProjectContext) => {
    const character = CharacterRig.update(context, ${JSON.stringify(actorId)}, {
      moveXAxis: "move-x",
      moveZAxis: "move-z",
      sprintAction: "sprint",
      sprintSpeed: ${sprintSpeed},
      walkSpeed: ${speed},
    });
    CameraRig.thirdPerson(context, {
      cameraId: ${JSON.stringify(`${actorId}.camera`)},
      sprinting: character.sprinting,
      target: ${JSON.stringify(actorId)},
      yaw: character.yaw,
    });
  },
);
`;
}

async function writeJson(projectRelativePath: string, file: string, kind: IAuthoringDocument["kind"], data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeAuthoringJsonDocument({ data, file, kind, projectRelativePath });
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
    schema: sceneDocumentSchema,
    version: "0.1.0",
  };
}

function sceneHasActor(data: unknown, actorId: string): boolean {
  return isSceneDocument(data) && (data.entities ?? []).some((entity) => entity.id === actorId && entity.archetype?.id === "character");
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

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function invalidSetDiagnostic(field: string) {
  return authoringDiagnostic({
    code: "TN_ARCHETYPE_UPDATE_VALUE_INVALID",
    message: `Character archetype field '${field}' must be a positive number.`,
    path: `/set/${field}`,
    suggestion: `Use ${field}=4 or another positive numeric value.`,
  });
}

function pascalCase(value: string): string {
  const candidate = value
    .split(/[^A-Za-z0-9]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
  return candidate.length === 0 ? "Actor" : candidate;
}

export function characterArchetypePreview(options: IApplyCharacterArchetypeOptions): string {
  return stableAuthoringJson({
    actorId: options.actorId,
    archetype: "character",
    files: [
      `content/input/${options.actorId}.input.json`,
      `content/systems/${options.actorId}.systems.json`,
      `src/scripts/${options.actorId}.behavior.ts`,
    ],
  });
}
