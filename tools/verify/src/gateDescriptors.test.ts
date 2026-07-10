import assert from "node:assert/strict";
import test from "node:test";

import { listScriptGateNames } from "./scriptGates.js";
import { listFocusedGateNames } from "./cli/run.js";
import {
  descriptorFocusedGates,
  descriptorReleaseFocusedGates,
  fixtureCatalogGateDescriptors,
  GATE_DESCRIPTOR_MIGRATION_GAPS,
  GATE_DESCRIPTORS,
  validateGateDescriptorMigrationGaps,
  validateGateDescriptors,
} from "./gateDescriptors.js";

test("gate descriptors should validate migrated proof gate metadata", () => {
  assert.deepEqual(validateGateDescriptors(), []);
  assert.deepEqual(GATE_DESCRIPTORS.map((descriptor) => descriptor.name), [
    "verify:emitted-commands",
    "verify:agent-io",
    "verify:session-cost",
    "verify:webview-package",
    ...fixtureCatalogGateDescriptors().map((descriptor) => descriptor.name),
  ]);
  assert.equal(GATE_DESCRIPTORS.find((descriptor) => descriptor.name === "verify:emitted-commands")?.release.enrolled, false);
  assert.equal(GATE_DESCRIPTORS.filter((descriptor) => descriptor.name !== "verify:emitted-commands").every((descriptor) => descriptor.release.enrolled), true);
});

test("fixture catalog should own the shadow cascade focused gate descriptor", () => {
  const descriptors = fixtureCatalogGateDescriptors();
  const descriptor = descriptors.find((entry) => entry.name === "verify:shadow-cascade-stability");

  assert.ok(descriptor);
  assert.equal(descriptor.artifact.reportPath, "tools/verify/artifacts/shadow-cascade-stability/verification-report.json");
  assert.deepEqual(descriptor.command.commands.at(-1), ["node", "tools/verify/dist/shadowCascadeStability.js"]);
  assert.equal(descriptor.release.enrolled, true);
});

test("gate descriptors should derive focused gates and release artifacts", () => {
  const focused = descriptorFocusedGates();
  const release = descriptorReleaseFocusedGates();

  assert.equal(focused["verify:agent-io"]?.metadata.owner, "tools/verify agent IO budget gate");
  assert.equal(focused["verify:session-cost"]?.commands.at(-1)?.join(" "), "node tools/verify/dist/sessionCostGate.js");
  assert.deepEqual(release.map((gate) => [gate.script, gate.reportPath]), [
    ["verify:agent-io", "tools/verify/artifacts/agent-io/verification-report.json"],
    ["verify:session-cost", "tools/verify/artifacts/session-cost/verification-report.json"],
    ["verify:webview-package", "tools/verify/artifacts/webview-package/verification-report.json"],
    ...fixtureCatalogGateDescriptors()
      .filter((descriptor) => descriptor.release.enrolled)
      .map((descriptor) => [descriptor.name, descriptor.artifact.reportPath]),
  ]);
});

test("gate descriptors should reject duplicate artifacts and malformed paths", () => {
  const agentIoDescriptor = GATE_DESCRIPTORS.find((descriptor) => descriptor.name === "verify:agent-io")!;
  const sessionCostDescriptor = GATE_DESCRIPTORS.find((descriptor) => descriptor.name === "verify:session-cost")!;
  assert.deepEqual(validateGateDescriptors([
    {
      ...agentIoDescriptor,
      artifact: { reportPath: "tmp/report.txt" },
    },
    {
      ...sessionCostDescriptor,
      artifact: { reportPath: "tmp/report.txt" },
    },
  ]), [
    "verify:agent-io:artifact-path",
    "verify:session-cost:artifact-path",
    "verify:session-cost:duplicate-artifact",
  ]);
});

test("gate descriptors should list hand-owned focused gate migration gaps", () => {
  assert.deepEqual(validateGateDescriptorMigrationGaps({
    focusedGateNames: listFocusedGateNames(),
    scriptGateNames: listScriptGateNames(),
  }), []);
  assert.equal(GATE_DESCRIPTOR_MIGRATION_GAPS.every((gap) => gap.reviewed === "2026-07-09"), true);
});

test("gate descriptors should reject stale and missing migration gap entries", () => {
  assert.deepEqual(validateGateDescriptorMigrationGaps({
    focusedGateNames: ["verify:agent-io", "verify:new-inline-gate"],
    gaps: [
      {
        category: "focused-inline",
        name: "verify:agent-io",
        owner: "tools/verify agent IO budget gate",
        reason: "Already migrated.",
        reviewed: "2026-07-09",
      },
      {
        category: "focused-inline",
        name: "verify:removed-inline-gate",
        owner: "",
        reason: "",
        reviewed: "",
      },
    ],
  }), [
    "verify:new-inline-gate:missing-migration-gap",
    "verify:agent-io:stale-migration-gap",
    "verify:removed-inline-gate:unknown-migration-gap",
    "verify:removed-inline-gate:unclassified-migration-gap",
  ]);
});
