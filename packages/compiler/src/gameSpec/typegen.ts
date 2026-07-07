import {
  type IAuthoringDocument,
  type IInputDocument,
  type IMaterialDocument,
  type ISceneDocument,
} from "@threenative/authoring";

export interface IGenerateTypedGameSpecTypesOptions {
  exportName?: string;
}

export function generateTypedGameSpecIdTypes(
  documents: readonly IAuthoringDocument[],
  options: IGenerateTypedGameSpecTypesOptions = {},
): string {
  const ids = collectIds(documents);
  const exportName = options.exportName ?? "ProjectGameSpecIds";
  return [
    "import type { IGameSpecIds } from \"@threenative/sdk\";",
    "",
    `export interface ${exportName} extends Partial<IGameSpecIds> {`,
    `  entity: ${literalUnion(ids.entity)};`,
    `  input: ${literalUnion(ids.input)};`,
    `  material: ${literalUnion(ids.material)};`,
    `  resource: ${literalUnion(ids.resource)};`,
    `  scene: ${literalUnion(ids.scene)};`,
    `  ui: ${literalUnion(ids.ui)};`,
    "}",
    "",
  ].join("\n");
}

function collectIds(documents: readonly IAuthoringDocument[]): Record<keyof IGameSpecIdsShape, string[]> {
  const ids: Record<keyof IGameSpecIdsShape, Set<string>> = {
    entity: new Set(),
    input: new Set(),
    material: new Set(),
    resource: new Set(),
    scene: new Set(),
    ui: new Set(),
  };
  for (const document of documents) {
    if (document.kind === "scene") {
      const scene = document.data as ISceneDocument;
      ids.scene.add(scene.id);
      for (const entity of scene.entities ?? []) {
        ids.entity.add(entity.id);
      }
      for (const resource of scene.resources ?? []) {
        ids.resource.add(resource.id);
      }
      for (const node of scene.ui?.nodes ?? []) {
        ids.ui.add(node.id);
      }
    }
    if (document.kind === "input") {
      const input = document.data as IInputDocument;
      for (const action of input.actions ?? []) {
        ids.input.add(action.id);
      }
      for (const axis of input.axes ?? []) {
        ids.input.add(axis.id);
      }
    }
    if (document.kind === "material") {
      const material = document.data as IMaterialDocument;
      for (const entry of material.materials ?? []) {
        ids.material.add(entry.id);
      }
    }
  }
  return Object.fromEntries(Object.entries(ids).map(([key, value]) => [key, Array.from(value).sort()])) as Record<keyof IGameSpecIdsShape, string[]>;
}

interface IGameSpecIdsShape {
  entity: string;
  input: string;
  material: string;
  resource: string;
  scene: string;
  ui: string;
}

function literalUnion(values: readonly string[]): string {
  return values.length === 0 ? "string" : values.map((value) => JSON.stringify(value)).join(" | ");
}
