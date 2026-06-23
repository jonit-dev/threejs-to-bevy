import assert from "node:assert/strict";
import test from "node:test";

import {
  authoringSourceMatrix,
  firstClassAuthoringSourceCategoryIds,
  generatedBundleArtifactFiles,
  getAuthoringSourceCategory,
  isDurableAuthoringSourceKind,
  isGeneratedBundleArtifactFile,
} from "../sourceKinds.js";

test("authoring coverage matrix includes every declared source kind", () => {
  const coveredCategoryIds = new Set(authoringSourceMatrix.map((entry) => entry.categoryId));

  for (const categoryId of firstClassAuthoringSourceCategoryIds) {
    assert.equal(coveredCategoryIds.has(categoryId), true, `${categoryId} is missing from the authoring source matrix`);
    assert.equal(getAuthoringSourceCategory(categoryId).durable, true);
  }
});

test("generated bundle files are not source kinds", () => {
  for (const artifactFile of generatedBundleArtifactFiles) {
    assert.equal(isGeneratedBundleArtifactFile(artifactFile), true, `${artifactFile} should be classified as generated`);
    assert.equal(isDurableAuthoringSourceKind(artifactFile), false, `${artifactFile} must not be durable authoring source`);
  }

  const generatedEntry = authoringSourceMatrix.find((entry) => entry.categoryId === "generated-bundle-files");
  assert.equal(generatedEntry?.structuredSourceSupport, "non-goal");
  assert.equal(generatedEntry?.editorRoundTrip, "not-source");
});

test("TypeScript is classified as script or generator source only", () => {
  const typeScriptEntries = authoringSourceMatrix.filter(
    (entry) => entry.typescriptRole === "script-ref" || entry.typescriptRole === "generator",
  );

  assert.deepEqual(
    typeScriptEntries.map((entry) => entry.id),
    ["systems-document", "typescript-script-reference", "generator-provenance-document"],
  );
  const mapSceneSourceCategoryIds = new Set<string>(["visual-scene-graph", "prefabs-instances"]);
  assert.equal(
    typeScriptEntries.some((entry) => mapSceneSourceCategoryIds.has(entry.categoryId)),
    false,
  );

  const scriptReference = authoringSourceMatrix.find((entry) => entry.id === "typescript-script-reference");
  assert.equal(scriptReference?.editorRoundTrip, "script-reference-only");
  assert.match(scriptReference?.notes ?? "", /not for map\/editor-owned scene persistence/);

  const generatorReference = authoringSourceMatrix.find((entry) => entry.id === "generator-provenance-document");
  assert.equal(generatorReference?.editorRoundTrip, "one-way-generator-output");
  assert.equal(generatorReference?.structuredSourceSupport, "partial");
  assert.equal(generatorReference?.cliOperationSupport, "partial");
});
