import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
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

test("should define V7 conformance fixture categories before runtime claims", async () => {
  const catalog = JSON.parse(await readFile(resolve(process.cwd(), "fixtures/conformance/v7-fixture-catalog.json"), "utf8"));

  assert.equal(catalog.schema, "threenative.conformance.v7-fixture-catalog");
  assert.equal(catalog.version, "0.1.0");
  assert.equal(catalog.categories.length, 8);

  const tickets = new Set<string>();
  for (const category of catalog.categories) {
    assert.match(category.id, /^v7-/);
    assert.match(category.ticket, /^V7-0[2-9]$/);
    assert.equal(typeof category.baselineBundlePath, "string", category.id);
    assert.ok(category.baselineBundlePath.endsWith("/game.bundle") || category.baselineBundlePath.includes("/dist/"), category.id);
    assert.ok(category.acceptedBundlePath.endsWith("/game.bundle"), category.id);
    assert.ok(category.rejectedBundlePath.endsWith("/game.bundle"), category.id);
    assert.ok(category.acceptedFixtureId.startsWith("v7-"), category.id);
    assert.ok(category.rejectedFixtureId.startsWith("v7-rejected-"), category.id);
    assert.ok(category.targetCapabilities.length > 0, category.id);
    assert.deepEqual(category.targetCapabilities, [...category.targetCapabilities].sort(), category.id);
    assert.equal(category.reportArtifacts.length >= 2, true, category.id);
    assert.ok(category.reportArtifacts.every((path: string) => path.startsWith(`artifacts/conformance/${category.acceptedFixtureId}/`)), category.id);
    assert.ok(category.rejectedDiagnosticCodes.length > 0, category.id);
    assert.ok(category.rejectedDiagnosticCodes.every((code: string) => code.startsWith("TN_V7_")), category.id);
    tickets.add(category.ticket);
  }

  assert.deepEqual([...tickets].sort(), ["V7-02", "V7-03", "V7-04", "V7-05", "V7-06", "V7-07", "V7-08", "V7-09"]);
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
    "rendering:mesh.primitive.capsule",
    "rendering:mesh.primitive.cylinder",
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
    "animation:playback-service",
    "asset:model.glb",
    "scripting:schedule.update",
    "scripting:script-bundle",
    "scripting:systems",
  ]);
  assertFixtureCapabilities(byName, "v6-audio-playback", [
    "asset:audio.ogg",
    "asset:audio.wav",
    "audio:autoplay",
    "audio:loop",
    "audio:one-shot",
    "ecs:events",
  ]);
  assertFixtureCapabilities(byName, "v6-retained-ui", [
    "ui:action",
    "ui:binding.resource",
    "ui:focusable",
    "ui:node.bar",
    "ui:node.button",
    "ui:node.column",
    "ui:node.stack",
    "ui:node.text",
    "ui:runtime",
  ]);
  assertFixtureCapabilities(byName, "v7-advanced-physics-character", [
    "physics:collider.box",
    "physics:collider.sphere",
    "physics:contact-filtering",
    "physics:query.overlap",
    "physics:query.shape-cast",
    "physics:rigid-body.static",
    "scripting:schedule.fixedUpdate",
    "scripting:script-bundle",
    "scripting:service.physics.overlap",
    "scripting:service.physics.shapeCast",
    "scripting:systems",
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
