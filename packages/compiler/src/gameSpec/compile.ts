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
}

export function compileTypedGameSpec<TIds extends Partial<IGameSpecIds>>(spec: ITypedGameSpec<TIds>, options: ICompileTypedGameSpecOptions = {}): IAuthoringDocument[] {
  const documents: IAuthoringDocument[] = [];
  for (const scene of spec.scenes) {
    const projectRelativePath = `content/scenes/${scene.id}.scene.json`;
    const data: ISceneDocument = {
      schema: sceneDocumentSchema,
      id: scene.id,
      ...(scene.initial === undefined ? {} : { initial: scene.initial }),
      ...(scene.kind === undefined ? {} : { kind: scene.kind }),
      ...(scene.entities === undefined ? {} : { entities: scene.entities.map((entity) => ({
        id: entity.id,
        ...(entity.transform === undefined ? {} : { transform: copyTransform(entity.transform) }),
        ...(entity.components === undefined ? {} : { components: entity.components }),
      })) }),
      ...(scene.resources === undefined ? {} : { resources: scene.resources.map((resource) => ({ ...resource })) }),
      ...(scene.systems === undefined ? {} : { systems: scene.systems.map((system) => ({ ...system })) }),
      ...(scene.ui === undefined ? {} : { ui: {
        ...(scene.ui.nodes === undefined ? {} : { nodes: scene.ui.nodes.map((node) => ({ ...node })) }),
        ...(scene.ui.bindings === undefined ? {} : { bindings: scene.ui.bindings.map((binding) => ({ ...binding })) }),
      } }),
    };
    documents.push(document(options.projectPath, projectRelativePath, "scene", data));
  }

  if (spec.input !== undefined) {
    const id = spec.input.id ?? "game";
    const data: IInputDocument = {
      schema: inputDocumentSchema,
      id,
      ...(spec.input.actions === undefined ? {} : { actions: spec.input.actions.map((action) => ({ ...action })) }),
      ...(spec.input.axes === undefined ? {} : { axes: spec.input.axes.map((axis) => ({ ...axis })) }),
    };
    documents.push(document(options.projectPath, `content/input/${id}.input.json`, "input", data));
  }

  if (spec.materials !== undefined && spec.materials.length > 0) {
    const data: IMaterialDocument = {
      schema: materialDocumentSchema,
      id: "game-materials",
      materials: spec.materials.map((material) => ({ ...material })),
    };
    documents.push(document(options.projectPath, "content/materials/game-materials.materials.json", "material", data));
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

function document(projectPath: string | undefined, projectRelativePath: string, kind: IAuthoringDocument["kind"], data: unknown): IAuthoringDocument {
  return {
    data,
    file: projectPath === undefined ? projectRelativePath : `${projectPath}/${projectRelativePath}`,
    kind,
    projectRelativePath,
  };
}
