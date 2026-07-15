import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  assertOrganicMeshHelperFixtureEnrollment,
  arch,
  buildOrganicMeshHelper,
  bush,
  crate,
  crystal,
  fencePost,
  mushroom,
  organicMeshHelpers,
  organicMeshHelperRegistry,
  pineTree,
  rock,
  stylizedTree,
} from "./meshBuilderOrganic.js";

test("should build every registry helper within its declared budget", () => {
  for (const [helper, descriptor] of Object.entries(organicMeshHelperRegistry)) {
    const geometry = buildOrganicMeshHelper(helper as keyof typeof organicMeshHelperRegistry);

    assert.equal(geometry.generation?.helper, helper);
    assert.equal(geometry.generation?.id, descriptor.id);
    assert.equal(geometry.generation?.seed, descriptor.defaultSeed);
    assert.equal(geometry.budget?.classification, descriptor.budget);
    assert.ok((geometry.budget?.vertexCount ?? Infinity) <= (geometry.budget?.limit ?? -Infinity));
  }
});

test("should produce identical output when helper rebuilt with same seed", () => {
  for (const helper of Object.keys(organicMeshHelperRegistry) as Array<keyof typeof organicMeshHelperRegistry>) {
    const first = buildOrganicMeshHelper(helper, { seed: 42 });
    const second = buildOrganicMeshHelper(helper, { seed: 42 });

    assert.equal(hashGeometry(second), hashGeometry(first), helper);
  }
});

test("should fail when registry helper lacks fixture enrollment", () => {
  assert.throws(
    () => assertOrganicMeshHelperFixtureEnrollment({ orphan: {} }),
    (error: unknown) => error instanceof Error
      && "code" in error
      && error.code === "TN_SDK_MESH_HELPER_FIXTURE_ENROLLMENT_MISSING",
  );
});

test("should attach registry-owned collider hints to visual boolean and CSG helpers", () => {
  assert.equal(buildOrganicMeshHelper("bush").collider?.kind, "box");
  assert.equal(buildOrganicMeshHelper("arch").collider?.kind, "mesh");
});

test("should preserve named helper wrappers", () => {
  const namedHelpers = { arch, bush, crate, crystal, fencePost, mushroom, pineTree, rock, stylizedTree };
  assert.deepEqual(Object.keys(namedHelpers).sort(), Object.keys(organicMeshHelperRegistry).sort());
  for (const helper of Object.keys(organicMeshHelperRegistry) as Array<keyof typeof organicMeshHelperRegistry>) {
    assert.equal(namedHelpers[helper], organicMeshHelpers[helper], helper);
  }

  const tree = stylizedTree({ seed: 12 });
  const pine = pineTree({ seed: 12 });
  const firstMushroom = mushroom({ seed: 1 });
  const secondMushroom = mushroom({ seed: 2 });

  assert.equal(tree.generation?.helper, "stylizedTree");
  assert.equal(pine.generation?.helper, "pineTree");
  assert.notDeepEqual(secondMushroom.attributes, firstMushroom.attributes);
});

function hashGeometry(geometry: ReturnType<typeof buildOrganicMeshHelper>): string {
  return createHash("sha256")
    .update(JSON.stringify({
      attributes: geometry.attributes,
      bounds: geometry.bounds,
      budget: geometry.budget,
      generation: geometry.generation,
      indices: geometry.indices,
      storage: geometry.storage,
      topology: geometry.topology,
      usage: geometry.usage,
    }))
    .digest("hex");
}
