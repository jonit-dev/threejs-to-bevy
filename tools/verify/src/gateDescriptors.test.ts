import assert from "node:assert/strict";
import test from "node:test";

import { listScriptGateNames } from "./scriptGates.js";
import { listFocusedGateNames } from "./cli/run.js";
import {
  descriptorFocusedGates,
  descriptorReleaseFocusedGates,
  GATE_DESCRIPTOR_MIGRATION_GAPS,
  GATE_DESCRIPTORS,
  validateGateDescriptorMigrationGaps,
  validateGateDescriptors,
} from "./gateDescriptors.js";

test("gate descriptors should validate migrated proof gate metadata", () => {
  assert.deepEqual(validateGateDescriptors(), []);
  assert.deepEqual(GATE_DESCRIPTORS.map((descriptor) => descriptor.name), [
    "verify:agent-io",
    "verify:session-cost",
    "verify:webview-package",
  ]);
  assert.equal(GATE_DESCRIPTORS.every((descriptor) => descriptor.release.enrolled), true);
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
  ]);
});

test("gate descriptors should reject duplicate artifacts and malformed paths", () => {
  const agentIoDescriptor = GATE_DESCRIPTORS[0]!;
  const sessionCostDescriptor = GATE_DESCRIPTORS[1]!;
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
