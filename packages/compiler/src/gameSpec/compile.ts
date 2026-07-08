import {
  inputDocumentSchema,
  materialDocumentSchema,
  sceneDocumentSchema,
  type IAuthoringDocument,
  type IInputDocument,
  type IMaterialDocument,
  type ISceneDocument,
  type ISceneTransform,
} from "@threenative/authoring";
import { type IGameSpecIds, type ITypedGameSpec } from "@threenative/sdk";

export interface ICompileTypedGameSpecOptions {
  projectPath?: string;
  sourcePath?: string;
}

export function compileTypedGameSpec<TIds extends Partial<IGameSpecIds>>(spec: ITypedGameSpec<TIds>, options: ICompileTypedGameSpecOptions = {}): IAuthoringDocument[] {
  const documents: IAuthoringDocument[] = [];
  for (const [sceneIndex, scene] of spec.scenes.entries()) {
    const projectRelativePath = `content/scenes/${scene.id}.scene.json`;
    const data: ISceneDocument = {
      schema: sceneDocumentSchema,
      id: scene.id,
      ...(scene.initial === undefined ? {} : { initial: scene.initial }),
      ...(scene.kind === undefined ? {} : { kind: scene.kind }),
      ...(scene.entities === undefined ? {} : { entities: scene.entities.map((entity) => ({
        id: entity.id,
        ...(entity.prefab === undefined ? {} : { prefab: entity.prefab }),
        ...(entity.transform === undefined ? {} : { transform: copyTransform(entity.transform) }),
        ...(entity.components === undefined ? {} : { components: entity.components }),
      })) }),
      ...(scene.prefabs === undefined ? {} : { prefabs: scene.prefabs.map((prefab) => ({ ...prefab })) }),
      ...(scene.resources === undefined ? {} : { resources: scene.resources.map((resource) => ({ ...resource })) }),
      ...(scene.systems === undefined ? {} : { systems: scene.systems.map((system) => ({ ...system })) }),
      ...(scene.ui === undefined ? {} : { ui: {
        ...(scene.ui.nodes === undefined ? {} : { nodes: scene.ui.nodes.map((node) => ({ ...node })) }),
        ...(scene.ui.bindings === undefined ? {} : { bindings: scene.ui.bindings.map((binding) => ({ ...binding })) }),
      } }),
    };
    documents.push(document(options.projectPath, projectRelativePath, "scene", data, sourceMap(options.sourcePath, scenePointers(scene, sceneIndex))));
  }

  if (spec.input !== undefined) {
    const id = spec.input.id ?? "game";
    const data: IInputDocument = {
      schema: inputDocumentSchema,
      id,
      ...(spec.input.actions === undefined ? {} : { actions: spec.input.actions.map((action) => ({ ...action })) }),
      ...(spec.input.axes === undefined ? {} : { axes: spec.input.axes.map((axis) => ({ ...axis })) }),
    };
    documents.push(document(options.projectPath, `content/input/${id}.input.json`, "input", data, sourceMap(options.sourcePath, inputPointers(spec.input))));
  }

  if (spec.materials !== undefined && spec.materials.length > 0) {
    const data: IMaterialDocument = {
      schema: materialDocumentSchema,
      id: "game-materials",
      materials: spec.materials.map((material) => ({ ...material })),
    };
    documents.push(document(options.projectPath, "content/materials/game-materials.materials.json", "material", data, sourceMap(options.sourcePath, materialPointers(spec.materials))));
  }

  return documents;
}

function copyTransform(transform: NonNullable<NonNullable<ITypedGameSpec["scenes"][number]["entities"]>[number]["transform"]>): ISceneTransform {
  return {
    ...(transform?.position === undefined ? {} : { position: [...transform.position] }),
    ...(transform?.rotation === undefined ? {} : { rotation: [...transform.rotation] }),
    ...(transform?.scale === undefined ? {} : { scale: [...transform.scale] }),
  };
}

function document(
  projectPath: string | undefined,
  projectRelativePath: string,
  kind: IAuthoringDocument["kind"],
  data: unknown,
  sourceMap: IAuthoringDocument["sourceMap"],
): IAuthoringDocument {
  return {
    data,
    file: projectPath === undefined ? projectRelativePath : `${projectPath}/${projectRelativePath}`,
    kind,
    projectRelativePath,
    ...(sourceMap === undefined ? {} : { sourceMap }),
  };
}

function sourceMap(sourcePath: string | undefined, pointers: Record<string, string>): IAuthoringDocument["sourceMap"] {
  return sourcePath === undefined ? undefined : { pointers, sourcePath };
}

function scenePointers<TIds extends Partial<IGameSpecIds>>(scene: ITypedGameSpec<TIds>["scenes"][number], sceneIndex: number): Record<string, string> {
  const pointers: Record<string, string> = {
    "/id": `/scenes/${sceneIndex}/id`,
  };
  for (const [entityIndex, entity] of (scene.entities ?? []).entries()) {
    pointers[`/entities/${entityIndex}`] = `/scenes/${sceneIndex}/entities/${entityIndex}`;
    for (const componentKind of Object.keys(entity.components ?? {})) {
      pointers[`/entities/${entityIndex}/components/${escapePointer(componentKind)}`] = `/scenes/${sceneIndex}/entities/${entityIndex}/components/${escapePointer(componentKind)}`;
    }
  }
  for (const [prefabIndex] of (scene.prefabs ?? []).entries()) {
    pointers[`/prefabs/${prefabIndex}`] = `/scenes/${sceneIndex}/prefabs/${prefabIndex}`;
  }
  for (const [systemIndex] of (scene.systems ?? []).entries()) {
    const base = `/scenes/${sceneIndex}/systems/${systemIndex}`;
    pointers[`/systems/${systemIndex}`] = base;
    pointers[`/systems/${systemIndex}/script`] = `${base}/script`;
  }
  for (const [nodeIndex] of (scene.ui?.nodes ?? []).entries()) {
    pointers[`/ui/nodes/${nodeIndex}`] = `/scenes/${sceneIndex}/ui/nodes/${nodeIndex}`;
  }
  return pointers;
}

function inputPointers<TIds extends Partial<IGameSpecIds>>(input: NonNullable<ITypedGameSpec<TIds>["input"]>): Record<string, string> {
  const pointers: Record<string, string> = {};
  for (const [actionIndex] of (input.actions ?? []).entries()) {
    pointers[`/actions/${actionIndex}`] = `/input/actions/${actionIndex}`;
  }
  for (const [axisIndex] of (input.axes ?? []).entries()) {
    pointers[`/axes/${axisIndex}`] = `/input/axes/${axisIndex}`;
  }
  return pointers;
}

function materialPointers<TIds extends Partial<IGameSpecIds>>(materials: NonNullable<ITypedGameSpec<TIds>["materials"]>): Record<string, string> {
  const pointers: Record<string, string> = {};
  for (const [materialIndex] of materials.entries()) {
    pointers[`/materials/${materialIndex}`] = `/materials/${materialIndex}`;
  }
  return pointers;
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
