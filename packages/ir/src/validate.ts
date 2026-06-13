import { readFile } from "node:fs/promises";
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
  }
  if (assets !== undefined) {
    validateUniqueIds(assets.assets, `${manifest.files.assets}/assets`, "TN_IR_DUPLICATE_ASSET_ID", diagnostics);
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

  return { diagnostics, ok: diagnostics.length === 0 };
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
