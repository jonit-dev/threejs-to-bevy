import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
  type IBundleManifest,
  type IIrNamedSchema,
  type IIrSchemaFile,
  type IIrSchemaField,
  type IMaterialsIr,
  type ITargetProfile,
  type IWorldIr,
} from "./types.js";
import type { ISystemsIr } from "./systems.js";
import type { IInputIr, InputBinding } from "./input.js";
import type { IRuntimeConfigIr } from "./runtimeConfig.js";

export interface IIrDiagnostic {
  code: string;
  message: string;
  path: string;
}

export interface IBundleValidationResult {
  diagnostics: IIrDiagnostic[];
  ok: boolean;
}

export async function validateBundle(bundlePath: string): Promise<IBundleValidationResult> {
  const diagnostics: IIrDiagnostic[] = [];
  const manifest = await readJson<IBundleManifest>(resolve(bundlePath, "manifest.json"), diagnostics);

  if (manifest === undefined) {
    return { diagnostics, ok: false };
  }

  validateManifest(manifest, "manifest.json", diagnostics);

  const world = await readJson<IWorldIr>(resolve(bundlePath, manifest.entry.world), diagnostics);
  const materials = await readJson<IMaterialsIr>(resolve(bundlePath, manifest.files.materials), diagnostics);
  const assets = await readJson<IAssetsManifest>(resolve(bundlePath, manifest.files.assets), diagnostics);
  const targetProfile = await readJson<ITargetProfile>(resolve(bundlePath, manifest.files.targetProfile), diagnostics);
  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await readJson<ISystemsIr>(resolve(bundlePath, manifest.entry.systems), diagnostics);
  const input =
    manifest.files.input === undefined ? undefined : await readJson<IInputIr>(resolve(bundlePath, manifest.files.input), diagnostics);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readJson<IRuntimeConfigIr>(resolve(bundlePath, manifest.files.runtimeConfig), diagnostics);
  const componentSchemas =
    manifest.files.componentSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.componentSchemas), diagnostics);
  const resourceSchemas =
    manifest.files.resourceSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.resourceSchemas), diagnostics);
  const eventSchemas =
    manifest.files.eventSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.eventSchemas), diagnostics);

  if (world !== undefined) {
    validateWorld(world, manifest.entry.world, diagnostics);
    const entityIds = new Set(world.entities.map((entity) => entity.id));
    if (componentSchemas !== undefined) {
      validateSchemaFile(componentSchemas, manifest.files.componentSchemas ?? "schemas/components.schema.json", "threenative.component-schemas", diagnostics);
      validateWorldComponents(world, componentSchemas.schemas, entityIds, diagnostics);
    }
    if (resourceSchemas !== undefined) {
      validateSchemaFile(resourceSchemas, manifest.files.resourceSchemas ?? "schemas/resources.schema.json", "threenative.resource-schemas", diagnostics);
      validateResources(world, resourceSchemas.schemas, entityIds, diagnostics);
    }
    if (eventSchemas !== undefined) {
      validateSchemaFile(eventSchemas, manifest.files.eventSchemas ?? "schemas/events.schema.json", "threenative.event-schemas", diagnostics);
      validateWorldEvents(world, eventSchemas.schemas, diagnostics);
    }
  }
  if (materials !== undefined) {
    validateUniqueIds(materials.materials, `${manifest.files.materials}/materials`, "TN_IR_DUPLICATE_MATERIAL_ID", diagnostics);
    validateMaterials(materials, manifest.files.materials, diagnostics);
    validateMaterialTextureRefs(materials, assets, manifest.files.materials, diagnostics);
  }
  if (assets !== undefined) {
    validateUniqueIds(assets.assets, `${manifest.files.assets}/assets`, "TN_IR_DUPLICATE_ASSET_ID", diagnostics);
    await validateAssets(assets, bundlePath, manifest.files.assets, diagnostics);
  }
  if (targetProfile !== undefined && targetProfile.targets.length === 0) {
    diagnostics.push({
      code: "TN_IR_TARGETS_EMPTY",
      message: "Target profile must include at least one target.",
      path: `${manifest.files.targetProfile}/targets`,
    });
  }
  if (systems !== undefined) {
    validateSystems(
      systems,
      manifest.entry.systems ?? "systems.ir.json",
      componentSchemas?.schemas ?? {},
      eventSchemas?.schemas ?? {},
      diagnostics,
    );
  }
  if (input !== undefined) {
    validateInput(input, manifest.files.input ?? "input.ir.json", diagnostics);
  }
  if (runtimeConfig !== undefined) {
    validateRuntimeConfig(runtimeConfig, manifest.files.runtimeConfig ?? "runtime.config.json", diagnostics);
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

async function validateAssets(assets: IAssetsManifest, bundlePath: string, path: string, diagnostics: IIrDiagnostic[]): Promise<void> {
  await Promise.all(
    assets.assets.map(async (asset, index) => {
      if (!("path" in asset)) {
        return;
      }
      const assetPath = `${path}/assets/${index}/path`;
      if (asset.path.startsWith("/") || asset.path.includes("..")) {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_INVALID",
          message: `Asset '${asset.id}' must use a bundle-relative path without parent traversal.`,
          path: assetPath,
        });
        return;
      }
      const extension = asset.path.split(".").pop()?.toLowerCase();
      if (!assetFormatMatches(asset.kind, asset.format, extension)) {
        diagnostics.push({
          code: "TN_IR_ASSET_FORMAT_UNSUPPORTED",
          message: `Asset '${asset.id}' uses unsupported ${asset.kind} format '${asset.format}'.`,
          path: `${path}/assets/${index}/format`,
        });
      }
      try {
        await access(resolve(bundlePath, asset.path));
      } catch {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_MISSING",
          message: `Asset '${asset.id}' path '${asset.path}' does not exist in the bundle.`,
          path: assetPath,
        });
      }
    }),
  );
}

function assetFormatMatches(kind: string, format: string, extension: string | undefined): boolean {
  if (format !== extension) {
    return false;
  }
  if (kind === "model") {
    return format === "glb" || format === "gltf";
  }
  if (kind === "texture") {
    return format === "jpeg" || format === "png";
  }
  if (kind === "audio") {
    return format === "mp3" || format === "ogg" || format === "wav";
  }
  return true;
}

function validateMaterialTextureRefs(materials: IMaterialsIr, assets: IAssetsManifest | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  const textureAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "texture").map((asset) => asset.id));
  const slots = ["baseColorTexture", "normalTexture", "metallicRoughnessTexture", "emissiveTexture", "occlusionTexture"] as const;
  materials.materials.forEach((material, materialIndex) => {
    slots.forEach((slot) => {
      const value = material[slot];
      if (value !== undefined && !textureAssets.has(value)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING",
          message: `Material '${material.id}' references unknown texture asset '${value}'.`,
          path: `${path}/materials/${materialIndex}/${slot}`,
        });
      }
    });
  });
}

function validateMaterials(materials: IMaterialsIr, path: string, diagnostics: IIrDiagnostic[]): void {
  materials.materials.forEach((material, index) => {
    const raw = material as unknown as Record<string, unknown>;
    if (raw.kind !== "standard") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_UNSUPPORTED",
        message: `Material '${material.id}' uses unsupported material kind '${String(raw.kind)}'.`,
        path: `${path}/materials/${index}/kind`,
      });
    }
    for (const key of ["shader", "vertexShader", "fragmentShader", "nodeGraph", "postprocess"]) {
      if (raw[key] !== undefined) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_CAPABILITY_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported shader capability '${key}'.`,
          path: `${path}/materials/${index}/${key}`,
        });
      }
    }
  });
}

function validateInput(input: IInputIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (input.schema !== "threenative.input" || input.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_INPUT_VERSION_UNSUPPORTED",
      message: "Input IR must use threenative.input version 0.1.0.",
      path,
    });
  }
  validateUniqueIds(input.actions, `${path}/actions`, "TN_IR_INPUT_ACTION_DUPLICATE", diagnostics);
  validateUniqueIds(input.axes, `${path}/axes`, "TN_IR_INPUT_AXIS_DUPLICATE", diagnostics);

  input.actions.forEach((action, actionIndex) => {
    validateBindings(action.bindings, `${path}/actions/${actionIndex}/bindings`, diagnostics);
  });
  input.axes.forEach((axis, axisIndex) => {
    validateBindings(axis.negative, `${path}/axes/${axisIndex}/negative`, diagnostics);
    validateBindings(axis.positive, `${path}/axes/${axisIndex}/positive`, diagnostics);
    if (axis.value !== undefined) {
      validateBinding(axis.value, `${path}/axes/${axisIndex}/value`, diagnostics);
    }
  });
}

function validateBindings(bindings: InputBinding[], path: string, diagnostics: IIrDiagnostic[]): void {
  const seen = new Set<string>();
  bindings.forEach((binding, index) => {
    const key = bindingKey(binding);
    if (seen.has(key)) {
      diagnostics.push({
        code: "TN_IR_INPUT_BINDING_DUPLICATE",
        message: `Input binding '${key}' is declared more than once.`,
        path: `${path}/${index}`,
      });
    }
    seen.add(key);
    validateBinding(binding, `${path}/${index}`, diagnostics);
  });
}

function validateBinding(binding: InputBinding, path: string, diagnostics: IIrDiagnostic[]): void {
  if (binding.device === "gamepad" && binding.required !== false) {
    diagnostics.push({
      code: "TN_IR_INPUT_GAMEPAD_UNSUPPORTED_V2",
      message: "Gamepad bindings are V3 scope and cannot be required by a V2 bundle.",
      path,
    });
  }
}

function bindingKey(binding: InputBinding): string {
  if (binding.device === "keyboard") {
    return `keyboard:${binding.code}`;
  }
  if (binding.device === "pointer" && "button" in binding) {
    return `pointer:button:${binding.button}`;
  }
  if (binding.device === "pointer") {
    return `pointer:axis:${binding.axis}`;
  }
  if (binding.device === "touch") {
    return `touch:${binding.control}:${binding.axis ?? ""}`;
  }
  return `gamepad:${binding.control}`;
}

function validateRuntimeConfig(config: IRuntimeConfigIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (config.schema !== "threenative.runtime-config" || config.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_VERSION_UNSUPPORTED",
      message: "Runtime config IR must use threenative.runtime-config version 0.1.0.",
      path,
    });
  }
  if (!Number.isFinite(config.time.fixedDelta) || config.time.fixedDelta <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_FIXED_DELTA_INVALID",
      message: "Fixed timestep must be a positive finite number.",
      path: `${path}/time/fixedDelta`,
    });
  }
  if (!Number.isFinite(config.window.width) || config.window.width <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Window width must be a positive finite number.",
      path: `${path}/window/width`,
    });
  }
  if (!Number.isFinite(config.window.height) || config.window.height <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Window height must be a positive finite number.",
      path: `${path}/window/height`,
    });
  }
}

function validateSystems(
  systems: ISystemsIr,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (systems.schema !== "threenative.systems" || systems.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SYSTEMS_VERSION_UNSUPPORTED",
      message: "Systems IR must use threenative.systems version 0.1.0.",
      path,
    });
  }

  systems.systems.forEach((system, systemIndex) => {
    const writes = new Set(system.writes);
    const eventWrites = new Set(system.eventWrites);
    system.reads.forEach((component, componentIndex) => {
      if (componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/reads/${componentIndex}`,
        });
      }
    });
    system.writes.forEach((component, componentIndex) => {
      if (componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          message: `System '${system.name}' writes component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/writes/${componentIndex}`,
        });
      }
    });
    system.eventReads.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventReads/${eventIndex}`,
        });
      }
    });
    system.eventWrites.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' writes event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventWrites/${eventIndex}`,
        });
      }
    });
    system.queries.forEach((query, queryIndex) => {
      query.with.forEach((component, componentIndex) => {
        if (componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' queries component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/with/${componentIndex}`,
          });
        }
      });
      query.without.forEach((component, componentIndex) => {
        if (componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' excludes component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/without/${componentIndex}`,
          });
        }
      });
    });
    system.commands.forEach((command, commandIndex) => {
      if (command.kind === "addComponent" || command.kind === "removeComponent" || command.kind === "setComponent") {
        if (componentSchemas[command.component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' command references component '${command.component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/component`,
          });
        }
        if (!writes.has(command.component)) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
            message: `System '${system.name}' command writes component '${command.component}' without declaring write access.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/component`,
          });
        }
      }
      if (command.kind === "spawn") {
        command.components.forEach((component, componentIndex) => {
          if (componentSchemas[component] === undefined) {
            diagnostics.push({
              code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
              message: `System '${system.name}' command spawns component '${component}' without a schema.`,
              path: `${path}/systems/${systemIndex}/commands/${commandIndex}/components/${componentIndex}`,
            });
          }
          if (!writes.has(component)) {
            diagnostics.push({
              code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
              message: `System '${system.name}' command spawns component '${component}' without declaring write access.`,
              path: `${path}/systems/${systemIndex}/commands/${commandIndex}/components`,
            });
          }
        });
      }
      if (command.kind === "emitEvent") {
        if (eventSchemas[command.event] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
            message: `System '${system.name}' command emits event '${command.event}' without a schema.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/event`,
          });
        }
        if (!eventWrites.has(command.event)) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_EVENT_WRITE_UNDECLARED",
            message: `System '${system.name}' emits event '${command.event}' without declaring event write access.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/event`,
          });
        }
      }
    });
  });
}

function validateSchemaFile(
  schemaFile: IIrSchemaFile,
  path: string,
  expectedSchema: IIrSchemaFile["schema"],
  diagnostics: IIrDiagnostic[],
): void {
  if (schemaFile.schema !== expectedSchema || schemaFile.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SCHEMA_FILE_VERSION_UNSUPPORTED",
      message: `Schema file must use ${expectedSchema} version 0.1.0.`,
      path,
    });
  }
}

function validateWorldComponents(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  world.entities.forEach((entity, entityIndex) => {
    for (const [componentName, value] of Object.entries(entity.components)) {
      const schema = schemas[componentName];
      if (schema === undefined) {
        diagnostics.push({
          code: "TN_IR_COMPONENT_SCHEMA_MISSING",
          message: `Component '${componentName}' does not have a schema.`,
          path: `world.ir.json/entities/${entityIndex}/components/${componentName}`,
        });
        continue;
      }
      validatePayload(value, schema, `world.ir.json/entities/${entityIndex}/components/${componentName}`, entityIds, diagnostics);
    }
  });
}

function validateResources(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  for (const [resourceName, value] of Object.entries(world.resources ?? {})) {
    const schema = schemas[resourceName];
    if (schema === undefined) {
      diagnostics.push({
        code: "TN_IR_RESOURCE_SCHEMA_MISSING",
        message: `Resource '${resourceName}' does not have a schema.`,
        path: `world.ir.json/resources/${resourceName}`,
      });
      continue;
    }
    validatePayload(value, schema, `world.ir.json/resources/${resourceName}`, entityIds, diagnostics);
  }
}

function validateWorldEvents(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  for (const eventName of Object.keys(world.events ?? {})) {
    if (schemas[eventName] === undefined) {
      diagnostics.push({
        code: "TN_IR_EVENT_SCHEMA_MISSING",
        message: `Event '${eventName}' does not have a schema.`,
        path: `world.ir.json/events/${eventName}`,
      });
    }
  }
}

function validatePayload(
  value: unknown,
  schema: IIrNamedSchema,
  path: string,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_SCHEMA_PAYLOAD_INVALID",
      message: "Schema payload must be an object.",
      path,
    });
    return;
  }

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const fieldValue = value[fieldName];
    if (fieldValue === undefined) {
      if (field.required === true) {
        diagnostics.push({
          code: "TN_IR_SCHEMA_FIELD_REQUIRED",
          message: `Required field '${fieldName}' is missing.`,
          path: `${path}/${fieldName}`,
        });
      }
      continue;
    }
    validateFieldValue(fieldValue, field, `${path}/${fieldName}`, entityIds, diagnostics);
  }

  for (const fieldName of Object.keys(value)) {
    if (schema.fields[fieldName] === undefined) {
      diagnostics.push({
        code: "TN_IR_SCHEMA_FIELD_UNKNOWN",
        message: `Field '${fieldName}' is not declared by the schema.`,
        path: `${path}/${fieldName}`,
      });
    }
  }
}

function validateFieldValue(
  value: unknown,
  field: IIrSchemaField,
  path: string,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  const ok =
    (field.kind === "number" && typeof value === "number" && Number.isFinite(value)) ||
    (field.kind === "integer" && Number.isInteger(value)) ||
    (["asset", "color", "string"].includes(field.kind) && typeof value === "string") ||
    (field.kind === "entity" && typeof value === "string" && entityIds.has(value)) ||
    (field.kind === "boolean" && typeof value === "boolean") ||
    (field.kind === "vec2" && isNumberTuple(value, 2)) ||
    (field.kind === "vec3" && isNumberTuple(value, 3)) ||
    (field.kind === "vec4" && isNumberTuple(value, 4)) ||
    (field.kind === "quat" && isNumberTuple(value, 4));

  if (!ok) {
    diagnostics.push({
      code: field.kind === "entity" && typeof value === "string" ? "TN_IR_ENTITY_REFERENCE_MISSING" : "TN_IR_SCHEMA_FIELD_TYPE",
      message:
        field.kind === "entity" && typeof value === "string"
          ? `Entity reference '${value}' does not exist.`
          : `Field must match schema kind '${field.kind}'.`,
      path,
    });
  }
}

function isNumberTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateManifest(manifest: IBundleManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (manifest.schema !== "threenative.bundle" || manifest.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: "Manifest must use threenative.bundle version 0.1.0.",
      path,
    });
  }

  if (manifest.entry.world !== "world.ir.json") {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: "V1 manifest entry.world must be world.ir.json.",
      path: "manifest.json/entry/world",
    });
  }
}

function validateWorld(world: IWorldIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (world.schema !== "threenative.world" || world.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_WORLD_VERSION_UNSUPPORTED",
      message: "World IR must use threenative.world version 0.1.0.",
      path,
    });
  }

  validateUniqueIds(world.entities, `${path}/entities`, "TN_IR_DUPLICATE_ENTITY_ID", diagnostics);
  world.entities.forEach((entity, index) => validateRenderComponents(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validatePhysicsComponents(entity, `${path}/entities/${index}`, diagnostics));
}

function validateRenderComponents(entity: IWorldIr["entities"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const camera = entity.components.Camera;
  if (camera !== undefined) {
    if (camera.kind === "perspective" && camera.fovY === undefined) {
      diagnostics.push({
        code: "TN_IR_CAMERA_FIELD_MISSING",
        message: `Perspective camera '${entity.id}' must define fovY.`,
        path: `${path}/components/Camera/fovY`,
      });
    }
    if (camera.kind === "orthographic" && camera.size === undefined) {
      diagnostics.push({
        code: "TN_IR_CAMERA_FIELD_MISSING",
        message: `Orthographic camera '${entity.id}' must define size.`,
        path: `${path}/components/Camera/size`,
      });
    }
  }

  const renderer = entity.components.MeshRenderer;
  if (renderer?.visible !== undefined && typeof renderer.visible !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_VISIBILITY_INVALID",
      message: `MeshRenderer visibility for '${entity.id}' must be boolean.`,
      path: `${path}/components/MeshRenderer/visible`,
    });
  }

  const visibility = entity.components.Visibility;
  if (visibility !== undefined && typeof visibility.visible !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_VISIBILITY_INVALID",
      message: `Visibility component for '${entity.id}' must be boolean.`,
      path: `${path}/components/Visibility/visible`,
    });
  }
}

function validatePhysicsComponents(entity: IWorldIr["entities"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const collider = entity.components.Collider;
  const body = entity.components.RigidBody;
  if (collider === undefined && body === undefined) {
    return;
  }
  if (collider !== undefined) {
    if (!["box", "capsule", "cylinder", "mesh", "sphere"].includes(collider.kind)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COLLIDER_UNSUPPORTED",
        message: `Collider '${entity.id}' uses unsupported shape '${String(collider.kind)}'.`,
        path: `${path}/components/Collider/kind`,
      });
    }
    if (collider.trigger !== undefined && typeof collider.trigger !== "boolean") {
      diagnostics.push({
        code: "TN_IR_PHYSICS_TRIGGER_INVALID",
        message: `Collider trigger flag for '${entity.id}' must be boolean.`,
        path: `${path}/components/Collider/trigger`,
      });
    }
  }
  if (body !== undefined && !["dynamic", "kinematic", "static"].includes(body.kind)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_UNSUPPORTED",
      message: `RigidBody '${entity.id}' uses unsupported body kind '${String(body.kind)}'.`,
      path: `${path}/components/RigidBody/kind`,
    });
  }
  if (collider?.kind === "mesh" && body?.kind === "dynamic") {
    diagnostics.push({
      code: "TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED",
      message: "Dynamic mesh colliders are not supported in V2.",
      path: `${path}/components/Collider/kind`,
    });
  }
  if (body !== undefined && collider === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_MISSING",
      message: `RigidBody '${entity.id}' must have a Collider in V2.`,
      path: `${path}/components/Collider`,
    });
  }
}

function validateUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      diagnostics.push({
        code,
        message: `Duplicate id '${item.id}'.`,
        path: `${path}/${index}/id`,
      });
    }
    seen.add(item.id);
  });
}

async function readJson<T>(path: string, diagnostics: IIrDiagnostic[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    diagnostics.push({
      code: "TN_IR_FILE_INVALID",
      message: `Missing or invalid JSON file '${path}'.`,
      path,
    });
    return undefined;
  }
}
