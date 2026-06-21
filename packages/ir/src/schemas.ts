import { schemaBackedDocuments, type SchemaBackedIrDocumentName } from "./documents.js";

/**
 * URLs for the JSON Schema files shipped by `@threenative/ir`.
 *
 * Consumers can use these URLs to discover the package-local schema location
 * for bundle documents such as `manifest.json`, `world.ir.json`, and
 * `scenes.ir.json` without depending on repository source paths.
 */
export const schemaUrls = Object.fromEntries(
  schemaBackedDocuments().map(([name, document]) => [name, new URL(`../schemas/${document.schemaFile}`, import.meta.url)]),
) as Record<SchemaBackedIrDocumentName, URL>;

export type SchemaName = keyof typeof schemaUrls;
