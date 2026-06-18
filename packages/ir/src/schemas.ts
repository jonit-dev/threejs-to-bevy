import { schemaBackedDocuments, type SchemaBackedIrDocumentName } from "./documents.js";

export const schemaUrls = Object.fromEntries(
  schemaBackedDocuments().map(([name, document]) => [name, new URL(`../schemas/${document.schemaFile}`, import.meta.url)]),
) as Record<SchemaBackedIrDocumentName, URL>;

export type SchemaName = keyof typeof schemaUrls;
