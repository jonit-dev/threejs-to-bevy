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
  const byName = new Map(fixtures.map((fixture) => [fixture.name, fixture]));

  for (const fixture of fixtures) {
    assert.ok(fixture.capabilityTags.length > 0, fixture.name);
    assert.deepEqual(fixture.capabilityTags, [...fixture.capabilityTags].sort(), fixture.name);
  }

  assertFixtureCapabilities(byName, "basic-scene", [
    "rendering:mesh.primitive.box",
    "rendering:material.standard",
    "rendering:light.directional",
    "rendering:camera.perspective",
    "transform:hierarchy",
  ]);
  assertFixtureCapabilities(byName, "v5-drift-surface", [
    "asset:model.gltf",
    "asset:texture.png",
    "environment:atmosphere",
    "environment:camera-bookmarks",
    "rendering:camera.active",
    "rendering:camera.orthographic",
    "rendering:fog.exponential",
    "rendering:light.angle",
    "rendering:light.point",
    "rendering:light.range",
    "rendering:light.spot",
    "rendering:material.texture.base-color",
    "rendering:shadows",
    "rendering:visibility",
    "scripting:script-bundle",
  ]);
  assertFixtureCapabilities(byName, "v6-resources-events", [
    "ecs:event-schemas",
    "ecs:events",
    "ecs:resource-schemas",
    "ecs:resources",
    "scripting:event-reads",
    "scripting:event-writes",
    "scripting:resource-reads",
    "scripting:resource-writes",
    "scripting:schedule.startup",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v6-physics-events", [
    "physics:collider.box",
    "physics:collider.sphere",
    "physics:collision-events",
    "physics:rigid-body.kinematic",
    "physics:rigid-body.static",
    "physics:trigger-collider",
  ]);
  assertFixtureCapabilities(byName, "v6-animation-clips", [
    "animation:clip-metadata",
    "asset:model.glb",
  ]);
});

function assertFixtureCapabilities(
  byName: ReadonlyMap<string, { capabilityTags: string[] }>,
  fixtureName: string,
  expectedTags: string[],
): void {
  const fixture = byName.get(fixtureName);
  assert.ok(fixture, fixtureName);
  for (const tag of expectedTags) {
    assert.ok(fixture.capabilityTags.includes(tag), `${fixtureName} ${tag}`);
  }
}
