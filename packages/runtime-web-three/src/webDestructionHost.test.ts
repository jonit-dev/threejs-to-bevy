import assert from "node:assert/strict";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";
import { observePhysicsDestruction } from "./physicsDestruction.js";
import { createWebDestructionHost } from "./webDestructionHost.js";

const fixture = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle/", import.meta.url);

test("production web host should hydrate, register, and reconcile authored fracture manifests", async () => {
  const bundle = await loadBundle(fixture.pathname);

  assert.deepEqual(Object.keys(bundle.fractureManifests ?? {}), ["fractures/wall.main.json"]);
  assert.equal(bundle.fractureManifests?.["fractures/wall.main.json"]?.id, "wall.main");
  const host = createWebDestructionHost(bundle);
  assert.deepEqual(observePhysicsDestruction(host.runtime).assemblies, [{ broken: false, id: "wall" }]);

  const wall = bundle.world.entities.find((entity) => entity.id === "wall");
  assert.ok(wall?.components.Destructible !== undefined);
  const component = structuredClone(wall.components.Destructible);
  delete wall.components.Destructible;
  host.reconcile(bundle.world);
  assert.deepEqual(observePhysicsDestruction(host.runtime).assemblies, []);

  wall.components.Destructible = component;
  host.reconcile(bundle.world);
  assert.deepEqual(observePhysicsDestruction(host.runtime).assemblies, [{ broken: false, id: "wall" }]);
});
