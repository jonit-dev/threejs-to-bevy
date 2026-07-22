import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { traceAdvancedPhysicsFoundation } from "./advancedPhysicsFoundation.js";

test("advanced physics foundation trace should use the real host and retained fixed step", async () => {
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [{
      id: "compound.body",
      components: {
        CompoundCollider: { children: [
          { id: "left", localPose: { position: [-0.75, 0, 0] }, shape: { kind: "box", size: [1, 1, 1] } },
          { id: "right", localPose: { position: [0.75, 0, 0] }, shape: { kind: "sphere", radius: 0.5 } },
        ] },
        RigidBody: { gravityScale: 0, kind: "dynamic", mass: 2 },
        Transform: { position: [0, 2, 0] },
      },
    }],
  };

  const trace = await traceAdvancedPhysicsFoundation(world);

  assert.deepEqual(trace.commandOrder, ["physics.raycast", "physics.addForceAtPoint", "physics.applyImpulseAtPoint"]);
  assert.deepEqual(trace.events, trace.commandOrder);
  assert.equal(trace.query?.entity, "compound.body");
  assert.equal(trace.query?.child, "left");
  assert.ok(trace.body.velocity[0] > trace.causalNegative.body.velocity[0]);
  assert.ok(trace.body.velocity[2] > trace.causalNegative.body.velocity[2]);
  assert.ok(Math.abs(trace.body.angularVelocity[0]) > Math.abs(trace.causalNegative.body.angularVelocity[0]));
  assert.deepEqual(world.entities[0]?.components.Transform?.position, [0, 2, 0], "the trace must not mutate the fixture source");
});
