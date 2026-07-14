import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { UI_PARITY_ROWS, promotedUiCapabilitiesForFixture, validateUiParityRegistry } from "./uiParityRegistry.js";

test("should accept the complete UI parity evidence registry", () => {
  assert.deepEqual(validateUiParityRegistry(), []);
});

test("should reject a UI parity row without an evidence tier", () => {
  const rows = [{ claim: "partial", evidence: [], id: "node.test", nodeKinds: ["test"], requiredTier: undefined }] as never;
  assert.equal(validateUiParityRegistry(rows, ["test"]).some((entry) => entry.code === "TN_VERIFY_UI_PARITY_TIER_MISSING"), true);
});

test("should reject rendered promotion backed only by trace metadata", () => {
  const rows = [{ claim: "promoted", evidence: [{ adapter: "native", kind: "trace" }, { adapter: "web", kind: "trace" }], id: "node.test", nodeKinds: ["test"], requiredTier: "rendered" }] as never;
  assert.equal(validateUiParityRegistry(rows, ["test"]).some((entry) => entry.code === "TN_VERIFY_UI_PARITY_EVIDENCE_INSUFFICIENT"), true);
});

test("should reject cross-mixed evidence kinds across adapters", () => {
  const rows = [{ claim: "promoted", evidence: [{ adapter: "web", artifact: "web.png", kind: "rendered-screenshot" }, { adapter: "native", artifact: "native.json", kind: "trace" }], id: "node.test", nodeKinds: ["test"], requiredTier: "rendered" }] as never;
  assert.equal(validateUiParityRegistry(rows, ["test"]).some((entry) => entry.code === "TN_VERIFY_UI_PARITY_EVIDENCE_INSUFFICIENT"), true);
});

test("should reject a new UI node kind without an explicit disposition", () => {
  assert.equal(validateUiParityRegistry(UI_PARITY_ROWS, ["futureWidget"]).some((entry) => entry.code === "TN_VERIFY_UI_PARITY_NODE_KIND_MISSING"), true);
});

test("should reject artifact-less promoted evidence", () => {
  const rows = [{ claim: "promoted", evidence: [{ adapter: "shared", kind: "behavior-report" }], id: "node.test", nodeKinds: ["test"], requiredTier: "behavioral" }] as never;
  assert.equal(validateUiParityRegistry(rows, ["test"]).some((entry) => entry.code === "TN_VERIFY_UI_PARITY_ARTIFACT_MISSING"), true);
});

test("should derive input UI fixture promotion enrollment from the registry", () => {
  const catalog = JSON.parse(readFileSync("packages/ir/fixtures/conformance/fixture-catalog.json", "utf8")) as { fixtures: Array<{ canonicalId: string; promotedCapabilities: string[] }> };
  const fixture = catalog.fixtures.find((entry) => entry.canonicalId === "input-ui-polish");
  assert.deepEqual(fixture?.promotedCapabilities.filter((entry) => entry.startsWith("ui:")).sort(), promotedUiCapabilitiesForFixture("input-ui-polish"));
});
