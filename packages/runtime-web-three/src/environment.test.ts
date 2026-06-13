import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { createEnvironmentRuntime } from "./environment.js";
import type { IWebBundle } from "./loadBundle.js";

test("environment should apply the instancing plan during forest load", () => {
  const runtime = createEnvironmentRuntime({
    environmentScene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      sourceAssets: [{ asset: "model.env.Rock", category: "rock", id: "env.Rock" }],
      instances: [
        { id: "rock.1", sourceAsset: "env.Rock", position: [0, 0, 0] },
        { id: "rock.2", sourceAsset: "env.Rock", position: [1, 0, 0] },
      ],
      path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
    },
  } as unknown as IWebBundle);

  assert.equal(runtime?.instancingPlan.groups.length, 1);
  assert.equal(runtime?.object.children[0] instanceof THREE.InstancedMesh, true);
});
