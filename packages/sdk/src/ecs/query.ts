import type { EcsFactory, IEcsSchema } from "./schema.js";

export interface IQueryDeclaration {
  schemas: IEcsSchema[];
  with: string[];
  without: string[];
}

export interface IQueryOptions {
  with?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
  without?: ReadonlyArray<EcsFactory | IEcsSchema | string>;
}

export function defineQuery(options: IQueryOptions): IQueryDeclaration {
  return {
    schemas: normalizeSchemas([...(options.with ?? []), ...(options.without ?? [])]),
    with: normalizeSchemaNames(options.with ?? []),
    without: normalizeSchemaNames(options.without ?? []),
  };
}

function normalizeSchemaNames(values: ReadonlyArray<EcsFactory | IEcsSchema | string>): string[] {
  return [...new Set(values.map((value) => (typeof value === "string" ? value : value.name)))].sort();
}

function normalizeSchemas(values: ReadonlyArray<EcsFactory | IEcsSchema | string>): IEcsSchema[] {
  const schemas = new Map<string, IEcsSchema>();
  for (const value of values) {
    if (typeof value !== "string") {
      schemas.set(value.name, value);
    }
  }
  return [...schemas.values()].sort((left, right) => left.name.localeCompare(right.name));
}
