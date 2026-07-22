import assert from "node:assert/strict";
import test from "node:test";

import { ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION, advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const complete = {
  adapters: [
    { adapter: "web", dependencies: { rapier: "0.19.3" }, runtime: "@threenative/runtime-web-three", runtimeVersion: "0.1.11" },
    { adapter: "bevy", dependencies: { rapier3d: "0.33.0" }, runtime: "threenative_runtime", runtimeVersion: "0.1.0" },
  ],
  artifactHashes: { "web-trace.json": `sha256-${"a".repeat(64)}` },
  bundleHash: `sha256-${"b".repeat(64)}`,
  command: "node tools/verify/dist/physicsSelfVerification.js --phase-1-only",
  completedAt: "2026-07-22T17:00:01.000Z",
  fixedDelta: 0.1,
  platform: "linux-x64",
  scenario: "advanced-physics-foundation",
  schemaVersion: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
  seed: 0,
  sourceHash: `sha256-${"c".repeat(64)}`,
  startedAt: "2026-07-22T17:00:00.000Z",
  toleranceRegistryVersion: "0.1.0",
};

test("advanced physics evidence metadata should require the complete PRD 6.3 envelope", () => {
  assert.deepEqual(advancedPhysicsEvidenceMetadataDiagnostics(complete), []);
  for (const key of ["sourceHash", "bundleHash", "platform", "scenario", "fixedDelta", "seed", "toleranceRegistryVersion", "command", "startedAt", "completedAt", "artifactHashes", "adapters"] as const) {
    const incomplete = { ...complete, [key]: undefined };
    assert.ok(advancedPhysicsEvidenceMetadataDiagnostics(incomplete).length > 0, `missing ${key} must fail`);
  }
});

test("advanced physics evidence metadata should reject unversioned adapters and stale-looking hashes", () => {
  assert.ok(advancedPhysicsEvidenceMetadataDiagnostics({
    ...complete,
    adapters: [{ adapter: "web", dependencies: {}, runtime: "web", runtimeVersion: "" }],
    bundleHash: "stale",
  }).length >= 3);
});
