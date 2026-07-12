import type { IWorldEntity, PrefabsSchema, SchemaVersion } from "./types.js";

export interface IPrefabEntityTemplateIr {
  id: string;
  components: IWorldEntity["components"];
  tags?: string[];
}

export interface IPrefabDeclarationIr {
  id: string;
  root: string;
  entities: readonly IPrefabEntityTemplateIr[];
}

export interface IPrefabsIr {
  prefabs: readonly IPrefabDeclarationIr[];
  schema: PrefabsSchema;
  version: SchemaVersion;
}
