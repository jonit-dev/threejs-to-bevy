import { SdkError } from "../errors.js";

export type SchemaFieldKind =
  | "asset"
  | "boolean"
  | "color"
  | "entity"
  | "integer"
  | "number"
  | "quat"
  | "string"
  | "vec2"
  | "vec3"
  | "vec4";

export type SchemaKind = "component" | "event" | "resource";

export interface ISchemaField {
  default?: unknown;
  kind: SchemaFieldKind;
  required?: boolean;
}

export type SchemaFieldDefinition = SchemaFieldKind | ISchemaField;
export type SchemaFields = Record<string, SchemaFieldDefinition>;

export interface IEcsSchema {
  fields: Record<string, ISchemaField>;
  kind: SchemaKind;
  name: string;
}

export interface IEcsDeclaration {
  data: Record<string, unknown>;
  schema: IEcsSchema;
}

export type EcsFactory = ((data?: Record<string, unknown>) => IEcsDeclaration) & IEcsSchema;

export function defineComponent(name: string, fields: SchemaFields = {}): EcsFactory {
  return defineSchema("component", name, fields);
}

export function defineTag(name: string): EcsFactory {
  return defineComponent(name);
}

export function defineResource(name: string, fields: SchemaFields = {}): EcsFactory {
  return defineSchema("resource", name, fields);
}

export function defineEvent(name: string, fields: SchemaFields = {}): IEcsSchema {
  return createSchema("event", name, fields);
}

function defineSchema(kind: "component" | "resource", name: string, fields: SchemaFields): EcsFactory {
  const schema = createSchema(kind, name, fields);
  const factory = ((data: Record<string, unknown> = {}) => ({
    data: { ...data },
    schema,
  })) as EcsFactory;

  Object.defineProperties(factory, {
    fields: { value: schema.fields },
    kind: { value: schema.kind },
    name: { value: schema.name },
  });

  return factory;
}

function createSchema(kind: SchemaKind, name: string, fields: SchemaFields): IEcsSchema {
  if (name.trim() === "") {
    throw new SdkError("TN_SDK_ECS_SCHEMA_NAME_EMPTY", "ECS schema name must not be empty.");
  }

  return {
    fields: normalizeFields(fields),
    kind,
    name,
  };
}

function normalizeFields(fields: SchemaFields): Record<string, ISchemaField> {
  return Object.fromEntries(
    Object.entries(fields)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, field]) => [name, normalizeField(field)]),
  );
}

function normalizeField(field: SchemaFieldDefinition): ISchemaField {
  if (typeof field === "string") {
    return {
      kind: field,
      required: true,
    };
  }

  return {
    ...field,
    required: field.required ?? field.default === undefined,
  };
}
