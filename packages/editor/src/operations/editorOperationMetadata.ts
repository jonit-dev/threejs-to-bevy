import { getAuthoringOperationDescriptor, type IAuthoringOperationDescriptor } from "@threenative/authoring";

import type { IEditorAddComponentDefinition, IEditorModalActionDefinition } from "../adapters/editorModel.js";

export interface IPlannedEditorOperation {
  args: Record<string, unknown>;
  name: string;
}

export interface IEditorOperationMetadata {
  compositeRecipe?: string;
  descriptor?: IAuthoringOperationDescriptor;
  fallback?: string;
  name: string;
}

export interface IEditorCompositeRecipePlan {
  entityId?: string;
  operations: IPlannedEditorOperation[];
  statusLabel: string;
}

export const EDITOR_COMPOSITE_RECIPE_NAMES = [
  "add.camera",
  "add.custom_glb",
  "add.empty_entity",
  "add.light",
  "add.primitive_sphere",
  "add.terrain",
  "environment.add_flat_terrain",
  "scene.create_default",
] as const;

export type EditorCompositeRecipeName = (typeof EDITOR_COMPOSITE_RECIPE_NAMES)[number];

export function getEditorOperationMetadata(name: string): IEditorOperationMetadata {
  const descriptor = getAuthoringOperationDescriptor(name);
  if (descriptor !== undefined) {
    return { descriptor, name };
  }
  if (isEditorCompositeRecipeName(name)) {
    return { compositeRecipe: name, name };
  }
  return { fallback: "unsupported", name };
}

export function buildAddComponentOperation(definition: IEditorAddComponentDefinition, context: { entityId: string; sceneId: string }): IPlannedEditorOperation | undefined {
  switch (definition.component) {
    case "Transform":
      return {
        args: {
          entityId: context.entityId,
          position: vectorDefault(definition.defaults.position, [0, 0, 0]),
          rotation: vectorDefault(definition.defaults.rotation, [0, 0, 0]),
          scale: vectorDefault(definition.defaults.scale, [1, 1, 1]),
          sceneId: context.sceneId,
        },
        name: "scene.set_transform",
      };
    case "Camera":
      return { args: { componentKind: "camera", entityId: context.entityId, sceneId: context.sceneId, value: definition.defaults }, name: "scene.set_component" };
    case "Light":
      return {
        args: {
          color: stringDefault(definition.defaults.color, "#ffffff"),
          entityId: context.entityId,
          intensity: numberDefault(definition.defaults.intensity, 1),
          kind: stringDefault(definition.defaults.kind, "directional"),
          sceneId: context.sceneId,
        },
        name: "scene.set_light",
      };
    case "MeshRenderer":
      return {
        args: {
          castShadow: booleanDefault(definition.defaults.castShadow, true),
          entityId: context.entityId,
          material: stringDefault(definition.defaults.material, "mat.player"),
          mesh: stringDefault(definition.defaults.mesh, "mesh.player"),
          receiveShadow: booleanDefault(definition.defaults.receiveShadow, true),
          sceneId: context.sceneId,
          visible: booleanDefault(definition.defaults.visible, true),
        },
        name: "scene.set_mesh_renderer",
      };
    case "RenderLayers":
      return { args: { entityId: context.entityId, layers: stringArrayDefault(definition.defaults.layers, ["default"]), sceneId: context.sceneId }, name: "scene.set_render_layers" };
    case "Visibility":
      return { args: { entityId: context.entityId, sceneId: context.sceneId, visible: booleanDefault(definition.defaults.visible, true) }, name: "scene.set_visibility" };
    case "RigidBody":
      return {
        args: {
          damping: numberDefault(definition.defaults.damping, 0.05),
          entityId: context.entityId,
          gravityScale: numberDefault(definition.defaults.gravityScale, 1),
          kind: stringDefault(definition.defaults.kind, "dynamic"),
          mass: numberDefault(definition.defaults.mass, 1),
          sceneId: context.sceneId,
        },
        name: "scene.set_rigid_body",
      };
    case "Collider":
      return {
        args: {
          entityId: context.entityId,
          kind: stringDefault(definition.defaults.kind, "box"),
          sceneId: context.sceneId,
          size: vectorDefault(definition.defaults.size, [1, 1, 1]),
          trigger: booleanDefault(definition.defaults.trigger, false),
        },
        name: "scene.set_collider",
      };
    case "CharacterController":
      return {
        args: {
          blocking: booleanDefault(definition.defaults.blocking, true),
          entityId: context.entityId,
          grounding: stringDefault(definition.defaults.grounding, "raycast"),
          moveXAxis: stringDefault(definition.defaults.moveXAxis, "MoveX"),
          moveZAxis: stringDefault(definition.defaults.moveZAxis, "MoveZ"),
          sceneId: context.sceneId,
          speed: numberDefault(definition.defaults.speed, 4),
        },
        name: "scene.set_character_controller",
      };
    default:
      return undefined;
  }
}

export function buildAddObjectRecipePlan(action: IEditorModalActionDefinition, suffix: string, context: { environmentId: string }): IEditorCompositeRecipePlan | undefined {
  switch (action.id) {
    case "add.primitive_sphere": {
      const prefabId = `prefab.editor-box-${suffix}`;
      const entityId = `editor-box-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { color: "#9b59b6", prefabId, primitive: "sphere" }, name: "scene.add_prefab" },
          { args: { entityId, prefabId }, name: "scene.add_entity" },
          { args: { entityId, position: [12, 0.5, 5] }, name: "scene.set_transform" },
        ],
        statusLabel: "primitive sphere",
      };
    }
    case "add.empty_entity": {
      const entityId = `editor-entity-${suffix}`;
      return { entityId, operations: [{ args: { entityId }, name: "scene.add_entity" }], statusLabel: "empty entity" };
    }
    case "add.camera": {
      const entityId = `editor-camera-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { entityId }, name: "scene.add_entity" },
          { args: { componentKind: "camera", entityId, value: { mode: "perspective" } }, name: "scene.set_component" },
          { args: { entityId, position: [0, 1.8, 6], rotation: [-0.25, 0, 0] }, name: "scene.set_transform" },
        ],
        statusLabel: "camera",
      };
    }
    case "add.light": {
      const entityId = `editor-light-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { entityId }, name: "scene.add_entity" },
          { args: { entityId, intensity: 1, kind: "directional" }, name: "scene.set_light" },
          { args: { entityId, position: [2, 4, 3] }, name: "scene.set_transform" },
        ],
        statusLabel: "light",
      };
    }
    case "add.custom_glb": {
      if (action.assetPath === undefined) {
        return undefined;
      }
      const prefabId = `prefab.editor-model-${suffix}`;
      const entityId = `editor-model-${suffix}`;
      return {
        entityId,
        operations: [
          { args: { asset: action.assetPath, prefabId }, name: "scene.add_prefab" },
          { args: { entityId, prefabId }, name: "scene.add_entity" },
          { args: { entityId, position: [0, 0, 0], scale: [1, 1, 1] }, name: "scene.set_transform" },
        ],
        statusLabel: `model ${action.assetPath}`,
      };
    }
    case "add.terrain": {
      const terrainId = `terrain.editor-${suffix}`;
      const prefabId = `prefab.editor-terrain-${suffix}`;
      const entityId = `editor-terrain-${suffix}`;
      return {
        entityId,
        operations: [{ args: { color: "#284f32", entityId, environmentId: context.environmentId, prefabId, terrainId }, name: "environment.add_flat_terrain" }],
        statusLabel: "flat terrain",
      };
    }
    default:
      return undefined;
  }
}

export function buildServerCompositeRecipePlan(name: string, args: Record<string, unknown>): IEditorCompositeRecipePlan | undefined {
  switch (name) {
    case "environment.add_flat_terrain": {
      const terrainId = stringArg(args, "terrainId");
      const prefabId = stringArg(args, "prefabId");
      const entityId = stringArg(args, "entityId");
      const sceneId = stringArg(args, "sceneId");
      return {
        entityId,
        operations: [
          { args: { bounds: { max: [6, 0.1, 6], min: [-6, -0.1, -6] }, environmentId: stringArg(args, "environmentId"), heightMode: "flat", terrainId }, name: "environment.set_terrain" },
          {
            args: {
              environmentId: stringArg(args, "environmentId"),
              walkability: {
                blockers: [],
                movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
                regions: [],
                terrain: { height: 0, surface: terrainId },
              },
            },
            name: "environment.set_walkability",
          },
          {
            args: {
              environmentId: stringArg(args, "environmentId"),
              path: { id: "path.editor_terrain", points: [[-4, 0, -4], [4, 0, 4]], width: 1 },
            },
            name: "environment.set_path",
          },
          { args: { color: optionalStringArg(args, "color") ?? "#284f32", prefabId, primitive: "plane", sceneId }, name: "scene.add_prefab" },
          { args: { entityId, prefabId, sceneId }, name: "scene.add_entity" },
          { args: { entityId, position: [0, -0.05, 0], rotation: [-1.570796, 0, 0], scale: [6, 6, 1], sceneId }, name: "scene.set_transform" },
        ],
        statusLabel: "flat terrain",
      };
    }
    case "scene.create_default": {
      const sceneId = stringArg(args, "sceneId");
      return {
        operations: [
          { args: { file: optionalStringArg(args, "file"), sceneId }, name: "scene.create" },
          { args: { entityId: "main-camera", sceneId }, name: "scene.add_entity" },
          { args: { entityId: "main-camera", position: [0, 1.8, 6], rotation: [-0.25, 0, 0], sceneId }, name: "scene.set_transform" },
          { args: { componentKind: "camera", entityId: "main-camera", sceneId, value: { mode: "perspective" } }, name: "scene.set_component" },
          { args: { entityId: "directional-light", sceneId }, name: "scene.add_entity" },
          { args: { entityId: "directional-light", position: [2, 4, 3], sceneId }, name: "scene.set_transform" },
          { args: { color: "#ffffff", entityId: "directional-light", intensity: 1, kind: "directional", sceneId }, name: "scene.set_light" },
          { args: { entityId: "ambient-light", sceneId }, name: "scene.add_entity" },
          { args: { color: "#ffffff", entityId: "ambient-light", intensity: 0.4, kind: "ambient", sceneId }, name: "scene.set_light" },
        ],
        statusLabel: "default scene",
      };
    }
    default:
      return undefined;
  }
}

function isEditorCompositeRecipeName(name: string): name is EditorCompositeRecipeName {
  return EDITOR_COMPOSITE_RECIPE_NAMES.includes(name as EditorCompositeRecipeName);
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Editor operation argument '${key}' must be a non-empty string.`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function vectorDefault(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    return fallback;
  }
  const [x, y, z] = value;
  return [x as number, y as number, z as number];
}

function stringDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function numberDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringArrayDefault(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0) ? value : fallback;
}
