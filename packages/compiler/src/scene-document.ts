import { readFile } from "node:fs/promises";
import { loadAuthoringProject, validateScene, type ISceneDocument, type IScenePrefab, type ISceneTransform } from "@threenative/authoring";
import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PrefabTransform,
  Scene,
  SphereGeometry,
  defineGame,
  defineComponent,
  defineQuery,
  defineResource,
  defineResourceModule,
  defineScene,
  defineWorldModule,
  fixedUpdate,
  modelAsset,
  type IEcsDeclaration,
} from "@threenative/sdk";

import { CompilerError } from "./errors.js";
import type { ICapturedScene } from "./capture.js";
import type { IEnvironmentDeclaration } from "./emit/environment.js";
import type { IAuthoringDeclarationNode, IAuthoringGraph } from "./authoring/graph.js";
import { compatibilityProvenance, relativeModulePath } from "./authoring/provenance.js";

type SceneRecord = Record<string, unknown>;
type VisualTransform = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
};
type WorldTransform = {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
};

export async function captureSceneDocumentEntry(projectPath: string, entryPath: string): Promise<ICapturedScene> {
  const entryRelativePath = relativeModulePath(projectPath, entryPath);
  const validation = await validateScene({ projectPath });
  const validationError = validation.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (validationError !== undefined) {
    throw new CompilerError(validationError.code, validationError.message, {
      code: validationError.code,
      file: validationError.file,
      message: validationError.message,
      path: validationError.path ?? "",
      severity: "error",
      suggestion: validationError.suggestion,
    });
  }

  const scene = JSON.parse(await readFile(entryPath, "utf8")) as ISceneDocument;
  const environment = await readStructuredEnvironmentDeclaration(projectPath);
  const root = lowerSceneDocument(entryRelativePath, scene, environment);
  return {
    diagnostics: [],
    graph: sceneAuthoringGraph(projectPath, entryPath, scene),
    root,
    summary: { rootType: "World" },
  };
}

function lowerSceneDocument(sourcePath: string, scene: ISceneDocument, environment: IEnvironmentDeclaration | undefined): unknown {
  const visualScene = new Scene({ id: scene.id });
  const prefabs = new Map((scene.prefabs ?? []).map((prefab) => [prefab.id, prefab]));
  const entities = [...(scene.entities ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  const worldEntities = [];
  const worldResources = [...(scene.resources ?? [])]
    .filter((resource) => resource.value !== undefined)
    .map((resource) => defineResourceModule({
      id: resource.id,
      resource: genericEcsDeclaration("resource", resource.id, readRecord(resource.value) ?? { value: resource.value }),
      source: { sourcePath },
    }));

  for (const entity of entities) {
    const transform = normalizeTransform(entity.transform);
    const prefabTransform = toWorldTransform(transform);
    const componentRecord = readRecord(entity.components);
    const camera = componentRecord?.camera;
    if (readRecord(camera) !== undefined) {
      const cameraObject = cameraObjectFromEntity(entity.id, camera, transform);
      visualScene.add(cameraObject);
      visualScene.setActiveCamera(cameraObject);
    } else {
      const authoredRuntimeVisual = hasAuthoredRuntimeVisual(componentRecord);
      if (entity.prefab !== undefined || !authoredRuntimeVisual) {
        const mesh = meshFromEntity(entity.id, prefabs.get(entity.prefab ?? ""), transform);
        visualScene.add(mesh);
      }

      worldEntities.push({
        components: [
          ...(entity.transform === undefined ? [] : [PrefabTransform(prefabTransform)]),
          ...genericComponents(entity.components),
        ],
        id: entity.id,
        source: { sourcePath },
        ...(entity.transform === undefined ? {} : { transform: prefabTransform }),
      });
    }
  }

  const world = defineWorldModule({ entities: worldEntities, resources: worldResources });
  for (const system of [...(scene.systems ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    if (system.script === undefined) {
      continue;
    }
    world.addSystem(
      fixedUpdate(system.id, {
        queries: [defineQuery({ with: [PrefabTransform] })],
        reads: [PrefabTransform],
        script: {
          export: system.script.export,
          module: system.script.module,
        },
        writes: [PrefabTransform],
      }),
    );
  }

  const hasAuthoredLights = entities.some((entity) => readRecord(entity.components)?.Light !== undefined);
  if (!hasAuthoredLights) {
    const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2.2 });
    keyLight.position.set(3, 5, 4);
    visualScene.add(keyLight);
    visualScene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.65 }));
  }

  return defineGame({
    ...(environment === undefined ? {} : { environment }),
    initialScene: scene.id,
    scenes: [
      defineScene({
        id: scene.id,
        kind: "level",
        visual: visualScene,
        world,
      }),
    ],
  });
}

async function readStructuredEnvironmentDeclaration(projectPath: string): Promise<IEnvironmentDeclaration | undefined> {
  const project = await loadAuthoringProject({ projectPath });
  const document = project.documents.find((item) => item.kind === "environment" && readRecord(item.data) !== undefined);
  const data = readRecord(document?.data);
  if (data === undefined) {
    return undefined;
  }

  const declaration = {
    assetNames: [],
    instances: readRecordArray(data.instances),
    path: readRecord(data.path) ?? { id: "path.editor", points: [], width: 1 },
    sourceDir: ".",
    ...(readRecord(data.atmosphere) === undefined ? {} : { atmosphere: readRecord(data.atmosphere) }),
    ...(readRecordArray(data.bookmarks).length === 0 ? {} : { bookmarks: readRecordArray(data.bookmarks) }),
    ...(readRecord(data.controller) === undefined ? {} : { controller: readRecord(data.controller) }),
    ...(readAssetBackedRecord(data.environmentMap) === undefined ? {} : { environmentMap: readAssetBackedRecord(data.environmentMap) }),
    ...(readRecordArray(data.exclusionZones).length === 0 ? {} : { exclusionZones: readRecordArray(data.exclusionZones) }),
    ...(readRecordArray(data.lightProbes).length === 0 ? {} : { lightProbes: readRecordArray(data.lightProbes) }),
    ...(readRecordArray(data.scatter).length === 0 ? {} : { scatter: readRecordArray(data.scatter) }),
    ...(readAssetBackedRecord(data.skybox) === undefined ? {} : { skybox: readAssetBackedRecord(data.skybox) }),
    ...(readRecord(data.terrain) === undefined ? {} : { terrain: readRecord(data.terrain) }),
    ...(readRecord(data.walkability) === undefined ? {} : { walkability: readRecord(data.walkability) }),
  };
  return declaration as unknown as IEnvironmentDeclaration;
}

function hasAuthoredRuntimeVisual(components: Record<string, unknown> | undefined): boolean {
  return components !== undefined && (components.MeshRenderer !== undefined || components.Camera !== undefined || components.Light !== undefined);
}

function genericComponents(components: unknown): IEcsDeclaration[] {
  const record = readRecord(components);
  if (record === undefined) {
    return [];
  }
  return Object.entries(record)
    .filter(([kind]) => kind !== "camera")
    .map(([kind, value]) => genericEcsDeclaration("component", kind, readRecord(value) ?? {}));
}

function genericEcsDeclaration(kind: "component" | "resource", name: string, data: Record<string, unknown>): IEcsDeclaration {
  const entries = Object.entries(data).map(([field, value]) => {
    const fieldKind = inferSchemaFieldKind(value);
    return [field, fieldKind, normalizeSchemaFieldValue(value, fieldKind)] as const;
  });
  const fields = Object.fromEntries(entries.map(([field, fieldKind]) => [field, fieldKind]));
  const normalizedData = Object.fromEntries(entries.map(([field, , value]) => [field, value]));
  const factory = kind === "component" ? defineComponent(name, fields) : defineResource(name, fields);
  return factory(normalizedData);
}

function normalizeSchemaFieldValue(value: unknown, fieldKind: ReturnType<typeof inferSchemaFieldKind>): unknown {
  if (fieldKind === "string" && typeof value !== "string") {
    return JSON.stringify(value);
  }
  return value;
}

function inferSchemaFieldKind(value: unknown): "boolean" | "number" | "string" | "vec2" | "vec3" | "vec4" {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "number" : "number";
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))) {
    if (value.length === 2) {
      return "vec2";
    }
    if (value.length === 3) {
      return "vec3";
    }
    if (value.length === 4) {
      return "vec4";
    }
  }
  return "string";
}

function normalizeTransform(transform: ISceneTransform | undefined): VisualTransform {
  return {
    ...(vector3(readRecord(transform)?.position) === undefined ? {} : { position: vector3(readRecord(transform)?.position) }),
    ...(vector3(readRecord(transform)?.rotation) === undefined ? {} : { rotation: vector3(readRecord(transform)?.rotation) }),
    ...(vector3(readRecord(transform)?.scale) === undefined ? {} : { scale: vector3(readRecord(transform)?.scale) }),
  };
}

function toWorldTransform(transform: VisualTransform): WorldTransform {
  return {
    ...(transform.position === undefined ? {} : { position: transform.position }),
    ...(transform.rotation === undefined ? {} : { rotation: eulerXyzToQuaternion(transform.rotation) }),
    ...(transform.scale === undefined ? {} : { scale: transform.scale }),
  };
}

function meshFromEntity(entityId: string, prefab: IScenePrefab | undefined, transform: ReturnType<typeof normalizeTransform>): Mesh {
  const primitive = prefab?.primitive ?? "box";
  const mesh = new Mesh({
    ...(prefab?.asset === undefined ? {} : { assetRefs: [modelAsset(`scene.prefab.${prefab.id}`, prefab.asset)] }),
    geometry: geometryForPrimitive(primitive),
    id: entityId,
    material: new MeshStandardMaterial({ color: prefab?.color ?? "#2f80ed", roughness: 0.55 }),
  });
  applyTransform(mesh, transform);
  return mesh;
}

function geometryForPrimitive(primitive: string): BoxGeometry | CapsuleGeometry | ConeGeometry | CylinderGeometry | PlaneGeometry | SphereGeometry {
  if (primitive === "capsule") {
    return new CapsuleGeometry({ height: 1, radius: 0.35 });
  }
  if (primitive === "cone") {
    return new ConeGeometry({ height: 1, radius: 0.5 });
  }
  if (primitive === "cylinder") {
    return new CylinderGeometry({ height: 1, radius: 0.5 });
  }
  if (primitive === "plane") {
    return new PlaneGeometry({ size: [1, 1] });
  }
  if (primitive === "sphere") {
    return new SphereGeometry({ radius: 0.5 });
  }
  return new BoxGeometry({ size: [1, 1, 1] });
}

function cameraObjectFromEntity(entityId: string, camera: unknown, transform: ReturnType<typeof normalizeTransform>): PerspectiveCamera | OrthographicCamera {
  const cameraRecord = readRecord(camera);
  const mode = typeof cameraRecord?.mode === "string" ? cameraRecord.mode : "perspective";
  const target = typeof cameraRecord?.target === "string" ? cameraRecord.target : undefined;
  const cameraObject = mode === "orthographic"
    ? new OrthographicCamera({ far: 100, id: entityId, near: 0.1, size: 5 })
    : new PerspectiveCamera({
        far: 100,
        fovY: 52,
        ...(mode === "third-person-follow" && target !== undefined ? { follow: { offset: [0, 2.4, 5.5], smoothing: 0.2, target } } : {}),
        id: entityId,
        near: 0.1,
      });
  applyTransform(cameraObject, defaultCameraTransform(transform));
  return cameraObject;
}

function defaultCameraTransform(transform: ReturnType<typeof normalizeTransform>): ReturnType<typeof normalizeTransform> {
  return {
    position: transform.position ?? [0, 3.2, 5.8],
    rotation: transform.rotation ?? [-0.48, 0, 0],
    scale: transform.scale,
  };
}

function applyTransform(object: { position: { set(x: number, y: number, z: number): void }; rotation: { set(x: number, y: number, z: number): void }; scale: { set(x: number, y: number, z: number): void } }, transform: ReturnType<typeof normalizeTransform>): void {
  if (transform.position !== undefined) {
    object.position.set(...transform.position);
  }
  if (transform.rotation !== undefined) {
    object.rotation.set(...transform.rotation);
  }
  if (transform.scale !== undefined) {
    object.scale.set(...transform.scale);
  }
}

function eulerXyzToQuaternion(rotation: [number, number, number]): [number, number, number, number] {
  const [x, y, z] = rotation;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

function sceneAuthoringGraph(projectRoot: string, entryPath: string, scene: ISceneDocument): IAuthoringGraph {
  const declarations: IAuthoringDeclarationNode[] = [
    declaration(projectRoot, entryPath, "scene", scene.id),
    ...(scene.prefabs ?? []).map((prefab) => declaration(projectRoot, entryPath, "prefab", prefab.id, scene.id)),
    ...(scene.entities ?? []).map((entity) => declaration(projectRoot, entryPath, "entity", entity.id, scene.id)),
    ...(scene.resources ?? []).map((resource) => declaration(projectRoot, entryPath, "resource", resource.id, scene.id)),
    ...(scene.systems ?? []).map((system) => declaration(projectRoot, entryPath, "system", system.id, scene.id)),
  ];
  return {
    declarations,
    diagnostics: [],
    entryPath: relativeModulePath(projectRoot, entryPath),
    modules: [
      {
        declarations: declarations.map((item) => `${item.kind}:${item.id}`),
        path: relativeModulePath(projectRoot, entryPath),
      },
      ...(scene.systems ?? []).flatMap((system) => system.script === undefined ? [] : [{
        declarations: [`system:${system.id}`],
        path: system.script.module,
      }]),
    ],
    projectRoot,
    schema: "threenative.authoring-graph",
    version: "0.1.0",
  };
}

function declaration(projectRoot: string, entryPath: string, kind: IAuthoringDeclarationNode["kind"], id: string, ownerScene?: string): IAuthoringDeclarationNode {
  return {
    id,
    kind,
    ...(ownerScene === undefined ? {} : { ownerScene }),
    provenance: compatibilityProvenance(projectRoot, entryPath, kind, id, ownerScene),
    references: [],
  };
}

function vector3(value: unknown): [number, number, number] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? [value[0]!, value[1]!, value[2]!]
    : undefined;
}

function readRecord(value: unknown): SceneRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as SceneRecord : undefined;
}

function readAssetBackedRecord(value: unknown): SceneRecord | undefined {
  const record = readRecord(value);
  return Array.isArray(record?.assetRefs) ? record : undefined;
}

function readRecordArray(value: unknown): SceneRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const records: SceneRecord[] = [];
  for (const item of value) {
    const record = readRecord(item);
    if (record !== undefined) {
      records.push(record);
    }
  }
  return records;
}
