import test from "node:test";
import assert from "node:assert/strict";

import { defineTypedGameSpec, type ITypedGameSpec } from "./gameSpecTypes.js";

type SmokeIds = {
  entity: "player";
  input: "move-x" | "move-z";
  material: "player-material";
  resource: "score";
  scene: "arena";
  ui: "score-label";
};

test("should define a typed game spec", () => {
  const spec = defineTypedGameSpec<SmokeIds>({
    input: { actions: [{ bindings: ["keyboard.KeyW"], id: "move-z" }] },
    materials: [{ color: "#44aa88", id: "player-material", roughness: 0.7 }],
    scenes: [{
      entities: [{
        components: {
          CharacterController: { moveXAxis: "move-x", moveZAxis: "move-z", speed: 4 },
          MeshRenderer: { material: "player-material" },
          RigidBody: { kind: "static" },
        },
        id: "player",
        transform: { position: [0, 0.5, 0] },
      }],
      id: "arena",
      resources: [{ id: "score", value: 0 }],
      systems: [{ id: "score-system", resourceReads: ["score"], writes: ["player"] }],
      ui: {
        bindings: [{ node: "score-label", resource: "score" }],
        nodes: [{ id: "score-label", text: "Score", type: "text" }],
      },
    }],
  });

  assert.equal(spec.scenes[0]?.id, "arena");
});

const invalidInputId: ITypedGameSpec<SmokeIds> = {
  scenes: [{
    entities: [{
      components: {
        CharacterController: {
          // @ts-expect-error invalid input action id fails at tsc time
          moveXAxis: "move-y",
        },
      },
      id: "player",
    }],
    id: "arena",
  }],
};

const invalidRigidBodyKind: ITypedGameSpec<SmokeIds> = {
  scenes: [{
    entities: [{
      components: {
        RigidBody: {
          // @ts-expect-error fixed is intentionally not a portable rigid body kind
          kind: "fixed",
        },
      },
      id: "player",
    }],
    id: "arena",
  }],
};

void invalidInputId;
void invalidRigidBodyKind;
