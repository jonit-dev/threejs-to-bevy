import { readFile } from "node:fs/promises";
import { validateScene, type ISceneDocument, type IScenePrefab, type ISceneTransform } from "@threenative/authoring";
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
  defineQuery,
  defineScene,
  defineWorldModule,
  fixedUpdate,
} from "@threenative/sdk";

import { CompilerError } from "./errors.js";
import type { ICapturedScene } from "./capture.js";
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
  const root = lowerSceneDocument(entryRelativePath, scene);
  return {
    diagnostics: [],
    graph: sceneAuthoringGraph(projectPath, entryPath, scene),
    root,
    summary: { rootType: "World" },
  };
}

function lowerSceneDocument(sourcePath: string, scene: ISceneDocument): unknown {
  const visualScene = new Scene({ id: scene.id });
  const prefabs = new Map((scene.prefabs ?? []).map((prefab) => [prefab.id, prefab]));
  const entities = [...(scene.entities ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  const worldEntities = [];

  for (const entity of entities) {
    const transform = normalizeTransform(entity.transform);
    const prefabTransform = toWorldTransform(transform);
    const camera = readRecord(entity.components)?.camera;
    if (readRecord(camera) !== undefined) {
      const cameraObject = cameraObjectFromEntity(entity.id, camera, transform);
      visualScene.add(cameraObject);
      visualScene.setActiveCamera(cameraObject);
    } else {
      const mesh = meshFromEntity(entity.id, prefabs.get(entity.prefab ?? ""), transform);
      visualScene.add(mesh);

      worldEntities.push({
        components: [PrefabTransform(prefabTransform)],
        id: entity.id,
        source: { sourcePath },
        transform: prefabTransform,
      });
    }
  }

  const world = defineWorldModule({ entities: worldEntities });
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

  const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2.2 });
  keyLight.position.set(3, 5, 4);
  visualScene.add(keyLight);
  visualScene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.65 }));

  return defineGame({
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
