import assert from "node:assert/strict";
import test from "node:test";

import { listConformanceFixtures } from "./conformance.js";
import { validateBundle } from "./validate.js";

test("should validate every conformance fixture", async () => {
  const fixtures = await listConformanceFixtures();

  assert.ok(fixtures.length > 0);

  for (const fixture of fixtures) {
    const result = await validateBundle(fixture.bundlePath);
    assert.deepEqual(result.diagnostics, [], fixture.name);
    assert.equal(result.ok, true, fixture.name);
  }
});

test("should include capability tags for each conformance fixture", async () => {
  const fixtures = await listConformanceFixtures();

  for (const fixture of fixtures) {
    assert.ok(fixture.capabilityTags.length > 0, fixture.name);
    assert.ok(fixture.capabilityTags.includes("rendering:mesh.primitive.box"), fixture.name);
    assert.ok(fixture.capabilityTags.includes("rendering:material.standard"), fixture.name);
    assert.ok(fixture.capabilityTags.includes("rendering:light.directional"), fixture.name);
    assert.ok(fixture.capabilityTags.includes("rendering:camera.perspective"), fixture.name);
    assert.ok(fixture.capabilityTags.includes("transform:hierarchy"), fixture.name);
  }
});
