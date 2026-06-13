export const schemaUrls = {
  assets: new URL("../schemas/assets.schema.json", import.meta.url),
  input: new URL("../schemas/input.schema.json", import.meta.url),
  manifest: new URL("../schemas/manifest.schema.json", import.meta.url),
  materials: new URL("../schemas/materials.schema.json", import.meta.url),
  runtimeConfig: new URL("../schemas/runtime-config.schema.json", import.meta.url),
  targetProfile: new URL("../schemas/target-profile.schema.json", import.meta.url),
  world: new URL("../schemas/world.schema.json", import.meta.url),
} as const;

export type SchemaName = keyof typeof schemaUrls;
