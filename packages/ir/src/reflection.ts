import type { IIrSchemaField, IIrSchemaFile } from "./types.js";

export interface IComponentReflectionField {
  default?: unknown;
  kind: IIrSchemaField["kind"];
  name: string;
  required: boolean;
}

export interface IComponentReflectionType {
  fields: IComponentReflectionField[];
  id: string;
}

export interface IComponentReflectionRegistry {
  components: IComponentReflectionType[];
  schema: "threenative.component-reflection";
  version: "0.1.0";
}

export function buildComponentReflectionRegistry(schemaFile: IIrSchemaFile | undefined): IComponentReflectionRegistry {
  return {
    components: Object.entries(schemaFile?.schemas ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, schema]) => ({
        fields: Object.entries(schema.fields)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, field]) => reflectionField(name, field)),
        id,
      })),
    schema: "threenative.component-reflection",
    version: "0.1.0",
  };
}

function reflectionField(name: string, field: IIrSchemaField): IComponentReflectionField {
  return {
    ...(field.default === undefined ? {} : { default: field.default }),
    kind: field.kind,
    name,
    required: field.required ?? false,
  };
}
