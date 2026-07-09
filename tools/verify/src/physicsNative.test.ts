import assert from "node:assert/strict";
import test from "node:test";

import { validatePhysicsNativeEvidence } from "./physicsNative.js";

test("should fail when native contact ordering evidence is missing", () => {
  const selfReport: any = {
    conclusion: "PASS",
    negativeFixtures: [
      { expectedCode: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED", ok: true },
      { expectedCode: "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID", ok: true },
      { expectedCode: "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED", ok: true },
    ],
    sceneRows: ["physics-material-lab", "physics-mass-stack-lab", "physics-character-obstacles", "physics-query-lab", "physics-mesh-ccd-track"]
      .map((scene) => ({ artifacts: { traceSidecar: `${scene}.json` }, ok: true, scene })),
  };
  selfReport.sceneRows[1]!.artifacts = {};
  const residualReport = {
    ok: true,
    promoted: ["sloped mesh grounding", "bounded dynamic navmesh rebake", "off-mesh links", "small crowd steering"],
    status: "passed",
  };

  assert.deepEqual(validatePhysicsNativeEvidence(selfReport, residualReport), ["physics-mass-stack-lab:missing-contact-sidecar"]);
});
