import assert from "node:assert/strict";
import test from "node:test";

import { IR_DOCUMENTS, schemaBackedDocuments, unschemedDocuments } from "./documents.js";

test("documents should define unique document registry identifiers", () => {
  const documents = Object.entries(IR_DOCUMENTS);
  assertUnique(documents.map(([_, document]) => document.fileName), "fileName");
  assertUnique(
    documents.flatMap(([_, document]) => "schema" in document ? [document.schema] : []),
    "schema",
  );
  assertUnique(
    documents.flatMap(([name, document]) => manifestLocations(name, document)),
    "manifest location",
  );
});

test("documents should classify schema-backed and unschemed documents explicitly", () => {
  const classified = new Set([
    ...schemaBackedDocuments().map(([name]) => name),
    ...unschemedDocuments().map(([name]) => name),
  ]);

  assert.deepEqual([...classified].sort(), Object.keys(IR_DOCUMENTS).sort());
  assert.deepEqual(
    schemaBackedDocuments().flatMap(([name, document]) => document.drift === undefined ? [name] : []),
    [],
  );
  assert.ok(unschemedDocuments().some(([name]) => name === "systems"));
  assert.ok(unschemedDocuments().some(([name]) => name === "scripts"));
});

function manifestLocations(name: string, document: (typeof IR_DOCUMENTS)[keyof typeof IR_DOCUMENTS]): string[] {
  if ("manifestLocations" in document && document.manifestLocations !== undefined) {
    return document.manifestLocations.map((location) => `${location.section}:${location.key}`);
  }
  if ("manifestSection" in document && document.manifestSection !== undefined && "manifestKey" in document && document.manifestKey !== undefined) {
    return [`${document.manifestSection}:${document.manifestKey}`];
  }
  return [`document:${name}`];
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicates = values
    .filter((value, index) => values.indexOf(value) !== index)
    .sort((left, right) => left.localeCompare(right));
  assert.deepEqual(duplicates, [], `Duplicate IR document ${label} values`);
}
