import type { IIrDiagnostic } from "./validate.js";
import type { IIrNamedSchema, IIrSchemaField, IIrSchemaFile, IWorldIr } from "./types.js";
import { isNumberTuple, isRecord } from "./validationPrimitives.js";

export function validateSchemaFile(
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

export function validateWorldComponents(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  world.entities.forEach((entity, entityIndex) => {
    for (const [componentName, value] of Object.entries(entity.components)) {
      if (isBuiltInComponent(componentName)) {
        continue;
      }
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

export function validateResources(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  for (const [resourceName, value] of Object.entries(world.resources ?? {})) {
    if (isBuiltInResource(resourceName)) {
      continue;
    }
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

export function isBuiltInComponent(componentName: string): boolean {
  return ["Camera", "CharacterController", "Collider", "ContactShadows", "Hierarchy", "Light", "MeshRenderer", "Patrol", "PhysicsJoint", "RenderLayers", "RigidBody", "StateMachine", "Transform", "Visibility"].includes(componentName);
}

export function isBuiltInResource(resourceName: string): boolean {
  return resourceName === "ActiveCamera" || resourceName === "ActiveCameras" || resourceName === "Navigation";
}

export function validateWorldEvents(
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
